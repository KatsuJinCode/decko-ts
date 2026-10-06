// survey-page-lane-head-arm-census.mjs -- which ARM is each page-lane corpus
// entry written in? CORPUS-ONLY; no engine, no render, no probe.
//
// WHY THIS LANE NEEDS IT. This lane's 11 targets were derived from R1's
// measurement, where all 11 PASS under the FULL live config (constants + live
// era) and FAIL under constants alone. So their stored expectations are in the
// LIVE form. The control probe then measured 2 PASS / 492 FAIL over 494
// page-lane entries drawn from untouched shards under the GRADED arm, which
// says the rest of the page lane is NOT in that form. Before normalizing the
// 11 to one form, the lane's actual form census has to be measured, because it
// decides what the 49 head entries are: a coherent armed island in an unarmed
// lane, or something else.
//
// The four head markers are the graded arm's own fields, read off the engine
// that consumes them (R1 step 1's call-site table):
//   src/card/render/page.ts:899            scriptIntegrityFor  -> integrity=
//   src/card/render/head-views.ts:213       mainStylesheetRevisionDigits -> 1790384218
//   src/card/render/views.ts:774            footerDeckoVersion -> Decko v0.19.1
//   src/card/render/views.ts:1498           recaptchaSiteKey
//   src/card/render/page.ts:829            deckoRootUrl -> https://culturesmith.com/
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const CORPUS = process.argv.includes("--corpus")
  ? process.argv[process.argv.indexOf("--corpus") + 1]
  : "tmp/raw-ground-truth";

const MARKERS = {
  "sri-integrity": /integrity="sha(?:256|512)-/g,
  "live-css-revision-1790384218": /\/files\/\d+\/1790384218\.css/g,
  "footer-decko-v0.19.1": /Decko v0\.19\.1/g,
  "live-rooturl": /decko\.rootUrl='https:\/\/culturesmith\.com\/'/g,
  "cloudflare-challenge": /__CF\$cv\$params/g,
  "serializer-live-accordion-order": /class='accordion-button collapsed'|class='d0-card-body accordion-body'/g,
  "serializer-frozen-accordion-order": /class='collapsed accordion-button'|class='accordion-body d0-card-body'/g,
};

const dir = path.join(CORPUS, "expected-v2", "page-lane");
let total = 0;
const tally = {};
const combos = new Map();
const byShardArmed = new Map();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
  const text = readFileSync(path.join(dir, f), "utf8");
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (typeof o.page_html !== "string") continue;
    total += 1;
    const hits = [];
    for (const [id, re] of Object.entries(MARKERS)) {
      const n = (o.page_html.match(re) || []).length;
      if (n > 0) { hits.push(id); tally[id] = (tally[id] || 0) + 1; }
    }
    // ARMED means the entry carries the graded arm's head constants at all:
    // the SRI map is the unambiguous one (the engine only emits integrity= when
    // scriptIntegrityFor returned a value for that src).
    const armed = hits.includes("sri-integrity") || hits.includes("live-css-revision-1790384218") || hits.includes("footer-decko-v0.19.1");
    const liveEra = hits.includes("serializer-live-accordion-order");
    const frozenEra = hits.includes("serializer-frozen-accordion-order");
    const key = `${armed ? "ARMED-head" : "unarmed-head"}/${liveEra && !frozenEra ? "live-era" : frozenEra && !liveEra ? "frozen-era" : liveEra && frozenEra ? "mixed-era" : "no-era-marker"}`;
    combos.set(key, (combos.get(key) || 0) + 1);
    byShardArmed.set(f, (byShardArmed.get(f) || 0) + (armed ? 1 : 0));
  }
}
console.log(`PAGE-LANE page_html records = ${total}`);
console.log("MARKER TALLY (records carrying the marker at least once):");
for (const [id, n] of Object.entries(tally)) console.log(`  ${id.padEnd(36)} ${n}  (${((n / total) * 100).toFixed(1)}%)`);
console.log("FORM COMBOS (head arm x serializer era), by record count:");
for (const [k, n] of [...combos.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(34)} ${n}  (${((n / total) * 100).toFixed(1)}%)`);
const armedShards = [...byShardArmed.entries()].filter(([, n]) => n > 0);
console.log(`SHARDS carrying at least one ARMED-head record: ${armedShards.length} of ${byShardArmed.size}`);
for (const [f, n] of armedShards.sort((a, b) => b[1] - a[1])) console.log(`  ${f} armed=${n}`);
