export type Gait = 0 | 1 | 2 | 3 | 4;
export type Behavior = 'static' | 'slosh' | 'livestock' | 'precarious';
export type HazardType = 'gust' | 'rubble' | 'gap' | 'grade' | 'scree' | 'mud' | 'rockfall' | 'crane';
export type KitId = 'plank' | 'rope' | 'drum' | 'sign';
export type TraceType = KitId | 'wreckage';
export type EndReason = 'arrived' | 'spilled' | 'stalled';
export type WallKind = 'wall' | 'rock' | 'ruin' | 'baffle';
export type LaneArchetype = 'direct' | 'chicane' | 'mud';

export interface ItemDef {
  id: string; name: string; mass: number;
  tolerance: number;     // |tilt| above this accrues stress
  crushLimit: number;    // restraint above this accrues stress
  behavior: Behavior; payout: number; rush?: number; tier: number;
  art: { shape: 'box' | 'cylinder' | 'sphere' | 'cage'; color: string };
}

export interface HazardDef {
  type: HazardType; impulse: number; strapJolt: number; telegraphM: number;
  counter: string; weight: number; minTier: number; count?: number; spreadM?: number;
  cycleTicks?: number; windowTicks?: number;   // movers only
}

export interface OutpostDef { id: string; name: string; seed: number; lengthM: number; tier: number; flavor: string }

export interface UpgradeDef {
  id: string; name: string; cost: number; blurb: string;
  effect: { key: 'ballastRange' | 'autoTrim' | 'strapJoltMul' | 'capacity' | 'gaitSpeedMul' | 'kitCostMul'
    | 'reserveStart' | 'mudSpeedMul' | 'driftThreshold'; value: number };
}

export interface Segment { x0: number; x1: number; slope: number; y0: number; z0?: number; z1?: number }
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Wall extends Rect { kind: WallKind }
export interface Lane { z0: number; z1: number; archetype: LaneArchetype }
export interface Fork { x0: number; x1: number; lanes: Lane[] }
export interface Pocket extends Rect { side: 1 | -1 }
export interface Layout { forks: Fork[]; walls: Wall[]; pockets: Pocket[] }

/** Corridor coordinates: x along the route, z across it (0 = centre line). Point hazards are crossed at x; zone hazards span x..x1. */
export interface HazardInstance {
  id: number; type: HazardType; x: number; z: number; halfW: number; impulse: number; strapJolt: number; dir: 1 | -1;
  x1?: number; cycleTicks?: number; windowTicks?: number; phase?: number;
}
export interface Discovery { id: number; x: number; z: number; name: string }
export interface StormFront { id: number; startTick: number; endTick: number }
export interface Turret { id: number; x: number; z: number; phase: number }
export interface Missile { id: number; x: number; z: number; launchTick: number; impactTick: number }

export interface RouteDef {
  seed: number; length: number; halfWidth: number; segments: Segment[];
  hazards: HazardInstance[]; zones: HazardInstance[]; discoveries: Discovery[]; storms: StormFront[]; turrets: Turret[];
  walls: Wall[]; forks: Fork[]; pockets: Pocket[];
  slopeProfile: number[];            // sampled every terrain.profileStepM
  slopeAt(x: number): number;
  heightAt(x: number): number;
  centerAt(x: number): number;       // world z of the centre line (render/HUD only)
  forkAt(x: number): Fork | null;
  laneAt(x: number, z: number): number;   // lane index inside a fork, else -1
}

export interface ItemState {
  id: string; slot: number; mass: number; tolerance: number; crushLimit: number; behavior: Behavior; payout: number;
  offset: number; offsetVel: number; stress: number; lost: boolean; deadlineTick: number; restraint: number; // -1 deadline = none
}

export interface RigState {
  t: number; x: number; z: number; lateralVel: number; lift: number; liftVel: number; grounded: boolean;
  tilt: number; tiltVel: number; gait: Gait; speed: number; targetSpeed: number; ballast: number; trimTarget: number; assist: number;
  strap: number; selectedSlot: number; reserve: number; braced: boolean; storm: number; radar: boolean; items: ItemState[]; foundDiscoveries: number[];
  zoneCooldown: number[];            // hazard id → tick until which it cannot hit again
  recovering: number; hazardCursor: number; overTiltTicks: number; ended: EndReason | null;
  missiles: Missile[]; shield: number; shieldUntil: number; shieldReadyAt: number;   // shield: faced octant 0..7, or -1 when down
}

