# DEADWEIGHT Interceptor Turret Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distant seeded emplacements fire homing missiles with a five-second flight; a 360° threat scope tracks them in; the answer is a directional shield that can only be raised from a standstill.

**Architecture:** Turrets are seeded content on `RouteDef`. Missiles are entities on `RigState`, stepped every tick, homing on the rig's current position. The danger level and the blocked/hit decision are pure functions of tick and geometry — and because `src/sim` forbids `Math.atan2`, the missile's bearing is resolved to one of eight octants by sign and tangent comparisons alone. The scope is a pure markup builder like `sketch.ts`, mounted by the HUD.

**Tech Stack:** Vite 8, TypeScript 6 (strict), three 0.185, vitest 4, eslint (sim-purity rule), tsx, pnpm 11.3.0.

**Spec:** `docs/superpowers/specs/2026-08-26-deadweight-turret-design.md`

## Global Constraints

- `src/sim/**` may not import three/render/ui/game/audio, touch DOM globals, or call `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/log2/log10/pow/sqrt/cbrt/sinh/cosh/tanh/random` (eslint enforces). `Math.round/floor/min/max/abs` are fine. **`atan2` is specifically what the octant maths must avoid.**
- Sim tick `dt = 1/60`. Sim geometry is corridor coordinates: `x` along the route, `z` across it.
- Every constant lives in `src/content/tuning.json`; none hard-coded in `step.ts`.
- Gates before every commit: `pnpm typecheck && pnpm lint && pnpm test`. Before final review: `pnpm validate` 12/12 at lag 15 and `pnpm build` with no chunk larger than the Three chunk.
- Commit trailers: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014MiBdujgrQoZPcWERA8cQn`.
- Work on branch `feat/turret`.
- **Rule carried from the sandstorm cycle:** a task that adds a REQUIRED field to a shared type owns that field's initialisation wherever it lives. `createRun` in `step.ts` is the only full `RigState` literal in the codebase — Task 1 initialises there, and that one line is the only thing Task 1 may change in that file.
- **Worktree check:** if you are running in an isolated worktree, FIRST verify `git log --oneline -1` matches the base commit your brief names. In the last cycle every isolated worktree was branched from `main` instead. If yours is mis-based and your branch has no unique commits, a `git merge --ff-only <base>` is a lossless fix; if it has diverged, STOP and report.

## File structure

| File | Responsibility |
|------|----------------|
| `src/sim/turret.ts` (new) | `placeTurrets`, `octantOf`, `dangerLevel` — pure, no transcendentals |
| `src/sim/types.ts` | `Turret`, `Missile`, `TurretTuning`; `RouteDef.turrets`; `RigState.missiles`/`shield`/`shieldUntil`/`shieldReadyAt`; `InputFrame.shieldSector`; `Tuning.turret`; `RouteTuning.turretWeight` |
| `src/sim/terrain.ts` | places turrets into the route |
| `src/sim/step.ts` | firing, missile stepping, impact resolution, shield state machine, reserve |
| `src/sim/bot.ts` | brake-to-stop and sector deploy |
| `src/ui/scope.ts` (new) | `scopeMarkup(missiles, rig, tick)` — pure SVG string builder |
| `src/ui/hud.ts` | mounts the scope, sector pointer handlers |
| `src/ui/input.ts` | `shieldSector` queue |
| `src/render/three/turret.ts` (new) | emplacement silhouettes, missile meshes |
| `src/ui/sketch.ts` | turret marks on the sketch and minimap |
| `src/game/orders.ts` | turret count in `routeDifficulty` |

## Execution order

Tasks 1 and 2 sequential. Tasks 3–6 independent, disjoint file sets, run concurrently. Task 7 integrates.

```
1 ──> 2 ──> ┬── 3  bot + reserve measurement   (opus)
            ├── 4  scope + HUD + input          (sonnet)
            ├── 5  render                       (sonnet)
            └── 6  sketch marks + fee weight    (haiku)
                        └──> 7  integration + human review
