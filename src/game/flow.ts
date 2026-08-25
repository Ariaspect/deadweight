import { evaluate } from '../sim/score';
import { applyUpgrades } from '../sim/upgrades';
import { mulberry32 } from '../sim/rng';
import { GameLoop } from './loop';
import { loadSave, writeSave, type SaveData, type StorageLike } from './save';
import { pickHq, pickReview } from './reviews';
import { renderResult } from '../ui/screens/result';
import { Hud } from '../ui/hud';
import { buildShowcaseCourse } from '../course/map';
import type { CourseFrame } from '../course/types';
import type { Renderer } from '../render/Renderer';
import type { Panel } from '../ui/panel/panel';
import type { InputController } from '../ui/input';
import type { HazardDef, HqDef, ItemDef, LoadoutItem, OutpostDef, ReviewDef, RigState, RunResult, Tuning, UpgradeDef } from '../sim/types';

export interface Content { cargo: ItemDef[]; outposts: OutpostDef[]; hazards: HazardDef[]; upgrades: UpgradeDef[]; reviews: ReviewDef[]; hq: HqDef[] }
export interface FlowDeps {
  viewportEl: HTMLElement; panel: Panel; screenEl: HTMLElement; input: InputController;
  renderer: Promise<Renderer>; baseTuning: Tuning; content: Content; storage: StorageLike;
}

const LINGER: Record<NonNullable<RigState['ended']>, number> = { arrived: 60, stalled: 90, spilled: 180 };

export class Flow {
  save: SaveData;
  tuning: Tuning;
  private loop: GameLoop | null = null;
  private loadout: LoadoutItem[] = [];
  private readonly metaRng = mulberry32((Date.now() & 0x7fffffff) >>> 0);
  private readonly hud: Hud;

  constructor(private readonly d: FlowDeps) {
    const { data, reset } = loadSave(d.storage);
    this.save = data;
    this.tuning = applyUpgrades(d.baseTuning, data.upgrades, d.content.upgrades);
    this.hud = new Hud(d.viewportEl);
    if (reset) d.panel.setMessage('HQ: Save data unreadable. Fresh ledger opened.');
  }

  start(): void {
    const manifestIds = ['soup', 'cake', 'chicken'];
    const manifest = manifestIds.map((id) => this.d.content.cargo.find((item) => item.id === id)).filter((item): item is ItemDef => Boolean(item));
    const fallback = this.d.content.cargo.slice(0, 3);
    this.loadout = (manifest.length === 3 ? manifest : fallback).map((def, slot) => ({ def, slot }));
    void this.haul();
  }

  private async haul(): Promise<void> {
    const loadout = this.loadout, { tuning, d } = this, { panel, input, screenEl } = d;
    this.loop?.stop();
    const course = buildShowcaseCourse(2);
    screenEl.innerHTML = `<div class="screen loading"><h2>DEPLOYING MULE</h2><pre class="tele-block">INITIALIZING RIGID-BODY SYSTEM\nASSEMBLING ${course.name}\nSECURING ${loadout.length} CARGO BAYS…</pre></div>`;
    screenEl.hidden = false;
    const sessionPromise = import('../course/PhysicsCourse').then(({ PhysicsCourse }) => PhysicsCourse.create(course, loadout, tuning));
    const [session, renderer] = await Promise.all([sessionPromise, d.renderer]);
    screenEl.hidden = true;
    renderer.setCourse(course, loadout.map((item) => item.def));
    input.reset(); input.setTuning(tuning); input.setGait(0); input.selectCargo(0); panel.setCargoBay(0);
    panel.setMessage('HQ: THREE ROUTES TO THE SUMMIT. Mouse controls camera. Find a line and commit.');

    let linger = 0, finished = false;
    let frame: CourseFrame = session.frame();
    const loop = new GameLoop({
      dt: tuning.dt,
      sampleInput: () => {
        const sample = input.sample(), axes = renderer.courseControlAxes();
        const forward = sample.throttle ?? 0, right = sample.steer ?? 0;
        const length = Math.max(1, Math.hypot(forward, right));
        sample.moveX = (axes.forwardX * forward + axes.rightX * right) / length;
        sample.moveZ = (axes.forwardZ * forward + axes.rightZ * right) / length;
        return sample;
      },
      step: (sample) => {
        if (finished) return;
        frame = session.step(sample);
        if (frame.message) panel.setMessage(frame.message);
        if (frame.state.ended) {
          if (++linger > LINGER[frame.state.ended]) { finished = true; this.finish(frame.state, loop); }
        } else linger = 0;
      },
      render: (alpha) => {
        renderer.drawCourse(frame, alpha);
        panel.update(frame.state, tuning);
        this.hud.updateCourse(frame, course);
        panel.setHazard(frame.finishDistance < 25 || Math.abs(frame.state.tilt) > 0.65);
      },
    });
    this.loop = loop; loop.start();
  }

  private finish(state: RigState, loop: GameLoop): void {
    loop.stop(); this.review(evaluate(state, this.tuning), state);
  }

  private review(result: RunResult, state: RigState): void {
    const { content, panel, screenEl, storage } = this.d;
    this.save.cash += result.total; this.save.runs += 1;
    if (result.stars > (this.save.bestByOutpost['deadweight-yard'] ?? 0)) this.save.bestByOutpost['deadweight-yard'] = result.stars;
    writeSave(storage, this.save);
    const worst = [...state.items].sort((a, b) => (a.lost ? 2 : a.stress) - (b.lost ? 2 : b.stress)).at(-1);
    const line = pickReview(content.reviews, result.stars, worst?.behavior ?? 'any', this.metaRng);
    panel.setMessage(pickHq(content.hq, result.ended === 'arrived' ? 'arrival' : result.ended === 'spilled' ? 'spill' : 'stall', 'any', this.metaRng));
    renderResult(screenEl, result, this.loadout.map((item) => item.def), () => { void this.haul(); }, line, 'RUN AGAIN');
  }
}
