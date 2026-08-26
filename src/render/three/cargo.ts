import * as THREE from 'three';
import type { ItemDef, ItemState, Tuning } from '../../sim/types';
import type { PropLibrary, PropName } from './props';

const TRAILER_X = -2.35;
const CARGO_Y = 0.72;

interface Debris { object: THREE.Object3D; vel: THREE.Vector3; life: number }

export class CargoView {
  readonly group = new THREE.Group();
  readonly debrisGroup = new THREE.Group();
  private views = new Map<string, THREE.Object3D>();
  private wasLost = new Set<string>();
  private debris: Debris[] = [];
  private definitions: ItemDef[] = [];
  private props: PropLibrary | null = null;

  setPropLibrary(props: PropLibrary): void {
    this.props = props;
    if (this.definitions.length) this.setLoadout(this.definitions);
  }

  private clearViews(): void {
    this.group.clear();
    this.views.clear();
    this.wasLost.clear();
  }

  setLoadout(items: ItemDef[]): void {
    this.definitions = [...items];
    this.clearViews();
    if (!this.props) return;
    for (let i = 0; i < items.length; i++) {
      const def = items[i]!;
      const name: PropName = def.art.shape === 'cylinder' ? 'cargoB' : def.art.shape === 'sphere' ? 'cargoPacked' : def.art.shape === 'cage' ? 'containersB' : i % 2 ? 'cargoA' : 'cargoStacked';
      const root = this.props.clone(name, name === 'cargoStacked' ? 0.82 : 0.72);
      if (!root) continue;
      root.position.y = CARGO_Y;
      this.group.add(root);
      this.views.set(def.id, root);
    }
  }

  sync(items: ItemState[], tuning: Tuning, rigWorld: THREE.Vector3): void {
    for (const item of items) {
      const object = this.views.get(item.id);
      if (!object) continue;
      object.position.x = TRAILER_X + tuning.slotPos[item.slot]! * 0.66 + item.offset * 0.45;
      object.rotation.z = -item.offset * 0.4;
      if (item.lost && !this.wasLost.has(item.id)) {
        this.wasLost.add(item.id);
        object.visible = false;
        this.burst(rigWorld.clone().add(object.position));
      }
      if (!item.lost && this.wasLost.has(item.id)) {
        this.wasLost.delete(item.id);
        object.visible = true;
      }
    }
  }

  private burst(at: THREE.Vector3): void {
    if (!this.props) return;
    for (let i = 0; i < 7; i++) {
      const object = this.props.clone(i % 2 ? 'cargoA' : 'rockA', 0.22 + Math.random() * 0.12);
      if (!object) continue;
      object.position.copy(at);
      this.debrisGroup.add(object);
      this.debris.push({ object, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6), life: 1.4 });
    }
  }

  tickDebris(dtSec: number, groundY: (x: number) => number): void {
    for (const debris of this.debris) {
      debris.vel.y -= 12 * dtSec;
      debris.object.position.addScaledVector(debris.vel, dtSec);
      debris.object.rotation.x += dtSec * 4;
      debris.object.rotation.z += dtSec * 3;
      debris.life -= dtSec;
      const ground = groundY(debris.object.position.x);
      if (debris.object.position.y < ground) {
        debris.object.position.y = ground;
        debris.vel.set(debris.vel.x * 0.5, 0, debris.vel.z * 0.5);
      }
    }
    this.debris = this.debris.filter((debris) => {
      if (debris.life > 0) return true;
      this.debrisGroup.remove(debris.object);
      return false;
    });
  }

  dispose(): void {
    this.clearViews();
    this.debris = [];
    this.debrisGroup.clear();
  }
}
