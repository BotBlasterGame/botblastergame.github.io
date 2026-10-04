import * as THREE from '../vendor/three.module.js';
import { buildWorld, NavGrid, SPAWNS, moveBody, rayWorld, segmentBlocked } from './world.js';
import { Enemy } from './enemies.js';
import { WEAPONS, buildViewmodel } from './weapons.js';
import { Effects } from './effects.js';
import { Sound } from './audio.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const SAVE_KEY = 'bot-blaster-save-v1';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const gauss = () => Math.random() + Math.random() + Math.random() - 1.5;

// ---------- Save data ----------
const DEFAULT_SAVE = { bestScore: 0, bestWave: 0, settings: { music: 50, sfx: 80, sens: 100, fov: 80, shadows: true } };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) return { ...DEFAULT_SAVE, ...s, settings: { ...DEFAULT_SAVE.settings, ...s.settings } };
  } catch (e) { /* ignore */ }
  return structuredClone(DEFAULT_SAVE);
}
const save = loadSave();
const settings = save.settings;
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

// ---------- Renderer, scenes, cameras ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.autoClear = false;
renderer.shadowMap.enabled = settings.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d1a);
scene.fog = new THREE.Fog(0x0a0d1a, 45, 170);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 400);
camera.rotation.order = 'YXZ';

// The gun is drawn in its own scene on top of the world so it never clips into walls
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xc8d4ff, 0x302838, 1.6));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.8);
vmSun.position.set(1, 2, 1);
vmScene.add(vmSun);
const vmRoot = new THREE.Group();
vmScene.add(vmRoot);
const viewmodels = WEAPONS.map((w) => {
  const v = buildViewmodel(w);
  vmRoot.add(v.group);
  return v;
});

const world = buildWorld(scene);
const colliders = world.colliders;
const nav = new NavGrid(colliders);
const effects = new Effects(scene);
const sound = new Sound();
sound.setVolumes(settings.music / 100, settings.sfx / 100);
const muzzleLight = new THREE.PointLight(0xffd080, 0, 9, 2);
scene.add(muzzleLight);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = vmCamera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Game state ----------
let state = 'title'; // title | playing | paused | over
let settingsFrom = 'title';
const player = { pos: new THREE.Vector3(0, 1, 0), vel: new THREE.Vector3(), r: 0.4, h: 1.75, grounded: true, hp: 100, maxHp: 100, eye: new THREE.Vector3(), speed: 0, sprinting: false };
let yaw = 0, pitch = 0;
let enemies = [], projectiles = [], pickups = [];
let boss = null;
let score = 0, kills = 0, shots = 0, hits = 0;
let wave = 0, toSpawn = [], spawnT = 0, breakT = 0, waveActive = false;
let arsenal = [], current = 0;
let fireCD = 0, reloadT = 0, switchT = 0, triggerHeld = false, aiming = false, ads = 0;
let kick = 0, trauma = 0, hurtT = 0, bobT = 0, stepT = 0, flashT = 0, navT = 0, hmT = 0, bannerT = 0, wheelT = 0;
let swayX = 0, swayY = 0, time = 0;
let jumpQueued = false;
const keys = {};

// ---------- Input ----------
// Same camera controls as Sky Climb: moving the mouse always turns the view (no click needed),
// the mouse gets captured on any click or key press, and if the browser won't capture it,
// holding the cursor near the left/right edge keeps turning. Q/E turn without a mouse.
const locked = () => document.pointerLockElement === canvas;
const EDGE_ZONE = 0.12; // outer 12% of the screen on each side
const EDGE_TURN_SPEED = 2.6; // radians per second at the very edge
const KEY_TURN_SPEED = 1.8; // radians per second for Q/E
const mouse = { x: 0.5, inside: false };
let lockPending = false;
function lockPointer() {
  if (lockPending || locked()) return;
  lockPending = true;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { lockPending = false; });
  } catch (e) { lockPending = false; }
}
// Only pause when a lock we actually had is lost (that's the player pressing Esc)
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  lockPending = false;
  if (locked()) { hadLock = true; return; }
  releaseInput();
  if (hadLock && state === 'playing') pause();
  hadLock = false;
});
document.addEventListener('pointerlockerror', () => { lockPending = false; });
function releaseInput() {
  for (const k in keys) keys[k] = false;
  triggerHeld = aiming = jumpQueued = false;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
  keys[e.code] = true;
  if (state !== 'playing') return;
  if (e.code !== 'Escape') lockPointer();
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Digit1') switchTo(0);
  if (e.code === 'Digit2') switchTo(1);
  if (e.code === 'Digit3') switchTo(2);
  if (e.code === 'KeyP' || (e.code === 'Escape' && !locked())) pause();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
// Keys can get "stuck" down if they're released while the window isn't listening
window.addEventListener('blur', releaseInput);
document.addEventListener('visibilitychange', releaseInput);
document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX / window.innerWidth;
  mouse.inside = true;
  if (state !== 'playing') return;
  // Without a lock the cursor can jump (e.g. re-entering the window) — ignore huge spikes
  const mx = clamp(e.movementX, -150, 150), my = clamp(e.movementY, -150, 150);
  const s = (settings.sens / 100) * 0.0025 * (1 - ads * 0.45);
  yaw -= mx * s;
  pitch = clamp(pitch - my * s, -1.5, 1.5);
  swayX = clamp(swayX + mx * 0.0003, -0.04, 0.04);
  swayY = clamp(swayY + my * 0.0003, -0.04, 0.04);
});
document.documentElement.addEventListener('mouseleave', () => { mouse.inside = false; });

