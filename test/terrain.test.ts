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
    const a = generateRoute(4417, 600, 0, hz, tuning);
    const b = generateRoute(4417, 600, 0, hz, tuning);
    expect(a.segments).toEqual(b.segments);
    expect(a.hazards).toEqual(b.hazards);
  });
  it('differs per seed', () => {
    const a = generateRoute(1, 600, 0, hz, tuning);
    const b = generateRoute(2, 600, 0, hz, tuning);
    expect(a.segments).not.toEqual(b.segments);
  });
  it('builds a winding route with optional off-road discoveries', () => {
    const r = generateRoute(4417, 700, 2, hz, tuning);
    expect(r.centerAt(0)).toBe(0); expect(r.centerAt(r.length)).toBe(0);
    expect(r.segments.some((s) => Math.abs(s.z1 ?? 0) > 0.5)).toBe(true);
    expect(r.discoveries).toHaveLength(4);
  });
  it('covers exactly [0, length] with contiguous segments', () => {
    const r = generateRoute(5, 600, 1, hz, tuning);
    expect(r.segments[0]!.x0).toBe(0);
    expect(r.segments[r.segments.length - 1]!.x1).toBe(600);
    for (let i = 1; i < r.segments.length; i++) expect(r.segments[i]!.x0).toBe(r.segments[i - 1]!.x1);
  });
  it('is flat in the safe start and end zones and slopes are clamped', () => {
    const t = tuning.terrain;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generateRoute(seed, 600, 3, hz, { ...tuning, terrain: t });
      expect(r.slopeAt(t.safeStartM / 2)).toBe(0);
      expect(r.slopeAt(600 - t.safeEndM / 2)).toBe(0);
      for (const s of r.segments) expect(Math.abs(s.slope)).toBeLessThanOrEqual(t.maxSlope);
    }
  });
  it('keeps hazards sorted, outside safe zones, and honours minTier', () => {
    const t = tuning.terrain;
    const gated: HazardDef[] = [{ ...hz[0]!, minTier: 2 }];
    for (const seed of [11, 12, 13]) {
      const r = generateRoute(seed, 800, 3, hz, { ...tuning, terrain: t });
      for (let i = 1; i < r.hazards.length; i++) expect(r.hazards[i]!.x).toBeGreaterThanOrEqual(r.hazards[i - 1]!.x);
      for (const h of r.hazards) { expect(h.x).toBeGreaterThanOrEqual(t.safeStartM); expect(h.x).toBeLessThanOrEqual(800 - t.safeEndM); }
      expect(generateRoute(seed, 800, 0, gated, { ...tuning, terrain: t }).hazards).toHaveLength(0);
    }
  });
  it('grade hazards sit on a steep segment', () => {
    const r = generateRoute(21, 1200, 3, [hz[1]!], tuning);
    const grades = r.hazards.filter((h) => h.type === 'grade');
    expect(grades.length).toBeGreaterThan(0);
    for (const g of grades) expect(Math.abs(r.slopeAt(g.x))).toBeCloseTo(tuning.terrain.gradeSlope);
  });
});

const full: HazardDef[] = [
  ...hz,
  { type: 'rubble', impulse: 0.35, strapJolt: 25, telegraphM: 20, counter: 'slow', weight: 0.4, minTier: 0 },
  { type: 'gap', impulse: 1.4, strapJolt: 20, telegraphM: 30, counter: 'brace', weight: 0.3, minTier: 1 },
  { type: 'rockfall', impulse: 1.2, strapJolt: 22, telegraphM: 35, counter: 'wait', weight: 0.3, minTier: 1, cycleTicks: 360, windowTicks: 72 },
  { type: 'mud', impulse: 0, strapJolt: 0, telegraphM: 20, counter: 'slow', weight: 0, minTier: 0 },
];

describe('generateRoute — lanes', () => {
  it('populates the layout and puts every fork hazard inside a lane of its fork', () => {
    for (const seed of [3350, 9026, 5518]) {
      const r = generateRoute(seed, 800, 2, full, tuning);
      expect(r.forks.length).toBeGreaterThanOrEqual(3); expect(r.walls.length).toBeGreaterThan(r.forks.length);
      for (const h of r.hazards) {
        const f = r.forkAt(h.x); if (!f || h.halfW >= r.halfWidth) continue;   // corridor-wide hazards (grade, gust) are not lane hazards
        const lane = f.lanes.find((l) => h.z >= l.z0 && h.z <= l.z1);
        expect(lane, `${h.type}@${h.x}`).toBeDefined();
        expect(h.halfW).toBeLessThanOrEqual((lane!.z1 - lane!.z0) / 2 + 1e-9);
        if (h.impulse > 0) expect(lane!.archetype).toBe('direct');
        if (h.type === 'mud') expect(lane!.archetype).toBe('mud');
      }
    }
  });
  it('every fork keeps a lane with no impulse hazard', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = generateRoute(seed, 900, 3, full, tuning);
      for (const f of r.forks) {
        const safe = f.lanes.some((lane) => !r.hazards.some((h) => h.impulse > 0 && h.x >= f.x0 && h.x <= f.x1 && h.z >= lane.z0 && h.z <= lane.z1));
        expect(safe, `seed ${seed} fork ${f.x0}`).toBe(true);
      }
    }
  });
  it('zones span x..x1 inside their fork and movers carry a cycle', () => {
    const r = generateRoute(4417, 900, 3, full, tuning);
    expect(r.zones.length).toBeGreaterThan(0);
    for (const z of r.zones) {
      expect(z.x1!).toBeGreaterThan(z.x);
      const f = r.forkAt(z.x)!; expect(z.x).toBeGreaterThanOrEqual(f.x0); expect(z.x1!).toBeLessThanOrEqual(f.x1);
      if (z.type !== 'mud') { expect(z.cycleTicks).toBe(360); expect(z.windowTicks).toBe(72); expect(z.phase).toBeGreaterThanOrEqual(0); expect(z.phase).toBeLessThan(360); }
    }
    expect(r.hazards.filter((h) => h.x1 === undefined).every((h) => h.cycleTicks === undefined)).toBe(true);
  });
  it('stretch hazards leave a way past: rubble and scree sit on one side with halfW < halfWidth', () => {
    const r = generateRoute(9026, 900, 3, full, tuning);
    const stretch = r.hazards.filter((h) => !r.forkAt(h.x) && (h.type === 'rubble' || h.type === 'scree'));
    for (const h of stretch) { expect(Math.abs(h.z)).toBeGreaterThan(3); expect(h.halfW).toBeLessThan(r.halfWidth * 0.6); }
  });
  it('places 2 + min(2, tier) discoveries, pockets first', () => {
    for (const [tier, count] of [[0, 2], [1, 3], [2, 4], [3, 4]] as const) {
      const r = generateRoute(6142, 900, tier, full, tuning);
      expect(r.discoveries).toHaveLength(count);
      r.pockets.forEach((p, i) => { const d = r.discoveries[i]!; expect(d.x).toBeGreaterThanOrEqual(p.x0); expect(d.x).toBeLessThanOrEqual(p.x1); expect(d.z).toBeGreaterThanOrEqual(p.z0); expect(d.z).toBeLessThanOrEqual(p.z1); });
      for (const d of r.discoveries.slice(r.pockets.length)) expect(Math.abs(d.z)).toBeCloseTo(r.halfWidth - 3);
    }
  });
});
