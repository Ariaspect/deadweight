# DEADWEIGHT — Interceptor Turret, Threat Scope and Directional Shield

**Date:** 2026-08-26
**Status:** design, awaiting review
**Branch:** `feat/turret` (off `feat/storm-and-turret`)
**Amends:** `2026-08-26-deadweight-ground-course-design.md`

## Goal

Distant emplacements that lock on and fire a homing missile with a five-second flight. A 360°
threat scope tracks it in. The answer is a directional shield — and you cannot raise it while
moving, so the real decision is made early: brake now and lose the run's tempo, or gamble.

## Non-goals

- No line-of-sight or cover. Missiles home and cannot be dodged; the shield is the only answer.
  (Owner's choice, made knowingly — see Risks.)
- No keyboard bindings. The shield is aimed by pressing sectors on the scope, pointer only.
- No change to the storm, to radar vision, or to how hazards and zones work.

## 1. Threat model

### Emplacements

Seeded at generation like hazards, but placed *outside* the corridor so they read as distant
silhouettes rather than obstacles:

```ts
export interface Turret { id: number; x: number; z: number; rangeM: number; cooldownTicks: number; phase: number }
// RouteDef gains: turrets: Turret[]
```

A turret acquires while the rig is within `rangeM` along `x`, and fires on its cooldown offset by
`phase`. Turrets appear on the dispatch sketch and the scrolling minimap, and their count prices
into `routeDifficulty` the way storm fronts do.

### The missile

A homing entity stepped every tick, living on `RigState` beside `items`:

```ts
export interface Missile { id: number; x: number; z: number; launchTick: number; impactTick: number }
```

It closes on the rig's **current** position each tick, so the bearing shifts as you drive — which
is what gives the circling scan something to track. `flightTicks` is 300 (5 s at 60 Hz).

Unavoidable by design, because the counterplay is the shield alone.

### Danger level

Time to impact, not distance to the turret:

```
level = clamp(ceil(6 * elapsed / flightTicks), 1, 6)
```

Level 1 at launch, level 6 for the final ~0.83 s. With several missiles in flight the HUD reports
the highest level, while the scope shows each one at its own bearing.

Everything here is a pure function of tick and inputs, so replay determinism holds.

## 2. The shield

**You must already be stopped to raise it.** That is the whole mechanic: braking takes real time,
so the commitment happens early in the flight, not at the end of it.

| gait | speed | time to stop at `gaitDecel` 6 | must commit by |
|---|---|---|---|
| 2 | 7 m/s | 1.17 s | ~level 4 |
| 3 | 10 m/s | 1.67 s | ~level 3 |
| 4 | 14 m/s | 2.33 s | ~level 2 |

The faster you are running, the earlier you must give up the run. That puts the turret on the same
speed-versus-safety spine as the rest of the game.

| | |
|---|---|
| Precondition | `Math.abs(speed) < shieldStopEpsilon` (**0.05** m/s — the drive loop steps speed by `gaitDecel · dt` = 0.1 per tick, so an exact zero is not guaranteed to be hit) |
| Facing | the 45° sector pressed, fixed for the duration |
| Held | the rig stays stopped while the shield is up |
| Reserve | flat `shieldCost`, proposing **5** per deploy |
| Duration | `shieldTicks` **72** (1.2 s), longer than the level-6 window so a correct early press still covers impact |
| Cooldown | `shieldCooldown` **90** (1.5 s) after it drops |

A missile is **blocked** when the shield is up at its impact tick and its bearing falls inside the
faced arc. Otherwise it lands: tilt impulse **1.6** (heavier than a collapsed span's 1.4), strap
jolt **30**, and the cargo stress that follows. Survivable, punishing, not instant death.

The cooldown is the source of variation: two missiles arriving within 1.5 s of each other means you
eat one. The individual encounter has a single correct answer, so overlap is where difficulty lives.

## 3. The threat scope

**Two different radars now exist, and the names must stay apart.** The storm's `V` toggle is *radar
vision*, a rendering mode. This is the *threat scope*, a contact display. Separate systems, separate
names in code and UI.

The scope is **free and always live** while an emplacement is in range. Gating it behind the
reserve-draining vision mode would mean running low on reserve costs you the ability to aim, which
is a death spiral when the shield is the only counterplay.

It sits bottom-centre — large enough that all eight sectors are quick pointer targets inside the
level-6 window — and shows a sweep line rotating off the tick, missile blips at their true bearing
with radius set by danger level, the eight sectors as hit targets, and the current level as a number.
It appears on acquisition and fades when nothing is in flight.

### Pointer handling

The viewport's `pointerdown` currently starts the **ballast drag** unless the target is inside
`.dpad`. The scope needs the same exemption, or aiming the shield yanks the trim.

### Sector maths must avoid transcendentals

`src/sim/**` forbids `Math.atan2`, and the sim needs the sector to decide whether a missile was
blocked. So bearings are never computed as angles. The octant comes from comparisons alone: the
signs of `dx` and `dz`, plus tests against `|dz| < 0.4142·|dx|` and `|dz| > 2.4142·|dx|` — the
tangents of 22.5° and 67.5°. Pure, deterministic, testable in isolation.

The renderer may use `atan2` freely for the visual sweep; it lives outside `src/sim`.

## 4. Bot and the validator

The largest single risk in the feature. The bot needs three behaviours:

1. Notice a launch.
2. Estimate its own stopping time from current speed and brake early enough to be stopped by impact.
3. Deploy into the correct sector.

`BotView` gains the in-flight missiles. The braking decision is the same judgement the player makes,
which is the point — the bot is the reference player, and `pnpm validate` at 12/12 is what proves the
mechanic is survivable at all.

## 5. Reserve

This is the **fourth** draw on a pool that is already tight: distance, bracing, radar vision, and now
the shield. The storm pushed the worst shipped case (Cinder Stair) from 43 reserve down to 19.

Stopping costs twice — the shield's flat 5, plus the run getting longer while you sit still, because
reserve drains per unit time.

Implementation measures the real cost across all 12 outposts **with a no-turret control run**, so
turret-caused failures are separated from pre-existing ones. The storm work proved this matters: a
first pass there looked like a two-front problem until the control showed 17 of 600 procedural
tier-3 routes strand with no weather at all. Without the control, tuning chases a false cause.

**If a seed proves unclearable, that comes back to the owner as a decision** — not absorbed by
widening `reserveBudget` until the failure disappears.

## 6. Constants

All of these live in `src/content/tuning.json`; none are hard-coded in `step.ts`. Every value is a
starting hypothesis to be measured, not a settled number.

```json
"turret": {
  "countByTier": [0, 0, 1, 2],
  "rangeM": 260,
  "cooldownTicks": 900,
  "offCorridorZ": 70,
  "flightTicks": 300,
  "levels": 6,
  "impulse": 1.6,
  "strapJolt": 30,
  "shieldCost": 5,
  "shieldTicks": 72,
  "shieldCooldown": 90,
  "shieldStopEpsilon": 0.05
}
```

`tuning.route.turretWeight` (**0.3** to start) joins the existing route weights so an emplacement
prices into `routeDifficulty` the way a storm front does. Tier 0 and 1 carry no turrets, so the
threat arrives with the same rank progression as the storm.

## 7. Testing

Sim work is test-first.

- Octant selection across all eight arcs and both boundary tangents.
- Missile homing and impact-tick determinism.
- The six danger bands, including the level-1 and level-6 edges.
- Shield: refuses to deploy while moving; blocks inside the faced arc; fails outside it; respects
  cooldown; costs reserve once per deploy.
- Turret acquisition by range and firing cadence by cooldown and phase.
- Bot: brakes early enough from each gait, and deploys into the right sector.
- Replay determinism holds with missiles in flight.
- `pnpm validate` 12/12 at lag 15 after the reserve measurement.

The scope has no unit tests — typecheck, lint, build, and a static preview page rendered from the
real markup and CSS, as the route board and manifest were checked.

## 8. Risks

- **Every encounter has one correct answer.** A homing missile with no cover means: watch the level,
  brake, press the sector. Variation comes only from firing frequency and overlap. Flagged during
  design and accepted; if it reads as flat in play, cover is the lever that adds decisions.
- **Reserve.** Four sinks on one pool, and this one lands at the worst moment. The likeliest outcome
  of the measurement step is a number coming back for a decision.
- **Bot braking is the hard part.** If the bot cannot judge its stopping time, validate fails and the
  feature cannot ship regardless of how it feels to a human.
- **Scope reachability.** Eight sectors inside 0.83 s is tight for a pointer. If the level-6 window
  proves too short in play, the lever is widening it rather than shrinking the sectors.
