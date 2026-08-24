import type { ItemDef, InputFrame, RouteDef } from '../src/sim/types';
import { routeFromSegments } from '../src/sim/terrain';
import { tuning } from '../src/content';

export function flatRoute(length = 500): RouteDef {
  return routeFromSegments(1, [{ x0: 0, x1: length, slope: 0, y0: 0 }], [], tuning.terrain.profileStepM);
}
export function slopeRoute(slope: number, length = 500): RouteDef {
  return routeFromSegments(2, [{ x0: 0, x1: length, slope, y0: 0 }], [], tuning.terrain.profileStepM);
}
export function crateDef(over: Partial<ItemDef> = {}): ItemDef {
  return { id: 'crate', name: 'Crate', mass: 1, tolerance: 0.5, crushLimit: 90, behavior: 'static', payout: 100, tier: 0, art: { shape: 'box', color: '#8a6d3b' }, ...over };
}
export function frame(over: Partial<InputFrame> = {}): InputFrame {
  return { gait: 2, ballast: 0, strap: false, brace: false, deploy: 0, recover: false, ...over };
}
