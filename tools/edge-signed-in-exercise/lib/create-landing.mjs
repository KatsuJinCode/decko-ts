/** The direct create form redirects before the next recorded navigation. */
export async function waitForCreatedCardLanding(page, origin, name) {
  await page.waitForURL(url => url.origin === new URL(origin).origin &&
    decodeURIComponent(url.pathname).replaceAll('_', ' ') === `/${name}`.replaceAll('_', ' '),
  { waitUntil: 'load', timeout: 20_000 });
}
