// Controls for the search-order comparison module's pure logic: list
// comparison, verdict wording, endpoint discovery, and both surface
// capture parsers against stubbed bodies. Not Decko acceptance — the
// against-real-engines proof is prove-search-order-compare-two-local-engines.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  compareOrderedLists,
  verdictForCapture,
  verifyCardsOnly,
  normalizeHref,
  discoverSearchEndpoints,
  captureAutocomplete,
  captureResultsPage,
  defaultProbeTerms,
} from "../lib/search-order-compare.mjs";

test("compareOrderedLists: extra and missing cards are data; intersection order matches", () => {
  const cmp = compareOrderedLists(
    ["Topic", "Topic 001", "Topic 002"].map((title) => ({ title })),
    ["Topic 000", "Topic", "Topic 002", "Topaz 001"].map((title) => ({ title })),
    (it) => it.title,
  );
  assert.deepEqual(cmp.onlyA, ["Topic 001"]);
  assert.deepEqual(cmp.onlyB, ["Topic 000", "Topaz 001"]);
  assert.deepEqual(cmp.commonA, ["Topic", "Topic 002"]);
  assert.deepEqual(cmp.commonB, ["Topic", "Topic 002"]);
  assert.equal(cmp.identicalOrder, true);
});

test("compareOrderedLists: a reorder of shared cards diverges at its position", () => {
  const cmp = compareOrderedLists(
    ["a", "b", "c"].map((title) => ({ title })),
    ["c", "a", "b"].map((title) => ({ title })),
    (it) => it.title,
  );
  assert.equal(cmp.identicalOrder, false);
  assert.deepEqual(cmp.firstDivergence, { position: 0, hostA: "a", hostB: "c" });
  assert.deepEqual(cmp.commonA, ["a", "b", "c"]);
  assert.deepEqual(cmp.commonB, ["c", "a", "b"]);
});

test("compareOrderedLists: a swap deeper in the list reports that position", () => {
  const cmp = compareOrderedLists(
    ["a", "b", "c", "d"].map((title) => ({ title })),
    ["a", "d", "c", "b"].map((title) => ({ title })),
    (it) => it.title,
  );
  assert.equal(cmp.firstDivergence.position, 1);
});

test("verdictForCapture: identical intersection over data differences reads as data", () => {
  const capA = { ok: true, term: "T", surface: "results", items: [{ title: "Topic" }, { title: "Topic 001" }] };
  const capB = { ok: true, term: "T", surface: "results", items: [{ title: "Topic 000" }, { title: "Topic" }, { title: "Topaz 001" }] };
  const v = verdictForCapture(capA, capB);
  assert.equal(v.kind, "order-identical");
  assert.equal(v.line, "order identical on 1 common results (behavior matches; differences are data)");
  assert.deepEqual(v.cardsOnlyA, ["Topic 001"]);
  assert.deepEqual(v.cardsOnlyB, ["Topic 000", "Topaz 001"]);
});

test("verdictForCapture: same set, different order is a behavior difference with both orderings", () => {
  const items = (names) => names.map((title) => ({ title }));
  const v = verdictForCapture(
    { ok: true, term: "T", surface: "results", items: items(["a", "b", "c"]) },
    { ok: true, term: "T", surface: "results", items: items(["b", "a", "c"]) },
  );
  assert.equal(v.kind, "order-differs");
  assert.equal(v.line, "order differs at position 0 (behavior difference)");
  assert.deepEqual(v.orderingA, ["a", "b", "c"]);
  assert.deepEqual(v.orderingB, ["b", "a", "c"]);
  assert.deepEqual(v.cardsOnlyA, []);
  assert.deepEqual(v.cardsOnlyB, []);
});

test("verdictForCapture: empty and disjoint captures have their own verdicts", () => {
  const empty = verdictForCapture(
    { ok: true, term: "x", surface: "results", items: [] },
    { ok: true, term: "x", surface: "results", items: [] },
  );
  assert.equal(empty.kind, "empty-both");
  const disjoint = verdictForCapture(
    { ok: true, term: "x", surface: "results", items: [{ title: "a" }] },
    { ok: true, term: "x", surface: "results", items: [{ title: "b" }] },
  );
  assert.equal(disjoint.kind, "data-only");
  const failed = verdictForCapture(
    { ok: false, term: "x", surface: "results", error: "HTTP 500" },
    { ok: true, term: "x", surface: "results", items: [] },
  );
  assert.equal(failed.kind, "capture-failed");
  assert.match(failed.line, /host A \(HTTP 500\)/);
});