function turnInput(dt) {
  const sens = settings.sens / 100;
  if (keys.KeyQ) yaw += KEY_TURN_SPEED * sens * dt;
  if (keys.KeyE) yaw -= KEY_TURN_SPEED * sens * dt;
  if (locked() || !mouse.inside) return;
  let push = 0;
  if (mouse.x < EDGE_ZONE) push = (EDGE_ZONE - mouse.x) / EDGE_ZONE;
  else if (mouse.x > 1 - EDGE_ZONE) push = -(mouse.x - (1 - EDGE_ZONE)) / EDGE_ZONE;
  yaw += push * EDGE_TURN_SPEED * sens * dt;
}
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  lockPointer();
  if (e.button === 0) triggerHeld = true;
  if (e.button === 2) aiming = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) triggerHeld = false;
  if (e.button === 2) aiming = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => {
  if (state !== 'playing' || wheelT > time) return;
  wheelT = time + 0.15;
  switchTo((current + (e.deltaY > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length);
}, { passive: true });

// ---------- Weapons ----------
const raycaster = new THREE.Raycaster();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _dir = new THREE.Vector3(), _muzzle = new THREE.Vector3(), _pt = new THREE.Vector3();

function resetArsenal() {
  arsenal = WEAPONS.map((d) => ({ def: d, mag: d.mag, reserve: d.reserve }));
  current = 0;
  viewmodels.forEach((v, i) => { v.group.visible = i === current; });
  buildSlots();
}

function switchTo(i) {
  if (i === current || i < 0 || i >= arsenal.length) return;
  current = i;
  reloadT = 0;
  switchT = 0.35;
  fireCD = Math.max(fireCD, 0.1);
  sound.switchWeapon();
  viewmodels.forEach((v, k) => { v.group.visible = k === current; });
  buildSlots();
}

function startReload() {
  const w = arsenal[current];
  if (reloadT > 0 || switchT > 0 || w.mag >= w.def.mag || w.reserve <= 0) return;
  reloadT = w.def.reload;
  sound.reload();
}

function finishReload() {
  const w = arsenal[current];
  const take = Math.min(w.def.mag - w.mag, w.reserve);
  w.mag += take;
  w.reserve -= take;
}

function currentSpread() {
  const d = arsenal[current].def;
  return d.spread * (1 - ads * 0.6) + (player.speed > 1 ? 0.008 : 0) + (player.grounded ? 0 : 0.02);
}

function fire() {
  const w = arsenal[current], d = w.def;
  if (w.mag <= 0) {
    if (w.reserve > 0) startReload();
    else { sound.empty(); fireCD = 0.3; }
    return;
  }
  w.mag--;
  fireCD = d.rate;
  shots++;
  sound.shoot(d.id);

  camera.updateMatrixWorld();
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  _muzzle.set(0.2 * (1 - ads), -0.16 + 0.08 * ads, -0.9).applyMatrix4(camera.matrixWorld);
  const spread = currentSpread();
  const parts = [];
  for (const e of enemies) if (!e.dead) for (const p of e.parts) parts.push(p);

  let hitAny = false, killAny = false, headAny = false;
  for (let i = 0; i < d.pellets; i++) {
    _dir.copy(_fwd).addScaledVector(_right, gauss() * spread).addScaledVector(_up, gauss() * spread).normalize();
    const wd = rayWorld(camera.position, _dir, colliders, 200);
    raycaster.set(camera.position, _dir);
    raycaster.far = wd;
    const hit = raycaster.intersectObjects(parts, false)[0];
    if (hit) {
      const e = hit.object.userData.enemy;
      const head = !!hit.object.userData.head;
      if (e.hit(d.dmg * (head ? 2 : 1), _dir, head)) killAny = true;
      hitAny = true;
      headAny = headAny || head;
      effects.burst(hit.point, e.color, 4, 4, 0.08, 0.35);
      effects.tracer(_muzzle, hit.point, d.color);
    } else {
      _pt.copy(camera.position).addScaledVector(_dir, wd);
      if (wd < 200) effects.burst(_pt, 0xffe0a0, 3, 3, 0.06, 0.3);
      effects.tracer(_muzzle, _pt, d.color);
    }
  }
  if (hitAny) {
    hits++;
    showHitmarker(killAny, headAny);
    sound.hit(headAny);
  }
  kick = 0.4; // tiny visual nudge of the gun only — the aim never moves
  flashT = 0.05;
  muzzleLight.position.copy(_muzzle);
}

// ---------- Enemies & their shots ----------
const projGeo = new THREE.SphereGeometry(1, 12, 8);
const projMats = new Map();
function projMat(color) {
  if (!projMats.has(color)) {
    projMats.set(color, [
      new THREE.MeshBasicMaterial({ color }),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    ]);
  }
  return projMats.get(color);
}

function spawnProjectile(origin, vel, dmg, color, size) {
  const [core, glow] = projMat(color);
  const m = new THREE.Mesh(projGeo, core);
  m.scale.setScalar(size);
  const halo = new THREE.Mesh(projGeo, glow);
  halo.scale.setScalar(2.2);
  m.add(halo);
  m.position.copy(origin);
  scene.add(m);
  projectiles.push({ mesh: m, vel: vel.clone(), dmg, life: 4, size, color });
  sound.enemyShoot(Math.max(0.15, 1 - origin.distanceTo(player.eye) / 40));
}

function insideCollider(p) {
  for (const c of colliders) if (c.containsPoint(p)) return true;
  return false;
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i], pos = p.mesh.position;
    p.life -= dt;
    let done = false;
    for (let s = 0; s < 3 && !done; s++) {
      pos.addScaledVector(p.vel, dt / 3);
      const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z, rr = player.r + p.size + 0.1;
      if (dx * dx + dz * dz < rr * rr && pos.y > player.pos.y - 0.1 && pos.y < player.pos.y + player.h + 0.15) {
        damagePlayer(p.dmg, pos);
        done = true;
      } else if (pos.y < 0 || insideCollider(pos)) {
        done = true;
      }
    }
    if (done) effects.burst(pos, p.color, 6, 3, 0.07, 0.3);
    if (done || p.life <= 0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

const _knock = new THREE.Vector3();
const ctx = {
  player, nav, colliders,
  get enemies() { return enemies; },
  lineOfSight: (a, b) => !segmentBlocked(a, b, colliders),
  fire: spawnProjectile,
  melee(dmg, from) {
    sound.melee();
    _knock.subVectors(player.pos, from).setY(0).normalize();
    player.vel.x += _knock.x * 7;
    player.vel.z += _knock.z * 7;
    damagePlayer(dmg, from);
  },
  spawnMinion(pos) {
    for (const s of [-1, 1]) spawnEnemy('rusher', new THREE.Vector3(pos.x + s * 2.5, 0, pos.z + 1), true);
  },
};

function pickSpawn() {
  const far = SPAWNS.filter((s) => s.distanceTo(player.pos) > 18);
  const list = far.length ? far : SPAWNS;
  const s = list[Math.floor(Math.random() * list.length)].clone();
  s.x += (Math.random() - 0.5) * 2;
  s.z += (Math.random() - 0.5) * 2;
  return s;
}

function spawnEnemy(kind, pos, silent = false) {
  const n = Math.max(1, wave);
  const hpScale = kind === 'boss' ? 1 + 0.5 * (n / 5 - 1) : 1 + 0.1 * (n - 1);
  const e = new Enemy(kind, pos, hpScale, 1 + 0.04 * (n - 1));
  scene.add(e.mesh);
  enemies.push(e);
  effects.burst(new THREE.Vector3(pos.x, 0.3, pos.z), 0xff3fa4, 14, 5, 0.1, 0.6);
  if (!silent) sound.spawn(Math.max(0.2, 1 - pos.distanceTo(player.pos) / 50));
  if (kind === 'boss') boss = e;
  return e;
}

function groundAt(x, z) {
  let y = 0;
  for (const c of colliders) if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z && c.max.y < 3) y = Math.max(y, c.max.y);
  return y;
}

function killEnemy(e) {
  const d = e.def;
  const center = e.pos.clone();
  if (!d.fly) center.y += e.h * 0.5;
  effects.explosion(center, d.color, d.boss ? 4 : d.scale);
  sound.explode(Math.max(0.3, 1 - center.distanceTo(player.eye) / 50));
  sound.kill();
  scene.remove(e.mesh);
  e.bodyMat.dispose();
  e.eyeMat.dispose();
  kills++;
  const pts = d.score + (e.lastHead ? 50 : 0);
  score += pts;
  addFeed(`+${pts}${e.lastHead ? ' HEADSHOT' : ''}`, e.lastHead);
  if (d.boss || d.scale > 1.2) trauma = Math.min(1, trauma + (d.boss ? 0.8 : 0.25));
  if (e === boss) boss = null;

  const x = e.pos.x, z = e.pos.z, r = Math.random();
  if (d.boss) {
    spawnPickup('health', x - 1.5, z);
    spawnPickup('ammo', x + 1.5, z);
    spawnPickup('ammo', x, z + 1.5);
  } else if (e.kind === 'tank') {
    spawnPickup('health', x - 0.8, z);
    spawnPickup('ammo', x + 0.8, z);
  } else if (r < 0.16) spawnPickup('health', x, z);
  else if (r < 0.42) spawnPickup('ammo', x, z);
}

// ---------- Pickups ----------
const pickupMats = {
  white: new THREE.MeshStandardMaterial({ color: 0xf0f4ff, roughness: 0.4 }),
  green: new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x3ddc84, emissiveIntensity: 0.8 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 0.4 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2a2f3a }),
  ringG: new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  ringY: new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
};
const pickupBox = new THREE.BoxGeometry(1, 1, 1);
const pickupRing = new THREE.RingGeometry(0.45, 0.6, 24);

