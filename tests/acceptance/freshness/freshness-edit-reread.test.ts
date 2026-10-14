// The "No-cache and freshness rules" acceptance arm, as isolated engine
// tests: the commit-edit reread semantics.
//
// WHY THIS EXISTS. The deck engine boots once per isolate
// (deploy/bunny-worker-src/bunny-edge-engine-handler.ts getDeck's
// deckPromise memo), so every derived cache — including cached permission
// verdicts — lives across requests, and before the freshness gate nothing
// invalidated them: a warm runtime served pre-mutation bytes, including a
// post-revocation permission verdict.
//
// Contract text under test:
//   "On isolated fixtures, commit an edit, change a nested dependency, change
//    a rule, and revoke access. The next request on both an existing and a new
//    runtime must reflect the committed state. Include anonymous/user
//    separation, cross-region observations, concurrent writes, refresh
//    failure, and unavailable authority. No stale-success response or
//    post-revocation data leak is acceptable."
//
// This suite covers the four mutation kinds that sentence names -- content
// edit, nested-dependency edit, rule change, access revocation -- and
// measures both runtime lifecycles: an EXISTING (reused, warm) runtime and a
// NEW (cold) runtime over the same committed database file.
//
// WHAT IS UNDER TEST. The engine's render path is cache-backed by design.
// THE REPAIR UNDER TEST HERE is the committed-write version stamp:
// db/schema.sqlite.sql's [ENGINE-FRESHNESS] block adds deck_data_version
// (one row) with AFTER-INSERT/UPDATE/DELETE triggers on cards and
// card_references, so every committed write bumps it at the storage layer --
// the one place all writes cross, regardless of stream, process, or
// connection. The render entry (src/card/render.ts, the freshness gate at
// the top of render()) reads the stamp ONCE per request and fires
// resetCaches() when it moved. Every scenario below still writes the
// mutation DIRECTLY as a SQL row change on the authoritative store (the same
// write shape the other suites use: "seeded cards are written DIRECTLY as
// rows because the write path is another stream",
// tests/card/render/render-test-storage.ts:11) -- which is exactly why the
// bump must live in a trigger and not in an application write API: the
// scenarios never touch one.
//
// HOW A SCENARIO IS SCORED. A scenario is GREEN when the post-mutation render
// reflects the committed state. It is a GAP (RED) when the render serves
// pre-mutation bytes or pre-revocation access. The assertion failure message
// carries the actual vs expected bytes and the engine's own cache state, so a
// failure names the mechanism rather than just "not equal".
//
// ISOLATION. Each scenario gets its OWN database file in a fresh temp dir
// (mkdtempSync) and its OWN engine, so no scenario can be made to pass by
// another's cache state, and no test reaches shared or live state. The
// storage factory mirrors tests/card/render/render-test-storage.ts but takes a
// path instead of hardcoding ":memory:", because a file-backed store is what
// makes "a NEW runtime over the same committed data" expressible: a new
// LocalSqliteDriver + FetchEngine + RenderEngine triple is opened on the SAME
// file after the mutation was committed, which is the new-runtime arm.
//
// All fixture content is synthetic (DATA RULE, mirroring the other suites).

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLQueryResult } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine, DECK_DATA_VERSION_STATEMENT } from "../../../src/card/render.js";
import { DeckoName } from "../../../src/card/name.js";
import { quietDenial } from "../../../src/card/permissions/index.js";
import {
  splitSqlStatements,
  CountingRenderDriver,
} from "../../card/render/render-test-storage.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

// ids follow tests/card/permissions/read-permission.test.ts:5-27 so the
// permission math reads the same way here:
//   1 *all (Set)  2 Set (type)  3 *read  4 Basic  5 Anyone  6 Anonymous
//   7 Role A  8 *all+*read [[Anyone]]  9 Basic+*type  10 Basic+*type+*read [[Role A]]
const SET_TYPE_ID = 2;
const BASIC_TYPE_ID = 4;

const DDL = readFileSync(
  fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
  "utf8",
);

/** A file-backed runtime: driver + fetcher + render engine over one SQLite
 *  file. The render-test-storage suite hardcodes ":memory:", which cannot
 *  express the contract's "a NEW runtime over the same committed state" arm
 *  -- a new engine instance needs the mutations to still be on disk. */
interface FileRuntime {
  dir: string;
  dbPath: string;
  driver: LocalSqliteDriver;
  engine: RenderEngine;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<SQLQueryResult<T>>;
  close(): void;
}

