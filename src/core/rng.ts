export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  return {
    next,
    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError("int requiere enteros y max >= min");
      }

      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(arr: T[]): T {
      if (arr.length === 0) {
        throw new RangeError("pick requiere un arreglo no vacío");
      }

      return arr[Math.floor(next() * arr.length)] as T;
    },
  };
}
