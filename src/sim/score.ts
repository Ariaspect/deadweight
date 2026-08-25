import type { ItemResult, RigState, RunResult, Tuning } from './types';

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function evaluate(s: RigState, tuning: Tuning): RunResult {
  const ended = s.ended ?? 'stalled';
  const items: ItemResult[] = s.items.map((it) => {
    const condition = clamp01(1 - it.stress);
    const late = it.deadlineTick >= 0 && s.t > it.deadlineTick;
    const payout = it.lost || late ? 0 : it.payout * condition;
    return { id: it.id, condition, payout, lost: it.lost, late };
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
  return { items, stars, payout, bonus, total: Math.round(payout + bonus), ended };
}
