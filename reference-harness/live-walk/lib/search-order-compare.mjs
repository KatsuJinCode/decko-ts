// search-order-compare.mjs — the search-order comparison module for the live
// walk. Given two base URLs and a probe-term list (default: each letter a–z
// plus a set of partial words and an exact card name), it walks BOTH search
// surfaces a person touches — the navbox autocomplete (one request per typed
// term, the `data-completepath` the navbar itself declares) and the search
// results page (the `search-box-form` action the same navbar submits on
// Enter) — on both hosts, captures the ORDERED result lists (titles + hrefs),
// and splits every difference into the two questions the walk exists to
// answer:
//
//   DATA  — cards only on host A, cards only on host B. The expected
//           card-set discrepancy: the live deck has cards ours lacks and
//           some slightly edited cards (renames fall out here too). Reported
//           separately, never conflated with behavior.
//   ORDER — the sequence of the INTERSECTION (cards present on both hosts),
//           compared in each host's own order. Identical order over the
//           common set means the ranking BEHAVIOR matches and every observed
//           difference is data; a divergence at position k is a behavior
//           difference, shown with both orderings.
//
// Surfaces:
//   autocomplete — GET <completepath>?term=<t>; the JSON array of
//     {url, action, value, label} items (src/card/mod-loader/mods/
//     card-mod-search.ts:726 search_box_complete view: action "search"
//     always first, then optional "add", then the goto items, sorted by the
//     CQL `sort_by: "name"` seat, render.ts prepareSearchBoxComplete).
//     Item identity for ordering: `${action}:${value}`; the card-set
//     discrepancy counts the goto items (the actual cards).
//   results — GET <form action>?query[keyword]=<t>; the html page's
//     `search-result-list` region, one ordered entry per
//     `search-result-item` (title = data-card-name, href = the item's
//     full-page-link anchor). Item identity: the title.
//
// Both hosts' hrefs are normalized against their own base (the autocomplete
// embeds absolute URLs carrying each host's origin), so a live host and a
// local port compare path-to-path. The endpoint paths themselves are read
// off each host's rendered home page, not assumed: a host whose navbar
// declares a different completepath or form action is itself a finding,
// reported in `discovery`.
//
// Requests run strictly sequentially, one host after the other, one term
// after the next — the walk is a person typing, not a load test; keep it
// gentle against any host you did not boot yourself.

// The default probe terms when the caller gives none: every letter, a set of
// partial words, and an exact card name. The partial words and exact name
// are stock-Decko-plausible; for a live walk pass the deck's own words via
// --partial/--exact (compare-search-order.mjs).
export const DEFAULT_LETTER_PROBES = "abcdefghijklmnopqrstuvwxyz".split("");
export const DEFAULT_PARTIAL_WORDS = ["Home", "Search", "Recent", "Help"];
export const DEFAULT_EXACT_NAME = "Home";

export function defaultProbeTerms({
  letters = DEFAULT_LETTER_PROBES,
  partialWords = DEFAULT_PARTIAL_WORDS,
  exactName = DEFAULT_EXACT_NAME,
} = {}) {
  return [...letters, ...partialWords, exactName];
}

const decodeEntities = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Strip the host's own origin off an href, so both hosts compare as paths.
 *  Absolute URLs carrying the host base become paths; relative hrefs pass
 *  through. */
export function normalizeHref(href, base) {
  if (typeof href !== "string") return href;
  if (base && (href.startsWith(base + "/") || href === base)) return href.slice(base.length) || "/";
  return href;
}

/** Read the search endpoints off a rendered page rather than assuming them.
 *  Returns { completepath, formAction } — either null when the navbar did
 *  not render a search box, which is itself a finding. */
export function discoverSearchEndpoints(homeHtml) {
  return {
    completepath: /data-completepath="([^"]*)"/.exec(homeHtml ?? "")?.[1] ?? null,
    formAction: /<form[^>]*class="[^"]*search-box-form[^"]*"[^>]*action="([^"]*)"/.exec(homeHtml ?? "")?.[1]
      ?? /<form[^>]*action="([^"]*)"[^>]*class="[^"]*search-box-form[^"]*"/.exec(homeHtml ?? "")?.[1] ?? null,
  };
}

