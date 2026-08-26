import { describe, it, expect } from 'vitest';
import { routeSketchSvg, minimapMarkup, mapPoint } from '../src/ui/sketch';
import { generateRoute } from '../src/sim/terrain';
import { tuning, hazards } from '../src/content';

const route = generateRoute(6142, 780, 2, hazards, tuning);

describe('route sketch', () => {
  it('draws one rect per wall, one glyph per hazard, one marker per discovery and one mark per turret', () => {
    const svg = routeSketchSvg(route);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/class="wall (wall|rock|ruin|baffle)"/g)).toHaveLength(route.walls.length);
    expect(svg.match(/class="hz hz-/g)).toHaveLength(route.hazards.length);
    expect(svg.match(/class="cache"/g)).toHaveLength(route.discoveries.length);
    expect(svg.match(/class="turret"/g)).toHaveLength(route.turrets.length);
  });
  it('minimap only includes what falls inside the window', () => {
    const inside = minimapMarkup(route, 100, 340);
    const wallsIn = route.walls.filter((w) => w.x1 >= 100 && w.x0 <= 340).length;
    expect(inside.match(/class="wall /g)?.length ?? 0).toBe(wallsIn);
    expect(minimapMarkup(route, 5000, 5200)).not.toMatch(/class="hz/);
  });
  it('mapPoint maps x across and +z downwards', () => {
    const p = mapPoint(route, 220, 0, 100, 340, 180, 100);
    expect(p.sx).toBeCloseTo(90); expect(p.sy).toBeCloseTo(50);
    expect(mapPoint(route, 220, 10, 100, 340, 180, 100).sy).toBeGreaterThan(50);
  });
  it('draws turret marks fully inside the sketch and the minimap, not clipped at the edge', () => {
    // turrets sit far outside the corridor, so their z has to be pulled in — but pinning them to the exact
    // band edge puts half the marker outside the viewBox and the rest under the 2px border
    const svg = routeSketchSvg(route);
    const marks = [...svg.matchAll(/<rect class="turret"[^>]*y="([-0-9.]+)"[^>]*height="([0-9.]+)"/g)];
    expect(marks.length, 'the fixture route carries turrets').toBeGreaterThan(0);
    for (const m of marks) {
      const y = Number(m[1]), h = Number(m[2]);
      expect(y, 'top edge inside the box').toBeGreaterThanOrEqual(0);
      expect(y + h, 'bottom edge inside the 96-tall sketch').toBeLessThanOrEqual(96);
    }
    const mini = [...minimapMarkup(route, 0, route.length, 180, 100).matchAll(/<rect class="turret"[^>]*y="([-0-9.]+)"[^>]*height="([0-9.]+)"/g)];
    for (const m of mini) {
      const y = Number(m[1]), h = Number(m[2]);
      expect(y, 'top edge inside the minimap').toBeGreaterThanOrEqual(0);
      expect(y + h, 'bottom edge inside the 100-tall minimap').toBeLessThanOrEqual(100);
    }
  });

});
