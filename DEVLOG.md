# DEADWEIGHT — DEVLOG

## Journal — external asset research and integration (2026-08-26)

### Request and project fit
- The visual-polish pass began with a request to find useful itch.io assets and then fetch and apply them to the game.
- Repository inspection established the target style and technical constraints: a Three.js browser game, low-poly dieselpunk/industrial presentation, cream/oxidized-orange/gunmetal palette, analog control-panel UI, mobile support, static hosting, deterministic simulation, and a cold-load target below three seconds.
- The highest-value gaps were environment dressing, recognizable freight, destination silhouettes, and UI feedback. Character packs, detailed environments, and large music libraries were excluded because they would not improve the core presentation enough to justify their style or download cost.

### itch.io research
- Reviewed low-poly industrial, post-apocalyptic, science-fiction, dieselpunk UI, cargo, and interface-audio packs on itch.io. License, price, format, download size, stylistic consistency, and browser suitability were checked before choosing anything.
- Shortlisted the following packs:
  - Retro PSX Style Shipyard Kit by Lurid Dream — pay what you want, CC0, GLB/FBX/Blend, approximately 4.1 MB upstream. Strongest match for containers, warehouses, barrels, and crates: https://luriddream.itch.io/retro-psx-style-shipyard-kit
  - 3D House Construction Site by Majadroid — free/pay what you want, commercial use allowed, approximately 3.1 MB. Useful cranes, fencing, trucks, containers, planks, and debris: https://majadroid.itch.io/3d-house-construction-site
  - LoFi3D Cargo by Philip_Erd — pay what you want, CC0, approximately 4.7 MB. Useful freight models, but supplied as Blender source and redundant after selecting the shipyard crates: https://philip-erd.itch.io/lofi3d-cargo
  - KayKit: Space Base Bits by Kay Lousberg — free tier, CC0, approximately 5.2 MB. Useful machinery and structural modules, but cleaner and more colorful than the established art direction: https://kaylousberg.itch.io/space-base-bits
  - Sci-Fi Essentials Kit by Quaternius — free standard tier, CC0, GLTF/FBX/OBJ, approximately 159 MB. Broad selection but far too large to ship without substantial curation: https://quaternius.itch.io/sci-fi-essentials-kit
  - Interface SFX Pack 1 by ObsydianX — free/pay what you want, CC0, 200+ interface sounds in OGG and WAV: https://obsydianx.itch.io/interface-sfx-pack-1
  - Little Machines SFX by AD Sounds — paid commercial-use license, 101 mechanical sounds. Good thematic match, but a more restrictive license than the selected CC0 audio: https://ad-sounds.itch.io/little-machines-sound-effects
  - Dieselpunk UI/GUI Kit by Barely_Games — paid pixel-art interface. Rejected because its pixel treatment conflicts with the existing crisp CSS instruments: https://barely-games.itch.io/dieselpunk-uigui-kit
  - Atompunk UI by GabrielaTot — paid vector interface. Not used because the purchase listing did not expose sufficiently clear license terms during review: https://gabrielatot.itch.io/atompunk-ui
- Final selection was deliberately limited to the Shipyard Kit and Interface SFX Pack 1. The shipyard pack already supplied suitable freight, making LoFi3D Cargo unnecessary; avoiding duplicate packs preserved style consistency and load performance.

### Asset-policy decision
- The original spec required all visuals and sounds to be generated in code and prohibited external assets requiring license management.
- The user explicitly requested online assets, so the policy was amended: curated, redistributable CC0 files are allowed when their source and license are documented, only used files are shipped, and the cold-load target is preserved.
- `HAULER_SPEC.md` now records that amendment. `THIRD_PARTY_ASSETS.md` is the canonical provenance manifest.
- Both integrated packs use Creative Commons Zero 1.0 Universal. Attribution is not legally required, but creator and source information are retained as thanks and to make the release auditable.

### Acquisition and curation
- itch.io's free-download flow uses a short-lived CSRF-protected download token and a signed storage URL. The public pages and official endpoints were used; no authentication, paywall, or access restriction was bypassed.
- The shipyard author linked a public upstream repository, so its canonical GitHub archive was used to retrieve the model files while the itch.io listing remained the license/provenance reference: https://github.com/luriddream/psx-shipyard-kit
- The audio archive was obtained through itch.io's official free-download endpoint. Its 18,802,047-byte OGG archive was inspected, but only four cues were extracted.
- Seven shipyard models were retained:
  - `barrel-1.glb` — 9,112 bytes
  - `container-1.glb` — 72,268 bytes
  - `container-2.glb` — 58,168 bytes
  - `crate-1.glb` — 5,368 bytes
  - `crate-2.glb` — 5,192 bytes
  - `crate-3.glb` — 4,488 bytes
  - `warehouse.glb` — 667,120 bytes
- Four browser-ready OGG cues were retained:
  - `cursor_style_4.ogg` — 39,244 bytes
  - `confirm_style_2_001.ogg` — 52,634 bytes
  - `back_style_2_001.ogg` — 43,673 bytes
  - `error_style_2_001.ogg` — 49,896 bytes
- Full upstream archives, source Blend files, alternate models, WAV duplicates, echo variants, and unused audio were not copied into the repository.

### Model integration
- Added `src/render/three/props.ts` as the GLB loading, normalization, cloning, placement, and disposal layer.
- Assets are loaded asynchronously with Three.js `GLTFLoader`. Failure is non-fatal: the original procedural scenery and cargo remain available and a warning is logged.
- Imported models are normalized at runtime from their measured bounding boxes. Each clone is centered horizontally, grounded at local Y=0, scaled to a requested world-space height, and configured to cast and receive shadows. This avoids relying on inconsistent upstream origins or units.
- Asset geometry and materials remain shared between clones and are disposed once with the library.
- Decorative placement is deterministic and derived from the route seed. It never enters simulation state and therefore does not affect replay or validator behavior.
- Sparse crates and barrels now create roadside points of interest outside the driving corridor.
- Two containers, a freight cluster, and a warehouse establish a more readable destination outpost near the finish line.
- `ThreeRenderer` rebuilds imported scenery whenever the route changes and safely clears it during disposal.

### Cargo integration
- `CargoView` now supports both procedural meshes and imported prop hierarchies.
- Box-like and cage-like cargo use one of three textured shipyard crate variants. Cylinder cargo uses the imported barrel. Sphere cargo retains its procedural geometry because none of the selected models represented it cleanly.
- Cargo art remains cosmetic: slot position, tilt offset, loss state, recovery, stress, and debris behavior continue to come from the existing deterministic simulation.
- Imported assets load in the background. Until ready, cargo uses its original procedural fallback; the view rebuilds from the current definitions when the prop library becomes available.
- Debris keeps each item's data-driven color so the spill effect remains visually linked to the cargo definition even when the intact model uses an imported texture.

### Audio integration
- Added `src/audio/uiSounds.ts` with four semantic cues: select, confirm, back, and error.
- Sounds are created only in response to pointer gestures, satisfying browser autoplay policies and preventing audio from delaying initial interaction.
- Per-cue volume is intentionally restrained so UI feedback reinforces the mechanical panel without overwhelming future machinery audio.
- Event delegation covers panel buttons, dispatch offers, loadout controls, and workshop controls without adding audio code throughout every screen renderer.
- Dispatch tracks when its selection capacity is full. Attempting to select another unselected order plays the error cue; primary actions confirm, workshop exit uses the back cue, and ordinary controls use the select cue.
- Audio is supplemental only. Every action retains visible feedback for accessibility and silent-device play.

### Documentation changes
- Added `THIRD_PARTY_ASSETS.md` with creator, source, upstream repository where applicable, license, exact included files, and their use in the game.
- Amended the hard constraint in `HAULER_SPEC.md` to permit documented, curated CC0 assets while preserving the cold-load target.
- Added the high-level policy and integration outcome to the standing “What I decided” and “What AI built” sections of this journal.

### Problems encountered and resolved
- Network access was initially blocked by the workspace sandbox. The downloads were retried through the approved network path.
- itch.io download links expire quickly. The official purchase page, CSRF token, generated download page, upload ID, and signed storage URL were followed in sequence to retrieve the OGG archive.
- The environment did not provide `jq`, so the small JSON response was parsed with standard shell tools.
- The first `pnpm` verification attempt failed because pnpm tried to open its cache database outside the writable workspace. Verification was rerun successfully with the already-installed local binaries in `node_modules/.bin`.
- Starting the local preview server was blocked inside the sandbox with `listen EPERM`; it was rerun through the approved local-server path and shut down after verification.
- No browser automation package was installed, so validation covered compilation, linting, unit tests, production asset emission, and HTTP serving rather than an automated visual screenshot comparison.

### Verification and measured impact
- TypeScript: passed with `tsc --noEmit`.
- ESLint: passed.
- Tests: all 23 test files and all 161 tests passed.
- Production build: passed with Vite.
- `git diff --check`: passed.
- Local production preview returned HTTP 200 for the game page and every emitted GLB and OGG asset under the configured `/deadweight/` base path.
- Final `dist` size is approximately 1.7 MB. The curated source assets occupy approximately 1,020 KB uncompressed.
- Vite emitted the main application chunk at approximately 56.6 KB, or 21.3 KB gzip, and the lazy Three renderer chunk at approximately 626.3 KB, or 160.4 KB gzip.
- The renderer chunk triggers Vite's advisory warning for chunks larger than 500 KB, but it remains dynamically imported and gzip-compresses to approximately 160 KB. The warning is informational and the build succeeds.
- No simulation constants, route generation, physics, scoring, save data, replay behavior, or test expectations changed during this pass.

## Journal — diegetic gameplay audio pass (2026-08-26)

### Goal and approach
- Follow-up feedback established that menu sounds alone were insufficient; the haul itself needed a coherent mechanical soundscape.
- Added a zero-download-weight synthesized WebAudio layer instead of importing a large general-purpose effects library. This follows the original design preference for procedural sound, avoids another license surface, and keeps playback parameters coupled to live rig state.
- The four imported CC0 OGG files remain responsible for menu navigation. Gameplay controls are excluded from generic UI event delegation so a panel action does not produce both a menu beep and a mechanical effect.

### Implemented sound system
- Added `src/audio/gameAudio.ts` and constructed one `GameAudio` instance in `src/main.ts`.
- AudioContext creation is deferred until the first pointer or keyboard gesture. This complies with browser autoplay rules and keeps audio initialization off the cold-load path.
- A master gain and dynamics compressor provide restrained output and prevent stacked collision effects from clipping excessively.
- The continuous engine uses a sawtooth oscillator plus a sine sub-oscillator through a resonant low-pass filter. Pitch, filter cutoff, and gain follow actual speed, selected gait, recovery state, and run completion.
- The engine sound tracks actual motion rather than only the requested gait, matching the RPM instrument and acceleration model.
- Procedural one-shot effects now cover:
  - gear selection;
  - three-click cargo ratchet;
  - brace engage/release hydraulic hiss;
  - jump actuator rise;
  - speed-scaled landing thud;
  - alternating mechanical footfalls while grounded and moving;
  - point-hazard, moving-hazard, and wall-strike impacts;
  - cargo spill;
  - salvage-cache discovery;
  - recovery winch;
  - approaching-hazard double alert;
  - repeating critical-tilt alarm;
  - arrival fanfare;
  - distinct spill/stall failure descent.
- Noise effects are generated as short, decaying buffers and filtered per use. Tonal effects use scheduled oscillator envelopes and frequency ramps. No generated waveform files are stored or fetched.
- Footfall cadence is scheduled in simulation ticks and scales with speed. Audio remains cosmetic and cannot affect deterministic state or replay input logs.

### Event wiring
- `FlowDeps` accepts an optional `GameAudio` dependency, preserving headless and test construction paths.
- Every haul resets the audio snapshot with `beginRun`.
- After each deterministic simulation step, the audio layer compares a compact previous/current snapshot of grounded state, brace state, gait, lost cargo, discoveries, zone cooldowns, total restraint, recovery, and end reason.
- Restraint loss identifies jolts from point hazards and wall strikes. Cooldown changes identify moving-zone impacts. Landing jolts are excluded from the generic collision detector because they already have a speed-scaled landing effect.
- The renderer's existing hazard calculation now drives both the visual hazard lamp and the audio alert, keeping both warnings synchronized.
- Audio receives state after simulation stepping and never writes to it.

### Verification and size impact
- TypeScript and ESLint passed after the sound integration.
- All 23 test files and all 161 tests passed.
- The Vite production build passed.
- The main application chunk increased from approximately 56.6 KB to 61.8 KB, or from 21.3 KB to 23.04 KB gzip.
- Model and OGG asset sizes did not change. The gameplay sound layer adds approximately 1.7 KB gzip beyond the prior application code and adds no network requests.
- The existing advisory warning for the lazy Three renderer chunk remains unchanged at approximately 626.3 KB, or 160.4 KB gzip.

## Journal — complete visible-world asset migration (2026-08-26)

### Request and art-direction decision
- Follow-up direction expanded the asset pass from sparse dressing to replacing the visible placeholder language across the whole game: player character, terrain, barriers, hazards, discoveries, cargo, destination, and effects.
- Re-reviewed the itch.io shortlist for packs broad enough to cover an entire world coherently. The final direction uses one primary environment kit rather than mixing unrelated industrial packs: KayKit Space Base Bits supplies nearly all static world art, Quaternius supplies an animated character, and Sketchy_B0t supplies the route texture.
- This deliberately changes the presentation from a rusty procedural prototype to a readable low-poly frontier depot. The ash/rust lighting and control-panel UI remain, which keeps DEADWEIGHT's identity while the viewport gains consistent authored silhouettes and materials.

### New itch.io sources
- **LowPoly Robot by Quaternius**: https://quaternius.itch.io/lowpoly-robot
  - Free/pay-what-you-want, CC0, and supplied as FBX/OBJ/Blend.
  - The upstream FBX is 3,297,804 bytes and includes 14 animation clips. Runtime uses the authored idle, walking, running, and walk-jump clips.
- **KayKit: Space Base Bits by Kay Lousberg**: https://kaylousberg.itch.io/space-base-bits
  - Free edition, CC0, with FBX, OBJ, and glTF exports.
  - Chosen because a single shared 25,749-byte atlas supports a broad collection of terrain, rocks, structures, freight, machinery, lights, vehicles, and landing infrastructure.
  - Retained 28 referenced glTF model pairs; unused variants and alternate formats were removed after integration. The selected directory is approximately 880 KB.
- **Pixel Art Seamless Textures by Sketchy_B0t**: https://sketchybot.itch.io/past
  - Free, CC0, and explicitly permits modification, redistribution, commercial use, and sale.
  - Retained only the 64×64 `Dirt.png` texture (8,520 bytes) for the generated route surface.
- The canonical file-level provenance and use map is in `THIRD_PARTY_ASSETS.md`.

### Acquisition notes
- Robot and Space Base archives were retrieved through itch.io's official free-download flow and inspected before extraction. Blender was not installed, so the robot FBX was parsed with Three's `FBXLoader` and exported with `GLTFExporter` to a browser-native GLB. Bounds, skin, mesh hierarchy, materials, and all 14 animation clips were validated during conversion. The 1,460,532-byte GLB is 56% smaller than the 3,297,804-byte FBX and replaces it in the repository.
- The texture listing exposes each PNG as an individual itch upload. The first generated URL led back to the download page because it was the game-level token, not the upload endpoint. Inspecting itch.io's own download script showed that individual files use `/{slug}/file/{upload_id}?source=view_game&as_props=1`. The corrected official request produced itch.io's short-lived signed mirror URL and the expected PNG.
- The old seven-model Shipyard subset was removed after the migration because it was no longer referenced and would leave two competing environment styles in the repository. The original research and first-pass journal above remain as the history of that iteration.

### Player and cargo replacement
- Replaced the procedural six-legged box rig, deck plates, lamps, cylinder legs, IK feet, and locally generated gait with Quaternius's skinned robot.
- `Rig` now loads the converted GLB asynchronously, derives scale and ground placement from its measured bounds, rotates it into the route's +X travel axis, enables shadows on its meshes, and drives an `AnimationMixer` from actual movement state.
- Idle, walk, run, and jump actions cross-fade over 160 ms. Walk/run playback speed follows actual simulation speed, while jump selection follows physical lift. The renderer remains cosmetic and cannot feed animation state back into the deterministic simulation.
- Added an authored KayKit space-truck trailer behind the robot. Cargo now rides on that trailer instead of floating on a procedural deck.
- Every cargo shape maps to authored freight: cargo A/B, packed cargo, stacked cargo, or container sets. The primitive fallback was removed.
- Spill debris now consists of small cloned cargo and rock assets with the existing ballistic effect; the generated colored cube particles were removed.

### Terrain, boundaries, and world replacement
- The route continues to generate vertices from `heightAt`, corridor width, seeded roughness, and gap collision data. This geometry is necessary for visual/collision agreement and is not an art placeholder.
- Removed procedural terrain vertex colors, rut colors, and mud colors. The visible surface now uses the imported seamless dirt texture with repeat wrapping, nearest magnification, mipmapped minification, sRGB color handling, and a restrained tint.
- Replaced box/icosahedron instanced boundaries by wall-kind mappings into tall terrain, authored rock groups, base structures, and container sets. Chunking still follows the wandering centerline and deterministic wall definitions.
- Replaced distant box mountains with scaled KayKit tall, slope, and mining terrain modules.
- Replaced box corridor posts and markers with authored light towers.
- Replaced roadside procedural props with base modules, freight stacks, solar panels, containers, and the common asset palette.

### Hazard, discovery, and destination replacement
- Rubble and scree now use authored individual rocks and grouped rock formations.
- Gaps retain the simulation-derived hole but use terrain-slope lips and a tunnel structure below the crossing instead of a dark box and generated bars.
- Gust zones use paired authored wind turbines instead of translucent planes and cylinder trunks.
- Mud zones use low terrain modules pinned along the route grade instead of a generated colored plane.
- Rockfall movers and their source piles use authored rock groups while retaining the exact simulation phase, direction, visibility window, and travel distance.
- Crane hazards now use the authored drill structure and a suspended authored freight stack while retaining the exact deterministic swing phase.
- Discoveries are now small lander or freight sites assembled from lander bases, landers, solar panels, containers, and lights. Their existing found/unfound behavior is unchanged.
- The generated finish gantry was replaced with a large landing pad, cargo depot, garage, and arrival lights.

### Loader and renderer architecture
- Rebuilt `src/render/three/props.ts` as the shared KayKit library. It loads only the 28 selected models, measures source bounds once, clones authored hierarchies with shared geometry/materials, centers and grounds them consistently, and owns final disposal.
- KayKit files live under `public/assets/kaykit/` so each `.gltf` can resolve its adjacent `.bin` and shared texture correctly under Vite's configured base path.
- The environment is now constructed only after the shared model library resolves. Terrain appears immediately; the authored world is attached in one rebuild when ready. Asset load failure is logged without touching simulation state.
- Route changes rebuild hazards, scenery, and walls from the same loaded library. The old parallel procedural-plus-imported scenery path was removed.
- Added texture disposal for replaced route meshes and retained shared-resource disposal for cloned assets.

