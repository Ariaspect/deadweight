import type { OutpostDef } from '../../sim/types';
import type { RouteRating } from '../../game/orders';

export interface RouteOption { outpost: OutpostDef; rating: RouteRating; sketch: string; hazardCount: number; zoneCount: number }
export interface RouteSelectProps { options: RouteOption[]; hqLine: string; cash: number; tier: number }

const plural = (n: number, word: string): string => (n === 1 ? word : `${word}S`);

export function renderRouteSelect(el: HTMLElement, p: RouteSelectProps, onPick: (outpost: OutpostDef) => void): void {
  el.innerHTML = `
    <div class="screen routes">
      <pre class="tele-block">ROUTE BOARD ── PICK YOUR RUN
SCRAP ${p.cash}  ·  RANK ${p.tier}
${p.hqLine}</pre>
      <ul class="route-list">${p.options.map((o) => `
        <li data-id="${o.outpost.id}">
          <div class="route-head">
            <b>${o.outpost.name}</b>
            <em class="diff ${o.rating.label}">${o.rating.label.toUpperCase()}</em>
            <span class="pay">×${o.rating.payoutMul.toFixed(2)}<small>FEES</small></span>
          </div>
          ${o.sketch}
          <div class="route-stats">
            <span>DIST <b>${o.outpost.lengthM} m</b></span>
            <span>TIER <b>${o.outpost.tier}</b></span>
            <span>${plural(o.hazardCount, 'HAZARD')} <b>${o.hazardCount}</b></span>
            <span>${plural(o.zoneCount, 'ZONE')} <b>${o.zoneCount}</b></span>
          </div>
          <p class="flavor">${o.outpost.flavor}</p>
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
