import RAPIER from '@dimforge/rapier3d-compat';
import type { Gait, InputFrame, ItemState, LoadoutItem, RigState, Tuning } from '../sim/types';
import type { CourseDef, CourseFrame, CourseObstacle, CourseObstacleFrame, Pose, Vec3 } from './types';

interface CargoBody { state: ItemState; body: RAPIER.RigidBody; spawnOffset: Vec3; tension: number; restraint: number }
interface ObstacleBody { def: CourseObstacle; body: RAPIER.RigidBody }

const clamp = (n: number, lo: number, hi: number): number => n < lo ? lo : n > hi ? hi : n;
const distanceSq = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const poseOf = (body: RAPIER.RigidBody): Pose => ({ position: { ...body.translation() }, rotation: { ...body.rotation() } });

let rapierReady: Promise<void> | null = null;
function initRapier(): Promise<void> { return rapierReady ??= RAPIER.init(); }

export class PhysicsCourse {
  readonly state: RigState;
  private readonly world: RAPIER.World;
  private readonly vehicle: RAPIER.RigidBody;
  private readonly vehicleCollider: RAPIER.Collider;
  private readonly cargo: CargoBody[] = [];
  private readonly obstacles: ObstacleBody[] = [];
  private checkpoint = 0;
  private resets = 0;
  private elapsed = 0;
  private jumpLatch = false;
  private message: string | null = null;
  private lastVelocity = { x: 0, y: 0, z: 0 };
  private selectedCargo = 0;
  private disposed = false;
  private lastFrame: CourseFrame | null = null;

  static async create(course: CourseDef, loadout: LoadoutItem[], tuning: Tuning): Promise<PhysicsCourse> {
    await initRapier();
    return new PhysicsCourse(course, loadout, tuning);
  }

