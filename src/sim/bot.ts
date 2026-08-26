import { createRun, step, loadOffsetOf } from './step';
import { evaluate } from './score';
import { mulberry32, hashSeed } from './rng';
import type { Gait, InputFrame, ItemState, LoadoutItem, RigState, RouteDef, RunResult, Trace, Tuning } from './types';

export interface BotView { x: number; z: number; tilt: number; tiltVel: number; strap: number; braced: boolean; recovering: number; items: ItemState[] }

function view(s: RigState): BotView {
  return { x: s.x, z: s.z, tilt: s.tilt, tiltVel: s.tiltVel, strap: s.strap, braced: s.braced, recovering: s.recovering, items: s.items.map((it) => ({ ...it })) };
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

export function botPolicy(v: BotView, route: RouteDef, tuning: Tuning): InputFrame {
  const b = tuning.bot;
  let brace = false, slow = false, near = false;
  for (const h of route.hazards) {
    if (h.x <= v.x) continue;
    if (h.x > v.x + 40) break;
    if (h.impulse === 0) continue;
    const mustBrace = h.type === 'gap' || h.type === 'rockfall' || h.type === 'crane';
    if (mustBrace && h.x <= v.x + b.braceAheadM) { near = true; brace = true; }
    if (h.type !== 'gust' && h.x <= v.x + b.braceAheadM) slow = true;
  }
  const gait: Gait = slow ? 1 : near ? 2 : 3;   // cruise at 3 to bank reserve; slow into impulse hazards
  const slopeAhead = route.slopeAt(v.x + tuning.gaitSpeed[gait]! * tuning.gaitSpeedMul * b.leadSec);
  const load = loadOffsetOf(v.items, tuning);
  const feedForward = -(tuning.kSlope * slopeAhead + tuning.kLoad * load) / tuning.kBallast * 100;
  const feedback = -b.kp * v.tilt - b.kd * v.tiltVel;
  const centerError = 0 - v.z;
  const steer = centerError > 0.35 ? 1 : centerError < -0.35 ? -1 : 0;
  return {
    throttle: 1,
    gait,
    ballast: clampInt(feedForward + feedback, -tuning.ballastRange, tuning.ballastRange),
    strap: v.strap < b.strapBelow,
    brace,
    deploy: 0,
    recover: v.recovering === 0 && v.items.some((it) => it.lost),
    steer,
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
