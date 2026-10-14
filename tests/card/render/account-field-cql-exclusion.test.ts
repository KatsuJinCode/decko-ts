// THE CQL ACCOUNT-FIELD EXPOSURE, ON A RULE-LESS DECK. RenderEngine.
// cqlPermissionOptions used to answer `alwaysOk: true` — filter off — on a
// deck carrying no catch-all read rule, and narrowed that with a hardcoded
// list of account-field right parts so that /api/query would not hand a
// stranger somebody's credentials. Both halves existed only because the read
// path failed open on the same deck; the read path now denies like Ruby, so
// the whole list is gone and the answer is always the viewer's rule set.
//
// This file proves the outcome that list used to be reaching for, on the deck
// shape it existed for: a deck with the account substrate and NO read rules,
// queried for an account field. Ruby's `Where#permission_conditions` reads the
// same `read_rules_hash` the HTML views do, so that hash is empty and the
// filter matches no row — card-mod-permissions set/all/permissions.rb:139-146
// (`read_rules_hash[read_rule_id]` with a nil id denies) is the same answer
// card by card. So the query returns NOTHING, which subsumes every account
// field without naming one of them.
//
// WHY A UNIT TEST AND NOT THE END-TO-ONE: the end-to-end exposure suite
// (tests/deploy/demo-account-anonymous-exposure.test.ts) builds the REAL
// deploy chain, which ends at 0009 and therefore HAS the catch-all — so it
// takes the ordinary filtered branch and never reaches this deck shape.
//
// WHAT IS PROVEN HERE:
//   * cqlPermissionOptions answers the ordinary filtered shape on a rule-less
//     deck — alwaysOk false, empty readRuleIds — not a bypass;
//   * executeQuery with that answer returns no rows, for every account-field
//     codename including `api_key` (card-mod-api_key's account field,
//     set/right/api_key.rb:1, `include_set Abstract::AccountField`, whose
//     content authenticates as the account), and for a right that is not an
//     account field either, because the filter denies the whole query rather
//     than picking sides;
//   * the SAME query on a deck carrying the `*all+*read` rule Decko's setup
//     bootstraps serves through that rule, so the empty answer above is the
//     rule-less deck's and not a refusal of CQL;
//   * a deck with no account substrate answers without failing.

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { executeQuery } from "../../../src/cql/execute.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { scratchDir, cleanupScratch } from "../../support/scratch-dir.mjs";
import {
  CountingRenderDriver,
  seedCard,
  seedReference,
  splitSqlStatements,
  type RenderTestStorage,
} from "./render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** The right codenames the account substrate hangs its secrets on, and the
 *  gem each one comes from. `api_key` is card-mod-api_key rather than
 *  card-mod-account, and it is the one that matters most: it is
 *  `include_set Abstract::AccountField`, hangs off the same `*account`
 *  junction, and its content is a bearer credential. */
const ACCOUNT_FIELD_CODENAMES = [
  { codename: "account", gem: "card-mod-account" },
  { codename: "email", gem: "card-mod-account" },
  { codename: "password", gem: "card-mod-account" },
  { codename: "salt", gem: "card-mod-account" },
  { codename: "status", gem: "card-mod-account" },
  { codename: "api_key", gem: "card-mod-api_key" },
] as const;

/** A right that is NOT an account field, so the test can tell "denies the
 *  credential rows" from "denies every right" — on the rule-less deck it
 *  denies that too, and the catch-all deck is what separates them. It is
 *  card-mod-assets' output right, which no account row hangs off. */
const ORDINARY_CODENAME = "asset_output";

/** The Set TYPE card's id — card 2 below. The read-rule cache join filters on
 *  `sets.type_id = SetID` (read-rules.ts statement 2), so the *all card that
 *  anchors the catch-all must be typed with it. */
const SET_TYPE_ID = 2;
/** The *all+*read rule card's id. Above the codename range the loop below
 *  allocates from, so the two never collide. */
const READ_RULE_ID = 900;

