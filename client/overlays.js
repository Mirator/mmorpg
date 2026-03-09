// @ts-check

/**
 * Utilities for onboarding and overlay behavior.
 *
 * @param {{
 *   showEntryBanner: (opts: { title: string; subtitle: string }) => void;
 *   hideEntryBanner: () => void;
 *   showControlsCard: () => void;
 *   hideControlsCard: () => void;
   *   overlayEl: HTMLElement | null;
 * }} deps
 */
export function createOverlays({ showEntryBanner, hideEntryBanner, showControlsCard, hideControlsCard, overlayEl }) {
  function dismissOnboardingHints() {
    hideEntryBanner();
    hideControlsCard();
  }

  /**
   * Show entry overlay when a character session starts.
   *
   * @param {any} character
   * @param {any} klass
   */
  function showCharacterEntry(character, klass) {
    showEntryBanner({
      title: character?.name ?? 'Adventurer',
      subtitle: `${klass?.name ?? character?.classId ?? 'Class'} · Ready for battle`,
    });
    showControlsCard();
  }

  function showGuestEntry() {
    showEntryBanner({
      title: 'Guest Adventurer',
      subtitle: 'Fighter · Ready for battle',
    });
    showControlsCard();
  }

  if (overlayEl) {
    overlayEl.addEventListener('mouseenter', () => {
      overlayEl.classList.add('hovered');
    });
    overlayEl.addEventListener('mouseleave', () => {
      overlayEl.classList.remove('hovered');
    });
  }

  return {
    dismissOnboardingHints,
    showCharacterEntry,
    showGuestEntry,
  };
}

