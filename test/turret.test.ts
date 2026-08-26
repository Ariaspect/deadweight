import { describe, it, expect } from 'vitest';
import { placeTurrets, octantOf, dangerLevel } from '../src/sim/turret';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { createRun, step, highestDanger } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { crateDef, frame } from './helpers';

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

function turretRoute() {
  return routeFromSegments(1, [{ x0: 0, x1: 2000, slope: 0, y0: 0 }], [], 10, [], undefined, 18, [],
    [{ id: 0, x: 200, z: 70, phase: 0 }]);
}

describe('turret firing and missiles', () => {
  it('fires when the rig is in range and the missile closes over flightTicks', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(2);
    for (let i = 0; i < 60; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.missiles.length).toBeGreaterThan(0);
    const m = s.missiles[0]!;
    expect(m.impactTick - m.launchTick).toBe(tuning.turret.flightTicks);
    expect(highestDanger(s, tuning)).toBeGreaterThanOrEqual(1);
  });
  it('a missile that lands unshielded costs tilt and strap', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(3);
    const strapBefore = s.items[0]!.restraint;
    for (let i = 0; i < 700; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.items[0]!.restraint).toBeLessThan(strapBefore);
    expect(s.tiltVel === 0 && s.tilt === 0).toBe(false);
  });
});

describe('the shield', () => {
  it('refuses to deploy while moving and deploys once stopped', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(4);
    for (let i = 0; i < 30; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    step(s, frame({ gait: 2, throttle: 1, shieldSector: 0 }), route, [], tuning, rng);
    expect(s.shield, 'moving: refused').toBe(-1);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    expect(Math.abs(s.speed)).toBeLessThan(tuning.turret.shieldStopEpsilon);
    const reserveBefore = s.reserve;
    step(s, frame({ gait: 0, throttle: 0, shieldSector: 3 }), route, [], tuning, rng);
    expect(s.shield, 'stopped: deployed').toBe(3);
    expect(reserveBefore - s.reserve).toBeGreaterThan(tuning.turret.shieldCost - 0.1);
  });
  it('drops after shieldTicks and will not redeploy until the cooldown expires', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    step(s, frame({ gait: 0, throttle: 0, shieldSector: 1 }), route, [], tuning, rng);
    expect(s.shield).toBe(1);
    for (let i = 0; i < tuning.turret.shieldTicks + 1; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    expect(s.shield, 'dropped').toBe(-1);
    step(s, frame({ gait: 0, throttle: 0, shieldSector: 1 }), route, [], tuning, rng);
    expect(s.shield, 'still cooling down').toBe(-1);
  });
  it('blocks only the sector the missile actually flew in on', () => {
    // a turret at +z fires from the port side, so the missile must be blocked by that bearing and no other
    const results: Record<number, boolean> = {};
    let trueOctant = -1;
    for (let sector = 0; sector < 8; sector++) {
      const route = routeFromSegments(1, [{ x0: 0, x1: 2000, slope: 0, y0: 0 }], [], 10, [], undefined, 18, [],
        [{ id: 0, x: 200, z: 70, phase: 0 }]);
      const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
      const rng = mulberry32(11);
      for (let i = 0; i < 60; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
      expect(s.missiles.length, 'a missile is in flight').toBeGreaterThan(0);
      const m = s.missiles[0]!;
      while (s.t < m.impactTick - tuning.turret.shieldTicks / 2) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
      const strapBefore = s.items[0]!.restraint;
      step(s, frame({ gait: 0, throttle: 0, shieldSector: sector }), route, [], tuning, rng);
      while (s.t < m.impactTick) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
      trueOctant = octantOf(m.x - s.x, m.z - s.z);   // the real bearing on the last tick before impact
      step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
      results[sector] = s.items[0]!.restraint >= strapBefore - 0.5;   // no strap jolt means it was blocked
    }
    const blocking = Object.entries(results).filter(([, ok]) => ok).map(([k]) => Number(k));
    expect(blocking, 'exactly one sector blocks').toHaveLength(1);
    expect(blocking[0], 'and it is the bearing the missile actually flew in on').toBe(trueOctant);
    expect(trueOctant, 'the bearing is a real one, not the zero-vector fallthrough this test exists to catch').toBe(0);
  });

});
