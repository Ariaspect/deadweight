# DEADWEIGHT Sandstorm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seeded, tick-scheduled sandstorm that slows the rig, works the restraints loose and collapses vision, answered by a radar wireframe view that costs reserve.

**Architecture:** Storm fronts are seeded content on `RouteDef`, scheduled in ticks. Intensity is a pure function of `t` (`stormLevel`), written to `RigState.storm` each tick so the renderer, HUD and bot all read one number. Radar is an input-driven latch on `RigState.radar` that drains reserve whenever lit. The renderer reads both fields straight off the `RigState` it already receives in `draw()`, so no new renderer interface and no flow wiring.

**Tech Stack:** Vite 8, TypeScript 6 (strict), three 0.185, vitest 4, eslint (sim-purity rule), tsx, pnpm 11.3.0.

**Spec:** `docs/superpowers/specs/2026-08-26-deadweight-sandstorm-design.md`

## Global Constraints

- `src/sim/**` may not import three/render/ui/game/audio, touch DOM globals, or call `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/log2/log10/pow/sqrt/cbrt/sinh/cosh/tanh/random` (eslint enforces). `Math.round/floor/min/max/abs` are fine.
- Sim tick `dt = 1/60`. Sim geometry is in corridor coordinates: `x` along the route, `z` across it.
- Every constant lives in `src/content/tuning.json`; none hard-coded in `step.ts`.
- Gates before every commit: `pnpm typecheck && pnpm lint && pnpm test`. Before the final review: `pnpm validate` (12/12 at lag 15) and `pnpm build` with no chunk larger than the Three chunk.
- Commit trailers: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014MiBdujgrQoZPcWERA8cQn`.
- Work on branch `feat/storm-and-turret`.
- **Deviation from the spec, agreed at planning time:** the spec proposed `Renderer.setRadar(on)`. Dropped — `draw(curr, prev, alpha)` already receives the full `RigState`, so the renderer reads `curr.radar` and `curr.storm` directly. This removes a cross-task dependency between the render and UI tasks and leaves the `Renderer` interface untouched.

## File structure

| File | Responsibility |
|------|----------------|
| `src/sim/storm.ts` (new) | `scheduleStorms`, `stormLevel` — pure, no transcendentals |
| `src/sim/types.ts` | `StormFront`, `StormTuning`; `RouteDef.storms`; `RigState.storm`/`radar`; `InputFrame.radar`; `Tuning.storm`/`radarDrain`; `RouteTuning.stormWeight` |
| `src/sim/terrain.ts` | schedules storms into the route; `generateRoute` takes the full `Tuning` |
| `src/sim/step.ts` | writes `s.storm`, applies speed and restraint penalties, drains reserve for radar |
| `src/sim/bot.ts` | `BotView.storm`; radar on during a front |
| `src/game/orders.ts` | `stormRisk`; storm count in `routeDifficulty` |
| `src/ui/input.ts` | radar latch and `InputFrame.radar` |
| `src/ui/panel/panel.ts` | `RADAR` button |
| `src/ui/hud.ts` | storm countdown, `SANDSTORM`, `RADAR ACTIVE` |
| `src/ui/screens/route.ts` | `STORM RISK` cell |
| `src/render/three/ThreeRenderer.ts` | storm fog ramp, radar material swap |
| `src/render/three/walls.ts`, `hazards.ts`, `terrain.ts` | radar material variants |

## Execution order

Tasks 1 and 2 are sequential and run alone. Tasks 3–6 are **independent and run concurrently** — their file sets are disjoint by design. Task 7 integrates.

```
1 ──> 2 ──> ┬── 3  bot + reserve budget      (opus)
            ├── 4  input + panel + HUD        (sonnet)
            ├── 5  render                     (sonnet)
            └── 6  orders + route card        (haiku)
                        └──> 7  integration + human review
