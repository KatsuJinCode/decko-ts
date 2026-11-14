// page-render-subresources.test.mjs — the instrument for the highest-traffic
// failing action in the page-render flow: a signed-in page opens and every
// subresource the rendered page asks for is delivered. See
// lib/page-render-subresources.mjs for what action this pins, what was red,
// and what this cannot close.
//
// TWO LEGS:
//   1. The judge (always runs). Pure assertions on the attribution rules and
//      the two verdicts, so a green verdict means the rule says what it
//      claims.
//   2. The live measurement (runs when DECKO_INSTRUMENT_LIVE=1). Boots the
//      local edge stack on its OWN deck copy under this repository's tmp/,
//      serves the already-built deploy/dist bundle, signs a disposable admin
//      in, and renders the signed-in home page TWICE in the same browser
//      build: once inside this harness's own request policy (the instrument
//      under observation) and once in a browser with no request interception
//      at all (what a person would actually get). Both renders are recorded
//      request by request, with the resource type and the outcome of each.
//
// It never rebuilds the bundle or the engine dist: other lanes share those
// paths, and an instrument that overwrites another lane's artifact is not an
// instrument. It copies an existing deck; it never writes another lane's
// deck. It writes nothing to the deployment.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/page-render-subresources.test.mjs
//   set DECKO_INSTRUMENT_LIVE=1 && node --test tools/edge-signed-in-exercise/test/page-render-subresources.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  RENDER_BLOCKING_TYPES,
  HARNESS_ABORT_ERROR,
  classifyRequestOutcome,
  renderBlockingRequests,
  pageRenderComplete,
  pageRenderViolations,
  summarisePageRender,
  externalReferencesFrom,
  harnessCheckVerdict,
  harnessCheckViolations,
} from "../lib/page-render-subresources.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const SECRETS = "C:/localProjects/brandonDojoTech/library/data/secrets.env";

// The deck URL and host the live measurement runs against. assetHosts holds
// only DECKO_SERVED_* hosts (the stock layout CDNs are not among them), which
// is why a kit.fontawesome.com failure reads as third-party.
const ASSET_HOST = "culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com";
const CTX = { origin: "https://127.0.0.1:62200", assetHosts: [ASSET_HOST] };

// The exact observation the 2026-10-17T08:22Z run recorded for the deck's
// logo, 441 times in one run (report.md.json `failedRequests`).
const logoAbort = (over = {}) => ({
  url: `https://${ASSET_HOST}/files/103/3649-small.jpg`,
  status: `failed:net::${HARNESS_ABORT_ERROR}.Inspector`,
  method: "GET",
  resourceType: "other",
  navigation: false,
  ...over,
});

// ---------------------------------------------------------------- leg 1: judge

test("the harness's own request abort is attributed to the harness, not to the deployment", () => {
  // lib/harness-browser.mjs:116-123 aborts with 'blockedbyclient'; Chromium
  // echoes it as net::ERR_BLOCKED_BY_CLIENT.Inspector.
  assert.equal(classifyRequestOutcome(logoAbort(), CTX), "harness-policy-abort");
  assert.equal(pageRenderComplete([logoAbort()], CTX), true, "the harness refusing a request is not a broken page");
  assert.deepEqual(pageRenderViolations([logoAbort()], CTX), []);
});

test("the graded predicate still reads that same observation as red, so the row stays red", () => {
  // tools/edge-signed-in-exercise.mjs:702 grades `blocked.length === 0`.
  // Reproduced here on purpose: this instrument attributes the red, it does
  // not retire it.
  assert.equal(harnessCheckVerdict([logoAbort()]), false);
  assert.deepEqual(harnessCheckViolations([logoAbort()]), [`other https://${ASSET_HOST}/files/103/3649-small.jpg -> failed:net::${HARNESS_ABORT_ERROR}.Inspector`]);
  assert.equal(harnessCheckVerdict([]), true);
  assert.deepEqual(harnessCheckViolations([]), []);
});

