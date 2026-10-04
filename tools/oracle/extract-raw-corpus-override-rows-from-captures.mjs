// extract-raw-corpus-override-rows-from-captures.mjs -- build the raw-corpus
// OVERRIDE TABLE from the oracle capture artifacts (harness-corpus-repair
// lane 2026-10-02, extended by the m8-envelope-completion lane 2026-10-02 to
// every entry of the M8 skin:record class, extended by the m8-siblings-litera
// lane 2026-10-03 to the two bootstrap SCSS source siblings and to litera
// skin -- the one bootswatch skin with no capture record -- via a LIVE
// ?view=raw capture of culturesmith.com under the same gates, and by the
// litera-custom-skin lane 2026-10-03 to litera skin customized 34530 via the
// same LIVE ?view=raw route, class-calibrated on journal skin customized
// 34179 whose oracle envelope the live raw view reproduces byte-exact).
//
// WHAT THIS IS
//   The oracle deck's stored bytes for some cards are unobtainable from
//   bench-corpus-raw.sqlite3 (sha-pinned 6a44dfdc...): the capture-time deck
//   held materialized bytes the dump does not carry (scss-double-emit-fix-lane.md:
//   card 34179 "journal skin customized" = [corpus prefix 251,225][M 221,051
//   bytes of compiled decko application CSS][corpus tail 945]; an instr search
//   for the M head over the whole corpus returns 0 rows). The oracle captures
//   hold the oracle's record envelope, so the bytes ARE recoverable -- from
//   the captures, not hand-authored.
//
//   The M8 skin:record class (residual-classes-dfe642b-w5.txt class [20],
//   lines 104-123; negative deltas -495,051..-509,306) is the same mechanism
//   for the 20 bootswatch skin cards themselves: each corpus row holds the
//   50-byte un-materialized markup "[[themeless bootstrap skin]]\n[[+bootswatch
//   theme]]" while the oracle record envelope holds ~473K-486K chars of
//   compiled theme CSS. This script re-derives every restoration from the
//   capture files, verifies the envelope decompositions and cross-capture
//   agreement, and writes the override table the seeding module
//   (tests/card/render/raw-corpus-seeding.ts) applies to the STAGED deck.
//   The pinned corpus file itself is never mutated.
//
// CLEANLINESS GATE (per row; a row that fails any gate is documented in
// meta.skipped and EMITTED AS NOTHING -- never forced):
//   1. identity: the capture record's id resolves to a live corpus row of the
//      same name.
//   2. decomposition: oracle.content = [corpus prefix][M][corpus tail] with
//      prefix/tail equalities re-checked at the JS-string level and the
//      recomposition exact. (For the 20 plain skins the decomposition is
//      degenerate -- prefix 0, M = whole content, tail 0 -- because the corpus
//      row is the 50-byte markup, which shares no bytes with compiled CSS.)
//   3. corpus-absence: no corpus row CONTAINS the restored content. Exact
//      form: containment implies length(content) >= |content|, so only rows
//      that long are candidates, and each candidate is probed with a
//      full-needle instr. (The journal lane's 80-char M-head probe is kept
//      for 34179, where the head is unique materialized decko CSS; for the
//      skins that probe is NOT decisive -- the compiled themes share their
//      10,624-char "// Bootstrap functions..." preamble and verbatim-passed
//      library regions with the SCSS SOURCE rows the corpus holds (classic
//      bootstrap skin 22736, journal/litera/slate skin customized), so head
//      probes legitimately hit those 4 source rows. Measured, documented in
//      provenance, not gating.)
//   4. cross-capture agreement: where a second capture artifact holds the same
//      card's record envelope (the p21 probe's `_record_.expected.html`
//      files), its content must be byte-equal and its envelope fields equal.
//
// OVERRIDE TABLE CONTRACT (consumed by the seeding module)
//   {
//     meta: { corpusSha256, generatedBy, generatedAt, provenance: [...],
//             skipped: [...] },
//     cards: [ { id, content, note } ]            // column patches for rows
//                                                 // that exist in the corpus
//   }
//   The seeding module refuses to apply the table against any corpus whose
//   sha256 differs from meta.corpusSha256 (the bytes are only what the oracle
//   rendered for THAT snapshot).
//
// USAGE
//   node tools/oracle/extract-raw-corpus-override-rows-from-captures.mjs \
//     [--capture <000028-journal_skin_customized-_record_.expected.html>] \
//     [--out tests/card/render/raw-corpus-override-capture-restored-rows.json]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);
const { RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(HERE, "..", "..", "tests", "card", "render", "raw-corpus-seeding.js")).href
);

const EXPECTED_CAPTURE_DEFAULT =
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/p21-probe-results/" +
  "nest-tip-shard-000028/html/000028-journal_skin_customized-_record_.expected.html";
const REPO_ROOT = path.resolve(HERE, "..", "..");
const VIEW_LANE_DIR = path.join(REPO_ROOT, "tmp", "raw-ground-truth", "expected-v2", "view-lane");
const P21_HTML_DIR =
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/p21-probe-results/nest-tip-shard-000028/html";

