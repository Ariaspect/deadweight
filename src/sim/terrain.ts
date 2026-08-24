import { mulberry32 } from './rng';
import type { HazardDef, HazardInstance, RouteDef, Segment, TerrainTuning } from './types';

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

function findSegment(segments: Segment[], x: number): Segment {
  let lo = 0, hi = segments.length - 1;
  if (x <= segments[0]!.x0) return segments[0]!;
  if (x >= segments[hi]!.x1) return segments[hi]!;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid]!;
    if (x < s.x0) hi = mid - 1;
    else if (x >= s.x1) lo = mid + 1;
    else return s;
  }
  return segments[lo]!;
}

export function routeFromSegments(seed: number, segments: Segment[], hazards: HazardInstance[], profileStepM: number): RouteDef {
  const length = segments[segments.length - 1]!.x1;
  const slopeAt = (x: number): number => findSegment(segments, x).slope;
  const heightAt = (x: number): number => {
    const s = findSegment(segments, x);
    const cx = clamp(x, s.x0, s.x1);
    return s.y0 + s.slope * (cx - s.x0);
  };
  const slopeProfile: number[] = [];
  for (let x = 0; x <= length; x += profileStepM) slopeProfile.push(slopeAt(x));
  return { seed, length, segments, hazards: [...hazards].sort((a, b) => a.x - b.x), slopeProfile, slopeAt, heightAt };
}

export function generateRoute(seed: number, lengthM: number, tier: number, hazardDefs: HazardDef[], t: TerrainTuning): RouteDef {
  const rng = mulberry32(seed);
  const sigma = t.slopeSigma[Math.min(tier, t.slopeSigma.length - 1)]!;
  const eligible = hazardDefs.filter((d) => d.minTier <= tier);
  const segments: Segment[] = [];
  const hazards: HazardInstance[] = [];
  let x = 0, y = 0, id = 0;

  while (x < lengthM) {
    const len = t.segMin + rng.next() * (t.segMax - t.segMin);
    const x1 = Math.min(lengthM, x + len);
    const inSafe = x < t.safeStartM || x1 > lengthM - t.safeEndM;
    let slope = inSafe ? 0 : clamp(rng.gaussian() * sigma, -t.maxSlope, t.maxSlope);

    if (!inSafe) {
      for (const def of eligible) {
        if (rng.next() >= def.weight) continue;
        const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
        if (def.type === 'grade') {
          slope = dir * t.gradeSlope;
          hazards.push({ id: id++, type: 'grade', x: x + 1, impulse: 0, strapJolt: 0, dir });
          continue;
        }
        const count = def.count ?? 1;
        const spread = def.spreadM ?? 0;
        const mid = (x + x1) / 2 + (rng.next() * 2 - 1) * t.hazardJitter;
        for (let c = 0; c < count; c++) {
          const hx = clamp(mid + (count > 1 ? (c / (count - 1) - 0.5) * spread : 0), t.safeStartM, lengthM - t.safeEndM);
          hazards.push({ id: id++, type: def.type, x: hx, impulse: def.impulse, strapJolt: def.strapJolt, dir });
        }
      }
    }
    segments.push({ x0: x, x1, slope, y0: y });
    y += slope * (x1 - x);
    x = x1;
  }
  return routeFromSegments(seed, segments, hazards, t.profileStepM);
}
