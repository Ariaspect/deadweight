import { describe, it, expect } from 'vitest';
import { layoutCourse, laneCentre, laneHalfWidth } from '../src/sim/course';
import { isPassable } from '../src/sim/walls';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';

const t = tuning.terrain;
const layout = (seed: number, tier: number, length = 800) => layoutCourse(mulberry32(seed), length, tier, t);

describe('layoutCourse', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(layout(7, 2)).toEqual(layout(7, 2));
    expect(layout(7, 2).forks).not.toEqual(layout(8, 2).forks);
  });
  it('places forks only between the safe zones, with 2 lanes at tier ≤ 1 and 3 at tier ≥ 2', () => {
    for (const [seed, tier, lanes] of [[1, 0, 2], [2, 1, 2], [3, 2, 3], [4, 3, 3]] as const) {
      const l = layout(seed, tier);
      expect(l.forks.length).toBeGreaterThanOrEqual(3);
      for (const f of l.forks) {
        expect(f.x0).toBeGreaterThanOrEqual(t.safeStartM); expect(f.x1).toBeLessThanOrEqual(800 - t.safeEndM);
        expect(f.lanes).toHaveLength(lanes);
        expect(f.x1 - f.x0).toBeGreaterThanOrEqual(t.forkLenMin); expect(f.x1 - f.x0).toBeLessThanOrEqual(t.forkLenMax);
      }
      for (let i = 1; i < l.forks.length; i++) expect(l.forks[i]!.x0 - l.forks[i - 1]!.x1).toBeGreaterThanOrEqual(t.stretchLenMin);
    }
  });
  it('lanes tile the corridor with spines between them and every fork has a lane that is not direct', () => {
    const l = layout(11, 3);
    for (const f of l.forks) {
      expect(f.lanes[0]!.z0).toBeCloseTo(-t.corridorHalfWidth); expect(f.lanes.at(-1)!.z1).toBeCloseTo(t.corridorHalfWidth);
      for (let i = 1; i < f.lanes.length; i++) expect(f.lanes[i]!.z0 - f.lanes[i - 1]!.z1).toBeCloseTo(t.spineThick);
      expect(f.lanes.some((lane) => lane.archetype === 'direct')).toBe(true);
      expect(f.lanes.some((lane) => lane.archetype !== 'direct')).toBe(true);
      for (const lane of f.lanes) expect(laneHalfWidth(lane) * 2).toBeGreaterThan(tuning.rigRadius * 2 + 1);
    }
  });
  it('keeps every lane centre line passable and blocks the spines', () => {
    const l = layout(12, 2);
    const bound = t.corridorHalfWidth + t.pocketDepth;
    for (const f of l.forks) {
      for (let x = f.x0 + 1; x < f.x1; x += 2) {
        for (const lane of f.lanes) {
          // a chicane baffle may cover the centre line, but never the full lane width
          const zs = [lane.z0 + tuning.rigRadius + 0.2, laneCentre(lane), lane.z1 - tuning.rigRadius - 0.2];
          expect(zs.some((z) => isPassable(l.walls, bound, x, z)), `fork ${f.x0} lane ${lane.z0} x ${x}`).toBe(true);
        }
      }
      // a spine still commits you to a lane, but carries weave gaps the rig can cross through
      for (let i = 1; i < f.lanes.length; i++) {
        const line = f.lanes[i]!.z0 - t.spineThick / 2;
        let open = 0, longest = 0, run = 0;
        for (let x = f.x0; x <= f.x1; x += 0.25) {
          if (isPassable(l.walls, bound, x, line)) { open += 0.25; run += 0.25; if (run > longest) longest = run; } else run = 0;
        }
        expect(longest, `fork ${f.x0} spine ${i}`).toBeGreaterThanOrEqual(2 * tuning.rigRadius);
        expect(open, `fork ${f.x0} spine ${i}`).toBeLessThan((f.x1 - f.x0) * 0.3);
      }
    }
  });
  it('fences the corridor edges except at pockets, whose interiors are passable', () => {
    const l = layout(13, 3);
    const bound = t.corridorHalfWidth + t.pocketDepth;
    expect(l.pockets.length).toBeGreaterThanOrEqual(1);
    for (const p of l.pockets) {
      expect(isPassable(l.walls, bound, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)).toBe(true);
      expect(isPassable(l.walls, bound, (p.x0 + p.x1) / 2, p.side * (t.corridorHalfWidth + 0.5))).toBe(true);   // the doorway
    }
    for (let x = 5; x < 800; x += 7) {
      for (const side of [-1, 1]) {
        const inPocket = l.pockets.some((p) => p.side === side && x >= p.x0 && x <= p.x1);
        expect(isPassable(l.walls, bound, x, side * (t.corridorHalfWidth + 0.5)), `x ${x} side ${side}`).toBe(inPocket);
      }
    }
  });
});
