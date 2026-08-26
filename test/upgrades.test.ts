import { describe, it, expect } from 'vitest';
import { applyUpgrades } from '../src/sim/upgrades';
import { tuning, upgrades } from '../src/content';

describe('applyUpgrades', () => {
  it('returns base values when nothing is owned', () => {
    const t = applyUpgrades(tuning, [], upgrades);
    expect(t).toEqual(tuning); expect(t).not.toBe(tuning);
  });
  it('applies each effect key without mutating base', () => {
    const t = applyUpgrades(tuning, ['cells', 'treads', 'gimbal', 'bay', 'stride'], upgrades);
    expect(t.reserveStart).toBe(130); expect(t.mudSpeedMul).toBe(0.85); expect(t.driftThreshold).toBe(0.4);
    expect(t.capacity).toBe(3); expect(t.gaitSpeedMul).toBe(1.2);
    expect(tuning.reserveStart, 'base is untouched').toBe(100);
  });
  it('ignores unknown ids', () => {
    expect(applyUpgrades(tuning, ['nope'], upgrades)).toEqual(tuning);
  });
});
