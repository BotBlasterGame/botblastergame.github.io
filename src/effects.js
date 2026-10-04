import * as THREE from '../vendor/three.module.js';

const MAX_PARTS = 600;
const _m = new THREE.Object3D();
const _c = new THREE.Color();

// Sparks/debris (one instanced mesh), bullet tracers and explosion flashes
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_PARTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.parts = [];

    this.tracers = [];
    for (let i = 0; i < 32; i++) {
      const t = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      t.visible = false;
      t.userData.life = 0;
      scene.add(t);
      this.tracers.push(t);
    }
    this.tracerIdx = 0;

    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const f = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      f.visible = false;
      f.userData.life = 0;
      scene.add(f);
      this.flashes.push(f);
    }
    this.flashIdx = 0;
  }

  burst(pos, color, n, speed = 6, size = 0.12, life = 0.6) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      v.y = Math.abs(v.y) * 0.8 + speed * 0.2;
      const l = life * (0.5 + Math.random() * 0.5);
      this.parts.push({ p: pos.clone(), v, life: l, max: l, size: size * (0.6 + Math.random() * 0.8), color: new THREE.Color(color), rot: Math.random() * 6 });
    }
  }

  tracer(from, to, color) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    const len = from.distanceTo(to);
    t.position.lerpVectors(from, to, 0.5);
    t.lookAt(to);
    t.scale.set(0.025, 0.025, len);
    t.material.color.set(color);
    t.material.opacity = 1;
    t.userData.life = 0.07;
    t.visible = true;
  }

  explosion(pos, color, size = 1) {
    const f = this.flashes[this.flashIdx++ % this.flashes.length];
    f.position.copy(pos);
    f.material.color.set(color);
    f.userData.life = f.userData.max = 0.35;
    f.userData.size = size;
    f.visible = true;
    this.burst(pos, color, Math.round(24 * size), 8 * Math.sqrt(size), 0.18 * Math.sqrt(size), 0.9);
    this.burst(pos, 0xffe38a, Math.round(10 * size), 10 * Math.sqrt(size), 0.1, 0.4);
  }

  clear() {
    this.parts.length = 0;
    for (const t of this.tracers) t.visible = false;
    for (const f of this.flashes) f.visible = false;
  }

  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt;
      if (q.life <= 0) { this.parts.splice(i, 1); continue; }
      q.v.y -= 18 * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.05) { q.p.y = 0.05; q.v.y *= -0.4; q.v.x *= 0.7; q.v.z *= 0.7; }
      q.rot += dt * 8;
    }
    for (const q of this.parts) {
      _m.position.copy(q.p);
      _m.rotation.set(q.rot, q.rot * 0.7, 0);
      _m.scale.setScalar(q.size * Math.min(1, (q.life / q.max) * 2));
      _m.updateMatrix();
      this.mesh.setMatrixAt(n, _m.matrix);
      this.mesh.setColorAt(n, q.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    for (const t of this.tracers) {
      if (!t.visible) continue;
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.07);
      if (t.userData.life <= 0) t.visible = false;
    }
    for (const f of this.flashes) {
      if (!f.visible) continue;
      f.userData.life -= dt;
      const k = 1 - f.userData.life / f.userData.max;
      f.scale.setScalar(f.userData.size * (0.4 + k * 2.2));
      f.material.opacity = Math.max(0, 1 - k);
      if (f.userData.life <= 0) f.visible = false;
    }
  }
}
