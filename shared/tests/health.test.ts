import { describe, expect, it } from "vitest";
import { HealthResponse } from "../contract";

describe("HealthResponse", () => {
  it("accepts a valid response", () => {
    const value = { ok: true, redis: "up", supabase: "up" };
    expect(HealthResponse.parse(value)).toEqual(value);
  });

  it("rejects a missing field", () => {
    const result = HealthResponse.safeParse({ ok: true, redis: "up" });
    expect(result.success).toBe(false);
  });

  it("rejects a wrong value", () => {
    const result = HealthResponse.safeParse({ ok: true, redis: "maybe", supabase: "up" });
    expect(result.success).toBe(false);
  });
});
