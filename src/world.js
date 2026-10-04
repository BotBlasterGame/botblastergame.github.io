import * as THREE from '../vendor/three.module.js';

export const ARENA = 30; // half-size of the square arena, in meters
const WALL_H = 7;

// [x, z, width, depth, height, kind]
const LAYOUT = [
  [0, 0, 6, 6, 1, 'plat'],
  [3.8, 0, 1.6, 1.6, 0.5, 'crate'], [-3.8, 0, 1.6, 1.6, 0.5, 'crate'],
  [0, 3.8, 1.6, 1.6, 0.5, 'crate'], [0, -3.8, 1.6, 1.6, 0.5, 'crate'],
  [12, 12, 2.5, 2.5, WALL_H, 'pillar'], [-12, 12, 2.5, 2.5, WALL_H, 'pillar'],
  [12, -12, 2.5, 2.5, WALL_H, 'pillar'], [-12, -12, 2.5, 2.5, WALL_H, 'pillar'],
  [0, 16, 8, 0.8, 1.3, 'wall'], [0, -16, 8, 0.8, 1.3, 'wall'],
  [16, 0, 0.8, 8, 1.3, 'wall'], [-16, 0, 0.8, 8, 1.3, 'wall'],
  [7, -6, 2, 2, 2, 'crate'], [8.6, -7.4, 1.4, 1.4, 1, 'crate'],
  [-7, 6, 2, 2, 2, 'crate'], [-8.6, 7.4, 1.4, 1.4, 1, 'crate'],
  [-6.5, -8, 2, 2, 1, 'crate'], [6.5, 8, 2, 2, 1, 'crate'],
  [22, 17, 2, 2, 2, 'crate'], [-22, -17, 2, 2, 2, 'crate'],
  [20, -22, 3, 2, 1, 'crate'], [-20, 22, 3, 2, 1, 'crate'],
  [24, 5, 2, 4, 1.2, 'crate'], [-24, -5, 2, 4, 1.2, 'crate'],
  [5, 24, 4, 2, 1.2, 'crate'], [-5, -24, 4, 2, 1.2, 'crate'],
];

export const SPAWNS = [[26, 26], [-26, 26], [26, -26], [-26, -26], [0, 27], [0, -27], [27, 0], [-27, 0]]
  .map(([x, z]) => new THREE.Vector3(x, 0, z));

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const floorTex = () => canvasTex(256, (g) => {
  g.fillStyle = '#1b1f2e'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#20263a'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = '#2c3658'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.strokeStyle = '#40538a'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
});

const panelTex = () => canvasTex(256, (g) => {
  g.fillStyle = '#262b3b'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#2d3346'; g.fillRect(8, 8, 240, 110); g.fillRect(8, 138, 240, 110);
  g.fillStyle = '#1a1e2a'; g.fillRect(0, 124, 256, 8);
  g.fillStyle = '#4a5578';
  for (const [x, y] of [[20, 20], [228, 20], [20, 228], [228, 228], [20, 106], [228, 106], [20, 150], [228, 150]]) g.fillRect(x - 3, y - 3, 6, 6);
});

const crateTex = (base, edge) => canvasTex(128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = edge; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116);
  g.lineWidth = 8; g.beginPath(); g.moveTo(12, 12); g.lineTo(116, 116); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 60, 128, 8);
});

