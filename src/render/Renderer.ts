import type { ItemDef, RigState, RouteDef } from '../sim/types';
import type { CourseDef, CourseFrame } from '../course/types';
export interface RenderPrev { x: number; z: number; lift: number; lateralVel: number; tilt: number; speed: number }
export interface Renderer {
  mount(el: HTMLElement): void;
  setLoadout(items: ItemDef[]): void;
  setRoute(route: RouteDef): void;
  draw(curr: RigState, prev: RenderPrev, alpha: number): void;
  setCourse(course: CourseDef, items: ItemDef[]): void;
  drawCourse(frame: CourseFrame, alpha: number): void;
  courseControlAxes(): { forwardX: number; forwardZ: number; rightX: number; rightZ: number };
  resize(): void;
  dispose(): void;
}
