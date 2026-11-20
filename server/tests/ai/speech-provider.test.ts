import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSpeech, pcmToWav } from "../../worker/ai/speech-provider";
import { getSpeechVoice } from "@quarrel/shared/config";
const input = { text: "Exactly the saved public words.", themeId: "courtroom", role: "lawyerA" as const };
const audio = (mimeType = "audio/L16;codec=pcm;rate=24000", data = Buffer.from([0, 0, 1, 0]).toString("base64")) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }), { headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.stubEnv("JUDGE_AI_MODE", "auto"); vi.stubEnv("GEMINI_TTS_API_KEY", "speech-key-only"); vi.stubEnv("GEMINI_API_KEY", "text-key-must-never-be-used"); vi.stubEnv("GEMINI_TTS_MODEL", ""); vi.stubEnv("TTS_TIMEOUT_MS", ""); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audio())); });

describe("Gemini speech provider", () => {
  it("decodes current Interactions audio blocks and rejects provider safety/HTTP 422 without fallback", async () => {
    const wav = pcmToWav(new Uint8Array([0,0,1,0]));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:Buffer.from(wav).toString('base64')}]}]})));
    expect(await generateSpeech({...input,voice:'Puck'})).toEqual(wav);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'SAFETY'}})));
    await expect(generateSpeech(input)).rejects.toMatchObject({code:'TTS_CONTENT_BLOCKED',fallbackAllowed:false});
    vi.mocked(fetch).mockResolvedValueOnce(new Response('provider',{status:422}));
    await expect(generateSpeech(input)).rejects.toMatchObject({code:'TTS_CONTENT_BLOCKED',fallbackAllowed:false});
  });
  it("sends exact text, separate style, correct role voice and only the speech key", async () => {
    const wav = await generateSpeech(input);
    const [url, request] = vi.mocked(fetch).mock.calls[0]!; const payload = JSON.parse(request!.body as string);
    expect(url).toContain("/v1beta/interactions"); expect(payload.model).toBe("gemini-3.8-flash-tts");
    expect(request!.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "speech-key-only" });
    expect(payload.input).toEqual([{ type:"user_input",content:[{type:"text",text:input.text,annotations:[{type:"speech_metadata",style:getSpeechVoice("courtroom","lawyerA").delivery}]}] }]);
    expect(payload.generation_config.speech_config[0].voice).toBe(getSpeechVoice("courtroom", "lawyerA").geminiVoice);
    expect(JSON.stringify(request)).not.toContain("text-key");
    expect(Buffer.from(wav).subarray(0, 4).toString()).toBe("RIFF"); expect(wav.length).toBe(48);
  });
  it.each(["courtroom", "jungle", "detective", "superhero"])("uses centralized %s judge/lawyer voices", async themeId => {
    for (const role of ["lawyerA", "lawyerB", "judge"] as const) {
      vi.mocked(fetch).mockResolvedValueOnce(audio()); await generateSpeech({ ...input, themeId, role });
      const request = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
      expect(request.generation_config.speech_config[0].voice).toBe(getSpeechVoice(themeId, role).geminiVoice);
    }
  });
  it("missing speech key never falls back to the existing text key", async () => {
    vi.stubEnv("GEMINI_TTS_API_KEY", ""); await expect(generateSpeech(input)).rejects.toMatchObject({ code: "TTS_NOT_CONFIGURED", fallbackAllowed: true }); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects invalid text and model configuration before provider requests", async () => {
    await expect(generateSpeech({ ...input, text: "" })).rejects.toMatchObject({ code: "TTS_INVALID_TEXT", fallbackAllowed: false });
    await expect(generateSpeech({ ...input, text: "x".repeat(4001) })).rejects.toMatchObject({ code: "TTS_INVALID_TEXT" });
    vi.stubEnv("GEMINI_TTS_MODEL", "https://evil.example"); await expect(generateSpeech(input)).rejects.toThrow("GEMINI_TTS_MODEL"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([429, 401, 403, 500])("sanitizes provider failure %s and offers independent fallback", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response("secret provider details", { status }));
    await expect(generateSpeech(input)).rejects.toMatchObject({ code: status === 429 ? "TTS_QUOTA" : "TTS_PROVIDER_UNAVAILABLE", fallbackAllowed: true });
  });
  it("provider safety rejection must not switch to browser speech", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })));
    await expect(generateSpeech(input)).rejects.toMatchObject({ code: "TTS_CONTENT_BLOCKED", fallbackAllowed: false });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] })));
    await expect(generateSpeech(input)).rejects.toMatchObject({ code: "TTS_CONTENT_BLOCKED", fallbackAllowed: false });
  });
  it('classifies daily TTS quota without leaking provider text or allowing browser fallback', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({error:{code:429,message:'PRIVATE PROVIDER MESSAGE',details:[{violations:[{quotaId:'SpeechRequestsPerDay'}]}]}}),{status:429}));
    await expect(generateSpeech(input)).rejects.toMatchObject({code:'TTS_DAILY_EXHAUSTED',fallbackAllowed:false});
    await expect(generateSpeech(input)).rejects.not.toThrow('PRIVATE PROVIDER MESSAGE');
  });
  it("accepts validated WAV from current Gemini without adding another WAV header", async () => {
    const wav = pcmToWav(new Uint8Array([0, 0, 1, 0])); vi.mocked(fetch).mockResolvedValue(audio("audio/wav", Buffer.from(wav).toString("base64")));
    expect(await generateSpeech(input)).toEqual(wav);
  });
  it.each(["audio/mp3", "audio/l16;rate=200", "audio/l16;rate=999999", "audio/wav"])("rejects unsupported or malformed audio (%s)", async mime => {
    vi.mocked(fetch).mockResolvedValue(audio(mime)); await expect(generateSpeech(input)).rejects.toMatchObject({ fallbackAllowed: true });
  });
  it.each(["@notbase64", "YQ==", "", "YWJjZA"])("rejects invalid/empty/odd PCM data %s", async data => {
    vi.mocked(fetch).mockResolvedValue(audio(undefined, data)); await expect(generateSpeech(input)).rejects.toBeInstanceOf(Error);
  });
  it("rejects missing, oversized, text-only and malformed upstream responses", async () => {
    for (const response of [new Response(null), new Response("not json"), new Response("{}"), new Response("{}", { headers: { "content-length": String(13 * 1024 * 1024) } }), new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "unexpected" }] } }] }))]) {
      vi.mocked(fetch).mockResolvedValueOnce(response); await expect(generateSpeech(input)).rejects.toMatchObject({ code: "TTS_INVALID_RESPONSE" });
    }
  });
  it("times out independently without issuing another request", async () => {
    vi.useFakeTimers(); vi.stubEnv("TTS_TIMEOUT_MS", "1000");
    vi.mocked(fetch).mockImplementation((_url, request) => new Promise((_resolve, reject) => request!.signal!.addEventListener("abort", () => reject(new Error("abort")))));
    const result = expect(generateSpeech(input)).rejects.toMatchObject({ code: "TTS_TIMEOUT" }); await vi.advanceTimersByTimeAsync(1001); await result; expect(fetch).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
  it("bounds PCM and writes a correct mono 16-bit header", () => {
    const wav = pcmToWav(new Uint8Array([0, 0, 1, 0]), 48000); const view = new DataView(wav.buffer as ArrayBuffer);
    expect(view.getUint32(24, true)).toBe(48000); expect(view.getUint32(28, true)).toBe(96000); expect(view.getUint16(22, true)).toBe(1); expect(view.getUint32(40, true)).toBe(4);
    for (const bytes of [new Uint8Array(), new Uint8Array(3), new Uint8Array(9 * 1024 * 1024)]) expect(() => pcmToWav(bytes)).toThrow();
  });
});
