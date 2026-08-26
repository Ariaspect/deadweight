import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';
import { tuning } from '../../content';

const EARTH = new THREE.Color('#5a544b');
const EARTH_LIGHT = new THREE.Color('#6b6157');
const RUT = new THREE.Color('#47423a');
const OUTSIDE = new THREE.Color('#4a453f');
const MUD = new THREE.Color('#3a3128');

function hashNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function buildTerrain(route: RouteDef, stepX = 2, stepZ = 2): THREE.Mesh {
  const bound = route.halfWidth + tuning.terrain.pocketDepth;
  const width = 2 * bound + 24;
  const nx = Math.ceil(route.length / stepX), nz = Math.ceil(width / stepZ);
  const geo = new THREE.PlaneGeometry(route.length, width, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(route.length / 2, 0, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), wz = pos.getZ(i);
    const rz = wz - route.centerAt(x);                 // corridor z
    const inside = Math.abs(rz) <= bound;
    const fork = route.forkAt(x);
    let rut = false;
    if (fork) for (const lane of fork.lanes) if (Math.abs(rz - (lane.z0 + lane.z1) / 2) < 1.2) rut = true;
    if (!fork && Math.abs(rz) < 1.4) rut = true;
    const mud = route.zones.some((h) => h.type === 'mud' && h.x1 !== undefined && x >= h.x && x <= h.x1 && Math.abs(rz - h.z) < h.halfW);
    let drop = 0;
    for (const h of route.hazards) if (h.type === 'gap' && Math.abs(x - h.x) < 1.5 && Math.abs(rz - h.z) < h.halfW) drop = 5;
    const rough = inside ? hashNoise(x, wz) * 0.12 : hashNoise(x, wz) * 1.4;
    pos.setY(i, route.heightAt(x) + rough - (inside ? 0 : 0.8) - drop);
    if (!inside) c.copy(OUTSIDE).offsetHSL(0, 0, (hashNoise(x, wz) - 0.5) * 0.06);
    else if (mud) c.copy(MUD);
    else if (rut) c.copy(RUT);
    else c.copy(EARTH).lerp(EARTH_LIGHT, hashNoise(x * 0.3, wz * 0.3));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
