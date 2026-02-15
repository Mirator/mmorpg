import { MOB_TYPES, RESOURCE_TYPE_LIST } from '/shared/entityTypes.js';

const form = document.getElementById('auth-form');
const passInput = document.getElementById('admin-pass');
const statusEl = document.getElementById('status');
const saveStatusEl = document.getElementById('save-status');
const errorsEl = document.getElementById('errors');
const reloadBtn = document.getElementById('reload-btn');
const saveBtn = document.getElementById('save-btn');
const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');

const mapFieldsEl = document.getElementById('map-fields');
const baseFieldsEl = document.getElementById('base-fields');
const listEls = {
  spawnPoints: document.getElementById('list-spawnPoints'),
  obstacles: document.getElementById('list-obstacles'),
  resourceNodes: document.getElementById('list-resourceNodes'),
  vendors: document.getElementById('list-vendors'),
  mobSpawns: document.getElementById('list-mobSpawns'),
};

const sidebar = document.getElementById('sidebar');

let adminPassword = '';
let mapConfig = null;
let selected = null;
let dragging = false;

const FIELD_DEFS = {
  spawnPoints: [
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
  ],
  obstacles: [
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'radius', label: 'R', type: 'number', step: '0.1' },
  ],
  resourceNodes: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'type', label: 'Type', type: 'select', options: RESOURCE_TYPE_LIST },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'respawnMs', label: 'Respawn (ms)', type: 'number', step: '1000', optional: true },
  ],
  vendors: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
  ],
  mobSpawns: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'mobType', label: 'Mob', type: 'select', options: MOB_TYPES },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'aggressive', label: 'Aggressive', type: 'select', options: [true, false] },
    { key: 'level', label: 'Level', type: 'number', step: '1', optional: true },
    { key: 'levelVariance', label: 'Level ±', type: 'number', step: '1', optional: true },
  ],
};

const COLORS = {
  bounds: '#2a3944',
  base: '#5fb8ff',
  spawn: '#d8b880',
  obstacle: '#3a3f44',
  resource: '#5ef2c2',
  vendor: '#ffd54f',
  mob: '#ff6b6b',
  selected: '#ffffff',
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function setSaveStatus(message, tone = 'neutral') {
  saveStatusEl.textContent = message;
  saveStatusEl.className = `status compact ${tone}`;
}

function setErrors(errors) {
  errorsEl.textContent = '';
  if (!errors || errors.length === 0) return;
  const list = document.createElement('ul');
  for (const err of errors) {
    const li = document.createElement('li');
    li.textContent = err;
    list.appendChild(li);
  }
  errorsEl.appendChild(list);
}

function setControlsEnabled(enabled) {
  reloadBtn.disabled = !enabled;
  saveBtn.disabled = !enabled;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '';
}

function readPassword() {
  return adminPassword;
}

function savePassword(password) {
  adminPassword = password;
}

async function fetchMapConfig(password) {
  const res = await fetch('/admin/map-config', {
    headers: { 'x-admin-pass': password },
  });
  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.code = 401;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json();
}

async function putMapConfig(password, config) {
  const res = await fetch('/admin/map-config', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-admin-pass': password,
    },
    body: JSON.stringify(config),
  });
  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.code = 401;
    throw err;
  }
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body?.error ?? 'Save failed.');
    err.details = body?.details ?? null;
    throw err;
  }
  return body;
}

function getMetrics() {
  const width = canvas.width;
  const height = canvas.height;
  const mapSize = mapConfig?.mapSize ?? 1;
  const padding = 24;
  const size = Math.max(1, Math.min(width, height) - padding * 2);
  const scale = mapSize > 0 ? size / mapSize : 1;
  return {
    width,
    height,
    mapSize,
    scale,
    cx: width / 2,
    cy: height / 2,
  };
}

function worldToCanvas(pos) {
  const { scale, cx, cy } = getMetrics();
  return {
    x: cx + pos.x * scale,
    y: cy + pos.z * scale,
  };
}

function canvasToWorld(pos) {
  const { scale, cx, cy } = getMetrics();
  let y = 0;
  if (selected && mapConfig) {
    if (selected.type === 'base') {
      y = mapConfig.base?.y ?? 0;
    } else {
      const item = mapConfig[selected.type]?.[selected.index];
      y = item?.y ?? 0;
    }
  }
  return {
    x: (pos.x - cx) / scale,
    y,
    z: (pos.y - cy) / scale,
  };
}

