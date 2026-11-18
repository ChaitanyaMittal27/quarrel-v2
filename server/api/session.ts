import cookie, { type CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { RoomResponse } from "@quarrel/shared/contract";
import {
  newFamilyId,
  newPlayerId,
  REFRESH_TOKEN_TTL_SECONDS,
  secretKey,
  signAccessToken,
  verifyAccessToken,
} from "../common/tokens";
import { AppError, sendParsed } from "./errors";
import type { RefreshStore } from "./refresh-store";
import type { RoomService } from "../rooms/room-service";

/**
 * Sessions.
 * - quarrel_access: a 15-minute JWT naming the player. Checked by signature only (no Redis),
 *   on every request, by the onRequest hook below.
 * - quarrel_refresh: a random token, swapped for a new pair at POST /api/session/refresh.
 *   Only sent to /api/session/* so it travels as little as possible.
 */

export const ACCESS_COOKIE = "quarrel_access";
export const REFRESH_COOKIE = "quarrel_refresh";
export const REFRESH_COOKIE_PATH = "/api/session";

export interface Session {
  playerId: string;
}

export interface SessionOptions {
  secret: string;
  previousSecret?: string;
  cookieSecure: boolean;
  /** Tests can shorten JWT validity without changing cookie retention or production config. */
  accessTtlSeconds?: number;
  refreshStore: RefreshStore;
  rooms: RoomService;
}

// Tell TypeScript about the properties this plugin adds to Fastify's objects.
declare module "fastify" {
  interface FastifyRequest {
    /** The verified session, or null (no cookie, invalid or expired token). */
    session: Session | null;
    /** True when the access token is genuine but out of date: the client should refresh. */
    sessionExpired: boolean;
  }
  interface FastifyInstance {
    sessions: SessionManager;
    rooms: RoomService;
  }
}

/** Issues and clears session cookies. One per app, reachable as `app.sessions`. */
export class SessionManager {
  private readonly signingKey: Uint8Array;
  readonly verifyKeys: readonly Uint8Array[];

  constructor(private readonly options: SessionOptions) {
    this.signingKey = secretKey(options.secret);
    this.verifyKeys = options.previousSecret
      ? [this.signingKey, secretKey(options.previousSecret)]
      : [this.signingKey];
  }

  get refreshStore(): RefreshStore {
    return this.options.refreshStore;
  }

  signAccessToken(playerId: string): Promise<string> {
    return signAccessToken(playerId, this.signingKey, new Date(), this.options.accessTtlSeconds);
  }

  /**
   * Both cookies live 30 days. The access JWT inside expires after 15 minutes, but the cookie
   * outlives it so the server can still see an expired token and answer SESSION_EXPIRED
   * (if the browser dropped the cookie, the player would look brand new).
   */
  private cookieOptions(path: string): CookieSerializeOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      path,
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
      secure: this.options.cookieSecure,
    };
  }

  setSessionCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
    this.setAccessCookie(reply, accessToken);
    reply.setCookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_COOKIE_PATH));
  }

  setAccessCookie(reply: FastifyReply, accessToken: string): void {
    reply.setCookie(ACCESS_COOKIE, accessToken, this.cookieOptions("/"));
  }

  clearAccessCookie(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_COOKIE, this.cookieOptions("/"));
  }

  clearSessionCookies(reply: FastifyReply): void {
    this.clearAccessCookie(reply);
    reply.clearCookie(REFRESH_COOKIE, this.cookieOptions(REFRESH_COOKIE_PATH));
  }

  /** Starts a new identity: new player, new token family, both cookies set. */
  async startSession(reply: FastifyReply): Promise<Session> {
    const playerId = newPlayerId();
    const refreshToken = await this.refreshStore.create(playerId, newFamilyId());
    const accessToken = await this.signAccessToken(playerId);
    this.setSessionCookies(reply, accessToken, refreshToken);
    return { playerId };
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers for routes
// ---------------------------------------------------------------------------------------------

/** The caller's player ID, or an error: SESSION_EXPIRED (refresh and retry) or UNAUTHENTICATED. */
export function requireSession(request: FastifyRequest): string {
  if (request.session) return request.session.playerId;
  if (request.sessionExpired) throw new AppError("SESSION_EXPIRED");
  throw new AppError("UNAUTHENTICATED");
}

/**
 * The caller's player ID, creating a new session if there is none (create/join). An expired
 * session is NOT replaced: the client must refresh first so it keeps its identity and seat.
 */
export async function ensureSession(request: FastifyRequest, reply: FastifyReply): Promise<string> {
  if (request.session) return request.session.playerId;
  if (request.sessionExpired) throw new AppError("SESSION_EXPIRED");
  request.session = await request.server.sessions.startSession(reply);
  return request.session.playerId;
}

// ---------------------------------------------------------------------------------------------
// Plugin: cookie parsing, the per-request check, and the /api/session routes
// ---------------------------------------------------------------------------------------------

const plugin: FastifyPluginAsync<SessionOptions> = async (app: FastifyInstance, options) => {
  await app.register(cookie);
  const sessions = new SessionManager(options);
  app.decorate("sessions", sessions);
  app.decorateRequest("session", null);
  app.decorateRequest("sessionExpired", false);

  // Runs before every route: work out who is calling from the access cookie alone.
  app.addHook("onRequest", async (request, reply) => {
    request.session = null;
    request.sessionExpired = false;
    const token = request.cookies[ACCESS_COOKIE];
    if (!token) return;
    const result = await verifyAccessToken(token, sessions.verifyKeys);
    if (result === "expired") {
      request.sessionExpired = true;
    } else if (result === "invalid") {
      sessions.clearAccessCookie(reply); // forged or broken: drop it
    } else {
      request.session = result;
    }
  });

  // Rule 1.3: reads retain the expired seat until create/join releases it.
  app.get("/api/session", async (request, reply) => {
    if (request.sessionExpired) throw new AppError("SESSION_EXPIRED");
    return sendParsed(reply, RoomResponse, request.session
      ? await options.rooms.current(request.session.playerId)
      : { room: null });
  });

  // Swap the refresh token for a new pair. Reusing an old token revokes its whole family,
  // unless it happens within the grace window (two tabs refreshing at once).
  app.post("/api/session/refresh", async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    const result = token ? await sessions.refreshStore.rotate(token) : { status: "unknown" as const };
    if (result.status === "raced") {
      // Another request already rotated this token and set the new refresh cookie (cookies
      // are shared between tabs). Don't touch it: only hand this caller a fresh access token.
      request.log.info("refresh raced with a concurrent refresh: access token reissued");
      sessions.setAccessCookie(reply, await sessions.signAccessToken(result.playerId));
      return reply.code(204).send();
    }
    if (result.status !== "rotated") {
      if (result.status === "reused") {
        request.log.warn("refresh token reused: token family revoked");
      }
      sessions.clearSessionCookies(reply);
      throw new AppError("UNAUTHENTICATED");
    }
    const accessToken = await sessions.signAccessToken(result.playerId);
    sessions.setSessionCookies(reply, accessToken, result.token);
    return reply.code(204).send();
  });

  // Sign out: forget the refresh token and its family, clear cookies. Always 204.
  app.post("/api/session/logout", async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (token) {
      const record = await sessions.refreshStore.delete(token);
      if (record) await sessions.refreshStore.revokeFamily(record.familyId);
    }
    sessions.clearSessionCookies(reply);
    return reply.code(204).send();
  });
};

// Normally each plugin gets its own private scope, so its hooks and decorations would only
// apply to routes registered inside it. Marking it "skip-override" (what the fastify-plugin
// package does) makes them apply to the whole app, so 1C's room routes see `request.session`.
export const sessionPlugin = Object.assign(plugin, {
  [Symbol.for("skip-override")]: true,
  [Symbol.for("fastify.display-name")]: "session",
});
