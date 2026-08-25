export type Gait = 0 | 1 | 2 | 3 | 4;
export type Behavior = 'static' | 'slosh' | 'livestock' | 'precarious';
export type HazardType = 'gust' | 'rubble' | 'gap' | 'grade' | 'scree';
export type KitId = 'plank' | 'rope' | 'drum' | 'sign';
export type TraceType = KitId | 'wreckage';
export type EndReason = 'arrived' | 'spilled' | 'stalled';

export interface ItemDef {
  id: string; name: string; mass: number;
  tolerance: number;     // |tilt| above this accrues stress
  crushLimit: number;    // strap above this accrues stress
  behavior: Behavior; payout: number; rush?: number; tier: number;
  art: { shape: 'box' | 'cylinder' | 'sphere' | 'cage'; color: string };
}

export interface HazardDef {
  type: HazardType; impulse: number; strapJolt: number; telegraphM: number;
  counter: string; weight: number; minTier: number; count?: number; spreadM?: number;
}

export interface OutpostDef { id: string; name: string; seed: number; lengthM: number; tier: number; flavor: string }

export interface UpgradeDef {
  id: string; name: string; cost: number; blurb: string;
  effect: { key: 'ballastRange' | 'autoTrim' | 'strapJoltMul' | 'capacity' | 'gaitSpeedMul' | 'kitCostMul'; value: number };
}

export interface Segment { x0: number; x1: number; slope: number; y0: number }
export interface HazardInstance { id: number; type: HazardType; x: number; impulse: number; strapJolt: number; dir: 1 | -1 }

export interface RouteDef {
  seed: number; length: number; segments: Segment[]; hazards: HazardInstance[];
  slopeProfile: number[];            // sampled every terrain.profileStepM
  slopeAt(x: number): number;
  heightAt(x: number): number;
}

export interface ItemState {
  id: string; slot: number; mass: number; tolerance: number; crushLimit: number; behavior: Behavior; payout: number;
  offset: number; offsetVel: number; stress: number; lost: boolean; deadlineTick: number; // -1 = none
}

export interface RigState {
  t: number; x: number; tilt: number; tiltVel: number; gait: Gait; ballast: number;
  strap: number; reserve: number; braced: boolean; items: ItemState[];
  recovering: number; hazardCursor: number; overTiltTicks: number; ended: EndReason | null;
}

export interface InputFrame { gait: Gait; ballast: number; strap: boolean; brace: boolean; deploy: KitId | 0; recover: boolean }

export interface LoadoutItem { def: ItemDef; slot: number }

export interface Trace { id: string; seed: number; x: number; type: TraceType; ownerName: string; useCount: number; ageHours: number }

export interface TerrainTuning { segMin: number; segMax: number; slopeSigma: number[]; maxSlope: number; gradeSlope: number; hazardJitter: number; profileStepM: number; safeStartM: number; safeEndM: number }
export interface BotTuning { kp: number; kd: number; lagTicks: number; strapBelow: number; braceAheadM: number; leadSec: number }

export interface Tuning {
  dt: number; gaitSpeed: number[]; gaitSpeedMul: number;
  kSlope: number; kBallast: number; kLoad: number; damping: number; stiffness: number; braceDamp: number;
  reserveBudget: number; braceDrain: number; reserveStart: number;
  ballastRange: number; ballastRate: number; autoTrim: number;
  strapStart: number; strapTap: number; strapJoltMul: number;
  driftThreshold: number; graceTicks: number; kDrift: number; sloshGain: number; sloshStiff: number; sloshDamp: number; kLive: number; precariousMul: number;
  kStress: number; kCrush: number; spillTilt: number; spillRelief: number; hazardGaitScale: number[];
  recoverTicks: number; recoverCost: number; recoverStress: number;
  kBonus: number; stallMultiplier: number; starBuckets: number[];
  slotPos: number[]; capacity: number; kitCostMul: number;
  terrain: TerrainTuning; bot: BotTuning;
}

export interface ItemResult { id: string; condition: number; payout: number; lost: boolean; late: boolean }
export interface RunResult { items: ItemResult[]; stars: number; payout: number; bonus: number; total: number; ended: EndReason }

export interface ReviewDef { stars: 1 | 2 | 3 | 4 | 5; behavior: Behavior | 'any'; lines: string[] }
export interface HqDef { context: 'dispatch' | 'arrival' | 'spill' | 'stall'; behavior: Behavior | 'any'; lines: string[] }
