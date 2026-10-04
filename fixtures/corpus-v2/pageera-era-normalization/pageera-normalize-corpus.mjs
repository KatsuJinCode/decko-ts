// pageera-normalize-corpus.mjs -- THE transform. Single definition, the
// close-71 reversible-manifest pattern, PAGE-lane serializer era-normalization.
//
// RELATION TO R2's TOOL. This is r2-era-normalize-corpus.mjs with exactly one
// substantive change: the spliced JSON string value is the record's `page_html`
// instead of `views[view]`, because a page-lane record stores its expectation
// in `page_html`. Every refusal, the LF line-separator rule, the
// "only mutated lines re-serialized" property and the committed inverse are
// carried over unchanged. R2's two self-found defects are FIXED here rather
// than copied:
//   - R2 §7(a): its manifest wrote `preBytes: preBytes.length`, a UTF-16 code
//     unit count wearing a byte name (49/49 wrong as byte counts, 24/49
//     actually wrong). This writes Buffer.byteLength and names the fields
//     `preBytes`/`postBytes` only where they are true byte counts, with the
//     code-unit count kept beside them under its own name.
//   - R2 §3b defect 2: the inverse read its post-state guard off an entry row,
//     where no such field exists, so it refused unconditionally. This reads
//     the top-level `shardShaAfter` map, keyed `<lane>/<shard>`.
//
// WHAT IT DOES. For each named (lane, shard, name) target it BYTE-SPLICES the
// one JSON string value `page_html` inside the one corpus line, replacing the
// ARMED (live-serializer) capture with the engine's FROZEN-form emission
// rendered under the graded arm. It does NOT re-serialize the record.
//
// REFUSES ON
//   - corpus db sha != the engine's load-bearing pin
//     (tests/card/render/raw-corpus-override-capture-restored-rows.json
//      meta.corpusSha256, enforced at raw-corpus-seeding.ts:497-503);
//   - any touched shard whose sha256 differs from the supplied pre-state
//     record (pre-state drift);
//   - any target whose current `page_html` sha256 differs from the plan's
//     recorded pre sha;
//   - any target whose frozen byte file is absent;
//   - a line that does not parse as JSON (the line-separator guard);
//   - a splice whose round-tripped parse is not the intended value, or whose
//     other record fields moved;
//   - a line count change on write;
//   - a changed line the entry list never named.
//
// INVERSE. The manifest records, per entry, the full pre-state bytes (the
// armed form) as `inverse.preBytes`, so the armed capture is recoverable from
// the manifest alone. `--inverse <manifest>` restores them, refusing on
// post-state drift.
//
// USAGE
//   node pageera-normalize-corpus.mjs --corpus <root> --plan <plan.json> \
//        --verify-prestate <shas.json> --out-manifest <manifest.json> [--dry-run]
//   node pageera-normalize-corpus.mjs --corpus <root> --inverse <manifest.json> \
//        --out-manifest <restored-manifest.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const has = (flag) => process.argv.includes(flag);

const CORPUS = path.resolve(argValue("--corpus", "tmp/raw-ground-truth"));
const PLAN = argValue("--plan", "");
const INVERSE = argValue("--inverse", "");
const VERIFY_PRESTATE = argValue("--verify-prestate", "");
const OUT_MANIFEST = argValue("--out-manifest", "");
const DRY_RUN = has("--dry-run");
const PIN_PATH = path.resolve(
  argValue("--engine-pin", "tests/card/render/raw-corpus-override-capture-restored-rows.json"),
);

const sha = (b) => createHash("sha256").update(b).digest("hex");
const shaStr = (s) => sha(Buffer.from(s, "utf8"));
const die = (msg, code = 2) => {
  console.error(`TRANSFORM-REFUSE: ${msg}`);
  process.exit(code);
};

