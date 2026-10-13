// seed-fitting-scale.mjs — generates the FITTING-SCALE synthetic demo deck
// for the one-click CF deploy: a deck sized to fit inside ONE DAY of the D1
// free-tier write budget, with the arithmetic computed exactly (never
// approximated, never discovered by writing).
//
// THE ARITHMETIC THIS MODULE OWNS:
//
//   refs-per-card            = REFS_PER_CARD = 11.873639...
//   rows-per-card (card row + its share of refs) = 12.873639...
//
//   The SCHEMA itself mandates only 1 row per card (the `cards` row);
//   card_acts / card_actions / card_changes / card_revisions are write-path
//   tables a seed never touches, and card_references density is a property
//   of the deck, not the schema. REFS_PER_CARD is a fixed planning constant
//   that sets that density for every deck this module sizes; it is not
//   measured from any particular deck.
//   An earlier sizing of 6,600 cards:
//     6,600 cards -> 41 fixed + 6,600 = 6,641 card rows + 78,366 refs
//     = 85,007 rows; + 50 (ANALYZE) = 85,057 = 85.06% of the day
//     -> EXCEEDS the 80% guard, so one-click-deck refuses that size
//     (exit --budget-exceeded).
//   The guard-fitting default is 6,200 Scale Pages:
//     6,241 card rows + 73,617 refs = 79,858 rows
//     + 50 (ANALYZE) = 79,908 = 79.91% -> PASS with 92 rows of headroom.
//   The mathematical ceiling at zero headroom is 6,207 Scale Pages
//   (79,998 rows with ANALYZE) — stated for completeness, not offered
//   as a default because 2 rows of headroom is not headroom.
//
// Deck shape (all synthetic — the data rule: no real member content ever):
//   9 scaffold cards   — author bot, Search/Cardtype/User/Note/Pointer
//                        cardtypes, Home
//   32-deep chain      — Depth Level 1..32, each including the next
//   1 x 500-item pointer — Big Pointer (Pointer cardtype, 500 wiki links)
//   1 CQL search probe — All Scale Page Probe (Search cardtype, CQL body)
//   N Scale Pages      — Scale Page 1x..Nx (Note), the scale dimension
//   R stored refs      — card_references rows distributed over the Scale
//                        Pages to match the density exactly (round)
//
// Output: chunk SQL files (single-row INSERTs ONLY, so chunk row counts are
// exact by construction) at two granularities:
//   local-5000/  — for `wrangler d1 execute --local` (workerd has no remote
//                  DO size limit; 16 files for the default deck)
//   remote-800/  — for the real CF pass: 800 statements per call, measured as
//                  surviving the remote D1 endpoint without needing
//                  D1_RESET_DO resets; a 5,000-statement chunk failed
//                  deterministically.
// plus manifest.json carrying the exact per-file row counts and budget math.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANALYZE_ROWS_ESTIMATE, GUARD_ROW_LIMIT, D1_FREE_DAILY_ROW_WRITES } from "./write-budget.mjs";

/** Density planning constants: the refs-per-card basis every deck size
 *  decision in this module is made against. */
export const CORPUS_CARDS = 93_700;
export const CORPUS_REFS = 1_112_560;
export const CORPUS_ROWS = CORPUS_CARDS + CORPUS_REFS; // 1,206,260

export const REFS_PER_CARD = CORPUS_REFS / CORPUS_CARDS; // 11.873639...

/** Cards that are NOT Scale Pages: scaffold 7 (ids 1-6 and 8; id 7 is
 *  deliberately left unused) + chain 32 + pointer 1 + search probe 1 = 41. */
export const FIXED_CARDS = 7 + 32 + 1 + 1; // 41
export const CHAIN_DEPTH = 32;
export const POINTER_ITEMS = 500;

export const LOCAL_CHUNK_STATEMENTS = 5_000;
export const REMOTE_CHUNK_STATEMENTS = 800; // measured as safe against the remote endpoint

const STAMP = "2026-09-23 00:00:00.000";

function q(value) {
  return typeof value === "string"
    ? `'${value.replace(/'/g, "''")}'`
    : value === null
      ? "NULL"
      : String(value);
}

function scalePageName(k) {
  return `Scale Page ${k}x`;
}

/** Canonical key of scalePageName(k) — MUST equal the engine's
 *  name -> key canonicalization (lowercase, non-alphanumerics -> "_"):
 *  "Scale Page 173x" -> "scale_page_173x". A key that drifts from that
 *  canonicalization makes every Scale Page 404, because URL routing and CQL
 *  both resolve by KEY and never by name. Ends in 'x', not 's', so the
 *  plural-stem singularization trap does not apply. */
function scalePageKey(k) {
  return `scale_page_${k}x`;
}

