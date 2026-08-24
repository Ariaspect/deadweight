import { describe, it, expect } from 'vitest';
import { tuning } from '../src/content';

describe('tuning.json', () => {
  it('has 5 gait speeds, ascending, starting at 0', () => {
    expect(tuning.gaitSpeed).toHaveLength(5);
    expect(tuning.gaitSpeed[0]).toBe(0);
    for (let i = 1; i < 5; i++) expect(tuning.gaitSpeed[i]!).toBeGreaterThan(tuning.gaitSpeed[i - 1]!);
  });
  it('has 5 star buckets ending at 1', () => {
    expect(tuning.starBuckets).toHaveLength(5);
    expect(tuning.starBuckets[4]).toBe(1);
  });
  it('dt is 1/60', () => { expect(tuning.dt).toBeCloseTo(1 / 60, 10); });
  it('slotPos has 3 positions', () => { expect(tuning.slotPos).toEqual([-1, 0, 1]); });
  it('reserveBudget is a fraction', () => { expect(tuning.reserveBudget).toBeGreaterThan(0); expect(tuning.reserveBudget).toBeLessThan(1); });
});
