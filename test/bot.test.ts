import { describe, it, expect } from 'vitest';
import { runHeadless, LagBuffer, botPolicy, laneScore } from '../src/sim/bot';
import { generateRoute, routeFromSegments } from '../src/sim/terrain';
import { createRun, step } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
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
    const v = (x: number) => ({ x, z: 0, lateralVel: 0, tilt: 0, tiltVel: 0, strap: 80, braced: false, recovering: 0, items: [] });
    expect(botPolicy(v(100 - tuning.bot.braceAheadM + 1), r, tuning).brace).toBe(true);
    expect(botPolicy(v(50), r, tuning).brace).toBe(false);
    expect(botPolicy(v(195), r, tuning).brace).toBe(false);
    const gust = routeFromSegments(5, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [{ id: 0, type: 'gust', x: 100, z: 0, halfW: 40, impulse: 0.9, strapJolt: 12, dir: 1 }], 10);
    expect(botPolicy(v(100 - tuning.bot.braceAheadM + 1), gust, tuning).brace).toBe(false);   // gusts are ridden out on the PD loop; bracing everything starves reserve
  });
  it('taps strap when loose and recovers when an item is lost', () => {
    const r = flatRoute();
    const base = { x: 10, z: 0, lateralVel: 0, tilt: 0, tiltVel: 0, braced: false, recovering: 0 };
    const loose = { ...createRun(r, [{ def: crateDef(), slot: 1 }], tuning).items[0]!, restraint: 30 };
    const tight = { ...createRun(r, [{ def: crateDef(), slot: 1 }], tuning).items[0]!, restraint: 90 };
    const loosePolicy = botPolicy({ ...base, strap: 30, items: [loose] }, r, tuning);
    expect(loosePolicy.strap).toBe(true);
    expect(loosePolicy.cargoSelect).toBe(1);
    expect(botPolicy({ ...base, strap: 90, items: [tight] }, r, tuning).strap).toBe(false);
    const lost = { ...createRun(r, [{ def: crateDef(), slot: 1 }], tuning).items[0]!, lost: true };
    expect(botPolicy({ ...base, strap: 90, items: [lost] }, r, tuning).recover).toBe(true);
  });
  it('survives a gap by bracing', () => {
    const r = routeFromSegments(4, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [{ id: 0, type: 'gap', x: 150, z: 0, halfW: 40, impulse: 1.4, strapJolt: 20, dir: 1 }], 10);
    const { result } = runHeadless(r, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15 });
    expect(result.ended).toBe('arrived'); expect(result.items[0]!.lost).toBe(false);
  });
  it('every shipped outpost is solvable at bot.lagTicks', () => {
    for (const o of outposts) {
      const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
      const { result } = runHeadless(route, [{ def: crateDef(), slot: 1 }], tuning);
      expect(result.ended, o.name).toBe('arrived');
      expect(result.stars, o.name).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('bot v3 — lanes', () => {
  it('scores a lane by its hazards, movers and baffles', () => {
    const fork = { x0: 100, x1: 200, lanes: [{ z0: -18, z1: -4, archetype: 'direct' as const }, { z0: -1.5, z1: 18, archetype: 'chicane' as const }] };
    const r = routeFromSegments(1, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], [
      { id: 0, type: 'rubble', x: 150, z: -11, halfW: 7, impulse: 0.35, strapJolt: 25, dir: 1 },
      { id: 1, type: 'rockfall', x: 140, x1: 148, z: -11, halfW: 7, impulse: 1.2, strapJolt: 22, dir: 1, cycleTicks: 360, windowTicks: 72, phase: 0 },
    ], 10, [], { forks: [fork], walls: [{ x0: 130, x1: 132, z0: -1.5, z1: 9, kind: 'baffle' }, { x0: 160, x1: 162, z0: 7, z1: 18, kind: 'baffle' }], pockets: [] }, 18);
    expect(laneScore(r, fork, 0)).toBeCloseTo(0.35 + 1.2 * 1.5);
    expect(laneScore(r, fork, 1)).toBeCloseTo(1.6);
  });
  it('steers into the safe lane before a fork and holds it inside', () => {
    const r = generateRoute(9026, 800, 2, hazards, tuning.terrain);
    const fork = r.forks[0]!;
    const safeLanes = fork.lanes.map((lane, i) => ({ i, lane, score: laneScore(r, fork, i) })).sort((a, b) => a.score - b.score);
    const { state, result } = runHeadless(r, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15, maxTicks: 60 * 60 });
    void state;
    expect(result.ended).not.toBe('spilled');
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1); const lag = new LagBuffer(15);
    while (s.x < fork.x0 + 5 && !s.ended) step(s, botPolicy(lag.push(s), r, tuning), r, [], tuning, rng);
    const chosen = r.laneAt(s.x, s.z);
    expect(chosen).toBeGreaterThanOrEqual(0);
    expect(laneScore(r, fork, chosen)).toBeCloseTo(safeLanes[0]!.score);
  });
  it('never jumps and always holds W', () => {
    const r = flatRoute();
    const f = botPolicy({ x: 10, z: 0, lateralVel: 0, tilt: 0, tiltVel: 0, strap: 80, braced: false, recovering: 0, items: [] }, r, tuning);
    expect(f.throttle).toBe(1); expect(f.jump).toBeFalsy();
  });
});
