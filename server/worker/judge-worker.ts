import { randomBytes } from "node:crypto";
import { UnrecoverableError, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { DebatePlan, JuryVerdict, PublicSummary, JuryFailureCode } from "@quarrel/shared/contract";
import type { LawyerJob, LawyerResult, LawyerPublicMessage } from "@quarrel/shared/types";
import type { AiConfig } from "../common/config";
import { RoomRepo, type RoomRepoOptions, type RoomResult } from "../rooms/room-repo";
import { ROOM_EVENTS_CHANNEL } from "../rooms/room-pubsub";
import type { JudgeJobData, EnsureJudge, EnsureArchive } from "../rooms/plan-queue";
import { generateLawyerResult } from "./ai/judge-engine";
import { lawyerSafetyRedirect, validateLawyerResult } from "./ai/lawyer-policy";
import { JuryUnavailableError } from "./ai/lawyer-errors";
import { QuotaStore } from '../ai/quota-store';

export function publicMessages(messages: string[]): LawyerPublicMessage[] {
  return messages.map((raw) => {
    const m = JSON.parse(raw);
    return { id: m.id, label: m.label ?? (m.kind === "argument" ? `S${m.ordinal}-${m.slot === "A" ? "P1L1" : "P2L2"}M${m.id.replace("m_", "")}` : `S${m.ordinal}-J`),
      kind: m.kind, subtopic: m.ordinal, slot: m.slot, text: m.text, source: m.source ?? "fallback",
      status: "complete", createdAt: new Date(m.at).toISOString(), completedAt: new Date(m.at).toISOString() };
  });
}

export function judgeRequest(fields: Record<string, string>, messages: string[], kind: "summary" | "jury", mode: "ai" | "demo"): LawyerJob {
  const ordinal = Number(fields.ordinal);
  return { id: "judge", kind, mode, slot: null, playerText: null, context: {
    themeId: fields.theme!, topic: fields.topic!, totalSeconds: Number(fields.durationSec), currentSubtopic: ordinal,
    players: (["a", "b"] as const).map((s) => ({ slot: s === "a" ? "A" : "B", name: fields[`${s}.name`]!, position: fields[`${s}.position`]! })),
    subtopics: DebatePlan.parse(JSON.parse(fields.plan!)).subtopics,
    messages: publicMessages(messages).filter((m) => kind === "jury" || (m.subtopic === ordinal && m.kind === "argument")),
  } };
}

/** Same bounded literal excerpts as Redis's deadline fallback; never include private records. */
export function fallbackSummary(request: LawyerJob): string {
  return (["A", "B"] as const).map((slot) => {
    const name = (request.context.players.find((p) => p.slot === slot)?.name ?? slot).replace(/\s+/gu, " ").trim();
    const last = request.context.messages.filter((m) => m.kind === "argument" && m.slot === slot && m.subtopic === request.context.currentSubtopic).at(-1)?.text;
    if (!last) return `${name} made no public submission; claims remain unverified.`;
    const normalized = last.replace(/\s+/gu, " ").trim();
    // Names can contain many words: reserve their space in the existing 70-word budget.
    const words = Math.max(1, 23 - name.split(" ").length);
    let excerpt = [...normalized.split(" ").slice(0, words).join(" ")].slice(0, 230).join("");
    excerpt = excerpt.split(/[.!?]\s/u)[0]!.replace(/[.!?]+$/u, "");
    return `${name}'s unverified last public point: "${excerpt}${excerpt !== normalized ? "..." : ""}".`;
  }).join(" ");
}

export function savedSummaries(fields: Record<string, string>): PublicSummary[] {
  return PublicSummary.array().parse(JSON.parse(fields.summaries ?? "[]").map((s: { at: number }) => ({ ...s, at: new Date(s.at).toISOString() })));
}

export function localVerdict(request: LawyerJob, summaries: PublicSummary[], source: "demo" | "safety"): JuryVerdict {
  const text = source === "demo" ? `This demo hearing between ${request.context.players[0]!.name} and ${request.context.players[1]!.name} has no competitive judgment.`
    : "A competitive judgment is not appropriate for this dispute. Consider trusted support and a safer discussion.";
  return JuryVerdict.parse({ source, text, decision: "inconclusive", outcome: "split", topic: request.context.topic,
    positionA: request.context.players[0]!.position, positionB: request.context.players[1]!.position,
    reasoning: source === "demo" ? "The demo does not assess either side's arguments or choose a winner." : text,
    strongestArguments: { A: "Not assessed.", B: "Not assessed." }, weaknesses: { A: [], B: [] },
    perSubtopic: summaries.map((s) => ({ ordinal: s.ordinal, text: source === "demo" ? s.text : "No competitive finding is made for safety reasons." })),
    compromise: null, subtopicSummaries: summaries });
}

async function bounded(generate: typeof generateLawyerResult, request: LawyerJob, config: AiConfig, timeoutMs: number, quota: QuotaStore): Promise<LawyerResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([generate(request, { ...config, JUDGE_AI_TIMEOUT_MS: timeoutMs }, false, quota),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new JuryUnavailableError("timeout", true)), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

export interface JudgeOptions extends RoomRepoOptions { ensureJudge?: EnsureJudge; ensureArchive?: EnsureArchive }
export function createJudgeProcessor(redis: Redis, config: AiConfig & { SUMMARY_AI_TIMEOUT_MS?: number }, generate = generateLawyerResult, options: JudgeOptions = {}) {
  const repo = new RoomRepo(redis, options);
  const quota = new QuotaStore(redis, config);
  async function publish(roomId: string, result: RoomResult) {
    if (result.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
    if (result.archiveId) await options.ensureArchive?.(roomId, result.archiveId);
    if (result.judge) await options.ensureJudge?.(roomId, result.judge);
  }
  return async (job: Job<JudgeJobData>): Promise<void> => {
    const { roomId, kind, index, workId, debateId } = job.data;
    await publish(roomId, await repo.catchup(roomId));
    const claim = randomBytes(16).toString("base64url");
    const input = await repo.judgeInput(roomId, { kind, index, workId, debateId }, claim);
    if (input.changed) await redis.publish(ROOM_EVENTS_CHANNEL, roomId);
    if (!input.fields) return;
    const request = judgeRequest(input.fields, input.messages, kind, config.JUDGE_AI_MODE === "demo" ? "demo" : "ai");
    const unsafe = lawyerSafetyRedirect(request);
    if (kind === "summary") {
      let text = fallbackSummary(request), source: "ai" | "demo" | "fallback" = config.JUDGE_AI_MODE === "demo" && !unsafe ? "demo" : "fallback";
      if (!unsafe && config.JUDGE_AI_MODE === "auto" && config.GEMINI_API_KEY) {
        for (let attempt = 0; attempt < 2; attempt++) {
          if ((await quota.status()).text === 'exhausted') break;
          try {
            const output = await bounded(generate, request, config, config.SUMMARY_AI_TIMEOUT_MS ?? 5000, quota);
            const valid = output.kind === "summary" && output.source === "ai" && validateLawyerResult({ text: output.text }, request);
            if (valid) { text = valid.text; source = "ai"; break; }
          } catch { /* Fixed labelled fallback, never provider text. */ }
        }
      }
      await publish(roomId, await repo.finishSummary(roomId, workId!, claim, text, source));
      return;
    }
    try {
      if ((await quota.status()).text === 'exhausted') throw new JuryUnavailableError('quota_exhausted', false);
      const summaries = savedSummaries(input.fields);
      if (summaries.length !== request.context.subtopics.length) throw new JuryUnavailableError("invalid_response", true);
      let verdict: JuryVerdict;
      if (unsafe || config.JUDGE_AI_MODE === "demo") verdict = localVerdict(request, summaries, unsafe ? "safety" : "demo");
      else {
        if (!config.GEMINI_API_KEY) throw new JuryUnavailableError("missing_configuration", false);
        const output = await bounded(generate, request, config, config.JUDGE_AI_TIMEOUT_MS, quota);
        // The model's response never supplies canonical summaries, topic or positions.
        const v = output.verdict;
        const candidate = v ? Object.fromEntries(Object.entries(v).filter(([key]) => !["outcome", "topic", "positionA", "positionB"].includes(key))) : null;
        const valid = output.kind === "jury" && output.source === "ai" && validateLawyerResult({ text: output.text, verdict: candidate }, request);
        if (!valid || !valid.verdict) throw new JuryUnavailableError("invalid_response", true);
        verdict = JuryVerdict.parse({ ...valid.verdict, source: "ai", text: valid.text, subtopicSummaries: summaries });
      }
      const saved = await repo.finishJury(roomId, index, claim, verdict);
      if (saved.status !== "OK") throw new JuryUnavailableError("invalid_response", true);
      await publish(roomId, saved);
    } catch (error) {
      const reason = error instanceof JuryUnavailableError ? JuryFailureCode.parse(error.reasonCode) : "provider_unavailable";
      const permanent = reason === "quota_exhausted" || reason === "missing_configuration";
      const terminal = permanent || Number(input.fields.juryAttempts) >= 3;
      const reset = reason === 'quota_exhausted' ? (await quota.status()).resetsAt : null;
      await publish(roomId, await repo.finishJury(roomId, index, claim, null, reason, terminal, reset ? Date.parse(reset) : undefined));
      // Only a fixed reason reaches BullMQ's stored error/stack and its worker logs.
      if (permanent) throw new UnrecoverableError(reason);
      throw new Error(reason);
    }
  };
}
