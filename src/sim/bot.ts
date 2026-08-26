import { createRun, step, loadOffsetOf } from './step';
import { evaluate } from './score';
import { mulberry32, hashSeed } from './rng';
import { laneCentre } from './course';
import { octantOf } from './turret';
import type { Fork, Gait, InputFrame, ItemState, Lane, LoadoutItem, Missile, RigState, RouteDef, RunResult, Trace, Tuning } from './types';

export interface BotView { x: number; z: number; speed: number; t: number; lateralVel: number; tilt: number; tiltVel: number; strap: number; braced: boolean; recovering: number; items: ItemState[]; storm: number; missiles: Missile[]; shield: number; shieldUntil: number; shieldReadyAt: number }

function view(s: RigState): BotView {
  return { x: s.x, z: s.z, speed: s.speed, t: s.t, lateralVel: s.lateralVel, tilt: s.tilt, tiltVel: s.tiltVel, strap: s.strap, braced: s.braced, recovering: s.recovering, items: s.items.map((it) => ({ ...it })), storm: s.storm, missiles: s.missiles.map((m) => ({ ...m })), shield: s.shield, shieldUntil: s.shieldUntil, shieldReadyAt: s.shieldReadyAt };
}

export class LagBuffer {
  private buf: BotView[] = [];
  constructor(private readonly lag: number) {}
  push(s: RigState): BotView {
    this.buf.push(view(s));
    if (this.buf.length > this.lag + 1) this.buf.shift();
    return this.buf[0]!;
  }
}

function clampInt(v: number, lo: number, hi: number): number { const r = Math.round(v); return r < lo ? lo : r > hi ? hi : r; }
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const inLaneZ = (h: { z: number }, lane: Lane): boolean => h.z >= lane.z0 && h.z <= lane.z1;

/** A centre-holding planner cannot weave a chicane, so chicanes rank behind every other lane outright. */
const CHICANE_PENALTY = 10;

/** Lower is safer: hazard impulses (movers ×1.5), mud 0.6, chicanes +10 plus 0.8 per baffle. */
export function laneScore(route: RouteDef, fork: Fork, i: number): number {
  const lane = fork.lanes[i]!;
  let score = lane.archetype === 'chicane' ? CHICANE_PENALTY : 0;
  for (const h of route.hazards) {
    if (h.x < fork.x0 || h.x > fork.x1 || !inLaneZ(h, lane)) continue;
    score += h.type === 'mud' ? 0.6 : h.impulse * (h.cycleTicks !== undefined ? 1.5 : 1);
  }
  for (const w of route.walls) if (w.kind === 'baffle' && w.x0 < fork.x1 && w.x1 > fork.x0 && w.z0 < lane.z1 && w.z1 > lane.z0) score += 0.8;
  return score;
}

