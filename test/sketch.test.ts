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
});
