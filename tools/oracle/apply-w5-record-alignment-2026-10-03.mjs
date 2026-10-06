// apply-w5-record-alignment-2026-10-03.mjs -- W5 RECORD-ALIGNMENT LANE's
// REVERSIBLE, MANIFEST-BOUND corpus expectation swap: the 5 W5 record entries
// (dual-lane-view:<name>:record — *input type+*right+*content options, *alerts,
// *now, *version, Mod) get their expectation `record.content` REBUILT FROM THE
// LOCAL CORPUS MIRROR ROWS (bench-corpus-raw.sqlite3), under the Ruby
// card_attributes snapshot shape (tools/oracle/capture-dual-lane-page-and-view.rb:254).
//
// WHY (the lane's traced mechanism): the record expectations are ActiveRecord
// metadata snapshots photographed by the Ruby oracle at capture time. For
// these 5 cards Ruby's `card.content` was answered by set-module CODE
// OVERRIDES, not the row (card-mod-date set/self/now.rb wall-clock; core mod
// set/self/version.rb Cardio::Version.release; set/self/alerts.rb literal
// comment; set/self/mod.rb whose "#{mod}_mod" interpolation leaks
// Object#inspect addresses — a capture-time process artifact; and the
// content-options famA MEMBER 2 documented row transform). The mirror rows —
// the lane's mandated truth — carry none of those values. The lane probe
// (probe-w5-record-entries-corpus-alignment-2026-10-03.mjs) PROVED content is
// the sole diverging field on all 5 (the other 8 snapshot fields are
// byte-identical expected-vs-handler; the graded byte deltas reconcile
// exactly with the content lengths). Classification: EXPECTATION-STALE on
// content only; the TS card-engine record handler already renders the
// mirror-true shape, so the swap makes the entries PASS by construction.
// Zero engine edits; no views.ts involvement.
//
// SWAP SHAPE: content-only, inside the record object — the line's other
// fields (including the LIVE-SWAPPED views on the content-options line, the
// 15 live-settled entries' bytes) are carried through untouched by
// construction.
//
// BYTE SAFETY (the w5-live-alignment discipline, reused verbatim): the shard
// files are CRLF-per-line (with occasional lone-LF lines — shard 000007 has
// 122 CRLF lines and one lone-LF line), and a parse-modify-dump write STRIPS
// the trailing CR of every rewritten line (JSON.parse eats it). The write is
// therefore a BYTE-LEVEL SPLICE of exactly the value's escaped string literal
// inside the raw line; split/join is "\n"-ONLY. The inverse stores the
// ORIGINAL escaped literal span and restores it verbatim (byte-exact,
// sha-verified).
//
// MODES
//   --emit-anchor    Write the external anchor JSON (per-entry CURRENT
//                    expected-content sha, measured from this staging, plus
//                    the mirror row provenance) to the lane receipt dir. Run
//                    ONCE, pre-apply; the anchor is the validate-only
//                    pre-state reference.
//   --validate-only  No writes. Verify every target entry's CURRENT
//                    record.content sha matches the anchor (pre-state), the
//                    forward manifest (applied), or the inverse's original
//                    state.
//   --apply          Validate the pre-state, splice the mirror row content
//                    into record.content on the named line, record per-shard
//                    before/after shas + per-entry provenance (mirror row id,
//                    mirror content sha256/bytes) in the FORWARD manifest and
//                    the original escaped literal spans in the INVERSE
//                    manifest. Refuses (exit 2) if any entry already carries
//                    the mirror bytes.
//   --inverse        Revert: validate every recorded applied-state file sha,
//                    splice the recorded original escaped literal back,
//                    verify the result file shas equal the recorded original
//                    shas. REFUSES anything else.
//
// USAGE (from the worktree root)
//   node tools/oracle/apply-w5-record-alignment-2026-10-03.mjs \
//     --repo <worktree-root> \
//     --anchor C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/w5-record-alignment-dispositions-2026-10-03.json \
//     --mode emit-anchor|validate-only|apply|inverse

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ---------- args ----------
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const REPO = path.resolve(argValue("--repo") ?? process.cwd());
const ANCHOR = argValue("--anchor") ??
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/w5-record-alignment-dispositions-2026-10-03.json";
const MODE = argValue("--mode") ?? "validate-only";
if (!["emit-anchor", "validate-only", "apply", "inverse"].includes(MODE)) {
  console.error("REFUSAL: --mode must be emit-anchor | validate-only | apply | inverse");
  process.exit(2);
}

