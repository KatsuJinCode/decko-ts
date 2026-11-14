// Tests for exchange matching + verdicts (lib/compare-walks.mjs) and the
// traffic gate (lib/walker.mjs assertWalkableBase). The gate tests send no
// request anywhere: the gate's whole job is to refuse before any network.
import test from "node:test";
import assert from "node:assert/strict";
import { compareExchanges, diffExchangePair, textDiffSummary } from "../lib/compare-walks.mjs";
import { walkRulesEnabled } from "../lib/normalize-exchange.mjs";
import { assertWalkableBase, isLoopbackUrl } from "../lib/walker.mjs";

const rules = walkRulesEnabled([]);

const EX = (over = {}) => ({
  method: "GET", status: 200, url: "http://127.0.0.1:3000/x",
  requestHeaders: {}, headersArray: [], setCookieRaw: [],
  bodyKind: "html", bodyText: "", contentSha256: null,
  sameOrigin: true, thirdParty: false, seq: 1, ...over,
});

test("identical exchanges -> identical; volatile-only exchanges -> normalization-explained", () => {
  const a = EX({ bodyText: "<p>same</p>" });
  const b = EX({ bodyText: "<p>same</p>" });
  const d = diffExchangePair(a, b, { rules, sessionCookieNames: [] });
  assert.equal(d.verdict, "identical");

  const va = EX({ setCookieRaw: ["decko_ts_session=tokA"], headersArray: [{ name: "Date", value: "Tue, 15 Nov 1994 08:12:31 GMT" }], bodyText: "<p>same</p>" });
  const vb = EX({ setCookieRaw: ["decko_ts_session=tokB"], headersArray: [{ name: "Date", value: "Wed, 16 Nov 1994 08:12:31 GMT" }], bodyText: "<p>same</p>" });
  const d2 = diffExchangePair(va, vb, { rules, sessionCookieNames: [] });
  assert.equal(d2.verdict, "normalization-explained");
  assert.ok(d2.applied.includes("W1"));
  assert.ok(d2.applied.includes("W5"));
});

test("a real content difference -> differs, with the differing lines summarized", () => {
  const d = diffExchangePair(
    EX({ bodyText: "<p>alpha</p>\n<p>shared</p>\n" }),
    EX({ bodyText: "<p>beta</p>\n<p>shared</p>\n" }),
    { rules, sessionCookieNames: [] },
  );
  assert.equal(d.verdict, "differs");
  assert.equal(d.bodyDiff.differingLines, 1);
  assert.equal(d.bodyDiff.hunks.length, 1);
  assert.match(d.bodyDiff.hunks[0].lines[0].a, /alpha/);
  assert.match(d.bodyDiff.hunks[0].lines[0].b, /beta/);
});

test("a header only one side sends is a finding, never hidden", () => {
  const d = diffExchangePair(
    EX({ headersArray: [{ name: "X-Only-A", value: "1" }] }),
    EX({}),
    { rules, sessionCookieNames: [] },
  );
  assert.equal(d.verdict, "differs");
  assert.deepEqual(d.fieldDiffs.map((f) => f.field), ["header x-only-a"]);
});

test("matching: by method + normalized URL, duplicates in order; unmatched reported per side", () => {
  const a = [
    EX({ seq: 1, url: "http://127.0.0.1:3000/" }),
    EX({ seq: 2, url: "http://127.0.0.1:3000/assets/app.css" }),
    EX({ seq: 3, url: "http://127.0.0.1:3000/update/y?token=Aaaa1234567890123456" }),
    EX({ seq: 4, url: "http://127.0.0.1:3000/only-on-a" }),
    EX({ seq: 5, url: "http://cdn.example/jquery.js", sameOrigin: false, thirdParty: true }),
    EX({ seq: 6, url: "http://127.0.0.1:3000/__harness/ready" }),
  ];
  const b = [
    EX({ seq: 1, url: "http://127.0.0.1:4000/" }),
    EX({ seq: 2, url: "http://127.0.0.1:4000/assets/app.css" }),
    EX({ seq: 3, url: "http://127.0.0.1:4000/update/y?token=Bbbb9876543210987654" }),
    EX({ seq: 4, url: "http://127.0.0.1:4000/only-on-b" }),
    EX({ seq: 5, url: "http://cdn.example/jquery.js", sameOrigin: false, thirdParty: true }),
  ];
  const cmp = compareExchanges(a, b, { rules, includeThirdParty: false });
  assert.equal(cmp.counts.matched, 3);
  assert.equal(cmp.counts.onlyOnA, 1);
  assert.equal(cmp.counts.onlyOnB, 1);
  assert.deepEqual(cmp.thirdPartyCount, { A: 1, B: 1 }); // counted, listed, not diffed
  // The harness machinery path is excluded by the named rule.
  assert.equal(cmp.pairs.filter((p) => p.key.includes("__harness")).length, 0);
  // The token param was masked, so the two token URLs paired:
  const tokenPair = cmp.pairs.find((p) => p.key.includes("/update/y"));
  assert.ok(tokenPair, "token URLs should pair under W7");
  assert.equal(tokenPair.verdict, "identical");
});

