import type { ItemDef, OutpostDef } from '../sim/types';
import type { Rng } from '../sim/rng';

export interface Offers { outpost: OutpostDef; cargo: ItemDef[] }

export function playerTier(runs: number): number { return Math.min(3, Math.floor(runs / 3)); }

export function generateOffers(outposts: OutpostDef[], cargo: ItemDef[], runs: number, rng: Rng): Offers {
  const tier = playerTier(runs);
  const eligible = outposts.filter((o) => o.tier <= tier);
  const outpost = eligible[runs % eligible.length]!;
  const bag = cargo.filter((c) => c.tier <= tier);
  const picks: ItemDef[] = [];
  while (picks.length < 3 && bag.length > 0) picks.push(bag.splice(rng.int(bag.length), 1)[0]!);
  return { outpost, cargo: picks };
}