const STAGING = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
const MIRROR_DB = path.join(REPO, "tmp", "raw-ground-truth", "bench-corpus-raw.sqlite3");
const OUT_DIR = path.join(REPO, "fixtures", "corpus-v2", "w5-record-alignment-2026-10-03");
const FORWARD_MANIFEST = path.join(OUT_DIR, "w5-record-alignment-swap-manifest.json");
const INVERSE_MANIFEST = path.join(OUT_DIR, "w5-record-alignment-swap-inverse-manifest.json");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const fail = (msg) => {
  console.error("REFUSAL: " + msg);
  process.exit(2);
};

// ---------- the swap set: the 5 record entries ----------
// mirrorRowId is the corpus mirror row the rebuilt content is bound to
// (provenance; the probe printed each row's full metadata).
const targets = [
  { id: "dual-lane-view:*input type+*right+*content options:record", shard: "recapture-raw-shard-000007.jsonl", name: "*input type+*right+*content options", mirrorRowId: 11745 },
  { id: "dual-lane-view:*alerts:record", shard: "recapture-raw-shard-000003.jsonl", name: "*alerts", mirrorRowId: 4032 },
  { id: "dual-lane-view:*now:record", shard: "recapture-raw-shard-000003.jsonl", name: "*now", mirrorRowId: 4036 },
  { id: "dual-lane-view:*version:record", shard: "recapture-raw-shard-000003.jsonl", name: "*version", mirrorRowId: 4037 },
  { id: "dual-lane-view:Mod:record", shard: "recapture-raw-shard-000039.jsonl", name: "Mod", mirrorRowId: 45410 },
];

// ---------- byte-level splice helpers (w5-live-alignment discipline) ----------
// Find the escaped string literal span for record.content inside a raw line:
// anchor on `"record":`, then the FIRST `"content":` after it (the record
// object's own content key), then walk escapes to the closing quote.
// Returns [start, end) of the FULL literal including quotes, or null.
function contentLiteralSpan(rawLine) {
  const recAt = rawLine.indexOf('"record":');
  if (recAt === -1) return null;
  const keyAt = rawLine.indexOf('"content":', recAt);
  if (keyAt === -1) return null;
  return scanLiteral(rawLine, keyAt + '"content":'.length);
}
// quote(): wrap an escaped string-literal BODY with the surrounding quotes
// (scanLiteral's span includes the quotes; JSON.stringify().slice(1,-1) does not)
const DQ = String.fromCharCode(34);
function quote(body) { return DQ + body + DQ; }
function scanLiteral(s, from) {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== '"') return null;
  const start = i;
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") { i += 2; continue; }
    if (c === '"') return [start, i + 1];
    i++;
  }
  return null;
}

// ---------- shard line access (split/join "\n" ONLY — mixed endings) ----------
function readShardFile(lane, shard) {
  const p = path.join(STAGING, lane, shard);
  if (!existsSync(p)) fail("shard missing: " + p);
  const raw = readFileSync(p, "utf8");
  const lines = raw.split("\n");
  return { p, raw, lines };
}
function lineOf(lines, name) {
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const obj = JSON.parse(lines[i].replace(/\r$/, ""));
    if (obj.name === name) return { idx: i, obj, raw: lines[i] };
  }
  return null;
}

// ---------- mirror rows (the truth source) ----------
const { default: Database } = await import("better-sqlite3");
const mirror = new Database(MIRROR_DB, { readonly: true });

function mirrorRow(rowId) {
  const row = mirror
    .prepare("SELECT id, name, key, codename, left_id, right_id, type_id, content, length(content) AS clen, trash FROM cards WHERE id = ?")
    .get(rowId);
  if (!row || row.trash !== 0) fail(`mirror row missing or trashed: ${rowId}`);
  return row;
}

// ---------- build entry records from current staging ----------
const entryRecords = [];
const shardFiles = new Map();
for (const t of targets) {
  const key = "view-lane/" + t.shard;
  if (!shardFiles.has(key)) shardFiles.set(key, { lane: "view-lane", shard: t.shard, items: [] });
  const sf = shardFiles.get(key);
  const { lines } = readShardFile("view-lane", t.shard);
  const hit = lineOf(lines, t.name);
  if (!hit) fail(`card line not found: ${t.name} in ${key}`);
  const span = contentLiteralSpan(hit.raw);
  if (!span) fail(`record.content literal span not found for ${t.id} in ${key}`);
  const rawLiteral = hit.raw.slice(span[0], span[1]);
  const currentValue = JSON.parse(rawLiteral);
  if (typeof currentValue !== "string") fail(`record.content is not a string for ${t.id}`);
  const row = mirrorRow(t.mirrorRowId);
  const newContent = row.content ?? "";
  const newEscaped = JSON.stringify(newContent).slice(1, -1);
  entryRecords.push({
    id: t.id, lane: "view-lane", shard: t.shard, line: hit.idx + 1, name: t.name,
    field: "record.content",
    beforeSha256: sha256(Buffer.from(currentValue, "utf8")),
    beforeBytes: Buffer.byteLength(currentValue, "utf8"),
    afterSha256: sha256(Buffer.from(newContent, "utf8")),
    afterBytes: Buffer.byteLength(newContent, "utf8"),
    originalEscapedLiteral: rawLiteral,
    appliedEscapedLiteral: newEscaped,
    mirrorRowId: row.id,
    mirrorContentSha256: sha256(Buffer.from(newContent, "utf8")),
    mirrorContentBytes: row.clen ?? 0,
  });
  sf.items.push(entryRecords[entryRecords.length - 1]);
}

