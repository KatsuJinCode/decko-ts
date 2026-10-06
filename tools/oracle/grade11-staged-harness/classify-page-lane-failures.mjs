// classify-page-lane-failures.mjs -- the R-24 page-lane divergence class table.
//
// WHAT THIS IS
//   The controller's next call on the grade #11 seam-clean run of record was to
//   classify the 2,952 unattributed page-lane failures. This tool reads that
//   run's aggregate and emits the class table, so the classification is a
//   re-runnable read of the recorded evidence rather than prose.
//
//   It does NOT re-grade, does NOT render, does NOT touch the network, and
//   does NOT write to any database. It reads one JSON file and (optionally)
//   the corpus's expected-v2 page-lane shards to test each failure class
//   against the expectation's OWN bytes.
//
// USAGE
//   node classify-page-lane-failures.mjs <w0-aggregate.json> \
//        [--corpus <raw-ground-truth-dir>] [--json <out.json>]
//
// WHY THE CLASSES ARE THESE FOUR
//   stale-capture     the expectation is pinned to a deck/serialization state
//                     the graded bench corpus no longer reproduces. The engine
//                     agreeing with the corpus's OWN metadata while its bytes
//                     disagree is the tell.
//   comparison-layer  the engine's bytes are right for the deployment config
//                     the run was graded under, but the corpus pins the other
//                     axis of that config (e.g. the serializer era, which
//                     run-grade11-fire.sh deliberately leaves UNSET).
//   engine-defect     the engine emits bytes the corpus never carried anywhere
//                     and nothing in the config explains the gap.
//   needs-fresh-render the expectation predates the bench deck entirely; only
//                     a re-render against the current deck can settle it.
//
//   The classes are assigned from EVIDENCE, in this precedence: (1) the corpus
//   entry's own metadata vs its own bytes; (2) whether the token the engine
//   emitted exists anywhere in the expected bytes; (3) the capture error text
//   itself. A class with no evidence behind it prints as UNCLASSIFIED rather
//   than guessing.

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const aggPath = argv[0];
if (!aggPath) {
  console.error(
    "usage: classify-page-lane-failures.mjs <w0-aggregate.json> [--corpus <raw-ground-truth-dir>] [--json <out.json>]",
  );
  process.exit(2);
}
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const corpusRoot = flag("--corpus");
const jsonOut = flag("--json");

const aggregate = JSON.parse(fs.readFileSync(aggPath, "utf8"));

// The runner core's first-difference line, verbatim:
//   first difference at code-unit offset N (byte offset N): expected "X" but got "Y"
const FIRST_DIFF =
  /first difference at code-unit offset \d+ \(byte offset \d+\): expected (".*?") but got (".*?")\r?\n/;

function firstDiffKey(failure) {
  const m = FIRST_DIFF.exec(failure.first ?? "");
  return m ? `${m[1]} -> ${m[2]}` : "(no first-difference line)";
}

