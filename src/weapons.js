import * as THREE from '../vendor/three.module.js';

export const WEAPONS = [
  { id: 'pistol',  name: 'Blaster Pistol', dmg: 26, rate: 0.22,  mag: 12, reserve: Infinity, maxReserve: Infinity, reload: 1.0, spread: 0.006, pellets: 1, recoil: 0.022, color: 0x35e0ff },
  { id: 'rifle',   name: 'Pulse Rifle',    dmg: 17, rate: 0.085, mag: 32, reserve: 128,      maxReserve: 320,      reload: 1.6, spread: 0.014, pellets: 1, recoil: 0.011, color: 0xffd23f },
  { id: 'shotgun', name: 'Scatter Gun',    dmg: 11, rate: 0.75,  mag: 6,  reserve: 24,       maxReserve: 60,       reload: 1.9, spread: 0.065, pellets: 9, recoil: 0.07,  color: 0xff5a3d },
];

const BOX = new THREE.BoxGeometry(1, 1, 1);
const metal = new THREE.MeshStandardMaterial({ color: 0x6a7388, roughness: 0.4, metalness: 0.25 });
const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f4d, roughness: 0.6, metalness: 0.15 });
const glove = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.9 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f5f9f, roughness: 0.9 });

function box(parent, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Builds each gun as it appears in first person. The muzzle sits at the gun's -z end.
export function buildViewmodel(def) {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.2 });
  let muzzleZ;
  if (def.id === 'pistol') {
    box(g, metal, 0.07, 0.08, 0.28, 0, 0, -0.06);
    box(g, dark, 0.06, 0.05, 0.08, 0, 0, -0.22);
    box(g, accent, 0.072, 0.015, 0.2, 0, 0.03, -0.06);
    box(g, dark, 0.06, 0.15, 0.08, 0, -0.1, 0.03).rotation.x = 0.25;
    muzzleZ = -0.27;
  } else if (def.id === 'rifle') {
    box(g, metal, 0.08, 0.1, 0.5, 0, 0, -0.1);
    box(g, dark, 0.05, 0.05, 0.22, 0, 0, -0.44);
    box(g, dark, 0.07, 0.09, 0.2, 0, -0.02, 0.24);
    box(g, dark, 0.05, 0.17, 0.08, 0, -0.12, -0.12).rotation.x = -0.2;
    box(g, dark, 0.05, 0.13, 0.06, 0, -0.1, 0.06).rotation.x = 0.25;
    box(g, metal, 0.05, 0.05, 0.14, 0, 0.08, -0.06);
    box(g, accent, 0.03, 0.03, 0.02, 0, 0.08, -0.13);
    box(g, accent, 0.082, 0.02, 0.36, 0, 0.02, -0.12);
    muzzleZ = -0.56;
  } else {
    box(g, metal, 0.1, 0.07, 0.6, 0, 0.02, -0.18);
    box(g, metal, 0.1, 0.06, 0.6, 0, -0.045, -0.18);
    box(g, dark, 0.12, 0.08, 0.2, 0, -0.05, -0.26);
    box(g, dark, 0.09, 0.11, 0.24, 0, -0.02, 0.2);
    box(g, dark, 0.06, 0.14, 0.07, 0, -0.1, 0.06).rotation.x = 0.25;
    box(g, accent, 0.102, 0.018, 0.5, 0, 0.058, -0.18);
    muzzleZ = -0.49;
  }
  // Gloved hand and sleeve holding the grip
  box(g, glove, 0.09, 0.1, 0.1, 0.01, -0.12, def.id === 'pistol' ? 0.04 : 0.07);
  box(g, sleeve, 0.11, 0.11, 0.22, 0.03, -0.16, 0.2).rotation.x = 0.35;
  if (def.id !== 'pistol') box(g, glove, 0.09, 0.08, 0.12, -0.02, -0.07, -0.28);

  const flash = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.07, 0),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flash.position.set(0, 0, muzzleZ - 0.04);
  flash.visible = false;
  g.add(flash);
  g.visible = false;
  return { group: g, flash, muzzleZ };
}
