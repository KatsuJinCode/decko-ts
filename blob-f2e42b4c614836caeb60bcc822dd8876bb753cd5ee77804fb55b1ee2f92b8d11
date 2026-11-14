// search-as-you-type-suggestions.test.mjs — the instrument for the navbox's
// per-keystroke suggestion request, the highest-traffic action in the search
// flow. See lib/search-as-you-type-suggestions.mjs for what action this pins,
// what was red, and what this cannot close.
//
// TWO LEGS:
//   1. The judge (always runs). Pure assertions on the verdict, so a green
//      verdict means the rule says what it claims.
//   2. The live measurement (runs when DECKO_INSTRUMENT_LIVE=1). Boots the
//      local edge stack on its OWN deck copy under this repository's tmp/,
//      serves the already-built deploy/dist bundle, drives a real browser at
//      the endpoint the navbar itself advertises, and records per-keystroke
//      wall time plus the engine's Server-Timing attribution.
//
// It never rebuilds the bundle or the engine dist: other lanes share those
// paths, and an instrument that overwrites another lane's artifact is not an
// instrument. It copies an existing deck; it never writes another lane's deck.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/search-as-you-type-suggestions.test.mjs
//   DECKO_INSTRUMENT_LIVE=1 node --test tools/edge-signed-in-exercise/test/search-as-you-type-suggestions.test.mjs
//
// On Windows (this machine) the env var goes through set, not a prefix:
//   set DECKO_INSTRUMENT_LIVE=1 && node --test tools/edge-signed-in-exercise/test/search-as-you-type-suggestions.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  SUGGESTIONS_BUDGET_MS,
  OWNER_KEYSTROKES,
  parseServerTiming,
  suggestionsWithinBudget,
  suggestionsViolations,
  navbarCompletepathFrom,
  measureSuggestionsInSession,
} from "../lib/search-as-you-type-suggestions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const SECRETS = "C:/localProjects/brandonDojoTech/library/data/secrets.env";
// The same default source deck tools/edge-signed-in-exercise.mjs:61 uses.
const SOURCE_DECK = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";

// A sample as timeSuggest returns it: 200, a JSON array of 8, inside budget.
const good = (over = {}) => ({
  term: "202",
  status: 200,
  ms: 807,
  isArray: true,
  count: 8,
  bodyBytes: 346,
  serverTiming: "auth;dur=0, seat;dur=0, db;dur=439;stmt=61, render;dur=807, total;dur=807",
  ...over,
});

// ---------------------------------------------------------------- leg 1: judge

test("a keystroke that answers 200 with a populated JSON array, inside budget, is within budget", () => {
  assert.equal(suggestionsWithinBudget([good()]), true);
});

test("the verdict is red when a keystroke misses the owner's 1 s budget", () => {
  // The exact signed-in reading from the 2026-10-17T08:22Z run
  // (report.md.json, "row 1: search box suggestions answer within 1 s,
  // signed in"): 202 -> 1023ms red, 2026 -> 962ms, 202609 -> 949ms. One
  // keystroke over the budget reddens the session, which is exactly why
  // owner-checks.mjs graded this session FAIL.
  const samples = [good({ ms: 1023 }), good({ term: "2026", ms: 962 }), good({ term: "202609", ms: 949 })];
  assert.equal(suggestionsWithinBudget(samples), false);
  assert.deepEqual(suggestionsViolations(samples), ["202: 1023ms >= 1000ms budget"]);
});

test("the cold anonymous session's reading reddens on every keystroke, not just the first", () => {
  // The same run's signed-out reading (report.md.json): cold 202 -> 1316ms,
  // then 2026 -> 1162ms, 202609 -> 1113ms. All three are over budget, so this
  // is a standing per-keystroke cost, not one cold-start artefact.
  const samples = [good({ ms: 1316 }), good({ term: "2026", ms: 1162 }), good({ term: "202609", ms: 1113 })];
  assert.equal(suggestionsWithinBudget(samples), false);
  assert.deepEqual(suggestionsViolations(samples), [
    "202: 1316ms >= 1000ms budget",
    "2026: 1162ms >= 1000ms budget",
    "202609: 1113ms >= 1000ms budget",
  ]);
});

test("the verdict is red on a 200 that carries no suggestion array", () => {
  // owner-checks.mjs grades status and latency only, so this passes there.
  const samples = [good({ isArray: false, count: null })];
  assert.equal(suggestionsWithinBudget(samples), false);
  assert.deepEqual(suggestionsViolations(samples), ["202: body is not a JSON array (autocomplete would render nothing)"]);
});

test("the verdict is red on an empty suggestion list, which renders as an empty dropdown", () => {
  const samples = [good({ count: 0 })];
  assert.equal(suggestionsWithinBudget(samples), false);
  assert.deepEqual(suggestionsViolations(samples), ["202: empty suggestion list"]);
});

