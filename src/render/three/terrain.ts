import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';

const CREAM = new THREE.Color('#d8c8a0');
const ORANGE = new THREE.Color('#b8561f');
const GUN = new THREE.Color('#5a5e63');

function hashNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function buildTerrain(route: RouteDef, width = 24, stepX = 2, stepZ = 2): THREE.Mesh {
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
    const edge = Math.abs(z) / (width / 2);          // 0 at path centre, 1 at edge
    const rough = hashNoise(x, z) * 1.6 * edge * edge;
    let drop = 0;
    for (const h of route.hazards) if (h.type === 'gap' && Math.abs(x - h.x) < 1.5) drop = 5;
    pos.setY(i, route.heightAt(x) + rough - edge * 0.6 - drop);
    const steep = Math.min(1, Math.abs(route.slopeAt(x)) / 0.5);
    c.copy(CREAM).lerp(ORANGE, steep).lerp(GUN, edge * 0.35);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}
