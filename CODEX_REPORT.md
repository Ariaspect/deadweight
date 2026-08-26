# How Codex augmented DEADWEIGHT development

## Overview

Codex was used as an implementation partner for the pivot from DEADWEIGHT's original one-dimensional hauling simulation to the playable porter obstacle course merged in PR #1. Its role was not limited to generating isolated code snippets: it inspected the existing architecture, proposed and implemented changes across simulation, rendering, controls, UI, content, and tests, then repeatedly revised those changes in response to hands-on feedback.

The main Codex-authored result is commit [`27b9b8c`](https://github.com/Ariaspect/deadweight/commit/27b9b8c397c4e28ba55830d6fb46c0b692ddea0a), a 36-file change adding 1,607 lines and removing 637. That commit introduced the authored course, Rapier runtime, course renderer, camera-relative controls, cargo restraints, HUD, scenery, and regression tests while preserving the repository's deterministic simulation and validator.

## Development workflow

Codex began by reading the repository structure, tuning/content files, game flow, renderer boundary, simulation types, and tests. This mattered because the project already had useful systems that should not be discarded. The original deterministic simulation remained available for bot, replay, scoring, and solvability tests, while the new live course was isolated behind `PhysicsCourse`, `CourseFrame`, and the existing `Renderer` interface. Rapier and Three.js remained lazy-loaded so the panel could become interactive before the heavier game runtime.

The work was driven through short feedback loops rather than a single prompt. Reviewer feedback that the map was linear led to three explorable route families in `src/course/map.ts`. Feedback about the fixed camera produced mouse orbit, collision avoidance, zoom, and camera-relative movement in `ThreeRenderer`. Feedback that the carrier lacked identity produced the final human porter model in `CourseView`: an animated person physically holding a collidable cargo tray overhead. Feedback that the cargo-selection ceremony was premature led Codex to bypass dispatch, loadout, and upgrades so the prototype launches directly into the mechanic under evaluation.

This iterative use was particularly valuable because several early implementations were rejected by the user as technically changed but not meaningfully better. Codex treated that as design evidence, revisited the interaction model, and replaced tank steering and global cargo behavior instead of merely adjusting constants.

## Debugging and verification

Codex used the codebase and executable behavior to diagnose problems. For example, poor controls were traced to Rapier forces and torques persisting between ticks. The fix reset accumulators every step, replaced accumulating acceleration with bounded target-velocity control, and added focus-loss input reset. Headless scripts then simulated hundreds of physics ticks and printed position, speed, resets, cargo loss, and tether tension. Those measurements exposed a second issue—the corrected motor could not overcome static friction—which was subsequently retuned before browser-facing work continued.

Cargo was also tested as simulation rather than presentation alone. Loads became independent rigid bodies with spring/damper restraints and equal-and-opposite forces on the porter. Consequently, cargo mass and oscillation affect handling, and each load can loosen, take damage, or break free. Tests in `test/course.test.ts` lock in bounded acceleration, stopping, direct movement intent, finite cargo anchors/tension, independent bay ratcheting, recovery, and resource disposal. `test/movement.test.ts` covers acceleration/reversing, steering momentum, jumps, gap clearing, obstacle dodging, and discoveries.

Codex ran TypeScript, ESLint, Vitest, production builds, and local Vite serving throughout the work. The Codex commit finished with 121 passing tests; merge-time follow-up work expanded this to 127 tests, including frame interpolation and touch input. It also corrected the invalid `pnpm@^11.3.0` package-manager specification to the exact `pnpm@11.3.0` form required by the tooling.

## Collaboration and traceability

Codex prepared the feature branch, commit, validation summary, and pull-request handoff. Authentication remained under human control: when HTTPS credentials failed and the SSH key required a passphrase, Codex did not request or handle the secret and instead supplied the exact push command. The resulting branch was reviewed and merged as PR #1.

The merged result also demonstrates a useful boundary for AI-assisted work. Commit `042d640`, authored during merge review, added touch controls, explicit Rapier disposal, RPM intent reporting, frame interpolation, and a HUD performance optimization. Those fixes are recorded separately rather than attributed to Codex. `JOURNAL.md` similarly distinguishes authoritative Git events from reconstructed chat actions.

## Impact

Codex accelerated a cross-cutting prototype pivot while keeping it reviewable and test-backed. The strongest contribution was not raw code volume; it was the ability to connect qualitative feedback ("linear," "fixed," "boring," or "controls feel bad") to concrete architectural changes, exercise those changes through the actual toolchain, and preserve evidence in tests and commits. Human direction still determined the game's identity and accepted trade-offs, while Codex supplied rapid repository-aware implementation, diagnosis, and verification.