// A plain GET, with its own abort timer. The timer's handle is unref'd: a
// pending timeout must not hold the process open (or trip libuv's exit
// assertion on win32) after the walk is done.
async function getText(fetchImpl, base, path, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const res = await fetchImpl(base + path, { headers: { connection: "close", ...headers }, signal: controller.signal });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** One autocomplete keystroke against one host. The navbox's jQuery UI
 *  autocomplete sends `x-requested-with: XMLHttpRequest`, and the engine
 *  renders XHR requests WITHOUT the navbar layout — so this header rides
 *  the autocomplete request only (where the real browser sends it), never
 *  the discovery or results-page GETs (where it would strip the very
 *  markup those captures parse). Returns the ordered item list
 *  [{action, value, path}] plus capture metadata; ok=false carries the
 *  failure instead of inventing an empty list. */
export async function captureAutocomplete(fetchImpl, base, completepath, term, { timeoutMs = 15_000 } = {}) {
  let res;
  try {
    res = await getText(
      fetchImpl,
      base,
      `${completepath}?term=${encodeURIComponent(term)}`,
      timeoutMs,
      { "x-requested-with": "XMLHttpRequest" },
    );
  } catch (e) {
    return { ok: false, term, surface: "autocomplete", error: `request failed: ${e?.message ?? e}` };
  }
  if (res.status !== 200) {
    return { ok: false, term, surface: "autocomplete", error: `HTTP ${res.status}`, bodyPreview: res.body.slice(0, 200) };
  }
  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return { ok: false, term, surface: "autocomplete", error: "body is not JSON (autocomplete would render nothing)" };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, term, surface: "autocomplete", error: "JSON body is not an array (autocomplete would render nothing)" };
  }
  const items = parsed
    .filter((it) => it && typeof it === "object")
    .map((it) => ({
      action: String(it.action ?? ""),
      value: it.value === null || it.value === undefined ? null : String(it.value),
      path: normalizeHref(String(it.url ?? ""), base),
    }));
  return { ok: true, term, surface: "autocomplete", items };
}

const RESULT_LIST_MARK = "search-result-list";
const RESULT_ITEM_MARK = "search-result-item";
const NO_RESULTS_MARK = "search-no-results";

/** One results-page submission (what Enter does) against one host. Scoped
 *  to the page's search-result-list region — never the navbar or menu
 *  chrome. An empty result set is a valid ordered capture of zero items
 *  (the page's own search-no-results div). */
export async function captureResultsPage(fetchImpl, base, formAction, term, { timeoutMs = 15_000 } = {}) {
  let res;
  try {
    res = await getText(fetchImpl, base, `${formAction}?query%5Bkeyword%5D=${encodeURIComponent(term)}`, timeoutMs);
  } catch (e) {
    return { ok: false, term, surface: "results", error: `request failed: ${e?.message ?? e}` };
  }
  if (res.status !== 200) {
    return { ok: false, term, surface: "results", error: `HTTP ${res.status}`, bodyPreview: res.body.slice(0, 200) };
  }
  const body = res.body;
  const listStart = body.indexOf(RESULT_LIST_MARK);
  if (listStart === -1) {
    if (body.includes(NO_RESULTS_MARK)) return { ok: true, term, surface: "results", items: [] };
    return { ok: false, term, surface: "results", error: "no search-result-list region on the results page" };
  }
  // The region runs to the item-class's last occurrence; every item carries
  // the marker class, so split on the marker inside the region only.
  const region = body.slice(listStart);
  const chunks = region.split(RESULT_ITEM_MARK).slice(1);
  const items = chunks.map((chunk) => {
    const nameAttr = /data-card-name="([^"]*)"/.exec(chunk)?.[1];
    const linkAttr = /<a[^>]*class="[^"]*full-page-link[^"]*"[^>]*href="([^"]*)"/.exec(chunk)?.[1]
      ?? /<a[^>]*href="([^"]*)"[^>]*class="[^"]*full-page-link[^"]*"/.exec(chunk)?.[1]
      ?? /data-card-link-name="([^"]*)"/.exec(chunk)?.[1];
    return {
      title: nameAttr === undefined ? null : decodeEntities(nameAttr),
      path: linkAttr === undefined ? null : normalizeHref(decodeEntities(linkAttr), base),
    };
  });
  return { ok: true, term, surface: "results", items };
}

const keyOfAutocompleteItem = (it) => `${it.action}:${it.value ?? ""}`;
const keyOfResultItem = (it) => `${it.title ?? ""}`;

/** Split two ordered captures into the data discrepancy and the common-set
 *  order verdict. keyOf maps an item to its cross-host identity. */
