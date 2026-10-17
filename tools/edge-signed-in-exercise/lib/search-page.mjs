// Judge the rendered search surface, not words in scripts or result content.
// The separate cql-navbox instrument verifies query semantics with positive
// and negative result controls; this check verifies the legacy route's page.
export function searchPagePasses({status, searchRoot, errorViews}) {
  return status === 200 && searchRoot === true && Array.isArray(errorViews) && errorViews.length === 0;
}

export async function searchPageJourney({stack, page, record, captureEvidence}) {
  if (!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname)) throw Error('search page check requires the disposable loopback fixture');
  const query = 'type="RichText"';
  const response = await page.goto(`${stack.origin}/*search?query%5Bquery%5D=${encodeURIComponent(query)}`, {waitUntil:'load'});
  const surface = await page.evaluate(() => {
    const main = document.querySelector('#main');
    const errors = '.server_error-view, .not_found-view, .denial-view, .errors-view, .error-view';
    return {
      searchRoot: Boolean(main && (main.matches('.card-slot[data-card-name="*search"]') || main.querySelector('.card-slot[data-card-name="*search"]'))),
      errorViews: main ? [...main.querySelectorAll(errors)].map(el=>el.className) : ['missing main'],
    };
  });
  const evidence = {status:response?.status() ?? null, ...surface, query, url:page.url(),
    raw:captureEvidence(await page.content(), {check:'cql-search-page',query})};
  record('legacy search route renders the search card without an error page', searchPagePasses(evidence), evidence);
}
