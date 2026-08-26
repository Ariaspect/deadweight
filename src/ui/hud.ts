import type { HazardType, RigState, RouteDef } from '../sim/types';
import { moverActive } from '../sim/step';
import { minimapMarkup, mapPoint } from './sketch';

const HAZARD_NAMES: Record<HazardType, string> = {
  gust: 'CROSSWIND', rubble: 'RUBBLE FIELD', gap: 'COLLAPSED SPAN', grade: 'STEEP GRADE', scree: 'SCREE RUN',
  mud: 'MUD', rockfall: 'ROCKFALL', crane: 'SWINGING LOAD',
};
const MAP_W = 180, MAP_H = 100, WINDOW_BEHIND = 40, WINDOW_AHEAD = 200, REBUILD_EVERY = 20;

function thinThousands(n: number): string {
  const neg = n < 0;
  const digits = String(Math.abs(n));
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) groups.unshift(digits.slice(Math.max(0, i - 3), i));
  return (neg ? '-' : '') + groups.join(' ');
}

export interface HudHandlers { onSelectBay(slot: number): void }

export class Hud {
  private readonly slopeEl: HTMLElement;
  private readonly altEl: HTMLElement;
  private readonly spdEl: HTMLElement;
  private readonly distanceEl: HTMLElement;
  private readonly threatEl: HTMLElement;
  private readonly progressEl: HTMLElement;
  private readonly exploreEl: HTMLElement;
  private readonly mapLayer: SVGGElement;
  private readonly mapPlayer: SVGCircleElement;
  private readonly cargoRackEl: HTMLElement;
  private windowX0 = Number.NaN;
  private rackKey = '';

