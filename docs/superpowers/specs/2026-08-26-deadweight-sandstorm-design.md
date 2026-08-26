# DEADWEIGHT — Temporal Sandstorm and Radar Vision

**Date:** 2026-08-26
**Status:** design, awaiting review
**Branch:** `feat/storm-and-turret`
**Amends:** `2026-08-26-deadweight-ground-course-design.md`

## Goal

A sandstorm that arrives on a clock rather than at a place. It closes the world in, slows the
rig and works the restraints loose. The player answers with radar vision — a wireframe view
that restores sight at the cost of reserve.

The storm is the first of two threats on this branch. The automatic interceptor turret is a
separate design and a separate cycle; it will reuse whatever this establishes. Nothing here
should assume the turret exists.

## Non-goals

- No turret, no shield, no 360 contact model. Radar here restores *vision*; it does not
  report contacts.
- No change to how hazards, zones, forks or the route board work beyond one new stat cell.
- No post-processing pipeline. The radar look is a material swap.

## 1. Model

Storms are seeded content, so the schedule hangs off `RouteDef` beside the hazards:

```ts
export interface StormFront { id: number; startTick: number; endTick: number }
// RouteDef gains: storms: StormFront[]
```

Fronts are scheduled in **ticks, not metres**. That is what makes the storm temporal: drive
slowly and you eat more of it; sprint and you may outrun the second front.

### Intensity is derived, never stored

```
stormLevel(route, t, tuning) -> 0..1

  ramp in   [start - rampTicks, start)     0 -> 1
  full      [start, end]                   1
  ramp out  (end, end + rampTicks]         1 -> 0
  otherwise                                0
```

taking the maximum across fronts. `stepRig` writes the result to `s.storm` each tick, the
same way it already writes `s.trimTarget` — one number for the renderer and HUD to read
instead of three consumers recomputing it. Nothing new is serialized, and replay stays
deterministic because the level is a function of `t` alone.

`rampTicks` is 5 s at 60 Hz. The ramp is symmetric: the storm lifts as gradually as it lands.

### Generation

At `generateRoute` time, using the route's existing rng:

- `maxFronts[tier] = [0, 1, 1, 2]` — **tier 0 never storms**.
- Each potential front is kept with probability `frontChance[tier] = [0, 0.6, 0.75, 0.8]`.
- Onsets fall inside 15–85% of the route's *expected* duration,
  `length / (gaitSpeed[2] * gaitSpeedMul)` seconds converted to ticks, so a front cannot land
  in the opening seconds or after most players have finished.
- Durations are drawn from `[minDurationS, maxDurationS]`.
- Consecutive fronts are separated by at least `2 * rampTicks`, so two storms never merge into
  one unbroken wall.

### Forecast

The route card gains a `STORM RISK` cell, banded directly by the outpost's tier:

| tier | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| band | `NONE` | `LOW` | `MED` | `HIGH` |

The player learns that a route is *likely* to storm, never how many fronts or when they land.

`routeDifficulty` prices the **actual** seeded count, adding `storms.length * route.stormWeight`
to the score, so a route that really does carry two fronts pays for two. The displayed band and
the priced reality are deliberately different: the band is the forecast, the fee is the truth.
`stormWeight` joins the existing weights in `tuning.route`; `0.25` is the starting value, which
puts a two-front route about half a tier above an otherwise identical calm one.

## 2. Effects

All three scale by `L = s.storm`, so the 5 s countdown eases each one in.

| Effect | Rule | Constant |
|---|---|---|
| Speed | `target *= 1 - (1 - speedMul) * L` — the multiplier shape mud already uses | `speedMul: 0.7` |
| Restraint | every carried item loses `strapDrain * L * dt` | `strapDrain: 0.6` |
| Vision | render only, section 4 | — |

`speedMul` 0.7 is a 30% cut at full strength, milder than mud's 0.6, because the storm also
blinds you and works the straps loose. `strapDrain` 0.6/s sits between the `slosh` and
`livestock` rates already in `restraintDecay`; a 20 s front costs roughly 12 restraint —
worth ratcheting back, not fatal on its own.

## 3. Radar

A latching toggle: a `RADAR` button in the panel's button row beside BRACE, with a `Q` key
hint matching every other big button. `InputFrame` gains `radar: boolean`; `RigState` carries
it as `s.radar` the way it already carries `s.braced`.

Radar is **not storm-gated**. It engages any time, shows the wireframe view whenever it is
active, and draws `radarDrain` reserve per second for as long as it is on. There is no
auto-release — the `RADAR ACTIVE` readout on the HUD is the reminder that you are burning.

`radarDrain: 0.5`/s is the starting point. For scale, baseline drain on a 700 m route is about
0.62 reserve/s, so radar roughly doubles the burn while lit. A 25 s front costs about 12
reserve against the ~40 a clean run finishes with.

That number is a hypothesis, not a claim. The design target is that **neither branch
dominates**: paying for radar to hold your gait, and crawling through the fog for free, should
both be viable. Reserve drains per unit *time*, so crawling through a long front is not free
either — it may well cost more than the radar would have. Implementation measures both
branches across all 12 outposts before the constant is settled.

## 4. Render

### Storm, radar off