function clampToBounds(pos, radius = 0) {
  if (!mapConfig) return pos;
  const half = mapConfig.mapSize / 2;
  let y = pos.y ?? 0;
  if (
    Number.isFinite(mapConfig.mapYMin) &&
    Number.isFinite(mapConfig.mapYMax)
  ) {
    y = Math.min(mapConfig.mapYMax, Math.max(mapConfig.mapYMin, y));
  }
  return {
    x: Math.min(half - radius, Math.max(-half + radius, pos.x)),
    y,
    z: Math.min(half - radius, Math.max(-half + radius, pos.z)),
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Math.max(320, Math.floor(rect.height));
  renderCanvas();
}

function renderCanvas() {
  if (!mapConfig) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const { width, height, mapSize, scale, cx, cy } = getMetrics();
  ctx.clearRect(0, 0, width, height);

  const boundsSize = mapSize * scale;
  const left = cx - boundsSize / 2;
  const top = cy - boundsSize / 2;

  ctx.strokeStyle = COLORS.bounds;
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, boundsSize, boundsSize);

  const base = mapConfig.base;
  const baseCanvas = worldToCanvas(base);
  ctx.fillStyle = COLORS.base;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(baseCanvas.x, baseCanvas.y, base.radius * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.base;
  ctx.lineWidth = selected?.type === 'base' ? 3 : 2;
  ctx.beginPath();
  ctx.arc(baseCanvas.x, baseCanvas.y, base.radius * scale, 0, Math.PI * 2);
  ctx.stroke();

  mapConfig.obstacles.forEach((obs, index) => {
    const pos = worldToCanvas(obs);
    ctx.fillStyle = COLORS.obstacle;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, obs.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (selected?.type === 'obstacles' && selected.index === index) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, obs.radius * scale + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  mapConfig.spawnPoints.forEach((point, index) => {
    const pos = worldToCanvas(point);
    ctx.strokeStyle = COLORS.spawn;
    ctx.lineWidth = selected?.type === 'spawnPoints' && selected.index === index ? 3 : 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  });

  mapConfig.resourceNodes.forEach((node, index) => {
    const pos = worldToCanvas(node);
    ctx.fillStyle = COLORS.resource;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (selected?.type === 'resourceNodes' && selected.index === index) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x - 6, pos.y - 6, 12, 12);
    }
  });

  mapConfig.vendors.forEach((vendor, index) => {
    const pos = worldToCanvas(vendor);
    ctx.fillStyle = COLORS.vendor;
    ctx.fillRect(pos.x - 6, pos.y - 6, 12, 12);
    if (selected?.type === 'vendors' && selected.index === index) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x - 8, pos.y - 8, 16, 16);
    }
  });

  mapConfig.mobSpawns.forEach((spawn, index) => {
    const pos = worldToCanvas(spawn);
    ctx.strokeStyle = COLORS.mob;
    ctx.lineWidth = selected?.type === 'mobSpawns' && selected.index === index ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pos.x - 6, pos.y - 6);
    ctx.lineTo(pos.x + 6, pos.y + 6);
    ctx.moveTo(pos.x + 6, pos.y - 6);
    ctx.lineTo(pos.x - 6, pos.y + 6);
    ctx.stroke();
  });
}

function renderMapFields() {
  mapFieldsEl.textContent = '';
  const sizeField = buildField({
    label: 'Map Size',
    value: formatNumber(mapConfig.mapSize, 1),
    type: 'number',
    step: '1',
    data: { type: 'map', field: 'mapSize' },
  });
  mapFieldsEl.appendChild(sizeField);
}

function renderBaseFields() {
  baseFieldsEl.textContent = '';
  const fields = [
    {
      label: 'X',
      value: formatNumber(mapConfig.base.x),
      field: 'x',
    },
    {
      label: 'Y',
      value: formatNumber(mapConfig.base.y),
      field: 'y',
    },
    {
      label: 'Z',
      value: formatNumber(mapConfig.base.z),
      field: 'z',
    },
    {
      label: 'Radius',
      value: formatNumber(mapConfig.base.radius, 1),
      field: 'radius',
    },
  ];
  for (const field of fields) {
    const node = buildField({
      label: field.label,
      value: field.value,
      type: 'number',
      step: '0.1',
      data: { type: 'base', field: field.field },
    });
    baseFieldsEl.appendChild(node);
  }
}