let runtimeSeq = 0;

/** Open a runtime on a FRESH temp database, schema applied. */
function openRuntime(): FileRuntime {
  runtimeSeq += 1;
  const dir = scratchDir(`decko-freshness-${runtimeSeq}-`);
  const dbPath = join(dir, "deck.sqlite");
  const driver = new LocalSqliteDriver({ path: dbPath });
  const engine = new RenderEngine(new FetchEngine(driver));
  const rt: FileRuntime = {
    dir,
    dbPath,
    driver,
    engine,
    query: (sql, params = []) => driver.query(sql, params),
    close: () => driver.close(),
  };
  return rt;
}

/** Apply the schema. Mirrors createRenderTestStorage's DDL loop
 *  (tests/card/render/render-test-storage.ts). */
async function applySchema(rt: FileRuntime): Promise<void> {
  for (const statement of splitSqlStatements(DDL)) {
    await rt.query(statement, []);
  }
}

/** Insert one card row. Mirrors seedCard's column list
 *  (tests/card/render/render-test-storage.ts) minus the fields these
 *  scenarios do not exercise; the columns the render and permission paths
 *  actually read (name/key/type_id/db_content/read_rule_id/read_rule_class)
 *  are all here. current_revision_id stays NULL (nullable; no history view
 *  runs in these scenarios). */
async function insertCard(
  rt: FileRuntime,
  opts: {
    id: number;
    name?: string;
    codename?: string | null;
    leftId?: number;
    rightId?: number;
    typeId?: number;
    dbContent?: string | null;
    readRuleId?: number | null;
    readRuleClass?: string | null;
  },
): Promise<void> {
  const hasName = typeof opts.name === "string" && opts.name.length > 0;
  // Compound-name ("A+B") cards carry a NULL name column, per seedCard.
  const isCompound = hasName && opts.name!.includes("+");
  await rt.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, created_at, updated_at,
        creator_id, updater_id, read_rule_class, read_rule_id,
        references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.id,
      isCompound ? null : (opts.name ?? null),
      // The key column is the DeckoName canonical key, NOT the raw name: the
      // fetch layer looks a card up by DeckoName.parse(name).key, which
      // snake_cases multiword names ("Editable Card" -> "editable_card").
      // seedCard derives it the same way.
      hasName ? DeckoName.parse(opts.name as string).key : null,
      opts.codename ?? null,
      opts.leftId ?? null,
      opts.rightId ?? null,
      "2026-09-19 00:00:00.000",
      "2026-09-19 00:00:00.000",
      1,
      1,
      opts.readRuleClass ?? null,
      opts.readRuleId ?? null,
      null,
      0,
      opts.typeId ?? SET_TYPE_ID,
      opts.dbContent ?? null,
    ],
  );
}

/** Insert one card_references row -- the reference graph the read-rule cache
 *  reads (mirrors seedReference, tests/card/render/render-test-storage.ts). */
