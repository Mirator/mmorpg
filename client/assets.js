// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';
import {
  ASSET_PATHS,
  EQUIPMENT_MODEL_PATHS,
  OUTFIT_STYLE_MODEL_PATHS,
  getPreloadAssetList,
} from './assetPaths.js';
import {
  buildEquipmentVisualSignature,
  normalizeEquipmentVisualState,
} from './playerVisual.js';

export { ASSET_PATHS };

const gltfCache = new Map();
const texturePromises = new Map();
const resolvedTextures = new Map();
const playerPrototypeCache = new Map();
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

export function loadGltf(/** @type {any} */ url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(
      url,
      new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
        loader.load(url, resolve, undefined, reject);
      })
    );
  }
  return gltfCache.get(url);
}

export function loadTexture(/** @type {any} */ url) {
  if (!texturePromises.has(url)) {
    texturePromises.set(
      url,
      new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
        textureLoader.load(
          url,
          (/** @type {any} */ tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            resolvedTextures.set(url, tex);
            resolve(tex);
          },
          undefined,
          reject
        );
      })
    );
  }
  return texturePromises.get(url);
}

export function getTexture(/** @type {any} */ url) {
  return resolvedTextures.get(url) ?? null;
}

export function cloneSkinned(/** @type {any} */ model) {
  return cloneSkeleton(model);
}

