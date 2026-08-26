import type { HazardType, RigState, RouteDef } from '../sim/types';

const HAZARD_NAMES: Record<HazardType, string> = {
  gust: 'CROSSWIND', rubble: 'RUBBLE FIELD', gap: 'BROKEN BRIDGE', grade: 'EXTREME GRADE', scree: 'SCREE RUN',
  hammer: 'GIANT HAMMER', crusher: 'HYDRAULIC CRUSHER', fan: 'TURBO FAN', launchpad: 'LAUNCH RAMP',
};

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
  private readonly distanceEl: HTMLElement;
  private readonly threatEl: HTMLElement;
  private readonly progressEl: HTMLElement;
  private readonly exploreEl: HTMLElement;
  private readonly mapEl: SVGElement;
  private readonly cargoRackEl: HTMLElement;
  private mapSeed = -1;
  private rackKey = '';

  constructor(viewport: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `<div class="hud-top"><span class="route-mark">MULE•7 / LIVE HAUL</span><span class="distance"></span></div>
      <div class="threat" hidden><span class="threat-label"></span><b></b></div>
      <div class="explore"></div>
      <svg class="minimap" viewBox="0 0 140 80" aria-label="Route map"></svg>
      <div class="cargo-rack" hidden></div>
      <div class="drive-help"><b>WASD</b> CAMERA DRIVE · <b>1/2/3</b> SELECT BAY · <b>F</b> RATCHET · <b>SHIFT</b> BRACE</div>
      <div class="hud-bottom"><span class="slope"></span><span class="alt"></span><span class="spd"></span></div>
      <div class="route-progress"><i></i></div>`;
    viewport.appendChild(el);
    this.slopeEl = el.querySelector('.slope') as HTMLElement;
    this.altEl = el.querySelector('.alt') as HTMLElement;
    this.spdEl = el.querySelector('.spd') as HTMLElement;
    this.distanceEl = el.querySelector('.distance') as HTMLElement;
    this.threatEl = el.querySelector('.threat') as HTMLElement;
    this.progressEl = el.querySelector('.route-progress i') as HTMLElement;
    this.exploreEl = el.querySelector('.explore') as HTMLElement;
    this.mapEl = el.querySelector('.minimap') as SVGElement;
    this.cargoRackEl = el.querySelector('.cargo-rack') as HTMLElement;
  }

  update(s: RigState, route: RouteDef): void {
    this.cargoRackEl.hidden = true;
    if (this.mapSeed !== route.seed) {
      this.mapSeed = route.seed;
      const points: string[] = [];
      for (let i = 0; i <= 40; i++) { const x = route.length * i / 40; points.push(`${(x / route.length * 140).toFixed(1)},${(40 - route.centerAt(x) * 1.35).toFixed(1)}`); }
      this.mapEl.innerHTML = `<polyline class="map-route" points="${points.join(' ')}" />${route.discoveries.map((d) => `<circle class="map-cache" data-cache="${d.id}" cx="${d.x / route.length * 140}" cy="${40 - d.z * 1.35}" r="2.3"/>`).join('')}<circle class="map-player" r="2.5"/>`;
    }
    const player = this.mapEl.querySelector('.map-player') as SVGCircleElement;
    player.setAttribute('cx', String(s.x / route.length * 140)); player.setAttribute('cy', String(40 - s.z * 1.35));
    for (const cache of this.mapEl.querySelectorAll<SVGCircleElement>('.map-cache')) cache.classList.toggle('found', s.foundDiscoveries.includes(Number(cache.dataset.cache)));
    const slopeDeg = Math.round(Math.atan(route.slopeAt(s.x)) * 180 / Math.PI);
    this.slopeEl.textContent = `SLOPE ${slopeDeg >= 0 ? '+' : ''}${slopeDeg}°`;
    const alt = Math.round(1200 + route.heightAt(s.x));
    this.altEl.textContent = `ALT ${thinThousands(alt)} m`;
    const kmh = Math.round(s.speed * 3.6);
    this.spdEl.textContent = `${kmh} km/h`;
    this.spdEl.classList.toggle('airborne', !s.grounded);
    if (!s.grounded) this.spdEl.textContent += ` · AIR +${s.lift.toFixed(1)}m`;
    this.distanceEl.textContent = `${Math.max(0, Math.ceil(route.length - s.x))} m TO DROP`;
    this.progressEl.style.width = `${Math.min(100, s.x / route.length * 100)}%`;
    const unfound = route.discoveries.filter((d) => !s.foundDiscoveries.includes(d.id));
    const closest = unfound.sort((a, b) => (a.x - s.x) ** 2 + (a.z - s.z) ** 2 - ((b.x - s.x) ** 2 + (b.z - s.z) ** 2))[0];
    if (closest) {
      const side = closest.z < s.z ? '◀' : '▶';
      const metres = Math.round(Math.hypot(closest.x - s.x, closest.z - s.z));
      this.exploreEl.textContent = `SALVAGE ${side} ${metres}m  ·  ${s.foundDiscoveries.length}/${route.discoveries.length}`;
    } else this.exploreEl.textContent = `ALL SALVAGE RECOVERED  ·  ${s.foundDiscoveries.length}/${route.discoveries.length}`;
    const next = route.hazards.find((h) => h.x > s.x);
    const metres = next ? Math.ceil(next.x - s.x) : Infinity;
    const visible = Boolean(next && metres < 55);
    this.threatEl.hidden = !visible;
    this.threatEl.classList.toggle('critical', metres < 15);
    if (next && visible) {
      (this.threatEl.querySelector('.threat-label') as HTMLElement).textContent = metres < 15 ? 'IMPACT IMMINENT' : 'OBSTACLE AHEAD';
      (this.threatEl.querySelector('b') as HTMLElement).textContent = `${HAZARD_NAMES[next.type]} · ${metres}m`;
    }
  }
}