async function insertReference(
  rt: FileRuntime,
  refererId: number,
  refereeId: number,
  refereeKey: string,
): Promise<void> {
  await rt.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, 'L', NULL)`,
    [refererId, refereeKey, refereeId],
  );
}

/** The shared rule skeleton: the catch-all set, the *read setting, the
 *  always-party, the anonymous card, and the rule chains. `anyoneRuleParties`
 *  is what scenario 4 edits to revoke anonymous access. */
async function seedRuleSkeleton(
  rt: FileRuntime,
  opts: { everyoneRule: string; memberRule: string },
): Promise<void> {
  await insertCard(rt, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await insertCard(rt, { id: 2, name: "Set", codename: "set" });
  await insertCard(rt, { id: 3, name: "*read", codename: "read" });
  await insertCard(rt, { id: 4, name: "Basic" });
  await insertCard(rt, { id: 5, name: "Anyone", codename: "anyone" });
  await insertCard(rt, { id: 6, name: "Anonymous", codename: "anonymous" });
  await insertCard(rt, { id: 7, name: "Role A" });
  await insertCard(rt, { id: 15, name: "*type", codename: "type" });
  await insertCard(rt, { id: 16, name: "*self", codename: "self" });
  // *all+*read -> the "everyone" party list. Anonymous reads through this one.
  await insertCard(rt, { id: 8, leftId: 1, rightId: 3, dbContent: opts.everyoneRule });
  await insertReference(rt, 8, 5, "anyone");
  // Basic+*type+*read -> members only; the Basic+*type set is a junction row.
  await insertCard(rt, { id: 9, leftId: 4, rightId: 15, typeId: SET_TYPE_ID });
  await insertCard(rt, { id: 10, leftId: 9, rightId: 3, dbContent: opts.memberRule });
  await insertReference(rt, 10, 7, "role_a");
}

/** Close a runtime and, when it owns one, remove its temp directory. A
 *  runtime opened with openNewRuntimeOn borrows someone else's file and is
 *  given an empty dir, so cleanup leaves that shared database alone. */
function discardRuntime(rt: FileRuntime): void {
  try {
    rt.close();
  } catch {
    // A runtime whose DB handle already failed to open is still worth cleaning.
  }
  if (rt.dir !== "") rmSync(rt.dir, { recursive: true, force: true });
}

/** Open a SECOND runtime triple on an existing runtime's database file --
 *  the contract's "a new runtime" arm. Deliberately a
 *  fresh driver, fetcher and engine with no cache state carried over. */
function openNewRuntimeOn(dbPath: string): FileRuntime {
  const driver = new LocalSqliteDriver({ path: dbPath });
  return {
    // No temp dir of its own: it borrows the committed file, so its cleanup
    // must not delete a database another runtime still holds open.
    dir: "",
    dbPath,
    driver,
    engine: new RenderEngine(new FetchEngine(driver)),
    query: (sql, params = []) => driver.query(sql, params),
    close: () => driver.close(),
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 -- commit an edit to a card's content.
// ---------------------------------------------------------------------------

describe("B freshness 1: a committed content edit is reflected by the next render", () => {
  const OLD_BODY = "ORIGINAL BODY TEXT";
  const NEW_BODY = "EDITED BODY TEXT";

  let warm: FileRuntime | undefined;
  let cold: FileRuntime | undefined;

  beforeAll(async () => {
    warm = openRuntime();
    await applySchema(warm);
    // The rule skeleton is seeded so the card is READABLE to begin with:
    // without a read rule granting the anonymous path the engine would deny
    // every render and the edit could never be observed.
    await seedRuleSkeleton(warm, { everyoneRule: "[[Anyone]]", memberRule: "[[Role A]]" });
    await insertCard(warm, {
      id: 20, name: "Editable Card", typeId: BASIC_TYPE_ID, dbContent: OLD_BODY,
      readRuleId: 8, readRuleClass: "*all",
    });
    // Render once so the engine holds warm cache entries for this card, then
    // commit the edit straight to the authoritative row. Nothing tells the
    // engine the deck changed -- that is the point of the measurement.
    expect(await warm.engine.render("Editable Card", "content")).toContain(OLD_BODY);
    await warm.query("UPDATE cards SET db_content = ? WHERE id = 20", [NEW_BODY]);
  });

  afterAll(() => {
    // The cold runtime BORROWS the warm runtime's database file: its handle
    // must close before the warm dir is removed, or the rm fails EPERM on
    // Windows (open-file lock).
    if (cold) discardRuntime(cold);
    if (warm) discardRuntime(warm);
  });

  it("EXISTING runtime: the next render reads the committed edit, not the cached one", async () => {
    const html = await warm!.engine.render("Editable Card", "content");
    expect(
      html,
      "the next render on an existing runtime served pre-edit bytes: the warm " +
        "render path answered from its cache without re-reading the committed row",
    ).toContain(NEW_BODY);
    expect(html).not.toContain(OLD_BODY);
  });

  it("NEW runtime over the same committed database reflects the edit", async () => {
    cold = openNewRuntimeOn(warm!.dbPath);
    // A brand-new runtime triple over the SAME file: no cache state carried
    // over, so a failure here means the edit was never actually committed.
    const html = await cold.engine.render("Editable Card", "content");
    expect(html).toContain(NEW_BODY);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 -- change a nested dependency; the INCLUDING page must follow.
// ---------------------------------------------------------------------------

describe("B freshness 2: an edit to a nested included card reaches the including page", () => {
  const OLD_INNER = "INNER ORIGINAL";
  const NEW_INNER = "INNER EDITED";

  let warm: FileRuntime | undefined;

  beforeAll(async () => {
    warm = openRuntime();
    await applySchema(warm);
    // Seeded so both cards are readable to the anonymous viewer; without a
    // granting read rule the renders would deny and nothing could be observed.
    await seedRuleSkeleton(warm, { everyoneRule: "[[Anyone]]", memberRule: "[[Role A]]" });
    await insertCard(warm, {
      id: 30, name: "Including Page", typeId: BASIC_TYPE_ID,
      dbContent: `before {{Included Card}} after`,
      readRuleId: 8, readRuleClass: "*all",
    });
    await insertCard(warm, {
      id: 31, name: "Included Card", typeId: BASIC_TYPE_ID, dbContent: OLD_INNER,
      readRuleId: 8, readRuleClass: "*all",
    });
    // Warm the whole inclusion closure, then edit only the INNER card.
    expect(await warm.engine.render("Including Page", "content")).toContain(OLD_INNER);
    await warm.query("UPDATE cards SET db_content = ? WHERE id = 31", [NEW_INNER]);
  });

  afterAll(() => {
    if (warm) discardRuntime(warm);
  });

  it("the including page's next render reflects the nested card's committed edit", async () => {
    const html = await warm!.engine.render("Including Page", "content");
    expect(
      html,
      "the including page served the pre-edit nested card: the cached inclusion " +
        "closure was not invalidated by the committed change to the nested row",
    ).toContain(NEW_INNER);
    expect(html).not.toContain(OLD_INNER);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 -- change a rule; the governed page must follow.
// ---------------------------------------------------------------------------

describe("B freshness 3: a committed rule change reaches the governed page", () => {
  // The governed rule is *all+*structure: Ruby's structured_content
  // (card/lib/card/content/all.rb:25-27), which replaces the card's own
  // content with the rule's template. Its content is the rule text the
  // governed page renders.
  const OLD_TEMPLATE = "old structure template";
  const NEW_TEMPLATE = "new structure template";

  // The stock read substrate: the read rule every real deck carries. Ruby
  // bootstraps it at setup (card/auth/setup.rb:44), and without it
  // ok_to_read? denies every card (card-mod-permissions
  // set/all/permissions.rb:139-146: read_rules_hash[nil] is nil), so the
  // governed page would render the denial span and no rule template at all.
  // Ids follow the stock substrate in tests/card/render/render-test-storage.ts
  // (BOOTSTRAP_READ_SUBSTRATE_IDS); the scenario's own ids (1 *all, 2
  // *structure, 3 the rule) sit below them and take over the `*all` codename
  // exactly as seedBootstrapReadSubstrate's releaseStockCard does for a
  // suite-seeded card.
  const SUBSTRATE_IDS = {
    set: 10_000_002,
    read: 10_000_003,
    anyone: 10_000_004,
    anonymous: 10_000_005,
    readRule: 10_000_006,
  } as const;
  // The Stock Set TYPE card's ids (readRuleCache's `sets.type_id = SetID`
  // filter; render-test-storage.ts seedBootstrapReadSubstrate).
  const STOCK_SET_TYPE_ID = 10_000_002;
  // The deck's Set TYPE card — this scenario's own (the stock one was
  // displaced by the `*all` takeover below).
  const DECK_SET_TYPE_ID = 100;
  // Plain type cards the deck needs by id: *structure is a Rule-typed
  // setting (RULE_TYPE_BY_SETTING / virtual-rule-card.ts: the *structure
  // rule card's type is the deck's Rule card) and the governed card is a
  // plain type card.
  const RULE_TYPE_ID = 101;
  const BASIC_TYPE_ID = 102;

  let warm: FileRuntime | undefined;

  beforeAll(async () => {
    warm = openRuntime();
    await applySchema(warm);
    // Set TYPE card first: `*all` is a SET card, and a set card is typed
    // with the deck's Set type card (the read-rule cache join filters
    // `sets.type_id = SetID`, so a non-Set type drops the rule out of
    // read_rules_hash and every card of the deck denies). The stock Set
    // TYPE card above keeps that id alive on this deck too — the same
    // takeover seedCard performs — so both values name a Set type card.
    await insertCard(warm, { id: DECK_SET_TYPE_ID, name: "Set", codename: "set", typeId: SET_TYPE_ID });
    await insertCard(warm, {
      id: 1, name: "*all", codename: "all", typeId: DECK_SET_TYPE_ID,
      readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all",
    });
    await insertCard(warm, {
      id: 2, name: "*structure", codename: "structure", typeId: RULE_TYPE_ID,
      readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all",
    });
    await insertCard(warm, {
      id: 3, leftId: 1, rightId: 2,
      dbContent: OLD_TEMPLATE,
    });
    // The stock substrate rows, minus the `*all` codename card the deck's
    // own `*all` above displaced:
    await insertCard(warm, { id: SUBSTRATE_IDS.read, name: "*read", codename: "read", readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all" });
    await insertCard(warm, { id: SUBSTRATE_IDS.anyone, name: "Anyone", codename: "anyone", readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all" });
    await insertCard(warm, { id: SUBSTRATE_IDS.anonymous, name: "Anonymous", codename: "anonymous", readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all" });
    // The stock `*all+*read -> [[Anyone]]` rule, on THIS deck's `*all`/`*read`
    // (the sides the repoint would have moved it to), plus the reference row
    // that puts it in read_rules_hash for Anyone (read_rule_cache.rb's join).
    await insertCard(warm, {
      id: SUBSTRATE_IDS.readRule, leftId: 1, rightId: SUBSTRATE_IDS.read,
      dbContent: "[[Anyone]]", readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all",
    });
    await insertReference(warm, SUBSTRATE_IDS.readRule, SUBSTRATE_IDS.anyone, "anyone");
    await insertCard(warm, {
      id: 40, name: "Governed Card", typeId: BASIC_TYPE_ID, dbContent: "governed body",
      readRuleId: SUBSTRATE_IDS.readRule, readRuleClass: "*all",
    });
    expect(await warm.engine.render("Governed Card", "open")).toContain(OLD_TEMPLATE);
    // Commit the rule change: the SAME rule id, different template text.
    await warm.query(
      "UPDATE cards SET db_content = ? WHERE id = 3",
      [NEW_TEMPLATE],
    );
  });

  afterAll(() => {
    if (warm) discardRuntime(warm);
  });

  it("the governed page's next render applies the committed rule, not the cached one", async () => {
    const html = await warm!.engine.render("Governed Card", "open");
    expect(
      html,
      "the governed page still carries the pre-change structure template: the rule " +
        "walk answered from a cache that the committed rule edit did not invalidate",
    ).toContain(NEW_TEMPLATE);
    expect(html).not.toContain(OLD_TEMPLATE);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 -- revoke anonymous read access; the next request must be denied.
// ---------------------------------------------------------------------------

describe("B freshness 4: revoking anonymous access denies the next anonymous request", () => {
  const SECRET = "SECRET CARD BODY";

  let warm: FileRuntime | undefined;

  beforeAll(async () => {
    warm = openRuntime();
    await applySchema(warm);
    await seedRuleSkeleton(warm, { everyoneRule: "[[Anyone]]", memberRule: "[[Role A]]" });
    await insertCard(warm, {
      id: 50, name: "Protected Card", typeId: BASIC_TYPE_ID, dbContent: SECRET,
      readRuleId: 8, readRuleClass: "*all",
    });
    // Anonymous can read it now.
    expect(await warm.engine.render("Protected Card", "content")).toContain(SECRET);
    // Commit the revocation the way the write path commits a rule save: the
    // rule's content AND its party reference row. The committed party list
    // the read-permission state reads is the card_references graph, not the
    // content bytes (src/card/permissions/read-rules.ts, the
    // read_rule_cache.rb port; a save that changed only content would not
    // revoke). The rule id is unchanged. Both mutations ride the
    // version-stamp triggers (cards + card_references).
    await warm.query("UPDATE cards SET db_content = ? WHERE id = 8", ["[[Role A]]"]);
    await warm.query(
      "UPDATE card_references SET referee_id = 7, referee_key = 'role_a' WHERE referer_id = 8",
    );
  });

  afterAll(() => {
    if (warm) discardRuntime(warm);
  });

  it("the next anonymous request is denied and leaks no body", async () => {
    const html = await warm!.engine.render("Protected Card", "content");
    expect(
      html,
      "the post-revocation anonymous request was SERVED: the freshness gate did " +
        "not invalidate the cached pre-revocation permission verdict, or the " +
        "re-derived state still reads a party graph that grants the anonymous path",
    ).toBe(quietDenial());
    expect(html).not.toContain(SECRET);
  });
});

// ---------------------------------------------------------------------------
// Mechanism control -- the engine's invalidation seam still works when it is
// invoked by hand: resetCaches() drops every derived cache and the next
// render reads the committed row. The freshness gate above drives THIS seam
// automatically (the stamp moved -> resetCaches()); the control proves the
// seam itself is sound, so a gate failure would indict the stamp read, not
// the reset.
// ---------------------------------------------------------------------------

describe("B freshness mechanism control: manual resetCaches still reveals the committed row", () => {
  let warm: FileRuntime | undefined;

  beforeAll(async () => {
    warm = openRuntime();
    await applySchema(warm);
    await seedRuleSkeleton(warm, { everyoneRule: "[[Anyone]]", memberRule: "[[Role A]]" });
    await insertCard(warm, {
      id: 60, name: "Control Card", typeId: BASIC_TYPE_ID, dbContent: "CONTROL BEFORE",
      readRuleId: 8, readRuleClass: "*all",
    });
    await warm.query("UPDATE cards SET db_content = ? WHERE id = 60", ["CONTROL AFTER"]);
  });

  afterAll(() => {
    if (warm) discardRuntime(warm);
  });

  it("after an explicit resetCaches the same render DOES see the committed row", async () => {
    // Control, not a contract requirement: resetCaches() is a real public seam
    // (src/card/render.ts, RenderEngine#resetCaches; FetchEngine#resetCaches
    // at src/card/fetch.ts). If this passes, the engine's storage reads
    // are correct and a scenario failure would specifically indict the
    // freshness gate's stamp read -- not the reads, not the reset.
    warm!.engine.resetCaches();
    const html = await warm!.engine.render("Control Card", "content");
    expect(html).toContain("CONTROL AFTER");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 -- the cost of the freshness gate itself: a warm render must
// issue EXACTLY ONE statement, the deck_data_version stamp read. This is the
// honest contract-compliant number (the next
// request must reflect the committed state, which rules out a zero-statement
// warm render) -- one PK point SELECT, not a re-read of the deck.
// ---------------------------------------------------------------------------

/** A counting runtime: the file-backed driver wrapped by the render streams'
 *  CountingRenderDriver, so the engine's statement cost is measurable while
 *  seeding stays on the raw driver (seeds must not count). */
function openCountingRuntime(): FileRuntime & { counting: CountingRenderDriver } {
  const base = openRuntime();
  const counting = new CountingRenderDriver(base.driver);
  const engine = new RenderEngine(new FetchEngine(counting));
  return { ...base, engine, counting };
}

describe("B freshness 5: the freshness gate costs exactly one statement on a warm render", () => {
  let warm: FileRuntime & { counting: CountingRenderDriver } | undefined;

  beforeAll(async () => {
    warm = openCountingRuntime();
    await applySchema(warm);
    await seedRuleSkeleton(warm, { everyoneRule: "[[Anyone]]", memberRule: "[[Role A]]" });
    await insertCard(warm, {
      id: 70, name: "Cost Card", typeId: BASIC_TYPE_ID, dbContent: "COST BODY",
      readRuleId: 8, readRuleClass: "*all",
    });
    // First (cold) render: the stamp baseline folds into the closure batch.
    // Seeding went through the raw driver, so the counter starts clean here.
    expect(await warm.engine.render("Cost Card", "content")).toContain("COST BODY");
    warm.counting.reset();
  });

  afterAll(() => {
    if (warm) discardRuntime(warm);
  });

  it("a warm render issues exactly one statement: the deck_data_version stamp read", async () => {
    const html = await warm!.engine.render("Cost Card", "content");
    expect(html).toContain("COST BODY");
    const snapshot = warm!.counting.snapshot();
    expect(
      snapshot,
      "the warm render's total statement cost must be the single freshness-stamp " +
        "SELECT -- more means the gate re-reads deck state; zero means the gate " +
        "is not on the request path",
    ).toEqual({ statements: 1, roundTrips: 1 });
    // And the one statement is THE stamp read, byte for byte.
    expect(warm!.counting.statements).toEqual([DECK_DATA_VERSION_STATEMENT]);
  });

  it("a committed write moves the stamp, so the next render resets and re-reads", async () => {
    warm!.counting.reset();
    await warm!.query("UPDATE cards SET db_content = ? WHERE id = 70", ["COST EDITED"]);
    const html = await warm!.engine.render("Cost Card", "content");
    expect(html).toContain("COST EDITED");
    // The gate's own cost stays one statement; the reset makes the RENDER
    // cold again (the closure re-read), which is the invalidation working --
    // more than one statement HERE is expected and correct, so only the
    // stamp statement itself is pinned, not a total.
    expect(warm!.counting.statements[0]).toBe(DECK_DATA_VERSION_STATEMENT);
  });
});