test("verdictForCapture: autocomplete card discrepancy counts goto items, not the search entry", () => {
  const mk = (names) => ({
    ok: true,
    term: "T",
    surface: "autocomplete",
    items: [
      { action: "search", value: "T", path: "/*search?query%5Bkeyword%5D=T" },
      ...names.map((n) => ({ action: "goto", value: n, path: `/${n.replace(/ /g, "_")}` })),
    ],
  });
  // The shared search entry is itself a common result in identical position,
  // so a pure card-set difference still reads order-identical — the card
  // discrepancy is named separately.
  const v = verdictForCapture(mk(["Topic"]), mk(["Topaz"]));
  assert.equal(v.kind, "order-identical");
  assert.equal(v.line, "order identical on 1 common results (behavior matches; differences are data)");
  assert.deepEqual(v.cardsOnlyA, ["goto:Topic"]);
  assert.deepEqual(v.cardsOnlyB, ["goto:Topaz"]);
  // With no shared item at all, there is no order to read — data-only.
  const disjoint = verdictForCapture(
    { ok: true, term: "T", surface: "autocomplete", items: [{ action: "goto", value: "Topic", path: "/Topic" }] },
    { ok: true, term: "T", surface: "autocomplete", items: [{ action: "goto", value: "Topaz", path: "/Topaz" }] },
  );
  assert.equal(disjoint.kind, "data-only");
});

test("normalizeHref strips each host's own origin and keeps foreign hrefs", () => {
  assert.equal(normalizeHref("http://127.0.0.1:5001/Topic", "http://127.0.0.1:5001"), "/Topic");
  assert.equal(normalizeHref("/Topic", "http://127.0.0.1:5001"), "/Topic");
  assert.equal(normalizeHref("http://live.example/Topic", "http://127.0.0.1:5001"), "http://live.example/Topic");
});

test("discoverSearchEndpoints reads the navbar's own declarations", () => {
  const html = `<form role="search" class="search-box-form" action="/*search" method="get">` +
    `<input name="query[keyword]" data-completepath="/*search/search_box_complete.json" /></form>`;
  assert.deepEqual(discoverSearchEndpoints(html), {
    completepath: "/*search/search_box_complete.json",
    formAction: "/*search",
  });
  assert.equal(discoverSearchEndpoints("<p>no navbar</p>").completepath, null);
});

const stubFetch = (bodies) => async (url) => {
  const hit = Object.entries(bodies).find(([prefix]) => url.startsWith(prefix));
  if (!hit) throw new Error(`unexpected url ${url}`);
  return { status: hit[1].status ?? 200, text: async () => hit[1].body };
};

test("captureAutocomplete parses the JSON array and strips the host origin", async () => {
  const base = "http://127.0.0.1:59962";
  const body = JSON.stringify([
    { url: `${base}/*search?query%5Bkeyword%5D=T`, action: "search", value: "T", label: "..." },
    { url: `${base}/Topic`, action: "goto", value: "Topic", label: "..." },
  ]);
  const cap = await captureAutocomplete(stubFetch({ [base]: { body } }), base, "/*search/search_box_complete.json", "T");
  assert.equal(cap.ok, true);
  assert.deepEqual(cap.items, [
    { action: "search", value: "T", path: "/*search?query%5Bkeyword%5D=T" },
    { action: "goto", value: "Topic", path: "/Topic" },
  ]);
  const bad = await captureAutocomplete(stubFetch({ [base]: { body: '{"nope":1}' } }), base, "/*search/search_box_complete.json", "T");
  assert.equal(bad.ok, false);
  assert.match(bad.error, /not an array/);
  const err = await captureAutocomplete(stubFetch({ [base]: { status: 500, body: "boom" } }), base, "/*search/search_box_complete.json", "T");
  assert.equal(err.ok, false);
  assert.equal(err.error, "HTTP 500");
});