test("a 4xx or 5xx from the deck's own asset host is a deployment failure", () => {
  const broken = logoAbort({ status: 404, resourceType: "image" });
  assert.equal(classifyRequestOutcome(broken, CTX), "deployment-failure");
  assert.equal(pageRenderComplete([broken], CTX), false);
  assert.deepEqual(pageRenderViolations([broken], CTX), [`image https://${ASSET_HOST}/files/103/3649-small.jpg -> 404`]);
});

test("a 4xx from a third-party CDN is reported beside the verdict, not inside it", () => {
  const external = { url: "https://kit.fontawesome.com/1366963381.js", status: 403, method: "GET", resourceType: "script", navigation: false };
  assert.equal(classifyRequestOutcome(external, CTX), "third-party-failure");
  assert.equal(pageRenderComplete([external], CTX), true);
});

test("a failed load from the local origin is a deployment failure", () => {
  const local = { url: "https://127.0.0.1:62200/mod/tinymce_editor/themes/silver/theme.min.js", status: "failed:net::ERR_CONNECTION_REFUSED", method: "GET", resourceType: "script", navigation: false };
  assert.equal(classifyRequestOutcome(local, CTX), "deployment-failure");
});

test("a navigation and an xhr are not render-blocking subresources", () => {
  const navigation = { url: "https://127.0.0.1:62200/No_Such_Card", status: 404, resourceType: "document", navigation: true };
  const xhr = { url: "https://127.0.0.1:62200/*search", status: 500, resourceType: "xhr", navigation: false };
  assert.equal(classifyRequestOutcome(navigation, CTX), "navigation-abort");
  assert.equal(classifyRequestOutcome(xhr, CTX), "data-request");
  assert.deepEqual(renderBlockingRequests([navigation, xhr]), []);
  assert.equal(pageRenderComplete([navigation, xhr], CTX), true);
});

test("an aborted navigation is neutral, never a defect", () => {
  const cancelled = { url: "https://127.0.0.1:62200/mod/ace/worker-json.js", status: "failed:net::ERR_ABORTED", resourceType: "script", navigation: false };
  assert.equal(classifyRequestOutcome(cancelled, CTX), "navigation-abort");
  assert.equal(pageRenderComplete([cancelled], CTX), true);
});

test("a render that loaded every subresource is complete", () => {
  const observations = [
    { url: "https://127.0.0.1:62200/", status: 200, resourceType: "document", navigation: true },
    { url: `https://${ASSET_HOST}/files/103/3649-small.jpg`, status: 200, resourceType: "image", navigation: false },
    { url: "https://code.jquery.com/jquery-3.5.1.min.js", status: 200, resourceType: "script", navigation: false },
  ];
  assert.equal(pageRenderComplete(observations, CTX), true);
  assert.deepEqual(pageRenderViolations(observations, CTX), []);
});

test("the traffic summary counts requests, outcomes and repeats per URL", () => {
  const observations = [logoAbort(), logoAbort(), logoAbort(), { url: "https://code.jquery.com/jquery-3.5.1.min.js", status: 200, resourceType: "script", navigation: false }];
  const summary = summarisePageRender(observations, CTX);
  assert.equal(summary.requestsObserved, 4);
  assert.equal(summary.renderBlockingRequests, 4);
  assert.equal(summary.byOutcome["harness-policy-abort"], 3);
  assert.equal(summary.byOutcome.ok, 1);
  assert.deepEqual(summary.repeated, [{ url: logoAbort().url, count: 3 }]);
  assert.deepEqual(summarisePageRender([], CTX).renderBlockingRequests, 0);
  assert.deepEqual(summarisePageRender(undefined, CTX).repeated, []);
});

test("every render-blocking resource type is named, so a new one cannot slip past", () => {
  for (const type of RENDER_BLOCKING_TYPES) {
    assert.equal(renderBlockingRequests([{ url: "https://x.test/a", status: 404, resourceType: type }]).length, 1, type);
  }
});

