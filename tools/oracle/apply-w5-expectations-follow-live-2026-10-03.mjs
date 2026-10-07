// apply-w5-expectations-follow-live-2026-10-03.mjs -- W5 LIVE-ALIGNMENT LANE's
// REVERSIBLE, MANIFEST-BOUND corpus expectation swap: the 13 LIVE-DIFFERS
// entries (6 views + 7 pages, verdicts in
// WORK_DIR/w5-live-alignment-verdicts-2026-10-03.json)
// get today's live bytes (fetched 2026-10-04T00:39:51Z, the reference deck,
// raw captures stored verbatim — the recapture lane's own pattern, whose 77
// swaps stored live bytes INCLUDING per-response noise) as their corpus
// expectation.
//
// THE 2 LIVE-CONFIRMS entries are NOT swapped (expectation live-true: the
// entries fail for engine reasons). The 5 record entries are NOT swapped
// (LIVE-UNCHECKABLE: live has no record view surface — 422 "view (record) not
// supported" x3 / 403 denial x2, live-verified this lane; the record JSON is
// ActiveRecord metadata, not a live view). Nothing is seeded (the fabrication
// rule: rows absent from staging stay CORPUS-ROW-MISSING).
//
// BYTE SAFETY (the close-71 discipline, learned here the hard way): the shard
// files are CRLF-per-line, and a parse-modify-dump write STRIPS the trailing
// CR of every rewritten line (JSON.parse eats it as whitespace). The write is
// therefore a BYTE-LEVEL SPLICE of exactly the value's escaped string literal
// inside the raw line — the line ending bytes and every other field byte are
// carried through untouched by construction. The inverse stores the ORIGINAL
// escaped literal span and restores it verbatim (byte-exact, sha-verified).
//
// Grading note: the harness normalizes data-slot-id hashes on both sides of a
// comparison (src/testing/diff.ts SLOT_ID_PATTERN -> RANDOMIZED), so swapping
// raw live hashes in cannot change how a comparison normalizes.
//
// MODES
//   --validate-only  No writes. Verify every target entry's CURRENT
//                    expectation sha matches an external anchor: the verdicts
//                    JSON's recorded pre-swap expSha, or the committed
//                    manifest's after (applied) / before (inversed) state.
//   --apply          Validate the pre-state, splice the live bytes into the
//                    named field of the named line, record per-shard
//                    before/after shas + per-entry provenance (live url,
//                    fetchedAt, sha256, bytes) in the FORWARD manifest, and
//                    the original escaped literal spans in the INVERSE
//                    manifest. Re-running after a successful apply refuses
//                    (exit 2) on the one-direction guard.
//   --inverse        Revert: validate every recorded applied-state file sha,
//                    splice the recorded original escaped literal back,
//                    verify the result file shas equal the recorded original
//                    shas. REFUSES anything else.
//
// USAGE (from the worktree root)
//   node tools/oracle/apply-w5-expectations-follow-live-2026-10-03.mjs \
//     --repo <worktree-root> \
//     --captures WORK_DIR/w5-live-alignment-captures-2026-10-03 \
//     --mode validate-only|apply|inverse

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
const CAPTURES = argValue("--captures") ??
  "WORK_DIR/w5-live-alignment-captures-2026-10-03";
const MODE = argValue("--mode") ?? "validate-only";
if (!["validate-only", "apply", "inverse"].includes(MODE)) {
  console.error("REFUSAL: --mode must be validate-only | apply | inverse");
  process.exit(2);
}

const STAGING = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
const OUT_DIR = path.join(REPO, "fixtures", "corpus-v2", "w5-live-alignment-2026-10-03");
const FORWARD_MANIFEST = path.join(OUT_DIR, "w5-live-alignment-swap-manifest.json");
const INVERSE_MANIFEST = path.join(OUT_DIR, "w5-live-alignment-swap-inverse-manifest.json");
const VERDICTS = "WORK_DIR/w5-live-alignment-verdicts-2026-10-03.json";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const fail = (msg) => {
  console.error("REFUSAL: " + msg);
  process.exit(2);
};

// ---------- the swap set: the 13 LIVE-DIFFERS entries, from the verdicts ----------
const verdicts = JSON.parse(readFileSync(VERDICTS, "utf8"));
const swapRows = verdicts.rows.filter((r) => r.verdict === "LIVE-DIFFERS");
if (swapRows.length !== 13) fail(`expected 13 LIVE-DIFFERS entries, got ${swapRows.length}`);

