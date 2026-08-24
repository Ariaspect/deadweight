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