```

---

### Task 1: Turret placement, octants and danger levels

**Files:**
- Create: `src/sim/turret.ts`, `test/turret.test.ts`
- Modify: `src/sim/types.ts`, `src/content/tuning.json`, `src/sim/terrain.ts`, `src/sim/step.ts` (**one line only**, Step 6)

**Interfaces:**
- Produces: `placeTurrets(rng, lengthM, tier, tuning): Turret[]`; `octantOf(dx: number, dz: number): number` (0..7); `dangerLevel(elapsed: number, tuning: Tuning): number` (1..6); `RouteDef.turrets`.

- [ ] **Step 1: Types**

In `src/sim/types.ts`:

```ts
export interface Turret { id: number; x: number; z: number; phase: number }
export interface Missile { id: number; x: number; z: number; launchTick: number; impactTick: number }
export interface TurretTuning {
  countByTier: number[]; rangeM: number; cooldownTicks: number; offCorridorZ: number;
  flightTicks: number; levels: number; impulse: number; strapJolt: number;
  shieldCost: number; shieldTicks: number; shieldCooldown: number; shieldStopEpsilon: number;
}
```

Add `turrets: Turret[];` to `RouteDef` (beside `storms`).
Add `missiles: Missile[]; shield: number; shieldUntil: number; shieldReadyAt: number;` to `RigState` (beside `storm`). `shield` is the faced octant 0..7, or `-1` when down.
Add `shieldSector?: number;` to `InputFrame` (beside `radar`).
Add `turretWeight: number;` to `RouteTuning`.
Add `turret: TurretTuning;` to `Tuning` (beside `storm`).

- [ ] **Step 2: Tuning**

In `src/content/tuning.json`, add `"turretWeight": 0.3` inside the existing `"route"` object, and this block beside `"storm"`:

```json
"turret": {
  "countByTier": [0, 0, 1, 2],
  "rangeM": 260, "cooldownTicks": 900, "offCorridorZ": 70,
  "flightTicks": 300, "levels": 6,
  "impulse": 1.6, "strapJolt": 30,
  "shieldCost": 5, "shieldTicks": 72, "shieldCooldown": 90, "shieldStopEpsilon": 0.05
},
```

- [ ] **Step 3: Write the failing tests**

Create `test/turret.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { placeTurrets, octantOf, dangerLevel } from '../src/sim/turret';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';

describe('octantOf', () => {
  // octant 0 is +x (dead ahead), numbering anticlockwise through +z, 45 degrees each
  it('puts the cardinal directions in the middle of their octants', () => {
    expect(octantOf(10, 0)).toBe(0);
    expect(octantOf(0, 10)).toBe(2);
    expect(octantOf(-10, 0)).toBe(4);
    expect(octantOf(0, -10)).toBe(6);
  });
  it('puts the diagonals in the odd octants', () => {
    expect(octantOf(10, 10)).toBe(1);
    expect(octantOf(-10, 10)).toBe(3);
    expect(octantOf(-10, -10)).toBe(5);
    expect(octantOf(10, -10)).toBe(7);
  });
  it('is stable either side of every boundary and never leaves 0..7', () => {
    for (let i = 0; i < 720; i++) {
      const a = i * Math.PI / 360;           // test-side trig is fine; the sim implementation may not use it
      const o = octantOf(Math.cos(a) * 50, Math.sin(a) * 50);
      expect(o, `angle ${i / 2} deg`).toBeGreaterThanOrEqual(0);
      expect(o, `angle ${i / 2} deg`).toBeLessThan(8);
    }
  });
  it('agrees with the angle it stands for, to within half an octant', () => {
    for (let i = 0; i < 720; i++) {
      const deg = i / 2;
      const a = deg * Math.PI / 180;
      const o = octantOf(Math.cos(a) * 50, Math.sin(a) * 50);
      const centre = o * 45;
      // wrapped circular distance between the angle and its octant's centre
      const diff = Math.abs(((deg - centre + 540) % 360) - 180);
      expect(diff, `angle ${deg} deg landed in octant ${o}`).toBeLessThanOrEqual(22.5001);
    }
  });
});

