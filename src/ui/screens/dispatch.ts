import type { ItemDef, Tuning } from '../../sim/types';
import { cargoDifficulty, type Offers, type RouteRating } from '../../game/orders';
import { slopeProfileSvg } from '../profile';

export interface DispatchProps { offers: Offers; profile: number[]; profileStepM: number; sketch: string; hqLine: string; capacity: number; cash: number; tier: number; traceCount: number; tuning: Tuning; rating: RouteRating }

const fragility = (c: ItemDef): string => (c.tolerance < 0.4 ? 'FRAGILE' : c.tolerance < 0.6 ? 'DELICATE' : 'STURDY');

/** What the ratchet can do to this load before it starts crushing it. */
function strapNote(c: ItemDef, t: Tuning): string {
  const loadsAt = Math.min(t.strapStart, c.crushLimit);
  const taps = Math.floor((c.crushLimit - loadsAt) / t.strapTap);
  return `MAX STRAP <b>${c.crushLimit}</b> · LOADS AT <b>${loadsAt}</b> · <b>${taps}</b> SAFE RATCHET${taps === 1 ? '' : 'S'}`;
}

export function renderDispatch(el: HTMLElement, p: DispatchProps, onLoad: (selected: ItemDef[]) => void): void {
  const o = p.offers.outpost;
  const selected = new Set<string>();
  el.innerHTML = `
    <div class="screen dispatch">
      <pre class="tele-block">MANIFEST ── ${o.name.toUpperCase()}  ·  ${o.lengthM} m  ·  ${p.rating.label.toUpperCase()}  ·  FEES ×${p.rating.payoutMul.toFixed(2)}
${o.flavor}
${p.hqLine}
SCRAP ${p.cash}  ·  RANK ${p.tier}  ·  TRACES ON ROUTE ${p.traceCount}</pre>
      ${p.sketch}<div class="profile-strip">${slopeProfileSvg(p.profile, p.profileStepM, 480, 28)}</div>
      <ul class="offers">${p.offers.cargo.map((c) => `
        <li data-id="${c.id}">
          <b>${c.name} <em class="diff ${cargoDifficulty(c, p.tuning)}">${cargoDifficulty(c, p.tuning).toUpperCase()}</em></b>
          <span class="meta">${c.mass.toFixed(1)} t · ${fragility(c)} · ${c.behavior.toUpperCase()}${c.rush ? ` · RUSH ${c.rush}s` : ''}</span>
          <span class="pay">${Math.round(c.payout * p.rating.payoutMul)}</span>
          <span class="strapinfo">${strapNote(c, p.tuning)}</span>
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
