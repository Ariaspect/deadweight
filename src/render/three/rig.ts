import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Gait, RouteDef } from '../../sim/types';
import type { PropLibrary } from './props';

const MAX_PITCH = 0.5;
const ROBOT_HEIGHT = 3.4;

type Motion = 'idle' | 'walk' | 'run' | 'jump';

export class Rig {
  readonly group = new THREE.Group();
  private readonly visual = new THREE.Group();
  private trailer: THREE.Group | null = null;
  private robot: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<Motion, THREE.AnimationAction>();
  private motion: Motion | null = null;
  private lastTick = 0;
  private disposed = false;

  constructor() {
    this.visual.rotation.y = Math.PI / 2;
    this.group.add(this.visual);
    void this.loadRobot().catch((error: unknown) => console.warn('CC0 robot did not load.', error));
  }

  private async loadRobot(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(new URL('../../assets/models/Robot.glb', import.meta.url).href);
    const robot = gltf.scene;
    if (this.disposed) return;
    robot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    robot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(robot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = ROBOT_HEIGHT / Math.max(0.001, size.y);
    robot.scale.setScalar(scale);
    robot.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    this.visual.add(robot);
    this.robot = robot;
    this.mixer = new THREE.AnimationMixer(robot);
    const find = (part: string): THREE.AnimationClip | undefined => gltf.animations.find((clip) => clip.name.toLowerCase().includes(part));
    for (const [motion, part] of [['idle', 'idle'], ['walk', 'walking'], ['run', 'running'], ['jump', 'walkjump']] as const) {
      const clip = find(part);
      if (clip) this.actions.set(motion, this.mixer.clipAction(clip));
    }
    this.setMotion('idle');
  }

  setPropLibrary(props: PropLibrary): void {
    if (this.trailer) this.group.remove(this.trailer);
    const trailer = props.clone('trailer', 0.9);
    if (!trailer) return;
    trailer.position.set(-2.35, 0, 0);
    trailer.rotation.y = Math.PI / 2;
    trailer.scale.set(1.45, 1, 1.35);
    this.group.add(trailer);
    this.trailer = trailer;
  }

  private setMotion(next: Motion): void {
    if (next === this.motion) return;
    const previous = this.motion ? this.actions.get(this.motion) : undefined;
    const action = this.actions.get(next);
    if (!action) return;
    previous?.fadeOut(0.16);
    action.reset().fadeIn(0.16).play();
    this.motion = next;
  }

  update(x: number, y: number, z: number, lift: number, lateralVel: number, tilt: number, speed: number, gait: Gait, tick: number, route: RouteDef): void {
    void route;
    this.group.position.set(x, y + lift, z);
    this.group.rotation.z = tilt * MAX_PITCH;
    this.group.rotation.x = clamp(-lateralVel * 0.035, -0.28, 0.28);
    const dt = this.lastTick ? clamp((tick - this.lastTick) / 60, 0, 0.1) : 0;
    this.lastTick = tick;
    const motion: Motion = lift > 0.08 ? 'jump' : gait === 0 || speed < 0.3 ? 'idle' : speed > 8 ? 'run' : 'walk';
    this.setMotion(motion);
    const current = this.actions.get(motion);
    if (current) current.timeScale = motion === 'run' ? clamp(speed / 10, 0.7, 1.6) : motion === 'walk' ? clamp(speed / 4, 0.65, 1.5) : 1;
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.robot) this.robot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    });
    this.group.clear();
  }
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