/** The full card list, deterministic (pure index math, no RNG). */
function cardList(scalePages) {
  const cards = [];
  const card = (id, name, key, codename, typeId, dbContent) =>
    cards.push({ id, name, key, codename, typeId, dbContent });

  // scaffold cards — the fixed id range the chain, pointer and probe sit around
  card(1, "CF Test Bot", "cf_test_bot", null, 4, "Synthetic author identity used as creator and updater on every card in this deck.");
  card(2, "Search", "search", "search_type", 3, null);
  card(3, "Cardtype", "cardtype", null, 3, null);
  card(4, "User", "user", null, 3, null);
  card(5, "Note", "note", null, 3, null);
  card(6, "Pointer", "pointer", null, 3, null);
  card(8, "Home", "home", null, 5,
    `<p>Fitting-scale one-click demo deck. Synthetic content only — no real member data.</p>` +
    `<p>{{Scale Page 1x}}</p>` +
    `<p>Probes: [[All Scale Page Probe]] · [[Big Pointer]] · the 32-deep inclusion chain ` +
    `starts at [[Depth Level 1]] (rendering the whole chain from its root raises ` +
    `<code>nest depth exceeded (Depth Level 22)</code> — Ruby-parity behavior, ` +
    `Card.config.max_depth = 20; enter mid-chain, e.g. [[Depth Level 20]], to stay ` +
    `under the cap).</p>`);

  // 32-deep inclusion chain (ids 10..41)
  for (let d = 1; d <= CHAIN_DEPTH; d++) {
    const body =
      d < CHAIN_DEPTH
        ? `<p>Depth level ${d} of ${CHAIN_DEPTH}.</p>{{Depth Level ${d + 1}}}`
        : `<p>Depth level ${d} of ${CHAIN_DEPTH} — the leaf.</p>`;
    card(9 + d, `Depth Level ${d}`, `depth_level_${d}`, null, 5, body);
  }

  // 500-item pointer (id 50)
  const pointerLines = [];
  for (let j = 0; j < POINTER_ITEMS; j++) {
    const k = ((j * 7) % scalePages) + 1;
    pointerLines.push(`[[${scalePageName(k)}]]`);
  }
  card(50, "Big Pointer", "big_pointer", null, 6, pointerLines.join(" "));

  // CQL search probe (id 60)
  card(60, "All Scale Page Probe", "all_scale_page_probe", null, 2,
    '{"type":"Note","sort":"name"}');

  // the scale set (ids 100..)
  for (let k = 1; k <= scalePages; k++) {
    card(99 + k, scalePageName(k), scalePageKey(k), null, 5,
      `<p>${scalePageName(k)}: synthetic scale content for read-path measurement.</p>`);
  }
  return cards;
}

function cardInsert(c) {
  return (
    `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, ` +
    `created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, ` +
    `references_expired, trash, type_id, db_content) VALUES (` +
    `${q(c.id)}, ${q(c.name)}, ${q(c.key)}, ${q(c.codename)}, NULL, NULL, NULL, ` +
    `'${STAMP}', '${STAMP}', 1, 1, NULL, NULL, NULL, 0, ${q(c.typeId)}, ${q(c.dbContent ?? null)});`
  );
}

