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
