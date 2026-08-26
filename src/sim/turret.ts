import type { Rng } from './rng';
import type { Tuning, Turret } from './types';

const TAN_22_5 = 0.41421356;    // tan(22.5 deg)
const TAN_67_5 = 2.41421356;    // tan(67.5 deg)

/**
 * Which 45-degree sector a vector points into: 0 is +x (dead ahead), counting anticlockwise through
 * +z. Comparisons only — src/sim forbids Math.atan2, so a bearing is never computed as an angle.
 */
export function octantOf(dx: number, dz: number): number {
  const ax = Math.abs(dx), az = Math.abs(dz);
  const shallow = az < ax * TAN_22_5;    // within 22.5 deg of the x axis
  const steep = az > ax * TAN_67_5;      // within 22.5 deg of the z axis
  if (shallow) return dx >= 0 ? 0 : 4;
  if (steep) return dz >= 0 ? 2 : 6;
  if (dx >= 0) return dz >= 0 ? 1 : 7;
  return dz >= 0 ? 3 : 5;
}

/** 1 at launch, `levels` at impact. Pure function of how far through the flight the missile is. */
export function dangerLevel(elapsed: number, tuning: Tuning): number {
  const t = tuning.turret;
  const raw = Math.ceil(t.levels * elapsed / t.flightTicks);
  return raw < 1 ? 1 : raw > t.levels ? t.levels : raw;
}

/** Emplacements sit off the corridor entirely, so they read as distant silhouettes, not obstacles. */
export function placeTurrets(rng: Rng, lengthM: number, tier: number, tuning: Tuning): Turret[] {
  const t = tuning.turret;
  const count = t.countByTier[Math.min(tier, t.countByTier.length - 1)] ?? 0;
  const turrets: Turret[] = [];
  for (let i = 0; i < count; i++) {
    const span = lengthM / (count + 1);
    const x = span * (i + 1) + (rng.next() - 0.5) * span * 0.5;
    const side = rng.next() < 0.5 ? 1 : -1;
    turrets.push({
      id: i,
      x,
      z: side * (t.offCorridorZ + rng.next() * 30),
      phase: Math.floor(rng.next() * t.cooldownTicks),
    });
  }
  return turrets;
}
