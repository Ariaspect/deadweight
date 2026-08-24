# DEADWEIGHT Core Loop (M0–M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, playable DEADWEIGHT core loop — dispatch → load → haul → arrival → review → upgrade — with a deterministic sim, a Three.js viewport, a DOM control panel, and a headless validator proving every shipped route is solvable.

**Architecture:** `src/sim/` is a pure, DOM-free, transcendental-free deterministic simulation stepped at 60 Hz by `game/loop.ts`. `render/three/` reads sim state and draws a heightfield ribbon plus a six-legged rig from a 3/4 chase camera. `ui/` is DOM+CSS panel chrome and screens. `game/flow.ts` sequences screens. `scripts/validate.ts` runs a lagged bot over every outpost seed and fails CI if any is unsolvable.

**Tech Stack:** Vite 6, TypeScript 5 (strict), pnpm, Three.js (dynamic import), vitest, eslint (flat config, typescript-eslint), tsx for scripts, GitHub Pages via Actions.

**Spec:** `docs/superpowers/specs/2026-08-25-deadweight-design.md` — read it first. `HAULER_SPEC.md` gives the original concept; the spec supersedes its §6, §8, §11.

## Global Constraints

- Static site, no server required to play; deployed to GitHub Pages at `https://ariaspect.github.io/deadweight/`.
- Cold load to first panel input < 3 s; Three is loaded via dynamic `import()` after panel paints.
- Desktop mouse/keyboard **and** touch. Portrait phone is a first-class layout.
- Sim is deterministic: fixed 60 Hz timestep, `mulberry32` seeded RNG, inputs recorded as `InputFrame[]`.
- `src/sim/**` never imports `three`, `render/`, `ui/`, `game/`, `audio/`, or DOM globals, and never calls `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/log2/log10/pow/sqrt/cbrt/sinh/cosh/tanh/random`. ESLint enforces this.
- `ballast` is an integer in `[-ballastRange, ballastRange]` before it enters the sim.
- Every sim constant lives in `src/content/tuning.json`. Nothing hardcoded.
- Zero external assets. Everything is code-drawn or generated.
- Title: **DEADWEIGHT**. Palette: cream `#e8dcc0`, oxidized orange `#c8622a`, gunmetal `#3a3f45`, danger red `#d12b1f`.
- Commit after every task. Commit messages end with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6
  ```
- Package manager is `pnpm`. Run tests with `pnpm test`, single file with `pnpm vitest run <path>`.

---

## File Structure

```
deadweight/
  index.html                       panel shell + viewport mount; no JS logic
  package.json  vite.config.ts  tsconfig.json  eslint.config.js  vitest.config.ts
  .github/workflows/deploy.yml     lint + typecheck + test + validate + build + Pages deploy
  DEVLOG.md                        decided / AI built / problems solved
  src/
    sim/
      types.ts        all sim types (single source of truth for names)
      rng.ts          mulberry32, hashSeed
      terrain.ts      generateRoute, routeFromSegments
      step.ts         createRun, step (+ stepRig, stepItems, stepEvents)
      score.ts        evaluate
      bot.ts          LagBuffer, botPolicy, runHeadless
      upgrades.ts     applyUpgrades
    content/
      tuning.json cargo.json hazards.json outposts.json upgrades.json reviews.json hq.json
      index.ts        typed re-exports of the JSON above
    render/
      Renderer.ts     interface
      three/ThreeRenderer.ts  terrain.ts  rig.ts  hazards.ts  cargo.ts
    ui/
      input.ts        InputController + pure reducers
      panel/panel.ts  panel.css   gauges, throttle rail, buttons
      screens/dispatch.ts loadout.ts result.ts upgrade.ts  screens.css
      profile.ts      slope-profile SVG strip
    game/
      loop.ts         GameLoop (fixed-step accumulator, input log)
      flow.ts         Flow state machine
      save.ts         SaveData, loadSave, writeSave
      orders.ts       generateOffers
    main.ts
  scripts/
    validate.ts
  test/
    helpers.ts  rng.test.ts  terrain.test.ts  step.test.ts  tilt.test.ts  items.test.ts
    score.test.ts  bot.test.ts  replay.test.ts  loop.test.ts  input.test.ts
    save.test.ts  orders.test.ts  upgrades.test.ts  content.test.ts  hazards.test.ts
```

---

# Phase M0 — Skeleton

### Task 1: Project scaffold, lint rule, CI, first deploy

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`, `src/main.ts`, `src/sim/types.ts` (empty export), `.github/workflows/deploy.yml`, `DEVLOG.md`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `pnpm dev|build|test|lint|typecheck` scripts; repo `Ariaspect/deadweight` on GitHub with Pages deploying from Actions.

- [ ] **Step 1: Init package and deps**

```bash
cd /home/ariaspect/dev/hauler
git branch -M main
pnpm init
pnpm add three
pnpm add -D typescript vite vitest @types/three eslint @eslint/js typescript-eslint tsx jsdom
```

- [ ] **Step 2: Write `package.json` scripts** (edit the generated file; keep `"type": "module"`)

```json
{
  "name": "deadweight",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "validate": "tsx scripts/validate.ts"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/deadweight/' : '/',
  build: { target: 'es2022', sourcemap: false },
}));
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 5: Write `eslint.config.js` with the sim-purity rule**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const transcendentals = ['sin','cos','tan','asin','acos','atan','atan2','exp','log','log2','log10','pow','sqrt','cbrt','sinh','cosh','tanh','random'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['three', 'three/**', '**/render/**', '**/ui/**', '**/game/**', '**/audio/**'], message: 'src/sim must stay pure.' }],
      }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'performance', 'requestAnimationFrame', 'localStorage'],
      'no-restricted-properties': ['error',
        ...transcendentals.map((p) => ({ object: 'Math', property: p, message: `Math.${p} is not cross-engine deterministic; forbidden in src/sim.` })),
      ],
    },
  },
);
```

- [ ] **Step 6: Write `index.html` and a stub `src/main.ts`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>DEADWEIGHT</title>
</head>
<body>
  <main id="app">
    <section id="viewport" aria-label="Viewport"></section>
    <section id="panel" aria-label="Control panel">
      <h1>DEADWEIGHT</h1>
      <p id="status">booting…</p>
    </section>
  </main>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

```ts
// src/main.ts
const status = document.getElementById('status');
if (status) status.textContent = 'panel online';
```

```ts
// src/sim/types.ts
export {};
```

- [ ] **Step 7: Write a smoke test and confirm the toolchain**

```ts
// test/smoke.test.ts
import { describe, it, expect } from 'vitest';
describe('toolchain', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: 1 test passes, lint clean, typecheck clean, `dist/` produced.

- [ ] **Step 8: Write the Pages workflow**

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 9: Start DEVLOG.md**

```markdown
# DEADWEIGHT — DEVLOG

## What I decided
- Operator framing: you never control the rig, only the panel.
- 50/50 reflex/planning: loadout slot positions shift neutral trim; dispatch shows the slope profile.
- Pressure reserve is the clock; rush cargo adds per-item deadlines.
- Second-order tilt (rig has angular momentum, overshoots).
- Fixed outpost map (12 permanent seeds) so traces accumulate per route.
- Three.js viewport behind a Renderer interface; panel is DOM.

## What AI built
- (fill per milestone)

## Problems solved
- (fill per milestone)
```

- [ ] **Step 10: Commit, create repo, enable Pages, push**

```bash
git add -A
git commit -m "chore: scaffold Vite+TS, sim-purity lint rule, Pages workflow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
gh repo create deadweight --public --source=. --remote=origin --push
gh api -X POST repos/Ariaspect/deadweight/pages -f build_type=workflow
gh run watch --exit-status
```

Expected: workflow green; `https://ariaspect.github.io/deadweight/` shows "DEADWEIGHT / panel online". If `gh api ... pages` returns 409 (already exists), continue.

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/sim/rng.ts`
- Test: `test/rng.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Rng { next(): number; gaussian(): number; int(n: number): number }
  export function mulberry32(seed: number): Rng
  export function hashSeed(...parts: number[]): number
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// test/rng.test.ts
import { describe, it, expect } from 'vitest';
import { mulberry32, hashSeed } from '../src/sim/rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(4417), b = mulberry32(4417);
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).toEqual(sb);
  });
  it('differs across seeds', () => {
    expect(mulberry32(1).next()).not.toBe(mulberry32(2).next());
  });
  it('stays in [0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('gaussian has ~0 mean and ~1 sd', () => {
    const r = mulberry32(99); let s = 0, s2 = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const g = r.gaussian(); s += g; s2 += g * g; }
    const mean = s / n, sd = Math.sqrt(s2 / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });
  it('int(n) is in [0,n)', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 200; i++) { const v = r.int(6); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(6); expect(Number.isInteger(v)).toBe(true); }
  });
});

