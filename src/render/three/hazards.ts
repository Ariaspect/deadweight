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
  const centre = h.z ?? route.centerAt(h.x);
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

function buildHammer(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set(h.x, route.heightAt(h.x), (h.z ?? route.centerAt(h.x)) + h.dir * 2.1);
  const gantry = mesh(new THREE.BoxGeometry(0.45, 7.5, 0.45), steelMat);
  gantry.position.set(0, 3.7, -4.2); root.add(gantry);
  const arm = new THREE.Group(); arm.position.set(0, 7.1, -4.2);
  const shaft = mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 10), steelMat); shaft.position.y = -3.5;
  const head = mesh(new THREE.BoxGeometry(2.8, 1.8, 2.1), orangeMat); head.position.y = -7;
  arm.add(shaft, head); root.add(arm);
  root.userData.hazardKind = 'hammer'; root.userData.mover = arm; root.userData.phase = rand(h.id, 3) * Math.PI * 2;
  return root;
}

function buildFan(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set(h.x, route.heightAt(h.x), (h.z ?? route.centerAt(h.x)) + h.dir * -4.7);
  const stand = mesh(new THREE.BoxGeometry(0.8, 3.8, 0.8), darkMat); stand.position.y = 1.9;
  const cage = mesh(new THREE.TorusGeometry(2.05, 0.14, 8, 28), steelMat); cage.position.y = 4.1; cage.rotation.y = Math.PI / 2;
  const rotor = new THREE.Group(); rotor.position.y = 4.1; rotor.rotation.y = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const blade = mesh(new THREE.BoxGeometry(1.75, 0.38, 0.1), orangeMat); blade.position.x = 0.85; blade.rotation.z = i * Math.PI * 2 / 5; rotor.add(blade);
  }
  root.add(stand, cage, rotor); root.userData.hazardKind = 'fan'; root.userData.mover = rotor; root.userData.phase = rand(h.id, 7) * 5;
  return root;
}

function buildCrusher(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set(h.x, route.heightAt(h.x), h.z ?? route.centerAt(h.x));
  for (const z of [-3.6, 3.6]) {
    const post = mesh(new THREE.BoxGeometry(1, 8, 1), darkMat); post.position.set(0, 4, z); root.add(post);
  }
  const beam = mesh(new THREE.BoxGeometry(1.2, 1.1, 8.2), steelMat); beam.position.y = 7.5; root.add(beam);
  const press = new THREE.Group();
  const piston = mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 12), steelMat); piston.position.y = 6;
  const plate = mesh(new THREE.BoxGeometry(3.8, 0.8, 6.4), orangeMat); plate.position.y = 3.8;
  press.add(piston, plate); root.add(press);
  root.add(warningStripe(4.6));
  root.userData.hazardKind = 'crusher'; root.userData.mover = press; root.userData.hazardId = h.id;
  return root;
}

function buildLaunchpad(route: RouteDef, h: HazardInstance): THREE.Group {
  const root = new THREE.Group(); root.position.set(h.x, route.heightAt(h.x) + 0.15, h.z ?? route.centerAt(h.x));
  const ramp = mesh(new THREE.BoxGeometry(6.5, 0.35, 5.5), orangeMat); ramp.rotation.z = h.dir * -0.15; ramp.position.x = h.dir * -0.35;
  root.add(ramp, warningStripe(5.6));
  for (let i = 0; i < 4; i++) {
    const lamp = mesh(new THREE.SphereGeometry(0.13, 8, 6), warningMat); lamp.position.set(-2.2 + i * 1.45, 0.5, -2.8); root.add(lamp);
  }
  root.userData.hazardKind = 'launchpad'; root.userData.phase = rand(h.id, 13) * 4;
  return root;
}

export function buildHazards(route: RouteDef): THREE.Group {
  const g = new THREE.Group();
  for (const h of route.hazards) {
    const y = route.heightAt(h.x);
    if (h.type === 'rubble' || h.type === 'scree') addRocks(g, route, h, h.type === 'rubble' ? 7 : 3, h.type === 'rubble');
    else if (h.type === 'gust') {
      for (let i = 0; i < 5; i++) {
        const m = mesh(new THREE.PlaneGeometry(0.45, 8), dustMat);
        m.position.set(h.x - 3 + i * 1.5, y + 4, (h.z ?? route.centerAt(h.x)) + (i % 2 ? 1 : -1) * 2); m.rotation.y = Math.PI / 2; g.add(m);
      }
    } else if (h.type === 'gap') {
      const centre = h.z ?? route.centerAt(h.x);
      const pit = mesh(new THREE.BoxGeometry(3.4, 0.55, 10), darkMat); pit.position.set(h.x, y - 4.8, centre); g.add(pit);
      for (const dx of [-1.75, 1.75]) { const edge = warningStripe(1.2); edge.position.set(h.x + dx, y + 0.04, centre); g.add(edge); }
    } else if (h.type === 'hammer') g.add(buildHammer(route, h));
    else if (h.type === 'fan') g.add(buildFan(route, h));
    else if (h.type === 'crusher') g.add(buildCrusher(route, h));
    else if (h.type === 'launchpad') g.add(buildLaunchpad(route, h));
  }
  return g;
}

export function animateHazards(group: THREE.Group, timeSec: number, rigX: number): void {
  for (const root of group.children) {
    const kind = root.userData.hazardKind as string | undefined;
    const mover = root.userData.mover as THREE.Object3D | undefined;
    const phase = Number(root.userData.phase ?? 0);
    if (kind === 'hammer' && mover) mover.rotation.x = Math.sin(timeSec * 1.75 + phase) * 1.05;
    else if (kind === 'fan' && mover) mover.rotation.z = timeSec * 9 + phase;
    else if (kind === 'crusher' && mover) {
      const tick = (timeSec * 60 + Number(root.userData.hazardId ?? 0) * 73) % 180;
      const open = tick < 75 ? 0 : tick < 105 ? (tick - 75) / 30 : tick < 155 ? 1 : (180 - tick) / 25;
      mover.position.y = -(1 - Math.max(0, open)) * 3.1;
    } else if (kind === 'launchpad') {
      const close = Math.abs(root.position.x - rigX) < 14;
      for (const child of root.children) if (child instanceof THREE.Mesh && child.geometry.type === 'SphereGeometry') child.visible = !close || Math.floor(timeSec * 8) % 2 === 0;
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
