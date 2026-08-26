import { describe, it, expect } from 'vitest';
import { cargoDifficulty, generateOffers, playerTier } from '../src/game/orders';
import { pickReview, pickHq } from '../src/game/reviews';
import { predictTrim } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { cargo, outposts, reviews, hq, tuning } from '../src/content';
import { crateDef } from './helpers';

describe('playerTier', () => {
  it('steps every 3 runs, caps at 3', () => {
    expect(playerTier(0)).toBe(0); expect(playerTier(2)).toBe(0); expect(playerTier(3)).toBe(1); expect(playerTier(9)).toBe(3); expect(playerTier(40)).toBe(3);
  });
});

describe('cargoDifficulty', () => {
  it('reads a sealed crate as easy and a rushed precarious sculpture as hard', () => {
    expect(cargoDifficulty(cargo.find((c) => c.id === 'crate')!, tuning)).toBe('easy');
    expect(cargoDifficulty(cargo.find((c) => c.id === 'swan')!, tuning)).toBe('hard');
    expect(cargoDifficulty(cargo.find((c) => c.id === 'soup')!, tuning)).toBe('medium');
  });
});

describe('generateOffers', () => {
  it('offers 3 distinct cargo within tier and rotates outposts within tier', () => {
    const a = generateOffers(outposts, cargo, 0, mulberry32(1), tuning);
    const b = generateOffers(outposts, cargo, 1, mulberry32(1), tuning);
    expect(a.cargo).toHaveLength(3);
    expect(new Set(a.cargo.map((c) => c.id)).size).toBe(3);
    for (const c of a.cargo) expect(c.tier).toBe(0);
    expect(a.outpost.tier).toBe(0);
    expect(a.outpost.id).not.toBe(b.outpost.id);
  });
  it('always carries at least one easy haul', () => {
    for (let runs = 0; runs < 30; runs++) {
      const o = generateOffers(outposts, cargo, runs, mulberry32(runs + 1), tuning);
      const kinds = o.cargo.map((c) => cargoDifficulty(c, tuning));
      expect(kinds, `runs ${runs}`).toContain('easy');
    }
  });
  it('is deterministic for a given rng', () => {
    expect(generateOffers(outposts, cargo, 5, mulberry32(9), tuning)).toEqual(generateOffers(outposts, cargo, 5, mulberry32(9), tuning));
  });
  it('unlocks higher tiers with runs', () => {
    const o = generateOffers(outposts, cargo, 11, mulberry32(2), tuning);
    expect(o.outpost.tier).toBeLessThanOrEqual(3);
    const seen = new Set<number>();
    for (let r = 9; r < 21; r++) seen.add(generateOffers(outposts, cargo, r, mulberry32(r), tuning).outpost.tier);
    expect(seen.has(3)).toBe(true);
  });
});

describe('pickers', () => {
  it('review comes from the right star bucket', () => {
    for (let i = 0; i < 20; i++) {
      const line = pickReview(reviews, 5, 'slosh', mulberry32(i));
      const ok = reviews.filter((r) => r.stars === 5).some((r) => r.lines.includes(line));
      expect(ok).toBe(true);
    }
  });
  it('hq line matches context', () => {
    const line = pickHq(hq, 'spill', 'any', mulberry32(3));
    expect(hq.find((h) => h.context === 'spill')!.lines).toContain(line);
  });
});

describe('predictTrim', () => {
  it('is 0 for balanced fore/aft and positive for a fore-only load', () => {
    expect(predictTrim([{ def: crateDef(), slot: 0 }, { def: crateDef({ id: 'b' }), slot: 2 }], tuning)).toBe(0);
    expect(predictTrim([{ def: crateDef(), slot: 0 }], tuning)).toBe(Math.round(tuning.kLoad / tuning.kBallast * 100));
  });
});
