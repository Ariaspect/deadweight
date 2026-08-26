# DEADWEIGHT — DEVLOG

## What I decided
- Operator framing: you never control the rig, only the panel.
- 50/50 reflex/planning: loadout slot positions shift neutral trim; dispatch shows the slope profile.
- Pressure reserve is the clock; rush cargo adds per-item deadlines.
- Second-order tilt (rig has angular momentum, overshoots).
- Fixed outpost map (12 permanent seeds) so traces accumulate per route.
- Three.js viewport behind a Renderer interface; panel is DOM.
- One-button RECOVER (8 s freeze) instead of a reverse-and-winch sequence.
- Gait changes are not instant: rig speed converges at gaitAccel/gaitDecel; hazard impulse scales by actual speed, so slowing down only helps if you actually slowed. RPM dial shows actual vs target.

## Pivot: porter obstacle course (PR #1, 2026-08-26)
- kheesu's branch replaces what the player plays: a hand-authored 3D yard (three routes, spinners, a hammer, a crusher, fans, a boulder, salvage caches, checkpoints) simulated by Rapier rigid bodies, camera-relative WASD drive + jump, per-bay ratchet straps, minimap/threat HUD.
- The deterministic 1-D sim, bot and validator are kept (and gained lateral steering, jumps, discoveries and four hazard types) but are no longer the player's path; dispatch/loadout/upgrade screens are currently bypassed (fixed loadout, straight to the yard).
- Merge-time fixes: touch D-pad (coarse pointers) so phones can drive; Rapier `World.free()` between runs; drive intent reported as gait so the RPM target tick still leads the needle; render-side interpolation between physics frames (snap on teleport); cargo-rack DOM rebuilt only on change.
- Costs accepted: +766 KB gzip (inlined WASM), no cross-platform replay determinism on the course path, gait rail repurposed as CARGO BAY. Open follow-ups: restore dispatch/upgrade loop around the course, move the physics literals into tuning.json, gate keyboard `R` like the panel button.
- **Ground course (PR #2)**: seeded corridor per outpost with forked lanes (spines, chicanes, mud, pockets), deterministic 2-D sim (AABB walls, W-at-gait throttle, jump, per-bay restraint, rockfall/crane windows), bot lane planner, fixed 3/4 camera + mouse ballast + touch D-pad, ash/rust palette; Rapier removed (-766 KB gzip).

## What AI built
- M0: seeded piecewise-linear terrain generator, fixed-step loop with input log, Three.js ribbon + procedural hexapod behind a Renderer interface.
- M1: headless PD bot with reaction lag; validator rejects unsolvable seeds; determinism/replay test suite; fun-gate metrics harness.
- M2: validator over 12 outposts × 2 loadouts × 3 lags:
```
outpost         tier lag  loadout  ended     stars  reserve
Gravel Hollow   0      0  crate    arrived   5      54
Gravel Hollow   0     15  crate    arrived   5      54
Gravel Hollow   0     30  crate    arrived   5      54
Gravel Hollow   0      0  stress   arrived   5      54
Gravel Hollow   0     15  stress   arrived   4      54
Gravel Hollow   0     30  stress   arrived   4      54
Wren Station    0      0  crate    arrived   5      53
Wren Station    0     15  crate    arrived   5      54
Wren Station    0     30  crate    arrived   5      54
Wren Station    0      0  stress   arrived   5      53
Wren Station    0     15  stress   arrived   3      54
Wren Station    0     30  stress   arrived   3      54
Sump Nine       0      0  crate    arrived   5      53
Sump Nine       0     15  crate    arrived   5      54
Sump Nine       0     30  crate    arrived   5      54
Sump Nine       0      0  stress   arrived   5      53
Sump Nine       0     15  stress   arrived   4      54
Sump Nine       0     30  stress   arrived   4      54
Tallow Ridge    1      0  crate    arrived   5      44
Tallow Ridge    1     15  crate    arrived   5      45
Tallow Ridge    1     30  crate    arrived   5      45
Tallow Ridge    1      0  stress   arrived   5      44
Tallow Ridge    1     15  stress   arrived   4      45
Tallow Ridge    1     30  stress   arrived   4      45
Kettle Pass     1      0  crate    arrived   5      47
Kettle Pass     1     15  crate    arrived   5      47
Kettle Pass     1     30  crate    arrived   5      48
Kettle Pass     1      0  stress   arrived   5      47
Kettle Pass     1     15  stress   arrived   4      47
Kettle Pass     1     30  stress   arrived   3      48
Marrow Flats    1      0  crate    arrived   5      51
Marrow Flats    1     15  crate    arrived   5      52
Marrow Flats    1     30  crate    arrived   5      53
Marrow Flats    1      0  stress   arrived   5      51
Marrow Flats    1     15  stress   arrived   4      52
Marrow Flats    1     30  stress   arrived   4      53
Halfmast        2      0  crate    arrived   5      50
Halfmast        2     15  crate    arrived   5      51
Halfmast        2     30  crate    arrived   4      47
Halfmast        2      0  stress   arrived   5      50
Halfmast        2     15  stress   arrived   3      51
Halfmast        2     30  stress   arrived   3      47
Brine Terrace   2      0  crate    arrived   5      47
Brine Terrace   2     15  crate    arrived   5      47
Brine Terrace   2     30  crate    arrived   5      47
Brine Terrace   2      0  stress   arrived   5      47
Brine Terrace   2     15  stress   arrived   4      47
Brine Terrace   2     30  stress   arrived   4      47
Old Signal      2      0  crate    arrived   5      46
Old Signal      2     15  crate    arrived   5      46
Old Signal      2     30  crate    arrived   5      46
Old Signal      2      0  stress   arrived   5      46
Old Signal      2     15  stress   arrived   4      46
Old Signal      2     30  stress   arrived   4      46
Cinder Stair    3      0  crate    arrived   5      36
Cinder Stair    3     15  crate    arrived   5      37
Cinder Stair    3     30  crate    arrived   5      37
Cinder Stair    3      0  stress   arrived   5      36
Cinder Stair    3     15  stress   arrived   3      37
Cinder Stair    3     30  stress   arrived   4      37
The Shelf       3      0  crate    arrived   5      49
The Shelf       3     15  crate    arrived   5      48
The Shelf       3     30  crate    arrived   5      47
The Shelf       3      0  stress   arrived   5      49
The Shelf       3     15  stress   arrived   4      48
The Shelf       3     30  stress   arrived   4      47
Lantern Reach   3      0  crate    arrived   5      43
Lantern Reach   3     15  crate    arrived   5      43
Lantern Reach   3     30  crate    arrived   4      44
Lantern Reach   3      0  stress   arrived   5      43
Lantern Reach   3     15  stress   arrived   3      43
Lantern Reach   3     30  stress   arrived   3      44
PASS: all 12 outposts solvable at lag 15
```
- M2: content — 20 cargo, 12 outposts, 5 hazards, 6 upgrades, 46 review lines, 20 HQ lines; dispatch/loadout/workshop screens with predicted-trim readout; bot v2 (gap bracing, strap, recover).
- Cosmetic instruments: RPM dial (actual + target marker), CARGO health bar, viewport HUD (slope°, altitude, km/h).

## Problems solved
- M1 fun gate (Task 17), headless metrics pass in place of human playtesting — 5/6 categories within target on the first constant change; full table in `.superpowers/sdd/2026-08-25-deadweight-core-loop/task-17-report.md`.
  - Fun-gate metric (e) misfired: a fore-slotted crate passively cancels a 0.35 slope, so the spiral never started. Re-measured with a mid-slot crate: onset→loss 3.8–6.1 s at driftThreshold 0.25 — kept the spec value.
  - Metric d (gait-4 risk on tier-0 routes, seeds [4417,1203,7781,1,2,3,4,5], slot 0/2, lag 15) stayed at 0.000 (target 0.2–0.6) and was **not** tuned — investigated and rejected. `terrain.slopeSigma[0]` is a dead lever here: routes are hard-clamped by `terrain.maxSlope` (0.5), which sits below the physical torque ceiling `kBallast/kSlope = 0.75` where ballast can always fully cancel slope, so risk stays 0 for any sigma. Raising `maxSlope` past 0.75 does introduce risk, but it lands on the *slower* gait first — a gait lingering longer on a locally un-holdable segment accumulates more tilt before reaching compensating terrain, so gait 2 blows past its ≤0.1 ceiling before gait 4 is even in the 0.2–0.6 band. That inverts the metric's intent (fast should be riskier, not safer). Root cause: `botPolicy` always previews terrain at the gait-2 lookahead distance regardless of the forced gait, and the bot sets ballast with no per-tick slew limit (`ballastRate` only gates the human keyboard path in `src/ui/input.ts`), so the bot is equally strong at any gait up to that torque ceiling. Fixing this needs a bot/step code change (gait-aware lookahead, or a ballast slew limit for the bot), not a single `tuning.json` constant — left for a follow-up task.
- Brace at speed 0 could never cross the hazard it braced for (bot deadlock): brace now creeps at braceSpeed.
- state.t freezes when a run ends, so the flow keeps its own linger counter and a finish-once guard (GameLoop keeps stepping inside one tick after stop()).
- "panel viewport panel" is not a valid CSS grid area (non-rectangular): landscape is two columns.
- Tilt dial danger zones were painted on the wrong hemisphere; conic-gradient stops recomputed from the needle sweep.
- Kettle Pass rolled 7 gaps on 700 m: gap weight 0.25 → 0.15; validator now 12/12 at 250 ms bot lag.
- Cold load: panel chunk 34.3 KB gzip 13.2 KB, Three chunk 529.7 KB gzip 133.7 KB; panel interactive < 1 s (~420–520 ms), viewport (Three chunk mounted) by ~1.2–1.35 s on a Fast-3G-equivalent profile (CDP `Network.emulateNetworkConditions`: 150 ms RTT, 1.6 Mbps↓ / 750 Kbps↑, cache disabled).
