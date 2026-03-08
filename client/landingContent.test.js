import { describe, expect, it } from 'vitest';
import {
  MENU_DEFAULT_SETTINGS,
  getDefaultRealmId,
  loadMenuSceneSettings,
  loadSelectedRealmId,
  saveMenuSceneSettings,
  saveSelectedRealmId,
} from './landingContent.js';

describe('landing content helpers', () => {
  it('falls back to the default realm when storage is missing or invalid', () => {
    const storage = {
      getItem: () => 'missing-realm',
      setItem: () => {},
    };
    expect(loadSelectedRealmId(storage)).toBe(getDefaultRealmId());
    expect(saveSelectedRealmId('missing-realm', storage)).toBe(getDefaultRealmId());
  });

  it('normalizes menu scene settings from storage and on save', () => {
    const writes = [];
    const storage = {
      getItem: () => JSON.stringify({ motionEnabled: false, parallaxEnabled: true, lushFoliage: false }),
      setItem: (key, value) => writes.push([key, value]),
    };
    expect(loadMenuSceneSettings(storage)).toEqual({
      motionEnabled: false,
      parallaxEnabled: true,
      lushFoliage: false,
    });
    expect(saveMenuSceneSettings({}, storage)).toEqual(MENU_DEFAULT_SETTINGS);
    expect(MENU_DEFAULT_SETTINGS.parallaxEnabled).toBe(false);
    expect(writes).toHaveLength(1);
  });
});
