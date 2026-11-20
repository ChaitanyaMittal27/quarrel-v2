import { loadAiConfig, type AiConfig } from "../../common/config";
import type { LawyerJob, LawyerResult } from "@quarrel/shared/types";
import { JuryUnavailableError, type JuryFailureCode } from "./lawyer-errors";
import { deterministicLawyerResult, lawyerContext, lawyerInstructions, lawyerResponseSchema, lawyerSafetyRedirect, validateLawyerResult } from "./lawyer-policy";
import { classifyQuotaError } from './quota-errors';
import type { QuotaStore } from '../../ai/quota-store';

// v2: v1's legacy shared-judge chat (its generator, demo replies, prompt and schema) was not
// ported; only the lawyer AI and the helpers it uses remain. See agent-docs/plans/v1-port-inventory.md §9.
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

/** Stage 5/6A strategies share Gemini; retries remain inside one clock pause. */
export async function generateLawyerResult(job: LawyerJob, config: AiConfig = loadAiConfig(), retryPlanFailures = false, quota?: QuotaStore): Promise<LawyerResult> {
  const unavailable = (code: JuryFailureCode, retryable = true, retryAfterSeconds?: number): LawyerResult => {
    if (job.kind === "plan" && retryPlanFailures) {
      if (code === 'quota_exhausted') throw new JuryUnavailableError(code, false);
      throw new Error("PLAN_GENERATION_FAILED");
    }
    if (job.kind === "jury") throw new JuryUnavailableError(code, retryable, retryAfterSeconds);
    // Operational metadata only: never log participant text, provider bodies or keys.
    console.info("quarrel_ai_unavailable", { role: job.kind, code });
    return deterministicLawyerResult(job, "fallback");
  };
  const key = config.GEMINI_API_KEY;
  if (job.mode === "demo" || config.JUDGE_AI_MODE === "demo") return deterministicLawyerResult(job);
  if (!key) return unavailable("missing_configuration", false);
  if (lawyerSafetyRedirect(job)) return unavailable("unsafe_dispute", false);
  const model = config.GEMINI_MODEL;
  const fallbackModel = config.GEMINI_FALLBACK_MODEL;
  const validModel = (value: string) => /^[a-z0-9][a-z0-9._-]{0,100}$/i.test(value);
  if (!validModel(model) || (fallbackModel && !validModel(fallbackModel))) return unavailable("missing_configuration", false);
  const context = JSON.stringify({ task: job.kind, player: job.slot, rawArgument: job.kind === "lawyer" || job.kind === "consult" ? job.playerText : undefined, untrustedRoomContext: lawyerContext(job) });
  if (context.length > 240_000) return unavailable("invalid_response", false);
  const models = fallbackModel && fallbackModel !== model ? [model, fallbackModel] : [model];
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), config.JUDGE_AI_TIMEOUT_MS);
  try {
    for (const [index, selectedModel] of models.entries()) {
      if (await quota?.until(selectedModel)) {
        if (index + 1 < models.length) continue;
        return unavailable('quota_exhausted', false);
      }
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`, {
        method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: lawyerInstructions(job) }] },
          contents: [{ role: "user", parts: [{ text: context }] }],
          generationConfig: { candidateCount: 1, maxOutputTokens: job.kind === "jury" ? 4096 : job.kind === "summary" ? 512 : 2000, responseMimeType: "application/json", responseJsonSchema: lawyerResponseSchema(job),
            ...(selectedModel === "gemini-3.6-flash" ? { thinkingConfig: { thinkingLevel: "MINIMAL", includeThoughts: false } } : {}) },
        }),
      });
      if (!response.ok) {
        if (response.status === 429) {
          const body = await response.text();
          const classification = classifyQuotaError({ status: 429, message: body.slice(0, 65536) });
          if (classification === 'DAILY_EXHAUSTED') {
            await quota?.mark(selectedModel);
            if (index + 1 < models.length) continue;
            return unavailable('quota_exhausted', false);
          }
          if (index + 1 < models.length) continue;
          return unavailable('rate_limited', true);
        }
        const temporary = response.status === 429 || response.status >= 500;
        // A server-configured Gemini alternative is tried at most once, sharing
        // the same timeout. Do not retry authentication errors or malformed data.
        if (temporary && index + 1 < models.length && !abort.signal.aborted) { await response.body?.cancel(); continue; }
        const retry = Number(response.headers.get("retry-after"));
        return unavailable("provider_unavailable", temporary,
          Number.isFinite(retry) && retry > 0 ? Math.min(86400, Math.ceil(retry)) : undefined);
      }
      const body = await response.text();
      if (body.length > 65_536) return unavailable("invalid_response");
      const payload: unknown = JSON.parse(body);
      if (!record(payload) || (record(payload.promptFeedback) && payload.promptFeedback.blockReason) || !Array.isArray(payload.candidates) || payload.candidates.length !== 1) return unavailable("invalid_response");
      const candidate = payload.candidates[0];
      if (!record(candidate) || candidate.finishReason !== "STOP" || !record(candidate.content) || !Array.isArray(candidate.content.parts)) return unavailable("invalid_response");
      const parts = candidate.content.parts;
      if (parts.some(part => !record(part) || part.functionCall || part.executableCode || part.inlineData)) return unavailable("invalid_response");
      const output = parts.filter(part => typeof part.text === "string" && !part.thought).map(part => part.text).join("");
      return validateLawyerResult(JSON.parse(output), job) ?? unavailable("invalid_response");
    }
    return unavailable("provider_unavailable");
  } catch (error) {
    if (error instanceof JuryUnavailableError) throw error;
    return unavailable(abort.signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "provider_unavailable");
  } finally { clearTimeout(timeout); }
}
