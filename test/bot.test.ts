import { describe, it, expect } from 'vitest';
import { runHeadless, LagBuffer } from '../src/sim/bot';
import { generateRoute } from '../src/sim/terrain';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
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
