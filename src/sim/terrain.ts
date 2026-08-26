import { mulberry32, type Rng } from './rng';
import { layoutCourse, laneCentre, laneHalfWidth } from './course';
import { scheduleStorms } from './storm';
import type { Discovery, Fork, HazardDef, HazardInstance, HazardType, Layout, RouteDef, Segment, StormFront, Tuning } from './types';

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

const EMPTY_LAYOUT: Layout = { forks: [], walls: [], pockets: [] };

export function routeFromSegments(seed: number, segments: Segment[], hazards: HazardInstance[], profileStepM: number, discoveries: Discovery[] = [], layout: Layout = EMPTY_LAYOUT, halfWidth = 18, storms: StormFront[] = []): RouteDef {
  const length = segments[segments.length - 1]!.x1;
  const slopeAt = (x: number): number => findSegment(segments, x).slope;
  const heightAt = (x: number): number => {
    const s = findSegment(segments, x);
    const cx = clamp(x, s.x0, s.x1);
    return s.y0 + s.slope * (cx - s.x0);
  };
  const centerAt = (x: number): number => {
    const s = findSegment(segments, x);
    const f = clamp((x - s.x0) / Math.max(0.001, s.x1 - s.x0), 0, 1);
    const z0 = s.z0 ?? 0, z1 = s.z1 ?? z0;
    return z0 + (z1 - z0) * f;
  };
  const forkAt = (x: number): Fork | null => {
    for (const f of layout.forks) { if (x < f.x0) return null; if (x <= f.x1) return f; }
    return null;
  };
  const laneAt = (x: number, z: number): number => {
    const f = forkAt(x);
    return f ? f.lanes.findIndex((l) => z >= l.z0 && z <= l.z1) : -1;
  };
  const slopeProfile: number[] = [];
  for (let x = 0; x <= length; x += profileStepM) slopeProfile.push(slopeAt(x));
  const sorted = [...hazards].sort((a, b) => a.x - b.x);
  return {
    seed, length, halfWidth, segments, hazards: sorted, zones: sorted.filter((h) => h.x1 !== undefined), discoveries, storms,
    walls: layout.walls, forks: layout.forks, pockets: layout.pockets, slopeProfile, slopeAt, heightAt, centerAt, forkAt, laneAt,
  };
}

const CACHE_NAMES = ['ABANDONED RELAY', 'SMUGGLER CACHE', 'LOST WEATHER POD', 'FORGOTTEN SHRINE', 'CRASHED DRONE', 'SURVEY CAMP'];
const STRETCH_TYPES: HazardType[] = ['gust', 'rubble', 'scree'];
const FORK_TYPES: HazardType[] = ['rubble', 'scree', 'gap', 'rockfall', 'crane'];

function weightedPick(rng: Rng, defs: HazardDef[], types: HazardType[]): HazardDef | null {
  const pool = defs.filter((d) => types.includes(d.type) && d.weight > 0);
  const total = pool.reduce((a, d) => a + d.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const d of pool) { r -= d.weight; if (r < 0) return d; }
  return pool[pool.length - 1]!;
}

