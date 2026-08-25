import type { CourseDef, CourseObstacle, CoursePlatform, Quat, Vec3 } from './types';

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function quatFromYawPitch(yaw: number, pitch: number): Quat {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cz = Math.cos(pitch / 2), sz = Math.sin(pitch / 2);
  return { x: sy * sz, y: sy * cz, z: cy * sz, w: cy * cz };
}

function bridge(id: string, a: Vec3, b: Vec3, width: number, kind: CoursePlatform['kind'] = 'road'): CoursePlatform {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const horizontal = Math.hypot(dx, dz), length = Math.hypot(horizontal, dy);
  return {
    id, position: v((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.55, (a.z + b.z) / 2), size: v(length, 1.1, width),
    rotation: quatFromYawPitch(-Math.atan2(dz, dx), Math.atan2(dy, horizontal)), kind,
  };
}

function pad(id: string, position: Vec3, size: Vec3, kind: CoursePlatform['kind'] = 'island'): CoursePlatform {
  return { id, position, size, rotation: IDENTITY, kind };
}

export function buildShowcaseCourse(tier: number): CourseDef {
  const p: CoursePlatform[] = [];
  p.push(pad('depot', v(-82, -0.6, 0), v(26, 1.2, 32), 'checkpoint'));
  p.push(bridge('start-neck', v(-69, 0, 0), v(-53, 1, 0), 12));
  p.push(pad('junction-west', v(-48, 0.4, 0), v(14, 1.2, 24), 'island'));

  // Central service route: readable, mechanically dense, and never the only option.
  p.push(bridge('service-a', v(-41, 1, 0), v(-12, 3, 0), 10));
  p.push(pad('service-yard', v(0, 2.4, 0), v(24, 1.2, 18), 'danger'));
  p.push(bridge('service-b', v(12, 3, 0), v(38, 5, 0), 9, 'danger'));
  p.push(pad('crusher-yard', v(49, 4.4, 0), v(22, 1.2, 18), 'danger'));
  p.push(bridge('service-exit', v(60, 5, 0), v(72, 7, 0), 10));

  // North route: elevated fan canyon with exposed bridges and a salvage island.
  p.push(bridge('north-entry', v(-50, 1, -8), v(-36, 5, -29), 8));
  p.push(pad('north-west', v(-26, 4.4, -30), v(20, 1.2, 15), 'danger'));
  p.push(bridge('north-span-a', v(-16, 5, -30), v(8, 8, -30), 7, 'danger'));
  p.push(pad('north-relay', v(20, 7.4, -30), v(24, 1.2, 18), 'island'));
  p.push(bridge('north-span-b', v(32, 8, -30), v(52, 7, -24), 7, 'danger'));
  p.push(bridge('north-return', v(52, 7, -24), v(70, 7, -7), 9));

  // South route: broad quarry, rotating sweepers, ramps, and an absurd shortcut.
  p.push(bridge('south-entry', v(-50, 1, 8), v(-34, 0, 28), 10));
  p.push(pad('quarry-west', v(-20, -0.6, 29), v(28, 1.2, 22), 'danger'));
  p.push(bridge('quarry-ramp', v(-6, 0, 29), v(14, 6, 29), 9, 'danger'));
  p.push(pad('quarry-high', v(28, 5.4, 29), v(28, 1.2, 20), 'island'));
  p.push(bridge('quarry-jump', v(42, 6, 29), v(58, 7, 20), 7, 'danger'));
  p.push(bridge('south-return', v(58, 7, 20), v(72, 7, 7), 10));

  p.push(pad('summit', v(84, 6.4, 0), v(28, 1.2, 34), 'checkpoint'));

  const obstacles: CourseObstacle[] = [
    { id: 'service-spinner', kind: 'spinner', position: v(-5, 4.2, 0), size: v(0.7, 0.7, 15), phase: 0.2, speed: 1.7 },
    { id: 'service-hammer', kind: 'hammer', position: v(24, 10, 0), size: v(2.5, 8, 2.5), phase: 1.1, speed: 1.35 },
    { id: 'crusher-one', kind: 'crusher', position: v(47, 9, 0), size: v(5, 8, 14), phase: 0.4, speed: 1.6 },
    { id: 'fan-north-a', kind: 'fan', position: v(-7, 10, -35), size: v(13, 10, 5), axis: v(0, 0, 1), phase: 0, speed: 9 },
    { id: 'fan-north-b', kind: 'fan', position: v(37, 12, -35), size: v(13, 10, 5), axis: v(0, 0, 1), phase: 2, speed: 11 },
    { id: 'quarry-spinner-a', kind: 'spinner', position: v(-23, 2, 29), size: v(0.7, 0.7, 20), phase: 2.4, speed: 2.1 },
    { id: 'quarry-spinner-b', kind: 'spinner', position: v(27, 8, 29), size: v(0.7, 0.7, 18), phase: 0.8, speed: -2.4 },
    { id: 'quarry-boulder', kind: 'boulder', position: v(6, 13, 28), size: v(2.4, 2.4, 2.4), phase: 0, speed: 0 },
  ];
  if (tier >= 2) obstacles.push({ id: 'summit-spinner', kind: 'spinner', position: v(75, 9, 0), size: v(0.7, 0.7, 22), phase: 0.5, speed: 2.3 });

  return {
    id: 'deadweight-yard', name: 'THE DEADWEIGHT YARD', spawn: v(-87, 2.2, 0), finish: v(91, 8, 0), finishRadius: 7,
    bounds: { minY: -18, minX: -112, maxX: 112, minZ: -58, maxZ: 58 }, platforms: p, obstacles,
    checkpoints: [
      { id: 'depot', name: 'DEPOT', position: v(-87, 2.2, 0), radius: 8 },
      { id: 'junction', name: 'WEST JUNCTION', position: v(-49, 2.2, 0), radius: 7 },
      { id: 'summit', name: 'SUMMIT APPROACH', position: v(75, 8, 0), radius: 8 },
    ],
    salvage: [
      { id: 0, name: 'NORTH RELAY', position: v(20, 9, -30), value: 100 },
      { id: 1, name: 'QUARRY BLACK BOX', position: v(28, 7, 29), value: 100 },
      { id: 2, name: 'HAMMER INSPECTION TAG', position: v(26, 6, 7), value: 125 },
      { id: 3, name: 'VOID PLATFORM CACHE', position: v(57, 9, 20), value: 150 },
    ],
  };
}