function spawnPickup(kind, x, z) {
  x = clamp(x, -28.5, 28.5);
  z = clamp(z, -28.5, 28.5);
  const g = new THREE.Group();
  const item = new THREE.Group();
  g.add(item);
  const add = (mat, w, h, d, px = 0, py = 0, pz = 0) => {
    const m = new THREE.Mesh(pickupBox, mat);
    m.scale.set(w, h, d);
    m.position.set(px, py, pz);
    m.castShadow = true;
    item.add(m);
  };
  if (kind === 'health') {
    add(pickupMats.white, 0.5, 0.5, 0.5);
    add(pickupMats.green, 0.52, 0.12, 0.34);
    add(pickupMats.green, 0.52, 0.34, 0.12);
    add(pickupMats.green, 0.12, 0.34, 0.52);
    add(pickupMats.green, 0.34, 0.12, 0.52);
  } else {
    add(pickupMats.yellow, 0.6, 0.36, 0.4);
    add(pickupMats.dark, 0.62, 0.08, 0.42, 0, 0.06, 0);
    add(pickupMats.dark, 0.2, 0.1, 0.1, 0, 0.23, 0);
  }
  const ring = new THREE.Mesh(pickupRing, kind === 'health' ? pickupMats.ringG : pickupMats.ringY);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const y = groundAt(x, z);
  g.position.set(x, y, z);
  scene.add(g);
  pickups.push({ kind, mesh: g, item, life: 25, y });
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    p.item.rotation.y += dt * 2;
    p.item.position.y = 0.6 + Math.sin(time * 3 + i) * 0.12;
    p.mesh.visible = p.life > 5 || Math.sin(p.life * 20) > 0;
    const dx = player.pos.x - p.mesh.position.x, dz = player.pos.z - p.mesh.position.z;
    let taken = false;
    if (dx * dx + dz * dz < 1.4 * 1.4 && Math.abs(player.pos.y - p.y) < 1.5) {
      if (p.kind === 'health' && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 30);
        addFeed('+30 HEALTH', false, 'hp');
        taken = true;
      } else if (p.kind === 'ammo') {
        arsenal[1].reserve = Math.min(arsenal[1].def.maxReserve, arsenal[1].reserve + 48);
        arsenal[2].reserve = Math.min(arsenal[2].def.maxReserve, arsenal[2].reserve + 10);
        addFeed('+AMMO', false, 'ammo');
        taken = true;
      }
    }
    if (taken) sound.pickup();
    if (taken || p.life <= 0) {
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

// ---------- Player ----------
function damagePlayer(amount, from) {
  if (state !== 'playing' || player.hp <= 0) return;
  if (DEBUG && window.__bb && window.__bb.god) return;
  player.hp = Math.max(0, player.hp - Math.round(amount));
  hurtT = Math.min(1, hurtT + 0.4 + amount / 40);
  trauma = Math.min(1, trauma + 0.25 + amount / 60);
  sound.hurt();
  showDamageDir(from);
  if (player.hp <= 0) gameOver();
}

function updatePlayer(dt) {
  const fwdIn = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const sideIn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  player.sprinting = !!(keys.ShiftLeft || keys.ShiftRight) && fwdIn > 0 && !aiming && !triggerHeld && reloadT <= 0;
  const speed = player.sprinting ? 10.5 : aiming ? 4.5 : 7;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  let wx = -sin * fwdIn + cos * sideIn, wz = -cos * fwdIn - sin * sideIn;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  const k = Math.min(1, (player.grounded ? 12 : 3) * dt);
  player.vel.x += (wx * speed - player.vel.x) * k;
  player.vel.z += (wz * speed - player.vel.z) * k;
  player.vel.y -= 24 * dt;
  if (jumpQueued && player.grounded) {
    player.vel.y = 8.2;
    player.grounded = false;
    sound.jump();
  }
  jumpQueued = false;
  const wasGrounded = player.grounded, fallV = player.vel.y;
  moveBody(player, player.vel.x * dt, player.vel.y * dt, player.vel.z * dt, colliders, 0.55);
  if (!wasGrounded && player.grounded && fallV < -6) { sound.land(); trauma = Math.min(1, trauma + 0.1); }

  player.speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && player.speed > 1) {
    bobT += dt * player.speed * 1.3;
    stepT -= dt * player.speed;
    if (stepT <= 0) { stepT = 2.4; sound.footstep(); }
  }
  player.eye.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
}