// The M8 skin:record class, residual-classes-dfe642b-w5.txt lines 104-123
// (class [20], header line 103). Shard membership as captured there; the
// extractor re-locates every record by exact name and re-checks the id.
const M8_CLASS_SKINS = [
  { skin: "cerulean skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "cosmo skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "cyborg skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "darkly skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "flatly skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "journal skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "lumen skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "sandstone skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "simplex skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "slate skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "spacelab skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "superhero skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "united skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "yeti skin", shard: "recapture-raw-shard-000017.jsonl" },
  { skin: "lux skin", shard: "recapture-raw-shard-000028.jsonl" },
  { skin: "materia skin", shard: "recapture-raw-shard-000028.jsonl" },
  { skin: "minty skin", shard: "recapture-raw-shard-000028.jsonl" },
  { skin: "pulse skin", shard: "recapture-raw-shard-000028.jsonl" },
  { skin: "sketchy skin", shard: "recapture-raw-shard-000028.jsonl" },
  { skin: "solar skin", shard: "recapture-raw-shard-000028.jsonl" },
];

// The two bootstrap SCSS source siblings (m8-siblings-litera lane 2026-10-03):
// the M8 corpus-materialization remainder entries the wave-2 receipts name
// (bootstrap: core:record -248,378, bootstrap: functions:record -10,989).
// Same class mechanism -- the corpus rows are EMPTY (0 bytes) while the oracle
// record envelopes hold the full SCSS source (239,039 / 10,621 chars).
const M8_BOOTSTRAP_SIBLINGS = [
  { name: "bootstrap: core", shard: "recapture-raw-shard-000028.jsonl" },
  { name: "bootstrap: functions", shard: "recapture-raw-shard-000028.jsonl" },
];

// The documented shared-source family (this file's header note: "compiled and
// source share their 10,624-char '// Bootstrap functions...' preamble and
// verbatim-passed library regions with the SCSS SOURCE rows the corpus holds
// (classic bootstrap skin 22736, journal/litera/slate skin customized)").
// Both siblings' bytes are verbatim REGIONS of these four monolithic rows
// (functions = the shared preamble at index 0 x4; core = the source region
// after the preamble, offsets 10625/12185/13346/15893, once per row --
// measured by the lane probe). For the sibling pair the containment gate is
// therefore: every containing corpus row must be IN this family; any
// containing row outside it still fails the row. The skins keep the strict
// hits==0 gate unchanged.
const SHARED_SOURCE_FAMILY = [22736, 34179, 34530, 38274];

// ---------- LIVE-capture arm: litera skin 33872 (m8-siblings-litera lane 2026-10-03) ----------
// litera skin is the one bootswatch skin with NO capture record in any
// expected-v2 shard (swept: only adjacent cards -- litera skin customized+*variables
// 34533, +parent 1 45366 -- and no p21 file). The LIVE site serves the card's
// stored bytes through the ?view=raw route (the ?view=record route answers 422
// "view (record) not supported" for these card types, measured 2026-10-03).
// Calibration: the live raw view of cerulean skin and journal skin contains
// each skin's ORACLE envelope content BYTE-EXACT (single occurrence), which
// pins both the extraction rule and live-stored==oracle-stored for this card
// class. The extraction rule (content sits between '<div id="main">' and
// '</div><script>' in the raw-view body) must reproduce both calibration
// contents byte-exact or this arm THROWS -- never emits on a broken rule.
const LIVE_RAW_VIEW_DIR =
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/m8-siblings-litera-live-probe";
const LIVE_LITERA_FETCHES = [
  {
    file: "live-raw-view-litera-skin-culturesmith-2026-10-03.html",
    fetchedAt: "2026-10-03T11:39:02Z",
    url: "https://culturesmith.com/litera_skin?view=raw",
    status: 200,
    sha256: "51b8c9d95ebe226d09ce0adb75a31336544dbbe7e3b52837124c4e166229e932",
  },
  {
    file: "live-raw-view-litera-skin-culturesmith-2026-10-03-refetch.html",
    fetchedAt: "2026-10-03T11:42:24Z",
    url: "https://culturesmith.com/litera_skin?view=raw",
    status: 200,
    sha256: "e621584e449ff4343b7414d5a62723608ceda382b3324672e1abca5018327042",
  },
];
const LIVE_CALIBRATION_SKINS = [
  { name: "cerulean skin", file: "live-raw-view-cerulean-skin-culturesmith-2026-10-03.html" },
  { name: "journal skin", file: "live-raw-view-journal-skin-culturesmith-2026-10-03.html" },
];
const LIVE_RAW_WRAPPER_START = '<div id="main">';
const LIVE_RAW_WRAPPER_END = "</div><script>";

function extractLiveRawContent(body) {
  const start = body.indexOf(LIVE_RAW_WRAPPER_START);
  if (start < 0) return { ok: false, reason: "raw-view wrapper start not found" };
  const from = start + LIVE_RAW_WRAPPER_START.length;
  const end = body.indexOf(LIVE_RAW_WRAPPER_END, from);
  if (end < 0) return { ok: false, reason: "raw-view wrapper end not found" };
  return { ok: true, content: body.slice(from, end), from, to: end };
}

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const CAPTURE = argValue("--capture", EXPECTED_CAPTURE_DEFAULT);
const OUT =
  argValue("--out", "") !== "" && path.isAbsolute(argValue("--out", ""))
    ? argValue("--out")
    : path.join(
        HERE,
        "..",
        "..",
        "tests",
        "card",
        "render",
        "raw-corpus-override-capture-restored-rows.json",
      );

// ---------- corpus side ----------
const corpusSha = createHash("sha256").update(readFileSync(RAW_CORPUS_DB)).digest("hex");
const corpus = new Database(RAW_CORPUS_DB, { readonly: true });
console.log(`CORPUS ${RAW_CORPUS_DB}`);
console.log(`  sha256 ${corpusSha}`);

const RECORD_FIELDS = ["key", "name", "type", "type_code", "codename", "left", "right"];

// Decompose oracleContent against corpusContent and re-check every equality
// at the JS-string level. Returns { clean, prefix, tail, mBlock, reason }.
function decompose(oracleContent, corpusContent) {
  let prefix = 0;
  while (
    prefix < Math.min(oracleContent.length, corpusContent.length) &&
    oracleContent[prefix] === corpusContent[prefix]
  )
    prefix++;
  let tail = 0;
  while (
    tail < Math.min(oracleContent.length, corpusContent.length) - prefix &&
    oracleContent[oracleContent.length - 1 - tail] ===
      corpusContent[corpusContent.length - 1 - tail]
  )
    tail++;
  const mBlock = oracleContent.slice(prefix, oracleContent.length - tail);
  if (oracleContent.slice(0, prefix) !== corpusContent.slice(0, prefix)) {
    return { clean: false, reason: "prefix equality broke at the JS-string level" };
  }
  if (
    oracleContent.slice(oracleContent.length - tail) !==
    corpusContent.slice(corpusContent.length - tail)
  ) {
    return { clean: false, reason: "tail equality broke at the JS-string level" };
  }
  if (
    oracleContent !==
    corpusContent.slice(0, prefix) + mBlock + corpusContent.slice(corpusContent.length - tail)
  ) {
    return { clean: false, reason: "recomposition is not exactly prefix + M + tail" };
  }
  return { clean: true, prefix, tail, mBlock };
}

function mHeadInCorpusRows(mBlock) {
  return corpus
    .prepare("SELECT COUNT(*) AS n FROM cards WHERE instr(content, ?) > 0")
    .get(mBlock.slice(0, 80)).n;
}

// Exact corpus-containment probe: a row can only contain `content` if it is
// at least that long, so only length-qualified rows are probed, and each is
// probed with the FULL needle. Returns the number of rows containing it (the
// honest answer is always 0) plus the candidates examined.
function rowsContainingContent(content) {
  const candidates = corpus
    .prepare("SELECT id, name FROM cards WHERE length(content) >= ?")
    .all(content.length);
  const probe = corpus.prepare("SELECT COUNT(*) AS n FROM cards WHERE id = ? AND instr(content, ?) > 0");
  let hits = 0;
  for (const c of candidates) {
    hits += probe.get(c.id, content).n;
  }
  return { hits, candidatesExamined: candidates.length };
}

// Informational: which rows hold the generic compiled preamble head (the SCSS
// source rows), and where the compile banner sits. Not a gate -- see the
// header comment for why head probes are not decisive for compiled themes.
function preambleHeadHits(content) {
  return corpus
    .prepare("SELECT id, name, length(content) AS len FROM cards WHERE instr(content, ?) > 0")
    .all(content.slice(0, 80));
}

// ---------- the 20 M8 class rows (capture side: expected-v2 view-lane shards) ----------
const cards = [];
const provenance = [];
const skipped = [];
for (const { skin, shard } of M8_CLASS_SKINS) {
  const shardPath = path.join(VIEW_LANE_DIR, shard);
  const entry = { skin, shard };
  let record;
  try {
    const lines = readFileSync(shardPath, "utf8").split("\n").filter(Boolean);
    for (const l of lines) {
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        continue;
      }
      if (o.record && o.record.name === skin) {
        record = o.record;
        break;
      }
    }
  } catch (err) {
    skipped.push({ ...entry, reason: `shard unreadable: ${err.message.slice(0, 80)}` });
    console.log(`SKIP ${skin}: shard unreadable (${err.message.slice(0, 60)})`);
    continue;
  }
  if (record === undefined) {
    skipped.push({ ...entry, reason: "no capture record with this exact name in the shard" });
    console.log(`SKIP ${skin}: no capture record in ${shard}`);
    continue;
  }
  const row = corpus
    .prepare("SELECT id, name, content, length(content) AS len FROM cards WHERE id = ?")
    .get(record.id);
  if (row === undefined || row.name !== skin) {
    skipped.push({
      ...entry,
      captureId: record.id,
      reason: `capture id ${record.id} does not resolve to a live corpus row of the same name (found ${row ? JSON.stringify(row.name) : "nothing"})`,
    });
    console.log(`SKIP ${skin}: identity gate failed (capture id ${record.id})`);
    continue;
  }
  const d = decompose(record.content, row.content);
  if (!d.clean) {
    skipped.push({ ...entry, captureId: record.id, reason: d.reason });
    console.log(`SKIP ${skin}: ${d.reason}`);
    continue;
  }
  const mRows = mHeadInCorpusRows(d.mBlock);
  const containment = rowsContainingContent(record.content);
  if (containment.hits !== 0) {
    skipped.push({
      ...entry,
      captureId: record.id,
      reason: `${containment.hits} corpus rows CONTAIN the full restored content -- the override premise is stale for this row`,
    });
    console.log(`SKIP ${skin}: full content contained in ${containment.hits} corpus rows`);
    continue;
  }
  // Cross-capture agreement: where the p21 probe photographed the same record
  // envelope, its content must be byte-equal and its fields equal.
  const p21File = path.join(
    P21_HTML_DIR,
    `000028-${skin.replace(/ /g, "_")}-_record_.expected.html`,
  );
  let crossCheck = null;
  if (existsSync(p21File)) {
    let p21Env = null;
    try {
      p21Env = JSON.parse(readFileSync(p21File, "utf8"));
    } catch {
      p21Env = null;
    }
    if (p21Env === null) {
      skipped.push({
        ...entry,
        captureId: record.id,
        reason: "p21 cross-capture file is not a JSON envelope",
      });
      console.log(`SKIP ${skin}: p21 cross-capture file unparseable`);
      continue;
    }
    const contentByteEqual = p21Env.content === record.content;
    const fieldsEqual = RECORD_FIELDS.every((k) => p21Env[k] === record[k]);
    crossCheck = { file: p21File, contentByteEqual, fieldsEqual };
    if (!contentByteEqual || !fieldsEqual) {
      skipped.push({
        ...entry,
        captureId: record.id,
        reason: `cross-capture disagreement (contentByteEqual=${contentByteEqual} fieldsEqual=${fieldsEqual})`,
      });
      console.log(`SKIP ${skin}: cross-capture disagreement`);
      continue;
    }
  }
  cards.push({
    id: record.id,
    content: record.content,
    note:
      `${skin} -- oracle deck's stored content ` +
      `(${record.content.length} chars = corpus prefix ${d.prefix} + M ${d.mBlock.length} + corpus tail ${d.tail}); ` +
      "the corpus row holds the 50-byte un-materialized markup.",
  });
  provenance.push({
    cardId: record.id,
    cardName: skin,
    classRow: "residual-classes-dfe642b-w5.txt class [20] M8 skin:record",
    source: `expected-v2 view-lane capture record (${shard})`,
    file: shardPath,
    captureId: record.id,
    envelopeFields: {
      name: record.name,
      key: record.key,
      type: record.type,
      type_code: record.type_code,
      codename: record.codename,
    },
    contentChars: record.content.length,
    envelopeEqualities: {
      prefixBytes: d.prefix,
      middleBytes: d.mBlock.length,
      tailBytes: d.tail,
    },
    corpusRowBytes: row.len,
    corpusAbsence: {
      test: "no corpus row contains the full restored content (full-needle instr over length-qualified candidates)",
      candidatesExamined: containment.candidatesExamined,
      containingRows: 0,
      informationalPreambleHeadRows: mRows,
      preambleHeadRowsNote:
        "rows holding the generic '// Bootstrap functions...' compiled preamble head -- these are the SCSS source rows (compiled and source share the preamble and verbatim library regions), not stored compile output; the exact containment test above is the gate",
      compileBanner:
        record.content.indexOf("// " + skin.split(" ")[0].replace(/^./, (ch) => ch.toUpperCase()) + " 5.1.3") > 0
          ? {
              banner:
                "// " + skin.split(" ")[0].replace(/^./, (ch) => ch.toUpperCase()) + " 5.1.3",
              offset: record.content.indexOf(
                "// " + skin.split(" ")[0].replace(/^./, (ch) => ch.toUpperCase()) + " 5.1.3",
              ),
            }
          : null,
    },
    crossCapture: crossCheck,
  });
  console.log(
    `OK   ${skin} id ${record.id}: content ${record.content.length} chars = prefix ${d.prefix} + M ${d.mBlock.length} + tail ${d.tail}` +
      ` | containment candidates ${containment.candidatesExamined}, hits 0` +
      ` | preamble-head rows (informational): ${mRows}` +
      `${crossCheck ? " | p21 cross-capture byte-equal" : ""}`,
  );
}