// ---------- mode: emit-anchor ----------
if (MODE === "emit-anchor") {
  const anchor = {
    lane: "w5-record-alignment-2026-10-03",
    generatedAt: new Date().toISOString(),
    mirrorSha256: sha256(readFileSync(MIRROR_DB)),
    basis:
      "the 5 W5 record entries; expectations rebuilt from the LOCAL corpus mirror rows under the Ruby card_attributes snapshot shape (capture-dual-lane-page-and-view.rb:254); probe probe-w5-record-entries-corpus-alignment-2026-10-03.mjs proved content is the sole diverging field on all 5",
    entries: entryRecords.map(({
      originalEscapedLiteral, appliedEscapedLiteral, ...rest
    }) => rest),
  };
  writeFileSync(ANCHOR, JSON.stringify(anchor, null, 2));
  console.log(JSON.stringify({ mode: MODE, anchor: ANCHOR, entries: entryRecords.length }, null, 2));
  process.exit(0);
}

// ---------- mode: validate-only ----------
if (MODE === "validate-only") {
  const anchor = JSON.parse(readFileSync(ANCHOR, "utf8"));
  const manifestExists = existsSync(FORWARD_MANIFEST);
  const forward = manifestExists ? JSON.parse(readFileSync(FORWARD_MANIFEST, "utf8")) : null;
  let pre = 0, applied = 0;
  for (const er of entryRecords) {
    const { lines } = readShardFile(er.lane, er.shard);
    const hit = lineOf(lines, er.name);
    const span = contentLiteralSpan(hit.raw);
    const curValue = JSON.parse(hit.raw.slice(span[0], span[1]));
    const curSha = sha256(Buffer.from(curValue, "utf8"));
    const ar = anchor.entries.find((e) => e.id === er.id);
    if (ar && curSha === ar.beforeSha256) { pre++; continue; }
    if (forward) {
      const mf = forward.entries.find((e) => e.id === er.id);
      if (mf && curSha === mf.afterSha256) { applied++; continue; }
    }
    fail(`state drift for ${er.id}: current sha ${curSha.slice(0, 12)} matches neither the anchor's pre-state nor the manifest's applied state`);
  }
  console.log(JSON.stringify({
    mode: MODE, entries: entryRecords.length,
    state: `pre=${pre} applied=${applied}`,
    shards: [...shardFiles.keys()],
  }, null, 2));
  process.exit(0);
}

