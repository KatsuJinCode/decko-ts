// census-era-fields.mjs -- the LOAD-BEARING GATE for this lane's transform.
//
// A byte splice of the engine's frozen output into the corpus is only
// legitimate if EVERY divergence region between the corpus bytes and that
// frozen output is serializer-ERA class. If any region is some other class
// (name_context, deck content, ordering), the splice would launder that
// divergence into the corpus as if the engine had settled it, and the corpus
// would stop being a record of what the live site served.
//
// R2 ran exactly this gate on its 47 view entries
// (r2-era-normalization-lane.md step 1) and found three buckets, all
// serializer-era seams. This runs the same classification on the 11 page
// entries, over the repo's OWN cross-check walk
// (tools/oracle/report-divergence-regions-for-captured-render-pair.mjs:57-78,
// the longest-common-suffix cut) rather than the probe's RESYNC window: the
// RESYNC walk collapses an entry whose frozen emission inserts material with
// no 40-byte common run into one non-resynced tail, which cannot be
// classified.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

// The census must walk the sides the way the GRADE compares them, not the way
// the recorder wrote them. `compareNormalized` (src/testing/diff.ts:280-286)
// judges every canvas entry through `normalizeForReplay` (diff.ts:188-193):
// normalizeCloudflareChallengeBlocks(normalizeModObjectAddresses(
// normalizeAccordionGroupIds(normalizeSlotIds(html)))). The single most
// important member of that chain for THIS lane is the Cloudflare mask: all 49
// head49 page entries carry a per-response `__CF$cv$params` script block
// (head49-precheck-lane.md step 1: 39 + 7 + 3 across the 49), and it is
// ~900-1000 bytes. A census that applies only the slot-id rule sees that block
// as a real divergence -- MEASURED here: 7 unclassified tail regions of
// -938..-1002 bytes each, one per entry, which is exactly the CF block's size.
// The rule is imported from the engine, not reimplemented, so the census cannot
// drift from the judge.
const HERE = path.dirname(pathToFileURL(import.meta.url).pathname.replace(/^\//, "").replace(/^(?=[A-Za-z]:)/, "/"));
const REPO = path.resolve(process.cwd());
register(pathToFileURL(path.join(REPO, "tools", "oracle", "typescript-source-loader.mjs")).href);
const { normalizeForReplay } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);
const normalizeSlotIds = normalizeForReplay;

const PROBE_DIR = process.argv.includes("--probe-dir")
  ? process.argv[process.argv.indexOf("--probe-dir") + 1]
  : "tmp/pageera/probe-graded-prestate";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";

// Each marker names a serializer-era SEAM in this engine, with the file:line
// that gates it. A region is ERA only if every distinct marker it carries is in
// this table; a region carrying none of them is UNCLASSIFIED and REFUSES.
const ERA_SEAMS = [
  {
    id: "show-key-root-drop",
    file: "src/card/render/format.ts:406-414",
    note: "emittedShow = serializerFollowsLive() ? show.filter(...) : show -- the live serializer DROPS the view field from a view-lane root's show list; the frozen one emits show verbatim",
    re: /&quot;show&quot;:\[[^\]]*\]/g,
  },
  {
    id: "accordion-button-class",
    file: "src/card/mod-loader/mods/core-mod.ts:340-344",
    note: "class-token ORDER: live ['accordion-button', collapsed] vs frozen ['collapsed', 'accordion-button']",
    re: /class=['"](?:accordion-button collapsed|collapsed accordion-button)['"]/g,
  },
  {
    id: "accordion-collapse-class",
    file: "src/card/mod-loader/mods/core-mod.ts:345-350",
    note: "collapseClasses order: live [accordion-collapse, collapse, show] vs frozen [show, accordion-collapse, collapse]",
    re: /class=['"](?:accordion-collapse collapse show|show accordion-collapse collapse)['"]/g,
  },
  {
    id: "accordion-body-class-order",
    file: "src/card/mod-loader/mods/core-mod.ts:366",
    note: "live 'd0-card-body accordion-body' vs frozen 'accordion-body d0-card-body'",
    re: /class=['"](?:d0-card-body accordion-body|accordion-body d0-card-body)['"]/g,
  },
  {
    id: "bar-class-token-order",
    file: "src/card/render/pointer-list.ts:564 (bar class-token order seam)",
    note: "live computes classy() output FIRST then the haml statics; frozen emits the statics first then the computed output -- same token SET, different order",
    re: /class=['"][^'"]*\bbar\b[^'"]*['"]/g,
  },
];

// Markers that are the OTHER axes. Their PRESENCE in a region is a refusal,
// not a pass: it means the splice would move a non-era divergence.
const FOREIGN_MARKERS = [
  { id: "css-revision-digits", file: "src/card/render/head-views.ts:213", re: /\/(files|styles)\/\d+\/\d{6,}\.css/g },
  { id: "script-integrity", file: "src/card/render/page.ts:899", re: /integrity=['"]sha(?:256|512)-/g },
  { id: "footer-decko-version", file: "src/card/render/views.ts:774", re: /Decko v\d+\.\d+\.\d+/g },
  { id: "recaptcha-site-key", file: "src/card/render/views.ts:1498", re: /6L[A-Za-z0-9_-]{38}/g },
  { id: "decko-root-url", file: "src/card/render/page.ts:829", re: /https:\/\/culturesmith\.com\//g },
  { id: "slot-name-context", file: "relnames port (M1 root-context seat)", re: /&quot;name_context&quot;:/g },
];

// A RESYNC walk with a SHORT window, not the repo's longest-common-suffix cut.
// MEASURED REASON: on a page the frozen emission reorders class tokens at
// dozens of sites, so after the first difference the longest-common-suffix
// cut jumps straight past every later difference site and the whole entry
// collapses into ONE region (measured: 11 entries -> 11 regions, each ~-950
// bytes, spanning from the first class-order site to the end). A collapsed
// region cannot be classified, because any marker anywhere in it matches. A
// 16-code-unit resync window localizes the class-order sites, which are
// surrounded by long identical runs. The suffix cut is kept as the fallback
// for a tail that never resyncs, so nothing is silently dropped.
const RESYNC = 16;
function regions(expected, actual) {
  const e = normalizeSlotIds(expected);
  const a = normalizeSlotIds(actual);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < e.length || j < a.length) {
    while (i < e.length && j < a.length && e[i] === a[j]) { i += 1; j += 1; }
    if (i >= e.length && j >= a.length) break;
    const ei = i;
    const aj = j;
    let k = -1;
    const limit = Math.min(e.length - i, a.length - j) - RESYNC;
    for (let t = 1; t <= limit; t += 1) {
      let ok = true;
      for (let m = 0; m < RESYNC; m += 1) {
        if (e[i + t + m] !== a[j + t + m]) { ok = false; break; }
      }
      if (ok) { k = t; break; }
    }
    if (k === -1) {
      // tail that never resyncs: fall back to the repo's suffix cut.
      let suffix = 0;
      const min = Math.min(e.length, a.length);
      while (suffix < min && e[e.length - 1 - suffix] === a[a.length - 1 - suffix]) suffix += 1;
      const eEnd = e.length - suffix;
      const aEnd = a.length - suffix;
      if (eEnd <= i && aEnd <= j) break;
      out.push({ expectedStart: ei, actualStart: aj, expectedLen: eEnd - i, actualLen: aEnd - j, e, a, ei, aj, eEnd, aEnd, resynced: false });
      break;
    }
    out.push({ expectedStart: ei, actualStart: aj, expectedLen: k, actualLen: k, e, a, ei, aj, eEnd: i + k, aEnd: j + k, resynced: true });
    i += k;
    j += k;
  }
  return out;
}

/** Multiset of a marker's matches on one side, for a side-vs-side comparison.
 *  A marker that appears IDENTICALLY on both sides is not a divergence: the
 *  graded arm arms the head constants, so both sides legitimately carry
 *  `Decko v0.19.1`, the live rootUrl and the SRI attrs. Flagging those would
 *  refuse the transform for matching bytes. */
const bag = (s, re) => (s.match(re) || []).slice().sort();

const results = [];
const bucketTally = new Map();
let unclassified = 0;
let foreign = 0;

for (const f of readdirSync(PROBE_DIR).sort()) {
  if (!f.startsWith("expected--") || !f.endsWith(".html")) continue;
  const actualFile = path.join(PROBE_DIR, f.replace(/^expected--/, "actual--"));
  const expected = readFileSync(path.join(PROBE_DIR, f), "utf8");
  const actual = readFileSync(actualFile, "utf8");
  const tag = f.slice("expected--".length, -".html".length).split("__").join(":");
  if (normalizeSlotIds(expected) === normalizeSlotIds(actual)) {
    results.push({ tag, verdict: "BYTE-IDENTICAL", regions: 0 });
    continue;
  }
  const rs = regions(expected, actual);
  const per = [];
  for (const r of rs) {
    // Slice BOTH sides from the NORMALIZED strings, so a region's text and its
    // offsets agree. (The probe's window display slices raw text at normalized
    // offsets, which lands mid-slot-id once ids have been rewritten shorter --
    // that artifact is not a divergence and is not classified here.)
    const eText = r.e.slice(r.ei, r.eEnd);
    const aText = r.a.slice(r.aj, r.aEnd);
    // Marker detection runs over a CONTEXT WINDOW around each region, not the
    // region slice. With a 16-unit resync the regions are a few code units
    // wide -- the swapped tokens themselves (`bar ALL TYPE-setting` vs
    // `ALL TYPE-setting bar`) -- and a region slice carries no `class='...'`
    // attribute for a seam regex to match. The context window is symmetric and
    // identical in width on both sides, and the marker test is still a
    // SIDE-VS-SIDE multiset comparison, so widening the window cannot invent a
    // match that is not actually a difference.
    const CTX = 300;
    const eCtx = r.e.slice(Math.max(0, r.ei - CTX), Math.min(r.e.length, r.eEnd + CTX));
    const aCtx = r.a.slice(Math.max(0, r.aj - CTX), Math.min(r.a.length, r.aEnd + CTX));
    const hits = [];
    for (const seam of ERA_SEAMS) {
      const bE = bag(eCtx, seam.re);
      const bA = bag(aCtx, seam.re);
      if (JSON.stringify(bE) !== JSON.stringify(bA)) hits.push(seam.id);
    }
    const foreignHits = [];
    for (const m of FOREIGN_MARKERS) {
      const bE = bag(eCtx, m.re);
      const bA = bag(aCtx, m.re);
      if (JSON.stringify(bE) !== JSON.stringify(bA)) foreignHits.push(m.id);
    }
    // A pure class-token ORDER change has the same tokens in a different
    // sequence, so the two sides are anagram-matched on the token multiset. If
    // they are, the region is order-only and its seam is whatever seam matched.
    const toks = (s) => (s.match(/[A-Za-z0-9_:-]+/g) || []).sort();
    const orderOnly = JSON.stringify(toks(eText)) === JSON.stringify(toks(aText));
    const cls = foreignHits.length > 0 ? "FOREIGN" : hits.length > 0 ? (orderOnly ? "ERA-ORDER" : "ERA-CONTENT") : "UNCLASSIFIED";
    if (cls === "FOREIGN") foreign += 1;
    if (cls === "UNCLASSIFIED") unclassified += 1;
    if (cls.startsWith("ERA")) for (const h of hits) bucketTally.set(h, (bucketTally.get(h) || 0) + 1);
    per.push({
      expectedStart: r.expectedStart, actualStart: r.actualStart,
      expectedLen: r.expectedLen, actualLen: r.actualLen,
      delta: r.actualLen - r.expectedLen,
      class: cls, seams: hits, foreign: foreignHits, orderOnly,
      expectedText: eText.slice(0, 400), actualText: aText.slice(0, 400),
    });
  }
  results.push({ tag, verdict: "DIVERGES", regions: per.length, regionList: per });
}

const summary = {
  schema: "pageera-era-field-census/1",
  probeDir: PROBE_DIR,
  entries: results.length,
  regionsTotal: results.reduce((s, r) => s + (r.regions || 0), 0),
  unclassifiedRegions: unclassified,
  foreignRegions: foreign,
  bucketTally: Object.fromEntries([...bucketTally.entries()].sort()),
  seamTable: ERA_SEAMS.map((s) => ({ id: s.id, file: s.file, note: s.note })),
  foreignTable: FOREIGN_MARKERS.map((m) => ({ id: m.id, file: m.file })),
  results,
};
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2) + "\n");
console.log(`CENSUS entries=${results.length} regions=${summary.regionsTotal} unclassified=${unclassified} foreign=${foreign}`);
console.log(`BUCKETS ${JSON.stringify(summary.bucketTally)}`);
for (const r of results) {
  console.log(`  ${r.verdict} ${r.tag} regions=${r.regions || 0}` + (r.regionList ? " " + r.regionList.map((x) => `[${x.class} d=${x.delta} seams=${x.seams.join("+") || "-"}]`).join(" ") : ""));
}
if (unclassified > 0 || foreign > 0) {
  console.error("CENSUS-REFUSE: a divergence region is not serializer-era class; the splice would launder it");
  process.exit(3);
}
console.log("CENSUS-OK every divergence region is serializer-era class");
