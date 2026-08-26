# DEADWEIGHT development journal

This is the chronological project record. The canonical commit entries use their embedded Asia/Tokyo timestamps (`UTC+09:00`). A UTC cross-date section is included where GitHub groups the same work under the previous calendar day.

Entries under **Git record** are authoritative: the time, short hash, and subject are taken directly from the repository. Entries under **Chat reconstruction** preserve the order of work from the available conversation; individual chat-message timestamps were not retained, so none are invented. A commit subject records the action claimed by its author and links the entry to the exact diff.

## 2026-08-24 — Repository foundation (GitHub UTC date)

GitHub's API places the first 21 commits on August 24 UTC. Their embedded timestamps use `+09:00`, where they fall between 02:34 and 04:05 on August 25; that is why they also appear in the canonical local-time section below. All 21 were authored by **Ariaspect**.

### Git record (UTC)

- 17:34:35Z — `6e7a4e3` — **Ariaspect** — `docs: DEADWEIGHT design spec from brainstorm`
- 18:03:45Z — `895c496` — **Ariaspect** — `docs: M0–M2 implementation plan; spec amendments (reserve scaling, brace creep)`
- 18:06:15Z — `b1a9acd` — **Ariaspect** — `chore: ignore .superpowers scratch`
- 18:10:42Z — `3905e78` — **Ariaspect** — `chore: scaffold Vite+TS, sim-purity lint rule, Pages workflow`
- 18:19:32Z — `63819ee` — **Ariaspect** — `fix: sim-purity glob patterns must cross directory boundaries`
- 18:21:15Z — `ab7cd06` — **Ariaspect** — `docs(plan): eslint sim-purity globs must cross directories`
- 18:22:48Z — `5b90e45` — **Ariaspect** — `feat(sim): mulberry32 rng, gaussian, hashSeed`
- 18:23:48Z — `c99e7bb` — **Ariaspect** — `feat(sim): types and tuning.json`
- 18:29:11Z — `f7ebf1a` — **Ariaspect** — `feat(sim): seeded piecewise-linear terrain with hazard placement`
- 18:29:55Z — `d069c9d` — **Ariaspect** — `feat(sim): step v0 — gait movement, reserve drain, arrival/stall`
- 18:32:09Z — `d43f34f` — **Ariaspect** — `feat(game): fixed-step loop with input log and frame clamp`
- 18:34:22Z — `bc7c2d4` — **Ariaspect** — `feat(render): Three.js ribbon terrain, six-legged rig, 3/4 chase camera`
- 18:36:31Z — `151a7d0` — **Ariaspect** — `docs(plan): createRun rush presence check`
- 18:37:14Z — `f997d16` — **Ariaspect** — `fix(sim): deadlineTick must check rush presence, not truthiness`
- 18:44:11Z — `5f145d9` — **Ariaspect** — `docs(plan): rig pitch sign, renderer resource disposal`
- 18:45:09Z — `391d3ab` — **Ariaspect** — `fix(render): correct pitch sign, dispose terrain material and rig resources`
- 18:55:20Z — `f38528a` — **Ariaspect** — `feat: M0 — seeded route, walking rig, live viewport`
- 18:56:55Z — `b5f25cf` — **Ariaspect** — `docs: devlog M0`
- 19:00:50Z — `e59864a` — **Ariaspect** — `feat(sim): second-order tilt — slope, ballast, load, damping, stiffness`
- 19:05:15Z — `c114989` — **Ariaspect** — `docs: landscape layout is two columns (grid areas must be rectangular)`
- 19:05:39Z — `925cd6f` — **Ariaspect** — `feat(sim): cargo drift by behavior, stress, spill with relief`

### Day outcome

- Ariaspect created the design and implementation plan, scaffolded the project, and established the deterministic simulation, seeded terrain, fixed-step loop, Three.js viewport, walking rig, and initial cargo/tilt systems.
- The work reached the M0 milestone before the end of the UTC day.

## 2026-08-25 — Original design, simulation, and M0–M2 loop

### Git record