export function normalizeToHeight(/** @type {any} */ object, /** @type {any} */ targetHeight) {
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

function findSkinnedMeshes(/** @type {any} */ root) {
  /** @type {any[]} */
  const meshes = [];
  root.traverse((/** @type {any} */ node) => {
    if (node?.isSkinnedMesh) meshes.push(node);
  });
  return meshes;
}

function findSkeleton(/** @type {any} */ root) {
  /** @type {any | null} */
  let skeleton = null;
  root.traverse((/** @type {any} */ node) => {
    if (!skeleton && node?.isSkinnedMesh && node.skeleton) {
      skeleton = node.skeleton;
    }
  });
  return skeleton;
}

function findBoneByNames(/** @type {any} */ skeleton, /** @type {string[]} */ names) {
  if (!skeleton?.getBoneByName) return null;
  for (const name of names) {
    const bone = skeleton.getBoneByName(name);
    if (bone) return bone;
  }
  return null;
}

const HEAD_MESH_NAMES = [
  'EquippedRealHeadSkin',
  'EquippedRealHeadDetailA',
  'EquippedRealHeadDetailB',
  'EquippedHeadHood',
  'PlayerHeadVisual',
  'EquippedHead',
  'ProceduralHead',
  'StylizedHead',
  'SimpleHead',
];
const HEAD_SLICE_RATIO = 0.86;
/** @type {Promise<{ baseHeadSkin: any, baseHeadDetailA: any, baseHeadDetailB: any, clothHood: any }> | null} */
let headTemplatePromise = null;

function cloneMaterialSet(/** @type {any} */ material) {
  if (Array.isArray(material)) return material.map((/** @type {any} */ mat) => mat?.clone?.() ?? mat);
  return material?.clone?.() ?? material;
}

function removeHeadAttachments(/** @type {any} */ root) {
  /** @type {any[]} */
  const toRemove = [];
  root.traverse((/** @type {any} */ node) => {
    if (HEAD_MESH_NAMES.includes(String(node?.name ?? ''))) {
      toRemove.push(node);
    }
  });
  for (const node of toRemove) {
    node.parent?.remove(node);
  }
}

function findSkinnedMeshByName(/** @type {any} */ root, /** @type {string} */ fragment) {
  const lower = String(fragment).toLowerCase();
  /** @type {any | null} */
  let match = null;
  root.traverse((/** @type {any} */ node) => {
    if (match || !node?.isSkinnedMesh) return;
    const name = String(node?.name ?? '').toLowerCase();
    if (name.includes(lower)) {
      match = node;
    }
  });
  return match;
}

function findPrimarySkinnedMesh(/** @type {any} */ root) {
  const meshes = findSkinnedMeshes(root);
  return meshes.length ? meshes[0] : null;
}

function pickLargestSkinnedMesh(/** @type {any[]} */ meshes) {
  if (!Array.isArray(meshes) || !meshes.length) return null;
  let best = null;
  let bestCount = -1;
  for (const mesh of meshes) {
    const count = Number(mesh?.geometry?.getAttribute?.('position')?.count ?? 0);
    if (count > bestCount) {
      best = mesh;
      bestCount = count;
    }
  }
  return best;
}

function isLikelyHeadMesh(/** @type {any} */ mesh) {
  const geometry = mesh?.geometry;
  if (!geometry?.isBufferGeometry) return false;
  geometry.computeBoundingBox?.();
  const box = geometry.boundingBox;
  if (!box) return false;
  const size = new THREE.Vector3();
  box.getSize(size);
  return (
    Number.isFinite(size.x) &&
    Number.isFinite(size.y) &&
    Number.isFinite(size.z) &&
    size.x > 0.05 &&
    size.y > 0.12 &&
    size.z > 0.05 &&
    size.x <= 0.7 &&
    size.y <= 0.9 &&
    size.z <= 0.7
  );
}

function sliceGeometryTopByHeight(/** @type {any} */ geometry, /** @type {number} */ minRatio) {
  const source = geometry?.isBufferGeometry ? geometry : null;
  if (!source) return null;
  const position = source.getAttribute('position');
  if (!position) return null;

  const minY = new THREE.Vector3().fromBufferAttribute(position, 0).y;
  let maxY = minY;
  let floorY = minY;
  for (let i = 1; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y > maxY) maxY = y;
    if (y < floorY) floorY = y;
  }
  const height = maxY - floorY;
  if (!Number.isFinite(height) || height <= 0.0001) return source.clone();
  const yCutoff = floorY + height * minRatio;

  const sourceIndex = source.index?.array ?? null;
  const /** @type {number[]} */ triIndices = sourceIndex
    ? Array.from(sourceIndex)
    : Array.from({ length: position.count }, (/** @type {any} */ _, i) => i);
  const attributes = Object.entries(source.attributes);
  /** @type {Map<number, number>} */
  const remap = new Map();
  /** @type {Record<string, any[]>} */
  const packed = {};
  for (const [name] of attributes) packed[name] = [];
  /** @type {number[]} */
  const nextIndices = [];

  const includeVertex = (/** @type {number} */ index) => position.getY(index) >= yCutoff;
  const getRemappedIndex = (/** @type {number} */ oldIndex) => {
    const existing = remap.get(oldIndex);
    if (existing !== undefined) return existing;
    const next = remap.size;
    remap.set(oldIndex, next);
    for (const [name, attr] of attributes) {
      const start = oldIndex * attr.itemSize;
      for (let k = 0; k < attr.itemSize; k += 1) {
        packed[name].push(attr.array[start + k]);
      }
    }
    return next;
  };

  for (let i = 0; i + 2 < triIndices.length; i += 3) {
    const i0 = triIndices[i];
    const i1 = triIndices[i + 1];
    const i2 = triIndices[i + 2];
    if (typeof i0 !== 'number' || typeof i1 !== 'number' || typeof i2 !== 'number') continue;
    if (!(includeVertex(i0) && includeVertex(i1) && includeVertex(i2))) continue;
    const r0 = getRemappedIndex(i0);
    const r1 = getRemappedIndex(i1);
    const r2 = getRemappedIndex(i2);
    nextIndices.push(r0, r1, r2);
  }

  if (!nextIndices.length) return source.clone();

  const nextGeometry = new THREE.BufferGeometry();
  for (const [name, attr] of attributes) {
    const ArrayType = attr.array.constructor;
    const typed = new ArrayType(packed[name]);
    nextGeometry.setAttribute(
      name,
      new THREE.BufferAttribute(typed, attr.itemSize, attr.normalized)
    );
  }
  const IndexType = remap.size > 65535 ? Uint32Array : Uint16Array;
  nextGeometry.setIndex(new THREE.BufferAttribute(new IndexType(nextIndices), 1));
  nextGeometry.computeBoundingBox();
  nextGeometry.computeBoundingSphere();
  return nextGeometry;
}

