export type Tile = "wall" | "floor" | "stairs";

export interface Position {
  x: number;
  y: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  spawn: Position;
  stairs: Position;
}
