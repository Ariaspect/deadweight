import { describe, it, expect } from 'vitest';
import { scheduleStorms, stormLevel } from '../src/sim/storm';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute } from './helpers';
import type { RouteDef, StormFront } from '../src/sim/types';

const ramp = Math.round(tuning.storm.rampS / tuning.dt);
const withStorms = (storms: StormFront[]): RouteDef => ({ ...flatRoute(), storms });

describe('scheduleStorms', () => {
  it('never storms at tier 0 and is deterministic for a seed', () => {
    expect(scheduleStorms(mulberry32(1), 600, 0, tuning)).toEqual([]);
    expect(scheduleStorms(mulberry32(9), 900, 3, tuning)).toEqual(scheduleStorms(mulberry32(9), 900, 3, tuning));
  });
  it('keeps fronts inside the window, sane in length, and separated by two ramps', () => {
    const cruise = tuning.gaitSpeed[2]! * tuning.gaitSpeedMul;
    for (let seed = 1; seed < 40; seed++) {
      const total = Math.round(900 / cruise / tuning.dt);
      const fronts = scheduleStorms(mulberry32(seed), 900, 3, tuning);
      expect(fronts.length).toBeLessThanOrEqual(tuning.storm.maxFronts[3]!);
      for (const f of fronts) {
        expect(f.startTick, `seed ${seed}`).toBeGreaterThanOrEqual(Math.round(total * tuning.storm.windowLo));
        expect(f.endTick, `seed ${seed}`).toBeLessThanOrEqual(Math.round(total * tuning.storm.windowHi));
        const seconds = (f.endTick - f.startTick) * tuning.dt;
        expect(seconds).toBeGreaterThanOrEqual(tuning.storm.minDurationS - 0.02);
        expect(seconds).toBeLessThanOrEqual(tuning.storm.maxDurationS + 0.02);
      }
      for (let i = 1; i < fronts.length; i++) {
        expect(fronts[i]!.startTick - fronts[i - 1]!.endTick, `seed ${seed}`).toBeGreaterThanOrEqual(2 * ramp);
      }
    }
  });
});

describe('stormLevel', () => {
  const route = withStorms([{ id: 0, startTick: 1000, endTick: 2000 }]);
  it('is zero outside the front and its ramps', () => {
    expect(stormLevel(route, 0, tuning)).toBe(0);
    expect(stormLevel(route, 1000 - ramp, tuning)).toBe(0);
    expect(stormLevel(route, 2000 + ramp, tuning)).toBe(0);
  });
  it('ramps in, holds, and ramps out', () => {
    expect(stormLevel(route, 1000 - ramp / 2, tuning)).toBeCloseTo(0.5, 2);
    expect(stormLevel(route, 1000, tuning)).toBe(1);
    expect(stormLevel(route, 1500, tuning)).toBe(1);
    expect(stormLevel(route, 2000, tuning)).toBe(1);
    expect(stormLevel(route, 2000 + ramp / 2, tuning)).toBeCloseTo(0.5, 2);
  });
  it('takes the strongest of overlapping fronts', () => {
    const two = withStorms([{ id: 0, startTick: 1000, endTick: 1100 }, { id: 1, startTick: 1150, endTick: 2000 }]);
    expect(stormLevel(two, 1125, tuning)).toBeGreaterThan(0.4);
  });
});