const RESULTS_PAGE = `<!DOCTYPE html><html><body>
<nav><a href="/">Home</a></nav>
<div class="card-list card-list-bar search-result-list">
<div class="search-result-item item-bar"><div class="card-slot" data-card-name="Topic &amp; Co" data-card-link-name="Topic_%26_Co">
<a class="full-page-link known-card" href="/Topic_%26_Co">page</a></div></div>
<div class="search-result-item item-bar"><div class="card-slot" data-card-name="Topic 001" data-card-link-name="Topic_001">
<a class="full-page-link known-card" href="/Topic_001">page</a></div></div>
</div></body></html>`;

test("captureResultsPage extracts the ordered region with decoded titles and hrefs", async () => {
  const base = "http://127.0.0.1:59962";
  const cap = await captureResultsPage(stubFetch({ [base]: { body: RESULTS_PAGE } }), base, "/*search", "Topic");
  assert.equal(cap.ok, true);
  assert.deepEqual(cap.items, [
    { title: "Topic & Co", path: "/Topic_%26_Co" },
    { title: "Topic 001", path: "/Topic_001" },
  ]);
  const empty = await captureResultsPage(stubFetch({ [base]: { body: `<div class="search-no-results"></div>` } }), base, "/*search", "zzz");
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.items, []);
  const noRegion = await captureResultsPage(stubFetch({ [base]: { body: "<html><body>404-ish</body></html>" } }), base, "/*search", "x");
  assert.equal(noRegion.ok, false);
});

test("verifyCardsOnly: bidirectional present-on-both edges reclassify as a selection divergence (behavior)", async () => {
  // Same cards exist on both hosts; each host's page selects a different
  // slice (a ranking difference). Intersection order trivially matches, so
  // without the selection read this would print "behavior matches".
  const v = verdictForCapture(
    { ok: true, term: "t", surface: "autocomplete", items: [
      { action: "search", value: "t", path: "/*search?query%5Bkeyword%5D=t" },
      { action: "goto", value: "Alpha", path: "/Alpha" },
      { action: "goto", value: "Bravo", path: "/Bravo" },
    ] },
    { ok: true, term: "t", surface: "autocomplete", items: [
      { action: "search", value: "t", path: "/*search?query%5Bkeyword%5D=t" },
      { action: "goto", value: "Yankee", path: "/Yankee" },
      { action: "goto", value: "Zulu", path: "/Zulu" },
    ] },
  );
  assert.equal(v.kind, "order-identical"); // before verification
  const fetchStub = async () => ({ status: 200, text: async () => "page" }); // every card exists on both hosts
  await verifyCardsOnly(v, "http://a.test", "http://b.test", { fetchImpl: fetchStub });
  assert.equal(v.kind, "order-differs");
  assert.equal(v.selectionDivergence, true);
  assert.match(v.line, /order differs in selection/);
  assert.match(v.line, /\(behavior difference\)/);
  assert.deepEqual(v.orderingA, ["search:t", "goto:Alpha", "goto:Bravo"]);
  assert.deepEqual(v.orderingB, ["search:t", "goto:Yankee", "goto:Zulu"]);
  // Unidirectional edges stay "differences are data" (deck-size displacement).
  const oneSided = verdictForCapture(
    { ok: true, term: "t", surface: "results", items: [{ title: "Shared" }, { title: "Edge" }] },
    { ok: true, term: "t", surface: "results", items: [{ title: "Newcomer" }, { title: "Shared" }] },
  );
  await verifyCardsOnly(oneSided, "http://a.test", "http://b.test", { fetchImpl: fetchStub });
  assert.equal(oneSided.kind, "order-identical");
  assert.equal(oneSided.line, "order identical on 1 common results (behavior matches; differences are data)");
  // A verified absence on either side also keeps the data verdict, even with
  // edges in both directions.
  const withAbsence = verdictForCapture(
    { ok: true, term: "t", surface: "results", items: [{ title: "Shared", path: "/Shared" }, { title: "EdgeA", path: "/EdgeA" }, { title: "MissingOnB", path: "/MissingOnB" }] },
    { ok: true, term: "t", surface: "results", items: [{ title: "Shared", path: "/Shared" }, { title: "EdgeB", path: "/EdgeB" }] },
  );
  const fetchMissing = async (url) => ({ status: url.includes("MissingOnB") ? 404 : 200, text: async () => "page" });
  await verifyCardsOnly(withAbsence, "http://a.test", "http://b.test", { fetchImpl: fetchMissing });
  assert.equal(withAbsence.kind, "order-identical");
  assert.deepEqual(withAbsence.cardsAbsentA, ["MissingOnB"]);
  assert.deepEqual(withAbsence.windowEdgeB, ["EdgeB"]);
  // Fully disjoint non-empty windows whose every card exists on the other
  // host are the extreme selection divergence — behavior, not data.
  const disjointWindows = verdictForCapture(
    { ok: true, term: "t", surface: "results", items: [{ title: "Oldest", path: "/Oldest" }, { title: "Older", path: "/Older" }] },
    { ok: true, term: "t", surface: "results", items: [{ title: "Newest", path: "/Newest" }, { title: "Newer", path: "/Newer" }] },
  );
  assert.equal(disjointWindows.kind, "data-only"); // before verification
  await verifyCardsOnly(disjointWindows, "http://a.test", "http://b.test", { fetchImpl: fetchStub });
  assert.equal(disjointWindows.kind, "order-differs");
  assert.equal(disjointWindows.selectionDivergence, true);
  assert.match(disjointWindows.line, /select different windows from the same deck/);
  assert.deepEqual(disjointWindows.orderingA, ["Oldest", "Older"]);
  assert.deepEqual(disjointWindows.orderingB, ["Newest", "Newer"]);
  // A one-sided disjoint window (one host genuinely lacks the cards) stays data.
  const oneSidedDisjoint = verdictForCapture(
    { ok: true, term: "zz", surface: "results", items: [] },
    { ok: true, term: "zz", surface: "results", items: [{ title: "Topaz 001", path: "/Topaz_001" }] },
  );
  await verifyCardsOnly(oneSidedDisjoint, "http://a.test", "http://b.test", { fetchImpl: fetchMissing });
  assert.equal(oneSidedDisjoint.kind, "data-only");
});

