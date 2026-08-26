import * as THREE from 'three';
import type { Renderer, RenderPrev } from '../Renderer';
import type { ItemDef, RigState, RouteDef } from '../../sim/types';
import { buildTerrain } from './terrain';
import { animateHazards, buildHazards, disposeHazards } from './hazards';
import { buildScenery, disposeScenery, syncScenery } from './scenery';
import { Rig } from './rig';
import { CargoView } from './cargo';
import { tuning } from '../../content';
import type { CourseDef, CourseFrame } from '../../course/types';
import { CourseView } from './CourseView';
import { lerpFrame } from '../../course/interp';

const SKY = '#c8aa7d';

export class ThreeRenderer implements Renderer {
  private gl!: THREE.WebGLRenderer;
  private el!: HTMLElement;
  private readonly scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private terrain: THREE.Mesh | null = null;
  private hazardGroup: THREE.Group | null = null;
  private scenery: THREE.Group | null = null;
  private route: RouteDef | null = null;
  private readonly rig = new Rig();
  private readonly cargo = new CargoView();
  private readonly courseView = new CourseView();
  private courseMode = false;
  private orbitYaw = Math.PI + 0.42;
  private orbitPitch = 0.42;
  private orbitDistance = 15;
  private orbitDragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly desiredCamera = new THREE.Vector3();
  private readonly sun = new THREE.DirectionalLight('#ffd99b', 3.4);
  private readonly sunTarget = new THREE.Object3D();
  private lastDrawMs = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private firstFrame = true;

