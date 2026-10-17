import { resolveAttack } from "@/core/combat";
import type { Player } from "@/core/entities";
import { applyXp } from "@/core/progression";
import type { Position } from "@/core/types";
import type { Server } from "socket.io";
import { persistPlayerRun } from "./persistence";
import type { GameRoom, RoomPlayer } from "./rooms";
import { advanceFloor } from "./world";

const TICK_MS = 100;
const DIRECTIONS: Record<"up" | "down" | "left" | "right", Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

interface RunningLoop {
  timer: NodeJS.Timeout;
  busy: boolean;
}

const loops = new Map<string, RunningLoop>();

function key(position: Position): string {
  return `${position.x},${position.y}`;
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isWalkable(room: GameRoom, position: Position): boolean {
  const map = room.map;
  return Boolean(
    map &&
      position.x >= 0 &&
      position.x < map.width &&
      position.y >= 0 &&
      position.y < map.height &&
      map.tiles[position.y]?.[position.x] !== "wall" &&
      map.tiles[position.y]?.[position.x] !== undefined,
  );
}

function livePlayers(room: GameRoom): Array<[string, RoomPlayer]> {
  return [...room.players.entries()].filter(([, player]) => player.alive);
}

function snapshot(room: GameRoom, includeMap: boolean) {
  return {
    tick: room.tick,
    floor: room.floor,
    ...(includeMap ? { map: room.map } : {}),
    players: [...room.players.entries()].map(([id, player]) => ({
      id,
      name: player.name,
      pos: player.entity.pos,
      hp: player.entity.hp,
      maxHp: player.entity.maxHp,
      level: player.entity.level,
      alive: player.alive,
      kills: player.kills,
    })),
    enemies: room.enemies.map(({ id, pos, hp, maxHp, level }) => ({ id, pos, hp, maxHp, level })),
  };
}

function movePlayers(room: GameRoom): boolean {
  let changedFloor = false;
  for (const player of room.players.values()) {
    if (!player.alive) continue;
    const intent = player.pendingInput;
    player.pendingInput = undefined;
    if (!intent || intent.type === "wait") continue;

    const direction = DIRECTIONS[intent.dir];
    const destination = {
      x: player.entity.pos.x + direction.x,
      y: player.entity.pos.y + direction.y,
    };
    if (!isWalkable(room, destination)) continue;

    const enemyIndex = room.enemies.findIndex((enemy) => enemy.hp > 0 && key(enemy.pos) === key(destination));
    if (enemyIndex >= 0) {
      const enemy = room.enemies[enemyIndex]!;
      const result = resolveAttack(player.entity, enemy, room.rng!);
      room.enemies[enemyIndex] = result.defender;
      if (result.killed) {
        room.enemies.splice(enemyIndex, 1);
        player.kills += 1;
        player.entity = applyXp(player.entity, enemy.xp);
      }
      continue;
    }

    const occupiedByPlayer = [...room.players.values()].some(
      (other) => other !== player && other.alive && key(other.entity.pos) === key(destination),
    );
    if (occupiedByPlayer) continue;

    player.entity = { ...player.entity, pos: destination };
    if (key(destination) === key(room.map!.stairs)) {
      advanceFloor(room);
      changedFloor = true;
      break;
    }
  }
  return changedFloor;
}

function findNextStep(room: GameRoom, from: Position, target: Position, blocked: Set<string>): Position | undefined {
  const queue: Position[] = [from];
  const previous = new Map<string, Position | null>([[key(from), null]]);
  const steps: Position[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (key(current) === key(target)) break;
    for (const step of steps) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      const nextKey = key(next);
      if (
        previous.has(nextKey) ||
        !isWalkable(room, next) ||
        (blocked.has(nextKey) && nextKey !== key(target))
      ) {
        continue;
      }
      previous.set(nextKey, current);
      queue.push(next);
    }
  }

  if (!previous.has(key(target))) return undefined;
  let current = target;
  let parent = previous.get(key(current));
  while (parent && key(parent) !== key(from)) {
    current = parent;
    parent = previous.get(key(current));
  }
  return parent ? current : undefined;
}

async function moveEnemies(room: GameRoom, io: Server): Promise<void> {
  for (const enemy of [...room.enemies]) {
    const targets = livePlayers(room);
    if (targets.length === 0) return;
    targets.sort(([, a], [, b]) => distance(enemy.pos, a.entity.pos) - distance(enemy.pos, b.entity.pos));
    const [targetId, target] = targets[0]!;

    if (distance(enemy.pos, target.entity.pos) === 1) {
      const result = resolveAttack(enemy, target.entity, room.rng!);
      target.entity = result.defender as Player;
      if (result.killed) {
        target.alive = false;
        target.pendingInput = undefined;
        io.to(`user:${targetId}`).emit("game:over", {
          reason: "defeated",
          floor: room.floor,
          kills: target.kills,
          level: target.entity.level,
          durationSeconds: Math.max(1, Math.floor((Date.now() - target.startedAt) / 1_000)),
        });
        await persistPlayerRun(room, targetId, target);
      }
      continue;
    }

    const blocked = new Set(room.enemies.filter((other) => other !== enemy).map((other) => key(other.pos)));
    for (const [otherId, other] of room.players) {
      if (other.alive && otherId !== targetId) blocked.add(key(other.entity.pos));
    }
    const next = findNextStep(room, enemy.pos, target.entity.pos, blocked);
    if (next && key(next) !== key(target.entity.pos)) {
      enemy.pos = next;
    }
  }
}

async function processTick(room: GameRoom, io: Server, onFinished: (roomId: string) => void): Promise<void> {
  if (room.status !== "playing" || !room.map || !room.rng) return;
  const previousFloor = room.floor;
  room.tick += 1;
  const changedFloor = movePlayers(room);
  if (!changedFloor && room.tick % 2 === 0) {
    await moveEnemies(room, io);
  }

  io.to(room.id).emit("game:state", snapshot(room, previousFloor !== room.floor));
  if (livePlayers(room).length === 0) {
    room.status = "finished";
    onFinished(room.id);
  }
}

export function startGameLoop(
  room: GameRoom,
  io: Server,
  onFinished: (roomId: string) => void,
): void {
  stopGameLoop(room.id);
  const loop: RunningLoop = {
    busy: false,
    timer: setInterval(() => {
      if (loop.busy) return;
      loop.busy = true;
      void processTick(room, io, onFinished)
        .catch((error: unknown) => console.error(`Error en tick de sala ${room.id}:`, error))
        .finally(() => {
          loop.busy = false;
        });
    }, TICK_MS),
  };
  loops.set(room.id, loop);
}

export function stopGameLoop(roomId: string): void {
  const loop = loops.get(roomId);
  if (!loop) return;
  clearInterval(loop.timer);
  loops.delete(roomId);
}