function refInsert(refererId, refereeKey, refType) {
  return (
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) ` +
    `VALUES (${refererId}, '${refereeKey}', NULL, '${refType}', 1);`
  );
}

/** The stored-reference list, deterministic, exactly refRows rows. */
function refList(scalePages, refRows) {
  const refs = [];
  for (let j = 0; j < refRows; j++) {
    const scaleIndex = j % scalePages; // 0-based referer within the scale set
    let k = ((j * 7919) % scalePages) + 1; // 7919 prime -> spread referees
    if (k === scaleIndex + 1) k = (k % scalePages) + 1; // never self-reference
    refs.push({ refererId: 100 + scaleIndex, refereeKey: scalePageKey(k), refType: j % 2 ? "L" : "I" });
  }
  return refs;
}

/**
 * Plan the deck: exact row arithmetic + budget verdict, BEFORE anything is
 * generated or written. Returns { ok, ...numbers, reason? }.
 */
export function planSeed({ scalePages }) {
  const cards = FIXED_CARDS + scalePages;
  const refRows = Math.round(scalePages * REFS_PER_CARD);
  const seedRows = cards + refRows;
  const projectedWithAnalyze = seedRows + ANALYZE_ROWS_ESTIMATE;
  const ok = projectedWithAnalyze <= GUARD_ROW_LIMIT;
  return {
    ok,
    scalePages,
    cardRows: cards,
    refRows,
    seedRows,
    analyzeEstimate: ANALYZE_ROWS_ESTIMATE,
    projectedWithAnalyze,
    refsPerCard: REFS_PER_CARD,
    rowsPerCard: seedRows / scalePages,
    guardLimit: GUARD_ROW_LIMIT,
    dailyLimit: D1_FREE_DAILY_ROW_WRITES,
    percentOfDailyLimit: +((projectedWithAnalyze / D1_FREE_DAILY_ROW_WRITES) * 100).toFixed(2),
    headroomRows: GUARD_ROW_LIMIT - projectedWithAnalyze,
    reason: ok
      ? null
      : `fitting-scale seed of ${scalePages} Scale Pages writes ${seedRows} rows ` +
          `(${cards} cards + ${refRows} refs at corpus density ${REFS_PER_CARD.toFixed(6)}/card), ` +
          `+${ANALYZE_ROWS_ESTIMATE} ANALYZE = ${projectedWithAnalyze} rows = ` +
          `${((projectedWithAnalyze / D1_FREE_DAILY_ROW_WRITES) * 100).toFixed(2)}% of the ` +
          `${D1_FREE_DAILY_ROW_WRITES}/day free-tier budget — past the ${GUARD_ROW_LIMIT} guard. ` +
          `Lower --cards (the guard-fitting default is 6,200; the zero-headroom ceiling is 6,207).`,
  };
}

/**
 * Generate + write chunk files and manifest. Caller has already run
 * planSeed() and gotten ok=true (or explicitly overridden for a LOCAL-only
 * generation that never touches the account).
 */
export function generateSeedFiles({ scalePages, outDir }) {
  const plan = planSeed({ scalePages });
  if (!plan.ok) {
    throw new Error(`write-budget guard: ${plan.reason}`);
  }
  const cards = cardList(scalePages);
  const refs = refList(scalePages, plan.refRows);
  const statements = [
    ...cards.map(cardInsert),
    ...refs.map((r) => refInsert(r.refererId, r.refereeKey, r.refType)),
  ];

  const writeChunks = (dir, chunkStatements) => {
    mkdirSync(dir, { recursive: true });
    const files = [];
    for (let i = 0; i < statements.length; i += chunkStatements) {
      const slice = statements.slice(i, i + chunkStatements);
      const file = join(dir, `chunk-${String(i / chunkStatements + 1).padStart(3, "0")}.sql`);
      const header =
        `-- fitting-scale seed chunk ${i / chunkStatements + 1}: ` +
        `${slice.length} single-row INSERTs = ${slice.length} rows written. Generated by ` +
        `seed-fitting-scale.mjs (synthetic data only; data rule absolute).\n`;
      writeFileSync(file, header + slice.join("\n") + "\n", "utf8");
      files.push({ file, rows: slice.length });
    }
    return files;
  };

  const localDir = join(outDir, "fitting-scale-seed", "local-5000");
  const remoteDir = join(outDir, "fitting-scale-seed", "remote-800");
  const localFiles = writeChunks(localDir, LOCAL_CHUNK_STATEMENTS);
  const remoteFiles = writeChunks(remoteDir, REMOTE_CHUNK_STATEMENTS);

  const manifest = {
    generator: "scripts/deploy/one-click-deck/seed-fitting-scale.mjs",
    dataRule: "synthetic content only; no real member data ever",
    deck: {
      scalePages,
      chainDepth: CHAIN_DEPTH,
      pointerItems: POINTER_ITEMS,
      fixedCards: FIXED_CARDS,
      cardRows: plan.cardRows,
      refRows: plan.refRows,
      totalRows: plan.seedRows,
      refsPerCard: plan.refsPerCard,
    },
    budget: {
      dailyLimit: plan.dailyLimit,
      guardLimit: plan.guardLimit,
      analyzeRowsEstimate: plan.analyzeEstimate,
      projectedWithAnalyze: plan.projectedWithAnalyze,
      percentOfDailyLimit: plan.percentOfDailyLimit,
      headroomRows: plan.headroomRows,
      convention: "table rows only",
    },
    corpusBasis: {
      cards: CORPUS_CARDS,
      refs: CORPUS_REFS,
      totalRows: CORPUS_ROWS,
      note: "measured density basis for the ref distribution",
    },
    chunks: {
      local: { dir: localDir, statementsPerChunk: LOCAL_CHUNK_STATEMENTS, fileCount: localFiles.length, rows: plan.seedRows },
      remote: { dir: remoteDir, statementsPerChunk: REMOTE_CHUNK_STATEMENTS, fileCount: remoteFiles.length, rows: plan.seedRows },
    },
  };
  const manifestPath = join(outDir, "fitting-scale-seed", "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { plan, manifest, manifestPath, localFiles, remoteFiles };
}
