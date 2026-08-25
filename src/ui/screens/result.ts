import type { ItemDef, RunResult } from '../../sim/types';

const ENDED: Record<RunResult['ended'], string> = { arrived: 'DELIVERED', spilled: 'TOTAL SPILL', stalled: 'RESERVE EMPTY — STALLED' };

export function renderResult(el: HTMLElement, result: RunResult, items: ItemDef[], onNext: () => void, review = '', label = 'CONTINUE'): void {
  const name = (id: string): string => items.find((d) => d.id === id)?.name ?? id;
  el.innerHTML = `
    <div class="screen result">
      <h2>${ENDED[result.ended]}</h2>
      <div class="stars">${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}</div>
      <ul class="items">${result.items.map((i) => `<li><span>${name(i.id)}</span><span class="cond ${i.lost ? 'lost' : ''}">${i.lost ? 'LOST' : i.late ? 'LATE' : `${Math.round(i.condition * 100)}%`}</span></li>`).join('')}</ul>
      ${review ? `<p class="review">“${review}”</p>` : ''}
      <div class="cash">PAYOUT ${Math.round(result.payout)} + BONUS ${Math.round(result.bonus)} = <b>${result.total}</b></div>
      <button class="big primary">${label}</button>
    </div>`;
  el.hidden = false;
  el.querySelector('button')!.addEventListener('pointerdown', () => { el.hidden = true; onNext(); });
}
