// corpus-deck-pairing-gate.mjs -- refuse to grade a corpus that was captured
// on a different deck from the one the target is seeded with.
//
// WHY THIS EXISTS
//   A parity grade compares the reference's recorded output with the target's
//   output for the same input. That comparison only means something when both
//   sides rendered the SAME deck. The grade-11 seam-clean run (page lane
//   3,636/6,588) broke this silently: the expected corpus was re-captured on a
//   21,676-card snapshot deck (capture provenance sha ab2d762b...), while the
//   graded engine was seeded from bench-corpus-raw.sqlite3 (49,829 cards, sha
//   6a44dfdc...). 28,159 graded-deck cards do not exist in the capture deck.
//   Ruby's Card.fetch therefore returned a not-found placeholder (id nil) for
//   2,555 page entries whose cards the engine resolves to stored rows, and
//   "Card.fetch returned nil" for 114 more. Every one of those reached the
//   comparator as an engine "byte-diff" (or a capture-error row) and the run
//   reported them as engine failures. The pairing was never checked: the fire
//   script verified corpus digests and the bench sha separately, never that
//   one was captured on the other.
//
// WHAT IT CHECKS (read-only: shards are parsed, the deck is opened readonly)
//   1. Deck identity. When --provenance names the capture deck sha, it must
//      equal sha256(graded deck). A capture provenance that names no deck sha
//      is reported as UNVERIFIED (not as a pass). With --capture-deck (a
//      Decko-schema deck built from the graded deck, whose names and keys
//      Ruby needs derived), the provenance's capturedDeckSha256 must equal
//      that file's sha, and every card and reference row must equal the
//      graded deck's on the content columns (PAIRED-BY-CONTENT). With
//      --names-and-keys, cards.name and cards.key must also be equal row for
//      row (a graded deck staged with the capture deck's key repair).
//   2. Per-entry capture identity, every row of every lane. The capture's
//      input set (--input-set, the rig's disputed-set-resolved.json) names the
//      card id each entry was meant to photograph. For each row:
//        - identity-differs: the row rendered, but its captured `id` is not
//          the input id (nil = Ruby fetched a placeholder, not the card);
//        - capture-deck-missing-card: the row is the rig's
//          "Card.fetch returned nil" error while the graded deck holds the
//          input card live;
//        - graded-deck-missing-card: the graded deck has no live row for the
//          input id (the opposite direction of the same mismatch);
//        - unknown-input: the entry's name is not in the input set.
//      Each is a pairing fault: the row cannot be used as the expected output
//      for the graded deck. The gate never edits, drops or normalizes a row;
//      it refuses the run (gate mode) or reports (report mode).
//
// USAGE
//   node tools/oracle/corpus-deck-pairing-gate.mjs \
//     --corpus <raw-ground-truth dir holding expected-v2/ and bench-corpus-raw.sqlite3> \
//     --input-set <disputed-set-resolved.json> \
//     [--deck <graded deck sqlite; default <corpus>/bench-corpus-raw.sqlite3>] \
//     [--provenance <capture-provenance-manifest.json>] \
//     [--capture-deck <the Decko-schema deck the capture ran on>] \
//     [--mode gate|report] [--json <out.json>]
//
//   Exit 0: paired. Exit 2: pairing fault (gate mode) or usage error.
//   Report mode always exits 0 and prints the same summary.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FETCH_NIL_ERROR = "CAPTURE_ERROR: RuntimeError: Card.fetch returned nil";

/** Classify one captured row against its input id and the graded deck.
 *  Returns null when the row is paired, else a fault kind. Pure. */
export function classifyRow(row, inputId, deckHasLive) {
  if (inputId === undefined) return "unknown-input";
  const live = deckHasLive(inputId);
  const err = typeof row.error === "string" ? row.error : null;
  if (err !== null && err.startsWith(FETCH_NIL_ERROR)) {
    return live ? "capture-deck-missing-card" : null;
  }
  if (!live) return "graded-deck-missing-card";
  if (err !== null) return null; // a render error on a card both decks hold is a capture fact, graded as such
  if (row.id !== inputId) return "identity-differs";
  return null;
}

