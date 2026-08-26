import { describe, it, expect } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { generateRoute } from '../src/sim/terrain';
import { mulberry32, hashSeed } from '../src/sim/rng';
import { GameLoop } from '../src/game/loop';
import { tuning, hazards } from '../src/content';
import { crateDef, frame } from './helpers';
import type { InputFrame, Gait } from '../src/sim/types';

const route = generateRoute(4417, 700, 2, hazards, tuning);
const loadout = [{ def: crateDef({ behavior: 'livestock' }), slot: 0 }, { def: crateDef({ id: 'soup', behavior: 'slosh' }), slot: 2 }];

function script(i: number): InputFrame {
  return frame({ gait: ((Math.floor(i / 300) % 4) + 1) as Gait, ballast: Math.floor(i / 120) % 2 === 0 ? 60 : -60, strap: i % 90 === 0, jump: i % 400 === 0, steer: ((Math.floor(i / 150) % 3) - 1) as -1 | 0 | 1, throttle: 1 });
}

function play(inputs: InputFrame[]) {
  const s = createRun(route, loadout, tuning);
  const rng = mulberry32(hashSeed(route.seed, 7));
  // 'spilled' stays open (RECOVER window; t keeps advancing) — only stalled/arrived freeze the state.
  for (const inp of inputs) { if (s.ended === 'stalled' || s.ended === 'arrived') break; step(s, inp, route, [], tuning, rng); }
  return s;
}

describe('determinism', () => {
  it('identical inputs and seed give byte-identical state', () => {
    const inputs = Array.from({ length: 3000 }, (_, i) => script(i));
    expect(JSON.stringify(play(inputs))).toBe(JSON.stringify(play(inputs)));
  });
  it('a GameLoop input log replays to the same state', () => {
    const live = createRun(route, loadout, tuning);
    const rng = mulberry32(hashSeed(route.seed, 7));
    let i = 0;
    const loop = new GameLoop({ dt: tuning.dt, sampleInput: () => script(i++), step: (inp) => step(live, inp, route, [], tuning, rng), render: () => {} });
    loop.start(0);
    for (let ms = 16.7; ms < 20000; ms += 16.7) loop.tick(ms);
    const replayed = play(loop.log);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });
});
