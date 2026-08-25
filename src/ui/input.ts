import type { Gait, InputFrame, KitId, Tuning } from '../sim/types';

export interface InputState {
  gait: Gait; ballast: number; keyFore: boolean; keyAft: boolean; brace: boolean;
  strapQueued: boolean; recoverQueued: boolean; deployQueued: KitId | 0;
  forward: boolean; backward: boolean; left: boolean; right: boolean; jumpQueued: boolean;
  cargoSelectQueued: number | null;
  dragging: boolean; dragStartPx: number; dragStartBallast: number;
}

export function initialInput(): InputState {
  return { gait: 0, ballast: 0, keyFore: false, keyAft: false, brace: false, strapQueued: false, recoverQueued: false, deployQueued: 0,
    forward: false, backward: false, left: false, right: false, jumpQueued: false, cargoSelectQueued: null, dragging: false, dragStartPx: 0, dragStartBallast: 0 };
}

const clampGait = (g: number): Gait => (g < 0 ? 0 : g > 4 ? 4 : g) as Gait;

export function applyKey(st: InputState, code: string, down: boolean): void {
  switch (code) {
    case 'KeyW': st.forward = down; break;
    case 'KeyS': st.backward = down; break;
    case 'KeyA': st.left = down; break;
    case 'KeyD': st.right = down; break;
    case 'KeyQ': st.keyFore = down; break;
    case 'KeyE': st.keyAft = down; break;
    case 'ShiftLeft': case 'ShiftRight': st.brace = down; break;
    case 'Space': if (down) st.jumpQueued = true; break;
    case 'KeyF': if (down) st.strapQueued = true; break;
    case 'KeyR': if (down) st.recoverQueued = true; break;
    case 'KeyP': if (down) st.deployQueued = 'plank'; break;
    default:
      if (down && /^Digit[0-4]$/.test(code)) {
        st.gait = clampGait(Number(code.slice(5)));
        const bay = Number(code.slice(5)); if (bay >= 1 && bay <= 3) st.cargoSelectQueued = bay - 1;
      }
  }
}

export function applyDragStart(st: InputState, px: number): void { st.dragging = true; st.dragStartPx = px; st.dragStartBallast = st.ballast; }
export function applyDragMove(st: InputState, px: number, pxPerFullRange: number, range: number): void {
  if (!st.dragging) return;
  const v = st.dragStartBallast + (px - st.dragStartPx) / pxPerFullRange * range;
  st.ballast = v < -range ? -range : v > range ? range : v;
}
export function applyDragEnd(st: InputState): void { st.dragging = false; }

export function resetInput(st: InputState): void {
  st.ballast = 0; st.brace = false; st.keyFore = false; st.keyAft = false;
  st.forward = false; st.backward = false; st.left = false; st.right = false; st.jumpQueued = false;
  st.strapQueued = false; st.recoverQueued = false; st.deployQueued = 0; st.cargoSelectQueued = null; st.dragging = false;
}

export function sampleFrame(st: InputState, tuning: Tuning): InputFrame {
  const r = tuning.ballastRange;
  if (!st.dragging) {
    if (st.keyFore && !st.keyAft) st.ballast -= tuning.ballastRate * tuning.dt;
    if (st.keyAft && !st.keyFore) st.ballast += tuning.ballastRate * tuning.dt;
    st.ballast = st.ballast < -r ? -r : st.ballast > r ? r : st.ballast;
  }
  const throttle = (st.forward === st.backward ? 0 : st.forward ? 1 : -1) as -1 | 0 | 1;
  const steer = (st.left === st.right ? 0 : st.left ? -1 : 1) as -1 | 0 | 1;
  const f: InputFrame = { gait: st.gait, ballast: Math.round(st.ballast), strap: st.strapQueued, brace: st.brace, deploy: st.deployQueued, recover: st.recoverQueued, throttle, steer, jump: st.jumpQueued, cargoSelect: st.cargoSelectQueued ?? undefined };
  st.strapQueued = false; st.recoverQueued = false; st.deployQueued = 0; st.jumpQueued = false; st.cargoSelectQueued = null;
  return f;
}

export class InputController {
  readonly state = initialInput();
  private viewport: HTMLElement | null = null;
  private doc: Document | null = null;
  private tuning: Tuning;
  constructor(tuning: Tuning) { this.tuning = tuning; }

  attach(viewport: HTMLElement, doc: Document): void {
    this.viewport = viewport; this.doc = doc;
    doc.addEventListener('keydown', this.onKeyDown);
    doc.addEventListener('keyup', this.onKeyUp);
    doc.defaultView?.addEventListener('blur', this.onBlur);
  }
  detach(): void {
    this.doc?.removeEventListener('keydown', this.onKeyDown);
    this.doc?.removeEventListener('keyup', this.onKeyUp);
    this.doc?.defaultView?.removeEventListener('blur', this.onBlur);
    this.viewport = null; this.doc = null;
  }
  sample(): InputFrame { return sampleFrame(this.state, this.tuning); }
  setTuning(t: Tuning): void { this.tuning = t; }
  reset(): void { resetInput(this.state); }
  setGait(g: Gait): void { this.state.gait = g; }
  queueStrap(): void { this.state.strapQueued = true; }
  queueRecover(): void { this.state.recoverQueued = true; }
  queueJump(): void { this.state.jumpQueued = true; }
  selectCargo(index: number): void { this.state.cargoSelectQueued = index; }
  setBrace(on: boolean): void { this.state.brace = on; }
  queueDeploy(k: KitId): void { this.state.deployQueued = k; }

  private onKeyDown = (e: KeyboardEvent): void => { if (e.repeat) return; applyKey(this.state, e.code, true); if (e.code === 'Space') e.preventDefault(); };
  private onKeyUp = (e: KeyboardEvent): void => { applyKey(this.state, e.code, false); };
  private onBlur = (): void => { resetInput(this.state); };
}
