import type { ItemState, RigState } from '../sim/types';

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }
export interface Pose { position: Vec3; rotation: Quat }

export type PlatformKind = 'road' | 'danger' | 'checkpoint' | 'island';
export interface CoursePlatform { id: string; position: Vec3; size: Vec3; rotation: Quat; kind: PlatformKind }
export type CourseObstacleKind = 'spinner' | 'hammer' | 'crusher' | 'fan' | 'boulder' | 'breakaway';
export interface CourseObstacle { id: string; kind: CourseObstacleKind; position: Vec3; size: Vec3; axis?: Vec3; phase: number; speed: number }
export interface CourseCheckpoint { id: string; name: string; position: Vec3; radius: number }
export interface CourseSalvage { id: number; name: string; position: Vec3; value: number }

export interface CourseDef {
  id: string; name: string; spawn: Vec3; finish: Vec3; finishRadius: number;
  bounds: { minY: number; minX: number; maxX: number; minZ: number; maxZ: number }; platforms: CoursePlatform[]; obstacles: CourseObstacle[];
  checkpoints: CourseCheckpoint[]; salvage: CourseSalvage[];
}

export interface CourseCargoFrame { id: string; pose: Pose; anchor: Vec3; condition: number; lost: boolean; tension: number; restraint: number; selected: boolean }
export interface CourseObstacleFrame { id: string; pose: Pose }
export interface CourseFrame {
  vehicle: Pose; cargo: CourseCargoFrame[]; obstacles: CourseObstacleFrame[];
  state: RigState; speed: number; elapsed: number; checkpoint: number; resets: number;
  salvage: number[]; finishDistance: number; message: string | null;
}

export interface CourseResultState {
  state: RigState; items: ItemState[]; elapsed: number; resets: number;
}
