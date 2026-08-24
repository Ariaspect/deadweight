import type { InputFrame } from '../sim/types';

export interface LoopOpts {
  dt: number;
  sampleInput(): InputFrame;
  step(input: InputFrame): void;
  render(alpha: number): void;
  maxFrameMs?: number;
}

export class GameLoop {
  readonly log: InputFrame[] = [];
  running = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private readonly maxFrameMs: number;

  constructor(private readonly opts: LoopOpts) { this.maxFrameMs = opts.maxFrameMs ?? 250; }

  start(now: number = typeof performance !== 'undefined' ? performance.now() : 0): void {
    this.running = true; this.last = now; this.acc = 0;
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    this.running = false;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
  }

  tick(nowMs: number): void {
    if (!this.running) return;
    let frameMs = nowMs - this.last;
    if (frameMs > this.maxFrameMs) frameMs = this.maxFrameMs;
    if (frameMs < 0) frameMs = 0;
    this.last = nowMs;
    this.acc += frameMs / 1000;
    const dt = this.opts.dt;
    while (this.acc >= dt - 1e-9) {          // epsilon: 6 × (1/60) is not exactly 0.1 in floating point
      const input = this.opts.sampleInput();
      this.log.push(input);
      this.opts.step(input);
      this.acc -= dt;
    }
    this.opts.render(Math.max(0, this.acc / dt));
  }

  private onFrame = (now: number): void => {
    this.tick(now);
    if (this.running) this.raf = requestAnimationFrame(this.onFrame);
  };
}
