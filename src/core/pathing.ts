import type { GameMap, Position } from "./types";

const DIRECTIONS: Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function isWalkable(map: GameMap, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < map.width &&
    position.y >= 0 &&
    position.y < map.height &&
    map.tiles[position.y]?.[position.x] !== "wall" &&
    map.tiles[position.y]?.[position.x] !== undefined
  );
}

export function floodFill(map: GameMap, start: Position): Position[] {
  if (!isWalkable(map, start)) {
    return [];
  }

  const queue: Position[] = [{ x: start.x, y: start.y }];
  const visited = new Set<string>([`${start.x},${start.y}`]);

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (isWalkable(map, next) && !visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }

  return queue;
}

export function isFullyConnected(map: GameMap): boolean {
  const reachable = new Set(floodFill(map, map.spawn).map(({ x, y }) => `${x},${y}`));
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.tiles[y]?.[x];
      if ((tile === "floor" || tile === "stairs") && !reachable.has(`${x},${y}`)) {
        return false;
      }
    }
  }
  return true;
}