  private constructor(readonly course: CourseDef, loadout: LoadoutItem[], private readonly tuning: Tuning) {
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.world.integrationParameters.dt = tuning.dt;
    for (const platform of course.platforms) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(platform.position.x, platform.position.y, platform.position.z).setRotation(platform.rotation));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(platform.size.x / 2, platform.size.y / 2, platform.size.z / 2).setFriction(1.35).setRestitution(0.05), body);
    }
    this.vehicle = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(course.spawn.x, course.spawn.y, course.spawn.z).setLinearDamping(0.9).setAngularDamping(3.4).setCcdEnabled(true));
    this.vehicle.setEnabledRotations(false, true, false, true);
    this.vehicleCollider = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.62, 0.58).setDensity(5.2).setFriction(1.55).setRestitution(0.06), this.vehicle);
    this.world.createCollider(RAPIER.ColliderDesc.roundCuboid(2.05, 0.12, 1.08, 0.06).setTranslation(0, 3.25, 0).setDensity(0.55).setFriction(1.05).setRestitution(0.04), this.vehicle);

    const items: ItemState[] = loadout.map((li) => {
      const item: ItemState = {
        id: li.def.id, slot: li.slot, mass: li.def.mass, tolerance: li.def.tolerance, crushLimit: li.def.crushLimit,
        behavior: li.def.behavior, payout: li.def.payout, offset: 0, offsetVel: 0, stress: 0, lost: false,
        deadlineTick: li.def.rush === undefined ? -1 : Math.round(li.def.rush / tuning.dt), restraint: tuning.strapStart / 100,
      };
      const offset = { x: tuning.slotPos[li.slot]! * 1.12, y: 3.92, z: 0 };
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(course.spawn.x + offset.x, course.spawn.y + offset.y, course.spawn.z).setLinearDamping(1).setAngularDamping(1.4).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.roundCuboid(0.48, 0.48, 0.48, 0.08).setDensity(0.7 + li.def.mass).setFriction(0.85).setRestitution(0.12), body);
      this.cargo.push({ state: item, body, spawnOffset: offset, tension: 0, restraint: tuning.strapStart / 100 });
      return item;
    });
    for (const def of course.obstacles) this.createObstacle(def);
    this.state = {
      t: 0, x: course.spawn.x, z: course.spawn.z, lateralVel: 0, lift: 0, liftVel: 0, grounded: false,
      tilt: 0, tiltVel: 0, gait: 0, speed: 0, ballast: 0, strap: tuning.strapStart, reserve: 100,
      braced: false, items, foundDiscoveries: [], recovering: 0, hazardCursor: 0, overTiltTicks: 0, ended: null,
    };
  }

  private createObstacle(def: CourseObstacle): void {
    if (def.kind === 'fan') return;
    if (def.kind === 'boulder') {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(def.position.x, def.position.y, def.position.z).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.ball(def.size.x / 2).setDensity(4).setFriction(1.1).setRestitution(0.35), body);
      this.obstacles.push({ def, body }); return;
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(def.position.x, def.position.y, def.position.z));
    const collider = RAPIER.ColliderDesc.cuboid(def.size.x / 2, def.size.y / 2, def.size.z / 2).setFriction(0.8).setRestitution(0.45);
    if (def.kind === 'hammer') collider.setTranslation(0, -def.size.y / 2, 0);
    this.world.createCollider(collider, body);
    this.obstacles.push({ def, body });
  }

  private grounded(): boolean {
    const p = this.vehicle.translation();
    const hit = this.world.castRay(new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 }), 1.45, true, undefined, undefined, this.vehicleCollider, this.vehicle);
    return hit !== null;
  }

  private resetToCheckpoint(reason: string): void {
    const spawn = this.course.checkpoints[this.checkpoint]!.position;
    this.vehicle.setTranslation(spawn, true); this.vehicle.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.vehicle.setLinvel({ x: 0, y: 0, z: 0 }, true); this.vehicle.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.vehicle.resetForces(true); this.vehicle.resetTorques(true); this.lastVelocity = { x: 0, y: 0, z: 0 };
    for (const cargo of this.cargo) {
      cargo.body.setTranslation({ x: spawn.x + cargo.spawnOffset.x, y: spawn.y + cargo.spawnOffset.y, z: spawn.z }, true);
      cargo.body.setLinvel({ x: 0, y: 0, z: 0 }, true); cargo.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      cargo.state.stress = Math.min(1.2, cargo.state.stress + 0.1); cargo.state.lost = false; cargo.tension = 0;
      cargo.restraint = Math.max(0.55, cargo.restraint); cargo.state.restraint = cargo.restraint;
    }
    this.state.reserve = Math.max(0, this.state.reserve - 7); this.resets++; this.message = `${reason} — CHECKPOINT RESET (-7 RESERVE)`;
  }

  private updateObstacles(): void {
    for (const entry of this.obstacles) {
      const { def, body } = entry;
      if (def.kind === 'spinner') {
        const angle = this.elapsed * def.speed + def.phase;
        body.setNextKinematicRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
      } else if (def.kind === 'hammer') {
        const angle = Math.sin(this.elapsed * def.speed + def.phase) * 1.15;
        body.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
      } else if (def.kind === 'crusher') {
        const cycle = (this.elapsed * def.speed + def.phase) % 3.4;
        const down = cycle < 0.75 ? cycle / 0.75 : cycle < 1.65 ? 1 : cycle < 2.25 ? 1 - (cycle - 1.65) / 0.6 : 0;
        body.setNextKinematicTranslation({ x: def.position.x, y: def.position.y - down * 5.2, z: def.position.z });
      } else if (def.kind === 'boulder' && body.translation().y < this.course.bounds.minY) {
        body.setTranslation(def.position, true); body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  private applyDrive(input: InputFrame): void {
    this.vehicle.resetForces(true); this.vehicle.resetTorques(true);
    for (const cargo of this.cargo) { cargo.body.resetForces(true); cargo.body.resetTorques(true); }
    const rot = this.vehicle.rotation(), vel = this.vehicle.linvel();
    const fx = 1 - 2 * (rot.y * rot.y + rot.z * rot.z), fz = 2 * (rot.x * rot.z - rot.w * rot.y);
    const fl = Math.max(0.001, Math.hypot(fx, fz)), nx = fx / fl, nz = fz / fl;
    let moveX = input.moveX, moveZ = input.moveZ;
    if (moveX === undefined || moveZ === undefined) {
      const throttle = input.throttle ? input.throttle : input.gait > 0 ? 1 : 0, steer = input.steer ?? 0;
      const rightX = -nz, rightZ = nx, length = Math.max(1, Math.hypot(throttle, steer));
      moveX = (nx * throttle + rightX * steer) / length; moveZ = (nz * throttle + rightZ * steer) / length;
    }
    const intent = Math.min(1, Math.hypot(moveX, moveZ)), targetSpeed = 13.5 * intent;
    this.state.gait = clamp(Math.round(intent * 4), 0, 4) as Gait;   // drives the panel's RPM target tick
    const targetVx = intent > 0 ? moveX / intent * targetSpeed : 0, targetVz = intent > 0 ? moveZ / intent * targetSpeed : 0;
    let forceX = (targetVx - vel.x) * 145, forceZ = (targetVz - vel.z) * 145;
    const grounded = this.grounded();
    const forceLength = Math.hypot(forceX, forceZ), maxForce = grounded ? 1650 : 420;
    if (forceLength > maxForce) { forceX *= maxForce / forceLength; forceZ *= maxForce / forceLength; }
    this.vehicle.addForce({ x: forceX, y: 0, z: forceZ }, true);
    const angular = this.vehicle.angvel();
    if (intent > 0.08) {
      const currentYaw = 2 * Math.atan2(rot.y, rot.w), desiredYaw = Math.atan2(-moveZ, moveX);
      let delta = desiredYaw - currentYaw; while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2;
      const targetYawRate = clamp(delta * 5.2, -2.4, 2.4);
      this.vehicle.setAngvel({ x: 0, y: angular.y + (targetYawRate - angular.y) * 0.34, z: 0 }, true);
    } else this.vehicle.setAngvel({ x: 0, y: angular.y * 0.72, z: 0 }, true);
    if (input.brace) {
      this.vehicle.setAngularDamping(10); this.vehicle.addForce({ x: 0, y: -65, z: 0 }, true);
    } else this.vehicle.setAngularDamping(3.4);
    if (input.jump && !this.jumpLatch && grounded) this.vehicle.applyImpulse({ x: 0, y: 310, z: 0 }, true);
    this.jumpLatch = Boolean(input.jump);
    const horizontal = Math.hypot(vel.x, vel.z);
    if (horizontal > 20) this.vehicle.setLinvel({ x: vel.x / horizontal * 20, y: vel.y, z: vel.z / horizontal * 20 }, true);
    this.applyCargoTethers(input, nx, nz);

    for (const fan of this.course.obstacles.filter((o) => o.kind === 'fan')) {
      const p = this.vehicle.translation();
      if (Math.abs(p.x - fan.position.x) < fan.size.x / 2 && Math.abs(p.y - fan.position.y) < fan.size.y / 2 && Math.abs(p.z - fan.position.z) < fan.size.z * 2) {
        const axis = fan.axis ?? { x: 0, y: 0, z: 1 };
        this.vehicle.addForce({ x: axis.x * 105, y: axis.y * 105, z: axis.z * 105 }, true);
      }
    }
  }

  private applyCargoTethers(input: InputFrame, forwardX: number, forwardZ: number): void {
    const vehiclePosition = this.vehicle.translation(), vehicleVelocity = this.vehicle.linvel();
    for (let i = 0; i < this.cargo.length; i++) {
      const cargo = this.cargo[i]!;
      if (cargo.state.lost) { cargo.tension = 0; continue; }
      const behavior = cargo.state.behavior;
      const behaviorMul = behavior === 'static' ? 1.1 : behavior === 'precarious' ? 0.68 : behavior === 'slosh' ? 0.58 : 0.78;
      const trim = this.state.ballast / 100 * 0.42;
      const localX = cargo.spawnOffset.x + trim;
      const target = { x: vehiclePosition.x + forwardX * localX, y: vehiclePosition.y + cargo.spawnOffset.y, z: vehiclePosition.z + forwardZ * localX };
      const position = cargo.body.translation(), velocity = cargo.body.linvel();
      const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
      const stiffness = (8 + cargo.restraint * 118) * behaviorMul * cargo.state.mass;
      const damping = (3 + cargo.restraint * 17 + (input.brace ? 20 : 0)) * cargo.state.mass;
      const tetherForce = {
        x: dx * stiffness - (velocity.x - vehicleVelocity.x) * damping,
        y: dy * stiffness - (velocity.y - vehicleVelocity.y) * damping,
        z: dz * stiffness - (velocity.z - vehicleVelocity.z) * damping,
      };
      cargo.body.addForce(tetherForce, true);
      this.vehicle.addForce({ x: -tetherForce.x, y: -tetherForce.y, z: -tetherForce.z }, true);
      if (behavior === 'slosh') cargo.body.addForce({ x: 0, y: 0, z: Math.sin(this.elapsed * 3.4 + i) * 12 * cargo.state.mass }, true);
      if (behavior === 'livestock') cargo.body.addForce({ x: Math.sin(this.elapsed * 5.7 + i * 2) * 9, y: 0, z: Math.sin(this.elapsed * 4.1 + i) * 11 }, true);
      cargo.tension = clamp(Math.hypot(tetherForce.x, tetherForce.y, tetherForce.z) / (cargo.state.mass * 260), 0, 1.5);
    }
  }

  private updateCargoControls(input: InputFrame): void {
    if (input.cargoSelect !== undefined && this.cargo.length > 0) this.selectedCargo = clamp(input.cargoSelect, 0, this.cargo.length - 1);
    this.state.selectedCargo = this.selectedCargo;
    for (const cargo of this.cargo) {
      const decay = cargo.state.behavior === 'slosh' ? 0.018 : cargo.state.behavior === 'livestock' ? 0.014 : cargo.state.behavior === 'precarious' ? 0.011 : 0.007;
      cargo.restraint = clamp(cargo.restraint - decay * this.tuning.dt, 0.08, 1);
      cargo.state.restraint = cargo.restraint;
    }
    const selected = this.cargo[this.selectedCargo];
    if (input.strap && selected && !selected.state.lost) {
      selected.restraint = clamp(selected.restraint + this.tuning.strapTap / 100, 0.08, 1);
      selected.state.restraint = selected.restraint; this.message = `BAY ${this.selectedCargo + 1} RATCHETED — ${Math.round(selected.restraint * 100)}%`;
    }
    this.state.strap = selected && !selected.state.lost ? selected.restraint * 100 : 0;
  }

  private updateGameState(input: InputFrame): void {
    const p = this.vehicle.translation(), v = this.vehicle.linvel(), rot = this.vehicle.rotation();
    const speed = Math.hypot(v.x, v.z);
    this.state.t++; this.elapsed += this.tuning.dt; this.state.x = p.x; this.state.z = p.z; this.state.speed = speed;
    this.state.courseTime = this.elapsed; this.state.courseResets = this.resets;
    this.state.lateralVel = v.z; this.state.lift = p.y; this.state.liftVel = v.y; this.state.grounded = this.grounded();
    this.state.braced = input.brace; this.state.ballast = input.ballast;
    const upX = 2 * (rot.x * rot.y - rot.w * rot.z), upY = 1 - 2 * (rot.x * rot.x + rot.z * rot.z);
    this.state.tilt = clamp(upX + Math.sign(upX || 1) * (1 - upY) * 0.65, -1.5, 1.5);
    const av = this.vehicle.angvel(); this.state.tiltVel = av.z;
    this.state.reserve -= this.tuning.dt * (0.29 + speed * 0.018 + (input.brace ? 0.65 : 0));

    const acceleration = Math.hypot(v.x - this.lastVelocity.x, v.y - this.lastVelocity.y, v.z - this.lastVelocity.z) / this.tuning.dt;
    this.lastVelocity = { ...v };
    for (const cargo of this.cargo) {
      const cv = cargo.body.linvel();
      const relative = Math.hypot(cv.x - v.x, cv.y - v.y, cv.z - v.z);
      const loose = 1 - cargo.restraint;
      cargo.body.setLinearDamping(0.35 + (input.brace ? 1.2 : 0));
      cargo.body.setAngularDamping(0.5 + cargo.restraint * 0.9 + (input.brace ? 2 : 0));
      const cp = cargo.body.translation(), anchor = this.cargoAnchor(cargo);
      const tetherDistance = Math.hypot(cp.x - anchor.x, cp.y - anchor.y, cp.z - anchor.z);
      cargo.state.offset = clamp(tetherDistance * Math.sign(cp.x - anchor.x), -1.5, 1.5);
      cargo.state.stress += this.tuning.dt * (Math.max(0, relative - 3.2) * 0.014 + Math.max(0, acceleration - 38) * 0.00022 * (0.4 + loose));
      cargo.state.stress += this.tuning.dt * Math.max(0, cargo.restraint * 100 - cargo.state.crushLimit) * this.tuning.kCrush;
      cargo.state.stress = clamp(cargo.state.stress, 0, 1.25);
      if (tetherDistance > 4.4 || cp.y < this.course.bounds.minY) { cargo.state.lost = true; cargo.tension = 0; this.message = `${cargo.state.id.toUpperCase()} BROKE FREE`; }
    }

    for (let i = this.checkpoint + 1; i < this.course.checkpoints.length; i++) {
      const cp = this.course.checkpoints[i]!;
      if (distanceSq(p, cp.position) < cp.radius * cp.radius) { this.checkpoint = i; this.message = `CHECKPOINT — ${cp.name}`; }
    }
    for (const salvage of this.course.salvage) {
      if (!this.state.foundDiscoveries.includes(salvage.id) && distanceSq(p, salvage.position) < 4.5 ** 2) {
        this.state.foundDiscoveries.push(salvage.id); this.state.reserve = Math.min(100, this.state.reserve + 8);
        for (const cargo of this.cargo) cargo.state.stress = Math.max(0, cargo.state.stress - 0.08);
        this.message = `SALVAGE — ${salvage.name} (+${salvage.value})`;
      }
    }
    const outside = p.y < this.course.bounds.minY || p.x < this.course.bounds.minX || p.x > this.course.bounds.maxX || p.z < this.course.bounds.minZ || p.z > this.course.bounds.maxZ;
    if (outside || Math.abs(rot.x) + Math.abs(rot.z) > 1.22 && speed < 0.8) this.resetToCheckpoint(outside ? 'LEFT THE COURSE' : 'MULE OVERTURNED');
    if (this.state.reserve <= 0) { this.state.reserve = 0; this.state.ended = 'stalled'; }
    if (this.cargo.length > 0 && this.cargo.every((cargo) => cargo.state.lost)) this.state.ended = 'spilled';
    if (distanceSq(p, this.course.finish) < this.course.finishRadius ** 2) this.state.ended = 'arrived';
  }

  private cargoAnchor(cargo: CargoBody): Vec3 {
    const p = this.vehicle.translation(), q = this.vehicle.rotation();
    const fx = 1 - 2 * (q.y * q.y + q.z * q.z), fz = 2 * (q.x * q.z - q.w * q.y);
    const localX = cargo.spawnOffset.x + this.state.ballast / 100 * 0.42;
    return { x: p.x + fx * localX, y: p.y + cargo.spawnOffset.y, z: p.z + fz * localX };
  }

  step(input: InputFrame): CourseFrame {
    if (this.disposed) return this.lastFrame ?? this.emptyFrame();
    this.message = null;
    let recoveredSpill = false;
    if (this.state.ended === 'spilled' && input.recover) {
      this.state.ended = null;
      this.resetToCheckpoint('CARGO RECOVERY');
      recoveredSpill = true;
    }
    if (!this.state.ended) {
      if (input.recover && !recoveredSpill) this.resetToCheckpoint('MANUAL RECOVERY');
      this.updateCargoControls(input); this.updateObstacles(); this.applyDrive(input); this.world.step(); this.sanitizeDynamics(); this.updateGameState(input);
    }
    return this.frame();
  }

  /** Frees the Rapier world (WASM heap is not reclaimed by GC). Safe to call twice; step() becomes a no-op afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.lastFrame ??= this.frame();
    this.disposed = true;
    this.world.free();
  }

  private emptyFrame(): CourseFrame {
    const spawn = this.course.spawn;
    return { vehicle: { position: { ...spawn }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, cargo: [], obstacles: [], state: this.state, speed: 0, elapsed: this.elapsed, checkpoint: this.checkpoint, resets: this.resets, salvage: [...this.state.foundDiscoveries], finishDistance: 0, message: null };
  }

  private sanitizeDynamics(): void {
    const cap = (body: RAPIER.RigidBody, horizontalMax: number, verticalMax: number): void => {
      const velocity = body.linvel(), horizontal = Math.hypot(velocity.x, velocity.z);
      const scale = horizontal > horizontalMax ? horizontalMax / horizontal : 1;
      const x = Number.isFinite(velocity.x) ? velocity.x * scale : 0;
      const y = Number.isFinite(velocity.y) ? clamp(velocity.y, -verticalMax, verticalMax) : 0;
      const z = Number.isFinite(velocity.z) ? velocity.z * scale : 0;
      if (scale < 1 || y !== velocity.y || !Number.isFinite(velocity.x + velocity.z)) body.setLinvel({ x, y, z }, true);
    };
    cap(this.vehicle, 22, 24);
    for (const cargo of this.cargo) cap(cargo.body, 28, 28);
  }

  frame(): CourseFrame {
    if (this.disposed) return this.lastFrame ?? this.emptyFrame();
    const p = this.vehicle.translation();
    const obstacleFrames: CourseObstacleFrame[] = this.obstacles.map((o) => ({ id: o.def.id, pose: poseOf(o.body) }));
    return this.lastFrame = {
      vehicle: poseOf(this.vehicle), cargo: this.cargo.map((c, index) => ({ id: c.state.id, pose: poseOf(c.body), anchor: this.cargoAnchor(c), condition: clamp(1 - c.state.stress, 0, 1), lost: c.state.lost, tension: c.tension, restraint: c.restraint, selected: index === this.selectedCargo })),
      obstacles: obstacleFrames, state: this.state, speed: Math.hypot(this.vehicle.linvel().x, this.vehicle.linvel().z), elapsed: this.elapsed,
      checkpoint: this.checkpoint, resets: this.resets, salvage: [...this.state.foundDiscoveries], finishDistance: Math.hypot(p.x - this.course.finish.x, p.z - this.course.finish.z), message: this.message,
    };
  }
}