function updateCamera(dt) {
  trauma = Math.max(0, trauma - dt * 1.5);
  const shake = trauma * trauma * 0.07;
  const bobY = player.grounded ? Math.abs(Math.sin(bobT)) * 0.06 * Math.min(1, player.speed / 7) * (1 - ads * 0.8) : 0;
  camera.position.set(player.eye.x, player.eye.y + bobY - 0.03, player.eye.z);
  camera.rotation.set(pitch + (Math.random() - 0.5) * shake, yaw + (Math.random() - 0.5) * shake, 0);
  const targetFov = settings.fov * (1 - ads * 0.3) * (player.sprinting ? 1.06 : 1);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
  camera.updateProjectionMatrix();
}

function updateViewmodel(dt) {
  ads += ((aiming && reloadT <= 0 && switchT <= 0 ? 1 : 0) - ads) * Math.min(1, dt * 14);
  kick = Math.max(0, kick - dt * 10);
  swayX *= Math.exp(-dt * 10);
  swayY *= Math.exp(-dt * 10);
  const move = Math.min(1, player.speed / 7) * (player.grounded ? 1 : 0.3) * (1 - ads * 0.85);
  let x = lerp(0.17, 0, ads) + Math.sin(bobT) * 0.014 * move - swayX;
  let y = lerp(-0.16, -0.075, ads) - Math.abs(Math.cos(bobT)) * 0.012 * move + swayY;
  const z = lerp(-0.56, -0.42, ads) + kick * 0.06;
  let rx = -swayY * 2, ry = -swayX * 2, rz = 0;
  if (switchT > 0) {
    const s = switchT / 0.35;
    y -= s * 0.3;
    rx -= s * 0.6;
  }
  if (reloadT > 0) {
    const s = Math.sin((1 - reloadT / arsenal[current].def.reload) * Math.PI);
    y -= s * 0.12;
    rx -= s * 0.5;
    rz += s * 0.5;
  }
  if (player.sprinting) {
    ry += 0.5;
    rz += 0.25;
    y -= 0.05;
  }
  vmRoot.position.set(x, y, z);
  vmRoot.rotation.set(rx, ry, rz);
  const vm = viewmodels[current];
  vm.flash.visible = flashT > 0;
  if (flashT > 0) {
    vm.flash.rotation.z = Math.random() * 6;
    vm.flash.scale.setScalar(0.8 + Math.random() * 0.8);
  }
  muzzleLight.intensity = flashT > 0 ? 40 : 0;
}

