import type { ItemDef, OutpostDef, Tuning } from '../sim/types';
import type { Rng } from '../sim/rng';

export interface Offers { outpost: OutpostDef; cargo: ItemDef[] }
export type Difficulty = 'easy' | 'medium' | 'hard';

export function playerTier(runs: number): number { return Math.min(3, Math.floor(runs / 3)); }

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
  const tier = playerTier(runs);
  const eligible = outposts.filter((o) => o.tier <= tier);
  const outpost = eligible[runs % eligible.length]!;
  const bag = cargo.filter((c) => c.tier <= tier);
  const picks: ItemDef[] = [];
  const easy = bag.filter((c) => cargoDifficulty(c, tuning) === 'easy');
  if (easy.length > 0) {                                  // every dispatch carries one haul you can actually finish
    const pick = easy[rng.int(easy.length)]!;
    picks.push(pick);
    bag.splice(bag.indexOf(pick), 1);
  }
  while (picks.length < 3 && bag.length > 0) picks.push(bag.splice(rng.int(bag.length), 1)[0]!);
  return { outpost, cargo: picks };
}
