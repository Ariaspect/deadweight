# DEADWEIGHT — Ground Course Design (merge of the M2 loop and the PR #1 course)

Date: 2026-08-26. Supersedes spec §8 of `2026-08-25-deadweight-design.md` (course mode). §1–§7 of that spec stay binding except where amended here.

## 0. Decisions locked (this session)

| # | Decision | Ruling |
|---|----------|--------|
| 1 | Loop × course | Seeded ground course per outpost; dispatch → loadout → haul → result → upgrade wraps it |
| 2 | Camera | Fixed 3/4 chase, never rotates; world-locked WASD; mouse drag on viewport = ballast |
| 3 | Throttle | W drives at the selected gait (0–4); S reverses at gait-1 speed; release coasts to stop |
| 4 | Avatar | Six-legged walker (MULE-7), rusted post-apocalypse skin |
| 5 | Hazards | Static ruins + two slow movers (rockfall, crane); Fall-Guys machinery removed |
| 6 | Topology | One corridor; forks of 2–3 lanes split by wall/rock/ruin spines that rejoin; salvage in dead-end pockets |
| 7 | Physics | Deterministic 2-D sim in `src/sim`; Rapier and `src/course/` retired |

Kept from PR #1: WASD + jump input model, per-bay restraint, HUD layout (minimap, threat banner, cargo rack), panel/screen skin, seeded hazard visuals, scenery pattern, touch D-pad.

## 1. Route generator (`src/sim/terrain.ts`)