test("textDiffSummary counts and caps hunks", () => {
  const a = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
  const b = Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? `changed ${i}` : `line ${i}`)).join("\n");
  const s = textDiffSummary(a, b);
  assert.equal(s.differingLines, 10);
  assert.ok(s.hunks.length <= 12);
});

test("explain attribution: a raw-differing, normalized-equal pair credits the rules that applied", () => {
  const cmp = compareExchanges(
    [EX({ seq: 1, setCookieRaw: ["decko_ts_session=tokA"], headersArray: [{ name: "Date", value: "Tue, 15 Nov 1994 08:12:31 GMT" }], bodyText: "<p>same</p>" })],
    [EX({ seq: 1, setCookieRaw: ["decko_ts_session=tokB"], headersArray: [{ name: "Date", value: "Wed, 16 Nov 1994 08:12:31 GMT" }], bodyText: "<p>same</p>" })],
    { rules },
  );
  assert.equal(cmp.pairs[0].verdict, "normalization-explained");
  // The applied counts and the absorbed-diff counts both carry W1 and W5.
  for (const id of ["W1", "W5"]) {
    assert.ok((cmp.pairs[0].appliedA[id]?.applied ?? 0) > 0, `${id} applied count missing`);
    assert.equal(cmp.pairs[0].appliedA[id].explained, 1, `${id} absorbed-diff credit missing`);
    assert.equal(cmp.pairs[0].appliedB[id].explained, 1);
  }
  // A pair that is raw-identical is not credited with absorbing anything.
  const same = compareExchanges([EX({ seq: 1, bodyText: "x" })], [EX({ seq: 1, bodyText: "x" })], { rules });
  assert.equal(same.pairs[0].verdict, "identical");
  assert.deepEqual(same.pairs[0].appliedA, {});
});

// ---- The traffic gate. ----

test("gate: loopback hosts pass", () => {
  assert.equal(assertWalkableBase("http://127.0.0.1:3000", [], "t"), "http://127.0.0.1:3000");
  assert.equal(assertWalkableBase("http://localhost:8080", [], "t"), "http://localhost:8080");
  assert.equal(isLoopbackUrl("http://127.0.0.1:1/x"), true);
});

test("gate: non-loopback hosts refused WITHOUT the flag, before any request", () => {
  for (const url of ["https://culturesmith.com", "https://culturesmith-edge.bunny.run/", "http://intranet.example/x"]) {
    assert.throws(() => assertWalkableBase(url, [], "t"), /refusing to walk non-local host/);
  }
});

test("gate: the exact named host passes with --allow-live-walk; other hosts still refused", () => {
  assert.equal(assertWalkableBase("https://culturesmith.com", ["culturesmith.com"], "t"), "https://culturesmith.com");
  assert.throws(() => assertWalkableBase("https://culturesmith-edge.bunny.run", ["culturesmith.com"], "t"), /refusing to walk non-local host/);
});

test("gate: non-http protocols refused", () => {
  assert.throws(() => assertWalkableBase("ftp://127.0.0.1", [], "t"), /only http\/https/);
  assert.throws(() => assertWalkableBase("not a url", [], "t"), /not a URL/);
});
