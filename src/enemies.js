import * as THREE from '../vendor/three.module.js';
import { moveBody } from './world.js';

export const TYPES = {
  grunt:  { name: 'Grunt',   hp: 60,   speed: 3.4, r: 0.5,  scale: 1.0,  bodyW: 1.0,  color: 0x4f7cff, eye: 0xff3344, score: 100,  fire: [1.5, 2.5], dmg: 8,  proj: 20, range: 34, shots: 1, gun: true },
  rusher: { name: 'Rusher',  hp: 35,   speed: 7.0, r: 0.4,  scale: 0.78, bodyW: 0.9,  color: 0xff8a2a, eye: 0xffee33, score: 75,   melee: 14 },
  drone:  { name: 'Drone',   hp: 30,   speed: 5.0, r: 0.55, scale: 1.0,  color: 0x3ddc84, eye: 0xff3344, score: 120,  fire: [1.1, 1.8], dmg: 6,  proj: 24, range: 38, shots: 1, fly: 4.2 },
  tank:   { name: 'Tank',    hp: 260,  speed: 2.0, r: 0.8,  scale: 1.45, bodyW: 1.35, color: 0xb06cff, eye: 0xff3344, score: 300,  fire: [2.2, 3.0], dmg: 10, proj: 16, range: 36, shots: 3, gun: true },
  boss:   { name: 'MEGA BOT', hp: 1500, speed: 1.7, r: 1.4, scale: 2.5,  bodyW: 1.5,  color: 0xff3355, eye: 0xffee33, score: 2500, fire: [1.3, 1.7], dmg: 11, proj: 18, range: 60, shots: 5, gun: true, boss: true },
};

const BOX = new THREE.BoxGeometry(1, 1, 1);
const jointMat = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.6, metalness: 0.5 });
const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _eye = new THREE.Vector3();