```

---

### Task 1: Storm schedule and level

**Files:**
- Create: `src/sim/storm.ts`, `test/storm.test.ts`
- Modify: `src/sim/types.ts`, `src/content/tuning.json`, `src/sim/terrain.ts`, and every `generateRoute` call site

**Interfaces:**
- Produces: `scheduleStorms(rng: Rng, lengthM: number, tier: number, tuning: Tuning): StormFront[]`; `stormLevel(route: RouteDef, t: number, tuning: Tuning): number`; `RouteDef.storms: StormFront[]`; `generateRoute(seed, lengthM, tier, hazardDefs, tuning: Tuning)`.

- [ ] **Step 1: Types**

In `src/sim/types.ts` add:

```ts
export interface StormFront { id: number; startTick: number; endTick: number }
export interface StormTuning {
  maxFronts: number[]; frontChance: number[];
  minDurationS: number; maxDurationS: number; rampS: number;
  windowLo: number; windowHi: number;
  speedMul: number; strapDrain: number;
}
```

Add `storms: StormFront[];` to `RouteDef` (beside `discoveries`).
Add `storm: number; radar: boolean;` to `RigState` (beside `braced`).
Add `radar?: boolean;` to `InputFrame` (beside `jump`).
Add `stormWeight: number;` to `RouteTuning`.
Add `storm: StormTuning; radarDrain: number;` to `Tuning` (beside `route`).

- [ ] **Step 2: Tuning**

In `src/content/tuning.json`, add `"radarDrain": 0.5,` beside `"braceDrain"`, add `"stormWeight": 0.25` inside the existing `"route"` object, and add this block beside `"route"`:

```json
"storm": {
  "maxFronts": [0, 1, 1, 2],
  "frontChance": [0, 0.6, 0.75, 0.8],
  "minDurationS": 14, "maxDurationS": 28,
  "rampS": 5,
  "windowLo": 0.15, "windowHi": 0.85,
  "speedMul": 0.7, "strapDrain": 0.6
},
```

- [ ] **Step 3: Write the failing tests**

Create `test/storm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scheduleStorms, stormLevel } from '../src/sim/storm';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute } from './helpers';
import type { RouteDef, StormFront } from '../src/sim/types';

const ramp = Math.round(tuning.storm.rampS / tuning.dt);
const withStorms = (storms: StormFront[]): RouteDef => ({ ...flatRoute(), storms });

describe('scheduleStorms', () => {
  it('never storms at tier 0 and is deterministic for a seed', () => {
    expect(scheduleStorms(mulberry32(1), 600, 0, tuning)).toEqual([]);
    expect(scheduleStorms(mulberry32(9), 900, 3, tuning)).toEqual(scheduleStorms(mulberry32(9), 900, 3, tuning));
  });
  it('keeps fronts inside the window, sane in length, and separated by two ramps', () => {
    const cruise = tuning.gaitSpeed[2]! * tuning.gaitSpeedMul;
    for (let seed = 1; seed < 40; seed++) {
      const total = Math.round(900 / cruise / tuning.dt);
      const fronts = scheduleStorms(mulberry32(seed), 900, 3, tuning);
      expect(fronts.length).toBeLessThanOrEqual(tuning.storm.maxFronts[3]!);
      for (const f of fronts) {
        expect(f.startTick, `seed ${seed}`).toBeGreaterThanOrEqual(Math.round(total * tuning.storm.windowLo));
        expect(f.endTick, `seed ${seed}`).toBeLessThanOrEqual(Math.round(total * tuning.storm.windowHi));
        const seconds = (f.endTick - f.startTick) * tuning.dt;
        expect(seconds).toBeGreaterThanOrEqual(tuning.storm.minDurationS - 0.02);
        expect(seconds).toBeLessThanOrEqual(tuning.storm.maxDurationS + 0.02);
      }
      for (let i = 1; i < fronts.length; i++) {
        expect(fronts[i]!.startTick - fronts[i - 1]!.endTick, `seed ${seed}`).toBeGreaterThanOrEqual(2 * ramp);
      }
    }
  });
});

