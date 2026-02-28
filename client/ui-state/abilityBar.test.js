import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { buildAbilityTooltip, createAbilityBar } from './abilityBar.js';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  sync() {
    this.owner._className = Array.from(this.tokens).join(' ');
  }

  add(...tokens) {
    let changed = false;
    for (const token of tokens) {
      if (!this.tokens.has(token)) {
        this.tokens.add(token);
        changed = true;
      }
    }
    if (changed) this.sync();
  }

  remove(...tokens) {
    let changed = false;
    for (const token of tokens) {
      if (this.tokens.delete(token)) changed = true;
    }
    if (changed) this.sync();
  }

  toggle(token, force) {
    const shouldAdd = force == null ? !this.tokens.has(token) : !!force;
    const hasToken = this.tokens.has(token);
    if (shouldAdd === hasToken) return shouldAdd;
    this.owner.classToggleCount += 1;
    if (shouldAdd) {
      this.tokens.add(token);
    } else {
      this.tokens.delete(token);
    }
    this.sync();
    return shouldAdd;
  }
}

class FakeStyle {
  constructor(owner) {
    this.owner = owner;
    this.values = {};
  }

  setProperty(name, value) {
    this.values[name] = value;
    this.owner.styleSetCount += 1;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textSetCount = 0;
    this.styleSetCount = 0;
    this.classToggleCount = 0;
    this._textContent = '';
    this._className = '';
    this.classList = new FakeClassList(this);
    this.style = new FakeStyle(this);
  }

  set className(value) {
    this._className = String(value);
    this.classList.tokens = new Set(
      this._className
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
    );
  }

  get className() {
    return this._className;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.textSetCount += 1;
  }

  get textContent() {
    return this._textContent;
  }

  set innerHTML(value) {
    this._textContent = String(value);
    if (value === '') {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._textContent;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }
}

function collectCounters(root) {
  let text = root.textSetCount ?? 0;
  let style = root.styleSetCount ?? 0;
  let classToggles = root.classToggleCount ?? 0;
  for (const child of root.children ?? []) {
    const nested = collectCounters(child);
    text += nested.text;
    style += nested.style;
    classToggles += nested.classToggles;
  }
  return { text, style, classToggles };
}

describe('ability bar rendering', () => {
  const originalDocument = global.document;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
    };
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
  });

  it('renders ability labels, tooltip text, and cooldowns', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 1600,
      abilityCooldowns: {},
    };
    const classId = me.classId;
    const weaponDef = getEquippedWeapon(me.equipment, classId);
    const slotOneAbility = getAbilitiesForClass(classId, me.level, weaponDef).find((ability) => ability.slot === 1);

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, (player) => player?.classId ?? null, 900);

    const slotOne = abilityBarEl.children[0];
    expect(slotOneAbility).toBeTruthy();
    expect(slotOne.children[1].textContent).toBe(slotOneAbility?.name ?? '');
    expect(slotOne.children[2].textContent).toBe('0.6s');
    expect(slotOne.children[3].textContent).toBe(buildAbilityTooltip(slotOneAbility));
  });

  it('skips DOM writes on repeated identical updates', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {},
    };

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, (player) => player?.classId ?? null, 900);
    const firstCounts = collectCounters(abilityBarEl);

    abilityBar.updateAbilityBar(me, 1000, (player) => player?.classId ?? null, 900);
    const secondCounts = collectCounters(abilityBarEl);

    expect(secondCounts).toEqual(firstCounts);
  });
});