- **Corridor** along +x, `length = outpost.lengthM`. Height is x-only (existing slope segments; `grade` unchanged). The centre line wanders gently (`pathWander`, kept); walls follow it. Half-width `corridorHalfWidth` = 18 m. Corridor edges are walls.
- **Sections** alternate along x: `stretch` (single lane, `stretchLen` 40–70 m, at most one inline hazard) and `fork` (`forkLen` 80–120 m, 2–3 lanes separated by **spines** — `Wall` rects `spineThick` 2.5 m thick running the fork length, open at both ends so lanes rejoin). Safe zones: first 40 m and last 20 m contain no forks or hazards.
- **Lane archetypes** per fork, seeded: `direct` (straight; carries the fork's impulse hazard), `chicane` (2–3 `baffle` walls jut alternately from the spines; slower, safe), `mud` (a `mud` zone covers most of the lane; slower, safe). Tier 0–1 forks have 2 lanes, tier 2–3 have 3. Every fork has at least one lane with no impulse hazard (generator invariant, tested); overall solvability is still the validator's job.
- **Pockets**: 1–2 dead-end alcoves per route, cut into an edge wall next to a lane, `pocketDepth` 8 m deep; a salvage discovery sits inside. Impassable geometry is one primitive: `Wall { x0, x1, z0, z1, kind: 'wall' | 'rock' | 'ruin' | 'baffle' }`. Passable ⇔ `|z − centre| ≤ corridorHalfWidth + pocketDepth` and not inside any wall.
- **Hazards** (`HazardType`): `gust rubble gap grade scree` kept; `mud` added (static zone, speed ×`mudSpeedMul`, no impulse); movers `rockfall` (zone across one lane; `cycleTicks` 360, `windowTicks` 72) and `crane` (swaying load over one lane; `cycleTicks` 240, `windowTicks` 48; hit also shoves laterally). `hammer crusher fan launchpad` removed from content and types. Every hazard carries `z` (lane centre) and `halfW` (lane half-width); zone hazards also carry `x1`, `cycleTicks`, `windowTicks`, `phase`.
- **Discoveries**: `2 + min(2, tier)` per route; pocket caches first, the rest off-lane near an edge in a stretch.
- **RouteDef** gains `walls: Wall[]`, `forks: Fork[]` (`{ x0, x1, lanes: { z0, z1, archetype }[] }`), `zones` (mud/rockfall/crane rects), `passable(x, z)`, `laneAt(x, z)` (fork lane index or −1). `Trace` gains `z`.
- **Dispatch sketch**: `routeSketchSvg(route)` (pure, `src/ui/sketch.ts`) draws the corridor, spines, pockets and a glyph per hazard type per lane. Replaces the slope profile; the slope profile is still drawn as a thin strip under it.

## 2. Simulation (`src/sim/step.ts`)

- **Drive**: `throttle` 1 → `targetSpeed = gaitSpeed[gait]·gaitSpeedMul`; −1 → `−gaitSpeed[1]·gaitSpeedMul`; 0 → 0. Braced caps `|target|` at `braceSpeed`. Speed ramps at `gaitAccel`/`gaitDecel`. `RigState.targetSpeed` is written every tick (panel RPM tick). Gait 0 = parked regardless of W.
- **Steer**: `lateralVel += steer·steerAccel·traction·dt`, damped by `lateralDamping` (less when steering). Traction: 1 grounded, `airTraction` 0.28 airborne, `mudTraction` 0.6 in mud. The rig always faces +x.
- **Walls**: rig is a circle of `rigRadius` 1.6 m. Each tick, for every wall whose x-range overlaps `[x − r, x + r]`: find the nearest point of the rect to (x, z); if closer than r, push out along that face and zero the velocity component into it (no bounce). If the killed component exceeded `wallStrikeSpeed` 4 m/s it is a *wall strike*: `tiltVel += sign·wallStrikeTilt·(v/vmax)`, all restraints −`wallStrikeJolt`. Corridor bound: `|z − centre|` clamped to `corridorHalfWidth + pocketDepth` as a final guard.
- **Jump** (`input.jump`, grounded only): `liftVel = jumpSpeed`, gravity `gravity`; landing adds `tiltVel += |speed|·landingTilt` and restraints −`landingJolt`. Airborne rigs clear `gap` (lift > 0.55) and `rubble` (lift > 0.8) at crossing.
- **Tilt/ballast**: unchanged second-order model; `− lateralVel·lateralTip` term kept (constant moves to tuning).
- **Restraint per bay**: `ItemState.restraint` (0–100, starts `strapStart`) replaces the global strap. `input.strap` ratchets the selected bay by `strapTap`; hazard/wall/landing jolts loosen every bay; `restraintDecay[behavior]` per second (static 0, precarious 0.4, slosh 0.8, livestock 1.0). Drift `loose = 1 − restraint/100` and crush `restraint > crushLimit` are per item. `RigState.selectedSlot` set by `input.cargoSelect` (a slot index; ignored if no item there); `RigState.strap` is derived each tick = selected item's restraint (0 if lost) for panel/bot/HUD.
- **Point hazards** (`rubble scree gap gust`): crossed once when `h.x ≤ s.x` (cursor), lane test `|s.z − h.z| < h.halfW` (gust ignores the lane), lift test for gap/rubble, `braced` or a plank trace at (x, z) cancels the impulse, impulse scaled by `hazardScale(speed)`.
- **Zone hazards** (`mud rockfall crane`): tested every tick by rect containment. `mud` only sets the traction/speed multiplier. Movers are *active* when `(t + phase) % cycleTicks < windowTicks`; a hit applies `impulse·hazardScale` + strap jolt (+ `craneShove` to `lateralVel` for crane) and starts `hazardCooldownTicks` 60 on that hazard (`RigState.zoneCooldown: Record<id, tick>`); braced → strap jolt only.
- **Discoveries, spill, recover, score**: unchanged from M2 (`RECOVER` = 8 s freeze, restores one item). No checkpoints, nothing to fall into.
- **Determinism**: sim purity rule unchanged; mover phases use integer modulo only. Replay test extended to a forked route with jumps and strikes.
- `InputFrame`: `{ gait, ballast, strap, brace, deploy, recover, throttle, steer, jump, cargoSelect }` — `moveX/moveZ` removed.
- Tuning keys added: `corridorHalfWidth, pocketDepth, spineThick, forkLenMin/Max, stretchLenMin/Max, rigRadius, wallStrikeSpeed, wallStrikeTilt, wallStrikeJolt, airTraction, mudTraction, mudSpeedMul, landingTilt, landingJolt, lateralTip, craneShove, hazardCooldownTicks, restraintDecay`. Removed: `courseHalfWidth`, the PR #1 course-only keys that no longer apply.

## 3. Input, camera, panel, HUD, screens

- **Keys**: W/S throttle · A/D steer · Space jump · Shift brace · F ratchet · R recover · Q/E ballast nudge · 0–4 gait · 5/6/7 select bay, Tab cycles · P plank (M3). Window blur resets input.
- **Mouse**: horizontal drag on the viewport = ballast (M2 handlers, pointer-captured, 60 % of viewport width = full range). No orbit, wheel ignored.
- **Touch**: D-pad drives (each button captures its own pointer); a drag anywhere else on the viewport is ballast; panel buttons; gait rail; cargo-rack taps select the bay.
- **Camera** (`ThreeRenderer.draw`): position `(x − 10.5, y + lift + 7.2, z + 10.5)`, target `(x + 5.5 + speed·0.3, y + lift + 1.35, z)`, lerp 0.12, FOV 50 fixed, shake when `|tilt| > 0.65`. The camera never rotates.
- **Panel**: rail = GAIT 0–4; buttons JUMP · RATCHET · BRACE · RECOVER with key hints; gauges RESERVE · RESTRAINT (selected bay) · CARGO · BALLAST; dials TILT + RPM (target from `targetSpeed`). Hazard lamp: next hazard in the current lane within its `telegraphM`. Teleprinter event lines: `ROCKFALL — LEFT LANE`, `CACHE: <name> +8 RESERVE`, `WALL STRIKE`, `BAY n RATCHETED nn %`.
- **HUD**: `N m TO DROP` + progress bar; minimap = scrolling window of ±120 m around the rig (spines, pockets, hazard glyphs, salvage, rig); threat banner for the next hazard in the current lane (`OBSTACLE AHEAD` / `IMPACT IMMINENT`); cargo rack with restraint bar + condition, selected bay highlighted, tappable; bottom SLOPE · ALT · km/h (+ AIR). Drive help hidden on coarse pointers.
- **Flow**: dispatch → loadout → haul → result → upgrade → dispatch, M2 structure with the PR #1 screen skin. Dispatch = route sketch + offers + capacity; loadout = FORE/MID/AFT + predicted trim; result = payout + reserve bonus + salvage + time; upgrades unchanged. `bestByOutpost[outpost.id]`. `LINGER` and the `finished` guard as M2. The renderer receives the route and loadout once per haul.

## 4. Render and aesthetic (`src/render/three/`)

- **Palette**: sky/fog ash `#b9b0a3` (fog 60→180 m), ground cracked earth `#5a544b`/`#6b6157` with darker ruts in lanes, concrete `#7a7570`, rock `#4f4a44`, rust `#6e4a34`, salvage amber `#d29a4a` (no teal, no beams), warning red `#8f2f22` only on the crane. Low warm sun `#e8c39a` with long shadows; hemisphere `#c9bfae` / `#3e3a35`. Tone mapping and shadow setup from PR #1 kept; shadow map 1024 when `innerWidth < 900`.
- **Ground**: ribbon width `2·(corridorHalfWidth + pocketDepth) + 24`, x-only height, vertex noise, flattened lanes; outside the walls: rubble scatter and far ruin silhouettes (broken building blocks and husks replace the cone mountains).
- **Walls** from `route.walls`, one `InstancedMesh` per kind: `wall` concrete slabs with rebar line segments, `rock` icosahedron clusters, `ruin` stacked broken boxes with rust, `baffle` low jersey barriers. Seeded jitter per instance.
- **Hazards**: rubble = seeded rock scatter; scree = stone patch on darker ground; gap = trench slab with rebar ends; gust = dust planes + leaning dead trees; grade = nothing extra; mud = dark low-roughness patch; rockfall = boulders that roll across the lane during the window (animated from `t` with the sim's phase formula) and a scree source on the wall; crane = gantry over the lane with a load swinging on a cable (angle from `t`).
- **Salvage**: PR #1 sites recoloured (crate, mast, barrels/dish), amber flare instead of the teal beam.
- **Rig**: `rig.ts` hexapod with patched plating (extra small rust boxes), one working headlamp (emissive cone), tray + `CargoView` (items at slot + offset), strafe lean, lift, IK legs to `heightAt`. Spill debris kept.
- **Retired**: `src/course/*`, `CourseView.ts`, `@dimforge/rapier3d-compat`, `courseControlAxes`, `setCourse/drawCourse`. `RenderPrev { x, z, lift, lateralVel, tilt, speed }` interpolation stays. Bundle target: no chunk above the Three chunk (~150 KB gzip).

## 5. Bot, validator, tests

- **Bot** (`src/sim/bot.ts`): `throttle = 1`, never jumps (solvability must not depend on jumping). Lane planner: for the next fork within 60 m score each lane = Σ impulse of hazards in it (movers ×1.5) + `baffles·0.8` + `mud ? 0.6 : 0` (the bot holds lane centres and cannot weave, so chicanes rank last); pick the minimum (ties → nearest lane); steer toward the lane centre with a ±0.35 m deadband, otherwise toward the corridor centre. Gait 3 cruise, 2 within `braceAheadM` of any impulse hazard in its lane, 1 through rubble/scree. Brace within `braceAheadM` of a gap/rockfall/crane in its lane. Ratchet the loosest bay below `strapBelow` (select, then tap). Recover when an item is lost.
- **Validator** (`scripts/validate.ts`): unchanged matrix (12 outposts × {crate, stress} × lags 0/15/30); fails CI if any outpost is unsolvable at lag 15 with the crate loadout. Also asserts the generator invariant (every fork has a hazard-free lane) for all 12 seeds.
- **Tests** (vitest, replacing `course.test.ts`): terrain — forks rejoin, each fork has a safe lane, lanes and pockets are passable and reachable, walls never intersect a lane's centre line, determinism; step — wall push-out and strike, mud slows, per-bay restraint and decay, mover window/cooldown, braced mover = jolt only, jump clears a gap, landing cost, throttle/gait targets and `targetSpeed`; bot — picks the safe lane on a fixture, arrives on every outpost at lag 15; input — keys, drag ballast, D-pad, bay select; sketch/minimap pure functions; replay determinism on a forked route; score unchanged.

## 6. Milestones, cuts, definition of done

- **G1 — headless**: types, tuning, generator, sim, bot, validator, tests. CI green with the 3-D layer untouched (old draw path still compiles).
- **G2 — world**: ground, walls, hazards, rig skin, salvage, camera, input/camera restored, D-pad + ballast drag.
- **G3 — loop**: panel, HUD, screens, flow rewired; Rapier and `src/course/` removed; DEVLOG + spec pointers; live.
- **Cuts if short on time** (in order): crane mover → chicane baffles (keep spines) → pockets (salvage off-lane instead) → scrolling minimap (static whole-route).
- **Done when**: CI green; validator 12/12; on a phone you can drive, drag ballast, ratchet and recover; no Rapier chunk in `dist/`; the dispatch sketch matches the course you then drive.
