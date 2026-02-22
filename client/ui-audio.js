// @ts-check

const UI_AUDIO_ENABLED_KEY = 'mmorpg_ui_audio_enabled';

/**
 * @param {string} type
 */
function toneProfile(type) {
  switch (type) {
    case 'success':
      return [
        { frequency: 660, duration: 0.05, gain: 0.03 },
        { frequency: 880, duration: 0.07, gain: 0.035 },
      ];
    case 'error':
      return [
        { frequency: 280, duration: 0.08, gain: 0.04 },
        { frequency: 210, duration: 0.1, gain: 0.04 },
      ];
    case 'enter_world':
      return [
        { frequency: 520, duration: 0.06, gain: 0.032 },
        { frequency: 700, duration: 0.07, gain: 0.034 },
        { frequency: 920, duration: 0.09, gain: 0.036 },
      ];
    case 'confirm':
    default:
      return [{ frequency: 520, duration: 0.05, gain: 0.03 }];
  }
}

/**
 * @param {{ enabledByDefault?: boolean }} [options]
 */
export function createUiAudio({ enabledByDefault = true } = {}) {
  let enabled = enabledByDefault;
  try {
    const stored = localStorage.getItem(UI_AUDIO_ENABLED_KEY);
    if (stored === '0') enabled = false;
    if (stored === '1') enabled = true;
  } catch {
    // ignore localStorage errors
  }

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let /** @type {AudioContext | null} */ ctx = null;

  function ensureContext() {
    if (ctx || typeof window === 'undefined') return ctx;
    const maybeWindow = /** @type {any} */ (window);
    const AudioContextCtor = maybeWindow.AudioContext || maybeWindow.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      ctx = new AudioContextCtor();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function setEnabled(/** @type {boolean} */ next) {
    enabled = !!next;
    try {
      localStorage.setItem(UI_AUDIO_ENABLED_KEY, enabled ? '1' : '0');
    } catch {
      // ignore localStorage errors
    }
  }

  function play(type = 'confirm') {
    if (!enabled || reduceMotion) return;
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime;
    let offset = 0;
    for (const tone of toneProfile(type)) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type === 'error' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(tone.frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(tone.gain, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + tone.duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now + offset);
      osc.stop(now + offset + tone.duration + 0.01);
      offset += tone.duration * 0.65;
    }
  }

  return {
    play,
    setEnabled,
    isEnabled: () => enabled,
  };
}