- 02:34:35 — `6e7a4e3` — `docs: DEADWEIGHT design spec from brainstorm`
- 03:03:45 — `895c496` — `docs: M0–M2 implementation plan; spec amendments (reserve scaling, brace creep)`
- 03:06:15 — `b1a9acd` — `chore: ignore .superpowers scratch`
- 03:10:42 — `3905e78` — `chore: scaffold Vite+TS, sim-purity lint rule, Pages workflow`
- 03:19:32 — `63819ee` — `fix: sim-purity glob patterns must cross directory boundaries`
- 03:21:15 — `ab7cd06` — `docs(plan): eslint sim-purity globs must cross directories`
- 03:22:48 — `5b90e45` — `feat(sim): mulberry32 rng, gaussian, hashSeed`
- 03:23:48 — `c99e7bb` — `feat(sim): types and tuning.json`
- 03:29:11 — `f7ebf1a` — `feat(sim): seeded piecewise-linear terrain with hazard placement`
- 03:29:55 — `d069c9d` — `feat(sim): step v0 — gait movement, reserve drain, arrival/stall`
- 03:32:09 — `d43f34f` — `feat(game): fixed-step loop with input log and frame clamp`
- 03:34:22 — `bc7c2d4` — `feat(render): Three.js ribbon terrain, six-legged rig, 3/4 chase camera`
- 03:36:31 — `151a7d0` — `docs(plan): createRun rush presence check`
- 03:37:14 — `f997d16` — `fix(sim): deadlineTick must check rush presence, not truthiness`
- 03:44:11 — `5f145d9` — `docs(plan): rig pitch sign, renderer resource disposal`
- 03:45:09 — `391d3ab` — `fix(render): correct pitch sign, dispose terrain material and rig resources`
- 03:55:20 — `f38528a` — `feat: M0 — seeded route, walking rig, live viewport`
- 03:56:55 — `b5f25cf` — `docs: devlog M0`
- 04:00:50 — `e59864a` — `feat(sim): second-order tilt — slope, ballast, load, damping, stiffness`
- 04:05:15 — `c114989` — `docs: landscape layout is two columns (grid areas must be rectangular)`
- 04:05:39 — `925cd6f` — `feat(sim): cargo drift by behavior, stress, spill with relief`
- 14:26:41 — `55bae2a` — `feat(sim): evaluate — stars, payout, bonus`
- 14:28:04 — `a05b8ba` — `fix(ui): landscape grid-template-areas must be a rectangle`
- 14:28:18 — `80c40d3` — `docs(plan): precarious drift test below offset clamp`
- 14:28:43 — `67dce6e` — `test(sim): precarious drift test stays below offset clamp`
- 14:31:37 — `6de1d7b` — `feat(sim): lagged PD bot and headless solvability validator`
- 14:33:54 — `6f598a1` — `test(sim): determinism and input-log replay`
- 14:34:43 — `8276acb` — `feat(ui): input controller — drag ballast, keyboard, one-shot taps`
- 14:39:17 — `4616dd6` — `feat(ui): panel — tilt dial, reserve/ballast bars, gait rail, button row`
- 14:45:52 — `9acf6e2` — `docs(plan): tilt dial danger zones on the needle's side`
- 14:47:09 — `a65826c` — `fix(ui): tilt dial danger zones on the needle's side`
- 14:47:45 — `9d2b125` — `feat: M1 slice — cargo on rig, spill debris, haul→result loop`
- 14:56:39 — `64302f8` — `docs(plan): finish-once guard in flow; cargo GPU resource disposal`
- 15:01:41 — `a43bc7c` — `fix: finish run exactly once; dispose cargo/debris GPU resources`
- 15:02:14 — `699e3ad` — `tune: M1 fun-gate pass on tilt/ballast constants`
- 15:04:08 — `6374b29` — `chore: exclude .superpowers/ workspace scratch scripts from eslint`
- 15:05:32 — `37d5f85` — `content: 20 cargo, 12 outposts, 5 hazards, 6 upgrades, reviews, HQ lines`
- 15:07:27 — `3b132d3` — `tune: keep driftThreshold 0.25 (fun-gate metric e scenario was flawed)`
- 15:11:45 — `910fbc9` — `feat: upgrades as tuning overrides; versioned localStorage save`
- 15:12:23 — `eeb8321` — `feat(sim): strap, brace (creep), hazard crossing, RECOVER, auto-trim`
- 15:17:11 — `a03c2fa` — `docs(plan): RECOVER requires reserve above recoverCost`
- 15:29:04 — `0ef5b6e` — `feat(sim): bot braces/straps/recovers; validator covers all 12 outposts`
- 15:34:46 — `ebcb797` — `feat(game): orders, review/HQ pickers, full flow state machine`
- 15:38:41 — `8dc6361` — `feat(ui): dispatch, loadout, and workshop screens with slope profile`
- 15:40:32 — `88cf8a0` — `docs(plan): bot braces for gaps only; scree counter text`
- 15:42:02 — `a9b583b` — `test(sim): lock in gap-only bracing; scree counter text matches bot`
- 15:51:01 — `f50fafe` — `feat: panel v2 controls, hazard lamp, rush timer; hazard meshes and gap trench`
- 15:52:30 — `861d9e7` — `docs(plan): Task 25 fixes stacked-gauge overlap`
- 16:06:18 — `a0082b4` — `feat: M2 — core loop closed; mobile layout pass; devlog`
- 16:24:01 — `a822258` — `docs(spec): M2 arrival beat, HQ contexts, shipped content counts`
- 16:27:28 — `6e0817e` — `fix: input reset + upgraded tuning per haul; spilled window keeps time; save guard`
- 18:24:59 — `312569c` — `feat: physical gait convergence; RPM + cargo gauges; viewport HUD`
- 18:36:21 — `b67d558` — `fix(ui): tilt needle stays visible inside the red zone`

