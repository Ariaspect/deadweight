import { describe, expect, it } from 'vitest';
import { lerpFrame, slerp } from '../src/course/interp';
import type { CourseFrame } from '../src/course/types';
import { createRun } from '../src/sim/step';
import { flatRoute } from './helpers';
import { tuning } from '../src/content';

const I = { x: 0, y: 0, z: 0, w: 1 };
function frameAt(x: number, over: Partial<CourseFrame> = {}): CourseFrame {
  const state = createRun(flatRoute(), [], tuning);
  return {
    vehicle: { position: { x, y: 2, z: 0 }, rotation: I },
    cargo: [{ id: 'c', pose: { position: { x: x + 1, y: 5, z: 0 }, rotation: I }, anchor: { x, y: 5, z: 0 }, condition: 1, lost: false, tension: 0, restraint: 1, selected: true }],
    obstacles: [{ id: 'o', pose: { position: { x: 10, y: x, z: 0 }, rotation: I } }],
    state, speed: x, elapsed: x / 10, checkpoint: 0, resets: 0, salvage: [], finishDistance: 100 - x, message: null, ...over,
  };
}

describe('course frame interpolation', () => {
  it('alpha 0 → prev, alpha 1 → curr, 0.5 → midpoint for vehicle, cargo, obstacles, speed', () => {
    const a = frameAt(0), b = frameAt(2);
    expect(lerpFrame(a, b, 0).vehicle.position.x).toBe(0);
    expect(lerpFrame(a, b, 1).vehicle.position.x).toBe(2);
    const m = lerpFrame(a, b, 0.5);
    expect(m.vehicle.position.x).toBe(1);
    expect(m.cargo[0]!.pose.position.x).toBe(2); expect(m.cargo[0]!.anchor.x).toBe(1);
    expect(m.obstacles[0]!.pose.position.y).toBe(1);
    expect(m.speed).toBe(1); expect(m.elapsed).toBeCloseTo(0.1);
    expect(m.state).toBe(b.state); expect(m.message).toBe(b.message);
  });
  it('snaps instead of smearing across a teleport (checkpoint reset)', () => {
    const a = frameAt(0), b = frameAt(40);
    expect(lerpFrame(a, b, 0.5)).toBe(b);
  });
  it('slerp halves a 90° yaw', () => {
    const q = slerp(I, { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, 0.5);
    expect(q.y).toBeCloseTo(Math.sin(Math.PI / 8)); expect(q.w).toBeCloseTo(Math.cos(Math.PI / 8));
  });
});