export function generateRoute(seed: number, lengthM: number, tier: number, hazardDefs: HazardDef[], tuning: Tuning): RouteDef {
  const t = tuning.terrain;
  const rng = mulberry32(seed);
  const mapRng = mulberry32((seed ^ 0x6d2b79f5) >>> 0);
  const W = t.corridorHalfWidth;
  const sigma = t.slopeSigma[Math.min(tier, t.slopeSigma.length - 1)]!;
  const eligible = hazardDefs.filter((d) => d.minTier <= tier);
  const gradeDef = eligible.find((d) => d.type === 'grade');
  const segments: Segment[] = [];
  const hazards: HazardInstance[] = [];
  let x = 0, y = 0, z = 0, id = 0;

  while (x < lengthM) {
    const len = t.segMin + rng.next() * (t.segMax - t.segMin);
    const x1 = Math.min(lengthM, x + len);
    const inSafe = x < t.safeStartM || x1 > lengthM - t.safeEndM;
    let slope = inSafe ? 0 : clamp(rng.gaussian() * sigma, -t.maxSlope, t.maxSlope);
    let z1 = z;
    if (!inSafe) z1 = clamp(z + (mapRng.next() * 2 - 1) * t.pathWander, -t.pathWander * 1.65, t.pathWander * 1.65);
    if (x1 > lengthM - t.safeEndM) z1 = 0;
    if (!inSafe && gradeDef && rng.next() < gradeDef.weight) {
      const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
      slope = dir * t.gradeSlope;
      hazards.push({ id: id++, type: 'grade', x: x + 1, z: 0, halfW: W * 2, impulse: 0, strapJolt: 0, dir });
    }
    segments.push({ x0: x, x1, slope, y0: y, z0: z, z1 });
    y += slope * (x1 - x);
    z = z1;
    x = x1;
  }

  const layout = layoutCourse(mapRng, lengthM, tier, t);

  const place = (def: HazardDef, hx: number, hz: number, halfW: number, dir: 1 | -1): void => {
    if (def.cycleTicks !== undefined) {
      hazards.push({ id: id++, type: def.type, x: hx - 4, x1: hx + 4, z: hz, halfW, impulse: def.impulse, strapJolt: def.strapJolt, dir, cycleTicks: def.cycleTicks, windowTicks: def.windowTicks ?? Math.round(def.cycleTicks / 5), phase: rng.int(def.cycleTicks) });
      return;
    }
    const count = def.count ?? 1, spread = def.spreadM ?? 0;
    for (let c = 0; c < count; c++) {
      const px = hx + (count > 1 ? (c / (count - 1) - 0.5) * spread : 0);
      hazards.push({ id: id++, type: def.type, x: px, z: hz, halfW, impulse: def.impulse, strapJolt: def.strapJolt, dir });
    }
  };

  // stretches: the corridor between forks; at most one hazard each, always with a way past
  const stretches: [number, number][] = [];
  let from = t.safeStartM;
  for (const f of layout.forks) { stretches.push([from, f.x0]); from = f.x1; }
  stretches.push([from, lengthM - t.safeEndM]);
  for (const [a, b] of stretches) {
    if (b - a < 30 || rng.next() > 0.7) continue;
    const def = weightedPick(rng, eligible, STRETCH_TYPES);
    if (!def) continue;
    const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
    const hx = clamp((a + b) / 2 + (rng.next() * 2 - 1) * t.hazardJitter, a + 10, b - 10);
    if (def.type === 'gust') place(def, hx, 0, W * 2, dir);
    else place(def, hx, dir * W * 0.45, W * 0.5, dir);
  }

  // forks: the direct lane carries one hazard; mud lanes carry a mud zone; other lanes stay clean
  const mudDef = hazardDefs.find((d) => d.type === 'mud');
  for (const f of layout.forks) {
    for (const lane of f.lanes) {
      const zc = laneCentre(lane), hw = laneHalfWidth(lane);
      if (lane.archetype === 'mud' && mudDef) { hazards.push({ id: id++, type: 'mud', x: f.x0 + 8, x1: f.x1 - 8, z: zc, halfW: hw - 0.5, impulse: 0, strapJolt: 0, dir: 1 }); continue; }
      if (lane.archetype !== 'direct') continue;
      const def = weightedPick(rng, eligible, FORK_TYPES);
      if (!def) continue;
      const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
      const hx = clamp((f.x0 + f.x1) / 2 + (rng.next() * 2 - 1) * t.hazardJitter, f.x0 + 12, f.x1 - 12);
      place(def, hx, zc, hw, dir);
    }
  }

  // discoveries: pockets first, then off-lane in stretches
  const discoveries: Discovery[] = [];
  const count = 2 + Math.min(2, tier);
  for (const p of layout.pockets) if (discoveries.length < count) discoveries.push({ id: discoveries.length, x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, name: CACHE_NAMES[(discoveries.length + tier) % CACHE_NAMES.length]! });
  const wide = stretches.filter(([a, b]) => b - a >= 20);
  for (let i = 0; discoveries.length < count && i < wide.length; i++) {
    const [a, b] = wide[i]!;
    const side: 1 | -1 = mapRng.next() < 0.5 ? -1 : 1;
    discoveries.push({ id: discoveries.length, x: (a + b) / 2 + (mapRng.next() - 0.5) * (b - a) * 0.5, z: side * (W - 3), name: CACHE_NAMES[(discoveries.length + tier) % CACHE_NAMES.length]! });
  }

  return routeFromSegments(seed, segments, hazards, t.profileStepM, discoveries, layout, W, scheduleStorms(rng, lengthM, tier, tuning));
}
