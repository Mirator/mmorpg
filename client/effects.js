import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

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

export function createEffectsSystem(scene) {
  const effects = [];

  function addEffect(effect) {
    effects.push(effect);
    scene.add(effect.mesh);
  }

  function spawnSlash({ to, durationMs = 180, now = performance.now() }) {
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

  function spawnProjectile({ from, to, durationMs = 200, now = performance.now() }) {
    if (!from || !to) return;
    const mesh = makeProjectileMesh();
    mesh.position.set(from.x, (from.y ?? 0) + 0.6, from.z);
    addEffect({
      kind: 'projectile',
      mesh,
      start: now,
      duration: durationMs,
      from: { x: from.x, y: from.y ?? 0, z: from.z },
      to: { x: to.x, y: to.y ?? 0, z: to.z },
    });
  }

  function spawnImpact({ to, durationMs = 140, now = performance.now() }) {
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

  function spawnNova({ center, radius = 2.5, color = 0x88ccff, durationMs = 400, now = performance.now() }) {
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

  function spawnCone({ from, direction, coneDegrees = 90, range = 5, color = 0xff6633, durationMs = 400, now = performance.now() }) {
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

  function spawnBuffAura({ center, color = 0xffdd66, durationMs = 600, now = performance.now() }) {
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

  function spawnDashTrail({ from, to, durationMs = 300, now = performance.now() }) {
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

  function spawnHealRing({ center, radius = 5, color = 0xffdd66, durationMs = 500, now = performance.now() }) {
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

  function update(now) {
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
        effect.mesh.material.opacity = 1 - progress * 0.4;
        effect.mesh.material.transparent = true;
      } else if (effect.mesh.material) {
        effect.mesh.material.opacity = Math.max(0, 1 - t);
      }

      if (t >= 1) {
        if (effect.kind === 'projectile') {
          spawnImpact({ to: { x: effect.to.x, y: effect.to.y ?? 0, z: effect.to.z }, now });
        }
        scene.remove(effect.mesh);
        effects.splice(i, 1);
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
    update,
  };
}
