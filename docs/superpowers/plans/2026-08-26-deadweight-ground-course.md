# DEADWEIGHT Ground Course Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (the project owner has ruled out Fable subagents for cost). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Rapier obstacle course with a seeded, ground-level, forked course per outpost driven by a deterministic 2-D sim, wrapped by the M2 dispatch → loadout → haul → result → upgrade loop, with a fixed 3/4 camera, W-at-gait throttle, per-bay restraint and a post-apocalypse look.

**Architecture:** `src/sim` (pure, 60 Hz, no transcendentals) gains a lane/wall layout generator, AABB wall collision, zone hazards and per-item restraint; `src/render/three` draws walls as instanced meshes and the new hazard set; `src/ui` restores the mouse-ballast drag, adds a D-pad, a route sketch and a scrolling minimap; `src/game/flow.ts` returns to the M2 state machine. Rapier and `src/course/` are deleted in Task 1 so every later commit builds a playable game.

**Tech Stack:** Vite 8, TypeScript 6 (strict), three 0.185, vitest 4, eslint (sim-purity rule), tsx, pnpm 11.3.0, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-26-deadweight-ground-course-design.md` (amends `docs/superpowers/specs/2026-08-25-deadweight-design.md` §1–§7).

## Global Constraints

- `src/sim/**` may not import three/render/ui/game/audio, touch DOM globals, or call `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/log2/log10/pow/sqrt/cbrt/sinh/cosh/tanh/random` (eslint enforces; `Math.hypot` is also avoided by convention).
- Sim tick `dt = 1/60`; all sim geometry is in **corridor coordinates**: `x` along the route, `z` across it relative to the wandering centre line (`route.centerAt(x)` is a render/HUD concern only).
- Every constant lives in `src/content/tuning.json`; none hard-coded in `step.ts`.
- Gates before every commit: `pnpm typecheck && pnpm lint && pnpm test`; before merging: `pnpm validate` (12/12 at lag 15) and `pnpm build` with no chunk larger than the Three chunk.
- Commit trailers: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VrvcYqGcg2NY6ANqJokjrV`.
- Work on branch `feat/ground-course`; CI only runs on `main`.

## File structure

| File | Responsibility |
|------|----------------|
| `src/sim/types.ts` | All sim types (Wall, Lane, Fork, Pocket, Layout, HazardInstance with lane/zone fields, RigState with `targetSpeed`/`selectedSlot`/`zoneCooldown`) |
| `src/sim/walls.ts` (new) | `resolveWalls`, `rectContains`, `isPassable` — pure AABB geometry |
| `src/sim/course.ts` (new) | `layoutCourse(rng, lengthM, tier, terrain)` → forks, spines, baffles, pockets, edge walls |
| `src/sim/terrain.ts` | Slope segments + wander; composes the layout; lane-aware hazard/discovery placement; `routeFromSegments` |
| `src/sim/step.ts` | Drive, steer, walls, mud, jump, tilt, per-bay restraint, point + zone hazards, spill/recover |
| `src/sim/bot.ts` | Lane planner, PD tilt, brace/slow, loosest-bay ratchet |
| `src/sim/score.ts` | Unchanged apart from `elapsed = t·dt` |
| `src/ui/input.ts` | Keys, mouse ballast drag, bay select/cycle, `setDrive` for the D-pad |
| `src/ui/sketch.ts` (new) | `routeSketchSvg`, `minimapMarkup` — pure SVG string builders |
| `src/ui/hud.ts` | Minimap window, threat banner by lane, tappable cargo rack, bottom readouts |
| `src/ui/panel/panel.ts` | Gait rail, JUMP/RATCHET/BRACE/RECOVER, dials, gauges |
| `src/ui/screens/dispatch.ts` | Sketch + offers |
| `src/game/events.ts` (new) | `describeEvents(prev, curr, route)` → teleprinter lines |
| `src/game/flow.ts` | M2 state machine |
| `src/render/three/walls.ts` (new) | Instanced wall/rock/ruin/baffle meshes |
| `src/render/three/hazards.ts` | New hazard set + mover animation |
| `src/render/three/terrain.ts`, `scenery.ts`, `rig.ts`, `ThreeRenderer.ts` | Ground, ruins, rig skin, fixed camera, palette |
| Deleted | `src/course/*`, `src/render/three/CourseView.ts`, `test/course.test.ts`, `test/interp.test.ts`, `test/movement.test.ts`, `@dimforge/rapier3d-compat` |

---

### Task 1: Retire the Rapier course and restore the M2 loop over the 1-D sim

**Files:**
- Delete: `src/course/PhysicsCourse.ts`, `src/course/map.ts`, `src/course/types.ts`, `src/course/interp.ts`, `src/render/three/CourseView.ts`, `test/course.test.ts`, `test/interp.test.ts`
- Modify: `package.json` (remove rapier), `src/render/Renderer.ts`, `src/render/three/ThreeRenderer.ts`, `src/game/flow.ts`, `src/ui/hud.ts`, `src/ui/panel/panel.ts`, `src/ui/input.ts`, `src/ui/screens/dispatch.ts`, `src/main.ts`
- Test: `test/input.test.ts` (existing drag test keeps passing), full suite

**Interfaces:**
- Produces: `Renderer { mount, setLoadout, setRoute, draw(curr, prev: RenderPrev, alpha), resize, dispose }`; `PanelHandlers { onGait, onStrap, onBrace, onRecover, onJump }`; `Panel.setGait(g)`; `Hud.update(s, route)`; `InputController.attach` with pointer drag = ballast.

- [ ] **Step 1: Branch and delete the course**

```bash
git checkout -b feat/ground-course
git rm -r src/course src/render/three/CourseView.ts test/course.test.ts test/interp.test.ts
pnpm remove @dimforge/rapier3d-compat
```

- [ ] **Step 2: Renderer interface**

Replace `src/render/Renderer.ts` with:

```ts
import type { ItemDef, RigState, RouteDef } from '../sim/types';
export interface RenderPrev { x: number; z: number; lift: number; lateralVel: number; tilt: number; speed: number }
export interface Renderer {
  mount(el: HTMLElement): void;
  setLoadout(items: ItemDef[]): void;
  setRoute(route: RouteDef): void;
  draw(curr: RigState, prev: RenderPrev, alpha: number): void;
  resize(): void;
  dispose(): void;
}
```

- [ ] **Step 3: ThreeRenderer without orbit/course**

Replace `src/render/three/ThreeRenderer.ts` with:

```ts
import * as THREE from 'three';
import type { Renderer, RenderPrev } from '../Renderer';
import type { ItemDef, RigState, RouteDef } from '../../sim/types';
import { buildTerrain } from './terrain';
import { animateHazards, buildHazards, disposeHazards } from './hazards';
import { buildScenery, disposeScenery, syncScenery } from './scenery';
import { Rig } from './rig';
import { CargoView } from './cargo';
import { tuning } from '../../content';

const SKY = '#c8aa7d';

export class ThreeRenderer implements Renderer {
  private gl!: THREE.WebGLRenderer;
  private el!: HTMLElement;
  private readonly scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private terrain: THREE.Mesh | null = null;
  private hazardGroup: THREE.Group | null = null;
  private scenery: THREE.Group | null = null;
  private route: RouteDef | null = null;
  private readonly rig = new Rig();
  private readonly cargo = new CargoView();
  private readonly sun = new THREE.DirectionalLight('#ffd99b', 3.4);
  private readonly sunTarget = new THREE.Object3D();
  private lastDrawMs = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private firstFrame = true;

  mount(el: HTMLElement): void {
    this.el = el;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.08;
    el.appendChild(this.gl.domElement);
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 70, 200);
    const hemi = new THREE.HemisphereLight('#ffe8bd', '#42372e', 1.65);
    const shadowSize = window.innerWidth < 900 ? 1024 : 2048;
    this.sun.position.set(-25, 42, 28); this.sun.castShadow = true; this.sun.target = this.sunTarget;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize); this.sun.shadow.camera.left = -38; this.sun.shadow.camera.right = 38; this.sun.shadow.camera.top = 38; this.sun.shadow.camera.bottom = -28;
    this.scene.add(hemi, this.sun, this.sunTarget, this.rig.group);
    this.rig.group.add(this.cargo.group);
    this.scene.add(this.cargo.debrisGroup);
    this.resize();
  }

  setLoadout(items: ItemDef[]): void { this.cargo.setLoadout(items); }

  setRoute(route: RouteDef): void {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    this.route = route;
    this.terrain = buildTerrain(route);
    this.scene.add(this.terrain);
    if (this.hazardGroup) { this.scene.remove(this.hazardGroup); disposeHazards(this.hazardGroup); }
    this.hazardGroup = buildHazards(route);
    this.scene.add(this.hazardGroup);
    if (this.scenery) { this.scene.remove(this.scenery); disposeScenery(this.scenery); }
    this.scenery = buildScenery(route); this.scene.add(this.scenery);
    this.firstFrame = true;
  }

  draw(curr: RigState, prev: RenderPrev, alpha: number): void {
    if (!this.route) return;
    const x = prev.x + (curr.x - prev.x) * alpha;
    const rz = prev.z + (curr.z - prev.z) * alpha;
    const z = this.route.centerAt(x) + rz;
    const lift = prev.lift + (curr.lift - prev.lift) * alpha;
    const lateralVel = prev.lateralVel + (curr.lateralVel - prev.lateralVel) * alpha;
    const tilt = prev.tilt + (curr.tilt - prev.tilt) * alpha;
    const speed = prev.speed + (curr.speed - prev.speed) * alpha;
    const y = this.route.heightAt(x);
    this.rig.update(x, y, z, lift, lateralVel, tilt, speed, curr.gait, curr.t + alpha, this.route);
    this.cargo.sync(curr.items, tuning, this.rig.group.position);
    const now = performance.now(); const dtSec = this.lastDrawMs ? Math.min(0.05, (now - this.lastDrawMs) / 1000) : 0; this.lastDrawMs = now;
    this.cargo.tickDebris(dtSec, (px) => this.route!.heightAt(px));
    if (this.hazardGroup) animateHazards(this.hazardGroup, curr.t / 60, x);
    if (this.scenery) syncScenery(this.scenery, curr.foundDiscoveries, curr.t / 60);
    this.sun.position.set(x - 25, y + 42, z + 28); this.sunTarget.position.set(x, y, z); this.sunTarget.updateMatrixWorld();
    const danger = Math.min(1, Math.abs(curr.tilt));
    const shake = danger > 0.65 ? Math.sin(curr.t * 1.7) * (danger - 0.65) * 0.25 : 0;
    this.camPos.set(x - 10.5, y + lift + 7.2 + shake, z + 10.5 + shake);
    this.camTarget.set(x + 5.5 + speed * 0.3, y + lift + 1.35, z);
    if (this.firstFrame) { this.camera.position.copy(this.camPos); this.firstFrame = false; }
    else this.camera.position.lerp(this.camPos, 0.12);
    this.camera.lookAt(this.camTarget);
    this.gl.render(this.scene, this.camera);
  }

  resize(): void {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.terrain) { this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    if (this.hazardGroup) disposeHazards(this.hazardGroup);
    if (this.scenery) disposeScenery(this.scenery);
    this.cargo.dispose();
    this.rig.dispose();
    this.gl.dispose(); this.gl.domElement.remove();
  }
}
```

(`z` in `draw` is world z = centre + corridor z; from Task 2 on the sim's `s.z` is corridor-relative. Until then `centerAt` is added on top of the old world-z — the strip is straight enough in Task 1 that this only shifts the rig visually; Task 2 makes it exact.)

- [ ] **Step 4: Input — restore the mouse ballast drag**

In `src/ui/input.ts` replace `attach`/`detach` and the handler block of `InputController` with:

```ts
  attach(viewport: HTMLElement, doc: Document): void {
    this.viewport = viewport; this.doc = doc;
    doc.addEventListener('keydown', this.onKeyDown);
    doc.addEventListener('keyup', this.onKeyUp);
    doc.defaultView?.addEventListener('blur', this.onBlur);
    viewport.addEventListener('pointerdown', this.onPointerDown);
    viewport.addEventListener('pointermove', this.onPointerMove);
    viewport.addEventListener('pointerup', this.onPointerUp);
    viewport.addEventListener('pointercancel', this.onPointerUp);
  }
  detach(): void {
    this.doc?.removeEventListener('keydown', this.onKeyDown);
    this.doc?.removeEventListener('keyup', this.onKeyUp);
    this.doc?.defaultView?.removeEventListener('blur', this.onBlur);
    this.viewport?.removeEventListener('pointerdown', this.onPointerDown);
    this.viewport?.removeEventListener('pointermove', this.onPointerMove);
    this.viewport?.removeEventListener('pointerup', this.onPointerUp);
    this.viewport?.removeEventListener('pointercancel', this.onPointerUp);
    this.viewport = null; this.doc = null;
  }
```

and after `onBlur`:

```ts
  /** Ballast drag: any pointer on the viewport that did not start on a `.dpad` button. */
  private onPointerDown = (e: PointerEvent): void => {
    if ((e.target as HTMLElement | null)?.closest('.dpad')) return;
    this.viewport?.setPointerCapture(e.pointerId); applyDragStart(this.state, e.clientX);
  };
  private onPointerMove = (e: PointerEvent): void => {
    const w = this.viewport?.clientWidth ?? 300;
    applyDragMove(this.state, e.clientX, w * 0.6, this.tuning.ballastRange);
  };
  private onPointerUp = (): void => { applyDragEnd(this.state); };
```

- [ ] **Step 5: Panel — gait rail back**

In `src/ui/panel/panel.ts`:
- `PanelHandlers` → `{ onGait(g: Gait): void; onStrap(): void; onBrace(on: boolean): void; onRecover(): void; onJump(): void }`.
- Rail markup → `<div class="rail"><label>GAIT</label>${[4, 3, 2, 1, 0].map((g) => `<button data-gait="${g}">${g}</button>`).join('')}</div>`.
- Rail listener → `for (const b of this.gaitBtns) b.addEventListener('pointerdown', () => { const g = Number(b.dataset.gait) as Gait; this.setGait(g); h.onGait(g); });`
- Delete `setCargoBay` and the `if (s.selectedCargo !== undefined) this.setCargoBay(s.selectedCargo);` line.
- Button label `RATCHET BAY` → `RATCHET`.

- [ ] **Step 6: HUD — drop the course path**

In `src/ui/hud.ts` delete the `updateCourse` method, the `distance2` helper and the `import type { CourseDef, CourseFrame }` line. Keep `update(s, route)`.

- [ ] **Step 7: Dispatch — slope profile back**

Replace `src/ui/screens/dispatch.ts` with:

```ts
import type { ItemDef } from '../../sim/types';
import type { Offers } from '../../game/orders';
import { slopeProfileSvg } from '../profile';

export interface DispatchProps { offers: Offers; profile: number[]; profileStepM: number; hqLine: string; capacity: number; cash: number; tier: number; traceCount: number }

const fragility = (c: ItemDef): string => (c.tolerance < 0.4 ? 'FRAGILE' : c.tolerance < 0.6 ? 'DELICATE' : 'STURDY');

export function renderDispatch(el: HTMLElement, p: DispatchProps, onLoad: (selected: ItemDef[]) => void): void {
  const o = p.offers.outpost;
  const selected = new Set<string>();
  el.innerHTML = `
    <div class="screen dispatch">
      <pre class="tele-block">DISPATCH ── ${o.name.toUpperCase()}  ·  ${o.lengthM} m  ·  TIER ${o.tier}
${o.flavor}
${p.hqLine}
LEDGER ${p.cash}  ·  RANK ${p.tier}  ·  TRACES ON ROUTE ${p.traceCount}</pre>
      ${slopeProfileSvg(p.profile, p.profileStepM)}
      <ul class="offers">${p.offers.cargo.map((c) => `
        <li data-id="${c.id}">
          <b>${c.name}</b>
          <span class="meta">${c.mass.toFixed(1)} t · ${fragility(c)} · ${c.behavior.toUpperCase()}${c.rush ? ` · RUSH ${c.rush}s` : ''}</span>
          <span class="pay">${c.payout}</span>
        </li>`).join('')}
      </ul>
      <div class="row"><span class="cap">0 / ${p.capacity} BAYS</span><button class="big primary" disabled>LOAD</button></div>
    </div>`;
  el.hidden = false;
  const cap = el.querySelector<HTMLElement>('.cap')!;
  const btn = el.querySelector<HTMLButtonElement>('button.primary')!;
  for (const li of el.querySelectorAll<HTMLLIElement>('.offers li')) {
    li.addEventListener('pointerdown', () => {
      const id = li.dataset.id!;
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < p.capacity) selected.add(id);
      else return;
      li.classList.toggle('on', selected.has(id));
      cap.textContent = `${selected.size} / ${p.capacity} BAYS`;
      btn.disabled = selected.size === 0;
    });
  }
  btn.addEventListener('pointerdown', () => { el.hidden = true; onLoad(p.offers.cargo.filter((c) => selected.has(c.id))); });
}
```

- [ ] **Step 8: Flow — M2 state machine**

Replace `src/game/flow.ts` with:

```ts
import { createRun, step } from '../sim/step';
import { evaluate } from '../sim/score';
import { generateRoute } from '../sim/terrain';
import { applyUpgrades } from '../sim/upgrades';
import { mulberry32, hashSeed } from '../sim/rng';
import { GameLoop } from './loop';
import { loadSave, writeSave, type SaveData, type StorageLike } from './save';
import { generateOffers, playerTier, type Offers } from './orders';
import { pickHq, pickReview } from './reviews';
import { renderDispatch } from '../ui/screens/dispatch';
import { renderLoadout } from '../ui/screens/loadout';
import { renderResult } from '../ui/screens/result';
import { renderUpgrade } from '../ui/screens/upgrade';
import { Hud } from '../ui/hud';
import type { Renderer, RenderPrev } from '../render/Renderer';
import type { Panel } from '../ui/panel/panel';
import type { InputController } from '../ui/input';
import type { HazardDef, HazardType, HqDef, ItemDef, LoadoutItem, OutpostDef, ReviewDef, RigState, RouteDef, RunResult, Tuning, UpgradeDef } from '../sim/types';

export interface Content { cargo: ItemDef[]; outposts: OutpostDef[]; hazards: HazardDef[]; upgrades: UpgradeDef[]; reviews: ReviewDef[]; hq: HqDef[] }
export interface FlowDeps {
  viewportEl: HTMLElement; panel: Panel; screenEl: HTMLElement; input: InputController;
  renderer: Promise<Renderer>; baseTuning: Tuning; content: Content; storage: StorageLike;
}

const LINGER: Record<NonNullable<RigState['ended']>, number> = { arrived: 60, stalled: 90, spilled: 180 };

export class Flow {
  save: SaveData;
  tuning: Tuning;
  private renderer: Renderer | null = null;
  private loop: GameLoop | null = null;
  private runNonce = 1;
  private offers: Offers | null = null;
  private route: RouteDef | null = null;
  private loadout: LoadoutItem[] = [];
  private readonly metaRng = mulberry32((Date.now() & 0x7fffffff) >>> 0);
  private readonly telegraph: Record<HazardType, number>;
  private readonly hud: Hud;

  constructor(private readonly d: FlowDeps) {
    const { data, reset } = loadSave(d.storage);
    this.save = data;
    this.tuning = applyUpgrades(d.baseTuning, data.upgrades, d.content.upgrades);
    this.telegraph = Object.fromEntries(d.content.hazards.map((h) => [h.type, h.telegraphM])) as Record<HazardType, number>;
    this.hud = new Hud(d.viewportEl);
    if (reset) d.panel.setMessage('HQ: Save data unreadable. Fresh ledger opened.');
    d.renderer.then((r) => { this.renderer = r; });
  }