  mount(el: HTMLElement): void {
    this.el = el;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.08;
    el.appendChild(this.gl.domElement);
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 70, 200);
    const hemi = new THREE.HemisphereLight('#ffe8bd', '#42372e', 1.65);
    this.sun.position.set(-25, 42, 28); this.sun.castShadow = true; this.sun.target = this.sunTarget;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.camera.left = -38; this.sun.shadow.camera.right = 38; this.sun.shadow.camera.top = 38; this.sun.shadow.camera.bottom = -28;
    this.scene.add(hemi, this.sun, this.sunTarget, this.rig.group, this.courseView.group);
    this.rig.group.add(this.cargo.group);
    this.scene.add(this.cargo.debrisGroup);
    this.courseView.group.visible = false;
    this.gl.domElement.addEventListener('pointerdown', this.onOrbitStart);
    this.gl.domElement.addEventListener('pointermove', this.onOrbitMove);
    this.gl.domElement.addEventListener('pointerup', this.onOrbitEnd);
    this.gl.domElement.addEventListener('pointercancel', this.onOrbitEnd);
    this.gl.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.gl.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    this.resize();
  }

  setLoadout(items: ItemDef[]): void {
    this.cargo.setLoadout(items);
  }

  setRoute(route: RouteDef): void {
    this.courseMode = false; this.courseView.group.visible = false; this.rig.group.visible = true; this.cargo.group.visible = true;
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    this.route = route;
    this.terrain = buildTerrain(route);
    this.scene.add(this.terrain);
    if (this.hazardGroup) { this.scene.remove(this.hazardGroup); disposeHazards(this.hazardGroup); }
    this.hazardGroup = buildHazards(route);
    this.scene.add(this.hazardGroup);
    if (this.scenery) { this.scene.remove(this.scenery); disposeScenery(this.scenery); }
    this.scenery = buildScenery(route); this.scene.add(this.scenery);
    this.firstFrame = true;
  }

  draw(curr: RigState, prev: RenderPrev, alpha: number): void {
    if (!this.route) return;
    const x = prev.x + (curr.x - prev.x) * alpha;
    const z = prev.z + (curr.z - prev.z) * alpha;
    const lift = prev.lift + (curr.lift - prev.lift) * alpha;
    const lateralVel = prev.lateralVel + (curr.lateralVel - prev.lateralVel) * alpha;
    const tilt = prev.tilt + (curr.tilt - prev.tilt) * alpha;
    const speed = prev.speed + (curr.speed - prev.speed) * alpha;
    const y = this.route.heightAt(x);
    this.rig.update(x, y, z, lift, lateralVel, tilt, speed, curr.gait, curr.t + alpha, this.route);
    this.cargo.sync(curr.items, tuning, this.rig.group.position);
    const now = performance.now(); const dtSec = this.lastDrawMs ? Math.min(0.05, (now - this.lastDrawMs) / 1000) : 0; this.lastDrawMs = now;
    this.cargo.tickDebris(dtSec, (px) => this.route!.heightAt(px));
    if (this.hazardGroup) animateHazards(this.hazardGroup, curr.t / 60, x);
    if (this.scenery) syncScenery(this.scenery, curr.foundDiscoveries, curr.t / 60);
    const danger = Math.min(1, Math.abs(curr.tilt));
    const shake = danger > 0.65 ? Math.sin(curr.t * 1.7) * (danger - 0.65) * 0.25 : 0;
    this.camPos.set(x - 10.5, y + lift + 7.2 + shake, z + 10.5 + shake);
    this.camTarget.set(x + 5.5, y + lift + 1.35, z);
    if (this.firstFrame) { this.camera.position.copy(this.camPos); this.firstFrame = false; }
    else this.camera.position.lerp(this.camPos, 0.12);
    this.camera.lookAt(this.camTarget);
    this.gl.render(this.scene, this.camera);
  }

  setCourse(course: CourseDef, items: ItemDef[]): void {
    this.courseMode = true; this.courseView.group.visible = true; this.rig.group.visible = false; this.cargo.group.visible = false; this.cargo.debrisGroup.visible = false;
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); this.terrain = null; }
    if (this.hazardGroup) { this.scene.remove(this.hazardGroup); disposeHazards(this.hazardGroup); this.hazardGroup = null; }
    if (this.scenery) { this.scene.remove(this.scenery); disposeScenery(this.scenery); this.scenery = null; }
    this.route = null; this.courseView.setCourse(course, items); this.firstFrame = true;
    this.scene.background = new THREE.Color('#9fb5bd'); this.scene.fog = new THREE.Fog('#9fb5bd', 95, 245);
  }

  drawCourse(curr: CourseFrame, prev: CourseFrame, alpha: number): void {
    if (!this.courseMode) return;
    const frame = lerpFrame(prev, curr, alpha);
    this.courseView.update(frame);
    const p = frame.vehicle.position;
    this.camTarget.set(p.x, p.y + 1.8, p.z);
    this.sun.position.set(p.x - 25, p.y + 42, p.z + 28); this.sunTarget.position.set(p.x, p.y, p.z); this.sunTarget.updateMatrixWorld();
    const horizontal = Math.cos(this.orbitPitch) * this.orbitDistance;
    this.desiredCamera.set(
      this.camTarget.x + Math.cos(this.orbitYaw) * horizontal,
      this.camTarget.y + Math.sin(this.orbitPitch) * this.orbitDistance,
      this.camTarget.z + Math.sin(this.orbitYaw) * horizontal,
    );
    const direction = this.desiredCamera.clone().sub(this.camTarget); const distance = direction.length(); direction.normalize();
    this.raycaster.set(this.camTarget, direction); this.raycaster.far = distance;
    const hit = this.raycaster.intersectObjects(this.courseView.collisionMeshes, false)[0];
    const safeDistance = hit ? Math.max(3.2, hit.distance - 0.65) : distance;
    this.camPos.copy(this.camTarget).addScaledVector(direction, safeDistance);
    if (this.firstFrame) { this.camera.position.copy(this.camPos); this.firstFrame = false; }
    else this.camera.position.lerp(this.camPos, 0.16);
    this.camera.lookAt(this.camTarget);
    const targetFov = 52 + Math.min(13, frame.speed * 0.7); this.camera.fov += (targetFov - this.camera.fov) * 0.08; this.camera.updateProjectionMatrix();
    this.gl.render(this.scene, this.camera);
  }

  courseControlAxes(): { forwardX: number; forwardZ: number; rightX: number; rightZ: number } {
    const dx = this.camTarget.x - this.camera.position.x, dz = this.camTarget.z - this.camera.position.z;
    const length = Math.max(0.001, Math.hypot(dx, dz)); const forwardX = dx / length, forwardZ = dz / length;
    return { forwardX, forwardZ, rightX: -forwardZ, rightZ: forwardX };
  }

  private onOrbitStart = (event: PointerEvent): void => {
    if (!this.courseMode) return; this.orbitDragging = true; this.pointerX = event.clientX; this.pointerY = event.clientY; this.gl.domElement.setPointerCapture(event.pointerId);
  };
  private onOrbitMove = (event: PointerEvent): void => {
    if (!this.orbitDragging || !this.courseMode) return;
    this.orbitYaw -= (event.clientX - this.pointerX) * 0.006; this.orbitPitch = Math.max(0.12, Math.min(1.05, this.orbitPitch + (event.clientY - this.pointerY) * 0.004));
    this.pointerX = event.clientX; this.pointerY = event.clientY;
  };
  private onOrbitEnd = (): void => { this.orbitDragging = false; };
  private onWheel = (event: WheelEvent): void => { if (!this.courseMode) return; event.preventDefault(); this.orbitDistance = Math.max(7, Math.min(24, this.orbitDistance + event.deltaY * 0.012)); };

  resize(): void {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.terrain) { this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    if (this.hazardGroup) disposeHazards(this.hazardGroup);
    if (this.scenery) disposeScenery(this.scenery);
    this.cargo.dispose();
    this.rig.dispose();
    this.courseView.dispose();
    this.gl.domElement.removeEventListener('pointerdown', this.onOrbitStart);
    this.gl.domElement.removeEventListener('pointermove', this.onOrbitMove);
    this.gl.domElement.removeEventListener('pointerup', this.onOrbitEnd);
    this.gl.domElement.removeEventListener('pointercancel', this.onOrbitEnd);
    this.gl.domElement.removeEventListener('wheel', this.onWheel);
    this.gl.dispose(); this.gl.domElement.remove();
  }
}