describe('stormLevel', () => {
  const route = withStorms([{ id: 0, startTick: 1000, endTick: 2000 }]);
  it('is zero outside the front and its ramps', () => {
    expect(stormLevel(route, 0, tuning)).toBe(0);
    expect(stormLevel(route, 1000 - ramp, tuning)).toBe(0);
    expect(stormLevel(route, 2000 + ramp, tuning)).toBe(0);
  });
  it('ramps in, holds, and ramps out', () => {
    expect(stormLevel(route, 1000 - ramp / 2, tuning)).toBeCloseTo(0.5, 2);
    expect(stormLevel(route, 1000, tuning)).toBe(1);
    expect(stormLevel(route, 1500, tuning)).toBe(1);
    expect(stormLevel(route, 2000, tuning)).toBe(1);
    expect(stormLevel(route, 2000 + ramp / 2, tuning)).toBeCloseTo(0.5, 2);
  });
  it('takes the strongest of overlapping fronts', () => {
    const two = withStorms([{ id: 0, startTick: 1000, endTick: 1100 }, { id: 1, startTick: 1150, endTick: 2000 }]);
    expect(stormLevel(two, 1125, tuning)).toBeGreaterThan(0.4);
  });
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `pnpm vitest run test/storm.test.ts`
Expected: FAIL — cannot resolve `../src/sim/storm`.

- [ ] **Step 5: Implement the storm module**

Create `src/sim/storm.ts`:

```ts
import type { RouteDef, StormFront, Tuning } from './types';
import type { Rng } from './rng';

/**
 * Fronts are scheduled in ticks across the route's expected duration, so a slow driver eats more storm and a
 * sprinter may outrun the second front. Deterministic: the caller's rng is the route's own.
 */
export function scheduleStorms(rng: Rng, lengthM: number, tier: number, tuning: Tuning): StormFront[] {
  const st = tuning.storm;
  const idx = Math.min(tier, st.maxFronts.length - 1);
  const max = st.maxFronts[idx] ?? 0;
  const chance = st.frontChance[Math.min(tier, st.frontChance.length - 1)] ?? 0;
  const cruise = tuning.gaitSpeed[2]! * tuning.gaitSpeedMul;
  const total = Math.round(lengthM / cruise / tuning.dt);
  const ramp = Math.round(st.rampS / tuning.dt);
  const latest = Math.round(total * st.windowHi);
  const fronts: StormFront[] = [];
  let earliest = Math.round(total * st.windowLo);
  for (let i = 0; i < max; i++) {
    if (rng.next() >= chance) continue;
    const duration = Math.round((st.minDurationS + rng.next() * (st.maxDurationS - st.minDurationS)) / tuning.dt);
    const span = latest - earliest - duration;
    if (span <= 0) break;
    const start = earliest + Math.floor(rng.next() * span);
    fronts.push({ id: fronts.length, startTick: start, endTick: start + duration });
    earliest = start + duration + 2 * ramp;   // never let two fronts merge into one unbroken wall
  }
  return fronts;
}

/** 0 clear, 1 full storm. Symmetric ramps, so the front arrives and lifts as gradually as it counts down. */
export function stormLevel(route: RouteDef, t: number, tuning: Tuning): number {
  const ramp = Math.round(tuning.storm.rampS / tuning.dt);
  let level = 0;
  for (const f of route.storms) {
    let l = 0;
    if (t >= f.startTick && t <= f.endTick) l = 1;
    else if (t > f.startTick - ramp && t < f.startTick) l = (t - (f.startTick - ramp)) / ramp;
    else if (t > f.endTick && t < f.endTick + ramp) l = 1 - (t - f.endTick) / ramp;
    if (l > level) level = l;
  }
  return level;
}
```

- [ ] **Step 6: Wire storms into the route**

In `src/sim/terrain.ts`:

1. Import: `import { scheduleStorms } from './storm';` and add `Tuning` to the type import.
2. `routeFromSegments` gains a final parameter `storms: StormFront[] = []` and includes `storms` in the returned object (add `StormFront` to its type import).
3. Change the `generateRoute` signature from `t: TerrainTuning` to `tuning: Tuning`, and add `const t = tuning.terrain;` as the first line of the body so the rest of the function is untouched.
4. The final line becomes:

```ts
  return routeFromSegments(seed, segments, hazards, t.profileStepM, discoveries, layout, W, scheduleStorms(rng, lengthM, tier, tuning));
```

- [ ] **Step 7: Update every `generateRoute` call site**

`src/game/flow.ts:62`, `scripts/validate.ts:15`, `test/bot.test.ts` (3), `test/terrain.test.ts` (14), `test/sketch.test.ts:6`, `test/orders.test.ts:50`, `test/replay.test.ts:10`: change the last argument from `tuning.terrain` to `tuning`.

**Watch out:** `test/terrain.test.ts` lines 55, 65 and 68 pass a locally modified `t`, not `tuning.terrain`. Those become `{ ...tuning, terrain: t }`.

- [ ] **Step 8: Run the gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green, `test/storm.test.ts` passing.

```bash
git add -A
git commit -m "feat(sim): seeded storm fronts scheduled in ticks, with a pure intensity ramp"
```

---

### Task 2: Storm effects and radar drain

**Files:**
- Modify: `src/sim/step.ts`
- Test: `test/storm.test.ts`

**Interfaces:**
- Consumes: `stormLevel` (Task 1), `RigState.storm`/`radar`, `InputFrame.radar`, `tuning.storm.speedMul`/`strapDrain`, `tuning.radarDrain`.
- Produces: `s.storm` written every tick; speed and restraint penalties scaled by it; reserve drained while `s.radar`.

- [ ] **Step 1: Write the failing tests**

Append to `test/storm.test.ts`:

```ts
import { createRun, step } from '../src/sim/step';
import { crateDef, frame } from './helpers';
import { routeFromSegments } from '../src/sim/terrain';

function stormRoute(): RouteDef {
  const r = routeFromSegments(1, [{ x0: 0, x1: 4000, slope: 0, y0: 0 }], [], 10, [], undefined, 18,
    [{ id: 0, startTick: 60, endTick: 6000 }]);
  return r;
}

describe('storm effects', () => {
  it('writes the level onto the state and cuts the speed target by it', () => {
    const route = stormRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(2);
    for (let i = 0; i < 200; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.storm).toBe(1);
    expect(s.targetSpeed).toBeCloseTo(tuning.gaitSpeed[2]! * tuning.gaitSpeedMul * tuning.storm.speedMul, 5);
  });
  it('works the restraints loose in proportion to the level', () => {
    const route = stormRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(3);
    const before = s.items[0]!.restraint;
    for (let i = 0; i < 600; i++) step(s, frame({ gait: 0, throttle: 0 }), route, [], tuning, rng);
    expect(s.items[0]!.restraint).toBeLessThan(before - 4);
  });
  it('leaves a calm route alone', () => {
    const route = flatRoute();
    const s = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(4);
    for (let i = 0; i < 300; i++) step(s, frame({ gait: 2, throttle: 1 }), route, [], tuning, rng);
    expect(s.storm).toBe(0);
    expect(s.items[0]!.restraint).toBe(tuning.strapStart);
  });
});

describe('radar', () => {
  it('drains reserve only while lit, and works outside a storm too', () => {
    const route = flatRoute();
    const lit = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const dark = createRun(route, [{ def: crateDef(), slot: 1 }], tuning);
    const rngA = mulberry32(5), rngB = mulberry32(5);
    for (let i = 0; i < 600; i++) {
      step(lit, frame({ gait: 2, throttle: 1, radar: true }), route, [], tuning, rngA);
      step(dark, frame({ gait: 2, throttle: 1, radar: false }), route, [], tuning, rngB);
    }
    expect(lit.radar).toBe(true);
    expect(dark.radar).toBe(false);
    expect(dark.reserve - lit.reserve).toBeCloseTo(tuning.radarDrain * 600 * tuning.dt, 4);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run test/storm.test.ts`
Expected: FAIL — `s.storm` is `undefined`, reserves are equal.

- [ ] **Step 3: Initialise the new state**

In `createRun`'s returned object in `src/sim/step.ts`, beside `braced: false,` add:

```ts
    storm: 0, radar: false,
```

- [ ] **Step 4: Apply the storm in `stepRig`**

Import at the top of `src/sim/step.ts`: `import { stormLevel } from './storm';`

In `stepRig`, immediately after `s.braced = input.brace;` add:

```ts
  s.storm = stormLevel(route, s.t, tuning);
  s.radar = input.radar ?? false;
```

Then the speed target: find

```ts
  if (inMud) target *= tuning.mudSpeedMul;
```

and add directly beneath it:

```ts
  if (s.storm > 0) target *= 1 - (1 - tuning.storm.speedMul) * s.storm;   // eases in with the 5 s ramp
```

- [ ] **Step 5: Drain reserve for radar**

In `src/sim/step.ts` find the reserve line:

```ts
  s.reserve -= (drainRate(route, tuning) + (s.braced ? tuning.braceDrain : 0)) * dt;
```

and replace it with:

```ts
  s.reserve -= (drainRate(route, tuning) + (s.braced ? tuning.braceDrain : 0) + (s.radar ? tuning.radarDrain : 0)) * dt;
```

- [ ] **Step 6: Work the restraints loose**

In `applyRestraintInput` in `src/sim/step.ts`, the per-item decay line reads:

```ts
  for (const it of s.items) if (!it.lost) it.restraint = Math.max(0, it.restraint - tuning.restraintDecay[it.behavior] * tuning.dt);
```

Replace it with:

```ts
  const stormDrain = s.storm * tuning.storm.strapDrain;
  for (const it of s.items) if (!it.lost) it.restraint = Math.max(0, it.restraint - (tuning.restraintDecay[it.behavior] + stormDrain) * tuning.dt);
```

**Watch out:** `applyRestraintInput` is called before `s.storm` is assigned in `stepRig`. Move the `s.storm = stormLevel(...)` assignment from Step 4 to sit *above* the `applyRestraintInput(s, input, tuning);` call, so the drain uses this tick's level rather than last tick's.

- [ ] **Step 7: Run the gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add -A
git commit -m "feat(sim): storm cuts speed and works restraints loose; radar burns reserve"
```

---

### Task 3: Bot radar and the reserve budget

**Files:**
- Modify: `src/sim/bot.ts`, `src/content/tuning.json` (`reserveBudget` only)
- Test: `test/bot.test.ts`

**Interfaces:**
- Consumes: `RigState.storm` (Task 2).
- Produces: `BotView.storm`; `botPolicy` returns `radar: v.storm > 0`.

**This task owns `reserveBudget`. No other task may touch `tuning.json`.**

- [ ] **Step 1: Write the failing test**

Append to `test/bot.test.ts` inside the existing `describe('botPolicy'` block (or a new `describe`):

```ts
  it('runs radar through a front and not outside one', () => {
    const r = flatRoute();
    const base = { x: 100, z: 0, lateralVel: 0, tilt: 0, tiltVel: 0, strap: 70, braced: false, recovering: 0, items: [] };
    expect(botPolicy({ ...base, storm: 0 }, r, tuning).radar).toBe(false);
    expect(botPolicy({ ...base, storm: 0.4 }, r, tuning).radar).toBe(true);
    expect(botPolicy({ ...base, storm: 1 }, r, tuning).radar).toBe(true);
  });
```

Add `flatRoute` to the imports from `./helpers` if it is not already there.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/bot.test.ts`
Expected: FAIL — `storm` is not a property of `BotView`.

- [ ] **Step 3: Implement**

In `src/sim/bot.ts`:

1. Add `storm: number` to the end of the `BotView` interface.
2. In `view(s)`, add `storm: s.storm,` to the returned object.
3. In `botPolicy`'s returned `InputFrame`, add `radar: v.storm > 0,`.

- [ ] **Step 4: Run the tests**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 5: Measure the reserve shortfall**

Run: `pnpm validate`

Record the *minimum* reserve across all 12 outposts at lag 15 for both loadouts. Compare against the pre-storm baseline, which finished with roughly 36–54 reserve.

- [ ] **Step 6: Raise `reserveBudget` only as far as the measurement demands**

If validate fails, or the worst-case reserve falls below 15, raise `reserveBudget` in `src/content/tuning.json` from `0.62` in steps of `0.02` and re-run `pnpm validate` after each step. Stop at the first value that both passes 12/12 and leaves the worst case at 15 or better.

**Do not exceed `0.72`.** If 12/12 with a 15 reserve floor is not reachable at or below `0.72`, stop and report the numbers — the drain constants are wrong and that is a decision for the human, not a budget to widen until the failure disappears.

Record in the report: the chosen `reserveBudget`, the worst-case outpost and its reserve.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(bot): radar through every front; reserve budget re-measured for the storm"
```

---

### Task 4: Input, panel button and HUD

**Files:**
- Modify: `src/ui/input.ts`, `src/ui/panel/panel.ts`, `src/ui/panel/panel.css`, `src/ui/hud.ts`, `src/game/flow.ts`
- Test: `test/input.test.ts`

**Interfaces:**
- Consumes: `RigState.storm`/`radar` (Task 2), `InputFrame.radar`.
- Produces: `InputController.toggleRadar()`; `PanelHandlers.onRadar()`.

**This task owns `panel.css` and `flow.ts`. No other task may touch them.**

- [ ] **Step 1: Write the failing test**

Append to `test/input.test.ts`:

```ts
  it('latches radar on Q and on the panel handler, and reports it in the frame', () => {
    const st = resetInput(makeInput());
    expect(sampleFrame(st, tuning).radar).toBe(false);
    applyKey(st, 'KeyQ', true);
    expect(sampleFrame(st, tuning).radar).toBe(true);
    applyKey(st, 'KeyQ', false);
    expect(sampleFrame(st, tuning).radar).toBe(true);   // latched, not held
    applyKey(st, 'KeyQ', true);
    expect(sampleFrame(st, tuning).radar).toBe(false);
  });
```

Match the helpers the existing tests in this file already use to build an input state; if they construct it differently, follow that pattern rather than the names above.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/input.test.ts`
Expected: FAIL — `radar` is `undefined` on the frame.

- [ ] **Step 3: Input**

In `src/ui/input.ts`:

1. Add `radar: boolean;` to the `InputState` interface and `radar: false` to the object `makeInput`/`resetInput` builds. **Keep `radar` out of `resetInput`'s clearing** only if the existing reset is used mid-run; if `resetInput` runs once per haul, clearing it there is correct — follow whichever the file already does for `gait`.
2. In `applyKey`, add a case for `'KeyQ'` that toggles on key *down* only: `if (down) st.radar = !st.radar;`
3. In `sampleFrame`, add `radar: st.radar,` to the returned frame.
4. Add a method to `InputController`: `toggleRadar(): void { this.state.radar = !this.state.radar; }`

- [ ] **Step 4: Panel button**

In `src/ui/panel/panel.ts`:

1. Add `onRadar(): void` to `PanelHandlers`.
2. In the button row markup, after the BRACE button add:

```html
          <button class="big radar m2">RADAR <kbd>Q</kbd></button>
```

3. Wire it beside the other button handlers in the constructor:

```ts
    q<HTMLButtonElement>('button.radar').addEventListener('pointerdown', () => h.onRadar());
```

4. Add a `setRadar(on: boolean)` method that toggles the lit class:

```ts
  setRadar(on: boolean): void { this.root.querySelector('button.radar')!.classList.toggle('on', on); }
```

5. In `update(s, tuning)`, call `this.setRadar(s.radar);`

- [ ] **Step 5: HUD**

In `src/ui/hud.ts`, add two readouts to the `innerHTML` template, directly after the `.threat` div:

```html
      <div class="storm" hidden></div>
      <div class="radar-lamp" hidden>RADAR ACTIVE</div>
```

Capture them in the constructor next to the other `q(...)` calls (`this.stormEl = q('.storm'); this.radarEl = q('.radar-lamp');`) and add the fields. Give the radar lamp a pointer handler beside the cargo rack one so a touch device can toggle it:

```ts
    this.radarEl.addEventListener('pointerdown', () => this.h.onToggleRadar());
```

Add `onToggleRadar(): void` to `HudHandlers`. In `update(s, route)` add:

```ts
    // storm: count down through the ramp, then hold with the intensity
    const front = route.storms.find((f) => s.t < f.endTick + 300);
    const secondsOut = front ? Math.ceil((front.startTick - s.t) / 60) : 0;
    const showStorm = s.storm > 0 || (front !== undefined && secondsOut > 0 && secondsOut <= 5);
    this.stormEl.hidden = !showStorm;
    if (showStorm) {
      this.stormEl.textContent = s.storm > 0
        ? `SANDSTORM · ${Math.round(s.storm * 100)}%`
        : `SANDSTORM IN ${secondsOut}`;
      this.stormEl.classList.toggle('warning', s.storm === 0);
    }
    this.radarEl.hidden = !s.radar;
```

- [ ] **Step 6: CSS**

Append to `src/ui/panel/panel.css`:

```css
.hud .storm { position: absolute; left: 50%; top: 74px; transform: translateX(-50%); padding: 6px 12px; color: #f4ead2; background: rgba(96,64,28,.82); border: 1px solid #d29a4a; letter-spacing: .14em; }
.hud .storm.warning { background: rgba(143,47,34,.85); border-color: #ff8a4c; animation: blink .5s steps(2) infinite; }
.hud .radar-lamp { position: absolute; left: 50%; top: 108px; transform: translateX(-50%); pointer-events: auto; cursor: pointer; padding: 5px 10px; color: #0f1a18; background: #65efd6; letter-spacing: .14em; }
button.big.radar.on { background: #65efd6; color: var(--ink); }
```

- [ ] **Step 7: Flow wiring**

In `src/game/flow.ts`, the `Hud` is constructed with handlers — extend that call:

```ts
    this.hud = new Hud(d.viewportEl, {
      onSelectBay: (slot) => d.input.selectCargo(slot),
      onToggleRadar: () => d.input.toggleRadar(),
    });
```

Then find where `PanelHandlers` are supplied (in `src/main.ts`, where the `Panel` is constructed) and add `onRadar: () => input.toggleRadar(),` alongside the existing handlers.

- [ ] **Step 8: Run the gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add -A
git commit -m "feat(ui): radar latch on Q and the panel, storm countdown and RADAR ACTIVE lamp"
```

---

### Task 5: Render — storm fog and the radar wireframe

**Files:**
- Modify: `src/render/three/ThreeRenderer.ts`, `src/render/three/walls.ts`, `src/render/three/hazards.ts`, `src/render/three/terrain.ts`

**Interfaces:**
- Consumes: `curr.storm` and `curr.radar` off the `RigState` already passed to `draw()`. **No change to the `Renderer` interface and no flow wiring.**
- Produces: `radarMaterial(kind)` exports from `walls.ts`; `setRadarMode(group, on)` from `hazards.ts`.

No unit tests — WebGL. Verification is `pnpm typecheck && pnpm lint && pnpm build` plus a static preview in Task 7.

- [ ] **Step 1: Radar materials for the walls**

In `src/render/three/walls.ts`, beside the existing `MATERIAL` record add:

```ts
const RADAR_MATERIAL: Record<WallKind, THREE.MeshBasicMaterial> = {
  wall: new THREE.MeshBasicMaterial({ color: '#65efd6', wireframe: true }),
  rock: new THREE.MeshBasicMaterial({ color: '#3fbfa8', wireframe: true }),
  ruin: new THREE.MeshBasicMaterial({ color: '#8affe4', wireframe: true }),
  baffle: new THREE.MeshBasicMaterial({ color: '#d6fff6', wireframe: true }),
};

/** Swaps the shared singleton materials on every instanced wall mesh. Cheap: no geometry work, no new draw calls. */
export function setWallsRadar(group: THREE.Group, on: boolean): void {
  for (const child of group.children) {
    if (!(child instanceof THREE.InstancedMesh)) continue;
    const kind = child.name.replace('walls-', '') as WallKind;
    child.material = on ? RADAR_MATERIAL[kind] : MATERIAL[kind];
  }
}
```

Add `RADAR_MATERIAL` to the module's disposal exclusions if any exist; these are shared singletons and are never disposed, matching `MATERIAL`.

- [ ] **Step 2: Radar mode for the hazards**

In `src/render/three/hazards.ts` add:

```ts
const radarMat = new THREE.MeshBasicMaterial({ color: '#ffb066', wireframe: true });
SHARED_MATERIALS.push(radarMat);

/** Remembers each mesh's own material the first time it is switched, so switching back is exact. */
export function setHazardsRadar(group: THREE.Group, on: boolean): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData.baseMaterial === undefined) child.userData.baseMaterial = child.material;
    child.material = on ? radarMat : (child.userData.baseMaterial as THREE.Material);
  });
}
```

- [ ] **Step 3: A flat ground for radar**

In `src/render/three/terrain.ts` add, after `buildTerrain`:

```ts
const radarGround = new THREE.MeshBasicMaterial({ color: '#0a0f0e' });

