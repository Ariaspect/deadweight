import * as THREE from 'three';
import type { Gait, RouteDef } from '../../sim/types';

const L1 = 1.7, L2 = 1.9;             // leg segment lengths
const HIP_Y = 1.7, BODY_Y = 2.3;
const STRIDE = 1.1, LIFT = 0.7;
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
  private legMat = new THREE.MeshLambertMaterial({ color: '#3a3632', flatShading: true });
  private footMat = new THREE.MeshLambertMaterial({ color: '#6e4a34', flatShading: true });

  constructor() {
    this.body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 1.8), new THREE.MeshLambertMaterial({ color: '#5a5148', flatShading: true }));
    this.body.position.y = BODY_Y; this.body.castShadow = true;
    this.group.add(this.body);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 2.2), new THREE.MeshStandardMaterial({ color: '#3a352f', metalness: 0.55, roughness: 0.62 }));
    deck.position.y = BODY_Y + 0.65; deck.castShadow = true; this.group.add(deck);
    for (const [px, pz, w] of [[-1.1, 0.7, 0.9], [0.6, -0.8, 1.2], [1.3, 0.5, 0.7]] as const) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: '#6e4a34', roughness: 0.9, metalness: 0.3 }));
      plate.position.set(px, BODY_Y + 0.6, pz); this.group.add(plate);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd078' }));
    lamp.position.set(1.74, BODY_Y + 0.12, 0.58); this.group.add(lamp);
    const deadLamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#3a3632' }));
    deadLamp.position.set(1.74, BODY_Y + 0.12, -0.58); this.group.add(deadLamp);
    const cyl = new THREE.CylinderGeometry(0.11, 0.09, 1, 6);
    const ball = new THREE.SphereGeometry(0.16, 6, 6);
    for (let i = 0; i < 6; i++) {
      const side: 1 | -1 = i < 3 ? 1 : -1;
      const col = i % 3;
      const phase = ((col + (side > 0 ? 0 : 1)) % 2) * Math.PI;   // tripod gait
      const upper = new THREE.Mesh(cyl, this.legMat), lower = new THREE.Mesh(cyl, this.legMat), foot = new THREE.Mesh(ball, this.footMat);
      this.group.add(upper, lower, foot);
      upper.castShadow = true; lower.castShadow = true; foot.castShadow = true;
      this.legs.push({ hipX: (col - 1) * 1.25, side, phase, upper, lower, foot });
    }
  }

  update(x: number, y: number, z: number, lift: number, lateralVel: number, tilt: number, speed: number, gait: Gait, tick: number, route: RouteDef): void {
    this.group.position.set(x, y + lift, z);
    this.group.rotation.z = tilt * MAX_PITCH;   // Rz(+θ) lifts +X (nose) → positive tilt = nose up
    this.group.rotation.x = clamp(-lateralVel * 0.035, -0.28, 0.28);
    const dtick = tick - this.lastTick; this.lastTick = tick;
    this.phase += (speed / 14) * 7.6 * dtick / 60;   // speed-proportional stride rate; gait 4 (14 m/s) ≈ the old 7.6 rad/s
    const hip = new THREE.Vector3(), foot = new THREE.Vector3(), knee = new THREE.Vector3();
    for (const leg of this.legs) {
      const ph = this.phase + leg.phase;
      hip.set(leg.hipX, HIP_Y, leg.side * 1.0);
      const fx = leg.hipX + STRIDE * Math.cos(ph);
      const groundY = route.heightAt(x + fx) - y - lift;
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
    for (const child of this.group.children) if (child instanceof THREE.Mesh && child !== this.body && !this.legs.some((l) => l.upper === child || l.lower === child || l.foot === child)) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); }
    this.legMat.dispose(); this.footMat.dispose();
  }
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
