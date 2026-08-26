import type { Rect, RigState, Wall } from './types';

export interface WallStrike { axis: 'x' | 'z'; speed: number; dir: 1 | -1 }

export function rectContains(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/**
 * Axis-aligned rig box (half-size r) against wall rects. For every overlap, separate along the axis of least
 * penetration, kill the velocity component moving into the wall (no bounce) and remember the hardest impact above
 * strikeSpeed. Walls are scanned in array order, so the result is deterministic. No sqrt anywhere.
 */
export function resolveWalls(s: RigState, walls: Wall[], r: number, strikeSpeed: number): WallStrike | null {
  let strike: WallStrike | null = null;
  for (const w of walls) {
    const leftPen = s.x + r - w.x0, rightPen = w.x1 - (s.x - r);
    const lowPen = s.z + r - w.z0, highPen = w.z1 - (s.z - r);
    if (leftPen <= 0 || rightPen <= 0 || lowPen <= 0 || highPen <= 0) continue;
    const px = Math.min(leftPen, rightPen), pz = Math.min(lowPen, highPen);
    if (px < pz) {
      const dir: 1 | -1 = leftPen < rightPen ? -1 : 1;
      s.x += dir * px;
      if (s.speed * dir < 0) {
        const v = Math.abs(s.speed); s.speed = 0;
        if (v > strikeSpeed && (!strike || v > strike.speed)) strike = { axis: 'x', speed: v, dir };
      }
    } else {
      const dir: 1 | -1 = lowPen < highPen ? -1 : 1;
      s.z += dir * pz;
      if (s.lateralVel * dir < 0) {
        const v = Math.abs(s.lateralVel); s.lateralVel = 0;
        if (v > strikeSpeed && (!strike || v > strike.speed)) strike = { axis: 'z', speed: v, dir };
      }
    }
  }
  return strike;
}

export function isPassable(walls: Wall[], bound: number, x: number, z: number): boolean {
  if (z < -bound || z > bound) return false;
  for (const w of walls) if (rectContains(w, x, z)) return false;
  return true;
}
