import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import { DebatePlan, OwnDraft, OwnConsultation } from "@quarrel/shared/contract";
import type { LawyerJob, LawyerResult } from "@quarrel/shared/types";
import type { AiConfig } from "../common/config";
import { RoomRepo, type RoomRepoOptions } from "../rooms/room-repo";
import type { LawyerJobData } from "../rooms/plan-queue";
import { ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";
import { generateLawyerResult } from "./ai/judge-engine";
import { deterministicLawyerResult, lawyerSafetyRedirect, validateLawyerResult } from "./ai/lawyer-policy";

/** Explicitly select only the owner's private records; no private data goes into queue payloads. */
export function lawyerRequest(fields: Record<string, string>, messages: string[], mode: "ai" | "demo"): LawyerJob {
  const slot = fields.workOwner as "A" | "B", seat = slot.toLowerCase();
  const drafts = OwnDraft.array().parse(JSON.parse(fields[`${seat}.drafts`] ?? "[]").map((d: { at: number }) => ({ ...d, at: new Date(d.at).toISOString() })));
  const consultations = OwnConsultation.array().parse(JSON.parse(fields[`${seat}.consultations`] ?? "[]").map((c: { at: number }) => ({ ...c, at: new Date(c.at).toISOString() })));
  return {
    id: fields.workId!, kind: fields.workKind === "argument" ? "lawyer" : "consult", mode, slot,
    playerText: fields.workText!, lawyerId: fields.workLawyerId,
    context: {
      themeId: fields.theme!, topic: fields.topic!, totalSeconds: Number(fields.durationSec),
      currentSubtopic: Number(fields.workOrdinal), subtopics: DebatePlan.parse(JSON.parse(fields.plan!)).subtopics,
      players: (["a", "b"] as const).map((s) => ({ slot: s === "a" ? "A" : "B", name: fields[`${s}.name`]!, position: fields[`${s}.position`]! })),
      messages: messages.map((raw) => {
        const m = JSON.parse(raw);
        return { id: m.id, label: m.id, kind: m.kind, subtopic: m.ordinal, slot: m.slot, text: m.text,
          source: m.source ?? "demo", status: "complete" as const, createdAt: new Date(m.at).toISOString(), completedAt: new Date(m.at).toISOString() };
      }),
      officialDrafts: drafts.map((d) => ({ subtopic: d.ordinal, rawText: d.text })),
      ...(fields.workKind === "consult" ? { consultations: consultations.filter((c) => c.answer !== null).slice(-4).map((c) => ({
        id: c.id, subtopic: c.ordinal, playerText: c.question, text: c.answer, source: c.source!, status: "complete" as const, createdAt: c.at,
      })) } : {}),
    },
  };
}

function fallback(request: LawyerJob): LawyerResult {
  return request.kind === "consult" && !lawyerSafetyRedirect(request)
    ? { kind: "consult", source: "fallback", text: "Your lawyer couldn't answer this time." }
    : deterministicLawyerResult(request, "fallback");
}

/** The timeout bounds even a fake/provider that fails to settle; its late result is ignored. */
async function attempt(generate: typeof generateLawyerResult, request: LawyerJob, config: AiConfig, timeoutMs: number): Promise<LawyerResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      generate(request, { ...config, GEMINI_FALLBACK_MODEL: undefined, JUDGE_AI_TIMEOUT_MS: timeoutMs }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LAWYER_TIMEOUT")), timeoutMs) }),
    ]);
  } finally { clearTimeout(timer); }
}

export function createLawyerProcessor(redis: Redis, config: AiConfig & { LAWYER_AI_TIMEOUT_MS?: number }, generate = generateLawyerResult, options: RoomRepoOptions & { ensureJudge?: import("../rooms/plan-queue").EnsureJudge } = {}) {
  const repo = new RoomRepo(redis, options);
  return async (job: Job<LawyerJobData>): Promise<void> => {
    if (job.name !== "lawyer") throw new Error("UNKNOWN_JOB");
    const { roomId, workId } = job.data;
    const caught = await repo.catchup(roomId);
    if (caught.judge) await options.ensureJudge?.(roomId, caught.judge);
    if (caught.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
    const input = await repo.lawyerInput(roomId, workId);
    if (!input) return;
    const ai = config.JUDGE_AI_MODE === "auto" && Boolean(config.GEMINI_API_KEY);
    const request = lawyerRequest(input.fields, input.messages, ai ? "ai" : "demo");
    const demo = deterministicLawyerResult(request);
    let result = fallback(request);
    if (!lawyerSafetyRedirect(request) && demo.source !== "fallback") {
      if (!ai) result = demo;
      else for (let index = 0; index < 2; index++) {
        try {
          const output = await attempt(generate, request, config, config.LAWYER_AI_TIMEOUT_MS ?? 5000);
          const valid = output.source === "ai" && output.kind === request.kind ? validateLawyerResult({ text: output.text }, request) : null;
          if (valid) { result = valid; break; }
        } catch { /* Stable fallback only: provider details never enter state or logs. */ }
      }
    }
    const saved = await repo.finishLawyer(roomId, workId, result.text, result.source);
    if (saved.judge) await options.ensureJudge?.(roomId, saved.judge);
    if (saved.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
  };
}