function buildSkinnedTemplate(
  /** @type {any} */ mesh,
  /** @type {string} */ name,
  /** @type {{sliceTopRatio?: number | null, skipSizeGate?: boolean}} */ options = {}
) {
  if (!mesh?.isSkinnedMesh || !mesh.skeleton) return null;
  const { sliceTopRatio = null, skipSizeGate = false } = options;
  if (!skipSizeGate && !isLikelyHeadMesh(mesh)) return null;
  const geometry = sliceTopRatio == null
    ? mesh.geometry.clone()
    : sliceGeometryTopByHeight(mesh.geometry, sliceTopRatio);
  if (!geometry) return null;
  return {
    name,
    geometry,
    material: cloneMaterialSet(mesh.material),
    boneNames: mesh.skeleton.bones.map((/** @type {any} */ bone) => bone.name),
    boneInverses: mesh.skeleton.boneInverses.map((/** @type {any} */ inv) => inv.clone()),
  };
}

function instantiateSkinnedTemplate(
  /** @type {any} */ template,
  /** @type {any} */ skeleton,
  /** @type {{ bindMatrix?: any, boneInverses?: any[] }} */ options = {}
) {
  if (!template || !skeleton?.getBoneByName) return null;
  const bones = [];
  for (const boneName of template.boneNames) {
    const bone = skeleton.getBoneByName(boneName);
    if (!bone) return null;
    bones.push(bone);
  }
  const providedInverses = Array.isArray(options.boneInverses) ? options.boneInverses : null;
  const inverseSource = providedInverses && providedInverses.length === bones.length
    ? providedInverses
    : template.boneInverses;
  const nextSkeleton = new THREE.Skeleton(
    bones,
    inverseSource.map((/** @type {any} */ inv) => inv?.clone?.() ?? inv)
  );
  const mesh = new THREE.SkinnedMesh(
    template.geometry.clone(),
    cloneMaterialSet(template.material)
  );
  mesh.name = template.name;
  const bindMatrix = options.bindMatrix?.clone?.() ?? new THREE.Matrix4();
  mesh.bind(nextSkeleton, bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
}

async function loadHeadTemplates() {
  if (!headTemplatePromise) {
    headTemplatePromise = (async () => {
      const base = await loadGltf(ASSET_PATHS.playerHeadSource).catch(() => null);
      const hood = (
        ASSET_PATHS.playerHeadHoodSource &&
        ASSET_PATHS.playerHeadHoodSource !== ASSET_PATHS.playerHeadSource
      )
        ? await loadGltf(ASSET_PATHS.playerHeadHoodSource).catch(() => null)
        : base;

      const baseMeshes = base?.scene ? findSkinnedMeshes(base.scene) : [];
      const largestBaseMesh = pickLargestSkinnedMesh(baseMeshes);
      const faceDetailMesh = baseMeshes.find((/** @type {any} */ mesh) => {
        const name = String(mesh?.name ?? '').toLowerCase();
        return name === 'face';
      }) ?? null;
      const eyesDetailMesh = baseMeshes.find((/** @type {any} */ mesh) => {
        const name = String(mesh?.name ?? '').toLowerCase();
        return name === 'face.001' || name.includes('eyes');
      }) ?? null;

      const hoodMesh =
        (hood?.scene ? findSkinnedMeshByName(hood.scene, 'head_hood') : null) ??
        (hood?.scene ? findSkinnedMeshByName(hood.scene, 'head') : null) ??
        (hood?.scene ? pickLargestSkinnedMesh(findSkinnedMeshes(hood.scene)) : null) ??
        null;

      const fallbackBaseMesh = (
        base?.scene
          ? findSkinnedMeshByName(base.scene, 'head') ?? findSkinnedMeshByName(base.scene, 'head_hood')
          : null
      ) ??
        largestBaseMesh ??
        hoodMesh ??
        null;

      return {
        baseHeadSkin:
          buildSkinnedTemplate(fallbackBaseMesh, 'EquippedRealHeadSkin', {
            sliceTopRatio: HEAD_SLICE_RATIO,
            skipSizeGate: true,
          }) ??
          null,
        baseHeadDetailA:
          buildSkinnedTemplate(faceDetailMesh, 'EquippedRealHeadDetailA') ??
          null,
        baseHeadDetailB:
          buildSkinnedTemplate(eyesDetailMesh, 'EquippedRealHeadDetailB') ??
          null,
        clothHood: buildSkinnedTemplate(hoodMesh, 'EquippedHeadHood'),
      };
    })().catch((err) => {
      console.warn('[assets] Failed to prepare real head templates:', err);
      return {
        baseHeadSkin: null,
        baseHeadDetailA: null,
        baseHeadDetailB: null,
        clothHood: null,
      };
    });
  }
  return headTemplatePromise;
}

async function attachRealHeadMeshes(/** @type {any} */ root, /** @type {any} */ visual = null) {
  const skeleton = findSkeleton(root);
  if (!skeleton) return;
  removeHeadAttachments(root);
  const templates = await loadHeadTemplates();

  const referenceMesh = findPrimarySkinnedMesh(root);
  const bindMatrix = referenceMesh?.bindMatrix ?? null;
  const boneInverses = referenceMesh?.skeleton?.boneInverses ?? skeleton?.boneInverses ?? null;
  const bindOptions = { bindMatrix, boneInverses };

  const headSkin = instantiateSkinnedTemplate(templates.baseHeadSkin, skeleton, bindOptions);
  if (headSkin) root.add(headSkin);

  const headDetailA = instantiateSkinnedTemplate(templates.baseHeadDetailA, skeleton, bindOptions);
  if (headDetailA) root.add(headDetailA);

  const headDetailB = instantiateSkinnedTemplate(templates.baseHeadDetailB, skeleton, bindOptions);
  if (headDetailB) root.add(headDetailB);

  if (visual?.headKind === 'armor_head_cloth') {
    const hood = instantiateSkinnedTemplate(templates.clothHood, skeleton, bindOptions);
    if (hood) root.add(hood);
  }
}

export async function assembleVendorModel() {
  if (!ASSET_PATHS.vendorModel) return null;
  const modelGltf = await loadGltf(ASSET_PATHS.vendorModel);
  const model = cloneSkinned(modelGltf.scene);
  await attachRealHeadMeshes(model, null);
  return model;
}

function createWeaponPlaceholder(/** @type {any} */ kind) {
  const lower = String(kind ?? '').toLowerCase();
  const group = new THREE.Group();

  if (lower.includes('bow')) {
    const bowArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.02, 8, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x7d5d3b, roughness: 0.8 })
    );
    bowArc.rotation.z = Math.PI / 2;
    group.add(bowArc);
    return group;
  }

  const isStaff = lower.includes('staff');
  const isWand = lower.includes('wand');
  const shaftLength = isStaff ? 0.95 : isWand ? 0.48 : 0.78;
  const shaftRadius = isWand ? 0.015 : 0.02;

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8),
    new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.86 })
  );
  shaft.position.y = shaftLength * 0.5;
  group.add(shaft);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(isWand ? 0.035 : 0.05, 10, 10),
    new THREE.MeshStandardMaterial({
      color: isWand || isStaff ? 0x8cc4ff : 0xb5b5b5,
      emissive: isWand || isStaff ? 0x27466e : 0x111111,
      emissiveIntensity: isWand || isStaff ? 0.6 : 0.2,
      roughness: 0.35,
    })
  );
  tip.position.y = shaftLength + (isWand ? 0.02 : 0.03);
  group.add(tip);

  return group;
}

