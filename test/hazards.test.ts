import { describe, it, expect } from 'vitest';
import { createRun, step, drainRate } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, crateDef, frame } from './helpers';
import type { HazardInstance, Trace } from '../src/sim/types';

const hz = (over: Partial<HazardInstance>): HazardInstance => ({ id: 0, type: 'gust', x: 100, impulse: 0.9, strapJolt: 12, dir: 1, ...over });
const hzRoute = (h: HazardInstance[]) => routeFromSegments(9, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], h, 10);

function runUntil(route: ReturnType<typeof flatRoute>, input: ReturnType<typeof frame>, xTarget: number, loadout = [{ def: crateDef(), slot: 1 }]) {
  const s = createRun(route, loadout, tuning); const rng = mulberry32(1);
  while (s.x < xTarget && !s.ended) step(s, input, route, [], tuning, rng);
  return s;
}

describe('strap and brace', () => {
  it('strap tap adds strapTap, capped at 100', () => {
    const r = flatRoute(); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    step(s, frame({ strap: true }), r, [], tuning, rng);
    expect(s.strap).toBe(Math.min(100, tuning.strapStart + tuning.strapTap));
    for (let i = 0; i < 10; i++) step(s, frame({ strap: true }), r, [], tuning, rng);
    expect(s.strap).toBe(100);
  });
  it('brace creeps at braceSpeed, drains extra reserve, damps tiltVel', () => {
    const r = flatRoute(); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    s.tiltVel = 1;
    step(s, frame({ gait: 4, brace: true }), r, [], tuning, rng);
    expect(s.braced).toBe(true);
    expect(s.x).toBeCloseTo(tuning.braceSpeed * tuning.dt);
    expect(s.reserve).toBeCloseTo(tuning.reserveStart - (drainRate(r, tuning) + tuning.braceDrain) * tuning.dt);
    expect(Math.abs(s.tiltVel)).toBeLessThan(1);
  });
});

describe('hazards', () => {
  it('gust adds impulse to tiltVel and loosens straps, exactly once', () => {
    const r = hzRoute([hz({})]);
    const s = runUntil(r, frame({ gait: 2 }), 101);
    expect(s.strap).toBeCloseTo(tuning.strapStart - 12 * tuning.strapJoltMul);
    expect(s.hazardCursor).toBe(1);
    const before = s.strap;
    for (let i = 0; i < 60; i++) step(s, frame({ gait: 2 }), r, [], tuning, mulberry32(1));
    expect(s.strap).toBe(before);
  });
  it('bracing absorbs the hazard', () => {
    const r = hzRoute([hz({})]);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (s.x < 95) step(s, frame({ gait: 2 }), r, [], tuning, rng);
    while (s.x < 101) step(s, frame({ gait: 2, brace: true }), r, [], tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
    expect(s.hazardCursor).toBe(1);
    expect(s.ended).toBeNull();
  });
  it('impulse scales with gait', () => {
    const r = hzRoute([hz({ x: 60 })]);
    const peak = (g: 1 | 4) => { const s = createRun(r, [], tuning); const rng = mulberry32(1); while (s.x < 60) step(s, frame({ gait: g }), r, [], tuning, rng); step(s, frame({ gait: g }), r, [], tuning, rng); return Math.abs(s.tiltVel); };
    expect(peak(4)).toBeGreaterThan(peak(1) * 1.5);
  });
  it('grade hazards have no impulse', () => {
    const r = hzRoute([hz({ type: 'grade', impulse: 0, strapJolt: 0 })]);
    const s = runUntil(r, frame({ gait: 2 }), 101);
    expect(s.strap).toBe(tuning.strapStart); expect(s.tiltVel).toBe(0);
  });
  it('a plank trace absorbs a gap', () => {
    const r = hzRoute([hz({ type: 'gap', impulse: 1.4, strapJolt: 20 })]);
    const traces: Trace[] = [{ id: 't1', seed: r.seed, x: 102, type: 'plank', ownerName: 'x', useCount: 0, ageHours: 1 }];
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (s.x < 101) step(s, frame({ gait: 2 }), r, traces, tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
  });
});

describe('recover', () => {
  it('freezes the rig for recoverTicks, then returns the item with extra stress', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (!s.items[0]!.lost) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(s.ended).toBe('spilled');                  // single-item spill ends the run; RECOVER is still accepted in that state
    const stressBefore = s.items[0]!.stress; const reserveBefore = s.reserve; const xBefore = s.x;
    step(s, frame({ recover: true, ballast: -60 }), r, [], tuning, rng);
    expect(s.ended).toBeNull();
    expect(s.recovering).toBe(tuning.recoverTicks);
    expect(s.reserve).toBeCloseTo(reserveBefore - tuning.recoverCost);
    for (let i = 0; i < tuning.recoverTicks; i++) step(s, frame({ ballast: -60 }), r, [], tuning, rng);
    expect(s.recovering).toBe(0);
    expect(s.items[0]!.lost).toBe(false);
    expect(s.items[0]!.stress).toBeCloseTo(stressBefore + tuning.recoverStress);
    expect(s.x).toBe(xBefore);
  });

  it('is ignored when reserve cannot cover recoverCost', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (!s.items[0]!.lost) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    s.reserve = tuning.recoverCost;
    step(s, frame({ recover: true }), r, [], tuning, rng);
    expect(s.recovering).toBe(0);
    expect(s.ended).toBe('spilled');
  });
});

describe('autoTrim', () => {
  it('reduces uncountered tilt on a slope', () => {
    const r = slopeRoute(0.3, 5000);
    const eq = (autoTrim: number) => { const t = { ...tuning, autoTrim }; const s = createRun(r, [], t); const rng = mulberry32(1); for (let i = 0; i < 1200; i++) step(s, frame({ gait: 1 }), r, [], t, rng); return Math.abs(s.tilt); };
    expect(eq(0.3)).toBeLessThan(eq(0) * 0.8);
  });
});