export function compareOrderedLists(listA, listB, keyOf) {
  const keysA = listA.map(keyOf);
  const keysB = listB.map(keyOf);
  const setA = new Set(keysA);
  const setB = new Set(keysB);
  const onlyA = keysA.filter((k) => !setB.has(k));
  const onlyB = keysB.filter((k) => !setA.has(k));
  const dedup = (arr) => [...new Set(arr)];
  const commonA = dedup(keysA.filter((k) => setB.has(k)));
  const commonB = dedup(keysB.filter((k) => setA.has(k)));
  let firstDivergence = null;
  const n = Math.max(commonA.length, commonB.length);
  for (let i = 0; i < n; i++) {
    if (commonA[i] !== commonB[i]) {
      firstDivergence = { position: i, hostA: commonA[i] ?? "(end)", hostB: commonB[i] ?? "(end)" };
      break;
    }
  }
  return {
    onlyA,
    onlyB,
    commonA,
    commonB,
    commonCount: commonA.length,
    identicalOrder: firstDivergence === null,
    firstDivergence,
    // Same-title href disagreement: a same-card difference that is not order
    // (path change, edited card) — an annotation, never folded into order.
    hrefMismatch: [...commonA]
      .map((k, i) => ({ k, a: listA[keysA.indexOf(k)]?.path, b: listB[keysB.indexOf(k)]?.path }))
      .filter((x) => x.a !== x.b)
      .map((x) => ({ key: x.k, pathA: x.a, pathB: x.b })),
  };
}

/** The verdict object for one probe term on one surface. The verdict lines
 *  are the walk's output: data differences name the cards; order speaks
 *  behavior. */
export function verdictForCapture(capA, capB) {
  if (!capA.ok || !capB.ok) {
    const failed = [!capA.ok ? `host A (${capA.error})` : null, !capB.ok ? `host B (${capB.error})` : null].filter(Boolean);
    return { kind: "capture-failed", line: `capture failed: ${failed.join("; ")}`, detail: { capA, capB } };
  }
  const isAutocomplete = capA.surface === "autocomplete";
  const keyOf = isAutocomplete ? keyOfAutocompleteItem : keyOfResultItem;
  const cmp = compareOrderedLists(capA.items, capB.items, keyOf);
  const cardLabel = isAutocomplete ? "items" : "cards";
  // The card-set discrepancy CANDIDATES are the card difference at the
  // captured surface: goto items on the autocomplete, every entry on the
  // results page. verifyCardsOnly then checks each candidate against the
  // other host's own card page, splitting page-membership (window edge)
  // from real deck absence — the live deck legitimately shifts page-1
  // membership without missing any card.
  const cardsOnlyA = isAutocomplete ? cmp.onlyA.filter((k) => k.startsWith("goto:")) : cmp.onlyA;
  const cardsOnlyB = isAutocomplete ? cmp.onlyB.filter((k) => k.startsWith("goto:")) : cmp.onlyB;
  const pathOf = (side, key) => {
    const items = side === "A" ? capA.items : capB.items;
    const keys = items.map(keyOf);
    return items[keys.indexOf(key)]?.path ?? null;
  };
  const base = {
    surface: capA.surface,
    compare: cmp,
    cardsOnlyA,
    cardsOnlyB,
    pathsOnlyA: Object.fromEntries(cardsOnlyA.map((k) => [k, pathOf("A", k)])),
    pathsOnlyB: Object.fromEntries(cardsOnlyB.map((k) => [k, pathOf("B", k)])),
    // The full captured orders (both hosts), so a selection divergence can
    // show the two orderings the way an in-intersection divergence does.
    capturedOrderA: capA.items.map(keyOf),
    capturedOrderB: capB.items.map(keyOf),
  };
  if (capA.items.length === 0 && capB.items.length === 0) {
    return { ...base, kind: "empty-both", line: "no results on either host (nothing to compare)" };
  }
  if (cmp.commonCount === 0) {
    return {
      ...base,
      kind: "data-only",
      line: `no common ${cardLabel}; cannot read order — differences are data (host A only: ${cmp.onlyA.length}, host B only: ${cmp.onlyB.length})`,
    };
  }
  if (cmp.identicalOrder) {
    return {
      ...base,
      kind: "order-identical",
      line: `order identical on ${cmp.commonCount} common results (behavior matches; differences are data)`,
    };
  }
  return {
    ...base,
    kind: "order-differs",
    line: `order differs at position ${cmp.firstDivergence.position} (behavior difference)`,
    orderingA: cmp.commonA,
    orderingB: cmp.commonB,
  };
}

