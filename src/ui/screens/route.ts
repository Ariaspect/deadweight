import type { OutpostDef } from '../../sim/types';
import type { RouteRating } from '../../game/orders';

export interface RouteOption { outpost: OutpostDef; rating: RouteRating; sketch: string; hazardCount: number; zoneCount: number }
export interface RouteSelectProps { options: RouteOption[]; hqLine: string; cash: number; tier: number }

export function renderRouteSelect(el: HTMLElement, p: RouteSelectProps, onPick: (outpost: OutpostDef) => void): void {
  el.innerHTML = `
    <div class="screen routes">
      <pre class="tele-block">ROUTE BOARD ── PICK YOUR RUN
LEDGER ${p.cash}  ·  RANK ${p.tier}
${p.hqLine}</pre>
      <ul class="route-list">${p.options.map((o) => `
        <li data-id="${o.outpost.id}">
          <div class="route-head">
            <b>${o.outpost.name}</b>
            <em class="diff ${o.rating.label}">${o.rating.label.toUpperCase()}</em>
            <span class="pay">×${o.rating.payoutMul.toFixed(2)}</span>
          </div>
          ${o.sketch}
          <span class="meta">${o.outpost.lengthM} m · TIER ${o.outpost.tier} · ${o.hazardCount} HAZARDS · ${o.zoneCount} ZONES</span>
          <span class="flavor">${o.outpost.flavor}</span>
        </li>`).join('')}
      </ul>
      <div class="row"><span class="cap">FEES SCALE WITH THE ROUTE</span><button class="big primary" disabled>ACCEPT</button></div>
    </div>`;
  el.hidden = false;
  const btn = el.querySelector<HTMLButtonElement>('button.primary')!;
  let chosen: OutpostDef | null = null;
  for (const li of el.querySelectorAll<HTMLLIElement>('.route-list li')) {
    li.addEventListener('pointerdown', () => {
      for (const other of el.querySelectorAll('.route-list li')) other.classList.toggle('on', other === li);
      chosen = p.options.find((o) => o.outpost.id === li.dataset.id)!.outpost;
      btn.disabled = false;
    });
  }
  btn.addEventListener('pointerdown', () => { if (chosen) { el.hidden = true; onPick(chosen); } });
}