interface RuleLessDeck {
  driver: LocalSqliteDriver;
  /** The JUNCTION ids a `right:` query returns (the rows carrying the secret). */
  rightIds: Map<string, number>;
  /** The codename card ids — what a CQL `right:` term resolves to. */
  rightCardIds: Map<string, number>;
}

/** A deck on the REAL schema with the account substrate's right cards and, by
 *  default, NO read rules: the shape the old allowance existed for.
 *  `withAccountSubstrate: false` leaves the right cards out entirely, which
 *  is the 0001..0003 deck. `withCatchAll` adds the `*all+*read` rule stock
 *  Decko seeds (card/auth/setup.rb:44), the contrast case. */
async function buildDeck(
  prefix: string,
  opts: { withAccountSubstrate: boolean; withCatchAll: boolean },
): Promise<RuleLessDeck> {
  const driver = new LocalSqliteDriver({ path: `${scratchDir(prefix)}/deck.sqlite` });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  // seedCard writes through storage.counting (the shared render-test seam),
  // so this deck is seeded through the same two calls every other render test
  // uses rather than a hand-written INSERT that could drift from the schema.
  const counting = new CountingRenderDriver(driver);
  const storage = { engine: undefined, fetcher: new FetchEngine(counting), counting, close: () => undefined } as unknown as RenderTestStorage;
  let nextId = 10;
  const codenames = [
    ...(opts.withAccountSubstrate ? ACCOUNT_FIELD_CODENAMES.map((f) => f.codename) : []),
    ORDINARY_CODENAME,
  ];
  // `rightIds` holds the JUNCTION ids — the rows a `right:` query actually
  // returns — because the account substrate's secrets live on
  // `<holder>+*account+*<field>` junctions, not on the right card itself. A
  // CQL `{"right":"*password"}` filters `right_id = <the *password card>`,
  // so it is the junction carrying that right that leaks the digest.
  const rightIds = new Map<string, number>();
  const rightCardIds = new Map<string, number>();
  // Ids 1..4 are the permission substrate both decks carry, mirroring
  // tests/card/permissions/read-permission.test.ts so the ids are readable
  // against that deck layout.
  await seedCard(storage, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: 2, name: "Set", codename: "set" });
  await seedCard(storage, { id: 3, name: "*read", codename: "read" });
  await seedCard(storage, { id: 4, name: "RichText", codename: "basic" });
  // The account holder every secret hangs off (card-mod-account data/real.yml
  // :82 `*account`).
  const holderId = nextId;
  await seedCard(storage, {
    id: holderId, name: "Victim", typeId: 4,
    ...(opts.withCatchAll ? { readRuleId: READ_RULE_ID } : {}),
  });
  nextId += 1;
  for (const codename of codenames) {
    const rightCardId = nextId++;
    await seedCard(storage, { id: rightCardId, name: `*${codename}`, codename });
    rightCardIds.set(codename, rightCardId);
    // The junction row: NULL name/key (the 2020 Lexicon migration), left is
    // the holder, right is the codename card, and the CONTENT is the secret
    // the old allowance used to serve. read_rule_id points at the
    // *all+*read rule when the deck has one, NULL otherwise — which is the
    // shape the rule-less allowance answered for.
    const junctionId = nextId++;
    await seedCard(storage, {
      id: junctionId,
      leftId: holderId,
      rightId: rightCardId,
      dbContent: `secret-${codename}`,
      ...(opts.withCatchAll ? { readRuleId: READ_RULE_ID } : {}),
    });
    rightIds.set(codename, junctionId);
  }
  if (opts.withCatchAll) {
    const anyoneId = nextId++;
    await seedCard(storage, { id: anyoneId, name: "Anyone", codename: "anyone" });
    await seedCard(storage, { id: nextId++, name: "Anonymous", codename: "anonymous" });
    // *all+*read -> [[Anyone]]: the junction carries sides only, its right
    // part is the *read setting, and its left part is the *all set card.
    await seedCard(storage, {
      id: READ_RULE_ID, leftId: 1, rightId: 3,
      dbContent: "[[Anyone]]", readRuleId: READ_RULE_ID, readRuleClass: "*all",
    });
    await seedReference(storage, READ_RULE_ID, anyoneId, "anyone");
  }
  return { driver, rightIds, rightCardIds };
}

