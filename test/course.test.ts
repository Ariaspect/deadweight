import { describe, expect, it } from 'vitest';
import { buildShowcaseCourse } from '../src/course/map';
import { PhysicsCourse } from '../src/course/PhysicsCourse';
import { cargo, tuning } from '../src/content';
import type { InputFrame } from '../src/sim/types';

const input = (over: Partial<InputFrame> = {}): InputFrame => ({ gait: 0, ballast: 0, strap: false, brace: false, deploy: 0, recover: false, throttle: 0, steer: 0, jump: false, ...over });

describe('authored obstacle course', () => {
  it('contains three distinct route families, checkpoints, salvage, and a shared summit', () => {
    const course = buildShowcaseCourse(2);
    expect(course.platforms.some((platform) => platform.id.startsWith('service'))).toBe(true);
    expect(course.platforms.some((platform) => platform.id.startsWith('north'))).toBe(true);
    expect(course.platforms.some((platform) => platform.id.startsWith('quarry') || platform.id.startsWith('south'))).toBe(true);
    expect(course.checkpoints.length).toBeGreaterThanOrEqual(3);
    expect(course.salvage.length).toBeGreaterThanOrEqual(4);
    expect(course.finish.x).toBeGreaterThan(course.spawn.x + 150);
  });

  it('adds the summit gauntlet at higher contract tiers', () => {
    expect(buildShowcaseCourse(0).obstacles.some((obstacle) => obstacle.id === 'summit-spinner')).toBe(false);
    expect(buildShowcaseCourse(2).obstacles.some((obstacle) => obstacle.id === 'summit-spinner')).toBe(true);
  });

  it('runs a real rigid-body chassis and attached cargo', async () => {
    const course = buildShowcaseCourse(0);
    const session = await PhysicsCourse.create(course, [{ def: cargo[0]!, slot: 1 }], tuning);
    let frame = session.frame(); const startX = frame.vehicle.position.x;
    for (let i = 0; i < 90; i++) frame = session.step(input({ throttle: 1 }));
    expect(Number.isFinite(frame.vehicle.position.x)).toBe(true);
    expect(frame.vehicle.position.x).toBeGreaterThan(startX + 1);
    expect(frame.cargo).toHaveLength(1);
    expect(Number.isFinite(frame.cargo[0]!.pose.position.y)).toBe(true);
  });

  it('keeps sustained controls bounded and stops when throttle is released', async () => {
    const session = await PhysicsCourse.create(buildShowcaseCourse(0), [{ def: cargo[0]!, slot: 1 }], tuning);
    let frame = session.frame();
    for (let i = 0; i < 120; i++) frame = session.step(input({ throttle: 1, steer: i > 50 ? 1 : 0 }));
    expect(frame.speed).toBeGreaterThan(2);
    expect(frame.speed).toBeLessThanOrEqual(22.01);
    expect(Math.abs(frame.vehicle.position.z)).toBeGreaterThan(0.5);
    for (let i = 0; i < 90; i++) frame = session.step(input());
    expect(frame.speed).toBeLessThan(0.6);
  });

  it('simulates cargo in world space with finite anchors and strap tension', async () => {
    const session = await PhysicsCourse.create(buildShowcaseCourse(0), [{ def: cargo[1]!, slot: 1 }], tuning);
    let frame = session.frame();
    for (let i = 0; i < 75; i++) frame = session.step(input({ throttle: 1, steer: 1 }));
    const load = frame.cargo[0]!;
    expect(Number.isFinite(load.anchor.x + load.anchor.y + load.anchor.z + load.tension)).toBe(true);
    expect(load.tension).toBeGreaterThan(0);
    expect(load.pose.position).not.toEqual(load.anchor);
  });

  it('moves directly in world intent and ratchets only the selected cargo bay', async () => {
    const session = await PhysicsCourse.create(buildShowcaseCourse(0), cargo.slice(0, 3).map((def, slot) => ({ def, slot })), tuning);
    let frame = session.step(input({ cargoSelect: 1, strap: true, moveX: 0, moveZ: 1 }));
    const restraints = frame.cargo.map((load) => load.restraint);
    expect(frame.cargo[1]!.selected).toBe(true);
    expect(restraints[1]).toBeGreaterThan(restraints[0]!);
    expect(restraints[1]).toBeGreaterThan(restraints[2]!);
    for (let i = 0; i < 75; i++) frame = session.step(input({ moveX: 0, moveZ: 1 }));
    expect(frame.vehicle.position.z).toBeGreaterThan(2);
    expect(Math.abs(frame.vehicle.position.x - buildShowcaseCourse(0).spawn.x)).toBeLessThan(4);
  });

  it('reports drive intent as gait so the RPM target tick moves', async () => {
    const session = await PhysicsCourse.create(buildShowcaseCourse(0), [], tuning);
    expect(session.step(input({ moveX: 1, moveZ: 0 })).state.gait).toBe(4);
    expect(session.step(input({ moveX: 0.5, moveZ: 0 })).state.gait).toBe(2);
    expect(session.step(input()).state.gait).toBe(0);
  });

  it('dispose() frees the world once and makes step()/frame() no-ops', async () => {
    const session = await PhysicsCourse.create(buildShowcaseCourse(0), [{ def: cargo[0]!, slot: 1 }], tuning);
    const last = session.step(input({ throttle: 1 }));
    session.dispose(); session.dispose();
    expect(session.frame().vehicle.position).toEqual(last.vehicle.position);
    expect(session.step(input({ throttle: 1 })).vehicle.position).toEqual(last.vehicle.position);
  });

  it('supports immediate manual checkpoint recovery', async () => {
    const course = buildShowcaseCourse(0);
    const session = await PhysicsCourse.create(course, [], tuning);
    const frame = session.step(input({ recover: true }));
    expect(frame.resets).toBe(1);
    expect(frame.state.reserve).toBeLessThan(100);
    expect(frame.message).toContain('CHECKPOINT RESET');
  });
});
