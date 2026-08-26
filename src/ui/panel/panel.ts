import type { Gait, RigState, Tuning } from '../../sim/types';
import { itemAtSlot } from '../../sim/step';

export interface PanelHandlers { onGait(g: Gait): void; onStrap(): void; onBrace(on: boolean): void; onRecover(): void; onJump(): void; onRadar(): void }

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function rpmAngle(rpm: number): number { return -120 + 240 * rpm / 3000; }

export class Panel {
  private needle!: HTMLElement; private reserveFill!: HTMLElement; private ballastFill!: HTMLElement; private ballastText!: HTMLElement;
  private ballastPip!: HTMLElement; private ballastAim!: HTMLElement;
  private strapLimit!: HTMLElement; private strapVal!: HTMLElement;
  private strapFill!: HTMLElement; private message!: HTMLElement; private gaitBtns: HTMLElement[] = [];
  private recoverBtn!: HTMLButtonElement; private hazardLamp!: HTMLElement; private rush!: HTMLElement;
  private rpmNeedle!: HTMLElement; private rpmTarget!: HTMLElement; private rpmVal!: HTMLElement;
  private cargoFill!: HTMLElement; private cargoVal!: HTMLElement;

  constructor(private readonly root: HTMLElement, private readonly h: PanelHandlers) {
    root.innerHTML = `
      <div class="panel-grid">
        <div class="brand"><span class="brand-mark">DW</span><span>DEADWEIGHT<small>MULE-7 REMOTE OPERATOR</small></span><i>LINKED</i></div>
        <div class="gauge tilt"><div class="dial"><div class="zone"></div><div class="needle"></div></div><label>TILT</label></div>
        <div class="gauge rpm"><div class="dial"><div class="zone rpm"></div><div class="target"></div><div class="needle"></div></div><label>RPM <span class="val">600</span></label></div>
        <div class="gauges">
          <div class="gauge reserve"><div class="bar"><div class="fill"></div></div><label>RESERVE</label></div>
          <div class="gauge strap m2"><div class="bar"><div class="fill"></div><i class="limit"></i></div><label>ACTIVE RESTRAINT <span class="val"></span></label></div>
          <div class="gauge cargo"><div class="bar"><div class="fill"></div></div><label>CARGO <span class="val">100%</span></label></div>
          <div class="gauge ballast"><div class="bar centred"><div class="fill"></div><i class="pip"></i></div><label>BALLAST <span class="val">0</span><span class="aim"></span></label></div>
        </div>
        <div class="rail"><label>GAIT</label>${[4, 3, 2, 1, 0].map((g) => `<button data-gait="${g}">${g}</button>`).join('')}</div>
        <div class="buttons">
          <button class="big jump">JUMP <kbd>SPACE</kbd></button>
          <button class="big strap m2">RATCHET <kbd>F</kbd></button>
          <button class="big brace m2">BRACE <kbd>SHIFT</kbd></button>
          <button class="big radar m2">RADAR <kbd>V</kbd></button>
          <button class="big recover m2" disabled>RECOVER <kbd>R</kbd></button>
        </div>
        <div class="lamp hazard m2">HAZARD</div>
        <pre class="tele"></pre>
        <div class="rush"></div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
    this.needle = q('.tilt .needle'); this.reserveFill = q('.reserve .fill'); this.strapFill = q('.strap .fill');
    this.strapLimit = q('.strap .limit'); this.strapVal = q('.strap .val');
    this.ballastFill = q('.ballast .fill'); this.ballastText = q('.ballast .val');
    this.ballastPip = q('.ballast .pip'); this.ballastAim = q('.ballast .aim'); this.message = q('.tele');
    this.hazardLamp = q('.lamp.hazard'); this.recoverBtn = q('button.recover'); this.rush = q('.rush');
    this.rpmNeedle = q('.rpm .needle'); this.rpmTarget = q('.rpm .target'); this.rpmVal = q('.rpm .val');
    this.cargoFill = q('.cargo .fill'); this.cargoVal = q('.cargo .val');
    this.gaitBtns = Array.from(root.querySelectorAll<HTMLElement>('.rail button'));
    for (const b of this.gaitBtns) b.addEventListener('pointerdown', () => { const g = Number(b.dataset.gait) as Gait; this.setGait(g); h.onGait(g); });
    q<HTMLButtonElement>('button.strap').addEventListener('pointerdown', () => h.onStrap());
    q<HTMLButtonElement>('button.jump').addEventListener('pointerdown', () => h.onJump());
    const brace = q<HTMLButtonElement>('button.brace');
    brace.addEventListener('pointerdown', (e) => { brace.setPointerCapture(e.pointerId); brace.classList.add('on'); h.onBrace(true); });
    const off = (): void => { brace.classList.remove('on'); h.onBrace(false); };
    brace.addEventListener('pointerup', off); brace.addEventListener('pointercancel', off);
    this.recoverBtn.addEventListener('pointerdown', () => h.onRecover());
    q<HTMLButtonElement>('button.radar').addEventListener('pointerdown', () => h.onRadar());
  }

  setGait(g: Gait): void { for (const b of this.gaitBtns) b.classList.toggle('on', Number(b.dataset.gait) === g); }
  setMessage(text: string): void { this.message.textContent = text; }
  setHazard(on: boolean): void { this.hazardLamp.classList.toggle('on', on); }
  setRadar(on: boolean): void { this.root.querySelector('button.radar')!.classList.toggle('on', on); }

  update(s: RigState, tuning: Tuning): void {
    const deg = Math.max(-1.2, Math.min(1.2, s.tilt)) * 60;
    this.needle.style.transform = `rotate(${deg}deg)`;
    this.needle.classList.toggle('red', Math.abs(s.tilt) > 0.7);
    this.reserveFill.style.width = `${Math.max(0, s.reserve)}%`;
    this.reserveFill.classList.toggle('low', s.reserve < 20);
    this.strapFill.style.width = `${s.strap}%`;
    // the crush limit of the selected bay: past this mark the ratchet is grinding the load, not securing it
    const sel = itemAtSlot(s, s.selectedSlot);
    const limit = sel && !sel.lost ? sel.crushLimit : 100;
    this.strapLimit.style.left = `${limit}%`;
    this.strapFill.classList.toggle('crush', s.strap > limit);
    this.strapVal.textContent = sel && !sel.lost ? `${Math.round(s.strap)} / ${limit}` : '';
    const vmax = tuning.gaitSpeed[4]! * tuning.gaitSpeedMul;
    const rpm = 600 + 2400 * clamp(Math.abs(s.speed) / vmax, 0, 1);
    const targetRpm = 600 + 2400 * clamp(Math.abs(s.targetSpeed) / vmax, 0, 1);
    this.rpmNeedle.style.transform = `rotate(${rpmAngle(rpm)}deg)`;
    this.rpmTarget.style.transform = `rotate(${rpmAngle(targetRpm)}deg)`;
    this.rpmVal.textContent = String(Math.round(rpm));
    const carried = s.items.filter((it) => !it.lost);
    const cargoCond = carried.length ? carried.reduce((a, it) => a + clamp(1 - it.stress, 0, 1), 0) / carried.length : 0;
    this.cargoFill.style.width = `${cargoCond * 100}%`;
    this.cargoFill.classList.toggle('low', cargoCond < 0.5);
    this.cargoVal.textContent = `${Math.round(cargoCond * 100)}%`;
    const r = tuning.ballastRange;
    const pct = (s.ballast / r) * 50;
    this.ballastFill.style.left = `${50 + Math.min(0, pct)}%`;
    this.ballastFill.style.width = `${Math.abs(pct)}%`;
    this.ballastText.textContent = (s.ballast > 0 ? '+' : '') + String(s.ballast);
    // where the ballast has to sit to cancel the current slope and load — chase the pip, not the centre
    this.ballastPip.style.left = `${50 + (s.trimTarget / r) * 50}%`;
    const off = s.ballast - s.trimTarget;
    this.ballastAim.textContent = `AIM ${(s.trimTarget > 0 ? '+' : '') + s.trimTarget}`;
    this.ballastAim.classList.toggle('off', Math.abs(off) > tuning.ballastRange * 0.15);
    const lost = s.items.some((it) => it.lost);
    this.recoverBtn.disabled = !(lost && s.recovering === 0 && (s.ended === null || s.ended === 'spilled') && s.reserve > tuning.recoverCost);
    this.setRadar(s.radar);
    const rushItems = s.items.filter((it) => it.deadlineTick >= 0 && !it.lost);
    this.rush.textContent = rushItems.map((it) => `RUSH ${it.id.toUpperCase()} ${Math.max(0, Math.ceil((it.deadlineTick - s.t) * tuning.dt))}s`).join('  ');
    this.root.classList.toggle('recovering', s.recovering > 0);
  }
}
