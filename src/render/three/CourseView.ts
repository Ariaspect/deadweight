import * as THREE from 'three';
import type { ItemDef } from '../../sim/types';
import type { CourseCargoFrame, CourseDef, CourseFrame, CourseObstacle, Pose } from '../../course/types';

const COLORS = { road: '#565b5b', danger: '#704d37', checkpoint: '#425b55', island: '#655e51' } as const;

function applyPose(object: THREE.Object3D, pose: Pose): void {
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
  object.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
}

function standard(color: string, metalness = 0.15, roughness = 0.78): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
}

interface CargoVisual {
  root: THREE.Group;
  core: THREE.MeshStandardMaterial;
  straps: [THREE.Line, THREE.Line];
  strapMaterial: THREE.LineBasicMaterial;
}

function shadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

export class CourseView {
  readonly group = new THREE.Group();
  readonly collisionMeshes: THREE.Object3D[] = [];
  private readonly vehicle = new THREE.Group();
  private readonly obstacleMeshes = new Map<string, THREE.Object3D>();
  private readonly cargoVisuals = new Map<string, CargoVisual>();
  private readonly salvageMeshes = new Map<number, THREE.Group>();
  private readonly fanRotors: THREE.Group[] = [];
  private readonly legs: THREE.Group[] = [];
  private readonly arms: THREE.Group[] = [];
  private readonly bayLights: THREE.Mesh[] = [];
  private torso: THREE.Group | null = null;
  private tray: THREE.Group | null = null;
  private course: CourseDef | null = null;

  constructor() { this.buildVehicle(); this.group.add(this.vehicle); }

