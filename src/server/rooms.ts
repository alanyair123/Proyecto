import { randomInt, randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { ClientInputSchema, CreateLobbySchema, JoinLobbySchema, ReadySchema } from "@/core/schemas";
import type { Enemy, Player } from "@/core/entities";
import type { GameMap } from "@/core/types";
import { persistPlayerRun } from "./persistence";
import { startGameLoop, stopGameLoop } from "./gameLoop";
import { createFloor, createPlayerEntity } from "./world";

export type RoomMode = "solo" | "multi";
export type RoomStatus = "waiting" | "playing" | "finished";

export interface RoomPlayer {
  name: string;
  ready: boolean;
  entity: Player;
  pendingInput?: { type: "move"; dir: "up" | "down" | "left" | "right" } | { type: "wait" };
  alive: boolean;
  kills: number;
  startedAt: number;
  persisted?: boolean;
}

export interface GameRoom {
  id: string;
  name: string;
  maxPlayers: number;
  mode: RoomMode;
  status: RoomStatus;
  players: Map<string, RoomPlayer>;
  map: GameMap | null;
  enemies: Enemy[];
  floor: number;
  tick: number;
  seed?: number;
  rng?: import("@/core/rng").Rng;
  private: boolean;
}

interface AuthenticatedUser {
  id: string;
  name: string;
}

interface SocketData {
  user?: AuthenticatedUser;
  activeRoomId?: string;
}

type GameSocket = Socket & { data: SocketData };

export const rooms = new Map<string, GameRoom>();
const EmptyPayloadSchema = z.union([z.undefined(), z.object({}).strict()]);

function sendError(socket: GameSocket, message: string): void {
  socket.emit("error", { message });
}

function lobbySnapshot(room: GameRoom) {
  return {
    id: room.id,
    name: room.name,
    maxPlayers: room.maxPlayers,
    mode: room.mode,
    status: room.status,
    players: [...room.players.entries()].map(([id, player]) => ({
      id,
      name: player.name,
      ready: player.ready,
      alive: player.alive,
    })),
  };
}

function emitLobbyUpdate(io: Server, room: GameRoom): void {
  io.to(room.id).emit("lobby:update", lobbySnapshot(room));
}

function attachPlayer(room: GameRoom, user: AuthenticatedUser): RoomPlayer {
  const entity = createPlayerEntity(user.id, { x: 0, y: 0 });
  const player: RoomPlayer = {
    name: user.name,
    ready: false,
    entity,
    alive: true,
    kills: 0,
    startedAt: Date.now(),
  };
  room.players.set(user.id, player);
  return player;
}

function makeRoom(name: string, maxPlayers: number, mode: RoomMode, isPrivate: boolean): GameRoom {
  const room: GameRoom = {
    id: randomUUID(),
    name,
    maxPlayers,
    mode,
    status: "waiting",
    players: new Map(),
    map: null,
    enemies: [],
    floor: 1,
    tick: 0,
    private: isPrivate,
  };
  rooms.set(room.id, room);
  return room;
}

function emitGameStart(io: Server, room: GameRoom): void {
  const seed = randomSeed();
  room.seed = seed;
  room.floor = 1;
  room.tick = 0;
  room.status = "playing";
  for (const player of room.players.values()) {
    player.startedAt = Date.now();
  }
  createFloor(room, seed);
  const start = {
    roomId: room.id,
    seed,
    floor: room.floor,
    map: room.map,
    players: [...room.players.entries()].map(([id, player]) => ({ id, name: player.name, entity: player.entity })),
    enemies: room.enemies,
  };
  io.to(room.id).emit("game:start", start);
  startGameLoop(room, io, () => removeRoom(room.id));
}

function randomSeed(): number {
  return randomInt(0, 2_147_483_648);
}

export function removeRoom(roomId: string): void {
  stopGameLoop(roomId);
  rooms.delete(roomId);
}

export async function leaveRoom(
  room: GameRoom,
  userId: string,
  io: Server,
  reason: "left" | "disconnected",
): Promise<void> {
  const player = room.players.get(userId);
  if (!player) return;

  if (room.status === "waiting") {
    room.players.delete(userId);
    if (room.players.size === 0) {
      removeRoom(room.id);
    } else {
      emitLobbyUpdate(io, room);
    }
    return;
  }

  if (room.status === "playing" && player.alive) {
    player.alive = false;
    player.pendingInput = undefined;
    await persistPlayerRun(room, userId, player);
    if (reason === "left") {
      io.to(`user:${userId}`).emit("game:over", {
        reason,
        floor: room.floor,
        kills: player.kills,
        level: player.entity.level,
        durationSeconds: Math.max(1, Math.floor((Date.now() - player.startedAt) / 1_000)),
      });
    }
    emitLobbyUpdate(io, room);
    if (![...room.players.values()].some((candidate) => candidate.alive)) {
      room.status = "finished";
      removeRoom(room.id);
    }
  }
}

function getSocketUser(socket: GameSocket): AuthenticatedUser | undefined {
  return socket.data.user;
}

function hasActiveRoom(socket: GameSocket): boolean {
  return Boolean(socket.data.activeRoomId && rooms.has(socket.data.activeRoomId));
}

function isEmptyPayload(payload: unknown): boolean {
  return EmptyPayloadSchema.safeParse(payload).success;
}

function enterRoom(socket: GameSocket, room: GameRoom): void {
  socket.data.activeRoomId = room.id;
  void socket.join(room.id);
}

export function registerRoomHandlers(io: Server): void {
  io.on("connection", (rawSocket) => {
    const socket = rawSocket as GameSocket;
    const user = getSocketUser(socket);
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.on("lobby:list", (payload: unknown) => {
      if (!isEmptyPayload(payload)) {
        sendError(socket, "Payload inválido para lobby:list");
        return;
      }
      socket.emit("lobby:list", [...rooms.values()]
        .filter((room) => !room.private && room.status === "waiting" && room.mode === "multi")
        .map(lobbySnapshot));
    });

    socket.on("lobby:create", (payload: unknown) => {
      const parsed = CreateLobbySchema.safeParse(payload);
      if (!parsed.success) {
        sendError(socket, "Datos inválidos para crear la sala");
        return;
      }
      if (hasActiveRoom(socket)) {
        sendError(socket, "Ya estás en una sala");
        return;
      }
      const room = makeRoom(parsed.data.name, parsed.data.maxPlayers, "multi", false);
      attachPlayer(room, user);
      enterRoom(socket, room);
      emitLobbyUpdate(io, room);
    });

    socket.on("game:solo", (payload: unknown) => {
      if (!isEmptyPayload(payload)) {
        sendError(socket, "Payload inválido para game:solo");
        return;
      }
      if (hasActiveRoom(socket)) {
        sendError(socket, "Ya estás en una sala");
        return;
      }
      const room = makeRoom(`Partida de ${user.name}`, 1, "solo", true);
      attachPlayer(room, user);
      enterRoom(socket, room);
      emitGameStart(io, room);
    });

    socket.on("lobby:join", (payload: unknown) => {
      const parsed = JoinLobbySchema.safeParse(payload);
      if (!parsed.success) {
        sendError(socket, "Datos inválidos para unirse a la sala");
        return;
      }
      if (hasActiveRoom(socket)) {
        sendError(socket, "Ya estás en una sala");
        return;
      }
      const room = rooms.get(parsed.data.lobbyId);
      if (
        !room || room.private || room.status !== "waiting" || room.players.size >= room.maxPlayers
      ) {
        sendError(socket, "La sala no existe o está llena");
        return;
      }
      if (room.players.has(user.id)) {
        sendError(socket, "Ya estás en esta sala");
        return;
      }
      attachPlayer(room, user);
      enterRoom(socket, room);
      emitLobbyUpdate(io, room);
    });

    socket.on("lobby:ready", (payload: unknown) => {
      const parsed = ReadySchema.safeParse(payload);
      if (!parsed.success) {
        sendError(socket, "Datos inválidos para cambiar ready");
        return;
      }
      const room = socket.data.activeRoomId ? rooms.get(socket.data.activeRoomId) : undefined;
      const player = room?.players.get(user.id);
      if (!room || room.status !== "waiting" || !player) {
        sendError(socket, "No estás en una sala esperando jugadores");
        return;
      }
      player.ready = parsed.data.ready;
      emitLobbyUpdate(io, room);
      if (room.players.size > 0 && [...room.players.values()].every((candidate) => candidate.ready)) {
        emitGameStart(io, room);
      }
    });

    socket.on("lobby:leave", async (payload: unknown) => {
      const parsed = JoinLobbySchema.safeParse(payload);
      if (!parsed.success) {
        sendError(socket, "Datos inválidos para salir de la sala");
        return;
      }
      const room = rooms.get(parsed.data.lobbyId);
      if (!room || !room.players.has(user.id) || socket.data.activeRoomId !== room.id) {
        sendError(socket, "No estás en esa sala");
        return;
      }
      await leaveRoom(room, user.id, io, "left");
      socket.data.activeRoomId = undefined;
      await socket.leave(room.id);
    });

    socket.on("game:input", (payload: unknown) => {
      const parsed = ClientInputSchema.safeParse(payload);
      if (!parsed.success) {
        sendError(socket, "Entrada de juego inválida");
        return;
      }
      const room = socket.data.activeRoomId ? rooms.get(socket.data.activeRoomId) : undefined;
      const player = room?.players.get(user.id);
      if (!room || room.status !== "playing" || !player?.alive) {
        sendError(socket, "No tienes una partida activa");
        return;
      }
      player.pendingInput = parsed.data;
    });

    socket.on("disconnect", async () => {
      console.log(`Socket.io desconectado: ${socket.id}`);
      const roomId = socket.data.activeRoomId;
      const room = roomId ? rooms.get(roomId) : undefined;
      if (room) {
        await leaveRoom(room, user.id, io, "disconnected");
      }
    });
  });
}
