import type { RouteDef } from '../sim/types';

const f1 = (n: number): string => n.toFixed(1);

/** Screen mapping: x across the window, +z downwards, bound = halfWidth + pocketDepth + 3 (edge walls visible). */
export function mapPoint(route: RouteDef, x: number, z: number, x0: number, x1: number, w: number, h: number): { sx: number; sy: number } {
  const bound = route.halfWidth + 11;
  return { sx: (x - x0) / Math.max(1, x1 - x0) * w, sy: h / 2 + z / bound * (h / 2) };
}

function layer(route: RouteDef, x0: number, x1: number, w: number, h: number): string {
  const p = (x: number, z: number) => mapPoint(route, x, z, x0, x1, w, h);
  const parts: string[] = [];
  for (const wall of route.walls) {
    if (wall.x1 < x0 || wall.x0 > x1) continue;
    const a = p(Math.max(wall.x0, x0), wall.z0), b = p(Math.min(wall.x1, x1), wall.z1);
    parts.push(`<rect class="wall ${wall.kind}" x="${f1(a.sx)}" y="${f1(a.sy)}" width="${f1(Math.max(0.6, b.sx - a.sx))}" height="${f1(Math.max(0.6, b.sy - a.sy))}"/>`);
  }
  for (const hz of route.hazards) {
    const end = hz.x1 ?? hz.x;
    if (end < x0 || hz.x > x1) continue;
    if (hz.x1 !== undefined) {
      const a = p(Math.max(hz.x, x0), hz.z - hz.halfW), b = p(Math.min(hz.x1, x1), hz.z + hz.halfW);
      parts.push(`<rect class="hz hz-${hz.type}" x="${f1(a.sx)}" y="${f1(a.sy)}" width="${f1(Math.max(1, b.sx - a.sx))}" height="${f1(Math.max(1, b.sy - a.sy))}"/>`);
    } else {
      const c = p(hz.x, hz.z);
      parts.push(`<circle class="hz hz-${hz.type}" cx="${f1(c.sx)}" cy="${f1(c.sy)}" r="2.4"/>`);
    }
  }
  for (const d of route.discoveries) {
    if (d.x < x0 || d.x > x1) continue;
    const c = p(d.x, d.z);
    parts.push(`<rect class="cache" data-cache="${d.id}" x="${f1(c.sx - 2)}" y="${f1(c.sy - 2)}" width="4" height="4" transform="rotate(45 ${f1(c.sx)} ${f1(c.sy)})"/>`);
  }
  for (const t of route.turrets) {
    if (t.x < x0 || t.x > x1) continue;
    // Clamp z to the edge of the band since turrets sit outside the corridor
    const bound = route.halfWidth + 11;
    const clampedZ = Math.max(-bound, Math.min(bound, t.z));
    const c = p(t.x, clampedZ);
    parts.push(`<rect class="turret" x="${f1(c.sx - 1.5)}" y="${f1(c.sy - 1.5)}" width="3" height="3"/>`);
  }
  return parts.join('');
}

/** Whole-route planning sketch for the dispatch screen. */
export function routeSketchSvg(route: RouteDef, w = 480, h = 96): string {
  const corridor = `<rect class="corridor" x="0" y="${f1(mapPoint(route, 0, -route.halfWidth, 0, route.length, w, h).sy)}" width="${w}" height="${f1(route.halfWidth / (route.halfWidth + 11) * h)}"/>`;
  return `<svg class="sketch" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Route sketch">${corridor}${layer(route, 0, route.length, w, h)}</svg>`;
}

/** Static layer of the HUD minimap for the window [x0, x1]. The rig marker is positioned separately with mapPoint. */
export function minimapMarkup(route: RouteDef, x0: number, x1: number, w = 180, h = 100): string {
  return layer(route, x0, x1, w, h);
}