export function buildWorld(scene) {
  const colliders = [];
  const addBox = (x, y, z, w, h, d, mat, collide = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, y, z - d / 2), new THREE.Vector3(x + w / 2, y + h, z + d / 2)));
    return mesh;
  };

  // Lights
  scene.add(new THREE.HemisphereLight(0x9fb0ff, 0x2a2238, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -38; sc.right = sc.top = 38; sc.near = 1; sc.far = 100;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Floor
  const ft = floorTex();
  ft.repeat.set(ARENA, ARENA);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Outer walls with neon trim
  const wt = panelTex();
  wt.repeat.set(16, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.7, metalness: 0.3 });
  const L = ARENA * 2 + 2;
  addBox(0, 0, -ARENA - 0.5, L, WALL_H, 1, wallMat);
  addBox(0, 0, ARENA + 0.5, L, WALL_H, 1, wallMat);
  addBox(-ARENA - 0.5, 0, 0, 1, WALL_H, L, wallMat);
  addBox(ARENA + 0.5, 0, 0, 1, WALL_H, L, wallMat);
  const cyan = new THREE.MeshBasicMaterial({ color: 0x35e0ff });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff3fa4 });
  for (const [mat, y, th] of [[cyan, WALL_H - 0.5, 0.14], [pink, 0.25, 0.1]]) {
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(ARENA * 2, th, 0.04), mat);
      a.position.set(0, y, s * (ARENA - 0.02));
      scene.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, th, ARENA * 2), mat);
      b.position.set(s * (ARENA - 0.02), y, 0);
      scene.add(b);
    }
  }

  // Arena props
  const mats = {
    plat: new THREE.MeshStandardMaterial({ map: floorTex(), color: 0x8fa0d8, roughness: 0.6, metalness: 0.4 }),
    pillar: new THREE.MeshStandardMaterial({ map: panelTex(), color: 0xb0b8d8, roughness: 0.6, metalness: 0.4 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x4a5270, roughness: 0.8, metalness: 0.2 }),
    crateA: new THREE.MeshStandardMaterial({ map: crateTex('#c9772e', '#8a4a18'), roughness: 0.7 }),
    crateB: new THREE.MeshStandardMaterial({ map: crateTex('#2e8fa0', '#175a66'), roughness: 0.7 }),
  };
  const glow = [cyan, pink, new THREE.MeshBasicMaterial({ color: 0xffd23f })];
  LAYOUT.forEach(([x, z, w, d, h, kind], i) => {
    const mat = kind === 'crate' ? (i % 2 ? mats.crateA : mats.crateB) : mats[kind];
    addBox(x, 0, z, w, h, d, mat);
    if (kind === 'pillar') {
      for (const y of [2.2, 4.6]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.16, d + 0.08), glow[i % 3]);
        band.position.set(x, y, z);
        scene.add(band);
      }
    } else if (kind === 'plat' || kind === 'wall') {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.08, d + 0.04), kind === 'plat' ? glow[2] : cyan);
      edge.position.set(x, h - 0.09, z); // top stays hidden inside the box so only the sides glow
      scene.add(edge);
    }
  });

  // Glowing spawn pads where the bots teleport in
  const pads = SPAWNS.map((s) => {
    const pad = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 32), new THREE.MeshBasicMaterial({ color: 0xff3fa4, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.x, 0.02, s.z);
    scene.add(pad);
    return pad;
  });

  // City skyline beyond the walls
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x151a2c, roughness: 1 });
  const winMats = [0x35e0ff, 0xff3fa4, 0xffd23f].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + Math.random() * 0.1;
    const r = 60 + Math.random() * 30;
    const w = 6 + Math.random() * 8, h = 14 + Math.random() * 40;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), cityMat);
    b.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    scene.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.3, w + 0.1), winMats[i % 3]);
    s.position.set(b.position.x, h - 2 - Math.random() * 6, b.position.z);
    scene.add(s);
  }

  // Stars
  const starPos = [];
  for (let i = 0; i < 600; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.9 + 0.1;
    v.normalize().multiplyScalar(220);
    starPos.push(v.x, v.y, v.z);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false, fog: false })));

  return {
    colliders,
    update(t) {
      pads.forEach((p, i) => { p.material.opacity = 0.35 + 0.3 * Math.sin(t * 3 + i); });
    },
  };
}

// Axis-by-axis box collision. body = { pos (feet), r, h, grounded, vel? }
export function moveBody(b, dx, dy, dz, colliders, step = 0) {
  const p = b.pos, r = b.r, h = b.h;
  const overlaps = (c) => p.x + r > c.min.x && p.x - r < c.max.x && p.z + r > c.min.z && p.z - r < c.max.z &&
    p.y + h > c.min.y && p.y < c.max.y - 0.001;

  p.x += dx;
  for (const c of colliders) {
    if (!overlaps(c)) continue;
    if (step && b.grounded && c.max.y - p.y <= step) { p.y = c.max.y; continue; }
    const pushL = p.x + r - c.min.x, pushR = c.max.x - (p.x - r);
    if (dx > 0 || (dx === 0 && pushL < pushR)) p.x = c.min.x - r - 1e-4; else p.x = c.max.x + r + 1e-4;
  }
  p.z += dz;
  for (const c of colliders) {
    if (!overlaps(c)) continue;
    if (step && b.grounded && c.max.y - p.y <= step) { p.y = c.max.y; continue; }
    const pushL = p.z + r - c.min.z, pushR = c.max.z - (p.z - r);
    if (dz > 0 || (dz === 0 && pushL < pushR)) p.z = c.min.z - r - 1e-4; else p.z = c.max.z + r + 1e-4;
  }
  if (dy === 0) return;
  b.grounded = false;
  p.y += dy;
  for (const c of colliders) {
    if (!overlaps(c)) continue;
    if (dy < 0) { p.y = c.max.y; b.grounded = true; } else p.y = c.min.y - h - 1e-4;
    if (b.vel) b.vel.y = 0;
  }
  if (p.y <= 0) {
    p.y = 0;
    b.grounded = true;
    if (b.vel && b.vel.y < 0) b.vel.y = 0;
  }
}

