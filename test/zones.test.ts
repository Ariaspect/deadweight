import { describe, it, expect } from 'vitest';
import { createRun, step, moverActive } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { frame, crateDef, hazard } from './helpers';
import type { HazardInstance } from '../src/sim/types';

const route = (h: HazardInstance[]) => routeFromSegments(2, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], h, 10);
const rockfall = (phase: number) => hazard({ id: 3, type: 'rockfall', x: 40, x1: 48, z: 0, halfW: 5, impulse: 1.2, strapJolt: 22, cycleTicks: 360, windowTicks: 72, phase });
const parkInside = (h: HazardInstance, t0: number) => {
  const r = route([h]); const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
  s.x = 44; s.t = t0;
  return { r, s, rng };
};

describe('movers', () => {
  it('moverActive follows (t + phase) mod cycle < window', () => {
    const h = rockfall(100);
    expect(moverActive(0, h)).toBe(false); expect(moverActive(260, h)).toBe(true); expect(moverActive(332, h)).toBe(false);
  });
  it('hits only while active, then cools down for hazardCooldownTicks', () => {
    const { r, s, rng } = parkInside(rockfall(0), 0);   // active for the first 72 ticks
    step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    const after = s.strap;
    expect(after).toBeCloseTo(tuning.strapStart - 22 * tuning.strapJoltMul); expect(s.tiltVel).not.toBe(0);
    for (let i = 0; i < 50; i++) step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(s.strap).toBeCloseTo(after);   // cooldown holds through the rest of the window
    const idle = parkInside(rockfall(100), 0);
    step(idle.s, frame({ gait: 0, throttle: 0 }), idle.r, [], tuning, idle.rng);
    expect(idle.s.strap).toBe(tuning.strapStart);
  });
  it('bracing turns a mover hit into a strap jolt only', () => {
    const { r, s, rng } = parkInside(rockfall(0), 0);
    step(s, frame({ gait: 0, throttle: 0, brace: true }), r, [], tuning, rng);
    expect(s.strap).toBeLessThan(tuning.strapStart); expect(Math.abs(s.tiltVel)).toBeLessThan(0.05);
  });
  it('a crane hit shoves sideways', () => {
    const crane = hazard({ id: 4, type: 'crane', x: 40, x1: 48, z: 0, halfW: 5, impulse: 1.0, strapJolt: 18, dir: -1, cycleTicks: 240, windowTicks: 48, phase: 0 });
    const { r, s, rng } = parkInside(crane, 0);
    step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(s.lateralVel).toBeLessThan(0);
  });
  it('does not fire outside the lane', () => {
    const { r, s, rng } = parkInside(rockfall(0), 0); s.z = 7;
    step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
  });
});

describe('planks are lane-exact', () => {
  it('a plank in another lane does not cancel the gap', () => {
    const gap = hazard({ type: 'gap', x: 100, z: 6, halfW: 5, impulse: 1.4, strapJolt: 20 });
    const r = route([gap]);
    const cross = (plankZ: number) => {
      const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); s.z = 6; const rng = mulberry32(1);
      const traces = [{ id: 'p', seed: r.seed, x: 101, z: plankZ, type: 'plank' as const, ownerName: 'x', useCount: 0, ageHours: 1 }];
      while (s.x < 101) step(s, frame({ gait: 2 }), r, traces, tuning, rng);
      return s.strap;
    };
    expect(cross(6)).toBe(tuning.strapStart);
    expect(cross(-6)).toBeLessThan(tuning.strapStart);
  });
});