// ---------- mode: apply ----------
if (MODE === "apply") {
  // one-direction guard: refuse any entry already carrying the mirror bytes
  for (const er of entryRecords) {
    if (er.beforeSha256 === er.afterSha256) fail(`${er.id} already carries the mirror bytes (already applied?)`);
  }
  // the live-settled views guard: for every line ALSO carrying views, record
  // the full-line byte budget so the post-splice line differs ONLY inside the
  // record.content span (checked after splice, below).
  mkdirSync(OUT_DIR, { recursive: true });
  const shardBefore = {}, shardAfter = {};
  for (const sf of shardFiles.values()) {
    const { lane, shard, items } = sf;
    const { lines } = readShardFile(lane, shard);
    const key = lane + "/" + shard;
    shardBefore[key] = sha256(lines.join("\n"));
    for (const er of items) {
      const hit = lineOf(lines, er.name);
      const span = contentLiteralSpan(hit.raw);
      const curValue = JSON.parse(hit.raw.slice(span[0], span[1]));
      if (sha256(Buffer.from(curValue, "utf8")) !== er.beforeSha256) fail(`pre-state drift for ${er.id}`);
      const before = hit.raw;
      const after = before.slice(0, span[0]) + quote(er.appliedEscapedLiteral) + before.slice(span[1]);
      // line-level proof: identical prefix and suffix around the replaced span
      if (!after.startsWith(before.slice(0, span[0]))) fail(`prefix drift for ${er.id}`);
      if (!after.endsWith(before.slice(span[1]))) fail(`suffix drift for ${er.id}`);
      // the views payload must be byte-identical on the spliced line
      const viewsBefore = before.slice(before.indexOf('"views":'));
      const viewsAfter = after.slice(after.indexOf('"views":'));
      if (viewsBefore !== viewsAfter) fail(`views payload disturbed for ${er.id} (live-settled guard)`);
      lines[hit.idx] = after;
    }
    writeFileSync(path.join(STAGING, lane, shard), lines.join("\n"), "utf8");
    shardAfter[key] = sha256(readFileSync(path.join(STAGING, lane, shard), "utf8"));
  }
  const forward = {
    lane: "w5-record-alignment-2026-10-03",
    appliedAt: new Date().toISOString(),
    source: "LOCAL corpus mirror rows — per-entry mirrorRowId/mirrorContentSha256 below; mirror db sha256 in mirrorDbSha256 and in the anchor JSON",
    pattern:
      "record.content-only expectation rebuild from the mirror rows under the Ruby card_attributes shape; byte-level literal splice, CRLF discipline preserved; views payloads byte-identical (live-settled guard asserted per line)",
    staging: STAGING,
    mirrorDbSha256: sha256(readFileSync(MIRROR_DB)),
    shardBefore, shardAfter,
    entries: entryRecords.map(({
      originalEscapedLiteral, appliedEscapedLiteral, ...rest
    }) => ({ ...rest, appliedEscapedLiteralSha256: sha256(appliedEscapedLiteral) })),
  };
  const inverse = {
    lane: forward.lane,
    inverseOf: "w5-record-alignment-swap-manifest.json",
    shardBefore: forward.shardAfter,
    shardAfter: forward.shardBefore,
    entries: entryRecords.map(({
      id, lane, shard, line, name, field,
      beforeSha256, afterSha256, originalEscapedLiteral, appliedEscapedLiteral,
      mirrorRowId, mirrorContentSha256, mirrorContentBytes,
    }) => ({
      id, lane, shard, line, name, field,
      appliedSha256: afterSha256, originalSha256: beforeSha256,
      originalEscapedLiteral, appliedFullLiteral: quote(appliedEscapedLiteral),
      mirrorRowId, mirrorContentSha256, mirrorContentBytes,
    })),
  };
  writeFileSync(FORWARD_MANIFEST, JSON.stringify(forward, null, 2));
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(inverse, null, 2));
  console.log(JSON.stringify({ mode: MODE, entries: entryRecords.length, shards: Object.keys(shardAfter), forwardManifest: FORWARD_MANIFEST, inverseManifest: INVERSE_MANIFEST }, null, 2));
}

// ---------- mode: inverse ----------
if (MODE === "inverse") {
  const inverse = JSON.parse(readFileSync(INVERSE_MANIFEST, "utf8"));
  const byShard = new Map();
  for (const e of inverse.entries) {
    const key = e.lane + "/" + e.shard;
    if (!byShard.has(key)) byShard.set(key, { lane: e.lane, shard: e.shard, items: [] });
    byShard.get(key).items.push(e);
  }
  for (const { lane, shard, items } of byShard.values()) {
    const { lines } = readShardFile(lane, shard);
    const key = lane + "/" + shard;
    const curSha = sha256(lines.join("\n"));
    if (inverse.shardBefore[key] !== curSha) fail(`inverse pre-state drift on ${key}: current ${curSha.slice(0, 12)} != recorded applied ${inverse.shardBefore[key].slice(0, 12)}`);
    for (const e of items) {
      const hit = lineOf(lines, e.name);
      if (!hit || hit.idx !== e.line - 1) fail(`line drift for ${e.id}: expected line ${e.line}`);
      const span = contentLiteralSpan(hit.raw);
      const curLiteral = hit.raw.slice(span[0], span[1]);
      if (sha256(Buffer.from(JSON.parse(curLiteral), "utf8")) !== e.appliedSha256) fail(`applied-state drift for ${e.id}`);
      if (curLiteral !== e.appliedFullLiteral) fail(`applied literal drift for ${e.id} (not byte-identical to recorded applied span)`);
      lines[hit.idx] = hit.raw.slice(0, span[0]) + e.originalEscapedLiteral + hit.raw.slice(span[1]);
    }
    const outSha = sha256(lines.join("\n"));
    if (inverse.shardAfter[key] !== outSha) fail(`inverse result mismatch on ${key}: ${outSha.slice(0, 12)} != recorded original ${inverse.shardAfter[key].slice(0, 12)}`);
    writeFileSync(path.join(STAGING, lane, shard), lines.join("\n"), "utf8");
  }
  console.log(JSON.stringify({ mode: MODE, entries: inverse.entries.length, restored: true, byteExact: true }, null, 2));
}
mirror.close();
