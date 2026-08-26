import './ui/panel/panel.css';
import './ui/screens/screens.css';
import { tuning, cargo, outposts, hazards, upgrades, reviews, hq } from './content';
import { Panel } from './ui/panel/panel';
import { InputController } from './ui/input';
import { mountDpad } from './ui/dpad';
import { Flow } from './game/flow';
import type { Renderer } from './render/Renderer';

const viewportEl = document.getElementById('viewport')!;
const panelEl = document.getElementById('panel')!;
const screenEl = document.getElementById('screen')!;

const input = new InputController(tuning);
input.attach(viewportEl, document);
mountDpad(viewportEl, { onDrive: (axis, on) => input.setDrive(axis, on) });
const panel = new Panel(panelEl, {
  onGait: (g) => input.setGait(g),
  onCargoSelect: (index) => input.selectCargo(index),
  onStrap: () => input.queueStrap(),
  onBrace: (on) => input.setBrace(on),
  onRecover: () => input.queueRecover(),
  onJump: () => input.queueJump(),
});
const renderer: Promise<Renderer> = import('./render/three/ThreeRenderer').then(({ ThreeRenderer }) => {
  const r = new ThreeRenderer(); r.mount(viewportEl);
  window.addEventListener('resize', () => r.resize());
  return r;
});
const flow = new Flow({ viewportEl, panel, screenEl, input, renderer, baseTuning: tuning, content: { cargo, outposts, hazards, upgrades, reviews, hq }, storage: localStorage });
flow.start();
