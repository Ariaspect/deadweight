import { describe, it, expect } from 'vitest';
import { placeTurrets, octantOf, dangerLevel } from '../src/sim/turret';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';

describe('octantOf', () => {
  // octant 0 is +x (dead ahead), numbering anticlockwise through +z, 45 degrees each
  it('puts the cardinal directions in the middle of their octants', () => {
    expect(octantOf(10, 0)).toBe(0);
    expect(octantOf(0, 10)).toBe(2);
    expect(octantOf(-10, 0)).toBe(4);
    expect(octantOf(0, -10)).toBe(6);
  });
  it('puts the diagonals in the odd octants', () => {
    expect(octantOf(10, 10)).toBe(1);
    expect(octantOf(-10, 10)).toBe(3);
    expect(octantOf(-10, -10)).toBe(5);
    expect(octantOf(10, -10)).toBe(7);
  });
  it('is stable either side of every boundary and never leaves 0..7', () => {
    for (let i = 0; i < 720; i++) {
      const a = i * Math.PI / 360;           // test-side trig is fine; the sim implementation may not use it
      const o = octantOf(Math.cos(a) * 50, Math.sin(a) * 50);
      expect(o, `angle ${i / 2} deg`).toBeGreaterThanOrEqual(0);
      expect(o, `angle ${i / 2} deg`).toBeLessThan(8);
    }
  });
  it('agrees with the angle it stands for, to within half an octant', () => {
    for (let i = 0; i < 720; i++) {
      const deg = i / 2;
      const a = deg * Math.PI / 180;
      const o = octantOf(Math.cos(a) * 50, Math.sin(a) * 50);
      const centre = o * 45;
      // wrapped circular distance between the angle and its octant's centre
      const diff = Math.abs(((deg - centre + 540) % 360) - 180);
      expect(diff, `angle ${deg} deg landed in octant ${o}`).toBeLessThanOrEqual(22.5001);
    }
  });
});

describe('dangerLevel', () => {
  const f = tuning.turret.flightTicks;
  it('is 1 at launch and 6 at impact', () => {
    expect(dangerLevel(0, tuning)).toBe(1);
    expect(dangerLevel(1, tuning)).toBe(1);
    expect(dangerLevel(f, tuning)).toBe(6);
    expect(dangerLevel(f - 1, tuning)).toBe(6);
  });
  it('climbs monotonically and never leaves 1..6', () => {
    let prev = 0;
    for (let t = 0; t <= f; t++) {
      const l = dangerLevel(t, tuning);
      expect(l).toBeGreaterThanOrEqual(1);
      expect(l).toBeLessThanOrEqual(tuning.turret.levels);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});

describe('placeTurrets', () => {
  it('places none below tier 2 and is deterministic for a seed', () => {
    expect(placeTurrets(mulberry32(1), 900, 0, tuning)).toEqual([]);
    expect(placeTurrets(mulberry32(1), 900, 1, tuning)).toEqual([]);
    expect(placeTurrets(mulberry32(4), 900, 3, tuning)).toEqual(placeTurrets(mulberry32(4), 900, 3, tuning));
  });
  it('keeps emplacements outside the corridor and inside the route', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const t of placeTurrets(mulberry32(seed), 900, 3, tuning)) {
        expect(Math.abs(t.z), `seed ${seed}`).toBeGreaterThanOrEqual(tuning.turret.offCorridorZ);
        expect(t.x).toBeGreaterThan(0);
        expect(t.x).toBeLessThan(900);
      }
    }
  });
});
