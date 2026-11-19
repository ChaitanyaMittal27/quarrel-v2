import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Redis } from "ioredis";

/** Read at module startup; Redis can discard its script cache at any time. */
export function loadLua(url: URL, prelude?: URL) {
  const source = (prelude ? readFileSync(prelude, "utf8") + "\n" : "") + readFileSync(url, "utf8");
  const sha = createHash("sha1").update(source).digest("hex");
  return async (redis: Redis, keys: string[], args: string[]): Promise<string> => {
    try {
      return await redis.evalsha(sha, keys.length, ...keys, ...args) as string;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("NOSCRIPT")) throw error;
      return await redis.eval(source, keys.length, ...keys, ...args) as string;
    }
  };
}
