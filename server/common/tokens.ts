import { createHash, randomBytes } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";

/**
 * Session tokens. Everything here is a plain function of its inputs (plus randomness), with
 * no Redis or HTTP, so both the API and the Socket.IO handshake (1D) can use it.
 */

/** The access JWT is valid for 15 minutes. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Refresh tokens (and cookies) last 30 days, renewed on every refresh. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/**
 * A used refresh token presented again within this window is treated as a race between two
 * tabs refreshing at once, not as theft: no revocation (see refresh-store.ts).
 */
export const REFRESH_GRACE_MS = 10_000;

const PLAYER_ID_PATTERN = /^p_[A-Za-z0-9_-]{22}$/;
/** 32 random bytes in base64url is always 43 characters. */
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A secret as the key bytes jose expects. */
export function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Signs a 15-minute access token for a player: HS256, sub = playerId, iat, exp. */
export async function signAccessToken(
  playerId: string,
  key: Uint8Array,
  now: Date = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(playerId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key);
}

export type AccessTokenResult = { playerId: string } | "expired" | "invalid";

/**
 * Checks an access token against each key in turn (current secret first, then the previous
 * one). "expired" means the signature is genuine but the time is up: the player is known and
 * can refresh. "invalid" means anything else (forged, malformed, wrong algorithm).
 */
export async function verifyAccessToken(
  token: string,
  keys: readonly Uint8Array[],
  now: Date = new Date(),
): Promise<AccessTokenResult> {
  for (const key of keys) {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"], // anything else, including "none", is refused
        requiredClaims: ["sub", "iat", "exp"],
        currentDate: now,
      });
      return typeof payload.sub === "string" && PLAYER_ID_PATTERN.test(payload.sub)
        ? { playerId: payload.sub }
        : "invalid";
    } catch (error) {
      // jose checks the signature before the claims, so "expired" implies a genuine token.
      if (error instanceof errors.JWTExpired) return "expired";
      // Wrong key, bad signature or malformed: try the next key.
    }
  }
  return "invalid";
}

/** A new refresh token: 32 random bytes, base64url. Not a JWT: it means nothing by itself. */
export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** True if a string could be a refresh token, so junk never reaches Redis. */
export function looksLikeRefreshToken(value: string): boolean {
  return REFRESH_TOKEN_PATTERN.test(value);
}

/** SHA-256 of a refresh token (hex). Only this is stored, never the token itself. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Internal player ID: "p_" + 16 random bytes, base64url. Never sent to clients. */
export function newPlayerId(): string {
  return `p_${randomBytes(16).toString("base64url")}`;
}

/** Refresh-token family ID: "f_" + 16 random bytes, base64url. */
export function newFamilyId(): string {
  return `f_${randomBytes(16).toString("base64url")}`;
}