function createOffhandPlaceholder(/** @type {any} */ kind) {
  const lower = String(kind ?? '').toLowerCase();
  const group = new THREE.Group();

  if (lower.includes('focus')) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x9fd4ff,
        emissive: 0x2a4f76,
        emissiveIntensity: 0.8,
        roughness: 0.45,
      })
    );
    group.add(orb);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.014, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x8c7a52, roughness: 0.75 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return group;
  }

  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.03, 12),
    new THREE.MeshStandardMaterial({ color: 0x8d8170, roughness: 0.8 })
  );
  group.add(disk);
  return group;
}

function positionHeldModel(/** @type {any} */ model, /** @type {any} */ kind, /** @type {'weapon' | 'offhand'} */ slot) {
  const lower = String(kind ?? '').toLowerCase();
  const isBow = lower.includes('bow');
  const isWand = lower.includes('wand');
  const isStaff = lower.includes('staff');

  if (slot === 'weapon') {
    model.position.set(0.03, 0.08, 0.02);
    if (isBow) {
      model.scale.setScalar(0.43);
      model.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    } else if (isStaff) {
      model.scale.setScalar(0.32);
      model.rotation.set(0, 0, Math.PI / 2);
    } else if (isWand) {
      model.scale.setScalar(0.35);
      model.rotation.set(0, 0, Math.PI / 2);
    } else {
      model.scale.setScalar(0.45);
      model.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    }
    return;
  }

  model.position.set(-0.04, 0.08, 0.02);
  model.scale.setScalar(0.38);
  model.rotation.set(0, 0, -Math.PI / 2);
}

