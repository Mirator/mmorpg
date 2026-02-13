import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

function getAbilitySlotFromEvent(event) {
  const code = event.code || '';
  const digitMatch = code.match(/^(Digit|Numpad)(\d)$/);
  if (digitMatch) {
    const digit = Number(digitMatch[2]);
    return digit === 0 ? 10 : digit;
  }
  const key = event.key;
  if (typeof key === 'string' && key.length === 1 && key >= '0' && key <= '9') {
    const digit = Number(key);
    return digit === 0 ? 10 : digit;
  }
  const legacyCode =
    typeof event.keyCode === 'number'
      ? event.keyCode
      : typeof event.which === 'number'
        ? event.which
        : null;
  if (legacyCode !== null) {
    if (legacyCode >= 48 && legacyCode <= 57) {
      const digit = legacyCode - 48;
      return digit === 0 ? 10 : digit;
    }
    if (legacyCode >= 96 && legacyCode <= 105) {
      const digit = legacyCode - 96;
      return digit === 0 ? 10 : digit;
    }
  }
  return null;
}

export function createInputHandler({
  renderer,
  camera,
  isUiBlocking,
  isMenuOpen,
  isDialogOpen,
  isTradeOpen,
  isInventoryOpen,
  isSkillsOpen,
  onToggleInventory,
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
}) {
  const keys = { w: false, a: false, s: false, d: false };

  function sendInput() {
    onInputChange?.({ ...keys });
  }

  function handleKey(event, isDown) {
    if (isUiBlocking()) return;
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd'].includes(key)) return;
    if (event.repeat) return;
    if (keys[key] === isDown) return;
    keys[key] = isDown;
    if (isDown) {
      onMoveTarget?.(null, { clearTarget: true });
    }
    sendInput();
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

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key === 'f' && !event.repeat) {
      const handler = onToggleFullscreen ?? toggleFullscreen;
      handler();
      return;
    }
    if (isMenuOpen?.()) {
      return;
    }
    if (key === 'tab' && !event.repeat) {
      event.preventDefault();
      if (isUiBlocking()) return;
      onCycleTarget?.();
      return;
    }
    if (key === 'i' && !event.repeat) {
      onToggleInventory?.();
      return;
    }
    if (key === 'k' && !event.repeat) {
      onToggleSkills?.();
      return;
    }
    if ((key === 'b' || key === 's') && isTradeOpen() && !event.repeat) {
      onTradeTab?.(key === 'b' ? 'buy' : 'sell');
      return;
    }
    if (key === 'e' && !event.repeat) {
      onInteract?.();
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
    handleKey(event, true);
  });

  window.addEventListener('keyup', (event) => {
    if (isMenuOpen?.()) return;
    if (isUiBlocking()) return;
    handleKey(event, false);
  });

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  renderer.domElement.addEventListener('click', (event) => {
    if (isUiBlocking()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
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
    raycaster.setFromCamera(mouse, camera);
    const point = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(groundPlane, point);
    if (hit) {
      onMoveTarget?.({ x: point.x, y: point.y ?? 0, z: point.z });
    }
  });

  return {
    clearMovement,
    getKeys,
  };
}
