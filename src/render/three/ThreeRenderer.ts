import * as THREE from 'three';
import type { Renderer, RenderPrev } from '../Renderer';
import type { ItemDef, RigState, RouteDef } from '../../sim/types';
import { buildTerrain, setTerrainRadar } from './terrain';
import { animateHazards, buildHazards, disposeHazards, setHazardsRadar } from './hazards';
import { buildScenery, disposeScenery, syncScenery } from './scenery';
import { buildWalls, disposeWalls, setWallsRadar } from './walls';
import { buildTurrets, disposeTurrets, syncMissiles } from './turret';
import { Rig } from './rig';
import { CargoView } from './cargo';
import { tuning } from '../../content';

const SKY = '#b9b0a3';
const SAND = '#c2a06a';
const FOG_CLEAR_NEAR = 60, FOG_CLEAR_FAR = 180;
const FOG_STORM_NEAR = 10, FOG_STORM_FAR = 26;

export class ThreeRenderer implements Renderer {
  private gl!: THREE.WebGLRenderer;
  private el!: HTMLElement;
  private readonly scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private terrain: THREE.Mesh | null = null;
  private hazardGroup: THREE.Group | null = null;
  private scenery: THREE.Group | null = null;
  private walls: THREE.Group | null = null;
  private turrets: THREE.Group | null = null;
  private route: RouteDef | null = null;
  private readonly rig = new Rig();
  private readonly cargo = new CargoView();
  private readonly sun = new THREE.DirectionalLight('#e8c39a', 3.0);
  private readonly sunTarget = new THREE.Object3D();
  private lastDrawMs = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private firstFrame = true;
  private radarOn = false;
  private readonly stormFog = new THREE.Color();

