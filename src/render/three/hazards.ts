import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';

// Shared across calls to buildHazards (one per haul) so repeated hauls don't leak
// GPU resources: only mesh-unique geometries (gust planes, gap slabs) are disposed
// per rebuild; these are created once and never disposed.
const rock = new THREE.IcosahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshLambertMaterial({ color: '#6b6258', flatShading: true });
const dustMat = new THREE.MeshBasicMaterial({ color: '#f0dcb0', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
const slabMat = new THREE.MeshLambertMaterial({ color: '#1c1a16' });
const SHARED_GEOMETRIES: THREE.BufferGeometry[] = [rock];
const SHARED_MATERIALS: THREE.Material[] = [rockMat, dustMat, slabMat];

export function buildHazards(route: RouteDef): THREE.Group {
  const g = new THREE.Group();
  for (const h of route.hazards) {
    const y = route.heightAt(h.x);
    if (h.type === 'rubble' || h.type === 'scree') {
      const n = h.type === 'rubble' ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(rock, rockMat);
        const s = h.type === 'rubble' ? 0.8 + Math.random() * 0.8 : 0.3 + Math.random() * 0.3;
        m.scale.setScalar(s);
        m.position.set(h.x + (Math.random() - 0.5) * 4, route.heightAt(h.x) + s * 0.3, (Math.random() - 0.5) * 5);
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.add(m);
      }
    } else if (h.type === 'gust') {
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 7), dustMat);
        m.position.set(h.x - 3 + i * 2, y + 3.5, 0);
        m.rotation.y = Math.PI / 2;
        g.add(m);
      }
    } else if (h.type === 'gap') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 26), slabMat);
      m.position.set(h.x, y - 5, 0);
      g.add(m);
    }
  }
  return g;
}

/** Disposes per-mesh geometries/materials in a hazard group, skipping the shared instances above. */
export function disposeHazards(g: THREE.Group): void {
  for (const child of g.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    if (!SHARED_GEOMETRIES.includes(child.geometry)) child.geometry.dispose();
    const mat = child.material;
    if (Array.isArray(mat)) {
      for (const m of mat) if (!SHARED_MATERIALS.includes(m)) m.dispose();
    } else if (!SHARED_MATERIALS.includes(mat)) {
      mat.dispose();
    }
  }
}
