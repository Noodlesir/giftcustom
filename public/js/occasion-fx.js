(() => {
  'use strict';

  // This file intentionally does almost nothing. The occasion living
  // background is driven entirely by CSS reacting to the existing
  // body[data-occasion] attribute that main.js already sets on every
  // occasion selection (see applyOccasionTheme in main.js) — no
  // particle-spawning loop needed. The one thing CSS attribute selectors
  // can't see on their own is "the confirmation screen is now showing,"
  // so a single lightweight MutationObserver handles just that.
  const confirmScreen = document.getElementById('screen-confirm');
  const fx = document.getElementById('occasionFx');
  if (!confirmScreen || !fx) return;

  const syncCelebration = () => {
    fx.classList.toggle('is-celebrating', confirmScreen.classList.contains('is-active'));
  };

  syncCelebration();
  new MutationObserver(syncCelebration).observe(confirmScreen, {
    attributes: true,
    attributeFilter: ['class'],
  });
})();
