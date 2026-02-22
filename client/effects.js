// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const MAX_COMBAT_TEXT_EFFECTS = 60;

function makeSlashMesh() {
  const geometry = new THREE.RingGeometry(0.2, 0.7, 16);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffe2a8,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function makeProjectileMesh() {
  const geometry = new THREE.SphereGeometry(0.18, 10, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0x9fe3ff,
    emissive: 0x4da3ff,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });
  return new THREE.Mesh(geometry, material);
}

function makeImpactMesh() {
  const geometry = new THREE.RingGeometry(0.15, 0.45, 12);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function setMaterialOpacity(/** @type {any} */ material, /** @type {any} */ opacity) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const mat of material) {
      if (!mat) continue;
      mat.transparent = true;
      mat.opacity = opacity;
    }
    return;
  }
  material.transparent = true;
  material.opacity = opacity;
}

function disposeTexture(/** @type {any} */ texture, /** @type {Set<any>} */ seenTextures) {
  if (!texture?.dispose) return;
  if (seenTextures.has(texture)) return;
  seenTextures.add(texture);
  texture.dispose();
}

function disposeMaterial(/** @type {any} */ material, /** @type {Set<any>} */ seenTextures = new Set()) {
  if (!material) return;
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!mat) continue;
    disposeTexture(mat.map, seenTextures);
    disposeTexture(mat.alphaMap, seenTextures);
    disposeTexture(mat.emissiveMap, seenTextures);
    disposeTexture(mat.normalMap, seenTextures);
    disposeTexture(mat.roughnessMap, seenTextures);
    disposeTexture(mat.metalnessMap, seenTextures);
    if (mat.dispose) mat.dispose();
  }
}

function disposeObject3DResources(/** @type {any} */ root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse((/** @type {any} */ node) => {
    // THREE.Sprite reuses a shared internal geometry; disposing it can destabilize all sprites.
    if (!node.isSprite && node.geometry?.dispose) {
      geometries.add(node.geometry);
    }
    if (!node.material) return;
    if (Array.isArray(node.material)) {
      for (const mat of node.material) {
        if (mat) materials.add(mat);
      }
      return;
    }
    materials.add(node.material);
  });
  const seenTextures = new Set();
  for (const material of materials) {
    disposeMaterial(material, seenTextures);
  }
  for (const geometry of geometries) {
    geometry.dispose();
  }
}

function createCombatTextSprite(/** @type {any} */ { text, fill, stroke, scale = 1 }) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fontSize = Math.max(34, Math.floor(52 * scale));
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(4, Math.floor(8 * scale));
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const w = 1.9 * scale;
  const h = 0.95 * scale;
  sprite.scale.set(w, h, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function createHitConfirmGroup(/** @type {any} */ { color, isCrit }) {
  const group = new THREE.Group();

  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: isCrit ? 0.9 : 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.55, 24), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const coreMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: isCrit ? 0.45 : 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), coreMaterial);
  core.rotation.x = -Math.PI / 2;
  core.position.y = 0.015;
  group.add(core);

  group.userData.ringMaterial = ringMaterial;
  group.userData.coreMaterial = coreMaterial;
  group.userData.isCrit = isCrit;
  return group;
}

