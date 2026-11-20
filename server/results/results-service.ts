import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { AppError } from "../api/errors";
import { RoomRepo } from "../rooms/room-repo";
import { ResultsRepo } from "./results-repo";

export class ResultsService {
  private readonly repo: ResultsRepo;
  private readonly rooms: RoomRepo;
  constructor(pool: Pool, redis: Redis) { this.repo = new ResultsRepo(pool); this.rooms = new RoomRepo(redis); }
  async list(playerId: string, roomId?: string) { return { results: await this.repo.list(playerId, roomId) }; }
  async get(playerId: string, debateId: string) {
    const result = await this.repo.get(playerId, debateId);
    if (result) return { result };
    if (await this.rooms.pendingArchive(playerId, debateId)) throw new AppError("RESULTS_NOT_READY");
    throw new AppError("RESULTS_NOT_FOUND");
  }
  async acknowledge(playerId: string, debateId: string) {
    // Same membership/readiness behavior as detail, including outsider concealment.
    await this.get(playerId, debateId);
    await this.repo.acknowledge(playerId, debateId);
    return this.get(playerId, debateId);
  }
}
