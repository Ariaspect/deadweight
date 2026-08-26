import { describe, it, expect } from 'vitest';
import { scheduleStorms, stormLevel } from '../src/sim/storm';
import { createRun, step } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { crateDef, flatRoute, frame } from './helpers';
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

function stormRoute(): RouteDef {
  return routeFromSegments(1, [{ x0: 0, x1: 4000, slope: 0, y0: 0 }], [], 10, [], undefined, 18,
    [{ id: 0, startTick: 60, endTick: 6000 }]);
}

describe('storm effects', () => {
  it('writes the level onto the state and cuts the speed target by it', () => {
    const route = stormRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.storm).toBe(1);
    expect(s.targetSpeed).toBeCloseTo(tuning.gaitSpeed[2]! * tuning.gaitSpeedMul * tuning.storm.speedMul, 5);
  });
  it('works the restraints loose in proportion to the level', () => {
    const route = stormRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(3);
    const before = s.items[0]!.restraint;
    for (let i = 0; i < 600; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    expect(s.items[0]!.restraint).toBeLessThan(before - 4);
  });
  it('leaves a calm route alone', () => {
    const route = flatRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(4);
    for (let i = 0; i < 300; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.storm).toBe(0);
    expect(s.items[0]!.restraint).toBe(tuning.strapStart);
  });
});

describe('radar', () => {
  it('drains reserve only while lit, and works outside a storm too', () => {
    const route = flatRoute();
    const lit = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const dark = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rngA = mulberry32(5), rngB = mulberry32(5);
    for (let i = 0; i < 600; i++) {
      step(lit, frame({ gait: 2, throttle: 1, radar: true }), route, [], tuning, rngA);
      step(dark, frame({ gait: 2, throttle: 1, radar: false }), route, [], tuning, rngB);
    }
    expect(lit.radar).toBe(true);
    expect(dark.radar).toBe(false);
    expect(dark.reserve - lit.reserve).toBeCloseTo(tuning.radarDrain * 600 * tuning.dt, 4);
  });
});
