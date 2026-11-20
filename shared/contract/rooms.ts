import { z } from "zod";
import { IsoDateTime, Slot, DebateId } from "./common";
import { themes, playerCharacters, lawyers } from "../config";
import { PublicSummary, SummaryState, JuryState, JuryVerdict } from "./judgment";
import { DebatePlan } from "./plan";

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

/** Any Unicode control character (category Cc), e.g. \u0000–\u001F, \u007F, \u0080–\u009F. */
const CONTROL_CHAR = /\p{Cc}/u;

/** Length in Unicode code points ("😀" is 1), not UTF-16 units ("😀".length is 2). */
const codePointLength = (value: string) => [...value].length;

/**
 * Display name. Rule 1.10: trimmed, 1–32 code points, no control characters.
 * Control characters are checked on the raw input, before trimming (as v1 does), so
 * "Ann\n" is rejected rather than silently trimmed. Output: the trimmed name.
 */
export const DisplayName = z
  .string()
  .refine((value) => !CONTROL_CHAR.test(value), "Name must not contain control characters")
  .trim()
  .refine((value) => {
    const length = codePointLength(value);
    return length >= 1 && length <= 32;
  }, "Name must be 1–32 characters");
export type DisplayName = z.infer<typeof DisplayName>;

/** The 32 symbols a room code is made of: A–Z without I and O, then digits 2–9. Rule 1.2. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * Room code as typed by a player. Rule 1.2 (format), 1.8 (malformed code rejected).
 * Trimmed and uppercased first, so " k7m2qx " becomes "K7M2QX".
 */
export const RoomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_PATTERN, "Room code must be 6 characters (A–Z without I/O, 2–9)");
export type RoomCode = z.infer<typeof RoomCode>;

/** Room ID: "r_" plus 16–32 URL-safe characters. Opaque to clients. */
export const RoomId = z.string().regex(/^r_[A-Za-z0-9_-]{16,32}$/, "Invalid room ID");
export type RoomId = z.infer<typeof RoomId>;

/** Rules S2.1 and S2.3: validate controls before trimming, count Unicode code points. */
export const Topic = z.string()
  .refine((value) => !CONTROL_CHAR.test(value), "Topic must not contain control characters")
  .trim().refine((value) => codePointLength(value) >= 1 && codePointLength(value) <= 240, "Topic must be 1-240 characters");
export type Topic = z.infer<typeof Topic>;

export const PositionText = z.string()
  // eslint-disable-next-line no-control-regex -- Rule S2.3 permits only tab and LF control characters.
  .refine((value) => !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value), "Only tab and newline control characters are allowed")
  .trim().refine((value) => codePointLength(value) >= 1 && codePointLength(value) <= 600, "Position must be 1-600 characters");
export type PositionText = z.infer<typeof PositionText>;

export const Theme = z.enum(themes.map((theme) => theme.id));
export type Theme = z.infer<typeof Theme>;
export const DurationSec = z.union([z.literal(120), z.literal(240), z.literal(360), z.literal(600)]);
export type DurationSec = z.infer<typeof DurationSec>;
export const RoomSetup = z.strictObject({
  phase: z.enum(["waiting", "positions", "planning", "debate", "summary", "jury", "complete", "ended"]),
  theme: Theme, topic: Topic, durationSec: DurationSec,
  positions: z.strictObject({ A: PositionText.nullable(), B: PositionText.nullable() }),
});
export type RoomSetup = z.infer<typeof RoomSetup>;

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

