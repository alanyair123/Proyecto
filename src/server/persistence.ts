import { GameRunSchema } from "@/core/schemas";
import { prisma } from "@/lib/prisma";
import type { GameRoom, RoomPlayer } from "./rooms";

export async function persistPlayerRun(
  room: GameRoom,
  userId: string,
  player: RoomPlayer,
): Promise<void> {
  if (player.persisted || room.seed === undefined) {
    return;
  }

  player.persisted = true;
  try {
    const run = GameRunSchema.parse({
      levelReached: Math.max(1, Math.min(100, room.floor)),
      enemiesKilled: player.kills,
      durationSeconds: Math.max(1, Math.min(86_400, Math.floor((Date.now() - player.startedAt) / 1_000))),
      inventory: [],
      mode: room.mode,
    });
    await prisma.gameRun.create({
      data: {
        ...run,
        userId,
        seed: room.seed,
      },
    });
  } catch (error: unknown) {
    player.persisted = false;
    console.error(`No se pudo guardar la partida de ${userId}:`, error);
  }
}
