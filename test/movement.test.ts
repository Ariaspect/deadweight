import { describe, expect, it } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, frame } from './helpers';

describe('player movement physics', () => {
  it('W throttle accelerates from rest and S can reverse', () => {
    const route = flatRoute(500); const state = createRun(route, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 180; i++) step(state, frame({ gait: 0, throttle: 1 }), route, [], tuning, rng);
    expect(state.speed).toBeGreaterThan(tuning.gaitSpeed[2]!);
    const forwardX = state.x;
    for (let i = 0; i < 360; i++) step(state, frame({ gait: 0, throttle: -1 }), route, [], tuning, rng);
    expect(state.speed).toBeLessThan(0);
    expect(state.x).toBeLessThan(forwardX);
  });

  it('A/D steering has momentum and bounces off course rails', () => {
    const route = flatRoute(500); const state = createRun(route, [], tuning); const rng = mulberry32(2);
    for (let i = 0; i < 220; i++) step(state, frame({ steer: 1 }), route, [], tuning, rng);
    expect(state.z).toBe(route.halfWidth + tuning.terrain.pocketDepth);
    expect(state.lateralVel).toBeLessThanOrEqual(0);
    expect(state.tiltVel).not.toBe(0);
  });

  it('Space produces a gravity-driven jump and a landing', () => {
    const route = flatRoute(500); const state = createRun(route, [], tuning); const rng = mulberry32(3);
    step(state, frame({ jump: true }), route, [], tuning, rng);
    expect(state.grounded).toBe(false); expect(state.lift).toBeGreaterThan(0);
    let peak = state.lift;
    for (let i = 0; i < 180; i++) { step(state, frame(), route, [], tuning, rng); peak = Math.max(peak, state.lift); }
    expect(peak).toBeGreaterThan(1.5); expect(state.grounded).toBe(true); expect(state.lift).toBe(0);
  });

  it('jumping clears a gap that would otherwise jolt the cargo', () => {
    const gap = { id: 0, type: 'gap' as const, x: 6, z: 0, halfW: 40, impulse: 1.4, strapJolt: 20, dir: 1 as const };
    const route = routeFromSegments(8, [{ x0: 0, x1: 100, slope: 0, y0: 0 }], [gap], 10);
    const cross = (jump: boolean) => {
      const state = createRun(route, [], tuning); state.speed = 10; const rng = mulberry32(4);
      step(state, frame({ gait: 3, jump }), route, [], tuning, rng);
      while (state.x < 7) step(state, frame({ gait: 3 }), route, [], tuning, rng);
      return state;
    };
    expect(cross(false).strap).toBeLessThan(tuning.strapStart);
    expect(cross(true).strap).toBe(tuning.strapStart);
  });

  it('a lane obstacle can be dodged laterally', () => {
    const rock = { id: 0, type: 'rubble' as const, x: 5, z: 6, halfW: 5, impulse: 0.5, strapJolt: 15, dir: 1 as const };
    const route = routeFromSegments(9, [{ x0: 0, x1: 100, slope: 0, y0: 0 }], [rock], 10);
    const state = createRun(route, [], tuning); state.speed = 8; state.z = -2.1; const rng = mulberry32(5);
    while (state.x < 6) step(state, frame({ gait: 2 }), route, [], tuning, rng);
    expect(state.strap).toBe(tuning.strapStart);
  });

  it('off-road discoveries restore resources and are collected once', () => {
    const route = routeFromSegments(10, [{ x0: 0, x1: 100, slope: 0, y0: 0 }], [], 10, [{ id: 4, x: 20, z: 9, name: 'LOST POD' }]);
    const state = createRun(route, [], tuning); state.x = 20; state.z = 9; state.reserve = 40;
    step(state, frame({ gait: 0 }), route, [], tuning, mulberry32(6));
    expect(state.foundDiscoveries).toEqual([4]);
    expect(state.reserve).toBeGreaterThan(40);
    const after = state.reserve;
    step(state, frame({ gait: 0 }), route, [], tuning, mulberry32(6));
    expect(state.foundDiscoveries).toEqual([4]); expect(state.reserve).toBeLessThanOrEqual(after);
  });
});
