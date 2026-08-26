import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export type PropName =
  | 'base' | 'garage' | 'depot' | 'cargoA' | 'cargoB' | 'cargoPacked' | 'cargoStacked'
  | 'containersA' | 'containersB' | 'drill' | 'lander' | 'landerBase' | 'landingPad'
  | 'lights' | 'rockA' | 'rockB' | 'rocksA' | 'rocksB' | 'solarPanel' | 'trailer'
  | 'structureLow' | 'structureTall' | 'terrainLow' | 'terrainMining' | 'terrainSlope'
  | 'terrainTall' | 'tunnel' | 'windTurbine'
  | 'ruinA' | 'ruinB';

const FILES: Record<PropName, string> = {
  base: 'basemodule_A',
  garage: 'basemodule_garage',
  depot: 'cargodepot_C',
  cargoA: 'cargo_A',
  cargoB: 'cargo_B',
  cargoPacked: 'cargo_A_packed',
  cargoStacked: 'cargo_A_stacked',
  containersA: 'containers_A',
  containersB: 'containers_B',
  drill: 'drill_structure',
  lander: 'lander_A',
  landerBase: 'lander_base',
  landingPad: 'landingpad_large',
  lights: 'lights',
  rockA: 'rock_A',
  rockB: 'rock_B',
  rocksA: 'rocks_A',
  rocksB: 'rocks_B',
  solarPanel: 'solarpanel',
  trailer: 'spacetruck_trailer',
  structureLow: 'structure_low',
  structureTall: 'structure_tall',
  terrainLow: 'terrain_low',
  terrainMining: 'terrain_mining',
  terrainSlope: 'terrain_slope',
  terrainTall: 'terrain_tall',
  tunnel: 'tunnel_straight_A',
  windTurbine: 'windturbine_tall',
  ruinA: '', ruinB: '',   // GLB, loaded from assets/models — see RUIN_FILES
};

/** Decimated Pixabay ruins: meshopt-compressed GLB, 95 MB of source art down to 630 KB for the pair. */
const RUIN_FILES: Partial<Record<PropName, string>> = { ruinA: 'ruin_a.glb', ruinB: 'ruin_b.glb' };

interface Source {
  scene: THREE.Object3D;
  size: THREE.Vector3;
  center: THREE.Vector3;
  minY: number;
}

export class PropLibrary {
  constructor(private readonly sources: Map<PropName, Source>) {}

  /** Clone an authored model, centre it on X/Z, place its base at Y=0, and normalize to the requested height. */
  clone(name: PropName, height: number): THREE.Group | null {
    const source = this.sources.get(name);
    if (!source) return null;
    const model = source.scene.clone(true);
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const scale = height / Math.max(0.001, source.size.y);
    model.scale.setScalar(scale);
    model.position.set(-source.center.x * scale, -source.minY * scale, -source.center.z * scale);
    const root = new THREE.Group();
    root.add(model);
    root.userData.asset = name;
    return root;
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    for (const source of this.sources.values()) source.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      geometries.add(child.geometry);
      const list = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
}

export async function loadPropLibrary(): Promise<PropLibrary> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);   // the ruins are meshopt-compressed; the decoder is a bundled module
  const root = `${import.meta.env.BASE_URL}assets/`;
  const base = `${root}kaykit/`;
  const entries = await Promise.all((Object.entries(FILES) as [PropName, string][]).map(async ([name, file]) => {
    const url = RUIN_FILES[name] ? `${root}models/${RUIN_FILES[name]}` : `${base}${file}.gltf`;
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    return [name, { scene: gltf.scene, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), minY: box.min.y }] as const;
  }));
  return new PropLibrary(new Map(entries));
}

export function placeAsset(group: THREE.Group, props: PropLibrary, name: PropName, height: number, x: number, y: number, z: number, rotation = 0): THREE.Group | null {
  const prop = props.clone(name, height);
  if (!prop) return null;
  prop.position.set(x, y, z);
  prop.rotation.y = rotation;
  group.add(prop);
  return prop;
}