  constructor(viewport: HTMLElement, private readonly h: HudHandlers) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `<div class="hud-top"><span class="route-mark">MULE•7 / LIVE HAUL</span><span class="distance"></span></div>
      <div class="threat" hidden><span class="threat-label"></span><b></b></div>
      <div class="explore"></div>
      <svg class="minimap" viewBox="0 0 ${MAP_W} ${MAP_H}" aria-label="Route map"><g class="layer"></g><circle class="map-player" r="2.5"/></svg>
      <div class="cargo-rack"></div>
      <div class="drive-help"><b>W/S</b> WALK · <b>A/D</b> LANE · <b>SPACE</b> JUMP · <b>TAB</b> BAY · <b>F</b> RATCHET · <b>SHIFT</b> BRACE · <b>DRAG</b> BALLAST</div>
      <div class="hud-bottom"><span class="slope"></span><span class="alt"></span><span class="spd"></span></div>
      <div class="route-progress"><i></i></div>`;
    viewport.appendChild(el);
    const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
    this.slopeEl = q('.slope'); this.altEl = q('.alt'); this.spdEl = q('.spd'); this.distanceEl = q('.distance');
    this.threatEl = q('.threat'); this.progressEl = q('.route-progress i'); this.exploreEl = q('.explore');
    this.mapLayer = q('.minimap .layer'); this.mapPlayer = q('.map-player'); this.cargoRackEl = q('.cargo-rack');
    this.cargoRackEl.addEventListener('pointerdown', (e) => {
      const bay = (e.target as HTMLElement).closest<HTMLElement>('.cargo-bay');
      if (bay) this.h.onSelectBay(Number(bay.dataset.slot));
    });
  }

  update(s: RigState, route: RouteDef): void {
    // minimap: scrolling window, static layer rebuilt every REBUILD_EVERY metres
    const x0 = Math.max(0, Math.floor((s.x - WINDOW_BEHIND) / REBUILD_EVERY) * REBUILD_EVERY), x1 = x0 + WINDOW_BEHIND + WINDOW_AHEAD;
    if (x0 !== this.windowX0) { this.windowX0 = x0; this.mapLayer.innerHTML = minimapMarkup(route, x0, x1, MAP_W, MAP_H); }
    const p = mapPoint(route, s.x, s.z, x0, x1, MAP_W, MAP_H);
    this.mapPlayer.setAttribute('cx', p.sx.toFixed(1)); this.mapPlayer.setAttribute('cy', p.sy.toFixed(1));
    for (const cache of this.mapLayer.querySelectorAll<SVGElement>('.cache')) cache.classList.toggle('found', s.foundDiscoveries.includes(Number(cache.dataset.cache)));

    // cargo rack
    const rackKey = s.items.map((it) => `${it.slot}${it.lost ? 'L' : ''}${it.slot === s.selectedSlot ? 'S' : ''}${Math.round(it.restraint)}:${Math.round((1 - it.stress) * 100)}`).join('|');
    if (rackKey !== this.rackKey) {
      this.rackKey = rackKey;
      this.cargoRackEl.innerHTML = [...s.items].sort((a, b) => a.slot - b.slot).map((it) => {
        const condition = Math.max(0, Math.round((1 - it.stress) * 100));
        const crushing = !it.lost && it.restraint > it.crushLimit;
        const warning = it.lost ? 'LOST' : crushing ? 'CRUSHING' : it.restraint < 30 ? 'LOOSE' : `${condition}% OK`;
        const selected = it.slot === s.selectedSlot;
        return `<div class="cargo-bay${selected ? ' selected' : ''}${it.lost || crushing || it.restraint < 30 ? ' warning' : ''}" data-slot="${it.slot}"><b>${['FORE', 'MID', 'AFT'][it.slot]} · ${it.id.toUpperCase()}</b><span>${warning}</span><i><em class="${crushing ? 'crush' : ''}" style="width:${Math.round(it.restraint)}%"></em><u style="left:${it.crushLimit}%"></u></i></div>`;
      }).join('');
    }

    // readouts
    const slopeDeg = Math.round(Math.atan(route.slopeAt(s.x)) * 180 / Math.PI);
    this.slopeEl.textContent = `SLOPE ${slopeDeg >= 0 ? '+' : ''}${slopeDeg}°`;
    this.altEl.textContent = `ALT ${thinThousands(Math.round(1200 + route.heightAt(s.x)))} m`;
    this.spdEl.textContent = `${Math.round(Math.abs(s.speed) * 3.6)} km/h${s.grounded ? '' : ` · AIR +${s.lift.toFixed(1)}m`}`;
    this.spdEl.classList.toggle('airborne', !s.grounded);
    this.distanceEl.textContent = `${Math.max(0, Math.ceil(route.length - s.x))} m TO DROP`;
    this.progressEl.style.width = `${Math.min(100, s.x / route.length * 100)}%`;

    // salvage pointer
    const unfound = route.discoveries.filter((d) => !s.foundDiscoveries.includes(d.id));
    const closest = unfound.sort((a, b) => (a.x - s.x) ** 2 + (a.z - s.z) ** 2 - ((b.x - s.x) ** 2 + (b.z - s.z) ** 2))[0];
    if (closest) {
      const side = closest.z < s.z ? '◀' : '▶';
      this.exploreEl.textContent = `SALVAGE ${side} ${Math.round(Math.hypot(closest.x - s.x, closest.z - s.z))}m  ·  ${s.foundDiscoveries.length}/${route.discoveries.length}`;
    } else this.exploreEl.textContent = `ALL SALVAGE RECOVERED  ·  ${s.foundDiscoveries.length}/${route.discoveries.length}`;

    // threat: next impulse hazard in my lane
    const next = route.hazards.find((h) => (h.x1 ?? h.x) >= s.x && h.impulse > 0 && Math.abs(s.z - h.z) < h.halfW);
    const metres = next ? Math.max(0, Math.ceil(next.x - s.x)) : Infinity;
    const visible = Boolean(next && metres < 55);
    this.threatEl.hidden = !visible;
    this.threatEl.classList.toggle('critical', metres < 15);
    if (next && visible) {
      const mover = next.cycleTicks !== undefined ? (moverActive(s.t, next) ? ' · ACTIVE' : ' · CLEAR') : '';
      (this.threatEl.querySelector('.threat-label') as HTMLElement).textContent = metres < 15 ? 'IMPACT IMMINENT' : 'OBSTACLE AHEAD';
      (this.threatEl.querySelector('b') as HTMLElement).textContent = `${HAZARD_NAMES[next.type]} · ${metres}m${mover}`;
    }
  }
}
