import * as THREE from 'three';
import type { Renderer, RenderPrev } from '../Renderer';
import type { ItemDef, RigState, RouteDef } from '../../sim/types';
import { buildTerrain } from './terrain';
import { buildHazards, disposeHazards } from './hazards';
import { Rig } from './rig';
import { CargoView } from './cargo';
import { tuning } from '../../content';

const SKY = '#d9c9a3';

export class ThreeRenderer implements Renderer {
  private gl!: THREE.WebGLRenderer;
  private el!: HTMLElement;
  private readonly scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private terrain: THREE.Mesh | null = null;
  private hazardGroup: THREE.Group | null = null;
  private route: RouteDef | null = null;
  private readonly rig = new Rig();
  private readonly cargo = new CargoView();
  private lastDrawMs = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private firstFrame = true;

  mount(el: HTMLElement): void {
    this.el = el;
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(this.gl.domElement);
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 70, 200);
    const hemi = new THREE.HemisphereLight('#fff4dc', '#5a4a3a', 0.9);
    const sun = new THREE.DirectionalLight('#ffe9c4', 1.4);
    sun.position.set(-30, 50, 40);
    this.scene.add(hemi, sun, this.rig.group);
    this.rig.group.add(this.cargo.group);
    this.scene.add(this.cargo.debrisGroup);
    this.resize();
  }

  setLoadout(items: ItemDef[]): void {
    this.cargo.setLoadout(items);
  }

  setRoute(route: RouteDef): void {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    this.route = route;
    this.terrain = buildTerrain(route);
    this.scene.add(this.terrain);
    if (this.hazardGroup) { this.scene.remove(this.hazardGroup); disposeHazards(this.hazardGroup); }
    this.hazardGroup = buildHazards(route);
    this.scene.add(this.hazardGroup);
    this.firstFrame = true;
  }

  draw(curr: RigState, prev: RenderPrev, alpha: number): void {
    if (!this.route) return;
    const x = prev.x + (curr.x - prev.x) * alpha;
    const tilt = prev.tilt + (curr.tilt - prev.tilt) * alpha;
    const speed = prev.speed + (curr.speed - prev.speed) * alpha;
    const y = this.route.heightAt(x);
    this.rig.update(x, y, tilt, speed, curr.gait, curr.t + alpha, this.route);
    this.cargo.sync(curr.items, tuning, this.rig.group.position);
    const now = performance.now(); const dtSec = this.lastDrawMs ? Math.min(0.05, (now - this.lastDrawMs) / 1000) : 0; this.lastDrawMs = now;
    this.cargo.tickDebris(dtSec, (px) => this.route!.heightAt(px));
    this.camPos.set(x - 6, y + 5.5, 13);
    this.camTarget.set(x + 4, y + 1.2, 0);
    if (this.firstFrame) { this.camera.position.copy(this.camPos); this.firstFrame = false; }
    else this.camera.position.lerp(this.camPos, 0.12);
    this.camera.lookAt(this.camTarget);
    this.gl.render(this.scene, this.camera);
  }

  resize(): void {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.terrain) { this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    if (this.hazardGroup) disposeHazards(this.hazardGroup);
    this.cargo.dispose();
    this.rig.dispose();
    this.gl.dispose(); this.gl.domElement.remove();
  }
}
