import { describe, expect, it } from "vitest";
import { calculateDamage } from "@/core/combat";
import { RAT, type Enemy, type Player } from "@/core/entities";
import { generateMap } from "@/core/mapgen";
import { isFullyConnected } from "@/core/pathing";
import { applyXp, scaleEnemy, xpToNextLevel } from "@/core/progression";
import type { Rng } from "@/core/rng";
import { ClientInputSchema, GameRunSchema, InventorySchema } from "@/core/schemas";

const samplePlayer: Player = {
  id: "jugador-1",
  pos: { x: 2, y: 2 },
  hp: 7,
  maxHp: 30,
  attack: 6,
  defense: 2,
  level: 1,
  xp: 0,
};

const sampleEnemy: Enemy = {
  id: "enemigo-1",
  pos: { x: 3, y: 2 },
  hp: 20,
  maxHp: 20,
  attack: 5,
  defense: 100,
  level: 1,
  xp: 10,
};

function rngAlways(value: number): Rng {
  return {
    next: () => value,
    int: (min) => min,
    pick: (items) => items[0] as never,
  };
}

describe("Generación y conectividad de mapas", () => {
  it("la misma semilla produce exactamente el mismo mapa", () => {
    expect(generateMap(12345)).toEqual(generateMap(12345));
  });

  it("semillas distintas producen mapas distintos", () => {
    expect(generateMap(12345)).not.toEqual(generateMap(54321));
  });

  it("isFullyConnected es true para 50 semillas distintas", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(isFullyConnected(generateMap(seed))).toBe(true);
    }
  });

  it("el spawn y la escalera son casillas transitables", () => {
    const map = generateMap(741);
    expect(map.tiles[map.spawn.y]?.[map.spawn.x]).not.toBe("wall");
    expect(map.tiles[map.stairs.y]?.[map.stairs.x]).not.toBe("wall");
  });

  it("todo el borde del mapa es pared", () => {
    const map = generateMap(852);
    for (let x = 0; x < map.width; x += 1) {
      expect(map.tiles[0]?.[x]).toBe("wall");
      expect(map.tiles[map.height - 1]?.[x]).toBe("wall");
    }
    for (let y = 0; y < map.height; y += 1) {
      expect(map.tiles[y]?.[0]).toBe("wall");
      expect(map.tiles[y]?.[map.width - 1]).toBe("wall");
    }
  });

  it("ninguna habitación se sale del mapa ni se encima con otra", () => {
    const map = generateMap(963);
    for (const room of map.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(1);
      expect(room.y).toBeGreaterThanOrEqual(1);
      expect(room.x + room.w).toBeLessThanOrEqual(map.width - 1);
      expect(room.y + room.h).toBeLessThanOrEqual(map.height - 1);
    }
    for (let first = 0; first < map.rooms.length; first += 1) {
      for (let second = first + 1; second < map.rooms.length; second += 1) {
        const a = map.rooms[first]!;
        const b = map.rooms[second]!;
        const overlaps =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe("Reglas matemáticas", () => {
  it("xpToNextLevel devuelve 50 para nivel 1 y 400 para nivel 4", () => {
    expect(xpToNextLevel(1)).toBe(50);
    expect(xpToNextLevel(4)).toBe(400);
  });

  it("applyXp sube un nivel, aumenta estadísticas y cura por completo", () => {
    const result = applyXp(samplePlayer, 50);
    expect(result).toEqual({
      ...samplePlayer,
      level: 2,
      xp: 0,
      maxHp: 40,
      hp: 40,
      attack: 8,
      defense: 3,
    });
    expect(samplePlayer.level).toBe(1);
    expect(samplePlayer.hp).toBe(7);
  });

  it("applyXp sube varios niveles de golpe con mucha experiencia", () => {
    const xp = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3);
    const result = applyXp(samplePlayer, xp);
    expect(result.level).toBe(4);
    expect(result.maxHp).toBe(60);
    expect(result.hp).toBe(60);
    expect(result.attack).toBe(12);
    expect(result.defense).toBe(5);
    expect(result.xp).toBe(0);
  });

  it("calculateDamage nunca es menor a 1 aunque la defensa sea enorme", () => {
    const result = calculateDamage(
      { attack: 1, defense: 0, hp: 10 },
      { attack: 1, defense: 1_000_000, hp: 10 },
      rngAlways(0.5),
    );
    expect(result.damage).toBe(1);
  });

  it("un RNG de 0.05 da crítico y uno de 0.5 no da crítico", () => {
    const lowRoll = calculateDamage(samplePlayer, sampleEnemy, rngAlways(0.05));
    const normalRoll = calculateDamage(samplePlayer, sampleEnemy, rngAlways(0.5));
    expect(lowRoll.critical).toBe(true);
    expect(normalRoll.critical).toBe(false);
  });

  it("scaleEnemy conserva estadísticas en piso 1 y las aumenta 60% en piso 5", () => {
    const enemy: Enemy = {
      ...RAT,
      pos: { x: 1, y: 1 },
      hp: 100,
      maxHp: 100,
      attack: 50,
    };
    expect(scaleEnemy(enemy, 1)).toEqual(enemy);
    expect(scaleEnemy(enemy, 5)).toMatchObject({ hp: 160, maxHp: 160, attack: 80 });
  });
});

describe("Validación con Zod", () => {
  it("ClientInputSchema rechaza una dirección de movimiento inválida", () => {
    expect(ClientInputSchema.safeParse({ type: "move", dir: "teleport" }).success).toBe(false);
  });

  it("ClientInputSchema rechaza que el cliente envíe una posición extra", () => {
    expect(ClientInputSchema.safeParse({ type: "move", dir: "up", x: 5, y: 5 }).success).toBe(false);
  });

  it("GameRunSchema rechaza nivel 0 y acepta un registro válido", () => {
    const validRun = {
      levelReached: 1,
      enemiesKilled: 0,
      durationSeconds: 60,
      inventory: [],
      mode: "solo",
    };
    expect(GameRunSchema.safeParse({ ...validRun, levelReached: 0 }).success).toBe(false);
    expect(GameRunSchema.safeParse(validRun).success).toBe(true);
  });

  it("InventorySchema rechaza un inventario de 21 elementos", () => {
    const inventory = Array.from({ length: 21 }, (_, index) => ({ itemId: `item-${index}`, qty: 1 }));
    expect(InventorySchema.safeParse(inventory).success).toBe(false);
  });
});
