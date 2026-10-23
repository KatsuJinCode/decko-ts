// navigation-guard.mjs — a check's own navigation must not race the page's.
//
// THE DEFECT. The browser follows a redirect on its own, and a check that
// navigates while that redirect is still in flight has its navigation
// aborted by Playwright: "Navigation to X is interrupted by another
// navigation to Y". The check then reports a crash where the surface it
// grades was never wrong.
//
// MEASURED. The whole-family run at the tranche-3 tip recorded exactly that
// on the role-plus-right module's C20 leg:
//
//     page.goto: Navigation to
//     "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y" is interrupted by
//     another navigation to
//     "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y+*right+mvl24x0y"
//
// The create the check submitted answers with a redirect to the card it
// created, the browser follows it, and the check's own read of the host card
// collided with it.
//
// THE RULE. A navigation interrupted by the page's own navigation is retried,
// a bounded number of times, with the page's own settle time between the
// attempts. A navigation that fails for any other reason is NOT retried: that
// failure is the check's to report, and retrying it would hide a real
// defect behind a retry.

/** True when the error is the page's own navigation interrupting the check's. */
export function isNavigationRace(error) {
  return /interrupted by another navigation/i.test(String(error?.message ?? error ?? ""));
}

/**
 * Navigates, retrying only the navigation the page interrupted.
 *
 * @param {{ goto: (url: string, options?: object) => Promise<any>, waitForTimeout: (ms: number) => Promise<any> }} page
 * @param {string} url
 * @param {{ attempts?: number, settleMs?: number, options?: object }} opts
 */
export async function gotoWithoutNavigationRace(page, url, { attempts = 3, settleMs = 1000, options = {} } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      if (!isNavigationRace(error)) throw error;
      lastError = error;
      await page.waitForTimeout(settleMs);
    }
  }
  throw lastError;
}
