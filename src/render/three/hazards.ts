import * as THREE from 'three';
import type { HazardInstance, RouteDef } from '../../sim/types';

const rock = new THREE.IcosahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: '#544e47', roughness: 0.95, flatShading: true });
const darkMat = new THREE.MeshStandardMaterial({ color: '#171a1d', roughness: 0.72, metalness: 0.35 });
const steelMat = new THREE.MeshStandardMaterial({ color: '#5d676b', roughness: 0.48, metalness: 0.72 });
const orangeMat = new THREE.MeshStandardMaterial({ color: '#ef5b20', roughness: 0.55, metalness: 0.2 });
const yellowMat = new THREE.MeshStandardMaterial({ color: '#ffbe2e', roughness: 0.62 });
const dustMat = new THREE.MeshBasicMaterial({ color: '#ffdc9e', transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
const warningMat = new THREE.MeshBasicMaterial({ color: '#ff3c19' });
const SHARED_GEOMETRIES: THREE.BufferGeometry[] = [rock];
const SHARED_MATERIALS: THREE.Material[] = [rockMat, darkMat, steelMat, orangeMat, yellowMat, dustMat, warningMat];

function rand(id: number, salt: number): number {
  const n = Math.sin((id + 11) * 91.73 + salt * 37.19) * 43758.5453;
  return n - Math.floor(n);
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function warningStripe(width: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = -4; i <= 4; i++) {
    const stripe = mesh(new THREE.BoxGeometry(width / 9, 0.035, 3.4), i % 2 ? darkMat : yellowMat);
    stripe.position.x = i * width / 9;
    g.add(stripe);
  }
  return g;
}

function addRocks(g: THREE.Group, route: RouteDef, h: HazardInstance, count: number, large: boolean): void {
  const centre = route.centerAt(h.x) + h.z;
  for (let i = 0; i < count; i++) {
    const m = mesh(rock, rockMat);
    const s = large ? 0.75 + rand(h.id, i) * 0.95 : 0.25 + rand(h.id, i) * 0.38;
    const px = h.x + (rand(h.id, i + 20) - 0.5) * 4.5;
    m.scale.setScalar(s);
    m.position.set(px, route.heightAt(px) + s * 0.36, centre + h.dir * 2.1 + (rand(h.id, i + 40) - 0.5) * 2.8);
    m.rotation.set(rand(h.id, i + 60) * 3, rand(h.id, i + 80) * 3, 0);
    g.add(m);
  }
}

export function buildHazards(route: RouteDef): THREE.Group {
  const g = new THREE.Group();
  for (const h of route.hazards) {
    const y = route.heightAt(h.x);
    if (h.type === 'rubble' || h.type === 'scree') addRocks(g, route, h, h.type === 'rubble' ? 7 : 3, h.type === 'rubble');
    else if (h.type === 'gust') {
      for (let i = 0; i < 5; i++) {
        const m = mesh(new THREE.PlaneGeometry(0.45, 8), dustMat);
        m.position.set(h.x - 3 + i * 1.5, y + 4, (route.centerAt(h.x) + h.z) + (i % 2 ? 1 : -1) * 2); m.rotation.y = Math.PI / 2; g.add(m);
      }
    } else if (h.type === 'gap') {
      const centre = route.centerAt(h.x) + h.z;
      const pit = mesh(new THREE.BoxGeometry(3.4, 0.55, 10), darkMat); pit.position.set(h.x, y - 4.8, centre); g.add(pit);
      for (const dx of [-1.75, 1.75]) { const edge = warningStripe(1.2); edge.position.set(h.x + dx, y + 0.04, centre); g.add(edge); }
    }
  }
  return g;
}

export function animateHazards(group: THREE.Group, timeSec: number, rigX: number): void {
  void timeSec; void rigX;
  for (const root of group.children) {
    const kind = root.userData.hazardKind as string | undefined;
    void kind;
  }
}

export function disposeHazards(g: THREE.Group): void {
  g.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!SHARED_GEOMETRIES.includes(child.geometry)) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) if (!SHARED_MATERIALS.includes(material)) material.dispose();
  });
}
