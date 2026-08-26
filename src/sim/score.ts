import type { ItemResult, RigState, RunResult, Tuning } from './types';

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function evaluate(s: RigState, tuning: Tuning, payoutMul = 1): RunResult {
  const ended = s.ended ?? 'stalled';
  const items: ItemResult[] = s.items.map((it) => {
    const condition = clamp01(1 - it.stress);
    const rushed = it.deadlineTick >= 0;
    const late = rushed && s.t > it.deadlineTick;
    const payout = it.lost ? 0 : it.payout * condition * payoutMul;   // a deadline is upside only: missing it costs the bonus, not the fee
    return { id: it.id, condition, payout, lost: it.lost, rushed, late };
  });
  const carried = items.filter((i) => !i.lost);
  const mean = carried.length ? carried.reduce((a, i) => a + i.condition, 0) / carried.length : 0;
  const b = tuning.starBuckets;
  let stars = 5;
  for (let i = 0; i < 4; i++) { if (mean <= b[i]!) { stars = i + 1; break; } }
  if (items.some((i) => i.lost)) stars = Math.max(1, stars - 1);
  if (ended === 'stalled') stars = Math.min(stars, 2);
  if (ended === 'spilled') stars = 1;

  let payout = items.reduce((a, i) => a + i.payout, 0);
  if (ended === 'stalled') payout *= tuning.stallMultiplier;
  if (ended === 'spilled') payout = 0;
  const bonus = ended === 'arrived' ? Math.max(0, s.reserve) * tuning.kBonus : 0;
  const discoveryBonus = s.foundDiscoveries.length * tuning.cacheBonus;
  const rushBonus = ended === 'arrived'
    ? items.reduce((a, i) => a + (i.rushed && !i.late && !i.lost ? i.payout * tuning.rushBonusMul : 0), 0)
    : 0;
  return { items, stars, payout, bonus, discoveryBonus, rushBonus, total: Math.round(payout + bonus + discoveryBonus + rushBonus), ended, elapsed: s.t * tuning.dt };
}