// ---------- Waves ----------
function waveList(n) {
  const list = [];
  const isBoss = n % 5 === 0;
  const count = isBoss ? 4 + n : 5 + Math.floor(n * 2.2);
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let t = 'grunt';
    if (n >= 2 && r < 0.3) t = 'rusher';
    else if (n >= 3 && r < 0.48) t = 'drone';
    else if (n >= 4 && r < 0.58) t = 'tank';
    list.push(t);
  }
  if (isBoss) list.splice(2, 0, 'boss');
  return list;
}

function startWave(n) {
  wave = n;
  toSpawn = waveList(n);
  spawnT = 0.5;
  waveActive = true;
  const isBoss = n % 5 === 0;
  showBanner(isBoss ? `BOSS WAVE ${n}` : `WAVE ${n}`, isBoss ? 'The MEGA BOT is coming!' : `${toSpawn.length} bots incoming`, 2.5);
  sound.waveStart();
}

function updateWaves(dt) {
  if (!waveActive) {
    breakT -= dt;
    if (breakT <= 0) startWave(wave + 1);
    return;
  }
  spawnT -= dt;
  if (toSpawn.length && spawnT <= 0 && enemies.length < 6 + Math.floor(wave / 2)) {
    spawnEnemy(toSpawn.shift(), pickSpawn());
    spawnT = Math.max(0.4, 1.3 - wave * 0.06);
  }
  if (!toSpawn.length && !enemies.length) {
    waveActive = false;
    breakT = 6;
    const bonus = wave * 150;
    score += bonus;
    player.hp = Math.min(player.maxHp, player.hp + 25);
    showBanner(`WAVE ${wave} CLEARED`, `+${bonus} bonus  •  +25 health`, 2.8);
    sound.waveClear();
    const a = Math.random() * Math.PI * 2;
    spawnPickup('ammo', Math.cos(a) * 9, Math.sin(a) * 9);
    spawnPickup('health', -Math.cos(a) * 9, -Math.sin(a) * 9);
  }
}

