import { describe, it, expect } from 'vitest';
import { resolveWalls, rectContains, isPassable } from '../src/sim/walls';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute } from './helpers';
import type { Wall } from '../src/sim/types';

const wall: Wall = { x0: 11, x1: 13, z0: -5, z1: 5, kind: 'wall' };
const rig = (x: number, z: number, speed: number, lateralVel: number) => { const s = createRun(flatRoute(), [], tuning); s.x = x; s.z = z; s.speed = speed; s.lateralVel = lateralVel; return s; };

describe('resolveWalls', () => {
  it('stops a head-on rig at the face and reports an x strike', () => {
    const s = rig(10, 0, 8, 0);
    const strike = resolveWalls(s, [wall], 1.6, 4);
    expect(s.x).toBeCloseTo(11 - 1.6); expect(s.speed).toBe(0);
    expect(strike).toEqual({ axis: 'x', speed: 8, dir: -1 });
  });
  it('kills only the lateral component when scraping along a side', () => {
    const s = rig(12, 6, 8, -5);
    const strike = resolveWalls(s, [wall], 1.6, 4);
    expect(s.z).toBeCloseTo(5 + 1.6); expect(s.lateralVel).toBe(0); expect(s.speed).toBe(8);
    expect(strike).toEqual({ axis: 'z', speed: 5, dir: 1 });
  });
  it('separates silently below strikeSpeed', () => {
    const s = rig(10, 0, 2, 0);
    expect(resolveWalls(s, [wall], 1.6, 4)).toBeNull();
    expect(s.x).toBeCloseTo(9.4); expect(s.speed).toBe(0);
  });
  it('ignores walls it does not touch and leaves velocity alone when moving away', () => {
    const a = rig(5, 0, 8, 0); expect(resolveWalls(a, [wall], 1.6, 4)).toBeNull(); expect(a.x).toBe(5);
    const b = rig(10, 0, -3, 0); resolveWalls(b, [wall], 1.6, 4); expect(b.speed).toBe(-3);
  });
  it('reports the hardest strike when two walls overlap the rig', () => {
    const s = rig(10, 4.5, 8, -6);
    const strike = resolveWalls(s, [wall, { x0: 8, x1: 12, z0: 6, z1: 9, kind: 'baffle' }], 1.6, 4);
    expect(strike?.speed).toBe(8);
  });
});

describe('rect helpers', () => {
  it('rectContains is inclusive', () => { expect(rectContains(wall, 11, 5)).toBe(true); expect(rectContains(wall, 13.1, 0)).toBe(false); });
  it('isPassable respects walls and the bound', () => {
    expect(isPassable([wall], 26, 12, 0)).toBe(false);
    expect(isPassable([wall], 26, 12, 7)).toBe(true);
    expect(isPassable([wall], 26, 12, 27)).toBe(false);
  });
});