Fog near/far lerps `(60, 180) -> (10, 26)` by `L`, with fog and sky colour pulling toward sand
ochre. A few large semi-transparent scrolling planes cross the camera for grain, reusing the
dust material the gust hazard already owns. At full strength you can see roughly one
rig-length past the feet: enough to crawl at gait 1–2 and read a wall just before you reach
it.

### Radar on

Fog returns to full draw distance — that is the entire mitigation — and the scene re-materials:

- walls, baffles, rocks, ruins and hazards become wireframe.
  `MeshBasicMaterial({ wireframe: true })` binds to `InstancedMesh`, and the wall materials are
  already shared module singletons, so this is `mesh.material = RADAR_MAT[kind]` per mesh. No
  `EdgesGeometry`, no post-processing, nothing added to the Three chunk.
- the ground drops to flat near-black with the lane ruts faintly kept.
- the rig stays solid and lit, so the player keeps a sense of their own body.

`Renderer` gains `setRadar(on: boolean)`. Everything else stays inside `ThreeRenderer`.

## 5. HUD

- The existing threat banner runs the countdown: `SANDSTORM IN 5 … 1` through the ramp, then
  `SANDSTORM` with intensity while the front holds.
- `RADAR ACTIVE` sits beside it with its burn rate. It is tappable, so a touch device can
  toggle radar without reaching the panel button.
- The route card gains the `STORM RISK` cell alongside DIST / TIER / HAZARDS / ZONES.

## 6. Bot and the validator

One rule in `botPolicy`: `radar: s.storm > 0`. The bot has no vision to lose, so left alone it
would never buy radar and the validator would only ever prove the free branch. Switching it on
in a front means **every validator run pays full radar cost**, and 12/12 proves the expensive
branch is affordable. A human who chooses to crawl then has slack rather than a surprise.

This will eat margin the current `reserveBudget: 0.62` does not have. Implementation measures
the shortfall across all 12 outposts and raises the budget until validate passes with real
headroom — a measured step, not a guessed constant.

**If a seed turns out to be unclearable at lag 15, that is a signal the drain numbers are
wrong.** The response is to bring the numbers back for a decision, not to widen the budget
until the failure disappears.

## 7. Data and type changes

| Where | Change |
|---|---|
| `src/sim/types.ts` | `StormFront`; `RouteDef.storms`; `RigState.storm`, `RigState.radar`; `InputFrame.radar`; `StormTuning`; `Tuning.storm`, `Tuning.radarDrain` |
| `src/sim/storm.ts` (new) | `stormLevel`, `scheduleStorms` — pure, no transcendentals |
| `src/sim/terrain.ts` | calls `scheduleStorms`, puts the result on the route |
| `src/sim/step.ts` | writes `s.storm`, applies the speed and restraint effects, drains reserve for radar |
| `src/sim/bot.ts` | `radar: s.storm > 0` |
| `src/game/orders.ts` | `stormRisk(outpost, tuning)`; storm count in `routeDifficulty` |
| `src/ui/input.ts` | radar toggle key and state |
| `src/ui/panel/panel.ts` | `RADAR` button |
| `src/ui/hud.ts` | countdown, `SANDSTORM`, `RADAR ACTIVE` |
| `src/ui/screens/route.ts` | `STORM RISK` cell |
| `src/render/Renderer.ts` | `setRadar(on)` |
| `src/render/three/*` | storm fog and grain, radar materials |
| `src/content/tuning.json` | the `storm` block, `radarDrain`, and `route.stormWeight` |

The `storm` block:

```json
"storm": {
  "maxFronts": [0, 1, 1, 2],
  "frontChance": [0, 0.6, 0.75, 0.8],
  "minDurationS": 14, "maxDurationS": 28,
  "rampS": 5,
  "windowLo": 0.15, "windowHi": 0.85,
  "speedMul": 0.7, "strapDrain": 0.6
}
```

## 8. Testing

Sim work is test-first, as the ground course was.

- `stormLevel`: ramp in, full, ramp out, zero outside, maximum across overlapping fronts.
- `scheduleStorms`: deterministic for a seed; none at tier 0; onsets inside the window;
  fronts separated by at least `2 * rampTicks`.
- Effects scale with `L`: speed cut and restraint drain at half and full strength.
- Radar: drains reserve while on, not while off, and engages outside a storm too.
- Bot: radar on during a front, off outside one.
- The existing replay and determinism suites stay green — the new state is derived from `t`.
- `pnpm validate` 12/12 at lag 15 after the reserve budget is re-measured.

Render has no unit tests. It is covered by typecheck, lint, build, and a static preview page
rendered from the real markup and CSS, the way the route board was checked.

## 9. Risks

- **Reserve economy.** Three consumers now compete for one pool: distance, bracing and radar.
  The budget re-measurement is the riskiest step in the build and the most likely to send a
  number back for a decision.
- **Three penalties at once.** Slower, blind and losing strap may read as piling on. The ramp
  and the mild individual constants are the mitigation; if it still feels unfair in play, the
  strap drain is the first thing to cut.
- **Wireframe legibility.** A corridor of wireframe boxes may be harder to read than the fog
  it replaces. If so, the fallback is the false-colour treatment considered during design:
  same material-swap cost, no new machinery.