### Day outcome

- Established the Vite/TypeScript/Three.js project, deterministic simulation boundary, seeded terrain, fixed-step game loop, procedural rig, and chase camera.
- Implemented tilt, ballast, cargo drift/stress/spills, scoring, reserve, hazards, recovery, upgrades, save data, content, bot policy, replay tests, and solvability validation.
- Closed the M0, M1, and M2 milestones with the dispatch → loadout → haul → result → workshop loop and its supporting HUD/panel UI.
- Recorded design decisions, implementation plans, fun-gate findings, and validator results in the design spec, plan, and `DEVLOG.md`.

## 2026-08-26 — Porter obstacle-course pivot and ground-course planning

### Chat reconstruction before the pivot commit

The following sequence is reconstructed from the available chat history. It culminated in commit `27b9b8c` at 01:16:55.

1. The repository was inspected and the game was asked to become a more elaborate, professionally presented, YouTube-style “ragebait” obstacle game.
2. Testing instructions were supplied. The invalid package-manager range `pnpm@^11.3.0` was corrected to the exact `pnpm@11.3.0` form expected by the tooling.
3. Held WASD movement and jumping were introduced. The live game moved from the generated one-dimensional route toward a rigid-body obstacle course.
4. A hand-authored, explorable three-route yard was added: central service machinery, north fan canyon, south quarry, salvage, checkpoints, and a shared summit gauntlet.
5. The fixed camera was replaced with a mouse-orbiting collision-aware camera with zoom and speed-sensitive FOV. The HUD gained a course minimap and route information.
6. Rapier was integrated for the live course while the deterministic simulation, bot, and validator were retained for tests and legacy behavior.
7. A broken-control investigation found forces and torques persisting across Rapier ticks. Forces were reset each step, motor force was retuned against chassis friction, speeds were bounded, focus loss began clearing held keys, and spill recovery was restored.
8. Headless handling checks were run repeatedly to measure position, speed, resets, cargo loss, and tether tension under sustained and changing input.
9. Controls were then changed from tank-like steering to camera-relative directional intent. Automatic camera recentering that fought the player was removed.
10. Cargo became independently simulated per bay with spring/damper tether forces, equal-and-opposite reactions on the carrier, individual restraint decay, selection, ratcheting, tension, damage, and breakaway state. The HUD and panel exposed the active bay and per-load state.
11. The pre-run dispatch, cargo marketplace, loadout assignment, and upgrade ceremony were bypassed. The game began directly with a fixed three-item test manifest and “Run Again” returned directly to gameplay.
12. The mechanical crawler visual was replaced by a stylized human porter holding a real collidable cargo tray overhead. Animated legs, torso, raised arms, hands, harness, and tray sway were added; cargo anchors and camera framing were raised accordingly.
13. Regression coverage was expanded for authored routes, rigid-body movement, bounded controls, direct movement intent, cargo anchors/tension, per-bay ratcheting, and input behavior. The final pre-commit validation reported 121 passing tests, successful TypeScript and ESLint checks, and a successful production build.
14. A feature branch named `feat/porter-obstacle-course` was created and committed. HTTPS push failed because the stored GitHub token was invalid; the remote was switched to SSH, and the user completed the push/PR workflow with their own SSH authentication.

