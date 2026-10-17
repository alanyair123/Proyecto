import type { BaseEnemy, Enemy, Player } from "./entities";

export function xpToNextLevel(level: number): number {
  return Math.floor(50 * level ** 1.5);
}

export function applyXp(player: Player, xpGanada: number): Player {
  let level = player.level;
  let xp = player.xp + xpGanada;
  let maxHp = player.maxHp;
  let attack = player.attack;
  let defense = player.defense;
  let hp = player.hp;

  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
    maxHp += 10;
    attack += 2;
    defense += 1;
    hp = maxHp;
  }

  return { ...player, level, xp, maxHp, attack, defense, hp };
}

export function scaleEnemy<T extends BaseEnemy | Enemy>(base: T, floor: number): T {
  const multiplier = 1 + 0.15 * (floor - 1);
  const scaled = {
    ...base,
    hp: Math.floor(base.hp * multiplier),
    maxHp: Math.floor(base.maxHp * multiplier),
    attack: Math.floor(base.attack * multiplier),
  };

  if ("pos" in base) {
    return { ...scaled, pos: { ...base.pos } } as T;
  }

  return scaled;
}