/** The rows a /api/query for one right part returns, through the engine's own
 *  permission answer — the shape deploy/worker.ts's query route builds. The
 *  `parse.resolveCardId` is that route's name resolver: a CQL `right` term
 *  names the right card, and the interpreter turns it into the right_id the
 *  join filters on. */
async function rowsForRight(deck: RuleLessDeck, codename: string): Promise<unknown[]> {
  const engine = new RenderEngine(new FetchEngine(deck.driver));
  const permission = await engine.cqlPermissionOptions();
  const rightId = deck.rightCardIds.get(codename);
  const result = await executeQuery(
    deck.driver,
    { right: `*${codename}` },
    {
      ...permission,
      parse: { resolveCardId: (nameish: string) => (nameish === `*${codename}` ? rightId : undefined) },
    },
  );
  console.log("SQL", result.sql, JSON.stringify(result.params));
  if ("count" in result) throw new Error("unexpected count result");
  return result.rows;
}

describe("the CQL answer on a deck with no read rules", () => {
  it("is the ordinary filtered shape, not a bypass", async () => {
    const deck = await buildDeck("decko-cql-ruleless-shape-", {
      withAccountSubstrate: true,
      withCatchAll: false,
    });
    try {
      const permission = await new RenderEngine(new FetchEngine(deck.driver)).cqlPermissionOptions();
      expect(permission.alwaysOk).toBe(false);
      // read_rules_hash is empty on a deck with no read rule card, which is
      // the same empty answer ok_to_read? gets per card.
      expect(permission.readRuleIds).toEqual([]);
    } finally {
      deck.driver.close();
    }
  });

  it("serves no account field, api_key among them", async () => {
    const deck = await buildDeck("decko-cql-ruleless-fields-", {
      withAccountSubstrate: true,
      withCatchAll: false,
    });
    try {
      for (const field of ACCOUNT_FIELD_CODENAMES) {
        const rows = await rowsForRight(deck, field.codename);
        expect(
          rows,
          `*${field.codename} (${field.gem}) is an account field and must not be served`,
        ).toEqual([]);
      }
    } finally {
      deck.driver.close();
    }
  });

  it("denies the whole query rather than picking sides", async () => {
    // Not "excluded every account field and served the rest": a rule-less
    // deck has no readable rule, so an ordinary right is denied too. That is
    // the contrast the catch-all case below draws.
    const deck = await buildDeck("decko-cql-ruleless-scope-", {
      withAccountSubstrate: true,
      withCatchAll: false,
    });
    try {
      expect(await rowsForRight(deck, ORDINARY_CODENAME)).toEqual([]);
    } finally {
      deck.driver.close();
    }
  });

  it("serves through the rule set on a deck that carries the catch-all", async () => {
    // The empty answer above is the rule-less deck's, not a refusal of CQL:
    // add the rule Decko's setup bootstraps and the same query answers
    // through it. The row's stored read_rule_id is the catch-all's own id.
    const deck = await buildDeck("decko-cql-catchall-", {
      withAccountSubstrate: true,
      withCatchAll: true,
    });
    try {
      const rows = await rowsForRight(deck, ORDINARY_CODENAME);
      expect(rows.length).toBe(1);
      expect((rows[0] as { id: number }).id).toBe(deck.rightIds.get(ORDINARY_CODENAME));
    } finally {
      deck.driver.close();
    }
  });

  it("a deck with no account substrate answers without failing", async () => {
    const deck = await buildDeck("decko-cql-ruleless-empty-", {
      withAccountSubstrate: false,
      withCatchAll: false,
    });
    try {
      const permission = await new RenderEngine(new FetchEngine(deck.driver)).cqlPermissionOptions();
      expect(permission.alwaysOk).toBe(false);
      expect(await rowsForRight(deck, ORDINARY_CODENAME)).toEqual([]);
    } finally {
      deck.driver.close();
    }
  });

  afterEach(cleanupScratch);
});