const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();

// Distance along a ray to the first wall/crate/floor (capped at maxD)
export function rayWorld(o, d, colliders, maxD) {
  let best = maxD;
  if (d.y < -1e-6) {
    const t = -o.y / d.y;
    if (t >= 0 && t < best) best = t;
  }
  _ray.origin.copy(o);
  _ray.direction.copy(d);
  for (const c of colliders) {
    if (_ray.intersectBox(c, _hit)) {
      const t = _hit.distanceTo(o);
      if (t < best) best = t;
    }
  }
  return best;
}

const _dir = new THREE.Vector3();
export function segmentBlocked(a, b, colliders) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-4) return false;
  _dir.divideScalar(len);
  return rayWorld(a, _dir, colliders, len) < len - 0.05;
}

// Breadth-first distance field toward the player on a 1m grid, so bots can walk around cover.
export class NavGrid {
  constructor(colliders, margin = 0.7) {
    const n = (this.n = ARENA * 2);
    this.blocked = new Uint8Array(n * n);
    this.dist = new Int32Array(n * n);
    this.queue = new Int32Array(n * n);
    this.out = { x: 0, z: 0 };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = i - ARENA + 0.5, z = j - ARENA + 0.5;
        for (const c of colliders) {
          if (x > c.min.x - margin && x < c.max.x + margin && z > c.min.z - margin && z < c.max.z + margin) {
            this.blocked[i * n + j] = 1;
            break;
          }
        }
      }
    }
  }

  cell(v) { return Math.max(0, Math.min(this.n - 1, Math.floor(v + ARENA))); }

  update(x, z) {
    const { n, dist, queue: q, blocked } = this;
    dist.fill(-1);
    let head = 0, tail = 0;
    const ci = this.cell(x), cj = this.cell(z);
    // Seed from the nearest ring of open cells (the player may be standing on a crate)
    for (let r = 0; r <= 4 && tail === 0; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const k = i * n + j;
          if (blocked[k]) continue;
          dist[k] = 0;
          q[tail++] = k;
        }
      }
    }
    while (head < tail) {
      const k = q[head++];
      const i = (k / n) | 0, j = k % n, d = dist[k] + 1;
      if (i > 0 && dist[k - n] < 0 && !blocked[k - n]) { dist[k - n] = d; q[tail++] = k - n; }
      if (i < n - 1 && dist[k + n] < 0 && !blocked[k + n]) { dist[k + n] = d; q[tail++] = k + n; }
      if (j > 0 && dist[k - 1] < 0 && !blocked[k - 1]) { dist[k - 1] = d; q[tail++] = k - 1; }
      if (j < n - 1 && dist[k + 1] < 0 && !blocked[k + 1]) { dist[k + 1] = d; q[tail++] = k + 1; }
    }
  }

  // Center of the neighbouring cell that is closest to the player, or null
  next(x, z) {
    const { n, dist, blocked } = this;
    const i = this.cell(x), j = this.cell(z);
    const cur = dist[i * n + j];
    let best = Infinity, bi = -1, bj = -1;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const k = ni * n + nj;
        if (blocked[k] || dist[k] < 0) continue;
        const diag = di && dj;
        if (diag && (blocked[(i + di) * n + j] || blocked[i * n + j + dj])) continue;
        const score = dist[k] - (diag ? 0.5 : 0);
        if (score < best) { best = score; bi = ni; bj = nj; }
      }
    }
    if (bi < 0 || (cur >= 0 && best > cur)) return null;
    this.out.x = bi - ARENA + 0.5;
    this.out.z = bj - ARENA + 0.5;
    return this.out;
  }
}