export function createEffectsSystem(/** @type {any} */ scene) {
  const /** @type {any} */ effects = [];

  function addEffect(/** @type {any} */ effect) {
    effects.push(effect);
    scene.add(effect.mesh);
  }

  function removeEffectAt(/** @type {any} */ idx) {
    const effect = effects[idx];
    if (!effect) return;
    scene.remove(effect.mesh);
    disposeObject3DResources(effect.mesh);
    effects.splice(idx, 1);
  }

  function enforceCombatTextCap() {
    const count = effects.reduce(
      (/** @type {any} */ sum, /** @type {any} */ effect) => (effect.kind === 'combatText' ? sum + 1 : sum),
      0
    );
    if (count < MAX_COMBAT_TEXT_EFFECTS) return;
    let oldestIdx = -1;
    let oldestStart = Infinity;
    for (let i = 0; i < effects.length; i += 1) {
      const effect = effects[i];
      if (effect.kind !== 'combatText') continue;
      if ((effect.start ?? 0) < oldestStart) {
        oldestStart = effect.start;
        oldestIdx = i;
      }
    }
    if (oldestIdx >= 0) {
      removeEffectAt(oldestIdx);
    }
  }

  function spawnSlash(/** @type {any} */ { to, durationMs = 180, now = performance.now() }) {
    if (!to) return;
    const mesh = makeSlashMesh();
    mesh.position.set(to.x, (to.y ?? 0) + 0.2, to.z);
    addEffect({
      kind: 'slash',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnProjectile(/** @type {any} */ { from, to, durationMs = 200, now = performance.now(), spawnImpactOnEnd = true }) {
    if (!from || !to) return;
    const mesh = makeProjectileMesh();
    mesh.position.set(from.x, (from.y ?? 0) + 0.6, from.z);
    addEffect({
      kind: 'projectile',
      mesh,
      start: now,
      duration: durationMs,
      spawnImpactOnEnd,
      from: { x: from.x, y: from.y ?? 0, z: from.z },
      to: { x: to.x, y: to.y ?? 0, z: to.z },
    });
  }

  function spawnImpact(/** @type {any} */ { to, durationMs = 140, now = performance.now() }) {
    if (!to) return;
    const mesh = makeImpactMesh();
    mesh.position.set(to.x, (to.y ?? 0) + 0.15, to.z);
    addEffect({
      kind: 'impact',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnNova(/** @type {any} */ { center, radius = 2.5, color = 0x88ccff, durationMs = 400, now = performance.now() }) {
    if (!center) return;
    const geometry = new THREE.RingGeometry(radius * 0.3, radius, 32);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, (center.y ?? 0) + 0.05, center.z);
    addEffect({
      kind: 'nova',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnCone(/** @type {any} */ { from, direction, coneDegrees = 90, range = 5, color = 0xff6633, durationMs = 400, now = performance.now() }) {
    if (!from || !direction) return;
    const angle = (coneDegrees * Math.PI) / 180;
    const geometry = new THREE.ConeGeometry(range * Math.tan(angle / 2), range, 16, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const rotY = Math.atan2(-direction.x, -direction.z);
    mesh.rotation.set(-Math.PI / 2, rotY, 0);
    mesh.position.set(from.x, (from.y ?? 0) + 0.1, from.z);
    addEffect({
      kind: 'cone',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnBuffAura(/** @type {any} */ { center, color = 0xffdd66, durationMs = 600, now = performance.now() }) {
    if (!center) return;
    const geometry = new THREE.RingGeometry(0.4, 1.2, 24);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, (center.y ?? 0) + 0.02, center.z);
    addEffect({
      kind: 'buffAura',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnDashTrail(/** @type {any} */ { from, to, durationMs = 300, now = performance.now() }) {
    if (!from || !to) return;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const geometry = new THREE.PlaneGeometry(dist, 0.4);
    const material = new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -Math.atan2(dx, dz);
    mesh.position.set((from.x + to.x) / 2, (from.y ?? 0) + 0.1, (from.z + to.z) / 2);
    addEffect({
      kind: 'dashTrail',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnHealRing(/** @type {any} */ { center, radius = 5, color = 0xffdd66, durationMs = 500, now = performance.now() }) {
    if (!center) return;
    const geometry = new THREE.RingGeometry(radius * 0.5, radius, 32);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, (center.y ?? 0) + 0.05, center.z);
    addEffect({
      kind: 'healRing',
      mesh,
      start: now,
      duration: durationMs,
    });
  }

  function spawnCombatText(/** @type {any} */ { pos, payload, now = performance.now() }) {
    const amount = Number(payload?.amount);
    if (!pos || !Number.isFinite(amount) || amount <= 0) return;
    const kind = payload?.kind === 'heal' ? 'heal' : 'damage';
    const isCrit = !!payload?.isCrit && kind === 'damage';
    const text = `${kind === 'heal' ? '+' : '-'}${Math.floor(amount)}`;
    const style = kind === 'heal'
      ? { fill: '#9af8b9', stroke: '#0f4d2f', scale: 0.95 }
      : isCrit
        ? { fill: '#ffd66a', stroke: '#7a3f00', scale: 1.2 }
        : { fill: '#ff9b7a', stroke: '#5f1b16', scale: 1.0 };
    const sprite = createCombatTextSprite({
      text,
      fill: style.fill,
      stroke: style.stroke,
      scale: style.scale,
    });
    if (!sprite) return;

    enforceCombatTextCap();
    const y = (pos.y ?? 0) + (kind === 'heal' ? 1.6 : 1.35);
    sprite.position.set(pos.x, y, pos.z);
    addEffect({
      kind: 'combatText',
      mesh: sprite,
      start: now,
      duration: isCrit ? 1100 : 900,
      baseY: y,
      baseX: pos.x,
      baseZ: pos.z,
      rise: isCrit ? 1.2 : 0.95,
      driftX: (Math.random() - 0.5) * 0.28,
      driftZ: (Math.random() - 0.5) * 0.2,
      baseScaleX: sprite.scale.x,
      baseScaleY: sprite.scale.y,
    });
  }

  function spawnHitConfirm(/** @type {any} */ { pos, payload, now = performance.now() }) {
    if (!pos) return;
    const isCrit = !!payload?.isCrit;
    const kind = payload?.kind === 'heal' ? 'heal' : 'damage';
    const color = kind === 'heal' ? 0x66e0a0 : (isCrit ? 0xffd166 : 0xff7b57);
    const group = createHitConfirmGroup({ color, isCrit });
    group.position.set(pos.x, (pos.y ?? 0) + 0.2, pos.z);
    addEffect({
      kind: 'hitConfirm',
      mesh: group,
      start: now,
      duration: isCrit ? 280 : 200,
      isCrit,
    });
  }

  function update(/** @type {any} */ now) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const effect = effects[i];
      const elapsed = now - effect.start;
      const t = effect.duration > 0 ? elapsed / effect.duration : 1;

      if (effect.kind === 'projectile') {
        const progress = Math.min(1, Math.max(0, t));
        const x = effect.from.x + (effect.to.x - effect.from.x) * progress;
        const y = (effect.from.y ?? 0) + ((effect.to.y ?? 0) - (effect.from.y ?? 0)) * progress;
        const z = effect.from.z + (effect.to.z - effect.from.z) * progress;
        effect.mesh.position.set(x, y + 0.6, z);
        setMaterialOpacity(effect.mesh.material, 1 - progress * 0.35);
      } else if (effect.kind === 'combatText') {
        const p = Math.min(1, Math.max(0, t));
        const eased = 1 - Math.pow(1 - p, 3);
        effect.mesh.position.set(
          effect.baseX + effect.driftX * eased,
          effect.baseY + effect.rise * eased,
          effect.baseZ + effect.driftZ * eased
        );
        setMaterialOpacity(effect.mesh.material, 1 - p);
        const pop = 1 + 0.18 * p;
        effect.mesh.scale.set(effect.baseScaleX * pop, effect.baseScaleY * pop, 1);
      } else if (effect.kind === 'hitConfirm') {
        const p = Math.min(1, Math.max(0, t));
        const growth = (effect.isCrit ? 1.9 : 1.45) * p;
        effect.mesh.scale.set(0.85 + growth, 0.85 + growth, 0.85 + growth);
        const ringMat = effect.mesh.userData.ringMaterial;
        const coreMat = effect.mesh.userData.coreMaterial;
        if (ringMat) ringMat.opacity = (effect.isCrit ? 0.9 : 0.75) * (1 - p);
        if (coreMat) coreMat.opacity = (effect.isCrit ? 0.45 : 0.28) * Math.max(0, 1 - p * 1.5);
      } else if (effect.mesh.material) {
        setMaterialOpacity(effect.mesh.material, Math.max(0, 1 - t));
      }

      if (t >= 1) {
        if (effect.kind === 'projectile' && effect.spawnImpactOnEnd) {
          spawnImpact({ to: { x: effect.to.x, y: effect.to.y ?? 0, z: effect.to.z }, now });
        }
        removeEffectAt(i);
      }
    }
  }

  return {
    spawnSlash,
    spawnProjectile,
    spawnImpact,
    spawnNova,
    spawnCone,
    spawnBuffAura,
    spawnDashTrail,
    spawnHealRing,
    spawnCombatText,
    spawnHitConfirm,
    update,
  };
}
