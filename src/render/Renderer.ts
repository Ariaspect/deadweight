import type { ItemDef, RigState, RouteDef } from '../sim/types';
export interface RenderPrev { x: number; tilt: number; speed: number }
export interface Renderer {
  mount(el: HTMLElement): void;
  setLoadout(items: ItemDef[]): void;
  setRoute(route: RouteDef): void;
  draw(curr: RigState, prev: RenderPrev, alpha: number): void;
  resize(): void;
  dispose(): void;
}