/** Run the per-entry check over parsed rows. Pure apart from the callbacks. */
export function checkRows(rows, inputIdByName, deckHasLive) {
  const faults = {};
  const examples = {};
  let checked = 0;
  for (const { lane, row } of rows) {
    checked++;
    const kind = classifyRow(row, inputIdByName.get(row.name), deckHasLive);
    if (kind === null) continue;
    const key = `${lane}:${kind}`;
    faults[key] = (faults[key] ?? 0) + 1;
    (examples[key] ??= []).length < 5 &&
      examples[key].push({ name: row.name, capturedId: row.id ?? null, inputId: inputIdByName.get(row.name) ?? null });
  }
  return { checked, faults, examples, faultTotal: Object.values(faults).reduce((a, b) => a + b, 0) };
}

/** Compare a capture provenance's deck sha with the graded deck's sha. */
export function checkDeckIdentity(provenance, gradedDeckSha) {
  const d = provenance?.deck ?? {};
  const captured = d.capturedDeckSha256 ?? d.renderedDeckSha256 ?? d.sourceSnapshotSha256 ?? null;
  if (captured === null) return { verdict: "UNVERIFIED", captured: null, graded: gradedDeckSha };
  return { verdict: captured === gradedDeckSha ? "PAIRED" : "MISMATCH", captured, graded: gradedDeckSha };
}

/** Card columns that carry deck content. name and key are excluded: the graded
 *  deck stores compound names as NULL and simple keys in raw form, while a
 *  Ruby capture deck must carry runtime-derived names and keys to resolve
 *  fetches; both are derived from the columns compared here. */
export const CONTENT_CARD_COLUMNS = ["id", "codename", "left_id", "right_id", "type_id", "trash",
  "read_rule_class", "read_rule_id", "creator_id", "updater_id", "created_at", "updated_at"];
/** With --names-and-keys the graded deck must also carry the capture deck's
 *  names and keys row for row: the strict form, for a graded deck staged with
 *  the capture deck's key repair so both sides read identical data. */
export const NAME_KEY_COLUMNS = ["name", '"key"'];
const REFERENCE_COLUMNS = ["id", "referer_id", "referee_key", "referee_id", "ref_type", "is_present"];

/** Content-level pairing: every card and reference row of the graded deck is
 *  present, identical, in the capture deck and vice versa. `db` has the graded
 *  deck as main and the capture deck attached as `cap`. Content is `content`
 *  in the graded deck and `db_content` in a Decko-schema capture deck. */
export function compareDeckContent(db, { namesAndKeys = false } = {}) {
  const capCols = db.prepare("SELECT name FROM pragma_table_info('cards', 'cap')").all().map((r) => r.name);
  const capContent = capCols.includes("db_content") ? "db_content" : "content";
  const cols = namesAndKeys ? [...CONTENT_CARD_COLUMNS, ...NAME_KEY_COLUMNS] : CONTENT_CARD_COLUMNS;
  const g = [...cols.map((c) => `g.${c}`), "g.content"].join(", ");
  const c = [...cols.map((x) => `c.${x}`), `c.${capContent}`].join(", ");
  const cardsOnlyGraded = db.prepare(`SELECT count(*) n FROM (SELECT ${g.replace(/g\./g, "")} FROM main.cards g EXCEPT SELECT ${c.replace(/c\./g, "")} FROM cap.cards c)`).get().n;
  const cardsOnlyCapture = db.prepare(`SELECT count(*) n FROM (SELECT ${c.replace(/c\./g, "")} FROM cap.cards c EXCEPT SELECT ${g.replace(/g\./g, "")} FROM main.cards g)`).get().n;
  const r = REFERENCE_COLUMNS.join(", ");
  const refsOnlyGraded = db.prepare(`SELECT count(*) n FROM (SELECT ${r} FROM main.card_references EXCEPT SELECT ${r} FROM cap.card_references)`).get().n;
  const refsOnlyCapture = db.prepare(`SELECT count(*) n FROM (SELECT ${r} FROM cap.card_references EXCEPT SELECT ${r} FROM main.card_references)`).get().n;
  const differing = cardsOnlyGraded + cardsOnlyCapture + refsOnlyGraded + refsOnlyCapture;
  return { verdict: differing === 0 ? "PAIRED-BY-CONTENT" : "MISMATCH", cardsOnlyGraded, cardsOnlyCapture, refsOnlyGraded, refsOnlyCapture };
}

