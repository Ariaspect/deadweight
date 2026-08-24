import * as THREE from 'three';
import type { Gait, RouteDef } from '../../sim/types';

const L1 = 1.7, L2 = 1.9;             // leg segment lengths
const HIP_Y = 1.7, BODY_Y = 2.3;
const STRIDE = 1.1, LIFT = 0.7;
const STEP_RATE = [0, 3.2, 4.6, 6.0, 7.6]; // rad/s gait phase advance
const MAX_PITCH = 0.5;                 // rad at |tilt| = 1; sign: +tilt = nose up

interface Leg { hipX: number; side: 1 | -1; phase: number; upper: THREE.Mesh; lower: THREE.Mesh; foot: THREE.Mesh }

function setCylinder(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

export class Rig {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh;
  private legs: Leg[] = [];
  private phase = 0;
  private lastTick = 0;
  private legMat = new THREE.MeshLambertMaterial({ color: '#2f3338', flatShading: true });
  private footMat = new THREE.MeshLambertMaterial({ color: '#c8622a', flatShading: true });

  constructor() {
    this.body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 1.8), new THREE.MeshLambertMaterial({ color: '#4a4f55', flatShading: true }));
    this.body.position.y = BODY_Y;
    this.group.add(this.body);
    const cyl = new THREE.CylinderGeometry(0.11, 0.09, 1, 6);
    const ball = new THREE.SphereGeometry(0.16, 6, 6);
    for (let i = 0; i < 6; i++) {
      const side: 1 | -1 = i < 3 ? 1 : -1;
      const col = i % 3;
      const phase = ((col + (side > 0 ? 0 : 1)) % 2) * Math.PI;   // tripod gait
      const upper = new THREE.Mesh(cyl, this.legMat), lower = new THREE.Mesh(cyl, this.legMat), foot = new THREE.Mesh(ball, this.footMat);
      this.group.add(upper, lower, foot);
      this.legs.push({ hipX: (col - 1) * 1.25, side, phase, upper, lower, foot });
    }
  }

  update(x: number, y: number, tilt: number, gait: Gait, tick: number, route: RouteDef): void {
    this.group.position.set(x, y, 0);
    this.group.rotation.z = tilt * MAX_PITCH;   // Rz(+θ) lifts +X (nose) → positive tilt = nose up
    const dtick = tick - this.lastTick; this.lastTick = tick;
    this.phase += STEP_RATE[gait]! * dtick / 60;
    const hip = new THREE.Vector3(), foot = new THREE.Vector3(), knee = new THREE.Vector3();
    for (const leg of this.legs) {
      const ph = this.phase + leg.phase;
      hip.set(leg.hipX, HIP_Y, leg.side * 1.0);
      const fx = leg.hipX + STRIDE * Math.cos(ph);
      const groundY = route.heightAt(x + fx) - y;
      const fy = groundY + LIFT * Math.max(0, Math.sin(ph)) * (gait > 0 ? 1 : 0);
      foot.set(fx, fy, leg.side * 2.1);
      // 2-bone IK in the hip→foot plane; knee bends up/outward
      const d = Math.min(hip.distanceTo(foot), L1 + L2 - 0.01);
      const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const dir = new THREE.Vector3().subVectors(foot, hip).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3().crossVectors(dir, up).normalize();
      if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
      knee.copy(dir).applyAxisAngle(axis, -a).multiplyScalar(L1).add(hip);
      if (knee.y < hip.y) knee.copy(dir).applyAxisAngle(axis, a).multiplyScalar(L1).add(hip);
      setCylinder(leg.upper, hip, knee);
      setCylinder(leg.lower, knee, foot);
      leg.foot.position.copy(foot);
    }
  }

  dispose(): void {
    this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose();
    for (const leg of this.legs) { leg.upper.geometry.dispose(); leg.foot.geometry.dispose(); }
    this.legMat.dispose(); this.footMat.dispose();
  }
}
