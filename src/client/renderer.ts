import type { GameMap, Position } from "@/core/types";

const SOURCE_TILE_SIZE = 32;

export interface RenderPlayer {
  id: string;
  name: string;
  pos: Position;
  hp: number;
  maxHp: number;
  level: number;
  alive: boolean;
  kills: number;
}

export interface RenderEnemy {
  id: string;
  pos: Position;
  hp: number;
  maxHp: number;
  level: number;
}

export interface RenderFrame {
  map?: GameMap;
  floor: number;
  players: RenderPlayer[];
  enemies: RenderEnemy[];
  localPlayerId: string;
  interpolatedPosition?: Position;
  interpolatedPositions?: Map<string, Position>;
}

export interface GameRenderer {
  render(frame: RenderFrame): void;
  resize(): void;
  destroy(): void;
}

export function createGameRenderer(canvas: HTMLCanvasElement, container: HTMLElement): GameRenderer {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo crear el canvas 2D");
  const ctx: CanvasRenderingContext2D = context;

  const mapCanvas = document.createElement("canvas");
  const mapContext = mapCanvas.getContext("2d");
  if (!mapContext) throw new Error("El navegador no pudo crear el canvas del mapa");
  const mapCtx: CanvasRenderingContext2D = mapContext;

  let mapCache: GameMap | undefined;
  let cachedFloor = -1;
  let width = 0;
  let height = 0;
  let cellSize = 16;

  function drawMapOnce(map: GameMap, floor: number): void {
    if (cachedFloor === floor && mapCache === map) return;
    mapCache = map;
    cachedFloor = floor;
    mapCanvas.width = map.width * SOURCE_TILE_SIZE;
    mapCanvas.height = map.height * SOURCE_TILE_SIZE;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const tile = map.tiles[y]?.[x];
        mapCtx.fillStyle = tile === "wall" ? "#171b24" : tile === "stairs" ? "#facc15" : "#777d87";
        mapCtx.fillRect(x * SOURCE_TILE_SIZE, y * SOURCE_TILE_SIZE, SOURCE_TILE_SIZE, SOURCE_TILE_SIZE);
      }
    }
  }

  function resize(): void {
    const bounds = container.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    cellSize = Math.max(1, Math.min(40, width / 15));
  }

  function render(frame: RenderFrame): void {
    if (frame.map) drawMapOnce(frame.map, frame.floor);
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, width, height);

    const localPlayer = frame.players.find((player) => player.id === frame.localPlayerId);
    if (!mapCache || !localPlayer) return;
    const camera = frame.interpolatedPositions?.get(localPlayer.id) ?? frame.interpolatedPosition ?? localPlayer.pos;
    const visibleTilesWide = width / cellSize;
    const visibleTilesHigh = height / cellSize;
    const sourceX = (camera.x + 0.5 - visibleTilesWide / 2) * SOURCE_TILE_SIZE;
    const sourceY = (camera.y + 0.5 - visibleTilesHigh / 2) * SOURCE_TILE_SIZE;
    const sourceWidth = visibleTilesWide * SOURCE_TILE_SIZE;
    const sourceHeight = visibleTilesHigh * SOURCE_TILE_SIZE;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mapCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

    const cameraLeft = camera.x + 0.5 - visibleTilesWide / 2;
    const cameraTop = camera.y + 0.5 - visibleTilesHigh / 2;
    const drawEntity = (position: Position, color: string, radius: number): void => {
      const x = (position.x + 0.5 - cameraLeft) * cellSize;
      const y = (position.y + 0.5 - cameraTop) * cellSize;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const enemy of frame.enemies) {
      drawEntity(frame.interpolatedPositions?.get(enemy.id) ?? enemy.pos, "#ef4444", cellSize * 0.3);
    }
    for (const player of frame.players) {
      if (!player.alive) continue;
      const position = frame.interpolatedPositions?.get(player.id) ?? player.pos;
      drawEntity(position, player.id === frame.localPlayerId ? "#22d3ee" : "#22c55e", cellSize * 0.32);
    }

    const healthRatio = Math.max(0, Math.min(1, localPlayer.hp / localPlayer.maxHp));
    ctx.fillStyle = "rgba(8, 12, 20, 0.82)";
    ctx.fillRect(12, 12, 220, 68);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(`Nivel ${localPlayer.level}   Piso ${frame.floor}`, 22, 34);
    ctx.fillStyle = "#374151";
    ctx.fillRect(22, 48, 190, 12);
    ctx.fillStyle = healthRatio > 0.3 ? "#22c55e" : "#ef4444";
    ctx.fillRect(22, 48, 190 * healthRatio, 12);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`${Math.max(0, localPlayer.hp)} / ${localPlayer.maxHp} vida`, 22, 74);
  }

  resize();
  return {
    render,
    resize,
    destroy() {
      mapCache = undefined;
      mapCanvas.width = 0;
      mapCanvas.height = 0;
    },
  };
}
