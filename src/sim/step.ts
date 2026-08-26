import type { HazardInstance, InputFrame, ItemState, LoadoutItem, Missile, RigState, RouteDef, Trace, Tuning } from './types';
import type { Rng } from './rng';
import { resolveWalls } from './walls';
import { stormLevel } from './storm';
import { dangerLevel, octantOf } from './turret';

export function createRun(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning): RigState {
  void route;
  const items: ItemState[] = loadout.map((li) => ({
    id: li.def.id, slot: li.slot, mass: li.def.mass, tolerance: li.def.tolerance, crushLimit: li.def.crushLimit,
    behavior: li.def.behavior, payout: li.def.payout,
    offset: 0, offsetVel: 0, stress: 0, lost: false,
    deadlineTick: li.def.rush !== undefined ? Math.round(li.def.rush / tuning.dt) : -1,
    restraint: Math.min(tuning.strapStart, li.def.crushLimit),   // strapping past the crush limit would rot the load from tick 0
  }));
  return {
    t: 0, x: 0, z: 0, lateralVel: 0, lift: 0, liftVel: 0, grounded: true,
    tilt: 0, tiltVel: 0, gait: 0, speed: 0, targetSpeed: 0, ballast: 0, trimTarget: 0, assist: 0,
    strap: tuning.strapStart, selectedSlot: items.reduce((m, it) => Math.min(m, it.slot), items.length ? 99 : 0), reserve: tuning.reserveStart, braced: false,
    storm: 0, radar: false,
    missiles: [], shield: -1, shieldUntil: 0, shieldReadyAt: 0,
    items, foundDiscoveries: [], zoneCooldown: [], recovering: 0, hazardCursor: 0, overTiltTicks: 0, ended: null,
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

export function predictTrim(loadout: LoadoutItem[], tuning: Tuning): number {
  let m = 0, sum = 0;
  for (const l of loadout) { m += l.def.mass; sum += l.def.mass * tuning.slotPos[l.slot]!; }
  const load = m > 0 ? sum / m : 0;
  return Math.round(-(tuning.kLoad * load) / tuning.kBallast * 100) || 0; // normalise -0 (balanced load) to 0
}

export function inZone(s: RigState, h: HazardInstance): boolean {
  return h.x1 !== undefined && s.x >= h.x && s.x <= h.x1 && Math.abs(s.z - h.z) < h.halfW;
}

export function itemAtSlot(s: RigState, slot: number): ItemState | undefined {
  return s.items.find((it) => it.slot === slot);
}

function syncStrap(s: RigState): void {
  const sel = itemAtSlot(s, s.selectedSlot);
  s.strap = sel && !sel.lost ? sel.restraint : 0;
}

export function loosenAll(s: RigState, amount: number): void {
  for (const it of s.items) if (!it.lost) it.restraint = Math.max(0, it.restraint - amount);
  syncStrap(s);
}

function applyRestraintInput(s: RigState, input: InputFrame, tuning: Tuning): void {
  if (input.cargoSelect !== undefined && itemAtSlot(s, input.cargoSelect)) s.selectedSlot = input.cargoSelect;
  const sel = itemAtSlot(s, s.selectedSlot);
  if (input.strap && sel && !sel.lost) sel.restraint = Math.min(100, sel.restraint + tuning.strapTap);
  const stormDrain = s.storm * tuning.storm.strapDrain;   // s.storm is this tick's level: stepRig assigns it above the call
  for (const it of s.items) if (!it.lost) it.restraint = Math.max(0, it.restraint - (tuning.restraintDecay[it.behavior] + stormDrain) * tuning.dt);
  syncStrap(s);
}

/** The worst level among missiles in flight, or 0 when the sky is clear. Read by the HUD and the bot. */
export function highestDanger(s: RigState, tuning: Tuning): number {
  let worst = 0;
  for (const m of s.missiles) {
    const l = dangerLevel(s.t - m.launchTick, tuning);
    if (l > worst) worst = l;
  }
  return worst;
}

function stepTurrets(s: RigState, route: RouteDef, tuning: Tuning): void {
  const t = tuning.turret;
  for (const turret of route.turrets) {
    if (Math.abs(turret.x - s.x) > t.rangeM) continue;
    if ((s.t + turret.phase) % t.cooldownTicks !== 0) continue;
    s.missiles.push({ id: s.t * 8 + turret.id, x: turret.x, z: turret.z, launchTick: s.t, impactTick: s.t + t.flightTicks });
  }
}

function stepMissiles(s: RigState, tuning: Tuning): void {
  const t = tuning.turret;
  const live: Missile[] = [];
  for (const m of s.missiles) {
    const left = m.impactTick - s.t;
    if (left > 0) {
      // Close a share of the remaining gap each tick. The denominator is left + 1, NOT left: closing the
      // whole gap would put the missile exactly on the rig at impact, and a zero vector has no bearing to
      // block against. This leaves a gap of D/(flightTicks + 1) — visually on top of you, still directional.
      const f = 1 / (left + 1);
      m.x += (s.x - m.x) * f;
      m.z += (s.z - m.z) * f;
      live.push(m);
      continue;
    }
    const blocked = s.shield >= 0 && s.shield === octantOf(m.x - s.x, m.z - s.z);
    if (!blocked) {
      s.tiltVel += (m.z >= s.z ? 1 : -1) * t.impulse * hazardScale(s, tuning);
      loosenAll(s, t.strapJolt * tuning.strapJoltMul);
    }
  }
  s.missiles = live;
}

function stepShield(s: RigState, input: InputFrame, tuning: Tuning): void {
  const t = tuning.turret;
  if (s.shield >= 0 && s.t >= s.shieldUntil) { s.shield = -1; s.shieldReadyAt = s.t + t.shieldCooldown; }
  const want = input.shieldSector;
  if (want === undefined || s.shield >= 0 || s.t < s.shieldReadyAt) return;
  if (Math.abs(s.speed) >= t.shieldStopEpsilon) return;    // you must already be stopped
  s.shield = want;
  s.shieldUntil = s.t + t.shieldTicks;
  s.reserve -= t.shieldCost;
}

export function stepRig(s: RigState, input: InputFrame, route: RouteDef, tuning: Tuning): void {
  const dt = tuning.dt, mul = tuning.gaitSpeedMul, vmax = tuning.gaitSpeed[4]! * mul;
  s.gait = input.gait;
  s.ballast = clamp(Math.round(input.ballast), -tuning.ballastRange, tuning.ballastRange);
  s.braced = input.brace;
  s.storm = stormLevel(route, s.t, tuning);   // must precede applyRestraintInput, which works the straps loose by it
  s.radar = input.radar ?? false;
  applyRestraintInput(s, input, tuning);
  stepShield(s, input, tuning);   // must precede the speed target below, which reads this tick's shield state

  const slope = route.slopeAt(s.x);
  const load = loadOffsetOf(s.items, tuning);
  const ideal = -(tuning.kSlope * slope + tuning.kLoad * load) / tuning.kBallast * 100;
  s.trimTarget = clamp(Math.round(ideal), -tuning.ballastRange, tuning.ballastRange);   // read by the panel's ballast target pip
  // The trim assist EASES toward closing the gap rather than holding a fixed fraction of it, so a fitted
  // governor actually arrives at the calculated trim instead of parking part-way. autoTrim is a per-tick
  // rate: 0.006 closes ~85% of the gap in 6 s and ~97% in 10 s. At the base value of 0 the assist never moves.
  s.assist += (ideal - s.ballast - s.assist) * tuning.autoTrim;
  const effBallast = clamp(s.ballast + s.assist, -tuning.ballastRange, tuning.ballastRange);
  const torque = tuning.kSlope * slope + tuning.kBallast * (effBallast / 100) + tuning.kLoad * load - s.lateralVel * tuning.lateralTip;
  const acc = torque - tuning.damping * s.tiltVel - tuning.stiffness * s.tilt;
  s.tiltVel += acc * dt;
  if (s.braced) s.tiltVel *= tuning.braceDamp;
  s.tilt += s.tiltVel * dt;

  const inMud = route.zones.some((h) => h.type === 'mud' && inZone(s, h));
  const throttle = input.throttle ?? 0;
  let target = throttle === 1 ? tuning.gaitSpeed[s.gait]! * mul : throttle === -1 ? -tuning.gaitSpeed[1]! * mul : 0;
  if (s.braced) target = clamp(target, -tuning.braceSpeed, tuning.braceSpeed);
  if (inMud) target *= tuning.mudSpeedMul;
  if (s.shield >= 0) target = 0;   // the shield only holds from a standstill
  if (s.storm > 0) target *= 1 - (1 - tuning.storm.speedMul) * s.storm;   // eases in with the 5 s ramp
  s.targetSpeed = target;
  s.speed += clamp(target - s.speed, -tuning.gaitDecel * dt, tuning.gaitAccel * dt);
  s.x = Math.max(0, s.x + s.speed * dt);

  const steer = input.steer ?? 0;
  const traction = !s.grounded ? tuning.airTraction : inMud ? tuning.mudTraction : 1;
  s.lateralVel += steer * tuning.steerAccel * traction * dt;
  s.lateralVel *= Math.max(0, 1 - tuning.lateralDamping * dt * (steer === 0 ? 1 : 0.35));
  s.z += s.lateralVel * dt;

  const strike = resolveWalls(s, route.walls, tuning.rigRadius, tuning.wallStrikeSpeed);
  if (strike) {
    s.tiltVel += strike.dir * tuning.wallStrikeTilt * strike.speed / vmax;
    loosenAll(s, tuning.wallStrikeJolt * tuning.strapJoltMul);
  }
  const bound = route.halfWidth + tuning.terrain.pocketDepth;
  if (s.z < -bound) { s.z = -bound; s.lateralVel = 0; } else if (s.z > bound) { s.z = bound; s.lateralVel = 0; }

  if (input.jump && s.grounded) { s.grounded = false; s.liftVel = tuning.jumpSpeed; }
  if (!s.grounded) {
    s.liftVel -= tuning.gravity * dt; s.lift += s.liftVel * dt;
    if (s.lift <= 0) {
      s.lift = 0; s.liftVel = 0; s.grounded = true;
      s.tiltVel += Math.abs(s.speed) * tuning.landingTilt;
      loosenAll(s, tuning.landingJolt * tuning.strapJoltMul);
    }
  }
  s.reserve -= (drainRate(route, tuning) + (s.braced ? tuning.braceDrain : 0) + (s.radar ? tuning.radarDrain : 0)) * dt;

  // after s.x has advanced, so a missile resolves against the position the rig actually reached this tick
  stepTurrets(s, route, tuning);
  stepMissiles(s, tuning);
}

export function hazardScale(s: RigState, tuning: Tuning): number {
  const vmax = tuning.gaitSpeed[4]! * tuning.gaitSpeedMul;
  return tuning.hazardScaleMin + (tuning.hazardScaleMax - tuning.hazardScaleMin) * clamp(s.speed / vmax, 0, 1);
}

function traceCancels(h: HazardInstance, traces: Trace[], route: RouteDef): boolean {
  if (h.type !== 'gap') return false;
  return traces.some((t) => t.seed === route.seed && t.type === 'plank' && Math.abs(t.x - h.x) <= 5 && Math.abs(t.z - h.z) <= h.halfW + 2);
}

function inLane(s: RigState, h: HazardInstance): boolean { return Math.abs(s.z - h.z) < h.halfW; }
function airborneClears(s: RigState, h: HazardInstance): boolean { return (h.type === 'gap' && s.lift >= 0.55) || (h.type === 'rubble' && s.lift >= 0.8); }

function crossHazards(s: RigState, route: RouteDef, traces: Trace[], tuning: Tuning): void {
  const hz = route.hazards;
  while (s.hazardCursor < hz.length && hz[s.hazardCursor]!.x <= s.x) {
    const h = hz[s.hazardCursor]!;
    s.hazardCursor++;
    if (h.x1 !== undefined) continue;   // zones are handled every tick, not by crossing
    if (h.impulse === 0 || s.braced || traceCancels(h, traces, route) || !inLane(s, h) || airborneClears(s, h)) continue;
    s.tiltVel += h.dir * h.impulse * hazardScale(s, tuning);
    loosenAll(s, h.strapJolt * tuning.strapJoltMul);
  }
}

export function moverActive(t: number, h: HazardInstance): boolean {
  if (h.cycleTicks === undefined || h.windowTicks === undefined) return false;
  return ((t + (h.phase ?? 0)) % h.cycleTicks) < h.windowTicks;
}

function stepZones(s: RigState, route: RouteDef, tuning: Tuning): void {
  for (const h of route.zones) {
    if (h.type === 'mud' || !inZone(s, h) || !moverActive(s.t, h)) continue;
    if (s.t < (s.zoneCooldown[h.id] ?? -1)) continue;
    s.zoneCooldown[h.id] = s.t + tuning.hazardCooldownTicks;
    loosenAll(s, h.strapJolt * tuning.strapJoltMul);
    if (s.braced) continue;
    s.tiltVel += h.dir * h.impulse * hazardScale(s, tuning);
    if (h.type === 'crane') s.lateralVel += h.dir * tuning.craneShove * hazardScale(s, tuning);
  }
}

function collectDiscoveries(s: RigState, route: RouteDef, tuning: Tuning): void {
  for (const discovery of route.discoveries) {
    if (s.foundDiscoveries.includes(discovery.id)) continue;
    const dx = s.x - discovery.x, dz = s.z - discovery.z;
    if (dx * dx + dz * dz > 3.2 * 3.2) continue;
    s.foundDiscoveries.push(discovery.id);
    s.reserve = Math.min(100, s.reserve + tuning.cacheReserve);
    for (const item of s.items) item.stress = Math.max(0, item.stress - tuning.cacheRepair);
  }
}

export function stepItems(s: RigState, tuning: Tuning, rng: Rng): void {
  const dt = tuning.dt;
  const over = Math.abs(s.tilt) > tuning.driftThreshold;
  s.overTiltTicks = over ? s.overTiltTicks + 1 : 0;
  const drifting = s.overTiltTicks > tuning.graceTicks;
  for (const it of s.items) {
    if (it.lost) continue;
    const loose = 1 - it.restraint / 100;
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
    it.stress += Math.max(0, it.restraint - it.crushLimit) * tuning.kCrush * dt;
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
  syncStrap(s);
  s.tilt = s.tilt > 0 ? Math.max(0, s.tilt - tuning.spillRelief) : Math.min(0, s.tilt + tuning.spillRelief);
  s.tiltVel = 0;
  s.overTiltTicks = 0;
  if (s.items.every((it) => it.lost)) s.ended = 'spilled';
}

export function stepEvents(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  void rng;
  crossHazards(s, route, traces, tuning);
  stepZones(s, route, tuning);
  collectDiscoveries(s, route, tuning);
  spillCheck(s, tuning);
  if (input.recover && s.recovering === 0 && s.reserve > tuning.recoverCost && s.items.some((it) => it.lost)) {
    // cannot afford → ignored (else recovering + stalled in one tick)
    s.recovering = tuning.recoverTicks;
    s.reserve -= tuning.recoverCost;
    s.ended = null;
  }
  if (s.ended) return;
  if (s.reserve <= 0) { s.reserve = 0; s.ended = 'stalled'; return; }
  if (s.x >= route.length) { s.x = route.length; s.ended = 'arrived'; }
}

function stepRecovering(s: RigState, tuning: Tuning): void {
  s.recovering--;
  if (s.recovering > 0) return;
  const it = s.items.find((i) => i.lost);
  if (it) { it.lost = false; it.offset = 0; it.offsetVel = 0; it.stress += tuning.recoverStress; }
  syncStrap(s);
  s.overTiltTicks = 0;
  s.speed = 0;
}

export function step(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  if (s.recovering > 0) { stepRecovering(s, tuning); s.t += 1; return; }
  if (s.ended) {
    // A spilled run stays open for RECOVER; stalled/arrived are final. The window costs real time either way.
    if (s.ended === 'spilled') {
      if (input.recover) stepEvents(s, input, route, traces, tuning, rng);
      s.t += 1;
    }
    return;
  }
  stepRig(s, input, route, tuning);
  stepItems(s, tuning, rng);
  stepEvents(s, input, route, traces, tuning, rng);
  s.t += 1;
}
