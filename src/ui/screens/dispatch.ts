import type { ItemDef } from '../../sim/types';
import type { Offers } from '../../game/orders';
import { slopeProfileSvg } from '../profile';

export interface DispatchProps { offers: Offers; profile: number[]; profileStepM: number; hqLine: string; capacity: number; cash: number; tier: number; traceCount: number }

const fragility = (c: ItemDef): string => (c.tolerance < 0.4 ? 'FRAGILE' : c.tolerance < 0.6 ? 'DELICATE' : 'STURDY');

export function renderDispatch(el: HTMLElement, p: DispatchProps, onLoad: (selected: ItemDef[]) => void): void {
  const o = p.offers.outpost;
  const selected = new Set<string>();
  el.innerHTML = `
    <div class="screen dispatch">
      <pre class="tele-block">DISPATCH ── ${o.name.toUpperCase()}  ·  ${o.lengthM} m  ·  TIER ${o.tier}
${o.flavor}
${p.hqLine}
LEDGER ${p.cash}  ·  RANK ${p.tier}  ·  TRACES ON ROUTE ${p.traceCount}</pre>
      ${slopeProfileSvg(p.profile, p.profileStepM)}
      <ul class="offers">${p.offers.cargo.map((c) => `
        <li data-id="${c.id}">
          <b>${c.name}</b>
          <span class="meta">${c.mass.toFixed(1)} t · ${fragility(c)} · ${c.behavior.toUpperCase()}${c.rush ? ` · RUSH ${c.rush}s` : ''}</span>
          <span class="pay">${c.payout}</span>
        </li>`).join('')}
      </ul>
      <div class="row"><span class="cap">0 / ${p.capacity} BAYS</span><button class="big primary" disabled>LOAD</button></div>
    </div>`;
  el.hidden = false;
  const cap = el.querySelector<HTMLElement>('.cap')!;
  const btn = el.querySelector<HTMLButtonElement>('button.primary')!;
  for (const li of el.querySelectorAll<HTMLLIElement>('.offers li')) {
    li.addEventListener('pointerdown', () => {
      const id = li.dataset.id!;
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < p.capacity) selected.add(id);
      else return;
      li.classList.toggle('on', selected.has(id));
      cap.textContent = `${selected.size} / ${p.capacity} BAYS`;
      btn.disabled = selected.size === 0;
    });
  }
  btn.addEventListener('pointerdown', () => { el.hidden = true; onLoad(p.offers.cargo.filter((c) => selected.has(c.id))); });
}