  private buildVehicle(): void {
    const skin = standard('#875a3c', 0.02, 0.88), cloth = standard('#26343b', 0.08, 0.82), boot = standard('#171a1b', 0.28, 0.62);
    const harness = standard('#e65a24', 0.22, 0.58), steel = standard('#3f494d', 0.78, 0.38);
    const torso = new THREE.Group(); torso.position.y = 0.28; this.vehicle.add(torso); this.torso = torso;
    const hips = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.52, 8), cloth)); hips.position.y = 0.08; torso.add(hips);
    const chest = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.47, 1.25, 8), cloth)); chest.position.y = 0.88; torso.add(chest);
    const harnessBand = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.075, 6, 12), harness)); harnessBand.rotation.x = Math.PI / 2; harnessBand.position.y = 0.94; torso.add(harnessBand);
    const neck = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.24, 8), skin)); neck.position.y = 1.58; torso.add(neck);
    const head = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), skin)); head.position.set(0.08, 1.94, 0); torso.add(head);
    const hair = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.39, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.48), boot)); hair.position.set(0.08, 2.02, 0); torso.add(hair);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.28), new THREE.MeshBasicMaterial({ color: '#f3d0aa' })); face.position.set(0.4, 1.94, 0); torso.add(face);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(0, 0.08, side * 0.3); torso.add(leg); this.legs.push(leg);
      const thigh = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.86, 7), cloth)); thigh.position.y = -0.42; leg.add(thigh);
      const shin = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.78, 7), skin)); shin.position.y = -1.19; leg.add(shin);
      const foot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.24, 0.34), boot)); foot.position.set(0.17, -1.62, 0); leg.add(foot);
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(0, 1.42, side * 0.59); torso.add(arm); this.arms.push(arm);
      const upper = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.92, 7), skin)); upper.position.set(0, 0.42, side * 0.1); upper.rotation.x = side * -0.18; arm.add(upper);
      const fore = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.86, 7), skin)); fore.position.set(0, 1.18, side * 0.2); fore.rotation.x = side * 0.1; arm.add(fore);
      const hand = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), skin)); hand.position.set(0, 1.64, side * 0.24); arm.add(hand);
    }
    const tray = new THREE.Group(); tray.position.y = 3.25; this.vehicle.add(tray); this.tray = tray;
    tray.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 2.25), steel)));
    for (const z of [-1.02, 1.02]) { const rail = shadow(new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.18, 0.14), harness)); rail.position.set(0, 0.16, z); tray.add(rail); }
    for (const x of [-1.12, 0, 1.12]) {
      const bed = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 1.54), standard('#252d30', 0.65, 0.44))); bed.position.set(x, 0.15, 0); tray.add(bed);
      for (const z of [-0.88, 0.88]) {
        const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.1), harness)); post.position.set(x, 0.36, z); tray.add(post);
      }
      const bayLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#263431' }));
      bayLight.position.set(x, 0.24, -1.02); tray.add(bayLight); this.bayLights.push(bayLight);
    }
  }

  setCourse(course: CourseDef, items: ItemDef[]): void {
    this.clearCourse(); this.course = course;
    for (const platform of course.platforms) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(platform.size.x, platform.size.y, platform.size.z), standard(COLORS[platform.kind], 0.12, 0.92));
      mesh.position.set(platform.position.x, platform.position.y, platform.position.z);
      mesh.quaternion.set(platform.rotation.x, platform.rotation.y, platform.rotation.z, platform.rotation.w);
      mesh.receiveShadow = true; mesh.castShadow = platform.kind === 'danger'; mesh.userData.courseObject = true; this.group.add(mesh); this.collisionMeshes.push(mesh);
      const edgeMat = new THREE.MeshBasicMaterial({ color: platform.kind === 'danger' ? '#ff7a35' : '#d8c99e' });
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(platform.size.x, 0.05, 0.12), edgeMat);
        edge.position.set(0, platform.size.y / 2 + 0.03, side * (platform.size.z / 2 - 0.08)); mesh.add(edge);
      }
    }
    for (const obstacle of course.obstacles) this.addObstacle(obstacle);
    for (const item of items) this.addCargo(item);
    for (const salvage of course.salvage) {
      const root = new THREE.Group(); root.position.set(salvage.position.x, salvage.position.y, salvage.position.z); root.userData.courseObject = true;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 1.1), standard('#32d8b9', 0.5, 0.38)); crate.castShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 8, 28), new THREE.MeshBasicMaterial({ color: '#87ffea' })); ring.rotation.x = Math.PI / 2; ring.position.y = 1.4;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 1.05, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#54e6ce', transparent: true, opacity: 0.28, side: THREE.DoubleSide })); beam.position.y = 4.5;
      root.add(crate, ring, beam); this.group.add(root); this.salvageMeshes.set(salvage.id, root);
    }
    for (const checkpoint of course.checkpoints.slice(1)) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(checkpoint.radius, 0.18, 8, 36), new THREE.MeshBasicMaterial({ color: '#63e2c4' }));
      ring.position.set(checkpoint.position.x, checkpoint.position.y - 1, checkpoint.position.z); ring.rotation.x = Math.PI / 2; ring.userData.courseObject = true; this.group.add(ring);
    }
    const finish = new THREE.Group(); finish.position.set(course.finish.x, course.finish.y - 1, course.finish.z); finish.userData.courseObject = true;
    for (const z of [-6, 6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), standard('#e85c24', 0.4)); post.position.set(0, 4.5, z); finish.add(post); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 12.5), standard('#e85c24', 0.4)); beam.position.y = 8.7; finish.add(beam); this.group.add(finish);
  }

  private addCargo(item: ItemDef): void {
    const root = new THREE.Group(); root.userData.courseObject = true;
    const core = standard(item.art.color, item.art.shape === 'sphere' ? 0.28 : 0.08, 0.68);
    if (item.art.shape === 'cage') {
      const occupant = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), core)); occupant.position.y = -0.08; root.add(occupant);
      const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05)), new THREE.LineBasicMaterial({ color: '#d9c9a0' })); root.add(cage);
    } else {
      const geometry = item.art.shape === 'cylinder' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 12) : item.art.shape === 'sphere' ? new THREE.IcosahedronGeometry(0.6, 1) : new THREE.BoxGeometry(1, 1, 1);
      root.add(shadow(new THREE.Mesh(geometry, core)));
      if (item.art.shape === 'box') {
        const bands = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: '#d7b96d' })); root.add(bands);
      } else if (item.art.shape === 'cylinder') {
        for (const y of [-0.42, 0.42]) { const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.035, 6, 16), standard('#24292b', 0.8, 0.35))); band.rotation.x = Math.PI / 2; band.position.y = y; root.add(band); }
      }
    }
    const strapMaterial = new THREE.LineBasicMaterial({ color: '#70ead3', transparent: true, opacity: 0.95 });
    const makeStrap = (): THREE.Line => {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geometry, strapMaterial); line.frustumCulled = false; this.group.add(line); return line;
    };
    const straps: [THREE.Line, THREE.Line] = [makeStrap(), makeStrap()];
    this.group.add(root); this.cargoVisuals.set(item.id, { root, core, straps, strapMaterial });
  }

  private addObstacle(def: CourseObstacle): void {
    if (def.kind === 'fan') {
      const root = new THREE.Group(); root.position.set(def.position.x, def.position.y, def.position.z); root.userData.courseObject = true;
      const rotor = new THREE.Group();
      for (let i = 0; i < 6; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.55, 0.18), standard('#e85c24', 0.35)); blade.position.x = 2.6; blade.rotation.z = i * Math.PI / 3; rotor.add(blade); }
      const cage = new THREE.Mesh(new THREE.TorusGeometry(6, 0.22, 8, 36), standard('#4e565a', 0.75, 0.4)); root.add(rotor, cage); this.group.add(root); this.fanRotors.push(rotor); return;
    }
    let mesh: THREE.Mesh;
    if (def.kind === 'boulder') mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(def.size.x / 2, 1), standard('#554c43', 0, 0.98));
    else mesh = new THREE.Mesh(new THREE.BoxGeometry(def.size.x, def.size.y, def.size.z), standard(def.kind === 'crusher' ? '#d94b22' : '#ec6a28', 0.5, 0.48));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.courseObject = true;
    if (def.kind === 'hammer') {
      const pivot = new THREE.Group(); pivot.position.set(def.position.x, def.position.y, def.position.z); pivot.userData.courseObject = true;
      mesh.position.y = -def.size.y / 2; pivot.add(mesh); this.group.add(pivot); this.obstacleMeshes.set(def.id, pivot); this.collisionMeshes.push(mesh);
    } else {
      mesh.position.set(def.position.x, def.position.y, def.position.z); this.group.add(mesh); this.obstacleMeshes.set(def.id, mesh); this.collisionMeshes.push(mesh);
    }
  }

  update(frame: CourseFrame): void {
    applyPose(this.vehicle, frame.vehicle);
    const cadence = frame.elapsed * (5.2 + frame.speed * 0.32), stride = Math.min(0.72, frame.speed * 0.07);
    for (let i = 0; i < this.legs.length; i++) this.legs[i]!.rotation.z = Math.sin(cadence + i * Math.PI) * stride;
    for (let i = 0; i < this.arms.length; i++) this.arms[i]!.rotation.z = Math.sin(cadence + i * Math.PI) * stride * 0.08;
    if (this.torso) { this.torso.position.y = 0.28 + Math.abs(Math.sin(cadence)) * Math.min(0.09, frame.speed * 0.008); this.torso.rotation.z = Math.sin(cadence) * stride * 0.04; }
    if (this.tray) { this.tray.rotation.z = -Math.sin(cadence) * stride * 0.025; this.tray.position.y = 3.25 + Math.abs(Math.sin(cadence)) * Math.min(0.06, frame.speed * 0.005); }
    for (let i = 0; i < this.bayLights.length; i++) {
      const material = this.bayLights[i]!.material as THREE.MeshBasicMaterial, cargo = frame.cargo[i];
      material.color.set(cargo?.lost ? '#e12618' : cargo?.selected ? '#67ffe2' : '#263431');
    }
    for (const cargo of frame.cargo) this.updateCargo(cargo);
    for (const obstacle of frame.obstacles) { const mesh = this.obstacleMeshes.get(obstacle.id); if (mesh) applyPose(mesh, obstacle.pose); }
    for (const [id, mesh] of this.salvageMeshes) {
      mesh.visible = !frame.salvage.includes(id); mesh.rotation.y = frame.elapsed * 0.35 + id;
      const ring = mesh.children[1]; if (ring) ring.rotation.z = frame.elapsed * 1.2;
    }
    for (let i = 0; i < this.fanRotors.length; i++) this.fanRotors[i]!.rotation.z = frame.elapsed * (9 + i * 2);
  }

  private updateCargo(cargo: CourseCargoFrame): void {
    const visual = this.cargoVisuals.get(cargo.id); if (!visual) return;
    applyPose(visual.root, cargo.pose); visual.root.visible = true; visual.root.updateMatrixWorld(true);
    visual.core.emissive.set(cargo.condition < 0.3 ? '#6d1008' : cargo.selected ? '#164f48' : '#000000');
    visual.core.emissiveIntensity = cargo.condition < 0.3 ? 0.65 : cargo.selected ? 0.42 : 0;
    visual.strapMaterial.color.set(cargo.tension > 0.95 ? '#ff3c20' : cargo.tension > 0.55 ? '#ffad32' : '#70ead3');
    for (let i = 0; i < visual.straps.length; i++) {
      const line = visual.straps[i]!, side = i === 0 ? -1 : 1;
      line.visible = !cargo.lost;
      if (cargo.lost) continue;
      const endpoint = visual.root.localToWorld(new THREE.Vector3(0, 0.38, side * 0.42));
      const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      positions.setXYZ(0, cargo.anchor.x, cargo.anchor.y - 0.25, cargo.anchor.z + side * 0.82);
      positions.setXYZ(1, endpoint.x, endpoint.y, endpoint.z); positions.needsUpdate = true;
    }
  }

  private clearCourse(): void {
    for (const child of [...this.group.children]) {
      if (child === this.vehicle) continue;
      child.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.LineSegments) {
          node.geometry.dispose(); if (!Array.isArray(node.material)) node.material.dispose();
        }
      });
      this.group.remove(child);
    }
    this.obstacleMeshes.clear(); this.cargoVisuals.clear(); this.salvageMeshes.clear(); this.fanRotors.length = 0; this.collisionMeshes.length = 0;
  }

  dispose(): void { this.clearCourse(); this.vehicle.traverse((node) => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); if (!Array.isArray(node.material)) node.material.dispose(); } }); }
}
