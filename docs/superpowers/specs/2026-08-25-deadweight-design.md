# DEADWEIGHT — Design Spec

Date: 2026-08-25
Status: approved in discussion, pending written review
Supersedes: `HAULER_SPEC.md` §6 (tech), §8 (milestones), §11 (open decisions). Everything else in `HAULER_SPEC.md` stands unless contradicted here.

---

## 1. Decisions locked

| Question | Decision |
|---|---|
| Time budget | Core loop (M0–M2) in ~1 day; M3–M4 when time allows |
| Feel split | 50/50 reflex/planning — loadout slot positions matter mechanically; dispatch shows slope profile |
| Time pressure | Pressure reserve is the global clock (M1) + per-item "rush" deadlines on some cargo (M2) |
| Tilt model | Second-order: ballast drives angular acceleration; rig overshoots |
| Controls | Horizontal drag on viewport = ballast; throttle rail; Strap/Brace/Deploy button row. Keyboard: A/D, W/S, Space, Shift, E, R |
| Route seeds | Fixed map of ~12 named outposts, each a permanent seed. Traces accumulate per outpost |
| Spill recovery | Single RECOVER button: 8 s freeze, item returns at +0.5 stress, reserve cost |
| Title | DEADWEIGHT |
| Art | Dieselpunk analog: cream / oxidized orange / gunmetal, chunky mechanical type, one danger red |
| Renderer | Three.js for the viewport; DOM+CSS for the panel |
| Camera | 3/4 chase, ~30° off side axis, ~15° down, lerp-follows rig x |

Tilt is **pitch** (fore/aft). Ballast is fore/aft. Slope is fore/aft. One degree of freedom.

---

## 2. Simulation model (`src/sim/`)

Pure TypeScript. No DOM imports. No `Math.sin/cos/tan/exp/log/pow` (cross-engine determinism for replays); eslint-enforced. Fixed timestep 60 Hz. Every constant lives in `content/tuning.json`.

### 2.1 State

```ts
interface RigState {
  t: number;            // tick
  x: number;            // metres along route
  tilt: number;         // normalized; |tilt| >= 1 = spill threshold
  tiltVel: number;
  gait: 0 | 1 | 2 | 3 | 4;
  ballast: number;      // integer −100..100 (upgrade widens to ±130)
  strap: number;        // 0..100 tension
  reserve: number;      // 0..100, the clock
  braced: boolean;
  items: ItemState[];   // { id, slot, offset, stress, lost }
  recovering: number;   // ticks left in RECOVER freeze; 0 = none
  ended: null | 'arrived' | 'spilled' | 'stalled';
}

interface InputFrame {
  gait: 0 | 1 | 2 | 3 | 4;
  ballast: number;      // integer, quantized before entering sim
  strap: boolean;       // tap this tick
  brace: boolean;       // held
  deploy: KitId | 0;
  recover: boolean;
}
```

### 2.2 Per-tick dynamics

```
slope      = route.slopeAt(x)                                   // piecewise-linear heightmap
loadOffset = Σ mass_i·(slotPos_i + offset_i) / Σ mass_i         // lost items excluded
torque     = k_slope·slope + k_ballast·ballast/100 + k_load·loadOffset + impulse
tiltAcc    = torque − damping·tiltVel − stiffness·tilt          // stiffness small: legs push back a little
tiltVel   += tiltAcc·dt
tilt      += tiltVel·dt

if braced:   speed = braceSpeed (creep); impulse absorbed; tiltVel *= braceDamp; reserve −= braceDrain·dt
else:        x += gaitSpeed[gait]·dt
reserve   −= drainRate·dt   where drainRate = reserveBudget·100·gaitSpeed[2] / route.length
             // gait 2 spends reserveBudget of the reserve on any route; gait 1 stalls ~75 % in; speed itself is free
if recovering > 0: recovering−−; speed = 0; all other dynamics frozen
```

Speed's cost is **shorter lookahead** (viewport width ÷ speed = reaction window), twitchier tilt, and harder hazard impulses (`hazardGaitScale[gait]`). Speed's benefit is reserve left at arrival.

