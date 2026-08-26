import type { HazardType, RigState, RouteDef } from '../sim/types';
import type { CourseDef, CourseFrame } from '../course/types';

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

  updateCourse(frame: CourseFrame, course: CourseDef): void {
    const { state } = frame;
    this.cargoRackEl.hidden = false;
    const rackKey = frame.cargo.map((c) => `${c.lost ? 1 : 0}${c.selected ? 1 : 0}${c.tension > 0.95 ? 1 : 0}${Math.round(c.restraint * 100)}:${Math.round(c.condition * 100)}`).join('|');
    if (rackKey !== this.rackKey) this.cargoRackEl.innerHTML = frame.cargo.map((cargo, index) => {
      const restraint = Math.round(cargo.restraint * 100), condition = Math.round(cargo.condition * 100);
      const warning = cargo.lost ? 'LOST' : cargo.tension > 0.95 ? 'OVERLOAD' : cargo.restraint < 0.3 ? 'LOOSE' : `${condition}% OK`;
      return `<div class="cargo-bay${cargo.selected ? ' selected' : ''}${cargo.lost || warning !== `${condition}% OK` ? ' warning' : ''}"><b>${index + 1} · ${cargo.id.toUpperCase()}</b><span>${warning}</span><i><em style="width:${restraint}%"></em></i></div>`;
    }).join('');
    this.rackKey = rackKey;
    const mapKey = course.id.length * 1000 + course.obstacles.length;
    if (this.mapSeed !== mapKey) {
      this.mapSeed = mapKey;
      const platforms = course.platforms.map((platform) => {
        const cx = (platform.position.x + 100) * 0.85, cy = 50 + platform.position.z * 1.1;
        const yaw = Math.atan2(2 * (platform.rotation.w * platform.rotation.y + platform.rotation.x * platform.rotation.z), 1 - 2 * (platform.rotation.y ** 2 + platform.rotation.z ** 2)) * 180 / Math.PI;
        return `<rect class="map-platform ${platform.kind}" x="${cx - platform.size.x * 0.425}" y="${cy - platform.size.z * 0.55}" width="${platform.size.x * 0.85}" height="${platform.size.z * 1.1}" transform="rotate(${-yaw} ${cx} ${cy})"/>`;
      }).join('');
      const caches = course.salvage.map((salvage) => `<circle class="map-cache" data-cache="${salvage.id}" cx="${(salvage.position.x + 100) * 0.85}" cy="${50 + salvage.position.z * 1.1}" r="2.3"/>`).join('');
      this.mapEl.setAttribute('viewBox', '0 0 180 100');
      this.mapEl.innerHTML = `${platforms}${caches}<circle class="map-finish" cx="${(course.finish.x + 100) * 0.85}" cy="${50 + course.finish.z * 1.1}" r="4"/><circle class="map-player" r="2.8"/>`;
    }
    const player = this.mapEl.querySelector('.map-player') as SVGCircleElement;
    player.setAttribute('cx', String((frame.vehicle.position.x + 100) * 0.85)); player.setAttribute('cy', String(50 + frame.vehicle.position.z * 1.1));
    for (const cache of this.mapEl.querySelectorAll<SVGCircleElement>('.map-cache')) cache.classList.toggle('found', frame.salvage.includes(Number(cache.dataset.cache)));

    this.slopeEl.textContent = `CHECKPOINT ${frame.checkpoint + 1}/${course.checkpoints.length}`;
    this.altEl.textContent = `${Math.floor(frame.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(frame.elapsed % 60).toString().padStart(2, '0')} · RESET ${frame.resets}`;
    this.spdEl.textContent = `${Math.round(frame.speed * 3.6)} km/h${state.grounded ? '' : ' · AIR'}`;
    this.spdEl.classList.toggle('airborne', !state.grounded);
    this.distanceEl.textContent = `${Math.ceil(frame.finishDistance)} m TO SUMMIT`;
    this.progressEl.style.width = `${Math.max(0, Math.min(100, (frame.vehicle.position.x + 90) / 181 * 100))}%`;
    const remaining = course.salvage.filter((salvage) => !frame.salvage.includes(salvage.id));
    const nearest = remaining.sort((a, b) => distance2(frame.vehicle.position, a.position) - distance2(frame.vehicle.position, b.position))[0];
    if (nearest) {
      const metres = Math.round(Math.sqrt(distance2(frame.vehicle.position, nearest.position)));
      this.exploreEl.textContent = `SALVAGE ${nearest.name} · ${metres}m · ${frame.salvage.length}/${course.salvage.length}`;
    } else this.exploreEl.textContent = `ALL SALVAGE RECOVERED · ${frame.salvage.length}/${course.salvage.length}`;
    const danger = course.obstacles.map((obstacle) => ({ obstacle, d: distance2(frame.vehicle.position, obstacle.position) })).sort((a, b) => a.d - b.d)[0];
    const dangerous = Boolean(danger && danger.d < 18 ** 2);
    this.threatEl.hidden = !dangerous;
    this.threatEl.classList.toggle('critical', Boolean(danger && danger.d < 8 ** 2));
    if (danger && dangerous) {
      (this.threatEl.querySelector('.threat-label') as HTMLElement).textContent = danger.d < 8 ** 2 ? 'IMPACT IMMINENT' : 'MACHINERY NEARBY';
      (this.threatEl.querySelector('b') as HTMLElement).textContent = danger.obstacle.kind.toUpperCase();
    }
  }
}

function distance2(a: { x: number; z: number }, b: { x: number; z: number }): number { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }
