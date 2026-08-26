# DEADWEIGHT — Concept & Build Spec

> **Paste this whole file into Claude Code as your opening prompt.**
> Working title: `DEADWEIGHT` (alternates: `HAULER`, `MULE-7`, `COURIER CONTROL`)

---

## 0. Prompt for Claude Code

You are helping me build a browser game for the **OpenAI Game Builders Seoul** hackathon (Track 1, online warm-up). Read this entire spec, then:

1. Ask me only the questions in §11 (Open Decisions) that block you. Don't ask anything already answered here.
2. Propose a file structure and confirm the tech stack in §6.
3. Build in the milestone order in §8. **M1 must be playable end-to-end before you touch M2.** Vertical slice first, content second, polish third.
4. Keep a running `DEVLOG.md` recording: what you built, what I decided, what problems you solved, and what you generated procedurally. This is a scored submission artifact — see §10.

Hard constraints you must never violate:
- Runs in a browser from a static URL. No install, no login, no server required to play.
- Loads and reaches first input in **under 3 seconds**.
- Works on desktop mouse/keyboard **and** touch. Judges may play on a phone.
- The simulation is deterministic (fixed timestep + seeded RNG) so replays, ghosts, and headless validation all work.
- Asset policy amendment (2026-08-26): selected, redistributable CC0 assets may be used when their source and license are recorded in `THIRD_PARTY_ASSETS.md`; the shipped subset must preserve the cold-load target. Visible world entities should use the selected authored asset language wherever the packs provide coverage. Simulation-derived route geometry, effects, lighting, and responsive DOM instruments may remain generated in code.

---

## 1. Context: what we're being judged on

Five criteria, weighted holistically:

| Criterion | What it means | How this design answers it |
|---|---|---|
| **Playability** | Launches, controls work, feels finished | Single-screen panel game — no camera, no character controller, no 3D. Small surface area, so it can actually be *polished* |
| **Originality** | Ideas visibly the participant's own | Delivery game where you **never control the courier** — you operate it through an analog panel |
| **Codex Collaboration** | Did AI expand scope & quality | Data-driven content pipeline, procedural route generation, headless solvability validator, tuning harness (§10) |
| **Release Potential** | Can it grow into a service via Hive | Async trace layer = accounts, cloud save, leaderboards, seasons, social (§5) |
| **Presentation** | Core idea readable without explanation | Diegetic UI. A control panel is legible in a screenshot, a thumbnail, and a 3-minute pitch |

Format requirements from the organizers:
- Browser web build, public link, no approval or login needed to play
- Game thumbnail, 16:9
- Optional (bonus): ≤3 min demo video, and a written account of how Codex/AI was used
- Winners may be asked to integrate **Hive** (Com2uS platform) later — so the design should have obvious hooks for accounts, leaderboards, and live content

---

## 2. The concept in one paragraph

Death Stranding meets IRON NEST. You are a remote operator for a cargo company. A six-legged walker rig called a **MULE** carries absurd freight across broken terrain — and you never touch the rig directly. You sit at an analog control panel: a throttle lever, a ballast trim dial, strap tension, a brace pedal, and a winch. Orders clatter in over a teleprinter from a passive-aggressive logistics HQ. You deliver by running *procedure* correctly under pressure — countering slopes with ballast, easing off the throttle before rubble, tightening straps before a gust — while a tilt needle tells you exactly how close the whole load is to going over the side. Cargo has opinions. Soup sloshes. A live chicken shifts its weight. Arrival is scored on condition, not survival, and the customer leaves a review.

**The one-line pitch:** *You don't carry the package. You operate the thing that carries the package — badly, through a wall of levers.*

---

## 3. Core loop (target: 90-second runs)

```
DISPATCH  →  LOAD  →  HAUL  →  ARRIVAL  →  REVIEW  →  UPGRADE  →  (loop)
  ~10s       ~15s     ~60s      ~5s        ~10s       ~10s
```

**DISPATCH** — Teleprinter offers 3 orders. Each shows: cargo, weight, fragility, payout, hazard warning. Flavor text from HQ.

**LOAD** — Player picks 1–3 orders to carry simultaneously (capacity limited). This is the risk/reward decision that makes the game compound: *stack more freight for more money, or one clean run for a guaranteed 5-star review.* Player may also spend one capacity slot on an **infrastructure kit** (see §5).

**HAUL** — The 60-second operator sequence. Terrain scrolls right-to-left through a viewport window in the middle of the panel. Player manages:
- **Throttle** (gait 0–4) — faster = time bonus, but tilt response gets twitchier and hazards arrive sooner than you can react
- **Ballast trim** (−100…+100) — shifts center of mass fore/aft. Must be counter-set against slope. This is the moment-to-moment skill
- **Strap tension** (tap to tighten) — restores lash after jolts; **over-tightening crushes fragile cargo**. Deliberate tension between two failure modes
- **Brace** (hold) — locks legs, absorbs one hazard cleanly, but burns time and drains the pressure reserve
- **Winch/Deploy** — drops an infrastructure piece at the current position (§5)

**ARRIVAL** — Rig reaches the outpost. Cargo condition is evaluated per item.

**REVIEW** — Star rating + a generated customer review line ("Cake delivered: 41% intact. My daughter is crying. 2 stars."). Cash, XP, and the **silhouette of the next unlock** shown prominently.

**UPGRADE** — Single currency, a 2×3 grid of six upgrades. One click, back to dispatch.

---

## 4. Failure, and why it's fun

- Tilt needle enters red → cargo takes stress damage, load shifts further (feedback spiral)
- Needle pegs → **spill**. Items fly off. You can brake, reverse, and re-winch one item back — costs 8 seconds
- Total spill → run ends early. Payout zero. **The wreckage is recorded as a trace** (§5)

Never a hard game-over screen. Every failure produces a review and a trace, so every run feeds the meta.

---

## 5. The differentiator: the async trace layer

**This is the system that makes it a service instead of a jam demo. Build a working version of it, even a fake one.**

During a haul, a player can spend cargo capacity on an **infrastructure kit** and deploy it mid-route:

| Kit | Effect for future haulers |
|---|---|
| Plank bridge | Flattens a gap |
| Anchor rope | Cancels tilt penalty on one slope |
| Fuel drum | Refills pressure reserve |
| Warning sign | Telegraphs an upcoming hazard 2s early |
| Wreckage (auto) | Left behind by a failed run — an obstacle, but salvageable for cash |

Rules:
- Traces persist on the **route seed**, not the player. Everyone hauling seed `#4417` sees the same terrain and the same accumulated traces
- When a stranger uses your plank, you get a ping: **"♥ from a stranger — +12"**
- Leaderboard is not "highest score." It's **"most-used infrastructure this season."** Cooperation is the competition
- Seasons wipe terrain seeds and rebuild the world collectively

**Implementation for the deadline:** a single shared JSON store (Supabase / Firebase / a Cloudflare KV / literally a gist) with `{ seed, x, type, ownerName, useCount }`. If networking is risky, ship it local-first: persist to `localStorage`, **pre-seed with 20–30 hand-authored traces with fake usernames** so a first-time judge immediately sees other people's marks on the world. Pitch the networked version.

**Hive story for the pitch:** accounts → trace ownership; cloud save → cross-device meta; leaderboards → seasonal infrastructure rankings; social → the ♥ economy; live-ops → new cargo tiers and seasonal route sets shipped as JSON.

---

## 6. Tech stack

- **Vite + TypeScript**, no game engine
- **HTML5 Canvas** for the terrain viewport; **DOM + CSS** for the panel chrome (levers, gauges, teleprinter). DOM panel = crisp text, easy touch targets, trivially responsive
- **Custom deterministic sim** — *not* Matter.js. We only need a 1-DOF tilt model plus per-item stress. A hand-rolled sim is tunable, deterministic, and fast enough to run headless 10,000× for balancing. This decision is what makes §10 possible
- Fixed timestep 60 Hz, seeded RNG (mulberry32), inputs recorded as a frame-indexed array → gives replays and ghosts for free
- WebAudio, synthesized SFX only (clunks, hydraulic hiss, teleprinter chatter, horn)
- Deploy: static build → Vercel/Netlify/GitHub Pages

**Physics model sketch:**

```
tilt' = k_slope * slope(x)
      + k_ballast * (ballast - ballastNeutral)
      + k_load * loadOffset
      + hazardImpulse
      - damping * tilt

loadOffset drifts toward tilt when strapTension is low  ← the feedback spiral
item.stress += max(0, |tilt| - item.tolerance) * dt
item.stress += max(0, strapTension - item.crushLimit) * dt   ← the second failure mode
```

Everything above is a tunable constant in `tuning.json`. Do not hardcode.

---

## 7. Content, as data

All content lives in JSON so it can be generated and balanced in bulk:

- `cargo.json` — `{ id, name, weight, tolerance, crushLimit, behavior, payout, art }`
  - `behavior`: `static | slosh | livestock | precarious` — a small behavior tag that modulates loadOffset drift. This is where the comedy lives mechanically
  - Ship ~20 items: soup cauldron, wedding cake, live chicken, a nervous grandmother, a fishtank, 400 ball bearings, an unlabeled crate that ticks, a grand piano, a stack of unwashed dishes, a beehive
- `orders.json` — dispatch offers pairing cargo + destination + HQ flavor text
- `hazards.json` — `{ type, impulse, telegraph, counter }`. Every hazard must have a **correct counter-procedure** the player can learn
- `upgrades.json` — six entries: wider ballast range, auto-trim assist, reinforced straps, +1 capacity slot, faster gait, cheaper kits
- `reviews.json` — review templates keyed by `(condition bucket, cargo type)`. ~60 lines. Comedy scales with count and costs nothing to run

---

## 8. Milestones

**M0 — Skeleton (1h).** Vite+TS project, canvas viewport, scrolling terrain from a seed, a rig that walks. Deployed to a live URL *today*, before anything else works. Never be in a position where the link is broken.

**M1 — Vertical slice (3h).** Throttle + ballast trim + tilt gauge + one cargo item + spill + arrival + a result screen. **This must be fun on its own.** If ballast-vs-slope isn't satisfying at this stage, stop and re-tune before adding anything.

**M2 — Loop closure (2h).** Dispatch screen, multi-item loadout, strap tension, brace, reviews, currency, upgrade grid, localStorage save.

**M3 — Trace layer (2h).** Deploy kits, persist traces, load traces into a run, ♥ pings, 20 hand-authored seed traces.

**M4 — Polish (3h).** Audio, screen shake, teleprinter typewriter effect, first-60-seconds tutorial (diegetic — HQ tells you what to do over the printer), mobile layout, thumbnail, demo video.

Anything not in M0–M4 does not exist.

---

## 9. Definition of done

- [ ] Public URL, loads cold in <3s, no console errors
- [ ] Playable one-handed on a phone
- [ ] A complete first run finishes in under 2 minutes including dispatch and review
- [ ] **A player who was never told anything can complete a run.** Test this on someone. It's the whole Presentation criterion
- [ ] At least one visible locked upgrade at all times
- [ ] Traces from "other players" visible in the first run
- [ ] 16:9 thumbnail showing the panel

**Cut list — do not build:** multiple biomes, narrative, tutorial popups, 3D, settings menus, difficulty selection, achievements, more than 6 upgrades, any server the game *requires* to run.

---

## 10. Codex / AI collaboration — this is scored, so make it visible

Use AI on things that **expanded what a small team could build**, and document each:

1. **Procedural route generation + a solvability validator.** Generate terrain from a seed, then run a headless bot over each candidate route to prove it's completable within the time limit. Reject and regenerate failures. Log the pass rate. *This is the flagship item — nobody hand-builds a validator in a jam.*
2. **Tuning harness.** Run 5,000 headless sims across the parameter space, chart spill rate vs. throttle vs. ballast responsiveness, and pick constants from data instead of vibes. Put the chart in the writeup.
3. **Bulk content generation.** 20 cargo items, 60 review lines, 40 HQ dispatch messages — generated into JSON against a strict schema, then human-edited for comedy.
4. **Touch control mapping** for the panel, and a responsive layout pass.
5. **Replay/ghost system** built on the deterministic input log.

`DEVLOG.md` should have a clear split:

```
## What I decided
- the operator framing (never control the rig directly)
- strap tension as a two-sided failure (loose = shift, tight = crush)
- leaderboard measures infrastructure use, not score

## What AI built
- route generator + headless solvability validator (pass rate 61% → regenerate)
- 5,000-run tuning sweep; picked k_ballast = 0.34 from the spill-rate curve
- 20 cargo items + 60 review templates against schema

## Problems solved
- tilt feedback spiral was unrecoverable; added a 0.4s grace window before loadOffset drift
```

---

## 11. Open decisions — ask me these

1. **Reflex vs. planning split.** Default assumption: **70% moment-to-moment trim, 30% pre-run loadout planning.** IRON NEST leans planning; Death Stranding leans reflex. Confirm or change — it changes the whole feel.
2. **Networked traces or local-with-seeded-fakes?** Depends on how much time is genuinely left.
3. **Art direction.** Default: dieselpunk analog panel, cream/oxidized-orange/gunmetal, chunky mechanical type, single accent color for danger. Confirm or override.
4. **Title.** `DEADWEIGHT` vs `HAULER` vs `MULE-7`.

---

## 12. Pitch skeleton (for the 3-minute elevator pitch, if we make the 40)

1. *"Every delivery game makes you the courier. This one makes you the guy at the desk."* — 15s
2. Live play, 45s: one run, deliberately spill the soup, show the review
3. The trace layer: *"That plank was left by a stranger. The leaderboard ranks how much other people needed you."* — 45s
4. Hive: seasons, shared world state, cargo tiers as live content — 30s
5. Codex: the validator and the 5,000-run tuning sweep — 30s
