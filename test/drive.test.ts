import { describe, it, expect } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { frame, hazard, crateDef } from './helpers';
import type { Wall } from '../src/sim/types';

const flat = (walls: Wall[] = [], hazards = [] as ReturnType<typeof hazard>[]) =>
  routeFromSegments(1, [{ x0: 0, x1: 500, slope: 0, y0: 0 }], hazards, 10, [], { forks: [], walls, pockets: [] }, 18);
const run = (route: ReturnType<typeof flat>, inputs: Parameters<typeof frame>[0][], loadout = [{ def: crateDef(), slot: 1 }]) => {
  const s = createRun(route, loadout, tuning); const rng = mulberry32(3);
  for (const inp of inputs) step(s, frame(inp), route, [], tuning, rng);
  return s;
};
const hold = (inp: Parameters<typeof frame>[0], n: number) => Array.from({ length: n }, () => inp);

describe('drive', () => {
  it('W walks at the selected gait, release coasts to a stop, S reverses at gait 1', () => {
    const r = flat();
    const a = run(r, hold({ gait: 2, throttle: 1 }, 240));
    expect(a.speed).toBeCloseTo(tuning.gaitSpeed[2]!); expect(a.targetSpeed).toBe(tuning.gaitSpeed[2]!);
    const b = run(r, [...hold({ gait: 2, throttle: 1 }, 240), ...hold({ gait: 2, throttle: 0 }, 240)]);
    expect(b.speed).toBe(0); expect(b.targetSpeed).toBe(0);
    const c = run(r, [...hold({ gait: 2, throttle: 1 }, 60), ...hold({ gait: 3, throttle: -1 }, 300)]);
    expect(c.speed).toBeCloseTo(-tuning.gaitSpeed[1]!); expect(c.targetSpeed).toBe(-tuning.gaitSpeed[1]!);
  });
  it('gait 0 is parked even with W held; brace caps the target', () => {
    expect(run(flat(), hold({ gait: 0, throttle: 1 }, 120)).x).toBe(0);
    const s = run(flat(), hold({ gait: 4, throttle: 1, brace: true }, 240));
    expect(s.speed).toBeCloseTo(tuning.braceSpeed); expect(s.targetSpeed).toBe(tuning.braceSpeed);
  });
  it('mud halves the target speed and steering traction while inside the zone', () => {
    const mud = hazard({ type: 'mud', x: 20, x1: 200, z: 0, halfW: 10, impulse: 0, strapJolt: 0 });
    const r = flat([], [mud]);
    const s = run(r, hold({ gait: 3, throttle: 1 }, 600));
    expect(s.x).toBeGreaterThan(20); expect(s.x).toBeLessThan(200);
    expect(s.targetSpeed).toBeCloseTo(tuning.gaitSpeed[3]! * tuning.mudSpeedMul);
    expect(s.speed).toBeCloseTo(tuning.gaitSpeed[3]! * tuning.mudSpeedMul);
    const dry = run(flat(), [...hold({ gait: 3, throttle: 1 }, 360), { gait: 3, throttle: 1, steer: 1 }]);
    const wet = run(r, [...hold({ gait: 3, throttle: 1 }, 360), { gait: 3, throttle: 1, steer: 1 }]);
    expect(wet.lateralVel).toBeCloseTo(dry.lateralVel * tuning.mudTraction);
  });
  it('a wall ahead stops the rig at its face and a fast hit costs tilt and strap', () => {
    const r = flat([{ x0: 60, x1: 63, z0: -20, z1: 20, kind: 'wall' }]);
    const s = run(r, hold({ gait: 4, throttle: 1 }, 600));
    expect(s.x).toBeCloseTo(60 - tuning.rigRadius, 5);
    expect(s.strap).toBeLessThan(tuning.strapStart);
    expect(s.tiltVel === 0 && s.tilt === 0).toBe(false);
  });
  it('steering has momentum and the corridor bound clamps at halfWidth + pocketDepth', () => {
    const s = run(flat(), hold({ gait: 2, steer: 1 }, 720));   // 12 s: steerAccel 8 tops out near 5 m/s lateral
    expect(s.z).toBe(18 + tuning.terrain.pocketDepth); expect(s.lateralVel).toBe(0);
    const t = run(flat(), [...hold({ gait: 2, steer: 1 }, 30), ...hold({ gait: 2, steer: 0 }, 5)]);
    expect(t.lateralVel).toBeGreaterThan(0);
  });
  it('a jump is a gravity arc, and landing costs tilt and strap', () => {
    const r = flat();
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(3);
    step(s, frame({ gait: 0, throttle: 0, jump: true }), r, [], tuning, rng);
    expect(s.grounded).toBe(false); expect(s.liftVel).toBeCloseTo(tuning.jumpSpeed - tuning.gravity * tuning.dt);
    let peak = 0;
    for (let i = 0; i < 180 && !s.grounded; i++) { step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng); peak = Math.max(peak, s.lift); }
    expect(peak).toBeGreaterThan(1.5); expect(s.grounded).toBe(true); expect(s.lift).toBe(0);
    expect(s.strap).toBeCloseTo(tuning.strapStart - tuning.landingJolt * tuning.strapJoltMul);
  });
  it('jumping clears a collapsed span that would otherwise jolt the cargo', () => {
    const gap = hazard({ type: 'gap', x: 6, impulse: 1.4, strapJolt: 20 });
    const r = flat([], [gap]);
    const cross = (jump: boolean) => {
      const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); s.speed = 10; const rng = mulberry32(4);
      step(s, frame({ gait: 3, jump }), r, [], tuning, rng);
      while (!s.grounded || s.x < 7) step(s, frame({ gait: 3 }), r, [], tuning, rng);
      return s;
    };
    expect(cross(false).strap).toBeLessThan(tuning.strapStart);
    expect(cross(true).strap).toBeCloseTo(tuning.strapStart - tuning.landingJolt * tuning.strapJoltMul, 5);
  });
  it('a lane hazard is dodged by driving past it in another lane', () => {
    const rock = hazard({ type: 'rubble', x: 5, z: 6, halfW: 5, impulse: 0.5, strapJolt: 15 });
    const r = flat([], [rock]);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); s.speed = 8; s.z = -2.1; const rng = mulberry32(5);
    while (s.x < 6) step(s, frame({ gait: 2 }), r, [], tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
  });
});

describe('discoveries', () => {
  it('off-road caches restore reserve and repair cargo, and are collected once', () => {
    const route = routeFromSegments(10, [{ x0: 0, x1: 100, slope: 0, y0: 0 }], [], 10, [{ id: 4, x: 20, z: 9, name: 'LOST POD' }]);
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning); s.x = 20; s.z = 9; s.reserve = 40; s.items[0]!.stress = 0.5;
    step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, mulberry32(6));
    expect(s.foundDiscoveries).toEqual([4]);
    expect(s.reserve).toBeCloseTo(40 + tuning.cacheReserve - (tuning.reserveBudget * 100 * tuning.gaitSpeed[2]! / route.length) * tuning.dt, 5);
    expect(s.items[0]!.stress).toBeCloseTo(0.5 - tuning.cacheRepair);
    const after = s.reserve;
    step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, mulberry32(6));
    expect(s.foundDiscoveries).toEqual([4]); expect(s.reserve).toBeLessThan(after);
  });
});