### Git record

- 01:16:55 — `27b9b8c` — `feat: overhaul game as porter obstacle course`
  - Added the Rapier course runtime, authored course/map types, course view, scenery, expanded hazards, camera-relative movement, course HUD, per-bay cargo restraints, fixed direct-to-course flow, porter visual, and new movement/course tests.
  - Commit diff: 36 files changed, 1,607 insertions, 637 deletions.
- 13:34:54 — `042d640` — `fix(course): touch D-pad, free Rapier world between runs, RPM target, frame interpolation`
  - Added coarse-pointer D-pad controls, freed the Rapier world between sessions, reported drive intent to the RPM target, interpolated physics frames with teleport snapping, and avoided needless cargo-rack DOM rebuilds.
  - Commit body records 127 passing tests.
- 13:35:04 — `5e92cdd` — `Merge PR #1: porter obstacle course pivot + merge-time fixes`
  - Merged the porter obstacle-course branch and its merge-time fixes.
- 13:36:15 — `93694bc` — `ci: let pnpm/action-setup read the version from packageManager`
  - Removed the duplicate workflow version pin so `pnpm/action-setup` reads `pnpm@11.3.0` from `package.json`.
- 14:28:08 — `cf8b9b2` — `docs(spec): ground course design — merge of the M2 loop and the PR #1 course`
  - Added the ground-course design: seeded outpost courses, forked lanes and salvage pockets, deterministic 2-D simulation direction, chase-camera and ballast controls, per-bay restraint, art direction, bot lane planning, milestones, and cut list.
- 14:55:49 — `2037c0d` — `docs(plan): ground course implementation plan — 14 tasks, TDD, inline execution`
  - Added the 2,722-line ground-course implementation plan.

### Workspace operations recorded by reflog

- 16:48:51 — Fast-forwarded the feature branch to `042d640` with `git pull`.
- 16:48:56 — Checked out `main` from `feat/porter-obstacle-course`.
- 16:49:02 — Fast-forwarded `main` from `b67d558` to `2037c0d` with `git pull`, bringing in PR #1, its fixes, CI repair, and the new design/plan documents.
- 16:50 — Created this journal from the Git history, reflog, existing `DEVLOG.md`, commit bodies/diffs, and the available chat history.

### Day outcome

- Replaced the live one-dimensional haul with an explorable 3-D obstacle course and pivoted the carrier identity to a human porter holding cargo overhead.
- Merged PR #1 with touch controls, physics cleanup, interpolation, and HUD performance fixes.
- Repaired deployment configuration for the exact pnpm package-manager specification.
- Documented the next pivot: reconciling the original M2 progression loop with a deterministic seeded ground-course architecture.

## Contributor and remote-history audit

Checked against the public GitHub API on 2026-08-26:

- **Ariaspect:** 58 commits; authored all 21 commits in the August 24 UTC section and the original M0–M2 development history.
- **kheesu:** 1 commit, `27b9b8c`, containing the porter obstacle-course pivot.
- The remote currently exposes two branches: `main` and `feat/porter-obstacle-course`.
- The remote currently exposes one pull request: PR #1, `feat: overhaul game as porter obstacle course`, merged on 2026-08-26 at 04:35:05Z.
- The clone is complete rather than shallow. No additional reachable local objects, remote branches, contributors, or pull requests were found during the audit.

## Maintenance rule

Append one section per local calendar day. Record completed actions in chronological order and cite the relevant commit hash, PR, test result, or other durable artifact. If an action is reconstructed from chat or another non-timestamped source, label it as reconstructed rather than assigning an invented time.
