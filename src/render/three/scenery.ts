import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';
import { placeAsset, type PropLibrary } from './props';

function noise(n: number): number { const x = Math.sin(n * 78.233) * 43758.5453; return x - Math.floor(x); }

function discoverySite(route: RouteDef, props: PropLibrary, id: number, x: number, z: number): THREE.Group {
  const site = new THREE.Group();
  site.position.set(x, route.heightAt(x), route.centerAt(x) + z);
  site.userData.discoveryId = id;
  placeAsset(site, props, 'landerBase', 0.55, 0, 0, 0, id * 0.7);
  if (id % 2 === 0) {
    placeAsset(site, props, 'lander', 2.1, 0, 0.25, 0, id * 0.7);
    placeAsset(site, props, 'solarPanel', 1.1, 2.1, 0, 0.7, -0.4);
  } else {
    placeAsset(site, props, 'cargoStacked', 1.25, 0, 0.2, 0, id * 0.4);
    placeAsset(site, props, 'containersB', 0.85, -1.6, 0, 0.7, 0.5);
  }
  placeAsset(site, props, 'lights', 2.8, 0, 0, -1.8);
  return site;
}

export function buildScenery(route: RouteDef, props: PropLibrary): THREE.Group {
  const group = new THREE.Group();

  // Authored light towers replace the old box-and-post corridor markers.
  for (let x = 10; x < route.length; x += 22) {
    const centre = route.centerAt(x);
    for (const side of [-1, 1]) placeAsset(group, props, 'lights', 1.8, x, route.heightAt(x), centre + side * 5.2, side < 0 ? Math.PI : 0);
  }

  // Large KayKit terrain modules form the distant basin and cliff silhouette.
  for (let i = 0; i < Math.ceil(route.length / 30); i++) {
    const x = i * 30 + noise(i + route.seed) * 18;
    const side = i % 2 ? -1 : 1;
    const distance = 26 + noise(i * 3 + route.seed) * 22;
    const height = 9 + noise(i * 7 + route.seed) * 17;
    const name = i % 3 === 0 ? 'terrainMining' : i % 3 === 1 ? 'terrainTall' : 'terrainSlope';
    const cliff = placeAsset(group, props, name, height, x, route.heightAt(x) - 2.5, route.centerAt(x) + side * distance, noise(i * 17) * Math.PI);
    cliff?.scale.set(1.3 + noise(i * 11) * 1.4, 1, 1.3 + noise(i * 13) * 1.7);
  }

  // Small authored props make the corridor feel inhabited without changing collision.
  for (let x = 30, i = 0; x < route.length - 25; x += 46, i++) {
    const side = i % 2 ? -1 : 1;
    const z = route.centerAt(x) + side * (7 + noise(route.seed + i) * 3);
    const name = i % 4 === 0 ? 'solarPanel' : i % 4 === 1 ? 'cargoStacked' : i % 4 === 2 ? 'base' : 'containersA';
    const height = name === 'base' ? 3.2 : name === 'solarPanel' ? 1.35 : 1.15;
    placeAsset(group, props, name, height, x, route.heightAt(x), z, noise(i * 13) * Math.PI);
  }

  for (const discovery of route.discoveries) group.add(discoverySite(route, props, discovery.id, discovery.x, discovery.z));

  const finishX = route.length;
  const finishZ = route.centerAt(finishX);
  placeAsset(group, props, 'landingPad', 1.45, finishX, route.heightAt(finishX) - 0.08, finishZ, Math.PI / 2);
  placeAsset(group, props, 'depot', 5.2, finishX + 7, route.heightAt(finishX), finishZ + 8, -Math.PI / 2);
  placeAsset(group, props, 'garage', 4.3, finishX + 7, route.heightAt(finishX), finishZ - 8, -Math.PI / 2);
  for (const z of [-4.4, 4.4]) placeAsset(group, props, 'lights', 4.5, finishX, route.heightAt(finishX), finishZ + z);
  return group;
}

export function syncScenery(group: THREE.Group, found: number[], timeSec: number): void {
  for (const child of group.children) {
    const id = child.userData.discoveryId as number | undefined;
    if (id === undefined) continue;
    const collected = found.includes(id);
    child.visible = !collected;
    if (!collected) child.rotation.y = Math.sin(timeSec * 0.7 + id) * 0.08;
  }
}

export function disposeScenery(group: THREE.Group): void { group.clear(); }
