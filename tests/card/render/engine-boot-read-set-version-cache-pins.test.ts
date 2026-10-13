// The engine's BOOT READ-SET against a content-version cache: four pins, one
// per clause of the mechanism's contract.
//
// WHAT IS UNDER TEST. A RenderEngine's first render folds three FIXED
// statements into its cold closure batch (src/card/render.ts, the coldSlots
// assembly): the codename codehash, the template type-name fold
// (rules/structure.ts#templateTypeNameStatement) and the head read-set
// (render/head-views.ts#headViewReadStatement). Their rows depend on nothing
// but the deck's content -- no viewer, no card, no round -- and they are
// memoized PER ENGINE INSTANCE. src/card/render/boot-cache.ts caches the three
// RESULT SETS process-wide, keyed on deck_data_version.
//
// THE FOUR PINS (the ask's METHOD, one assertion each):
//   1. COLD BOOT issues the reads.        (a bundle-less process reads them)
//   2. WARM BOOT, same content version, issues ZERO of them.
//   3. A COMMITTED WRITE bumps the version, and the next boot re-reads --
//      with the new content visible, not the cached one.
//   4. A database with NO version table throws LOUDLY. A skipped check would
//      be a silent staleness window, which is the one failure shape this
//      mechanism cannot have.
//
// WHY A NEW ENGINE, NOT A NEW RENDER. The cache is process state, so "warm
// boot" can only be expressed by a second engine over the SAME committed
// database file -- exactly the deploy's shape
// (deploy/bunny-worker-src/bunny-edge-session-viewer.ts ActorRenderEngines
// builds one RenderEngine per actor over a shared base fetcher, with
// insertion-order eviction at maxWarm=2, so a returning actor's engine is
// rebuilt and pays the boot read-set again). Each pin therefore opens a
// fresh driver + FetchEngine + RenderEngine triple on the same file, with no
// cache state carried over.
//
// MEASUREMENT, NOT ASSUMPTION. Every pin reports the exact SQL the counting
// driver saw, classified into the three boot families by SQL text (the same
// by-text classification the trip-attribution suite uses), plus both count
// axes: the statement axis and the round-trip axis (CountingRenderDriver
// counts a batch as ONE round trip and N statements).
//
// ISOLATION. One temp directory per pin group, removed in afterAll after the
// borrowing handles close (Windows EPERM on an open SQLite file). All fixture
// content is synthetic, mirroring the other suites in this directory.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLQueryResult } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  BOOT_VERSION_STATEMENT,
  bootCacheIsWarm,
  resetBootCache,
} from "../../../src/card/render/boot-cache.js";
import { CountingRenderDriver, splitSqlStatements } from "./render-test-storage.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

// ids follow tests/card/permissions/read-permission.test.ts:5-27:
//   1 *all (Set)  2 Set (type)  3 *read  4 Basic  5 Anyone  6 Anonymous
//   7 Role A  8 *all+*read [[Anyone]]  9 Basic+*type  10 Basic+*type+*read
const SET_TYPE_ID = 2;
const BASIC_TYPE_ID = 4;

const SCHEMA_DDL = readFileSync(
  fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
  "utf8",
);

/**
 * ONE DATABASE, MANY ENGINES — the deploy's shape, and the only shape in
 * which "warm boot" is expressible.
 *
 * ActorRenderEngines (deploy/bunny-worker-src/bunny-edge-session-viewer.ts
 * :171-200) keeps ONE RenderEngine per actor over a SHARED base fetcher and
 * driver, with insertion-order eviction at maxWarm=2: a third account evicts
 * the first, and the first account's return builds a FRESH RenderEngine over
 * the same fetcher and pays the boot read-set again. So the harness models a
 * BootDeck (the driver + fetcher, which ARE the deck for the process) and
 * mints engines off it.
 *
 * It is also the only correct harness for the cache's key. The boot bundle is
 * tied to the CONNECTION its rows were read through, because the content
 * version is a per-database counter: a second database in one process also
 * starts at a small integer, and a version alone cannot tell two decks apart.
 * An earlier version-only key served one test's database to the next test's
 * engine in the same file; the date-error suite caught it.
 */