/** Split a verdict's cards-only candidates into real deck absence and
 *  window-edge membership: each candidate's own card page is requested on
 *  the other host — 200 means the card EXISTS there (it merely fell outside
 *  the other host's captured page — a window edge of the expected card-set
 *  discrepancy, not a missing card), 404/410 means the deck genuinely lacks
 *  it, and anything else is "unverified" (kept out of both buckets rather
 *  than guessed). Candidates without a captured path stay unverified. */
export async function verifyCardsOnly(verdict, baseA, baseB, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  if (!verdict?.cardsOnlyA && !verdict?.cardsOnlyB) return verdict;
  const check = async (path, otherBase) => {
    if (!path) return "unverified";
    const probe = async (p) => {
      try {
        const { status } = await getText(fetchImpl, otherBase, p, timeoutMs);
        if (status === 200) return "present";
        if (status === 404 || status === 410) return "absent";
        return "unverified";
      } catch {
        return "unverified";
      }
    };
    // The card page first (what a person visits); when that render fails
    // (a 500 on a rule card, say — the deck knows the card, its HTML page
    // is just red), the .json form answers presence cleanly.
    const page = await probe(path);
    if (page !== "unverified") return page;
    return probe(`${path}.json`);
  };
  for (const side of ["A", "B"]) {
    const cards = verdict[`cardsOnly${side}`] ?? [];
    const paths = verdict[`pathsOnly${side}`] ?? {};
    const otherBase = side === "A" ? baseB : baseA;
    const presence = {};
    for (const key of cards) presence[key] = await check(paths[key], otherBase);
    verdict[`cardsAbsent${side}`] = cards.filter((k) => presence[k] === "absent");
    verdict[`windowEdge${side}`] = cards.filter((k) => presence[k] === "present");
    verdict[`unverified${side}`] = cards.filter((k) => presence[k] === "unverified");
  }
  // Selection divergence, two shapes: (a) the intersection's relative order
  // matches but each host's page holds cards the other's does not; (b) the
  // windows are fully disjoint (data-only) yet both captures are non-empty.
  // In both, verification proved every candidate EXISTS on the other host
  // (no verified deck absence, nothing unverified). With identical ranking
  // that combination is impossible: a shared card inside one host's top-N
  // but outside the other's forces a verified absence on the opposite side
  // (the card that displaced it), and two non-empty windows of the same
  // identically-ranked deck always share at least their top card. So
  // present-on-both across non-matching windows can only mean the two
  // engines rank the same cards differently — a behavior difference whose
  // two orderings are the full captured lists.
  const fullyVerified = (verdict.cardsAbsentA?.length ?? 0) === 0
    && (verdict.cardsAbsentB?.length ?? 0) === 0
    && (verdict.unverifiedA?.length ?? 0) === 0
    && (verdict.unverifiedB?.length ?? 0) === 0;
  const selectionDiverges = fullyVerified && (
    ((verdict.windowEdgeA?.length ?? 0) > 0 && (verdict.windowEdgeB?.length ?? 0) > 0)
    || (verdict.kind === "data-only" && (verdict.cardsOnlyA?.length ?? 0) > 0 && (verdict.cardsOnlyB?.length ?? 0) > 0)
  );
  if (verdict.kind === "order-identical" && selectionDiverges) {
    verdict.kind = "order-differs";
    verdict.selectionDivergence = true;
    verdict.line = `order differs in selection: host A's page holds ${verdict.windowEdgeA.length} card(s) host B's page does not and vice versa (${verdict.windowEdgeB.length}), all present on both hosts — the engines rank the same cards differently (behavior difference)`;
    verdict.orderingA = verdict.capturedOrderA;
    verdict.orderingB = verdict.capturedOrderB;
  } else if (verdict.kind === "data-only" && selectionDiverges) {
    verdict.kind = "order-differs";
    verdict.selectionDivergence = true;
    verdict.line = `no common results, and every card on each host's page exists on the other host — the engines select different windows from the same deck (behavior difference)`;
    verdict.orderingA = verdict.capturedOrderA;
    verdict.orderingB = verdict.capturedOrderB;
  }
  return verdict;
}

/** The full walk keeps terms and surfaces sequential on each origin.
 *  Independent origins answer the same step together; one origin never
 *  receives overlapping requests, including when both labels name it. */