function cloneStatic(/** @type {any} */ scene) {
  return scene.clone(true);
}

async function createHandAttachmentModel(/** @type {any} */ kind, /** @type {'weapon' | 'offhand'} */ slot) {
  if (!kind) return null;
  let path = null;
  if (
    typeof kind === 'string' &&
    Object.prototype.hasOwnProperty.call(EQUIPMENT_MODEL_PATHS, kind)
  ) {
    path = EQUIPMENT_MODEL_PATHS[/** @type {keyof typeof EQUIPMENT_MODEL_PATHS} */ (kind)];
  }
  if (path) {
    try {
      const gltf = await loadGltf(path);
      const model = gltf?.scene ? cloneStatic(gltf.scene) : null;
      if (model) {
        positionHeldModel(model, kind, slot);
        model.name = slot === 'weapon' ? 'EquippedWeapon' : 'EquippedOffhand';
        return model;
      }
    } catch (err) {
      console.warn('[assets] Failed to load equipped item model:', kind, err);
    }
  }

  const fallback = slot === 'weapon'
    ? createWeaponPlaceholder(kind)
    : createOffhandPlaceholder(kind);
  positionHeldModel(fallback, kind, slot);
  fallback.name = slot === 'weapon' ? 'EquippedWeapon' : 'EquippedOffhand';
  return fallback;
}

async function attachHandItem(
  /** @type {any} */ skeleton,
  /** @type {string[]} */ boneNames,
  /** @type {any} */ kind,
  /** @type {'weapon' | 'offhand'} */ slot
) {
  const bone = findBoneByNames(skeleton, boneNames);
  if (!bone) return;
  const existingName = slot === 'weapon' ? 'EquippedWeapon' : 'EquippedOffhand';
  const existing = bone.getObjectByName?.(existingName);
  if (existing) bone.remove(existing);
  if (!kind) return;
  const attachment = await createHandAttachmentModel(kind, slot);
  if (!attachment) return;
  bone.add(attachment);
}

async function attachEquipmentModels(/** @type {any} */ root, /** @type {any} */ visual) {
  const skeleton = findSkeleton(root);
  if (!skeleton) return;
  await Promise.all([
    attachHandItem(skeleton, ['hand_r', 'Hand_R', 'hand.R'], visual.weaponKind, 'weapon'),
    attachHandItem(skeleton, ['hand_l', 'Hand_L', 'hand.L'], visual.offhandKind, 'offhand'),
  ]);
}

async function loadPlayerOutfitForStyle(/** @type {string} */ outfitStyle) {
  const preferredPath = (
    typeof outfitStyle === 'string' &&
    Object.prototype.hasOwnProperty.call(OUTFIT_STYLE_MODEL_PATHS, outfitStyle)
  )
    ? OUTFIT_STYLE_MODEL_PATHS[/** @type {keyof typeof OUTFIT_STYLE_MODEL_PATHS} */ (outfitStyle)]
    : ASSET_PATHS.playerModel;
  const fallbacks = [
    preferredPath,
    ASSET_PATHS.playerModel,
    ASSET_PATHS.playerOutfit,
  ].filter((path, index, list) => typeof path === 'string' && list.indexOf(path) === index);

  for (const path of fallbacks) {
    try {
      const gltf = await loadGltf(path);
      if (gltf?.scene) return cloneSkinned(gltf.scene);
    } catch {
      // Try fallback path.
    }
  }
  return null;
}

