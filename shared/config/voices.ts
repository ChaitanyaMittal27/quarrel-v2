import { z } from "zod";

export const GeminiVoice = z.enum(["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"]);
export type GeminiVoice = z.infer<typeof GeminiVoice>;
export const BrowserVoice = z.strictObject({ pitch: z.number().min(0).max(2), rate: z.number().min(0.1).max(10) });
export type BrowserVoice = z.infer<typeof BrowserVoice>;
export const Voice = z.strictObject({ geminiVoice: GeminiVoice, browserVoice: BrowserVoice });
export type Voice = z.infer<typeof Voice>;