/** The ground drops to near-black under radar so the wireframe reads; the mesh and its vertex colours are kept. */
export function setTerrainRadar(mesh: THREE.Mesh, on: boolean): void {
  if (mesh.userData.baseMaterial === undefined) mesh.userData.baseMaterial = mesh.material;
  mesh.material = on ? radarGround : (mesh.userData.baseMaterial as THREE.Material);
}
```

- [ ] **Step 4: Drive it from `draw`**

In `src/render/three/ThreeRenderer.ts`:

1. Extend the imports: `import { buildTerrain, setTerrainRadar } from './terrain';`, `import { buildWalls, disposeWalls, setWallsRadar } from './walls';`, and add `setHazardsRadar` to the hazards import.
2. Add fields:

```ts
  private radarOn = false;
  private readonly stormFog = new THREE.Color();
```

3. Add the constants beside `SKY`:

```ts
const SAND = '#c2a06a';
const FOG_CLEAR_NEAR = 60, FOG_CLEAR_FAR = 180;
const FOG_STORM_NEAR = 10, FOG_STORM_FAR = 26;
```

4. In `draw`, directly before `this.gl.render(...)`, add:

```ts
    // storm closes the fog in with the ramp; radar buys the distance back and re-materials the world
    const fog = this.scene.fog as THREE.Fog;
    const L = curr.radar ? 0 : curr.storm;
    fog.near = FOG_CLEAR_NEAR + (FOG_STORM_NEAR - FOG_CLEAR_NEAR) * L;
    fog.far = FOG_CLEAR_FAR + (FOG_STORM_FAR - FOG_CLEAR_FAR) * L;
    this.stormFog.set(SKY).lerp(new THREE.Color(SAND), curr.storm);
    if (curr.radar) this.stormFog.set('#050807');
    fog.color.copy(this.stormFog);
    (this.scene.background as THREE.Color).copy(this.stormFog);
    if (curr.radar !== this.radarOn) {
      this.radarOn = curr.radar;
      if (this.walls) setWallsRadar(this.walls, this.radarOn);
      if (this.hazardGroup) setHazardsRadar(this.hazardGroup, this.radarOn);
      if (this.terrain) setTerrainRadar(this.terrain, this.radarOn);
    }
