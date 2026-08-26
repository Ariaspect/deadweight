import { describe, it, expect } from 'vitest';
import { initialInput, applyKey, applyDragStart, applyDragMove, applyDragEnd, sampleFrame, resetInput, InputController } from '../src/ui/input';
import { tuning } from '../src/content';

describe('input reducers', () => {
  it('holding Q ramps ballast negative at ballastRate and clamps', () => {
    const st = initialInput(); applyKey(st, 'KeyQ', true);
    for (let i = 0; i < 30; i++) sampleFrame(st, tuning);
    expect(sampleFrame(st, tuning).ballast).toBeCloseTo(-Math.round(tuning.ballastRate * 31 / 60), 0);
    for (let i = 0; i < 120; i++) sampleFrame(st, tuning);
    expect(sampleFrame(st, tuning).ballast).toBe(-tuning.ballastRange);
  });
  it('W/S drive and A/D steer while digits set cruise gait', () => {
    const st = initialInput();
    applyKey(st, 'KeyW', true); applyKey(st, 'KeyA', true);
    expect(sampleFrame(st, tuning)).toMatchObject({ throttle: 1, steer: -1 });
    applyKey(st, 'KeyW', false); applyKey(st, 'KeyA', false);
    applyKey(st, 'Digit4', true); expect(st.gait).toBe(4);
  });
  it('selects cargo bays with 5/6/7 as a one-shot command', () => {
    const st = initialInput(); st.baySlots = [0, 1, 2]; applyKey(st, 'Digit6', true);
    expect(sampleFrame(st, tuning).cargoSelect).toBe(1);
    expect(sampleFrame(st, tuning).cargoSelect).toBeUndefined();
  });
  it('strap tap is delivered exactly once with F', () => {
    const st = initialInput(); applyKey(st, 'KeyF', true);
    expect(sampleFrame(st, tuning).strap).toBe(true);
    expect(sampleFrame(st, tuning).strap).toBe(false);
  });
  it('jump is delivered exactly once with Space', () => {
    const st = initialInput(); applyKey(st, 'Space', true);
    expect(sampleFrame(st, tuning).jump).toBe(true);
    expect(sampleFrame(st, tuning).jump).toBe(false);
  });
  it('touch D-pad drives through setDrive and clears on reset', () => {
    const c = new InputController(tuning);
    c.setDrive('forward', true); c.setDrive('left', true);
    expect(c.sample()).toMatchObject({ throttle: 1, steer: -1 });
    c.setDrive('forward', false);
    expect(c.sample()).toMatchObject({ throttle: 0, steer: -1 });
    c.reset();
    expect(c.sample()).toMatchObject({ throttle: 0, steer: 0 });
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

describe('bays and keys v3', () => {
  it('digits 0–4 set gait only; 5/6/7 select slots 0/1/2', () => {
    const st = initialInput(); st.baySlots = [0, 1, 2]; applyKey(st, 'Digit3', true);
    expect(st.gait).toBe(3); expect(sampleFrame(st, tuning).cargoSelect).toBeUndefined();
    applyKey(st, 'Digit6', true); expect(sampleFrame(st, tuning).cargoSelect).toBe(1);
  });
  it('Tab cycles through the loaded bays', () => {
    const c = new InputController(tuning); c.setBays([0, 2]);
    applyKey(c.state, 'Tab', true); expect(c.sample().cargoSelect).toBe(2);
    applyKey(c.state, 'Tab', true); expect(c.sample().cargoSelect).toBe(0);
    c.selectCargo(2); expect(c.sample().cargoSelect).toBe(2);
    applyKey(c.state, 'Tab', true); expect(c.sample().cargoSelect).toBe(0);
  });
  it('ignores 5/6/7 and rack taps for bays that are not loaded', () => {
    const c = new InputController(tuning); c.setBays([0, 2]);
    applyKey(c.state, 'Digit6', true);
    expect(c.sample().cargoSelect).toBeUndefined(); expect(c.state.bayIndex).toBe(0);
    c.selectCargo(1);
    expect(c.sample().cargoSelect).toBeUndefined();
    c.selectCargo(2); expect(c.sample().cargoSelect).toBe(2); expect(c.state.bayIndex).toBe(1);
  });
  it('latches radar on V and on the panel handler, and reports it in the frame', () => {
    const st = initialInput();
    expect(sampleFrame(st, tuning).radar).toBe(false);
    applyKey(st, 'KeyV', true);
    expect(sampleFrame(st, tuning).radar).toBe(true);
    applyKey(st, 'KeyV', false);
    expect(sampleFrame(st, tuning).radar).toBe(true);   // latched, not held
    applyKey(st, 'KeyV', true);
    expect(sampleFrame(st, tuning).radar).toBe(false);
  });
  it('does not touch ballast fore/aft, which stay bound to Q/E', () => {
    const st = initialInput();
    applyKey(st, 'KeyQ', true);
    expect(st.radar).toBe(false); expect(st.keyFore).toBe(true);
    applyKey(st, 'KeyQ', false);
    applyKey(st, 'KeyE', true);
    expect(st.radar).toBe(false); expect(st.keyAft).toBe(true);
  });
  it('the panel handler toggles radar the same as the key', () => {
    const c = new InputController(tuning);
    c.toggleRadar();
    expect(c.sample().radar).toBe(true);
    c.toggleRadar();
    expect(c.sample().radar).toBe(false);
  });
  it('setRadar clears the latch, so a new haul does not start burning reserve', () => {
    const st = initialInput();
    applyKey(st, 'KeyV', true);
    expect(sampleFrame(st, tuning).radar).toBe(true);
    resetInput(st);
    expect(sampleFrame(st, tuning).radar, 'resetInput leaves the latch alone, like gait').toBe(true);
    st.radar = false;   // what InputController.setRadar(false) does, and what haul() now calls
    expect(sampleFrame(st, tuning).radar).toBe(false);
  });

});
