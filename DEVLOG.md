# DEADWEIGHT — DEVLOG

## What I decided
- Operator framing: you never control the rig, only the panel.
- 50/50 reflex/planning: loadout slot positions shift neutral trim; dispatch shows the slope profile.
- Pressure reserve is the clock; rush cargo adds per-item deadlines.
- Second-order tilt (rig has angular momentum, overshoots).
- Fixed outpost map (12 permanent seeds) so traces accumulate per route.
- Three.js viewport behind a Renderer interface; panel is DOM.

## What AI built
- M0: seeded piecewise-linear terrain generator, fixed-step loop with input log, Three.js ribbon + procedural hexapod behind a Renderer interface.
- M1: headless PD bot with reaction lag; validator rejects unsolvable seeds; determinism/replay test suite; fun-gate metrics harness.

## Problems solved
- M1 fun gate (Task 17), headless metrics pass in place of human playtesting — 5/6 categories within target on the first constant change; full table in `.superpowers/sdd/2026-08-25-deadweight-core-loop/task-17-report.md`.
  - Fun-gate metric (e) misfired: a fore-slotted crate passively cancels a 0.35 slope, so the spiral never started. Re-measured with a mid-slot crate: onset→loss 3.8–6.1 s at driftThreshold 0.25 — kept the spec value.
  - Metric d (gait-4 risk on tier-0 routes, seeds [4417,1203,7781,1,2,3,4,5], slot 0/2, lag 15) stayed at 0.000 (target 0.2–0.6) and was **not** tuned — investigated and rejected. `terrain.slopeSigma[0]` is a dead lever here: routes are hard-clamped by `terrain.maxSlope` (0.5), which sits below the physical torque ceiling `kBallast/kSlope = 0.75` where ballast can always fully cancel slope, so risk stays 0 for any sigma. Raising `maxSlope` past 0.75 does introduce risk, but it lands on the *slower* gait first — a gait lingering longer on a locally un-holdable segment accumulates more tilt before reaching compensating terrain, so gait 2 blows past its ≤0.1 ceiling before gait 4 is even in the 0.2–0.6 band. That inverts the metric's intent (fast should be riskier, not safer). Root cause: `botPolicy` always previews terrain at the gait-2 lookahead distance regardless of the forced gait, and the bot sets ballast with no per-tick slew limit (`ballastRate` only gates the human keyboard path in `src/ui/input.ts`), so the bot is equally strong at any gait up to that torque ceiling. Fixing this needs a bot/step code change (gait-aware lookahead, or a ballast slew limit for the bot), not a single `tuning.json` constant — left for a follow-up task.
