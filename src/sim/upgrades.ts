import type { Tuning, UpgradeDef } from './types';

export function applyUpgrades(base: Tuning, owned: string[], defs: UpgradeDef[]): Tuning {
  const t: Tuning = { ...base, gaitSpeed: [...base.gaitSpeed], starBuckets: [...base.starBuckets], slotPos: [...base.slotPos], restraintDecay: { ...base.restraintDecay }, terrain: { ...base.terrain, slopeSigma: [...base.terrain.slopeSigma] }, bot: { ...base.bot } };
  for (const id of owned) {
    const d = defs.find((u) => u.id === id);
    if (d) t[d.effect.key] = d.effect.value;
  }
  return t;
}
