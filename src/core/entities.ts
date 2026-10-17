import type { Position } from "./types";

export interface Player {
  id: string;
  pos: Position;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  xp: number;
}

export interface Enemy {
  id: string;
  pos: Position;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  level: number;
  /** XP granted to the player when this enemy is defeated. */
  xp: number;
}

export type BaseEnemy = Omit<Enemy, "pos">;

export const RAT: BaseEnemy = {
  id: "rat",
  hp: 18,
  maxHp: 18,
  attack: 5,
  defense: 1,
  level: 1,
  xp: 10,
};

export const SKELETON: BaseEnemy = {
  id: "skeleton",
  hp: 32,
  maxHp: 32,
  attack: 8,
  defense: 3,
  level: 2,
  xp: 22,
};

export const GUARDIAN: BaseEnemy = {
  id: "guardian",
  hp: 80,
  maxHp: 80,
  attack: 14,
  defense: 7,
  level: 4,
  xp: 60,
};

export const BASE_ENEMIES: readonly BaseEnemy[] = [RAT, SKELETON, GUARDIAN];