interface BootDeck {
  dir: string;
  dbPath: string;
  driver: LocalSqliteDriver;
  counting: CountingRenderDriver;
  fetcher: FetchEngine;
  /** A brand-new RenderEngine over the deck's shared fetcher: no render cache
   *  state carried over, which is what makes the warm-boot pin expressible. */
  newEngine(): RenderEngine;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<SQLQueryResult<T>>;
  close(): void;
}

let deckSeq = 0;

/** A BootDeck on a fresh temp database file, or on an existing one when
 *  `dbPath` is given (borrowing: its cleanup must not delete a file another
 *  deck still holds open). */
function openDeck(dbPath?: string): BootDeck {
  deckSeq += 1;
  const dir = dbPath === undefined ? scratchDir(`decko-bootcache-${deckSeq}-`) : "";
  const path = dbPath ?? join(dir, "deck.sqlite");
  const driver = new LocalSqliteDriver({ path });
  const counting = new CountingRenderDriver(driver);
  const fetcher = new FetchEngine(counting);
  return {
    dir,
    dbPath: path,
    driver,
    counting,
    fetcher,
    newEngine: () => new RenderEngine(fetcher),
    query: (sql, params = []) => driver.query(sql, params),
    close: () => driver.close(),
  };
}

function discard(deck: BootDeck | undefined): void {
  if (deck === undefined) return;
  try {
    deck.close();
  } catch {
    // A deck whose handle already failed to open is still worth cleaning.
  }
  if (deck.dir !== "") rmSync(deck.dir, { recursive: true, force: true });
}