Brace creeps at `braceSpeed` rather than stopping: a zero-speed brace can never cross the hazard it is bracing for.

### 2.3 Per-item drift (the feedback spiral)

```
after |tilt| > driftThreshold continuously for graceTicks (default 24 = 0.4 s):
  static:      offset += k_drift·tilt·(1 − strap/100)·dt
  slosh:       offset is a spring-damper chasing tilt·sloshGain   (overshoots, never settles)
  livestock:   offset += seededNoise()·k_live·dt                  (seeded RNG → replay-safe)
  precarious:  static × 3, low tolerance

stress += max(0, |tilt| − tolerance)·k_stress·dt
stress += max(0, strap − crushLimit)·k_crush·dt                  // over-tightening
condition = clamp(1 − stress, 0, 1)
```

### 2.4 Events

- **Hazard crossed** (`x` passes `hazard.x`): if `braced` or cancelled by a trace → absorbed. Else `impulse · hazardGaitScale[gait]` added to `tiltVel` and `strapJolt · strapJoltMul` subtracted from `strap`.
- **Strap tap**: `strap += strapTap`, clamped 100. No natural decay; only jolts loosen.
- **Spill** (`|tilt| ≥ 1`): item with largest `|slotPos + offset|` becomes `lost`; its mass leaves `loadOffset`; `tilt` pulled back toward 0 by `spillRelief`, `tiltVel = 0`. All items lost → `ended = 'spilled'`, but the run stays open for RECOVER for ~5 s.
- **RECOVER** (input while any item lost and `recovering == 0`): `recovering = 480`; first lost item returns with `stress += 0.5`; `reserve −= recoverCost`.
- **Stall** (`reserve ≤ 0`): `ended = 'stalled'`. Partial payout.
- **Rush deadline** (M2): item has `deadlineTick`; past it, that item's payout is 0 (condition still shown).
- **Arrival** (`x ≥ route.length`): `ended = 'arrived'`.

### 2.5 Route generation (`terrain.ts`)

```
rng = mulberry32(outpost.seed)
segments: len ~ U(20, 60) m, slope ~ gaussian(0, σ_tier) clamped to ±maxSlope
hazards:  per segment, roll by hazard.weight, minTier; place at segment midpoint ± jitter
length:   outpost.lengthM  (≈ 90 s × gaitSpeed[2])
```

`RouteDef { segments, hazards, length, slopeAt(x), heightAt(x), slopeProfile: number[] }`. `slopeProfile` is the dispatch preview strip. Gaussian = sum of 12 uniforms − 6 (no `log`/`sqrt`).

### 2.6 Scoring (`score.ts`)

- Per item: `payout_i · condition_i`; lost or past deadline → 0.
- Stars: mean condition of carried items → 5 buckets (`[0.2, 0.4, 0.6, 0.8, 1.0]`); −1 star if any item lost; floor 1.
- Time bonus: `reserve_left · k_bonus`.
- Stall: `payout · stallMultiplier` (default 0.3).

### 2.7 Headless bot (`bot.ts`)

`policy(state, route, lagTicks) → InputFrame`. Feed-forward on the slope `bot.leadSec` ahead plus PD on tilt, brace when an impulse hazard is within `bot.braceAheadM`, strap tap when `strap < bot.strapBelow`, gait 3 cruise / 2 near hazards / 1 through rubble and scree. `lagTicks` delays the bot's view of state. A route is **solvable** if the bot with `lagTicks = 15` (250 ms) arrives with ≥ 1 star. Difficulty tier = the largest lag that still passes.

### 2.8 Determinism

- All sim numbers are plain doubles with only `+ − × ÷`, comparisons, `Math.abs/min/max/floor` (all exactly rounded).
- `ballast` quantized to integer before entering sim.
- One `mulberry32` stream per run, seeded `hash(outpost.seed, runNonce)`; livestock noise consumes from it.
- Replay = feed recorded `InputFrame[]` to `step()` from the same seed. Test asserts byte-identical final state.

---

## 3. Architecture