test("a non-200, a missing wall time, and no samples at all are all red", () => {
  assert.equal(suggestionsWithinBudget([good({ status: 500 })]), false);
  assert.equal(suggestionsWithinBudget([good({ ms: undefined })]), false);
  assert.equal(suggestionsWithinBudget([]), false);
  assert.equal(suggestionsWithinBudget(undefined), false);
  assert.deepEqual(suggestionsViolations([]), ["no samples were recorded"]);
});

test("every keystroke must pass; one slow keystroke reddens the session", () => {
  assert.equal(suggestionsWithinBudget([good(), good({ term: "2026", ms: 999 })]), true);
  assert.equal(suggestionsWithinBudget([good(), good({ term: "2026", ms: 1000 })]), false, "1000ms is not inside a 1000ms budget");
});

test("the Server-Timing header is parsed into phases, carrying the db statement count", () => {
  const phases = parseServerTiming("auth;dur=0, seat;dur=0, db;dur=439;stmt=61, render;dur=807, total;dur=807");
  assert.deepEqual(phases, {
    auth: { dur: 0 },
    seat: { dur: 0 },
    db: { dur: 439, stmt: 61 },
    render: { dur: 807 },
    total: { dur: 807 },
  });
  assert.equal(parseServerTiming(""), null);
  assert.equal(parseServerTiming(null), null);
  assert.equal(parseServerTiming("garbage"), null);
});

test("a phase the engine adds later is carried through rather than dropped", () => {
  const phases = parseServerTiming("cache;dur=3, total;dur=807");
  assert.deepEqual(phases, { cache: { dur: 3 }, total: { dur: 807 } });
});

test("the endpoint under test is read off the navbar, not assumed", () => {
  // The shape src/card/render/navbar-views.ts:267 renders.
  const html = '<input type="text" name="query[keyword]" id="query_keyword" class="_search-box search-box form-control w-100" autocomplete="off" data-completepath="/*search/search_box_complete.json" placeholder="Search" />';
  assert.equal(navbarCompletepathFrom(html), "/*search/search_box_complete.json");
  assert.equal(navbarCompletepathFrom("<form>no search box here</form>"), null);
  assert.equal(navbarCompletepathFrom(undefined), null);
});

// ---------------------------------------------------------------- leg 2: live

const LIVE = process.env.DECKO_INSTRUMENT_LIVE === "1";
const liveOptions = { skip: LIVE ? false : "set DECKO_INSTRUMENT_LIVE=1 to run the live measurement leg" };

// Evidence outlives the run directory. The scratch deck copy and the runtime
// dir are deleted in `finally`; this receipt is not, because a measurement
// nobody can read back is not evidence. Same place the exercise keeps its own
// run records: .runtime/.
const RECEIPT_DIR = join(REPO, ".runtime", "instrument-search-as-you-type");

