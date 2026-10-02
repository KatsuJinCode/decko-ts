/**
 * U4 (second half) — why the oracle deck's inflection census cannot be run
 * against the decks on disk.
 *
 * src/card/name/oracle-deck-inflections.ts:27-31 states the provenance of
 * the production inflection table and names its own verification:
 *
 *   "a census of all 9,466 simple-key rows in the dual-lane capture db
 *    (tmp/raw-ground-truth/capture-db-corpus-v2.sqlite3) against the engine's
 *    gem-faithful default algorithm diverges on exactly 105 rows … re-running
 *    the census with this config applied must report ZERO divergent keys
 *    (see inflect-census-key-divergence.test.ts)"
 *
 * Two things were checked while closing U4 (2026-09-30, mm-S-Z):
 *
 *   1. `inflect-census-key-divergence.test.ts` is NOT in the tree. Only its
 *      config file is (tests/viewkeys-lane-sweep/oracle-deck-inflection-
 *      config.ts, whose header is the source of the claim above).
 *   2. A census cannot be reconstructed from the decks that ARE on disk.
 *      This suite is the measurement: in BOTH the raw ground-truth deck
 *      (pass17-int/tmp/raw-ground-truth/bench-corpus-raw.sqlite3) and the
 *      sanitized corpus deck (benchmarks/corpus-v2/bench-corpus-v2.sqlite3)
 *      the cards.key column stores the card NAME, not Ruby's `card.key`
 *      (the URL-safe underscored stem) — 9,443 of 9,443 simple-key rows have
 *      key === name, and all 23 compound rows agree too. Comparing
 *      `DeckoName.parse(name).key` against that column therefore compares the
 *      engine's computed key to the name, and reports ~5,241 "divergences"
 *      that say nothing about inflection agreement. (The claim's own row
 *      count, 9,466, is not 9,443 either, so its db is not one of these two.)
 *
 * So the U4 inflection half stays OPEN, with the reason named: closing it
 * needs a Ruby-side recomputation (`Card.find(name).key` per row, i.e. the
 * oracle app with the full-schema deck — neither is on this machine; the
 * capture decks carry cards + card_references + meta only) or the original
 * capture db with computed keys.
 *
 * The pins below keep the fact from being re-litigated: if a future deck
 * starts storing real keys, these assertions flip and the census becomes
 * runnable.
 *
 * ORACLE_RAW_DECK overrides the raw deck path; the suite SKIPS when neither
 * deck is present rather than failing.
 */

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";

const DECKS: Array<{ label: string; path: string }> = [
  {
    label: "raw ground-truth deck",
    path:
      process.env["ORACLE_RAW_DECK"] ??
      "C:/localProjects/decko-ts-lane-m4verify/tmp/raw-ground-truth/bench-corpus-raw.sqlite3",
  },
  {
    label: "sanitized corpus deck",
    path: "C:/localProjects/decko-ts/benchmarks/corpus-v2/bench-corpus-v2.sqlite3",
  },
];

const present = DECKS.filter((d) => existsSync(d.path));

describe.skipIf(present.length === 0)(
  "U4b — the decks' key column cannot support the inflection census",
  () => {
    for (const deck of present) {
      it(`${deck.label}: every simple-key row stores key === name`, () => {
        const db = new Database(deck.path, { readonly: true });
        const simple = db
          .prepare(
            `SELECT COUNT(*) total,
                    SUM(CASE WHEN key = name THEN 1 ELSE 0 END) same
             FROM cards
             WHERE key IS NOT NULL AND key <> '' AND key NOT LIKE '%+%' AND trash = 0`,
          )
          .get() as { total: number; same: number };
        const compound = db
          .prepare(
            `SELECT COUNT(*) total,
                    SUM(CASE WHEN key = name THEN 1 ELSE 0 END) same
             FROM cards
             WHERE key LIKE '%+%' AND trash = 0`,
          )
          .get() as { total: number; same: number };
        db.close();
        // The count the claim's own header quotes is 9,466; both decks hold
        // 9,443 simple-key rows, so its db is neither of these.
        expect(simple.total).toBe(9443);
        expect(simple.same).toBe(simple.total);
        expect(compound.same).toBe(compound.total);
      });
    }
  },
);
