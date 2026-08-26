import * as THREE from 'three';
import type { Missile, RouteDef } from '../../sim/types';

// Rarely more than two missiles are in flight at once (see turret.cooldownTicks / flightTicks), but a
// generous pool costs nothing and means a firing burst never has to allocate mid-run.
const MISSILE_POOL_SIZE = 8;
const LOFT_BASE = 2.1;    // roughly cab height, so a missile reads as an inbound threat, not a ground hazard
const LOFT_ARC = 4.5;     // extra height at the midpoint of the flight, easing back down toward impact

const baseMat = new THREE.MeshStandardMaterial({ color: '#3a3632', roughness: 0.85, metalness: 0.3, flatShading: true });
const barrelMat = new THREE.MeshStandardMaterial({ color: '#54504a', roughness: 0.55, metalness: 0.6, flatShading: true });
const missileMat = new THREE.MeshStandardMaterial({ color: '#c94f3a', roughness: 0.4, metalness: 0.4, emissive: '#5a140a', emissiveIntensity: 0.7 });

const baseGeo = new THREE.CylinderGeometry(1.6, 1.9, 1.2, 8);
const barrelGeo = new THREE.CylinderGeometry(0.22, 0.28, 3.2, 8);
const missileGeo = new THREE.ConeGeometry(0.22, 1.15, 6);

// Registered so disposeTurrets skips them: these are shared module-level singletons, deliberately
// never disposed (matching hazards.ts / walls.ts), or the next route renders black.
const SHARED_GEOMETRIES: THREE.BufferGeometry[] = [baseGeo, barrelGeo, missileGeo];
const SHARED_MATERIALS: THREE.Material[] = [baseMat, barrelMat, missileMat];

/** One silhouette per `route.turrets` entry, plus a hidden pool of missile meshes `syncMissiles` drives. */
export function buildTurrets(route: RouteDef): THREE.Group {
  const group = new THREE.Group();
  for (const t of route.turrets) {
    const emplacement = new THREE.Group();
    emplacement.position.set(t.x, route.heightAt(t.x), route.centerAt(t.x) + t.z);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.6; base.castShadow = true; base.receiveShadow = true;
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.y = 1.9;
    // lean the barrel toward the corridor centre line so the silhouette reads as aiming inward
    barrel.rotation.z = (t.z >= 0 ? 1 : -1) * 0.85;
    barrel.castShadow = true;
    emplacement.add(base, barrel);
    group.add(emplacement);
  }

  const pool: THREE.Mesh[] = [];
  for (let i = 0; i < MISSILE_POOL_SIZE; i++) {
    const m = new THREE.Mesh(missileGeo, missileMat);
    m.visible = false;
    m.castShadow = true;
    pool.push(m);
    group.add(m);
  }
  group.userData.missilePool = pool;
  return group;
}

/**
 * Shows one mesh per live missile at its corridor (x, z), converted to world space, with a height that
 * eases up and back down over the flight; hides whatever pool slots are unused. `tick` is the render's
 * fractional sim tick (curr.t + alpha) — missiles carry launchTick/impactTick, not a live elapsed count,
 * so the caller's current tick is what turns those into a flight fraction.
 */
export function syncMissiles(group: THREE.Group, missiles: Missile[], route: RouteDef, tick: number): void {
  const pool = group.userData.missilePool as THREE.Mesh[] | undefined;
  if (!pool) return;
  let i = 0;
  for (; i < missiles.length && i < pool.length; i++) {
    const m = missiles[i]!;
    const mesh = pool[i]!;
    const span = Math.max(1, m.impactTick - m.launchTick);
    const fraction = Math.min(1, Math.max(0, (tick - m.launchTick) / span));
    const worldZ = route.centerAt(m.x) + m.z;
    const y = route.heightAt(m.x) + LOFT_BASE + Math.sin(Math.PI * fraction) * LOFT_ARC;
    mesh.position.set(m.x, y, worldZ);
    mesh.rotation.z = m.z >= 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.visible = true;
  }
  for (; i < pool.length; i++) pool[i]!.visible = false;
}

export function disposeTurrets(group: THREE.Group): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!SHARED_GEOMETRIES.includes(child.geometry)) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) if (!SHARED_MATERIALS.includes(material)) material.dispose();
  });
}