```

- [ ] **Step 5: Run the gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: green; the Three chunk stays the largest.

```bash
git add -A
git commit -m "feat(render): sand fog that closes in with the storm, wireframe world under radar"
```

---

### Task 6: Storm risk on the route board

**Files:**
- Modify: `src/game/orders.ts`, `src/ui/screens/route.ts`, `src/ui/screens/screens.css`
- Test: `test/orders.test.ts`

**Interfaces:**
- Consumes: `RouteDef.storms` (Task 1), `tuning.route.stormWeight`, `tuning.storm`.
- Produces: `stormRisk(outpost: OutpostDef, tuning: Tuning): 'NONE' | 'LOW' | 'MED' | 'HIGH'`.

**This task owns `screens.css`. No other task may touch it.**

- [ ] **Step 1: Write the failing test**

Append to `test/orders.test.ts`:

```ts
describe('stormRisk', () => {
  it('bands by tier and never promises a storm on a tier-0 run', () => {
    const at = (tier: number) => stormRisk(outposts.find((o) => o.tier === tier)!, tuning);
    expect(at(0)).toBe('NONE');
    expect(at(1)).toBe('LOW');
    expect(at(2)).toBe('MED');
    expect(at(3)).toBe('HIGH');
  });
});
```

Add `stormRisk` to the existing import from `../src/game/orders`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run test/orders.test.ts`
Expected: FAIL — `stormRisk is not a function`.

