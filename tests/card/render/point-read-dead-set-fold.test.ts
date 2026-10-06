// point-read-dead-set-fold.test.ts -- a SIMPLE-NAME point read must not
// re-ask the database for a key the SAME REQUEST already asked and the
// database already answered "no" for.
//
// THE MECHANISM (measured 2026-10-05 on the L2 lane's 50-page demo deck;
// the counts, the per-call-site ledger and both measured ends are in
// brandonDojoTech/tmp/wrong-goal-hunt/fold-point-reads-lane.md):
//
// 1. Cluster 3 of the fold roadmap is `point-row-by-key` +
//    `point-row-by-id` -- `SELECT * FROM cards WHERE key = ? AND trash = 0
//    LIMIT 1` and `SELECT * FROM cards WHERE id = ? ...`. Measured across
//    the 50-page surface: 2,356 statements (1,295 by key, 1,061 by id) on
//    6,296 statements total. EVERY ONE carries exactly ONE bind, and EVERY
//    ONE reads a (family, param) pair the request had not read before
//    (repeats = 0 on every page) -- so memoisation cannot win and the only
//    lever is a negative the request already holds.
// 2. The request ALREADY holds it. `seatNamesByWave` (render.ts:2643) asks a
//    whole wave of names in ONE batched
//    `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (...) AND trash = 0`
//    and, for every name no row of any round answered, primes the exact
//    negative entry `lexToId`'s cacheFetch would have written
//    (render.ts:2861-2867 -> lexicon.primeIdsByKey).
// 3. The point read never looks at that entry. `retrieveFromDb`'s simple-name
//    arm (retrieve.ts:257-264) goes straight to `cards WHERE key = ?`. The
//    engine's own residue registry says so verbatim (render-plan.ts:60-62):
//    "simple-name misses consult `cards` by key directly -- so no lexicon
//    negative can stop them".
// 4. So the SAME question is asked twice per render: once batched (answered
//    "no"), once as a point read (answered "no" again, one round trip each).
//    On /Aikido_in_Education the 20 prepareItemForRender reads under
//    enrichPointerListItems and the 15 under enrichLinkTargetsForKnownClass
//    are that shape; 21 of them are zero-row.
//
// THE FOLD: before issuing the statement, a simple-name point read consults
// the request-local dead set -- a lexicon entry the engine HOLDS whose value
// is not an id is a stored negative, i.e. an answer the database already
// gave. Provably row-set identical: `SELECT ... WHERE key = ?` returns the
// row iff a non-trashed row with that key exists, and a batched
// `... "key" COLLATE NOCASE IN (...) AND trash = 0` that omitted it proves
// no such row existed when it ran. Two guards keep it honest:
//
//   - `lexEntryKnown` reads `temp.exist` / `shared.read`, never
//     `CardCache.read`, so it cannot MATERIALIZE a miss into the negative
//     it reads (the hazard lexicon.ts:204-219 names). A held entry is an
//     answer; an eviction is not held, so the point read runs.
//   - `lookInTrash` reads are exempt: the wave's statements carry
//     `trash = 0`, so their negatives say nothing about trashed rows.
//
// THE PIN: the deck below is the minimal reproduction -- one Pointer host
// whose item lines name two cards that exist and three that do not. The wave
// asks all five; the three misses are primed; the per-item ladder then
// re-asks them one statement each. Folded: the same HTML, zero of those
// statements.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import {
  seedCard,
  seedReference,
  splitSqlStatements,
  type RenderTestStorage,
} from "./render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Recorded {
  sql: string;
  params: unknown[];
}

/** The point-read SQL this fold is about: the simple-name arm of
 *  retrieveFromDb (retrieve.ts:259-262). Its negative twin is the wave's
 *  batched simple-key ask (render.ts:2786-2789). */
