import type { InputFrame, ItemState, LoadoutItem, RigState, RouteDef, Trace, Tuning } from './types';
import type { Rng } from './rng';

export function createRun(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning): RigState {
  void route;
  const items: ItemState[] = loadout.map((li) => ({
    id: li.def.id, slot: li.slot, mass: li.def.mass, tolerance: li.def.tolerance, crushLimit: li.def.crushLimit,
    behavior: li.def.behavior, payout: li.def.payout,
    offset: 0, offsetVel: 0, stress: 0, lost: false,
    deadlineTick: li.def.rush !== undefined ? Math.round(li.def.rush / tuning.dt) : -1,
  }));
  return {
    t: 0, x: 0, tilt: 0, tiltVel: 0, gait: 0, ballast: 0,
    strap: tuning.strapStart, reserve: tuning.reserveStart, braced: false,
    items, recovering: 0, hazardCursor: 0, overTiltTicks: 0, ended: null,
  };
}

export function drainRate(route: RouteDef, tuning: Tuning): number {
  return tuning.reserveBudget * 100 * tuning.gaitSpeed[2]! / route.length;
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

export function loadOffsetOf(items: ItemState[], tuning: Tuning): number {
  let m = 0, sum = 0;
  for (const it of items) {
    if (it.lost) continue;
    m += it.mass;
    sum += it.mass * (tuning.slotPos[it.slot]! + it.offset);
  }
  return m > 0 ? sum / m : 0;
}

export function stepRig(s: RigState, input: InputFrame, route: RouteDef, tuning: Tuning): void {
  const dt = tuning.dt;
  s.gait = input.gait;
  s.ballast = clamp(Math.round(input.ballast), -tuning.ballastRange, tuning.ballastRange);

  const slope = route.slopeAt(s.x);
  const load = loadOffsetOf(s.items, tuning);
  const torque = tuning.kSlope * slope + tuning.kBallast * (s.ballast / 100) + tuning.kLoad * load;
  const acc = torque - tuning.damping * s.tiltVel - tuning.stiffness * s.tilt;
  s.tiltVel += acc * dt;
  s.tilt += s.tiltVel * dt;

  s.x += tuning.gaitSpeed[s.gait]! * tuning.gaitSpeedMul * dt;
  s.reserve -= drainRate(route, tuning) * dt;
}

export function stepItems(s: RigState, tuning: Tuning, rng: Rng): void {
  const dt = tuning.dt;
  const over = Math.abs(s.tilt) > tuning.driftThreshold;
  s.overTiltTicks = over ? s.overTiltTicks + 1 : 0;
  const drifting = s.overTiltTicks > tuning.graceTicks;
  const loose = 1 - s.strap / 100;
  for (const it of s.items) {
    if (it.lost) continue;
    switch (it.behavior) {
      case 'static':
        if (drifting) it.offset += tuning.kDrift * s.tilt * loose * dt;
        break;
      case 'precarious':
        if (drifting) it.offset += tuning.kDrift * tuning.precariousMul * s.tilt * loose * dt;
        break;
      case 'slosh': {
        const target = s.tilt * tuning.sloshGain;
        const a = tuning.sloshStiff * (target - it.offset) - tuning.sloshDamp * it.offsetVel;
        it.offsetVel += a * dt;
        it.offset += it.offsetVel * dt;
        break;
      }
      case 'livestock':
        it.offset += rng.gaussian() * tuning.kLive * (0.3 + 0.7 * loose) * dt;
        if (drifting) it.offset += tuning.kDrift * s.tilt * loose * dt;
        break;
    }
    it.offset = clamp(it.offset, -1.5, 1.5);
    it.stress += Math.max(0, Math.abs(s.tilt) - it.tolerance) * tuning.kStress * dt;
    it.stress += Math.max(0, s.strap - it.crushLimit) * tuning.kCrush * dt;
  }
}

function spillCheck(s: RigState, tuning: Tuning): void {
  if (Math.abs(s.tilt) < tuning.spillTilt) return;
  let worst: ItemState | null = null, worstAbs = -1;
  for (const it of s.items) {
    if (it.lost) continue;
    const a = Math.abs(tuning.slotPos[it.slot]! + it.offset);
    if (a > worstAbs) { worstAbs = a; worst = it; }
  }
  if (!worst) return;
  worst.lost = true;
  s.tilt = s.tilt > 0 ? Math.max(0, s.tilt - tuning.spillRelief) : Math.min(0, s.tilt + tuning.spillRelief);
  s.tiltVel = 0;
  s.overTiltTicks = 0;
  if (s.items.every((it) => it.lost)) s.ended = 'spilled';
}

export function stepEvents(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  void input; void traces; void rng;
  spillCheck(s, tuning);
  if (s.ended) return;
  if (s.reserve <= 0) { s.reserve = 0; s.ended = 'stalled'; return; }
  if (s.x >= route.length) { s.x = route.length; s.ended = 'arrived'; }
}

export function step(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  if (s.ended) return;
  stepRig(s, input, route, tuning);
  stepItems(s, tuning, rng);
  stepEvents(s, input, route, traces, tuning, rng);
  s.t += 1;
}