test("defaultProbeTerms: letters plus partial words plus the exact name", () => {
  const terms = defaultProbeTerms({ partialWords: ["Top"], exactName: "Topic 003" });
  assert.equal(terms.length, 26 + 1 + 1);
  assert.deepEqual(terms.slice(26), ["Top", "Topic 003"]);
});

test("verifyCardsOnly: a card present on the other host is a window edge, a 404 is real absence", async () => {
  const v = verdictForCapture(
    { ok: true, term: "T", surface: "results", items: [{ title: "Edge", path: "/Edge" }, { title: "Ghost", path: "/Ghost" }] },
    { ok: true, term: "T", surface: "results", items: [{ title: "Shared", path: "/Shared" }] },
  );
  const fetchStub = async (url) => ({
    status: url.includes("/Ghost") ? 404 : 200,
    text: async () => "page",
  });
  await verifyCardsOnly(v, "http://a.test", "http://b.test", { fetchImpl: fetchStub });
  // Edge: host A's page shows it, host B answers 200 for it -> window edge.
  // Ghost: host B answers 404 -> verified deck absence.
  assert.deepEqual(v.cardsAbsentA, ["Ghost"]);
  assert.deepEqual(v.windowEdgeA, ["Edge"]);
  assert.deepEqual(v.unverifiedA, []);
  // Host B has no only-candidates.
  assert.deepEqual(v.cardsAbsentB, []);
  // A candidate with no captured path stays unverified, never guessed absent.
  const noPath = verdictForCapture(
    { ok: true, term: "T", surface: "results", items: [{ title: "Mystery", path: null }] },
    { ok: true, term: "T", surface: "results", items: [{ title: "Shared", path: "/Shared" }] },
  );
  await verifyCardsOnly(noPath, "http://a.test", "http://b.test", { fetchImpl: fetchStub });
  assert.deepEqual(noPath.cardsAbsentA, []);
  assert.deepEqual(noPath.unverifiedA, ["Mystery"]);
  // A host error is unverified, not absence.
  const failing = verdictForCapture(
    { ok: true, term: "T", surface: "results", items: [{ title: "X", path: "/X" }] },
    { ok: true, term: "T", surface: "results", items: [{ title: "Shared", path: "/Shared" }] },
  );
  await verifyCardsOnly(failing, "http://a.test", "http://b.test", { fetchImpl: async () => { throw new Error("down"); } });
  assert.deepEqual(failing.cardsAbsentA, []);
  assert.deepEqual(failing.unverifiedA, ["X"]);
});