### Sound continuity
- The earlier audio work remains active through this visual migration: four imported CC0 interface OGG cues cover panel feedback, and the synthesized gameplay layer covers engine, footsteps, controls, hazards, impacts, spills, recovery, warnings, and outcomes.
- Robot animation selection follows the same actual gait, speed, and lift signals used by the gameplay sound layer, keeping motion and sound perceptually synchronized without coupling either system into simulation.

### Verification and footprint
- TypeScript passed with `tsc --noEmit`.
- ESLint passed.
- All 23 test files and all 161 tests passed.
- Vite production build passed. The renderer remains lazy-loaded.
- A temporary production preview returned HTTP 200 for the configured `/deadweight/` base path and representative KayKit `.gltf`, `.bin`, and shared texture URLs. A static dependency audit also confirmed that every retained glTF references files present beside it.
- The complete KayKit source subset is approximately 880 KB; the browser-ready robot GLB is approximately 1.46 MB; the dirt texture is 8.52 KB. No unused KayKit variants, source FBX, or superseded Shipyard models remain.
- Final `dist` size is approximately 3.2 MB. Vite emitted the main application chunk at 61.79 KB (23.04 KB gzip) and the lazy Three renderer at 626.95 KB (160.23 KB gzip). The robot conversion avoided the FBX loader code and returned the renderer bundle almost exactly to its pre-migration gzip size.
- No simulation constants, terrain height generation, collision boxes, hazard timing, controls, scoring, replay data, save schema, or test expectations changed.

## Journal — shareable used-asset bundle (2026-08-26)

### Request and package design
- Packaged the exact third-party asset subset currently used by the game into `deadweight-used-assets-2026-08-26.zip` so it can be handed to another developer without requiring repository knowledge.
- Organized the archive by purpose rather than upstream archive layout: `player/`, `environment/kaykit/`, `terrain/`, `audio/interface/`, and `documentation/`.
- Kept all KayKit `.gltf`, matching `.bin`, and the shared `spacebits_texture.png` in one directory. This is intentional: the glTF files use relative dependency paths, so a more deeply categorized physical layout would make them fail to load or require duplicated textures.

### Included guidance
- Added a root `README.md` with a visual folder tree, quick Three.js loading guidance, animation notes, and the KayKit adjacency warning.
- Added `documentation/ASSET_INDEX.md`, mapping the robot, every retained KayKit model stem, terrain texture, and interface cue to its current role in DEADWEIGHT.
- Added `documentation/LICENSES.md` with the shared CC0 1.0 license, official legal-information link, creators, and itch.io sources.
- Copied the repository's canonical `THIRD_PARTY_ASSETS.md` into the package.
- Added `documentation/SHA256SUMS.txt` covering every packaged file so the recipient can verify individual assets after transfer.

### Package verification
- The ZIP contains 76 entries and 2,466,226 bytes of uncompressed content.
- Final compressed size is approximately 682 KB.
- `zip -T` reported the archive is valid.
- Archive SHA-256: `0ab0a605b4ab786e1dbbd78adb8b98c37f43c0e2bae871c007492515ad486214`.
- The package is additive only; no game source or runtime asset was moved or altered while producing it.

## What I decided
- Asset policy amendment: curated CC0 props and UI sounds are allowed when provenance is recorded and only the files used by the game are shipped. This replaces the original all-procedural asset constraint without weakening the sub-3-second load target.
- Full visual migration: use one coherent authored Space Base environment language across every visible world category; preserve generated geometry only where it expresses deterministic simulation state.
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
- Asset integration pass: selected seven low-poly shipyard models and four OGG interface cues from two CC0 itch.io packs; normalized GLB scale/origin at runtime, placed route dressing deterministically, added imported cargo variants with procedural fallback, and kept the shipped asset subset near 1 MB uncompressed.
- Full asset migration: replaced the procedural rig with an animated CC0 robot and trailer, replaced all visible cargo/boundaries/hazards/discoveries/scenery/destination primitives with 28 curated KayKit glTF models, and textured the gameplay heightfield with an imported CC0 seamless surface.
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
