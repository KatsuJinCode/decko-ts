// prefetch-empty-side-compound-fold.test.ts -- the cold prefetch closure
// must retire compound names whose side key is EMPTY instead of re-chasing
// them for the whole round budget, and must never pad its key IN-lists with
// an empty member.
//
// THE MECHANISM:
//
// 1. DeckoName.parse of a leading-plus name yields left.key === "" — the
//    name algebra's empty side before the plus.
// 2. `cards` carries NO row with key = '' (the `key IS NULL` rows are the
//    side-less junctions, which an
//    `IN (...)` list never matches anyway). So an empty key is a PROVABLE
//    NON-MATCH through every statement the closure builds.
// 3. driveClosure's round builder therefore spends its statement slots on
//    names that cannot resolve: `sideKeyPairs.push({left:"", right:X})` and
//    `simpleKeys.push("")` (src/card/render/prefetch.ts:846-852).
// 4. The cost was not the padding but the NON-TERMINATION. driveClosure
//    re-adds every unresolved name to `pending` on each round (the collect
//    over the rows just fetched, prefetch.ts:749), and its drain removes a
//    name only once its key reached `known` (prefetch.ts:975-981). seedKeys
//    never admits an empty key (prefetch.ts:735-741), so an empty-sided
//    name can NEVER leave `pending` -- the loop re-issued byte-identical
//    statements until MAX_CLOSURE_ROUNDS (prefetch.ts:825) ran out.
//
// THE PIN: the deck below is the minimal reproduction of that shape -- two
// unresolvable cross pairs whose junctions DO exist (so the cross-product
// keeps returning rows and the loop keeps living) plus one empty-sided
// name. Base behaviour: 38 round trips / 80 statements, with 25 of the
// prefetch's rounds spent re-issuing the same statements. Folded
// behaviour: the same HTML, a fraction of the statements.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import {
  seedCard,
  seedStockReadSubstrate,
  splitSqlStatements,
  type RenderTestStorage,
} from "./render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Recorded {
  sql: string;
  params: unknown[];
}

/** The deck. `Cross A+Target X` and `Cross B+Target Y` are NAMED by the
 *  page but their junction rows do NOT exist; `Cross A+Target Y` and
 *  `Cross B+Target X` exist but are never named. The round's side-key
 *  statement is an independent CROSS PRODUCT over its two IN-lists, so it
 *  returns those two unnamed junctions -- which is what keeps the round
 *  productive, and what lets an empty-sided name pin the loop open for the
 *  whole round budget. */
async function seedCrossProductDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 101, name: "Cross A", typeId: 1 });
  await seedCard(storage, { id: 102, name: "Cross B", typeId: 1 });
  await seedCard(storage, { id: 198, name: "Target X", typeId: 1 });
  await seedCard(storage, { id: 199, name: "Target Y", typeId: 1 });
  await seedCard(storage, { id: 201, name: "Cross A+Target Y", leftId: 101, rightId: 199, typeId: 1 });
  await seedCard(storage, { id: 202, name: "Cross B+Target X", leftId: 102, rightId: 198, typeId: 1 });
  await seedCard(storage, {
    id: 1,
    name: "Empty Side Page",
    typeId: 1,
    dbContent: ["{{Cross A+Target X}}", "{{Cross B+Target Y}}", "{{+Ghost Nest 3}}"].join("\n"),
  });
}

/** In-memory deck + engine over a driver that records every statement WITH
 *  its params -- the empty-member assertion needs the binds, which
 *  CountingRenderDriver (sql only) does not keep. */
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
  const storage: RenderTestStorage = {
    engine: new RenderEngine(fetcher),
    fetcher,
    counting: counting as unknown as RenderTestStorage["counting"],
    close: () => driver.close(),
  };
  // The stock read substrate: this deck is built here rather than by the
  // factory, and without the catch-all read rule every card of it denies.
  await seedStockReadSubstrate(storage);
  return {
    storage,
    recorded,
    counts: () => ({ statements, roundTrips }),
  };
}

describe("prefetch closure: empty-sided compound names fold", () => {
  it(
    "retires empty-sided compound names instead of re-chasing them for the round budget",
    { timeout: 300_000 },
    async () => {
      const { storage, recorded, counts } = await bootRecordingStorage();
      try {
        await seedCrossProductDeck(storage);
        const html = await storage.engine.render("Empty Side Page", "content");

        // THE BYTE CONTRACT: the fold must change NO byte. The expected
        // string is the BASE tree's render of this deck, captured before the
        // fold landed (the deck's nests are unknown-card substitutions at
        // render time, so the page body is the empty slot wrapper — which is
        // exactly the point: the closure chased names the render already
        // renders as unknown). Only the engine's own per-render SecureRandom
        // slot id varies between renders, so it is normalized here and only
        // here.
        const normalized = html.replace(/data-slot-id=(["'])[0-9a-f]{20}\1/g, 'data-slot-id="SLOTID"');
        expect(normalized).toBe(
          '<div id="empty_side_page-content-view" class="card-slot content-view ALL TYPE-empty_side_page ' +
            'SELF-empty_side_page d0-card-content" data-card-id="1" data-card-name="Empty Side Page" ' +
            'data-card-type-id="1" data-card-type-name="Empty Side Page" data-card-link-name="Empty_Side_Page" ' +
            'data-slot-id="SLOTID" data-slot="{&quot;view&quot;:&quot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}">\n\n</div>',
        );

        const after = counts();

        // INVARIANT 1 (the fold's own contract): no key IN-list the closure
        // builds carries an empty member. Provably row-set identical -- an
        // empty key matches no card -- so this is a free removal.
        const emptyMemberLists = recorded.filter(
          (r) => r.params.includes("") && /COLLATE NOCASE IN/.test(r.sql),
        );
        expect(emptyMemberLists).toEqual([]);

        // INVARIANT 2 (the round budget): the base engine spends all 25
        // MAX_CLOSURE_ROUNDS re-issuing identical statements. With the fold
        // the closure reaches its fixpoint in a handful of rounds.
        const prefetch = storage.engine.lastRenderStats;
        expect(prefetch).toBeDefined();
        expect(prefetch?.fallbackRounds ?? 0).toBeLessThanOrEqual(6);

        // INVARIANT 3 (the statement budget, measured not guessed): base
        // measures 38 round trips / 80 statements on this deck. The budget
        // is the measured cost on a deck carrying the stock `*all+*read`
        // rule card (createRenderTestStorage seeds it; Ruby denies a deck
        // without one), whose read permission rides the prelude batch:
        // 25 round trips here, closure rounds included.
        expect(after.roundTrips).toBeLessThanOrEqual(25);
        expect(after.statements).toBeLessThanOrEqual(46);
      } finally {
        storage.close();
      }
    },
  );
});