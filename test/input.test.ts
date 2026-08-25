import { describe, it, expect } from 'vitest';
import { initialInput, applyKey, applyDragStart, applyDragMove, applyDragEnd, sampleFrame, resetInput } from '../src/ui/input';
import { tuning } from '../src/content';

describe('input reducers', () => {
  it('holding A ramps ballast negative at ballastRate and clamps', () => {
    const st = initialInput(); applyKey(st, 'KeyA', true);
    for (let i = 0; i < 30; i++) sampleFrame(st, tuning);
    expect(sampleFrame(st, tuning).ballast).toBeCloseTo(-Math.round(tuning.ballastRate * 31 / 60), 0);
    for (let i = 0; i < 120; i++) sampleFrame(st, tuning);
    expect(sampleFrame(st, tuning).ballast).toBe(-tuning.ballastRange);
  });
  it('W/S step gait within 0..4 and digits set it directly', () => {
    const st = initialInput();
    applyKey(st, 'KeyW', true); applyKey(st, 'KeyW', false); expect(st.gait).toBe(1);
    applyKey(st, 'Digit4', true); expect(st.gait).toBe(4);
    applyKey(st, 'KeyW', true); expect(st.gait).toBe(4);
    applyKey(st, 'KeyS', true); expect(st.gait).toBe(3);
  });
  it('strap tap is delivered exactly once', () => {
    const st = initialInput(); applyKey(st, 'Space', true);
    expect(sampleFrame(st, tuning).strap).toBe(true);
    expect(sampleFrame(st, tuning).strap).toBe(false);
  });
  it('shift is a held brace', () => {
    const st = initialInput(); applyKey(st, 'ShiftLeft', true);
    expect(sampleFrame(st, tuning).brace).toBe(true);
    applyKey(st, 'ShiftLeft', false);
    expect(sampleFrame(st, tuning).brace).toBe(false);
  });
  it('drag maps pixels to ballast relative to the start value', () => {
    const st = initialInput(); st.ballast = 20;
    applyDragStart(st, 100);
    applyDragMove(st, 160, 120, 100);   // 60px of a 120px full-range sweep = +50
    expect(st.ballast).toBe(70);
    applyDragMove(st, 400, 120, 100);
    expect(st.ballast).toBe(100);
    applyDragEnd(st);
    expect(st.dragging).toBe(false);
  });
  it('sampleFrame emits integer ballast', () => {
    const st = initialInput(); st.ballast = 33.6;
    expect(sampleFrame(st, tuning).ballast).toBe(34);
  });
  it('resetInput zeroes ballast, clears holds and queues', () => {
    const st = initialInput(); st.ballast = 77; st.brace = true; st.keyFore = true; st.strapQueued = true; st.recoverQueued = true; st.deployQueued = 'plank'; st.dragging = true; st.gait = 3;
    resetInput(st);
    expect(st).toMatchObject({ ballast: 0, brace: false, keyFore: false, keyAft: false, strapQueued: false, recoverQueued: false, deployQueued: 0, dragging: false, gait: 3 });
  });
  it('sampleFrame honours a swapped tuning ballastRange', () => {
    const st = initialInput(); st.ballast = 125;
    expect(sampleFrame(st, tuning).ballast).toBe(tuning.ballastRange);
    st.ballast = 125;
    expect(sampleFrame(st, { ...tuning, ballastRange: 130 }).ballast).toBe(125);
  });
});
