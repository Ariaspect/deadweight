import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';

const mountainMat = new THREE.MeshStandardMaterial({ color: '#706456', roughness: 1, flatShading: true });
const mountainFarMat = new THREE.MeshStandardMaterial({ color: '#9b8870', roughness: 1, flatShading: true });
const postMat = new THREE.MeshStandardMaterial({ color: '#30363a', roughness: 0.8, metalness: 0.3 });
const orangeMat = new THREE.MeshStandardMaterial({ color: '#ed5a1d', roughness: 0.7 });
const cacheMat = new THREE.MeshStandardMaterial({ color: '#3de2c4', emissive: '#0e665b', emissiveIntensity: 1.4, roughness: 0.32, metalness: 0.55 });
const beaconMat = new THREE.MeshBasicMaterial({ color: '#78ffe8', transparent: true, opacity: 0.68, side: THREE.DoubleSide });

function noise(n: number): number { const x = Math.sin(n * 78.233) * 43758.5453; return x - Math.floor(x); }

function discoverySite(route: RouteDef, id: number, x: number, z: number): THREE.Group {
  const site = new THREE.Group(); site.position.set(x, route.heightAt(x), z); site.userData.discoveryId = id;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 1.1), cacheMat); crate.position.y = 0.45; crate.castShadow = true;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5, 7), postMat); mast.position.set(0, 2.5, -0.8);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 1.35, 7, 18, 1, true), beaconMat); beacon.position.y = 3.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 24), cacheMat); ring.position.y = 2.4; ring.rotation.x = Math.PI / 2;
  site.add(crate, mast, beacon, ring);
  if (id % 2 === 0) {
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), postMat);
    dish.scale.y = 0.25; dish.rotation.z = -0.5; dish.position.set(1.8, 1.25, 0.6); site.add(dish);
  } else {
    for (let i = 0; i < 3; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8), orangeMat);
      barrel.position.set(-1.5 + i * 0.7, 0.4, 0.9); barrel.castShadow = true; site.add(barrel);
    }
  }
  return site;
}

export function buildScenery(route: RouteDef): THREE.Group {
  const group = new THREE.Group();
  const cone = new THREE.ConeGeometry(1, 1, 5);
  const postGeo = new THREE.BoxGeometry(0.12, 1.4, 0.12);
  const markerGeo = new THREE.BoxGeometry(0.42, 0.18, 0.08);
  for (let x = 10; x < route.length; x += 18) {
    const centre = route.centerAt(x);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat); post.position.set(x, route.heightAt(x) + 0.7, centre + side * 5.1);
      const marker = new THREE.Mesh(markerGeo, orangeMat); marker.position.set(x, route.heightAt(x) + 1.15, centre + side * 5.1);
      group.add(post, marker);
    }
  }
  for (let x = 25; x < route.length; x += 50) {
    const centre = route.centerAt(x);
    for (const side of [-1, 1]) {
      const boundary = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.7, 6), orangeMat);
      boundary.position.set(x, route.heightAt(x) + 1.35, centre + side * 13.8); boundary.castShadow = true; group.add(boundary);
    }
  }
  for (let i = 0; i < Math.ceil(route.length / 26); i++) {
    const x = i * 26 + noise(i + route.seed) * 18;
    const side = i % 2 ? -1 : 1;
    const distance = 30 + noise(i * 3 + route.seed) * 28;
    const height = 10 + noise(i * 7 + route.seed) * 25;
    const m = new THREE.Mesh(cone, distance > 42 ? mountainFarMat : mountainMat);
    m.scale.set(8 + noise(i * 11) * 12, height, 8 + noise(i * 13) * 10);
    m.position.set(x, route.heightAt(x) + height * 0.45 - 3, route.centerAt(x) + side * distance);
    m.rotation.y = noise(i * 17) * Math.PI; m.receiveShadow = true; group.add(m);
  }
  for (const discovery of route.discoveries) group.add(discoverySite(route, discovery.id, discovery.x, discovery.z));

  const finishZ = route.centerAt(route.length);
  const finish = new THREE.Group(); finish.position.set(route.length, route.heightAt(route.length), finishZ);
  for (const z of [-4, 4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.35), postMat); p.position.set(0, 3, z); finish.add(p); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 8.4), orangeMat); top.position.y = 5.7; finish.add(top);
  group.add(finish);
  group.userData.geometries = [cone, postGeo, markerGeo];
  return group;
}

export function syncScenery(group: THREE.Group, found: number[], timeSec: number): void {
  for (const child of group.children) {
    const id = child.userData.discoveryId as number | undefined;
    if (id === undefined) continue;
    const collected = found.includes(id); child.visible = !collected;
    if (!collected) {
      child.rotation.y = Math.sin(timeSec * 0.7 + id) * 0.08;
      const ring = child.children.find((c) => c instanceof THREE.Mesh && c.geometry.type === 'TorusGeometry');
      if (ring) ring.rotation.z = timeSec * 0.8;
    }
  }
}

export function disposeScenery(group: THREE.Group): void {
  for (const geometry of group.userData.geometries as THREE.BufferGeometry[] ?? []) geometry.dispose();
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!(group.userData.geometries as THREE.BufferGeometry[]).includes(child.geometry)) child.geometry.dispose();
  });
}