- [ ] **Step 3: Implement the band and price the fronts**

In `src/game/orders.ts` add:

```ts
const RISK_BANDS = ['NONE', 'LOW', 'MED', 'HIGH'] as const;
export type StormRisk = typeof RISK_BANDS[number];

/** The forecast: the player learns a route is likely to storm, never how many fronts or when. */
export function stormRisk(outpost: OutpostDef, tuning: Tuning): StormRisk {
  const maxFronts = tuning.storm.maxFronts[Math.min(outpost.tier, tuning.storm.maxFronts.length - 1)] ?? 0;
  if (maxFronts === 0) return 'NONE';
  return RISK_BANDS[Math.min(RISK_BANDS.length - 1, outpost.tier)]!;
}
```

In `routeDifficulty`, add the actual seeded count to the score — the band is the forecast, the fee is the truth. Change the `score` expression to include a final term:

```ts
    + route.storms.length * r.stormWeight;
```

- [ ] **Step 4: Show it on the card**

In `src/ui/screens/route.ts`:

1. Add `stormRisk: string` to `RouteOption`.
2. Add a fifth cell to the `.route-stats` strip:

```html
            <span>STORM <b>${o.stormRisk}</b></span>
```

3. In `src/game/flow.ts` **do not edit** — Task 4 owns that file. Instead, export a helper from `route.ts` is unnecessary: the flow already builds `RouteOption` objects. Leave the flow change to Task 7's integration step, and note it in your report.

