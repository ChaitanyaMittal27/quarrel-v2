import { randomBytes, randomInt } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ROOM_CODE_ALPHABET, type RoomResponse, type CreateRoomRequest, type SubmitMessageRequest, type SetChoicesRequest } from "@quarrel/shared/contract";
import { AppError } from "../api/errors";
import { ensureSession, requireSession } from "../api/session";
import { RoomRepo, roomRead, type RoomRepoOptions, type RoomResult } from "./room-repo";
import { mapRoom } from "./room-mapper";
import { RoomEvents } from "./room-events";

export interface RoomServiceOptions extends RoomRepoOptions {
  /** Injectable to exercise code collisions without weakening production randomness. */
  generateCode?: () => string;
  ensurePlan?: (roomId: string) => Promise<void>;
}

export function newRoomCode(): string {
  return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]!).join("");
}

export class RoomService {
  readonly events = new RoomEvents();
  private readonly generateCode: () => string;

  constructor(private readonly repo: RoomRepo, private readonly options: RoomServiceOptions = {}) {
    this.generateCode = options.generateCode ?? newRoomCode;
  }

  async current(playerId: string, recoverPlan = true): Promise<RoomResponse> {
    const result = this.check(await this.repo.read(playerId));
    this.changed(result);
    const room = roomRead(result);
    const snapshot = room ? mapRoom(room, playerId) : null;
    if (recoverPlan && snapshot?.setup.phase === "planning" && !snapshot.plan && !snapshot.closed) {
      await this.options.ensurePlan?.(snapshot.roomId);
    }
    return { room: snapshot };
  }

  async create(request: FastifyRequest, reply: FastifyReply, setup: CreateRoomRequest): Promise<RoomResponse> {
    const playerId = await ensureSession(request, reply);
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomId = `r_${randomBytes(16).toString("base64url")}`;
      const result = await this.repo.create(playerId, setup, roomId, this.generateCode());
      if (result.status === "CODE_TAKEN") continue;
      this.changed(this.check(result));
      return this.current(playerId);
    }
    throw new AppError("SERVICE_UNAVAILABLE");
  }

  async join(request: FastifyRequest, reply: FastifyReply, code: string, name: string): Promise<RoomResponse> {
    const playerId = await ensureSession(request, reply);
    this.changed(this.check(await this.repo.join(playerId, code, name)));
    return this.current(playerId);
  }

  async leave(request: FastifyRequest, roomId: string): Promise<{ room: null }> {
    const playerId = requireSession(request);
    const result = this.check(await this.repo.leave(playerId, roomId));
    if (result.changed && result.roomId) this.events.emit("roomChanged", result.roomId, { leftPlayerId: playerId });
    return { room: null };
  }

  async presenceChanged(playerId: string): Promise<void> {
    const roomId = await this.repo.currentRoomId(playerId);
    if (roomId) this.events.emit("roomChanged", roomId);
  }

  seatedPlayerIds(roomId: string): Promise<string[]> {
    return this.repo.seatedPlayerIds(roomId);
  }

  async setReady(request: FastifyRequest, roomId: string, ready: boolean): Promise<RoomResponse> {
    const playerId = requireSession(request);
    const result = this.check(await this.repo.setReady(playerId, roomId, ready));
    this.changed(result);
    if (result.planningStarted) await this.options.ensurePlan?.(roomId);
    return this.current(playerId, false);
  }

  async setPosition(request: FastifyRequest, roomId: string, text: string): Promise<RoomResponse> {
    const playerId = requireSession(request);
    this.changed(this.check(await this.repo.setPosition(playerId, roomId, text)));
    return this.current(playerId);
  }

  async setChoices(request: FastifyRequest, roomId: string, body: SetChoicesRequest): Promise<RoomResponse> {
    const playerId = requireSession(request);
    this.changed(this.check(await this.repo.setChoices(playerId, roomId, body)));
    return this.current(playerId, false);
  }

  async start(request: FastifyRequest, roomId: string): Promise<RoomResponse> {
    const playerId = requireSession(request);
    this.changed(this.check(await this.repo.start(playerId, roomId)));
    return this.current(playerId, false);
  }

  async submit(request: FastifyRequest, roomId: string, body: SubmitMessageRequest): Promise<RoomResponse> {
    const playerId = requireSession(request);
    const result = await this.repo.submit(playerId, roomId, body);
    // Catch-up may have changed state even when the subsequent submit is rejected.
    this.changed(result);
    this.check(result);
    return this.current(playerId, false);
  }

  private check(result: RoomResult): RoomResult {
    if (result.status === "RETRY" || result.status === "CODE_TAKEN") throw new AppError("SERVICE_UNAVAILABLE");
    if (result.status !== "OK") throw new AppError(result.status);
    return result;
  }

  private changed(result: RoomResult): void {
    if (result.changed && result.roomId) this.events.emit("roomChanged", result.roomId);
  }
}
