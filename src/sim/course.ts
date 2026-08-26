import type { Rng } from './rng';
import type { Fork, Lane, LaneArchetype, Layout, Pocket, TerrainTuning, Wall, WallKind } from './types';

export const EDGE_THICK = 3;
const SPINE_KINDS: WallKind[] = ['wall', 'rock', 'ruin'];

export const laneCentre = (lane: Lane): number => (lane.z0 + lane.z1) / 2;
export const laneHalfWidth = (lane: Lane): number => (lane.z1 - lane.z0) / 2;

function pickArchetypes(rng: Rng, n: number): LaneArchetype[] {
  const pool: LaneArchetype[] = n === 2 ? ['direct', rng.next() < 0.5 ? 'chicane' : 'mud'] : ['direct', 'chicane', 'mud'];
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); const tmp = pool[i]!; pool[i] = pool[j]!; pool[j] = tmp; }
  return pool;
}

/**
 * A spine runs the whole fork but carries two weave gaps, so a lane is a commitment you can still buy your way out
 * of — crossing costs forward distance, and at a high gait the gap closes before the rig is clear. Gap positions are
 * derived from the spine index (no rng draws) and staggered so neighbouring spines never line up into one crossing.
 */
function pushSpine(walls: Wall[], x0: number, x1: number, z0: number, z1: number, kind: WallKind, index: number, t: TerrainTuning): void {
  const gap = t.spineGapM, span = x1 - x0;
  if (span < gap * 4) { walls.push({ x0, x1, z0, z1, kind }); return; }
  const stagger = (index % 2 ? 0.06 : -0.06) * span;
  let cursor = x0;
  for (const frac of [1 / 3, 2 / 3]) {
    const start = Math.min(Math.max(x0 + span * frac + stagger - gap / 2, cursor), x1 - gap);
    if (start - cursor > 0.5) walls.push({ x0: cursor, x1: start, z0, z1, kind });
    cursor = start + gap;
  }
  if (x1 - cursor > 0.5) walls.push({ x0: cursor, x1, z0, z1, kind });
}

function pushEdge(walls: Wall[], x0: number, x1: number, side: 1 | -1, W: number): void {
  if (x1 - x0 < 0.5) return;
  walls.push(side > 0 ? { x0, x1, z0: W, z1: W + EDGE_THICK, kind: 'rock' } : { x0, x1, z0: -W - EDGE_THICK, z1: -W, kind: 'rock' });
}

/**
 * Corridor layout in corridor coordinates. Alternates stretches and forks from the safe start to the safe end;
 * every fork has one `direct` lane (the hazard carrier) and at least one lane that is not.
 */
export function layoutCourse(rng: Rng, lengthM: number, tier: number, t: TerrainTuning): Layout {
  const W = t.corridorHalfWidth;
  const forks: Fork[] = []; const walls: Wall[] = []; const pockets: Pocket[] = [];
  const n = tier <= 1 ? 2 : 3;
  const laneW = (2 * W - (n - 1) * t.spineThick) / n;
  const end = lengthM - t.safeEndM;
  let x = t.safeStartM + t.stretchLenMin;
  for (;;) {
    const forkLen = t.forkLenMin + rng.next() * (t.forkLenMax - t.forkLenMin);
    if (x + forkLen > end - t.stretchLenMin) break;
    const x0 = x, x1 = x + forkLen;
    const archetypes = pickArchetypes(rng, n);
    const lanes: Lane[] = [];
    for (let i = 0; i < n; i++) {
      const z0 = -W + i * (laneW + t.spineThick), z1 = z0 + laneW;
      lanes.push({ z0, z1, archetype: archetypes[i]! });
      if (i < n - 1) pushSpine(walls, x0, x1, z1, z1 + t.spineThick, SPINE_KINDS[rng.int(SPINE_KINDS.length)]!, i, t);
    }
    for (const lane of lanes) {
      if (lane.archetype !== 'chicane') continue;
      const k = 2 + rng.int(2);
      const jut = laneW * 0.55;
      for (let j = 0; j < k; j++) {
        const bx = x0 + (j + 1) * forkLen / (k + 1);
        walls.push(j % 2 === 0
          ? { x0: bx - 1, x1: bx + 1, z0: lane.z0, z1: lane.z0 + jut, kind: 'baffle' }
          : { x0: bx - 1, x1: bx + 1, z0: lane.z1 - jut, z1: lane.z1, kind: 'baffle' });
      }
    }
    forks.push({ x0, x1, lanes });
    x = x1 + t.stretchLenMin + rng.next() * (t.stretchLenMax - t.stretchLenMin);
  }

  const pocketCount = Math.min(forks.length, 1 + (tier >= 2 ? 1 : 0));
  for (let p = 0; p < pocketCount; p++) {
    const fork = forks[Math.floor((p + 0.5) * forks.length / pocketCount)]!;
    const side: 1 | -1 = rng.next() < 0.5 ? -1 : 1;
    const px0 = fork.x0 + (fork.x1 - fork.x0) * 0.35, px1 = px0 + 12;
    const z0 = side > 0 ? W : -W - t.pocketDepth, z1 = side > 0 ? W + t.pocketDepth : -W;
    pockets.push({ x0: px0, x1: px1, z0, z1, side });
    walls.push({ x0: px0 - 2, x1: px0, z0, z1, kind: 'ruin' }, { x0: px1, x1: px1 + 2, z0, z1, kind: 'ruin' });
    walls.push(side > 0 ? { x0: px0 - 2, x1: px1 + 2, z0: z1, z1: z1 + EDGE_THICK, kind: 'rock' } : { x0: px0 - 2, x1: px1 + 2, z0: z0 - EDGE_THICK, z1: z0, kind: 'rock' });
  }

  for (const side of [-1, 1] as const) {
    const cuts = pockets.filter((p) => p.side === side).sort((a, b) => a.x0 - b.x0);
    let from = 0;
    for (const c of cuts) { pushEdge(walls, from, c.x0, side, W); from = c.x1; }
    pushEdge(walls, from, lengthM, side, W);
  }
  return { forks, walls, pockets };
}
