// @ts-check
import { getClassById, getAbilitiesForClass } from '/shared/classes.js';
import { getAbilityPresentation } from '/shared/abilityPresentation.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { xpToNext } from '/shared/progression.js';
import { getAbilityIconFile } from '../gameIcons.js';
import { createGlyphElement } from '../uiGlyphs.js';

function formatTargetType(/** @type {any} */ type) {
  if (!type) return 'None';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function createSkillsPanelUpdater(/** @type {any} */ elements) {
  const {
    skillsListEl,
    skillsClassEl,
    skillsLevelEl,
    skillsXpEl,
  } = elements;
  let skillsRenderKey = '';

  return function updateSkillsPanel(/** @type {any} */ me, /** @type {any} */ getCurrentClassId) {
    if (!skillsListEl) return;
    if (!me) {
      if (skillsClassEl) skillsClassEl.textContent = '--';
      if (skillsLevelEl) skillsLevelEl.textContent = '--';
      if (skillsXpEl) skillsXpEl.textContent = '--';
      skillsListEl.innerHTML = '';
      skillsRenderKey = '';
      return;
    }
    const classId = getCurrentClassId(me);
    const klass = getClassById(classId);
    const weaponDef = getEquippedWeapon(me?.equipment, classId);
    if (skillsClassEl) {
      skillsClassEl.textContent = klass?.name ?? classId ?? '--';
    }
    if (skillsLevelEl) {
      skillsLevelEl.textContent = `${me?.level ?? 1}`;
    }
    if (skillsXpEl) {
      const needed = me?.xpToNext ?? xpToNext(me?.level ?? 1);
      skillsXpEl.textContent = needed ? `${me?.xp ?? 0}/${needed}` : 'MAX';
    }

    const renderKey = `${classId}:${me?.level ?? 1}:${weaponDef?.kind ?? 'none'}`;
    if (renderKey === skillsRenderKey) return;
    skillsRenderKey = renderKey;
    skillsListEl.innerHTML = '';
    const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
    for (const ability of abilities) {
      const presentation = getAbilityPresentation(ability, { classId, weaponDef });
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.style.setProperty('--ability-primary-rgb', presentation.primaryRgb);
      row.style.setProperty('--ability-secondary-rgb', presentation.secondaryRgb);
      const iconFile = getAbilityIconFile(ability, weaponDef);
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
      meta.textContent = `Slot ${ability.slot} · CD ${Math.round(
        (ability.cooldownMs ?? 0) / 1000
      )}s · ${typeLabel}`;
      copy.appendChild(name);
      copy.appendChild(meta);
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
      row.appendChild(copy);
      row.appendChild(tooltip);
      skillsListEl.appendChild(row);
    }
  };
}
