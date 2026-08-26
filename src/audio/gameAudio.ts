import type { InputFrame, RigState } from '../sim/types';

interface AudioSnapshot {
  grounded: boolean; braced: boolean; gait: number; lost: number; found: number;
  cooldownSum: number; restraintSum: number; recovering: number; ended: RigState['ended'];
}

function snapshot(s: RigState): AudioSnapshot {
  return {
    grounded: s.grounded,
    braced: s.braced,
    gait: s.gait,
    lost: s.items.filter((item) => item.lost).length,
    found: s.foundDiscoveries.length,
    cooldownSum: s.zoneCooldown.reduce((sum, value) => sum + (value ?? 0), 0),
    restraintSum: s.items.reduce((sum, item) => sum + (item.lost ? 0 : item.restraint), 0),
    recovering: s.recovering,
    ended: s.ended,
  };
}

/** Lightweight diegetic sound design. Audio never feeds back into simulation state. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private previous: AudioSnapshot | null = null;
  private nextFootTick = 0;
  private nextDangerTick = 0;
  private hazard = false;

  constructor(doc: Document) {
    doc.addEventListener('pointerdown', this.unlock, { capture: true });
    doc.addEventListener('keydown', this.unlock, { capture: true });
  }

  private unlock = (): void => {
    if (!this.context) this.createGraph();
    if (this.context?.state === 'suspended') void this.context.resume();
  };

  private createGraph(): void {
    const context = new AudioContext();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = 0.55;
    master.connect(compressor).connect(context.destination);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 180; filter.Q.value = 1.1;
    const engineGain = context.createGain(); engineGain.gain.value = 0.0001;
    const engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 38;
    const sub = context.createOscillator(); sub.type = 'sine'; sub.frequency.value = 19;
    const engineMix = context.createGain(); engineMix.gain.value = 0.62;
    const subMix = context.createGain(); subMix.gain.value = 0.7;
    engine.connect(engineMix).connect(filter);
    sub.connect(subMix).connect(filter);
    filter.connect(engineGain).connect(master);
    engine.start(); sub.start();

    this.context = context; this.master = master; this.engineFilter = filter;
    this.engineGain = engineGain; this.engine = engine; this.engineSub = sub;
  }

  beginRun(state: RigState): void {
    this.previous = snapshot(state);
    this.nextFootTick = state.t;
    this.nextDangerTick = state.t;
    this.hazard = false;
  }

  setHazard(on: boolean): void {
    if (on && !this.hazard) {
      this.tone(720, 0.09, 'square', 0.07, 650);
      this.tone(720, 0.09, 'square', 0.07, 650, 0.13);
    }
    this.hazard = on;
  }

  step(input: InputFrame, state: RigState, dt: number): void {
    const prev = this.previous ?? snapshot(state);
    const next = snapshot(state);
    this.updateEngine(state);

    if (input.strap) this.ratchet();
    if (next.braced !== prev.braced) this.brace(next.braced);
    if (next.gait !== prev.gait) this.gear(next.gait);
    if (input.jump && prev.grounded && !next.grounded) this.jump();
    if (!prev.grounded && next.grounded) this.landing(Math.abs(state.speed));
    const landed = !prev.grounded && next.grounded;
    const jolted = next.restraintSum < prev.restraintSum - 4 && next.lost === prev.lost;
    if (next.cooldownSum > prev.cooldownSum || (jolted && !landed)) this.impact();
    if (next.lost > prev.lost) this.spill();
    if (next.found > prev.found) this.cache();
    if (next.recovering > 0 && prev.recovering === 0) this.recover();
    if (next.ended && next.ended !== prev.ended) this.outcome(next.ended);

    const moving = Math.abs(state.speed) > 0.12 && state.grounded && !state.ended;
    if (moving && state.t >= this.nextFootTick) {
      this.footfall(Math.abs(state.speed));
      const speedRatio = Math.min(1, Math.abs(state.speed) / 8);
      this.nextFootTick = state.t + Math.max(7, Math.round((0.42 - speedRatio * 0.18) / dt));
    }
    const danger = Math.abs(state.tilt) > 0.72 && !state.ended;
    if (danger && state.t >= this.nextDangerTick) {
      this.tone(910, 0.055, 'square', 0.035, 760);
      this.nextDangerTick = state.t + Math.round(0.48 / dt);
    }
    this.previous = next;
  }

  private updateEngine(state: RigState): void {
    if (!this.context || !this.engine || !this.engineSub || !this.engineGain || !this.engineFilter) return;
    const now = this.context.currentTime;
    const speed = Math.min(1, Math.abs(state.speed) / 8);
    const active = !state.ended && state.recovering === 0;
    const frequency = 34 + speed * 62 + state.gait * 2.5;
    this.engine.frequency.setTargetAtTime(frequency, now, 0.08);
    this.engineSub.frequency.setTargetAtTime(frequency * 0.5, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(170 + speed * 620, now, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.011 + speed * 0.026 : 0.0001, now, 0.12);
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, endFrequency = frequency, delay = 0): void {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.008, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start); oscillator.stop(end + 0.02);
  }

  private noise(duration: number, volume: number, cutoff: number, delay = 0): void {
    if (!this.context || !this.master) return;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff;
    const gain = this.context.createGain(); gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(this.context.currentTime + delay);
  }

  private ratchet(): void {
    for (let i = 0; i < 3; i++) this.tone(1150 - i * 170, 0.025, 'square', 0.055, 720, i * 0.045);
  }

  private brace(on: boolean): void {
    this.noise(on ? 0.2 : 0.12, 0.055, on ? 900 : 1300);
    this.tone(on ? 92 : 150, on ? 0.18 : 0.1, 'sawtooth', 0.045, on ? 54 : 105);
  }

  private gear(gait: number): void {
    this.noise(0.055, 0.045, 1100);
    this.tone(105 + gait * 16, 0.07, 'square', 0.045, 72 + gait * 10);
  }

  private jump(): void {
    this.noise(0.12, 0.04, 1500);
    this.tone(125, 0.2, 'sawtooth', 0.055, 310);
  }

  private landing(speed: number): void {
    const strength = Math.min(0.12, 0.055 + speed * 0.007);
    this.noise(0.15, strength, 420);
    this.tone(62, 0.16, 'sine', strength, 38);
  }

  private impact(): void {
    this.noise(0.24, 0.14, 700);
    this.tone(54, 0.24, 'sine', 0.13, 31);
    this.tone(173, 0.09, 'square', 0.055, 82);
  }

  private footfall(speed: number): void {
    const volume = Math.min(0.065, 0.025 + speed * 0.006);
    this.noise(0.045, volume, 520);
    this.tone(68 + Math.min(30, speed * 4), 0.055, 'triangle', volume, 48);
  }

  private spill(): void {
    this.noise(0.42, 0.16, 1200);
    this.tone(270, 0.5, 'sawtooth', 0.1, 48);
  }

  private cache(): void {
    this.tone(440, 0.1, 'sine', 0.065, 520);
    this.tone(660, 0.13, 'sine', 0.065, 760, 0.1);
    this.tone(880, 0.16, 'sine', 0.055, 980, 0.22);
  }

  private recover(): void {
    this.noise(0.65, 0.045, 650);
    this.tone(72, 0.7, 'sawtooth', 0.06, 108);
  }

  private outcome(ended: NonNullable<RigState['ended']>): void {
    if (ended === 'arrived') {
      this.tone(330, 0.16, 'triangle', 0.075, 392);
      this.tone(494, 0.18, 'triangle', 0.075, 587, 0.16);
      this.tone(659, 0.28, 'triangle', 0.07, 784, 0.34);
      return;
    }
    this.noise(0.25, 0.09, 500);
    this.tone(180, 0.55, 'sawtooth', 0.09, ended === 'spilled' ? 42 : 65);
  }
}
