import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';
import { ASSET_PATHS, getPreloadAssetList } from './assetPaths.js';

export { ASSET_PATHS };

const gltfCache = new Map();
const loader = new GLTFLoader();

export function loadGltf(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      })
    );
  }
  return gltfCache.get(url);
}

export function cloneSkinned(model) {
  return cloneSkeleton(model);
}

export function normalizeToHeight(object, targetHeight) {
  if (!object) return object;
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!Number.isFinite(size.y) || size.y <= 0) return object;
  const scale = targetHeight / size.y;
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);
  const nextBox = new THREE.Box3().setFromObject(object);
  object.position.y -= nextBox.min.y;
  object.updateMatrixWorld(true);
  return object;
}

function findSkinnedMeshes(root) {
  const meshes = [];
  root.traverse((node) => {
    if (node?.isSkinnedMesh) meshes.push(node);
  });
  return meshes;
}

function findSkeleton(root) {
  let skeleton = null;
  root.traverse((node) => {
    if (!skeleton && node?.isSkinnedMesh && node.skeleton) {
      skeleton = node.skeleton;
    }
  });
  return skeleton;
}

function attachSimpleHead(root) {
  const skeleton = findSkeleton(root);
  const head = skeleton?.getBoneByName?.('Head') ?? skeleton?.getBoneByName?.('head') ?? null;
  if (!head || head.getObjectByName?.('SimpleHead')) return;

  let headSize = 0.18;
  if (root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (Number.isFinite(size.y) && size.y > 0) {
      headSize = Math.min(0.24, Math.max(0.12, size.y * 0.11));
    }
  }

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(headSize, 10, 10),
    new THREE.MeshStandardMaterial({
      color: 0xf1d3b3,
      roughness: 0.8,
    })
  );
  headMesh.name = 'SimpleHead';
  headMesh.position.set(0, headSize * 0.8, headSize * 0.15);
  head.add(headMesh);
}

export async function assemblePlayerModel() {
  if (ASSET_PATHS.playerModel) {
    const modelGltf = await loadGltf(ASSET_PATHS.playerModel);
    const model = cloneSkinned(modelGltf.scene);
    attachSimpleHead(model);
    return model;
  }

  const [baseGltf, outfitGltf] = await Promise.all([
    loadGltf(ASSET_PATHS.playerBase),
    loadGltf(ASSET_PATHS.playerOutfit),
  ]);

  const base = cloneSkinned(baseGltf.scene);
  const outfit = cloneSkinned(outfitGltf.scene);

  const baseSkeleton = findSkeleton(base);
  if (!baseSkeleton) {
    console.warn('[assets] Missing base skeleton, falling back to base model only.');
    return base;
  }

  const baseBoneNames = new Set(baseSkeleton.bones.map((bone) => bone.name));
  let canBind = true;
  const outfitMeshes = findSkinnedMeshes(outfit);
  if (!outfitMeshes.length) {
    canBind = false;
  } else {
    for (const mesh of outfitMeshes) {
      const boneNames = (mesh.skeleton?.bones ?? []).map((bone) => bone.name);
      const allMatch = boneNames.every((name) => baseBoneNames.has(name));
      if (!allMatch) {
        canBind = false;
        break;
      }
    }
  }

  if (!canBind) {
    console.warn('[assets] Outfit rig mismatch; using base model only.');
    return base;
  }

  for (const mesh of outfitMeshes) {
    mesh.bind(baseSkeleton, mesh.bindMatrix);
  }
  outfit.scale.multiplyScalar(1.02);

  const group = new THREE.Group();
  group.add(base, outfit);
  return group;
}

export async function loadPlayerAnimations() {
  if (ASSET_PATHS.playerModel) {
    const modelGltf = await loadGltf(ASSET_PATHS.playerModel);
    const modelClips = modelGltf.animations ?? [];
    if (modelClips.length) return modelClips;
  }
  const gltf = await loadGltf(ASSET_PATHS.playerAnimations);
  return gltf.animations ?? [];
}

function findClipByKeywords(clips, keywords) {
  const lower = keywords.map((keyword) => keyword.toLowerCase());
  return (
    clips.find((clip) => {
      const name = clip?.name?.toLowerCase?.() ?? '';
      return lower.some((keyword) => name.includes(keyword));
    }) ?? null
  );
}

export function pickClips(clips, overrides = {}) {
  const clipList = Array.isArray(clips) ? clips : [];
  const idleNames = overrides.idleNames ?? null;
  const walkNames = overrides.walkNames ?? null;
  const attackNames = overrides.attackNames ?? null;
  const deathNames = overrides.deathNames ?? null;
  const idleKeywords = overrides.idleKeywords ?? ['idle'];
  const walkKeywords = overrides.walkKeywords ?? ['walk', 'run'];
  const attackKeywords = overrides.attackKeywords ?? ['attack', 'slash', 'swing', 'punch', 'bite'];
  const deathKeywords = overrides.deathKeywords ?? ['death'];

  const findByName = (names) => {
    if (!Array.isArray(names) || !names.length) return null;
    for (const name of names) {
      const match = clipList.find((clip) => clip?.name === name);
      if (match) return match;
    }
    return null;
  };

  const idle =
    findByName(idleNames) ?? findClipByKeywords(clipList, idleKeywords) ?? clipList[0] ?? null;
  const walk =
    findByName(walkNames) ?? findClipByKeywords(clipList, walkKeywords) ?? clipList[1] ?? idle ?? null;
  const attack =
    findByName(attackNames) ??
    findClipByKeywords(clipList, attackKeywords) ??
    clipList[2] ??
    null;
  const death =
    findByName(deathNames) ??
    findClipByKeywords(clipList, deathKeywords) ??
    null;

  return {
    idle,
    walk,
    attack,
    death,
    all: clipList,
  };
}

/**
 * Preloads all game assets before entering the game.
 * Warms the loadGltf cache and player model/animations.
 */
export async function preloadAllAssets() {
  const list = getPreloadAssetList();

  await Promise.all([
    assemblePlayerModel(),
    loadPlayerAnimations(),
    ...list.mobs.map((url) => loadGltf(url)),
    ...list.environment.map((url) => loadGltf(url)),
  ]);
}
