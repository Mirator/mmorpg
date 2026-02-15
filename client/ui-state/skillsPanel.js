import { getClassById, getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { xpToNext } from '/shared/progression.js';

function formatTargetType(type) {
  if (!type) return 'None';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function createSkillsPanelUpdater(elements) {
  const {
    skillsListEl,
    skillsClassEl,
    skillsLevelEl,
    skillsXpEl,
  } = elements;
  let skillsRenderKey = '';

  return function updateSkillsPanel(me, getCurrentClassId) {
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
      const row = document.createElement('div');
      row.className = 'skill-row';
      const name = document.createElement('div');
      name.className = 'skill-name';
      name.textContent = ability.name;
      const meta = document.createElement('div');
      meta.className = 'skill-meta';
      const typeLabel = formatTargetType(ability.targetType);
      meta.textContent = `Slot ${ability.slot} · CD ${Math.round(
        (ability.cooldownMs ?? 0) / 1000
      )}s · ${typeLabel}`;
      row.appendChild(name);
      row.appendChild(meta);
      skillsListEl.appendChild(row);
    }
  };
}
