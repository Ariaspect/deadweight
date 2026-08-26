import * as THREE from 'three';
import type { RouteDef, Wall, WallKind } from '../../sim/types';

const CHUNK = 8;   // metres of wall per instance so the boxes follow the wandering centre line
const HEIGHT: Record<WallKind, number> = { wall: 3.2, rock: 2.6, ruin: 3.8, baffle: 1.1 };
const MATERIAL: Record<WallKind, THREE.MeshStandardMaterial> = {
  wall: new THREE.MeshStandardMaterial({ color: '#7a7570', roughness: 0.9, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: '#4f4a44', roughness: 0.98, flatShading: true }),
  ruin: new THREE.MeshStandardMaterial({ color: '#6e4a34', roughness: 0.85, metalness: 0.15, flatShading: true }),
  baffle: new THREE.MeshStandardMaterial({ color: '#8a847c', roughness: 0.8, flatShading: true }),
};
const GEOMETRY: Record<WallKind, THREE.BufferGeometry> = {
  wall: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.IcosahedronGeometry(0.62, 0),
  ruin: new THREE.BoxGeometry(1, 1, 1),
  baffle: new THREE.BoxGeometry(1, 1, 1),
};

function noise(n: number): number { const x = Math.sin(n * 91.73) * 43758.5453; return x - Math.floor(x); }

function chunks(w: Wall): { x0: number; x1: number }[] {
  const out: { x0: number; x1: number }[] = [];
  for (let x = w.x0; x < w.x1; x += CHUNK) out.push({ x0: x, x1: Math.min(w.x1, x + CHUNK) });
  return out;
}

export function buildWalls(route: RouteDef): THREE.Group {
  const group = new THREE.Group();
  const counts: Record<WallKind, number> = { wall: 0, rock: 0, ruin: 0, baffle: 0 };
  // rock and ruin place two instances per chunk; wall and baffle place one
  for (const w of route.walls) counts[w.kind] += chunks(w).length * (w.kind === 'rock' || w.kind === 'ruin' ? 2 : 1);
  const meshes = {} as Record<WallKind, THREE.InstancedMesh>;
  for (const kind of Object.keys(counts) as WallKind[]) {
    const m = new THREE.InstancedMesh(GEOMETRY[kind], MATERIAL[kind], Math.max(1, counts[kind]));
    m.castShadow = true; m.receiveShadow = true; m.count = 0; m.name = `walls-${kind}`;
    meshes[kind] = m; group.add(m);
  }
  const dummy = new THREE.Object3D();
  let seed = route.seed;
  for (const w of route.walls) {
    for (const ch of chunks(w)) {
      const mx = (ch.x0 + ch.x1) / 2, len = ch.x1 - ch.x0, thick = w.z1 - w.z0, mz = (w.z0 + w.z1) / 2;
      const y = route.heightAt(mx), h = HEIGHT[w.kind];
      const place = (dx: number, dz: number, sx: number, sy: number, sz: number, rot: number): void => {
        dummy.position.set(mx + dx, y + sy / 2 - 0.15, route.centerAt(mx) + mz + dz);
        dummy.rotation.set(0, rot, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        const m = meshes[w.kind]; m.setMatrixAt(m.count++, dummy.matrix);
      };
      seed += 1;
      if (w.kind === 'rock') {
        place(-len * 0.22, 0, len * 0.6, h * (0.8 + noise(seed) * 0.5), thick * 1.3, noise(seed + 1) * 3.1);
        place(len * 0.24, (noise(seed + 2) - 0.5) * thick, len * 0.55, h * (0.7 + noise(seed + 3) * 0.6), thick * 1.2, noise(seed + 4) * 3.1);
      } else if (w.kind === 'ruin') {
        place(0, 0, len, h * (0.6 + noise(seed) * 0.5), thick, 0);
        place((noise(seed + 1) - 0.5) * len * 0.4, 0, len * 0.35, h, thick * 0.9, (noise(seed + 2) - 0.5) * 0.3);
      } else {
        place(0, 0, len, h * (0.9 + noise(seed) * 0.2), thick, 0);
      }
    }
  }
  for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
  return group;
}

export function disposeWalls(group: THREE.Group): void {
  for (const child of group.children) if (child instanceof THREE.InstancedMesh) child.dispose();   // geometries/materials are shared module singletons
}
