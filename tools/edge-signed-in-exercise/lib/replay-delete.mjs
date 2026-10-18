/** Complete the delete action before the next recorded owner navigation. */
export async function replayDelete({ page, name, origin, responseBodyFallback = () => '' }) {
  const observed = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === new URL(origin).origin &&
      decodeURIComponent(url.pathname) === `/delete/${name}`;
  }, { timeout: 20_000 }).then(response => ({ response }), error => ({ error }));
  const clicked = await page.evaluate(target => {
    const link = [...document.querySelectorAll("a[href^='/delete/']")]
      .find(node => node.getAttribute('href')?.startsWith(target));
    if (!link) return false;
    link.click();
    return true;
  }, `/delete/${name}`);
  if (!clicked) throw new Error('Delete link missing');
  const { response, error } = await observed;
  if (error) throw error;
  if (response.status() >= 400) throw new Error(`Delete answered ${response.status()}`);
  // Chromium can discard the XHR body when its redirect replaces the document.
  const body = await response.text().catch(() => '') || responseBodyFallback();
  let redirect;
  try { redirect = JSON.parse(body).redirect; } catch { /* HTML confirmation. */ }
  if (typeof redirect === 'string') {
    const target = new URL(redirect, origin);
    if (target.origin !== new URL(origin).origin) throw new Error('Delete redirected outside the owned origin');
    await page.waitForURL(target.href, { waitUntil: 'load', timeout: 20_000 });
  } else {
    await page.waitForFunction(target => [...document.querySelectorAll('.just_deleted-view')]
      .some(node => (node.getAttribute('data-card-name') ?? '').replaceAll('_', ' ') === target.replaceAll('_', ' ')),
    name, { timeout: 5_000 });
  }
}