// ---------- the two bootstrap SCSS source siblings (capture side: expected-v2 view-lane shards) ----------
for (const { name: siblingName, shard: siblingShard } of M8_BOOTSTRAP_SIBLINGS) {
  const entry = { cardName: siblingName, shard: siblingShard };
  const shardPath = path.join(VIEW_LANE_DIR, siblingShard);
  let record;
  try {
    const lines = readFileSync(shardPath, "utf8").split("\n").filter(Boolean);
    for (const l of lines) {
      let o;
      try {
        o = JSON.parse(l);
      } catch {
        continue;
      }
      if (o.record && o.record.name === siblingName) {
        record = o.record;
        break;
      }
    }
  } catch (err) {
    skipped.push({ ...entry, reason: `shard unreadable: ${err.message.slice(0, 80)}` });
    console.log(`SKIP ${siblingName}: shard unreadable (${err.message.slice(0, 60)})`);
    continue;
  }
  if (record === undefined) {
    skipped.push({ ...entry, reason: "no capture record with this exact name in the shard" });
    console.log(`SKIP ${siblingName}: no capture record in ${siblingShard}`);
    continue;
  }
  const row = corpus
    .prepare("SELECT id, name, content, length(content) AS len FROM cards WHERE id = ?")
    .get(record.id);
  if (row === undefined || row.name !== siblingName) {
    skipped.push({
      ...entry,
      captureId: record.id,
      reason: `capture id ${record.id} does not resolve to a live corpus row of the same name (found ${row ? JSON.stringify(row.name) : "nothing"})`,
    });
    console.log(`SKIP ${siblingName}: identity gate failed (capture id ${record.id})`);
    continue;
  }
  const d = decompose(record.content, row.content ?? "");
  if (!d.clean) {
    skipped.push({ ...entry, captureId: record.id, reason: d.reason });
    console.log(`SKIP ${siblingName}: ${d.reason}`);
    continue;
  }
  const mRows = mHeadInCorpusRows(d.mBlock);
  // Family-gated containment: every corpus row containing the full content must
  // be one of the documented shared-source family rows. Hits inside the family
  // are measured (offset + occurrences) and recorded in provenance; any hit
  // outside the family fails the row.
  const candidates = corpus
    .prepare("SELECT id, name FROM cards WHERE length(content) >= ?")
    .all(record.content.length);
  const probe = corpus.prepare(
    "SELECT COUNT(*) AS n FROM cards WHERE id = ? AND instr(content, ?) > 0",
  );
  const hitDetail = [];
  let outsideFamilyHits = 0;
  for (const c of candidates) {
    if (probe.get(c.id, record.content).n > 0) {
      const full = corpus.prepare("SELECT content FROM cards WHERE id = ?").get(c.id).content;
      hitDetail.push({
        id: c.id,
        name: c.name,
        firstIndex: full.indexOf(record.content),
        occurrences: full.split(record.content).length - 1,
        inSharedSourceFamily: SHARED_SOURCE_FAMILY.includes(c.id),
      });
      if (!SHARED_SOURCE_FAMILY.includes(c.id)) outsideFamilyHits++;
    }
  }
  if (outsideFamilyHits !== 0) {
    skipped.push({
      ...entry,
      captureId: record.id,
      reason: `${outsideFamilyHits} corpus rows OUTSIDE the documented shared-source family contain the full restored content -- the override premise is stale for this row`,
    });
    console.log(`SKIP ${siblingName}: containment outside the shared-source family (${outsideFamilyHits})`);
    continue;
  }
  // Cross-capture agreement with the p21 probe file (name -> filename: drop
  // colons, spaces -> underscores; "bootstrap: core" -> "bootstrap_core").
  const p21File = path.join(
    P21_HTML_DIR,
    `000028-${siblingName.replace(/:/g, "").replace(/ /g, "_")}-_record_.expected.html`,
  );
  let crossCheck = null;
  if (existsSync(p21File)) {
    let p21Env = null;
    try {
      p21Env = JSON.parse(readFileSync(p21File, "utf8"));
    } catch {
      p21Env = null;
    }
    if (p21Env === null) {
      skipped.push({
        ...entry,
        captureId: record.id,
        reason: "p21 cross-capture file is not a JSON envelope",
      });
      console.log(`SKIP ${siblingName}: p21 cross-capture file unparseable`);
      continue;
    }
    const contentByteEqual = p21Env.content === record.content;
    const fieldsEqual = RECORD_FIELDS.every((k) => p21Env[k] === record[k]);
    crossCheck = { file: p21File, contentByteEqual, fieldsEqual };
    if (!contentByteEqual || !fieldsEqual) {
      skipped.push({
        ...entry,
        captureId: record.id,
        reason: `cross-capture disagreement (contentByteEqual=${contentByteEqual} fieldsEqual=${fieldsEqual})`,
      });
      console.log(`SKIP ${siblingName}: cross-capture disagreement`);
      continue;
    }
  }
  cards.push({
    id: record.id,
    content: record.content,
    note:
      `${siblingName} -- oracle deck's stored content ` +
      `(${record.content.length} chars = corpus prefix ${d.prefix} + M ${d.mBlock.length} + corpus tail ${d.tail}); ` +
      `the corpus row is empty (${row.len} bytes).`,
  });
  provenance.push({
    cardId: record.id,
    cardName: siblingName,
    classRow:
      "M8 corpus-materialization remainder " +
      `(bootstrap: core:record -248,378 / bootstrap: functions:record -10,989; ` +
      "m8-siblings-litera lane 2026-10-03)",
    source: `expected-v2 view-lane capture record (${siblingShard})`,
    file: shardPath,
    captureId: record.id,
    envelopeFields: {
      name: record.name,
      key: record.key,
      type: record.type,
      type_code: record.type_code,
      codename: record.codename,
    },
    contentChars: record.content.length,
    envelopeEqualities: {
      prefixBytes: d.prefix,
      middleBytes: d.mBlock.length,
      tailBytes: d.tail,
    },
    corpusRowBytes: row.len,
    corpusAbsence: {
      test:
        "no corpus row OUTSIDE the documented shared-source family {22736, 34179, 34530, 38274} " +
        "contains the full restored content (full-needle instr over length-qualified candidates); " +
        "the strict hits==0 gate used for the compiled skins is NOT met by this SCSS-source pair -- " +
        "the bytes are verbatim regions of the family rows the extractor header already documents " +
        "(functions = the shared '// Bootstrap functions...' preamble at index 0 x4; " +
        "core = the source region after the preamble), which is measured and recorded, not gated",
      candidatesExamined: candidates.length,
      containingRows: hitDetail.length,
      containingRowDetail: hitDetail,
      informationalPreambleHeadRows: mRows,
    },
    crossCapture: crossCheck,
  });
  console.log(
    `OK   ${siblingName} id ${record.id}: content ${record.content.length} chars = prefix ${d.prefix} + M ${d.mBlock.length} + tail ${d.tail}` +
      ` | containment candidates ${candidates.length}, hits ${hitDetail.length} (all in shared-source family)` +
      `${crossCheck ? " | p21 cross-capture byte-equal" : ""}`,
  );
}

