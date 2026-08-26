import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';

const ROAD = new THREE.Color('#5e5a52');
const SHOULDER = new THREE.Color('#9c7651');
const ROCK = new THREE.Color('#6f604f');

function hashNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function buildTerrain(route: RouteDef, width = 52, stepX = 2, stepZ = 2): THREE.Mesh {
  const nx = Math.ceil(route.length / stepX);
  const nz = Math.ceil(width / stepZ);
  const geo = new THREE.PlaneGeometry(route.length, width, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(route.length / 2, 0, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const centre = route.centerAt(x);
    const edge = Math.abs(z - centre) / (width / 2);
    const roadDist = Math.abs(z - centre);
    const lane = roadDist < 3.8;
    let trail = false;
    for (const discovery of route.discoveries) {
      const startX = discovery.x - 24;
      if (x < startX || x > discovery.x + 5) continue;
      const f = Math.max(0, Math.min(1, (x - startX) / 24));
      const trailZ = route.centerAt(x) + (discovery.z - route.centerAt(discovery.x)) * f;
      if (Math.abs(z - trailZ) < 1.55) { trail = true; break; }
    }
    const smoothGround = lane || trail;
    const rough = hashNoise(x, z) * (smoothGround ? 0.09 : 1.6 * Math.min(1, edge * edge));
    let drop = 0;
    for (const h of route.hazards) if (h.type === 'gap' && Math.abs(x - h.x) < 1.5 && roadDist < 5) drop = 5;
    pos.setY(i, route.heightAt(x) + rough - edge * 0.6 - drop);
    const steep = Math.min(1, Math.abs(route.slopeAt(x)) / 0.5);
    if (lane) c.copy(ROAD).lerp(SHOULDER, steep * 0.22);
    else if (trail) c.copy(SHOULDER).lerp(ROAD, 0.42);
    else c.copy(SHOULDER).lerp(ROCK, edge * 0.72).offsetHSL(0, 0, (hashNoise(x, z) - 0.5) * 0.07);
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