describe('hashSeed', () => {
  it('is stable and order-sensitive', () => {
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2));
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/rng.test.ts`
Expected: FAIL — cannot resolve `../src/sim/rng`.

- [ ] **Step 3: Implement**

```ts
// src/sim/rng.ts
export interface Rng {
  next(): number;      // [0,1)
  gaussian(): number;  // ~N(0,1), sum of 12 uniforms − 6 (no log/sqrt)
  int(n: number): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    gaussian() { let s = 0; for (let i = 0; i < 12; i++) s += next(); return s - 6; },
    int(n) { return Math.floor(next() * n); },
  };
}

/** FNV-1a over 32-bit parts. Order-sensitive. */
export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) { h ^= p >>> 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
```

- [ ] **Step 4: Run tests and lint**

Run: `pnpm vitest run test/rng.test.ts && pnpm lint`
Expected: 6 pass; lint clean (test file may use `Math.sqrt` — it is outside `src/sim`).

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts test/rng.test.ts
git commit -m "feat(sim): mulberry32 rng, gaussian, hashSeed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 3: Sim types and tuning.json

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/content/tuning.json`, `src/content/index.ts`
- Test: `test/content.test.ts`

**Interfaces:**
- Produces: every type below; `tuning` export from `src/content/index.ts` typed as `Tuning`.

- [ ] **Step 1: Write `src/sim/types.ts`**

```ts
// src/sim/types.ts
export type Gait = 0 | 1 | 2 | 3 | 4;
export type Behavior = 'static' | 'slosh' | 'livestock' | 'precarious';
export type HazardType = 'gust' | 'rubble' | 'gap' | 'grade' | 'scree';
export type KitId = 'plank' | 'rope' | 'drum' | 'sign';
export type TraceType = KitId | 'wreckage';
export type EndReason = 'arrived' | 'spilled' | 'stalled';

export interface ItemDef {
  id: string; name: string; mass: number;
  tolerance: number;     // |tilt| above this accrues stress
  crushLimit: number;    // strap above this accrues stress
  behavior: Behavior; payout: number; rush?: number; tier: number;
  art: { shape: 'box' | 'cylinder' | 'sphere' | 'cage'; color: string };
}

export interface HazardDef {
  type: HazardType; impulse: number; strapJolt: number; telegraphM: number;
  counter: string; weight: number; minTier: number; count?: number; spreadM?: number;
}

export interface OutpostDef { id: string; name: string; seed: number; lengthM: number; tier: number; flavor: string }

export interface UpgradeDef {
  id: string; name: string; cost: number; blurb: string;
  effect: { key: 'ballastRange' | 'autoTrim' | 'strapJoltMul' | 'capacity' | 'gaitSpeedMul' | 'kitCostMul'; value: number };
}

export interface Segment { x0: number; x1: number; slope: number; y0: number }
export interface HazardInstance { id: number; type: HazardType; x: number; impulse: number; strapJolt: number; dir: 1 | -1 }

export interface RouteDef {
  seed: number; length: number; segments: Segment[]; hazards: HazardInstance[];
  slopeProfile: number[];            // sampled every terrain.profileStepM
  slopeAt(x: number): number;
  heightAt(x: number): number;
}

export interface ItemState {
  id: string; slot: number; mass: number; tolerance: number; crushLimit: number; behavior: Behavior; payout: number;
  offset: number; offsetVel: number; stress: number; lost: boolean; deadlineTick: number; // -1 = none
}

export interface RigState {
  t: number; x: number; tilt: number; tiltVel: number; gait: Gait; ballast: number;
  strap: number; reserve: number; braced: boolean; items: ItemState[];
  recovering: number; hazardCursor: number; overTiltTicks: number; ended: EndReason | null;
}

export interface InputFrame { gait: Gait; ballast: number; strap: boolean; brace: boolean; deploy: KitId | 0; recover: boolean }

export interface LoadoutItem { def: ItemDef; slot: number }

export interface Trace { id: string; seed: number; x: number; type: TraceType; ownerName: string; useCount: number; ageHours: number }

export interface TerrainTuning { segMin: number; segMax: number; slopeSigma: number[]; maxSlope: number; gradeSlope: number; hazardJitter: number; profileStepM: number; safeStartM: number; safeEndM: number }
export interface BotTuning { kp: number; kd: number; lagTicks: number; strapBelow: number; braceAheadM: number; leadSec: number }

export interface Tuning {
  dt: number; gaitSpeed: number[]; gaitSpeedMul: number;
  kSlope: number; kBallast: number; kLoad: number; damping: number; stiffness: number; braceDamp: number;
  reserveBudget: number; braceDrain: number; reserveStart: number;
  ballastRange: number; ballastRate: number; autoTrim: number;
  strapStart: number; strapTap: number; strapJoltMul: number;
  driftThreshold: number; graceTicks: number; kDrift: number; sloshGain: number; sloshStiff: number; sloshDamp: number; kLive: number; precariousMul: number;
  kStress: number; kCrush: number; spillTilt: number;
  recoverTicks: number; recoverCost: number; recoverStress: number;
  kBonus: number; stallMultiplier: number; starBuckets: number[];
  slotPos: number[]; capacity: number; kitCostMul: number;
  terrain: TerrainTuning; bot: BotTuning;
}

export interface ItemResult { id: string; condition: number; payout: number; lost: boolean; late: boolean }
export interface RunResult { items: ItemResult[]; stars: number; payout: number; bonus: number; total: number; ended: EndReason }
```

- [ ] **Step 2: Write `src/content/tuning.json`** (starting values; the harness will move them)

```json
{
  "dt": 0.016666666666666666,
  "gaitSpeed": [0, 4, 7, 10, 14],
  "gaitSpeedMul": 1,
  "kSlope": 4.0,
  "kBallast": 3.0,
  "kLoad": 2.0,
  "damping": 1.3,
  "stiffness": 2.0,
  "braceDamp": 0.85,
  "reserveBudget": 0.75,
  "braceDrain": 2.5,
  "reserveStart": 100,
  "ballastRange": 100,
  "ballastRate": 160,
  "autoTrim": 0,
  "strapStart": 70,
  "strapTap": 15,
  "strapJoltMul": 1,
  "driftThreshold": 0.25,
  "graceTicks": 24,
  "kDrift": 0.8,
  "sloshGain": 1.2,
  "sloshStiff": 6,
  "sloshDamp": 1.5,
  "kLive": 0.6,
  "precariousMul": 3,
  "kStress": 0.5,
  "kCrush": 0.01,
  "spillTilt": 1.0,
  "recoverTicks": 480,
  "recoverCost": 10,
  "recoverStress": 0.5,
  "kBonus": 2,
  "stallMultiplier": 0.3,
  "starBuckets": [0.2, 0.4, 0.6, 0.8, 1.0],
  "slotPos": [-1, 0, 1],
  "capacity": 2,
  "kitCostMul": 1,
  "terrain": {
    "segMin": 20, "segMax": 60,
    "slopeSigma": [0.12, 0.18, 0.24, 0.3],
    "maxSlope": 0.5, "gradeSlope": 0.45,
    "hazardJitter": 8, "profileStepM": 10,
    "safeStartM": 40, "safeEndM": 20
  },
  "bot": { "kp": 220, "kd": 90, "lagTicks": 15, "strapBelow": 60, "braceAheadM": 8, "leadSec": 0.4 }
}
```

- [ ] **Step 3: Write `src/content/index.ts`**

```ts
// src/content/index.ts
import type { Tuning } from '../sim/types';
import tuningJson from './tuning.json';
export const tuning: Tuning = tuningJson as Tuning;
```

- [ ] **Step 4: Write the content test**

```ts
// test/content.test.ts
import { describe, it, expect } from 'vitest';
import { tuning } from '../src/content';

describe('tuning.json', () => {
  it('has 5 gait speeds, ascending, starting at 0', () => {
    expect(tuning.gaitSpeed).toHaveLength(5);
    expect(tuning.gaitSpeed[0]).toBe(0);
    for (let i = 1; i < 5; i++) expect(tuning.gaitSpeed[i]!).toBeGreaterThan(tuning.gaitSpeed[i - 1]!);
  });
  it('has 5 star buckets ending at 1', () => {
    expect(tuning.starBuckets).toHaveLength(5);
    expect(tuning.starBuckets[4]).toBe(1);
  });
  it('dt is 1/60', () => { expect(tuning.dt).toBeCloseTo(1 / 60, 10); });
  it('slotPos has 3 positions', () => { expect(tuning.slotPos).toEqual([-1, 0, 1]); });
  it('reserveBudget is a fraction', () => { expect(tuning.reserveBudget).toBeGreaterThan(0); expect(tuning.reserveBudget).toBeLessThan(1); });
});
```

- [ ] **Step 5: Run**

Run: `pnpm vitest run test/content.test.ts && pnpm typecheck && pnpm lint`
Expected: 4 pass, clean.

- [ ] **Step 6: Commit**

```bash
git add src/sim/types.ts src/content
git add test/content.test.ts
git commit -m "feat(sim): types and tuning.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 4: Terrain generator

**Files:**
- Create: `src/sim/terrain.ts`, `test/helpers.ts`
- Test: `test/terrain.test.ts`

**Interfaces:**
- Consumes: `Rng`, `mulberry32`, types from Task 3.
- Produces:
  ```ts
  export function routeFromSegments(seed: number, segments: Segment[], hazards: HazardInstance[], profileStepM: number): RouteDef
  export function generateRoute(seed: number, lengthM: number, tier: number, hazardDefs: HazardDef[], t: TerrainTuning): RouteDef
  ```
  Test helpers: `flatRoute(length)`, `slopeRoute(slope, length)`, `crateDef()`, `frame(partial)`.

- [ ] **Step 1: Write helpers**

```ts
// test/helpers.ts
import type { ItemDef, InputFrame, RouteDef } from '../src/sim/types';
import { routeFromSegments } from '../src/sim/terrain';
import { tuning } from '../src/content';

export function flatRoute(length = 500): RouteDef {
  return routeFromSegments(1, [{ x0: 0, x1: length, slope: 0, y0: 0 }], [], tuning.terrain.profileStepM);
}
export function slopeRoute(slope: number, length = 500): RouteDef {
  return routeFromSegments(2, [{ x0: 0, x1: length, slope, y0: 0 }], [], tuning.terrain.profileStepM);
}
export function crateDef(over: Partial<ItemDef> = {}): ItemDef {
  return { id: 'crate', name: 'Crate', mass: 1, tolerance: 0.5, crushLimit: 90, behavior: 'static', payout: 100, tier: 0, art: { shape: 'box', color: '#8a6d3b' }, ...over };
}
export function frame(over: Partial<InputFrame> = {}): InputFrame {
  return { gait: 2, ballast: 0, strap: false, brace: false, deploy: 0, recover: false, ...over };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/terrain.test.ts
import { describe, it, expect } from 'vitest';
import { generateRoute, routeFromSegments } from '../src/sim/terrain';
import { tuning } from '../src/content';
import type { HazardDef } from '../src/sim/types';

const hz: HazardDef[] = [
  { type: 'gust', impulse: 0.9, strapJolt: 10, telegraphM: 25, counter: 'strap', weight: 0.5, minTier: 0 },
  { type: 'grade', impulse: 0, strapJolt: 0, telegraphM: 30, counter: 'ballast', weight: 0.5, minTier: 0 },
];

describe('routeFromSegments', () => {
  it('interpolates height and returns segment slope', () => {
    const r = routeFromSegments(1, [{ x0: 0, x1: 100, slope: 0.2, y0: 0 }, { x0: 100, x1: 200, slope: -0.1, y0: 20 }], [], 10);
    expect(r.heightAt(50)).toBeCloseTo(10);
    expect(r.heightAt(150)).toBeCloseTo(15);
    expect(r.slopeAt(50)).toBe(0.2);
    expect(r.slopeAt(150)).toBe(-0.1);
    expect(r.slopeAt(-5)).toBe(0.2);
    expect(r.slopeAt(999)).toBe(-0.1);
  });
  it('samples slopeProfile every profileStepM', () => {
    const r = routeFromSegments(1, [{ x0: 0, x1: 100, slope: 0.2, y0: 0 }], [], 10);
    expect(r.slopeProfile).toHaveLength(11);
    expect(r.slopeProfile.every((s) => s === 0.2)).toBe(true);
  });
});

describe('generateRoute', () => {
  it('is deterministic per seed', () => {
    const a = generateRoute(4417, 600, 0, hz, tuning.terrain);
    const b = generateRoute(4417, 600, 0, hz, tuning.terrain);
    expect(a.segments).toEqual(b.segments);
    expect(a.hazards).toEqual(b.hazards);
  });
  it('differs per seed', () => {
    const a = generateRoute(1, 600, 0, hz, tuning.terrain);
    const b = generateRoute(2, 600, 0, hz, tuning.terrain);
    expect(a.segments).not.toEqual(b.segments);
  });
  it('covers exactly [0, length] with contiguous segments', () => {
    const r = generateRoute(5, 600, 1, hz, tuning.terrain);
    expect(r.segments[0]!.x0).toBe(0);
    expect(r.segments[r.segments.length - 1]!.x1).toBe(600);
    for (let i = 1; i < r.segments.length; i++) expect(r.segments[i]!.x0).toBe(r.segments[i - 1]!.x1);
  });
  it('is flat in the safe start and end zones and slopes are clamped', () => {
    const t = tuning.terrain;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = generateRoute(seed, 600, 3, hz, t);
      expect(r.slopeAt(t.safeStartM / 2)).toBe(0);
      expect(r.slopeAt(600 - t.safeEndM / 2)).toBe(0);
      for (const s of r.segments) expect(Math.abs(s.slope)).toBeLessThanOrEqual(t.maxSlope);
    }
  });
  it('keeps hazards sorted, outside safe zones, and honours minTier', () => {
    const t = tuning.terrain;
    const gated: HazardDef[] = [{ ...hz[0]!, minTier: 2 }];
    for (const seed of [11, 12, 13]) {
      const r = generateRoute(seed, 800, 3, hz, t);
      for (let i = 1; i < r.hazards.length; i++) expect(r.hazards[i]!.x).toBeGreaterThanOrEqual(r.hazards[i - 1]!.x);
      for (const h of r.hazards) { expect(h.x).toBeGreaterThanOrEqual(t.safeStartM); expect(h.x).toBeLessThanOrEqual(800 - t.safeEndM); }
      expect(generateRoute(seed, 800, 0, gated, t).hazards).toHaveLength(0);
    }
  });
  it('grade hazards sit on a steep segment', () => {
    const r = generateRoute(21, 1200, 3, [hz[1]!], tuning.terrain);
    const grades = r.hazards.filter((h) => h.type === 'grade');
    expect(grades.length).toBeGreaterThan(0);
    for (const g of grades) expect(Math.abs(r.slopeAt(g.x))).toBeCloseTo(tuning.terrain.gradeSlope);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run test/terrain.test.ts`
Expected: FAIL — cannot resolve `../src/sim/terrain`.

- [ ] **Step 4: Implement**

```ts
// src/sim/terrain.ts
import { mulberry32 } from './rng';
import type { HazardDef, HazardInstance, RouteDef, Segment, TerrainTuning } from './types';

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

function findSegment(segments: Segment[], x: number): Segment {
  let lo = 0, hi = segments.length - 1;
  if (x <= segments[0]!.x0) return segments[0]!;
  if (x >= segments[hi]!.x1) return segments[hi]!;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid]!;
    if (x < s.x0) hi = mid - 1;
    else if (x >= s.x1) lo = mid + 1;
    else return s;
  }
  return segments[lo]!;
}

export function routeFromSegments(seed: number, segments: Segment[], hazards: HazardInstance[], profileStepM: number): RouteDef {
  const length = segments[segments.length - 1]!.x1;
  const slopeAt = (x: number): number => findSegment(segments, x).slope;
  const heightAt = (x: number): number => {
    const s = findSegment(segments, x);
    const cx = clamp(x, s.x0, s.x1);
    return s.y0 + s.slope * (cx - s.x0);
  };
  const slopeProfile: number[] = [];
  for (let x = 0; x <= length; x += profileStepM) slopeProfile.push(slopeAt(x));
  return { seed, length, segments, hazards: [...hazards].sort((a, b) => a.x - b.x), slopeProfile, slopeAt, heightAt };
}

export function generateRoute(seed: number, lengthM: number, tier: number, hazardDefs: HazardDef[], t: TerrainTuning): RouteDef {
  const rng = mulberry32(seed);
  const sigma = t.slopeSigma[Math.min(tier, t.slopeSigma.length - 1)]!;
  const eligible = hazardDefs.filter((d) => d.minTier <= tier);
  const segments: Segment[] = [];
  const hazards: HazardInstance[] = [];
  let x = 0, y = 0, id = 0;

  while (x < lengthM) {
    const len = t.segMin + rng.next() * (t.segMax - t.segMin);
    const x1 = Math.min(lengthM, x + len);
    const inSafe = x < t.safeStartM || x1 > lengthM - t.safeEndM;
    let slope = inSafe ? 0 : clamp(rng.gaussian() * sigma, -t.maxSlope, t.maxSlope);

    if (!inSafe) {
      for (const def of eligible) {
        if (rng.next() >= def.weight) continue;
        const dir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
        if (def.type === 'grade') {
          slope = dir * t.gradeSlope;
          hazards.push({ id: id++, type: 'grade', x: x + 1, impulse: 0, strapJolt: 0, dir });
          continue;
        }
        const count = def.count ?? 1;
        const spread = def.spreadM ?? 0;
        const mid = (x + x1) / 2 + (rng.next() * 2 - 1) * t.hazardJitter;
        for (let c = 0; c < count; c++) {
          const hx = clamp(mid + (count > 1 ? (c / (count - 1) - 0.5) * spread : 0), t.safeStartM, lengthM - t.safeEndM);
          hazards.push({ id: id++, type: def.type, x: hx, impulse: def.impulse, strapJolt: def.strapJolt, dir });
        }
      }
    }
    segments.push({ x0: x, x1, slope, y0: y });
    y += slope * (x1 - x);
    x = x1;
  }
  return routeFromSegments(seed, segments, hazards, t.profileStepM);
}
```

- [ ] **Step 5: Run tests and lint**

Run: `pnpm vitest run test/terrain.test.ts && pnpm lint`
Expected: all pass, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/sim/terrain.ts test/helpers.ts test/terrain.test.ts
git commit -m "feat(sim): seeded piecewise-linear terrain with hazard placement

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 5: step() v0 — movement, reserve, arrival/stall

**Files:**
- Create: `src/sim/step.ts`
- Test: `test/step.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function createRun(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning): RigState
  export function step(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void   // mutates s
  export function drainRate(route: RouteDef, tuning: Tuning): number   // reserve units per second = reserveBudget·100·gaitSpeed[2]/route.length
  ```
  Reserve drains per second at a rate set so that gait 2 spends `reserveBudget` of the reserve over the whole route, whatever its length; gait 1 therefore stalls at ~75 % of any route, gait 4 arrives with ~60 % left.
  Later tasks add `stepRig`, `stepItems`, `stepEvents` inside this file.

- [ ] **Step 1: Write the failing tests**

```ts
// test/step.test.ts
import { describe, it, expect } from 'vitest';
import { createRun, step, drainRate } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, frame } from './helpers';

describe('createRun', () => {
  it('starts at x=0 with full reserve and starting strap', () => {
    const s = createRun(flatRoute(), [], tuning);
    expect(s.x).toBe(0); expect(s.t).toBe(0); expect(s.tilt).toBe(0);
    expect(s.reserve).toBe(tuning.reserveStart);
    expect(s.strap).toBe(tuning.strapStart);
    expect(s.ended).toBeNull();
  });
});

describe('step v0', () => {
  it('advances x by gaitSpeed[gait]*dt', () => {
    const s = createRun(flatRoute(), [], tuning);
    step(s, frame({ gait: 2 }), flatRoute(), [], tuning, mulberry32(1));
    expect(s.x).toBeCloseTo(tuning.gaitSpeed[2]! * tuning.dt);
    expect(s.t).toBe(1);
    expect(s.gait).toBe(2);
  });
  it('drains reserve by drainRate*dt per tick, scaled to route length', () => {
    const r = flatRoute(500); const s = createRun(r, [], tuning);
    step(s, frame(), r, [], tuning, mulberry32(1));
    expect(s.reserve).toBeCloseTo(tuning.reserveStart - drainRate(r, tuning) * tuning.dt);
    expect(drainRate(flatRoute(1000), tuning)).toBeCloseTo(drainRate(r, tuning) / 2);
  });
  it('gait 2 arrives with (1 - reserveBudget) of the reserve left on any length', () => {
    for (const len of [400, 960]) {
      const r = flatRoute(len); const s = createRun(r, [], tuning); const rng = mulberry32(1);
      for (let i = 0; i < 20000 && !s.ended; i++) step(s, frame({ gait: 2 }), r, [], tuning, rng);
      expect(s.ended).toBe('arrived');
      expect(s.reserve / tuning.reserveStart).toBeCloseTo(1 - tuning.reserveBudget, 1);
    }
  });
  it('ends with arrived when x reaches route length', () => {
    const r = flatRoute(50); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 2000 && !s.ended; i++) step(s, frame({ gait: 4 }), r, [], tuning, rng);
    expect(s.ended).toBe('arrived');
    expect(s.x).toBeGreaterThanOrEqual(50);
  });
  it('ends with stalled when reserve hits 0 (gait 1 cannot finish)', () => {
    const r = flatRoute(400); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 20000 && !s.ended; i++) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(s.ended).toBe('stalled');
    expect(s.reserve).toBeLessThanOrEqual(0);
    expect(s.x).toBeLessThan(400);
  });
  it('does nothing once ended', () => {
    const r = flatRoute(10); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) step(s, frame({ gait: 4 }), r, [], tuning, rng);
    const snap = { ...s };
    step(s, frame({ gait: 4 }), r, [], tuning, rng);
    expect(s).toEqual(snap);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/step.test.ts`
Expected: FAIL — cannot resolve `../src/sim/step`.

- [ ] **Step 3: Implement v0**

```ts
// src/sim/step.ts
import type { InputFrame, ItemState, LoadoutItem, RigState, RouteDef, Trace, Tuning } from './types';
import type { Rng } from './rng';

export function createRun(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning): RigState {
  void route;
  const items: ItemState[] = loadout.map((li) => ({
    id: li.def.id, slot: li.slot, mass: li.def.mass, tolerance: li.def.tolerance, crushLimit: li.def.crushLimit,
    behavior: li.def.behavior, payout: li.def.payout,
    offset: 0, offsetVel: 0, stress: 0, lost: false,
    deadlineTick: li.def.rush !== undefined ? Math.round(li.def.rush / tuning.dt) : -1,
  }));
  return {
    t: 0, x: 0, tilt: 0, tiltVel: 0, gait: 0, ballast: 0,
    strap: tuning.strapStart, reserve: tuning.reserveStart, braced: false,
    items, recovering: 0, hazardCursor: 0, overTiltTicks: 0, ended: null,
  };
}

export function drainRate(route: RouteDef, tuning: Tuning): number {
  return tuning.reserveBudget * 100 * tuning.gaitSpeed[2]! / route.length;
}

export function stepRig(s: RigState, input: InputFrame, route: RouteDef, tuning: Tuning): void {
  const dt = tuning.dt;
  s.gait = input.gait;
  s.x += tuning.gaitSpeed[s.gait]! * tuning.gaitSpeedMul * dt;
  s.reserve -= drainRate(route, tuning) * dt;
}

export function stepEvents(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  void input; void traces; void tuning; void rng;
  if (s.reserve <= 0) { s.reserve = 0; s.ended = 'stalled'; return; }
  if (s.x >= route.length) { s.x = route.length; s.ended = 'arrived'; }
}

export function step(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  if (s.ended) return;
  stepRig(s, input, route, tuning);
  stepEvents(s, input, route, traces, tuning, rng);
  s.t += 1;
}
```

- [ ] **Step 4: Run tests and lint**

Run: `pnpm vitest run test/step.test.ts && pnpm lint && pnpm typecheck`
Expected: 6 pass, clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/step.ts test/step.test.ts
git commit -m "feat(sim): step v0 — gait movement, reserve drain, arrival/stall

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 6: Fixed-step game loop with input log

**Files:**
- Create: `src/game/loop.ts`
- Test: `test/loop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LoopOpts { dt: number; sampleInput(): InputFrame; step(input: InputFrame): void; render(alpha: number): void; maxFrameMs?: number }
  export class GameLoop { constructor(opts: LoopOpts); readonly log: InputFrame[]; start(now?: number): void; stop(): void; tick(nowMs: number): void; running: boolean }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// test/loop.test.ts
import { describe, it, expect } from 'vitest';
import { GameLoop } from '../src/game/loop';
import { frame } from './helpers';

function make(dt = 1 / 60) {
  const steps: number[] = []; const renders: number[] = []; let g = 0;
  const loop = new GameLoop({
    dt,
    sampleInput: () => frame({ gait: (g++ % 5) as 0 | 1 | 2 | 3 | 4 }),
    step: () => { steps.push(1); },
    render: (a) => { renders.push(a); },
  });
  return { loop, steps, renders };
}

describe('GameLoop', () => {
  it('steps exactly floor(elapsed/dt) times and renders once per tick()', () => {
    const { loop, steps, renders } = make();
    loop.start(0);
    loop.tick(1000 / 60 * 3 + 1);   // ~3 steps
    expect(steps.length).toBe(3);
    expect(renders.length).toBe(1);
    expect(renders[0]!).toBeGreaterThanOrEqual(0);
    expect(renders[0]!).toBeLessThan(1);
  });
  it('records one InputFrame per step', () => {
    const { loop } = make();
    loop.start(0);
    loop.tick(105);
    expect(loop.log.length).toBe(6);
    expect(loop.log[0]!.gait).toBe(0);
    expect(loop.log[1]!.gait).toBe(1);
  });
  it('clamps huge frames to maxFrameMs (no spiral of death)', () => {
    const { loop, steps } = make();
    loop.start(0);
    loop.tick(10000);
    expect(steps.length).toBe(Math.floor(250 / 1000 * 60));
  });
  it('does nothing after stop()', () => {
    const { loop, steps } = make();
    loop.start(0); loop.stop(); loop.tick(500);
    expect(steps.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/loop.test.ts`
Expected: FAIL — cannot resolve `../src/game/loop`.

- [ ] **Step 3: Implement**

```ts
// src/game/loop.ts
import type { InputFrame } from '../sim/types';

export interface LoopOpts {
  dt: number;
  sampleInput(): InputFrame;
  step(input: InputFrame): void;
  render(alpha: number): void;
  maxFrameMs?: number;
}

export class GameLoop {
  readonly log: InputFrame[] = [];
  running = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private readonly maxFrameMs: number;

  constructor(private readonly opts: LoopOpts) { this.maxFrameMs = opts.maxFrameMs ?? 250; }

  start(now: number = typeof performance !== 'undefined' ? performance.now() : 0): void {
    this.running = true; this.last = now; this.acc = 0;
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    this.running = false;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
  }

  tick(nowMs: number): void {
    if (!this.running) return;
    let frameMs = nowMs - this.last;
    if (frameMs > this.maxFrameMs) frameMs = this.maxFrameMs;
    if (frameMs < 0) frameMs = 0;
    this.last = nowMs;
    this.acc += frameMs / 1000;
    const dt = this.opts.dt;
    while (this.acc >= dt - 1e-9) {          // epsilon: 6 × (1/60) is not exactly 0.1 in floating point
      const input = this.opts.sampleInput();
      this.log.push(input);
      this.opts.step(input);
      this.acc -= dt;
    }
    this.opts.render(Math.max(0, this.acc / dt));
  }

  private onFrame = (now: number): void => {
    this.tick(now);
    if (this.running) this.raf = requestAnimationFrame(this.onFrame);
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/loop.test.ts && pnpm lint`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/loop.ts test/loop.test.ts
git commit -m "feat(game): fixed-step loop with input log and frame clamp

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 7: Three.js viewport — terrain ribbon, rig, chase camera

**Files:**
- Create: `src/render/Renderer.ts`, `src/render/three/ThreeRenderer.ts`, `src/render/three/terrain.ts`, `src/render/three/rig.ts`

**Interfaces:**
- Consumes: `RigState`, `RouteDef`.
- Produces:
  ```ts
  export interface RenderPrev { x: number; tilt: number }
  export interface Renderer { mount(el: HTMLElement): void; setRoute(route: RouteDef): void; draw(curr: RigState, prev: RenderPrev, alpha: number): void; resize(): void; dispose(): void }
  export class ThreeRenderer implements Renderer
  ```
  Render-side code may use any `Math.*`.

No unit test — verified visually in Task 8.

- [ ] **Step 1: Write the interface**

```ts
// src/render/Renderer.ts
import type { RigState, RouteDef } from '../sim/types';
export interface RenderPrev { x: number; tilt: number }
export interface Renderer {
  mount(el: HTMLElement): void;
  setRoute(route: RouteDef): void;
  draw(curr: RigState, prev: RenderPrev, alpha: number): void;
  resize(): void;
  dispose(): void;
}
```

- [ ] **Step 2: Write the terrain ribbon**

```ts
// src/render/three/terrain.ts
import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';

const CREAM = new THREE.Color('#d8c8a0');
const ORANGE = new THREE.Color('#b8561f');
const GUN = new THREE.Color('#5a5e63');

function hashNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function buildTerrain(route: RouteDef, width = 24, stepX = 2, stepZ = 2): THREE.Mesh {
  const nx = Math.ceil(route.length / stepX);
  const nz = Math.ceil(width / stepZ);
  const geo = new THREE.PlaneGeometry(route.length, width, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(route.length / 2, 0, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const edge = Math.abs(z) / (width / 2);          // 0 at path centre, 1 at edge
    const rough = hashNoise(x, z) * 1.6 * edge * edge;
    pos.setY(i, route.heightAt(x) + rough - edge * 0.6);
    const steep = Math.min(1, Math.abs(route.slopeAt(x)) / 0.5);
    c.copy(CREAM).lerp(ORANGE, steep).lerp(GUN, edge * 0.35);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}
```

- [ ] **Step 3: Write the rig (body + six two-segment legs)**

```ts
// src/render/three/rig.ts
import * as THREE from 'three';
import type { Gait, RouteDef } from '../../sim/types';

const L1 = 1.7, L2 = 1.9;             // leg segment lengths
const HIP_Y = 1.7, BODY_Y = 2.3;
const STRIDE = 1.1, LIFT = 0.7;
const STEP_RATE = [0, 3.2, 4.6, 6.0, 7.6]; // rad/s gait phase advance
const MAX_PITCH = 0.5;                 // rad at |tilt| = 1; sign: +tilt = nose up

interface Leg { hipX: number; side: 1 | -1; phase: number; upper: THREE.Mesh; lower: THREE.Mesh; foot: THREE.Mesh }

function setCylinder(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

export class Rig {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh;
  private legs: Leg[] = [];
  private phase = 0;
  private lastTick = 0;
  private legMat = new THREE.MeshLambertMaterial({ color: '#2f3338', flatShading: true });
  private footMat = new THREE.MeshLambertMaterial({ color: '#c8622a', flatShading: true });

  constructor() {
    this.body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 1.8), new THREE.MeshLambertMaterial({ color: '#4a4f55', flatShading: true }));
    this.body.position.y = BODY_Y;
    this.group.add(this.body);
    const cyl = new THREE.CylinderGeometry(0.11, 0.09, 1, 6);
    const ball = new THREE.SphereGeometry(0.16, 6, 6);
    for (let i = 0; i < 6; i++) {
      const side: 1 | -1 = i < 3 ? 1 : -1;
      const col = i % 3;
      const phase = ((col + (side > 0 ? 0 : 1)) % 2) * Math.PI;   // tripod gait
      const upper = new THREE.Mesh(cyl, this.legMat), lower = new THREE.Mesh(cyl, this.legMat), foot = new THREE.Mesh(ball, this.footMat);
      this.group.add(upper, lower, foot);
      this.legs.push({ hipX: (col - 1) * 1.25, side, phase, upper, lower, foot });
    }
  }

  update(x: number, y: number, tilt: number, gait: Gait, tick: number, route: RouteDef): void {
    this.group.position.set(x, y, 0);
    this.group.rotation.z = tilt * MAX_PITCH;   // Rz(+θ) lifts +X (nose) → positive tilt = nose up
    const dtick = tick - this.lastTick; this.lastTick = tick;
    this.phase += STEP_RATE[gait]! * dtick / 60;
    const hip = new THREE.Vector3(), foot = new THREE.Vector3(), knee = new THREE.Vector3();
    for (const leg of this.legs) {
      const ph = this.phase + leg.phase;
      hip.set(leg.hipX, HIP_Y, leg.side * 1.0);
      const fx = leg.hipX + STRIDE * Math.cos(ph);
      const groundY = route.heightAt(x + fx) - y;
      const fy = groundY + LIFT * Math.max(0, Math.sin(ph)) * (gait > 0 ? 1 : 0);
      foot.set(fx, fy, leg.side * 2.1);
      // 2-bone IK in the hip→foot plane; knee bends up/outward
      const d = Math.min(hip.distanceTo(foot), L1 + L2 - 0.01);
      const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const dir = new THREE.Vector3().subVectors(foot, hip).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3().crossVectors(dir, up).normalize();
      if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
      knee.copy(dir).applyAxisAngle(axis, -a).multiplyScalar(L1).add(hip);
      if (knee.y < hip.y) knee.copy(dir).applyAxisAngle(axis, a).multiplyScalar(L1).add(hip);
      setCylinder(leg.upper, hip, knee);
      setCylinder(leg.lower, knee, foot);
      leg.foot.position.copy(foot);
    }
  }

  dispose(): void {
    this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose();
    for (const leg of this.legs) { leg.upper.geometry.dispose(); leg.foot.geometry.dispose(); }
    this.legMat.dispose(); this.footMat.dispose();
  }
}
```

- [ ] **Step 4: Write ThreeRenderer**

```ts
// src/render/three/ThreeRenderer.ts
import * as THREE from 'three';
import type { Renderer, RenderPrev } from '../Renderer';
import type { RigState, RouteDef } from '../../sim/types';
import { buildTerrain } from './terrain';
import { Rig } from './rig';

const SKY = '#d9c9a3';

export class ThreeRenderer implements Renderer {
  private gl!: THREE.WebGLRenderer;
  private el!: HTMLElement;
  private readonly scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private terrain: THREE.Mesh | null = null;
  private route: RouteDef | null = null;
  private readonly rig = new Rig();
  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private firstFrame = true;

  mount(el: HTMLElement): void {
    this.el = el;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(this.gl.domElement);
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 70, 200);
    const hemi = new THREE.HemisphereLight('#fff4dc', '#5a4a3a', 0.9);
    const sun = new THREE.DirectionalLight('#ffe9c4', 1.4);
    sun.position.set(-30, 50, 40);
    this.scene.add(hemi, sun, this.rig.group);
    this.resize();
  }

  setRoute(route: RouteDef): void {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    this.route = route;
    this.terrain = buildTerrain(route);
    this.scene.add(this.terrain);
    this.firstFrame = true;
  }

  draw(curr: RigState, prev: RenderPrev, alpha: number): void {
    if (!this.route) return;
    const x = prev.x + (curr.x - prev.x) * alpha;
    const tilt = prev.tilt + (curr.tilt - prev.tilt) * alpha;
    const y = this.route.heightAt(x);
    this.rig.update(x, y, tilt, curr.gait, curr.t + alpha, this.route);
    this.camPos.set(x - 6, y + 5.5, 13);
    this.camTarget.set(x + 4, y + 1.2, 0);
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
    this.rig.dispose();
    this.gl.dispose(); this.gl.domElement.remove();
  }
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/render
git commit -m "feat(render): Three.js ribbon terrain, six-legged rig, 3/4 chase camera

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 8: Wire M0 — walking rig on a seeded route, deployed

**Files:**
- Modify: `src/main.ts`, `index.html`
- Create: `src/ui/panel/panel.css`

**Interfaces:**
- Consumes: `GameLoop`, `generateRoute`, `createRun`, `step`, `ThreeRenderer` (dynamic import).

- [ ] **Step 1: Write base CSS (dieselpunk tokens + layout shell)**

```css
/* src/ui/panel/panel.css */
:root {
  --cream: #e8dcc0; --cream-2: #d8c8a0; --orange: #c8622a; --gun: #3a3f45; --gun-2: #2a2e33; --red: #d12b1f; --ink: #1c1a16;
  --font: "Arial Black", "Helvetica Neue", Impact, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--gun-2); color: var(--cream); font-family: var(--font); -webkit-user-select: none; user-select: none; touch-action: none; }
#app { display: grid; height: 100dvh; grid-template-rows: 45% 55%; grid-template-areas: "viewport" "panel"; }
#viewport { grid-area: viewport; position: relative; overflow: hidden; background: #d9c9a3; }
#viewport canvas { display: block; width: 100%; height: 100%; }
#panel { grid-area: panel; padding: 12px; background: linear-gradient(180deg, var(--gun) 0, var(--gun-2) 100%); border-top: 6px solid var(--orange); box-shadow: inset 0 2px 0 rgba(255,255,255,.08); overflow: hidden; }
#panel h1 { margin: 0 0 8px; font-size: 20px; letter-spacing: .18em; color: var(--cream); }
#status { margin: 0; font-size: 12px; opacity: .7; }
@media (orientation: landscape) and (min-width: 900px) {
  #app { grid-template-columns: 1fr minmax(560px, 60%) 1fr; grid-template-rows: 1fr; grid-template-areas: "panel viewport panel"; }
  #viewport { border: 10px solid var(--gun); border-radius: 12px; margin: 16px 0; }
  #panel { border-top: 0; }
}
```

- [ ] **Step 2: Write `src/main.ts` for M0**

```ts
// src/main.ts
import './ui/panel/panel.css';
import { tuning } from './content';
import { generateRoute } from './sim/terrain';
import { createRun, step } from './sim/step';
import { mulberry32, hashSeed } from './sim/rng';
import { GameLoop } from './game/loop';
import type { Renderer, RenderPrev } from './render/Renderer';
import type { InputFrame } from './sim/types';

const status = document.getElementById('status')!;
const viewportEl = document.getElementById('viewport')!;
status.textContent = 'panel online';

const route = generateRoute(4417, 700, 0, [], tuning.terrain);
const state = createRun(route, [], tuning);
const rng = mulberry32(hashSeed(route.seed, 1));
const prev: RenderPrev = { x: 0, tilt: 0 };
let renderer: Renderer | null = null;
const idle: InputFrame = { gait: 2, ballast: 0, strap: false, brace: false, deploy: 0, recover: false };

const loop = new GameLoop({
  dt: tuning.dt,
  sampleInput: () => idle,
  step: (input) => { prev.x = state.x; prev.tilt = state.tilt; step(state, input, route, [], tuning, rng); },
  render: (alpha) => renderer?.draw(state, prev, alpha),
});
loop.start();

import('./render/three/ThreeRenderer').then(({ ThreeRenderer }) => {
  renderer = new ThreeRenderer();
  renderer.mount(viewportEl);
  renderer.setRoute(route);
  window.addEventListener('resize', () => renderer?.resize());
  status.textContent = 'viewport online';
});
```

- [ ] **Step 3: Run dev server and verify visually**

Run: `pnpm dev` and open the URL in a browser. Also open Chrome devtools device toolbar in a phone portrait size.
Expected: cream sky, ribbon terrain with orange on steeper sections, gunmetal rig walking right with six legs moving in tripod pattern, camera following from 3/4 behind. No console errors. Rig reaches end of route and stops. Portrait shows viewport top / panel bottom.

If legs look inverted (knees pointing down), flip the sign in the `applyAxisAngle` calls in `rig.ts`.

- [ ] **Step 4: Build size check**

Run: `pnpm build && ls -la dist/assets`
Expected: a small `index-*.js` (< 20 KB) and a separate `ThreeRenderer-*.js` chunk (~600 KB raw / ~150 KB gzip). If Three is bundled into the main chunk, the dynamic import was not preserved — check that nothing else imports `three` statically.

- [ ] **Step 5: Commit and push; confirm live URL**

```bash
git add -A
git commit -m "feat: M0 — seeded route, walking rig, live viewport

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
git push
gh run watch --exit-status
```

Expected: `https://ariaspect.github.io/deadweight/` shows the walking rig on a phone and on desktop.

- [ ] **Step 6: DEVLOG M0 entry**

Append under "What AI built": `- M0: seeded piecewise-linear terrain generator, fixed-step loop with input log, Three.js ribbon + procedural hexapod behind a Renderer interface.` Commit with message `docs: devlog M0`.

---

# Phase M1 — Vertical slice

### Task 9: Second-order tilt dynamics

**Files:**
- Modify: `src/sim/step.ts` (`stepRig`)
- Test: `test/tilt.test.ts`

**Interfaces:**
- Produces: `export function loadOffsetOf(items: ItemState[], tuning: Tuning): number` in `step.ts`. `stepRig` now applies ballast, slope, load, damping, stiffness. Sign convention: **positive = aft / nose-up**. Positive slope (uphill) pitches nose up; positive ballast shifts mass aft (nose up); slot +1 is aft.

- [ ] **Step 1: Write the failing tests**

```ts
// test/tilt.test.ts
import { describe, it, expect } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, frame } from './helpers';

function run(route: ReturnType<typeof flatRoute>, ballast: number, ticks: number) {
  const s = createRun(route, [], tuning); const rng = mulberry32(1); let peak = 0;
  for (let i = 0; i < ticks; i++) { step(s, frame({ gait: 1, ballast }), route, [], tuning, rng); peak = Math.max(peak, Math.abs(s.tilt)); }
  return { s, peak };
}

describe('tilt dynamics', () => {
  it('stays level on flat ground with zero ballast', () => {
    const { s } = run(flatRoute(5000), 0, 600);
    expect(s.tilt).toBe(0); expect(s.tiltVel).toBe(0);
  });
  it('uncountered slope drives tilt toward kSlope*slope/stiffness', () => {
    const { s } = run(slopeRoute(0.3, 5000), 0, 1200);
    const eq = tuning.kSlope * 0.3 / tuning.stiffness;
    expect(s.tilt).toBeGreaterThan(eq * 0.8);
    expect(s.tilt).toBeLessThan(eq * 1.2);
  });
  it('correct counter-ballast holds tilt at zero on a slope', () => {
    const ballast = Math.round(-(tuning.kSlope * 0.3) / tuning.kBallast * 100);
    const { s, peak } = run(slopeRoute(0.3, 5000), ballast, 1200);
    expect(peak).toBeLessThan(0.05);
    expect(Math.abs(s.tilt)).toBeLessThan(0.05);
  });
  it('overshoots then settles (second-order, underdamped)', () => {
    const eq = tuning.kBallast * 0.4 / tuning.stiffness;
    const { s, peak } = run(flatRoute(5000), 40, 1800);
    expect(peak).toBeGreaterThan(eq * 1.08);
    expect(Math.abs(s.tilt - eq)).toBeLessThan(eq * 0.05);
  });
  it('clamps ballast to ±ballastRange as an integer', () => {
    const { s } = run(flatRoute(5000), 250, 1);
    expect(s.ballast).toBe(tuning.ballastRange);
    const s2 = createRun(flatRoute(5000), [], tuning);
    step(s2, frame({ ballast: 12.7 }), flatRoute(5000), [], tuning, mulberry32(1));
    expect(s2.ballast).toBe(13);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/tilt.test.ts`
Expected: FAIL — tilt stays 0 in the slope tests (dynamics not implemented).

- [ ] **Step 3: Implement**

Replace `stepRig` in `src/sim/step.ts` and add helpers:

```ts
function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

export function loadOffsetOf(items: ItemState[], tuning: Tuning): number {
  let m = 0, sum = 0;
  for (const it of items) {
    if (it.lost) continue;
    m += it.mass;
    sum += it.mass * (tuning.slotPos[it.slot]! + it.offset);
  }
  return m > 0 ? sum / m : 0;
}

export function stepRig(s: RigState, input: InputFrame, route: RouteDef, tuning: Tuning): void {
  const dt = tuning.dt;
  s.gait = input.gait;
  s.ballast = clamp(Math.round(input.ballast), -tuning.ballastRange, tuning.ballastRange);

  const slope = route.slopeAt(s.x);
  const load = loadOffsetOf(s.items, tuning);
  const torque = tuning.kSlope * slope + tuning.kBallast * (s.ballast / 100) + tuning.kLoad * load;
  const acc = torque - tuning.damping * s.tiltVel - tuning.stiffness * s.tilt;
  s.tiltVel += acc * dt;
  s.tilt += s.tiltVel * dt;

  s.x += tuning.gaitSpeed[s.gait]! * tuning.gaitSpeedMul * dt;
  s.reserve -= drainRate(route, tuning) * dt;
}
```

- [ ] **Step 4: Run all tests**

Run: `pnpm test && pnpm lint`
Expected: all pass (step v0 tests still pass — flat route, ballast 0 → no tilt).

- [ ] **Step 5: Commit**

```bash
git add src/sim/step.ts test/tilt.test.ts
git commit -m "feat(sim): second-order tilt — slope, ballast, load, damping, stiffness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 10: Cargo items — drift, stress, spill

**Files:**
- Modify: `src/sim/step.ts` (add `stepItems`, spill in `stepEvents`), `src/sim/types.ts` (add `spillRelief`, `hazardGaitScale` to `Tuning`), `src/content/tuning.json`
- Test: `test/items.test.ts`

**Interfaces:**
- Produces: `export function stepItems(s: RigState, tuning: Tuning, rng: Rng): void`. Spill: when `|tilt| >= spillTilt` and any item is carried, the item with the largest `|slotPos + offset|` is marked `lost`, `tilt` is pulled back toward 0 by `spillRelief`, `tiltVel = 0`; if all items are lost, `ended = 'spilled'`.

- [ ] **Step 1: Add tuning keys**

In `src/sim/types.ts` `Tuning`, add after `spillTilt`: `spillRelief: number; hazardGaitScale: number[];`
In `src/content/tuning.json` add: `"spillRelief": 0.55, "hazardGaitScale": [0.6, 0.8, 1.0, 1.25, 1.5],` and change `"kLoad": 2.0` to `"kLoad": 1.2` and `"starBuckets"` to `[0.25, 0.5, 0.7, 0.88, 1.0]`.

- [ ] **Step 2: Write the failing tests**

```ts
// test/items.test.ts
import { describe, it, expect } from 'vitest';
import { createRun, step, stepItems } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, crateDef, frame } from './helpers';

function held(tilt: number, strap: number, def = crateDef(), ticks = 120) {
  const s = createRun(flatRoute(), [{ def, slot: 1 }], tuning);
  s.tilt = tilt; s.strap = strap;
  const rng = mulberry32(5);
  for (let i = 0; i < ticks; i++) stepItems(s, tuning, rng);
  return s.items[0]!;
}

describe('stepItems', () => {
  it('does not drift below driftThreshold', () => {
    expect(held(tuning.driftThreshold * 0.9, 0).offset).toBe(0);
  });
  it('static item drifts in the direction of tilt after the grace window when straps are loose', () => {
    const it = held(0.6, 0);
    expect(it.offset).toBeGreaterThan(0.05);
    expect(held(-0.6, 0).offset).toBeLessThan(-0.05);
  });
  it('does not drift inside the grace window', () => {
    expect(held(0.6, 0, crateDef(), tuning.graceTicks).offset).toBe(0);
  });
  it('full strap tension stops static drift', () => {
    expect(held(0.6, 100).offset).toBe(0);
  });
  it('precarious drifts faster than static', () => {
    expect(held(0.6, 0, crateDef({ behavior: 'precarious' })).offset).toBeGreaterThan(held(0.6, 0).offset * 2);
  });
  it('slosh chases tilt even with full straps', () => {
    expect(Math.abs(held(0.6, 100, crateDef({ behavior: 'slosh' })).offset)).toBeGreaterThan(0.1);
  });
  it('livestock wanders even when level, deterministically', () => {
    const a = held(0, 70, crateDef({ behavior: 'livestock' }), 600).offset;
    const b = held(0, 70, crateDef({ behavior: 'livestock' }), 600).offset;
    expect(a).not.toBe(0); expect(a).toBe(b);
  });
  it('accrues stress above tolerance and above crushLimit', () => {
    expect(held(0.3, 70, crateDef({ tolerance: 0.5 })).stress).toBe(0);
    expect(held(0.7, 70, crateDef({ tolerance: 0.5 })).stress).toBeGreaterThan(0);
    expect(held(0, 95, crateDef({ crushLimit: 90 })).stress).toBeGreaterThan(0);
  });
});

describe('spill', () => {
  it('loses the worst-placed item at spillTilt and ends when all are lost', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef({ id: 'a' }), slot: 2 }, { def: crateDef({ id: 'b' }), slot: 1 }], tuning);
    const rng = mulberry32(1);
    let firstLost: string | null = null;
    for (let i = 0; i < 6000 && !s.ended; i++) {
      step(s, frame({ gait: 1, ballast: 0 }), r, [], tuning, rng);
      if (!firstLost) { const l = s.items.find((it) => it.lost); if (l) firstLost = l.id; }
    }
    expect(firstLost).toBe('a');           // aft slot (+1) is furthest from centre under nose-up tilt
    expect(s.ended).toBe('spilled');
    expect(s.items.every((it) => it.lost)).toBe(true);
  });
  it('relieves tilt on spill', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning);
    const rng = mulberry32(1);
    while (!s.items[0]!.lost) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(Math.abs(s.tilt)).toBeLessThan(tuning.spillTilt);
    expect(s.tiltVel).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run test/items.test.ts`
Expected: FAIL — `stepItems` is not exported.

- [ ] **Step 4: Implement**

Add to `src/sim/step.ts`:

```ts
export function stepItems(s: RigState, tuning: Tuning, rng: Rng): void {
  const dt = tuning.dt;
  const over = Math.abs(s.tilt) > tuning.driftThreshold;
  s.overTiltTicks = over ? s.overTiltTicks + 1 : 0;
  const drifting = s.overTiltTicks > tuning.graceTicks;
  const loose = 1 - s.strap / 100;
  for (const it of s.items) {
    if (it.lost) continue;
    switch (it.behavior) {
      case 'static':
        if (drifting) it.offset += tuning.kDrift * s.tilt * loose * dt;
        break;
      case 'precarious':
        if (drifting) it.offset += tuning.kDrift * tuning.precariousMul * s.tilt * loose * dt;
        break;
      case 'slosh': {
        const target = s.tilt * tuning.sloshGain;
        const a = tuning.sloshStiff * (target - it.offset) - tuning.sloshDamp * it.offsetVel;
        it.offsetVel += a * dt;
        it.offset += it.offsetVel * dt;
        break;
      }
      case 'livestock':
        it.offset += rng.gaussian() * tuning.kLive * (0.3 + 0.7 * loose) * dt;
        if (drifting) it.offset += tuning.kDrift * s.tilt * loose * dt;
        break;
    }
    it.offset = clamp(it.offset, -1.5, 1.5);
    it.stress += Math.max(0, Math.abs(s.tilt) - it.tolerance) * tuning.kStress * dt;
    it.stress += Math.max(0, s.strap - it.crushLimit) * tuning.kCrush * dt;
  }
}

function spillCheck(s: RigState, tuning: Tuning): void {
  if (Math.abs(s.tilt) < tuning.spillTilt) return;
  let worst: ItemState | null = null, worstAbs = -1;
  for (const it of s.items) {
    if (it.lost) continue;
    const a = Math.abs(tuning.slotPos[it.slot]! + it.offset);
    if (a > worstAbs) { worstAbs = a; worst = it; }
  }
  if (!worst) return;
  worst.lost = true;
  s.tilt = s.tilt > 0 ? Math.max(0, s.tilt - tuning.spillRelief) : Math.min(0, s.tilt + tuning.spillRelief);
  s.tiltVel = 0;
  s.overTiltTicks = 0;
  if (s.items.every((it) => it.lost)) s.ended = 'spilled';
}
```

Update `stepEvents` and `step`:

```ts
export function stepEvents(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  void input; void traces; void rng;
  spillCheck(s, tuning);
  if (s.ended) return;
  if (s.reserve <= 0) { s.reserve = 0; s.ended = 'stalled'; return; }
  if (s.x >= route.length) { s.x = route.length; s.ended = 'arrived'; }
}

export function step(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  if (s.ended) return;
  stepRig(s, input, route, tuning);
  stepItems(s, tuning, rng);
  stepEvents(s, input, route, traces, tuning, rng);
  s.t += 1;
}
```

- [ ] **Step 5: Run all tests**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all pass. If the tilt overshoot test now fails because `kLoad` changed, it should not — it uses no items. If `spill` test's `firstLost` is `'b'`, the sign convention is inverted somewhere: re-check that positive slope → positive tilt and slot 2 → `slotPos[2] = +1`.

- [ ] **Step 6: Commit**

```bash
git add src/sim src/content test/items.test.ts
git commit -m "feat(sim): cargo drift by behavior, stress, spill with relief

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 11: Scoring

**Files:**
- Create: `src/sim/score.ts`
- Test: `test/score.test.ts`

**Interfaces:**
- Produces: `export function evaluate(s: RigState, tuning: Tuning): RunResult`. Stars: `starBuckets` are upper bounds — mean condition ≤ `b[0]` → 1★, ≤ `b[1]` → 2★, ≤ `b[2]` → 3★, ≤ `b[3]` → 4★, else 5★; −1★ if any item lost (floor 1); stalled caps at 2★; spilled = 1★. Payout: Σ `payout_i · condition_i` for carried, on-time items; stalled multiplies by `stallMultiplier`. Bonus: `reserve · kBonus` only when arrived.

- [ ] **Step 1: Write the failing tests**

```ts
// test/score.test.ts
import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/sim/score';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute, crateDef } from './helpers';

function state(stresses: number[], over: Partial<ReturnType<typeof createRun>> = {}) {
  const s = createRun(flatRoute(), stresses.map((_, i) => ({ def: crateDef({ id: `i${i}`, payout: 100 }), slot: i })), tuning);
  stresses.forEach((st, i) => { s.items[i]!.stress = st; });
  Object.assign(s, { ended: 'arrived', reserve: 40 }, over);
  return s;
}

describe('evaluate', () => {
  it('5 stars and full payout for pristine arrival', () => {
    const r = evaluate(state([0, 0]), tuning);
    expect(r.stars).toBe(5); expect(r.payout).toBe(200);
    expect(r.bonus).toBeCloseTo(40 * tuning.kBonus);
    expect(r.total).toBe(Math.round(200 + 40 * tuning.kBonus));
  });
  it('buckets by mean condition', () => {
    expect(evaluate(state([0.9]), tuning).stars).toBe(1);
    expect(evaluate(state([0.6]), tuning).stars).toBe(2);
    expect(evaluate(state([0.4]), tuning).stars).toBe(3);
    expect(evaluate(state([0.2]), tuning).stars).toBe(4);
    expect(evaluate(state([0.05]), tuning).stars).toBe(5);
  });
  it('lost item pays 0 and costs a star', () => {
    const s = state([0, 0]); s.items[1]!.lost = true;
    const r = evaluate(s, tuning);
    expect(r.stars).toBe(4); expect(r.payout).toBe(100); expect(r.items[1]!.lost).toBe(true);
  });
  it('late rush item pays 0', () => {
    const s = state([0]); s.items[0]!.deadlineTick = 100; s.t = 101;
    const r = evaluate(s, tuning);
    expect(r.items[0]!.late).toBe(true); expect(r.payout).toBe(0);
  });
  it('stall multiplies payout, caps stars at 2, no bonus', () => {
    const r = evaluate(state([0], { ended: 'stalled' }), tuning);
    expect(r.payout).toBeCloseTo(100 * tuning.stallMultiplier);
    expect(r.stars).toBeLessThanOrEqual(2); expect(r.bonus).toBe(0);
  });
  it('total spill is 1 star, zero total', () => {
    const s = state([0]); s.items[0]!.lost = true; s.ended = 'spilled';
    const r = evaluate(s, tuning);
    expect(r.stars).toBe(1); expect(r.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/score.test.ts`
Expected: FAIL — cannot resolve `../src/sim/score`.

- [ ] **Step 3: Implement**

```ts
// src/sim/score.ts
import type { ItemResult, RigState, RunResult, Tuning } from './types';

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function evaluate(s: RigState, tuning: Tuning): RunResult {
  const ended = s.ended ?? 'stalled';
  const items: ItemResult[] = s.items.map((it) => {
    const condition = clamp01(1 - it.stress);
    const late = it.deadlineTick >= 0 && s.t > it.deadlineTick;
    const payout = it.lost || late ? 0 : it.payout * condition;
    return { id: it.id, condition, payout, lost: it.lost, late };
  });
  const carried = items.filter((i) => !i.lost);
  const mean = carried.length ? carried.reduce((a, i) => a + i.condition, 0) / carried.length : 0;
  const b = tuning.starBuckets;
  let stars = 5;
  for (let i = 0; i < 4; i++) { if (mean <= b[i]!) { stars = i + 1; break; } }
  if (items.some((i) => i.lost)) stars = Math.max(1, stars - 1);
  if (ended === 'stalled') stars = Math.min(stars, 2);
  if (ended === 'spilled') stars = 1;

  let payout = items.reduce((a, i) => a + i.payout, 0);
  if (ended === 'stalled') payout *= tuning.stallMultiplier;
  if (ended === 'spilled') payout = 0;
  const bonus = ended === 'arrived' ? Math.max(0, s.reserve) * tuning.kBonus : 0;
  return { items, stars, payout, bonus, total: Math.round(payout + bonus), ended };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/score.test.ts && pnpm lint`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/sim/score.ts test/score.test.ts
git commit -m "feat(sim): evaluate — stars, payout, bonus

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 12: Headless bot and validator script

**Files:**
- Create: `src/sim/bot.ts`, `scripts/validate.ts`
- Modify: `.github/workflows/deploy.yml` (add `pnpm validate` after `pnpm test`)
- Test: `test/bot.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BotView { x: number; tilt: number; tiltVel: number; strap: number; braced: boolean; recovering: number; items: ItemState[] }
  export class LagBuffer { constructor(lagTicks: number); push(s: RigState): BotView }
  export function botPolicy(v: BotView, route: RouteDef, tuning: Tuning): InputFrame
  export interface HeadlessOpts { lagTicks?: number; maxTicks?: number; seed?: number; traces?: Trace[]; policy?: (v: BotView, route: RouteDef, tuning: Tuning) => InputFrame }
  export function runHeadless(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning, opts?: HeadlessOpts): { state: RigState; result: RunResult; ticks: number }
  ```
  M1 policy: feed-forward on the slope `leadSec` seconds ahead (at current gait speed) plus PD on tilt; gait 2. Brace/strap logic arrives in Task 20.

- [ ] **Step 1: Write the failing tests**

```ts
// test/bot.test.ts
import { describe, it, expect } from 'vitest';
import { runHeadless, LagBuffer } from '../src/sim/bot';
import { generateRoute } from '../src/sim/terrain';
import { createRun } from '../src/sim/step';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, crateDef } from './helpers';

describe('LagBuffer', () => {
  it('returns the view from lag ticks ago', () => {
    const lb = new LagBuffer(2);
    const s = createRun(flatRoute(), [], tuning);
    s.x = 1; lb.push(s); s.x = 2; lb.push(s); s.x = 3;
    expect(lb.push(s).x).toBe(1);
  });
});

describe('bot', () => {
  it('delivers a crate on flat ground with 5 stars', () => {
    const { result } = runHeadless(flatRoute(300), [{ def: crateDef(), slot: 1 }], tuning);
    expect(result.ended).toBe('arrived'); expect(result.stars).toBe(5);
  });
  it('holds a steady slope with a fore-slotted crate', () => {
    const { state, result } = runHeadless(slopeRoute(0.3, 400), [{ def: crateDef(), slot: 0 }], tuning, { lagTicks: 15 });
    expect(result.ended).toBe('arrived');
    expect(state.items[0]!.lost).toBe(false);
    expect(result.stars).toBeGreaterThanOrEqual(4);
  });
  it('completes a generated tier-0 route within the reserve', () => {
    for (const seed of [4417, 1, 2, 3, 4]) {
      const route = generateRoute(seed, 600, 0, [], tuning.terrain);
      const { result } = runHeadless(route, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15 });
      expect(result.ended, `seed ${seed}`).toBe('arrived');
      expect(result.stars, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/bot.test.ts`
Expected: FAIL — cannot resolve `../src/sim/bot`.

- [ ] **Step 3: Implement**

```ts
// src/sim/bot.ts
import { createRun, step, loadOffsetOf } from './step';
import { evaluate } from './score';
import { mulberry32, hashSeed } from './rng';
import type { InputFrame, ItemState, LoadoutItem, RigState, RouteDef, RunResult, Trace, Tuning } from './types';

export interface BotView { x: number; tilt: number; tiltVel: number; strap: number; braced: boolean; recovering: number; items: ItemState[] }

function view(s: RigState): BotView {
  return { x: s.x, tilt: s.tilt, tiltVel: s.tiltVel, strap: s.strap, braced: s.braced, recovering: s.recovering, items: s.items.map((it) => ({ ...it })) };
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

export function botPolicy(v: BotView, route: RouteDef, tuning: Tuning): InputFrame {
  const b = tuning.bot;
  const gait = 2;
  const slopeAhead = route.slopeAt(v.x + tuning.gaitSpeed[gait]! * tuning.gaitSpeedMul * b.leadSec);
  const load = loadOffsetOf(v.items, tuning);
  const feedForward = -(tuning.kSlope * slopeAhead + tuning.kLoad * load) / tuning.kBallast * 100;
  const feedback = -b.kp * v.tilt - b.kd * v.tiltVel;
  return { gait, ballast: clampInt(feedForward + feedback, -tuning.ballastRange, tuning.ballastRange), strap: false, brace: false, deploy: 0, recover: false };
}

export interface HeadlessOpts {
  lagTicks?: number; maxTicks?: number; seed?: number; traces?: Trace[];
  policy?: (v: BotView, route: RouteDef, tuning: Tuning) => InputFrame;
}

export function runHeadless(route: RouteDef, loadout: LoadoutItem[], tuning: Tuning, opts: HeadlessOpts = {}): { state: RigState; result: RunResult; ticks: number } {
  const lag = new LagBuffer(opts.lagTicks ?? tuning.bot.lagTicks);
  const policy = opts.policy ?? botPolicy;
  const traces = opts.traces ?? [];
  const rng = mulberry32(hashSeed(route.seed, opts.seed ?? 1));
  const s = createRun(route, loadout, tuning);
  const max = opts.maxTicks ?? 60 * 240;
  let ticks = 0;
  while (!s.ended && ticks < max) {
    const input = policy(lag.push(s), route, tuning);
    step(s, input, route, traces, tuning, rng);
    ticks++;
  }
  if (!s.ended) s.ended = 'stalled';
  return { state: s, result: evaluate(s, tuning), ticks };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/bot.test.ts`
Expected: 4 pass. If the generated-route test fails on a seed, print `state.tilt`/`items[0].stress` and check whether it is a bot issue (raise `kd`) or tuning (lower `slopeSigma[0]`). Do not skip the seed.

- [ ] **Step 5: Write the validator**

```ts
// scripts/validate.ts
import { generateRoute } from '../src/sim/terrain';
import { runHeadless } from '../src/sim/bot';
import { tuning } from '../src/content';
import type { HazardDef, ItemDef, OutpostDef } from '../src/sim/types';

// M1: dev outposts. Task 20 replaces this with content/outposts.json + hazards.json.
const outposts: OutpostDef[] = [4417, 1, 2, 3, 4].map((seed, i) => ({ id: `dev${i}`, name: `DEV ${seed}`, seed, lengthM: 600, tier: 0, flavor: '' }));
const hazards: HazardDef[] = [];
const crate: ItemDef = { id: 'crate', name: 'Crate', mass: 1, tolerance: 0.5, crushLimit: 90, behavior: 'static', payout: 100, tier: 0, art: { shape: 'box', color: '#8a6d3b' } };
const LAGS = [0, 15, 30];

let failures = 0;
console.log('outpost            lag  ended     stars  ticks');
for (const o of outposts) {
  const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
  for (const lag of LAGS) {
    const { result, ticks } = runHeadless(route, [{ def: crate, slot: 1 }], tuning, { lagTicks: lag });
    const ok = result.ended === 'arrived' && result.stars >= 1;
    if (lag === tuning.bot.lagTicks && !ok) failures++;
    console.log(`${o.name.padEnd(18)} ${String(lag).padStart(3)}  ${result.ended.padEnd(8)}  ${result.stars}      ${ticks}`);
  }
}
console.log(failures === 0 ? `PASS: all ${outposts.length} outposts solvable at lag ${tuning.bot.lagTicks}` : `FAIL: ${failures} outposts unsolvable at lag ${tuning.bot.lagTicks}`);
process.exit(failures === 0 ? 0 : 1);
```

Run: `pnpm validate`
Expected: a table and `PASS: all 5 outposts solvable at lag 15`, exit 0.

- [ ] **Step 6: Add to CI**

In `.github/workflows/deploy.yml`, after `- run: pnpm test` add `- run: pnpm validate`.

- [ ] **Step 7: Commit**

```bash
git add src/sim/bot.ts scripts/validate.ts test/bot.test.ts .github/workflows/deploy.yml
git commit -m "feat(sim): lagged PD bot and headless solvability validator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 13: Determinism and replay test

**Files:**
- Test: `test/replay.test.ts`

**Interfaces:**
- Consumes: `step`, `createRun`, `GameLoop`, `mulberry32`, `hashSeed`.

- [ ] **Step 1: Write the tests**

```ts
// test/replay.test.ts
import { describe, it, expect } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { generateRoute } from '../src/sim/terrain';
import { mulberry32, hashSeed } from '../src/sim/rng';
import { GameLoop } from '../src/game/loop';
import { tuning } from '../src/content';
import { crateDef, frame } from './helpers';
import type { InputFrame, Gait } from '../src/sim/types';

const route = generateRoute(4417, 500, 1, [], tuning.terrain);
const loadout = [{ def: crateDef({ behavior: 'livestock' }), slot: 0 }, { def: crateDef({ id: 'soup', behavior: 'slosh' }), slot: 2 }];

function script(i: number): InputFrame {
  return frame({ gait: ((Math.floor(i / 300) % 4) + 1) as Gait, ballast: Math.floor(i / 120) % 2 === 0 ? 60 : -60, strap: i % 90 === 0 });
}

function play(inputs: InputFrame[]) {
  const s = createRun(route, loadout, tuning);
  const rng = mulberry32(hashSeed(route.seed, 7));
  for (const inp of inputs) { if (s.ended) break; step(s, inp, route, [], tuning, rng); }
  return s;
}

describe('determinism', () => {
  it('identical inputs and seed give byte-identical state', () => {
    const inputs = Array.from({ length: 3000 }, (_, i) => script(i));
    expect(JSON.stringify(play(inputs))).toBe(JSON.stringify(play(inputs)));
  });
  it('a GameLoop input log replays to the same state', () => {
    const live = createRun(route, loadout, tuning);
    const rng = mulberry32(hashSeed(route.seed, 7));
    let i = 0;
    const loop = new GameLoop({ dt: tuning.dt, sampleInput: () => script(i++), step: (inp) => step(live, inp, route, [], tuning, rng), render: () => {} });
    loop.start(0);
    for (let ms = 16.7; ms < 20000; ms += 16.7) loop.tick(ms);
    const replayed = play(loop.log);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(live));
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run test/replay.test.ts`
Expected: 2 pass. A failure here means something in `step` reads unseeded state — find it before moving on.

- [ ] **Step 3: Commit**

```bash
git add test/replay.test.ts
git commit -m "test(sim): determinism and input-log replay

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 14: Input controller — drag ballast, keyboard, throttle

**Files:**
- Create: `src/ui/input.ts`
- Test: `test/input.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface InputState { gait: Gait; ballast: number; keyFore: boolean; keyAft: boolean; brace: boolean; strapQueued: boolean; recoverQueued: boolean; deployQueued: KitId | 0; dragging: boolean; dragStartPx: number; dragStartBallast: number }
  export function initialInput(): InputState
  export function applyKey(st: InputState, code: string, down: boolean): void
  export function applyDragStart(st: InputState, px: number): void
  export function applyDragMove(st: InputState, px: number, pxPerFullRange: number, range: number): void
  export function applyDragEnd(st: InputState): void
  export function sampleFrame(st: InputState, tuning: Tuning): InputFrame
  export class InputController { constructor(tuning: Tuning); readonly state: InputState; attach(viewport: HTMLElement, doc: Document): void; detach(): void; sample(): InputFrame; setGait(g: Gait): void; queueStrap(): void; queueRecover(): void; setBrace(on: boolean): void; queueDeploy(k: KitId): void }
  ```
  Keys: `KeyA` fore (−), `KeyD` aft (+), `KeyW` gait up, `KeyS` gait down, `Digit0..4` gait, `Space` strap, `ShiftLeft/Right` brace (held), `KeyE` deploy plank (M3), `KeyR` recover.

- [ ] **Step 1: Write the failing tests**

```ts
// test/input.test.ts
import { describe, it, expect } from 'vitest';
import { initialInput, applyKey, applyDragStart, applyDragMove, applyDragEnd, sampleFrame } from '../src/ui/input';
import { tuning } from '../src/content';

describe('input reducers', () => {
  it('holding A ramps ballast negative at ballastRate and clamps', () => {
    const st = initialInput(); applyKey(st, 'KeyA', true);
    for (let i = 0; i < 30; i++) sampleFrame(st, tuning);
    expect(sampleFrame(st, tuning).ballast).toBeCloseTo(-Math.round(tuning.ballastRate * 31 / 60), 0);
    for (let i = 0; i < 120; i++) sampleFrame(st, tuning);
    expect(sampleFrame(st, tuning).ballast).toBe(-tuning.ballastRange);
  });
  it('W/S step gait within 0..4 and digits set it directly', () => {
    const st = initialInput();
    applyKey(st, 'KeyW', true); applyKey(st, 'KeyW', false); expect(st.gait).toBe(1);
    applyKey(st, 'Digit4', true); expect(st.gait).toBe(4);
    applyKey(st, 'KeyW', true); expect(st.gait).toBe(4);
    applyKey(st, 'KeyS', true); expect(st.gait).toBe(3);
  });
  it('strap tap is delivered exactly once', () => {
    const st = initialInput(); applyKey(st, 'Space', true);
    expect(sampleFrame(st, tuning).strap).toBe(true);
    expect(sampleFrame(st, tuning).strap).toBe(false);
  });
  it('shift is a held brace', () => {
    const st = initialInput(); applyKey(st, 'ShiftLeft', true);
    expect(sampleFrame(st, tuning).brace).toBe(true);
    applyKey(st, 'ShiftLeft', false);
    expect(sampleFrame(st, tuning).brace).toBe(false);
  });
  it('drag maps pixels to ballast relative to the start value', () => {
    const st = initialInput(); st.ballast = 20;
    applyDragStart(st, 100);
    applyDragMove(st, 160, 120, 100);   // 60px of a 120px full-range sweep = +50
    expect(st.ballast).toBe(70);
    applyDragMove(st, 400, 120, 100);
    expect(st.ballast).toBe(100);
    applyDragEnd(st);
    expect(st.dragging).toBe(false);
  });
  it('sampleFrame emits integer ballast', () => {
    const st = initialInput(); st.ballast = 33.6;
    expect(sampleFrame(st, tuning).ballast).toBe(34);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/input.test.ts`
Expected: FAIL — cannot resolve `../src/ui/input`.

- [ ] **Step 3: Implement**

```ts
// src/ui/input.ts
import type { Gait, InputFrame, KitId, Tuning } from '../sim/types';

export interface InputState {
  gait: Gait; ballast: number; keyFore: boolean; keyAft: boolean; brace: boolean;
  strapQueued: boolean; recoverQueued: boolean; deployQueued: KitId | 0;
  dragging: boolean; dragStartPx: number; dragStartBallast: number;
}

export function initialInput(): InputState {
  return { gait: 0, ballast: 0, keyFore: false, keyAft: false, brace: false, strapQueued: false, recoverQueued: false, deployQueued: 0, dragging: false, dragStartPx: 0, dragStartBallast: 0 };
}

const clampGait = (g: number): Gait => (g < 0 ? 0 : g > 4 ? 4 : g) as Gait;

export function applyKey(st: InputState, code: string, down: boolean): void {
  switch (code) {
    case 'KeyA': st.keyFore = down; break;
    case 'KeyD': st.keyAft = down; break;
    case 'ShiftLeft': case 'ShiftRight': st.brace = down; break;
    case 'KeyW': if (down) st.gait = clampGait(st.gait + 1); break;
    case 'KeyS': if (down) st.gait = clampGait(st.gait - 1); break;
    case 'Space': if (down) st.strapQueued = true; break;
    case 'KeyR': if (down) st.recoverQueued = true; break;
    case 'KeyE': if (down) st.deployQueued = 'plank'; break;
    default:
      if (down && /^Digit[0-4]$/.test(code)) st.gait = clampGait(Number(code.slice(5)));
  }
}

export function applyDragStart(st: InputState, px: number): void { st.dragging = true; st.dragStartPx = px; st.dragStartBallast = st.ballast; }
export function applyDragMove(st: InputState, px: number, pxPerFullRange: number, range: number): void {
  if (!st.dragging) return;
  const v = st.dragStartBallast + (px - st.dragStartPx) / pxPerFullRange * range;
  st.ballast = v < -range ? -range : v > range ? range : v;
}
export function applyDragEnd(st: InputState): void { st.dragging = false; }

export function sampleFrame(st: InputState, tuning: Tuning): InputFrame {
  const r = tuning.ballastRange;
  if (!st.dragging) {
    if (st.keyFore && !st.keyAft) st.ballast -= tuning.ballastRate * tuning.dt;
    if (st.keyAft && !st.keyFore) st.ballast += tuning.ballastRate * tuning.dt;
    st.ballast = st.ballast < -r ? -r : st.ballast > r ? r : st.ballast;
  }
  const f: InputFrame = { gait: st.gait, ballast: Math.round(st.ballast), strap: st.strapQueued, brace: st.brace, deploy: st.deployQueued, recover: st.recoverQueued };
  st.strapQueued = false; st.recoverQueued = false; st.deployQueued = 0;
  return f;
}

export class InputController {
  readonly state = initialInput();
  private viewport: HTMLElement | null = null;
  private doc: Document | null = null;
  constructor(private readonly tuning: Tuning) {}

  attach(viewport: HTMLElement, doc: Document): void {
    this.viewport = viewport; this.doc = doc;
    doc.addEventListener('keydown', this.onKeyDown);
    doc.addEventListener('keyup', this.onKeyUp);
    viewport.addEventListener('pointerdown', this.onPointerDown);
    viewport.addEventListener('pointermove', this.onPointerMove);
    viewport.addEventListener('pointerup', this.onPointerUp);
    viewport.addEventListener('pointercancel', this.onPointerUp);
  }
  detach(): void {
    this.doc?.removeEventListener('keydown', this.onKeyDown);
    this.doc?.removeEventListener('keyup', this.onKeyUp);
    this.viewport?.removeEventListener('pointerdown', this.onPointerDown);
    this.viewport?.removeEventListener('pointermove', this.onPointerMove);
    this.viewport?.removeEventListener('pointerup', this.onPointerUp);
    this.viewport?.removeEventListener('pointercancel', this.onPointerUp);
  }
  sample(): InputFrame { return sampleFrame(this.state, this.tuning); }
  setGait(g: Gait): void { this.state.gait = g; }
  queueStrap(): void { this.state.strapQueued = true; }
  queueRecover(): void { this.state.recoverQueued = true; }
  setBrace(on: boolean): void { this.state.brace = on; }
  queueDeploy(k: KitId): void { this.state.deployQueued = k; }

  private onKeyDown = (e: KeyboardEvent): void => { if (e.repeat) return; applyKey(this.state, e.code, true); if (e.code === 'Space') e.preventDefault(); };
  private onKeyUp = (e: KeyboardEvent): void => { applyKey(this.state, e.code, false); };
  private onPointerDown = (e: PointerEvent): void => { this.viewport?.setPointerCapture(e.pointerId); applyDragStart(this.state, e.clientX); };
  private onPointerMove = (e: PointerEvent): void => {
    const w = this.viewport?.clientWidth ?? 300;
    applyDragMove(this.state, e.clientX, w * 0.6, this.tuning.ballastRange);
  };
  private onPointerUp = (): void => { applyDragEnd(this.state); };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run test/input.test.ts && pnpm lint && pnpm typecheck`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/input.ts test/input.test.ts
git commit -m "feat(ui): input controller — drag ballast, keyboard, one-shot taps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 15: Panel — tilt needle, reserve, ballast, throttle rail

**Files:**
- Create: `src/ui/panel/panel.ts`
- Modify: `src/ui/panel/panel.css`, `index.html` (panel section becomes empty `<section id="panel"></section>`; remove `<h1>`/`#status`)

**Interfaces:**
- Produces:
  ```ts
  export class Panel {
    constructor(root: HTMLElement, handlers: { onGait(g: Gait): void; onStrap(): void; onBrace(on: boolean): void; onRecover(): void })
    update(s: RigState, tuning: Tuning): void
    setMessage(text: string): void
    setGait(g: Gait): void
  }
  ```
  Strap/Brace/Recover buttons are created now but hidden with `.m2` class until Task 24 reveals them.

- [ ] **Step 1: Implement**

```ts
// src/ui/panel/panel.ts
import type { Gait, RigState, Tuning } from '../../sim/types';

export interface PanelHandlers { onGait(g: Gait): void; onStrap(): void; onBrace(on: boolean): void; onRecover(): void }

export class Panel {
  private needle!: HTMLElement; private reserveFill!: HTMLElement; private ballastFill!: HTMLElement; private ballastText!: HTMLElement;
  private strapFill!: HTMLElement; private message!: HTMLElement; private gaitBtns: HTMLElement[] = [];
  private recoverBtn!: HTMLButtonElement; private hazardLamp!: HTMLElement;

  constructor(private readonly root: HTMLElement, private readonly h: PanelHandlers) {
    root.innerHTML = `
      <div class="panel-grid">
        <div class="brand">DEADWEIGHT <span class="sub">MULE-7 REMOTE OPERATOR</span></div>
        <div class="gauge tilt"><div class="dial"><div class="zone"></div><div class="needle"></div></div><label>TILT</label></div>
        <div class="gauge reserve"><div class="bar"><div class="fill"></div></div><label>RESERVE</label></div>
        <div class="gauge strap m2"><div class="bar"><div class="fill"></div></div><label>STRAP</label></div>
        <div class="gauge ballast"><div class="bar centred"><div class="fill"></div></div><label>BALLAST <span class="val">0</span></label></div>
        <div class="rail"><label>GAIT</label>${[4, 3, 2, 1, 0].map((g) => `<button data-gait="${g}">${g}</button>`).join('')}</div>
        <div class="buttons">
          <button class="big strap m2">STRAP</button>
          <button class="big brace m2">BRACE</button>
          <button class="big recover m2" disabled>RECOVER</button>
        </div>
        <div class="lamp hazard m2">HAZARD</div>
        <pre class="tele"></pre>
      </div>`;
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
    this.needle = q('.tilt .needle'); this.reserveFill = q('.reserve .fill'); this.strapFill = q('.strap .fill');
    this.ballastFill = q('.ballast .fill'); this.ballastText = q('.ballast .val'); this.message = q('.tele');
    this.hazardLamp = q('.lamp.hazard'); this.recoverBtn = q('button.recover');
    this.gaitBtns = Array.from(root.querySelectorAll<HTMLElement>('.rail button'));
    for (const b of this.gaitBtns) b.addEventListener('pointerdown', () => { const g = Number(b.dataset.gait) as Gait; this.setGait(g); h.onGait(g); });
    q<HTMLButtonElement>('button.strap').addEventListener('pointerdown', () => h.onStrap());
    const brace = q<HTMLButtonElement>('button.brace');
    brace.addEventListener('pointerdown', (e) => { brace.setPointerCapture(e.pointerId); brace.classList.add('on'); h.onBrace(true); });
    const off = (): void => { brace.classList.remove('on'); h.onBrace(false); };
    brace.addEventListener('pointerup', off); brace.addEventListener('pointercancel', off);
    this.recoverBtn.addEventListener('pointerdown', () => h.onRecover());
  }

  setGait(g: Gait): void { for (const b of this.gaitBtns) b.classList.toggle('on', Number(b.dataset.gait) === g); }
  setMessage(text: string): void { this.message.textContent = text; }
  setHazard(on: boolean): void { this.hazardLamp.classList.toggle('on', on); }

  update(s: RigState, tuning: Tuning): void {
    const deg = Math.max(-1.2, Math.min(1.2, s.tilt)) * 60;
    this.needle.style.transform = `rotate(${deg}deg)`;
    this.needle.classList.toggle('red', Math.abs(s.tilt) > 0.7);
    this.reserveFill.style.width = `${Math.max(0, s.reserve)}%`;
    this.reserveFill.classList.toggle('low', s.reserve < 20);
    this.strapFill.style.width = `${s.strap}%`;
    const r = tuning.ballastRange;
    const pct = (s.ballast / r) * 50;
    this.ballastFill.style.left = `${50 + Math.min(0, pct)}%`;
    this.ballastFill.style.width = `${Math.abs(pct)}%`;
    this.ballastText.textContent = (s.ballast > 0 ? '+' : '') + String(s.ballast);
    this.recoverBtn.disabled = !(s.items.some((it) => it.lost) && s.recovering === 0 && !s.ended);
    this.root.classList.toggle('recovering', s.recovering > 0);
  }
}
```

- [ ] **Step 2: Append panel CSS**

```css
/* append to src/ui/panel/panel.css */
.panel-grid { display: grid; height: 100%; gap: 10px; grid-template-columns: 1fr 1fr 64px; grid-template-rows: auto 1fr auto auto; grid-template-areas: "brand brand rail" "tilt gauges rail" "buttons buttons rail" "tele tele lamp"; }
.brand { grid-area: brand; font-size: 14px; letter-spacing: .16em; } .brand .sub { font-size: 9px; opacity: .55; margin-left: 8px; letter-spacing: .1em; }
.gauge label { display: block; font-size: 10px; letter-spacing: .14em; opacity: .75; margin-top: 4px; }
.gauge.tilt { grid-area: tilt; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.dial { position: relative; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle at 50% 45%, #f0e6cc 0, var(--cream) 60%, #b9ab88 100%); border: 6px solid #8a7a5c; box-shadow: inset 0 0 0 2px #5a4e3a, 0 3px 0 #1a1c1f; }
.dial .zone { position: absolute; inset: 6px; border-radius: 50%; background: conic-gradient(from 218deg, var(--red) 0 22deg, transparent 22deg 60deg, transparent 60deg 262deg, var(--red) 262deg 284deg, transparent 284deg); opacity: .8; }
.dial .needle { position: absolute; left: 50%; bottom: 50%; width: 4px; height: 52px; margin-left: -2px; background: var(--ink); transform-origin: 50% 100%; border-radius: 2px 2px 0 0; transition: transform 40ms linear; }
.dial .needle.red { background: var(--red); }
.gauge.reserve, .gauge.strap, .gauge.ballast { align-self: center; }
.gauge.reserve { grid-area: gauges; } .gauge.strap { grid-area: gauges; margin-top: 44px; } .gauge.ballast { grid-area: gauges; margin-top: 88px; }
.bar { position: relative; height: 16px; background: #1e2124; border: 2px solid #6b6f74; border-radius: 3px; overflow: hidden; }
.bar .fill { position: absolute; top: 0; bottom: 0; left: 0; background: var(--orange); }
.reserve .fill.low { background: var(--red); }
.strap .fill { background: var(--cream); }
.bar.centred::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: var(--cream); opacity: .6; }
.rail { grid-area: rail; display: flex; flex-direction: column; gap: 4px; } .rail label { font-size: 9px; letter-spacing: .14em; text-align: center; opacity: .75; }
.rail button { flex: 1; font: inherit; font-size: 16px; background: #23272b; color: var(--cream); border: 2px solid #6b6f74; border-radius: 4px; }
.rail button.on { background: var(--orange); color: var(--ink); border-color: var(--cream); }
.buttons { grid-area: buttons; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
button.big { font: inherit; font-size: 14px; letter-spacing: .1em; padding: 14px 0; background: #23272b; color: var(--cream); border: 3px solid #6b6f74; border-radius: 6px; box-shadow: 0 4px 0 #0f1113; }
button.big:active, button.big.on { transform: translateY(3px); box-shadow: 0 1px 0 #0f1113; background: var(--orange); color: var(--ink); }
button.big:disabled { opacity: .35; }
.lamp { grid-area: lamp; align-self: center; text-align: center; font-size: 9px; letter-spacing: .12em; padding: 6px 0; border: 2px solid #6b6f74; border-radius: 4px; opacity: .35; }
.lamp.on { opacity: 1; background: var(--red); color: #fff; animation: blink .5s steps(2) infinite; }
@keyframes blink { to { opacity: .4; } }
.tele { grid-area: tele; margin: 0; font: 11px/1.35 ui-monospace, Menlo, monospace; color: #f4ead2; background: #15171a; border: 2px solid #6b6f74; border-radius: 4px; padding: 6px 8px; min-height: 40px; white-space: pre-wrap; }
.m2 { display: none; }
#panel.recovering .dial { filter: grayscale(1); }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (Visual verification happens in Task 16.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/panel index.html
git commit -m "feat(ui): panel — tilt dial, reserve/ballast bars, gait rail, button row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 16: Cargo rendering, haul → result flow, result screen

**Files:**
- Create: `src/render/three/cargo.ts`, `src/ui/screens/result.ts`, `src/ui/screens/screens.css`, `src/game/flow.ts`
- Modify: `src/render/Renderer.ts` (add `setLoadout`), `src/render/three/ThreeRenderer.ts`, `src/main.ts`, `index.html` (add `<div id="screen" hidden></div>` inside `#app`)

**Interfaces:**
- `Renderer.setLoadout(items: ItemDef[]): void` — called before `setRoute`.
- `export function renderResult(el: HTMLElement, result: RunResult, items: ItemDef[], onAgain: () => void): void`
- `export class Flow { constructor(deps: FlowDeps); startHaul(route: RouteDef, loadout: LoadoutItem[]): void }` where
  `FlowDeps = { viewportEl: HTMLElement; panel: Panel; screenEl: HTMLElement; input: InputController; renderer: Promise<Renderer>; tuning: Tuning; onRunEnd?(result: RunResult, state: RigState, log: InputFrame[]): void }`.
  Task 22 extends `Flow` with the full state machine; this task ships HAUL → RESULT → HAUL.

- [ ] **Step 1: Cargo view**

```ts
// src/render/three/cargo.ts
import * as THREE from 'three';
import type { ItemDef, ItemState, Tuning } from '../../sim/types';

const BODY_TOP = 2.85;

function geometryFor(shape: ItemDef['art']['shape']): THREE.BufferGeometry {
  switch (shape) {
    case 'cylinder': return new THREE.CylinderGeometry(0.45, 0.5, 0.9, 8);
    case 'sphere': return new THREE.SphereGeometry(0.5, 8, 6);
    case 'cage': return new THREE.BoxGeometry(0.9, 0.9, 0.9);
    default: return new THREE.BoxGeometry(0.9, 0.8, 0.9);
  }
}

interface Debris { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

export class CargoView {
  readonly group = new THREE.Group();          // parented to the rig group
  readonly debrisGroup = new THREE.Group();    // parented to the scene
  private meshes = new Map<string, THREE.Mesh>();
  private wasLost = new Set<string>();
  private debris: Debris[] = [];

  setLoadout(items: ItemDef[]): void {
    this.group.clear(); this.meshes.clear(); this.wasLost.clear();
    for (const def of items) {
      const m = new THREE.Mesh(geometryFor(def.art.shape), new THREE.MeshLambertMaterial({ color: def.art.color, flatShading: true, wireframe: def.art.shape === 'cage' }));
      m.position.y = BODY_TOP + 0.45;
      this.group.add(m); this.meshes.set(def.id, m);
    }
  }

  sync(items: ItemState[], tuning: Tuning, rigWorld: THREE.Vector3): void {
    for (const it of items) {
      const m = this.meshes.get(it.id); if (!m) continue;
      m.position.x = tuning.slotPos[it.slot]! * 1.05 + it.offset * 0.7;
      m.rotation.z = -it.offset * 0.4;
      if (it.lost && !this.wasLost.has(it.id)) { this.wasLost.add(it.id); m.visible = false; this.burst(rigWorld.clone().add(m.position), (m.material as THREE.MeshLambertMaterial).color); }
      if (!it.lost && this.wasLost.has(it.id)) { this.wasLost.delete(it.id); m.visible = true; }
    }
  }

  private burst(at: THREE.Vector3, color: THREE.Color): void {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshLambertMaterial({ color }));
      mesh.position.copy(at);
      this.debrisGroup.add(mesh);
      this.debris.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6), life: 1.4 });
    }
  }

  tickDebris(dtSec: number, groundY: (x: number) => number): void {
    for (const d of this.debris) {
      d.vel.y -= 12 * dtSec; d.mesh.position.addScaledVector(d.vel, dtSec); d.life -= dtSec;
      const g = groundY(d.mesh.position.x);
      if (d.mesh.position.y < g) { d.mesh.position.y = g; d.vel.set(d.vel.x * 0.5, 0, d.vel.z * 0.5); }
    }
    this.debris = this.debris.filter((d) => { if (d.life <= 0) { this.debrisGroup.remove(d.mesh); return false; } return true; });
  }
}
```

- [ ] **Step 2: Extend Renderer and ThreeRenderer**

In `src/render/Renderer.ts` add `setLoadout(items: ItemDef[]): void;` to the interface and import `ItemDef`.

In `ThreeRenderer.ts`:
- import `CargoView` and `tuning` from `'../../content'`.
- add fields `private readonly cargo = new CargoView(); private lastDrawMs = 0;`
- in `mount()`: `this.rig.group.add(this.cargo.group); this.scene.add(this.cargo.debrisGroup);`
- add `setLoadout(items: ItemDef[]): void { this.cargo.setLoadout(items); }`
- in `draw()`, after `this.rig.update(...)`: 
  ```ts
  this.cargo.sync(curr.items, tuning, this.rig.group.position);
  const now = performance.now(); const dtSec = this.lastDrawMs ? Math.min(0.05, (now - this.lastDrawMs) / 1000) : 0; this.lastDrawMs = now;
  this.cargo.tickDebris(dtSec, (px) => this.route!.heightAt(px));
  ```

- [ ] **Step 3: Result screen**

```ts
// src/ui/screens/result.ts
import type { ItemDef, RunResult } from '../../sim/types';

const ENDED: Record<RunResult['ended'], string> = { arrived: 'DELIVERED', spilled: 'TOTAL SPILL', stalled: 'RESERVE EMPTY — STALLED' };

export function renderResult(el: HTMLElement, result: RunResult, items: ItemDef[], onAgain: () => void, review = ''): void {
  const name = (id: string): string => items.find((d) => d.id === id)?.name ?? id;
  el.innerHTML = `
    <div class="screen result">
      <h2>${ENDED[result.ended]}</h2>
      <div class="stars">${'★'.repeat(result.stars)}${'☆'.repeat(5 - result.stars)}</div>
      <ul class="items">${result.items.map((i) => `<li><span>${name(i.id)}</span><span class="cond ${i.lost ? 'lost' : ''}">${i.lost ? 'LOST' : i.late ? 'LATE' : `${Math.round(i.condition * 100)}%`}</span></li>`).join('')}</ul>
      ${review ? `<p class="review">“${review}”</p>` : ''}
      <div class="cash">PAYOUT ${Math.round(result.payout)} + BONUS ${Math.round(result.bonus)} = <b>${result.total}</b></div>
      <button class="big primary">HAUL AGAIN</button>
    </div>`;
  el.hidden = false;
  el.querySelector('button')!.addEventListener('pointerdown', () => { el.hidden = true; onAgain(); });
}
```

```css
/* src/ui/screens/screens.css */
#screen { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(20, 22, 25, .88); padding: 16px; overflow: auto; }
#screen[hidden] { display: none; }
.screen { width: min(520px, 100%); background: var(--cream); color: var(--ink); border: 8px solid var(--gun); border-radius: 10px; padding: 18px; box-shadow: 0 10px 0 #000; }
.screen h2 { margin: 0 0 8px; font-size: 22px; letter-spacing: .12em; }
.screen .stars { font-size: 30px; color: var(--orange); margin-bottom: 8px; }
.screen ul { list-style: none; padding: 0; margin: 0 0 10px; } .screen li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 2px dashed #b9ab88; }
.cond.lost { color: var(--red); }
.screen .review { font: italic 14px/1.4 Georgia, serif; margin: 8px 0 12px; }
.screen .cash { font-size: 14px; margin-bottom: 12px; }
.screen button.primary { width: 100%; background: var(--orange); color: var(--ink); border-color: var(--gun); }
```

- [ ] **Step 4: Flow v1**

```ts
// src/game/flow.ts
import { createRun, step } from '../sim/step';
import { evaluate } from '../sim/score';
import { mulberry32, hashSeed } from '../sim/rng';
import { GameLoop } from './loop';
import { renderResult } from '../ui/screens/result';
import type { Renderer, RenderPrev } from '../render/Renderer';
import type { Panel } from '../ui/panel/panel';
import type { InputController } from '../ui/input';
import type { InputFrame, LoadoutItem, RigState, RouteDef, RunResult, Tuning } from '../sim/types';

export interface FlowDeps {
  viewportEl: HTMLElement; panel: Panel; screenEl: HTMLElement; input: InputController;
  renderer: Promise<Renderer>; tuning: Tuning;
  onRunEnd?(result: RunResult, state: RigState, log: InputFrame[]): void;
}

export class Flow {
  private loop: GameLoop | null = null;
  private renderer: Renderer | null = null;
  private runNonce = 1;

  constructor(private readonly d: FlowDeps) {
    d.renderer.then((r) => { this.renderer = r; });
  }

  startHaul(route: RouteDef, loadout: LoadoutItem[]): void {
    this.loop?.stop();
    const { tuning, panel, input } = this.d;
    const state = createRun(route, loadout, tuning);
    const rng = mulberry32(hashSeed(route.seed, this.runNonce++));
    const prev: RenderPrev = { x: 0, tilt: 0 };
    input.setGait(2); panel.setGait(2);
    panel.setMessage(`HQ: Route ${route.seed}. ${loadout.length} item(s) aboard. Counter the slope with ballast. Go.`);
    const defs = loadout.map((l) => l.def);
    const attachRenderer = (r: Renderer): void => { r.setLoadout(defs); r.setRoute(route); };
    if (this.renderer) attachRenderer(this.renderer); else this.d.renderer.then(attachRenderer);

    let linger = 0;   // own counter: state.t freezes once the run has ended
    const loop = new GameLoop({
      dt: tuning.dt,
      sampleInput: () => input.sample(),
      step: (inp) => {
        prev.x = state.x; prev.tilt = state.tilt;
        step(state, inp, route, [], tuning, rng);
        if (state.ended && ++linger > 60) this.finish(state, loop);   // 1 s linger after end
      },
      render: (alpha) => { this.renderer?.draw(state, prev, alpha); panel.update(state, tuning); },
    });
    this.loop = loop;
    loop.start();
    this.lastRoute = route; this.lastLoadout = loadout;
  }

  private lastRoute: RouteDef | null = null;
  private lastLoadout: LoadoutItem[] = [];

  private finish(state: RigState, loop: GameLoop): void {
    loop.stop();
    const result = evaluate(state, this.d.tuning);
    this.d.onRunEnd?.(result, state, loop.log);
    renderResult(this.d.screenEl, result, this.lastLoadout.map((l) => l.def), () => { if (this.lastRoute) this.startHaul(this.lastRoute, this.lastLoadout); });
  }
}
```

- [ ] **Step 5: Rewrite `src/main.ts` for M1**

```ts
// src/main.ts
import './ui/panel/panel.css';
import './ui/screens/screens.css';
import { tuning } from './content';
import { generateRoute } from './sim/terrain';
import { Panel } from './ui/panel/panel';
import { InputController } from './ui/input';
import { Flow } from './game/flow';
import type { Renderer } from './render/Renderer';
import type { ItemDef } from './sim/types';

const viewportEl = document.getElementById('viewport')!;
const panelEl = document.getElementById('panel')!;
const screenEl = document.getElementById('screen')!;

const input = new InputController(tuning);
input.attach(viewportEl, document);
const panel = new Panel(panelEl, {
  onGait: (g) => input.setGait(g),
  onStrap: () => input.queueStrap(),
  onBrace: (on) => input.setBrace(on),
  onRecover: () => input.queueRecover(),
});

const renderer: Promise<Renderer> = import('./render/three/ThreeRenderer').then(({ ThreeRenderer }) => {
  const r = new ThreeRenderer(); r.mount(viewportEl);
  window.addEventListener('resize', () => r.resize());
  return r;
});

const flow = new Flow({ viewportEl, panel, screenEl, input, renderer, tuning });
const crate: ItemDef = { id: 'crate', name: 'Sealed Crate', mass: 1.5, tolerance: 0.6, crushLimit: 100, behavior: 'static', payout: 120, tier: 0, art: { shape: 'box', color: '#8a6d3b' } };
flow.startHaul(generateRoute(4417, 560, 0, [], tuning.terrain), [{ def: crate, slot: 0 }]);
```

- [ ] **Step 6: Playtest**

Run: `pnpm dev`. Play on desktop (A/D, W/S) and in the device toolbar (drag on viewport, tap rail).
Expected: crate visible on the rig, fore-slotted (nose-down bias needs +ballast). Tilt needle moves; ballast bar follows drag; reserve drains; reaching the end shows the result screen; HAUL AGAIN restarts. Over-tilting throws the crate (debris) and ends the run as TOTAL SPILL. No console errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: M1 slice — cargo on rig, spill debris, haul→result loop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 17: Fun gate — tune ballast-vs-slope, deploy M1

**Files:**
- Modify: `src/content/tuning.json`, `DEVLOG.md`

This is the gate from the spec. Do not proceed to M2 until the answer to "is trimming against slope satisfying?" is yes.

- [ ] **Step 1: Play 5 runs on desktop and 3 on the phone emulator. Note against each:**
  - Can you feel the overshoot? (If tilt snaps to the dial, raise `stiffness` toward 3 and `damping` to keep ζ≈0.45: `damping ≈ 0.9·√stiffness`.)
  - Do you have time to react at gait 2? (If not, lower `gaitSpeed[2]` or `slopeSigma[0]`; the reaction window is viewport width ÷ speed.)
  - Is gait 4 scary but survivable on a tier-0 route? (If trivially safe, raise `slopeSigma`; if hopeless, lower `gaitSpeed[4]`.)
  - Does the reserve run out at gait 1? It should, around 70–80 % of the route. Adjust `reserveBudget` (0.75 = gait 2 spends three-quarters of the reserve).
  - Does the drift spiral feel like a warning, not an ambush? Adjust `driftThreshold`, `graceTicks`, `kDrift`.

- [ ] **Step 2: After each tuning change run the harness**

Run: `pnpm test && pnpm validate`
Expected: all green — a tuning change that breaks solvability at lag 15 is rejected.

- [ ] **Step 3: Record in DEVLOG.md under "Problems solved"** the before/after constants and the one-line reason for each change. Under "What AI built" add: `- M1: headless PD bot with reaction lag; validator rejects unsolvable seeds; determinism/replay test suite.`

- [ ] **Step 4: Commit, push, verify live**

```bash
git add src/content/tuning.json DEVLOG.md
git commit -m "tune: M1 fun-gate pass on tilt/ballast constants

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
git push && gh run watch --exit-status
```

Expected: live URL plays the M1 slice on a phone.

---

# Phase M2 — Loop closure

### Task 18: Content — cargo, outposts, hazards, upgrades, reviews, HQ lines

**Files:**
- Create: `src/content/cargo.json`, `src/content/outposts.json`, `src/content/hazards.json`, `src/content/upgrades.json`, `src/content/reviews.json`, `src/content/hq.json`
- Modify: `src/content/index.ts`, `src/sim/types.ts` (add `ReviewDef`, `HqDef`)
- Test: `test/content.test.ts` (extend)

**Interfaces:**
- Produces from `src/content/index.ts`: `cargo: ItemDef[]`, `outposts: OutpostDef[]`, `hazards: HazardDef[]`, `upgrades: UpgradeDef[]`, `reviews: ReviewDef[]`, `hq: HqDef[]`.
- Types: `ReviewDef { stars: 1|2|3|4|5; behavior: Behavior | 'any'; lines: string[] }`, `HqDef { context: 'dispatch' | 'arrival' | 'spill' | 'stall'; behavior: Behavior | 'any'; lines: string[] }`.

- [ ] **Step 1: Add types**

Append to `src/sim/types.ts`:

```ts
export interface ReviewDef { stars: 1 | 2 | 3 | 4 | 5; behavior: Behavior | 'any'; lines: string[] }
export interface HqDef { context: 'dispatch' | 'arrival' | 'spill' | 'stall'; behavior: Behavior | 'any'; lines: string[] }
```

- [ ] **Step 2: Write `cargo.json`**

```json
[
  { "id": "crate", "name": "Sealed Crate", "mass": 1.5, "tolerance": 0.65, "crushLimit": 100, "behavior": "static", "payout": 110, "tier": 0, "art": { "shape": "box", "color": "#8a6d3b" } },
  { "id": "soup", "name": "Soup Cauldron", "mass": 2.0, "tolerance": 0.6, "crushLimit": 95, "behavior": "slosh", "payout": 150, "tier": 0, "art": { "shape": "cylinder", "color": "#6d4b2a" } },
  { "id": "cake", "name": "Wedding Cake", "mass": 1.0, "tolerance": 0.35, "crushLimit": 55, "behavior": "precarious", "payout": 260, "tier": 0, "art": { "shape": "cylinder", "color": "#f2e8f0" } },
  { "id": "chicken", "name": "Live Chicken", "mass": 0.5, "tolerance": 0.7, "crushLimit": 70, "behavior": "livestock", "payout": 90, "tier": 0, "art": { "shape": "cage", "color": "#e0b040" } },
  { "id": "dishes", "name": "Stack of Unwashed Dishes", "mass": 1.0, "tolerance": 0.3, "crushLimit": 65, "behavior": "precarious", "payout": 120, "tier": 0, "art": { "shape": "cylinder", "color": "#c9d3d8" } },
  { "id": "pizzas", "name": "40 Pizzas", "mass": 0.8, "tolerance": 0.65, "crushLimit": 60, "behavior": "static", "payout": 130, "rush": 55, "tier": 0, "art": { "shape": "box", "color": "#c8622a" } },
  { "id": "pickles", "name": "Barrels of Pickles", "mass": 2.2, "tolerance": 0.6, "crushLimit": 95, "behavior": "slosh", "payout": 150, "tier": 0, "art": { "shape": "cylinder", "color": "#5f7a3a" } },
  { "id": "grandmother", "name": "Nervous Grandmother", "mass": 1.2, "tolerance": 0.5, "crushLimit": 60, "behavior": "livestock", "payout": 320, "tier": 1, "art": { "shape": "cage", "color": "#b48cc8" } },
  { "id": "fishtank", "name": "Fish Tank", "mass": 2.0, "tolerance": 0.45, "crushLimit": 75, "behavior": "slosh", "payout": 220, "tier": 1, "art": { "shape": "box", "color": "#5aa7c8" } },
  { "id": "bearings", "name": "400 Ball Bearings", "mass": 1.8, "tolerance": 0.5, "crushLimit": 100, "behavior": "slosh", "payout": 180, "tier": 1, "art": { "shape": "box", "color": "#9aa0a6" } },
  { "id": "ticking", "name": "Unlabeled Crate (ticking)", "mass": 1.5, "tolerance": 0.6, "crushLimit": 85, "behavior": "static", "payout": 300, "tier": 1, "art": { "shape": "box", "color": "#3a3f45" } },
  { "id": "goat", "name": "Goat", "mass": 1.4, "tolerance": 0.7, "crushLimit": 65, "behavior": "livestock", "payout": 160, "tier": 1, "art": { "shape": "cage", "color": "#d8c8a0" } },
  { "id": "swan", "name": "Ice Sculpture (swan)", "mass": 1.5, "tolerance": 0.4, "crushLimit": 50, "behavior": "precarious", "payout": 280, "rush": 75, "tier": 1, "art": { "shape": "sphere", "color": "#dff3ff" } },
  { "id": "piano", "name": "Grand Piano", "mass": 3.0, "tolerance": 0.55, "crushLimit": 90, "behavior": "static", "payout": 400, "tier": 2, "art": { "shape": "box", "color": "#1c1a16" } },
  { "id": "beehive", "name": "Beehive", "mass": 1.0, "tolerance": 0.6, "crushLimit": 70, "behavior": "livestock", "payout": 210, "tier": 2, "art": { "shape": "cylinder", "color": "#e8b830" } },
  { "id": "server", "name": "Server Rack", "mass": 2.5, "tolerance": 0.5, "crushLimit": 100, "behavior": "static", "payout": 350, "tier": 2, "art": { "shape": "box", "color": "#2f3338" } },
  { "id": "chandelier", "name": "Crystal Chandelier", "mass": 1.6, "tolerance": 0.35, "crushLimit": 55, "behavior": "precarious", "payout": 380, "tier": 2, "art": { "shape": "sphere", "color": "#f8f4e0" } },
  { "id": "organ", "name": "Organ Cooler", "mass": 0.6, "tolerance": 0.5, "crushLimit": 80, "behavior": "static", "payout": 420, "rush": 50, "tier": 2, "art": { "shape": "box", "color": "#e8e8e8" } },
  { "id": "hottub", "name": "Hot Tub (full)", "mass": 3.0, "tolerance": 0.5, "crushLimit": 100, "behavior": "slosh", "payout": 330, "tier": 3, "art": { "shape": "cylinder", "color": "#4a8ab0" } },
  { "id": "jenga", "name": "Championship Jenga Tower", "mass": 0.7, "tolerance": 0.25, "crushLimit": 40, "behavior": "precarious", "payout": 240, "tier": 3, "art": { "shape": "box", "color": "#d4a86a" } }
]
```

- [ ] **Step 3: Write `outposts.json`**

```json
[
  { "id": "gravel", "name": "Gravel Hollow", "seed": 4417, "lengthM": 560, "tier": 0, "flavor": "Gentle. Mostly. Somebody left a chair on the route." },
  { "id": "wren", "name": "Wren Station", "seed": 1203, "lengthM": 600, "tier": 0, "flavor": "The station master tips in birdseed." },
  { "id": "sump", "name": "Sump Nine", "seed": 7781, "lengthM": 620, "tier": 0, "flavor": "It is wet. The cargo will be wet. Manage expectations." },
  { "id": "tallow", "name": "Tallow Ridge", "seed": 3350, "lengthM": 680, "tier": 1, "flavor": "One long grade. Trim early or trim never." },
  { "id": "kettle", "name": "Kettle Pass", "seed": 9026, "lengthM": 700, "tier": 1, "flavor": "Gusts funnel through the pass at exactly the wrong moment." },
  { "id": "marrow", "name": "Marrow Flats", "seed": 5518, "lengthM": 720, "tier": 1, "flavor": "Flat. Deceptively. Rubble everywhere." },
  { "id": "halfmast", "name": "Halfmast", "seed": 6142, "lengthM": 780, "tier": 2, "flavor": "The flag has been at half mast since the last piano." },
  { "id": "brine", "name": "Brine Terrace", "seed": 2870, "lengthM": 800, "tier": 2, "flavor": "Terraced. Gaps between every terrace. Bring planks." },
  { "id": "signal", "name": "Old Signal", "seed": 8809, "lengthM": 820, "tier": 2, "flavor": "Nobody remembers what it signals." },
  { "id": "cinder", "name": "Cinder Stair", "seed": 1499, "lengthM": 880, "tier": 3, "flavor": "Not stairs. Worse." },
  { "id": "shelf", "name": "The Shelf", "seed": 7263, "lengthM": 900, "tier": 3, "flavor": "A shelf. With a drop. Scree on the drop." },
  { "id": "lantern", "name": "Lantern Reach", "seed": 3928, "lengthM": 960, "tier": 3, "flavor": "Longest route on the books. Reserve is the enemy." }
]
```

- [ ] **Step 4: Write `hazards.json`**

```json
[
  { "type": "gust", "impulse": 0.9, "strapJolt": 12, "telegraphM": 25, "counter": "Tap STRAP and lead ballast into the gust.", "weight": 0.35, "minTier": 0 },
  { "type": "rubble", "impulse": 0.35, "strapJolt": 25, "telegraphM": 20, "counter": "Throttle down before rubble.", "weight": 0.4, "minTier": 0 },
  { "type": "grade", "impulse": 0, "strapJolt": 0, "telegraphM": 35, "counter": "Counter-set ballast before the grade.", "weight": 0.3, "minTier": 0 },
  { "type": "gap", "impulse": 1.4, "strapJolt": 20, "telegraphM": 30, "counter": "BRACE over the gap, or use a plank.", "weight": 0.25, "minTier": 1 },
  { "type": "scree", "impulse": 0.25, "strapJolt": 6, "telegraphM": 20, "counter": "Slow down and brace through scree.", "weight": 0.3, "minTier": 1, "count": 5, "spreadM": 12 }
]
```

- [ ] **Step 5: Write `upgrades.json`**

```json
[
  { "id": "wide-trim", "name": "Wide Trim Rack", "cost": 250, "blurb": "Ballast dial swings to ±130.", "effect": { "key": "ballastRange", "value": 130 } },
  { "id": "governor", "name": "Trim Assist Governor", "cost": 400, "blurb": "Pulls 30% of the way to neutral for you.", "effect": { "key": "autoTrim", "value": 0.3 } },
  { "id": "straps", "name": "Reinforced Straps", "cost": 300, "blurb": "Jolts loosen straps 40% less.", "effect": { "key": "strapJoltMul", "value": 0.6 } },
  { "id": "bay", "name": "Third Cargo Bay", "cost": 500, "blurb": "Carry three orders at once.", "effect": { "key": "capacity", "value": 3 } },
  { "id": "stride", "name": "Long-Stride Actuators", "cost": 350, "blurb": "Every gait 20% faster.", "effect": { "key": "gaitSpeedMul", "value": 1.2 } },
  { "id": "surplus", "name": "Kit Surplus Contract", "cost": 200, "blurb": "Infrastructure kits half price.", "effect": { "key": "kitCostMul", "value": 0.5 } }
]
```

- [ ] **Step 6: Write `reviews.json`** (M4 expands toward 60)

```json
[
  { "stars": 1, "behavior": "any", "lines": ["It arrived in the sense that the rig arrived.", "I have photographed the remains for the insurer.", "The driver waved. The cargo did not.", "One star because zero is not an option.", "My neighbour saw it fall off. She is still laughing.", "I ordered a delivery, not a demonstration."] },
  { "stars": 2, "behavior": "any", "lines": ["Technically present. Spiritually absent.", "Half of it works. The wrong half.", "The box was upside down and so, eventually, was I.", "It smells like the route.", "I have questions and the courier had none.", "Two stars. One for each surviving corner."] },
  { "stars": 3, "behavior": "any", "lines": ["Fine. It's fine. Everything is fine.", "Some dents. Character, my wife says.", "Arrived on time, arrived with opinions.", "I will use this company again, out of spite.", "Adequate, like the weather.", "The strap marks will buff out. Probably."] },
  { "stars": 4, "behavior": "any", "lines": ["Nearly perfect. The 'nearly' is load-bearing.", "One scuff. I named it.", "Better than the last three couriers combined.", "Arrived warm, which was either great or alarming.", "I'd tip if the panel had a slot for it.", "Four stars. The fifth was on the slope."] },
  { "stars": 5, "behavior": "any", "lines": ["Immaculate. I checked twice.", "Whoever was on the ballast dial: marry me.", "Not a scratch. Not a slosh. Not a sound.", "I did not know this route could be done cleanly.", "Perfect. Suspiciously perfect.", "Five stars and a photograph on the outpost wall."] },
  { "stars": 1, "behavior": "slosh", "lines": ["Cauldron delivered. Soup delivered separately, across three kilometres.", "It is now a bowl."] },
  { "stars": 1, "behavior": "livestock", "lines": ["The chicken has left a review of its own. It is worse.", "Grandmother arrived. She would like to speak to a manager."] },
  { "stars": 1, "behavior": "precarious", "lines": ["Cake delivered: 41% intact. My daughter is crying.", "Every tier of the cake arrived at a different time."] },
  { "stars": 3, "behavior": "slosh", "lines": ["Three-quarters full. Rounding up.", "Some of the fish are new fish."] },
  { "stars": 3, "behavior": "livestock", "lines": ["The goat is calm. The goat is never calm. What did you do.", "Grandmother is quiet. This is not a compliment."] },
  { "stars": 5, "behavior": "slosh", "lines": ["Not a drop over the rim. Not one.", "The soup was still spinning. In a good way."] },
  { "stars": 5, "behavior": "livestock", "lines": ["The chicken laid an egg on the way. Bonus cargo.", "Grandmother says the operator has 'lovely hands'."] },
  { "stars": 5, "behavior": "precarious", "lines": ["Every dish still stacked. I am framing the invoice.", "The tower stands. The tournament is saved."] }
]
```

- [ ] **Step 7: Write `hq.json`**

```json
[
  { "context": "dispatch", "behavior": "any", "lines": ["HQ: Three orders on the wire. Pick what you can carry, not what you want to.", "HQ: Reminder that reviews are public and so is your callsign.", "HQ: Reserve is charged to your account. Speed is free. Draw your own conclusions.", "HQ: Route conditions unchanged since the last incident.", "HQ: New operator? Ballast against the slope. Everything else is detail.", "HQ: Customer has requested 'no drama'. Logged, not promised."] },
  { "context": "dispatch", "behavior": "slosh", "lines": ["HQ: Liquid cargo. Straps will not help you. Trim will.", "HQ: It sloshes. It will keep sloshing after you stop. Plan for that."] },
  { "context": "dispatch", "behavior": "livestock", "lines": ["HQ: Cargo is alive and has preferences. Ignore them.", "HQ: Livestock shifts its weight on its own schedule. Keep the straps snug."] },
  { "context": "dispatch", "behavior": "precarious", "lines": ["HQ: Fragile. Do not over-tighten. Do not under-tighten. Good luck.", "HQ: Tolerance on this one is lower than your last review."] },
  { "context": "arrival", "behavior": "any", "lines": ["HQ: Outpost confirms receipt. Review pending.", "HQ: Rig docked. Cargo being counted. Hold.", "HQ: Arrived. Reserve balance noted with interest."] },
  { "context": "spill", "behavior": "any", "lines": ["HQ: Cargo overboard. RECOVER is on the panel for a reason.", "HQ: That was audible from here.", "HQ: Wreckage logged at your position. Someone will salvage it. Not you."] },
  { "context": "stall", "behavior": "any", "lines": ["HQ: Reserve exhausted. Rig is a statue. Partial credit issued.", "HQ: Next time, faster. Or shorter. Or both."] }
]
```

- [ ] **Step 8: Update `src/content/index.ts`**

```ts
// src/content/index.ts
import type { HazardDef, HqDef, ItemDef, OutpostDef, ReviewDef, Tuning, UpgradeDef } from '../sim/types';
import tuningJson from './tuning.json';
import cargoJson from './cargo.json';
import outpostsJson from './outposts.json';
import hazardsJson from './hazards.json';
import upgradesJson from './upgrades.json';
import reviewsJson from './reviews.json';
import hqJson from './hq.json';

export const tuning: Tuning = tuningJson as Tuning;
export const cargo: ItemDef[] = cargoJson as ItemDef[];
export const outposts: OutpostDef[] = outpostsJson as OutpostDef[];
export const hazards: HazardDef[] = hazardsJson as HazardDef[];
export const upgrades: UpgradeDef[] = upgradesJson as UpgradeDef[];
export const reviews: ReviewDef[] = reviewsJson as ReviewDef[];
export const hq: HqDef[] = hqJson as HqDef[];
```

- [ ] **Step 9: Extend the content test**

Append to `test/content.test.ts`:

```ts
import { cargo, outposts, hazards, upgrades, reviews, hq } from '../src/content';

describe('content schemas', () => {
  it('cargo: 20 unique ids, sane ranges, tiers 0-3', () => {
    expect(cargo).toHaveLength(20);
    expect(new Set(cargo.map((c) => c.id)).size).toBe(20);
    for (const c of cargo) {
      expect(c.mass).toBeGreaterThan(0); expect(c.mass).toBeLessThanOrEqual(3);
      expect(c.tolerance).toBeGreaterThan(0); expect(c.tolerance).toBeLessThan(1);
      expect(c.crushLimit).toBeGreaterThan(30); expect(c.crushLimit).toBeLessThanOrEqual(100);
      expect(['static', 'slosh', 'livestock', 'precarious']).toContain(c.behavior);
      expect(c.tier).toBeGreaterThanOrEqual(0); expect(c.tier).toBeLessThanOrEqual(3);
      if (c.rush !== undefined) expect(c.rush).toBeGreaterThan(20);
    }
    expect(cargo.filter((c) => c.tier === 0).length).toBeGreaterThanOrEqual(3);
  });
  it('outposts: 12 unique seeds, 3 per tier, lengths ascend with tier', () => {
    expect(outposts).toHaveLength(12);
    expect(new Set(outposts.map((o) => o.seed)).size).toBe(12);
    for (let t = 0; t < 4; t++) expect(outposts.filter((o) => o.tier === t)).toHaveLength(3);
  });
  it('hazards: 5 distinct types with a counter line', () => {
    expect(new Set(hazards.map((h) => h.type)).size).toBe(5);
    for (const h of hazards) { expect(h.counter.length).toBeGreaterThan(10); expect(h.telegraphM).toBeGreaterThan(0); }
  });
  it('upgrades: exactly 6, unique effect keys', () => {
    expect(upgrades).toHaveLength(6);
    expect(new Set(upgrades.map((u) => u.effect.key)).size).toBe(6);
  });
  it('reviews cover every star with an "any" entry; hq covers every context', () => {
    for (const s of [1, 2, 3, 4, 5]) expect(reviews.some((r) => r.stars === s && r.behavior === 'any' && r.lines.length > 0)).toBe(true);
    for (const c of ['dispatch', 'arrival', 'spill', 'stall']) expect(hq.some((h) => h.context === c && h.behavior === 'any')).toBe(true);
  });
});
```

- [ ] **Step 10: Run and commit**

Run: `pnpm vitest run test/content.test.ts && pnpm typecheck`
Expected: all pass.

```bash
git add src/content src/sim/types.ts test/content.test.ts
git commit -m "content: 20 cargo, 12 outposts, 5 hazards, 6 upgrades, reviews, HQ lines

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 19: step() v2 — strap, brace, hazards, RECOVER, auto-trim

**Files:**
- Modify: `src/sim/step.ts`, `src/sim/types.ts` (`Tuning.braceSpeed`), `src/content/tuning.json` (`"braceSpeed": 2`)
- Test: `test/hazards.test.ts`

**Interfaces:**
- `step` now honours `input.strap`, `input.brace`, `input.recover`; crosses `route.hazards` via `s.hazardCursor`; applies `hazardGaitScale[gait]`, `strapJoltMul`, `autoTrim`.
- **Spec amendment:** braced rig creeps at `braceSpeed` m/s instead of 0 — a zero-speed brace can never cross the hazard it is bracing for (bot deadlock, and a human would have to release brace exactly on the hazard). Record in DEVLOG and spec.
- Trace cancellation: a `plank` trace within 5 m of a `gap` absorbs it (M3 adds rope/sign/drum).

- [ ] **Step 1: Tuning key**

Add `braceSpeed: number;` to `Tuning` (after `braceDamp`) and `"braceSpeed": 3,` to `tuning.json`.

- [ ] **Step 2: Write the failing tests**

```ts
// test/hazards.test.ts
import { describe, it, expect } from 'vitest';
import { createRun, step, drainRate } from '../src/sim/step';
import { routeFromSegments } from '../src/sim/terrain';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, crateDef, frame } from './helpers';
import type { HazardInstance, Trace } from '../src/sim/types';

const hz = (over: Partial<HazardInstance>): HazardInstance => ({ id: 0, type: 'gust', x: 100, impulse: 0.9, strapJolt: 12, dir: 1, ...over });
const hzRoute = (h: HazardInstance[]) => routeFromSegments(9, [{ x0: 0, x1: 400, slope: 0, y0: 0 }], h, 10);

function runUntil(route: ReturnType<typeof flatRoute>, input: ReturnType<typeof frame>, xTarget: number, loadout = [{ def: crateDef(), slot: 1 }]) {
  const s = createRun(route, loadout, tuning); const rng = mulberry32(1);
  while (s.x < xTarget && !s.ended) step(s, input, route, [], tuning, rng);
  return s;
}

describe('strap and brace', () => {
  it('strap tap adds strapTap, capped at 100', () => {
    const r = flatRoute(); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    step(s, frame({ strap: true }), r, [], tuning, rng);
    expect(s.strap).toBe(Math.min(100, tuning.strapStart + tuning.strapTap));
    for (let i = 0; i < 10; i++) step(s, frame({ strap: true }), r, [], tuning, rng);
    expect(s.strap).toBe(100);
  });
  it('brace creeps at braceSpeed, drains extra reserve, damps tiltVel', () => {
    const r = flatRoute(); const s = createRun(r, [], tuning); const rng = mulberry32(1);
    s.tiltVel = 1;
    step(s, frame({ gait: 4, brace: true }), r, [], tuning, rng);
    expect(s.braced).toBe(true);
    expect(s.x).toBeCloseTo(tuning.braceSpeed * tuning.dt);
    expect(s.reserve).toBeCloseTo(tuning.reserveStart - (drainRate(r, tuning) + tuning.braceDrain) * tuning.dt);
    expect(Math.abs(s.tiltVel)).toBeLessThan(1);
  });
});

describe('hazards', () => {
  it('gust adds impulse to tiltVel and loosens straps, exactly once', () => {
    const r = hzRoute([hz({})]);
    const s = runUntil(r, frame({ gait: 2 }), 101);
    expect(s.strap).toBeCloseTo(tuning.strapStart - 12 * tuning.strapJoltMul);
    expect(s.hazardCursor).toBe(1);
    const before = s.strap;
    for (let i = 0; i < 60; i++) step(s, frame({ gait: 2 }), r, [], tuning, mulberry32(1));
    expect(s.strap).toBe(before);
  });
  it('bracing absorbs the hazard', () => {
    const r = hzRoute([hz({})]);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (s.x < 95) step(s, frame({ gait: 2 }), r, [], tuning, rng);
    while (s.x < 101) step(s, frame({ gait: 2, brace: true }), r, [], tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
    expect(s.hazardCursor).toBe(1);
    expect(s.ended).toBeNull();
  });
  it('impulse scales with gait', () => {
    const r = hzRoute([hz({ x: 60 })]);
    const peak = (g: 1 | 4) => { const s = createRun(r, [], tuning); const rng = mulberry32(1); let p = 0; while (s.x < 60) step(s, frame({ gait: g }), r, [], tuning, rng); step(s, frame({ gait: g }), r, [], tuning, rng); p = Math.abs(s.tiltVel); return p; };
    expect(peak(4)).toBeGreaterThan(peak(1) * 1.5);
  });
  it('grade hazards have no impulse', () => {
    const r = hzRoute([hz({ type: 'grade', impulse: 0, strapJolt: 0 })]);
    const s = runUntil(r, frame({ gait: 2 }), 101);
    expect(s.strap).toBe(tuning.strapStart); expect(s.tiltVel).toBe(0);
  });
  it('a plank trace absorbs a gap', () => {
    const r = hzRoute([hz({ type: 'gap', impulse: 1.4, strapJolt: 20 })]);
    const traces: Trace[] = [{ id: 't1', seed: r.seed, x: 102, type: 'plank', ownerName: 'x', useCount: 0, ageHours: 1 }];
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (s.x < 101) step(s, frame({ gait: 2 }), r, traces, tuning, rng);
    expect(s.strap).toBe(tuning.strapStart);
  });
});

describe('recover', () => {
  it('freezes the rig for recoverTicks, then returns the item with extra stress', () => {
    const r = slopeRoute(0.5, 5000);
    const s = createRun(r, [{ def: crateDef(), slot: 1 }], tuning); const rng = mulberry32(1);
    while (!s.items[0]!.lost) step(s, frame({ gait: 1 }), r, [], tuning, rng);
    expect(s.ended).toBe('spilled');                  // single-item spill ends the run; RECOVER is still accepted in that state
    const stressBefore = s.items[0]!.stress; const reserveBefore = s.reserve; const xBefore = s.x;
    step(s, frame({ recover: true, ballast: -60 }), r, [], tuning, rng);
    expect(s.ended).toBeNull();
    expect(s.recovering).toBe(tuning.recoverTicks);
    expect(s.reserve).toBeCloseTo(reserveBefore - tuning.recoverCost);
    for (let i = 0; i < tuning.recoverTicks; i++) step(s, frame({ ballast: -60 }), r, [], tuning, rng);
    expect(s.recovering).toBe(0);
    expect(s.items[0]!.lost).toBe(false);
    expect(s.items[0]!.stress).toBeCloseTo(stressBefore + tuning.recoverStress);
    expect(s.x).toBe(xBefore);
  });
});

describe('autoTrim', () => {
  it('reduces uncountered tilt on a slope', () => {
    const r = slopeRoute(0.3, 5000);
    const eq = (autoTrim: number) => { const t = { ...tuning, autoTrim }; const s = createRun(r, [], t); const rng = mulberry32(1); for (let i = 0; i < 1200; i++) step(s, frame({ gait: 1 }), r, [], t, rng); return Math.abs(s.tilt); };
    expect(eq(0.3)).toBeLessThan(eq(0) * 0.8);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run test/hazards.test.ts`
Expected: FAIL across the board (strap, brace, hazards, recover unimplemented).

- [ ] **Step 4: Implement**

Replace `stepRig`, `stepEvents`, `step` in `src/sim/step.ts`:

```ts
export function stepRig(s: RigState, input: InputFrame, route: RouteDef, tuning: Tuning): void {
  const dt = tuning.dt;
  s.gait = input.gait;
  s.ballast = clamp(Math.round(input.ballast), -tuning.ballastRange, tuning.ballastRange);
  s.braced = input.brace;
  if (input.strap) s.strap = Math.min(100, s.strap + tuning.strapTap);

  const slope = route.slopeAt(s.x);
  const load = loadOffsetOf(s.items, tuning);
  const ideal = -(tuning.kSlope * slope + tuning.kLoad * load) / tuning.kBallast * 100;
  const effBallast = s.ballast + tuning.autoTrim * (ideal - s.ballast);
  const torque = tuning.kSlope * slope + tuning.kBallast * (effBallast / 100) + tuning.kLoad * load;
  const acc = torque - tuning.damping * s.tiltVel - tuning.stiffness * s.tilt;
  s.tiltVel += acc * dt;
  if (s.braced) s.tiltVel *= tuning.braceDamp;
  s.tilt += s.tiltVel * dt;

  const speed = s.braced ? tuning.braceSpeed : tuning.gaitSpeed[s.gait]! * tuning.gaitSpeedMul;
  s.x += speed * dt;
  s.reserve -= (drainRate(route, tuning) + (s.braced ? tuning.braceDrain : 0)) * dt;
}

function traceCancels(h: HazardInstance, traces: Trace[], route: RouteDef): boolean {
  if (h.type !== 'gap') return false;
  return traces.some((t) => t.seed === route.seed && t.type === 'plank' && Math.abs(t.x - h.x) <= 5);
}

function crossHazards(s: RigState, route: RouteDef, traces: Trace[], tuning: Tuning): void {
  const hz = route.hazards;
  while (s.hazardCursor < hz.length && hz[s.hazardCursor]!.x <= s.x) {
    const h = hz[s.hazardCursor]!;
    s.hazardCursor++;
    if (h.impulse === 0 || s.braced || traceCancels(h, traces, route)) continue;
    s.tiltVel += h.dir * h.impulse * tuning.hazardGaitScale[s.gait]!;
    s.strap = Math.max(0, s.strap - h.strapJolt * tuning.strapJoltMul);
  }
}

export function stepEvents(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  void rng;
  crossHazards(s, route, traces, tuning);
  spillCheck(s, tuning);
  if (input.recover && s.recovering === 0 && s.items.some((it) => it.lost)) {
    s.recovering = tuning.recoverTicks;
    s.reserve -= tuning.recoverCost;
    s.ended = null;
  }
  if (s.ended) return;
  if (s.reserve <= 0) { s.reserve = 0; s.ended = 'stalled'; return; }
  if (s.x >= route.length) { s.x = route.length; s.ended = 'arrived'; }
}

function stepRecovering(s: RigState, tuning: Tuning): void {
  s.recovering--;
  if (s.recovering > 0) return;
  const it = s.items.find((i) => i.lost);
  if (it) { it.lost = false; it.offset = 0; it.offsetVel = 0; it.stress += tuning.recoverStress; }
  s.overTiltTicks = 0;
}

export function step(s: RigState, input: InputFrame, route: RouteDef, traces: Trace[], tuning: Tuning, rng: Rng): void {
  if (s.recovering > 0) { stepRecovering(s, tuning); s.t += 1; return; }
  if (s.ended) {
    // A spilled run stays open for RECOVER; stalled/arrived are final.
    if (s.ended === 'spilled' && input.recover) stepEvents(s, input, route, traces, tuning, rng);
    return;
  }
  stepRig(s, input, route, tuning);
  stepItems(s, tuning, rng);
  stepEvents(s, input, route, traces, tuning, rng);
  s.t += 1;
}
```

Add `HazardInstance` to the type import at the top of `step.ts`.

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm validate`
Expected: all green. `test/step.test.ts` "does nothing once ended" still passes (arrived is final).

- [ ] **Step 6: Commit**

```bash
git add src/sim src/content/tuning.json test/hazards.test.ts
git commit -m "feat(sim): strap, brace (creep), hazard crossing, RECOVER, auto-trim

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 20: Bot v2 and full-content validator

**Files:**
- Modify: `src/sim/bot.ts` (`botPolicy`), `scripts/validate.ts`
- Test: `test/bot.test.ts` (extend)

**Interfaces:**
- `botPolicy` now: braces when a hazard with `impulse > 0` lies in `(x, x + bot.braceAheadM]`, taps strap when `strap < bot.strapBelow`, requests recover when any item is lost; gait 3 cruise, gait 2 within 40 m of an impulse hazard, gait 1 within 40 m of `rubble`/`scree`. Add `Gait` to the type import in `bot.ts`.
- `scripts/validate.ts` reads `outposts`, `hazards`, `cargo` from content; per outpost runs lags `[0, 15, 30]` with loadout `[crate@mid]` and a stress loadout `[soup@fore, crate@aft]` (informational); fails if any outpost is not `arrived` with ≥1★ at `bot.lagTicks` with the crate loadout.

- [ ] **Step 1: Extend the bot tests**

Append to `test/bot.test.ts`:

```ts
import { routeFromSegments } from '../src/sim/terrain';
import { botPolicy } from '../src/sim/bot';
import { outposts, hazards } from '../src/content';

describe('bot v2', () => {
  it('braces ahead of an impulse hazard and not for grades', () => {
    const r = routeFromSegments(3, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [
      { id: 0, type: 'gap', x: 100, impulse: 1.4, strapJolt: 20, dir: 1 },
      { id: 1, type: 'grade', x: 200, impulse: 0, strapJolt: 0, dir: 1 },
    ], 10);
    const v = (x: number) => ({ x, tilt: 0, tiltVel: 0, strap: 80, braced: false, recovering: 0, items: [] });
    expect(botPolicy(v(100 - tuning.bot.braceAheadM + 1), r, tuning).brace).toBe(true);
    expect(botPolicy(v(50), r, tuning).brace).toBe(false);
    expect(botPolicy(v(195), r, tuning).brace).toBe(false);
  });
  it('taps strap when loose and recovers when an item is lost', () => {
    const r = flatRoute();
    const base = { x: 10, tilt: 0, tiltVel: 0, braced: false, recovering: 0 };
    expect(botPolicy({ ...base, strap: 30, items: [] }, r, tuning).strap).toBe(true);
    expect(botPolicy({ ...base, strap: 90, items: [] }, r, tuning).strap).toBe(false);
    const lost = { ...createRun(r, [{ def: crateDef(), slot: 1 }], tuning).items[0]!, lost: true };
    expect(botPolicy({ ...base, strap: 90, items: [lost] }, r, tuning).recover).toBe(true);
  });
  it('survives a gap by bracing', () => {
    const r = routeFromSegments(4, [{ x0: 0, x1: 300, slope: 0, y0: 0 }], [{ id: 0, type: 'gap', x: 150, impulse: 1.4, strapJolt: 20, dir: 1 }], 10);
    const { result } = runHeadless(r, [{ def: crateDef(), slot: 1 }], tuning, { lagTicks: 15 });
    expect(result.ended).toBe('arrived'); expect(result.items[0]!.lost).toBe(false);
  });
  it('every shipped outpost is solvable at bot.lagTicks', () => {
    for (const o of outposts) {
      const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
      const { result } = runHeadless(route, [{ def: crateDef(), slot: 1 }], tuning);
      expect(result.ended, o.name).toBe('arrived');
      expect(result.stars, o.name).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/bot.test.ts`
Expected: the v2 tests FAIL (bot never braces/straps/recovers).

- [ ] **Step 3: Implement `botPolicy` v2**

```ts
export function botPolicy(v: BotView, route: RouteDef, tuning: Tuning): InputFrame {
  const b = tuning.bot;
  let brace = false, slow = false, near = false;
  for (const h of route.hazards) {
    if (h.x <= v.x) continue;
    if (h.x > v.x + 40) break;
    if (h.impulse === 0) continue;
    near = true;
    if (h.x <= v.x + b.braceAheadM) brace = true;
    if (h.type === 'rubble' || h.type === 'scree') slow = true;
  }
  const gait: Gait = slow ? 1 : near ? 2 : 3;   // cruise at 3 to bank reserve; slow into impulse hazards
  const slopeAhead = route.slopeAt(v.x + tuning.gaitSpeed[gait]! * tuning.gaitSpeedMul * b.leadSec);
  const load = loadOffsetOf(v.items, tuning);
  const feedForward = -(tuning.kSlope * slopeAhead + tuning.kLoad * load) / tuning.kBallast * 100;
  const feedback = -b.kp * v.tilt - b.kd * v.tiltVel;
  return {
    gait,
    ballast: clampInt(feedForward + feedback, -tuning.ballastRange, tuning.ballastRange),
    strap: v.strap < b.strapBelow,
    brace,
    deploy: 0,
    recover: v.recovering === 0 && v.items.some((it) => it.lost),
  };
}
```

- [ ] **Step 4: Run**

Run: `pnpm vitest run test/bot.test.ts`
Expected: all pass. If an outpost fails: print its `result` and check whether the failure is a gap without brace (raise `braceAheadM`) or slope (lower that tier's `slopeSigma`). Any tuning change must keep `test/tilt.test.ts` green.

- [ ] **Step 5: Rewrite `scripts/validate.ts` against real content**

```ts
// scripts/validate.ts
import { generateRoute } from '../src/sim/terrain';
import { runHeadless } from '../src/sim/bot';
import { tuning, outposts, hazards, cargo } from '../src/content';
import type { LoadoutItem } from '../src/sim/types';

const byId = (id: string) => cargo.find((c) => c.id === id)!;
const LOADOUTS: Record<string, LoadoutItem[]> = {
  crate: [{ def: byId('crate'), slot: 1 }],
  stress: [{ def: byId('soup'), slot: 0 }, { def: byId('crate'), slot: 2 }],
};
const LAGS = [0, 15, 30];
let failures = 0;
console.log('outpost         tier lag  loadout  ended     stars  reserve');
for (const o of outposts) {
  const route = generateRoute(o.seed, o.lengthM, o.tier, hazards, tuning.terrain);
  for (const [name, loadout] of Object.entries(LOADOUTS)) {
    for (const lag of LAGS) {
      const { state, result } = runHeadless(route, loadout, tuning, { lagTicks: lag });
      const ok = result.ended === 'arrived' && result.stars >= 1;
      if (name === 'crate' && lag === tuning.bot.lagTicks && !ok) failures++;
      console.log(`${o.name.padEnd(15)} ${o.tier}    ${String(lag).padStart(3)}  ${name.padEnd(7)}  ${result.ended.padEnd(8)}  ${result.stars}      ${state.reserve.toFixed(0)}`);
    }
  }
}
console.log(failures === 0 ? `PASS: all ${outposts.length} outposts solvable at lag ${tuning.bot.lagTicks}` : `FAIL: ${failures} outposts unsolvable at lag ${tuning.bot.lagTicks}`);
process.exit(failures === 0 ? 0 : 1);
```

Run: `pnpm validate`
Expected: table of 12 × 2 × 3 rows, `PASS`, exit 0. Paste the pass table into DEVLOG.md under "What AI built" (M2 entry).

- [ ] **Step 6: Commit**

```bash
git add src/sim/bot.ts scripts/validate.ts test/bot.test.ts DEVLOG.md
git commit -m "feat(sim): bot braces/straps/recovers; validator covers all 12 outposts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 21: Upgrades and save

**Files:**
- Create: `src/sim/upgrades.ts`, `src/game/save.ts`
- Test: `test/upgrades.test.ts`, `test/save.test.ts`

**Interfaces:**
- `export function applyUpgrades(base: Tuning, owned: string[], defs: UpgradeDef[]): Tuning` — returns a new object; never mutates `base`.
- `export interface SaveData { v: 1; cash: number; runs: number; upgrades: string[]; bestByOutpost: Record<string, number>; traces: Trace[] }`
- `export function defaultSave(): SaveData`, `export function loadSave(storage: StorageLike): { data: SaveData; reset: boolean }`, `export function writeSave(storage: StorageLike, data: SaveData): void`, `export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`. Key: `deadweight.save`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/upgrades.test.ts
import { describe, it, expect } from 'vitest';
import { applyUpgrades } from '../src/sim/upgrades';
import { tuning, upgrades } from '../src/content';

describe('applyUpgrades', () => {
  it('returns base values when nothing is owned', () => {
    const t = applyUpgrades(tuning, [], upgrades);
    expect(t).toEqual(tuning); expect(t).not.toBe(tuning);
  });
  it('applies each effect key without mutating base', () => {
    const t = applyUpgrades(tuning, ['wide-trim', 'bay', 'stride'], upgrades);
    expect(t.ballastRange).toBe(130); expect(t.capacity).toBe(3); expect(t.gaitSpeedMul).toBe(1.2);
    expect(tuning.ballastRange).toBe(100);
  });
  it('ignores unknown ids', () => {
    expect(applyUpgrades(tuning, ['nope'], upgrades)).toEqual(tuning);
  });
});
```

```ts
// test/save.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSave, loadSave, writeSave, type StorageLike } from '../src/game/save';

function mem(): StorageLike & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

describe('save', () => {
  it('round-trips', () => {
    const s = mem(); const d = defaultSave(); d.cash = 420; d.upgrades.push('bay');
    writeSave(s, d);
    const { data, reset } = loadSave(s);
    expect(reset).toBe(false); expect(data).toEqual(d);
  });
  it('returns defaults with reset=true on missing, corrupt, or old-version data', () => {
    expect(loadSave(mem())).toEqual({ data: defaultSave(), reset: false });
    const bad = mem(); bad.setItem('deadweight.save', '{not json');
    expect(loadSave(bad).reset).toBe(true);
    const old = mem(); old.setItem('deadweight.save', JSON.stringify({ v: 0, cash: 9 }));
    const r = loadSave(old); expect(r.reset).toBe(true); expect(r.data.cash).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/upgrades.test.ts test/save.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/sim/upgrades.ts
import type { Tuning, UpgradeDef } from './types';

export function applyUpgrades(base: Tuning, owned: string[], defs: UpgradeDef[]): Tuning {
  const t: Tuning = { ...base, gaitSpeed: [...base.gaitSpeed], starBuckets: [...base.starBuckets], slotPos: [...base.slotPos], hazardGaitScale: [...base.hazardGaitScale], terrain: { ...base.terrain, slopeSigma: [...base.terrain.slopeSigma] }, bot: { ...base.bot } };
  for (const id of owned) {
    const d = defs.find((u) => u.id === id);
    if (d) t[d.effect.key] = d.effect.value;
  }
  return t;
}
```

```ts
// src/game/save.ts
import type { Trace } from '../sim/types';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface SaveData { v: 1; cash: number; runs: number; upgrades: string[]; bestByOutpost: Record<string, number>; traces: Trace[] }
const KEY = 'deadweight.save';

export function defaultSave(): SaveData { return { v: 1, cash: 0, runs: 0, upgrades: [], bestByOutpost: {}, traces: [] }; }

export function loadSave(storage: StorageLike): { data: SaveData; reset: boolean } {
  const raw = storage.getItem(KEY);
  if (raw === null) return { data: defaultSave(), reset: false };
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.v !== 1 || typeof parsed.cash !== 'number' || !Array.isArray(parsed.upgrades)) throw new Error('version');
    return { data: { ...defaultSave(), ...parsed, v: 1 }, reset: false };
  } catch {
    storage.removeItem(KEY);
    return { data: defaultSave(), reset: true };
  }
}

export function writeSave(storage: StorageLike, data: SaveData): void { storage.setItem(KEY, JSON.stringify(data)); }
```

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run test/upgrades.test.ts test/save.test.ts && pnpm lint && pnpm typecheck`
Expected: 5 pass.

```bash
git add src/sim/upgrades.ts src/game/save.ts test/upgrades.test.ts test/save.test.ts
git commit -m "feat: upgrades as tuning overrides; versioned localStorage save

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 22: Orders, review/HQ pickers, Flow state machine

**Files:**
- Create: `src/game/orders.ts`, `src/game/reviews.ts`
- Modify: `src/game/flow.ts` (full state machine), `src/sim/step.ts` (add `predictTrim`), `src/ui/screens/result.ts` (button label param), `src/main.ts`
- Test: `test/orders.test.ts`

**Interfaces:**
- `export function playerTier(runs: number): number` — `min(3, floor(runs / 3))`.
- `export interface Offers { outpost: OutpostDef; cargo: ItemDef[] }`; `export function generateOffers(outposts: OutpostDef[], cargo: ItemDef[], runs: number, rng: Rng): Offers` — outpost = eligible (tier ≤ playerTier) rotated by `runs`; 3 distinct cargo with tier ≤ playerTier.
- `export function pickReview(defs: ReviewDef[], stars: number, behavior: Behavior | 'any', rng: Rng): string`; `export function pickHq(defs: HqDef[], context: HqDef['context'], behavior: Behavior | 'any', rng: Rng): string`.
- `export function predictTrim(loadout: LoadoutItem[], tuning: Tuning): number` (in `step.ts`) — integer ballast that neutralises the load: `round(-(kLoad · Σm·slotPos/Σm) / kBallast · 100)`.
- `renderResult(el, result, items, onNext, review = '', label = 'CONTINUE')`.
- `Flow` deps become `{ viewportEl, panel, screenEl, input, renderer, baseTuning, content, storage }` where `content = { cargo, outposts, hazards, upgrades, reviews, hq }` and `storage: StorageLike`. Public: `start()`. Phases: dispatch → load → haul → review → upgrade → dispatch. Screens from Task 23 are imported here; write Task 23 immediately after — the build is red between them, which is acceptable inside one commit pair but **do not push** until Task 23 is done.

- [ ] **Step 1: Write the failing tests**

```ts
// test/orders.test.ts
import { describe, it, expect } from 'vitest';
import { generateOffers, playerTier } from '../src/game/orders';
import { pickReview, pickHq } from '../src/game/reviews';
import { predictTrim } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { cargo, outposts, reviews, hq, tuning } from '../src/content';
import { crateDef } from './helpers';

describe('playerTier', () => {
  it('steps every 3 runs, caps at 3', () => {
    expect(playerTier(0)).toBe(0); expect(playerTier(2)).toBe(0); expect(playerTier(3)).toBe(1); expect(playerTier(9)).toBe(3); expect(playerTier(40)).toBe(3);
  });
});

describe('generateOffers', () => {
  it('offers 3 distinct cargo within tier and rotates outposts within tier', () => {
    const a = generateOffers(outposts, cargo, 0, mulberry32(1));
    const b = generateOffers(outposts, cargo, 1, mulberry32(1));
    expect(a.cargo).toHaveLength(3);
    expect(new Set(a.cargo.map((c) => c.id)).size).toBe(3);
    for (const c of a.cargo) expect(c.tier).toBe(0);
    expect(a.outpost.tier).toBe(0);
    expect(a.outpost.id).not.toBe(b.outpost.id);
  });
  it('is deterministic for a given rng', () => {
    expect(generateOffers(outposts, cargo, 5, mulberry32(9))).toEqual(generateOffers(outposts, cargo, 5, mulberry32(9)));
  });
  it('unlocks higher tiers with runs', () => {
    const o = generateOffers(outposts, cargo, 11, mulberry32(2));
    expect(o.outpost.tier).toBeLessThanOrEqual(3);
    const seen = new Set<number>();
    for (let r = 9; r < 21; r++) seen.add(generateOffers(outposts, cargo, r, mulberry32(r)).outpost.tier);
    expect(seen.has(3)).toBe(true);
  });
});

describe('pickers', () => {
  it('review comes from the right star bucket', () => {
    for (let i = 0; i < 20; i++) {
      const line = pickReview(reviews, 5, 'slosh', mulberry32(i));
      const ok = reviews.filter((r) => r.stars === 5).some((r) => r.lines.includes(line));
      expect(ok).toBe(true);
    }
  });
  it('hq line matches context', () => {
    const line = pickHq(hq, 'spill', 'any', mulberry32(3));
    expect(hq.find((h) => h.context === 'spill')!.lines).toContain(line);
  });
});

describe('predictTrim', () => {
  it('is 0 for balanced fore/aft and positive for a fore-only load', () => {
    expect(predictTrim([{ def: crateDef(), slot: 0 }, { def: crateDef({ id: 'b' }), slot: 2 }], tuning)).toBe(0);
    expect(predictTrim([{ def: crateDef(), slot: 0 }], tuning)).toBe(Math.round(tuning.kLoad / tuning.kBallast * 100));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run test/orders.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement orders, pickers, predictTrim**

```ts
// src/game/orders.ts
import type { ItemDef, OutpostDef } from '../sim/types';
import type { Rng } from '../sim/rng';

export interface Offers { outpost: OutpostDef; cargo: ItemDef[] }

export function playerTier(runs: number): number { return Math.min(3, Math.floor(runs / 3)); }

export function generateOffers(outposts: OutpostDef[], cargo: ItemDef[], runs: number, rng: Rng): Offers {
  const tier = playerTier(runs);
  const eligible = outposts.filter((o) => o.tier <= tier);
  const outpost = eligible[runs % eligible.length]!;
  const bag = cargo.filter((c) => c.tier <= tier);
  const picks: ItemDef[] = [];
  while (picks.length < 3 && bag.length > 0) picks.push(bag.splice(rng.int(bag.length), 1)[0]!);
  return { outpost, cargo: picks };
}
```

```ts
// src/game/reviews.ts
import type { Behavior, HqDef, ReviewDef } from '../sim/types';
import type { Rng } from '../sim/rng';

function choose<T extends { behavior: Behavior | 'any'; lines: string[] }>(pool: T[], behavior: Behavior | 'any', rng: Rng): string {
  const specific = pool.find((d) => d.behavior === behavior);
  const generic = pool.find((d) => d.behavior === 'any');
  const use = specific && rng.next() < 0.6 ? specific : generic ?? specific;
  const lines = use?.lines ?? ['No comment.'];
  return lines[rng.int(lines.length)]!;
}

export function pickReview(defs: ReviewDef[], stars: number, behavior: Behavior | 'any', rng: Rng): string {
  return choose(defs.filter((d) => d.stars === stars), behavior, rng);
}
export function pickHq(defs: HqDef[], context: HqDef['context'], behavior: Behavior | 'any', rng: Rng): string {
  return choose(defs.filter((d) => d.context === context), behavior, rng);
}
```

Add to `src/sim/step.ts`:

```ts
export function predictTrim(loadout: LoadoutItem[], tuning: Tuning): number {
  let m = 0, sum = 0;
  for (const l of loadout) { m += l.def.mass; sum += l.def.mass * tuning.slotPos[l.slot]!; }
  const load = m > 0 ? sum / m : 0;
  return Math.round(-(tuning.kLoad * load) / tuning.kBallast * 100);
}
```

- [ ] **Step 4: Run**

Run: `pnpm vitest run test/orders.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Result button label**

In `src/ui/screens/result.ts` change the signature to `renderResult(el, result, items, onNext: () => void, review = '', label = 'CONTINUE')` and the button markup to `<button class="big primary">${label}</button>`; call `onNext` on click.

- [ ] **Step 6: Rewrite `src/game/flow.ts` as the full state machine**

```ts
// src/game/flow.ts
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
import type { Renderer, RenderPrev } from '../render/Renderer';
import type { Panel } from '../ui/panel/panel';
import type { InputController } from '../ui/input';
import type { HazardDef, HazardType, HqDef, ItemDef, LoadoutItem, OutpostDef, ReviewDef, RigState, RouteDef, RunResult, Tuning, UpgradeDef } from '../sim/types';

export interface Content { cargo: ItemDef[]; outposts: OutpostDef[]; hazards: HazardDef[]; upgrades: UpgradeDef[]; reviews: ReviewDef[]; hq: HqDef[] }
export interface FlowDeps {
  viewportEl: HTMLElement; panel: Panel; screenEl: HTMLElement; input: InputController;
  renderer: Promise<Renderer>; baseTuning: Tuning; content: Content; storage: StorageLike;
}

const LINGER: Record<NonNullable<RigState['ended']>, number> = { arrived: 60, stalled: 90, spilled: 300 };

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

  constructor(private readonly d: FlowDeps) {
    const { data, reset } = loadSave(d.storage);
    this.save = data;
    this.tuning = applyUpgrades(d.baseTuning, data.upgrades, d.content.upgrades);
    this.telegraph = Object.fromEntries(d.content.hazards.map((h) => [h.type, h.telegraphM])) as Record<HazardType, number>;
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
    const prev: RenderPrev = { x: 0, tilt: 0 };
    input.setGait(2); panel.setGait(2);
    panel.setMessage(`HQ: ${this.offers!.outpost.name}. ${loadout.length} aboard. Trim against the slope. Go.`);
    const defs = loadout.map((l) => l.def);
    const attach = (r: Renderer): void => { r.setLoadout(defs); r.setRoute(route); };
    if (this.renderer) attach(this.renderer); else d.renderer.then(attach);

    let linger = 0;
    const loop = new GameLoop({
      dt: tuning.dt,
      sampleInput: () => input.sample(),
      step: (inp) => {
        prev.x = state.x; prev.tilt = state.tilt;
        step(state, inp, route, this.save.traces, tuning, rng);
        if (state.ended) { if (++linger > LINGER[state.ended]) this.finish(state, loop); } else linger = 0;
      },
      render: (alpha) => {
        this.renderer?.draw(state, prev, alpha);
        panel.update(state, tuning);
        panel.setHazard(route.hazards.some((h) => h.impulse > 0 && h.x > state.x && h.x <= state.x + this.telegraph[h.type]));
      },
    });
    this.loop = loop;
    loop.start();
  }

  private finish(state: RigState, loop: GameLoop): void {
    loop.stop();
    const result = evaluate(state, this.tuning);
    this.review(result, state);
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

- [ ] **Step 7: Rewrite `src/main.ts`**

```ts
// src/main.ts
import './ui/panel/panel.css';
import './ui/screens/screens.css';
import { tuning, cargo, outposts, hazards, upgrades, reviews, hq } from './content';
import { Panel } from './ui/panel/panel';
import { InputController } from './ui/input';
import { Flow } from './game/flow';
import type { Renderer } from './render/Renderer';

const viewportEl = document.getElementById('viewport')!;
const panelEl = document.getElementById('panel')!;
const screenEl = document.getElementById('screen')!;

const input = new InputController(tuning);
input.attach(viewportEl, document);
const panel = new Panel(panelEl, {
  onGait: (g) => input.setGait(g),
  onStrap: () => input.queueStrap(),
  onBrace: (on) => input.setBrace(on),
  onRecover: () => input.queueRecover(),
});
const renderer: Promise<Renderer> = import('./render/three/ThreeRenderer').then(({ ThreeRenderer }) => {
  const r = new ThreeRenderer(); r.mount(viewportEl);
  window.addEventListener('resize', () => r.resize());
  return r;
});
const flow = new Flow({ viewportEl, panel, screenEl, input, renderer, baseTuning: tuning, content: { cargo, outposts, hazards, upgrades, reviews, hq }, storage: localStorage });
flow.start();
```

- [ ] **Step 8: Typecheck (expected red until Task 23), run sim tests**

Run: `pnpm vitest run test/orders.test.ts test/step.test.ts`
Expected: pass. `pnpm typecheck` fails only on the missing `ui/screens/dispatch|loadout|upgrade` modules — proceed straight to Task 23.

- [ ] **Step 9: Commit (local only)**

```bash
git add src/game src/sim/step.ts src/ui/screens/result.ts src/main.ts test/orders.test.ts
git commit -m "feat(game): orders, review/HQ pickers, full flow state machine

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 23: Screens — dispatch, loadout, upgrade, slope profile

**Files:**
- Create: `src/ui/profile.ts`, `src/ui/screens/dispatch.ts`, `src/ui/screens/loadout.ts`, `src/ui/screens/upgrade.ts`
- Modify: `src/ui/screens/screens.css`

**Interfaces:**
- `export function slopeProfileSvg(profile: number[], stepM: number, w?: number, h?: number): string`
- `export interface DispatchProps { offers: Offers; profile: number[]; profileStepM: number; hqLine: string; capacity: number; cash: number; tier: number; traceCount: number }`; `export function renderDispatch(el: HTMLElement, p: DispatchProps, onLoad: (selected: ItemDef[]) => void): void`
- `export function renderLoadout(el: HTMLElement, p: { items: ItemDef[]; tuning: Tuning }, onHaul: (loadout: LoadoutItem[]) => void): void`
- `export function renderUpgrade(el: HTMLElement, p: { defs: UpgradeDef[]; save: SaveData }, h: { onBuy(id: string): void; onDone(): void }): void`

- [ ] **Step 1: Profile strip**

```ts
// src/ui/profile.ts
export function slopeProfileSvg(profile: number[], stepM: number, w = 480, h = 64): string {
  const hs: number[] = [0];
  for (let i = 1; i < profile.length; i++) hs.push(hs[i - 1]! + profile[i - 1]! * stepM);
  const min = Math.min(...hs), max = Math.max(...hs), span = Math.max(1, max - min);
  const pts = hs.map((y, i) => `${((i / Math.max(1, hs.length - 1)) * w).toFixed(1)},${(h - 6 - ((y - min) / span) * (h - 12)).toFixed(1)}`).join(' ');
  return `<svg class="profile" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Route slope profile"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>`;
}
```

- [ ] **Step 2: Dispatch screen**

```ts
// src/ui/screens/dispatch.ts
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

- [ ] **Step 3: Loadout screen**

```ts
// src/ui/screens/loadout.ts
import type { ItemDef, LoadoutItem, Tuning } from '../../sim/types';
import { predictTrim } from '../../sim/step';

const SLOT_NAMES = ['FORE', 'MID', 'AFT'];

export function renderLoadout(el: HTMLElement, p: { items: ItemDef[]; tuning: Tuning }, onHaul: (loadout: LoadoutItem[]) => void): void {
  const slots = p.tuning.capacity >= 3 ? [0, 1, 2] : [0, 2];
  const assign = new Map<string, number>();
  p.items.forEach((it, i) => assign.set(it.id, slots[i]!));
  const loadout = (): LoadoutItem[] => p.items.map((def) => ({ def, slot: assign.get(def.id)! }));

  const draw = (): void => {
    const trim = predictTrim(loadout(), p.tuning);
    el.innerHTML = `
      <div class="screen loadout">
        <h2>LOAD BAYS</h2>
        <ul class="bays">${p.items.map((it) => `
          <li data-id="${it.id}"><b>${it.name}</b><span class="meta">${it.mass.toFixed(1)} t</span>
            <div class="slots">${slots.map((s) => `<button data-slot="${s}" class="${assign.get(it.id) === s ? 'on' : ''}">${SLOT_NAMES[s]}</button>`).join('')}</div>
          </li>`).join('')}
        </ul>
        <div class="trim">PREDICTED NEUTRAL TRIM <b>${trim > 0 ? '+' : ''}${trim}</b><span class="hint">${trim === 0 ? 'balanced' : trim > 0 ? 'nose-heavy — dial aft' : 'tail-heavy — dial fore'}</span></div>
        <button class="big primary">HAUL</button>
      </div>`;
    el.hidden = false;
    for (const b of el.querySelectorAll<HTMLButtonElement>('.slots button')) {
      b.addEventListener('pointerdown', () => {
        const id = b.closest<HTMLLIElement>('li')!.dataset.id!;
        const target = Number(b.dataset.slot);
        const holder = [...assign.entries()].find(([, s]) => s === target)?.[0];
        if (holder && holder !== id) assign.set(holder, assign.get(id)!);
        assign.set(id, target);
        draw();
      });
    }
    el.querySelector<HTMLButtonElement>('button.primary')!.addEventListener('pointerdown', () => { el.hidden = true; onHaul(loadout()); });
  };
  draw();
}
```

- [ ] **Step 4: Upgrade screen**

```ts
// src/ui/screens/upgrade.ts
import type { UpgradeDef } from '../../sim/types';
import type { SaveData } from '../../game/save';

export function renderUpgrade(el: HTMLElement, p: { defs: UpgradeDef[]; save: SaveData }, h: { onBuy(id: string): void; onDone(): void }): void {
  const draw = (): void => {
    el.innerHTML = `
      <div class="screen upgrade">
        <h2>WORKSHOP</h2>
        <div class="ledger">LEDGER <b>${p.save.cash}</b></div>
        <div class="grid">${p.defs.map((d) => {
          const owned = p.save.upgrades.includes(d.id); const afford = p.save.cash >= d.cost;
          return `<button class="tile ${owned ? 'owned' : afford ? '' : 'locked'}" data-id="${d.id}" ${owned || !afford ? 'disabled' : ''}>
            <b>${d.name}</b><span>${d.blurb}</span><em>${owned ? 'INSTALLED' : `${d.cost}`}</em></button>`;
        }).join('')}</div>
        <button class="big primary done">DISPATCH</button>
      </div>`;
    el.hidden = false;
    for (const t of el.querySelectorAll<HTMLButtonElement>('.tile')) t.addEventListener('pointerdown', () => { h.onBuy(t.dataset.id!); draw(); });
    el.querySelector<HTMLButtonElement>('.done')!.addEventListener('pointerdown', () => { el.hidden = true; h.onDone(); });
  };
  draw();
}
```

- [ ] **Step 5: Screen CSS**

Append to `src/ui/screens/screens.css`:

```css
.tele-block { margin: 0 0 10px; font: 12px/1.4 ui-monospace, Menlo, monospace; background: #15171a; color: #f4ead2; padding: 10px; border-radius: 4px; white-space: pre-wrap; }
.profile { display: block; width: 100%; height: 56px; color: var(--orange); background: #f4ecd8; border: 2px solid var(--gun); border-radius: 4px; margin-bottom: 10px; }
.offers li, .bays li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; padding: 10px 8px; border: 3px solid var(--gun); border-radius: 6px; margin-bottom: 8px; background: #f4ecd8; cursor: pointer; }
.offers li.on { background: var(--orange); color: var(--ink); }
.offers .meta, .bays .meta { grid-column: 1; font-size: 11px; opacity: .75; letter-spacing: .06em; }
.offers .pay { grid-column: 2; grid-row: 1 / span 2; font-size: 20px; }
.bays .slots { grid-column: 1 / span 2; display: flex; gap: 6px; margin-top: 6px; }
.bays .slots button { flex: 1; font: inherit; font-size: 12px; padding: 8px 0; background: #e8dcc0; border: 2px solid var(--gun); border-radius: 4px; }
.bays .slots button.on { background: var(--gun); color: var(--cream); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; } .row .cap { font-size: 12px; letter-spacing: .1em; } .row button { flex: 1; }
.trim { font-size: 13px; margin: 8px 0 12px; } .trim b { font-size: 18px; margin-left: 8px; } .trim .hint { display: block; font-size: 11px; opacity: .7; margin-top: 2px; }
.ledger { font-size: 13px; margin-bottom: 10px; }
.upgrade .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.tile { display: flex; flex-direction: column; gap: 4px; text-align: left; font: inherit; font-size: 11px; padding: 10px 8px; background: #f4ecd8; border: 3px solid var(--gun); border-radius: 6px; min-height: 110px; }
.tile b { font-size: 12px; } .tile span { font-family: Georgia, serif; font-weight: normal; opacity: .8; } .tile em { margin-top: auto; font-style: normal; color: var(--orange); }
.tile.owned { background: var(--gun); color: var(--cream); } .tile.owned em { color: var(--cream); }
.tile.locked { opacity: .5; filter: grayscale(.6); }
@media (max-width: 480px) { .upgrade .grid { grid-template-columns: repeat(2, 1fr); } }
```

- [ ] **Step 6: Typecheck, lint, playtest the loop**

Run: `pnpm typecheck && pnpm lint && pnpm test`, then `pnpm dev`.
Expected: dispatch shows Gravel Hollow, profile strip, 3 offers; select up to 2; loadout lets you swap FORE/AFT and the trim readout changes; haul; result with a review line and CONTINUE; workshop shows 6 tiles with at least one locked; DISPATCH returns to a new outpost (Wren Station). Reload page: cash persists.

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat(ui): dispatch, loadout, and workshop screens with slope profile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 24: Panel v2 — strap, brace, recover, hazard lamp, rush timer; hazard rendering

**Files:**
- Modify: `src/ui/panel/panel.ts`, `src/ui/panel/panel.css`, `src/render/three/terrain.ts`, `src/render/three/ThreeRenderer.ts`
- Create: `src/render/three/hazards.ts`

**Interfaces:**
- `Panel.update` now shows a `RUSH <ID> <s>s` line and enables RECOVER while `ended === 'spilled'` or during a multi-item run with a lost item.
- `export function buildHazards(route: RouteDef): THREE.Group` — rocks for `rubble`/`scree`, a dust curtain for `gust`, a dark slab under `gap`. `buildTerrain` cuts a trench at each `gap`.

- [ ] **Step 1: Reveal M2 controls**

In `panel.css` delete the line `.m2 { display: none; }`. Add:

```css
.rush { grid-area: tele; align-self: start; justify-self: end; margin: 4px 6px; font-size: 10px; letter-spacing: .1em; color: var(--red); pointer-events: none; }
```

In `panel.ts` add `<div class="rush"></div>` after the `<pre class="tele"></pre>` line, a field `private rush!: HTMLElement;`, assign `this.rush = q('.rush');`, and replace the RECOVER line and add rush text in `update()`:

```ts
    const lost = s.items.some((it) => it.lost);
    this.recoverBtn.disabled = !(lost && s.recovering === 0 && (s.ended === null || s.ended === 'spilled'));
    const rushItems = s.items.filter((it) => it.deadlineTick >= 0 && !it.lost);
    this.rush.textContent = rushItems.map((it) => `RUSH ${it.id.toUpperCase()} ${Math.max(0, Math.ceil((it.deadlineTick - s.t) * tuning.dt))}s`).join('  ');
```

- [ ] **Step 2: Hazard meshes**

```ts
// src/render/three/hazards.ts
import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';

export function buildHazards(route: RouteDef): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.IcosahedronGeometry(0.5, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: '#6b6258', flatShading: true });
  const dustMat = new THREE.MeshBasicMaterial({ color: '#f0dcb0', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const slabMat = new THREE.MeshLambertMaterial({ color: '#1c1a16' });
  for (const h of route.hazards) {
    const y = route.heightAt(h.x);
    if (h.type === 'rubble' || h.type === 'scree') {
      const n = h.type === 'rubble' ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(rock, rockMat);
        const s = h.type === 'rubble' ? 0.8 + Math.random() * 0.8 : 0.3 + Math.random() * 0.3;
        m.scale.setScalar(s);
        m.position.set(h.x + (Math.random() - 0.5) * 4, route.heightAt(h.x) + s * 0.3, (Math.random() - 0.5) * 5);
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.add(m);
      }
    } else if (h.type === 'gust') {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 7), dustMat);
        m.position.set(h.x - 3 + i * 2, y + 3.5, 0);
        m.rotation.y = Math.PI / 2;
        g.add(m);
      }
    } else if (h.type === 'gap') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 26), slabMat);
      m.position.set(h.x, y - 5, 0);
      g.add(m);
    }
  }
  return g;
}
```

In `terrain.ts` `buildTerrain`, after computing `rough`, add:

```ts
    let drop = 0;
    for (const h of route.hazards) if (h.type === 'gap' && Math.abs(x - h.x) < 1.5) drop = 5;
    pos.setY(i, route.heightAt(x) + rough - edge * 0.6 - drop);
```

(replace the existing `pos.setY` line).

In `ThreeRenderer.ts`: add `private hazardGroup: THREE.Group | null = null;`; in `setRoute`, after adding the terrain: `if (this.hazardGroup) this.scene.remove(this.hazardGroup); this.hazardGroup = buildHazards(route); this.scene.add(this.hazardGroup);` and import `buildHazards`.

- [ ] **Step 3: Playtest**

Run: `pnpm dev`. Play Marrow Flats (tier 1, run ≥ 3 — or temporarily set `runs` in localStorage to 3).
Expected: rocks visible ahead; HAZARD lamp blinks within telegraph range; hitting rubble at gait 4 visibly loosens the strap bar; STRAP tap refills it; holding BRACE creeps and damps the needle; a gap without brace throws cargo; RECOVER enables after a spill and returns the item after ~8 s; rush cargo shows a countdown; keyboard Space/Shift/R work.

- [ ] **Step 4: Commit**

```bash
git add src/ui/panel src/render
git commit -m "feat: panel v2 controls, hazard lamp, rush timer; hazard meshes and gap trench

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
```

---

### Task 25: Mobile layout pass, spec amendment, DEVLOG M2, deploy

**Files:**
- Modify: `src/ui/panel/panel.css`, `src/ui/screens/screens.css`, `docs/superpowers/specs/2026-08-25-deadweight-design.md`, `DEVLOG.md`

- [ ] **Step 1: Portrait phone pass** (Chrome device toolbar, 390×844 and 360×740)

Check and fix each:
- Panel grid fits without scroll: if not, reduce `.dial` to 96 px and `.tele` min-height to 32 px under `@media (max-height: 760px)`.
- Buttons ≥ 44 px tall; gait rail buttons ≥ 40 px.
- Ballast drag works with one thumb on the viewport while the other buttons are reachable; add `touch-action: none` on `#viewport` (already on body — verify it applies).
- Screens scroll internally when taller than the viewport (`#screen { overflow: auto }` is set — verify on the workshop screen).
- `100dvh` works; add `height: 100vh` fallback before it.

- [ ] **Step 2: Landscape / desktop pass** (1280×800)

Viewport centred with the panel wrapping; panel columns don't collapse below 560 px viewport width. If the panel is too tall, allow `#panel` to `overflow-y: auto`.

- [ ] **Step 3: Cold-load check**

Run: `pnpm build && pnpm preview`, open with devtools Network throttled to "Fast 3G", disable cache.
Expected: panel interactive < 1 s; Three chunk arrives and the viewport fills within ~3 s. Record both numbers in DEVLOG.

- [ ] **Step 4: Spec amendment**

In the spec §2.2 change `braced → speed 0` to `braced → speed = braceSpeed (creep)` with the note: *"Zero-speed brace can never cross the hazard it braces for; the rig creeps at `braceSpeed` while braced."* Add `braceSpeed`, `spillRelief`, `hazardGaitScale` to the §5 `tuning.json` line.

- [ ] **Step 5: DEVLOG M2**

Under "What AI built": validator pass table (from Task 20), content counts (20/12/5/6/30/20), the trim-prediction readout.
Under "Problems solved": brace deadlock → creep speed; frozen `state.t` after run end → flow keeps its own linger counter; any tuning moved in Task 20.
Under "What I decided": 50/50 split → slot positions; fixed outpost map; one-button RECOVER.

- [ ] **Step 6: Final verification and deploy**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm validate && pnpm build`
Expected: all green.

```bash
git add -A
git commit -m "feat: M2 — core loop closed; mobile layout pass; devlog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WagjbdSgfWVTyxfLcgt9s6"
git push && gh run watch --exit-status
```

Expected: live URL runs the full loop on a phone: dispatch → load → haul → review → workshop → dispatch, with save persisting across reloads.

---

## Definition of done for this plan

- [ ] `https://ariaspect.github.io/deadweight/` loads cold, panel interactive < 1 s, no console errors
- [ ] Full loop playable one-handed in portrait on a phone
- [ ] `pnpm test` green including determinism/replay; `pnpm validate` reports 12/12 outposts solvable at lag 15
- [ ] A first run (dispatch → review) completes in under 2 minutes
- [ ] At least one locked upgrade visible in the workshop
- [ ] DEVLOG.md has M0, M1, M2 entries under all three headings
