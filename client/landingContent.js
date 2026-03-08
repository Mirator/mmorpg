// @ts-check

export const LANDING_STORAGE_KEYS = {
  selectedRealmId: 'rising-ages-menu-realm',
  sceneSettings: 'rising-ages-menu-scene-settings',
};

export const MENU_DEFAULT_SETTINGS = {
  motionEnabled: true,
  parallaxEnabled: true,
  lushFoliage: true,
};

export const LANDING_CONTENT = {
  gameTitle: 'Rising Ages',
  subtitle: 'Gather beneath the elder boughs and begin anew.',
  authSubtitle: '',
  characterSubtitle: '',
  createSubtitle: '',
  locales: [
    { id: 'en', label: 'English' },
  ],
  forgotPasswordHref: '',
  privacyHref: '',
  feedbackHref: '',
  versionLabel: 'Prototype 0.1.0',
  copyright: 'Copyright 2026 Rising Ages. All rights reserved.',
  navigation: [
    { id: 'plan', label: "What's the plan?" },
    { id: 'create-account', label: 'Create Account' },
    { id: 'settings', label: 'Settings' },
    { id: 'language', label: 'Language' },
    { id: 'credits', label: 'Credits' },
    { id: 'feedback', label: 'Give Feedback' },
    { id: 'exit', label: 'Exit Game' },
  ],
  realms: [
    {
      id: 'hearthlight-hollow',
      name: 'Hearthlight Hollow',
      region: 'EU Story Realm',
      population: 'Quiet embers',
      status: 'Online',
      state: 'online',
      enabled: true,
      blurb: 'A calm shard with gentle traffic, ideal for lingering near the lantern bridge.',
    },
    {
      id: 'bramblegate-watch',
      name: 'Bramblegate Watch',
      region: 'Regional Mirror',
      population: 'Coming soon',
      status: 'Dormant',
      state: 'coming-soon',
      enabled: false,
      blurb: 'A second watchfire is planned, but the trail is still being marked.',
    },
    {
      id: 'moonpool-canopy',
      name: 'Moonpool Canopy',
      region: 'Event Realm',
      population: 'Seasonal',
      status: 'Locked',
      state: 'locked',
      enabled: false,
      blurb: 'Reserved for future festival runs and special chapter releases.',
    },
  ],
  news: [
    {
      id: 'lantern-roadmap',
      kicker: 'Featured Chronicle',
      title: 'The lantern road opens toward contracts, crafting, and party hunts.',
      body:
        'This month focuses on making the first village loop feel fuller: clearer tutorial beats, sturdier party play, and a softer on-ramp into gathering work.',
      stamp: 'Roadmap note',
      featured: true,
    },
    {
      id: 'hearth-wardens',
      kicker: 'World Notice',
      title: 'Hearth Wardens are patrolling the shrine path tonight.',
      body:
        'Expect a calmer starting route while we retune target clarity, ability readability, and welcome flow pacing.',
      stamp: 'Tonight',
      featured: false,
    },
    {
      id: 'patch-quiet-rain',
      kicker: 'Patch Draft',
      title: 'Quiet Rain update improves village buildings and menu comfort.',
      body:
        'Recent work raised roof polish, tightened doorway framing, and continued the fantasy UI refresh across the early-game experience.',
      stamp: 'Patch draft',
      featured: false,
    },
  ],
  community: [
    {
      id: 'letters',
      label: 'Letters Board',
      meta: 'Community hub not configured yet',
      href: '',
    },
    {
      id: 'patches',
      label: 'Patch Notes',
      meta: 'Publishing flow still offline',
      href: '',
    },
    {
      id: 'website',
      label: 'World Website',
      meta: 'Site link awaiting release',
      href: '',
    },
    {
      id: 'steam',
      label: 'Steam Community',
      meta: 'Community page coming later',
      href: '',
    },
  ],
  credits: {
    summary:
      'Rising Ages is an original in-repo prototype UI composition built to evoke a hand-painted forest shrine without copying any live title screen.',
    details: [
      'Storybook scene layers and panel ornamentation are authored in HTML/CSS for this client.',
      'Gameplay UI icon attribution is preserved in the credits list below.',
    ],
  },
};

export function getDefaultRealmId() {
  return LANDING_CONTENT.realms.find((realm) => realm.enabled)?.id ?? LANDING_CONTENT.realms[0]?.id ?? 'realm';
}

/**
 * @param {string} realmId
 */
export function getRealmById(realmId) {
  return LANDING_CONTENT.realms.find((realm) => realm.id === realmId) ?? null;
}

/**
 * @param {string} realmId
 */
export function resolveRealmId(realmId) {
  return getRealmById(realmId)?.id ?? getDefaultRealmId();
}

export function loadSelectedRealmId(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem?.(LANDING_STORAGE_KEYS.selectedRealmId) ?? '';
    return resolveRealmId(stored);
  } catch {
    return getDefaultRealmId();
  }
}

/**
 * @param {string} realmId
 * @param {{ setItem?: (key: string, value: string) => void } | Storage | undefined} [storage]
 */
export function saveSelectedRealmId(realmId, storage = globalThis.localStorage) {
  const nextId = resolveRealmId(realmId);
  try {
    storage?.setItem?.(LANDING_STORAGE_KEYS.selectedRealmId, nextId);
  } catch {
    /* ignore storage failures */
  }
  return nextId;
}

export function loadMenuSceneSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(LANDING_STORAGE_KEYS.sceneSettings);
    if (!raw) return { ...MENU_DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      motionEnabled: parsed?.motionEnabled !== false,
      parallaxEnabled: parsed?.parallaxEnabled === true,
      lushFoliage: parsed?.lushFoliage !== false,
    };
  } catch {
    return { ...MENU_DEFAULT_SETTINGS };
  }
}

/**
 * @param {{ motionEnabled?: boolean, parallaxEnabled?: boolean, lushFoliage?: boolean }} settings
 * @param {{ setItem?: (key: string, value: string) => void } | Storage | undefined} [storage]
 */
export function saveMenuSceneSettings(settings, storage = globalThis.localStorage) {
  const normalized = {
    motionEnabled: settings?.motionEnabled !== false,
    parallaxEnabled: settings?.parallaxEnabled === true,
    lushFoliage: settings?.lushFoliage !== false,
  };
  try {
    storage?.setItem?.(LANDING_STORAGE_KEYS.sceneSettings, JSON.stringify(normalized));
  } catch {
    /* ignore storage failures */
  }
  return normalized;
}