function renderLists() {
  for (const [type, container] of Object.entries(listEls)) {
    renderList(container, type, mapConfig[type] ?? [], FIELD_DEFS[type]);
  }
}

function renderList(container, type, items, fields) {
  container.textContent = '';
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.type = type;
    row.dataset.index = String(index);
    if (selected?.type === type && selected.index === index) {
      row.classList.add('selected');
    }

    const header = document.createElement('div');
    header.className = 'row-header';
    const title = document.createElement('div');
    title.className = 'row-title';
    title.textContent = item.id ?? `${type.slice(0, -1)} ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.dataset.action = 'remove';
    remove.dataset.type = type;
    remove.dataset.index = String(index);
    remove.textContent = 'Remove';
    header.append(title, remove);
    row.appendChild(header);

    const fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'row-fields';
    fields.forEach((field) => {
      let value;
      if (field.type === 'number') {
        value = Number.isFinite(item[field.key]) ? formatNumber(item[field.key]) : '';
      } else if (field.type === 'select' && (field.options?.[0] === true || field.options?.[0] === false)) {
        value = item[field.key] === false ? 'false' : 'true';
      } else {
        value = item[field.key] ?? (field.options?.[0] ?? '');
      }
      const fieldNode = buildField({
        label: field.label,
        value,
        type: field.type,
        step: field.step,
        options: field.options,
        data: { type, index, field: field.key },
      });
      fieldsWrap.appendChild(fieldNode);
    });
    row.appendChild(fieldsWrap);
    container.appendChild(row);
  });
}

function buildField({ label, value, type, step, options, data }) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const span = document.createElement('span');
  span.textContent = label;
  let control;
  if (type === 'select' && Array.isArray(options)) {
    control = document.createElement('select');
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = String(opt);
      option.textContent = String(opt);
      if (String(opt) === String(value ?? '')) option.selected = true;
      control.appendChild(option);
    }
    if (!control.value && options[0] !== undefined) control.value = String(options[0]);
  } else {
    control = document.createElement('input');
    control.type = type ?? 'text';
    if (type === 'number') {
      control.step = step ?? '0.1';
    }
    control.value = value ?? '';
  }
  if (data?.type) control.dataset.type = data.type;
  if (data?.index !== undefined) control.dataset.index = String(data.index);
  if (data?.field) control.dataset.field = data.field;
  wrapper.append(span, control);
  return wrapper;
}

function setSelected(next) {
  selected = next;
  renderLists();
  renderCanvas();
}

function ensureSelectedValid() {
  if (!selected) return;
  if (selected.type === 'base') return;
  const list = mapConfig?.[selected.type];
  if (!Array.isArray(list) || selected.index < 0 || selected.index >= list.length) {
    selected = null;
  }
}

function getNextId(list, prefix) {
  let i = 1;
  const ids = new Set(list.map((item) => String(item.id)));
  while (ids.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

function addItem(type) {
  if (!mapConfig) return;
  const base = mapConfig.base;
  const offset = (base?.radius ?? 6) + 4;
  const list = mapConfig[type];
  if (!Array.isArray(list)) return;
  let item = null;
  if (type === 'spawnPoints') {
    item = { x: base.x + offset, y: base.y ?? 0, z: base.z };
  } else if (type === 'obstacles') {
    item = { x: base.x + offset + 6, y: base.y ?? 0, z: base.z, radius: 6 };
  } else if (type === 'resourceNodes') {
    item = {
      id: getNextId(list, 'r'),
      type: RESOURCE_TYPE_LIST[0] ?? 'crystal',
      x: base.x + offset + 10,
      y: base.y ?? 0,
      z: base.z,
    };
  } else if (type === 'vendors') {
    item = {
      id: getNextId(list, 'vendor-'),
      name: 'Vendor',
      x: base.x + offset,
      y: base.y ?? 0,
      z: base.z - 2,
    };
  } else if (type === 'mobSpawns') {
    item = {
      id: getNextId(list, 'm'),
      mobType: MOB_TYPES[0] ?? 'orc',
      x: base.x + offset + 16,
      y: base.y ?? 0,
      z: base.z,
    };
  }
  if (!item) return;

  if (item.radius) {
    const pos = clampToBounds(item, item.radius);
    item.x = pos.x;
    item.y = pos.y ?? 0;
    item.z = pos.z;
  } else {
    const pos = clampToBounds(item, 0);
    item.x = pos.x;
    item.y = pos.y ?? 0;
    item.z = pos.z;
  }

  list.push(item);
  setSelected({ type, index: list.length - 1 });
  setSaveStatus('Unsaved changes', 'warning');
}

function removeItem(type, index) {
  if (!mapConfig) return;
  const list = mapConfig[type];
  if (!Array.isArray(list)) return;
  list.splice(index, 1);
  ensureSelectedValid();
  renderLists();
  renderCanvas();
  setSaveStatus('Unsaved changes', 'warning');
}

function updateField({ type, index, field, value }) {
  if (!mapConfig) return;
  if (type === 'map') {
    mapConfig.mapSize = value;
  } else if (type === 'base') {
    mapConfig.base[field] = value;
  } else {
    const list = mapConfig[type];
    if (!Array.isArray(list) || !list[index]) return;
    list[index][field] = value;
  }
  renderCanvas();
  setSaveStatus('Unsaved changes', 'warning');
}

function findHit(pos) {
  if (!mapConfig) return null;
  const hits = [];
  const pushHit = (type, index, dist) => {
    hits.push({ type, index, dist });
  };

  const base = mapConfig.base;
  if (base) {
    const baseCanvas = worldToCanvas(base);
    const dist = Math.hypot(pos.x - baseCanvas.x, pos.y - baseCanvas.y);
    const radiusPx = base.radius * getMetrics().scale + 8;
    if (dist <= radiusPx) {
      pushHit('base', 0, dist);
    }
  }

  mapConfig.obstacles.forEach((obs, index) => {
    const c = worldToCanvas(obs);
    const dist = Math.hypot(pos.x - c.x, pos.y - c.y);
    const radiusPx = obs.radius * getMetrics().scale + 6;
    if (dist <= radiusPx) {
      pushHit('obstacles', index, dist);
    }
  });

  const pointHit = (type, list, radius) => {
    list.forEach((item, index) => {
      const c = worldToCanvas(item);
      const dist = Math.hypot(pos.x - c.x, pos.y - c.y);
      if (dist <= radius) {
        pushHit(type, index, dist);
      }
    });
  };

  pointHit('spawnPoints', mapConfig.spawnPoints, 10);
  pointHit('resourceNodes', mapConfig.resourceNodes, 10);
  pointHit('vendors', mapConfig.vendors, 10);
  pointHit('mobSpawns', mapConfig.mobSpawns, 10);

  if (!hits.length) return null;
  hits.sort((a, b) => a.dist - b.dist);
  return hits[0];
}

function updateSelectedPosition(worldPos) {
  if (!selected || !mapConfig) return;
  if (selected.type === 'base') {
    const base = mapConfig.base;
    const clamped = clampToBounds(worldPos, base.radius);
    base.x = clamped.x;
    base.y = clamped.y ?? 0;
    base.z = clamped.z;
    return;
  }
  const list = mapConfig[selected.type];
  if (!Array.isArray(list)) return;
  const item = list[selected.index];
  if (!item) return;
  const radius = selected.type === 'obstacles' ? item.radius : 0;
  const clamped = clampToBounds(worldPos, radius);
  item.x = clamped.x;
  item.y = clamped.y ?? 0;
  item.z = clamped.z;
}

canvas.addEventListener('mousedown', (event) => {
  if (!mapConfig) return;
  const rect = canvas.getBoundingClientRect();
  const pos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const hit = findHit(pos);
  if (hit) {
    dragging = true;
    setSelected({ type: hit.type, index: hit.index });
  }
});

window.addEventListener('mousemove', (event) => {
  if (!dragging || !mapConfig) return;
  const rect = canvas.getBoundingClientRect();
  const pos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const worldPos = canvasToWorld(pos);
  updateSelectedPosition(worldPos);
  renderCanvas();
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  renderLists();
  setSaveStatus('Unsaved changes', 'warning');
});

function handleFieldChange(event) {
  const target = event.target;
  const isInput = target instanceof HTMLInputElement;
  const isSelect = target instanceof HTMLSelectElement;
  if (!isInput && !isSelect) return;
  const type = target.dataset.type;
  const field = target.dataset.field;
  if (!type || !field) return;
  if (type === 'map') {
    const value = Number.parseFloat(target.value);
    if (!Number.isFinite(value)) return;
    updateField({ type, field, value });
    renderMapFields();
    return;
  }

  if (type === 'base') {
    const value = Number.parseFloat(target.value);
    if (!Number.isFinite(value)) return;
    updateField({ type, field, value });
    renderBaseFields();
    return;
  }

  const index = Number.parseInt(target.dataset.index ?? '', 10);
  if (!Number.isFinite(index)) return;

  const isNumber = isInput && target.type === 'number';
  let value;
  if (isNumber) {
    const parsed = Number.parseFloat(target.value);
    value = Number.isFinite(parsed) ? parsed : undefined;
  } else if (isSelect && field === 'aggressive') {
    value = target.value === 'true';
  } else {
    value = target.value;
  }
  updateField({ type, index, field, value });
}

sidebar.addEventListener('input', handleFieldChange);
sidebar.addEventListener('change', handleFieldChange);

sidebar.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const type = target.dataset.type;
  if (action === 'toggle') {
    const section = target.closest('.section');
    if (section) {
      section.classList.toggle('collapsed');
      updateToggleLabels();
    }
    return;
  }
  if (action === 'add' && type) {
    addItem(type);
    return;
  }
  if (action === 'remove' && type) {
    const index = Number.parseInt(target.dataset.index ?? '', 10);
    if (Number.isFinite(index)) {
      removeItem(type, index);
    }
    return;
  }

  const row = target.closest('.row');
  if (row && row.dataset.type) {
    const index = Number.parseInt(row.dataset.index ?? '', 10);
    if (Number.isFinite(index)) {
      setSelected({ type: row.dataset.type, index });
    }
  }
});

function updateToggleLabels() {
  const toggles = sidebar.querySelectorAll('.toggle');
  toggles.forEach((button) => {
    const section = button.closest('.section');
    if (!section) return;
    button.textContent = section.classList.contains('collapsed')
      ? 'Expand'
      : 'Collapse';
  });
}

reloadBtn.addEventListener('click', async () => {
  const password = readPassword();
  if (!password) return;
  try {
    const config = await fetchMapConfig(password);
    mapConfig = config;
    selected = null;
    renderAll();
    setSaveStatus('Reloaded map config.', 'ok');
    setErrors(null);
  } catch (err) {
    setSaveStatus('Reload failed.', 'error');
    setErrors([err.message]);
  }
});

saveBtn.addEventListener('click', async () => {
  const password = readPassword();
  if (!password || !mapConfig) return;
  try {
    const result = await putMapConfig(password, mapConfig);
    mapConfig = result.config ?? mapConfig;
    renderAll();
    setSaveStatus('Saved successfully. Restart server to apply.', 'ok');
    setErrors(null);
  } catch (err) {
    setSaveStatus('Save failed.', 'error');
    setErrors(err.details ?? [err.message]);
  }
});

function renderAll() {
  if (!mapConfig) return;
  updateToggleLabels();
  renderMapFields();
  renderBaseFields();
  renderLists();
  renderCanvas();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = passInput.value.trim();
  if (!password) return;
  savePassword(password);
  setStatus('Status: connecting...', 'neutral');

  try {
    mapConfig = await fetchMapConfig(password);
    setStatus('Status: connected', 'ok');
    setSaveStatus('Loaded map config.', 'ok');
    setErrors(null);
    setControlsEnabled(true);
    renderAll();
  } catch (err) {
    if (err.code === 401) {
      setStatus('Status: invalid password', 'error');
      setControlsEnabled(false);
      return;
    }
    setStatus('Status: offline', 'error');
    setControlsEnabled(false);
  }
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