// ---------- litera skin 33872 (LIVE-capture arm, provenance + gates) ----------
{
  // calibration: the wrapper rule must reproduce the oracle envelope contents
  // of cerulean and journal skin byte-exact from their live raw-view bodies
  const calibrationShard = path.join(VIEW_LANE_DIR, "recapture-raw-shard-000017.jsonl");
  const oracleByName = new Map();
  for (const l of readFileSync(calibrationShard, "utf8").split("\n").filter(Boolean)) {
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue;
    }
    if (o.record && o.record.name !== undefined && !oracleByName.has(o.record.name)) {
      oracleByName.set(o.record.name, o.record);
    }
  }
  const calibrationEvidence = [];
  for (const cal of LIVE_CALIBRATION_SKINS) {
    const oracle = oracleByName.get(cal.name);
    const liveBody = readFileSync(path.join(LIVE_RAW_VIEW_DIR, cal.file), "utf8");
    const ex = extractLiveRawContent(liveBody);
    const byteEqual = ex.ok && ex.content === oracle.content;
    calibrationEvidence.push({
      skin: cal.name,
      file: cal.file,
      oracleContentChars: oracle.content.length,
      liveRawBodyChars: liveBody.length,
      extractionBounds: ex.ok ? { from: ex.from, to: ex.to } : null,
      contentByteEqual: byteEqual,
    });
    if (!byteEqual) {
      throw new Error(
        `live raw-view extraction rule FAILED calibration on ${cal.name} ` +
          `(ok=${ex.ok} byteEqual=${byteEqual}) -- refusing to emit the live-captured row`,
      );
    }
  }
  // litera content from BOTH recorded fetches; the two must agree byte-exact
  const perFetch = [];
  for (const f of LIVE_LITERA_FETCHES) {
    const bodyPath = path.join(LIVE_RAW_VIEW_DIR, f.file);
    const body = readFileSync(bodyPath, "utf8");
    const actualSha = createHash("sha256").update(readFileSync(bodyPath)).digest("hex");
    if (actualSha !== f.sha256) {
      throw new Error(
        `live raw-view capture file ${f.file} sha256 ${actualSha} does not match the recorded fetch sha ${f.sha256} -- refusing to emit`,
      );
    }
    const ex = extractLiveRawContent(body);
    if (!ex.ok) {
      throw new Error(`live raw-view extraction failed for ${f.file}: ${ex.reason}`);
    }
    perFetch.push({ ...f, bodyChars: body.length, content: ex.content, bounds: { from: ex.from, to: ex.to } });
  }
  const stable = perFetch.every((p) => p.content === perFetch[0].content);
  if (!stable) {
    throw new Error("live raw-view litera content is NOT byte-identical across the two recorded fetches -- refusing to emit");
  }
  const oracleContent = perFetch[0].content;
  // the proven gates, identical to the skins loop
  const row = corpus
    .prepare("SELECT id, name, content, length(content) AS len FROM cards WHERE id = 33872")
    .get();
  if (row === undefined || row.name !== "litera skin") {
    throw new Error(`identity gate failed for litera skin 33872 (found ${row ? JSON.stringify(row.name) : "nothing"})`);
  }
  const d = decompose(oracleContent, row.content ?? "");
  if (!d.clean) {
    throw new Error(`litera skin decomposition not clean: ${d.reason}`);
  }
  const mRows = mHeadInCorpusRows(d.mBlock);
  const containment = rowsContainingContent(oracleContent);
  if (containment.hits !== 0) {
    throw new Error(
      `litera skin live content contained in ${containment.hits} corpus rows -- the override premise is stale, refusing to emit`,
    );
  }
  const typeRow = corpus
    .prepare(
      "SELECT c.id, c.name, c.key, c.codename FROM cards c WHERE c.id = (SELECT type_id FROM cards WHERE id = 33872)",
    )
    .get();
  const corpusCard = corpus.prepare("SELECT codename FROM cards WHERE id = 33872").get();
  cards.push({
    id: 33872,
    content: oracleContent,
    note:
      "litera skin -- the live deck's stored content " +
      `(live raw view, ${oracleContent.length} chars = corpus prefix ${d.prefix} + M ${d.mBlock.length} + corpus tail ${d.tail}); ` +
      "the corpus row holds the 50-byte un-materialized markup. No expected-v2 capture record exists for this skin (swept 2026-10-03).",
  });
  provenance.push({
    cardId: 33872,
    cardName: "litera skin",
    classRow:
      "M8 skin:record class straggler -- the one bootswatch skin with no capture record " +
      "(m8-siblings-litera lane 2026-10-03, restored from the LIVE site)",
    source: "LIVE culturesmith.com ?view=raw capture (2026-10-03, two byte-stable fetches)",
    file: path.join(LIVE_RAW_VIEW_DIR, LIVE_LITERA_FETCHES[0].file),
    captureId: 33872,
    envelopeFields: {
      name: row.name,
      type: typeRow.name,
      type_code: typeRow.codename,
      codename: corpusCard.codename,
      keySource: "engine-derived from the name (DeckoName key of 'litera skin')",
    },
    contentChars: oracleContent.length,
    envelopeEqualities: {
      prefixBytes: d.prefix,
      middleBytes: d.mBlock.length,
      tailBytes: d.tail,
    },
    corpusRowBytes: row.len,
    corpusAbsence: {
      test: "no corpus row contains the full restored content (full-needle instr over length-qualified candidates)",
      candidatesExamined: containment.candidatesExamined,
      containingRows: 0,
      informationalPreambleHeadRows: mRows,
    },
    liveCapture: {
      route: "?view=raw (the ?view=record route answers 422 'view (record) not supported' for these card types, measured 2026-10-03)",
      fetches: perFetch.map((p) => ({
        file: p.file,
        fetchedAt: p.fetchedAt,
        url: p.url,
        status: p.status,
        sha256: p.sha256,
        bodyChars: p.bodyChars,
        extractionBounds: p.bounds,
      })),
      crossFetchContentByteEqual: stable,
      extractionRule: "content sits between '<div id=\"main\">' and '</div><script>' in the raw-view body",
      calibration: calibrationEvidence,
      calibrationNote:
        "the same rule applied to the live raw views of cerulean skin and journal skin reproduces " +
        "their ORACLE envelope contents byte-exact (single occurrence each) -- this pins both the " +
        "extraction rule and live-stored==oracle-stored for the bootswatch skin card class",
    },
    crossCapture: null,
  });
  console.log(
    `OK   litera skin id 33872 (LIVE capture): content ${oracleContent.length} chars = prefix ${d.prefix} + M ${d.mBlock.length} + tail ${d.tail}` +
      ` | containment candidates ${containment.candidatesExamined}, hits 0` +
      ` | 2 live fetches byte-stable, calibrated on cerulean+journal oracle contents`,
  );
}

