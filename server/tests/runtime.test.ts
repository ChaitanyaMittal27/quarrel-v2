import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueueRedis, isRedisUnavailable, redisIsUp } from "../common/redis";
import { loadConfigOrExit } from "../common/config";
import { REDIS_URL } from "./helpers";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("runtime outage and startup boundaries", () => {
  it("classifies connection failures separately from Redis command bugs", () => {
    for (const value of [null, "ECONNRESET", new Error("WRONGTYPE"), new Error("ordinary")]) expect(isRedisUnavailable(value)).toBe(false);
    expect(isRedisUnavailable(Object.assign(new Error(), { name: "MaxRetriesPerRequestError" }))).toBe(true);
    expect(isRedisUnavailable(new Error("Connection is closed."))).toBe(true);
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENOTFOUND"]) {
      expect(isRedisUnavailable(Object.assign(new Error(), { code }))).toBe(true);
    }
    expect(isRedisUnavailable(Object.assign(new Error(), { code: "ERR" }))).toBe(false);
  });

  it("queue connections wait through outages and log only once until recovered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const redis = createQueueRedis(REDIS_URL);
    try {
      expect(redis.options.maxRetriesPerRequest).toBeNull();
      expect(await redisIsUp(redis)).toBe(true);
      redis.emit("error", new Error("test outage"));
      redis.emit("error", new Error("same outage"));
      expect(warn).toHaveBeenCalledTimes(1);
      redis.emit("ready");
      expect(info).toHaveBeenCalledTimes(1);
      redis.emit("error", new Error("new outage"));
      expect(warn).toHaveBeenCalledTimes(2);
    } finally { redis.disconnect(); }
  });

  it("health waits for a first connection, removes listeners after failure, and fails fast when closed", async () => {
    const emitter = Object.assign(new EventEmitter(), { status: "wait", ping: vi.fn().mockResolvedValue("PONG") });
    const redis = emitter as unknown as Redis;
    const probe = redisIsUp(redis);
    emitter.emit("close");
    expect(await probe).toBe(false);
    expect(emitter.listenerCount("ready")).toBe(0);
    emitter.status = "end";
    expect(await redisIsUp(redis)).toBe(false);
    expect(emitter.ping).not.toHaveBeenCalled();
  });

  it("startup rejects invalid config without exposing its value", () => {
    vi.stubEnv("SESSION_SECRET", "test-invalid");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit intercepted"); });
    expect(() => loadConfigOrExit()).toThrow("exit intercepted");
    expect(log.mock.calls.flat().join(" ")).toContain("SESSION_SECRET");
    expect(log.mock.calls.flat().join(" ")).not.toContain("test-invalid");
  });
});