function slugFor(name) {
  return name.replace(/ /g, "_").replace(/[*:?"<>|]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}
const targets = swapRows.map((r) => {
  let name, view;
  if (r.kind === "page") { name = r.id.replace(/^dual-lane-page:/, "").replace(/:page$/, ""); view = null; }
  else {
    const m = r.id.match(/^dual-lane-view:(.*):render:(\w+)$/);
    if (!m) fail("unparseable view id (record entries are never swapped): " + r.id);
    name = m[1]; view = m[2];
  }
  return {
    id: r.id,
    lane: r.kind === "page" ? "page-lane" : "view-lane",
    shard: r.expShard, name, view,
    field: r.kind === "page" ? "page_html" : `views.${view}`,
    liveFile: path.join(CAPTURES, r.kind === "page"
      ? "pages/" + slugFor(name) + ".html"
      : "views/" + slugFor(name) + "__" + view + ".html"),
  };
});

// ---------- byte-level splice helpers ----------
// Find the escaped string literal span for a JSON key path inside a raw line.
// Scans the raw text with a literal-aware tokenizer: from the key's position,
// skips to the value's opening quote, then walks escapes to the closing quote.
// Returns [start, end) of the FULL literal including quotes, or null.
function valueLiteralSpan(rawLine, field) {
  if (field === "page_html") {
    const keyAt = rawLine.indexOf('"page_html":');
    if (keyAt === -1) return null;
    return scanLiteral(rawLine, keyAt + '"page_html":'.length);
  }
  const m = field.match(/^views\.(\w+)$/);
  if (!m) return null;
  const view = m[1];
  const viewsAt = rawLine.indexOf('"views":');
  if (viewsAt === -1) return null;
  const keyAt = rawLine.indexOf(`"${view}":`, viewsAt);
  if (keyAt === -1) return null;
  return scanLiteral(rawLine, keyAt + `"${view}":`.length);
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

// ---------- shard line access ----------
// Split/join on "\n" ONLY (never "\r\n"): the shards may carry MIXED line
// endings (view-lane/recapture-raw-shard-000007.jsonl has 122 CRLF lines and
// one lone-LF line mid-file; a "\r\n" split would concatenate two logical
// lines and corrupt the parse). Each line keeps its trailing "\r" as data;
// value splices slice the raw line so line endings are preserved verbatim.
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

// ---------- build entry records from current staging ----------
const liveLogLines = readFileSync(path.join(CAPTURES, "capture-log.jsonl"), "utf8")
  .trim().split("\n").map(JSON.parse);

const entryRecords = [];
const shardFiles = new Map();
for (const t of targets) {
  const key = t.lane + "/" + t.shard;
  if (!shardFiles.has(key)) shardFiles.set(key, { ...t, items: [] });
  const sf = shardFiles.get(key);
  const { lines } = readShardFile(t.lane, t.shard);
  const hit = lineOf(lines, t.name);
  if (!hit) fail(`card line not found: ${t.name} in ${key}`);
  const span = valueLiteralSpan(hit.raw, t.field);
  if (!span) fail(`value literal span not found for ${t.id} in ${key}`);
  const rawLiteral = hit.raw.slice(span[0], span[1]);
  const currentValue = JSON.parse(rawLiteral);
  if (typeof currentValue !== "string" || currentValue.length === 0) fail(`current expectation empty for ${t.id}`);
  const liveBuf = readFileSync(t.liveFile);
  if (liveBuf.length === 0) fail(`live capture empty for ${t.id}`);
  const liveLog = liveLogLines.find((l) => l.id === t.id);
  if (!liveLog || liveLog.status !== 200) fail(`live capture not 200 for ${t.id}`);
  const newEscaped = JSON.stringify(liveBuf.toString("utf8")).slice(1, -1);
  entryRecords.push({
    id: t.id, lane: t.lane, shard: t.shard, line: hit.idx + 1, name: t.name, view: t.view,
    field: t.field,
    beforeSha256: sha256(Buffer.from(currentValue, "utf8")),
    beforeBytes: Buffer.byteLength(currentValue, "utf8"),
    afterSha256: sha256(liveBuf),
    afterBytes: liveBuf.length,
    originalEscapedLiteral: rawLiteral,
    appliedEscapedLiteral: newEscaped,
    liveUrl: liveLog.url, liveFetchedAt: liveLog.fetchedAt, liveStatus: liveLog.status,
  });
  sf.items.push(entryRecords[entryRecords.length - 1]);
}

// ---------- mode: validate-only ----------
if (MODE === "validate-only") {
  const manifestExists = existsSync(FORWARD_MANIFEST);
  const forward = manifestExists ? JSON.parse(readFileSync(FORWARD_MANIFEST, "utf8")) : null;
  let pre = 0, applied = 0, orig = 0;
  for (const er of entryRecords) {
    const { lines } = readShardFile(er.lane, er.shard);
    const hit = lineOf(lines, er.name);
    const span = valueLiteralSpan(hit.raw, er.field);
    const curValue = JSON.parse(hit.raw.slice(span[0], span[1]));
    const curSha = sha256(Buffer.from(curValue, "utf8"));
    const vr = verdicts.rows.find((r) => r.id === er.id);
    if (vr && vr.expSha && curSha === vr.expSha) { pre++; continue; }
    if (forward) {
      const mf = forward.entries.find((e) => e.id === er.id);
      if (mf && curSha === mf.afterSha256) { applied++; continue; }
      if (mf && curSha === mf.beforeSha256) { orig++; continue; }
    }
    fail(`state drift for ${er.id}: current sha ${curSha.slice(0, 12)} matches neither the verdicts' recorded pre-state nor the manifest's applied/original state`);
  }
  console.log(JSON.stringify({
    mode: MODE, entries: entryRecords.length,
    state: forward ? `pre=${pre} applied=${applied} original=${orig}` : `pre=${pre}`,
    shards: [...shardFiles.keys()],
  }, null, 2));
  process.exit(0);
}

// ---------- mode: apply ----------
if (MODE === "apply") {
  // one-direction guard: refuse any entry already carrying live bytes
  for (const er of entryRecords) {
    if (er.beforeSha256 === er.afterSha256) fail(`${er.id} already carries the live bytes (already applied?)`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const shardBefore = {}, shardAfter = {};
  for (const sf of shardFiles.values()) {
    const { lane, shard, items } = sf;
    const { lines } = readShardFile(lane, shard);
    const key = lane + "/" + shard;
    shardBefore[key] = sha256(lines.join("\n"));
    for (const er of items) {
      const hit = lineOf(lines, er.name);
      const span = valueLiteralSpan(hit.raw, er.field);
      const curValue = JSON.parse(hit.raw.slice(span[0], span[1]));
      if (sha256(Buffer.from(curValue, "utf8")) !== er.beforeSha256) fail(`pre-state drift for ${er.id}`);
      lines[hit.idx] = hit.raw.slice(0, span[0]) + quote(er.appliedEscapedLiteral) + hit.raw.slice(span[1]);
    }
    writeFileSync(path.join(STAGING, lane, shard), lines.join("\n"), "utf8");
    shardAfter[key] = sha256(readFileSync(path.join(STAGING, lane, shard), "utf8"));
  }
  const forward = {
    lane: "w5-live-alignment-2026-10-03",
    appliedAt: new Date().toISOString(),
    source: "the reference deck live GETs 2026-10-04T00:39:51Z (capture-log.jsonl per entry)",
    pattern: "recapture-lane whole-body expectation swap (raw live bytes verbatim, incl. documented per-response noise); byte-level literal splice, CRLF discipline preserved",
    staging: STAGING,
    shardBefore, shardAfter,
    entries: entryRecords.map(({
      originalEscapedLiteral, appliedEscapedLiteral, ...rest
    }) => ({ ...rest, appliedEscapedLiteralSha256: sha256(appliedEscapedLiteral) })),
  };
  const inverse = {
    lane: forward.lane,
    inverseOf: "w5-live-alignment-swap-manifest.json",
    shardBefore: forward.shardAfter,
    shardAfter: forward.shardBefore,
    entries: entryRecords.map(({
      id, lane, shard, line, name, view, field,
      beforeSha256, afterSha256, originalEscapedLiteral, appliedEscapedLiteral,
      liveUrl, liveFetchedAt, liveStatus,
    }) => ({
      id, lane, shard, line, name, view, field,
      appliedSha256: afterSha256, originalSha256: beforeSha256,
      originalEscapedLiteral, appliedFullLiteral: quote(appliedEscapedLiteral),
      liveUrl, liveFetchedAt, liveStatus,
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
      const span = valueLiteralSpan(hit.raw, e.field);
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