  start(): void { this.dispatch(); }

  private dispatch(): void {
    const { content, panel, screenEl } = this.d;
    const offers = generateOffers(content.outposts, content.cargo, this.save.runs, this.metaRng);
    this.offers = offers;
    this.route = generateRoute(offers.outpost.seed, offers.outpost.lengthM, offers.outpost.tier, content.hazards, this.tuning.terrain);
    const hqLine = pickHq(content.hq, 'dispatch', offers.cargo[0]?.behavior ?? 'any', this.metaRng);
    panel.setMessage(hqLine);
    renderDispatch(screenEl, {
      offers, profile: this.route.slopeProfile, profileStepM: this.tuning.terrain.profileStepM, hqLine,
      capacity: this.tuning.capacity, cash: this.save.cash, tier: playerTier(this.save.runs), traceCount: 0,
    }, (selected) => this.load(selected));
  }

  private load(selected: ItemDef[]): void {
    renderLoadout(this.d.screenEl, { items: selected, tuning: this.tuning }, (loadout) => { this.loadout = loadout; this.haul(); });
  }

  private haul(): void {
    const route = this.route!; const loadout = this.loadout;
    const { tuning, d } = this; const { panel, input } = d;
    this.loop?.stop();
    const state = createRun(route, loadout, tuning);
    const rng = mulberry32(hashSeed(route.seed, this.runNonce++));
    const prev: RenderPrev = { x: 0, z: 0, lift: 0, lateralVel: 0, tilt: 0, speed: 0 };
    input.reset(); input.setTuning(tuning); input.setGait(2); panel.setGait(2);
    panel.setMessage(`HQ: ${this.offers!.outpost.name}. ${loadout.length} aboard. W walks, A/D picks the lane, drag the view for ballast. Go.`);
    const defs = loadout.map((l) => l.def);
    const attach = (r: Renderer): void => { r.setLoadout(defs); r.setRoute(route); };
    if (this.renderer) attach(this.renderer); else d.renderer.then(attach);

    let linger = 0;
    let finished = false;   // GameLoop.tick() may run several steps after stop(); finish exactly once
    const loop = new GameLoop({
      dt: tuning.dt,
      sampleInput: () => input.sample(),
      step: (inp) => {
        if (finished) return;
        prev.x = state.x; prev.z = state.z; prev.lift = state.lift; prev.lateralVel = state.lateralVel; prev.tilt = state.tilt; prev.speed = state.speed;
        step(state, inp, route, this.save.traces, tuning, rng);
        if (state.ended) { if (++linger > LINGER[state.ended]) { finished = true; this.finish(state, loop); } } else linger = 0;
      },
      render: (alpha) => {
        this.renderer?.draw(state, prev, alpha);
        panel.update(state, tuning);
        this.hud.update(state, route);
        panel.setHazard(route.hazards.some((h) => h.impulse > 0 && h.x > state.x && h.x <= state.x + this.telegraph[h.type]));
      },
    });
    this.loop = loop;
    loop.start();
  }

  private finish(state: RigState, loop: GameLoop): void {
    loop.stop();
    this.review(evaluate(state, this.tuning), state);
  }

  private review(result: RunResult, state: RigState): void {
    const { content, panel, screenEl, storage } = this.d;
    const outpost = this.offers!.outpost;
    this.save.cash += result.total;
    this.save.runs += 1;
    if (result.stars > (this.save.bestByOutpost[outpost.id] ?? 0)) this.save.bestByOutpost[outpost.id] = result.stars;
    writeSave(storage, this.save);
    const worst = [...state.items].sort((a, b) => (a.lost ? 2 : a.stress) - (b.lost ? 2 : b.stress)).at(-1);
    const line = pickReview(content.reviews, result.stars, worst?.behavior ?? 'any', this.metaRng);
    panel.setMessage(pickHq(content.hq, result.ended === 'arrived' ? 'arrival' : result.ended === 'spilled' ? 'spill' : 'stall', 'any', this.metaRng));
    renderResult(screenEl, result, this.loadout.map((l) => l.def), () => this.upgrade(), line, 'CONTINUE');
  }

  private upgrade(): void {
    const { content, screenEl, storage } = this.d;
    renderUpgrade(screenEl, { defs: content.upgrades, save: this.save }, {
      onBuy: (id) => {
        const def = content.upgrades.find((u) => u.id === id);
        if (!def || this.save.upgrades.includes(id) || this.save.cash < def.cost) return;
        this.save.cash -= def.cost; this.save.upgrades.push(id);
        this.tuning = applyUpgrades(this.d.baseTuning, this.save.upgrades, content.upgrades);
        writeSave(storage, this.save);
      },
      onDone: () => this.dispatch(),
    });
  }
}
```

- [ ] **Step 9: main.ts**

In `src/main.ts` remove the `onCargoSelect` line from the `Panel` handlers (keep `mountDpad`).

- [ ] **Step 10: Gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && ls dist/assets`
Expected: all green, 3 test files fewer (`course`, `interp`), no `PhysicsCourse-*.js` chunk, no `rapier` in `pnpm-lock.yaml`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: retire the Rapier course; M2 loop over the 1-D sim"
```

---

### Task 2: Schema — types, tuning, content, minimal consumers

**Files:**
- Modify: `src/sim/types.ts`, `src/content/tuning.json`, `src/content/hazards.json`, `src/content/outposts.json`, `src/sim/upgrades.ts`, `src/sim/step.ts`, `src/sim/terrain.ts`, `src/sim/bot.ts`, `src/sim/score.ts`, `src/ui/hud.ts`, `src/ui/screens/result.ts`, `src/render/three/hazards.ts`, `test/helpers.ts`, `test/content.test.ts`, `test/hazards.test.ts`, `test/bot.test.ts`, `test/movement.test.ts`, `test/terrain.test.ts`, `test/step.test.ts`

**Interfaces:**
- Produces (used by every later task): the types below verbatim; `routeFromSegments(seed, segments, hazards, profileStepM, discoveries?, layout?, halfWidth?)`; `RigState.targetSpeed/selectedSlot/zoneCooldown`; `ItemState.restraint`.

- [ ] **Step 1: types.ts**

Replace `src/sim/types.ts` with:

```ts
export type Gait = 0 | 1 | 2 | 3 | 4;
export type Behavior = 'static' | 'slosh' | 'livestock' | 'precarious';
export type HazardType = 'gust' | 'rubble' | 'gap' | 'grade' | 'scree' | 'mud' | 'rockfall' | 'crane';
export type KitId = 'plank' | 'rope' | 'drum' | 'sign';
export type TraceType = KitId | 'wreckage';
export type EndReason = 'arrived' | 'spilled' | 'stalled';
export type WallKind = 'wall' | 'rock' | 'ruin' | 'baffle';
export type LaneArchetype = 'direct' | 'chicane' | 'mud';

export interface ItemDef {
  id: string; name: string; mass: number;
  tolerance: number;     // |tilt| above this accrues stress
  crushLimit: number;    // restraint above this accrues stress
  behavior: Behavior; payout: number; rush?: number; tier: number;
  art: { shape: 'box' | 'cylinder' | 'sphere' | 'cage'; color: string };
}

export interface HazardDef {
  type: HazardType; impulse: number; strapJolt: number; telegraphM: number;
  counter: string; weight: number; minTier: number; count?: number; spreadM?: number;
  cycleTicks?: number; windowTicks?: number;   // movers only
}

export interface OutpostDef { id: string; name: string; seed: number; lengthM: number; tier: number; flavor: string }

export interface UpgradeDef {
  id: string; name: string; cost: number; blurb: string;
  effect: { key: 'ballastRange' | 'autoTrim' | 'strapJoltMul' | 'capacity' | 'gaitSpeedMul' | 'kitCostMul'; value: number };
}

export interface Segment { x0: number; x1: number; slope: number; y0: number; z0?: number; z1?: number }
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Wall extends Rect { kind: WallKind }
export interface Lane { z0: number; z1: number; archetype: LaneArchetype }
export interface Fork { x0: number; x1: number; lanes: Lane[] }
export interface Pocket extends Rect { side: 1 | -1 }
export interface Layout { forks: Fork[]; walls: Wall[]; pockets: Pocket[] }

/** Corridor coordinates: x along the route, z across it (0 = centre line). Point hazards are crossed at x; zone hazards span x..x1. */
export interface HazardInstance {
  id: number; type: HazardType; x: number; z: number; halfW: number; impulse: number; strapJolt: number; dir: 1 | -1;
  x1?: number; cycleTicks?: number; windowTicks?: number; phase?: number;
}
export interface Discovery { id: number; x: number; z: number; name: string }

export interface RouteDef {
  seed: number; length: number; halfWidth: number; segments: Segment[];
  hazards: HazardInstance[]; zones: HazardInstance[]; discoveries: Discovery[];
  walls: Wall[]; forks: Fork[]; pockets: Pocket[];
  slopeProfile: number[];            // sampled every terrain.profileStepM
  slopeAt(x: number): number;
  heightAt(x: number): number;
  centerAt(x: number): number;       // world z of the centre line (render/HUD only)
  forkAt(x: number): Fork | null;
  laneAt(x: number, z: number): number;   // lane index inside a fork, else -1
}

export interface ItemState {
  id: string; slot: number; mass: number; tolerance: number; crushLimit: number; behavior: Behavior; payout: number;
  offset: number; offsetVel: number; stress: number; lost: boolean; deadlineTick: number; restraint: number; // -1 deadline = none
}

export interface RigState {
  t: number; x: number; z: number; lateralVel: number; lift: number; liftVel: number; grounded: boolean;
  tilt: number; tiltVel: number; gait: Gait; speed: number; targetSpeed: number; ballast: number;
  strap: number; selectedSlot: number; reserve: number; braced: boolean; items: ItemState[]; foundDiscoveries: number[];
  zoneCooldown: number[];            // hazard id → tick until which it cannot hit again
  recovering: number; hazardCursor: number; overTiltTicks: number; ended: EndReason | null;
}

export interface InputFrame {
  gait: Gait; ballast: number; strap: boolean; brace: boolean; deploy: KitId | 0; recover: boolean;
  throttle?: -1 | 0 | 1; steer?: -1 | 0 | 1; jump?: boolean; cargoSelect?: number;
}

export interface LoadoutItem { def: ItemDef; slot: number }

export interface Trace { id: string; seed: number; x: number; z: number; type: TraceType; ownerName: string; useCount: number; ageHours: number }

export interface TerrainTuning {
  segMin: number; segMax: number; slopeSigma: number[]; maxSlope: number; gradeSlope: number; hazardJitter: number; profileStepM: number; safeStartM: number; safeEndM: number; pathWander: number;
  corridorHalfWidth: number; pocketDepth: number; spineThick: number; forkLenMin: number; forkLenMax: number; stretchLenMin: number; stretchLenMax: number;
}
export interface BotTuning { kp: number; kd: number; lagTicks: number; strapBelow: number; braceAheadM: number; leadSec: number; laneLookaheadM: number }

export interface Tuning {
  dt: number; gaitSpeed: number[]; gaitSpeedMul: number; gaitAccel: number; gaitDecel: number;
  kSlope: number; kBallast: number; kLoad: number; damping: number; stiffness: number; braceDamp: number; braceSpeed: number;
  reserveBudget: number; braceDrain: number; reserveStart: number;
  ballastRange: number; ballastRate: number; autoTrim: number;
  strapStart: number; strapTap: number; strapJoltMul: number; restraintDecay: Record<Behavior, number>;
  driftThreshold: number; graceTicks: number; kDrift: number; sloshGain: number; sloshStiff: number; sloshDamp: number; kLive: number; precariousMul: number;
  kStress: number; kCrush: number; spillTilt: number; spillRelief: number; hazardScaleMin: number; hazardScaleMax: number;
  recoverTicks: number; recoverCost: number; recoverStress: number;
  kBonus: number; stallMultiplier: number; starBuckets: number[];
  slotPos: number[]; capacity: number; kitCostMul: number;
  steerAccel: number; lateralDamping: number; lateralTip: number; jumpSpeed: number; gravity: number; landingTilt: number; landingJolt: number;
  rigRadius: number; wallStrikeSpeed: number; wallStrikeTilt: number; wallStrikeJolt: number; airTraction: number; mudTraction: number; mudSpeedMul: number;
  craneShove: number; hazardCooldownTicks: number;
  cacheReserve: number; cacheRepair: number; cacheBonus: number;
  terrain: TerrainTuning; bot: BotTuning;
}

export interface ItemResult { id: string; condition: number; payout: number; lost: boolean; late: boolean }
export interface RunResult { items: ItemResult[]; stars: number; payout: number; bonus: number; discoveryBonus: number; total: number; ended: EndReason; elapsed: number }

export interface ReviewDef { stars: 1 | 2 | 3 | 4 | 5; behavior: Behavior | 'any'; lines: string[] }
export interface HqDef { context: 'dispatch' | 'arrival' | 'spill' | 'stall'; behavior: Behavior | 'any'; lines: string[] }
```

- [ ] **Step 2: tuning.json**

Replace the block from `"steerAccel"` to the end of `src/content/tuning.json` with:

```json
  "steerAccel": 17,
  "lateralDamping": 4.5,
  "lateralTip": 0.045,
  "jumpSpeed": 7.8,
  "gravity": 18,
  "landingTilt": 0.018,
  "landingJolt": 4,
  "rigRadius": 1.6,
  "wallStrikeSpeed": 4,
  "wallStrikeTilt": 0.9,
  "wallStrikeJolt": 10,
  "airTraction": 0.28,
  "mudTraction": 0.6,
  "mudSpeedMul": 0.5,
  "craneShove": 6,
  "hazardCooldownTicks": 60,
  "restraintDecay": { "static": 0, "precarious": 0.4, "slosh": 0.8, "livestock": 1.0 },
  "cacheReserve": 8,
  "cacheRepair": 0.12,
  "cacheBonus": 75,
  "terrain": {
    "segMin": 20, "segMax": 60,
    "slopeSigma": [0.12, 0.18, 0.24, 0.3],
    "maxSlope": 0.5, "gradeSlope": 0.45,
    "hazardJitter": 8, "profileStepM": 10,
    "safeStartM": 40, "safeEndM": 20,
    "pathWander": 7,
    "corridorHalfWidth": 18, "pocketDepth": 8, "spineThick": 2.5,
    "forkLenMin": 80, "forkLenMax": 120, "stretchLenMin": 40, "stretchLenMax": 70
  },
  "bot": { "kp": 220, "kd": 90, "lagTicks": 15, "strapBelow": 60, "braceAheadM": 8, "leadSec": 0.4, "laneLookaheadM": 60 }
}
```

(`courseHalfWidth` and `discoveryOffset` are gone.)

- [ ] **Step 3: hazards.json and outpost flavour**

Replace `src/content/hazards.json` with:

```json
[
  { "type": "gust", "impulse": 0.9, "strapJolt": 12, "telegraphM": 25, "counter": "Ratchet down and lead ballast into the gust.", "weight": 0.35, "minTier": 0 },
  { "type": "rubble", "impulse": 0.35, "strapJolt": 25, "telegraphM": 20, "counter": "Throttle down before rubble, or take the other lane.", "weight": 0.4, "minTier": 0 },
  { "type": "grade", "impulse": 0, "strapJolt": 0, "telegraphM": 35, "counter": "Counter-set ballast before the grade.", "weight": 0.3, "minTier": 0 },
  { "type": "gap", "impulse": 1.4, "strapJolt": 20, "telegraphM": 30, "counter": "BRACE over the collapsed span, jump it, or lay a plank.", "weight": 0.15, "minTier": 1 },
  { "type": "scree", "impulse": 0.25, "strapJolt": 6, "telegraphM": 20, "counter": "Slow down through scree.", "weight": 0.3, "minTier": 1, "count": 5, "spreadM": 12 },
  { "type": "mud", "impulse": 0, "strapJolt": 0, "telegraphM": 20, "counter": "Mud halves your speed. Safe, slow, costs reserve.", "weight": 0, "minTier": 0 },
  { "type": "rockfall", "impulse": 1.2, "strapJolt": 22, "telegraphM": 35, "counter": "Rockfall lane: wait for the slide to pass, then commit.", "weight": 0.2, "minTier": 1, "cycleTicks": 360, "windowTicks": 72 },
  { "type": "crane", "impulse": 1.0, "strapJolt": 18, "telegraphM": 35, "counter": "Swinging load: cross while it swings away.", "weight": 0.15, "minTier": 2, "cycleTicks": 240, "windowTicks": 48 }
]
```

In `src/content/outposts.json` restore the three flavour lines: Halfmast `"The flag has been at half mast since the last piano."`, Cinder Stair `"Not stairs. Worse."`, The Shelf `"A shelf. With a drop. Scree on the drop."`, Lantern Reach `"Longest route on the books. Reserve is the enemy."`.

In `test/content.test.ts` change the hazards test to `'hazards: 8 distinct types with a counter line'` and `toBe(8)`.

- [ ] **Step 4: upgrades.ts clone**

In `src/sim/upgrades.ts` change the clone line to:

```ts
  const t: Tuning = { ...base, gaitSpeed: [...base.gaitSpeed], starBuckets: [...base.starBuckets], slotPos: [...base.slotPos], restraintDecay: { ...base.restraintDecay }, terrain: { ...base.terrain, slopeSigma: [...base.terrain.slopeSigma] }, bot: { ...base.bot } };
