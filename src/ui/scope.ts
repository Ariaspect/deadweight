import type { RigState, Tuning } from '../sim/types';
import { octantOf, dangerLevel } from '../sim/turret';
import { highestDanger } from '../sim/step';

// src/ui is not under the sim purity rule: atan2/cos/sin are fine here.
const CX = 60, CY = 60, R = 56;
const BLIP_OUTER = 50, BLIP_INNER = 16;
const SWEEP_TICKS = 120;   // one revolution every 2s at 60Hz — a live, restless sweep, not a clock

const f1 = (n: number): string => n.toFixed(1);

/** Octant 0 (dead ahead, +x) points to the top of the scope; higher octants sweep clockwise, matching
 *  the anticlockwise-through-+z convention of octantOf when viewed with +z to the scope's right. */
function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const a = angleDeg * Math.PI / 180;
  return { x: CX + radius * Math.sin(a), y: CY - radius * Math.cos(a) };
}

/**
 * Pure SVG markup for the 360-degree threat scope: eight aimable sectors, a rotating sweep line, the
 * current danger level, and one blip per missile in flight — positioned by octantOf for its bearing
 * and by dangerLevel for its radius (closer to the centre the nearer it is to impact).
 */
export function scopeMarkup(s: RigState, tuning: Tuning): string {
  const worst = highestDanger(s, tuning);
  let armedOctant = -1;
  if (worst > 0) {
    for (const m of s.missiles) {
      if (dangerLevel(s.t - m.launchTick, tuning) === worst) { armedOctant = octantOf(m.x - s.x, m.z - s.z); break; }
    }
  }

  const sectors: string[] = [];
  for (let n = 0; n < 8; n++) {
    const p1 = polar(n * 45 - 22.5, R), p2 = polar(n * 45 + 22.5, R);
    const cls = n === armedOctant ? 'sector armed' : 'sector';
    sectors.push(`<path class="${cls}" data-sector="${n}" d="M${f1(CX)},${f1(CY)} L${f1(p1.x)},${f1(p1.y)} A${R},${R} 0 0 1 ${f1(p2.x)},${f1(p2.y)} Z"/>`);
  }

  const sweepDeg = (s.t % SWEEP_TICKS) / SWEEP_TICKS * 360;
  const tip = polar(sweepDeg, R);
  const sweep = `<line class="sweep" x1="${f1(CX)}" y1="${f1(CY)}" x2="${f1(tip.x)}" y2="${f1(tip.y)}"/>`;

  const levels = tuning.turret.levels;
  const blips = s.missiles.map((m) => {
    const octant = octantOf(m.x - s.x, m.z - s.z);
    const level = dangerLevel(s.t - m.launchTick, tuning);
    const radius = BLIP_OUTER - (level - 1) / Math.max(1, levels - 1) * (BLIP_OUTER - BLIP_INNER);
    const p = polar(octant * 45, radius);
    return `<circle class="blip" data-level="${level}" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(2.5 + level * 0.4)}"/>`;
  }).join('');

  const level = `<text class="level" x="${f1(CX)}" y="${f1(CY)}" text-anchor="middle" dominant-baseline="central">${worst > 0 ? worst : ''}</text>`;

  return `<svg class="scope-svg" viewBox="0 0 ${CX * 2} ${CY * 2}" aria-label="Threat scope">${sectors.join('')}${sweep}${level}${blips}</svg>`;
}