/** POST /api/rooms body. Rules 1.4, 1.7, 1.10. */
export const CreateRoomRequest = z.object({
  name: DisplayName, theme: Theme.default("courtroom"), topic: Topic, durationSec: DurationSec.default(240),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

/** POST /api/rooms/join body. Rules 1.8, 1.10. */
export const JoinRoomRequest = z.object({ code: RoomCode, name: DisplayName });
export type JoinRoomRequest = z.infer<typeof JoinRoomRequest>;

/** PUT /api/rooms/:roomId/ready body. Rule 1.13: a boolean; null and missing are rejected. */
export const SetReadyRequest = z.object({ ready: z.boolean() });
export type SetReadyRequest = z.infer<typeof SetReadyRequest>;

/** PUT /api/rooms/:roomId/position. Rules S2.3-S2.5. */
export const SetPositionRequest = z.object({ text: PositionText });
export type SetPositionRequest = z.infer<typeof SetPositionRequest>;

export const CharacterId = z.enum(playerCharacters.map((entry) => entry.id));
export type CharacterId = z.infer<typeof CharacterId>;
export const LawyerId = z.enum(lawyers.map((entry) => entry.id));
export type LawyerId = z.infer<typeof LawyerId>;
/** Stage 5B: only own-seat choices; deliberately strict unlike older request bodies. */
export const SetChoicesRequest = z.strictObject({ characterId: CharacterId.optional(), lawyerId: LawyerId.optional() })
  .refine((body) => body.characterId !== undefined || body.lawyerId !== undefined, "Choose a character or lawyer");
export type SetChoicesRequest = z.infer<typeof SetChoicesRequest>;

/** Rule 4.11: validate raw text, preserving exactly what the author typed. */
export const ArgumentText = z.string()
  // eslint-disable-next-line no-control-regex -- Only tab and LF controls are allowed.
  .refine((value) => !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value), "Only tab and newline control characters are allowed")
  .refine((value) => value.trim().length > 0 && codePointLength(value) <= 600, "Argument must be 1-600 characters, not blank");
export type ArgumentText = z.infer<typeof ArgumentText>;
export const SubmitMessageRequest = z.strictObject({ kind: z.enum(["argument", "consult"]), text: ArgumentText, requestKey: z.uuidv4(), ordinal: z.int().min(1).max(5) });
export type SubmitMessageRequest = z.infer<typeof SubmitMessageRequest>;
export const DebateMessage = z.strictObject({
  id: z.string(), label: z.string().optional(), ordinal: z.int().min(1).max(5), kind: z.enum(["announcement", "argument", "judge_summary"]),
  slot: Slot.nullable(), text: z.string(), at: IsoDateTime,
  source: z.enum(["ai", "demo", "fallback"]).optional(),
}).superRefine((message, ctx) => {
  if (message.kind === "argument" && !message.source) ctx.addIssue({ code: "custom", message: "Presentations require a source label" });
});
export type DebateMessage = z.infer<typeof DebateMessage>;
export const OwnDraft = z.strictObject({ id: z.string(), ordinal: z.int().min(1).max(5), text: ArgumentText,
  at: IsoDateTime, status: z.enum(["pending", "complete"]) });
export const OwnConsultation = z.strictObject({ id: z.string(), ordinal: z.int().min(1).max(5), question: ArgumentText,
  at: IsoDateTime, answer: z.string().nullable(), source: z.enum(["ai", "demo", "fallback"]).nullable() });
export const DebateState = z.strictObject({
  ordinal: z.int().min(1).max(5), activeSlot: Slot.nullable(),
  clocks: z.strictObject({ A: z.int().min(0), B: z.int().min(0) }),
  deadline: IsoDateTime.nullable(), yourArgumentsThisSubtopic: z.int().min(0).max(12),
  state: z.enum(["composing", "lawyering", "consulting", "summary", "jury", "complete", "ended"]),
  consultsLeft: z.int().min(0).max(2), drafts: z.array(OwnDraft), consultations: z.array(OwnConsultation),
}).superRefine((debate, ctx) => {
  if (debate.state !== "composing" && (debate.activeSlot !== null || debate.deadline !== null)) {
    ctx.addIssue({ code: "custom", message: "Paused work hides turn routing and deadline" });
  }
});
export type DebateState = z.infer<typeof DebateState>;

/** URL params of every /api/rooms/:roomId/... route. Rule 1.16 (stale-tab guard). */
export const RoomParams = z.object({ roomId: RoomId });
export type RoomParams = z.infer<typeof RoomParams>;

// ---------------------------------------------------------------------------------------------
// Responses (all strict: an unknown key, such as an internal player ID, fails parsing)
// ---------------------------------------------------------------------------------------------

/**
 * One seat as every player in the room sees it. Rules 1.11 (connected), 1.13 (ready),
 * 1.14 (left: the seat keeps its name after leaving), 1.17 (no player IDs).
 */
export const PlayerView = z.strictObject({
  slot: Slot,
  name: z.string(),
  characterId: CharacterId,
  lawyerId: LawyerId,
  ready: z.boolean(),
  connected: z.boolean(),
  left: z.boolean(),
});
export type PlayerView = z.infer<typeof PlayerView>;

/**
 * The caller's view of their current room. Rules 1.2 (code), 1.3 (expiresAt), 1.7 (at most
 * 2 players, A first), 1.12 (bothReady), 1.15 (closed), 1.17 (strict: no IDs leak).
 */
export const RoomSnapshot = z
  .strictObject({
    roomId: RoomId, debateId: DebateId, archivedAt: IsoDateTime.nullable(),
    rematch: z.strictObject({ A: z.boolean(), B: z.boolean() }),
    code: z.string().regex(ROOM_CODE_PATTERN),
    version: z.int().min(0),
    createdAt: IsoDateTime,
    expiresAt: IsoDateTime,
    serverNow: IsoDateTime,
    closed: z.boolean(),
    bothReady: z.boolean(),
    setup: RoomSetup,
    plan: DebatePlan.nullable(),
    startsAt: IsoDateTime.nullable(),
    debate: DebateState.nullable(),
    messages: z.array(DebateMessage),
    summaries: z.array(PublicSummary), summary: SummaryState.nullable(), jury: JuryState.nullable(), verdict: JuryVerdict.nullable(),
    you: z.strictObject({ slot: Slot }),
    players: z.array(PlayerView).min(1).max(2),
  })
  .superRefine((room, ctx) => {
    if (room.plan && room.plan.subtopics.reduce((sum, item) => sum + item.secondsPerPlayer, 0) !== room.setup.durationSec) {
      ctx.addIssue({ code: "custom", path: ["plan"], message: "Plan time must equal room duration" });
    }
    // Seats are listed in order: A, then B. This also rules out duplicate slots.
    room.players.forEach((player, index) => {
      const expected = Slot.options[index];
      if (player.slot !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["players", index, "slot"],
          message: `Players must be listed A then B without duplicates (expected ${expected})`,
        });
      }
    });
    // The caller must hold a seat in the room and must not have left it (rules 1.14, 1.15).
    const you = room.players.find((player) => player.slot === room.you.slot);
    if (!you || you.left) {
      ctx.addIssue({
        code: "custom",
        path: ["you", "slot"],
        message: "you.slot must be a seat in this room that has not left",
      });
    }
  });
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

/**
 * Response of GET /api/session, create, join and ready. `room` is null when the caller has
 * no current room. Rules 1.4, 1.15.
 */
export const RoomResponse = z.strictObject({ room: RoomSnapshot.nullable() });
export type RoomResponse = z.infer<typeof RoomResponse>;

/** Response of POST /api/rooms/:roomId/leave: always no room. Rule 1.14. */
export const LeaveRoomResponse = z.strictObject({ room: z.null() });
export type LeaveRoomResponse = z.infer<typeof LeaveRoomResponse>;