export interface InputFrame {
  gait: Gait; ballast: number; strap: boolean; brace: boolean; deploy: KitId | 0; recover: boolean;
  throttle?: -1 | 0 | 1; steer?: -1 | 0 | 1; jump?: boolean; radar?: boolean; cargoSelect?: number; shieldSector?: number;
}

export interface LoadoutItem { def: ItemDef; slot: number }

export interface Trace { id: string; seed: number; x: number; z: number; type: TraceType; ownerName: string; useCount: number; ageHours: number }

export interface TerrainTuning {
  segMin: number; segMax: number; slopeSigma: number[]; maxSlope: number; gradeSlope: number; hazardJitter: number; profileStepM: number; safeStartM: number; safeEndM: number; pathWander: number;
  corridorHalfWidth: number; pocketDepth: number; spineThick: number; spineGapM: number; forkLenMin: number; forkLenMax: number; stretchLenMin: number; stretchLenMax: number;
}
export interface RouteTuning {
  tierWeight: number; lengthWeight: number; hazardWeight: number; zoneWeight: number; slopeWeight: number;
  payWeight: number; baseScore: number; easyBelow: number; hardAtOrAbove: number; offerCount: number; stormWeight: number; turretWeight: number;
}
export interface StormTuning {
  maxFronts: number[]; frontChance: number[];
  minDurationS: number; maxDurationS: number; rampS: number; maxStormFrac: number;
  windowLo: number; windowHi: number;
  speedMul: number; strapDrain: number;
}
export interface TurretTuning {
  countByTier: number[]; rangeM: number; scopeRangeM: number; cooldownTicks: number; offCorridorZ: number;
  flightTicks: number; levels: number; impulse: number; strapJolt: number;
  shieldCost: number; shieldTicks: number; shieldCooldown: number; shieldStopEpsilon: number;
}
export interface DifficultyTuning {
  fragileWeight: number; precariousWeight: number; rushWeight: number; massWeight: number; easyBelow: number; hardAtOrAbove: number;
}
export interface BotTuning { kp: number; kd: number; lagTicks: number; strapBelow: number; braceAheadM: number; leadSec: number; laneLookaheadM: number }

export interface Tuning {
  dt: number; gaitSpeed: number[]; gaitSpeedMul: number; gaitAccel: number; gaitDecel: number;
  kSlope: number; kBallast: number; kLoad: number; damping: number; stiffness: number; braceDamp: number; braceSpeed: number;
  reserveBudget: number; braceDrain: number; reserveStart: number; rushBonusMul: number; radarDrain: number;
  ballastRange: number; ballastRate: number; autoTrim: number;
  strapStart: number; strapTap: number; strapJoltMul: number; restraintDecay: Record<Behavior, number>;
  driftThreshold: number; graceTicks: number; kDrift: number; sloshGain: number; sloshStiff: number; sloshDamp: number; kLive: number; precariousMul: number;
  kStress: number; kCrush: number; spillTilt: number; spillRelief: number; hazardScaleMin: number; hazardScaleMax: number;
  recoverTicks: number; recoverCost: number; recoverStress: number;
  kBonus: number; stallMultiplier: number; starBuckets: number[];
  slotPos: number[]; capacity: number; kitCostMul: number;
  steerAccel: number; lateralDamping: number; lateralTip: number; jumpSpeed: number; gravity: number; landingTilt: number; landingJolt: number;
  rigRadius: number; wallStrikeSpeed: number; wallStrikeTilt: number; wallStrikeJolt: number; airTraction: number; mudTraction: number; mudSpeedMul: number;
  craneShove: number; hazardCooldownTicks: number;
  cacheReserve: number; cacheRepair: number; cacheBonus: number;
  route: RouteTuning; difficulty: DifficultyTuning; terrain: TerrainTuning; bot: BotTuning; storm: StormTuning; turret: TurretTuning;
}

export interface ItemResult { id: string; condition: number; payout: number; lost: boolean; rushed: boolean; late: boolean }
export interface RunResult { items: ItemResult[]; stars: number; payout: number; bonus: number; discoveryBonus: number; rushBonus: number; total: number; ended: EndReason; elapsed: number }

export interface ReviewDef { stars: 1 | 2 | 3 | 4 | 5; behavior: Behavior | 'any'; lines: string[] }
export interface HqDef { context: 'dispatch' | 'arrival' | 'spill' | 'stall'; behavior: Behavior | 'any'; lines: string[] }