```
deadweight/
  index.html  package.json  vite.config.ts  tsconfig.json  eslint.config.js
  src/
    sim/                 PURE. Node-importable.
      types.ts  rng.ts  terrain.ts  step.ts  score.ts  bot.ts
    content/
      tuning.json cargo.json hazards.json upgrades.json reviews.json hq.json outposts.json traces.seed.json
    render/
      Renderer.ts        interface { mount(el), draw(prev, curr, alpha, route, traces), resize(), dispose() }
      three/
        ThreeRenderer.ts scene + camera rig (3/4 chase, lerp-follow x)
        terrain.ts       heightfield ribbon: PlaneGeometry along x, y = heightAt, z-noise, flat-shaded, vertex colour by slope
        rig.ts           body box + 6 two-segment legs, tripod gait phase, feet snapped to heightAt, 2-bone IK
        hazards.ts       rocks = icosahedra; gap = cut in ribbon; gust = particle band; scree = scattered small rocks
        traces.ts        plank = box over gap; sign = billboard; drum = cylinder; rope = line; wreckage = tilted rig shell
        fx.ts            dust, spill debris, camera shake
    ui/
      panel/             DOM gauges (tilt needle, reserve, strap), throttle rail, teleprinter, button row
      screens/           dispatch, loadout, haul, result, upgrade
      input.ts           touch drag + keyboard → InputFrame per tick
    game/
      loop.ts            rAF → accumulator → step() at 60 Hz; records InputFrame[]; renderer.draw(alpha)
      flow.ts            DISPATCH → LOAD → HAUL → ARRIVAL → REVIEW → UPGRADE
      save.ts            localStorage, versioned
      traces/            TraceStore interface; LocalTraceStore (+ seed fakes); RemoteTraceStore stub
    audio/               WebAudio synth
    main.ts
  scripts/
    validate.ts          bot over every outpost seed × lag tiers → pass rate; fails CI if any outpost unsolvable
    tune.ts              parameter sweep → CSV for the writeup chart
  test/                  vitest: determinism, replay, terrain gen, scoring
  DEVLOG.md
```

**Rules**
- `sim/` never imports `render/`, `ui/`, `three`, or DOM globals. Renderer reads state, never writes.
- Three is loaded via dynamic `import()` after the panel paints. Panel is first input (<1 s); viewport fills in shortly after. Cold load target < 3 s.
- `draw(prev, curr, alpha)` interpolates between the last two sim states.
- Route ~600–800 m → single ribbon mesh, ~800 × 20 vertices. No chunking.
- Trace effects are resolved in `step()` (plank cancels gap; rope cancels tilt penalty on one slope; sign extends `telegraphM`; drum refills reserve). Renderer only draws them.
- Deploy: GitHub Pages via Actions on push. Workflow runs `vitest` and `scripts/validate.ts` before build.

---

## 4. Game flow & screens

```
DISPATCH  One outpost per dispatch (rotates through outposts with tier ≤ playerTier).
          Teleprinter prints: outpost name, slope-profile strip, trace count, then 3 cargo offers + 1 kit offer.
          Player picks any subset up to capacity. A kit takes a slot.
LOAD      Picks go into slots. slotPos: fore −1 / mid 0 / aft +1. Capacity 2 = fore+aft; 3 = all three.
          Live readout of predicted neutral trim ("TRIM −30"). This is the planning half.
HAUL      loop.ts runs. Ends on arrival | all items lost | reserve 0.
ARRIVAL   ~1 s linger after the run ends (M2). The 4 s walk-in with condition bars filling is M4 polish.
REVIEW    Stars, review line, cash, next-unlock silhouette, ♥ pings (M3).
UPGRADE   2×3 grid; buy or skip → DISPATCH.
```

- Orders are generated at runtime: outpost → 3 cargo with `tier ≤ playerTier` → HQ flavour line from `hq.json`. No static order table.
- `playerTier = min(3, floor(runsCompleted / 3))` gates outposts and cargo.
- Portrait phone: viewport top 45 %, panel bottom 55 %. Ballast drag on viewport; three buttons directly under it; throttle rail on right edge.
- Landscape / desktop: viewport left (~60 %), panel in a right column. Same DOM; CSS grid switch. (A single DOM panel cannot wrap a grid cell — `"panel viewport panel"` is not a valid grid area.)
- Keyboard: A/D ballast (held = ramps), W/S gait, Space strap, Shift brace, E deploy, R recover.

