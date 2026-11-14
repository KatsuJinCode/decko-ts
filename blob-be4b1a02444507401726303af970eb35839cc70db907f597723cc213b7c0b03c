// navigation-guard.test.mjs — a check's own navigation must not race the
// page's, and only that failure is retried.
//
// THE DEFECT THIS PINS. The whole-family run at the tranche-3 tip recorded
// on the role-plus-right module's C20 leg:
//
//     page.goto: Navigation to
//     "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y" is interrupted by
//     another navigation to
//     "https://127.0.0.1:52420/HarnessC20Cardmvl24x0y+*right+mvl24x0y"
//
// The create the check submitted answers with a redirect to the card it
// created, the browser follows it, and the check's own read of the host card
// collided with it. A crash there is not a verdict about the surface.
//
// No browser, no network.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/navigation-guard.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { gotoWithoutNavigationRace, isNavigationRace } from "../lib/navigation-guard.mjs";

const raceMessage = (to, other) => `page.goto: Navigation to "${to}" is interrupted by another navigation to "${other}"`;

/** A page whose navigations fail the given number of times with the race. */
const racingPage = (failures) => {
  const calls = [];
  let remaining = failures;
  return {
    calls,
    waitForTimeout: async (ms) => { calls.push({ waited: ms }); },
    goto: async (url) => {
      calls.push({ url });
      if (remaining > 0) {
        remaining -= 1;
        throw new Error(raceMessage(url, "https://127.0.0.1/other"));
      }
      return { status: 200, url };
    },
  };
};

test("a navigation the page interrupted is retried and then succeeds", async () => {
  const page = racingPage(1);
  const response = await gotoWithoutNavigationRace(page, "https://127.0.0.1/host", { settleMs: 250 });
  assert.equal(response.status, 200);
  assert.equal(page.calls.filter((call) => call.url).length, 2, "the navigation is tried twice");
  assert.deepEqual(page.calls.filter((call) => call.waited), [{ waited: 250 }], "the page settles between the attempts");
});

test("a navigation that fails for any other reason is not retried", async () => {
  let attempts = 0;
  const page = {
    waitForTimeout: async () => undefined,
    goto: async () => {
      attempts += 1;
      throw new Error("page.goto: net::ERR_CONNECTION_REFUSED");
    },
  };
  await assert.rejects(() => gotoWithoutNavigationRace(page, "https://127.0.0.1/host"), /ERR_CONNECTION_REFUSED/);
  assert.equal(attempts, 1, "a real failure is the check's to report, not to retry");
});

test("a navigation that keeps losing the race is reported after the attempts", async () => {
  const page = racingPage(99);
  await assert.rejects(() => gotoWithoutNavigationRace(page, "https://127.0.0.1/host", { attempts: 3, settleMs: 10 }), /interrupted by another navigation/);
  assert.equal(page.calls.filter((call) => call.url).length, 3, "the attempts are bounded");
});

test("the race is recognised by its own words and nothing else", () => {
  assert.equal(isNavigationRace(new Error(raceMessage("a", "b"))), true);
  assert.equal(isNavigationRace(new Error("net::ERR_ABORTED")), false);
  assert.equal(isNavigationRace(undefined), false);
  assert.equal(isNavigationRace(null), false);
});
