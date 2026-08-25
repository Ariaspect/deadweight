import type { RigState, RouteDef } from '../sim/types';

function thinThousands(n: number): string {
  const neg = n < 0;
  const digits = String(Math.abs(n));
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) groups.unshift(digits.slice(Math.max(0, i - 3), i));
  return (neg ? '-' : '') + groups.join(' ');
}

export class Hud {
  private readonly slopeEl: HTMLElement;
  private readonly altEl: HTMLElement;
  private readonly spdEl: HTMLElement;

  constructor(viewport: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = '<span class="slope"></span><span class="alt"></span><span class="spd"></span>';
    viewport.appendChild(el);
    this.slopeEl = el.querySelector('.slope') as HTMLElement;
    this.altEl = el.querySelector('.alt') as HTMLElement;
    this.spdEl = el.querySelector('.spd') as HTMLElement;
  }

  update(s: RigState, route: RouteDef): void {
    const slopeDeg = Math.round(Math.atan(route.slopeAt(s.x)) * 180 / Math.PI);
    this.slopeEl.textContent = `SLOPE ${slopeDeg >= 0 ? '+' : ''}${slopeDeg}°`;
    const alt = Math.round(1200 + route.heightAt(s.x));
    this.altEl.textContent = `ALT ${thinThousands(alt)} m`;
    const kmh = Math.round(s.speed * 3.6);
    this.spdEl.textContent = `${kmh} km/h`;
  }
}
