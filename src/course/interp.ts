import type { CourseFrame, Pose, Quat, Vec3 } from './types';

/** Above this per-tick displacement the pose is treated as a teleport (checkpoint reset, boulder respawn) and snapped, not smeared. */
const SNAP_M = 6;

const clamp01 = (t: number): number => t < 0 ? 0 : t > 1 ? 1 : t;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }   // shortest arc
  let s0: number, s1: number;
  if (cos > 0.9995) { s0 = 1 - t; s1 = t; }
  else { const th = Math.acos(cos), sin = Math.sin(th); s0 = Math.sin((1 - t) * th) / sin; s1 = Math.sin(t * th) / sin; }
  const x = a.x * s0 + bx * s1, y = a.y * s0 + by * s1, z = a.z * s0 + bz * s1, w = a.w * s0 + bw * s1;
  const n = Math.hypot(x, y, z, w) || 1;
  return { x: x / n, y: y / n, z: z / n, w: w / n };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  if (dist(a.position, b.position) > SNAP_M) return b;
  return { position: lerpVec(a.position, b.position, t), rotation: slerp(a.rotation, b.rotation, t) };
}

/** Render-side interpolation between the last two physics frames: `prev + (curr − prev)·alpha`, alpha ∈ [0, 1). */
export function lerpFrame(prev: CourseFrame, curr: CourseFrame, alpha: number): CourseFrame {
  if (prev === curr) return curr;
  if (dist(prev.vehicle.position, curr.vehicle.position) > SNAP_M) return curr;
  const t = clamp01(alpha);
  return {
    ...curr,
    vehicle: lerpPose(prev.vehicle, curr.vehicle, t),
    cargo: curr.cargo.map((c, i) => {
      const p = prev.cargo[i];
      return p && p.id === c.id && !c.lost ? { ...c, pose: lerpPose(p.pose, c.pose, t), anchor: lerpVec(p.anchor, c.anchor, t) } : c;
    }),
    obstacles: curr.obstacles.map((o, i) => {
      const p = prev.obstacles[i];
      return p && p.id === o.id ? { id: o.id, pose: lerpPose(p.pose, o.pose, t) } : o;
    }),
    speed: prev.speed + (curr.speed - prev.speed) * t,
    elapsed: prev.elapsed + (curr.elapsed - prev.elapsed) * t,
  };
}
