import * as THREE from 'three';
import type { RouteDef } from '../../sim/types';
import { tuning } from '../../content';

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
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), wz = pos.getZ(i);
    const rz = wz - route.centerAt(x);                 // corridor z
    const inside = Math.abs(rz) <= bound;
    let drop = 0;
    for (const h of route.hazards) if (h.type === 'gap' && Math.abs(x - h.x) < 1.5 && Math.abs(rz - h.z) < h.halfW) drop = 5;
    const rough = inside ? hashNoise(x, wz) * 0.12 : hashNoise(x, wz) * 1.4;
    pos.setY(i, route.heightAt(x) + rough - (inside ? 0 : 0.8) - drop);
  }
  geo.computeVertexNormals();
  const texture = new THREE.TextureLoader().load(new URL('../../assets/models/dirt.png', import.meta.url).href);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.repeat.set(route.length / 5, width / 5);
  const mat = new THREE.MeshStandardMaterial({ map: texture, color: '#9a8065', flatShading: true, roughness: 0.98 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
