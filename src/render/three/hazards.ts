import * as THREE from 'three';
import type { HazardInstance, RouteDef } from '../../sim/types';
import { moverActive } from '../../sim/step';
import { placeAsset, type PropLibrary } from './props';

function rand(id: number, salt: number): number {
  const n = Math.sin((id + 11) * 91.73 + salt * 37.19) * 43758.5453;
  return n - Math.floor(n);
}

const worldZ = (route: RouteDef, h: HazardInstance): number => route.centerAt(h.x) + h.z;

function addRocks(g: THREE.Group, props: PropLibrary, route: RouteDef, h: HazardInstance, count: number, large: boolean): void {
  for (let i = 0; i < count; i++) {
    const height = large ? 0.85 + rand(h.id, i) * 1.2 : 0.4 + rand(h.id, i) * 0.55;
    const px = h.x + (rand(h.id, i + 20) - 0.5) * 4.5;
    const name = i % 3 === 0 ? 'rocksA' : i % 2 ? 'rockA' : 'rockB';
    placeAsset(g, props, name, height, px, route.heightAt(px), worldZ(route, h) + (rand(h.id, i + 40) - 0.5) * h.halfW * 1.6, rand(h.id, i + 60) * Math.PI * 2);
  }
}

function buildGap(route: RouteDef, props: PropLibrary, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  root.position.set(h.x, route.heightAt(h.x), worldZ(route, h));
  const near = placeAsset(root, props, 'terrainSlope', 1.7, -2.3, -1.45, 0, Math.PI / 2);
  const far = placeAsset(root, props, 'terrainSlope', 1.7, 2.3, -1.45, 0, -Math.PI / 2);
  near?.scale.set(1.15, 1, Math.max(1, h.halfW / 2));
  far?.scale.set(1.15, 1, Math.max(1, h.halfW / 2));
  placeAsset(root, props, 'tunnel', 0.9, 0, -5.0, 0, Math.PI / 2)?.scale.set(1.7, 1, Math.max(1, h.halfW / 2));
  return root;
}

function buildGust(route: RouteDef, props: PropLibrary, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  for (const side of [-1, 1]) {
    const x = h.x + side * 2.5;
    placeAsset(root, props, 'windTurbine', 6.5, x, route.heightAt(x), route.centerAt(x) + side * (route.halfWidth - 1.2), h.dir * Math.PI / 2);
  }
  return root;
}

function buildMud(route: RouteDef, props: PropLibrary, h: HazardInstance): THREE.Group {
  const root = new THREE.Group();
  const x1 = h.x1 ?? h.x;
  for (let x = h.x + 1; x < x1; x += 3.6) {
    const patch = placeAsset(root, props, 'terrainLow', 0.28, x, route.heightAt(x) - 0.13, route.centerAt(x) + h.z, (x % 2) * Math.PI);
    patch?.scale.set(1.3, 0.55, Math.max(1, h.halfW / 2));
  }
  return root;
}

function buildRockfall(route: RouteDef, props: PropLibrary, h: HazardInstance): THREE.Group {
  const mx = (h.x + (h.x1 ?? h.x)) / 2;
  const root = new THREE.Group();
  root.position.set(mx, route.heightAt(mx), worldZ(route, h));
  const boulders = props.clone('rocksB', 2.4) ?? new THREE.Group();
  root.add(boulders);
  const pile = placeAsset(root, props, 'rocksA', 2.1, 0, 0, -h.dir * (h.halfW + 1.2), h.dir * 0.7);
  pile?.scale.set(1.5, 1, 1.4);
  root.userData.kind = 'rockfall';
  root.userData.mover = boulders;
  root.userData.hazard = h;
  return root;
}

function buildCrane(route: RouteDef, props: PropLibrary, h: HazardInstance): THREE.Group {
  const mx = (h.x + (h.x1 ?? h.x)) / 2;
  const root = new THREE.Group();
  root.position.set(mx, route.heightAt(mx), worldZ(route, h));
  const drill = placeAsset(root, props, 'drill', 10.5, 0, 0, -h.dir * (h.halfW + 3.2), h.dir > 0 ? 0 : Math.PI);
  drill?.scale.set(1.15, 1, 1.15);
  const arm = new THREE.Group();
  arm.position.y = 9.3;
  const load = props.clone('cargoStacked', 2.1);
  if (load) { load.position.y = -6.7; arm.add(load); }
  root.add(arm);
  root.userData.kind = 'crane';
  root.userData.mover = arm;
  root.userData.hazard = h;
  return root;
}

export function buildHazards(route: RouteDef, props: PropLibrary): THREE.Group {
  const group = new THREE.Group();
  for (const h of route.hazards) {
    if (h.type === 'rubble' || h.type === 'scree') addRocks(group, props, route, h, h.type === 'rubble' ? 7 : 3, h.type === 'rubble');
    else if (h.type === 'gust') group.add(buildGust(route, props, h));
    else if (h.type === 'gap') group.add(buildGap(route, props, h));
    else if (h.type === 'mud') group.add(buildMud(route, props, h));
    else if (h.type === 'rockfall') group.add(buildRockfall(route, props, h));
    else if (h.type === 'crane') group.add(buildCrane(route, props, h));
  }
  return group;
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
      const f = active ? phaseTick / windowTicks : 0;
      mover.position.z = -h.dir * (h.halfW + 1.2) + h.dir * f * (h.halfW * 2 + 2.4);
      mover.rotation.x = f * 9;
      mover.visible = active;
    } else if (kind === 'crane') {
      const swing = Math.sin(phaseTick / cycle * Math.PI * 2);
      mover.rotation.x = -h.dir * (0.9 - 0.9 * Math.max(0, swing));
    }
  }
}

export function disposeHazards(group: THREE.Group): void { group.clear(); }
