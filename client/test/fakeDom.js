// @ts-check

export class FakeClassList {
  constructor(/** @type {any} */ owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  sync() {
    this.owner._className = Array.from(this.tokens).join(' ');
  }

  add(/** @type {string[]} */ ...tokens) {
    let changed = false;
    for (const token of tokens) {
      if (!this.tokens.has(token)) {
        this.tokens.add(token);
        changed = true;
      }
    }
    if (changed) this.sync();
  }

  remove(/** @type {string[]} */ ...tokens) {
    let changed = false;
    for (const token of tokens) {
      if (this.tokens.delete(token)) changed = true;
    }
    if (changed) this.sync();
  }

  toggle(/** @type {string} */ token, /** @type {boolean | undefined} */ force) {
    const shouldAdd = force == null ? !this.tokens.has(token) : !!force;
    const hasToken = this.tokens.has(token);
    if (shouldAdd === hasToken) return shouldAdd;
    this.owner.classToggleCount += 1;
    if (shouldAdd) this.tokens.add(token);
    else this.tokens.delete(token);
    this.sync();
    return shouldAdd;
  }

  contains(/** @type {string} */ token) {
    return this.tokens.has(token);
  }
}

export class FakeStyle {
  constructor(/** @type {any} */ owner) {
    this.owner = owner;
    this.values = /** @type {Record<string, any>} */ ({});
  }

  setProperty(/** @type {string} */ name, /** @type {any} */ value) {
    this.values[name] = value;
    this.owner.styleSetCount += 1;
  }

  removeProperty(/** @type {string} */ name) {
    delete this.values[name];
    this.owner.styleSetCount += 1;
  }
}

export class FakeElement {
  constructor(/** @type {any} */ tagName) {
    this.tagName = String(tagName ?? 'div').toUpperCase();
    this.children = /** @type {any[]} */ ([]);
    this.parentNode = /** @type {any} */ (null);
    this.dataset = /** @type {Record<string, any>} */ ({});
    this.attributes = /** @type {Record<string, any>} */ ({});
    this.listeners = /** @type {Record<string, any>} */ ({});
    this.textSetCount = 0;
    this.styleSetCount = 0;
    this.classToggleCount = 0;
    this._textContent = '';
    this._className = '';
    this.classList = new FakeClassList(this);
    this.style = new FakeStyle(this);
  }

  set className(/** @type {any} */ value) {
    this._className = String(value ?? '');
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

  set textContent(/** @type {any} */ value) {
    this._textContent = String(value ?? '');
    this.textSetCount += 1;
  }

  get textContent() {
    return this._textContent;
  }

  set innerHTML(/** @type {any} */ value) {
    this._textContent = String(value ?? '');
    if (value === '') {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._textContent;
  }

  appendChild(/** @type {any} */ child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(
      (/** @type {any} */ child) => child !== this
    );
    this.parentNode = null;
  }

  contains(/** @type {any} */ target) {
    if (target === this) return true;
    for (const child of this.children) {
      if (child === target) return true;
      if (child?.contains?.(target)) return true;
    }
    return false;
  }

  setAttribute(/** @type {string} */ name, /** @type {any} */ value) {
    const stringValue = String(value ?? '');
    this.attributes[name] = stringValue;
    if (name === 'id') this.id = stringValue;
  }

  getAttribute(/** @type {string} */ name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(/** @type {string} */ type, /** @type {any} */ handler) {
    this.listeners[type] = handler;
  }

  matches(/** @type {string} */ selector) {
    if (!selector) return false;
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  closest(/** @type {string} */ selector) {
    if (this.matches(selector)) return this;
    return this.parentNode?.closest?.(selector) ?? null;
  }

  querySelector(/** @type {string} */ selector) {
    for (const child of this.children) {
      if (child.matches?.(selector)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(/** @type {string} */ selector) {
    const found = /** @type {any[]} */ ([]);
    for (const child of this.children) {
      if (child.matches?.(selector)) found.push(child);
      if (child.querySelectorAll) {
        found.push(...child.querySelectorAll(selector));
      }
    }
    return found;
  }
}

export function collectCounters(/** @type {any} */ root) {
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

export function createFakeDocument(/** @type {string[]} */ ids = []) {
  const elements = /** @type {Record<string, any>} */ ({});
  for (const id of ids) {
    const el = new FakeElement('div');
    el.id = id;
    elements[id] = el;
  }
  const body = new FakeElement('body');
  return {
    elements,
    body,
    document: {
      body,
      createElement: (/** @type {any} */ tagName) => new FakeElement(tagName),
      getElementById: (/** @type {string} */ id) => elements[id] ?? null,
      querySelectorAll: () => [],
    },
  };
}