- [ ] **Step 5: CSS**

The `.route-stats span` rule already flexes to fit five cells. Reduce the font a step so five cells still fit a narrow screen — in `src/ui/screens/screens.css` change the `.route-stats span` font size from `9px` to `8px`.

- [ ] **Step 6: Run the gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: `test/orders.test.ts` green. **`src/game/flow.ts` will not typecheck until Task 7 supplies `stormRisk` to the `RouteOption`** — if `pnpm typecheck` fails only on that one missing property in `flow.ts`, that is expected; report it and commit anyway.

```bash
git add -A
git commit -m "feat(game): storm risk band on the route card, fronts priced into the fee"
```

---

### Task 7: Integration, gates and human review

**Files:**
- Modify: `src/game/flow.ts` (one line), `DEVLOG.md`

- [ ] **Step 1: Supply the risk band to the route card**

In `src/game/flow.ts`, the `dispatch()` method builds each `RouteOption`. Add `stormRisk` to that object and import it:

```ts
        outpost, rating: routeDifficulty(route, outpost, this.tuning), sketch: routeSketchSvg(route),
        hazardCount: route.hazards.filter((h) => h.impulse > 0).length, zoneCount: route.zones.length,
        stormRisk: stormRisk(outpost, this.tuning),
```

- [ ] **Step 2: Full gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm validate && pnpm build`
Expected: all green; validate 12/12 at lag 15; the Three chunk stays the largest.

- [ ] **Step 3: Static previews**

Render the route board and a storm HUD frame to standalone HTML using the capture-stub pattern (assign to a fake `el.innerHTML`, inline the real `panel.css` and `screens.css`) and send both to the human.

- [ ] **Step 4: DEVLOG**

Add a bullet under the ground-course entry describing the storm: seeded tick-scheduled fronts, ramped effects, radar wireframe at a reserve cost, and the re-measured `reserveBudget` with its worst-case number.

- [ ] **Step 5: Commit and hand over for human review**

```bash
git add -A
git commit -m "docs: sandstorm devlog"
git push -u origin feat/storm-and-turret
```

Report to the human: the chosen `reserveBudget` and worst-case reserve, whether radar or crawling proved cheaper, and the previews. **Do not open a PR or merge — the human reviews first.**

---

## Self-review

- **Spec coverage.** §1 model → Task 1; §2 effects → Task 2; §3 radar → Tasks 2 (drain) and 4 (control); §4 render → Task 5; §5 HUD → Tasks 4 and 6; §6 bot and validator → Task 3; §7 data changes → spread across 1–6; §8 testing → each task's test steps plus Task 7's full gates.
- **Spec deviation, recorded above:** `Renderer.setRadar` dropped in favour of the renderer reading `curr.radar`/`curr.storm` from the `RigState` it already gets. Removes a cross-task dependency; the `Renderer` interface is unchanged.
- **Known cross-task seam:** Task 6 adds `RouteOption.stormRisk` but must not edit `flow.ts` (Task 4 owns it). Task 7 Step 1 closes that seam. Task 6's typecheck failing on exactly that property is expected and called out in its own steps.
- **Type consistency.** `stormLevel(route, t, tuning)`, `scheduleStorms(rng, lengthM, tier, tuning)`, `setWallsRadar`, `setHazardsRadar`, `setTerrainRadar`, `stormRisk(outpost, tuning)`, `InputController.toggleRadar`, `PanelHandlers.onRadar`, `HudHandlers.onToggleRadar` — each defined once and referenced by the same name everywhere.
- **Reserve budget guard rail.** Task 3 may not exceed `reserveBudget` `0.72`, and must stop and report rather than widen further.