describe('dangerLevel', () => {
  const f = tuning.turret.flightTicks;
  it('is 1 at launch and 6 at impact', () => {
    expect(dangerLevel(0, tuning)).toBe(1);
    expect(dangerLevel(1, tuning)).toBe(1);
    expect(dangerLevel(f, tuning)).toBe(6);
    expect(dangerLevel(f - 1, tuning)).toBe(6);
  });
  it('climbs monotonically and never leaves 1..6', () => {
    let prev = 0;
    for (let t = 0; t <= f; t++) {
      const l = dangerLevel(t, tuning);
      expect(l).toBeGreaterThanOrEqual(1);
      expect(l).toBeLessThanOrEqual(tuning.turret.levels);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});

describe('placeTurrets', () => {
  it('places none below tier 2 and is deterministic for a seed', () => {
    expect(placeTurrets(mulberry32(1), 900, 0, tuning)).toEqual([]);
    expect(placeTurrets(mulberry32(1), 900, 1, tuning)).toEqual([]);
    expect(placeTurrets(mulberry32(4), 900, 3, tuning)).toEqual(placeTurrets(mulberry32(4), 900, 3, tuning));
  });
  it('keeps emplacements outside the corridor and inside the route', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const t of placeTurrets(mulberry32(seed), 900, 3, tuning)) {
        expect(Math.abs(t.z), `seed ${seed}`).toBeGreaterThanOrEqual(tuning.turret.offCorridorZ);
        expect(t.x).toBeGreaterThan(0);
        expect(t.x).toBeLessThan(900);
      }
    }
  });
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `pnpm vitest run test/turret.test.ts`
Expected: FAIL — cannot resolve `../src/sim/turret`.

- [ ] **Step 5: Implement the module**

Create `src/sim/turret.ts`:

```ts
import type { Rng } from './rng';
import type { Tuning, Turret } from './types';

const TAN_22_5 = 0.41421356;    // tan(22.5 deg)
const TAN_67_5 = 2.41421356;    // tan(67.5 deg)

/**
 * Which 45-degree sector a vector points into: 0 is +x (dead ahead), counting anticlockwise through
 * +z. Comparisons only — src/sim forbids Math.atan2, so a bearing is never computed as an angle.
 */
export function octantOf(dx: number, dz: number): number {
  const ax = Math.abs(dx), az = Math.abs(dz);
  const shallow = az < ax * TAN_22_5;    // within 22.5 deg of the x axis
  const steep = az > ax * TAN_67_5;      // within 22.5 deg of the z axis
  if (shallow) return dx >= 0 ? 0 : 4;
  if (steep) return dz >= 0 ? 2 : 6;
  if (dx >= 0) return dz >= 0 ? 1 : 7;
  return dz >= 0 ? 3 : 5;
}

/** 1 at launch, `levels` at impact. Pure function of how far through the flight the missile is. */
export function dangerLevel(elapsed: number, tuning: Tuning): number {
  const t = tuning.turret;
  const raw = Math.ceil(tuning.turret.levels * elapsed / t.flightTicks);
  return raw < 1 ? 1 : raw > t.levels ? t.levels : raw;
}

/** Emplacements sit off the corridor entirely, so they read as distant silhouettes, not obstacles. */
export function placeTurrets(rng: Rng, lengthM: number, tier: number, tuning: Tuning): Turret[] {
  const t = tuning.turret;
  const count = t.countByTier[Math.min(tier, t.countByTier.length - 1)] ?? 0;
  const turrets: Turret[] = [];
  for (let i = 0; i < count; i++) {
    const span = lengthM / (count + 1);
    const x = span * (i + 1) + (rng.next() - 0.5) * span * 0.5;
    const side = rng.next() < 0.5 ? 1 : -1;
    turrets.push({
      id: i,
      x,
      z: side * (t.offCorridorZ + rng.next() * 30),
      phase: Math.floor(rng.next() * t.cooldownTicks),
    });
  }
  return turrets;
}
```

- [ ] **Step 6: Initialise the new state**

`createRun` in `src/sim/step.ts` is the only full `RigState` literal in the codebase, so the required
fields from Step 1 must be initialised there or nothing typechecks. Beside `storm: 0, radar: false,` add:

```ts
    missiles: [], shield: -1, shieldUntil: 0, shieldReadyAt: 0,
```

**That is the only line this task may change in `step.ts`.**

- [ ] **Step 7: Wire turrets into the route**

In `src/sim/terrain.ts`: import `placeTurrets`, give `routeFromSegments` a final `turrets: Turret[] = []` parameter included in the returned object, and pass `placeTurrets(rng, lengthM, tier, tuning)` from `generateRoute`. `generateRoute` already takes the full `Tuning`.

- [ ] **Step 8: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add -A
git commit -m "feat(sim): turret emplacements, octant bearings without atan2, danger levels"
```

---

### Task 2: Firing, missiles, impact and the shield

**Files:**
- Modify: `src/sim/step.ts`
- Test: `test/turret.test.ts`

**Interfaces:**
- Consumes: `placeTurrets`, `octantOf`, `dangerLevel` (Task 1); `RouteDef.turrets`; `RigState.missiles`/`shield`/`shieldUntil`/`shieldReadyAt`; `InputFrame.shieldSector`.
- Produces: missiles fired, stepped, and resolved; the shield state machine; `highestDanger(s, tuning)` exported for the HUD and bot.

- [ ] **Step 1: Write the failing tests**

Append to `test/turret.test.ts`. Build a route with one turret using `routeFromSegments`'s new final parameter — check the real signature in `src/sim/terrain.ts` and adapt if the argument order differs; the intent is a 2000 m flat route with a single emplacement at x 200, z 70, phase 0.

```ts
import { createRun, step, highestDanger } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { crateDef, frame } from './helpers';

function turretRoute() {
  return routeFromSegments(1, [{ x0: 0, x1: 2000, slope: 0, y0: 0 }], [], 10, [], undefined, 18, [],
    [{ id: 0, x: 200, z: 70, phase: 0 }]);
}

describe('turret firing and missiles', () => {
  it('fires when the rig is in range and the missile closes over flightTicks', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(2);
    for (let i = 0; i < 60; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.missiles.length).toBeGreaterThan(0);
    const m = s.missiles[0]!;
    expect(m.impactTick - m.launchTick).toBe(tuning.turret.flightTicks);
    expect(highestDanger(s, tuning)).toBeGreaterThanOrEqual(1);
  });
  it('a missile that lands unshielded costs tilt and strap', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(3);
    const strapBefore = s.items[0]!.restraint;
    for (let i = 0; i < 700; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.items[0]!.restraint).toBeLessThan(strapBefore);
    expect(s.tiltVel === 0 && s.tilt === 0).toBe(false);
  });
});

