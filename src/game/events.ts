import type { RigState, RouteDef } from '../sim/types';

export interface EventSnapshot { found: number; lost: string[]; cooldown: number[]; restraintSum: number; speed: number; targetSpeed: number }

export function snapshot(s: RigState): EventSnapshot {
  return {
    found: s.foundDiscoveries.length,
    lost: s.items.filter((it) => it.lost).map((it) => it.id),
    cooldown: [...s.zoneCooldown],
    restraintSum: s.items.reduce((a, it) => a + (it.lost ? 0 : it.restraint), 0),
    speed: s.speed, targetSpeed: s.targetSpeed,
  };
}

const MOVER_NAME = { rockfall: 'ROCKFALL', crane: 'SWINGING LOAD' } as const;

/** Diffs two consecutive states into teleprinter lines. Pure; the flow keeps `next` for the following tick. */
export function describeEvents(prev: EventSnapshot, s: RigState, route: RouteDef, cacheReserve: number): { lines: string[]; next: EventSnapshot } {
  const next = snapshot(s);
  const lines: string[] = [];
  for (let i = prev.found; i < next.found; i++) {
    const d = route.discoveries.find((x) => x.id === s.foundDiscoveries[i]);
    if (d) lines.push(`CACHE: ${d.name} +${Math.round(cacheReserve)} RESERVE`);
  }
  for (const id of next.lost) if (!prev.lost.includes(id)) lines.push(`${id.toUpperCase()} OVERBOARD — RECOVER (R)`);
  for (const z of route.zones) {
    if (z.type === 'mud') continue;
    if ((next.cooldown[z.id] ?? -1) > (prev.cooldown[z.id] ?? -1)) lines.push(`${MOVER_NAME[z.type as 'rockfall' | 'crane']} HIT`);
  }
  const jolted = next.restraintSum < prev.restraintSum - 5;
  const stopped = next.targetSpeed > 0 && next.speed === 0 && s.grounded;   // W held, rig not moving: something solid stopped it
  if (jolted && stopped && next.lost.length === prev.lost.length && next.found === prev.found) lines.push('WALL STRIKE');
  return { lines, next };
}