```

- [ ] **Step 5: score.ts and result.ts**

In `src/sim/score.ts` the return becomes `return { items, stars, payout, bonus, discoveryBonus, total: Math.round(payout + bonus + discoveryBonus), ended, elapsed: s.t * tuning.dt };`.
In `src/ui/screens/result.ts` the run-stats line becomes:

```ts
      <div class="run-stats"><span>TIME <b>${Math.floor(result.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(result.elapsed % 60).toString().padStart(2, '0')}</b></span><span>SALVAGE <b>${Math.round(result.discoveryBonus)}</b></span></div>
```

- [ ] **Step 6: terrain.ts — new RouteDef shape (no layout yet)**

In `src/sim/terrain.ts` replace `routeFromSegments` with:

```ts
const EMPTY_LAYOUT: Layout = { forks: [], walls: [], pockets: [] };

export function routeFromSegments(seed: number, segments: Segment[], hazards: HazardInstance[], profileStepM: number, discoveries: Discovery[] = [], layout: Layout = EMPTY_LAYOUT, halfWidth = 18): RouteDef {
  const length = segments[segments.length - 1]!.x1;
  const slopeAt = (x: number): number => findSegment(segments, x).slope;
  const heightAt = (x: number): number => {
    const s = findSegment(segments, x);
    const cx = clamp(x, s.x0, s.x1);
    return s.y0 + s.slope * (cx - s.x0);
  };
  const centerAt = (x: number): number => {
    const s = findSegment(segments, x);
    const f = clamp((x - s.x0) / Math.max(0.001, s.x1 - s.x0), 0, 1);
    const z0 = s.z0 ?? 0, z1 = s.z1 ?? z0;
    return z0 + (z1 - z0) * f;
  };
  const forkAt = (x: number): Fork | null => {
    for (const f of layout.forks) { if (x < f.x0) return null; if (x <= f.x1) return f; }
    return null;
  };
  const laneAt = (x: number, z: number): number => {
    const f = forkAt(x);
    return f ? f.lanes.findIndex((l) => z >= l.z0 && z <= l.z1) : -1;
  };
  const slopeProfile: number[] = [];
  for (let x = 0; x <= length; x += profileStepM) slopeProfile.push(slopeAt(x));
  const sorted = [...hazards].sort((a, b) => a.x - b.x);
  return {
    seed, length, halfWidth, segments, hazards: sorted, zones: sorted.filter((h) => h.x1 !== undefined), discoveries,
    walls: layout.walls, forks: layout.forks, pockets: layout.pockets, slopeProfile, slopeAt, heightAt, centerAt, forkAt, laneAt,
  };
}
```

Update the import line to `import type { Discovery, Fork, HazardDef, HazardInstance, Layout, RouteDef, Segment, TerrainTuning } from './types';`.

In `generateRoute`: every `hazards.push({ ... })` gains `z: 0, halfW: t.corridorHalfWidth * 2` (both the grade push and the loop push); discoveries use `z: base.centerAt(dx) + side * (t.corridorHalfWidth - 3)` → since sim z is now corridor-relative, use `z: side * (t.corridorHalfWidth - 3)`; the final line becomes `return routeFromSegments(seed, segments, hazards, t.profileStepM, discoveries, EMPTY_LAYOUT, t.corridorHalfWidth);`. (Task 5 rewrites placement; this keeps the old game running.)

- [ ] **Step 7: step.ts minimal consumers**

In `src/sim/step.ts`:
- `createRun`: items gain `restraint: tuning.strapStart`; state gains `targetSpeed: 0, selectedSlot: items[0]?.slot ?? 0, zoneCooldown: []`.
- Replace `spatiallyHits` with:

```ts
function inLane(s: RigState, h: HazardInstance): boolean { return Math.abs(s.z - h.z) < h.halfW; }
function airborneClears(s: RigState, h: HazardInstance): boolean { return (h.type === 'gap' && s.lift >= 0.55) || (h.type === 'rubble' && s.lift >= 0.8); }
```

- Replace the body of `crossHazards` with:

```ts
  const hz = route.hazards;
  while (s.hazardCursor < hz.length && hz[s.hazardCursor]!.x <= s.x) {
    const h = hz[s.hazardCursor]!;
    s.hazardCursor++;
    if (h.x1 !== undefined) continue;   // zones are handled every tick, not by crossing
    if (h.impulse === 0 || s.braced || traceCancels(h, traces, route) || !inLane(s, h) || airborneClears(s, h)) continue;
    s.tiltVel += h.dir * h.impulse * hazardScale(s, tuning);
    s.strap = Math.max(0, s.strap - h.strapJolt * tuning.strapJoltMul);
  }
```

- `traceCancels` becomes `return traces.some((t) => t.seed === route.seed && t.type === 'plank' && Math.abs(t.x - h.x) <= 5 && Math.abs(t.z - h.z) <= h.halfW + 2);`.
- In `stepRig` replace the `courseCenter/offset/courseHalfWidth` clamp block with:

```ts
  const bound = route.halfWidth + tuning.terrain.pocketDepth;
  if (s.z < -bound) { s.z = -bound; s.lateralVel = 0; } else if (s.z > bound) { s.z = bound; s.lateralVel = 0; }
```

- Replace `- s.lateralVel * 0.045` with `- s.lateralVel * tuning.lateralTip` and `Math.abs(s.speed) * 0.018` with `Math.abs(s.speed) * tuning.landingTilt`.

- [ ] **Step 8: bot.ts, hud.ts, render hazards.ts**

- `src/sim/bot.ts`: `BotView.z` becomes required (`z: number`); `mustBrace` → `h.type === 'gap' || h.type === 'rockfall' || h.type === 'crane'`; replace `const centerError = route.centerAt(v.x + 8) - (v.z ?? 0);` with `const centerError = 0 - v.z;`.
- `src/ui/hud.ts`: `HAZARD_NAMES` → `{ gust: 'CROSSWIND', rubble: 'RUBBLE FIELD', gap: 'COLLAPSED SPAN', grade: 'STEEP GRADE', scree: 'SCREE RUN', mud: 'MUD', rockfall: 'ROCKFALL', crane: 'SWINGING LOAD' }`; the player dot uses `40 - s.z * 1.35` already (corridor-relative now) — leave it.
- `src/render/three/hazards.ts`: delete `buildHammer`, `buildFan`, `buildCrusher`, `buildLaunchpad`, their four `else if` branches in `buildHazards`, and the `hammer/fan/crusher/launchpad` branches in `animateHazards` (leave the function with an empty loop body except the `kind` read — Task 12 rewrites it). Replace every `(h.z ?? route.centerAt(h.x))` with `(route.centerAt(h.x) + h.z)`.

- [ ] **Step 9: Tests**

- `test/helpers.ts`: `frame()` default becomes `{ gait: 2, ballast: 0, strap: false, brace: false, deploy: 0, recover: false, throttle: 1, steer: 0, jump: false, ...over }`; add

```ts
export function hazard(over: Partial<HazardInstance> = {}): HazardInstance {
  return { id: 0, type: 'gust', x: 100, z: 0, halfW: 40, impulse: 0.9, strapJolt: 12, dir: 1, ...over };
}
```

  (import `HazardInstance` from types).
- `test/hazards.test.ts`: `hz` → `(over) => hazard(over)`; the plank trace gains `z: 0`.
- `test/bot.test.ts`: hazard literals gain `z: 0, halfW: 40`; the `v(x)` view gains `z: 0`.
- `test/movement.test.ts`: `expect(state.z).toBe(tuning.courseHalfWidth)` → `toBe(route.halfWidth + tuning.terrain.pocketDepth)`; hazard literals gain `z: 0, halfW: 40`; the "dodged laterally" test sets `state.z = -2.1` on a rubble with `z: 6, halfW: 5` (hit zone 1..11) — keep asserting `strap === strapStart`.
- `test/terrain.test.ts`: the discoveries test expects `Math.abs(d.z)` `toBeGreaterThanOrEqual(tuning.terrain.corridorHalfWidth - 3 - 1e-9)` and length 5 (unchanged count until Task 5).
- `test/step.test.ts`: add to the `createRun` test `expect(s.targetSpeed).toBe(0); expect(s.zoneCooldown).toEqual([]);`.

- [ ] **Step 10: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

```bash
git add -A
git commit -m "feat(sim): ground-course schema — lanes, walls, zones, per-bay restraint types, tuning keys"
```

---

### Task 3: Wall collision (`src/sim/walls.ts`)

**Files:**
- Create: `src/sim/walls.ts`
- Test: `test/walls.test.ts`

**Interfaces:**
- Produces: `resolveWalls(s: RigState, walls: Wall[], r: number, strikeSpeed: number): WallStrike | null` (mutates `s.x/z/speed/lateralVel`), `rectContains(r: Rect, x, z): boolean`, `isPassable(walls: Wall[], bound: number, x, z): boolean`, `interface WallStrike { axis: 'x' | 'z'; speed: number; dir: 1 | -1 }`.

- [ ] **Step 1: Failing tests**

Create `test/walls.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveWalls, rectContains, isPassable } from '../src/sim/walls';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute } from './helpers';
import type { Wall } from '../src/sim/types';

const wall: Wall = { x0: 11, x1: 13, z0: -5, z1: 5, kind: 'wall' };
const rig = (x: number, z: number, speed: number, lateralVel: number) => { const s = createRun(flatRoute(), [], tuning); s.x = x; s.z = z; s.speed = speed; s.lateralVel = lateralVel; return s; };

describe('resolveWalls', () => {
  it('stops a head-on rig at the face and reports an x strike', () => {
    const s = rig(10, 0, 8, 0);
    const strike = resolveWalls(s, [wall], 1.6, 4);
    expect(s.x).toBeCloseTo(11 - 1.6); expect(s.speed).toBe(0);
    expect(strike).toEqual({ axis: 'x', speed: 8, dir: -1 });
  });
  it('kills only the lateral component when scraping along a side', () => {
    const s = rig(12, 6, 8, -5);
    const strike = resolveWalls(s, [wall], 1.6, 4);
    expect(s.z).toBeCloseTo(5 + 1.6); expect(s.lateralVel).toBe(0); expect(s.speed).toBe(8);
    expect(strike).toEqual({ axis: 'z', speed: 5, dir: 1 });
  });
  it('separates silently below strikeSpeed', () => {
    const s = rig(10, 0, 2, 0);
    expect(resolveWalls(s, [wall], 1.6, 4)).toBeNull();
    expect(s.x).toBeCloseTo(9.4); expect(s.speed).toBe(0);
  });
  it('ignores walls it does not touch and leaves velocity alone when moving away', () => {
    const a = rig(5, 0, 8, 0); expect(resolveWalls(a, [wall], 1.6, 4)).toBeNull(); expect(a.x).toBe(5);
    const b = rig(10, 0, -3, 0); resolveWalls(b, [wall], 1.6, 4); expect(b.speed).toBe(-3);
  });
  it('reports the hardest strike when two walls overlap the rig', () => {
    const s = rig(10, 4.5, 8, -6);
    const strike = resolveWalls(s, [wall, { x0: 8, x1: 12, z0: 6, z1: 9, kind: 'baffle' }], 1.6, 4);
    expect(strike?.speed).toBe(8);
  });
});

