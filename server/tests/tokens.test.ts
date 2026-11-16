import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  looksLikeRefreshToken,
  newFamilyId,
  newPlayerId,
  newRefreshToken,
  secretKey,
  signAccessToken,
  verifyAccessToken,
} from "../common/tokens";
import { TEST_PREVIOUS_SECRET, TEST_SECRET } from "./helpers";

const key = secretKey(TEST_SECRET);
const previousKey = secretKey(TEST_PREVIOUS_SECRET);
const playerId = "p_AAAAAAAAAAAAAAAAAAAAAA";

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("access tokens", () => {
  it("round-trips a player ID", async () => {
    const token = await signAccessToken(playerId, key);
    expect(await verifyAccessToken(token, [key])).toEqual({ playerId });
  });

  it("carries iat and an exp 15 minutes later, signed with HS256", async () => {
    const token = await signAccessToken(playerId, key);
    const [header, payload] = token.split(".").slice(0, 2).map((part) => JSON.parse(Buffer.from(part!, "base64url").toString()));
    expect(header.alg).toBe("HS256");
    expect(payload.sub).toBe(playerId);
    expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it("rejects a tampered payload", async () => {
    const [header, , signature] = (await signAccessToken(playerId, key)).split(".");
    const forged = `${header}.${b64({ sub: "p_BBBBBBBBBBBBBBBBBBBBBB", iat: 1, exp: 9999999999 })}.${signature}`;
    expect(await verifyAccessToken(forged, [key])).toBe("invalid");
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signAccessToken(playerId, secretKey("some-other-secret-0123456789abcdef"));
    expect(await verifyAccessToken(token, [key])).toBe("invalid");
  });

  it("accepts a token signed with the previous secret only when it is configured", async () => {
    const token = await signAccessToken(playerId, previousKey);
    expect(await verifyAccessToken(token, [key, previousKey])).toEqual({ playerId });
    expect(await verifyAccessToken(token, [key])).toBe("invalid");
  });

  it('answers "expired" after 15 minutes (fake clock, no waiting)', async () => {
    const fresh = await signAccessToken(playerId, key, minutesAgo(14));
    const stale = await signAccessToken(playerId, key, minutesAgo(16));
    expect(await verifyAccessToken(fresh, [key])).toEqual({ playerId });
    expect(await verifyAccessToken(stale, [key])).toBe("expired");
    // Or move "now" forward instead.
    const now = await signAccessToken(playerId, key);
    expect(await verifyAccessToken(now, [key], new Date(Date.now() + 16 * 60_000))).toBe("expired");
  });

  it('treats an expired token with a bad signature as "invalid", not "expired"', async () => {
    const stale = await signAccessToken(playerId, secretKey("some-other-secret-0123456789abcdef"), minutesAgo(16));
    expect(await verifyAccessToken(stale, [key])).toBe("invalid");
  });

  it('rejects alg "none" and other algorithms', async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: playerId, iat: now, exp: now + 900 };
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
    expect(await verifyAccessToken(unsigned, [key])).toBe("invalid");

    const hs512 = await new SignJWT(claims).setProtectedHeader({ alg: "HS512" }).sign(key);
    expect(await verifyAccessToken(hs512, [key])).toBe("invalid");
  });

  it("rejects tokens missing claims or with a non-player subject", async () => {
    const noExp = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(playerId).setIssuedAt().sign(key);
    expect(await verifyAccessToken(noExp, [key])).toBe("invalid");
    const badSub = await signAccessToken("admin", key);
    expect(await verifyAccessToken(badSub, [key])).toBe("invalid");
  });

  it("rejects malformed strings", async () => {
    for (const junk of ["", "abc", "a.b", "a.b.c", "...", "%%%.%%%.%%%", "x".repeat(5000)]) {
      expect(await verifyAccessToken(junk, [key])).toBe("invalid");
    }
  });
});

describe("IDs and refresh tokens", () => {
  it("makes 43-character, unique refresh tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, newRefreshToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(looksLikeRefreshToken(token)).toBe(true);
    expect(looksLikeRefreshToken("short")).toBe(false);
  });

  it("hashes refresh tokens with SHA-256 (hex), deterministically", () => {
    const token = newRefreshToken();
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(hashRefreshToken(newRefreshToken()));
  });

  it("makes player and family IDs with their prefixes", () => {
    expect(newPlayerId()).toMatch(/^p_[A-Za-z0-9_-]{22}$/);
    expect(newFamilyId()).toMatch(/^f_[A-Za-z0-9_-]{22}$/);
    expect(newPlayerId()).not.toBe(newPlayerId());
  });
});
