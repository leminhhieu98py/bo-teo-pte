// Runs in <head> before the page paints, so a bought theme never flashes the default colors.
// The theme id is cached in localStorage by ui/theme-sync.js (the wallet in the Sheet is the truth).
(function () {
  try {
    var id = window.localStorage.getItem('bo-theme');
    if (id && id !== 'lavender') document.documentElement.setAttribute('data-theme', id);
  } catch (e) {
    // No localStorage: theme-sync applies the theme a moment later.
  }
})();
