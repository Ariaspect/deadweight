import * as THREE from 'three';
import type { ItemDef, ItemState, Tuning } from '../../sim/types';

const BODY_TOP = 2.85;

function geometryFor(shape: ItemDef['art']['shape']): THREE.BufferGeometry {
  switch (shape) {
    case 'cylinder': return new THREE.CylinderGeometry(0.45, 0.5, 0.9, 8);
    case 'sphere': return new THREE.SphereGeometry(0.5, 8, 6);
    case 'cage': return new THREE.BoxGeometry(0.9, 0.9, 0.9);
    default: return new THREE.BoxGeometry(0.9, 0.8, 0.9);
  }
}

interface Debris { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

const DEBRIS_GEO = new THREE.BoxGeometry(0.25, 0.25, 0.25);   // shared; never disposed per particle

function disposeMesh(m: THREE.Mesh, geometry = true): void {
  if (geometry) m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}

export class CargoView {
  readonly group = new THREE.Group();          // parented to the rig group
  readonly debrisGroup = new THREE.Group();    // parented to the scene
  private meshes = new Map<string, THREE.Mesh>();
  private wasLost = new Set<string>();
  private debris: Debris[] = [];

  setLoadout(items: ItemDef[]): void {
    for (const m of this.meshes.values()) disposeMesh(m);
    this.group.clear(); this.meshes.clear(); this.wasLost.clear();
    for (const def of items) {
      const m = new THREE.Mesh(geometryFor(def.art.shape), new THREE.MeshLambertMaterial({ color: def.art.color, flatShading: true, wireframe: def.art.shape === 'cage' }));
      m.position.y = BODY_TOP + 0.45;
      this.group.add(m); this.meshes.set(def.id, m);
    }
  }

  sync(items: ItemState[], tuning: Tuning, rigWorld: THREE.Vector3): void {
    for (const it of items) {
      const m = this.meshes.get(it.id); if (!m) continue;
      m.position.x = tuning.slotPos[it.slot]! * 1.05 + it.offset * 0.7;
      m.rotation.z = -it.offset * 0.4;
      if (it.lost && !this.wasLost.has(it.id)) { this.wasLost.add(it.id); m.visible = false; this.burst(rigWorld.clone().add(m.position), (m.material as THREE.MeshLambertMaterial).color); }
      if (!it.lost && this.wasLost.has(it.id)) { this.wasLost.delete(it.id); m.visible = true; }
    }
  }

  private burst(at: THREE.Vector3, color: THREE.Color): void {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(DEBRIS_GEO, new THREE.MeshLambertMaterial({ color }));
      mesh.position.copy(at);
      this.debrisGroup.add(mesh);
      this.debris.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6), life: 1.4 });
    }
  }

  tickDebris(dtSec: number, groundY: (x: number) => number): void {
    for (const d of this.debris) {
      d.vel.y -= 12 * dtSec; d.mesh.position.addScaledVector(d.vel, dtSec); d.life -= dtSec;
      const g = groundY(d.mesh.position.x);
      if (d.mesh.position.y < g) { d.mesh.position.y = g; d.vel.set(d.vel.x * 0.5, 0, d.vel.z * 0.5); }
    }
    this.debris = this.debris.filter((d) => { if (d.life <= 0) { this.debrisGroup.remove(d.mesh); disposeMesh(d.mesh, false); return false; } return true; });
  }

  dispose(): void {
    for (const m of this.meshes.values()) disposeMesh(m);
    for (const d of this.debris) disposeMesh(d.mesh, false);
    this.meshes.clear(); this.debris = []; this.group.clear(); this.debrisGroup.clear();
  }
}