describe('the shield', () => {
  it('refuses to deploy while moving and deploys once stopped', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(4);
    for (let i = 0; i < 30; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    step(s, frame({ gait: 2, throttle: 1, shieldSector: 0 }), route, [], tuning, rng);
    expect(s.shield, 'moving: refused').toBe(-1);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    expect(Math.abs(s.speed)).toBeLessThan(tuning.turret.shieldStopEpsilon);
    const reserveBefore = s.reserve;
    step(s, frame({ gait: 0, throttle: 0, shieldSector: 3 }), route, [], tuning, rng);
    expect(s.shield, 'stopped: deployed').toBe(3);
    expect(reserveBefore - s.reserve).toBeGreaterThan(tuning.turret.shieldCost - 0.1);
  });
  it('drops after shieldTicks and will not redeploy until the cooldown expires', () => {
    const route = turretRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    step(s, frame({ gait: 0, throttle: 0, shieldSector: 1 }), route, [], tuning, rng);
    expect(s.shield).toBe(1);
    for (let i = 0; i < tuning.turret.shieldTicks + 1; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    expect(s.shield, 'dropped').toBe(-1);
    step(s, frame({ gait: 0, throttle: 0, shieldSector: 1 }), route, [], tuning, rng);
    expect(s.shield, 'still cooling down').toBe(-1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run test/turret.test.ts`
Expected: FAIL — `highestDanger` is not exported, `s.missiles` stays empty.

- [ ] **Step 3: Implement in `src/sim/step.ts`**

Import `{ dangerLevel, octantOf } from './turret'`. Add these functions above `stepRig`:

```ts
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
      // Close a share of the gap each tick. The denominator is left + 1, NOT left: closing the whole
      // gap puts the missile exactly on the rig at impact, and a zero vector has no bearing to block
      // against. This leaves a gap of D/(flightTicks + 1) — visually on top of you, still directional.
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
```

In `stepRig`, call `stepShield(s, input, tuning)` immediately after `applyRestraintInput`, and hold the rig still while the shield is up by adding this directly beneath the existing mud line:

```ts
  if (s.shield >= 0) target = 0;   // the shield only holds from a standstill
```

Call `stepTurrets(s, route, tuning)` and then `stepMissiles(s, tuning)` at the end of `stepRig`, after `s.x` has been advanced, so a missile resolves against the position the rig actually reached this tick.

**Watch out:** `octantOf(0, 0)` must never be reached by the blocked check. Task 1's `octantOf` pins a zero
vector to octant 0, but the real guard is the `left + 1` denominator above, which stops the missile from ever
coinciding with the rig. Getting this wrong makes the shield block on octant 1 and nothing else, whatever
bearing the missile flew in on — and no test in Task 2's own block catches it, so the sector test in Task 7's
integration is what proves it.

**Watch out:** `s.missiles.push` inside `stepTurrets` mutates during iteration of `route.turrets`, not of `s.missiles` — that is safe. `stepMissiles` rebuilds the array rather than splicing, which keeps ordering deterministic.

- [ ] **Step 4: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add -A
git commit -m "feat(sim): turrets fire homing missiles; directional shield from a standstill"
```

---

### Task 3: Bot braking, sector deploy, and the reserve measurement

**Files:**
- Modify: `src/sim/bot.ts`, `src/content/tuning.json` (only if the measurement demands it)
- Test: `test/bot.test.ts`

**Interfaces:**
- Consumes: `highestDanger` (Task 2), `octantOf` (Task 1), `RigState.missiles`.
- Produces: `BotView.missiles`; a bot that brakes early enough and deploys into the right sector.

**This task owns `tuning.json`. No other task may touch it.**

- [ ] **Step 1: Write the failing test**

Append to `test/bot.test.ts`:

```ts
  it('brakes for an inbound missile and shields the sector it comes from', () => {
    const route = flatRoute();
    const base = { x: 100, z: 0, lateralVel: 0, tilt: 0, tiltVel: 0, strap: 70, braced: false, recovering: 0, items: [], storm: 0 };
    const far = { ...base, speed: 7, missiles: [{ id: 1, x: 400, z: 0, launchTick: 0, impactTick: 300 }], t: 10 };
    expect(botPolicy(far, route, tuning).throttle, 'commits to braking early').toBe(0);
    const here = { ...base, speed: 0, missiles: [{ id: 1, x: 100, z: 60, launchTick: 0, impactTick: 300 }], t: 295 };
    expect(botPolicy(here, route, tuning).shieldSector, 'faces the missile').toBe(2);
  });
```

`BotView` will need `speed` and `t` as well as `missiles`; add whatever the policy reads.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/bot.test.ts`
Expected: FAIL — `missiles` is not on `BotView`.

- [ ] **Step 3: Implement**

In `src/sim/bot.ts`: add `speed: number; t: number; missiles: Missile[]` to `BotView` and copy them in `view(s)` (missiles as `s.missiles.map((m) => ({ ...m }))`). Then in `botPolicy`:

```ts
  // brake early enough to be stopped by impact: stopping takes speed / gaitDecel seconds
  let shieldSector: number | undefined;
  let braking = false;
  for (const m of v.missiles) {
    const ticksLeft = m.impactTick - v.t;
    const stopTicks = Math.ceil(v.speed / tuning.gaitDecel / tuning.dt);
    if (ticksLeft <= stopTicks + tuning.bot.lagTicks + 6) braking = true;
    if (ticksLeft <= tuning.turret.shieldTicks / 2 && Math.abs(v.speed) < tuning.turret.shieldStopEpsilon) {
      shieldSector = octantOf(m.x - v.x, m.z - v.z);
    }
  }
```

Then `throttle: braking ? 0 : 1` in the returned frame, and pass `shieldSector` through.

- [ ] **Step 4: Measure the reserve cost**

Run: `pnpm validate`

Record the worst-case reserve across all 12 outposts at lag 15. Compare against the post-storm baseline: the worst shipped case was Cinder Stair at **19.03**.

- [ ] **Step 5: If it fails, measure with a control before touching any constant**

**Do not tune against a raw failure count.** Write a throwaway script that runs each of the 12 outposts twice — once as shipped, once with `turret.countByTier` forced to `[0,0,0,0]` — and subtract. Only failures that appear in the first and not the second were caused by turrets. The sandstorm cycle proved this: a first pass there looked like a two-front problem until the control showed 17 of 600 procedural routes strand with no weather at all.

If turrets cause failures, the levers in order of preference are `cooldownTicks` up (fewer missiles), then `shieldCost` down, then `rangeM` down. **`reserveBudget` is not a lever here** — it is the distance economy and the storm cycle already measured it at 0.62.

**If 12/12 is not reachable without pushing `cooldownTicks` past 1800 (one missile per 30 s), STOP and report the numbers.** That is the owner's decision.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(bot): brake for inbound missiles and shield the bearing they arrive on"
```

---

### Task 4: The threat scope, HUD and input

**Files:**
- Create: `src/ui/scope.ts`, `test/scope.test.ts`
- Modify: `src/ui/hud.ts`, `src/ui/input.ts`, `src/game/flow.ts`, `src/ui/panel/panel.css`
- Test: `test/input.test.ts`

**Interfaces:**
- Consumes: `RigState.missiles`/`shield`, `highestDanger`, `dangerLevel`, `octantOf`.
- Produces: `scopeMarkup(s, tuning): string`; `InputController.queueShield(sector)`; `HudHandlers.onShieldSector(sector)`.

**This task owns `panel.css` and `flow.ts`.**

- [ ] **Step 1: Write the failing test**

Create `test/scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scopeMarkup } from '../src/ui/scope';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute, crateDef } from './helpers';

describe('scopeMarkup', () => {
  it('draws eight sectors and a blip for each missile in flight', () => {
    const s = createRun(flatRoute(), [{ def: crateDef(), slot: 1 }], tuning);
    expect(scopeMarkup(s, tuning)).not.toContain('class="blip"');
    s.missiles.push({ id: 1, x: s.x + 50, z: s.z, launchTick: 0, impactTick: 300 });
    const withOne = scopeMarkup(s, tuning);
    expect((withOne.match(/class="sector/g) ?? []).length).toBe(8);
    expect((withOne.match(/class="blip"/g) ?? []).length).toBe(1);
    expect(withOne).toContain('data-sector="0"');
  });
});
```

- [ ] **Step 2: Run it, watch it fail, then implement**

Create `src/ui/scope.ts` as a pure string builder in the style of `src/ui/sketch.ts`: an SVG with eight `<path class="sector" data-sector="N">` wedges around a circle, a `<line class="sweep">` whose angle comes from the tick, and one `<circle class="blip">` per missile positioned by `octantOf` for the angle and `dangerLevel` for the radius (higher danger sits nearer the centre). The renderer side may use `Math.atan2`/`cos`/`sin` freely — `src/ui` is not under the sim purity rule.

- [ ] **Step 3: Mount it in the HUD**

In `src/ui/hud.ts`: add a `<div class="scope">` to the template, a `scopeEl` field, and in `update()` set `this.scopeEl.innerHTML = scopeMarkup(s, tuning)` — but only when the markup changes, following the `rackKey` pattern already in that file, or you will rebuild the SVG 60 times a second. Add a pointerdown handler that reads `closest('[data-sector]')` and calls `this.h.onShieldSector(Number(el.dataset.sector))`. Hide the scope when `s.missiles.length === 0` and no turret is in range.

`Hud.update` currently takes `(s, route)`; it needs `tuning` too. Update the call in `flow.ts`.

- [ ] **Step 4: Input and wiring**

In `src/ui/input.ts`: add `shieldQueued: number | null` to `InputState`, `queueShield(sector)` on `InputController`, emit it as `shieldSector` in `sampleFrame` and clear it after the frame, exactly as `cargoSelectQueued` already does.

In `src/game/flow.ts`: pass `onShieldSector: (sector) => d.input.queueShield(sector)` into the `Hud` handlers.

**Watch out:** `src/ui/input.ts`'s viewport `pointerdown` starts the ballast drag unless the target is inside `.dpad`. Extend that check to `.scope`, or aiming the shield drags the trim.

- [ ] **Step 5: CSS**

Append to `src/ui/panel/panel.css`: position `.scope` bottom-centre in the HUD, `pointer-events: auto`, sectors with a visible hover state and a `.armed` class for the sector holding the highest-danger missile, the sweep line at low opacity, and blips scaled by danger.

- [ ] **Step 6: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add -A
git commit -m "feat(ui): 360 threat scope with eight aimable sectors"
```

---

### Task 5: Render — emplacements and missiles

**Files:**
- Create: `src/render/three/turret.ts`
- Modify: `src/render/three/ThreeRenderer.ts`

**Interfaces:**
- Consumes: `route.turrets`, `curr.missiles`. Reads them off the `RigState` `draw()` already receives — no `Renderer` interface change, no flow wiring.
- Produces: `buildTurrets(route): THREE.Group`, `disposeTurrets(group)`, `syncMissiles(group, missiles, route)`.

No unit tests (WebGL). Gates: `pnpm typecheck && pnpm lint && pnpm build`, Three chunk still largest.

- [ ] **Step 1: Build the emplacements**

Create `src/render/three/turret.ts` with `buildTurrets(route)` returning a group of one silhouette per `route.turrets` entry — a squat base plus a raised barrel, placed at `(t.x, route.heightAt(t.x), route.centerAt(t.x) + t.z)`. Follow the shared-module-singleton material pattern used by `walls.ts`, and register any shared material so `dispose` skips it.

- [ ] **Step 2: Missile meshes**

Add a pooled missile mesh group and `syncMissiles(group, missiles, route)` that shows one mesh per live missile at its `(x, z)` with a height that eases from launch to impact, and hides the surplus. Pool rather than allocate per frame.

- [ ] **Step 3: Wire into `ThreeRenderer`**

Build turrets in `setRoute` beside the walls, dispose them in `setRoute` and `dispose`, and call `syncMissiles(..., curr.missiles, this.route)` in `draw`.

- [ ] **Step 4: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm build`

```bash
git add -A
git commit -m "feat(render): turret emplacements on the skyline and missiles in flight"
```

---

### Task 6: Sketch marks and the fee weight

**Files:**
- Modify: `src/ui/sketch.ts`, `src/game/orders.ts`, `src/ui/screens/screens.css`
- Test: `test/sketch.test.ts`, `test/orders.test.ts`

**This task owns `screens.css`.**

- [ ] **Step 1: Failing tests**

In `test/sketch.test.ts`, assert `routeSketchSvg` emits one `class="turret"` mark per `route.turrets` entry. In `test/orders.test.ts`, assert that a route carrying turrets scores higher than an otherwise identical route without them.

- [ ] **Step 2: Implement**

In `src/ui/sketch.ts`'s `layer()`, emit a small marker per turret at its `x`, clamped to the edge of the band since turrets sit outside the corridor. In `src/game/orders.ts`, add `+ route.turrets.length * r.turretWeight` to the `routeDifficulty` score.

- [ ] **Step 3: CSS and commit**

Add `.sketch .turret` and `.minimap .turret` fills to `screens.css`. Gates, then:

```bash
git add -A
git commit -m "feat(game): turrets on the route sketch and in the fee"
```

---

### Task 7: Integration, gates and human review

- [ ] **Step 1: Full gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm validate && pnpm build`
Expected: all green, validate 12/12 at lag 15, Three chunk largest.

- [ ] **Step 2: Static preview**

Render the scope to a standalone HTML page using the capture-stub pattern (assign to a fake `el.innerHTML`, inline the real CSS) with a missile at each of the eight bearings, and send it to the human.

- [ ] **Step 3: DEVLOG, push, hand over**

Add the turret bullet to `DEVLOG.md`, commit, `git push -u origin feat/turret`. Report the reserve numbers and the control comparison. **Do not open a PR or merge — the human reviews first.**

---

## Self-review

- **Spec coverage.** §1 threat model → Tasks 1–2; §2 shield → Task 2 (state machine) and Task 4 (control); §3 scope → Task 4, with the pointer-exemption and octant constraints written into their steps; §4 bot → Task 3; §5 reserve → Task 3 Steps 4–5, with the control run mandatory; §6 constants → Task 1 Step 2; §7 testing → each task's tests plus Task 7.
- **Required-field rule applied.** Task 1 adds required `RigState` fields and therefore owns the `createRun` line (Step 6) — the seam that stopped Task 1 of the sandstorm cycle. `BotView` (Task 3) is constructed only in `bot.ts` and its own test. `Hud.update`'s new `tuning` parameter is a signature change inside Task 4's own files.
- **Type consistency.** `octantOf(dx, dz)`, `dangerLevel(elapsed, tuning)`, `placeTurrets(rng, lengthM, tier, tuning)`, `highestDanger(s, tuning)`, `scopeMarkup(s, tuning)`, `queueShield(sector)`, `onShieldSector(sector)` — each defined once and referenced by the same name throughout.
- **Guard rail.** Task 3 may not push `cooldownTicks` past 1800, and `reserveBudget` is explicitly not a lever.
