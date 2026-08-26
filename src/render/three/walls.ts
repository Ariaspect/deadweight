import * as THREE from 'three';
import type { RouteDef, Wall, WallKind } from '../../sim/types';
import type { PropLibrary, PropName } from './props';

const CHUNK = 8;
const HEIGHT: Record<WallKind, number> = { wall: 3.2, rock: 2.8, ruin: 4.0, baffle: 1.1 };
const ASSET: Record<WallKind, PropName> = { wall: 'terrainTall', rock: 'rocksB', ruin: 'structureTall', baffle: 'containersA' };

function noise(n: number): number { const x = Math.sin(n * 91.73) * 43758.5453; return x - Math.floor(x); }

function chunks(w: Wall): { x0: number; x1: number }[] {
  const out: { x0: number; x1: number }[] = [];
  for (let x = w.x0; x < w.x1; x += CHUNK) out.push({ x0: x, x1: Math.min(w.x1, x + CHUNK) });
  return out;
}

export function buildWalls(route: RouteDef, props: PropLibrary): THREE.Group {
  const group = new THREE.Group();
  let seed = route.seed;
  for (const wall of route.walls) {
    for (const chunk of chunks(wall)) {
      const mx = (chunk.x0 + chunk.x1) / 2;
      const len = chunk.x1 - chunk.x0;
      const thick = wall.z1 - wall.z0;
      const mz = (wall.z0 + wall.z1) / 2;
      const y = route.heightAt(mx);
      const height = HEIGHT[wall.kind];
      seed += 1;
      const add = (name: PropName, h: number, dx: number, dz: number, rotation: number, scaleX: number, scaleZ: number): void => {
        const asset = props.clone(name, h);
        if (!asset) return;
        asset.position.set(mx + dx, y - 0.12, route.centerAt(mx) + mz + dz);
        asset.rotation.y = rotation;
        asset.scale.x *= scaleX;
        asset.scale.z *= scaleZ;
        group.add(asset);
      };
      if (wall.kind === 'rock') {
        add('rocksB', height * (0.85 + noise(seed) * 0.35), -len * 0.22, 0, noise(seed + 1) * Math.PI, 1.2, Math.max(1, thick / 2));
        add('rocksA', height * (0.7 + noise(seed + 2) * 0.35), len * 0.24, (noise(seed + 3) - 0.5) * thick, noise(seed + 4) * Math.PI, 1.3, Math.max(1, thick / 2));
      } else {
        add(ASSET[wall.kind], height * (0.9 + noise(seed) * 0.2), 0, 0, wall.kind === 'baffle' ? Math.PI / 2 : 0, Math.max(0.65, len / height), Math.max(0.65, thick / height));
        if (wall.kind === 'ruin') add('containersB', 1.15, (noise(seed + 1) - 0.5) * len * 0.55, 0, noise(seed + 2) * Math.PI, 1, 1);
      }
    }
  }
  return group;
}

export function disposeWalls(group: THREE.Group): void { group.clear(); }
