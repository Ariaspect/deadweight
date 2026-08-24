import { describe, it, expect } from 'vitest';
import { createRun, step } from '../src/sim/step';
import { mulberry32 } from '../src/sim/rng';
import { tuning } from '../src/content';
import { flatRoute, slopeRoute, frame } from './helpers';

function run(route: ReturnType<typeof flatRoute>, ballast: number, ticks: number) {
  const s = createRun(route, [], tuning); const rng = mulberry32(1); let peak = 0;
  for (let i = 0; i < ticks; i++) { step(s, frame({ gait: 1, ballast }), route, [], tuning, rng); peak = Math.max(peak, Math.abs(s.tilt)); }
  return { s, peak };
}

describe('tilt dynamics', () => {
  it('stays level on flat ground with zero ballast', () => {
    const { s } = run(flatRoute(5000), 0, 600);
    expect(s.tilt).toBe(0); expect(s.tiltVel).toBe(0);
  });
  it('uncountered slope drives tilt toward kSlope*slope/stiffness', () => {
    const { s } = run(slopeRoute(0.3, 5000), 0, 1200);
    const eq = tuning.kSlope * 0.3 / tuning.stiffness;
    expect(s.tilt).toBeGreaterThan(eq * 0.8);
    expect(s.tilt).toBeLessThan(eq * 1.2);
  });
  it('correct counter-ballast holds tilt at zero on a slope', () => {
    const ballast = Math.round(-(tuning.kSlope * 0.3) / tuning.kBallast * 100);
    const { s, peak } = run(slopeRoute(0.3, 5000), ballast, 1200);
    expect(peak).toBeLessThan(0.05);
    expect(Math.abs(s.tilt)).toBeLessThan(0.05);
  });
  it('overshoots then settles (second-order, underdamped)', () => {
    const eq = tuning.kBallast * 0.4 / tuning.stiffness;
    const { s, peak } = run(flatRoute(5000), 40, 1800);
    expect(peak).toBeGreaterThan(eq * 1.08);
    expect(Math.abs(s.tilt - eq)).toBeLessThan(eq * 0.05);
  });
  it('clamps ballast to ±ballastRange as an integer', () => {
    const { s } = run(flatRoute(5000), 250, 1);
    expect(s.ballast).toBe(tuning.ballastRange);
    const s2 = createRun(flatRoute(5000), [], tuning);
    step(s2, frame({ ballast: 12.7 }), flatRoute(5000), [], tuning, mulberry32(1));
    expect(s2.ballast).toBe(13);
  });
});
