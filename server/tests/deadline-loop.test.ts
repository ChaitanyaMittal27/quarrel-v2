import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeadlineTick, startDeadlineLoop } from "../worker/clock-worker";
import { RoomRepo } from "../rooms/room-repo";
import type { Redis } from "ioredis";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Redis deadline polling loop", () => {
  it("never overlaps runs and shutdown waits for the in-flight tick without scheduling another", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tick = vi.fn(() => gate), logger = { error: vi.fn() };
    const stop = startDeadlineLoop(tick, logger, 10);
    await vi.advanceTimersByTimeAsync(1000); expect(tick).toHaveBeenCalledTimes(1);
    let stopped = false; const stopping = stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    release(); await stopping; expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(1000); expect(tick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("logs a failed run, retries at the default interval, and cancels a pending timer on stop", async () => {
    vi.useFakeTimers();
    const tick = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("Redis unavailable")).mockResolvedValue(undefined);
    const logger = { error: vi.fn() }, stop = startDeadlineLoop(tick, logger);
    await vi.advanceTimersByTimeAsync(0); expect(logger.error).toHaveBeenCalledWith("deadline poll failed");
    await vi.advanceTimersByTimeAsync(249); expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(tick).toHaveBeenCalledTimes(2);
    await stop(); await vi.advanceTimersByTimeAsync(1000); expect(tick).toHaveBeenCalledTimes(2);
  });
  it("an empty due batch needs no catch-up or publish", async () => {
    vi.spyOn(RoomRepo.prototype, "due").mockResolvedValue([]);
    const catchup = vi.spyOn(RoomRepo.prototype, "catchup");
    const redis = { publish: vi.fn() } as unknown as Redis;
    await createDeadlineTick(redis, { error: vi.fn() })();
    expect(catchup).not.toHaveBeenCalled(); expect(redis.publish).not.toHaveBeenCalled();
  });
});