// ---------- HUD ----------
const textCache = new Map();
function setText(id, v) {
  if (textCache.get(id) === v) return;
  textCache.set(id, v);
  $(id).textContent = v;
}

function buildSlots() {
  const el = $('weapon-slots');
  el.innerHTML = '';
  arsenal.forEach((w, i) => {
    const s = document.createElement('div');
    s.className = 'slot' + (i === current ? ' active' : '') + (w.mag + w.reserve <= 0 ? ' empty' : '');
    s.textContent = `${i + 1} ${w.def.name.split(' ')[1]}`;
    el.appendChild(s);
  });
  textCache.delete('slots');
}

function showHitmarker(kill, head) {
  const h = $('hitmarker');
  h.className = kill ? 'kill' : head ? 'head' : '';
  hmT = kill ? 0.3 : 0.15;
}

function addFeed(text, head, kind) {
  const feed = $('feed');
  const d = document.createElement('div');
  d.className = 'feed-item' + (head ? ' head' : '');
  if (kind === 'hp') d.style.color = '#3ddc84';
  if (kind === 'ammo') d.style.color = '#35e0ff';
  d.textContent = text;
  feed.appendChild(d);
  while (feed.children.length > 4) feed.firstChild.remove();
  setTimeout(() => d.remove(), 1200);
}

function showDamageDir(from) {
  if (!from) return;
  const a = Math.atan2(from.x - player.pos.x, from.z - player.pos.z);
  const rel = a - (yaw + Math.PI);
  const d = document.createElement('div');
  d.className = 'dmg-arrow';
  d.style.transform = `rotate(${-rel}rad)`;
  $('dmg-layer').appendChild(d);
  setTimeout(() => d.remove(), 900);
}

function showBanner(big, small, dur) {
  const b = $('banner');
  $('banner-big').textContent = big;
  $('banner-small').textContent = small;
  b.classList.remove('hidden');
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  bannerT = dur;
}