test("the page's own subresource references are read off the render, with counts", () => {
  const html = `<img src="https://${ASSET_HOST}/files/103/3649-small.jpg"><link href="https://${ASSET_HOST}/files/45514/1790384218.css"><img src="https://${ASSET_HOST}/files/103/3649-small.jpg"><script src="https://code.jquery.com/jquery-3.5.1.min.js"></script><a href="/Home">Home</a>`;
  assert.deepEqual(externalReferencesFrom(html), [
    { url: `https://${ASSET_HOST}/files/103/3649-small.jpg`, count: 2 },
    { url: `https://${ASSET_HOST}/files/45514/1790384218.css`, count: 1 },
    { url: "https://code.jquery.com/jquery-3.5.1.min.js", count: 1 },
  ]);
  assert.deepEqual(externalReferencesFrom("<p>no assets here</p>"), []);
  assert.deepEqual(externalReferencesFrom(undefined), []);
});

// ---------------------------------------------------------------- leg 2: live

const LIVE = process.env.DECKO_INSTRUMENT_LIVE === "1";
const liveOptions = { skip: LIVE ? false : "set DECKO_INSTRUMENT_LIVE=1 to run the live measurement leg" };

/** Records every request a page (or context) makes and what each of them got.
 *  Attached twice on the policy arm — at page scope, where the harness's own
 *  `blocked` array is fed (lib/harness-browser.mjs:136-146), and at context
 *  scope — so a difference between the two is measured, not assumed. */
function observeRequests(emitter) {
  const byRequest = new Map();
  const order = [];
  emitter.on("request", (request) => {
    const row = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      status: null,
    };
    byRequest.set(request, row);
    order.push(row);
  });
  emitter.on("response", (response) => {
    const row = byRequest.get(response.request());
    if (row) row.status = response.status();
  });
  emitter.on("requestfailed", (request) => {
    const row = byRequest.get(request);
    if (row) row.status = `failed:${request.failure()?.errorText ?? "unknown"}`;
  });
  return () => order.filter((row) => row.status !== null);
}

/** Signs a disposable account in through the site's own sign-in form. */
async function signIn(page, origin, account) {
  await page.context().clearCookies();
  await page.goto(`${origin}/*signin`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[name="card[subcards][+*email][content]"]', account.email);
  await page.fill('input[name="card[subcards][+*password][content]"]', account.password);
  await page.locator('form[action="/update/*signin"] button[type="submit"], form[action="/update/*signin"] input[type="submit"]').first().click();
  await page.waitForFunction(
    () => {
      try {
        if (window.decko?.signed_in === true) return true;
      } catch { /* the flag is absent before the session lands */ }
      return /name="decko\.signed_in"[^>]*value="true"/.test(document.documentElement.innerHTML);
    },
    null,
    { timeout: 60_000 },
  );
  return page.content();
}

/** The same launch as lib/harness-browser.mjs:99-107 with NO route handlers:
 *  the control arm. Any difference between the two arms is the policy, not
 *  the browser, the profile or the machine. */
async function launchUninterceptedBrowser() {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright-core");
  const { existsSync } = await import("node:fs");
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];
  const executablePath = candidates.find((p) => existsSync(p));
  assert.ok(executablePath, "no installed Chrome/Edge found for the control arm");
  return chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio"],
  });
}