---

## 5. Content schemas

```
cargo.json       { id, name, mass, tolerance, crushLimit, behavior, payout, rush?: sec, tier, art:{shape,color} }   ×20
outposts.json    { id, name, seed, lengthM, tier, flavor }                                                          ×12
hazards.json     { type, impulse, strapJolt, telegraphM, counter, weight, minTier }                                 ×5
                 gust (impulse; counter: strap + counter-ballast) · rubble (strap jolt; counter: slow) ·
                 gap (large impulse; counter: brace or plank) · grade (sustained slope; counter: lead ballast) ·
                 scree (repeated small impulses; counter: slow + brace)
upgrades.json    { id, name, cost, effect:{ key, value } } → applied as tuning overrides                            ×6
                 ballastRange 130 · autoTrim 0.3 · strapJoltMul 0.6 · capacity +1 · gaitSpeedMul 1.2 · kitCostMul 0.5
reviews.json     { stars 1–5, behavior | "any", lines[] }                                                            46 shipped in M2; ~60 by M4
hq.json          { context: dispatch|arrival|spill|stall, behavior | "any", lines[] }                               20 shipped in M2; ~40 by M4
traces.seed.json { seed, x, type, ownerName, useCount, ageHours }                                                   ×25
tuning.json      every constant in §2 + gaitSpeed[5] + reserveBudget + braceSpeed + spillRelief + hazardGaitScale + slot positions + star buckets
```

Save (`localStorage`, versioned): `{ v, cash, runs, upgrades[], bestByOutpost{}, traces[] }`. Corrupt or old version → reset, with a teleprinter notice.

Audio: WebAudio synth, unlocked on first tap. Clunk (gait change), hiss (brace), tick (strap), teleprinter chatter, horn (arrival), crunch (spill).

---

## 6. Milestones

**M0 — Skeleton (~1.5 h).** `git init`, Vite + TS, eslint sim-purity rule, GitHub Pages via Actions. `sim/terrain.ts` + `step.ts` with gait only. Three viewport: ribbon terrain, box rig, 6 stick legs sinusoidal, 3/4 chase cam. Live URL before anything else.

**M1 — Vertical slice (~4 h).** Ballast + second-order tilt, tilt needle, reserve gauge, one cargo item, spill, stall, arrival, result screen. Touch drag + keys. `bot.ts` + `scripts/validate.ts` minimal — required to tune. **Fun gate:** if ballast-vs-slope is not satisfying, stop and tune before anything else.

**M2 — Loop closure (~3.5 h).** Outposts + dispatch, loadout slots with trim readout + slope preview, strap, brace, 5 hazards, rush deadlines, RECOVER, reviews, cash, upgrades, save. Day-1 core loop ends here; may spill into day 2.

**M3 — Traces (~2 h).** Kits, deploy, `LocalTraceStore` + 25 seeded fakes, ♥ pings, wreckage from failed runs.

**M4 — Polish (~3 h).** Audio, camera shake, teleprinter typewriter, diegetic tutorial via HQ lines, leg IK polish, mobile layout pass, thumbnail, video, DEVLOG, `scripts/tune.ts` sweep + chart.

**Cut list** (from `HAULER_SPEC.md` §9) plus: ghost rendering, full spill-recovery sequence, `RemoteTraceStore` implementation (interface only; implement after M4 if time).

`DEVLOG.md` starts at M0 and is updated at each milestone: decided / AI built / problems solved.

---

## 7. Definition of done

Unchanged from `HAULER_SPEC.md` §9, plus:
- `vitest` determinism test passes (same seed + inputs → identical final state).
- `scripts/validate.ts` reports 100 % of shipped outposts solvable at 250 ms bot lag.
- Three viewport loads after panel paint; panel interactive < 1 s on a cold load.

## 8. Course mode (post-M2 pivot, PR #1)

Superseded by `2026-08-26-deadweight-ground-course-design.md`.
