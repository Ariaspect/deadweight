import { describe, it, expect } from 'vitest';
import { generateRoute, routeFromSegments } from '../src/sim/terrain';
import { tuning } from '../src/content';
import type { HazardDef } from '../src/sim/types';

const hz: HazardDef[] = [
  { type: 'gust', impulse: 0.9, strapJolt: 10, telegraphM: 25, counter: 'strap', weight: 0.5, minTier: 0 },
  { type: 'grade', impulse: 0, strapJolt: 0, telegraphM: 30, counter: 'ballast', weight: 0.5, minTier: 0 },
];

describe('routeFromSegments', () => {
  it('interpolates height and returns segment slope', () => {
    const r = routeFromSegments(1, [{ x0: 0, x1: 100, slope: 0.2, y0: 0 }, { x0: 100, x1: 200, slope: -0.1, y0: 20 }], [], 10);
    expect(r.heightAt(50)).toBeCloseTo(10);
    expect(r.heightAt(150)).toBeCloseTo(15);
    expect(r.slopeAt(50)).toBe(0.2);
    expect(r.slopeAt(150)).toBe(-0.1);
    expect(r.slopeAt(-5)).toBe(0.2);
    expect(r.slopeAt(999)).toBe(-0.1);
  });
  it('samples slopeProfile every profileStepM', () => {
    const r = routeFromSegments(1, [{ x0: 0, x1: 100, slope: 0.2, y0: 0 }], [], 10);
    expect(r.slopeProfile).toHaveLength(11);
    expect(r.slopeProfile.every((s) => s === 0.2)).toBe(true);
  });
});

describe('generateRoute', () => {
  it('is deterministic per seed', () => {
    const a = generateRoute(4417, 600, 0, hz, tuning.terrain);
    const b = generateRoute(4417, 600, 0, hz, tuning.terrain);
    expect(a.segments).toEqual(b.segments);
    expect(a.hazards).toEqual(b.hazards);
  });
  it('differs per seed', () => {
    const a = generateRoute(1, 600, 0, hz, tuning.terrain);
    const b = generateRoute(2, 600, 0, hz, tuning.terrain);
    expect(a.segments).not.toEqual(b.segments);
  });
  it('builds a winding route with optional off-road discoveries', () => {
    const r = generateRoute(4417, 700, 2, hz, tuning.terrain);
    expect(r.centerAt(0)).toBe(0); expect(r.centerAt(r.length)).toBe(0);
    expect(r.segments.some((s) => Math.abs(s.z1 ?? 0) > 0.5)).toBe(true);
    expect(r.discoveries).toHaveLength(5);
    for (const d of r.discoveries) expect(Math.abs(d.z)).toBeGreaterThanOrEqual(tuning.terrain.corridorHalfWidth - 3 - 1e-9);
  });
  it('covers exactly [0, length] with contiguous segments', () => {
    const r = generateRoute(5, 600, 1, hz, tuning.terrain);
    expect(r.segments[0]!.x0).toBe(0);
    expect(r.segments[r.segments.length - 1]!.x1).toBe(600);
    for (let i = 1; i < r.segments.length; i++) expect(r.segments[i]!.x0).toBe(r.segments[i - 1]!.x1);
  });
  it('is flat in the safe start and end zones and slopes are clamped', () => {
    const t = tuning.terrain;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generateRoute(seed, 600, 3, hz, t);
      expect(r.slopeAt(t.safeStartM / 2)).toBe(0);
      expect(r.slopeAt(600 - t.safeEndM / 2)).toBe(0);
      for (const s of r.segments) expect(Math.abs(s.slope)).toBeLessThanOrEqual(t.maxSlope);
    }
  });
  it('keeps hazards sorted, outside safe zones, and honours minTier', () => {
    const t = tuning.terrain;
    const gated: HazardDef[] = [{ ...hz[0]!, minTier: 2 }];
    for (const seed of [11, 12, 13]) {
      const r = generateRoute(seed, 800, 3, hz, t);
      for (let i = 1; i < r.hazards.length; i++) expect(r.hazards[i]!.x).toBeGreaterThanOrEqual(r.hazards[i - 1]!.x);
      for (const h of r.hazards) { expect(h.x).toBeGreaterThanOrEqual(t.safeStartM); expect(h.x).toBeLessThanOrEqual(800 - t.safeEndM); }
      expect(generateRoute(seed, 800, 0, gated, t).hazards).toHaveLength(0);
    }
  });
  it('grade hazards sit on a steep segment', () => {
    const r = generateRoute(21, 1200, 3, [hz[1]!], tuning.terrain);
    const grades = r.hazards.filter((h) => h.type === 'grade');
    expect(grades.length).toBeGreaterThan(0);
    for (const g of grades) expect(Math.abs(r.slopeAt(g.x))).toBeCloseTo(tuning.terrain.gradeSlope);
  });
});
