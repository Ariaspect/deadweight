import { describe, it, expect } from 'vitest';
import { createRun, step, stepItems } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, crateDef, frame } from './helpers';

function held(tilt: number, strap: number, def = crateDef(), ticks = 120) {
  const s = createRun(flatRoute(), [{ def, slot: 1 }], tuning);
  s.tilt = tilt; s.items[0]!.restraint = strap;
  const rng = mulberry32(5);
  for (let i = 0; i < ticks; i++) stepItems(s, tuning, rng);
  return s.items[0]!;
}

describe('stepItems', () => {
  it('does not drift below driftThreshold', () => {
    expect(held(tuning.driftThreshold * 0.9, 0).offset).toBe(0);
  });
  it('static item drifts in the direction of tilt after the grace window when straps are loose', () => {
    const it = held(0.6, 0);
    expect(it.offset).toBeGreaterThan(0.05);
    expect(held(-0.6, 0).offset).toBeLessThan(-0.05);
  });
  it('does not drift inside the grace window', () => {
    expect(held(0.6, 0, crateDef(), tuning.graceTicks).offset).toBe(0);
  });
  it('full strap tension stops static drift', () => {
    expect(held(0.6, 100).offset).toBe(0);
  });
  it('precarious drifts faster than static', () => {
    // 60 ticks = 36 drifting ticks after the grace window: static ≈ 0.29, precarious ≈ 0.86 — neither hits the ±1.5 clamp
    expect(held(0.6, 0, crateDef({ behavior: 'precarious' }), 60).offset).toBeGreaterThan(held(0.6, 0, crateDef(), 60).offset * 2);
  });
  it('slosh chases tilt even with full straps', () => {
    expect(Math.abs(held(0.6, 100, crateDef({ behavior: 'slosh' })).offset)).toBeGreaterThan(0.1);
  });
  it('livestock wanders even when level, deterministically', () => {
    const a = held(0, 70, crateDef({ behavior: 'livestock' }), 600).offset;
    const b = held(0, 70, crateDef({ behavior: 'livestock' }), 600).offset;
    expect(a).not.toBe(0); expect(a).toBe(b);
  });
  it('accrues stress above tolerance and above crushLimit', () => {
    expect(held(0.3, 70, crateDef({ tolerance: 0.5 })).stress).toBe(0);
    expect(held(0.7, 70, crateDef({ tolerance: 0.5 })).stress).toBeGreaterThan(0);
    expect(held(0, 95, crateDef({ crushLimit: 90 })).stress).toBeGreaterThan(0);
  });
});

describe('spill', () => {
  it('loses the worst-placed item at spillTilt and ends when all are lost', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef({ id: 'a' }), slot: 2 }, { def: crateDef({ id: 'b' }), slot: 1 }], tuning);
    const rng = mulberry32(1);
    let firstLost: string | null = null;
    for (let i = 0; i < 6000 && !s.ended; i++) {
      step(s, frame({ gait: 1, ballast: 0 }), r, [], tuning, rng);
      if (!firstLost) { const l = s.items.find((it) => it.lost); if (l) firstLost = l.id; }
    }
    expect(firstLost).toBe('a');           // aft slot (+1) is furthest from centre under nose-up tilt
    expect(s.ended).toBe('spilled');
    expect(s.items.every((it) => it.lost)).toBe(true);
  });
  it('relieves tilt on spill', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(1);
    while (!s.items[0]!.lost) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(Math.abs(s.tilt)).toBeLessThan(tuning.spillTilt);
    expect(s.tiltVel).toBe(0);
  });
});
