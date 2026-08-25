import { describe, it, expect } from 'vitest';
import { tuning, cargo, outposts, hazards, upgrades, reviews, hq } from '../src/content';

describe('tuning.json', () => {
  it('has 5 gait speeds, ascending, starting at 0', () => {
    expect(tuning.gaitSpeed).toHaveLength(5);
    expect(tuning.gaitSpeed[0]).toBe(0);
    for (let i = 1; i < 5; i++) expect(tuning.gaitSpeed[i]!).toBeGreaterThan(tuning.gaitSpeed[i - 1]!);
  });
  it('has 5 star buckets ending at 1', () => {
    expect(tuning.starBuckets).toHaveLength(5);
    expect(tuning.starBuckets[4]).toBe(1);
  });
  it('dt is 1/60', () => { expect(tuning.dt).toBeCloseTo(1 / 60, 10); });
  it('slotPos has 3 positions', () => { expect(tuning.slotPos).toEqual([-1, 0, 1]); });
  it('reserveBudget is a fraction', () => { expect(tuning.reserveBudget).toBeGreaterThan(0); expect(tuning.reserveBudget).toBeLessThan(1); });
});

describe('content schemas', () => {
  it('cargo: 20 unique ids, sane ranges, tiers 0-3', () => {
    expect(cargo).toHaveLength(20);
    expect(new Set(cargo.map((c) => c.id)).size).toBe(20);
    for (const c of cargo) {
      expect(c.mass).toBeGreaterThan(0); expect(c.mass).toBeLessThanOrEqual(3);
      expect(c.tolerance).toBeGreaterThan(0); expect(c.tolerance).toBeLessThan(1);
      expect(c.crushLimit).toBeGreaterThan(30); expect(c.crushLimit).toBeLessThanOrEqual(100);
      expect(['static', 'slosh', 'livestock', 'precarious']).toContain(c.behavior);
      expect(c.tier).toBeGreaterThanOrEqual(0); expect(c.tier).toBeLessThanOrEqual(3);
      if (c.rush !== undefined) expect(c.rush).toBeGreaterThan(20);
    }
    expect(cargo.filter((c) => c.tier === 0).length).toBeGreaterThanOrEqual(3);
  });
  it('outposts: 12 unique seeds, 3 per tier, lengths ascend with tier', () => {
    expect(outposts).toHaveLength(12);
    expect(new Set(outposts.map((o) => o.seed)).size).toBe(12);
    for (let t = 0; t < 4; t++) expect(outposts.filter((o) => o.tier === t)).toHaveLength(3);
  });
  it('hazards: 9 distinct types with a counter line', () => {
    expect(new Set(hazards.map((h) => h.type)).size).toBe(9);
    for (const h of hazards) { expect(h.counter.length).toBeGreaterThan(10); expect(h.telegraphM).toBeGreaterThan(0); }
  });
  it('upgrades: exactly 6, unique effect keys', () => {
    expect(upgrades).toHaveLength(6);
    expect(new Set(upgrades.map((u) => u.effect.key)).size).toBe(6);
  });
  it('reviews cover every star with an "any" entry; hq covers every context', () => {
    for (const s of [1, 2, 3, 4, 5]) expect(reviews.some((r) => r.stars === s && r.behavior === 'any' && r.lines.length > 0)).toBe(true);
    for (const c of ['dispatch', 'arrival', 'spill', 'stall']) expect(hq.some((h) => h.context === c && h.behavior === 'any')).toBe(true);
  });
});
