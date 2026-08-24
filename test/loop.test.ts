import { describe, it, expect } from 'vitest';
import { GameLoop } from '../src/game/loop';
import { frame } from './helpers';

function make(dt = 1 / 60) {
  const steps: number[] = []; const renders: number[] = []; let g = 0;
  const loop = new GameLoop({
    dt,
    sampleInput: () => frame({ gait: (g++ % 5) as 0 | 1 | 2 | 3 | 4 }),
    step: () => { steps.push(1); },
    render: (a) => { renders.push(a); },
  });
  return { loop, steps, renders };
}

describe('GameLoop', () => {
  it('steps exactly floor(elapsed/dt) times and renders once per tick()', () => {
    const { loop, steps, renders } = make();
    loop.start(0);
    loop.tick(1000 / 60 * 3 + 1);   // ~3 steps
    expect(steps.length).toBe(3);
    expect(renders.length).toBe(1);
    expect(renders[0]!).toBeGreaterThanOrEqual(0);
    expect(renders[0]!).toBeLessThan(1);
  });
  it('records one InputFrame per step', () => {
    const { loop } = make();
    loop.start(0);
    loop.tick(105);
    expect(loop.log.length).toBe(6);
    expect(loop.log[0]!.gait).toBe(0);
    expect(loop.log[1]!.gait).toBe(1);
  });
  it('clamps huge frames to maxFrameMs (no spiral of death)', () => {
    const { loop, steps } = make();
    loop.start(0);
    loop.tick(10000);
    expect(steps.length).toBe(Math.floor(250 / 1000 * 60));
  });
  it('does nothing after stop()', () => {
    const { loop, steps } = make();
    loop.start(0); loop.stop(); loop.tick(500);
    expect(steps.length).toBe(0);
  });
});
