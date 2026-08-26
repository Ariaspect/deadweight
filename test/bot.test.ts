import { describe, it, expect } from 'vitest';
import { runHeadless, LagBuffer, botPolicy } from '../src/sim/bot';
import { generateRoute, routeFromSegments } from '../src/sim/terrain';
import { createRun } from '../src/sim/step';
import { tuning, outposts, hazards } from '../src/content';
import { flatRoute, slopeRoute, crateDef } from './helpers';

describe('LagBuffer', () => {
  it('returns the view from lag ticks ago', () => {
    const lb = new LagBuffer(2);
    const s = createRun(flatRoute(), [], tuning);
    s.x = 1; lb.push(s); s.x = 2; lb.push(s); s.x = 3;
    expect(lb.push(s).x).toBe(1);
  });
});

describe('bot', () => {
  it('delivers a crate on flat ground with 5 stars', () => {
    const { result } = runHeadless(flatRoute(300), [{ def: crateDef(), slot: 1 }], tuning);
    expect(result.ended).toBe('arrived'); expect(result.stars).toBe(5);
  });
  it('holds a steady slope with a fore-slotted crate', () => {
    const { state, result } = runHeadless(slopeRoute(0.3, 400), [{ def: crateDef(), slot: 0 }], tuning, { lagTicks: 15 });
    expect(result.ended).toBe('arrived');
    expect(state.items[0]!.lost).toBe(false);
    expect(result.stars).toBeGreaterThanOrEqual(4);
  });
  it('completes a generated tier-0 route within the reserve', () => {
    for (const seed of [4417, 1, 2, 3, 4]) {
      const route = generateRoute(seed, 600, 0, [], tuning.terrain);
      const { result } = runHeadless(route, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15 });
      expect(result.ended, `seed ${seed}`).toBe('arrived');
      expect(result.stars, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('bot v2', () => {
  it('braces ahead of a gap, not for gusts or grades', () => {
    const r = routeFromSegments(3, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [
      { id: 0, type: 'gap', x: 100, z: 0, halfW: 40, impulse: 1.4, strapJolt: 20, dir: 1 },
      { id: 1, type: 'grade', x: 200, z: 0, halfW: 40, impulse: 0, strapJolt: 0, dir: 1 },
    ], 10);
    const v = (x: number) => ({ x, z: 0, tilt: 0, tiltVel: 0, strap: 80, braced: false, recovering: 0, items: [] });
    expect(botPolicy(v(100 - tuning.bot.braceAheadM + 1), r, tuning).brace).toBe(true);
    expect(botPolicy(v(50), r, tuning).brace).toBe(false);
    expect(botPolicy(v(195), r, tuning).brace).toBe(false);
    const gust = routeFromSegments(5, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [{ id: 0, type: 'gust', x: 100, z: 0, halfW: 40, impulse: 0.9, strapJolt: 12, dir: 1 }], 10);
    expect(botPolicy(v(100 - tuning.bot.braceAheadM + 1), gust, tuning).brace).toBe(false);   // gusts are ridden out on the PD loop; bracing everything starves reserve
  });
  it('taps strap when loose and recovers when an item is lost', () => {
    const r = flatRoute();
    const base = { x: 10, z: 0, tilt: 0, tiltVel: 0, braced: false, recovering: 0 };
    expect(botPolicy({ ...base, strap: 30, items: [] }, r, tuning).strap).toBe(true);
    expect(botPolicy({ ...base, strap: 90, items: [] }, r, tuning).strap).toBe(false);
    const lost = { ...createRun(r, [{ def: crateDef(), slot: 1 }], tuning).items[0]!, lost: true };
    expect(botPolicy({ ...base, strap: 90, items: [lost] }, r, tuning).recover).toBe(true);
  });
  it('survives a gap by bracing', () => {
    const r = routeFromSegments(4, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [{ id: 0, type: 'gap', x: 150, z: 0, halfW: 40, impulse: 1.4, strapJolt: 20, dir: 1 }], 10);
    const { result } = runHeadless(r, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15 });
    expect(result.ended).toBe('arrived'); expect(result.items[0]!.lost).toBe(false);
  });
  it.skip('every shipped outpost is solvable at bot.lagTicks', () => {
    // re-enabled in Task 9 (lane planner)
    for (const o of outposts) {
      const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
      const { result } = runHeadless(route, [{ def: crateDef(), slot: 1 }], tuning);
      expect(result.ended, o.name).toBe('arrived');
      expect(result.stars, o.name).toBeGreaterThanOrEqual(1);
    }
  });
});
