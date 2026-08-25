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
  it('returns defaults: reset=false on missing, reset=true on corrupt or old-version data', () => {
    expect(loadSave(mem())).toEqual({ data: defaultSave(), reset: false });
    const bad = mem(); bad.setItem('deadweight.save', '{not json');
    expect(loadSave(bad).reset).toBe(true);
    const old = mem(); old.setItem('deadweight.save', JSON.stringify({ v: 0, cash: 9 }));
    const r = loadSave(old); expect(r.reset).toBe(true); expect(r.data.cash).toBe(0);
  });
  it('rejects a save with a malformed field (runs as a string) and resets', () => {
    const s = mem();
    s.setItem('deadweight.save', JSON.stringify({ v: 1, cash: 5, runs: 'x', upgrades: [], bestByOutpost: {}, traces: [] }));
    const r = loadSave(s);
    expect(r.reset).toBe(true);
    expect(r.data).toEqual(defaultSave());
  });
  it('rejects a partial save missing bestByOutpost/traces and resets', () => {
    const s = mem();
    s.setItem('deadweight.save', JSON.stringify({ v: 1, cash: 5, runs: 2, upgrades: [] }));
    const r = loadSave(s);
    expect(r.reset).toBe(true);
    expect(r.data).toEqual(defaultSave());
  });
});