function updateHUD(dt) {
  const w = arsenal[current];
  setText('ammo-mag', String(w.mag));
  setText('ammo-res', '/ ' + (w.reserve === Infinity ? '∞' : w.reserve));
  $('ammo-mag').classList.toggle('low', w.mag <= Math.ceil(w.def.mag * 0.25));
  setText('weapon-name', reloadT > 0 ? 'Reloading…' : w.def.name);
  $('hp-fill').style.width = `${(player.hp / player.maxHp) * 100}%`;
  $('hp-fill').classList.toggle('low', player.hp <= 30);
  setText('hp-text', String(player.hp));
  setText('hud-wave', wave ? `WAVE ${wave}` : 'GET READY');
  setText('hud-left', waveActive ? `Bots left: ${toSpawn.length + enemies.length}` : `Next wave in ${Math.max(0, Math.ceil(breakT))}`);
  setText('hud-score', score.toLocaleString());
  setText('hud-kills', `${kills} kill${kills === 1 ? '' : 's'}`);
  $('boss-bar').classList.toggle('hidden', !boss);
  if (boss) $('boss-fill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;

  const px = (currentSpread() / Math.tan((camera.fov * Math.PI) / 360)) * (window.innerHeight / 2);
  $('crosshair').style.setProperty('--gap', `${5 + px * 1.3}px`);
  $('crosshair').classList.toggle('ads', ads > 0.5 && arsenal[current].def.id !== 'shotgun');
  hmT -= dt;
  $('hitmarker').style.opacity = hmT > 0 ? 1 : 0;

  let hint = '';
  if (w.mag === 0 && w.reserve <= 0) hint = 'Out of ammo! Press <b>1</b> for your pistol';
  else if (reloadT <= 0 && w.mag <= Math.ceil(w.def.mag * 0.25) && w.reserve > 0) hint = 'Press <b>R</b> to reload';
  if (textCache.get('hint') !== hint) {
    textCache.set('hint', hint);
    $('reload-hint').innerHTML = hint;
    $('reload-hint').classList.toggle('hidden', !hint);
  }
  const slotKey = arsenal.map((a) => (a.mag + a.reserve > 0 ? 1 : 0)).join('') + current;
  if (textCache.get('slots') !== slotKey) { buildSlots(); textCache.set('slots', slotKey); }

  const low = player.hp <= 30 ? 0.35 + 0.15 * Math.sin(time * 6) : 0;
  $('vignette').style.opacity = Math.max(hurtT, low);
  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) $('banner').classList.add('hidden');
  }
}

// ---------- Flow ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  if (name) $(`screen-${name}`).classList.remove('hidden');
}

function clearArena() {
  for (const e of enemies) scene.remove(e.mesh);
  for (const p of projectiles) scene.remove(p.mesh);
  for (const p of pickups) scene.remove(p.mesh);
  enemies = [];
  projectiles = [];
  pickups = [];
  boss = null;
  effects.clear();
}

function startGame() {
  sound.init();
  sound.startMusic();
  clearArena();
  player.pos.set(0, 1, 0);
  player.vel.set(0, 0, 0);
  player.hp = player.maxHp;
  player.grounded = true;
  player.eye.set(0, 2.6, 0);
  yaw = 0;
  pitch = 0;
  score = kills = shots = hits = 0;
  wave = 0;
  waveActive = false;
  breakT = 3;
  toSpawn = [];
  resetArsenal();
  fireCD = reloadT = switchT = ads = hurtT = trauma = kick = 0;
  aiming = triggerHeld = false;
  showBanner('GET READY', 'Robots incoming…', 2.6);
  state = 'playing';
  showScreen(null);
  $('hud').classList.remove('hidden');
  lockPointer();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  releaseInput();
  showScreen('pause');
  if (locked()) document.exitPointerLock();
}

function resume() {
  state = 'playing';
  showScreen(null);
  lockPointer();
}

function gameOver() {
  state = 'over';
  triggerHeld = aiming = false;
  sound.stopMusic();
  sound.gameOver();
  const record = score > save.bestScore;
  if (record) save.bestScore = score;
  save.bestWave = Math.max(save.bestWave, wave);
  writeSave();
  $('over-wave').textContent = wave;
  $('over-score').textContent = score.toLocaleString();
  $('over-kills').textContent = kills;
  $('over-acc').textContent = `${shots ? Math.round((hits / shots) * 100) : 0}%`;
  $('over-record').classList.toggle('hidden', !record);
  $('over-best').textContent = `High score: ${save.bestScore.toLocaleString()}  •  Best wave: ${save.bestWave}`;
  if (locked()) document.exitPointerLock();
  setTimeout(() => { if (state === 'over') showScreen('over'); }, 1200);
}

function toMenu() {
  state = 'title';
  clearArena();
  sound.startMusic();
  $('hud').classList.add('hidden');
  updateTitleBest();
  showScreen('title');
}