export async function walkAndCompare(
  hostA,
  hostB,
  {
    terms = defaultProbeTerms(),
    fetchImpl = fetch,
    timeoutMs = 15_000,
    homePath = "/",
  } = {},
) {
  const bases = { A: String(hostA).replace(/\/$/, ""), B: String(hostB).replace(/\/$/, "") };
  let sameOrigin = true;
  try { sameOrigin = new URL(bases.A).origin === new URL(bases.B).origin; } catch { /* discovery reports invalid bases */ }
  const paired = async capture => sameOrigin
    ? [await capture("A"), await capture("B")]
    : Promise.all(["A", "B"].map(capture));
  const discovery = { A: null, B: null };
  await paired(async side => {
    try {
      const res = await getText(fetchImpl, bases[side], homePath, timeoutMs);
      const endpoints = res.status === 200
        ? discoverSearchEndpoints(res.body)
        : { completepath: null, formAction: null };
      discovery[side] = {
        base: bases[side],
        homeStatus: res.status,
        ...endpoints,
        ok: res.status === 200 && endpoints.completepath !== null && endpoints.formAction !== null,
      };
    } catch (e) {
      discovery[side] = { base: bases[side], ok: false, error: `home page request failed: ${e?.message ?? e}` };
    }
  });
  const failedDiscovery = ["A", "B"].filter((s) => !discovery[s].ok);
  if (failedDiscovery.length > 0) {
    return { hostA: bases.A, hostB: bases.B, discovery, probes: [], summary: null, discoveryFailed: failedDiscovery };
  }
  if (discovery.A.completepath !== discovery.B.completepath || discovery.A.formAction !== discovery.B.formAction) {
    // Different declared endpoints are a finding in their own right; the
    // walk continues but annotates every capture with it.
    discovery.endpointDifference = {
      completepath: { A: discovery.A.completepath, B: discovery.B.completepath },
      formAction: { A: discovery.A.formAction, B: discovery.B.formAction },
    };
  }
  const probes = [];
  for (const term of terms) {
    const surfaces = {};
    for (const surface of ["autocomplete", "results"]) {
      const [capA, capB] = await paired(side => surface === "autocomplete"
        ? captureAutocomplete(fetchImpl, bases[side], discovery[side].completepath, term, { timeoutMs })
        : captureResultsPage(fetchImpl, bases[side], discovery[side].formAction, term, { timeoutMs }));
      surfaces[surface] = await verifyCardsOnly(verdictForCapture(capA, capB), bases.A, bases.B, { fetchImpl, timeoutMs });
    }
    probes.push({ term, surfaces });
  }
  const summary = { orderIdentical: 0, orderDiffers: 0, dataOnly: 0, emptyBoth: 0, captureFailed: 0 };
  for (const p of probes) {
    for (const v of Object.values(p.surfaces)) summary[{
      "order-identical": "orderIdentical",
      "order-differs": "orderDiffers",
      "data-only": "dataOnly",
      "empty-both": "emptyBoth",
      "capture-failed": "captureFailed",
    }[v.kind]]++;
  }
  return { hostA: bases.A, hostB: bases.B, discovery, probes, summary };
}

/** The printable verdict lines for one probe: one line per surface, the
 *  orderings shown whenever order differs, the card-set discrepancy split
 *  into verified deck absence, window-edge membership, and unverified. */
export function verdictLinesForProbe(probe) {
  const lines = [];
  for (const [surface, v] of Object.entries(probe.surfaces)) {
    lines.push(`  [${surface}] ${v.line}`);
    if (v.kind === "order-differs") {
      lines.push(`    host A order: ${JSON.stringify(v.orderingA)}`);
      lines.push(`    host B order: ${JSON.stringify(v.orderingB)}`);
    }
    for (const side of ["A", "B"]) {
      const absent = v[`cardsAbsent${side}`] ?? [];
      const edge = v[`windowEdge${side}`] ?? [];
      const unverified = v[`unverified${side}`] ?? [];
      if (absent.length > 0) lines.push(`    cards only on host ${side} (absent from the other host's deck): ${JSON.stringify(absent)}`);
      if (edge.length > 0) lines.push(`    cards on host ${side}'s page only, present on the other host (window edge, not deck absence): ${JSON.stringify(edge)}`);
      if (unverified.length > 0) lines.push(`    cards on host ${side}'s page only, presence on the other host UNVERIFIED: ${JSON.stringify(unverified)}`);
    }
    if (v.compare?.hrefMismatch?.length > 0) {
      lines.push(`    same-title href mismatch (not order): ${JSON.stringify(v.compare.hrefMismatch)}`);
    }
  }
  return lines;
}
