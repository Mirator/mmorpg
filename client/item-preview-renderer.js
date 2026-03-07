// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { loadGltf } from './assets.js';

const THUMBNAIL_SIZE = 88;

/** @type {{ canvas: HTMLCanvasElement, renderer: any, scene: any, camera: any } | null} */
let rendererState = null;
let rendererDisabled = false;

function createPlaceholderModel(/** @type {any} */ category) {
  const group = new THREE.Group();
  const toneMap = /** @type {Record<string, number>} */ ({
    weapon: 0xcda45e,
    offhand: 0x7fb0d4,
    armor: 0x80a177,
    consumable: 0xb06ea9,
    material: 0xd9c98a,
    misc: 0x888f9f,
  });
  const tone = toneMap[String(category ?? 'misc')] ?? 0x888f9f;
  const material = new THREE.MeshStandardMaterial({
    color: tone,
    roughness: 0.4,
    metalness: 0.2,
  });
  if (category === 'weapon') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.1, 0.08), material);
    blade.position.y = 0.42;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.14), material);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10), material);
    grip.position.y = -0.34;
    group.add(blade, guard, grip);
  } else if (category === 'offhand') {
    group.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.14, 10, 22), material));
  } else if (category === 'armor') {
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.9, 0.44), material);
    chest.position.y = 0.05;
    group.add(chest);
  } else if (category === 'consumable') {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 12), material);
    bottle.position.y = -0.02;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 10), material);
    neck.position.y = 0.5;
    group.add(bottle, neck);
  } else if (category === 'material') {
    group.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), material));
  } else {
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), material));
  }
  return group;
}

function normalizeObjectForThumbnail(/** @type {any} */ object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return false;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  object.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return false;
  const scale = 1.8 / maxDim;
  object.scale.multiplyScalar(scale);
  return true;
}

function getRendererState() {
  if (rendererDisabled) return null;
  if (rendererState) return rendererState;
  if (typeof document === 'undefined') {
    rendererDisabled = true;
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff2d9, 1.05);
    key.position.set(2.2, 3.2, 2.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x84b6ff, 0.55);
    rim.position.set(-2, 1.6, -2);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0.5, 0.7, 3.2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    rendererState = { canvas, renderer, scene, camera };
    return rendererState;
  } catch {
    rendererDisabled = true;
    return null;
  }
}

export async function renderItemThumbnail(/** @type {any} */ source) {
  const state = getRendererState();
  if (!state) return null;

  let object = null;
  if (source?.modelPath) {
    try {
      const gltf = await loadGltf(source.modelPath);
      object = gltf?.scene ? gltf.scene.clone(true) : null;
    } catch {
      object = null;
    }
  }
  if (!object) {
    object = createPlaceholderModel(source?.category ?? 'misc');
  }
  if (!normalizeObjectForThumbnail(object)) {
    object = createPlaceholderModel(source?.category ?? 'misc');
    normalizeObjectForThumbnail(object);
  }
  object.rotation.y = Math.PI / 7;
  object.rotation.x = -Math.PI / 18;

  state.scene.add(object);
  state.renderer.render(state.scene, state.camera);
  const dataUrl = state.canvas.toDataURL('image/png');
  state.scene.remove(object);
  return dataUrl;
}
