import * as THREE from 'three';
import type { HazardInstance, RouteDef } from '../../sim/types';
import { moverActive } from '../../sim/step';

const rock = new THREE.IcosahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: '#4f4a44', roughness: 0.95, flatShading: true });
const darkMat = new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.8, metalness: 0.2 });
const steelMat = new THREE.MeshStandardMaterial({ color: '#5a5651', roughness: 0.55, metalness: 0.6 });
const rustMat = new THREE.MeshStandardMaterial({ color: '#6e4a34', roughness: 0.75, metalness: 0.25 });
const warnMat = new THREE.MeshStandardMaterial({ color: '#8f2f22', roughness: 0.7 });
const dustMat = new THREE.MeshBasicMaterial({ color: '#c9bfae', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const woodMat = new THREE.MeshStandardMaterial({ color: '#3d332a', roughness: 1, flatShading: true });
const SHARED_GEOMETRIES: THREE.BufferGeometry[] = [rock];
const SHARED_MATERIALS: THREE.Material[] = [rockMat, darkMat, steelMat, rustMat, warnMat, dustMat, woodMat];

function rand(id: number, salt: number): number {
  const n = Math.sin((id + 11) * 91.73 + salt * 37.19) * 43758.5453;
  return n - Math.floor(n);
}
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; return m;
}
const worldZ = (route: RouteDef, h: HazardInstance): number => route.centerAt(h.x) + h.z;

function addRocks(g: THREE.Group, route: RouteDef, h: HazardInstance, count: number, large: boolean): void {
  for (let i = 0; i < count; i++) {
    const m = mesh(rock, rockMat);
    const s = large ? 0.75 + rand(h.id, i) * 0.95 : 0.25 + rand(h.id, i) * 0.38;
    const px = h.x + (rand(h.id, i + 20) - 0.5) * 4.5;
    m.scale.setScalar(s);
    m.position.set(px, route.heightAt(px) + s * 0.36, worldZ(route, h) + (rand(h.id, i + 40) - 0.5) * h.halfW * 1.6);
    m.rotation.set(rand(h.id, i + 60) * 3, rand(h.id, i + 80) * 3, 0);
    g.add(m);
  }
}

function buildGap(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set(h.x, route.heightAt(h.x), worldZ(route, h));
  const pit = mesh(new THREE.BoxGeometry(3.4, 0.55, h.halfW * 2), darkMat); pit.position.y = -4.8; root.add(pit);
  for (const dz of [-1, 1]) for (let i = 0; i < 3; i++) {
    const bar = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), rustMat);
    bar.position.set(-1.6 + i * 1.6, 0.2, dz * (h.halfW - 0.6)); bar.rotation.z = 1.2 * dz; root.add(bar);
  }
  return root;
}

function buildGust(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const m = mesh(new THREE.PlaneGeometry(0.45, 8), dustMat);
    m.position.set(h.x - 3 + i * 1.5, route.heightAt(h.x) + 4, route.centerAt(h.x) + (i % 2 ? 1 : -1) * 2); m.rotation.y = Math.PI / 2; root.add(m);
  }
  for (const side of [-1, 1]) {
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.3, 4.5, 6), woodMat);
    trunk.position.set(h.x + side * 3, route.heightAt(h.x) + 2.2, route.centerAt(h.x) + side * (route.halfWidth - 2)); trunk.rotation.z = h.dir * 0.35; root.add(trunk);
  }
  return root;
}

function buildMud(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  const x1 = h.x1 ?? h.x;
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(x1 - h.x, h.halfW * 2), new THREE.MeshStandardMaterial({ color: '#2f271f', roughness: 0.35, metalness: 0.05 }));
  patch.rotation.x = -Math.PI / 2; patch.position.set((h.x + x1) / 2, route.heightAt((h.x + x1) / 2) + 0.06, worldZ(route, h)); patch.receiveShadow = true; root.add(patch);
  return root;
}

function buildRockfall(route: RouteDef, h: HazardInstance): THREE.Group {
  const mx = (h.x + (h.x1 ?? h.x)) / 2;
  const root = new THREE.Group(); root.position.set(mx, route.heightAt(mx), worldZ(route, h));
  const boulders = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = mesh(rock, rockMat); b.scale.setScalar(1.1 + rand(h.id, i) * 0.6); b.position.set((i - 1) * 2.2, 0.8, 0); boulders.add(b); }
  root.add(boulders);
  const pile = mesh(new THREE.ConeGeometry(2.4, 2.2, 6), rockMat); pile.position.set(0, 1.0, -h.dir * (h.halfW + 1.2)); root.add(pile);
  root.userData.kind = 'rockfall'; root.userData.mover = boulders; root.userData.hazard = h;
  return root;
}

function buildCrane(route: RouteDef, h: HazardInstance): THREE.Group {
  const mx = (h.x + (h.x1 ?? h.x)) / 2;
  const root = new THREE.Group(); root.position.set(mx, route.heightAt(mx), worldZ(route, h));
  for (const dz of [-1, 1]) { const post = mesh(new THREE.BoxGeometry(0.8, 9, 0.8), steelMat); post.position.set(0, 4.5, dz * (h.halfW + 0.8)); root.add(post); }
  const beam = mesh(new THREE.BoxGeometry(1.0, 0.8, h.halfW * 2 + 3), rustMat); beam.position.y = 9; root.add(beam);
  const arm = new THREE.Group(); arm.position.y = 8.6;
  const cable = mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4), darkMat); cable.position.y = -3;
  const load = mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), warnMat); load.position.y = -6.6;
  arm.add(cable, load); root.add(arm);
  root.userData.kind = 'crane'; root.userData.mover = arm; root.userData.hazard = h;
  return root;
}

export function buildHazards(route: RouteDef): THREE.Group {
  const g = new THREE.Group();
  for (const h of route.hazards) {
    if (h.type === 'rubble' || h.type === 'scree') addRocks(g, route, h, h.type === 'rubble' ? 7 : 3, h.type === 'rubble');
    else if (h.type === 'gust') g.add(buildGust(route, h));
    else if (h.type === 'gap') g.add(buildGap(route, h));
    else if (h.type === 'mud') g.add(buildMud(route, h));
    else if (h.type === 'rockfall') g.add(buildRockfall(route, h));
    else if (h.type === 'crane') g.add(buildCrane(route, h));
  }
  return g;
}

/** tick = sim tick (+ alpha). Movers read the same phase formula as the sim, so what you see is what hits you. */
export function animateHazards(group: THREE.Group, tick: number): void {
  for (const root of group.children) {
    const kind = root.userData.kind as string | undefined;
    const mover = root.userData.mover as THREE.Object3D | undefined;
    const h = root.userData.hazard as HazardInstance | undefined;
    if (!kind || !mover || !h || h.cycleTicks === undefined || h.windowTicks === undefined) continue;
    const t = Math.floor(tick);
    const cycle = h.cycleTicks, windowTicks = h.windowTicks;
    const phaseTick = (t + (h.phase ?? 0)) % cycle;
    if (kind === 'rockfall') {
      const active = moverActive(t, h);
      const f = active ? phaseTick / windowTicks : 0;              // 0 at the pile, 1 past the far side
      mover.position.z = -h.dir * (h.halfW + 1.2) + h.dir * f * (h.halfW * 2 + 2.4);
      mover.rotation.x = f * 9;
      mover.visible = active;
    } else if (kind === 'crane') {
      const swing = Math.sin(phaseTick / cycle * Math.PI * 2);      // load is over the lane when the window is open
      mover.rotation.x = -h.dir * (0.9 - 0.9 * Math.max(0, swing));
    }
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