// ---------- litera skin customized 34530 (LIVE-capture arm, litera-custom-skin lane 2026-10-03) ----------
// The corpus row (253,810 bytes of litera SCSS source) is one of the four
// documented shared-source family rows; no expected-v2 capture record exists
// for the plain name (the m8 lane swept: only adjacent junction cards 34533 /
// 45366 were captured). The LIVE site serves the card's stored bytes through
// the same ?view=raw route (titles verified "litera skin customized -
// Culturesmith", so the right card was served). Class calibration: the same
// wrapper rule on journal skin customized's live raw view reproduces 34179's
// ORACLE envelope content byte-exact (single occurrence) -- pins
// live-stored==oracle-stored for the customized class, complementing the
// plain-class pins (cerulean/journal) the 33872 arm carries. The restored
// content decomposes against the corpus row in the proven 34179 double-emit
// shape: [corpus prefix][compiled M][corpus tail]. Measured deck-state fact,
// recorded not hidden: the live deck's stored bytes for litera skin (33872)
// and litera skin customized (34530) are byte-identical (the same holds for
// journal base vs journal customized vs 34179's oracle envelope).
{
  const LIVE_CUSTOMIZED_DIR =
    "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/litera-custom-live-probe";
  const LIVE_LITERA_CUSTOMIZED_FETCHES = [
    {
      file: "live-raw-view-litera-skin-customized-culturesmith-2026-10-04.html",
      fetchedAt: "2026-10-04T04:39:58.838Z",
      url: "https://culturesmith.com/litera_skin_customized?view=raw",
      status: 200,
      sha256: "c2366910a2d4f65a137e50117e58dffc7482231a581280b154a4e9bf6dc3424f",
    },
    {
      file: "live-raw-view-litera-skin-customized-culturesmith-2026-10-04-refetch.html",
      fetchedAt: "2026-10-04T04:40:00.977Z",
      url: "https://culturesmith.com/litera_skin_customized?view=raw",
      status: 200,
      sha256: "bbe43a9803b516d53baf11f470b58d02c7021e110a6dda80104ebfc06cd5fee4",
    },
  ];
  // rule calibration (plain class, m8 lane's recorded fetches) + class
  // calibration (customized class, this lane's recorded fetch vs 34179's
  // oracle envelope; canonical p21 file, independent of --capture).
  const P21_JOURNAL_CUSTOMIZED_CANONICAL =
    "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/p21-probe-results/" +
    "nest-tip-shard-000028/html/000028-journal_skin_customized-_record_.expected.html";
  const oracleEnvelope34179 = JSON.parse(readFileSync(P21_JOURNAL_CUSTOMIZED_CANONICAL, "utf8"));
  // the rule-calibration oracle envelopes (plain class) -- the shard-record
  // map is built here (the 33872 arm's map is block-scoped to that arm)
  const calibrationShardPath = path.join(VIEW_LANE_DIR, "recapture-raw-shard-000017.jsonl");
  const calibrationOracleByName = new Map();
  for (const l of readFileSync(calibrationShardPath, "utf8").split("\n").filter(Boolean)) {
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue;
    }
    if (o.record && o.record.name !== undefined && !calibrationOracleByName.has(o.record.name)) {
      calibrationOracleByName.set(o.record.name, o.record);
    }
  }
  const calibrationEvidence = [];
  for (const cal of LIVE_CALIBRATION_SKINS) {
    const oracle = calibrationOracleByName.get(cal.name);
    const liveBody = readFileSync(path.join(LIVE_RAW_VIEW_DIR, cal.file), "utf8");
    const ex = extractLiveRawContent(liveBody);
    const byteEqual = ex.ok && ex.content === oracle.content;
    calibrationEvidence.push({
      skin: cal.name,
      cardClass: "plain bootswatch skin",
      file: cal.file,
      dir: LIVE_RAW_VIEW_DIR,
      oracleSource: "expected-v2 view-lane shard record",
      oracleContentChars: oracle.content.length,
      liveRawBodyChars: liveBody.length,
      extractionBounds: ex.ok ? { from: ex.from, to: ex.to } : null,
      contentByteEqual: byteEqual,
    });
    if (!byteEqual) {
      throw new Error(
        `live raw-view extraction rule FAILED calibration on ${cal.name} ` +
          `(ok=${ex.ok} byteEqual=${byteEqual}) -- refusing to emit the 34530 row`,
      );
    }
  }
  {
    const liveBody = readFileSync(
      path.join(LIVE_CUSTOMIZED_DIR, "live-raw-view-journal-skin-customized-culturesmith-2026-10-04.html"),
      "utf8",
    );
    const ex = extractLiveRawContent(liveBody);
    const byteEqual = ex.ok && ex.content === oracleEnvelope34179.content;
    calibrationEvidence.push({
      skin: "journal skin customized",
      cardClass: "customized bootswatch skin",
      file: "live-raw-view-journal-skin-customized-culturesmith-2026-10-04.html",
      oracle: "p21-journal-skin-customized",
      oracleSource: "p21 oracle record capture 2026-09-30 (envelope id 34179)",
      oracleContentChars: oracleEnvelope34179.content.length,
      liveRawBodyChars: liveBody.length,
      extractionBounds: ex.ok ? { from: ex.from, to: ex.to } : null,
      contentByteEqual: byteEqual,
    });
    if (!byteEqual) {
      throw new Error(
        `live raw-view extraction rule FAILED class calibration on journal skin customized ` +
          `(ok=${ex.ok} byteEqual=${byteEqual}) -- refusing to emit the 34530 row`,
      );
    }
  }
  // content from BOTH recorded fetches; the two must agree byte-exact
  const perFetch = [];
  for (const f of LIVE_LITERA_CUSTOMIZED_FETCHES) {
    const bodyPath = path.join(LIVE_CUSTOMIZED_DIR, f.file);
    const body = readFileSync(bodyPath, "utf8");
    const actualSha = createHash("sha256").update(readFileSync(bodyPath)).digest("hex");
    if (actualSha !== f.sha256) {
      throw new Error(
        `live raw-view capture file ${f.file} sha256 ${actualSha} does not match the recorded fetch sha ${f.sha256} -- refusing to emit`,
      );
    }
    const ex = extractLiveRawContent(body);
    if (!ex.ok) {
      throw new Error(`live raw-view extraction failed for ${f.file}: ${ex.reason}`);
    }
    perFetch.push({ ...f, bodyChars: body.length, content: ex.content, bounds: { from: ex.from, to: ex.to } });
  }
  const stable = perFetch.every((p) => p.content === perFetch[0].content);
  if (!stable) {
    throw new Error("live raw-view litera skin customized content is NOT byte-identical across the two recorded fetches -- refusing to emit");
  }
  const customContent = perFetch[0].content;
  // the proven gates: identity, non-degenerate double-emit decomposition,
  // M-head absence, full-content containment absence
  const row = corpus
    .prepare("SELECT id, name, content, length(content) AS len FROM cards WHERE id = 34530")
    .get();
  if (row === undefined || row.name !== "litera skin customized") {
    throw new Error(`identity gate failed for litera skin customized 34530 (found ${row ? JSON.stringify(row.name) : "nothing"})`);
  }
  const d = decompose(customContent, row.content ?? "");
  if (!d.clean) {
    throw new Error(`litera skin customized decomposition not clean: ${d.reason}`);
  }
  if (d.prefix === 0 || d.tail === 0) {
    throw new Error(
      `litera skin customized decomposition is degenerate (prefix ${d.prefix} tail ${d.tail}) -- ` +
        "the proven 34179 double-emit shape is [corpus prefix][M][corpus tail] with both non-zero; " +
        "a degenerate result means the corpus row or the live bytes changed shape, refusing to emit",
    );
  }
  const mRows = mHeadInCorpusRows(d.mBlock);
  if (mRows !== 0) {
    throw new Error(
      `litera skin customized M head found in ${mRows} corpus rows -- the override premise is stale, refusing to emit`,
    );
  }
  const containment = rowsContainingContent(customContent);
  if (containment.hits !== 0) {
    throw new Error(
      `litera skin customized live content contained in ${containment.hits} corpus rows -- the override premise is stale, refusing to emit`,
    );
  }
  // measured cross-facts, recorded not gated: M block vs 34179's M, and the
  // restored content vs the 33872 base-litera row emitted by this same run
  const mEquals34179 = d.mBlock === oracleEnvelope34179.content.slice(251225, oracleEnvelope34179.content.length - 945);
  const baseLiteraCard = cards.find((c) => c.id === 33872);
  const contentEqualsBaseLiteraRow = baseLiteraCard !== undefined && customContent === baseLiteraCard.content;
  const typeRow = corpus
    .prepare(
      "SELECT c.id, c.name, c.key, c.codename FROM cards c WHERE c.id = (SELECT type_id FROM cards WHERE id = 34530)",
    )
    .get();
  const corpusCard = corpus.prepare("SELECT codename FROM cards WHERE id = 34530").get();
  cards.push({
    id: 34530,
    content: customContent,
    note:
      "litera skin customized -- the live deck's stored content " +
      `(live raw view, ${customContent.length} chars = corpus prefix ${d.prefix} + M ${d.mBlock.length} + corpus tail ${d.tail}, ` +
      "the 34179 double-emit shape over the 253,810-byte SCSS source row). " +
      "No expected-v2 capture record exists for this card (swept 2026-10-03); class-calibrated live capture. " +
      "Measured deck state: byte-identical to litera skin's (33872) restored content.",
  });
  provenance.push({
    cardId: 34530,
    cardName: "litera skin customized",
    classRow:
      "M8 skin:record class sibling -- litera skin customized, no capture record, " +
      "restored from the LIVE site (litera-custom-skin lane 2026-10-03)",
    source: "LIVE culturesmith.com ?view=raw capture (2026-10-04T04:39/04:40Z, two byte-stable fetches)",
    file: path.join(LIVE_CUSTOMIZED_DIR, LIVE_LITERA_CUSTOMIZED_FETCHES[0].file),
    captureId: 34530,
    envelopeFields: {
      name: row.name,
      type: typeRow.name,
      type_code: typeRow.codename,
      codename: corpusCard.codename,
      keySource: "engine-derived from the name (DeckoName key of 'litera skin customized')",
    },
    contentChars: customContent.length,
    envelopeEqualities: {
      prefixBytes: d.prefix,
      middleBytes: d.mBlock.length,
      tailBytes: d.tail,
    },
    corpusRowBytes: row.len,
    corpusAbsence: {
      test: "no corpus row contains the full restored content (full-needle instr over length-qualified candidates); M head absent from every corpus row (strict, the 34179 gate)",
      candidatesExamined: containment.candidatesExamined,
      containingRows: 0,
      mHeadContainingRows: mRows,
    },
    liveCapture: {
      captureDir: LIVE_CUSTOMIZED_DIR,
      route: "?view=raw (served page title verified 'litera skin customized - Culturesmith')",
      fetches: perFetch.map((p) => ({
        file: p.file,
        fetchedAt: p.fetchedAt,
        url: p.url,
        status: p.status,
        sha256: p.sha256,
        bodyChars: p.bodyChars,
        extractionBounds: p.bounds,
      })),
      crossFetchContentByteEqual: stable,
      extractionRule: "content sits between '<div id=\"main\">' and '</div><script>' in the raw-view body",
      calibration: calibrationEvidence,
      calibrationNote:
        "rule pins (cerulean skin, journal skin -- oracle shard contents reproduced byte-exact from the m8 lane's recorded live fetches) plus the " +
        "customized-class pin (journal skin customized's live raw view reproduces 34179's ORACLE envelope content byte-exact, single occurrence) -- " +
        "this pins both the extraction rule and live-stored==oracle-stored for the customized card class",
      measuredCrossFacts: {
        mBlockByteEqualTo34179M: mEquals34179,
        mBlockNote:
          "the compiled 221,051-char block inserted into the customized source rows is the same compiled decko application CSS for journal and litera",
        contentByteEqualToBaseLiteraRow33872: contentEqualsBaseLiteraRow,
        contentEqualityNote:
          "the live deck's stored bytes for litera skin and litera skin customized are byte-identical (same measured for journal base vs customized vs 34179's oracle); the corpus rows differ (50-byte markup vs 253,810-byte SCSS source) but the materialized bytes coincide",
      },
    },
    crossCapture: null,
  });
  console.log(
    `OK   litera skin customized id 34530 (LIVE capture): content ${customContent.length} chars = prefix ${d.prefix} + M ${d.mBlock.length} + tail ${d.tail}` +
      ` | M-head rows ${mRows}, containment candidates ${containment.candidatesExamined}, hits 0` +
      ` | 2 live fetches byte-stable, class-calibrated on journal-customized vs 34179 oracle` +
      ` | M==34179M ${mEquals34179}, ==baseLiteraRow ${contentEqualsBaseLiteraRow}`,
  );
}

