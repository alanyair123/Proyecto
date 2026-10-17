import { createRng } from "./rng";
import type { GameMap, Position, Room, Tile } from "./types";

const MIN_ROOM_SIZE = 4;
const MAX_ROOM_WIDTH = 10;
const MAX_ROOM_HEIGHT = 8;

function overlaps(a: Room, b: Room): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function roomCenter(room: Room): Position {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
}

function carveHorizontal(tiles: Tile[][], y: number, fromX: number, toX: number): void {
  for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x += 1) {
    tiles[y]![x] = "floor";
  }
}

function carveVertical(tiles: Tile[][], x: number, fromY: number, toY: number): void {
  for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y += 1) {
    tiles[y]![x] = "floor";
  }
}

export function generateMap(
  seed: number,
  width = 60,
  height = 40,
  maxRooms = 12,
): GameMap {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_ROOM_SIZE + 2 ||
    height < MIN_ROOM_SIZE + 2 ||
    (width - 2) * (height - 2) < MIN_ROOM_SIZE * MIN_ROOM_SIZE * 2
  ) {
    throw new RangeError("El mapa debe tener espacio interior suficiente para dos habitaciones de 4x4 y un borde de pared");
  }
  if (!Number.isInteger(maxRooms) || maxRooms < 2) {
    throw new RangeError("maxRooms debe ser un entero mayor o igual a 2");
  }

  const rng = createRng(seed);
  const tiles: Tile[][] = Array.from({ length: height }, () => Array<Tile>(width).fill("wall"));
  const rooms: Room[] = [];
  const maxWidth = Math.min(MAX_ROOM_WIDTH, width - 2);
  const maxHeight = Math.min(MAX_ROOM_HEIGHT, height - 2);
  const targetRooms = Math.min(maxRooms, Math.floor(((width - 2) * (height - 2)) / (MIN_ROOM_SIZE * MIN_ROOM_SIZE)));
  const attempts = Math.max(200, targetRooms * 100);

  for (let attempt = 0; attempt < attempts && rooms.length < targetRooms; attempt += 1) {
    const room: Room = {
      x: rng.int(1, width - MIN_ROOM_SIZE - 1),
      y: rng.int(1, height - MIN_ROOM_SIZE - 1),
      w: rng.int(MIN_ROOM_SIZE, maxWidth),
      h: rng.int(MIN_ROOM_SIZE, maxHeight),
    };
    room.x = Math.min(room.x, width - room.w - 1);
    room.y = Math.min(room.y, height - room.h - 1);

    if (rooms.some((existing) => overlaps(existing, room))) {
      continue;
    }

    rooms.push(room);
  }

  // Guaranteed fallback for the required pair of rooms if random attempts collide.
  for (let y = 1; y <= height - MIN_ROOM_SIZE - 1 && rooms.length < 2; y += 1) {
    for (let x = 1; x <= width - MIN_ROOM_SIZE - 1 && rooms.length < 2; x += 1) {
      const room: Room = { x, y, w: MIN_ROOM_SIZE, h: MIN_ROOM_SIZE };
      if (!rooms.some((existing) => overlaps(existing, room))) {
        rooms.push(room);
      }
    }
  }

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) {
        tiles[y]![x] = "floor";
      }
    }
  }

  for (let index = 1; index < rooms.length; index += 1) {
    const previous = roomCenter(rooms[index - 1]!);
    const current = roomCenter(rooms[index]!);
    if (rng.int(0, 1) === 0) {
      carveHorizontal(tiles, previous.y, previous.x, current.x);
      carveVertical(tiles, current.x, previous.y, current.y);
    } else {
      carveVertical(tiles, previous.x, previous.y, current.y);
      carveHorizontal(tiles, current.y, previous.x, current.x);
    }
  }

  const spawn = roomCenter(rooms[0]!);
  const stairs = roomCenter(rooms[rooms.length - 1]!);
  tiles[stairs.y]![stairs.x] = "stairs";

  return { width, height, tiles, rooms, spawn, stairs };
}
