import { describe, it, expect } from 'vitest';
import { createRun, step, itemAtSlot } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, frame, crateDef, hazard } from './helpers';
import { routeFromSegments } from '../src/sim/terrain';

const three = () => [{ def: crateDef({ id: 'a', behavior: 'static' }), slot: 0 }, { def: crateDef({ id: 'b', behavior: 'livestock' }), slot: 1 }, { def: crateDef({ id: 'c', behavior: 'slosh' }), slot: 2 }];

describe('per-bay restraint', () => {
  it('starts every bay at strapStart with the lowest slot selected', () => {
    const s = createRun(flatRoute(), three(), tuning);
    expect(s.items.map((it) => it.restraint)).toEqual([70, 70, 70]);
    expect(s.selectedSlot).toBe(0); expect(s.strap).toBe(tuning.strapStart);
  });
  it('F ratchets only the selected bay; 5/6/7 (cargoSelect) switches it; strap mirrors the selection', () => {
    const r = flatRoute(); const s = createRun(r, three(), tuning); const rng = mulberry32(1);
    step(s, frame({ strap: true }), r, [], tuning, rng);
    expect(itemAtSlot(s, 0)!.restraint).toBeCloseTo(70 + tuning.strapTap, 1);
    expect(itemAtSlot(s, 1)!.restraint).toBeLessThanOrEqual(70);
    step(s, frame({ cargoSelect: 2, strap: true }), r, [], tuning, rng);
    expect(s.selectedSlot).toBe(2);
    expect(itemAtSlot(s, 2)!.restraint).toBeCloseTo(70 + tuning.strapTap, 1);
    expect(s.strap).toBeCloseTo(itemAtSlot(s, 2)!.restraint);
    step(s, frame({ cargoSelect: 7 }), r, [], tuning, rng);
    expect(s.selectedSlot).toBe(2);   // no bay there — ignored
  });
  it('restraint decays by behaviour: livestock loosens, static does not', () => {
    const r = flatRoute(); const s = createRun(r, three(), tuning); const rng = mulberry32(1);
    for (let i = 0; i < 600; i++) step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(itemAtSlot(s, 0)!.restraint).toBe(70);
    expect(itemAtSlot(s, 1)!.restraint).toBeCloseTo(70 - tuning.restraintDecay.livestock * 10, 1);
    expect(itemAtSlot(s, 2)!.restraint).toBeCloseTo(70 - tuning.restraintDecay.slosh * 10, 1);
  });
  it('a gust loosens every bay', () => {
    const r = routeFromSegments(9, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], [hazard({ x: 30 })], 10);
    const s = createRun(r, three(), tuning); const rng = mulberry32(1);
    while (s.x < 31) step(s, frame({ gait: 2 }), r, [], tuning, rng);
    for (const it of s.items) expect(it.restraint).toBeLessThan(70 - 12 + 0.5);
  });
  it('drift and crush use the item\'s own restraint', () => {
    const r = flatRoute(); const s = createRun(r, [{ def: crateDef({ id: 'loose' }), slot: 0 }, { def: crateDef({ id: 'tight', crushLimit: 60 }), slot: 2 }], tuning);
    s.items[0]!.restraint = 0; s.items[1]!.restraint = 100; s.tilt = 0.6;
    const rng = mulberry32(2);
    for (let i = 0; i < 120; i++) step(s, frame({ gait: 0, throttle: 0, ballast: 0 }), r, [], tuning, rng);
    expect(Math.abs(s.items[0]!.offset)).toBeGreaterThan(Math.abs(s.items[1]!.offset));
    expect(s.items[1]!.stress).toBeGreaterThan(0);
  });
  it('strap readout follows the selected bay through spill and recovery', () => {
    const r = slopeRoute(0.5, 5000); const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (!s.items[0]!.lost) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(s.strap).toBe(0);                                   // the selected bay is gone
    step(s, frame({ recover: true, ballast: -60 }), r, [], tuning, rng);
    for (let i = 0; i < tuning.recoverTicks; i++) step(s, frame({ ballast: -60 }), r, [], tuning, rng);
    expect(s.items[0]!.lost).toBe(false);
    expect(s.strap).toBe(s.items[0]!.restraint);              // synced on the restore tick, not a tick later
  });
});