function readShardRows(dir, lane) {
  const out = [];
  for (const fn of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(path.join(dir, fn), "utf8").split(/\r?\n/)) {
      if (line.trim() === "") continue;
      out.push({ lane, row: JSON.parse(line) });
    }
  }
  return out;
}

async function main() {
  const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
  const corpus = arg("--corpus");
  const inputSet = arg("--input-set");
  const mode = arg("--mode", "gate");
  if (!corpus || !inputSet || !["gate", "report"].includes(mode)) {
    console.error("PAIRING-USAGE: --corpus <dir> --input-set <json> [--deck <sqlite>] [--provenance <json>] [--capture-deck <sqlite> [--names-and-keys]] [--mode gate|report] [--json <out>]");
    process.exit(2);
  }
  const deckPath = arg("--deck", path.join(corpus, "bench-corpus-raw.sqlite3"));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRequire = createRequire(pathToFileURL(path.join(here, "..", "..", "package.json")).href);
  const Database = repoRequire("better-sqlite3");

  const gradedSha = createHash("sha256").update(readFileSync(deckPath)).digest("hex");
  const prov = arg("--provenance");
  const provenance = prov ? JSON.parse(readFileSync(prov, "utf8")) : null;
  const captureDeck = arg("--capture-deck");
  let deckIdentity;
  if (captureDeck) {
    // The capture ran on a Decko-schema deck built from the graded deck: prove
    // the provenance names THIS file, then prove its content is the graded deck's.
    const captureSha = createHash("sha256").update(readFileSync(captureDeck)).digest("hex");
    const declared = provenance?.deck?.capturedDeckSha256 ?? null;
    const cmp = new Database(deckPath, { readonly: true, fileMustExist: true });
    cmp.prepare("ATTACH DATABASE ? AS cap").run(captureDeck);
    const namesAndKeys = process.argv.includes("--names-and-keys");
    const content = { ...compareDeckContent(cmp, { namesAndKeys }), namesAndKeys };
    cmp.close();
    const shaOk = declared === captureSha;
    deckIdentity = { ...content, verdict: shaOk ? content.verdict : "MISMATCH", captureDeckSha: captureSha, provenanceCapturedDeckSha: declared, graded: gradedSha };
  } else {
    deckIdentity = provenance ? checkDeckIdentity(provenance, gradedSha)
                              : { verdict: "UNVERIFIED", captured: null, graded: gradedSha };
  }

  const inputIdByName = new Map(JSON.parse(readFileSync(inputSet, "utf8")).cards
    .filter((c) => c.id !== null && c.id !== undefined && c.name)
    .map((c) => [c.name, c.id]));
  const db = new Database(deckPath, { readonly: true, fileMustExist: true });
  const live = db.prepare("SELECT 1 FROM cards WHERE id = ? AND trash = 0");
  const deckHasLive = (id) => live.get(id) !== undefined;

  const rows = [];
  for (const lane of ["page", "view"]) {
    const dir = path.join(corpus, "expected-v2", `${lane}-lane`);
    if (existsSync(dir)) rows.push(...readShardRows(dir, lane));
  }
  const result = checkRows(rows, inputIdByName, deckHasLive);
  db.close();

  const summary = { deck: deckPath, deckIdentity, ...result };
  const out = arg("--json");
  if (out) writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ deckIdentity, checked: result.checked, faultTotal: result.faultTotal, faults: result.faults }, null, 2));
  const paired = result.faultTotal === 0 && deckIdentity.verdict !== "MISMATCH";  if (paired && deckIdentity.verdict === "UNVERIFIED") console.log("PAIRING-ENTRIES-OK (deck identity UNVERIFIED: no capture deck sha supplied)");
  else if (paired) console.log("PAIRING-OK");
  else console.log(`PAIRING-FAULT deckIdentity=${deckIdentity.verdict} entryFaults=${result.faultTotal}`);
  process.exit(!paired && mode === "gate" ? 2 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