// ---------- journal skin customized 34179 (the proven original row) ----------
const card34179 = corpus
  .prepare("SELECT id, name, key, content, length(content) AS len FROM cards WHERE id = 34179")
  .get();
console.log(`JOURNAL 34179 "${card34179.name}" corpus content ${card34179.len} bytes`);
const expectedBytes = readFileSync(CAPTURE);
const envelope = JSON.parse(expectedBytes.toString("utf8"));
const oracleContent = envelope.content;
console.log(`CAPTURE ${CAPTURE}`);
console.log(`  envelope bytes ${expectedBytes.length}, content ${oracleContent.length} chars`);
const dj = decompose(oracleContent, card34179.content);
if (!dj.clean) {
  throw new Error(`journal 34179 decomposition no longer clean: ${dj.reason}`);
}
const jRows = mHeadInCorpusRows(dj.mBlock);
const jContainment = rowsContainingContent(oracleContent);
console.log(`  prefix match ${dj.prefix} bytes, tail match ${dj.tail} bytes, middle M ${dj.mBlock.length} bytes`);
console.log(`  corpus rows containing the M head: ${jRows} (expected 0)`);
console.log(`  corpus rows containing the FULL restored content: ${jContainment.hits} over ${jContainment.candidatesExamined} length-qualified candidates (expected 0)`);
if (jRows !== 0) {
  throw new Error("M block found in corpus -- the override premise is stale, refusing to emit");
}
if (jContainment.hits !== 0) {
  throw new Error("full restored content found in corpus -- the override premise is stale, refusing to emit");
}
cards.push({
  id: 34179,
  content: oracleContent,
  note:
    "journal skin customized -- oracle deck's stored content " +
    `(${oracleContent.length} chars = corpus prefix ${dj.prefix} + M ${dj.mBlock.length} + corpus tail ${dj.tail}); ` +
    "the corpus row holds the 252,170-byte pre-materialization bytes.",
});
provenance.push({
  cardId: 34179,
  cardName: "journal skin customized",
  classRow: "harness-corpus-repair lane 2026-10-02 (landed at dfe642b)",
  source: "p21 oracle record capture (2026-09-30)",
  file: CAPTURE,
  captureId: envelope.id ?? 34179,
  envelopeFields: {
    name: envelope.name,
    key: envelope.key,
    type: envelope.type,
    type_code: envelope.type_code,
    codename: envelope.codename,
  },
  contentChars: oracleContent.length,
  envelopeEqualities: {
    prefixBytes: dj.prefix,
    middleBytes: dj.mBlock.length,
    tailBytes: dj.tail,
  },
  corpusRowBytes: card34179.len,
  corpusHeadAbsentRows: 0,
});