  mount(el: HTMLElement): void {
    this.el = el;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    el.appendChild(this.gl.domElement);
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 60, 180);
    const hemi = new THREE.HemisphereLight('#c9bfae', '#3e3a35', 1.4);
    const shadowSize = window.innerWidth < 900 ? 1024 : 2048;
    this.sun.position.set(-25, 42, 28); this.sun.castShadow = true; this.sun.target = this.sunTarget;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize); this.sun.shadow.camera.left = -38; this.sun.shadow.camera.right = 38; this.sun.shadow.camera.top = 38; this.sun.shadow.camera.bottom = -28;
    this.scene.add(hemi, this.sun, this.sunTarget, this.rig.group);
    this.rig.group.add(this.cargo.group);
    this.scene.add(this.cargo.debrisGroup);
    this.resize();
  }

  setLoadout(items: ItemDef[]): void { this.cargo.setLoadout(items); }

  setRoute(route: RouteDef): void {
    // dispose the mesh's own material, never the shared radarGround singleton it may currently be wearing
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); ((this.terrain.userData.baseMaterial as THREE.Material | undefined) ?? this.terrain.material as THREE.Material).dispose(); }
    this.route = route;
    this.terrain = buildTerrain(route);
    this.scene.add(this.terrain);
    if (this.hazardGroup) { this.scene.remove(this.hazardGroup); disposeHazards(this.hazardGroup); }
    this.hazardGroup = buildHazards(route);
    this.scene.add(this.hazardGroup);
    if (this.scenery) { this.scene.remove(this.scenery); disposeScenery(this.scenery); }
    this.scenery = buildScenery(route); this.scene.add(this.scenery);
    if (this.walls) { this.scene.remove(this.walls); disposeWalls(this.walls); }
    this.walls = buildWalls(route); this.scene.add(this.walls);
    if (this.turrets) { this.scene.remove(this.turrets); disposeTurrets(this.turrets); }
    this.turrets = buildTurrets(route); this.scene.add(this.turrets);
    this.firstFrame = true;
  }

  draw(curr: RigState, prev: RenderPrev, alpha: number): void {
    if (!this.route) return;
    const x = prev.x + (curr.x - prev.x) * alpha;
    const rz = prev.z + (curr.z - prev.z) * alpha;
    const z = this.route.centerAt(x) + rz;
    const lift = prev.lift + (curr.lift - prev.lift) * alpha;
    const lateralVel = prev.lateralVel + (curr.lateralVel - prev.lateralVel) * alpha;
    const tilt = prev.tilt + (curr.tilt - prev.tilt) * alpha;
    const speed = prev.speed + (curr.speed - prev.speed) * alpha;
    const y = this.route.heightAt(x);
    this.rig.update(x, y, z, lift, lateralVel, tilt, speed, curr.gait, curr.t + alpha, this.route);
    this.cargo.sync(curr.items, tuning, this.rig.group.position);
    const now = performance.now(); const dtSec = this.lastDrawMs ? Math.min(0.05, (now - this.lastDrawMs) / 1000) : 0; this.lastDrawMs = now;
    this.cargo.tickDebris(dtSec, (px) => this.route!.heightAt(px));
    if (this.hazardGroup) animateHazards(this.hazardGroup, curr.t + alpha);
    if (this.turrets) syncMissiles(this.turrets, curr.missiles, this.route, curr.t + alpha);
    if (this.scenery) syncScenery(this.scenery, curr.foundDiscoveries, curr.t / 60);
    this.sun.position.set(x - 25, y + 42, z + 28); this.sunTarget.position.set(x, y, z); this.sunTarget.updateMatrixWorld();
    const danger = Math.min(1, Math.abs(curr.tilt));
    const shake = danger > 0.65 ? Math.sin(curr.t * 1.7) * (danger - 0.65) * 0.25 : 0;
    // chase camera: behind the rig, looking down the corridor. Both ends ride the ground so a grade does not
    // bury the eye in the hill behind (downhill) or point it at the sky (uphill).
    const eyeX = x - 14, aimX = x + 7 + speed * 0.3;
    const eyeGround = Math.max(y, this.route.heightAt(eyeX));
    this.camPos.set(eyeX, eyeGround + lift + 6.4 + shake, z + shake);
    this.camTarget.set(aimX, this.route.heightAt(aimX) + lift + 1.2, z);
    if (this.firstFrame) { this.camera.position.copy(this.camPos); this.firstFrame = false; }
    else this.camera.position.lerp(this.camPos, 0.12);
    this.camera.lookAt(this.camTarget);
    // storm closes the fog in with the ramp; radar buys the distance back and re-materials the world
    const fog = this.scene.fog as THREE.Fog;
    const L = curr.radar ? 0 : curr.storm;
    fog.near = FOG_CLEAR_NEAR + (FOG_STORM_NEAR - FOG_CLEAR_NEAR) * L;
    fog.far = FOG_CLEAR_FAR + (FOG_STORM_FAR - FOG_CLEAR_FAR) * L;
    this.stormFog.set(SKY).lerp(new THREE.Color(SAND), curr.storm);
    if (curr.radar) this.stormFog.set('#050807');
    fog.color.copy(this.stormFog);
    (this.scene.background as THREE.Color).copy(this.stormFog);
    if (curr.radar !== this.radarOn) {
      this.radarOn = curr.radar;
      if (this.walls) setWallsRadar(this.walls, this.radarOn);
      if (this.hazardGroup) setHazardsRadar(this.hazardGroup, this.radarOn);
      if (this.terrain) setTerrainRadar(this.terrain, this.radarOn);
    }
    this.gl.render(this.scene, this.camera);
  }

  resize(): void {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.terrain) { this.terrain.geometry.dispose(); ((this.terrain.userData.baseMaterial as THREE.Material | undefined) ?? this.terrain.material as THREE.Material).dispose(); }
    if (this.hazardGroup) disposeHazards(this.hazardGroup);
    if (this.scenery) disposeScenery(this.scenery);
    if (this.walls) disposeWalls(this.walls);
    if (this.turrets) disposeTurrets(this.turrets);
    this.cargo.dispose();
    this.rig.dispose();
    this.gl.dispose(); this.gl.domElement.remove();
  }
}
