import type { HazardDef, HqDef, ItemDef, OutpostDef, ReviewDef, Tuning, UpgradeDef } from '../sim/types';
import tuningJson from './tuning.json';
import cargoJson from './cargo.json';
import outpostsJson from './outposts.json';
import hazardsJson from './hazards.json';
import upgradesJson from './upgrades.json';
import reviewsJson from './reviews.json';
import hqJson from './hq.json';

export const tuning: Tuning = tuningJson as Tuning;
export const cargo: ItemDef[] = cargoJson as ItemDef[];
export const outposts: OutpostDef[] = outpostsJson as OutpostDef[];
export const hazards: HazardDef[] = hazardsJson as HazardDef[];
export const upgrades: UpgradeDef[] = upgradesJson as UpgradeDef[];
export const reviews: ReviewDef[] = reviewsJson as ReviewDef[];
export const hq: HqDef[] = hqJson as HqDef[];
