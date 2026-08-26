import { generateRoute } from '../src/sim/terrain';
import { runHeadless } from '../src/sim/bot';
import { tuning, outposts, hazards, cargo } from '../src/content';
import type { LoadoutItem } from '../src/sim/types';

const byId = (id: string) => cargo.find((c) => c.id === id)!;
const LOADOUTS: Record<string, LoadoutItem[]> = {
  crate: [{ def: byId('crate'), slot: 1 }],
  stress: [{ def: byId('soup'), slot: 0 }, { def: byId('crate'), slot: 2 }],
};
const LAGS = [0, 15, 30];
let failures = 0;
console.log('outpost         tier lag  loadout  ended     stars  reserve');
for (const o of outposts) {
  const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
  for (const f of route.forks) {
    const safe = f.lanes.some((lane) => !route.hazards.some((h) => h.impulse > 0 && h.x >= f.x0 && h.x <= f.x1 && h.z >= lane.z0 && h.z <= lane.z1));
    if (!safe) { failures++; console.log(`${o.name}: fork at ${f.x0.toFixed(0)} m has no hazard-free lane`); }
  }
  for (const [name, loadout] of Object.entries(LOADOUTS)) {
    for (const lag of LAGS) {
      const { state, result } = runHeadless(route, loadout, tuning, { lagTicks: lag });
      const ok = result.ended === 'arrived' && result.stars >= 1;
      if (name === 'crate' && lag === tuning.bot.lagTicks && !ok) failures++;
      console.log(`${o.name.padEnd(15)} ${o.tier}    ${String(lag).padStart(3)}  ${name.padEnd(7)}  ${result.ended.padEnd(8)}  ${result.stars}      ${state.reserve.toFixed(0)}`);
    }
  }
}
console.log(failures === 0 ? `PASS: all ${outposts.length} outposts solvable at lag ${tuning.bot.lagTicks}` : `FAIL: ${failures} outposts unsolvable at lag ${tuning.bot.lagTicks}`);
process.exit(failures === 0 ? 0 : 1);
