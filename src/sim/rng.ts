export interface Rng {
  next(): number;      // [0,1)
  gaussian(): number;  // ~N(0,1), sum of 12 uniforms − 6 (no log/sqrt)
  int(n: number): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    gaussian() { let s = 0; for (let i = 0; i < 12; i++) s += next(); return s - 6; },
    int(n) { return Math.floor(next() * n); },
  };
}

/** FNV-1a over 32-bit parts. Order-sensitive. */
export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) { h ^= p >>> 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
