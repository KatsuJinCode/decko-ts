const RENDER_KEYS = new Set([
  'DECKO_LIVE_RENDER', 'DECKO_LIVE_KEEP', 'DECKO_EDGE_CACHE',
  'DECKO_EDGE_CACHE_TTL', 'DECKO_EDGE_CACHE_EPOCH',
  'DECKO_EDGE_RENDER_BUDGET_MS', 'DECKO_EDGE_PIPELINE_TIMEOUT_MS',
  'DECKO_EDGE_DECK_PROFILE', 'DECKO_FONT_AWESOME', 'DECKO_AJAX_SAVE_REDIRECT',
  'DECKO_SERVED_ALL_CARD_ID', 'DECKO_SERVED_ASSET_HOST', 'DECKO_SERVED_DELTAS',
  'DECKO_SERVED_FAVICON_URL', 'DECKO_SERVED_FOOTER_CARD_ID', 'DECKO_SERVED_FOOTER_TYPE_ID',
  'DECKO_SERVED_FOOTER_TYPE_NAME', 'DECKO_SERVED_FOOTER_VERSION_PIN', 'DECKO_SERVED_HEAD_SCRIPTS',
  'DECKO_SERVED_LAYOUT_POINTER_ID', 'DECKO_SERVED_LOGO_URL', 'DECKO_SERVED_MAIN_CSS_URL',
  'DECKO_SERVED_MAIN_JS_URL', 'DECKO_SERVED_NOT_FOUND_TYPE_CLASS_TOKEN',
  'DECKO_SERVED_NOT_FOUND_TYPE_ID', 'DECKO_SERVED_NOT_FOUND_TYPE_NAME',
  'DECKO_SERVED_PHANTOM_TYPE_ID', 'DECKO_SERVED_PHANTOM_TYPE_KEY', 'DECKO_SERVED_PHANTOM_TYPE_NAME',
  'DECKO_SERVED_POINTER_TYPE_ID', 'DECKO_SERVED_SCRIPT_INTEGRITY', 'DECKO_SERVED_SITE_TITLE_DEFAULT',
  'DECKO_SERVED_STYLESHEET_FROM', 'DECKO_SERVED_STYLESHEET_TO',
]);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function localEnv({ live, dbUrl, origin }) {
  for (const value of [dbUrl, origin]) {
    const url = new URL(value);
    if (!LOCAL_HOSTS.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('local exercise requires loopback database and origin');
  }
  const render = Object.fromEntries(Object.entries(live).filter(([key]) => RENDER_KEYS.has(key)));
  return { ...render, DECKO_DB_URL: dbUrl, DECKO_DB_TOKEN: 'local-only-not-a-credential',
    DECKO_TRUSTED_ORIGINS: origin, DECKO_ORIGIN: origin, DECKO_DECK_ORIGIN: origin, DECKO_SERVED_ROOT_URL: origin,
    DECKO_WRITE_PATH: '1', DECKO_FONT_AWESOME: 'local' };
}

export function externalBrowserRequestAllowed(request, { origin, allowedHosts, allowedFaviconUrls = [] }) {
  const url = new URL(request.url());
  if (LOCAL_HOSTS.has(url.hostname)) return url.origin === origin;
  if (request.resourceType() === 'other') {
    // Chromium reports browser-initiated favicon reads as `other`. Admit only
    // an explicitly named resource, from our own page, without opening the
    // generic other/fetch/navigation boundary.
    if (request.method() !== 'GET' || request.isNavigationRequest?.() !== false || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !allowedHosts.has(url.hostname) || !allowedFaviconUrls.includes(url.href)) return false;
    try { return new URL(request.frame().url()).origin === origin; } catch { return false; }
  }
  return allowedHosts.has(url.hostname) && ['GET', 'HEAD'].includes(request.method()) &&
    ['script', 'stylesheet', 'image', 'font', 'media'].includes(request.resourceType());
}

export function verifiedCapabilities(capabilities, results) {
  return capabilities.map(capability => {
    if (['disabled_upstream', 'out_of_scope'].includes(capability.status)) return { ...capability };
    const names = capability.checks ?? (typeof capability.check === 'string' ? [capability.check] : []);
    const passed = names.filter(name => {
      const matches = results.filter(result => result.check === name);
      return matches.length > 0 && matches.every(result => result.pass === true);
    });
    const complete = names.length > 0 && passed.length === names.length;
    const status = complete && capability.status !== 'partial' ? 'covered' : passed.length > 0 ? 'partial' : 'not_covered';
    return { ...capability, status, verifiedChecks: passed };
  });
}