export class Enemy {
  constructor(kind, pos, hpScale, dmgScale) {
    const d = (this.def = TYPES[kind]);
    this.kind = kind;
    this.maxHp = this.hp = Math.round(d.hp * hpScale);
    this.dmgScale = dmgScale;
    this.pos = pos.clone();
    this.r = d.r;
    this.h = d.fly ? 0.5 : 1.95 * d.scale;
    if (d.fly) this.pos.y = d.fly;
    this.vel = new THREE.Vector3();
    this.age = 0;
    this.flashT = 0;
    this.fireT = d.fire ? d.fire[0] + Math.random() * 1.5 : 0;
    this.meleeT = 0;
    this.minionT = 6;
    this.los = false;
    this.clear = false;
    this.losT = Math.random() * 0.2;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.walkT = Math.random() * 10;
    this.dead = false;
    this.lastHead = false;
    this.parts = [];
    this.legs = [];
    this.arms = [];
    this.rotors = [];

    this.bodyMat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.45, metalness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: d.eye });
    this.eyeBase = new THREE.Color(d.eye);
    this.mesh = new THREE.Group();
    this.model = new THREE.Group();
    this.mesh.add(this.model);
    if (d.fly) this.buildDrone(); else this.buildRobot();
    this.model.scale.setScalar(0.01);
    this.mesh.position.copy(this.pos);
    this.mesh.traverse((o) => { if (o.isMesh) { o.userData.enemy = this; this.parts.push(o); } });
  }

  part(parent, mat, w, h, d, x, y, z, head = false) {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    if (head) m.userData.head = true;
    parent.add(m);
    return m;
  }

  buildRobot() {
    const d = this.def, bw = d.bodyW, root = this.model, B = this.bodyMat;
    this.part(root, B, 0.8 * bw, 0.75, 0.5, 0, 1.1, 0);
    this.part(root, jointMat, 0.6 * bw, 0.2, 0.4, 0, 0.72, 0);
    this.part(root, this.eyeMat, 0.26, 0.1, 0.02, 0, 1.22, 0.26);
    this.part(root, B, 0.5, 0.42, 0.45, 0, 1.72, 0, true);
    this.part(root, this.eyeMat, 0.4, 0.1, 0.04, 0, 1.75, 0.235, true);
    if (this.kind === 'rusher') {
      for (const s of [-1, 1]) this.part(root, jointMat, 0.06, 0.3, 0.06, s * 0.16, 2.05, 0).rotation.z = s * -0.4;
    } else if (d.boss) {
      this.part(root, jointMat, 1.2, 0.15, 0.6, 0, 1.52, 0);
      for (const s of [-1, 1]) this.part(root, this.eyeMat, 0.1, 0.1, 0.1, s * 0.55, 1.62, 0.2);
    } else {
      this.part(root, jointMat, 0.04, 0.3, 0.04, 0.15, 2.05, 0);
      this.part(root, this.eyeMat, 0.08, 0.08, 0.08, 0.15, 2.22, 0);
    }
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.2 * bw, 0.72, 0);
      root.add(hip);
      this.part(hip, jointMat, 0.24, 0.72, 0.28, 0, -0.36, 0);
      this.part(hip, B, 0.3, 0.1, 0.42, 0, -0.67, 0.05);
      this.legs.push(hip);

      const sh = new THREE.Group();
      sh.position.set(s * (0.4 * bw + 0.13), 1.38, 0);
      root.add(sh);
      this.part(sh, jointMat, 0.2, 0.62, 0.22, 0, -0.28, 0);
      this.part(sh, B, 0.26, 0.2, 0.28, 0, 0, 0);
      if (d.gun && s === 1) {
        this.part(sh, jointMat, 0.15, 0.55, 0.15, 0, -0.78, 0);
        this.part(sh, this.eyeMat, 0.08, 0.04, 0.08, 0, -1.06, 0);
        this.muzzle = new THREE.Object3D();
        this.muzzle.position.set(0, -1.1, 0);
        sh.add(this.muzzle);
      }
      this.arms.push(sh);
    }
  }

  buildDrone() {
    const root = this.model;
    this.part(root, this.bodyMat, 0.8, 0.3, 0.8, 0, 0, 0);
    this.part(root, jointMat, 0.42, 0.15, 0.42, 0, 0.22, 0);
    this.part(root, this.eyeMat, 0.32, 0.14, 0.05, 0, 0, 0.41, true);
    this.part(root, jointMat, 1.6, 0.06, 0.08, 0, 0.05, 0).rotation.y = Math.PI / 4;
    this.part(root, jointMat, 1.6, 0.06, 0.08, 0, 0.05, 0).rotation.y = -Math.PI / 4;
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.6 });
    for (const [x, z] of [[0.56, 0.56], [-0.56, 0.56], [0.56, -0.56], [-0.56, -0.56]]) {
      const g = new THREE.Group();
      g.position.set(x, 0.14, z);
      root.add(g);
      this.part(g, rotorMat, 0.55, 0.02, 0.08, 0, 0, 0);
      this.rotors.push(g);
    }
    this.part(root, jointMat, 0.1, 0.1, 0.42, 0, -0.2, 0.25);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, -0.2, 0.5);
    root.add(this.muzzle);
  }

  get color() { return this.def.color; }

  eyePos(out) {
    out.copy(this.pos);
    if (!this.def.fly) out.y += 1.7 * this.def.scale;
    return out;
  }

  hit(dmg, dir, head) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flashT = 0.1;
    this.lastHead = head;
    const push = (dmg * 0.05) / (this.def.scale * this.def.scale);
    this.vel.x += dir.x * push;
    this.vel.z += dir.z * push;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  // g: { player, nav, colliders, enemies, lineOfSight, fire, melee, spawnMinion }
  update(dt, g) {
    const d = this.def;
    this.age += dt;
    const grow = Math.min(1, this.age / 0.5);
    this.model.scale.setScalar(d.scale * (1 - Math.pow(1 - grow, 3)));
    if (this.flashT > 0) this.flashT -= dt;
    this.bodyMat.emissiveIntensity = this.flashT > 0 ? 0.9 : 0;
    for (const r of this.rotors) r.rotation.y += dt * 40;
    if (grow < 1) return;

    const p = g.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const ux = dx / dist, uz = dz / dist;

    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.2 + Math.random() * 0.1;
      this.los = g.lineOfSight(this.eyePos(_eye), g.player.eye);
      _eye.copy(this.pos); _eye.y += 0.5;
      _v.copy(p); _v.y += 0.5;
      this.clear = !d.fly && g.lineOfSight(_eye, _v);
    }
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 1.5 + Math.random() * 2; }

    // Pick a direction to move
    let mx = 0, mz = 0;
    const toward = () => {
      if (this.clear || dist < 2) { mx = ux; mz = uz; return; }
      const t = g.nav.next(this.pos.x, this.pos.z);
      if (!t) { mx = ux; mz = uz; return; }
      const ex = t.x - this.pos.x, ez = t.z - this.pos.z, l = Math.hypot(ex, ez) || 1;
      mx = ex / l; mz = ez / l;
    };
    const side = (k) => { mx += -uz * this.strafe * k; mz += ux * this.strafe * k; };
    if (this.kind === 'rusher') {
      toward();
    } else if (this.kind === 'grunt') {
      if (this.los && dist < 9) { mx = -ux * 0.6; mz = -uz * 0.6; side(0.8); }
      else if (this.los && dist < 18) side(1);
      else toward();
    } else if (this.kind === 'drone') {
      if (dist > 12) { mx = ux; mz = uz; } else { side(1); if (dist < 7) { mx -= ux * 0.7; mz -= uz * 0.7; } }
    } else {
      if (dist > 6) toward(); else side(0.5);
    }

    // Keep some space from other bots
    for (const o of g.enemies) {
      if (o === this || !!o.def.fly !== !!d.fly) continue;
      const sx = this.pos.x - o.pos.x, sz = this.pos.z - o.pos.z;
      const sd = Math.hypot(sx, sz), min = this.r + o.r + 0.3;
      if (sd < min && sd > 0.001) { mx += (sx / sd) * (min - sd) * 2.5; mz += (sz / sd) * (min - sd) * 2.5; }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    const k = 1 - Math.exp(-6 * dt);
    this.vel.x += (mx * d.speed - this.vel.x) * k;
    this.vel.z += (mz * d.speed - this.vel.z) * k;
    const baseY = this.pos.y;
    if (d.fly) this.pos.y -= 0.25;
    moveBody(this, this.vel.x * dt, 0, this.vel.z * dt, g.colliders);
    if (d.fly) this.pos.y = d.fly + Math.sin(this.age * 2.2) * 0.35;
    else this.pos.y = baseY;

    // Face the player when we can see them, otherwise where we're walking
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const face = this.los || dist < 3 ? Math.atan2(dx, dz) : speed > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.mesh.rotation.y;
    let dr = face - this.mesh.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    this.mesh.rotation.y += dr * Math.min(1, dt * 10);
    this.mesh.position.copy(this.pos);

    // Animate
    this.walkT += dt * speed * 2.2 / d.scale;
    const swing = Math.sin(this.walkT) * Math.min(1, speed / 2) * 0.7;
    if (this.legs.length) { this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing; }
    const aimArm = d.gun && this.los && dist < d.range;
    if (this.arms.length) {
      this.arms[0].rotation.x = this.kind === 'rusher' ? -1.2 + Math.sin(this.age * 14) * 0.5 : -swing * 0.8;
      const target = aimArm ? -Math.PI / 2 : this.kind === 'rusher' ? -1.2 - Math.sin(this.age * 14) * 0.5 : swing * 0.8;
      this.arms[1].rotation.x += (target - this.arms[1].rotation.x) * Math.min(1, dt * 12);
    }
    if (d.fly) this.model.rotation.x = Math.min(0.35, speed * 0.06);

    // Eyes glow brighter just before firing (a warning!)
    const warn = d.fire && this.los && this.fireT < 0.45 ? 1 : 0;
    this.eyeMat.color.copy(this.eyeBase).multiplyScalar(1 + warn * (1.5 + Math.sin(this.age * 40)));

    // Attacks
    if (d.melee) {
      this.meleeT -= dt;
      if (dist < this.r + 0.9 && Math.abs(p.y - this.pos.y) < 1.6 && this.meleeT <= 0) {
        this.meleeT = 0.9;
        g.melee(d.melee * this.dmgScale, this.pos);
      }
    }
    if (d.fire) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = d.fire[0] + Math.random() * (d.fire[1] - d.fire[0]);
        if (this.los && dist < d.range) this.shoot(g, dist);
      }
    }
    if (d.boss) {
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = 8;
        g.spawnMinion(this.pos);
      }
    }
  }

  shoot(g, dist) {
    const d = this.def;
    const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
    const miss = 0.15 + dist * 0.025;
    _aim.copy(g.player.eye);
    _aim.y -= 0.35;
    _aim.x += (Math.random() - 0.5) * miss;
    _aim.y += (Math.random() - 0.5) * miss * 0.6;
    _aim.z += (Math.random() - 0.5) * miss;
    const dir = _aim.sub(origin).normalize();
    for (let i = 0; i < d.shots; i++) {
      const a = (i - (d.shots - 1) / 2) * 0.13;
      const v = dir.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, a).multiplyScalar(d.proj);
      g.fire(origin, v, d.dmg * this.dmgScale, d.boss ? 0xffee33 : d.eye, d.boss ? 0.28 : 0.18);
    }
  }
}
