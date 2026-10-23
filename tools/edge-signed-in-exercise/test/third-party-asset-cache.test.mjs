// third-party-asset-cache.test.mjs — the harness serves the stock layout
// CDNs out of its own per-run cache: ONE live fetch per third-party URL per
// run, and every later request for that URL is answered from memory.
//
// WHY THIS EXISTS. The engine does not serve the TinyMCE distribution or the
// icon font; the browser fetched them from the public internet on every
// page. The tranche-7 whole-family run made 152 requests for one TinyMCE
// URL, and the tranche-9 runs each failed 21 live fetches of the ace
// editor's worker-json.js. Because the engine, the local database endpoint
// and the browser client share ONE Node process, every third-party answer is
// processed on the event loop the engine's handler resumes on, and the
// public internet's mood lands inside the engine's measured db wall. That
// is what made the "9. timings" leg flake (see
// test/server-time-budget.test.mjs).
//
// No network of any kind here: the fetch is a stub.
//
// Usage:
//   node --test tools/edge-signed-in-exercise/test/third-party-asset-cache.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createThirdPartyAssetCache } from "../lib/third-party-asset-cache.mjs";

const headersOf = (entries) => ({
  forEach(callback) {
    for (const [key, value] of entries) callback(value, key);
  },
});

const stubResponse = (body, entries = [["content-type", "application/javascript"]]) => ({
  status: 200,
  headers: headersOf(entries),
  arrayBuffer: async () => Buffer.from(body, "utf8"),
});

test("one URL is fetched once and every later request is answered from memory", async () => {
  const calls = [];
  const cache = createThirdPartyAssetCache({
    fetchImpl: async (url) => {
      calls.push(url);
      return stubResponse("tinymce bytes");
    },
  });
  const first = await cache.answer("https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/theme.min.js");
  const second = await cache.answer("https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/theme.min.js");
  assert.equal(calls.length, 1, "the public internet is asked once per URL");
  assert.equal(first.body.toString("utf8"), "tinymce bytes");
  assert.equal(second.body.toString("utf8"), "tinymce bytes");
  const stats = cache.stats();
  assert.deepEqual(stats.liveFetches, { "cdnjs.cloudflare.com": 1 });
  assert.deepEqual(stats.servedFromCache, { "cdnjs.cloudflare.com": 1 });
  assert.equal(stats.distinctUrls, 1);
});

test("different URLs are fetched separately", async () => {
  const calls = [];
  const cache = createThirdPartyAssetCache({
    fetchImpl: async (url) => {
      calls.push(url);
      return stubResponse("bytes for " + url);
    },
  });
  await cache.answer("https://cdnjs.cloudflare.com/a.js");
  await cache.answer("https://cdnjs.cloudflare.com/b.js");
  assert.equal(calls.length, 2);
  assert.deepEqual(cache.stats().hosts, ["cdnjs.cloudflare.com"]);
});

test("a URL that cannot be fetched answers 502 with an empty body and is recorded", async () => {
  const cache = createThirdPartyAssetCache({
    fetchImpl: async () => {
      throw new Error("getaddrinfo ENOTFOUND cdnjs.cloudflare.com");
    },
  });
  const answer = await cache.answer("https://cdnjs.cloudflare.com/missing.js");
  assert.equal(answer.status, 502);
  assert.equal(answer.body.length, 0);
  const stats = cache.stats();
  assert.equal(stats.failures.length, 1);
  assert.match(stats.failures[0].reason, /ENOTFOUND/);
  assert.equal(stats.failures[0].url, "https://cdnjs.cloudflare.com/missing.js");
});

test("a failed URL is not fetched again", async () => {
  let calls = 0;
  const cache = createThirdPartyAssetCache({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("the host is down");
    },
  });
  await cache.answer("https://cdnjs.cloudflare.com/x.js");
  const again = await cache.answer("https://cdnjs.cloudflare.com/x.js");
  assert.equal(calls, 1, "a failed fetch is cached too: the run must not hammer a host that is down");
  assert.equal(again.status, 502);
});

test("the decoded body is served without the encoding headers it was fetched with", async () => {
  const cache = createThirdPartyAssetCache({
    fetchImpl: async () =>
      stubResponse("plain bytes", [
        ["content-type", "text/css"],
        ["content-encoding", "gzip"],
        ["content-length", "999"],
        ["access-control-allow-origin", "*"],
      ]),
  });
  const answer = await cache.answer("https://fonts.gstatic.com/font.woff2");
  assert.equal(answer.headers["content-encoding"], undefined, "the body here is already decoded");
  assert.equal(answer.headers["content-length"], undefined);
  assert.equal(answer.headers["content-type"], "text/css");
  assert.equal(answer.headers["access-control-allow-origin"], "*", "a cross-origin font still needs this");
});

test("a hanging fetch is bounded, so the run cannot park on the public internet", async () => {
  const cache = createThirdPartyAssetCache({
    timeoutMs: 20,
    fetchImpl: async (_url, init) =>
      await new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  const answer = await cache.answer("https://cdnjs.cloudflare.com/hangs.js");
  assert.equal(answer.status, 502);
  assert.match(cache.stats().failures[0].reason, /aborted/);
});
