import './ui/panel/panel.css';
import './ui/screens/screens.css';
import { tuning, cargo, outposts, hazards, upgrades, reviews, hq } from './content';
import { Panel } from './ui/panel/panel';
import { InputController } from './ui/input';
import { mountDpad } from './ui/dpad';
import { Flow } from './game/flow';
import type { Renderer } from './render/Renderer';
import { installUiSounds } from './audio/uiSounds';
import { GameAudio } from './audio/gameAudio';

const viewportEl = document.getElementById('viewport')!;
const panelEl = document.getElementById('panel')!;
const screenEl = document.getElementById('screen')!;

const input = new InputController(tuning);
input.attach(viewportEl, document);
mountDpad(viewportEl, { onDrive: (axis, on) => input.setDrive(axis, on) });
const panel = new Panel(panelEl, {
  onGait: (g) => input.setGait(g),
  onStrap: () => input.queueStrap(),
  onBrace: (on) => input.setBrace(on),
  onRecover: () => input.queueRecover(),
  onJump: () => input.queueJump(),
  onRadar: () => input.toggleRadar(),
  onShieldSector: (sector: number) => input.queueShield(sector),
});
const renderer: Promise<Renderer> = import('./render/three/ThreeRenderer').then(({ ThreeRenderer }) => {
  const r = new ThreeRenderer(); r.mount(viewportEl);
  window.addEventListener('resize', () => r.resize());
  return r;
});
installUiSounds(document);
const audio = new GameAudio(document);
const flow = new Flow({ viewportEl, panel, screenEl, input, renderer, audio, baseTuning: tuning, content: { cargo, outposts, hazards, upgrades, reviews, hq }, storage: localStorage });
flow.start();
