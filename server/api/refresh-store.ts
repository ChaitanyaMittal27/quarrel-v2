import type { Redis } from "ioredis";
import { z } from "zod";
import { loadLua } from "../common/lua";
import {
  hashRefreshToken,
  looksLikeRefreshToken,
  newRefreshToken,
  REFRESH_GRACE_MS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../common/tokens";

/**
 * All Redis access for refresh tokens. Only SHA-256 hashes of tokens are stored, so a copy of
 * the database can't be used to sign in.
 *
 *   refresh:<hash>             -> JSON { playerId, familyId, used, usedAt? }   (TTL 30 days)
 *   refresh-family:<familyId>  -> "revoked"                                    (TTL 30 days)
 *
 * A used token is kept (marked used, with usedAt in Redis server time, ms) until its TTL, so
 * presenting it again is recognised. What happens then, in order:
 *   1. family revoked                       -> "revoked" (always wins)
 *   2. used, within REFRESH_GRACE_MS (10 s)  -> "raced": two tabs refreshed at once. The other
 *      request already set the new refresh cookie, so this one only gets an access token.
 *      Nothing is revoked.
 *   3. used, later than that                -> "reused": treated as theft, family revoked.
 */

const TokenRecord = z.object({
  playerId: z.string(),
  familyId: z.string(),
  used: z.boolean(),
  usedAt: z.number().optional(),
});
type TokenRecord = z.infer<typeof TokenRecord>;

const tokenKey = (hash: string) => `refresh:${hash}`;
const familyKey = (familyId: string) => `refresh-family:${familyId}`;

export type RotateResult =
  | { status: "rotated"; playerId: string; familyId: string; token: string }
  /** No such token (never issued, expired, deleted, or junk). */
  | { status: "unknown" }
  /** Used moments ago by a concurrent refresh: the caller may get a new access token only. */
  | { status: "raced"; playerId: string; familyId: string }
  /** The token was already used, outside the grace window: its family is now revoked. */
  | { status: "reused" }
  /** The token's family was revoked earlier (reuse or logout). */
  | { status: "revoked" };

/**
 * Check-and-mark, run inside Redis as one step: no other command can run between the check
 * and the writes, so two refreshes with the same token can't both succeed.
 *
 * KEYS[1] old token key, KEYS[2] family key, KEYS[3] new token key
 * ARGV[1] expected family ID, ARGV[2] new token record (JSON), ARGV[3] TTL in seconds,
 * ARGV[4] grace window in ms
 * The clock is Redis's own (TIME), so every API instance uses the same one.
 */
const rotateRefresh = loadLua(new URL("./lua/rotate-refresh.lua", import.meta.url));

export class RefreshStore {
  private readonly ttlSeconds: number;
  private readonly graceMs: number;

  constructor(
    private readonly redis: Redis,
    options: { ttlSeconds?: number; graceMs?: number } = {},
  ) {
    this.ttlSeconds = options.ttlSeconds ?? REFRESH_TOKEN_TTL_SECONDS;
    this.graceMs = options.graceMs ?? REFRESH_GRACE_MS;
  }

  /** Issues a new refresh token for a player in a family. Returns the raw token (for the cookie). */
  async create(playerId: string, familyId: string): Promise<string> {
    const token = newRefreshToken();
    const record: TokenRecord = { playerId, familyId, used: false };
    await this.redis.set(
      tokenKey(hashRefreshToken(token)),
      JSON.stringify(record),
      "EX",
      this.ttlSeconds,
    );
    return token;
  }

  /** Swaps a valid, unused token for a new one in the same family. See RotateResult. */
  async rotate(token: string): Promise<RotateResult> {
    const record = await this.read(token);
    if (!record) return { status: "unknown" };

    // The family ID never changes, so it's safe to read it first and pass its key to the
    // script; the script re-reads the record and checks everything that can change.
    const next = newRefreshToken();
    const nextRecord: TokenRecord = { playerId: record.playerId, familyId: record.familyId, used: false };
    const outcome = await rotateRefresh(this.redis,
      [tokenKey(hashRefreshToken(token)), familyKey(record.familyId), tokenKey(hashRefreshToken(next))],
      [record.familyId, JSON.stringify(nextRecord), String(this.ttlSeconds), String(this.graceMs)],
    );
    switch (outcome) {
      case "rotated":
        return { status: "rotated", playerId: record.playerId, familyId: record.familyId, token: next };
      case "raced":
        return { status: "raced", playerId: record.playerId, familyId: record.familyId };
      case "reused":
        return { status: "reused" };
      case "revoked":
        return { status: "revoked" };
      default:
        return { status: "unknown" };
    }
  }

  /** Marks a family revoked: none of its tokens can be used again. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.redis.set(familyKey(familyId), "revoked", "EX", this.ttlSeconds);
  }

  /** Deletes a token and returns what it pointed to (null if there was nothing). */
  async delete(token: string): Promise<{ playerId: string; familyId: string } | null> {
    if (!looksLikeRefreshToken(token)) return null;
    const raw = await this.redis.getdel(tokenKey(hashRefreshToken(token)));
    const record = parseRecord(raw);
    return record && { playerId: record.playerId, familyId: record.familyId };
  }

  private async read(token: string): Promise<TokenRecord | null> {
    if (!looksLikeRefreshToken(token)) return null;
    return parseRecord(await this.redis.get(tokenKey(hashRefreshToken(token))));
  }
}

function parseRecord(raw: string | null): TokenRecord | null {
  if (raw === null) return null;
  const result = TokenRecord.safeParse(JSON.parse(raw));
  return result.success ? result.data : null;
}
