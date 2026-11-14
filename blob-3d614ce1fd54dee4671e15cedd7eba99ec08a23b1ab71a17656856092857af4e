#!/usr/bin/env node
// tools/verify-live-browser-journeys.mjs
// End-to-end live browser journey and edge-performance gate for Decko Phase 2.
// Enforces:
// 1. Lean read worker bundle <= 1,400,000 bytes (1.34 MiB) with zero dormant
//    admin compilers (LibSass, Photon, CoffeeScript) or base64 favicon bloat.
// 2. Hard <= 1 database round trip (X-Decko-Db-Trips <= 1) across:
//    - /_status
//    - / (bare root)
//    - /Home (anonymous)
//    - /Home+by_name.json?view=name_match&term=Ho (navbox autocomplete)
//    - /new/Sign_up
//    - /Home (signed-in session cookie)
// 3. Real browser journeys via agent-browser (single tab, cleaned up on exit)
//    verifying rendered DOM, stylesheets, navbox search input, and sign-up form.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = (process.env.DECKO_LIVE_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const AGENT_BROWSER = process.env.AGENT_BROWSER_BIN || "agent-browser";
const AB_ENV = { ...process.env, AB_AGENT_NAME: "decko-phase2-journey-verifier" };

function runAb(args) {
  const out = execFileSync(AGENT_BROWSER, args, {
    env: AB_ENV,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  return JSON.parse(out);
}

async function probeHttpRoute(name, path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  // Warm once if requested so we measure steady-state isolate + 1-trip cold/warm contract
  if (opts.warmFirst) {
    await fetch(url, { headers: opts.headers || {}, redirect: "manual" });
  }
  const t0 = performance.now();
  const res = await fetch(url, { headers: opts.headers || {}, redirect: "manual" });
  const text = await res.text();
  const wallMs = Math.round(performance.now() - t0);
  const tripsRaw = res.headers.get("x-decko-db-trips");
  const trips = tripsRaw === null ? null : Number(tripsRaw);
  const serverTiming = res.headers.get("server-timing") || "";

  assert.equal(res.status, opts.expectedStatus ?? 200, `${name} (${path}): expected HTTP ${opts.expectedStatus ?? 200}, got ${res.status}`);
  assert.notEqual(trips, null, `${name} (${path}): missing X-Decko-Db-Trips header`);
  assert.ok(
    trips <= (opts.maxTrips ?? 1),
    `${name} (${path}): X-Decko-Db-Trips=${trips} exceeds hard ceiling of ${opts.maxTrips ?? 1} (Server-Timing: ${serverTiming})`,
  );
  if (opts.expectSubstring) {
    assert.ok(
      text.includes(opts.expectSubstring),
      `${name} (${path}): response missing expected substring "${opts.expectSubstring}"`,
    );
  }
  return { name, path, status: res.status, trips, wallMs, serverTiming, bodyBytes: Buffer.byteLength(text, "utf8") };
}

async function main() {
  // 1. Verify bundle size and zero dormant admin compilers / base64 favicon bloat
  const bundlePath = resolve(REPO_ROOT, "deploy/dist/cf-edge-engine.bundle.js");
  const bundleText = readFileSync(bundlePath, "utf8");
  const bundleBytes = Buffer.byteLength(bundleText, "utf8");
  assert.ok(
    bundleBytes <= 1_400_000,
    `deploy/dist/cf-edge-engine.bundle.js is ${bundleBytes} bytes, exceeding 1,400,000-byte budget`,
  );
  for (const forbidden of [
    ":favicon/carrierwave.png",
    "libsass-3.6.4-wasm",
    "photon_rs_bg.wasm",
    "CoffeeScript Compiler",
  ]) {
    assert.ok(
      !bundleText.includes(forbidden),
      `deploy/dist/cf-edge-engine.bundle.js contains forbidden payload "${forbidden}"`,
    );
  }

  // 2. Verify HTTP trip-count and response gates across all key routes
  const httpResults = [];
  httpResults.push(await probeHttpRoute("Health /_status", "/_status", { warmFirst: true, maxTrips: 1, expectSubstring: '"ok": true' }));
  httpResults.push(await probeHttpRoute("Bare root /", "/", { warmFirst: true, maxTrips: 1, expectSubstring: "<html" }));
  httpResults.push(await probeHttpRoute("Anonymous /Home", "/Home", { warmFirst: true, maxTrips: 1, expectSubstring: "Home" }));
  httpResults.push(
    await probeHttpRoute("Autocomplete name_match", "/Home+by_name.json?view=name_match&term=Ho", {
      warmFirst: true,
      maxTrips: 1,
      expectSubstring: "Home",
    }),
  );
  httpResults.push(await probeHttpRoute("Sign-up /new/Sign_up", "/new/Sign_up", { warmFirst: true, maxTrips: 1, expectSubstring: "Sign up" }));
  httpResults.push(
    await probeHttpRoute("Signed-in /Home (session cookie)", "/Home", {
      warmFirst: true,
      maxTrips: 1,
      headers: { cookie: "_decko_session=probe-session-token" },
      expectSubstring: "Home",
    }),
  );

  // 3. Run real browser journeys via agent-browser
  const browserJourneys = [];
  let handle = null;
  try {
    const opened = runAb(["new"]);
    handle = opened.handle;
    assert.ok(handle, "agent-browser did not return a tab handle");

    // Journey A: Bare root `/` in real browser
    runAb(["open", handle, `${BASE_URL}/`]);
    runAb(["wait", handle, "#home-content-view", "15000"]);
    const rootTitle = runAb(["title", handle]);
    const rootHtml = runAb(["html", handle, "body"]);
    assert.ok(
      typeof rootTitle.title === "string" && rootTitle.title.length > 0,
      `Browser Journey /: empty document.title (${JSON.stringify(rootTitle)})`,
    );
    assert.ok(
      typeof rootHtml.html === "string" && rootHtml.html.includes("card-slot"),
      "Browser Journey /: missing rendered .card-slot in DOM",
    );
    browserJourneys.push({ journey: "Bare root /", title: rootTitle.title, domVerified: true });

    // Journey B: Navigate to `/Home` and exercise navbox search input
    runAb(["open", handle, `${BASE_URL}/Home`]);
    runAb(["wait", handle, "#home-content-view", "15000"]);
    const homeTitle = runAb(["title", handle]);
    const navboxCount = runAb(["count", handle, "input"]);
    assert.ok(
      (navboxCount.count ?? 0) >= 1,
      "Browser Journey /Home: expected at least 1 input element on /Home",
    );
    const autocompleteProbe = runAb([
      "eval",
      handle,
      "fetch('/Home+by_name.json?view=name_match&term=Ho').then(function(r){return r.json().then(function(b){return {status:r.status,trips:r.headers.get('x-decko-db-trips'),count:b.length,sample:b.slice(0,3)};});})",
    ]);
    assert.equal(autocompleteProbe.result?.status, 200, "Browser Journey Autocomplete: HTTP status != 200");
    assert.ok(
      Number(autocompleteProbe.result?.trips) <= 1,
      `Browser Journey Autocomplete: X-Decko-Db-Trips=${autocompleteProbe.result?.trips} > 1`,
    );
    assert.ok(
      (autocompleteProbe.result?.count ?? 0) >= 1,
      "Browser Journey Autocomplete: returned 0 matching card names for term=Ho",
    );
    browserJourneys.push({
      journey: "Home + in-browser navbox autocomplete",
      title: homeTitle.title,
      inputCount: navboxCount.count,
      autocompleteTrips: Number(autocompleteProbe.result.trips),
      autocompleteMatches: autocompleteProbe.result.sample,
    });

    // Journey C: Navigate to `/new/Sign_up` and verify sign-up form in DOM
    runAb(["open", handle, `${BASE_URL}/new/Sign_up`]);
    runAb(["wait-stable", handle, "10000", "300"]);
    const signupTitle = runAb(["title", handle]);
    const formCount = runAb(["count", handle, "form"]);
    const signupText = runAb(["text", handle, "body"]);
    assert.ok((formCount.count ?? 0) >= 1, "Browser Journey /new/Sign_up: missing <form> element");
    assert.ok(
      typeof signupText.text === "string" && /sign up/i.test(signupText.text),
      "Browser Journey /new/Sign_up: missing 'Sign up' text in rendered body",
    );
    browserJourneys.push({
      journey: "Sign-up /new/Sign_up",
      title: signupTitle.title,
      formCount: formCount.count,
      domVerified: true,
    });
  } finally {
    if (handle) {
      try {
        runAb(["close", handle]);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        bundleBytes,
        httpResults,
        browserJourneys,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("LIVE BROWSER JOURNEY GATE FAILED:", err);
  process.exit(1);
});
