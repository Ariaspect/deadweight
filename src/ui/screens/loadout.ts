import type { ItemDef, LoadoutItem, Tuning } from '../../sim/types';
import { predictTrim } from '../../sim/step';

const SLOT_NAMES = ['FORE', 'MID', 'AFT'];

export function renderLoadout(el: HTMLElement, p: { items: ItemDef[]; tuning: Tuning }, onHaul: (loadout: LoadoutItem[]) => void): void {
  // one crate has nothing to balance against, so it rides the centre bay and there is no choice to offer
  const single = p.items.length === 1;
  const slots = single ? [1] : p.tuning.capacity >= 3 ? [0, 1, 2] : [0, 2];
  const assign = new Map<string, number>();
  p.items.forEach((it, i) => assign.set(it.id, slots[i]!));
  const loadout = (): LoadoutItem[] => p.items.map((def) => ({ def, slot: assign.get(def.id)! }));

  const draw = (): void => {
    const trim = predictTrim(loadout(), p.tuning);
    el.innerHTML = `
      <div class="screen loadout">
        <h2>LOAD BAYS</h2>
        <ul class="bays">${p.items.map((it) => `
          <li data-id="${it.id}"><b>${it.name}</b><span class="meta">${it.mass.toFixed(1)} t</span>
            <div class="slots">${single ? '<span class="fixed">CENTRE BAY</span>' : slots.map((s) => `<button data-slot="${s}" class="${assign.get(it.id) === s ? 'on' : ''}">${SLOT_NAMES[s]}</button>`).join('')}</div>
          </li>`).join('')}
        </ul>
        <div class="trim">PREDICTED NEUTRAL TRIM <b>${trim > 0 ? '+' : ''}${trim}</b><span class="hint">${trim === 0 ? 'balanced' : trim > 0 ? 'nose-heavy — dial aft' : 'tail-heavy — dial fore'}</span></div>
        <button class="big primary">HAUL</button>
      </div>`;
    el.hidden = false;
    for (const b of el.querySelectorAll<HTMLButtonElement>('.slots button')) {
      b.addEventListener('pointerdown', () => {
        const id = b.closest<HTMLLIElement>('li')!.dataset.id!;
        const target = Number(b.dataset.slot);
        const holder = [...assign.entries()].find(([, s]) => s === target)?.[0];
        if (holder && holder !== id) assign.set(holder, assign.get(id)!);
        assign.set(id, target);
        draw();
      });
    }
    el.querySelector<HTMLButtonElement>('button.primary')!.addEventListener('pointerdown', () => { el.hidden = true; onHaul(loadout()); });
  };
  draw();
}