function updateTitleBest() {
  $('title-best').textContent = save.bestScore ? `High score: ${save.bestScore.toLocaleString()}  •  Best wave: ${save.bestWave}` : '';
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

// ---------- Menus ----------
function bindSettings() {
  const music = $('set-music'), sfx = $('set-sfx'), sens = $('set-sens'), fov = $('set-fov'), shadows = $('set-shadows');
  music.value = settings.music;
  sfx.value = settings.sfx;
  sens.value = settings.sens;
  fov.value = settings.fov;
  shadows.checked = settings.shadows;
  $('fov-val').textContent = settings.fov;
  const apply = () => {
    settings.music = +music.value;
    settings.sfx = +sfx.value;
    settings.sens = +sens.value;
    settings.fov = +fov.value;
    $('fov-val').textContent = settings.fov;
    sound.setVolumes(settings.music / 100, settings.sfx / 100);
    if (settings.shadows !== shadows.checked) {
      settings.shadows = shadows.checked;
      renderer.shadowMap.enabled = settings.shadows;
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
    writeSave();
  };
  for (const el of [music, sfx, sens, fov, shadows]) el.addEventListener('input', apply);
}
bindSettings();

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  sound.init();
  sound.click();
  switch (b.dataset.action) {
    case 'play': startGame(); break;
    case 'settings': settingsFrom = 'title'; showScreen('settings'); break;
    case 'settings-pause': settingsFrom = 'pause'; showScreen('settings'); break;
    case 'back-settings': showScreen(settingsFrom); break;
    case 'resume': resume(); break;
    case 'restart': startGame(); break;
    case 'menu': toMenu(); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'reset':
      if (confirm('Reset your high score?')) {
        save.bestScore = 0;
        save.bestWave = 0;
        writeSave();
        updateTitleBest();
      }
      break;
    case 'quit': window.close(); break;
  }
});
// Start the menu music on the first interaction (browsers block audio until then)
document.addEventListener('pointerdown', () => { sound.init(); if (state === 'title') sound.startMusic(); }, { once: true });

// ---------- Main loop ----------
function update(dt) {
  turnInput(dt);
  updatePlayer(dt);
  updateCamera(dt);
  navT -= dt;
  if (navT <= 0) {
    navT = 0.25;
    nav.update(player.pos.x, player.pos.z);
  }

  fireCD -= dt;
  switchT = Math.max(0, switchT - dt);
  if (reloadT > 0) {
    reloadT -= dt;
    if (reloadT <= 0) { reloadT = 0; finishReload(); }
  }
  const w = arsenal[current];
  if (w.mag === 0 && w.reserve > 0 && reloadT === 0 && switchT === 0 && fireCD <= 0) startReload();
  if (triggerHeld && fireCD <= 0 && reloadT <= 0 && switchT <= 0) fire();

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead) { killEnemy(enemies[i]); enemies.splice(i, 1); }
  }
  for (const e of enemies) e.update(dt, ctx);
  updateProjectiles(dt);
  updatePickups(dt);
  if (state !== 'playing') return; // died this frame
  updateWaves(dt);
  hurtT = Math.max(0, hurtT - dt * 1.2);
  flashT -= dt;
  updateViewmodel(dt);
  updateHUD(dt);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  world.update(time);

  const active = state === 'playing';
  if (active) update(dt);
  else if (state === 'title') {
    const a = time * 0.08;
    camera.position.set(Math.sin(a) * 24, 9, Math.cos(a) * 24);
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 1, 0);
  }
  if (active || state === 'title') effects.update(dt);


  renderer.clear();
  renderer.render(scene, camera);
  if (state === 'playing' || state === 'paused') {
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
  }
}

updateTitleBest();
resetArsenal();
requestAnimationFrame(frame);

if (DEBUG) {
  window.__bb = {
    god: false,
    get state() { return state; },
    get enemies() { return enemies; },
    get score() { return score; },
    get wave() { return wave; },
    get arsenal() { return arsenal; },
    get view() { return { ads, aiming, reloadT, switchT, pos: vmRoot.position.toArray() }; },
    player,
    startGame,
    spawn: (kind) => spawnEnemy(kind, pickSpawn()),
    setWave: (n) => { wave = n - 1; breakT = 0; waveActive = false; toSpawn = []; },
    look: (y, p) => { yaw = y; pitch = p; },
    aimAt: (e) => {
      const t = e.eyePos(new THREE.Vector3());
      if (!e.def.fly) t.y -= 0.5 * e.def.scale;
      const dx = t.x - player.eye.x, dy = t.y - player.eye.y, dz = t.z - player.eye.z;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    trigger: (v) => { triggerHeld = v; },
    key: (code, v) => { keys[code] = v; },
  };
}
