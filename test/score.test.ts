import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/sim/score';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute, crateDef } from './helpers';

function state(stresses: number[], over: Partial<ReturnType<typeof createRun>> = {}) {
  const s = createRun(flatRoute(), stresses.map((_, i) => ({ def: crateDef({ id: `i${i}`, payout: 100 }), slot: i })), tuning);
  stresses.forEach((st, i) => { s.items[i]!.stress = st; });
  Object.assign(s, { ended: 'arrived', reserve: 40 }, over);
  return s;
}

describe('evaluate', () => {
  it('5 stars and full payout for pristine arrival', () => {
    const r = evaluate(state([0, 0]), tuning);
    expect(r.stars).toBe(5); expect(r.payout).toBe(200);
    expect(r.bonus).toBeCloseTo(40 * tuning.kBonus);
    expect(r.total).toBe(Math.round(200 + 40 * tuning.kBonus));
  });
  it('buckets by mean condition', () => {
    expect(evaluate(state([0.9]), tuning).stars).toBe(1);
    expect(evaluate(state([0.6]), tuning).stars).toBe(2);
    expect(evaluate(state([0.4]), tuning).stars).toBe(3);
    expect(evaluate(state([0.2]), tuning).stars).toBe(4);
    expect(evaluate(state([0.05]), tuning).stars).toBe(5);
  });
  it('lost item pays 0 and costs a star', () => {
    const s = state([0, 0]); s.items[1]!.lost = true;
    const r = evaluate(s, tuning);
    expect(r.stars).toBe(4); expect(r.payout).toBe(100); expect(r.items[1]!.lost).toBe(true);
  });
  it('a late rush item still pays in full; delivering it on time earns a bonus', () => {
    const overdue = state([0]); overdue.items[0]!.deadlineTick = 100; overdue.t = 101;
    const rl = evaluate(overdue, tuning);
    expect(rl.items[0]!.late).toBe(true); expect(rl.items[0]!.rushed).toBe(true);
    expect(rl.payout).toBe(100); expect(rl.rushBonus).toBe(0);
    const punctual = state([0]); punctual.items[0]!.deadlineTick = 100; punctual.t = 99;
    const ro = evaluate(punctual, tuning);
    expect(ro.items[0]!.late).toBe(false);
    expect(ro.rushBonus).toBeCloseTo(100 * tuning.rushBonusMul);
    expect(ro.total).toBe(Math.round(ro.payout + ro.bonus + ro.discoveryBonus + ro.rushBonus));
  });
  it('stall multiplies payout, caps stars at 2, no bonus', () => {
    const r = evaluate(state([0], { ended: 'stalled' }), tuning);
    expect(r.payout).toBeCloseTo(100 * tuning.stallMultiplier);
    expect(r.stars).toBeLessThanOrEqual(2); expect(r.bonus).toBe(0);
  });
  it('total spill is 1 star, zero total', () => {
    const s = state([0]); s.items[0]!.lost = true; s.ended = 'spilled';
    const r = evaluate(s, tuning);
    expect(r.stars).toBe(1); expect(r.total).toBe(0);
  });
  it('adds a salvage bonus for exploration discoveries', () => {
    const s = state([0]); s.foundDiscoveries = [0, 2];
    const r = evaluate(s, tuning);
    expect(r.discoveryBonus).toBe(tuning.cacheBonus * 2);
    expect(r.total).toBe(Math.round(r.payout + r.bonus + r.discoveryBonus));
  });
});
