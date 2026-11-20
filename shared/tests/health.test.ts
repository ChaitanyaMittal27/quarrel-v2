import { describe, expect, it } from "vitest";
import { HealthResponse } from "../contract";

describe("HealthResponse", () => {
  it("accepts a valid response", () => {
    const value = { ok: true, redis: "up", postgres: "up" };
    expect(HealthResponse.parse(value)).toEqual(value);
  });

  it("rejects unknown response fields", () => {
    expect(HealthResponse.safeParse({ ok: true, redis: "up", postgres: "up", extra: true }).success).toBe(false);
  });

  it("rejects a missing field", () => {
    const result = HealthResponse.safeParse({ ok: true, redis: "up" });
    expect(result.success).toBe(false);
  });

  it("rejects a wrong value", () => {
    const result = HealthResponse.safeParse({ ok: true, redis: "maybe", postgres: "up" });
    expect(result.success).toBe(false);
  });
});
