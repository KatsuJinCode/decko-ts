// census-frozen-vs-live-data-slot-show-forms.mjs -- R1 step 3 prep.
//
// REPRODUCES view187-lane.md step 4's TWO-ERA CENSUS from the corpus bytes,
// and selects the 20-entry spot-check sample the R1 mandate asks for.
//
// The question: of the graded corpus's view-lane render entries, how many
// pin the FROZEN-era data-slot `show` form (the show list NAMES the slot's
// own requested view) and how many pin the LIVE-era form (the live serializer
// drops the requested view from the list, docs/serializer-spec-conditional-
// data-slot-show-key.md)? The frozen-form entries are the ones that go RED
// when the serializer era arms — the blast radius R1 must NOT touch, and the
// number the view187 ERRATA ledger flags as RECEIPT-ONLY ("the 3,624 figure
// was read off an armed/unarmed comparison whose raw outputs are not
// preserved ... the single most consequential unverified number in this
// workflow").
//
// This census is the OFFLINE half, computed from the expected bytes only —
// it does not need the engine, so it is independent of any arm. The armed /
// unarmed movement is measured separately, by measure-constants-only-arm.mjs.
//
// METHOD. Every `data-slot="..."` attribute in a view entry's expected bytes
// is unescaped and JSON-parsed. An entry's slots are classified per slot:
//   - the slot has no `show` key            -> OMIT
//   - `show` includes the slot's `view`     -> FROZEN form (always-enroll)
//   - `show` omits the slot's `view`        -> LIVE form (root drops it)
// An ENTRY is counted under the strongest form it carries: any LIVE-form
// slot makes the entry live-form, else any FROZEN-form slot makes it
// frozen-form, else omit. view187 counted per entry on the same three-way
// split; the totals are compared in the receipt.
//
// Usage: node tmp/r1-constants/census-frozen-vs-live-data-slot-show-forms.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const VIEW_DIR = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane");
const OUT = path.join(REPO, "tmp", "r1-constants");

const unescapeAttr = (s) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** Every data-slot attribute's decoded JSON object in one expected view. */
function slotForms(html) {
  const out = [];
  const re = /data-slot="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(unescapeAttr(m[1])));
    } catch {
      /* a data-slot that is not JSON is not a serializer-form carrier */
    }
  }
  return out;
}

const shards = readdirSync(VIEW_DIR).filter((f) => f.endsWith(".jsonl")).sort();
let entries = 0;
let carryShow = 0;
const byForm = { frozen: 0, live: 0, omit: 0 };
/** Every frozen-form entry, for the spot-check sample. */
const frozenEntries = [];
let parseFailures = 0;

for (const shard of shards) {
  const lines = readFileSync(path.join(VIEW_DIR, shard), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
  for (const line of lines) {
    for (const [view, html] of Object.entries(line.views ?? {})) {
      entries += 1;
      const slots = slotForms(html);
      if (slots.length === 0) parseFailures += 1;
      const withShow = slots.filter((s) => "show" in s);
      if (withShow.length > 0) carryShow += 1;
      const hasLive = withShow.some((s) => !(s.show ?? []).includes(s.view));
      const hasFrozen = withShow.some((s) => (s.show ?? []).includes(s.view));
      if (hasLive) byForm.live += 1;
      else if (hasFrozen) {
        byForm.frozen += 1;
        frozenEntries.push({ shard, name: line.name, view });
      } else byForm.omit += 1;
    }
  }
}

const summary = {
  shards: shards.length,
  viewLaneRenderEntries: entries,
  entriesCarryingDataSlotShow: carryShow,
  frozenForm: byForm.frozen,
  liveForm: byForm.live,
  omit: byForm.omit,
  entriesWithNoParseableDataSlot: parseFailures,
  view187PriorClaim: {
    renderEntries: 3686,
    carryShow: 3635,
    frozen: 3624,
    live: 11,
    omit: 51,
  },
};
console.log(JSON.stringify(summary, null, 2));

// The 20-entry spot-check sample: deterministic — every Nth frozen-form
// entry in (shard, name, view) order, so the sample is reproducible and
// spread across shards rather than clustered in the first one.
const SAMPLE = 20;
const step = Math.max(1, Math.floor(frozenEntries.length / SAMPLE));
const sample = [];
for (let i = 0; sample.length < SAMPLE && i < frozenEntries.length; i += step) {
  sample.push(frozenEntries[i]);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "frozen-form-view-entries-sample-20.txt"), sample.map((e) => `view\t${e.shard}\t${e.name}\t${e.view}`).join("\n") + "\n", "utf8");
writeFileSync(path.join(OUT, "frozen-form-census.json"), JSON.stringify({ summary, sampleSize: sample.length, sample }, null, 2), "utf8");
console.log(`\nspot-check sample: ${sample.length} frozen-form entries -> tmp/r1-constants/frozen-form-view-entries-sample-20.txt`);
console.log(`sample shards: ${new Set(sample.map((s) => s.shard)).size} distinct`);
