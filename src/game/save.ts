import type { Trace } from '../sim/types';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface SaveData { v: 1; cash: number; runs: number; upgrades: string[]; bestByOutpost: Record<string, number>; traces: Trace[] }
const KEY = 'deadweight.save';

export function defaultSave(): SaveData { return { v: 1, cash: 0, runs: 0, upgrades: [], bestByOutpost: {}, traces: [] }; }

export function loadSave(storage: StorageLike): { data: SaveData; reset: boolean } {
  const raw = storage.getItem(KEY);
  if (raw === null) return { data: defaultSave(), reset: false };
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (
      parsed.v !== 1 ||
      typeof parsed.cash !== 'number' ||
      typeof parsed.runs !== 'number' ||
      !Array.isArray(parsed.upgrades) ||
      !parsed.bestByOutpost || typeof parsed.bestByOutpost !== 'object' || Array.isArray(parsed.bestByOutpost) ||
      !Array.isArray(parsed.traces)
    ) throw new Error('version');
    return { data: { ...defaultSave(), ...parsed, v: 1 }, reset: false };
  } catch {
    storage.removeItem(KEY);
    return { data: defaultSave(), reset: true };
  }
}

export function writeSave(storage: StorageLike, data: SaveData): void { storage.setItem(KEY, JSON.stringify(data)); }
