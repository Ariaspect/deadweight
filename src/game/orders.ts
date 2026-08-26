import type { ItemDef, OutpostDef, RouteDef, Tuning } from '../sim/types';
import type { Rng } from '../sim/rng';

export interface Offers { outpost: OutpostDef; cargo: ItemDef[] }
export type Difficulty = 'easy' | 'medium' | 'hard';
export interface RouteRating { score: number; payoutMul: number; label: Difficulty }

export function playerTier(runs: number): number { return Math.min(3, Math.floor(runs / 3)); }

/**
 * What the route itself asks of you, from the generated geometry rather than the outpost's declared tier alone:
 * rank, distance (reserve pressure), how densely the impulse hazards fall, how many timing zones there are, and
 * the steepest grade. The score drives both the label on the route card and the multiplier on every fee.
 */
export function routeDifficulty(route: RouteDef, outpost: OutpostDef, tuning: Tuning): RouteRating {
  const r = tuning.route;
  let maxSlope = 0;
  for (let x = 0; x <= route.length; x += 2) { const a = Math.abs(route.slopeAt(x)); if (a > maxSlope) maxSlope = a; }
  const impulse = route.hazards.filter((h) => h.impulse > 0).length;
  const score = outpost.tier * r.tierWeight
    + (route.length / 100) * r.lengthWeight
    + impulse / (route.length / 100) * r.hazardWeight
    + route.zones.length * r.zoneWeight
    + maxSlope * r.slopeWeight;
  return {
    score,
    payoutMul: 1 + Math.max(0, score - r.baseScore) * r.payWeight,
    label: score < r.easyBelow ? 'easy' : score < r.hardAtOrAbove ? 'medium' : 'hard',
  };
}

/**
 * The routes on the board this run: the easiest unlocked outpost, the hardest, and a spread between, so there is
 * always a safe option and always a reach. Deterministic — the board depends only on the run count.
 */
export function pickRoutes(outposts: OutpostDef[], runs: number, tuning: Tuning): OutpostDef[] {
  const tier = playerTier(runs);
  const eligible = outposts.filter((o) => o.tier <= tier).sort((a, b) => a.tier - b.tier || a.lengthM - b.lengthM);
  const want = Math.min(tuning.route.offerCount, eligible.length);
  if (want === eligible.length) return eligible;
  // cut the unlocked list into `want` contiguous bands and take one from each, rotating by run count: the board
  // always spans soft-to-hard, the bands cannot collide, and it is not the same three routes every dispatch
  const picks: OutpostDef[] = [];
  for (let i = 0; i < want; i++) {
    const lo = Math.floor(i * eligible.length / want), hi = Math.floor((i + 1) * eligible.length / want);
    const size = Math.max(1, hi - lo);
    picks.push(eligible[lo + (runs + i) % size]!);
  }
  return picks;
}

/**
 * How hard this load is to keep intact, from the knobs the sim actually reads: fragility (tolerance), how fast the
 * restraint decays for the behaviour, the extra drift a precarious load takes, a delivery deadline, and mass.
 * Labelling only — the sim never reads this.
 */
export function cargoDifficulty(c: ItemDef, tuning: Tuning): Difficulty {
  const d = tuning.difficulty;
  const score = (1 - c.tolerance) * d.fragileWeight
    + tuning.restraintDecay[c.behavior]
    + (c.behavior === 'precarious' ? d.precariousWeight : 0)
    + (c.rush !== undefined ? d.rushWeight : 0)
    + c.mass * d.massWeight;
  return score < d.easyBelow ? 'easy' : score < d.hardAtOrAbove ? 'medium' : 'hard';
}

export function generateOffers(outposts: OutpostDef[], cargo: ItemDef[], runs: number, rng: Rng, tuning: Tuning): Offers {
  const eligible = outposts.filter((o) => o.tier <= playerTier(runs));
  return { outpost: eligible[runs % eligible.length]!, cargo: generateCargo(cargo, runs, rng, tuning) };
}

/** The three loads on offer once a route is accepted. Independent of the route: the route scales the fee, not the bag. */
export function generateCargo(cargo: ItemDef[], runs: number, rng: Rng, tuning: Tuning): ItemDef[] {
  const tier = playerTier(runs);
  const bag = cargo.filter((c) => c.tier <= tier);
  const picks: ItemDef[] = [];
  const easy = bag.filter((c) => cargoDifficulty(c, tuning) === 'easy');
  if (easy.length > 0) {                                  // every dispatch carries one haul you can actually finish
    const pick = easy[rng.int(easy.length)]!;
    picks.push(pick);
    bag.splice(bag.indexOf(pick), 1);
  }
  while (picks.length < 3 && bag.length > 0) picks.push(bag.splice(rng.int(bag.length), 1)[0]!);
  return picks;
}