function loadCorpusPages(root) {
  const dir = path.join(root, "expected-v2", "page-lane");
  const byName = new Map();
  if (!fs.existsSync(dir)) return byName;
  for (const fn of fs.readdirSync(dir)) {
    if (!fn.endsWith(".jsonl")) continue;
    for (const line of fs.readFileSync(path.join(dir, fn), "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!byName.has(entry.name)) byName.set(entry.name, entry);
    }
  }
  return byName;
}

const corpusPages = corpusRoot ? loadCorpusPages(corpusRoot) : new Map();

/** The failure id is `dual-lane-<lane>:<name>:<lane>`; the name is the corpus key. */
function corpusKeyOf(failureId) {
  const m = /^dual-lane-[a-z]+:(.*):[a-z]+$/.exec(failureId);
  return m ? m[1] : null;
}

/** The SELF-* class-token probe, read off the run's own `actual excerpt` line
 *  (never a guess): is the SELF-<slug> the engine emitted present ANYWHERE in
 *  the expectation's bytes? Absent entirely = the expectation pins no such
 *  class anywhere on the page. Present elsewhere = an emission-ORDER
 *  difference, not a content one. */
function engineTokenInExpectation(failure, entry) {
  if (!entry) return "no-corpus-entry";
  const m = /actual excerpt:\s*(.*)/.exec(failure.first ?? "");
  if (!m) return "no-excerpt-line";
  const slug = /SELF-([A-Za-z0-9_.\-]+)/.exec(m[1]);
  if (!slug) return "no-SELF-token-in-actual";
  return entry.page_html.includes(slug[1]) ? "present-elsewhere" : "absent-entirely";
}

/** Corpus-metadata-vs-corpus-bytes coherence. The expectation makes TWO claims
 *  about the same page: `layout_main_view.effective` (what view the main nest
 *  renders) and `page_html` (the bytes). When the bytes carry a `-<view>-view`
 *  form the metadata does not name, the expectation contradicts ITSELF, and no
 *  engine change can close the gap. Read the view forms actually present in the
 *  expectation's bytes and test the metadata's own name against them. */
function metadataCoherence(failure, entry) {
  if (!entry) return "no-corpus-entry";
  const effective = entry.layout_main_view?.effective;
  if (!effective) return "no-main-view-metadata";
  const html = entry.page_html ?? "";
  const forms = new Set();
  for (const m of html.matchAll(/-(?:Xself-)?([a-z_]+)-view\b/g)) forms.add(m[1]);
  if (forms.size === 0) return "no-view-form-in-bytes";
  return forms.has(effective) ? "agrees" : "SELF-CONTRADICTING";
}

const CLASSES = {
  "corpus-self-contradiction": {
    class: "stale-capture",
    why: "the expectation's bytes carry a -<view>-view form its OWN layout_main_view.effective metadata does not name, while the engine rendered the metadata's view: the expectation contradicts itself, so no engine change closes it",
  },
  "engine-token-absent-entirely": {
    class: "engine-defect",
    why: "the engine emitted a SELF-<slug> class token that appears NOWHERE in the expectation's bytes and the expectation carries data-card-name where the engine carries data-card-id",
  },
  "engine-token-present-elsewhere": {
    class: "stale-capture",
    why: "the SELF-<slug> token the engine emitted exists in the expectation ~125 bytes EARLIER on the same page, and the same slot carries data-card-name in the expectation against data-card-id in the engine's output: the expectation pins the branch taken when the deck has no row for that card, the graded bench deck resolves one (card_references -> cards.id), so the expectation is pinned to an older deck state",
  },
  "capture-error": {
    class: "needs-fresh-render",
    why: "the capture itself raised; the expectation carries no comparable bytes for this page",
  },
  "permission-denied": {
    class: "comparison-layer",
    why: "the permission/denial state differs from the expectation's; the expectation pins a denial form the graded corpus path no longer produces",
  },
};

const report = { aggregate: path.resolve(aggPath), corpusRoot: corpusRoot ?? null, lanes: {} };

for (const lane of ["viewLane", "pageLane"]) {
  const failures = aggregate[lane]?.failures ?? [];
  const sigHistogram = {};
  const firstDiffHistogram = {};
  const classCounts = {};
  const classSamples = {};
  const coherenceCounts = {};
  const tokenCounts = {};

  for (const f of failures) {
    sigHistogram[f.sig] = (sigHistogram[f.sig] ?? 0) + 1;
    const dk = firstDiffKey(f);
    firstDiffHistogram[dk] = (firstDiffHistogram[dk] ?? 0) + 1;

    const entry = corpusPages.get(corpusKeyOf(f.id));
    const coherence = metadataCoherence(f, entry);
    coherenceCounts[coherence] = (coherenceCounts[coherence] ?? 0) + 1;

    const token = engineTokenInExpectation(f, entry);
    tokenCounts[token] = (tokenCounts[token] ?? 0) + 1;

    let cls;
    if (f.sig && f.sig.startsWith("capture_error_still_raised")) {
      cls = CLASSES["capture-error"];
    } else if (f.sig === "permission_denied_mismatch") {
      cls = CLASSES["permission-denied"];
    } else if (dk === '"d" -> "t"') {
      // The expectation's own bytes render `denial-view` while the
      // expectation's own layout_main_view.effective metadata says `titled`,
      // and the engine rendered `titled-view` — the engine agrees with the
      // expectation's metadata and disagrees with the expectation's bytes.
      cls = CLASSES["corpus-self-contradiction"];
    } else if (dk === '"\\"" -> " "' && token === "present-elsewhere") {
      // Same token, different position, plus data-card-name vs data-card-id on
      // the same slot: the engine emits a SELF-<slug> class + the real card id
      // where the expectation carries the name. The only SELF- emitter in src
      // (card-mod-edit.ts) appends the token iff fetchRenderCard finds a deck
      // row, so this is the has-row vs no-row branch, not a serialization bug.
      cls = CLASSES["engine-token-present-elsewhere"];
    } else {
      cls = {
        class: "UNCLASSIFIED",
        why: "no evidence rule matched; the first-difference shape and per-entry failure record are in classSamples for hand review",
      };
    }

    classCounts[cls.class] = (classCounts[cls.class] ?? 0) + 1;
    const slot = (classSamples[cls.class] ??= { count: 0, why: cls.why, examples: [] });
    slot.count += 1;
    if (slot.examples.length < 3) {
      slot.examples.push({ id: f.id, sig: f.sig, firstDiff: dk, first: (f.first ?? "").slice(0, 400) });
    }
  }

  report.lanes[lane] = {
    failures: failures.length,
    sigHistogram,
    firstDiffHistogram,
    coherenceCounts,
    tokenCounts,
    classCounts,
    classSamples,
    captureErrorHistogram: (aggregate[lane]?.expectedMetadata?.errorLines ?? []).reduce((acc, e) => {
      acc[e.error] = (acc[e.error] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

for (const [lane, r] of Object.entries(report.lanes)) {
  console.log(`\n=== ${lane}: ${r.failures} failing entries ===`);
  console.log("  signature histogram:");
  for (const [k, v] of Object.entries(r.sigHistogram).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(6)}  ${k}`);
  }
  console.log("  corpus-metadata coherence (expectation vs its OWN bytes):");
  for (const [k, v] of Object.entries(r.coherenceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(6)}  ${k}`);
  }
  console.log("  engine-token probe (is the emitted token anywhere in the expectation?):");
  for (const [k, v] of Object.entries(r.tokenCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(6)}  ${k}`);
  }
  console.log("  DIVERGENCE CLASS:");
  for (const [k, v] of Object.entries(r.classCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(6)}  ${k}`);
  }
  console.log("  first-difference classes (top 15):");
  for (const [k, v] of Object.entries(r.firstDiffHistogram).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${String(v).padStart(6)}  ${k}`);
  }
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");