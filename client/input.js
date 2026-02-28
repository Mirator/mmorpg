// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  getAbilitySlotFromEvent,
  isKeyMatch,
} from './keybinds.js';

const /** @type {any} */ MOVE_ACTION_TO_KEY = {
  moveForward: 'w',
  moveBack: 's',
  moveLeft: 'a',
  moveRight: 'd',
};

export function createInputHandler(/** @type {any} */ {
  renderer,
  camera,
  isUiBlocking,
  isMenuOpen,
  isPauseMenuOpen,
  isDialogOpen,
  isTradeOpen,
  isInventoryOpen,
  isSkillsOpen,
  onToggleInventory,
  onToggleCharacter,
  onToggleSkills,
  onToggleFullscreen,
  onInteract,
  onAbility,
  onMoveTarget,
  onInputChange,
  onTargetSelect,
  onCycleTarget,
  pickTarget,
  onTradeTab,
  getPlacementMode,
  onPlacementConfirm,
  onPlacementCancel,
  onPlacementUpdate,
  onTogglePauseMenu,
}) {
  const /** @type {any} */ keys = { w: false, a: false, s: false, d: false, walk: false };

  function sendInput() {
    onInputChange?.({ ...keys });
  }

  function handleMoveKey(/** @type {any} */ event, /** @type {any} */ isDown) {
    if (isUiBlocking()) return;
    for (const [action, keyName] of Object.entries(MOVE_ACTION_TO_KEY)) {
      if (isKeyMatch(event, action)) {
        if (event.repeat) return;
        if (keys[keyName] === isDown) return;
        keys[keyName] = isDown;
        if (isDown) {
          onMoveTarget?.(null, { clearTarget: true });
        }
        sendInput();
        return;
      }
    }
  }

  function clearMovement() {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    sendInput();
  }

  function getKeys() {
    return { ...keys };
  }

  function isMovementActive() {
    return keys.w || keys.a || keys.s || keys.d;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      renderer.domElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  window.addEventListener('keydown', (/** @type {any} */ event) => {
    if (isKeyMatch(event, 'fullscreen') && !event.repeat) {
      const handler = onToggleFullscreen ?? toggleFullscreen;
      handler();
      return;
    }
    if (isMenuOpen?.()) {
      return;
    }
    if (isKeyMatch(event, 'pause') && !event.repeat) {
      if (isPauseMenuOpen?.()) {
        onTogglePauseMenu?.();
        return;
      }
      if (getPlacementMode?.()) {
        onPlacementCancel?.();
        return;
      }
      onTogglePauseMenu?.();
      return;
    }
    if (isKeyMatch(event, 'cycleTarget') && !event.repeat) {
      event.preventDefault();
      if (isUiBlocking()) return;
      onCycleTarget?.();
      return;
    }
    if (isKeyMatch(event, 'inventory') && !event.repeat) {
      onToggleInventory?.();
      return;
    }
    if (isKeyMatch(event, 'character') && !event.repeat) {
      onToggleCharacter?.();
      return;
    }
    if (isKeyMatch(event, 'skills') && !event.repeat) {
      onToggleSkills?.();
      return;
    }
    if (isTradeOpen() && !event.repeat) {
      if (isKeyMatch(event, 'tradeBuy')) {
        onTradeTab?.('buy');
        return;
      }
      if (isKeyMatch(event, 'tradeSell')) {
        onTradeTab?.('sell');
        return;
      }
    }
    if (isKeyMatch(event, 'interact') && !event.repeat) {
      onInteract?.();
      return;
    }
    if (isKeyMatch(event, 'toggleWalk') && !event.repeat) {
      if (isUiBlocking()) return;
      keys.walk = !keys.walk;
      sendInput();
      return;
    }
    if (isUiBlocking()) return;
    if (!event.repeat) {
      const abilitySlot = getAbilitySlotFromEvent(event);
      if (abilitySlot) {
        onAbility?.(abilitySlot);
        return;
      }
    }
    handleMoveKey(event, true);
  });

  window.addEventListener('keyup', (/** @type {any} */ event) => {
    if (isMenuOpen?.()) return;
    if (isUiBlocking()) return;
    handleMoveKey(event, false);
  });

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function getGroundPoint(/** @type {any} */ ndc) {
    raycaster.setFromCamera(ndc, camera);
    const point = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, point);
    return hit ? { x: point.x, y: point.y ?? 0, z: point.z } : null;
  }

  renderer.domElement.addEventListener('click', (/** @type {any} */ event) => {
    if (isUiBlocking()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const placement = getPlacementMode?.();
    if (placement) {
      const pos = getGroundPoint({ x: mouse.x, y: mouse.y });
      if (pos) onPlacementConfirm?.(pos);
      return;
    }
    if (pickTarget) {
      const picked = pickTarget({ x: mouse.x, y: mouse.y });
      if (picked) {
        onTargetSelect?.(picked);
        return;
      }
    }
    if (isMovementActive()) {
      return;
    }
    const pos = getGroundPoint({ x: mouse.x, y: mouse.y });
    if (pos) onMoveTarget?.(pos);
  });

  renderer.domElement.addEventListener('mousemove', (/** @type {any} */ event) => {
    if (!getPlacementMode?.() || !onPlacementUpdate) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const pos = getGroundPoint({ x: mouse.x, y: mouse.y });
    if (pos) onPlacementUpdate?.(pos);
  });

  return {
    clearMovement,
    getKeys,
  };
}
