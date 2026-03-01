// @ts-check
import { ABILITY_SLOTS, getClassById } from '/shared/classes.js';
import { getAbilityPresentation } from '/shared/abilityPresentation.js';
import { xpToNext } from '/shared/progression.js';
import { getAbilityIconFile } from '../gameIcons.js';
import { createGlyphElement } from '../uiGlyphs.js';

function formatTargetType(/** @type {any} */ type) {
  if (!type) return 'None';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatSlotKey(/** @type {number} */ slot) {
  return slot === 10 ? '0' : String(slot);
}

function buildEmptySlots() {
  return Array.from({ length: ABILITY_SLOTS }, () => null);
}

function buildSkillTooltip(/** @type {any} */ ability, /** @type {any} */ presentation) {
  const tooltip = document.createElement('div');
  tooltip.className = 'skill-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  const tooltipTitle = document.createElement('div');
  tooltipTitle.className = 'skill-tooltip-title';
  tooltipTitle.textContent = ability.name;
  const tooltipBody = document.createElement('div');
  tooltipBody.className = 'skill-tooltip-body';
  tooltipBody.textContent = presentation.summary;
  const tooltipMeta = document.createElement('div');
  tooltipMeta.className = 'skill-tooltip-meta';
  tooltipMeta.textContent = presentation.metaLabel;
  tooltip.appendChild(tooltipTitle);
  tooltip.appendChild(tooltipBody);
  tooltip.appendChild(tooltipMeta);
  return tooltip;
}

function applyAbilityTheme(/** @type {any} */ el, /** @type {any} */ presentation) {
  el.style.setProperty('--ability-primary-rgb', presentation.primaryRgb);
  el.style.setProperty('--ability-secondary-rgb', presentation.secondaryRgb);
}

export function createSkillsPanelUpdater(/** @type {any} */ elements) {
  const {
    skillsListEl,
    skillsClassEl,
    skillsLevelEl,
    skillsXpEl,
    getAbilityPanelState,
    setAbilityInSlot,
    swapAbilitySlots,
    clearAbilitySlot,
    onLoadoutChanged,
  } = elements;
  let skillsRenderKey = '';
  let /** @type {any} */ lastPlayer = null;
  let /** @type {any} */ drag = null;
  let /** @type {any} */ dragPreviewEl = null;
  let /** @type {any} */ activeDropEl = null;

  function positionDrag(/** @type {any} */ x, /** @type {any} */ y) {
    if (!dragPreviewEl) return;
    dragPreviewEl.style.left = `${x}px`;
    dragPreviewEl.style.top = `${y}px`;
  }

  function setActiveDropTarget(/** @type {any} */ next) {
    if (activeDropEl === next) return;
    activeDropEl?.classList?.remove?.('active');
    activeDropEl = next ?? null;
    activeDropEl?.classList?.add?.('active');
  }

  function clearDragState() {
    drag?.sourceEl?.classList?.remove?.('dragging');
    drag = null;
    setActiveDropTarget(null);
    if (dragPreviewEl) {
      dragPreviewEl.remove();
      dragPreviewEl = null;
    }
    globalThis?.window?.removeEventListener?.('pointermove', onPointerMove);
    globalThis?.window?.removeEventListener?.('pointerup', onPointerUp);
    globalThis?.window?.removeEventListener?.('pointercancel', onPointerUp);
  }

  function buildDragPreview(
    /** @type {any} */ ability,
    /** @type {any} */ presentation,
    /** @type {any} */ weaponDef
  ) {
    const el = document.createElement('div');
    el.className = 'skill-drag-preview';
    applyAbilityTheme(el, presentation);
    const iconFile = getAbilityIconFile(ability, weaponDef);
    if (iconFile) {
      el.appendChild(
        createGlyphElement(iconFile, {
          className: 'ui-glyph ui-glyph-md skills-loadout-glyph',
          label: ability.name,
        })
      );
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'skills-loadout-fallback';
      fallback.textContent = String(ability?.name ?? '?').slice(0, 1).toUpperCase();
      el.appendChild(fallback);
    }
    const label = document.createElement('div');
    label.className = 'skill-drag-preview-label';
    label.textContent = ability?.name ?? 'Skill';
    el.appendChild(label);
    return el;
  }

  function resolveDropTarget(/** @type {any} */ x, /** @type {any} */ y) {
    const target =
      typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(x, y)
        : null;
    const loadoutSlotTarget = /** @type {any} */ (target?.closest?.('.skills-loadout-slot'));
    if (loadoutSlotTarget?.dataset?.slot) {
      return { kind: 'slot', el: loadoutSlotTarget, slot: Number(loadoutSlotTarget.dataset.slot) };
    }
    const abilityBarSlotTarget = /** @type {any} */ (target?.closest?.('.ability-slot'));
    if (abilityBarSlotTarget?.dataset?.slot) {
      return { kind: 'slot', el: abilityBarSlotTarget, slot: Number(abilityBarSlotTarget.dataset.slot) };
    }
    const removeTarget = /** @type {any} */ (target?.closest?.('.skills-loadout-remove'));
    if (removeTarget) {
      return { kind: 'remove', el: removeTarget };
    }
    return null;
  }

  function rerender(/** @type {boolean} */ force = false) {
    if (!lastPlayer) return;
    renderPanel(lastPlayer, force);
  }

  function onPointerMove(/** @type {any} */ event) {
    if (!drag) return;
    positionDrag(event.clientX, event.clientY);
    const dropTarget = resolveDropTarget(event.clientX, event.clientY);
    setActiveDropTarget(dropTarget?.el ?? null);
  }

  function onPointerUp(/** @type {any} */ event) {
    if (!drag) return;
    const dropTarget = resolveDropTarget(event.clientX, event.clientY);
    let changed = false;
    if (dropTarget?.kind === 'slot' && Number.isInteger(dropTarget.slot)) {
      if (drag.type === 'slot') {
        if (drag.slot !== dropTarget.slot) {
          if (typeof swapAbilitySlots === 'function') {
            swapAbilitySlots(lastPlayer, drag.slot, dropTarget.slot);
            changed = true;
          }
        }
      } else {
        if (typeof setAbilityInSlot === 'function') {
          setAbilityInSlot(lastPlayer, drag.abilityId, dropTarget.slot);
          changed = true;
        }
      }
    } else if (dropTarget?.kind === 'remove') {
      const clearSlot =
        drag.type === 'slot'
          ? drag.slot
          : drag.assignedSlot;
      if (Number.isInteger(clearSlot) && clearSlot >= 1) {
        if (typeof clearAbilitySlot === 'function') {
          clearAbilitySlot(lastPlayer, clearSlot);
          changed = true;
        }
      }
    }
    clearDragState();
    if (changed) {
      skillsRenderKey = '';
      rerender(true);
      onLoadoutChanged?.(lastPlayer);
    }
  }

  function startDrag(
    /** @type {any} */ payload,
    /** @type {any} */ ability,
    /** @type {any} */ presentation,
    /** @type {any} */ weaponDef,
    /** @type {any} */ event,
    /** @type {any} */ sourceEl
  ) {
    if (!ability || !sourceEl) return;
    event?.preventDefault?.();
    clearDragState();
    drag = { ...payload, sourceEl };
    sourceEl.classList.add('dragging');
    dragPreviewEl = buildDragPreview(ability, presentation, weaponDef);
    document.body?.appendChild?.(dragPreviewEl);
    positionDrag(event?.clientX ?? 0, event?.clientY ?? 0);
    globalThis?.window?.addEventListener?.('pointermove', onPointerMove);
    globalThis?.window?.addEventListener?.('pointerup', onPointerUp);
    globalThis?.window?.addEventListener?.('pointercancel', onPointerUp);
    const dropTarget = resolveDropTarget(event?.clientX ?? 0, event?.clientY ?? 0);
    setActiveDropTarget(dropTarget?.el ?? null);
  }

  function renderLoadoutEditor(/** @type {any} */ panelState) {
    const section = document.createElement('div');
    section.className = 'skills-loadout';

    const title = document.createElement('div');
    title.className = 'skills-loadout-title';
    title.textContent = 'Skill Bar';
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'skills-loadout-grid';
    for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
      const ability = panelState.slottedAbilities[slot - 1] ?? null;
      const slotEl = document.createElement('div');
      slotEl.className = ability ? 'skills-loadout-slot' : 'skills-loadout-slot empty';
      slotEl.dataset.slot = String(slot);

      const key = document.createElement('div');
      key.className = 'skills-loadout-key';
      key.textContent = formatSlotKey(slot);
      slotEl.appendChild(key);

      if (ability) {
        const presentation = getAbilityPresentation(ability, {
          classId: panelState.classId,
          weaponDef: panelState.weaponDef,
        });
        applyAbilityTheme(slotEl, presentation);

        const iconFile = getAbilityIconFile(ability, panelState.weaponDef);
        if (iconFile) {
          slotEl.appendChild(
            createGlyphElement(iconFile, {
              className: 'ui-glyph ui-glyph-md skills-loadout-glyph',
              label: ability.name,
            })
          );
        } else {
          const fallback = document.createElement('div');
          fallback.className = 'skills-loadout-fallback';
          fallback.textContent = ability.name.slice(0, 1).toUpperCase();
          slotEl.appendChild(fallback);
        }

        const name = document.createElement('div');
        name.className = 'skills-loadout-name';
        name.textContent = ability.name;
        slotEl.appendChild(name);
        slotEl.appendChild(buildSkillTooltip(ability, presentation));
        slotEl.addEventListener('pointerdown', (event) => {
          startDrag(
            { type: 'slot', slot, abilityId: ability.id },
            ability,
            presentation,
            panelState.weaponDef,
            event,
            slotEl
          );
        });
      } else {
        const label = document.createElement('div');
        label.className = 'skills-loadout-empty-label';
        label.textContent = 'Empty';
        slotEl.appendChild(label);
      }
      grid.appendChild(slotEl);
    }
    section.appendChild(grid);

    const remove = document.createElement('div');
    remove.className = 'skills-loadout-remove';
    remove.textContent = 'Drop Here To Remove';
    section.appendChild(remove);

    const hint = document.createElement('div');
    hint.className = 'skills-hint';
    hint.textContent = 'Drag skills onto the bar, between slots, or here to remove them.';
    section.appendChild(hint);

    return section;
  }

  function renderSkillRows(
    /** @type {any} */ panelState,
    /** @type {Map<string, number>} */ assignedSlotById
  ) {
    const fragment = [];
    for (const ability of panelState.abilities) {
      const presentation = getAbilityPresentation(ability, {
        classId: panelState.classId,
        weaponDef: panelState.weaponDef,
      });
      const assignedSlot = assignedSlotById.get(ability.id) ?? null;
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.dataset.abilityId = ability.id;
      if (assignedSlot) row.dataset.slot = String(assignedSlot);
      applyAbilityTheme(row, presentation);

      const iconFile = getAbilityIconFile(ability, panelState.weaponDef);
      if (iconFile) {
        row.appendChild(
          createGlyphElement(iconFile, {
            className: 'ui-glyph ui-glyph-md skill-glyph',
            label: ability.name,
          })
        );
      }
      const copy = document.createElement('div');
      copy.className = 'skill-copy';
      const name = document.createElement('div');
      name.className = 'skill-name';
      name.textContent = ability.name;
      const meta = document.createElement('div');
      meta.className = 'skill-meta';
      const typeLabel = formatTargetType(ability.targetType);
      meta.textContent = `${assignedSlot ? `Bar ${assignedSlot}` : 'Off bar'} · CD ${Math.round(
        (ability.cooldownMs ?? 0) / 1000
      )}s · ${typeLabel}`;
      copy.appendChild(name);
      copy.appendChild(meta);
      row.appendChild(copy);
      row.appendChild(buildSkillTooltip(ability, presentation));
      row.addEventListener('pointerdown', (event) => {
        startDrag(
          { type: 'ability', abilityId: ability.id, assignedSlot },
          ability,
          presentation,
          panelState.weaponDef,
          event,
          row
        );
      });
      fragment.push(row);
    }
    return fragment;
  }

  function renderPanel(/** @type {any} */ me, /** @type {boolean} */ force = false) {
    if (!skillsListEl) return;
    lastPlayer = me ?? null;
    if (!me) {
      clearDragState();
      if (skillsClassEl) skillsClassEl.textContent = '--';
      if (skillsLevelEl) skillsLevelEl.textContent = '--';
      if (skillsXpEl) skillsXpEl.textContent = '--';
      skillsListEl.innerHTML = '';
      skillsRenderKey = '';
      return;
    }

    const panelState = getAbilityPanelState?.(me) ?? {
      classId: me?.classId ?? null,
      weaponDef: null,
      abilities: [],
      slottedAbilities: buildEmptySlots(),
      loadoutSignature: buildEmptySlots().map(() => '-').join('|'),
    };
    const klass = getClassById(panelState.classId);
    if (skillsClassEl) {
      skillsClassEl.textContent = klass?.name ?? panelState.classId ?? '--';
    }
    if (skillsLevelEl) {
      skillsLevelEl.textContent = `${me?.level ?? 1}`;
    }
    if (skillsXpEl) {
      const needed = me?.xpToNext ?? xpToNext(me?.level ?? 1);
      skillsXpEl.textContent = needed ? `${me?.xp ?? 0}/${needed}` : 'MAX';
    }

    const renderKey = `${panelState.classId}:${me?.level ?? 1}:${panelState.weaponDef?.kind ?? 'none'}:${panelState.loadoutSignature}`;
    if (!force && renderKey === skillsRenderKey) return;
    skillsRenderKey = renderKey;
    clearDragState();
    skillsListEl.innerHTML = '';

    const assignedSlotById = new Map();
    for (let i = 0; i < ABILITY_SLOTS; i += 1) {
      const ability = panelState.slottedAbilities[i];
      if (ability?.id && !assignedSlotById.has(ability.id)) {
        assignedSlotById.set(ability.id, i + 1);
      }
    }

    skillsListEl.appendChild(renderLoadoutEditor(panelState));
    for (const row of renderSkillRows(panelState, assignedSlotById)) {
      skillsListEl.appendChild(row);
    }
  }

  function startBarSlotDrag(
    /** @type {any} */ me,
    /** @type {any} */ slot,
    /** @type {any} */ sourceEl,
    /** @type {any} */ event
  ) {
    const normalizedSlot = Number(slot);
    if (!Number.isInteger(normalizedSlot) || normalizedSlot < 1 || normalizedSlot > ABILITY_SLOTS) {
      return false;
    }
    const panelState = getAbilityPanelState?.(me);
    const ability = panelState?.slottedAbilities?.[normalizedSlot - 1] ?? null;
    if (!ability) return false;
    lastPlayer = me ?? lastPlayer;
    const presentation = getAbilityPresentation(ability, {
      classId: panelState?.classId,
      weaponDef: panelState?.weaponDef,
    });
    startDrag(
      { type: 'slot', slot: normalizedSlot, abilityId: ability.id },
      ability,
      presentation,
      panelState?.weaponDef ?? null,
      event,
      sourceEl
    );
    return true;
  }

  return {
    update(/** @type {any} */ me) {
      renderPanel(me, false);
    },
    startBarSlotDrag,
  };
}