function targetZ(v: BotView, route: RouteDef, tuning: Tuning): number {
  const inside = route.forkAt(v.x);
  if (inside) {
    const i = route.laneAt(v.x, v.z);
    if (i >= 0) return laneCentre(inside.lanes[i]!);
    let best = inside.lanes[0]!;
    for (const lane of inside.lanes) if (Math.abs(laneCentre(lane) - v.z) < Math.abs(laneCentre(best) - v.z)) best = lane;
    return laneCentre(best);
  }
  const ahead = route.forks.find((f) => f.x0 > v.x && f.x0 - v.x < tuning.bot.laneLookaheadM);
  if (ahead) {
    let best = 0, bestScore = Infinity;
    ahead.lanes.forEach((lane, i) => {
      const score = laneScore(route, ahead, i) + Math.abs(laneCentre(lane) - v.z) * 0.01;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return laneCentre(ahead.lanes[best]!);
  }
  const dodge = route.hazards.find((h) => h.x > v.x && h.x < v.x + 40 && h.impulse > 0 && h.halfW < route.halfWidth);
  return dodge ? -Math.sign(dodge.z || 1) * route.halfWidth * 0.4 : 0;
}

/**
 * A raised shield is only honoured from a standstill, and it drops `shieldTicks` after it goes up, so
 * it must be raised late enough not to expire before the missile lands. The view is `lagTicks` stale,
 * which only ever makes a missile *closer* than it looks, so gating on `shieldTicks` minus a margin is
 * safe at every lag the validator runs: the real gap is `ticksLeft - lag`, never more.
 */
const SHIELD_MARGIN = 6;

/**
 * A homing missile cannot be dodged — the shield is the whole counterplay, and the shield needs a
 * standstill. So the bot gives up the run's tempo exactly as late as the sums allow: stopping takes
 * `speed / gaitDecel` seconds, the rig must already be stopped when the shield goes up, and the view
 * is `lagTicks` stale on top of that. Braking any earlier is pure reserve burnt standing still —
 * measured at ~210 ticks of standstill per missile when the bot braked at launch, against ~90 here.
 */
function intercept(v: BotView, tuning: Tuning): { braking: boolean; shieldSector: number | undefined } {
  const t = tuning.turret;
  const raiseAt = t.shieldTicks - SHIELD_MARGIN;
  const stopTicks = Math.ceil(Math.abs(v.speed) / (tuning.gaitDecel * tuning.dt));
  // Two missiles inside one cooldown means one of them cannot be answered — the spec's overlap rule.
  // Stopping for that one buys nothing, so the run keeps its tempo and takes the hit on the move.
  const readyAt = v.shield >= 0 ? v.shieldUntil + t.shieldCooldown : v.shieldReadyAt;
  let braking = false, shieldSector: number | undefined, soonest = Infinity;
  for (const m of v.missiles) {
    const ticksLeft = m.impactTick - v.t;
    if (ticksLeft < 0 || m.impactTick - raiseAt < readyAt) continue;
    if (ticksLeft <= raiseAt + stopTicks + tuning.bot.lagTicks) braking = true;
    if (ticksLeft > raiseAt || ticksLeft >= soonest) continue;
    if (Math.abs(v.speed) >= t.shieldStopEpsilon) continue;   // step() refuses it anyway; do not waste the ask
    soonest = ticksLeft;
    // The rig is stopped, so the missile closes along a fixed line and this bearing is the impact bearing.
    shieldSector = octantOf(m.x - v.x, m.z - v.z);
  }
  return { braking, shieldSector };
}

export function botPolicy(v: BotView, route: RouteDef, tuning: Tuning): InputFrame {
  const b = tuning.bot;
  const zTarget = targetZ(v, route, tuning);
  let brace = false, slow = false, near = false;
  for (const h of route.hazards) {
    const start = h.x, end = h.x1 ?? h.x;
    if (end < v.x) continue;
    if (start > v.x + 40) break;
    if (h.impulse === 0) continue;
    if (Math.abs(h.z - zTarget) >= h.halfW && h.halfW < route.halfWidth) continue;   // not in my lane
    const within = start <= v.x + b.braceAheadM;
    const mustBrace = h.type === 'gap' || h.type === 'rockfall' || h.type === 'crane';
    if (mustBrace && within) { near = true; brace = true; }
    if (h.type !== 'gust' && within) slow = true;
  }
  const gait: Gait = slow ? 1 : near ? 2 : 3;
  const slopeAhead = route.slopeAt(v.x + tuning.gaitSpeed[gait]! * tuning.gaitSpeedMul * b.leadSec);
  const load = loadOffsetOf(v.items, tuning);
  const feedForward = -(tuning.kSlope * slopeAhead + tuning.kLoad * load) / tuning.kBallast * 100;
  const feedback = -b.kp * v.tilt - b.kd * v.tiltVel;
  const wantVel = clamp((zTarget - v.z) * 1.2, -6, 6);
  const dv = wantVel - v.lateralVel;
  const steer: -1 | 0 | 1 = dv > 0.6 ? 1 : dv < -0.6 ? -1 : 0;
  const loosest = v.items.filter((it) => !it.lost).sort((a, b2) => a.restraint - b2.restraint)[0];
  const { braking, shieldSector } = intercept(v, tuning);
  return {
    gait, throttle: braking ? 0 : 1, steer, jump: false,
    ballast: clampInt(feedForward + feedback, -tuning.ballastRange, tuning.ballastRange),
    strap: loosest !== undefined && loosest.restraint < b.strapBelow,
    cargoSelect: loosest?.slot,
    brace,
    radar: v.storm > 0,   // the bot has no vision to lose, so without this the validator only ever proves the free branch
    shieldSector,
    deploy: 0,
    recover: v.recovering === 0 && v.items.some((it) => it.lost),
  };
}

export interface HeadlessOpts {
  lagTicks?: number; maxTicks?: number; seed?: number; traces?: Trace[];
  policy?: (v: BotView, route: RouteDef, tuning: Tuning) => InputFrame;
}

export function runHeadless(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning, opts: HeadlessOpts = {}): { state: RigState; result: RunResult; ticks: number } {
  const lag = new LagBuffer(opts.lagTicks ?? tuning.bot.lagTicks);
  const policy = opts.policy ?? botPolicy;
  const traces = opts.traces ?? [];
  const rng = mulberry32(hashSeed(route.seed, opts.seed ?? 1));
  const s = createRun(route, loadout, tuning);
  const max = opts.maxTicks ?? 60 * 240;
  let ticks = 0;
  while (!s.ended && ticks < max) {
    const input = policy(lag.push(s), route, tuning);
    step(s, input, route, traces, tuning, rng);
    ticks++;
  }
  if (!s.ended) s.ended = 'stalled';
  return { state: s, result: evaluate(s, tuning), ticks };
}
