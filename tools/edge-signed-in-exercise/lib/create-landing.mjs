/** The direct create form redirects before the next recorded navigation. */
export async function waitForCreatedCardLanding(page, origin, name) {
  // The unknown-card form already has the future card's URL. Matching that
  // URL alone returns immediately against the OLD document. Arm before submit.
  await page.waitForEvent('framenavigated', { predicate: frame => {
    if (frame !== page.mainFrame()) return false;
    const url = new URL(frame.url());
    return url.origin === new URL(origin).origin &&
      decodeURIComponent(url.pathname).replaceAll('_', ' ') === `/${name}`.replaceAll('_', ' ');
  }, timeout: 20_000 });
  await page.waitForLoadState('load', { timeout: 20_000 });
}
