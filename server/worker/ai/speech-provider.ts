import { loadTtsConfig, type TtsConfig } from "../../common/config";
import type { GeminiVoice } from "@quarrel/shared/config";
import { getSpeechVoice, type SpeechRole } from "@quarrel/shared/config";

export const MAX_SPEECH_CHARACTERS = 4000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
export class SpeechError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fallbackAllowed = true) { super(message); }
}

/** Adapted from the reviewed texttospeech branch's PCM/RIFF implementation. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000): Uint8Array {
  if (!pcm.length || pcm.length % 2 || pcm.length > MAX_AUDIO_BYTES || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48_000) {
    throw new SpeechError(502, "TTS_INVALID_AUDIO", "Speech returned invalid audio. The saved text is still available.");
  }
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  wav.set(new TextEncoder().encode("RIFF"), 0); view.setUint32(4, 36 + pcm.length, true);
  wav.set(new TextEncoder().encode("WAVEfmt "), 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wav.set(new TextEncoder().encode("data"), 36); view.setUint32(40, pcm.length, true); wav.set(pcm, 44);
  return wav;
}

function validWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44 || bytes.length > MAX_AUDIO_BYTES) return false;
  const text = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (text.decode(bytes.subarray(0, 4)) !== "RIFF" || text.decode(bytes.subarray(8, 12)) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) return false;
  let format = false, data = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = text.decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.length) return false;
    if (name === "fmt ") {
      if (size < 16) return false;
      const rate = view.getUint32(offset + 12, true);
      format = view.getUint16(offset + 8, true) === 1 && view.getUint16(offset + 10, true) === 1 && view.getUint16(offset + 22, true) === 16 && rate >= 8000 && rate <= 48000;
    }
    if (name === "data") data = size > 0 && size % 2 === 0;
    offset += 8 + size + size % 2;
  }
  return format && data;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new Error("size");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("size"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export interface SpeechInput { text: string; voice?: GeminiVoice; themeId?: string; role?: SpeechRole }

/** Only the TTS credential is accepted. No text-key or alternate-provider fallback. */
export async function generateSpeech(input: SpeechInput, config: TtsConfig = loadTtsConfig()): Promise<Uint8Array> {
  const key = config.GEMINI_TTS_API_KEY;
  if (!key || config.JUDGE_AI_MODE === "demo") throw new SpeechError(503, "TTS_NOT_CONFIGURED", "Gemini speech is unavailable. You can use browser speech or read the text.");
  if (!input.text.trim() || Array.from(input.text).length > MAX_SPEECH_CHARACTERS) throw new SpeechError(400, "TTS_INVALID_TEXT", "This message is not available for speech.", false);
  const model = config.GEMINI_TTS_MODEL;
  if (!/^gemini-[a-z0-9.-]+tts[a-z0-9.-]*$/.test(model)) throw new SpeechError(503, "TTS_CONFIGURATION", "The speech model needs configuration.");
  const voice = getSpeechVoice(input.themeId ?? "courtroom", input.role ?? "judge");
  const content = [{ type:"text", text:input.text, annotations:[{type:"speech_metadata",style:voice.delivery}] }];
  const timeout = config.TTS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: controller.signal,
      body: JSON.stringify({ model, input:[{type:"user_input",content}], response_format:{type:"audio",mime_type:"audio/wav"},
        generation_config:{speech_config:[{voice:input.voice ?? voice.geminiVoice}]} }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 422) throw new SpeechError(422,"TTS_CONTENT_BLOCKED","Speech is unavailable for this message.",false);
      throw new SpeechError(response.status === 429 ? 429 : 503, response.status === 429 ? "TTS_QUOTA" : "TTS_PROVIDER_UNAVAILABLE", "Gemini speech is temporarily unavailable. Your debate continues with text.");
    }
    const payload = await boundedJson(response) as { error?: {code?: string}; steps?: {type?: string; content?: {type?: string; data?: string; mime_type?: string}[]}[]; promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    if (["SAFETY","PROHIBITED_CONTENT","BLOCKLIST"].includes(payload.error?.code ?? "") || payload.promptFeedback?.blockReason || payload.candidates?.some(item => ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(item.finishReason ?? ""))) {
      throw new SpeechError(422, "TTS_CONTENT_BLOCKED", "Speech is unavailable for this message.", false);
    }
    const blocks = payload.steps?.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((p) => p.type === "audio") ?? [];
    const audioParts = blocks.length ? blocks.map((p) => ({inlineData:{data:p.data,mimeType:p.mime_type}})) : payload.candidates?.[0]?.content?.parts?.filter(part => part.inlineData?.data) ?? [];
    if (audioParts.length !== 1) throw new Error("audio");
    const audio = audioParts[0]!.inlineData!;
    if (typeof audio.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio.data) || audio.data.length % 4 !== 0) throw new Error("base64");
    const bytes = new Uint8Array(Buffer.from(audio.data, "base64"));
    if (audio.mimeType === "audio/wav" || audio.mimeType === "audio/x-wav") {
      if (!validWav(bytes)) throw new Error("wav");
      return bytes;
    }
    if (!/^audio\/l16;(?:codec=pcm;)?rate=(\d+)$/i.test(audio.mimeType ?? "")) throw new Error("mime");
    return pcmToWav(bytes, Number(/rate=(\d+)/i.exec(audio.mimeType!)![1]));
  } catch (error) {
    if (error instanceof SpeechError) throw error;
    throw new SpeechError(502, controller.signal.aborted ? "TTS_TIMEOUT" : "TTS_INVALID_RESPONSE", "Speech could not play. Your saved text and debate are unchanged.");
  } finally { clearTimeout(timer); }
}