test("a signed-in page render delivers every subresource the render asks for", liveOptions, async (t) => {
  assert.ok(LIVE, "live leg must be enabled");
  const { startStack, readLiveScriptEnv, REPO: STACK_REPO } = await import("../lib/stack.mjs");
  const { launchHarnessBrowser } = await import("../lib/harness-browser.mjs");
  const { seedLocalAccounts } = await import("../lib/seed-local-accounts.mjs");
  const { buildLocalDeck } = await import("../lib/build-local-deck.mjs");
  assert.equal(STACK_REPO, REPO, "instrument and stack must share one repository root");

  const run = join(REPO, "tmp", `instrument-page-render-subresources-${process.pid}-${Date.now().toString(36)}`);
  // The receipt outlives the run directory: the deck copy and the runtime are
  // this instrument's residue and go, but the measurement is the deliverable
  // and must stay readable after the process exits.
  const receiptPath = join(REPO, "tmp", `page-render-subresources-${process.pid}-${Date.now().toString(36)}.receipt.json`);
  mkdirSync(run, { recursive: true });
  const deck = join(run, "deck.sqlite3");
  const bundlePath = join(REPO, "deploy", "dist", "bunny-edge-engine.bundle.js");
  let stack = null;
  let policyBrowser = null;
  let controlBrowser = null;
  try {
    // This instrument's own deck copy, built from Brandon's local deck the
    // way the harness builds its own (lib/build-local-deck.mjs): the engine's
    // schema and indexes, then the rows, then ANALYZE. A plain file copy
    // carries an untyped cards.id with no index and makes a Home page take
    // seconds, which would measure the copy and not the render. No other
    // lane's file is ever opened for write.
    const source = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
    assert.ok(existsSync(source), `no source deck at ${source}`);
    const deckReport = await buildLocalDeck({ source, out: deck });
    const cardsCopied = deckReport.tables.find((table) => table.name === "cards")?.copiedRows ?? 0;

    // The harness builds the nest index before it measures; same step, same tool.
    let nestIndex = { built: false, note: null };
    try {
      execFileSync(process.execPath, [join(REPO, "tools/deploy/build-nest-index.mjs"), "--db", deck], {
        cwd: REPO,
        stdio: "ignore",
        timeout: 600_000,
      });
      nestIndex = { built: true, note: "tools/deploy/build-nest-index.mjs ran against this copy" };
    } catch (error) {
      nestIndex = { built: false, note: `nest index build failed: ${String(error).slice(0, 200)}` };
    }

    const { env: liveEnv, names } = await readLiveScriptEnv(SECRETS);
    const bundleSha256 = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
    stack = await startStack({ deckPath: deck, live: liveEnv, runtimeDir: join(run, "runtime"), bundlePath, expectedBundleSha256: bundleSha256 });

    const assetHosts = [
      ...new Set(
        Object.entries(liveEnv)
          .filter(([k, v]) => k.startsWith("DECKO_SERVED_") && typeof v === "string" && /^https?:\/\//i.test(v))
          .map(([, v]) => {
            try {
              return new URL(v).hostname;
            } catch {
              return null;
            }
          })
          .filter(Boolean),
      ),
    ];
    const ctx = { origin: stack.origin, assetHosts };
    const credentialsPath = join(run, "credentials.json");
    const seeded = await seedLocalAccounts({ deck, credentialsOut: credentialsPath });
    const account = JSON.parse(readFileSync(credentialsPath, "utf8")).admin;
    assert.ok(account.email === seeded.admin.email, "seeded account did not round-trip through the credentials file");

    // ---- arm 1: this harness's own request policy (the instrument under observation)
    policyBrowser = await launchHarnessBrowser({ origin: stack.origin, assetHosts });
    const policyPage = policyBrowser.page;
    await signIn(policyPage, stack.origin, account);
    // A clean record: everything above was chrome, sign-in and fixtures. The
    // sign-in page's own blocked requests are kept separately, because the
    // graded array is session-cumulative: an entry that lands after this
    // reset would otherwise be graded against a render that never made it.
    const signInBlocked = policyBrowser.blocked.slice();
    policyBrowser.blocked.length = 0;
    policyBrowser.consoleErrors.length = 0;
    const policyObservations = observeRequests(policyPage);
    const policyContextObservations = observeRequests(policyPage.context());
    const policyRender = await policyPage.goto(`${stack.origin}/`, { waitUntil: "load", timeout: 60_000 });
    await policyPage.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const policyHtml = await policyPage.content();
    const policySeen = policyObservations();
    const policySeenAtContextScope = policyContextObservations();
    const policyGraded = policyBrowser.blocked.slice();

    // ---- arm 2: the same browser build with no request interception at all
    controlBrowser = await launchUninterceptedBrowser();
    const controlContext = await controlBrowser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, acceptDownloads: false });
    const controlPage = await controlContext.newPage();
    await signIn(controlPage, stack.origin, account);
    const controlObservations = observeRequests(controlContext);
    const controlRender = await controlPage.goto(`${stack.origin}/`, { waitUntil: "load", timeout: 60_000 });
    await controlPage.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const controlHtml = await controlPage.content();
    const controlSeen = controlObservations();

    const signedIn = (html) => /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/.test(html);
    const receipt = {
      instrument: "page-render-subresources",
      action: "a signed-in page opens and every subresource the rendered page asks for is delivered",
      matrixRow: "ACT-009",
      gradedCheck: "tools/edge-signed-in-exercise.mjs:702 (`no blocked or 4xx/5xx subresource on the signed-in page`)",
      measured_at: new Date().toISOString(),
      source: { repo: REPO, bundlePath, bundleSha256, sourceDeck: source, cardsCopied, liveEnvVars: names.length, nestIndex },
      session: { state: "signed in", account: { name: account.name, role: account.role }, origin: stack.origin },
      arms: {
        policy: {
          description: "lib/harness-browser.mjs launch + this harness's own route policy (the instrument under observation)",
          renderStatus: policyRender?.status() ?? null,
          signedIn: signedIn(policyHtml),
          gradedBlockedCount: policyGraded.length,
          // Requests the SAME browser aborted while rendering the sign-in
          // page, before the measured render. The graded array is
          // session-cumulative, so these are counted by the graded check but
          // belong to no measured render.
          blockedDuringSignIn: signInBlocked.map((b) => `${b.resourceType} ${b.url} -> ${b.status}`),
          // The same render observed at page scope (where the harness's own
          // array is fed) and at context scope. A difference here is the
          // harness's counting, recorded rather than explained.
          scopeCounts: { pageScope: policySeen.length, contextScope: policySeenAtContextScope.length, gradedArray: policyGraded.length },
          gradedVerdict: harnessCheckVerdict(policyGraded),
          gradedViolations: harnessCheckViolations(policyGraded),
          summary: summarisePageRender(policySeen, ctx),
          observations: policySeen,
          consoleErrors: policyBrowser.consoleErrors.slice(),
          renderComplete: pageRenderComplete(policySeen, ctx),
          renderViolations: pageRenderViolations(policySeen, ctx),
          referencesInRender: externalReferencesFrom(policyHtml),
        },
        control: {
          description: "identical browser and profile flags, NO route handlers (what a person gets)",
          renderStatus: controlRender?.status() ?? null,
          signedIn: signedIn(controlHtml),
          summary: summarisePageRender(controlSeen, ctx),
          observations: controlSeen,
          renderComplete: pageRenderComplete(controlSeen, ctx),
          renderViolations: pageRenderViolations(controlSeen, ctx),
        },
      },
    };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    t.diagnostic(`receipt: ${receiptPath}`);
    for (const arm of ["policy", "control"]) {
      const a = receipt.arms[arm];
      t.diagnostic(
        `${arm}: render=${a.renderStatus} signedIn=${a.signedIn} requests=${a.summary.requestsObserved} ` +
          `renderBlocking=${a.summary.renderBlockingRequests} outcomes=${JSON.stringify(a.summary.byOutcome)} ` +
          `renderComplete=${a.renderComplete}${a.gradedVerdict === undefined ? "" : ` gradedBlocked=${a.gradedBlockedCount} gradedVerdict=${a.gradedVerdict}`}`,
      );
    }

    // The user-truth verdict: every subresource the render needs arrived.
    assert.equal(receipt.arms.control.renderComplete, true, `the deployment did not deliver the page: ${receipt.arms.control.renderViolations.join("; ")}`);
    assert.equal(receipt.arms.policy.renderComplete, true, `the deployment did not deliver the page: ${receipt.arms.policy.renderViolations.join("; ")}`);
    // Both arms must be signed-in renders of the same page, or the comparison is void.
    assert.equal(receipt.arms.policy.signedIn, true, "the policy arm is not a signed-in render");
    assert.equal(receipt.arms.control.signedIn, true, "the control arm is not a signed-in render");
    assert.equal(receipt.arms.policy.renderStatus, 200);
    assert.equal(receipt.arms.control.renderStatus, 200);
    // The render must actually ask for subresources, or this measured nothing.
    assert.ok(receipt.arms.policy.summary.renderBlockingRequests > 0, "the render made no subresource requests at all");
  } finally {
    if (policyBrowser) await policyBrowser.close().catch(() => undefined);
    if (controlBrowser) await controlBrowser.close().catch(() => undefined);
    if (stack) {
      await stack.close().catch(() => undefined);
      stack.cleanup();
    }
    rmSync(run, { recursive: true, force: true });
  }
});