test("the navbox suggestion request answers inside the owner's budget, with phase attribution", liveOptions, async (t) => {
  assert.ok(LIVE, "live leg must be enabled");
  const { startStack, readLiveScriptEnv, REPO: STACK_REPO } = await import("../lib/stack.mjs");
  const { launchHarnessBrowser } = await import("../lib/harness-browser.mjs");
  assert.equal(STACK_REPO, REPO, "instrument and stack must share one repository root");

  const run = join(REPO, "tmp", `instrument-search-as-you-type-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(run, { recursive: true });
  const deck = join(run, "deck.sqlite3");
  const credentials = join(run, "credentials.json");
  const bundlePath = join(REPO, "deploy", "dist", "bunny-edge-engine.bundle.js");
  let stack = null;
  const browsers = [];
  try {
    // The deck this instrument measures on: built by the harness's own
    // builder from the same source deck the exercise builds from, so the row
    // count and engine schema match the graded runs (21,676 cards at
    // 2026-10-17T08:22Z). The source is opened read-only; every write lands on
    // this copy, so no lane's deck is ever touched.
    const source = SOURCE_DECK;
    assert.ok(existsSync(source), `no source deck at ${source}`);
    const { buildLocalDeck } = await import("../lib/build-local-deck.mjs");
    const deckReport = await buildLocalDeck({ source, out: deck });
    const cardsCopied = deckReport.tables.find((x) => x.name === "cards")?.copiedRows ?? null;

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

    stack = await startStack({
      deckPath: deck,
      live: liveEnv,
      runtimeDir: join(run, "runtime"),
      bundlePath,
      expectedBundleSha256: bundleSha256,
    });

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

    // --- session A: anonymous, cold first keystroke. This is the ACT-111 row.
    const anon = await launchHarnessBrowser({ origin: stack.origin, assetHosts });
    browsers.push(anon);
    await anon.page.goto(`${stack.origin}/*search`, { waitUntil: "load" });

    const completepath = navbarCompletepathFrom(await anon.page.content());
    assert.ok(completepath, "the navbar rendered no data-completepath: the search box is not on the page");

    const anonymous = await measureSuggestionsInSession({ page: anon.page, origin: stack.origin, path: completepath });

    // --- session B: signed in, the other state the owner's row 1 covers.
    // Seeded onto THIS deck copy only; the credentials file dies with the run
    // dir and the password is never printed or written to the receipt.
    let signedIn = null;
    let seeded = { ok: false, note: null };
    try {
      const { seedLocalAccounts } = await import("../lib/seed-local-accounts.mjs");
      await seedLocalAccounts({ deck, credentialsOut: credentials });
      const creds = JSON.parse(readFileSync(credentials, "utf8"));
      const owner = await launchHarnessBrowser({ origin: stack.origin, assetHosts });
      browsers.push(owner);
      await owner.page.goto(`${stack.origin}/*signin`, { waitUntil: "load" });
      await owner.page.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
      await owner.page.fill('input[name="card[subcards][+*password][content]"]', creds.admin.password);
      await owner.page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
      await owner.page.waitForURL(/\/(?!.*signin).*/, { timeout: 30_000 }).catch(() => undefined);
      await owner.page.goto(`${stack.origin}/*search`, { waitUntil: "load" });
      const signedInFlag = await owner.page.evaluate(() => window.decko?.signed_in === true);
      if (signedInFlag) {
        seeded = { ok: true, note: "seeded administrator signed in through the real sign-in form" };
        signedIn = await measureSuggestionsInSession({ page: owner.page, origin: stack.origin, path: completepath });
      } else {
        seeded = { ok: false, note: "sign-in form submitted but the landing page did not report signed_in" };
      }
    } catch (error) {
      seeded = { ok: false, note: `signed-in leg could not be set up: ${String(error).slice(0, 200)}` };
    }

    const receipt = {
      instrument: "search-as-you-type-suggestions",
      action: "the navbox suggestion request fired on every keystroke (the navbar's own data-completepath)",
      matrixRow: "ACT-111",
      measured_at: new Date().toISOString(),
      source: {
        repo: REPO,
        bundlePath,
        bundleSha256,
        sourceDeck: source,
        sourceDeckSha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
        cardsCopied,
        liveEnvVars: names.length,
      },
      harnessParity: {
        nestIndex,
        sameLocusAs: "lib/owner-checks.mjs:22-31 (in-page fetch around performance.now)",
        differsFromWholeHarness: [
          "the bundle is the one already built in deploy/dist; the exercise rebuilds it from source before every run",
        ],
      },
      navbarAdvertisedEndpoint: completepath,
      ownerKeystrokes: OWNER_KEYSTROKES,
      budgetMs: SUGGESTIONS_BUDGET_MS,
      sessions: [
        {
          state: "anonymous",
          note: "fresh session; the first keystroke is the owner's cold first keystroke",
          samples: anonymous,
          withinBudget: suggestionsWithinBudget(anonymous),
          violations: suggestionsViolations(anonymous),
        },
        signedIn
          ? {
              state: "signed-in",
              note: "seeded administrator, the other state owner row 1 covers",
              setup: seeded,
              samples: signedIn,
              withinBudget: suggestionsWithinBudget(signedIn),
              violations: suggestionsViolations(signedIn),
            }
          : { state: "signed-in", setup: seeded, samples: null, withinBudget: null, violations: ["signed-in leg not measured"] },
      ],
    };

    mkdirSync(RECEIPT_DIR, { recursive: true });
    const receiptPath = join(RECEIPT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    t.diagnostic(`receipt: ${receiptPath}`);

    const lines = [];
    for (const session of receipt.sessions) {
      if (!session.samples) {
        lines.push(`${session.state}: NOT MEASURED (${session.setup?.note})`);
        continue;
      }
      for (const s of session.samples) {
        lines.push(
          `${session.state} ${s.term}: ${s.ms}ms status=${s.status} count=${s.count} ` +
            `db=${s.serverTimingPhases?.db?.dur ?? "?"}ms/${s.serverTimingPhases?.db?.stmt ?? "?"}stmt ` +
            `render=${s.serverTimingPhases?.render?.dur ?? "?"}ms total=${s.serverTimingPhases?.total?.dur ?? "?"}ms`,
        );
      }
    }
    t.diagnostic(lines.join("\n"));

    // The verdict, not the harness's: 200 AND a populated array AND inside budget.
    for (const session of receipt.sessions) {
      if (!session.samples) continue;
      assert.deepEqual(
        session.violations,
        [],
        `${session.state} search-as-you-type missed the owner's ${SUGGESTIONS_BUDGET_MS}ms budget: ${session.violations.join("; ")}`,
      );
      assert.equal(session.withinBudget, true);
    }
  } finally {
    for (const b of browsers) await b.close().catch(() => undefined);
    if (stack) {
      await stack.close().catch(() => undefined);
      stack.cleanup();
    }
    rmSync(run, { recursive: true, force: true });
  }
});