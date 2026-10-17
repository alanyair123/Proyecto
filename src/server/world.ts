import { randomUUID } from "node:crypto";
import { BASE_ENEMIES, type Enemy, type Player } from "@/core/entities";
import { generateMap } from "@/core/mapgen";
import { scaleEnemy } from "@/core/progression";
import { createRng } from "@/core/rng";
import type { Position } from "@/core/types";
import type { GameRoom } from "./rooms";

function roomPositions(roomX: number, roomY: number, width: number, height: number): Position[] {
  const positions: Position[] = [];
  for (let y = roomY; y < roomY + height; y += 1) {
    for (let x = roomX; x < roomX + width; x += 1) {
      positions.push({ x, y });
    }
  }
  return positions;
}

export function createFloor(room: GameRoom, seed: number): void {
  room.seed ??= seed;
  room.rng ??= createRng(seed);
  room.map = generateMap(seed);
  room.enemies = [];

  const firstRoom = room.map.rooms[0]!;
  const spawnPositions = roomPositions(firstRoom.x, firstRoom.y, firstRoom.w, firstRoom.h);
  let playerIndex = 0;
  for (const player of room.players.values()) {
    if (!player.alive) continue;
    const position = spawnPositions[playerIndex % spawnPositions.length] ?? room.map.spawn;
    player.entity = { ...player.entity, pos: { ...position } };
    player.pendingInput = undefined;
    player.startedAt ||= Date.now();
    playerIndex += 1;
  }

  for (let roomIndex = 1; roomIndex < room.map.rooms.length; roomIndex += 1) {
    const targetRoom = room.map.rooms[roomIndex]!;
    const base = room.rng.pick([...BASE_ENEMIES]);
    const scaled = scaleEnemy(base, room.floor);
    const enemy: Enemy = {
      ...scaled,
      id: randomUUID(),
      pos: {
        x: Math.floor(targetRoom.x + targetRoom.w / 2),
        y: Math.floor(targetRoom.y + targetRoom.h / 2),
      },
    };
    room.enemies.push(enemy);
  }

  room.map.tiles[room.map.stairs.y]![room.map.stairs.x] = "stairs";
}

export function advanceFloor(room: GameRoom): void {
  room.floor += 1;
  const seed = room.rng!.int(0, 2_147_483_647);
  createFloor(room, seed);
}

export function createPlayerEntity(userId: string, pos: Position): Player {
  return {
    id: userId,
    pos,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 2,
    level: 1,
    xp: 0,
  };
}