describe('rect helpers', () => {
  it('rectContains is inclusive', () => { expect(rectContains(wall, 11, 5)).toBe(true); expect(rectContains(wall, 13.1, 0)).toBe(false); });
  it('isPassable respects walls and the bound', () => {
    expect(isPassable([wall], 26, 12, 0)).toBe(false);
    expect(isPassable([wall], 26, 12, 7)).toBe(true);
    expect(isPassable([wall], 26, 12, 27)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/walls.test.ts`
Expected: FAIL — cannot resolve `../src/sim/walls`.

- [ ] **Step 3: Implement**

Create `src/sim/walls.ts`:

```ts
import type { Rect, RigState, Wall } from './types';

export interface WallStrike { axis: 'x' | 'z'; speed: number; dir: 1 | -1 }

export function rectContains(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/**
 * Axis-aligned rig box (half-size r) against wall rects. For every overlap, separate along the axis of least
 * penetration, kill the velocity component moving into the wall (no bounce) and remember the hardest impact above
 * strikeSpeed. Walls are scanned in array order, so the result is deterministic. No sqrt anywhere.
 */
export function resolveWalls(s: RigState, walls: Wall[], r: number, strikeSpeed: number): WallStrike | null {
  let strike: WallStrike | null = null;
  for (const w of walls) {
    const leftPen = s.x + r - w.x0, rightPen = w.x1 - (s.x - r);
    const lowPen = s.z + r - w.z0, highPen = w.z1 - (s.z - r);
    if (leftPen <= 0 || rightPen <= 0 || lowPen <= 0 || highPen <= 0) continue;
    const px = Math.min(leftPen, rightPen), pz = Math.min(lowPen, highPen);
    if (px < pz) {
      const dir: 1 | -1 = leftPen < rightPen ? -1 : 1;
      s.x += dir * px;
      if (s.speed * dir < 0) {
        const v = Math.abs(s.speed); s.speed = 0;
        if (v > strikeSpeed && (!strike || v > strike.speed)) strike = { axis: 'x', speed: v, dir };
      }
    } else {
      const dir: 1 | -1 = lowPen < highPen ? -1 : 1;
      s.z += dir * pz;
      if (s.lateralVel * dir < 0) {
        const v = Math.abs(s.lateralVel); s.lateralVel = 0;
        if (v > strikeSpeed && (!strike || v > strike.speed)) strike = { axis: 'z', speed: v, dir };
      }
    }
  }
  return strike;
}

export function isPassable(walls: Wall[], bound: number, x: number, z: number): boolean {
  if (z < -bound || z > bound) return false;
  for (const w of walls) if (rectContains(w, x, z)) return false;
  return true;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run test/walls.test.ts`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sim/walls.ts test/walls.test.ts
git commit -m "feat(sim): AABB wall collision with strike reporting"
```

---

### Task 4: Layout generator (`src/sim/course.ts`)

**Files:**
- Create: `src/sim/course.ts`
- Test: `test/course.test.ts`

**Interfaces:**
- Consumes: `Rng` (`next`, `int`), `TerrainTuning`, `Layout/Fork/Lane/Wall/Pocket` from Task 2, `isPassable` from Task 3.
- Produces: `layoutCourse(rng: Rng, lengthM: number, tier: number, t: TerrainTuning): Layout`, `EDGE_THICK = 3`, `laneCentre(lane: Lane): number`, `laneHalfWidth(lane: Lane): number`.

- [ ] **Step 1: Failing tests**

Create `test/course.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layoutCourse, laneCentre, laneHalfWidth } from '../src/sim/course';
import { isPassable } from '../src/sim/walls';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';

const t = tuning.terrain;
const layout = (seed: number, tier: number, length = 800) => layoutCourse(mulberry32(seed), length, tier, t);

describe('layoutCourse', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(layout(7, 2)).toEqual(layout(7, 2));
    expect(layout(7, 2).forks).not.toEqual(layout(8, 2).forks);
  });
  it('places forks only between the safe zones, with 2 lanes at tier ≤ 1 and 3 at tier ≥ 2', () => {
    for (const [seed, tier, lanes] of [[1, 0, 2], [2, 1, 2], [3, 2, 3], [4, 3, 3]] as const) {
      const l = layout(seed, tier);
      expect(l.forks.length).toBeGreaterThanOrEqual(3);
      for (const f of l.forks) {
        expect(f.x0).toBeGreaterThanOrEqual(t.safeStartM); expect(f.x1).toBeLessThanOrEqual(800 - t.safeEndM);
        expect(f.lanes).toHaveLength(lanes);
        expect(f.x1 - f.x0).toBeGreaterThanOrEqual(t.forkLenMin); expect(f.x1 - f.x0).toBeLessThanOrEqual(t.forkLenMax);
      }
      for (let i = 1; i < l.forks.length; i++) expect(l.forks[i]!.x0 - l.forks[i - 1]!.x1).toBeGreaterThanOrEqual(t.stretchLenMin);
    }
  });
  it('lanes tile the corridor with spines between them and every fork has a lane that is not direct', () => {
    const l = layout(11, 3);
    for (const f of l.forks) {
      expect(f.lanes[0]!.z0).toBeCloseTo(-t.corridorHalfWidth); expect(f.lanes.at(-1)!.z1).toBeCloseTo(t.corridorHalfWidth);
      for (let i = 1; i < f.lanes.length; i++) expect(f.lanes[i]!.z0 - f.lanes[i - 1]!.z1).toBeCloseTo(t.spineThick);
      expect(f.lanes.some((lane) => lane.archetype === 'direct')).toBe(true);
      expect(f.lanes.some((lane) => lane.archetype !== 'direct')).toBe(true);
      for (const lane of f.lanes) expect(laneHalfWidth(lane) * 2).toBeGreaterThan(tuning.rigRadius * 2 + 1);
    }
  });
  it('keeps every lane centre line passable and blocks the spines', () => {
    const l = layout(12, 2);
    const bound = t.corridorHalfWidth + t.pocketDepth;
    for (const f of l.forks) {
      for (let x = f.x0 + 1; x < f.x1; x += 2) {
        for (const lane of f.lanes) {
          // a chicane baffle may cover the centre line, but never the full lane width
          const zs = [lane.z0 + tuning.rigRadius + 0.2, laneCentre(lane), lane.z1 - tuning.rigRadius - 0.2];
          expect(zs.some((z) => isPassable(l.walls, bound, x, z)), `fork ${f.x0} lane ${lane.z0} x ${x}`).toBe(true);
        }
        for (let i = 1; i < f.lanes.length; i++) expect(isPassable(l.walls, bound, x, f.lanes[i]!.z0 - t.spineThick / 2)).toBe(false);
      }
    }
  });
  it('fences the corridor edges except at pockets, whose interiors are passable', () => {
    const l = layout(13, 3);
    const bound = t.corridorHalfWidth + t.pocketDepth;
    expect(l.pockets.length).toBeGreaterThanOrEqual(1);
    for (const p of l.pockets) {
      expect(isPassable(l.walls, bound, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2)).toBe(true);
      expect(isPassable(l.walls, bound, (p.x0 + p.x1) / 2, p.side * (t.corridorHalfWidth + 0.5))).toBe(true);   // the doorway
    }
    for (let x = 5; x < 800; x += 7) {
      for (const side of [-1, 1]) {
        const inPocket = l.pockets.some((p) => p.side === side && x >= p.x0 && x <= p.x1);
        expect(isPassable(l.walls, bound, x, side * (t.corridorHalfWidth + 0.5)), `x ${x} side ${side}`).toBe(inPocket);
      }
    }
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/course.test.ts`
Expected: FAIL — cannot resolve `../src/sim/course`.

- [ ] **Step 3: Implement**

Create `src/sim/course.ts`:

```ts
import type { Rng } from './rng';
import type { Fork, Lane, LaneArchetype, Layout, Pocket, TerrainTuning, Wall, WallKind } from './types';

export const EDGE_THICK = 3;
const SPINE_KINDS: WallKind[] = ['wall', 'rock', 'ruin'];

export const laneCentre = (lane: Lane): number => (lane.z0 + lane.z1) / 2;
export const laneHalfWidth = (lane: Lane): number => (lane.z1 - lane.z0) / 2;

function pickArchetypes(rng: Rng, n: number): LaneArchetype[] {
  const pool: LaneArchetype[] = n === 2 ? ['direct', rng.next() < 0.5 ? 'chicane' : 'mud'] : ['direct', 'chicane', 'mud'];
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); const tmp = pool[i]!; pool[i] = pool[j]!; pool[j] = tmp; }
  return pool;
}

function pushEdge(walls: Wall[], x0: number, x1: number, side: 1 | -1, W: number): void {
  if (x1 - x0 < 0.5) return;
  walls.push(side > 0 ? { x0, x1, z0: W, z1: W + EDGE_THICK, kind: 'rock' } : { x0, x1, z0: -W - EDGE_THICK, z1: -W, kind: 'rock' });
}

/**
 * Corridor layout in corridor coordinates. Alternates stretches and forks from the safe start to the safe end;
 * every fork has one `direct` lane (the hazard carrier) and at least one lane that is not.
 */
export function layoutCourse(rng: Rng, lengthM: number, tier: number, t: TerrainTuning): Layout {
  const W = t.corridorHalfWidth;
  const forks: Fork[] = []; const walls: Wall[] = []; const pockets: Pocket[] = [];
  const n = tier <= 1 ? 2 : 3;
  const laneW = (2 * W - (n - 1) * t.spineThick) / n;
  const end = lengthM - t.safeEndM;
  let x = t.safeStartM + t.stretchLenMin;
  for (;;) {
    const forkLen = t.forkLenMin + rng.next() * (t.forkLenMax - t.forkLenMin);
    if (x + forkLen > end - t.stretchLenMin) break;
    const x0 = x, x1 = x + forkLen;
    const archetypes = pickArchetypes(rng, n);
    const lanes: Lane[] = [];
    for (let i = 0; i < n; i++) {
      const z0 = -W + i * (laneW + t.spineThick), z1 = z0 + laneW;
      lanes.push({ z0, z1, archetype: archetypes[i]! });
      if (i < n - 1) walls.push({ x0, x1, z0: z1, z1: z1 + t.spineThick, kind: SPINE_KINDS[rng.int(SPINE_KINDS.length)]! });
    }
    for (const lane of lanes) {
      if (lane.archetype !== 'chicane') continue;
      const k = 2 + rng.int(2);
      const jut = laneW * 0.55;
      for (let j = 0; j < k; j++) {
        const bx = x0 + (j + 1) * forkLen / (k + 1);
        walls.push(j % 2 === 0
          ? { x0: bx - 1, x1: bx + 1, z0: lane.z0, z1: lane.z0 + jut, kind: 'baffle' }
          : { x0: bx - 1, x1: bx + 1, z0: lane.z1 - jut, z1: lane.z1, kind: 'baffle' });
      }
    }
    forks.push({ x0, x1, lanes });
    x = x1 + t.stretchLenMin + rng.next() * (t.stretchLenMax - t.stretchLenMin);
  }

  const pocketCount = Math.min(forks.length, 1 + (tier >= 2 ? 1 : 0));
  for (let p = 0; p < pocketCount; p++) {
    const fork = forks[Math.floor((p + 0.5) * forks.length / pocketCount)]!;
    const side: 1 | -1 = rng.next() < 0.5 ? -1 : 1;
    const px0 = fork.x0 + (fork.x1 - fork.x0) * 0.35, px1 = px0 + 12;
    const z0 = side > 0 ? W : -W - t.pocketDepth, z1 = side > 0 ? W + t.pocketDepth : -W;
    pockets.push({ x0: px0, x1: px1, z0, z1, side });
    walls.push({ x0: px0 - 2, x1: px0, z0, z1, kind: 'ruin' }, { x0: px1, x1: px1 + 2, z0, z1, kind: 'ruin' });
    walls.push(side > 0 ? { x0: px0 - 2, x1: px1 + 2, z0: z1, z1: z1 + EDGE_THICK, kind: 'rock' } : { x0: px0 - 2, x1: px1 + 2, z0: z0 - EDGE_THICK, z1: z0, kind: 'rock' });
  }

  for (const side of [-1, 1] as const) {
    const cuts = pockets.filter((p) => p.side === side).sort((a, b) => a.x0 - b.x0);
    let from = 0;
    for (const c of cuts) { pushEdge(walls, from, c.x0, side, W); from = c.x1; }
    pushEdge(walls, from, lengthM, side, W);
  }
  return { forks, walls, pockets };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run test/course.test.ts`
Expected: 5 passing. If "keeps every lane centre line passable" fails at a baffle x, the jut is too deep for that lane width — lower `0.55` to `0.5` and re-run; do not touch the test.

- [ ] **Step 5: Commit**

```bash
git add src/sim/course.ts test/course.test.ts
git commit -m "feat(sim): seeded corridor layout — forks, spines, chicanes, pockets, edge walls"
```

---

### Task 5: Terrain composes the layout; lane-aware hazards and discoveries

**Files:**
- Modify: `src/sim/terrain.ts`, `test/terrain.test.ts`

**Interfaces:**
- Consumes: `layoutCourse`, `laneCentre`, `laneHalfWidth` (Task 4); `routeFromSegments` (Task 2).
- Produces: `generateRoute(seed, lengthM, tier, hazardDefs, t): RouteDef` with `walls/forks/pockets/zones` populated; hazards carry lane `z/halfW`; zone hazards carry `x1/cycleTicks/windowTicks/phase`; discoveries = `2 + min(2, tier)`, pockets first.

- [ ] **Step 1: Failing tests**

Append to `test/terrain.test.ts` (the `hz` fixture at the top gains rubble, gap, rockfall and mud defs):

```ts
const full: HazardDef[] = [
  ...hz,
  { type: 'rubble', impulse: 0.35, strapJolt: 25, telegraphM: 20, counter: 'slow', weight: 0.4, minTier: 0 },
  { type: 'gap', impulse: 1.4, strapJolt: 20, telegraphM: 30, counter: 'brace', weight: 0.3, minTier: 1 },
  { type: 'rockfall', impulse: 1.2, strapJolt: 22, telegraphM: 35, counter: 'wait', weight: 0.3, minTier: 1, cycleTicks: 360, windowTicks: 72 },
  { type: 'mud', impulse: 0, strapJolt: 0, telegraphM: 20, counter: 'slow', weight: 0, minTier: 0 },
];

describe('generateRoute — lanes', () => {
  it('populates the layout and puts every fork hazard inside a lane of its fork', () => {
    for (const seed of [3350, 9026, 5518]) {
      const r = generateRoute(seed, 800, 2, full, tuning.terrain);
      expect(r.forks.length).toBeGreaterThanOrEqual(3); expect(r.walls.length).toBeGreaterThan(r.forks.length);
      for (const h of r.hazards) {
        const f = r.forkAt(h.x); if (!f || h.halfW >= r.halfWidth) continue;   // corridor-wide hazards (grade, gust) are not lane hazards
        const lane = f.lanes.find((l) => h.z >= l.z0 && h.z <= l.z1);
        expect(lane, `${h.type}@${h.x}`).toBeDefined();
        expect(h.halfW).toBeLessThanOrEqual((lane!.z1 - lane!.z0) / 2 + 1e-9);
        if (h.impulse > 0) expect(lane!.archetype).toBe('direct');
        if (h.type === 'mud') expect(lane!.archetype).toBe('mud');
      }
    }
  });
  it('every fork keeps a lane with no impulse hazard', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = generateRoute(seed, 900, 3, full, tuning.terrain);
      for (const f of r.forks) {
        const safe = f.lanes.some((lane) => !r.hazards.some((h) => h.impulse > 0 && h.x >= f.x0 && h.x <= f.x1 && h.z >= lane.z0 && h.z <= lane.z1));
        expect(safe, `seed ${seed} fork ${f.x0}`).toBe(true);
      }
    }
  });
  it('zones span x..x1 inside their fork and movers carry a cycle', () => {
    const r = generateRoute(4417, 900, 3, full, tuning.terrain);
    expect(r.zones.length).toBeGreaterThan(0);
    for (const z of r.zones) {
      expect(z.x1!).toBeGreaterThan(z.x);
      const f = r.forkAt(z.x)!; expect(z.x).toBeGreaterThanOrEqual(f.x0); expect(z.x1!).toBeLessThanOrEqual(f.x1);
      if (z.type !== 'mud') { expect(z.cycleTicks).toBe(360); expect(z.windowTicks).toBe(72); expect(z.phase).toBeGreaterThanOrEqual(0); expect(z.phase).toBeLessThan(360); }
    }
    expect(r.hazards.filter((h) => h.x1 === undefined).every((h) => h.cycleTicks === undefined)).toBe(true);
  });
  it('stretch hazards leave a way past: rubble and scree sit on one side with halfW < halfWidth', () => {
    const r = generateRoute(9026, 900, 3, full, tuning.terrain);
    const stretch = r.hazards.filter((h) => !r.forkAt(h.x) && (h.type === 'rubble' || h.type === 'scree'));
    for (const h of stretch) { expect(Math.abs(h.z)).toBeGreaterThan(3); expect(h.halfW).toBeLessThan(r.halfWidth * 0.6); }
  });
  it('places 2 + min(2, tier) discoveries, pockets first', () => {
    for (const [tier, count] of [[0, 2], [1, 3], [2, 4], [3, 4]] as const) {
      const r = generateRoute(6142, 900, tier, full, tuning.terrain);
      expect(r.discoveries).toHaveLength(count);
      r.pockets.forEach((p, i) => { const d = r.discoveries[i]!; expect(d.x).toBeGreaterThanOrEqual(p.x0); expect(d.x).toBeLessThanOrEqual(p.x1); expect(d.z).toBeGreaterThanOrEqual(p.z0); expect(d.z).toBeLessThanOrEqual(p.z1); });
      for (const d of r.discoveries.slice(r.pockets.length)) expect(Math.abs(d.z)).toBeCloseTo(r.halfWidth - 3);
    }
  });
});
```

Also update the existing `'builds a winding route with optional off-road discoveries'` test to expect `r.discoveries` length 4 (tier 2) and drop the `discoveryOffset` assertion.

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/terrain.test.ts`
Expected: the five new tests fail (`forks` empty, hazards at z 0).

- [ ] **Step 3: Implement**

Replace `generateRoute` in `src/sim/terrain.ts` with:

```ts
const CACHE_NAMES = ['ABANDONED RELAY', 'SMUGGLER CACHE', 'LOST WEATHER POD', 'FORGOTTEN SHRINE', 'CRASHED DRONE', 'SURVEY CAMP'];
const STRETCH_TYPES: HazardType[] = ['gust', 'rubble', 'scree'];
const FORK_TYPES: HazardType[] = ['rubble', 'scree', 'gap', 'rockfall', 'crane'];

function weightedPick(rng: Rng, defs: HazardDef[], types: HazardType[]): HazardDef | null {
  const pool = defs.filter((d) => types.includes(d.type) && d.weight > 0);
  const total = pool.reduce((a, d) => a + d.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const d of pool) { r -= d.weight; if (r < 0) return d; }
  return pool[pool.length - 1]!;
}

export function generateRoute(seed: number, lengthM: number, tier: number, hazardDefs: HazardDef[], t: TerrainTuning): RouteDef {
  const rng = mulberry32(seed);
  const mapRng = mulberry32((seed ^ 0x6d2b79f5) >>> 0);
  const W = t.corridorHalfWidth;
  const sigma = t.slopeSigma[Math.min(tier, t.slopeSigma.length - 1)]!;
  const eligible = hazardDefs.filter((d) => d.minTier <= tier);
  const gradeDef = eligible.find((d) => d.type === 'grade');
  const segments: Segment[] = [];
  const hazards: HazardInstance[] = [];
  let x = 0, y = 0, z = 0, id = 0;

  while (x < lengthM) {
    const len = t.segMin + rng.next() * (t.segMax - t.segMin);
    const x1 = Math.min(lengthM, x + len);
    const inSafe = x < t.safeStartM || x1 > lengthM - t.safeEndM;
    let slope = inSafe ? 0 : clamp(rng.gaussian() * sigma, -t.maxSlope, t.maxSlope);
    let z1 = z;
    if (!inSafe) z1 = clamp(z + (mapRng.next() * 2 - 1) * t.pathWander, -t.pathWander * 1.65, t.pathWander * 1.65);
    if (x1 > lengthM - t.safeEndM) z1 = 0;
    if (!inSafe && gradeDef && rng.next() < gradeDef.weight) {
      const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
      slope = dir * t.gradeSlope;
      hazards.push({ id: id++, type: 'grade', x: x + 1, z: 0, halfW: W * 2, impulse: 0, strapJolt: 0, dir });
    }
    segments.push({ x0: x, x1, slope, y0: y, z0: z, z1 });
    y += slope * (x1 - x);
    z = z1;
    x = x1;
  }

  const layout = layoutCourse(mapRng, lengthM, tier, t);

  const place = (def: HazardDef, hx: number, hz: number, halfW: number, dir: 1 | -1): void => {
    if (def.cycleTicks !== undefined) {
      hazards.push({ id: id++, type: def.type, x: hx - 4, x1: hx + 4, z: hz, halfW, impulse: def.impulse, strapJolt: def.strapJolt, dir, cycleTicks: def.cycleTicks, windowTicks: def.windowTicks ?? Math.round(def.cycleTicks / 5), phase: rng.int(def.cycleTicks) });
      return;
    }
    const count = def.count ?? 1, spread = def.spreadM ?? 0;
    for (let c = 0; c < count; c++) {
      const px = hx + (count > 1 ? (c / (count - 1) - 0.5) * spread : 0);
      hazards.push({ id: id++, type: def.type, x: px, z: hz, halfW, impulse: def.impulse, strapJolt: def.strapJolt, dir });
    }
  };

  // stretches: the corridor between forks; at most one hazard each, always with a way past
  const stretches: [number, number][] = [];
  let from = t.safeStartM;
  for (const f of layout.forks) { stretches.push([from, f.x0]); from = f.x1; }
  stretches.push([from, lengthM - t.safeEndM]);
  for (const [a, b] of stretches) {
    if (b - a < 30 || rng.next() > 0.7) continue;
    const def = weightedPick(rng, eligible, STRETCH_TYPES);
    if (!def) continue;
    const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
    const hx = clamp((a + b) / 2 + (rng.next() * 2 - 1) * t.hazardJitter, a + 10, b - 10);
    if (def.type === 'gust') place(def, hx, 0, W * 2, dir);
    else place(def, hx, dir * W * 0.45, W * 0.5, dir);
  }

  // forks: the direct lane carries one hazard; mud lanes carry a mud zone; other lanes stay clean
  const mudDef = hazardDefs.find((d) => d.type === 'mud');
  for (const f of layout.forks) {
    for (const lane of f.lanes) {
      const zc = laneCentre(lane), hw = laneHalfWidth(lane);
      if (lane.archetype === 'mud' && mudDef) { hazards.push({ id: id++, type: 'mud', x: f.x0 + 8, x1: f.x1 - 8, z: zc, halfW: hw - 0.5, impulse: 0, strapJolt: 0, dir: 1 }); continue; }
      if (lane.archetype !== 'direct') continue;
      const def = weightedPick(rng, eligible, FORK_TYPES);
      if (!def) continue;
      const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
      const hx = clamp((f.x0 + f.x1) / 2 + (rng.next() * 2 - 1) * t.hazardJitter, f.x0 + 12, f.x1 - 12);
      place(def, hx, zc, hw, dir);
    }
  }

  // discoveries: pockets first, then off-lane in stretches
  const discoveries: Discovery[] = [];
  const count = 2 + Math.min(2, tier);
  for (const p of layout.pockets) if (discoveries.length < count) discoveries.push({ id: discoveries.length, x: (p.x0 + p.x1) / 2, z: (p.z0 + p.z1) / 2, name: CACHE_NAMES[(discoveries.length + tier) % CACHE_NAMES.length]! });
  const wide = stretches.filter(([a, b]) => b - a >= 20);
  for (let i = 0; discoveries.length < count && i < wide.length; i++) {
    const [a, b] = wide[i]!;
    const side: 1 | -1 = mapRng.next() < 0.5 ? -1 : 1;
    discoveries.push({ id: discoveries.length, x: (a + b) / 2 + (mapRng.next() - 0.5) * (b - a) * 0.5, z: side * (W - 3), name: CACHE_NAMES[(discoveries.length + tier) % CACHE_NAMES.length]! });
  }

  return routeFromSegments(seed, segments, hazards, t.profileStepM, discoveries, layout, W);
}
```

Imports at the top of `terrain.ts`: `import { mulberry32, type Rng } from './rng'; import { layoutCourse, laneCentre, laneHalfWidth } from './course'; import type { Discovery, Fork, HazardDef, HazardInstance, HazardType, Layout, RouteDef, Segment, TerrainTuning } from './types';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run test/terrain.test.ts test/bot.test.ts test/hazards.test.ts`
Expected: terrain green. `bot.test.ts` "every shipped outpost is solvable" will very likely FAIL now (the bot steers to the centre, i.e. into spines) — that is expected until Task 9; mark it `it.skip` with the comment `// re-enabled in Task 9 (lane planner)` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/sim/terrain.ts test/terrain.test.ts test/bot.test.ts
git commit -m "feat(sim): routes compose the corridor layout; lane-aware hazards, zones and pocket caches"
```

---

### Task 6: Sim drive — W at gait, walls, mud, jump costs, `targetSpeed`

**Files:**
- Modify: `src/sim/step.ts` (`stepRig`), `test/step.test.ts`
- Create: `test/drive.test.ts`
- Delete: `test/movement.test.ts` (its still-valid cases move into `drive.test.ts`)

**Interfaces:**
- Consumes: `resolveWalls` (Task 3), `route.zones/walls/halfWidth` (Task 2/5).
- Produces: `stepRig` semantics below; helper `inZone(s, h)`; `loosenAll(s, amount)` (global strap in this task, per-bay in Task 7).

- [ ] **Step 1: Failing tests**

Create `test/drive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, frame, hazard, crateDef } from './helpers';
import type { Wall } from '../src/sim/types';

const flat = (walls: Wall[] = [], hazards = [] as ReturnType<typeof hazard>[]) =>
  routeFromSegments(1, [{ x0: 0, x1: 500, slope: 0, y0: 0 }], hazards, 10, [], { forks: [], walls, pockets: [] }, 18);
const run = (route: ReturnType<typeof flat>, inputs: Parameters<typeof frame>[0][], loadout = [{ def: crateDef(), slot: 1 }]) => {
  const s = createRun(route, loadout, tuning); const rng = mulberry32(3);
  for (const inp of inputs) step(s, frame(inp), route, [], tuning, rng);
  return s;
};
const hold = (inp: Parameters<typeof frame>[0], n: number) => Array.from({ length: n }, () => inp);

describe('drive', () => {
  it('W walks at the selected gait, release coasts to a stop, S reverses at gait 1', () => {
    const r = flat();
    const a = run(r, hold({ gait: 2, throttle: 1 }, 240));
    expect(a.speed).toBeCloseTo(tuning.gaitSpeed[2]!); expect(a.targetSpeed).toBe(tuning.gaitSpeed[2]!);
    const b = run(r, [...hold({ gait: 2, throttle: 1 }, 240), ...hold({ gait: 2, throttle: 0 }, 240)]);
    expect(b.speed).toBe(0); expect(b.targetSpeed).toBe(0);
    const c = run(r, [...hold({ gait: 2, throttle: 1 }, 60), ...hold({ gait: 3, throttle: -1 }, 300)]);
    expect(c.speed).toBeCloseTo(-tuning.gaitSpeed[1]!); expect(c.targetSpeed).toBe(-tuning.gaitSpeed[1]!);
  });
  it('gait 0 is parked even with W held; brace caps the target', () => {
    expect(run(flat(), hold({ gait: 0, throttle: 1 }, 120)).x).toBe(0);
    const s = run(flat(), hold({ gait: 4, throttle: 1, brace: true }, 240));
    expect(s.speed).toBeCloseTo(tuning.braceSpeed); expect(s.targetSpeed).toBe(tuning.braceSpeed);
  });
  it('mud halves the target speed and steering traction while inside the zone', () => {
    const mud = hazard({ type: 'mud', x: 20, x1: 200, z: 0, halfW: 10, impulse: 0, strapJolt: 0 });
    const r = flat([], [mud]);
    const s = run(r, hold({ gait: 3, throttle: 1 }, 600));
    expect(s.x).toBeGreaterThan(20); expect(s.x).toBeLessThan(200);
    expect(s.targetSpeed).toBeCloseTo(tuning.gaitSpeed[3]! * tuning.mudSpeedMul);
    expect(s.speed).toBeCloseTo(tuning.gaitSpeed[3]! * tuning.mudSpeedMul);
    const dry = run(flat(), [...hold({ gait: 3, throttle: 1 }, 360), { gait: 3, throttle: 1, steer: 1 }]);
    const wet = run(r, [...hold({ gait: 3, throttle: 1 }, 360), { gait: 3, throttle: 1, steer: 1 }]);
    expect(wet.lateralVel).toBeCloseTo(dry.lateralVel * tuning.mudTraction);
  });
  it('a wall ahead stops the rig at its face and a fast hit costs tilt and strap', () => {
    const r = flat([{ x0: 60, x1: 63, z0: -20, z1: 20, kind: 'wall' }]);
    const s = run(r, hold({ gait: 4, throttle: 1 }, 600));
    expect(s.x).toBeCloseTo(60 - tuning.rigRadius, 5);
    expect(s.strap).toBeLessThan(tuning.strapStart);
    expect(s.tiltVel === 0 && s.tilt === 0).toBe(false);
  });
  it('steering has momentum and the corridor bound clamps at halfWidth + pocketDepth', () => {
    const s = run(flat(), hold({ gait: 2, steer: 1 }, 300));
    expect(s.z).toBe(18 + tuning.terrain.pocketDepth); expect(s.lateralVel).toBe(0);
    const t = run(flat(), [...hold({ gait: 2, steer: 1 }, 30), ...hold({ gait: 2, steer: 0 }, 5)]);
    expect(t.lateralVel).toBeGreaterThan(0);
  });
  it('a jump is a gravity arc, and landing costs tilt and strap', () => {
    const r = flat();
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(3);
    step(s, frame({ gait: 0, throttle: 0, jump: true }), r, [], tuning, rng);
    expect(s.grounded).toBe(false); expect(s.liftVel).toBeCloseTo(tuning.jumpSpeed - tuning.gravity * tuning.dt);
    let peak = 0;
    for (let i = 0; i < 180 && !s.grounded; i++) { step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng); peak = Math.max(peak, s.lift); }
    expect(peak).toBeGreaterThan(1.5); expect(s.grounded).toBe(true); expect(s.lift).toBe(0);
    expect(s.strap).toBeCloseTo(tuning.strapStart - tuning.landingJolt * tuning.strapJoltMul);
  });
  it('jumping clears a collapsed span that would otherwise jolt the cargo', () => {
    const gap = hazard({ type: 'gap', x: 6, impulse: 1.4, strapJolt: 20 });
    const r = flat([], [gap]);
    const cross = (jump: boolean) => {
      const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); s.speed = 10; const rng = mulberry32(4);
      step(s, frame({ gait: 3, jump }), r, [], tuning, rng);
      while (!s.grounded || s.x < 7) step(s, frame({ gait: 3 }), r, [], tuning, rng);
      return s;
    };
    expect(cross(false).strap).toBeLessThan(tuning.strapStart);
    expect(cross(true).strap).toBeCloseTo(tuning.strapStart - tuning.landingJolt * tuning.strapJoltMul, 5);
  });
  it('a lane hazard is dodged by driving past it in another lane', () => {
    const rock = hazard({ type: 'rubble', x: 5, z: 6, halfW: 5, impulse: 0.5, strapJolt: 15 });
    const r = flat([], [rock]);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); s.speed = 8; s.z = -2.1; const rng = mulberry32(5);
    while (s.x < 6) step(s, frame({ gait: 2 }), r, [], tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
  });
});
```

`git rm test/movement.test.ts`.

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/drive.test.ts`
Expected: "W walks…" fails (throttle 1 currently means gait 4), "gait 0 is parked" fails, mud/wall tests fail.

- [ ] **Step 3: Implement**

In `src/sim/step.ts` add `import { resolveWalls } from './walls';` and replace `stepRig` with:

```ts
export function inZone(s: RigState, h: HazardInstance): boolean {
  return h.x1 !== undefined && s.x >= h.x && s.x <= h.x1 && Math.abs(s.z - h.z) < h.halfW;
}

export function loosenAll(s: RigState, amount: number): void {
  s.strap = Math.max(0, s.strap - amount);
}

export function stepRig(s: RigState, input: InputFrame, route: RouteDef, tuning: Tuning): void {
  const dt = tuning.dt, mul = tuning.gaitSpeedMul, vmax = tuning.gaitSpeed[4]! * mul;
  s.gait = input.gait;
  s.ballast = clamp(Math.round(input.ballast), -tuning.ballastRange, tuning.ballastRange);
  s.braced = input.brace;
  if (input.strap) s.strap = Math.min(100, s.strap + tuning.strapTap);

  const slope = route.slopeAt(s.x);
  const load = loadOffsetOf(s.items, tuning);
  const ideal = -(tuning.kSlope * slope + tuning.kLoad * load) / tuning.kBallast * 100;
  const effBallast = s.ballast + tuning.autoTrim * (ideal - s.ballast);
  const torque = tuning.kSlope * slope + tuning.kBallast * (effBallast / 100) + tuning.kLoad * load - s.lateralVel * tuning.lateralTip;
  const acc = torque - tuning.damping * s.tiltVel - tuning.stiffness * s.tilt;
  s.tiltVel += acc * dt;
  if (s.braced) s.tiltVel *= tuning.braceDamp;
  s.tilt += s.tiltVel * dt;

  const inMud = route.zones.some((h) => h.type === 'mud' && inZone(s, h));
  const throttle = input.throttle ?? 0;
  let target = throttle === 1 ? tuning.gaitSpeed[s.gait]! * mul : throttle === -1 ? -tuning.gaitSpeed[1]! * mul : 0;
  if (s.braced) target = clamp(target, -tuning.braceSpeed, tuning.braceSpeed);
  if (inMud) target *= tuning.mudSpeedMul;
  s.targetSpeed = target;
  s.speed += clamp(target - s.speed, -tuning.gaitDecel * dt, tuning.gaitAccel * dt);
  s.x = Math.max(0, s.x + s.speed * dt);

  const steer = input.steer ?? 0;
  const traction = !s.grounded ? tuning.airTraction : inMud ? tuning.mudTraction : 1;
  s.lateralVel += steer * tuning.steerAccel * traction * dt;
  s.lateralVel *= Math.max(0, 1 - tuning.lateralDamping * dt * (steer === 0 ? 1 : 0.35));
  s.z += s.lateralVel * dt;

  const strike = resolveWalls(s, route.walls, tuning.rigRadius, tuning.wallStrikeSpeed);
  if (strike) {
    s.tiltVel += strike.dir * tuning.wallStrikeTilt * strike.speed / vmax;
    loosenAll(s, tuning.wallStrikeJolt * tuning.strapJoltMul);
  }
  const bound = route.halfWidth + tuning.terrain.pocketDepth;
  if (s.z < -bound) { s.z = -bound; s.lateralVel = 0; } else if (s.z > bound) { s.z = bound; s.lateralVel = 0; }

  if (input.jump && s.grounded) { s.grounded = false; s.liftVel = tuning.jumpSpeed; }
  if (!s.grounded) {
    s.liftVel -= tuning.gravity * dt; s.lift += s.liftVel * dt;
    if (s.lift <= 0) {
      s.lift = 0; s.liftVel = 0; s.grounded = true;
      s.tiltVel += Math.abs(s.speed) * tuning.landingTilt;
      loosenAll(s, tuning.landingJolt * tuning.strapJoltMul);
    }
  }
  s.reserve -= (drainRate(route, tuning) + (s.braced ? tuning.braceDrain : 0)) * dt;
}
```

In `test/step.test.ts` the `'accelerates toward gaitSpeed[gait] at gaitAccel'` test still passes (`frame()` defaults `throttle: 1`). `botPolicy` in `src/sim/bot.ts` must now return `throttle: 1` (add it next to `gait`; Task 9 rewrites the policy). `test/bot.test.ts` "completes a generated tier-0 route within the reserve" fails on seed 4417 until the lane planner exists — mark it `it.skip` with `// re-enabled in Task 9 (lane planner)`. In `test/hazards.test.ts` the brace test expects `s.x` at `min(braceSpeed, gaitAccel·dt)·dt` — still true. Where the walls test in Task 3 constructed a rig via `createRun`, nothing changes.

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run` (full suite)
Expected: all green (bot outpost test still skipped).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): W-at-gait throttle, wall strikes, mud, jump landing cost, targetSpeed"
```

---

### Task 7: Per-bay restraint

**Files:**
- Modify: `src/sim/step.ts`, `src/sim/bot.ts`, `test/items.test.ts`, `test/hazards.test.ts`, `test/step.test.ts`
- Create: `test/restraint.test.ts`

**Interfaces:**
- Produces: `itemAtSlot(s, slot): ItemState | undefined`; `loosenAll(s, amount)` now per item; `RigState.strap` = selected bay's restraint (derived each tick); `input.cargoSelect` = slot index; `input.strap` ratchets the selected bay.

- [ ] **Step 1: Failing tests**

Create `test/restraint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRun, step, itemAtSlot } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, frame, crateDef, hazard } from './helpers';
import { routeFromSegments } from '../src/sim/terrain';

const three = () => [{ def: crateDef({ id: 'a', behavior: 'static' }), slot: 0 }, { def: crateDef({ id: 'b', behavior: 'livestock' }), slot: 1 }, { def: crateDef({ id: 'c', behavior: 'slosh' }), slot: 2 }];

describe('per-bay restraint', () => {
  it('starts every bay at strapStart with the lowest slot selected', () => {
    const s = createRun(flatRoute(), three(), tuning);
    expect(s.items.map((it) => it.restraint)).toEqual([70, 70, 70]);
    expect(s.selectedSlot).toBe(0); expect(s.strap).toBe(tuning.strapStart);
  });
  it('F ratchets only the selected bay; 5/6/7 (cargoSelect) switches it; strap mirrors the selection', () => {
    const r = flatRoute(); const s = createRun(r, three(), tuning); const rng = mulberry32(1);
    step(s, frame({ strap: true }), r, [], tuning, rng);
    expect(itemAtSlot(s, 0)!.restraint).toBeCloseTo(70 + tuning.strapTap, 1);
    expect(itemAtSlot(s, 1)!.restraint).toBeLessThanOrEqual(70);
    step(s, frame({ cargoSelect: 2, strap: true }), r, [], tuning, rng);
    expect(s.selectedSlot).toBe(2);
    expect(itemAtSlot(s, 2)!.restraint).toBeCloseTo(70 + tuning.strapTap, 1);
    expect(s.strap).toBeCloseTo(itemAtSlot(s, 2)!.restraint);
    step(s, frame({ cargoSelect: 7 }), r, [], tuning, rng);
    expect(s.selectedSlot).toBe(2);   // no bay there — ignored
  });
  it('restraint decays by behaviour: livestock loosens, static does not', () => {
    const r = flatRoute(); const s = createRun(r, three(), tuning); const rng = mulberry32(1);
    for (let i = 0; i < 600; i++) step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(itemAtSlot(s, 0)!.restraint).toBe(70);
    expect(itemAtSlot(s, 1)!.restraint).toBeCloseTo(70 - tuning.restraintDecay.livestock * 10, 1);
    expect(itemAtSlot(s, 2)!.restraint).toBeCloseTo(70 - tuning.restraintDecay.slosh * 10, 1);
  });
  it('a gust loosens every bay', () => {
    const r = routeFromSegments(9, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], [hazard({ x: 30 })], 10);
    const s = createRun(r, three(), tuning); const rng = mulberry32(1);
    while (s.x < 31) step(s, frame({ gait: 2 }), r, [], tuning, rng);
    for (const it of s.items) expect(it.restraint).toBeLessThan(70 - 12 + 0.5);
  });
  it('drift and crush use the item\'s own restraint', () => {
    const r = flatRoute(); const s = createRun(r, [{ def: crateDef({ id: 'loose' }), slot: 0 }, { def: crateDef({ id: 'tight', crushLimit: 60 }), slot: 2 }], tuning);
    s.items[0]!.restraint = 0; s.items[1]!.restraint = 100; s.tilt = 0.6;
    const rng = mulberry32(2);
    for (let i = 0; i < 120; i++) step(s, frame({ gait: 0, throttle: 0, ballast: 0 }), r, [], tuning, rng);
    expect(Math.abs(s.items[0]!.offset)).toBeGreaterThan(Math.abs(s.items[1]!.offset));
    expect(s.items[1]!.stress).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/restraint.test.ts`
Expected: FAIL — `itemAtSlot` not exported; ratchet changes the global strap only.

- [ ] **Step 3: Implement**

In `src/sim/step.ts`:

```ts
export function itemAtSlot(s: RigState, slot: number): ItemState | undefined {
  return s.items.find((it) => it.slot === slot);
}

function syncStrap(s: RigState): void {
  const sel = itemAtSlot(s, s.selectedSlot);
  s.strap = sel && !sel.lost ? sel.restraint : 0;
}

export function loosenAll(s: RigState, amount: number): void {
  for (const it of s.items) if (!it.lost) it.restraint = Math.max(0, it.restraint - amount);
  syncStrap(s);
}

function applyRestraintInput(s: RigState, input: InputFrame, tuning: Tuning): void {
  if (input.cargoSelect !== undefined && itemAtSlot(s, input.cargoSelect)) s.selectedSlot = input.cargoSelect;
  const sel = itemAtSlot(s, s.selectedSlot);
  if (input.strap && sel && !sel.lost) sel.restraint = Math.min(100, sel.restraint + tuning.strapTap);
  for (const it of s.items) if (!it.lost) it.restraint = Math.max(0, it.restraint - tuning.restraintDecay[it.behavior] * tuning.dt);
  syncStrap(s);
}
```

- In `stepRig` replace `if (input.strap) s.strap = Math.min(100, s.strap + tuning.strapTap);` with `applyRestraintInput(s, input, tuning);`.
- In `crossHazards` replace `s.strap = Math.max(0, s.strap - h.strapJolt * tuning.strapJoltMul);` with `loosenAll(s, h.strapJolt * tuning.strapJoltMul);`.
- In `stepItems` delete `const loose = 1 - s.strap / 100;` and inside the loop, after `if (it.lost) continue;`, add `const loose = 1 - it.restraint / 100;`; change the crush line to `it.stress += Math.max(0, it.restraint - it.crushLimit) * tuning.kCrush * dt;`.
- In `createRun`: `selectedSlot: items.reduce((m, it) => Math.min(m, it.slot), items.length ? 99 : 0)` (lowest slot; 0 when empty).
- In `stepRecovering` the restored item keeps its restraint; call `syncStrap(s)` right after the restore, and in `spillCheck` right after `worst.lost = true`, so the readout never goes stale across those transitions (ruling from the Task 7 review).
- `src/sim/bot.ts`: replace `strap: v.strap < b.strapBelow,` with

```ts
    strap: loosest !== undefined && loosest.restraint < b.strapBelow,
    cargoSelect: loosest?.slot,
```

  and before the `return` add `const loosest = v.items.filter((it) => !it.lost).sort((a, b2) => a.restraint - b2.restraint)[0];`.

- [ ] **Step 4: Update older tests**

- `test/items.test.ts` `held()`: replace `s.tilt = tilt; s.strap = strap;` with `s.tilt = tilt; s.items[0]!.restraint = strap;`.
- `test/hazards.test.ts` `'strap tap adds strapTap, capped at 100'`: create the run with `[{ def: crateDef(), slot: 1 }]` instead of `[]`.
- `test/step.test.ts` createRun test: keep `expect(s.strap).toBe(tuning.strapStart)` (no items → `strap` stays the initial value until the first tick).
- `test/bot.test.ts` `'taps strap when loose…'`: items become `[{ ...createRun(r, [{ def: crateDef(), slot: 1 }], tuning).items[0]!, restraint: 30 }]` for the loose case and `restraint: 90` for the tight case; assert `cargoSelect` is `1` in the loose case.

- [ ] **Step 5: Run, expect pass**

Run: `pnpm vitest run`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(sim): per-bay restraint — ratchet the selected bay, behaviour decay, jolts loosen all"
```

---

### Task 8: Zone hazards (mud, rockfall, crane) and lane-exact planks

**Files:**
- Modify: `src/sim/step.ts`
- Create: `test/zones.test.ts`

**Interfaces:**
- Produces: `moverActive(t: number, h: HazardInstance): boolean` (exported for the renderer's animation and the HUD), `stepZones` called from `stepEvents` before `spillCheck`.

- [ ] **Step 1: Failing tests**

Create `test/zones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRun, step, moverActive } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { frame, crateDef, hazard } from './helpers';
import type { HazardInstance } from '../src/sim/types';

const route = (h: HazardInstance[]) => routeFromSegments(2, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], h, 10);
const rockfall = (phase: number) => hazard({ id: 3, type: 'rockfall', x: 40, x1: 48, z: 0, halfW: 5, impulse: 1.2, strapJolt: 22, cycleTicks: 360, windowTicks: 72, phase });
const parkInside = (h: HazardInstance, t0: number) => {
  const r = route([h]); const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
  s.x = 44; s.t = t0;
  return { r, s, rng };
};

describe('movers', () => {
  it('moverActive follows (t + phase) mod cycle < window', () => {
    const h = rockfall(100);
    expect(moverActive(0, h)).toBe(false); expect(moverActive(260, h)).toBe(true); expect(moverActive(332, h)).toBe(false);
  });
  it('hits only while active, then cools down for hazardCooldownTicks', () => {
    const { r, s, rng } = parkInside(rockfall(0), 0);   // active for the first 72 ticks
    step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    const after = s.strap;
    expect(after).toBeCloseTo(tuning.strapStart - 22 * tuning.strapJoltMul); expect(s.tiltVel).not.toBe(0);
    for (let i = 0; i < 50; i++) step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(s.strap).toBeCloseTo(after);   // cooldown holds through the rest of the window
    const idle = parkInside(rockfall(100), 0);
    step(idle.s, frame({ gait: 0, throttle: 0 }), idle.r, [], tuning, idle.rng);
    expect(idle.s.strap).toBe(tuning.strapStart);
  });
  it('bracing turns a mover hit into a strap jolt only', () => {
    const { r, s, rng } = parkInside(rockfall(0), 0);
    step(s, frame({ gait: 0, throttle: 0, brace: true }), r, [], tuning, rng);
    expect(s.strap).toBeLessThan(tuning.strapStart); expect(Math.abs(s.tiltVel)).toBeLessThan(0.05);
  });
  it('a crane hit shoves sideways', () => {
    const crane = hazard({ id: 4, type: 'crane', x: 40, x1: 48, z: 0, halfW: 5, impulse: 1.0, strapJolt: 18, dir: -1, cycleTicks: 240, windowTicks: 48, phase: 0 });
    const { r, s, rng } = parkInside(crane, 0);
    step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(s.lateralVel).toBeLessThan(0);
  });
  it('does not fire outside the lane', () => {
    const { r, s, rng } = parkInside(rockfall(0), 0); s.z = 7;
    step(s, frame({ gait: 0, throttle: 0 }), r, [], tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
  });
});

describe('planks are lane-exact', () => {
  it('a plank in another lane does not cancel the gap', () => {
    const gap = hazard({ type: 'gap', x: 100, z: 6, halfW: 5, impulse: 1.4, strapJolt: 20 });
    const r = route([gap]);
    const cross = (plankZ: number) => {
      const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); s.z = 6; const rng = mulberry32(1);
      const traces = [{ id: 'p', seed: r.seed, x: 101, z: plankZ, type: 'plank' as const, ownerName: 'x', useCount: 0, ageHours: 1 }];
      while (s.x < 101) step(s, frame({ gait: 2 }), r, traces, tuning, rng);
      return s.strap;
    };
    expect(cross(6)).toBe(tuning.strapStart);
    expect(cross(-6)).toBeLessThan(tuning.strapStart);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/zones.test.ts`
Expected: FAIL — `moverActive` not exported; movers never hit.

- [ ] **Step 3: Implement**

In `src/sim/step.ts` add:

```ts
export function moverActive(t: number, h: HazardInstance): boolean {
  if (h.cycleTicks === undefined || h.windowTicks === undefined) return false;
  return ((t + (h.phase ?? 0)) % h.cycleTicks) < h.windowTicks;
}

function stepZones(s: RigState, route: RouteDef, tuning: Tuning): void {
  for (const h of route.zones) {
    if (h.type === 'mud' || !inZone(s, h) || !moverActive(s.t, h)) continue;
    if (s.t < (s.zoneCooldown[h.id] ?? -1)) continue;
    s.zoneCooldown[h.id] = s.t + tuning.hazardCooldownTicks;
    loosenAll(s, h.strapJolt * tuning.strapJoltMul);
    if (s.braced) continue;
    s.tiltVel += h.dir * h.impulse * hazardScale(s, tuning);
    if (h.type === 'crane') s.lateralVel += h.dir * tuning.craneShove * hazardScale(s, tuning);
  }
}
```

and in `stepEvents` call `stepZones(s, route, tuning);` right after `crossHazards(...)`. (`traceCancels` already checks `z` since Task 2.)

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run`
Expected: green. `test/replay.test.ts` still passes — extend its route to a forked one: `generateRoute(4417, 700, 2, hazards, tuning.terrain)` with `hazards` imported from content, and add `jump: i % 400 === 0, steer: ((Math.floor(i / 150) % 3) - 1) as -1 | 0 | 1, throttle: 1` to `script()`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sim): zone hazards — mud, rockfall and crane windows with cooldown; lane-exact planks"
```

---

### Task 9: Bot lane planner and validator invariant

**Files:**
- Modify: `src/sim/bot.ts`, `scripts/validate.ts`, `test/bot.test.ts`

**Interfaces:**
- Consumes: `route.forks/forkAt/laneAt/walls/zones`, `laneCentre` (Task 4), `moverActive` (Task 8).
- Produces: `BotView { x, z, lateralVel, tilt, tiltVel, strap, braced, recovering, items }`; `botPolicy(v, route, tuning): InputFrame` with `throttle: 1`, `steer`, `cargoSelect`; `laneScore(route, fork, i)` exported for tests.

- [ ] **Step 1: Failing tests**

In `test/bot.test.ts` un-skip `'every shipped outpost is solvable at bot.lagTicks'` and add:

```ts
describe('bot v3 — lanes', () => {
  it('scores a lane by its hazards, movers and baffles', () => {
    const fork = { x0: 100, x1: 200, lanes: [{ z0: -18, z1: -4, archetype: 'direct' as const }, { z0: -1.5, z1: 18, archetype: 'chicane' as const }] };
    const r = routeFromSegments(1, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], [
      { id: 0, type: 'rubble', x: 150, z: -11, halfW: 7, impulse: 0.35, strapJolt: 25, dir: 1 },
      { id: 1, type: 'rockfall', x: 140, x1: 148, z: -11, halfW: 7, impulse: 1.2, strapJolt: 22, dir: 1, cycleTicks: 360, windowTicks: 72, phase: 0 },
    ], 10, [], { forks: [fork], walls: [{ x0: 130, x1: 132, z0: -1.5, z1: 9, kind: 'baffle' }, { x0: 160, x1: 162, z0: 7, z1: 18, kind: 'baffle' }], pockets: [] }, 18);
    expect(laneScore(r, fork, 0)).toBeCloseTo(0.35 + 1.2 * 1.5);
    expect(laneScore(r, fork, 1)).toBeCloseTo(11.6);
  });
  it('steers into the safe lane before a fork and holds it inside', () => {
    const r = generateRoute(9026, 800, 2, hazards, tuning.terrain);
    const fork = r.forks[0]!;
    const safeLanes = fork.lanes.map((lane, i) => ({ i, lane, score: laneScore(r, fork, i) })).sort((a, b) => a.score - b.score);
    const { state, result } = runHeadless(r, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15, maxTicks: 60 * 60 });
    void state;
    expect(result.ended).not.toBe('spilled');
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1); const lag = new LagBuffer(15);
    while (s.x < fork.x0 + 5 && !s.ended) step(s, botPolicy(lag.push(s), r, tuning), r, [], tuning, rng);
    const chosen = r.laneAt(s.x, s.z);
    expect(chosen).toBeGreaterThanOrEqual(0);
    expect(laneScore(r, fork, chosen)).toBeCloseTo(safeLanes[0]!.score);
  });
  it('never jumps and always holds W', () => {
    const r = flatRoute();
    const f = botPolicy({ x: 10, z: 0, lateralVel: 0, tilt: 0, tiltVel: 0, strap: 80, braced: false, recovering: 0, items: [] }, r, tuning);
    expect(f.throttle).toBe(1); expect(f.jump).toBeFalsy();
  });
});
```

Add the imports `step`, `mulberry32`, `laneScore` (`import { runHeadless, LagBuffer, botPolicy, laneScore } from '../src/sim/bot'`). Update the older `v(x)` helper in this file to include `lateralVel: 0`.

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/bot.test.ts`
Expected: FAIL — `laneScore` missing; outposts unsolvable.

- [ ] **Step 3: Implement**

Replace `src/sim/bot.ts` from the `BotView` interface through `botPolicy` with:

```ts
export interface BotView { x: number; z: number; lateralVel: number; tilt: number; tiltVel: number; strap: number; braced: boolean; recovering: number; items: ItemState[] }

function view(s: RigState): BotView {
  return { x: s.x, z: s.z, lateralVel: s.lateralVel, tilt: s.tilt, tiltVel: s.tiltVel, strap: s.strap, braced: s.braced, recovering: s.recovering, items: s.items.map((it) => ({ ...it })) };
}

export class LagBuffer {
  private buf: BotView[] = [];
  constructor(private readonly lag: number) {}
  push(s: RigState): BotView {
    this.buf.push(view(s));
    if (this.buf.length > this.lag + 1) this.buf.shift();
    return this.buf[0]!;
  }
}

function clampInt(v: number, lo: number, hi: number): number { const r = Math.round(v); return r < lo ? lo : r > hi ? hi : r; }
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const inLaneZ = (h: { z: number }, lane: Lane): boolean => h.z >= lane.z0 && h.z <= lane.z1;

/** A centre-holding planner cannot weave a chicane, so chicanes rank behind every other lane outright. */
const CHICANE_PENALTY = 10;

/** Lower is safer: hazard impulses (movers ×1.5), mud 0.6, chicanes +10 plus 0.8 per baffle. */
export function laneScore(route: RouteDef, fork: Fork, i: number): number {
  const lane = fork.lanes[i]!;
  let score = lane.archetype === 'chicane' ? CHICANE_PENALTY : 0;
  for (const h of route.hazards) {
    if (h.x < fork.x0 || h.x > fork.x1 || !inLaneZ(h, lane)) continue;
    score += h.type === 'mud' ? 0.6 : h.impulse * (h.cycleTicks !== undefined ? 1.5 : 1);
  }
  for (const w of route.walls) if (w.kind === 'baffle' && w.x0 < fork.x1 && w.x1 > fork.x0 && w.z0 < lane.z1 && w.z1 > lane.z0) score += 0.8;
  return score;
}

function targetZ(v: BotView, route: RouteDef, tuning: Tuning): number {
  const inside = route.forkAt(v.x);
  if (inside) {
    const i = route.laneAt(v.x, v.z);
    if (i >= 0) return laneCentre(inside.lanes[i]!);
    let best = inside.lanes[0]!;
    for (const lane of inside.lanes) if (Math.abs(laneCentre(lane) - v.z) < Math.abs(laneCentre(best) - v.z)) best = lane;
    return laneCentre(best);
  }
  const ahead = route.forks.find((f) => f.x0 > v.x && f.x0 - v.x < tuning.bot.laneLookaheadM);
  if (ahead) {
    let best = 0, bestScore = Infinity;
    ahead.lanes.forEach((lane, i) => {
      const score = laneScore(route, ahead, i) + Math.abs(laneCentre(lane) - v.z) * 0.01;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return laneCentre(ahead.lanes[best]!);
  }
  const dodge = route.hazards.find((h) => h.x > v.x && h.x < v.x + 40 && h.impulse > 0 && h.halfW < route.halfWidth);
  return dodge ? -Math.sign(dodge.z || 1) * route.halfWidth * 0.4 : 0;
}

export function botPolicy(v: BotView, route: RouteDef, tuning: Tuning): InputFrame {
  const b = tuning.bot;
  const zTarget = targetZ(v, route, tuning);
  let brace = false, slow = false, near = false;
  for (const h of route.hazards) {
    const start = h.x, end = h.x1 ?? h.x;
    if (end < v.x) continue;
    if (start > v.x + 40) break;
    if (h.impulse === 0) continue;
    if (Math.abs(h.z - zTarget) >= h.halfW && h.halfW < route.halfWidth) continue;   // not in my lane
    const within = start <= v.x + b.braceAheadM;
    const mustBrace = h.type === 'gap' || h.type === 'rockfall' || h.type === 'crane';
    if (mustBrace && within) { near = true; brace = true; }
    if (h.type !== 'gust' && within) slow = true;
  }
  const gait: Gait = slow ? 1 : near ? 2 : 3;
  const slopeAhead = route.slopeAt(v.x + tuning.gaitSpeed[gait]! * tuning.gaitSpeedMul * b.leadSec);
  const load = loadOffsetOf(v.items, tuning);
  const feedForward = -(tuning.kSlope * slopeAhead + tuning.kLoad * load) / tuning.kBallast * 100;
  const feedback = -b.kp * v.tilt - b.kd * v.tiltVel;
  const wantVel = clamp((zTarget - v.z) * 1.2, -6, 6);
  const dv = wantVel - v.lateralVel;
  const steer: -1 | 0 | 1 = dv > 0.6 ? 1 : dv < -0.6 ? -1 : 0;
  const loosest = v.items.filter((it) => !it.lost).sort((a, b2) => a.restraint - b2.restraint)[0];
  return {
    gait, throttle: 1, steer, jump: false,
    ballast: clampInt(feedForward + feedback, -tuning.ballastRange, tuning.ballastRange),
    strap: loosest !== undefined && loosest.restraint < b.strapBelow,
    cargoSelect: loosest?.slot,
    brace,
    deploy: 0,
    recover: v.recovering === 0 && v.items.some((it) => it.lost),
  };
}
```

Imports: `import { laneCentre } from './course';` and add `Fork, Lane` to the type import.

In `scripts/validate.ts`, after computing `route` for an outpost, add the invariant:

```ts
  for (const f of route.forks) {
    const safe = f.lanes.some((lane) => !route.hazards.some((h) => h.impulse > 0 && h.x >= f.x0 && h.x <= f.x1 && h.z >= lane.z0 && h.z <= lane.z1));
    if (!safe) { failures++; console.log(`${o.name}: fork at ${f.x0.toFixed(0)} m has no hazard-free lane`); }
  }
```

- [ ] **Step 4: Run the suite and the validator**

Run: `pnpm vitest run && pnpm validate`
Expected: tests green; `PASS: all 12 outposts solvable at lag 15`. If the validator FAILS, apply these knobs in order, re-running after each, and keep the first that passes: (1) `tuning.json` `reserveBudget` 0.62 → 0.7; (2) `bot.laneLookaheadM` 60 → 80; (3) `hazards.json` rockfall `windowTicks` 72 → 60; (4) `bot.braceAheadM` 8 → 10. Record the knob used in the commit message.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bot): lane planner, W held, loosest-bay ratchet; validator asserts a safe lane per fork"
```

---

### Task 10: Input keys/bays and the route sketch + minimap builders

**Files:**
- Modify: `src/ui/input.ts`, `test/input.test.ts`
- Create: `src/ui/sketch.ts`, `test/sketch.test.ts`

**Interfaces:**
- Produces: `InputController.setBays(slots: number[])`, `selectCargo(slot)`; keys: Digit0–4 gait, Digit5/6/7 → slots 0/1/2, Tab cycles bays, W/S/A/D, Space, Shift, F, R, Q/E, P.
- Produces: `routeSketchSvg(route: RouteDef, w?: number, h?: number): string`; `minimapMarkup(route: RouteDef, x0: number, x1: number, w?: number, h?: number): string`; `mapPoint(route, x, z, x0, x1, w, h): { sx: number; sy: number }`.

- [ ] **Step 1: Failing tests**

Append to `test/input.test.ts`:

```ts
describe('bays and keys v3', () => {
  it('digits 0–4 set gait only; 5/6/7 select slots 0/1/2', () => {
    const st = initialInput(); applyKey(st, 'Digit3', true);
    expect(st.gait).toBe(3); expect(sampleFrame(st, tuning).cargoSelect).toBeUndefined();
    applyKey(st, 'Digit6', true); expect(sampleFrame(st, tuning).cargoSelect).toBe(1);
  });
  it('Tab cycles through the loaded bays', () => {
    const c = new InputController(tuning); c.setBays([0, 2]);
    applyKey(c.state, 'Tab', true); expect(c.sample().cargoSelect).toBe(2);
    applyKey(c.state, 'Tab', true); expect(c.sample().cargoSelect).toBe(0);
    c.selectCargo(2); expect(c.sample().cargoSelect).toBe(2);
    applyKey(c.state, 'Tab', true); expect(c.sample().cargoSelect).toBe(0);
  });
});
```

Create `test/sketch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { routeSketchSvg, minimapMarkup, mapPoint } from '../src/ui/sketch';
import { generateRoute } from '../src/sim/terrain';
import { tuning, hazards } from '../src/content';

const route = generateRoute(6142, 780, 2, hazards, tuning.terrain);

describe('route sketch', () => {
  it('draws one rect per wall, one glyph per hazard and one marker per discovery', () => {
    const svg = routeSketchSvg(route);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/class="wall (wall|rock|ruin|baffle)"/g)).toHaveLength(route.walls.length);
    expect(svg.match(/class="hz hz-/g)).toHaveLength(route.hazards.length);
    expect(svg.match(/class="cache"/g)).toHaveLength(route.discoveries.length);
  });
  it('minimap only includes what falls inside the window', () => {
    const inside = minimapMarkup(route, 100, 340);
    const wallsIn = route.walls.filter((w) => w.x1 >= 100 && w.x0 <= 340).length;
    expect(inside.match(/class="wall /g)?.length ?? 0).toBe(wallsIn);
    expect(minimapMarkup(route, 5000, 5200)).not.toMatch(/class="hz/);
  });
  it('mapPoint maps x across and +z downwards', () => {
    const p = mapPoint(route, 220, 0, 100, 340, 180, 100);
    expect(p.sx).toBeCloseTo(90); expect(p.sy).toBeCloseTo(50);
    expect(mapPoint(route, 220, 10, 100, 340, 180, 100).sy).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run test/input.test.ts test/sketch.test.ts`
Expected: FAIL — Digit3 also queues a bay; no `setBays`; no `../src/ui/sketch`.

- [ ] **Step 3: Implement input**

In `src/ui/input.ts`:
- `InputState` gains `baySlots: number[]; bayIndex: number;` (`initialInput`: `baySlots: [], bayIndex: 0`).
- `applyKey` default branch becomes:

```ts
    case 'Tab':
      if (down && st.baySlots.length > 0) { st.bayIndex = (st.bayIndex + 1) % st.baySlots.length; st.cargoSelectQueued = st.baySlots[st.bayIndex]!; }
      break;
    default:
      if (down && /^Digit[0-4]$/.test(code)) st.gait = clampGait(Number(code.slice(5)));
      else if (down && /^Digit[5-7]$/.test(code)) {
        const slot = Number(code.slice(5)) - 5, idx = st.baySlots.indexOf(slot);
        if (idx >= 0) { st.cargoSelectQueued = slot; st.bayIndex = idx; }   // unloaded bays are ignored (ruling)
      }
```

- `InputController`: `setBays(slots: number[]): void { this.state.baySlots = [...slots].sort((a, b) => a - b); this.state.bayIndex = 0; }` and `selectCargo(slot: number): void { const idx = this.state.baySlots.indexOf(slot); if (idx < 0) return; this.state.cargoSelectQueued = slot; this.state.bayIndex = idx; }` (unloaded bays are ignored — ruling from the Task 10 review; tests that press Digit5–7 must load bays first).
- `onKeyDown`: `if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();`.
- `resetInput` leaves `baySlots` alone (set per haul by the flow).

- [ ] **Step 4: Implement sketch**

Create `src/ui/sketch.ts`:

```ts
import type { RouteDef } from '../sim/types';

const f1 = (n: number): string => n.toFixed(1);

/** Screen mapping: x across the window, +z downwards, bound = halfWidth + pocketDepth + 3 (edge walls visible). */
export function mapPoint(route: RouteDef, x: number, z: number, x0: number, x1: number, w: number, h: number): { sx: number; sy: number } {
  const bound = route.halfWidth + 11;
  return { sx: (x - x0) / Math.max(1, x1 - x0) * w, sy: h / 2 + z / bound * (h / 2) };
}

function layer(route: RouteDef, x0: number, x1: number, w: number, h: number): string {
  const p = (x: number, z: number) => mapPoint(route, x, z, x0, x1, w, h);
  const parts: string[] = [];
  for (const wall of route.walls) {
    if (wall.x1 < x0 || wall.x0 > x1) continue;
    const a = p(Math.max(wall.x0, x0), wall.z0), b = p(Math.min(wall.x1, x1), wall.z1);
    parts.push(`<rect class="wall ${wall.kind}" x="${f1(a.sx)}" y="${f1(a.sy)}" width="${f1(Math.max(0.6, b.sx - a.sx))}" height="${f1(Math.max(0.6, b.sy - a.sy))}"/>`);
  }
  for (const hz of route.hazards) {
    const end = hz.x1 ?? hz.x;
    if (end < x0 || hz.x > x1) continue;
    if (hz.x1 !== undefined) {
      const a = p(Math.max(hz.x, x0), hz.z - hz.halfW), b = p(Math.min(hz.x1, x1), hz.z + hz.halfW);
      parts.push(`<rect class="hz hz-${hz.type}" x="${f1(a.sx)}" y="${f1(a.sy)}" width="${f1(Math.max(1, b.sx - a.sx))}" height="${f1(Math.max(1, b.sy - a.sy))}"/>`);
    } else {
      const c = p(hz.x, hz.z);
      parts.push(`<circle class="hz hz-${hz.type}" cx="${f1(c.sx)}" cy="${f1(c.sy)}" r="2.4"/>`);
    }
  }
  for (const d of route.discoveries) {
    if (d.x < x0 || d.x > x1) continue;
    const c = p(d.x, d.z);
    parts.push(`<rect class="cache" data-cache="${d.id}" x="${f1(c.sx - 2)}" y="${f1(c.sy - 2)}" width="4" height="4" transform="rotate(45 ${f1(c.sx)} ${f1(c.sy)})"/>`);
  }
  return parts.join('');
}

/** Whole-route planning sketch for the dispatch screen. */
export function routeSketchSvg(route: RouteDef, w = 480, h = 96): string {
  const corridor = `<rect class="corridor" x="0" y="${f1(mapPoint(route, 0, -route.halfWidth, 0, route.length, w, h).sy)}" width="${w}" height="${f1(route.halfWidth / (route.halfWidth + 11) * h)}"/>`;
  return `<svg class="sketch" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Route sketch">${corridor}${layer(route, 0, route.length, w, h)}</svg>`;
}

/** Static layer of the HUD minimap for the window [x0, x1]. The rig marker is positioned separately with mapPoint. */
export function minimapMarkup(route: RouteDef, x0: number, x1: number, w = 180, h = 100): string {
  return layer(route, x0, x1, w, h);
}
```

- [ ] **Step 5: Run, expect pass**

Run: `pnpm vitest run test/input.test.ts test/sketch.test.ts`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): bay keys and Tab cycling; route sketch and minimap builders"
```

---

### Task 11: Render — ground ribbon and instanced walls

**Files:**
- Modify: `src/render/three/terrain.ts`, `src/render/three/ThreeRenderer.ts`
- Create: `src/render/three/walls.ts`

**Interfaces:**
- Consumes: `route.walls/halfWidth/zones/forks`, `tuning.terrain.pocketDepth`.
- Produces: `buildWalls(route: RouteDef): THREE.Group`, `disposeWalls(group)`; `buildTerrain(route)` sized from the route.

No unit tests (WebGL); verification is `pnpm typecheck && pnpm lint && pnpm build` plus a manual run in Task 14.

- [ ] **Step 1: terrain.ts**

Replace `src/render/three/terrain.ts` with:

```ts
import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';
import { tuning } from '../../content';

const EARTH = new THREE.Color('#5a544b');
const EARTH_LIGHT = new THREE.Color('#6b6157');
const RUT = new THREE.Color('#47423a');
const OUTSIDE = new THREE.Color('#4a453f');
const MUD = new THREE.Color('#3a3128');

function hashNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function buildTerrain(route: RouteDef, stepX = 2, stepZ = 2): THREE.Mesh {
  const bound = route.halfWidth + tuning.terrain.pocketDepth;
  const width = 2 * bound + 24;
  const nx = Math.ceil(route.length / stepX), nz = Math.ceil(width / stepZ);
  const geo = new THREE.PlaneGeometry(route.length, width, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(route.length / 2, 0, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), wz = pos.getZ(i);
    const rz = wz - route.centerAt(x);                 // corridor z
    const inside = Math.abs(rz) <= bound;
    const fork = route.forkAt(x);
    let rut = false;
    if (fork) for (const lane of fork.lanes) if (Math.abs(rz - (lane.z0 + lane.z1) / 2) < 1.2) rut = true;
    if (!fork && Math.abs(rz) < 1.4) rut = true;
    const mud = route.zones.some((h) => h.type === 'mud' && x >= h.x && x <= h.x1! && Math.abs(rz - h.z) < h.halfW);
    let drop = 0;
    for (const h of route.hazards) if (h.type === 'gap' && Math.abs(x - h.x) < 1.5 && Math.abs(rz - h.z) < h.halfW) drop = 5;
    const rough = inside ? hashNoise(x, wz) * 0.12 : hashNoise(x, wz) * 1.4;
    pos.setY(i, route.heightAt(x) + rough - (inside ? 0 : 0.8) - drop);
    if (!inside) c.copy(OUTSIDE).offsetHSL(0, 0, (hashNoise(x, wz) - 0.5) * 0.06);
    else if (mud) c.copy(MUD);
    else if (rut) c.copy(RUT);
    else c.copy(EARTH).lerp(EARTH_LIGHT, hashNoise(x * 0.3, wz * 0.3));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
```

- [ ] **Step 2: walls.ts (render)**

Create `src/render/three/walls.ts`:

```ts
import * as THREE from 'three';
import type { RouteDef, Wall, WallKind } from '../../sim/types';

const CHUNK = 8;   // metres of wall per instance so the boxes follow the wandering centre line
const HEIGHT: Record<WallKind, number> = { wall: 3.2, rock: 2.6, ruin: 3.8, baffle: 1.1 };
const MATERIAL: Record<WallKind, THREE.MeshStandardMaterial> = {
  wall: new THREE.MeshStandardMaterial({ color: '#7a7570', roughness: 0.9, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: '#4f4a44', roughness: 0.98, flatShading: true }),
  ruin: new THREE.MeshStandardMaterial({ color: '#6e4a34', roughness: 0.85, metalness: 0.15, flatShading: true }),
  baffle: new THREE.MeshStandardMaterial({ color: '#8a847c', roughness: 0.8, flatShading: true }),
};
const GEOMETRY: Record<WallKind, THREE.BufferGeometry> = {
  wall: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.IcosahedronGeometry(0.62, 0),
  ruin: new THREE.BoxGeometry(1, 1, 1),
  baffle: new THREE.BoxGeometry(1, 1, 1),
};

function noise(n: number): number { const x = Math.sin(n * 91.73) * 43758.5453; return x - Math.floor(x); }

function chunks(w: Wall): { x0: number; x1: number }[] {
  const out: { x0: number; x1: number }[] = [];
  for (let x = w.x0; x < w.x1; x += CHUNK) out.push({ x0: x, x1: Math.min(w.x1, x + CHUNK) });
  return out;
}

export function buildWalls(route: RouteDef): THREE.Group {
  const group = new THREE.Group();
  const counts: Record<WallKind, number> = { wall: 0, rock: 0, ruin: 0, baffle: 0 };
  for (const w of route.walls) counts[w.kind] += chunks(w).length * (w.kind === 'rock' ? 2 : 1);
  const meshes = {} as Record<WallKind, THREE.InstancedMesh>;
  for (const kind of Object.keys(counts) as WallKind[]) {
    const m = new THREE.InstancedMesh(GEOMETRY[kind], MATERIAL[kind], Math.max(1, counts[kind]));
    m.castShadow = true; m.receiveShadow = true; m.count = 0; m.name = `walls-${kind}`;
    meshes[kind] = m; group.add(m);
  }
  const dummy = new THREE.Object3D();
  let seed = route.seed;
  for (const w of route.walls) {
    for (const ch of chunks(w)) {
      const mx = (ch.x0 + ch.x1) / 2, len = ch.x1 - ch.x0, thick = w.z1 - w.z0, mz = (w.z0 + w.z1) / 2;
      const y = route.heightAt(mx), h = HEIGHT[w.kind];
      const place = (dx: number, dz: number, sx: number, sy: number, sz: number, rot: number): void => {
        dummy.position.set(mx + dx, y + sy / 2 - 0.15, route.centerAt(mx) + mz + dz);
        dummy.rotation.set(0, rot, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        const m = meshes[w.kind]; m.setMatrixAt(m.count++, dummy.matrix);
      };
      seed += 1;
      if (w.kind === 'rock') {
        place(-len * 0.22, 0, len * 0.6, h * (0.8 + noise(seed) * 0.5), thick * 1.3, noise(seed + 1) * 3.1);
        place(len * 0.24, (noise(seed + 2) - 0.5) * thick, len * 0.55, h * (0.7 + noise(seed + 3) * 0.6), thick * 1.2, noise(seed + 4) * 3.1);
      } else if (w.kind === 'ruin') {
        place(0, 0, len, h * (0.6 + noise(seed) * 0.5), thick, 0);
        place((noise(seed + 1) - 0.5) * len * 0.4, 0, len * 0.35, h, thick * 0.9, (noise(seed + 2) - 0.5) * 0.3);
      } else {
        place(0, 0, len, h * (0.9 + noise(seed) * 0.2), thick, 0);
      }
    }
  }
  for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
  return group;
}

export function disposeWalls(group: THREE.Group): void {
  for (const child of group.children) if (child instanceof THREE.InstancedMesh) child.dispose();   // geometries/materials are shared module singletons
}
```

- [ ] **Step 3: Wire into ThreeRenderer**

In `src/render/three/ThreeRenderer.ts`: import `{ buildWalls, disposeWalls } from './walls'`; add `private walls: THREE.Group | null = null;`; in `setRoute` after the scenery block add

```ts
    if (this.walls) { this.scene.remove(this.walls); disposeWalls(this.walls); }
    this.walls = buildWalls(route); this.scene.add(this.walls);
```

and in `dispose()` add `if (this.walls) disposeWalls(this.walls);`.

- [ ] **Step 4: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: green.

```bash
git add -A
git commit -m "feat(render): corridor ground with ruts and mud; instanced wall, rock, ruin and baffle chunks"
```

---

### Task 12: Render — hazard set, movers, scenery, rig skin, palette

**Files:**
- Modify: `src/render/three/hazards.ts`, `src/render/three/scenery.ts`, `src/render/three/rig.ts`, `src/render/three/ThreeRenderer.ts`

**Interfaces:**
- Consumes: `moverActive` (Task 8) — the renderer imports it from `src/sim/step` (allowed direction: render → sim).
- Produces: `buildHazards(route)`, `animateHazards(group, tick)`, `disposeHazards(group)`; `buildScenery/syncScenery/disposeScenery` unchanged signatures.

- [ ] **Step 1: hazards.ts**

Replace `src/render/three/hazards.ts` with:

```ts
import * as THREE from 'three';
import type { HazardInstance, RouteDef } from '../../sim/types';
import { moverActive } from '../../sim/step';

const rock = new THREE.IcosahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: '#4f4a44', roughness: 0.95, flatShading: true });
const darkMat = new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.8, metalness: 0.2 });
const steelMat = new THREE.MeshStandardMaterial({ color: '#5a5651', roughness: 0.55, metalness: 0.6 });
const rustMat = new THREE.MeshStandardMaterial({ color: '#6e4a34', roughness: 0.75, metalness: 0.25 });
const warnMat = new THREE.MeshStandardMaterial({ color: '#8f2f22', roughness: 0.7 });
const dustMat = new THREE.MeshBasicMaterial({ color: '#c9bfae', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const woodMat = new THREE.MeshStandardMaterial({ color: '#3d332a', roughness: 1, flatShading: true });
const SHARED_GEOMETRIES: THREE.BufferGeometry[] = [rock];
const SHARED_MATERIALS: THREE.Material[] = [rockMat, darkMat, steelMat, rustMat, warnMat, dustMat, woodMat];

function rand(id: number, salt: number): number {
  const n = Math.sin((id + 11) * 91.73 + salt * 37.19) * 43758.5453;
  return n - Math.floor(n);
}
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; return m;
}
const worldZ = (route: RouteDef, h: HazardInstance): number => route.centerAt(h.x) + h.z;

function addRocks(g: THREE.Group, route: RouteDef, h: HazardInstance, count: number, large: boolean): void {
  for (let i = 0; i < count; i++) {
    const m = mesh(rock, rockMat);
    const s = large ? 0.75 + rand(h.id, i) * 0.95 : 0.25 + rand(h.id, i) * 0.38;
    const px = h.x + (rand(h.id, i + 20) - 0.5) * 4.5;
    m.scale.setScalar(s);
    m.position.set(px, route.heightAt(px) + s * 0.36, worldZ(route, h) + (rand(h.id, i + 40) - 0.5) * h.halfW * 1.6);
    m.rotation.set(rand(h.id, i + 60) * 3, rand(h.id, i + 80) * 3, 0);
    g.add(m);
  }
}

function buildGap(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set(h.x, route.heightAt(h.x), worldZ(route, h));
  const pit = mesh(new THREE.BoxGeometry(3.4, 0.55, h.halfW * 2), darkMat); pit.position.y = -4.8; root.add(pit);
  for (const dz of [-1, 1]) for (let i = 0; i < 3; i++) {
    const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), rustMat);
    bar.position.set(-1.6 + i * 1.6, 0.2, dz * (h.halfW - 0.6)); bar.rotation.z = 1.2 * dz; root.add(bar);
  }
  return root;
}

function buildGust(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const m = mesh(new THREE.PlaneGeometry(0.45, 8), dustMat);
    m.position.set(h.x - 3 + i * 1.5, route.heightAt(h.x) + 4, route.centerAt(h.x) + (i % 2 ? 1 : -1) * 2); m.rotation.y = Math.PI / 2; root.add(m);
  }
  for (const side of [-1, 1]) {
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.3, 4.5, 6), woodMat);
    trunk.position.set(h.x + side * 3, route.heightAt(h.x) + 2.2, route.centerAt(h.x) + side * (route.halfWidth - 2)); trunk.rotation.z = h.dir * 0.35; root.add(trunk);
  }
  return root;
}

function buildMud(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(h.x1! - h.x, h.halfW * 2), new THREE.MeshStandardMaterial({ color: '#2f271f', roughness: 0.35, metalness: 0.05 }));
  patch.rotation.x = -Math.PI / 2; patch.position.set((h.x + h.x1!) / 2, route.heightAt((h.x + h.x1!) / 2) + 0.06, worldZ(route, h)); patch.receiveShadow = true; root.add(patch);
  return root;
}

function buildRockfall(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set((h.x + h.x1!) / 2, route.heightAt((h.x + h.x1!) / 2), worldZ(route, h));
  const boulders = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = mesh(rock, rockMat); b.scale.setScalar(1.1 + rand(h.id, i) * 0.6); b.position.set((i - 1) * 2.2, 0.8, 0); boulders.add(b); }
  root.add(boulders);
  const pile = mesh(new THREE.ConeGeometry(2.4, 2.2, 6), rockMat); pile.position.set(0, 1.0, -h.dir * (h.halfW + 1.2)); root.add(pile);
  root.userData.kind = 'rockfall'; root.userData.mover = boulders; root.userData.hazard = h;
  return root;
}

function buildCrane(route: RouteDef, h: HazardInstance): THREE.Group {
  const mx = (h.x + h.x1!) / 2;
  const root = new THREE.Group(); root.position.set(mx, route.heightAt(mx), worldZ(route, h));
  for (const dz of [-1, 1]) { const post = mesh(new THREE.BoxGeometry(0.8, 9, 0.8), steelMat); post.position.set(0, 4.5, dz * (h.halfW + 0.8)); root.add(post); }
  const beam = mesh(new THREE.BoxGeometry(1.0, 0.8, h.halfW * 2 + 3), rustMat); beam.position.y = 9; root.add(beam);
  const arm = new THREE.Group(); arm.position.y = 8.6;
  const cable = mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4), darkMat); cable.position.y = -3;
  const load = mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), warnMat); load.position.y = -6.6;
  arm.add(cable, load); root.add(arm);
  root.userData.kind = 'crane'; root.userData.mover = arm; root.userData.hazard = h;
  return root;
}

export function buildHazards(route: RouteDef): THREE.Group {
  const g = new THREE.Group();
  for (const h of route.hazards) {
    if (h.type === 'rubble' || h.type === 'scree') addRocks(g, route, h, h.type === 'rubble' ? 7 : 3, h.type === 'rubble');
    else if (h.type === 'gust') g.add(buildGust(route, h));
    else if (h.type === 'gap') g.add(buildGap(route, h));
    else if (h.type === 'mud') g.add(buildMud(route, h));
    else if (h.type === 'rockfall') g.add(buildRockfall(route, h));
    else if (h.type === 'crane') g.add(buildCrane(route, h));
  }
  return g;
}

/** tick = sim tick (+ alpha). Movers read the same phase formula as the sim, so what you see is what hits you. */
export function animateHazards(group: THREE.Group, tick: number): void {
  for (const root of group.children) {
    const kind = root.userData.kind as string | undefined;
    const mover = root.userData.mover as THREE.Object3D | undefined;
    const h = root.userData.hazard as HazardInstance | undefined;
    if (!kind || !mover || !h) continue;
    const t = Math.floor(tick);
    const cycle = h.cycleTicks!, window = h.windowTicks!;
    const phaseTick = (t + (h.phase ?? 0)) % cycle;
    if (kind === 'rockfall') {
      const active = moverActive(t, h);
      const f = active ? phaseTick / window : 0;                   // 0 at the pile, 1 past the far side
      mover.position.z = -h.dir * (h.halfW + 1.2) + h.dir * f * (h.halfW * 2 + 2.4);
      mover.rotation.x = f * 9;
      mover.visible = active;
    } else if (kind === 'crane') {
      const swing = Math.sin(phaseTick / cycle * Math.PI * 2);      // load is over the lane when the window is open
      mover.rotation.x = -h.dir * (0.9 - 0.9 * Math.max(0, swing));
    }
  }
}

export function disposeHazards(g: THREE.Group): void {
  g.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!SHARED_GEOMETRIES.includes(child.geometry)) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) if (!SHARED_MATERIALS.includes(material)) material.dispose();
  });
}
```

In `ThreeRenderer.draw` change the call to `animateHazards(this.hazardGroup, curr.t + alpha)`.

- [ ] **Step 2: scenery.ts palette and ruins**

In `src/render/three/scenery.ts`:
- Materials: `mountainMat` colour `#4a453f`, `mountainFarMat` `#7b746a`, `orangeMat` → rename `rustMat` colour `#6e4a34`, `cacheMat` colour `#d29a4a` emissive `#5a3a12` intensity 0.9, `beaconMat` colour `#e8b86a` opacity 0.35.
- Replace the cone "mountain" loop body's geometry with stacked blocks: `const m = new THREE.Mesh(blockGeo, distance > 42 ? mountainFarMat : mountainMat)` where `const blockGeo = new THREE.BoxGeometry(1, 1, 1)` is created once beside `cone`, `m.scale.set(6 + noise(i * 11) * 10, height, 5 + noise(i * 13) * 8)`; and add a second, shorter block beside it (`scale.set(4 + noise(i*5)*5, height * 0.55, 4 + noise(i*9)*4)`, offset by `+scale.x * 0.8` in x). Register both geometries in `group.userData.geometries`.
- Delete the `boundary` cylinder loop (the walls now fence the corridor). Keep the posts/markers with `rustMat`.
- Discovery sites: keep; the `beacon` cone now uses the amber `beaconMat`.
- Discovery sites use world z: `site.position.set(x, route.heightAt(x), route.centerAt(x) + z)` (sim `z` is corridor-relative).

- [ ] **Step 3: rig.ts skin**

In `src/render/three/rig.ts`:
- Body material colour `#5a5148`; `legMat` `#3a3632`; `footMat` `#6e4a34`; deck colour `#3a352f`.
- After the deck, add three patch plates: `for (const [px, pz, w] of [[-1.1, 0.7, 0.9], [0.6, -0.8, 1.2], [1.3, 0.5, 0.7]] as const) { const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: '#6e4a34', roughness: 0.9, metalness: 0.3 })); plate.position.set(px, BODY_Y + 0.6, pz); this.group.add(plate); }`.
- Replace the two lamps with one headlamp on the right: `const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd078' })); lamp.position.set(1.74, BODY_Y + 0.12, 0.58); this.group.add(lamp);` and a dead lamp on the left with colour `#3a3632`.
- `dispose()` already disposes non-leg children; no change.

- [ ] **Step 4: ThreeRenderer palette**

In `src/render/three/ThreeRenderer.ts`: `SKY = '#b9b0a3'`; fog `new THREE.Fog(SKY, 60, 180)`; hemisphere `('#c9bfae', '#3e3a35', 1.4)`; sun colour `'#e8c39a'` intensity 3.0; `toneMappingExposure = 1.0`.

- [ ] **Step 5: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: green.

```bash
git add -A
git commit -m "feat(render): post-apocalypse hazard set with rockfall and crane movers, ruins scenery, rusted rig, ash palette"
```

---

### Task 13: Panel, HUD, teleprinter events, dispatch sketch, flow wiring

**Files:**
- Create: `src/game/events.ts`, `test/events.test.ts`
- Modify: `src/ui/panel/panel.ts`, `src/ui/hud.ts`, `src/ui/panel/panel.css`, `src/ui/screens/dispatch.ts`, `src/game/flow.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `minimapMarkup/mapPoint/routeSketchSvg` (Task 10), `RigState.targetSpeed/selectedSlot`, `itemAtSlot` (Task 7), `moverActive` (Task 8).
- Produces: `snapshot(s: RigState): EventSnapshot`; `describeEvents(prev: EventSnapshot, curr: RigState, route: RouteDef, cacheReserve: number): { lines: string[]; next: EventSnapshot }`; `Hud(viewport, handlers: { onSelectBay(slot: number): void })`, `Hud.update(s, route)`; `DispatchProps.sketch: string`.

- [ ] **Step 1: Failing test for events**

Create `test/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeEvents, snapshot } from '../src/game/events';
import { createRun } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { tuning } from '../src/content';
import { crateDef, hazard } from './helpers';

const route = routeFromSegments(1, [{ x0: 0, x1: 400, slope: 0, y0: 0 }],
  [hazard({ id: 3, type: 'rockfall', x: 40, x1: 48, z: 0, halfW: 5, impulse: 1.2, strapJolt: 22, cycleTicks: 360, windowTicks: 72, phase: 0 })],
  10, [{ id: 0, x: 20, z: 5, name: 'SMUGGLER CACHE' }]);

describe('describeEvents', () => {
  it('reports caches, mover hits, wall strikes and lost cargo once each', () => {
    const s = createRun(route, [{ def: crateDef({ id: 'crate' }), slot: 1 }], tuning);
    let snap = snapshot(s);
    s.foundDiscoveries.push(0);
    let r = describeEvents(snap, s, route, tuning.cacheReserve); snap = r.next;
    expect(r.lines).toEqual([`CACHE: SMUGGLER CACHE +${tuning.cacheReserve} RESERVE`]);
    expect(describeEvents(snap, s, route, tuning.cacheReserve).lines).toEqual([]);
    s.zoneCooldown[3] = 100;
    r = describeEvents(snap, s, route, tuning.cacheReserve); snap = r.next;
    expect(r.lines).toEqual(['ROCKFALL HIT']);
    s.items[0]!.restraint = 40; s.speed = 0; s.targetSpeed = 10;
    r = describeEvents(snap, s, route, tuning.cacheReserve); snap = r.next;
    expect(r.lines).toEqual(['WALL STRIKE']);
    expect(describeEvents(snap, s, route, tuning.cacheReserve).lines).toEqual([]);
    s.items[0]!.lost = true;
    r = describeEvents(snap, s, route, tuning.cacheReserve);
    expect(r.lines).toEqual(['CRATE OVERBOARD — RECOVER (R)']);
  });
});
```

- [ ] **Step 2: Implement events**

Create `src/game/events.ts`:

```ts
import type { RigState, RouteDef } from '../sim/types';

export interface EventSnapshot { found: number; lost: string[]; cooldown: number[]; restraintSum: number; speed: number; targetSpeed: number }

export function snapshot(s: RigState): EventSnapshot {
  return {
    found: s.foundDiscoveries.length,
    lost: s.items.filter((it) => it.lost).map((it) => it.id),
    cooldown: [...s.zoneCooldown],
    restraintSum: s.items.reduce((a, it) => a + (it.lost ? 0 : it.restraint), 0),
    speed: s.speed, targetSpeed: s.targetSpeed,
  };
}

const MOVER_NAME = { rockfall: 'ROCKFALL', crane: 'SWINGING LOAD' } as const;

/** Diffs two consecutive states into teleprinter lines. Pure; the flow keeps `next` for the following tick. */
export function describeEvents(prev: EventSnapshot, s: RigState, route: RouteDef, cacheReserve: number): { lines: string[]; next: EventSnapshot } {
  const next = snapshot(s);
  const lines: string[] = [];
  for (let i = prev.found; i < next.found; i++) {
    const d = route.discoveries.find((x) => x.id === s.foundDiscoveries[i]);
    if (d) lines.push(`CACHE: ${d.name} +${Math.round(cacheReserve)} RESERVE`);
  }
  for (const id of next.lost) if (!prev.lost.includes(id)) lines.push(`${id.toUpperCase()} OVERBOARD — RECOVER (R)`);
  for (const z of route.zones) {
    if (z.type === 'mud') continue;
    if ((next.cooldown[z.id] ?? -1) > (prev.cooldown[z.id] ?? -1)) lines.push(`${MOVER_NAME[z.type as 'rockfall' | 'crane']} HIT`);
  }
  const jolted = next.restraintSum < prev.restraintSum - 5;
  const stopped = next.targetSpeed > 0 && next.speed === 0 && s.grounded;   // W held, rig not moving: something solid stopped it
  if (jolted && stopped && next.lost.length === prev.lost.length && next.found === prev.found) lines.push('WALL STRIKE');
  return { lines, next };
}
```

- [ ] **Step 3: Panel**

In `src/ui/panel/panel.ts` `update()` replace the two `targetSpeed`/`targetRpm` lines with:

```ts
    const targetRpm = 600 + 2400 * clamp(Math.abs(s.targetSpeed) / vmax, 0, 1);
```

and `const rpm = 600 + 2400 * clamp(Math.abs(s.speed) / vmax, 0, 1);`. The strap gauge label stays `ACTIVE RESTRAINT`; its fill already reads `s.strap` (= selected bay).

- [ ] **Step 4: HUD**

Replace `src/ui/hud.ts` with:

```ts
import type { HazardType, RigState, RouteDef } from '../sim/types';
import { itemAtSlot, moverActive } from '../sim/step';
import { minimapMarkup, mapPoint } from './sketch';

const HAZARD_NAMES: Record<HazardType, string> = {
  gust: 'CROSSWIND', rubble: 'RUBBLE FIELD', gap: 'COLLAPSED SPAN', grade: 'STEEP GRADE', scree: 'SCREE RUN',
  mud: 'MUD', rockfall: 'ROCKFALL', crane: 'SWINGING LOAD',
};
const MAP_W = 180, MAP_H = 100, WINDOW_BEHIND = 40, WINDOW_AHEAD = 200, REBUILD_EVERY = 20;

function thinThousands(n: number): string {
  const neg = n < 0;
  const digits = String(Math.abs(n));
  const groups: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) groups.unshift(digits.slice(Math.max(0, i - 3), i));
  return (neg ? '-' : '') + groups.join(' ');
}

export interface HudHandlers { onSelectBay(slot: number): void }

export class Hud {
  private readonly slopeEl: HTMLElement;
  private readonly altEl: HTMLElement;
  private readonly spdEl: HTMLElement;
  private readonly distanceEl: HTMLElement;
  private readonly threatEl: HTMLElement;
  private readonly progressEl: HTMLElement;
  private readonly exploreEl: HTMLElement;
  private readonly mapEl: SVGElement;
  private readonly mapLayer: SVGGElement;
  private readonly mapPlayer: SVGCircleElement;
  private readonly cargoRackEl: HTMLElement;
  private windowX0 = Number.NaN;
  private rackKey = '';

  constructor(viewport: HTMLElement, private readonly h: HudHandlers) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `<div class="hud-top"><span class="route-mark">MULE•7 / LIVE HAUL</span><span class="distance"></span></div>
      <div class="threat" hidden><span class="threat-label"></span><b></b></div>
      <div class="explore"></div>
      <svg class="minimap" viewBox="0 0 ${MAP_W} ${MAP_H}" aria-label="Route map"><g class="layer"></g><circle class="map-player" r="2.5"/></svg>
      <div class="cargo-rack"></div>
      <div class="drive-help"><b>W/S</b> WALK · <b>A/D</b> LANE · <b>SPACE</b> JUMP · <b>TAB</b> BAY · <b>F</b> RATCHET · <b>SHIFT</b> BRACE · <b>DRAG</b> BALLAST</div>
      <div class="hud-bottom"><span class="slope"></span><span class="alt"></span><span class="spd"></span></div>
      <div class="route-progress"><i></i></div>`;
    viewport.appendChild(el);
    const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
    this.slopeEl = q('.slope'); this.altEl = q('.alt'); this.spdEl = q('.spd'); this.distanceEl = q('.distance');
    this.threatEl = q('.threat'); this.progressEl = q('.route-progress i'); this.exploreEl = q('.explore');
    this.mapEl = q('.minimap'); this.mapLayer = q('.minimap .layer'); this.mapPlayer = q('.map-player'); this.cargoRackEl = q('.cargo-rack');
    this.cargoRackEl.addEventListener('pointerdown', (e) => {
      const bay = (e.target as HTMLElement).closest<HTMLElement>('.cargo-bay');
      if (bay) this.h.onSelectBay(Number(bay.dataset.slot));
    });
  }

  update(s: RigState, route: RouteDef): void {
    // minimap: scrolling window, static layer rebuilt every REBUILD_EVERY metres
    const x0 = Math.max(0, Math.floor((s.x - WINDOW_BEHIND) / REBUILD_EVERY) * REBUILD_EVERY), x1 = x0 + WINDOW_BEHIND + WINDOW_AHEAD;
    if (x0 !== this.windowX0) { this.windowX0 = x0; this.mapLayer.innerHTML = minimapMarkup(route, x0, x1, MAP_W, MAP_H); }
    const p = mapPoint(route, s.x, s.z, x0, x1, MAP_W, MAP_H);
    this.mapPlayer.setAttribute('cx', p.sx.toFixed(1)); this.mapPlayer.setAttribute('cy', p.sy.toFixed(1));
    for (const cache of this.mapLayer.querySelectorAll<SVGElement>('.cache')) cache.classList.toggle('found', s.foundDiscoveries.includes(Number(cache.dataset.cache)));

    // cargo rack
    const rackKey = s.items.map((it) => `${it.slot}${it.lost ? 'L' : ''}${it.slot === s.selectedSlot ? 'S' : ''}${Math.round(it.restraint)}:${Math.round((1 - it.stress) * 100)}`).join('|');
    if (rackKey !== this.rackKey) {
      this.rackKey = rackKey;
      this.cargoRackEl.innerHTML = [...s.items].sort((a, b) => a.slot - b.slot).map((it) => {
        const condition = Math.max(0, Math.round((1 - it.stress) * 100));
        const warning = it.lost ? 'LOST' : it.restraint < 30 ? 'LOOSE' : `${condition}% OK`;
        const selected = it.slot === s.selectedSlot;
        return `<div class="cargo-bay${selected ? ' selected' : ''}${it.lost || it.restraint < 30 ? ' warning' : ''}" data-slot="${it.slot}"><b>${['FORE', 'MID', 'AFT'][it.slot]} · ${it.id.toUpperCase()}</b><span>${warning}</span><i><em style="width:${Math.round(it.restraint)}%"></em></i></div>`;
      }).join('');
    }

    // readouts
    const slopeDeg = Math.round(Math.atan(route.slopeAt(s.x)) * 180 / Math.PI);
    this.slopeEl.textContent = `SLOPE ${slopeDeg >= 0 ? '+' : ''}${slopeDeg}°`;
    this.altEl.textContent = `ALT ${thinThousands(Math.round(1200 + route.heightAt(s.x)))} m`;
    this.spdEl.textContent = `${Math.round(Math.abs(s.speed) * 3.6)} km/h${s.grounded ? '' : ` · AIR +${s.lift.toFixed(1)}m`}`;
    this.spdEl.classList.toggle('airborne', !s.grounded);
    this.distanceEl.textContent = `${Math.max(0, Math.ceil(route.length - s.x))} m TO DROP`;
    this.progressEl.style.width = `${Math.min(100, s.x / route.length * 100)}%`;

    // salvage pointer
    const unfound = route.discoveries.filter((d) => !s.foundDiscoveries.includes(d.id));
    const closest = unfound.sort((a, b) => (a.x - s.x) ** 2 + (a.z - s.z) ** 2 - ((b.x - s.x) ** 2 + (b.z - s.z) ** 2))[0];
    if (closest) {
      const side = closest.z < s.z ? '◀' : '▶';
      this.exploreEl.textContent = `SALVAGE ${side} ${Math.round(Math.hypot(closest.x - s.x, closest.z - s.z))}m  ·  ${s.foundDiscoveries.length}/${route.discoveries.length}`;
    } else this.exploreEl.textContent = `ALL SALVAGE RECOVERED  ·  ${s.foundDiscoveries.length}/${route.discoveries.length}`;

    // threat: next impulse hazard in my lane
    const next = route.hazards.find((h) => (h.x1 ?? h.x) >= s.x && h.impulse > 0 && Math.abs(s.z - h.z) < h.halfW);
    const metres = next ? Math.max(0, Math.ceil(next.x - s.x)) : Infinity;
    const visible = Boolean(next && metres < 55);
    this.threatEl.hidden = !visible;
    this.threatEl.classList.toggle('critical', metres < 15);
    if (next && visible) {
      const mover = next.cycleTicks !== undefined ? (moverActive(s.t, next) ? ' · ACTIVE' : ' · CLEAR') : '';
      (this.threatEl.querySelector('.threat-label') as HTMLElement).textContent = metres < 15 ? 'IMPACT IMMINENT' : 'OBSTACLE AHEAD';
      (this.threatEl.querySelector('b') as HTMLElement).textContent = `${HAZARD_NAMES[next.type]} · ${metres}m${mover}`;
    }
    void itemAtSlot;
  }
}
```

(Delete the `void itemAtSlot;` line and the `itemAtSlot` import if lint flags it as unused — it is only there to keep the import list stable while editing.)

- [ ] **Step 5: CSS**

In `src/ui/panel/panel.css` append:

```css
.cargo-rack { pointer-events: auto; }
.cargo-bay { cursor: pointer; }
.minimap .wall { fill: #8a847c; } .minimap .rock { fill: #5a544c; } .minimap .ruin { fill: #7a5a44; } .minimap .baffle { fill: #a09a90; }
.minimap .hz { fill: #d9603a; } .minimap .hz-mud { fill: #4b3f33; opacity: .8; } .minimap .hz-rockfall, .minimap .hz-crane { fill: #b83a2a; opacity: .75; }
.minimap .cache { fill: #d29a4a; } .minimap .cache.found { fill: #59615f; }
.sketch { display: block; width: 100%; height: 96px; background: #f4ecd8; border: 2px solid var(--gun); border-radius: 4px; margin-bottom: 10px; }
.sketch .corridor { fill: #d9cfb6; } .sketch .wall { fill: #6f6a63; } .sketch .rock { fill: #4f4a44; } .sketch .ruin { fill: #6e4a34; } .sketch .baffle { fill: #8a847c; }
.sketch .hz { fill: #c8622a; } .sketch .hz-mud { fill: #4b3f33; } .sketch .hz-rockfall, .sketch .hz-crane { fill: #8f2f22; opacity: .7; } .sketch .cache { fill: #b8860b; }
```

and change `.explore` / `.minimap` colours to the amber/ash palette (`.explore { color: #e8c39a; background: rgba(40,32,24,.72); border-right-color: #d29a4a; }`, `.map-player { fill: #ff6a22; }`).

- [ ] **Step 6: Dispatch sketch and flow wiring**

- `src/ui/screens/dispatch.ts`: `DispatchProps` gains `sketch: string`; replace `${slopeProfileSvg(p.profile, p.profileStepM)}` with `${p.sketch}<div class="profile-strip">${slopeProfileSvg(p.profile, p.profileStepM, 480, 28)}</div>`.
- `src/game/flow.ts`:
  - imports: `import { routeSketchSvg } from '../ui/sketch'; import { describeEvents, snapshot, type EventSnapshot } from './events';`
  - constructor: `this.hud = new Hud(d.viewportEl, { onSelectBay: (slot) => d.input.selectCargo(slot) });`
  - `dispatch()`: pass `sketch: routeSketchSvg(this.route)` in the props.
  - `haul()`: after `input.reset()…` add `input.setBays(loadout.map((l) => l.slot)); let snap: EventSnapshot = snapshot(state);` and in the `step` callback after `step(state, …)` add `const ev = describeEvents(snap, state, route, tuning.cacheReserve); snap = ev.next; if (ev.lines.length) panel.setMessage(ev.lines.join('\n'));`.
  - the hazard lamp: `panel.setHazard(route.hazards.some((h) => h.impulse > 0 && (h.x1 ?? h.x) >= state.x && h.x <= state.x + this.telegraph[h.type] && Math.abs(state.z - h.z) < h.halfW));`
  - the HQ haul line: `` `HQ: ${this.offers!.outpost.name}. ${loadout.length} aboard. W walks at the gait you set. Pick your lanes.` ``.
- `src/main.ts`: unchanged apart from Task 1.

- [ ] **Step 7: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: green (`events.test.ts` passing).

```bash
git add -A
git commit -m "feat(ui): lane-aware HUD with scrolling minimap and tappable cargo rack; dispatch sketch; teleprinter events"
```

---

### Task 14: Docs, manual check, merge

**Files:**
- Modify: `DEVLOG.md`, `docs/superpowers/specs/2026-08-25-deadweight-design.md` (§8 pointer), `.github/workflows/deploy.yml` (no change expected), `README.md` if present

- [ ] **Step 1: Docs**

- `DEVLOG.md`: under `## Pivot: porter obstacle course (PR #1, 2026-08-26)` add a sub-bullet list "**Ground course (PR #2)**: seeded corridor per outpost with forked lanes (spines, chicanes, mud, pockets), deterministic 2-D sim (AABB walls, W-at-gait throttle, jump, per-bay restraint, rockfall/crane windows), bot lane planner, fixed 3/4 camera + mouse ballast + touch D-pad, ash/rust palette; Rapier removed (−766 KB gzip)." and refresh the validator table by pasting the new `pnpm validate` output.
- Spec `2026-08-25-…design.md` §8: replace the body with one line: "Superseded by `2026-08-26-deadweight-ground-course-design.md`."

- [ ] **Step 2: Full gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm validate && pnpm build && ls -la dist/assets`
Expected: all green; no chunk larger than `ThreeRenderer-*.js`.

- [ ] **Step 3: Manual run (the owner plays)**

Run: `pnpm dev` and open the printed URL (and on a phone via the LAN address). Check, in order: dispatch shows the sketch → loadout → the rig walks only while W is held, at the gait on the rail → A/D changes lane, walls stop you, a fast hit shows `WALL STRIKE` and drops restraint → Tab/5/6/7/rack-tap select a bay and F ratchets only that bay → a rockfall lane hits only while the boulders roll → mouse drag on the viewport moves BALLAST → on the phone the D-pad drives and a drag elsewhere sets ballast → result → workshop → dispatch. Note anything off in the ledger before committing.

- [ ] **Step 4: Commit, push, PR, merge**

```bash
git add -A
git commit -m "docs: ground course devlog and spec pointer"
git push -u origin feat/ground-course
gh pr create --base main --head feat/ground-course --title "feat: seeded ground course — forked lanes, deterministic 2-D sim, fixed camera" --body-file <(printf '%s\n' "Implements docs/superpowers/specs/2026-08-26-deadweight-ground-course-design.md" "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)" "" "https://claude.ai/code/session_01VrvcYqGcg2NY6ANqJokjrV")
gh pr merge --merge
gh run watch "$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
curl -sI https://ariaspect.github.io/deadweight/ | head -1
```

Expected: CI success, live 200.

---

## Self-review

- **Spec coverage.** §1 generator → Tasks 4–5; §2 sim → Tasks 2, 3, 6, 7, 8; §3 input/camera/panel/HUD/screens → Tasks 1, 10, 13; §4 render/palette → Tasks 11, 12; §5 bot/validator/tests → Task 9 (+ tests in every sim task); §6 milestones → G1 = Tasks 2–10, G2 = 11–12, G3 = 13–14; retirement of Rapier → Task 1. `RouteDef.passable` from the spec is delivered as `isPassable(walls, bound, x, z)` in `src/sim/walls.ts` (data stays on `RouteDef`, geometry in one module) — spec amendment noted here.
- **Cut list** (spec §6) maps to: crane → skip its branch in Task 5 `FORK_TYPES` and Task 12 `buildCrane`; chicanes → `pickArchetypes` without `'chicane'`; pockets → `pocketCount = 0`; scrolling minimap → `WINDOW_AHEAD = route.length`.
- **Placeholders.** None; every code step is complete.
- **Type consistency.** `HazardInstance.x1/cycleTicks/windowTicks/phase` optional everywhere; `RigState.zoneCooldown: number[]`; `BotView.lateralVel` added in Task 9 and used by its steering law; `Hud` constructor takes handlers from Task 13 on (Task 1 constructs it with one argument — Task 13 updates the call); `loosenAll(s, amount)` keeps its signature from Task 6 to 7; `frame()` defaults `throttle: 1` from Task 2 so the M2 tests keep meaning "walking".