export async function assemblePlayerModel(/** @type {any} */ visual = null) {
  const normalizedVisual = normalizeEquipmentVisualState(visual);
  const visualSignature = buildEquipmentVisualSignature(normalizedVisual);

  if (playerPrototypeCache.has(visualSignature)) {
    return cloneSkinned(playerPrototypeCache.get(visualSignature));
  }

  const model = await loadPlayerOutfitForStyle(normalizedVisual.outfitStyle);
  if (!model) return null;

  await attachRealHeadMeshes(model, normalizedVisual);
  await attachEquipmentModels(model, normalizedVisual);

  playerPrototypeCache.set(visualSignature, model);
  return cloneSkinned(model);
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

function findClipByKeywords(/** @type {any} */ clips, /** @type {any} */ keywords) {
  if (!Array.isArray(keywords) || !keywords.length) return null;
  const lower = keywords.map((/** @type {any} */ keyword) => keyword.toLowerCase());
  return (
    clips.find((/** @type {any} */ clip) => {
      const name = clip?.name?.toLowerCase?.() ?? '';
      return lower.some((/** @type {any} */ keyword) => name.includes(keyword));
    }) ?? null
  );
}

export function pickClips(/** @type {any} */ clips, /** @type {any} */ overrides = {}) {
  const clipList = Array.isArray(clips) ? clips : [];
  const idleNames = overrides.idleNames ?? null;
  const walkNames = overrides.walkNames ?? null;
  const sprintNames = overrides.sprintNames ?? null;
  const attackNames = overrides.attackNames ?? null;
  const interactNames = overrides.interactNames ?? null;
  const deathNames = overrides.deathNames ?? null;
  const idleKeywords = overrides.idleKeywords ?? ['idle'];
  const walkKeywords = overrides.walkKeywords ?? ['walk', 'run'];
  const sprintKeywords = overrides.sprintKeywords ?? ['sprint', 'run', 'jog'];
  const attackKeywords = overrides.attackKeywords ?? ['attack', 'slash', 'swing', 'punch', 'bite'];
  const interactKeywords = overrides.interactKeywords ?? ['interact', 'pickup', 'fix', 'gather', 'chop', 'harvest'];
  const deathKeywords = overrides.deathKeywords ?? ['death'];

  const findByName = (/** @type {any} */ names) => {
    if (!Array.isArray(names) || !names.length) return null;
    for (const name of names) {
      const match = clipList.find((/** @type {any} */ clip) => clip?.name === name);
      if (match) return match;
    }
    return null;
  };

  const walkFallback = Object.prototype.hasOwnProperty.call(overrides, 'walkFallback')
    ? overrides.walkFallback
    : clipList[1] ?? null;
  const sprintFallback = Object.prototype.hasOwnProperty.call(overrides, 'sprintFallback')
    ? overrides.sprintFallback
    : null;
  const idle =
    findByName(idleNames) ?? findClipByKeywords(clipList, idleKeywords) ?? clipList[0] ?? null;
  const walk =
    findByName(walkNames) ?? findClipByKeywords(clipList, walkKeywords) ?? walkFallback;
  const sprint =
    findByName(sprintNames) ?? findClipByKeywords(clipList, sprintKeywords) ?? sprintFallback;
  const attack =
    findByName(attackNames) ??
    findClipByKeywords(clipList, attackKeywords) ??
    clipList[2] ??
    null;
  const interact =
    findByName(interactNames) ??
    findClipByKeywords(clipList, interactKeywords) ??
    null;
  const death =
    findByName(deathNames) ??
    findClipByKeywords(clipList, deathKeywords) ??
    null;

  return {
    idle,
    walk,
    sprint,
    attack,
    interact,
    death,
    all: clipList,
  };
}

/**
 * Preloads all game assets before entering the game.
 * Warms the loadGltf cache and player model/animations.
 * @param {((loaded: number, total: number) => void)|undefined} onProgress - Called as each asset completes (loaded, total).
 */
export async function preloadAllAssets(onProgress) {
  const list = getPreloadAssetList();

  const /** @type {any} */ tasks = [
    assemblePlayerModel(),
    assembleVendorModel(),
    loadPlayerAnimations(),
    ...(list.villageCenter ?? []).map((/** @type {any} */ url) => loadGltf(url)),
    ...(list.corpses ?? []).map((/** @type {any} */ url) => loadGltf(url)),
    ...list.mobs.map((/** @type {any} */ url) => loadGltf(url)),
    ...list.environment.map((/** @type {any} */ url) => loadGltf(url)),
    ...(list.rocks ?? []).map((/** @type {any} */ url) => loadGltf(url)),
    ...(list.resourceNodes ?? []).map((/** @type {any} */ url) => loadGltf(url)),
    ...(list.textures ?? []).map((/** @type {any} */ url) => loadTexture(url)),
  ];

  const total = tasks.length;
  let loaded = 0;

  onProgress?.(0, total);

  const wrapped = tasks.map((/** @type {any} */ p) =>
    p.then((/** @type {any} */ v) => {
      loaded++;
      onProgress?.(loaded, total);
      return v;
    })
  );

  await Promise.all(wrapped);
}
