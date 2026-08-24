import { describe, it, expect } from 'vitest';
import { mulberry32, hashSeed } from '../src/sim/rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(4417), b = mulberry32(4417);
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).toEqual(sb);
  });
  it('differs across seeds', () => {
    expect(mulberry32(1).next()).not.toBe(mulberry32(2).next());
  });
  it('stays in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('gaussian has ~0 mean and ~1 sd', () => {
    const r = mulberry32(99); let s = 0, s2 = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const g = r.gaussian(); s += g; s2 += g * g; }
    const mean = s / n, sd = Math.sqrt(s2 / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
  it('int(n) is in [0,n)', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 200; i++) { const v = r.int(6); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(6); expect(Number.isInteger(v)).toBe(true); }
  });
});

describe('hashSeed', () => {
  it('is stable and order-sensitive', () => {
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2));
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  });
});
