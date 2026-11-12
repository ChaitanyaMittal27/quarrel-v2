import { z } from "zod";

/** GET /api/health response. */
export const HealthResponse = z.object({
  ok: z.boolean(),
  redis: z.enum(["up", "down"]),
  supabase: z.enum(["up", "down"]),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
