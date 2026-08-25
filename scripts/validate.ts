import { generateRoute } from '../src/sim/terrain';
import { runHeadless } from '../src/sim/bot';
import { tuning } from '../src/content';
import type { HazardDef, ItemDef, OutpostDef } from '../src/sim/types';

// M1: dev outposts. Task 20 replaces this with content/outposts.json + hazards.json.
const outposts: OutpostDef[] = [4417, 1, 2, 3, 4].map((seed, i) => ({ id: `dev${i}`, name: `DEV ${seed}`, seed, lengthM: 600, tier: 0, flavor: '' }));
const hazards: HazardDef[] = [];
const crate: ItemDef = { id: 'crate', name: 'Crate', mass: 1, tolerance: 0.5, crushLimit: 90, behavior: 'static', payout: 100, tier: 0, art: { shape: 'box', color: '#8a6d3b' } };
const LAGS = [0, 15, 30];

let failures = 0;
console.log('outpost            lag  ended     stars  ticks');
for (const o of outposts) {
  const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
  for (const lag of LAGS) {
    const { result, ticks } = runHeadless(route, [{ def: crate, slot: 1 }], tuning, { lagTicks: lag });
    const ok = result.ended === 'arrived' && result.stars >= 1;
    if (lag === tuning.bot.lagTicks && !ok) failures++;
    console.log(`${o.name.padEnd(18)} ${String(lag).padStart(3)}  ${result.ended.padEnd(8)}  ${result.stars}      ${ticks}`);
  }
}
console.log(failures === 0 ? `PASS: all ${outposts.length} outposts solvable at lag ${tuning.bot.lagTicks}` : `FAIL: ${failures} outposts unsolvable at lag ${tuning.bot.lagTicks}`);
process.exit(failures === 0 ? 0 : 1);