// ---------- +parent cross-check (unchanged from the proven lane) ----------
let shardRecords = [];
try {
  const parentShard =
    "C:/localProjects/decko-ts-lane-negdelta-zero/tmp/raw-ground-truth/expected-v2/" +
    "page-lane/recapture-raw-shard-000039.jsonl";
  shardRecords = readFileSync(parentShard, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((o) => o.record && /^journal skin customized\+parent/.test(o.record.name ?? ""))
    .map((o) => o.record);
} catch (err) {
  console.log(`+parent shard unreadable (${err.message.slice(0, 80)}) -- +parent cross-check skipped`);
}
const parentChecks = [];
for (const rec of shardRecords) {
  const row = corpus
    .prepare("SELECT id, left_id, right_id, type_id, content FROM cards WHERE id = ?")
    .get(rec.id);
  const left = row ? corpus.prepare("SELECT name FROM cards WHERE id = ?").get(row.left_id) : null;
  const right = row ? corpus.prepare("SELECT name FROM cards WHERE id = ?").get(row.right_id) : null;
  const check = {
    id: rec.id,
    captureName: rec.name,
    captureContent: rec.content,
    corpusRowExists: row !== undefined,
    corpusContent: row?.content ?? null,
    corpusJoinedName: row && left && right ? `${left.name}+${right.name}` : null,
    contentMatches: row !== undefined && row.content === rec.content,
  };
  parentChecks.push(check);
  console.log(
    `  +parent cross-check id ${rec.id}: corpusRow=${check.corpusRowExists} contentMatches=${check.contentMatches} joinedName=${check.corpusJoinedName}`,
  );
}

corpus.close();

// ---------- emit (id-ordered) ----------
cards.sort((a, b) => a.id - b.id);
provenance.sort((a, b) => a.cardId - b.cardId);
const override = {
  meta: {
    what:
      "Capture-restored card rows the raw corpus dump lacks. Applied by " +
      "tests/card/render/raw-corpus-seeding.ts to the STAGED deck only; the " +
      "sha-pinned corpus file is never mutated. M8 skin:record class " +
      "(20 bootswatch skins, residual-classes-dfe642b-w5.txt class [20]) plus " +
      "journal skin customized 34179 (harness-corpus-repair) plus the two " +
      "bootstrap SCSS source siblings 33852/33848 (m8-siblings-litera, " +
      "M8 corpus-materialization remainder) plus litera skin 33872, the one " +
      "bootswatch skin with no capture record, restored from the LIVE site's " +
      "?view=raw route (m8-siblings-litera), plus litera skin customized " +
      "34530, restored from the same LIVE route and class-calibrated on " +
      "journal skin customized 34179's oracle envelope (litera-custom-skin).",
    corpusSha256: corpusSha,
    generatedBy: "tools/oracle/extract-raw-corpus-override-rows-from-captures.mjs",
    generatedAt: new Date().toISOString(),
    provenance,
    skipped,
  },
  cards,
  references: [],
};
writeFileSync(OUT, JSON.stringify(override, null, 2));
console.log(`WROTE ${OUT} (cards: ${override.cards.map((c) => c.id).join(", ")})`);
const siblingEmitted = provenance.filter((p) =>
  M8_BOOTSTRAP_SIBLINGS.some((s) => s.name === p.cardName),
).length;
const liveArmRows = provenance.filter((p) => p.liveCapture !== undefined).length;
console.log(
  `M8 CLASS: ${cards.length - siblingEmitted - liveArmRows - 1} of ${M8_CLASS_SKINS.length} class rows emitted, ` +
    `${siblingEmitted} of ${M8_BOOTSTRAP_SIBLINGS.length} bootstrap siblings emitted, ` +
    `${liveArmRows} LIVE-capture rows emitted (33872 litera skin, 34530 litera skin customized), ` +
    `${skipped.length} skipped (documented in meta.skipped), + journal 34179`,
);
