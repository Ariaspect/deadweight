import { createRun, predictTrim, step } from '../sim/step';
import { evaluate } from '../sim/score';
import { generateRoute } from '../sim/terrain';
import { applyUpgrades } from '../sim/upgrades';
import { mulberry32, hashSeed } from '../sim/rng';
import { GameLoop } from './loop';
import { loadSave, writeSave, type SaveData, type StorageLike } from './save';
import { generateCargo, pickRoutes, playerTier, routeDifficulty, type RouteRating } from './orders';
import { pickHq, pickReview } from './reviews';
import { renderDispatch } from '../ui/screens/dispatch';
import { renderRouteSelect, type RouteOption } from '../ui/screens/route';
import { renderLoadout } from '../ui/screens/loadout';
import { renderResult } from '../ui/screens/result';
import { renderUpgrade } from '../ui/screens/upgrade';
import { Hud } from '../ui/hud';
import { routeSketchSvg } from '../ui/sketch';
import { describeEvents, snapshot, type EventSnapshot } from './events';
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
  private outpost: OutpostDef | null = null;
  private rating: RouteRating = { score: 0, payoutMul: 1, label: 'easy' };
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
    this.hud = new Hud(d.viewportEl, { onSelectBay: (slot) => d.input.selectCargo(slot), onToggleRadar: () => d.input.toggleRadar() });
    if (reset) d.panel.setMessage('HQ: Save data unreadable. Fresh ledger opened.');
    d.renderer.then((r) => { this.renderer = r; });
  }

  start(): void { this.dispatch(); }

  /** Step 1: the route board. Fees scale with what the route asks of you, so this is the first real bet. */
  private dispatch(): void {
    const { content, panel, screenEl } = this.d;
    const routes = new Map<string, RouteDef>();
    const options: RouteOption[] = pickRoutes(content.outposts, this.save.runs, this.tuning).map((outpost) => {
      const route = generateRoute(outpost.seed, outpost.lengthM, outpost.tier, content.hazards, this.tuning);
      routes.set(outpost.id, route);
      return {
        outpost, rating: routeDifficulty(route, outpost, this.tuning), sketch: routeSketchSvg(route),
        hazardCount: route.hazards.filter((h) => h.impulse > 0).length, zoneCount: route.zones.length,
      };
    });
    const hqLine = pickHq(content.hq, 'dispatch', 'any', this.metaRng);
    panel.setMessage(hqLine);
    renderRouteSelect(screenEl, { options, hqLine, cash: this.save.cash, tier: playerTier(this.save.runs) }, (picked) => {
      this.outpost = picked;
      this.route = routes.get(picked.id)!;
      this.rating = options.find((o) => o.outpost.id === picked.id)!.rating;
      this.manifest();
    });
  }

  /** Step 2: the manifest for the accepted route. */
  private manifest(): void {
    const { content, panel, screenEl } = this.d;
    const outpost = this.outpost!, route = this.route!;
    const cargo = generateCargo(content.cargo, this.save.runs, this.metaRng, this.tuning);
    const hqLine = pickHq(content.hq, 'dispatch', cargo[0]?.behavior ?? 'any', this.metaRng);
    panel.setMessage(hqLine);
    renderDispatch(screenEl, {
      offers: { outpost, cargo }, profile: route.slopeProfile, profileStepM: this.tuning.terrain.profileStepM,
      sketch: routeSketchSvg(route), hqLine, rating: this.rating,
      capacity: this.tuning.capacity, cash: this.save.cash, tier: playerTier(this.save.runs), traceCount: 0, tuning: this.tuning,
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
    input.reset(); input.setTuning(tuning); input.setGait(2); panel.setGait(2); input.setRadar(false);
    input.setBallast(predictTrim(loadout, tuning));   // start trimmed for the load, not already drifting
    input.setBays(loadout.map((l) => l.slot));
    let snap: EventSnapshot = snapshot(state);
    panel.setMessage(`HQ: ${this.outpost!.name}. ${loadout.length} aboard. W walks at the gait you set. Pick your lanes.`);
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
        const ev = describeEvents(snap, state, route, tuning.cacheReserve); snap = ev.next;
        if (ev.lines.length) panel.setMessage(ev.lines.join('\n'));
        if (state.ended) { if (++linger > LINGER[state.ended]) { finished = true; this.finish(state, loop); } } else linger = 0;
      },
      render: (alpha) => {
        this.renderer?.draw(state, prev, alpha);
        panel.update(state, tuning);
        this.hud.update(state, route);
        panel.setHazard(route.hazards.some((h) => h.impulse > 0 && (h.x1 ?? h.x) >= state.x && h.x <= state.x + this.telegraph[h.type] && Math.abs(state.z - h.z) < h.halfW));
      },
    });
    this.loop = loop;
    loop.start();
  }

  private finish(state: RigState, loop: GameLoop): void {
    loop.stop();
    this.review(evaluate(state, this.tuning, this.rating.payoutMul), state);
  }

  private review(result: RunResult, state: RigState): void {
    const { content, panel, screenEl, storage } = this.d;
    const outpost = this.outpost!;
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
