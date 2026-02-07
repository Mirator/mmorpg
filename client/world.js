import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const COLORS = {
  ground: 0x1b2620,
  tile: 0x2a3b30,
  tileBorder: 0x465a4d,
  base: 0x4da3ff,
  resource: 0x5ef2c2,
  resourceDim: 0x1b2a28,
  mob: 0xff4d4d,
  obstacle: 0x3a3f44,
};

function buildTileTexture() {
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1f2b24';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#2a3b30';
  ctx.fillRect(3, 3, size - 6, size - 6);

  ctx.strokeStyle = '#465a4d';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function buildGround(mapSize) {
  const tileSize = 4;
  const texture = buildTileTexture();
  texture.repeat.set(mapSize / tileSize, mapSize / tileSize);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSize, mapSize),
    new THREE.MeshStandardMaterial({
      map: texture,
      color: COLORS.ground,
      emissive: 0x121a16,
      emissiveIntensity: 0.35,
      roughness: 1,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

function buildBase(base) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(base.radius * 0.7, base.radius, 32),
    new THREE.MeshStandardMaterial({
      color: COLORS.base,
      emissive: COLORS.base,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.5,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(base.x, 0.05, base.z);
  return ring;
}

function buildObstacleMesh(obstacle) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(obstacle.r, obstacle.r, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: COLORS.obstacle, roughness: 1 })
  );
  mesh.position.set(obstacle.x, 1.2, obstacle.z);
  return mesh;
}

function buildResourceMesh() {
  const group = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.6, 6),
    new THREE.MeshStandardMaterial({
      color: COLORS.resource,
      emissive: COLORS.resource,
      emissiveIntensity: 0.2,
      roughness: 0.4,
    })
  );
  crystal.position.y = 0.8;
  group.add(crystal);
  group.userData.crystal = crystal;
  group.userData.pulseOffset = Math.random() * Math.PI * 2;
  return group;
}

function buildMobMesh() {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.mob,
      emissive: 0x4d0b0b,
      emissiveIntensity: 0.35,
      roughness: 0.6,
    })
  );
  mesh.position.y = 1.1;
  return mesh;
}

export function initWorld(scene, world) {
  const mapSize = world?.mapSize ?? 400;
  const base = world?.base ?? { x: 0, z: 0, radius: 8 };

  const group = new THREE.Group();
  const ground = buildGround(mapSize);
  const baseMesh = buildBase(base);
  const obstacleMeshes = (world?.obstacles ?? []).map(buildObstacleMesh);

  group.add(ground, baseMesh, ...obstacleMeshes);
  scene.add(group);

  return {
    mapSize,
    base,
    obstacles: world?.obstacles ?? [],
    group,
    ground,
    baseMesh,
    obstacleMeshes,
    resourceMeshes: new Map(),
    mobMeshes: new Map(),
    lastResources: [],
    lastMobs: [],
  };
}

export function updateResources(worldState, resources) {
  if (!worldState) return;
  worldState.lastResources = resources;
  const seen = new Set();

  for (const resource of resources) {
    seen.add(resource.id);
    let mesh = worldState.resourceMeshes.get(resource.id);
    if (!mesh) {
      mesh = buildResourceMesh();
      worldState.resourceMeshes.set(resource.id, mesh);
      worldState.group.add(mesh);
    }
    mesh.position.set(resource.x, 0, resource.z);
    mesh.userData.available = resource.available;
    const crystal = mesh.userData.crystal;
    if (crystal) {
      if (resource.available) {
        crystal.material.color.setHex(COLORS.resource);
        crystal.material.emissive.setHex(COLORS.resource);
        crystal.material.emissiveIntensity = 0.25;
      } else {
        crystal.material.color.setHex(COLORS.resourceDim);
        crystal.material.emissive.setHex(COLORS.resourceDim);
        crystal.material.emissiveIntensity = 0.05;
      }
    }
  }

  for (const [id, mesh] of worldState.resourceMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.resourceMeshes.delete(id);
    }
  }
}

export function updateMobs(worldState, mobs) {
  if (!worldState) return;
  worldState.lastMobs = mobs;
  const seen = new Set();

  for (const mob of mobs) {
    seen.add(mob.id);
    let mesh = worldState.mobMeshes.get(mob.id);
    if (!mesh) {
      mesh = buildMobMesh();
      worldState.mobMeshes.set(mob.id, mesh);
      worldState.group.add(mesh);
    }
    mesh.position.set(mob.x, 1.1, mob.z);
  }

  for (const [id, mesh] of worldState.mobMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.mobMeshes.delete(id);
    }
  }
}

export function animateWorld(worldState, now) {
  if (!worldState) return;
  for (const mesh of worldState.resourceMeshes.values()) {
    const available = mesh.userData.available;
    if (!available) {
      mesh.scale.set(0.85, 0.6, 0.85);
      continue;
    }
    const offset = mesh.userData.pulseOffset ?? 0;
    const pulse = 1 + 0.08 * Math.sin(now * 0.004 + offset);
    mesh.scale.set(pulse, pulse, pulse);
  }
}
