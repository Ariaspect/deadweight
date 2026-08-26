import { describe, it, expect } from 'vitest';
import { createRun, step, drainRate } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, frame, crateDef } from './helpers';

describe('createRun', () => {
  it('starts at x=0 with full reserve and starting strap', () => {
    const s = createRun(flatRoute(), [], tuning);
    expect(s.x).toBe(0); expect(s.t).toBe(0); expect(s.tilt).toBe(0);
    expect(s.reserve).toBe(tuning.reserveStart);
    expect(s.strap).toBe(tuning.strapStart);
    expect(s.ended).toBeNull();
    expect(s.targetSpeed).toBe(0);
    expect(s.zoneCooldown).toEqual([]);
  });
  it('sets deadlineTick from rush (presence, not truthiness)', () => {
    const rushDef = { ...crateDef(), rush: 55 };
    const zeroDef = { ...crateDef({ id: 'z' }), rush: 0 };
    const s = createRun(flatRoute(), [{ def: rushDef, slot: 0 }, { def: zeroDef, slot: 2 }, { def: crateDef({ id: 'n' }), slot: 1 }], tuning);
    expect(s.items[0]!.deadlineTick).toBe(Math.round(55 / tuning.dt));
    expect(s.items[1]!.deadlineTick).toBe(0);
    expect(s.items[2]!.deadlineTick).toBe(-1);
  });
});

describe('step v0', () => {
  it('accelerates toward gaitSpeed[gait] at gaitAccel', () => {
    const r = flatRoute();
    const s = createRun(r, [], tuning);
    const rng = mulberry32(1);
    step(s, frame({ gait: 2 }), r, [], tuning, rng);
    expect(s.speed).toBe(Math.min(tuning.gaitSpeed[2]!, tuning.gaitAccel * tuning.dt));
    expect(s.x).toBe(s.speed * tuning.dt);
    expect(s.t).toBe(1);
    expect(s.gait).toBe(2);
    let maxSpeed = s.speed;
    for (let i = 1; i < 600; i++) {
      step(s, frame({ gait: 2 }), r, [], tuning, rng);
      maxSpeed = Math.max(maxSpeed, s.speed);
    }
    expect(Math.abs(s.speed - tuning.gaitSpeed[2]!)).toBeLessThan(1e-9);
    expect(maxSpeed).toBeLessThanOrEqual(tuning.gaitSpeed[2]!);
  });
  it('decelerates at gaitDecel and never overshoots', () => {
    const r = flatRoute(5000); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 600; i++) step(s, frame({ gait: 4 }), r, [], tuning, rng);
    expect(s.speed).toBeCloseTo(tuning.gaitSpeed[4]!, 9);
    let prev = s.speed;
    let reached = false;
    for (let i = 0; i < 200; i++) {
      step(s, frame({ gait: 1 }), r, [], tuning, rng);
      if (!reached && s.speed > tuning.gaitSpeed[1]!) {
        expect(prev - s.speed).toBeCloseTo(tuning.gaitDecel * tuning.dt, 9);
      } else {
        reached = true;
        expect(s.speed).toBeCloseTo(tuning.gaitSpeed[1]!, 9);
      }
      prev = s.speed;
    }
    expect(reached).toBe(true);
  });
  it('brace decelerates to braceSpeed', () => {
    const r = flatRoute(2000); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 600; i++) step(s, frame({ gait: 3 }), r, [], tuning, rng);
    expect(s.speed).toBeCloseTo(tuning.gaitSpeed[3]!, 9);
    step(s, frame({ gait: 3, brace: true }), r, [], tuning, rng);
    expect(s.braced).toBe(true);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 3, brace: true }), r, [], tuning, rng);
    expect(s.speed).toBeCloseTo(tuning.braceSpeed, 9);
  });
  it('drains reserve by drainRate*dt per tick, scaled to route length', () => {
    const r = flatRoute(500); const s = createRun(r, [], tuning);
    step(s, frame(), r, [], tuning, mulberry32(1));
    expect(s.reserve).toBeCloseTo(tuning.reserveStart - drainRate(r, tuning) * tuning.dt);
    expect(drainRate(flatRoute(1000), tuning)).toBeCloseTo(drainRate(r, tuning) / 2);
  });
  it('gait 2 arrives with (1 - reserveBudget) of the reserve left on any length', () => {
    for (const len of [400, 960]) {
      const r = flatRoute(len); const s = createRun(r, [], tuning); const rng = mulberry32(1);
      for (let i = 0; i < 20000 && !s.ended; i++) step(s, frame({ gait: 2 }), r, [], tuning, rng);
      expect(s.ended).toBe('arrived');
      expect(s.reserve / tuning.reserveStart).toBeCloseTo(1 - tuning.reserveBudget, 1);
    }
  });
  it('ends with arrived when x reaches route length', () => {
    const r = flatRoute(50); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 2000 && !s.ended; i++) step(s, frame({ gait: 4 }), r, [], tuning, rng);
    expect(s.ended).toBe('arrived');
    expect(s.x).toBeGreaterThanOrEqual(50);
  });
  it('ends with stalled when reserve hits 0 (gait 1 cannot finish)', () => {
    const r = flatRoute(400); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 20000 && !s.ended; i++) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(s.ended).toBe('stalled');
    expect(s.reserve).toBeLessThanOrEqual(0);
    expect(s.x).toBeLessThan(400);
  });
  it('does nothing once ended', () => {
    const r = flatRoute(10); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) step(s, frame({ gait: 4 }), r, [], tuning, rng);
    const snap = { ...s };
    step(s, frame({ gait: 4 }), r, [], tuning, rng);
    expect(s).toEqual(snap);
  });
});
