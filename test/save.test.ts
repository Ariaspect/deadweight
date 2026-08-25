import { describe, it, expect } from 'vitest';
import { defaultSave, loadSave, writeSave, type StorageLike } from '../src/game/save';

function mem(): StorageLike & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

describe('save', () => {
  it('round-trips', () => {
    const s = mem(); const d = defaultSave(); d.cash = 420; d.upgrades.push('bay');
    writeSave(s, d);
    const { data, reset } = loadSave(s);
    expect(reset).toBe(false); expect(data).toEqual(d);
  });
  it('returns defaults with reset=true on missing, corrupt, or old-version data', () => {
    expect(loadSave(mem())).toEqual({ data: defaultSave(), reset: false });
    const bad = mem(); bad.setItem('deadweight.save', '{not json');
    expect(loadSave(bad).reset).toBe(true);
    const old = mem(); old.setItem('deadweight.save', JSON.stringify({ v: 0, cash: 9 }));
    const r = loadSave(old); expect(r.reset).toBe(true); expect(r.data.cash).toBe(0);
  });
});
