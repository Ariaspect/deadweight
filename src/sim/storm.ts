import type { RouteDef, StormFront, Tuning } from './types';
import type { Rng } from './rng';

/**
 * Fronts are scheduled in ticks across the route's expected duration, so a slow driver eats more storm and a
 * sprinter may outrun the second front. Deterministic: the caller's rng is the route's own.
 */
export function scheduleStorms(rng: Rng, lengthM: number, tier: number, tuning: Tuning): StormFront[] {
  const st = tuning.storm;
  const idx = Math.min(tier, st.maxFronts.length - 1);
  const max = st.maxFronts[idx] ?? 0;
  const chance = st.frontChance[Math.min(tier, st.frontChance.length - 1)] ?? 0;
  const cruise = tuning.gaitSpeed[2]! * tuning.gaitSpeedMul;
  const total = Math.round(lengthM / cruise / tuning.dt);
  const ramp = Math.round(st.rampS / tuning.dt);
  const latest = Math.round(total * st.windowHi);
  const fronts: StormFront[] = [];
  // A route may not carry more weather than the reserve can absorb. Storm time is counted WITH both ramps, since
  // the bot radars for the whole ramped window, and the speed penalty stretches the run for that whole window too.
  const budget = total * st.maxStormFrac;
  let spent = 0;
  let earliest = Math.round(total * st.windowLo);
  for (let i = 0; i < max; i++) {
    if (rng.next() >= chance) continue;
    const duration = Math.round((st.minDurationS + rng.next() * (st.maxDurationS - st.minDurationS)) / tuning.dt);
    if (spent + duration + 2 * ramp > budget) continue;   // skip this front rather than truncate it: the ramps stay whole
    const span = latest - earliest - duration;
    if (span <= 0) break;
    spent += duration + 2 * ramp;
    const start = earliest + Math.floor(rng.next() * span);
    fronts.push({ id: fronts.length, startTick: start, endTick: start + duration });
    earliest = start + duration + 2 * ramp;   // never let two fronts merge into one unbroken wall
  }
  return fronts;
}

/** 0 clear, 1 full storm. Symmetric ramps, so the front arrives and lifts as gradually as it counts down. */
export function stormLevel(route: RouteDef, t: number, tuning: Tuning): number {
  const ramp = Math.round(tuning.storm.rampS / tuning.dt);
  let level = 0;
  for (const f of route.storms) {
    let l = 0;
    if (t >= f.startTick && t <= f.endTick) l = 1;
    else if (t > f.startTick - ramp && t < f.startTick) l = (t - (f.startTick - ramp)) / ramp;
    else if (t > f.endTick && t < f.endTick + ramp) l = 1 - (t - f.endTick) / ramp;
    if (l > level) level = l;
  }
  return level;
}
