// Corpus card read-rule classifier — reusable module.
//
// Reads denormalized `cards.read_rule_class` / `cards.read_rule_id` columns
// from a Decko-style corpus SQLite (better-sqlite3, READ-ONLY) and decides
// whether each non-trashed card is publicly readable ("public") or
// access-controlled ("private").
//
// Decision rule (precise enough for a stranger to re-derive):
//   * Open the SQLite database in READ-ONLY mode.
//   * For each row in `cards` where `trash = 0`:
//       - Resolve the card's effective read rule card through the chain
//         of `read_rule_id` pointers (each rule card's read_rule_id is the
//         parent rule in the inheritance chain; most rule cards store
//         read_rule_id = self, terminating the walk).
//       - Look up the denormalized `read_rule_class` string on that
//         resolved rule card. The values come from Decko's set-pattern
//         taxonomy (src/card/set-patterns/rule-names.ts ruleClassName):
//           "*all"          — Anyone can read (open). PUBLIC.
//           "*all plus"     — Compound name inheriting *all. PUBLIC.
//           "*right"        — Specific right required. PRIVATE.
//           "*type"         — Type-membership required. PRIVATE.
//           "*type plus right" — Type + right. PRIVATE.
//           "*self"         — Creator-only. PRIVATE.
//           NULL / unknown  — missing rule coverage. PRIVATE.
//   * Trashed cards (`trash = 1`) are excluded from the map entirely
//     (the task scope is "non-trashed card" classification; trashed rows
//     are not part of either bucket).
//
// Privacy discipline:
//   This module NEVER returns, logs, or returns-from the body of any
//   rule card or any card name or content. It only reads structural
//   fields (rule columns, name prefix length, content length).
//
// Inputs:
//   dbPath — absolute path to the corpus SQLite file.
//   opts   — optional:
//     sampleN?:  number of random card ids to include for sanity-checking
//                (default 0, i.e. no extra sample rows returned).
//     seed?:     deterministic seed for any randomness (default 0).
//     includeTrashed?: if true, mapped rows for trashed cards are
//                returned with value "trashed" instead of being omitted
//                (default false).
//
// Output:
//   Map<number, "public" | "private"> (or Map<number, "public" | "private" | "trashed">)
//   keyed by `cards.id`. Iteration is insertion-stable (by ascending id).

import Database from "better-sqlite3";

/** Set of read_rule_class values that designate the "open" rule chain.
 *  "*all" is the canonical Anyone-readable rule; "*all plus" is the
 *  compound-name inheritance chain that resolves to *all. These are the
 *  two values Decko marks as universally readable (and match the Deckset/
 *  Decko source's permissions.rb:139-146 #ok_to_read? semantics under
 *  the Anonymous actor whose party list is `[AnyoneID]`). */
const OPEN_READ_RULE_CLASSES = new Set(["*all", "*all plus"]);

/**
 * Open a Decko-style corpus SQLite in READ-ONLY mode. Caller owns the
 * connection (close it when done).
 */
export function openCorpusDb(dbPath) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

/**
 * Read every non-trashed card row's id and read-rule columns from the
 * database. Returns an array of { id, readRuleId, readRuleClass } rows
 * ordered by id ascending.
 */
export function loadCardRuleRows(db) {
  return db
    .prepare(
      "SELECT id, read_rule_id AS readRuleId, read_rule_class AS readRuleClass, trash " +
        "FROM cards ORDER BY id ASC",
    )
    .all();
}

/**
 * Resolve a single card's effective read_rule_class by walking the
 * read_rule_id chain. Each rule card stores read_rule_id pointing to its
 * parent in the inheritance chain; rule cards that have no parent (or
 * whose parent IS themselves — the common case) terminate the walk.
 *
 * The chain is bounded to 16 hops as a safety rail; in practice the
 * Decko corpus never exceeds 1 hop.
 *
 * @param {number} startId card id to resolve from
 * @param {Map<number, {readRuleId: number|null, readRuleClass: string|null}>} index
 *        pre-built id -> rule-columns index over the cards table (built
 *        once for the whole corpus). Includes rows that may be trashed;
 *        the classifier's filter happens against the original row, not
 *        the rule resolution.
 * @returns {string|null} the resolved read_rule_class (may be null)
 */
export function resolveReadRuleClass(startId, index) {
  let current = startId;
  for (let depth = 0; depth < 16; depth++) {
    const row = index.get(current);
    if (row === undefined) return null;
    const parentId = row.readRuleId;
    if (parentId === null || parentId === current) {
      // self-reference or no parent — chain terminal
      return row.readRuleClass;
    }
    current = parentId;
  }
  // chain didn't terminate within 16 hops — return whatever we last saw
  const final = index.get(current);
  return final === undefined ? null : final.readRuleClass;
}

/**
 * Classify every non-trashed card in the corpus as public or private
 * based on its effective read_rule_class. Reusable across the anonymizer
 * pipeline.
 *
 * @param {Database} db better-sqlite3 connection opened READ-ONLY by
 *                    openCorpusDb above.
 * @returns {Map<number, "public"|"private">} card id -> classification.
 *          Trashed cards are excluded (not part of either bucket).
 */
export function classify(db) {
  const allRows = loadCardRuleRows(db);
  const index = new Map();
  for (const row of allRows) {
    index.set(row.id, {
      readRuleId: row.readRuleId,
      readRuleClass: row.readRuleClass,
    });
  }
  const out = new Map();
  for (const row of allRows) {
    if (row.trash !== 0) continue; // exclude trashed cards from the bucket
    const effective = resolveReadRuleClass(row.id, index);
    out.set(
      row.id,
      OPEN_READ_RULE_CLASSES.has(effective) ? "public" : "private",
    );
  }
  return out;
}

/**
 * Convenience predicate exported for callers that want to ask the
 * question for a single card id without rebuilding the index.
 *
 * @param {Database} db better-sqlite3 connection (READ-ONLY)
 * @param {number} cardId
 * @returns {"public"|"private"|"unknown"}  "unknown" when the card is
 *          missing or trashed.
 */
export function classifyCard(db, cardId) {
  const row = db
    .prepare(
      "SELECT id, read_rule_id AS readRuleId, read_rule_class AS readRuleClass, trash " +
        "FROM cards WHERE id = ?",
    )
    .get(cardId);
  if (row === undefined) return "unknown";
  if (row.trash !== 0) return "unknown";
  const index = new Map([
    [row.id, { readRuleId: row.readRuleId, readRuleClass: row.readRuleClass }],
  ]);
  // Add the rule-parent row(s) if they exist:
  let pid = row.readRuleId;
  for (let d = 0; d < 16 && pid !== null && pid !== cardId; d++) {
    const parentRow = db
      .prepare(
        "SELECT id, read_rule_id AS readRuleId, read_rule_class AS readRuleClass, trash " +
          "FROM cards WHERE id = ?",
      )
      .get(pid);
    if (parentRow === undefined) break;
    index.set(parentRow.id, {
      readRuleId: parentRow.readRuleId,
      readRuleClass: parentRow.readRuleClass,
    });
    pid = parentRow.readRuleId;
  }
  const effective = resolveReadRuleClass(row.id, index);
  return OPEN_READ_RULE_CLASSES.has(effective) ? "public" : "private";
}

/** The exact set of read_rule_class values the classifier treats as
 *  "open" (public-readable). Exposed for callers that want to display
 *  the rule shape without re-reading the source. */
export const OPEN_RULE_CLASSES = OPEN_READ_RULE_CLASSES;
