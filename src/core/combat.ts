import type { Enemy, Player } from "./entities";
import type { Rng } from "./rng";

type Combatant = Pick<Player, "hp" | "attack" | "defense">;

export interface AttackResult {
  damage: number;
  critical: boolean;
}

export interface ResolveAttackResult<T extends Player | Enemy> extends AttackResult {
  defender: T;
  killed: boolean;
}

export function calculateDamage(
  attacker: Combatant,
  defender: Combatant,
  rng: Rng,
): AttackResult {
  const baseDamage = Math.max(1, attacker.attack - Math.floor(defender.defense / 2));
  const critical = rng.next() < 0.1;
  return {
    damage: critical ? Math.floor(baseDamage * 1.5) : baseDamage,
    critical,
  };
}

export function resolveAttack<T extends Player | Enemy>(
  attacker: Combatant,
  defender: T,
  rng: Rng,
): ResolveAttackResult<T> {
  const { damage, critical } = calculateDamage(attacker, defender, rng);
  const updatedDefender = { ...defender, hp: Math.max(0, defender.hp - damage) };
  return {
    defender: updatedDefender,
    damage,
    critical,
    killed: updatedDefender.hp === 0,
  };
}
