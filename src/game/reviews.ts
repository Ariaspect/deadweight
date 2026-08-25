import type { Behavior, HqDef, ReviewDef } from '../sim/types';
import type { Rng } from '../sim/rng';

function choose<T extends { behavior: Behavior | 'any'; lines: string[] }>(pool: T[], behavior: Behavior | 'any', rng: Rng): string {
  const specific = pool.find((d) => d.behavior === behavior);
  const generic = pool.find((d) => d.behavior === 'any');
  const use = specific && rng.next() < 0.6 ? specific : generic ?? specific;
  const lines = use?.lines ?? ['No comment.'];
  return lines[rng.int(lines.length)]!;
}

export function pickReview(defs: ReviewDef[], stars: number, behavior: Behavior | 'any', rng: Rng): string {
  return choose(defs.filter((d) => d.stars === stars), behavior, rng);
}
export function pickHq(defs: HqDef[], context: HqDef['context'], behavior: Behavior | 'any', rng: Rng): string {
  return choose(defs.filter((d) => d.context === context), behavior, rng);
}