async function insertCard(
  rt: BootDeck,
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
      hasName ? DeckoName.parse(opts.name as string).key : null,
      opts.codename ?? null,
      opts.leftId ?? null,
      opts.rightId ?? null,
      "2026-10-05 00:00:00.000",
      "2026-10-05 00:00:00.000",
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

async function insertReference(
  rt: BootDeck,
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

/** A deck small enough to read and shaped so every boot read-set has
 *  something to return:
 *   - the codename codehash returns the five codenamed rows;
 *   - the head read-set returns its `*head` / `*style` members;
 *   - the template type-name fold returns at least one row (a `*default`
 *     rule card carrying a type), which is the shape its JOIN is written for;
 *   - `Fieldwork`, the page the pins render. */
async function seedBootDeck(rt: BootDeck, body: string): Promise<void> {
  // The schema carries the content stamp (db/schema.sqlite.sql's
  // [ENGINE-FRESHNESS] block: deck_data_version + the six bump triggers), so
  // applying it installs the version this lane's cache keys on. The shared
  // splitter is trigger-aware — a trigger body's own ";" would otherwise tear
  // the statement in half.
  for (const statement of splitSqlStatements(SCHEMA_DDL)) await rt.query(statement, []);

  await insertCard(rt, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await insertCard(rt, { id: 2, name: "Set", codename: "set" });
  await insertCard(rt, { id: 3, name: "*read", codename: "read" });
  await insertCard(rt, { id: 4, name: "Basic" });
  await insertCard(rt, { id: 5, name: "Anyone", codename: "anyone" });
  await insertCard(rt, { id: 6, name: "Anonymous", codename: "anonymous" });
  await insertCard(rt, { id: 7, name: "Role A" });
  await insertCard(rt, { id: 15, name: "*type", codename: "type" });
  await insertCard(rt, { id: 16, name: "*self", codename: "self" });
  // *all+*read -> the "everyone" party list; Anonymous reads through it.
  await insertCard(rt, { id: 8, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await insertReference(rt, 8, 5, "anyone");
  await insertCard(rt, { id: 9, leftId: 4, rightId: 15, typeId: SET_TYPE_ID });
  await insertCard(rt, { id: 10, leftId: 9, rightId: 3, dbContent: "[[Role A]]" });
  await insertReference(rt, 10, 7, "role_a");

  // The head read-set's members (render/head-views.ts HEAD_READ_SET_KEYS).
  await insertCard(rt, { id: 30, name: "*head", codename: "head", dbContent: "TITLE HEAD" });
  await insertCard(rt, { id: 31, name: "*style", codename: "style", dbContent: "style body" });
  // A *default rule card carrying a type: what templateTypeNameStatement's
  // `c.right_id IN (SELECT id FROM cards WHERE key IN ('*default','*structure'))`
  // half selects, and what the id -> type-name map then answers.
  await insertCard(rt, { id: 32, name: "*default", typeId: BASIC_TYPE_ID });
  await insertCard(rt, { id: 33, leftId: 1, rightId: 32, typeId: SET_TYPE_ID, dbContent: "[[Anyone]]" });
  await insertReference(rt, 33, 5, "anyone");

  await insertCard(rt, {
    id: 20,
    name: "Fieldwork",
    typeId: BASIC_TYPE_ID,
    dbContent: body,
    readRuleId: 8,
    readRuleClass: "*all",
  });
}

// --- the three boot families, classified the way the trip-attribution suite does ---

const CODEHASH_SQL = "SELECT id, codename, name, left_id, right_id FROM cards WHERE codename IS NOT NULL";

/** The boot read-set as it appears in a counting driver's statement log.
 *  `text` is the SQL; families are matched by text, not by call site, so a
 *  family that moved still counts. */
interface BootReadSet {
  codehash: string[];
  typeNames: string[];
  headReads: string[];
  version: string[];
  total: number;
  totalStatements: number;
  roundTrips: number;
}

function classifyBootReads(deck: BootDeck): BootReadSet {
  const seen = deck.counting.statements;
  const out: BootReadSet = {
    codehash: [],
    typeNames: [],
    headReads: [],
    version: [],
    total: 0,
    totalStatements: 0,
    roundTrips: 0,
  };
  for (const sql of seen) {
    if (sql === CODEHASH_SQL) out.codehash.push(sql);
    else if (sql.includes("SELECT DISTINCT c.type_id AS type_id, t.name AS name")) out.typeNames.push(sql);
    else if (sql.includes("FROM cards WHERE key IN (") && sql.includes("trash = 0")) out.headReads.push(sql);
    else if (sql === BOOT_VERSION_STATEMENT) out.version.push(sql);
  }
  out.total = out.codehash.length + out.typeNames.length + out.headReads.length;
  const snapshot = deck.counting.snapshot();
  out.totalStatements = snapshot.statements;
  out.roundTrips = snapshot.roundTrips;
  return out;
}

/** Every rendered slot carries a per-render `data-slot-id` nonce, so two
 *  engines rendering the same card can never be byte-equal as-is. Slot-
 *  normalize that one attribute before the byte contract is judged —
 *  the slot nonce is the only attribute that differs between two renders
 *  of the same card. Everything else in the bytes is compared verbatim. */
function slotNormalized(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-f]{20}\1/g, 'data-slot-id="<nonce>"');
}

const ORIGINAL_BODY = "THE ORIGINAL BODY";
const EDITED_BODY = "THE EDITED BODY";

describe("engine boot read-set: cold boot reads, warm boot at the same content version does not", () => {
  let deck: BootDeck | undefined;

  beforeAll(async () => {
    deck = openDeck();
    await seedBootDeck(deck, ORIGINAL_BODY);
  });

  afterAll(() => {
    discard(deck);
  });

  beforeEach(() => {
    // The cache is module state. A pin that cannot clear it cannot measure a
    // cold boot.
    resetBootCache();
    deck!.counting.reset();
  });

  /** One boot: a brand-new RenderEngine over the deck's shared fetcher, with
   *  the statement counter zeroed first so the numbers below are this boot's
   *  and not a running total. The read-set comes back WITH the html, because
   *  the next boot on this deck resets the counter again. */
  async function boot(
    card = "Fieldwork",
    view = "content",
  ): Promise<{ html: string; reads: BootReadSet }> {
    deck!.counting.reset();
    const html = await deck!.newEngine().render(card, view);
    return { html, reads: classifyBootReads(deck!) };
  }

  it("PIN 1 -- COLD BOOT: a process holding no bundle reads the boot read-set from storage", async () => {
    expect(bootCacheIsWarm(deck!.fetcher.driver), "this connection must start with no boot bundle").toBe(false);
    const { html, reads } = await boot();
    expect(html, "the seed page must render at all, or nothing below measures anything").toContain(
      ORIGINAL_BODY,
    );
    // Reported, not asserted against a magic number: the exact statement
    // inventory of a cold boot is the measurement itself.
    console.log(
      `PIN1 cold boot: bootReadSet=${reads.total} (codehash ${reads.codehash.length}, ` +
        `typeNames ${reads.typeNames.length}, headReads ${reads.headReads.length}) ` +
        `of ${reads.totalStatements} statements in ${reads.roundTrips} round trips`,
    );
    expect(reads.codehash.length, "cold boot must read the codename codehash").toBe(1);
    expect(reads.typeNames.length, "cold boot must read the template type-name fold").toBe(1);
    expect(reads.headReads.length, "cold boot must read the head read-set").toBe(1);
  });

  /**
   * Boot engines until the process holds a VERSIONED bundle -- the point at
   * which a further engine can actually be served the cached rows. The
   * convergence is two boots deep and is the mechanism's honest cost, so it
   * is pinned rather than hidden:
   *   engine 1 -- the process holds no bundle, so this engine runs no probe at
   *               all and pays exactly today's boot cost. It leaves a
   *               PROVISIONAL bundle (rows read, no version observed) so the
   *               cache is not dead on arrival.
   *   engine 2 -- a bundle now exists, so this engine probes. A provisional
   *               bundle is never served (nothing vouches for its rows), so
   *               it re-reads and UPGRADES the bundle to the probed version.
   *               Cost: today's boot cost + 1 statement.
   *   engine 3+ -- the probe reports the version the bundle carries: served,
   *               0 of the boot read-set.
   *
   * VERSION-COUNT ARITHMETIC on the current tree. Every boot here is a
   * cold-closure render of a fresh engine, and the freshness gate's
   * FIRST-render baseline (stampCold) folds ONE deck_data_version read into
   * the cold batch — the same statement text the probe issues, so it lands
   * in the same `version` capture bucket. Every version-count pin below is
   * the probe count + 1 baseline; the DELTA between a bundle-less boot
   * (probe 0) and a bundled boot (probe 1) is still exactly 1, so the pins
   * still fail if the probe fires without a bundle or fails to fire with
   * one.
   */
  async function bootUntilVersioned(): Promise<BootReadSet[]> {
    const reads: BootReadSet[] = [];
    for (let engine = 1; engine <= 2; engine++) {
      reads.push((await boot()).reads);
    }
    return reads;
  }

  it("PIN 2 -- WARM BOOT at the same content version: a new engine issues ZERO boot reads", async () => {
    expect(bootCacheIsWarm(deck!.fetcher.driver), "this connection must start with no boot bundle").toBe(false);
    const convergence = await bootUntilVersioned();
    console.log(
      `PIN2 convergence: boot1 bootReadSet=${convergence[0].total} ` +
        `probe=${convergence[0].version.length} of ${convergence[0].totalStatements} statements ` +
        `in ${convergence[0].roundTrips} round trips | ` +
        `boot2 bootReadSet=${convergence[1].total} probe=${convergence[1].version.length} ` +
        `of ${convergence[1].totalStatements} statements in ${convergence[1].roundTrips} round trips`,
    );
    expect(
      convergence[0].version.length,
      "the first engine's one version read is the freshness baseline, not a probe: " +
        "with no bundle in hand a probe cannot hit (composed posture: 1 baseline + 0 probe)",
    ).toBe(1);
    expect(
      convergence[1].version.length,
      "the second engine must run the probe -- that is what versions the bundle " +
        "(composed posture: 1 baseline + 1 probe)",
    ).toBe(2);

    // ...and the engine AFTER convergence issues none of the boot read-set.
    const { html, reads } = await boot();
    expect(html).toContain(ORIGINAL_BODY);
    console.log(
      `PIN2 warm boot: bootReadSet=${reads.total} (codehash ${reads.codehash.length}, ` +
        `typeNames ${reads.typeNames.length}, headReads ${reads.headReads.length}) ` +
        `of ${reads.totalStatements} statements in ${reads.roundTrips} round trips ` +
        `+ version probe ${reads.version.length}`,
    );
    expect(
      reads.total,
      `warm boot still issued the boot read-set: ${JSON.stringify(reads, null, 2)}`,
    ).toBe(0);
    expect(
      reads.version.length,
      "the warm boot must still read the content version -- that check is the cache's safety " +
        "(composed posture: 1 freshness baseline + 1 probe)",
    ).toBe(2);
  });

  it("PIN 3 -- a committed write bumps the version and the next boot re-reads", async () => {
    // Converge first, so the pin measures a bundle that COULD have been
    // served and the only reason it is not is the moved version.
    await bootUntilVersioned();
    expect(bootCacheIsWarm(deck!.fetcher.driver)).toBe(true);
    expect(
      (await boot()).reads.total,
      "precondition: the bundle must be serving before the write, or this pin proves nothing",
    ).toBe(0);

    const before = await deck!.query<{ version: number }>(BOOT_VERSION_STATEMENT, []);
    // A committed write to the deck's content -- straight at the row, with no
    // application API involved, which is exactly the write shape the stamp's
    // triggers exist to catch.
    await deck!.query("UPDATE cards SET db_content = ? WHERE id = 20", [EDITED_BODY]);
    const after = await deck!.query<{ version: number }>(BOOT_VERSION_STATEMENT, []);
    expect(
      after.rows[0].version,
      "the committed write did not bump the content version: the stamp's triggers are not installed",
    ).toBeGreaterThan(before.rows[0].version);

    const { reads } = await boot();
    console.log(
      `PIN3 post-write boot: bootReadSet=${reads.total} probe=${reads.version.length} ` +
        `of ${reads.totalStatements} statements in ${reads.roundTrips} round trips`,
    );
    expect(
      reads.version.length,
      "the post-write boot must have probed: this is the check that noticed the move " +
        "(composed posture: 1 freshness baseline + 1 probe)",
    ).toBe(2);
    expect(
      reads.total,
      `a moved content version must re-read the boot read-set, got ${reads.total}: ${JSON.stringify(reads, null, 2)}`,
    ).toBe(3);
    // Put the body back so PIN 3b and PIN 4 measure against ORIGINAL_BODY.
    await deck!.query("UPDATE cards SET db_content = ? WHERE id = 20", [ORIGINAL_BODY]);
  });

  it("PIN 3b -- a warm boot renders byte-identically off a replayed head bundle", async () => {
    // The bundle holds RESULT SETS, consumed by the same parsers a live result
    // is consumed by. If a replayed bundle skipped a parse, the head view would
    // render differently -- that is what this compares.
    await bootUntilVersioned();

    // A cold-boot engine for the reference bytes: reset the cache, so this
    // engine has to read the head read-set from storage like any first boot.
    resetBootCache();
    const coldOpen = await boot("Fieldwork", "open");
    const coldTitle = (await boot("Fieldwork", "title")).html;

    // ...and the next engine, served the bundle.
    await boot("Fieldwork", "open");
    const warmOpen = await boot("Fieldwork", "open");
    const warmTitle = (await boot("Fieldwork", "title")).html;
    const coldHtml = coldOpen.html;
    const warmHtml = warmOpen.html;
    const coldReads = coldOpen.reads;
    const warmReads = warmOpen.reads;
    console.log(
      `PIN3b cold bootReadSet=${coldReads.total} vs warm bootReadSet=${warmReads.total}; ` +
        `open bytes cold=${coldHtml.length} warm=${warmHtml.length}`,
    );
    expect(coldReads.total, "the reference engine must have read the whole boot read-set from storage").toBe(3);
    expect(warmReads.total, "the warm engine must not have read any of it").toBe(0);
    expect(
      slotNormalized(warmHtml),
      "warm and cold bytes must agree once the per-render slot nonce is normalized: " +
        "a replayed bundle that skips a parse is not byte-identical",
    ).toBe(slotNormalized(coldHtml));
    expect(warmTitle, "the title view reads the head read-set and must agree off a replayed bundle").toBe(
      coldTitle,
    );
    expect(coldTitle, "the title view must actually read the head read-set, or this pin measures nothing").not.toBe(
      "",
    );
  });

  it("PIN 5 -- the CENSUS-SHAPED posture: a new engine AND a new fetcher, same connection", async () => {
    // Every pin above reuses the deck's fetcher, which is the deploy's shape
    // (ActorRenderEngines holds one base fetcher for the isolate). The other
    // posture -- "fresh driver + FetchEngine + RenderEngine per page" -- is
    // what the cold-engine cost figures (5-6 statements per cold engine) are
    // taken over. This pin measures the same posture through the cache, so
    // the before/after numbers are comparable.
    //
    // A fresh FETCHER matters: it is a fresh codehash registry, so the
    // codename codehash is a real statement for it rather than an already-
    // loaded memo. The bundle still covers it, because the bundle holds RESULT
    // SETS and the registry is rebuilt from them through the same
    // foldCodehashResults.
    await bootUntilVersioned();

    async function coldFetcherBoot(): Promise<{ html: string; reads: BootReadSet }> {
      const fetcher = new FetchEngine(deck!.counting);
      deck!.counting.reset();
      const html = await new RenderEngine(fetcher).render("Fieldwork", "content");
      return { html, reads: classifyBootReads(deck!) };
    }

    // Three boots, and the depth is the mechanism's honest convergence cost
    // (see bootUntilVersioned): a bundle-less process cannot probe, so its
    // first boot stores a PROVISIONAL bundle; the boot after it probes, finds
    // the provisional bundle unservable, re-reads and UPGRADES it to the
    // probed version; the boot after THAT is served.
    resetBootCache();
    const reference = await coldFetcherBoot();
    const upgrade = await coldFetcherBoot();
    const served = await coldFetcherBoot();
    console.log(
      `PIN5 cold-fetcher posture: reference bootReadSet=${reference.reads.total} ` +
        `probe=${reference.reads.version.length} of ${reference.reads.totalStatements} statements ` +
        `in ${reference.reads.roundTrips} round trips | upgrade bootReadSet=${upgrade.reads.total} ` +
        `probe=${upgrade.reads.version.length} of ${upgrade.reads.totalStatements} statements ` +
        `in ${upgrade.reads.roundTrips} round trips | served bootReadSet=${served.reads.total} ` +
        `probe=${served.reads.version.length} of ${served.reads.totalStatements} statements ` +
        `in ${served.reads.roundTrips} round trips`,
    );
    expect(
      reference.reads.total,
      "the reference engine must have read the whole boot read-set from storage",
    ).toBe(3);
    expect(
      reference.reads.version.length,
      "a bundle-less process cannot probe (composed posture: 1 freshness baseline + 0 probe)",
    ).toBe(1);
    expect(
      upgrade.reads.version.length,
      "the upgrade boot must probe (composed posture: 1 baseline + 1 probe)",
    ).toBe(2);
    expect(served.reads.total, "the served engine must not have read any of it").toBe(0);
    expect(
      served.reads.version.length,
      "it must still have probed (composed posture: 1 baseline + 1 probe)",
    ).toBe(2);
    expect(slotNormalized(served.html)).toBe(slotNormalized(reference.html));
  });

  it("PIN 4 -- a database with NO version table throws LOUDLY rather than rendering", async () => {
    // Converge first: the gate only probes once a bundle exists, and a bundle
    // is only ever stored by an engine that read the boot read-set.
    const convergence = await bootUntilVersioned();
    expect(bootCacheIsWarm(deck!.fetcher.driver), "the process must hold a bundle before the stamp can be removed").toBe(true);
    expect(
      convergence[1].version.length,
      "the convergence boot must have run the version probe -- that is what versions the bundle " +
        "(composed posture: 1 freshness baseline + 1 probe)",
    ).toBe(2);

    // Remove the stamp table from the committed database. This is the
    // unmigrated database the schema's freshness notes warn about.
    // The six bump triggers on cards / card_references SURVIVE the drop (they
    // belong to those tables), so re-creating the table restores the stamp
    // whole.
    await deck!.query("DROP TABLE deck_data_version", []);

    await expect(
      boot(),
      "an unmigrated database rendered instead of throwing: the version check was skipped, " +
        "which is a silent staleness window",
    ).rejects.toThrow(/deck_data_version unreadable/);

    // Restore, so a later run of this file sees a stamped database.
    await deck!.query(
      "CREATE TABLE deck_data_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL DEFAULT 0)",
      [],
    );
    await deck!.query("INSERT INTO deck_data_version (id, version) VALUES (1, 0)", []);
  });
});
