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
