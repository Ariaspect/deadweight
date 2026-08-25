import type { UpgradeDef } from '../../sim/types';
import type { SaveData } from '../../game/save';

export function renderUpgrade(el: HTMLElement, p: { defs: UpgradeDef[]; save: SaveData }, h: { onBuy(id: string): void; onDone(): void }): void {
  const draw = (): void => {
    el.innerHTML = `
      <div class="screen upgrade">
        <h2>WORKSHOP</h2>
        <div class="ledger">LEDGER <b>${p.save.cash}</b></div>
        <div class="grid">${p.defs.map((d) => {
          const owned = p.save.upgrades.includes(d.id); const afford = p.save.cash >= d.cost;
          return `<button class="tile ${owned ? 'owned' : afford ? '' : 'locked'}" data-id="${d.id}" ${owned || !afford ? 'disabled' : ''}>
            <b>${d.name}</b><span>${d.blurb}</span><em>${owned ? 'INSTALLED' : `${d.cost}`}</em></button>`;
        }).join('')}</div>
        <button class="big primary done">DISPATCH</button>
      </div>`;
    el.hidden = false;
    for (const t of el.querySelectorAll<HTMLButtonElement>('.tile')) t.addEventListener('pointerdown', () => { h.onBuy(t.dataset.id!); draw(); });
    el.querySelector<HTMLButtonElement>('.done')!.addEventListener('pointerdown', () => { el.hidden = true; h.onDone(); });
  };
  draw();
}