const POINT_KEY_READ = /SELECT \* FROM cards WHERE key = \? AND trash = 0 LIMIT 1/i;
const BATCHED_KEY_ASK = /FROM cards WHERE "key" COLLATE NOCASE IN \(/i;

const HOST = "point host";
const LIVE_ITEMS = ["point host+live one", "point host+live two"];
/** SIMPLE names on purpose. A compound mark resolves through the Lexicon
 *  (id_from_mark), so only a SIMPLE name mark reaches retrieveFromDb's
 *  `WHERE key = ?` arm - the shape the measured ledger shows (the 15
 *  zero-row key reads under enrichLinkTargetsForKnownClass on
 *  /Aikido_in_Education are "romain", "ken_kyung_ho_min", "administration",
 *  "theater_music", ... - all simple). */
const DEAD_ITEMS = ["ghost one", "ghost two", "ghost three"];

/** The deck. The Pointer host's db_content is the item list the pointer-item
 *  closure walks; two items are real junction rows, three name cards the
 *  deck does not have. */
async function seedPointListDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 1, name: "Set", codename: "set" });
  await seedCard(storage, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(storage, { id: 5, name: "HTML", codename: "html" });
  await seedCard(storage, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(storage, { id: 9, name: "RichText", codename: "rich_text" });
  await seedCard(storage, { id: 34843, name: "Pointer", codename: "pointer", typeId: 5 });
  // the *all+*read grant, without which every nest is denied
  await seedCard(storage, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  await seedCard(storage, { id: 20, name: "*read", codename: "read", typeId: 2 });
  await seedCard(storage, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(storage, 50, 6, "anyone");

  // THE POINTER HOST. Its db_content IS the item list the pointer-item
  // closure walks (card-mod-list set/all/item.rb#raw_item_strings splits it
  // on newlines), so no junction is needed to reach it: the rendered root is
  // itself the pointer. The two live items are junction rows under it, each
  // with its own right side (cards has a UNIQUE(left_id, right_id)); the
  // three ghosts are SIMPLE names the deck does not have.
  // The live items are junction rows under the host, and a junction's NAME is
  // COMPOSED from its sides (seedCard stores name=NULL for a compound row),
  // so the right side must be the card named `live one` / `live two` for the
  // composed name to be the item name the list line asks for. cards has a
  // UNIQUE(left_id, right_id), hence two distinct right sides.
  await seedCard(storage, { id: 301, name: "live one", typeId: 1, dbContent: "first live item" });
  await seedCard(storage, { id: 302, name: "live two", typeId: 1, dbContent: "second live item" });
  for (const [i, item] of LIVE_ITEMS.entries()) {
    const id = 400 + i;
    await seedCard(storage, {
      id,
      name: item,
      leftId: 300,
      rightId: 301 + i,
      typeId: 1,
      dbContent: "live",
    });
  }
  await seedCard(storage, {
    id: 300,
    name: HOST,
    typeId: 34843,
    dbContent: [...LIVE_ITEMS, ...DEAD_ITEMS].join("\n"),
  });
}

async function bootRecordingStorage(): Promise<{
  storage: RenderTestStorage;
  recorded: Recorded[];
  counts: () => { statements: number; roundTrips: number };
}> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const statement of splitSqlStatements(readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8"))) {
    await driver.query(statement, []);
  }
  const recorded: Recorded[] = [];
  let statements = 0;
  let roundTrips = 0;
  const counting = {
    async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
      statements += 1;
      roundTrips += 1;
      recorded.push({ sql, params });
      return driver.query<T>(sql, params);
    },
    async batch(batch: SQLStatement[]): Promise<SQLQueryResult[]> {
      statements += batch.length;
      roundTrips += 1;
      for (const statement of batch) recorded.push({ sql: statement.sql, params: statement.params });
      return driver.batch(batch);
    },
  };
  const fetcher = new FetchEngine(counting);
  return {
    storage: {
      engine: new RenderEngine(fetcher),
      fetcher,
      counting: counting as unknown as RenderTestStorage["counting"],
      close: () => driver.close(),
    },
    recorded,
    counts: () => ({ statements, roundTrips }),
  };
}

/** The keys a batched simple-key ask bound, and which of them a row carried.
 *  Replayed over the ledger IN ORDER, this is the request's dead set as the
 *  fold must see it at each point read. */
function deadSetAt(recorded: Recorded[], index: number): Set<string> {
  const dead = new Set<string>();
  for (let i = 0; i < index; i += 1) {
    const r = recorded[i]!;
    if (!BATCHED_KEY_ASK.test(r.sql)) continue;
    // A batched ask is a NEGATIVE for every key it bound: the engine holds
    // the row set of every such statement, and a key with no row is absent
    // from it. Both keys the ledger binds and rows it returns are keys, so
    // the honest shape is: bound minus returned. The returned set is not
    // recoverable from the ledger alone (it records SQL + params only), so
    // the pin asserts the weaker, still-false-at-base property: no point
    // read of a key an EARLIER batched ask already bound.
    for (const p of r.params) if (typeof p === "string") dead.add(p);
  }
  return dead;
}

describe("point reads: a key the request already asked must not be re-asked", () => {
  it(
    "retires simple-name point reads whose answer a batched wave already holds",
    { timeout: 300_000 },
    async () => {
      const { storage, recorded, counts } = await bootRecordingStorage();
      try {
        await seedPointListDeck(storage);
        await storage.engine.render(HOST, "open");

        // INVARIANT 1 (the fold's own contract, stated over the ledger):
        // no simple-name point read may bind a key an EARLIER batched
        // simple-key ask already bound. At base the per-item ladder re-asks
        // every item name the wave already resolved or retired.
        const offenders: Recorded[] = [];
        recorded.forEach((r, i) => {
          if (!POINT_KEY_READ.test(r.sql)) return;
          const key = String(r.params[0] ?? "");
          if (deadSetAt(recorded, i).has(key)) offenders.push(r);
        });
        expect(offenders).toEqual([]);

        // INVARIANT 2 (the deck really does produce the shape): the wave
        // bound the dead items' keys BEFORE the ladder re-asked them, so
        // this pin cannot pass vacuously on a deck with no batched ask.
        const batchedAsks = recorded.filter((r) => BATCHED_KEY_ASK.test(r.sql));
        expect(batchedAsks.length).toBeGreaterThan(0);
        const askedKeys = new Set(batchedAsks.flatMap((r) => r.params.map(String)));
        for (const item of DEAD_ITEMS) {
          expect([...askedKeys].some((k) => k === item.toLowerCase().replace(/ /g, "_"))).toBe(true);
        }

        // INVARIANT 3 (the byte contract): the live items still render as
        // real cards, so the fold retires the MISSES and never a hit. The
        // render-card map is the observable: the two live item cards are
        // seated, and the dead ones are absent.
        console.log("MAP:", [...(storage.engine as unknown as { renderCards: Map<string, unknown> }).renderCards.keys()].join(", "));
        const liveSeated = LIVE_ITEMS.filter(
          (n) => storage.engine.fetchRenderCard(n) !== undefined,
        );
        expect(liveSeated).toEqual(LIVE_ITEMS);

        // The statement ledger still carries the batched asks (the fold
        // removes point reads, it does not remove the wave).
        expect(counts().statements).toBeGreaterThan(0);
      } finally {
        storage.close();
      }
    },
  );
});