// The recording-layer rule, copied from src/testing/diff.ts:26,31,102-104:
// `data-slot-id=<q>20 lowercase hex<q>` -> `data-slot-id="RANDOMIZED"`. Applied
// to the engine's bytes so the post-state is stable across renders (the engine
// emits a fresh 20-hex id per render; the corpus cannot store one that a
// future render reproduces). MEASURED on this lane's corpus: both lanes carry
// literal 20-hex ids ONLY -- 131 on the view lane, 249 on the page lane, 0
// placeholders (survey-slot-id-conventions.mjs) -- so this transform INTRODUCES
// the placeholder on the 11 records it touches. That is verdict-neutral (the
// committed mask erases both forms) and it is R2's established choice; it is
// recorded here because it changes the page lane's slot-id convention on those
// records, which a byte-level reader of the corpus will see.
const SLOT_ID_PATTERN = /data-slot-id=(["'])[0-9a-f]{20}\1/g;
const normalizeSlotIds = (html) => html.replace(SLOT_ID_PATTERN, 'data-slot-id="RANDOMIZED"');

function jsonStringEnd(s, start) {
  if (s[start] !== '"') die(`splice: expected a JSON string at ${start}, found ${JSON.stringify(s[start])}`);
  let i = start + 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") { i += 2; continue; }
    if (c === '"') return i + 1;
    i += 1;
  }
  die("splice: unterminated JSON string");
}

/** Byte-splice the one `page_html` value inside one raw corpus line. */
function splicePageHtml(rawLine, newValue) {
  const keyMarker = '"page_html":';
  const keyAt = rawLine.indexOf(keyMarker);
  if (keyAt < 0) die("splice: line has no \"page_html\": key");
  const valueStart = keyAt + keyMarker.length;
  if (rawLine[valueStart] !== '"') die("splice: page_html value is not a JSON string");
  const valueEnd = jsonStringEnd(rawLine, valueStart);
  return {
    before: rawLine,
    after: rawLine.slice(0, valueStart) + JSON.stringify(newValue) + rawLine.slice(valueEnd),
    span: rawLine.slice(valueStart, valueEnd),
  };
}

const shardPath = (lane, shard) =>
  path.join(CORPUS, "expected-v2", lane === "view" ? "view-lane" : "page-lane", shard);

// The corpus shard line separator is LF, NOT CRLF (R2 measured this and its own
// first apply shipped a stray 0x0D on every line of every touched shard by
// hardcoding a CRLF join against an LF split). Keep the assertion: a line that
// does not parse is the line-separator assumption being wrong, and it must stop
// the run before any write.
const LINE_SEP = "\n";
function shardLines(p) {
  const lines = readFileSync(p, "utf8").split(LINE_SEP);
  for (const [i, l] of lines.entries()) {
    if (l.trim() === "") continue;
    try {
      JSON.parse(l);
    } catch (e) {
      die(`line ${i} of ${path.basename(p)} does not parse as JSON (${e.message}); the shard's line separator assumption is wrong`);
    }
  }
  return lines;
}

const dbPath = path.join(CORPUS, "bench-corpus-raw.sqlite3");
const dbSha = sha(readFileSync(dbPath));
let enginePin = null;
try {
  enginePin = JSON.parse(readFileSync(PIN_PATH, "utf8")).meta.corpusSha256;
} catch {
  die(`engine corpus pin unreadable at ${PIN_PATH}`);
}
if (enginePin !== dbSha) {
  die(`corpus db sha ${dbSha} != engine pin ${enginePin} (raw-corpus-seeding.ts:497-503 would refuse to seed)`);
}

if (INVERSE) {
  const man = JSON.parse(readFileSync(path.resolve(INVERSE), "utf8"));
  if (man.corpusDbSha256 !== dbSha) die(`inverse: corpus db moved (${dbSha} != ${man.corpusDbSha256})`);
  // The post-state guard reads the TOP-LEVEL shardShaAfter map (keyed
  // "<lane>/<shard>"). R2 §3b defect 2 read it off an entry row, where no such
  // field exists, so the inverse refused unconditionally -- correct failure
  // direction, wrong guard.
  const postShas = man.shardShaAfter ?? {};
  if (Object.keys(postShas).length === 0) die("inverse: manifest carries no shardShaAfter map");
  for (const key of Object.keys(postShas)) {
    const [lane, shard] = key.split("/");
    const have = sha(readFileSync(shardPath(lane, shard)));
    if (have !== postShas[key]) {
      die(`inverse: post-state drift in ${key}: manifest ${postShas[key].slice(0, 16)}, on disk ${have.slice(0, 16)}`);
    }
  }
  const byShard = new Map();
  for (const row of man.entries) {
    if (!byShard.has(row.shard)) byShard.set(row.shard, []);
    byShard.get(row.shard).push(row);
  }
  const restored = [];
  for (const [shard, rows] of byShard) {
    const p = shardPath(rows[0].lane, shard);
    const before = shardLines(p);
    const lines = before.slice();
    for (const row of rows) {
      const idx = lines.findIndex((l) => {
        if (l === "") return false;
        try { return JSON.parse(l).name === row.name; } catch { return false; }
      });
      if (idx < 0) die(`inverse: record ${row.name} not in ${shard}`);
      const parsed = JSON.parse(lines[idx]);
      const sp = splicePageHtml(lines[idx], row.inverse.preBytes);
      if (sp.span !== JSON.stringify(parsed.page_html)) die(`inverse: span mismatch on ${row.tag}`);
      lines[idx] = sp.after;
      const check = JSON.parse(lines[idx]);
      for (const k of Object.keys(parsed)) {
        if (k !== "page_html" && JSON.stringify(check[k]) !== JSON.stringify(parsed[k])) {
          die(`inverse: field ${k} moved on ${row.tag}`);
        }
      }
      if (shaStr(row.inverse.preBytes) !== row.inverse.preSha256) {
        die(`inverse: recorded preBytes on ${row.tag} do not hash to the recorded preSha256; the manifest is corrupt`);
      }
      restored.push({ tag: row.tag, shard, name: row.name, preSha256: row.inverse.preSha256 });
    }
    if (!DRY_RUN) {
      writeFileSync(p, lines.join(LINE_SEP));
      const after = readFileSync(p, "utf8").split(LINE_SEP);
      if (after.length !== before.length) die(`inverse: line count changed in ${shard}`);
      const named = new Set(rows.map((r) => r.name));
      for (let i = 0; i < before.length; i += 1) {
        if (before[i] === after[i]) continue;
        let bName = null;
        try { bName = JSON.parse(before[i]).name; } catch { /* unnamed */ }
        if (!named.has(bName)) die(`inverse changed an UNNAMED line (index ${i}, record ${bName}) in ${shard}`);
      }
    }
  }
  const out = {
    schema: "pageera-era-normalization-inverse-applied/1",
    appliedAt: new Date().toISOString(),
    corpusDbSha256: dbSha,
    entriesRestored: restored.length,
    restored,
  };
  if (OUT_MANIFEST) writeFileSync(path.resolve(OUT_MANIFEST), JSON.stringify(out, null, 2) + "\n");
  console.log(`INVERSE ${DRY_RUN ? "(dry-run) " : ""}restored=${restored.length} -> ${OUT_MANIFEST || "(no manifest)"}`);
  process.exit(0);
}

if (!PLAN) die("usage: --plan <plan.json> (forward) or --inverse <manifest.json>");
if (!OUT_MANIFEST) die("--out-manifest is required (the manifest IS the receipt; without it nothing is reversible)");
const plan = JSON.parse(readFileSync(path.resolve(PLAN), "utf8"));
if (plan.engineCorpusPin !== enginePin) die(`plan engine pin ${plan.engineCorpusPin} != ${enginePin}`);

let prestate = null;
if (VERIFY_PRESTATE) {
  prestate = JSON.parse(readFileSync(path.resolve(VERIFY_PRESTATE), "utf8"));
  if (prestate.corpusDbSha256 !== dbSha) die(`pre-state record corpus db ${prestate.corpusDbSha256} != ${dbSha}`);
}

const byShard = new Map();
for (const t of plan.targets) {
  if (!byShard.has(t.shard)) byShard.set(t.shard, []);
  byShard.get(t.shard).push(t);
}
for (const [shard, rows] of byShard) {
  const p = shardPath(rows[0].lane, shard);
  const have = sha(readFileSync(p));
  // The pre-state record keys its shard map by the corpus DIRECTORY name
  // ("page-lane"/"view-lane", the names on disk) while a plan target carries the
  // short lane name ("page"/"view"). Both spellings are accepted rather than
  // silently comparing undefined, because a comparison against `undefined`
  // reads as a refusal for the wrong reason.
  const dirName = rows[0].lane === "view" ? "view-lane" : "page-lane";
  const recorded = prestate?.shards?.[rows[0].lane]?.[shard] ?? prestate?.shards?.[dirName]?.[shard];
  if (prestate && recorded !== have) {
    die(`pre-state drift in ${dirName}/${shard}: recorded ${String(recorded).slice(0, 16)}, on disk ${have.slice(0, 16)}`);
  }
}

const manifestEntries = [];
const shardShaBefore = {};
for (const [shard, rows] of byShard) {
  const p = shardPath(rows[0].lane, shard);
  const raw = readFileSync(p, "utf8");
  shardShaBefore[`${rows[0].lane}/${shard}`] = sha(raw);
  const before = raw.split(LINE_SEP);
  const lines = before.slice();
  for (const t of rows) {
    const idx = lines.findIndex((l) => {
      if (l === "") return false;
      try { return JSON.parse(l).name === t.name; } catch { return false; }
    });
    if (idx < 0) die(`record ${t.name} not in ${shard}`);
    const parsed = JSON.parse(lines[idx]);
    if (typeof parsed.page_html !== "string") die(`record ${t.name} carries no page_html string`);
    const preBytes = parsed.page_html;
    const preSha = shaStr(preBytes);
    if (t.preSha256 && t.preSha256 !== preSha) {
      die(`pre-state drift on entry ${t.name}: plan ${t.preSha256.slice(0, 16)}, on disk ${preSha.slice(0, 16)}`);
    }
    const frozenRaw = readFileSync(path.resolve(t.frozenBytesFile), "utf8");
    const postBytes = normalizeSlotIds(frozenRaw);
    const sp = splicePageHtml(lines[idx], postBytes);
    if (sp.span !== JSON.stringify(preBytes)) die(`corpus JSON escaping is not standard on ${t.name}; refusing to splice`);
    const check = JSON.parse(sp.after);
    if (check.page_html !== postBytes) die(`splice round-trip failed on ${t.name}`);
    for (const k of Object.keys(parsed)) {
      if (k !== "page_html" && JSON.stringify(check[k]) !== JSON.stringify(parsed[k])) {
        die(`splice moved field ${k} on ${t.name}`);
      }
    }
    lines[idx] = sp.after;
    manifestEntries.push({
      tag: `${t.name}:${t.view ?? "page"}`,
      lane: t.lane, shard, name: t.name,
      preSha256: preSha, postSha256: shaStr(postBytes),
      // TRUE byte counts, plus the code-unit count under its own name (R2 §7a).
      preBytes: Buffer.byteLength(preBytes, "utf8"),
      postBytes: Buffer.byteLength(postBytes, "utf8"),
      preCodeUnits: preBytes.length,
      postCodeUnits: postBytes.length,
      delta: Buffer.byteLength(postBytes, "utf8") - Buffer.byteLength(preBytes, "utf8"),
      frozenBytesFile: t.frozenBytesFile,
      inverse: { preSha256: preSha, preBytes, form: "ARMED (live-serializer page capture, pre-state)" },
    });
  }
  if (!DRY_RUN) {
    writeFileSync(p, lines.join(LINE_SEP));
    const after = readFileSync(p, "utf8").split(LINE_SEP);
    if (after.length !== before.length) die(`write changed the line count of ${shard}: ${before.length} -> ${after.length}`);
    const named = new Set(rows.map((t) => t.name));
    for (let i = 0; i < before.length; i += 1) {
      if (before[i] === after[i]) continue;
      let bName = null;
      try { bName = JSON.parse(before[i]).name; } catch { /* unnamed */ }
      if (!named.has(bName)) {
        die(`write changed an UNNAMED line (index ${i}, record ${bName}) in ${shard}; the transform is not confined to its entry list`);
      }
    }
  }
}

const shardShaAfter = {};
for (const [shard, rows] of byShard) {
  const p = shardPath(rows[0].lane, shard);
  shardShaAfter[`${rows[0].lane}/${shard}`] = DRY_RUN ? shardShaBefore[`${rows[0].lane}/${shard}`] : sha(readFileSync(p));
}

const manifest = {
  schema: "pageera-era-normalization-manifest/1",
  transform: "pageera-normalize-corpus.mjs (pageera-normalization lane)",
  definition: "one byte-splice per named entry: page_html := normalizeSlotIds(engine frozen-era bytes rendered under the graded arm)",
  appliedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  corpusRoot: CORPUS,
  corpusDbSha256: dbSha,
  engineCorpusPin: enginePin,
  engineBase: plan.builtFrom?.engineBase ?? null,
  engineArm: plan.builtFrom?.engineArm ?? null,
  shardsTouched: Object.keys(shardShaAfter).length,
  entriesTransformed: manifestEntries.length,
  shardShaBefore,
  shardShaAfter,
  entries: manifestEntries,
};
writeFileSync(path.resolve(OUT_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
const moved = manifestEntries.filter((e) => e.preSha256 !== e.postSha256).length;
console.log(
  `TRANSFORM ${DRY_RUN ? "(dry-run) " : ""}shards=${Object.keys(shardShaAfter).length} entries=${manifestEntries.length} ` +
    `changed=${moved} manifest=${OUT_MANIFEST}`,
);
process.exit(0);
