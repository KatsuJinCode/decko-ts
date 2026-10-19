// INPUT-ABUSE LANE: regex metacharacters against the REGEXP-backed search —
// the escaped-literal path, the raw `~~` passthrough, and the INTERACTION
// class: a Search card whose stored CQL carries a hostile pattern, rendered
// through the page path.
//
// Oracle facts (read from the Ruby source, decko-ruby-perf):
// - card/lib/card/query/value/match_value.rb:33-36 — a plain (or `~`-prefixed)
//   match term is escape_regexp_characters'd (":60-62 gsub(/(\W)/, '\\\\\1')"),
//   so `(.*+?[]^{|` matches that LITERAL string, never a regex;
// - :46-51 — a `~~` prefix is a MySQL regexp passed through AS WRITTEN, so an
//   uncompilable pattern (`~~[`) is a DATABASE ERROR in Ruby (SQLite3
//   raises on the REGEXP call the same way the port's UDF throws — the port
//   registers no silent-row fallback: docs/decisions/0005 item 2).
//
// The existing dialect pins live in tests/cql/match-ruby-semantics.test.ts
// (escaping) and tests/cql/match-dialect-throw-guard.test.ts (translation
// guard). This file adds the two execution PATHS for the hostile pattern —
// the local UDF and the edge post-filter — and the page-path question: what
// becomes of a page that nests a Search card armed with `~~[`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { registerSqliteRegexpFunction } from "../../src/cql/sqlite-regexp.js";
import { executeQuery, type CqlExecuteOptions } from "../../src/cql/execute.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { defaultDeckLoader } from "../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../src/card/mod-loader.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** The hostile term the ask names: every regex metacharacter, no letters. */
const META = "(.*+?[]^{|";

async function metaDeck(registerUdf: boolean): Promise<LocalSqliteDriver> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const insert = "INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, " +
    "created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, " +
    "references_expired, trash, type_id, db_content) " +
    "VALUES (?, ?, ?, NULL, NULL, NULL, NULL, '2026-01-01 00:00:00.000', " +
    "'2026-01-01 00:00:00.000', 10, 10, NULL, NULL, NULL, 0, 2, ?)";
  // "Meta" singularizes to "metum" under the Rails-default inflections BOTH
  // engines ship (the /([ti])a$/i -> \1um rule), so Ruby's own deck builder
  // stores key "metum_bomb" for "Meta Bomb" — the seed carries that key.
  await driver.query(insert, [1, "Meta Bomb", "metum_bomb", `x ${META} y`]);
  await driver.query(insert, [2, "Plain", "plain", "x ordinary y"]);
  if (registerUdf) registerSqliteRegexpFunction(driver);
  return driver;
}

/** Ids matching `statement`, on the pinned deck. `options` carries the
 *  execution-time SqlOptions (matchPostFilter is NOT a statement key). */
async function matchedIds(
  driver: LocalSqliteDriver,
  statement: Record<string, unknown>,
  options: CqlExecuteOptions = {},
): Promise<number[]> {
  const result = await executeQuery(driver, statement, options);
  if (!("rows" in result)) throw new Error("expected a rows result");
  return result.rows.map((row) => Number((row as { id: number }).id)).sort((a, b) => a - b);
}

describe("plain match terms of regex metacharacters match LITERALLY", () => {
  it(`match: "${META}" (escaped-literal shape) finds only the card carrying the literal bytes — local UDF path`, async () => {
    const driver = await metaDeck(true);
    try {
      expect(await matchedIds(driver, { match: META })).toEqual([1]);
    } finally {
      driver.close();
    }
  });

  it("same term, edge post-filter path (no UDF): same literal result set", async () => {
    const driver = await metaDeck(false);
    try {
      expect(await matchedIds(driver, { match: META }, { matchPostFilter: true })).toEqual([1]);
    } finally {
      driver.close();
    }
  });

  it("the exact form (=prefix) on name matches the key, never a regex", async () => {
    const driver = await metaDeck(true);
    try {
      expect(await matchedIds(driver, { match: "=Meta Bomb" })).toEqual([1]);
    } finally {
      driver.close();
    }
  });
});

describe("raw ~~ passthrough with an uncompilable pattern is an ERROR on every path", () => {
  const hostile = { match: "~~[" };

  it("local UDF path throws (never silent rows)", async () => {
    const driver = await metaDeck(true);
    try {
      await expect(executeQuery(driver, hostile)).rejects.toThrow(/\[|regexp/i);
    } finally {
      driver.close();
    }
  });

  it("edge post-filter path throws the same way", async () => {
    const driver = await metaDeck(false);
    try {
      await expect(executeQuery(driver, hostile, { matchPostFilter: true })).rejects.toThrow(
        /\[|regexp/i,
      );
    } finally {
      driver.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The interaction: a SEARCH CARD armed with the hostile CQL, on the page.
// ---------------------------------------------------------------------------

let pageStorage: RenderTestStorage;
let pageReady: Promise<void>;

async function seedSearchDeck(): Promise<void> {
  const s = pageStorage;
  // The Search cardtype (the codename column feeds the type gate).
  await seedCard(s, { id: 30, name: "Search", codename: "search_type" });
  // The hostile search card: raw `~~[` in its CQL.
  await seedCard(s, { id: 40, name: "Bomb Search", typeId: 30, dbContent: '{"match":"~~["}' });
  // A WELL-formed search whose term is the metacharacter literal (the
  // escaped-literal shape): `{"match":"..."}`.
  await seedCard(s, { id: 41, name: "Meta Search", typeId: 30, dbContent: JSON.stringify({ match: META }) });
  // The card the searches nest into.
  await seedCard(s, { id: 42, name: "search host", dbContent: "[{{Bomb Search}}][{{Meta Search}}]" });
  // (The stock *all+*read -> [[Anyone]] grant ships with
  // createRenderTestStorage — no extra permission seeds needed.)
  await s.fetcher.installNameEnvironment();
  bindModLoaderToEngine(s, defaultDeckLoader());
  for (const name of ["Bomb Search", "Meta Search", "search host"]) {
    const prepared = await s.engine.prepareItemForRender(name);
    if (prepared === undefined) throw new Error(`${name} not preparable after seed`);
  }
}

beforeAll(() => {
  defaultDeckLoader();
  pageReady = (async () => {
    pageStorage = await createRenderTestStorage();
    await seedSearchDeck();
  })();
});

afterAll(() => {
  setDefaultModLoader(undefined);
  pageStorage?.close();
});

describe("a page nesting Search cards armed with hostile CQL", () => {
  it("the escaped-literal search renders its (empty) result list gracefully", async () => {
    await pageReady;
    // The search content is JSON.stringify({match: META}) — the term rides
    // verbatim; the search runs escaped-literal against the deck, finds
    // nothing (no card carries the literal), and the list view renders the
    // empty-search surface — never a throw.
    const html = await pageStorage.engine.render("Meta Search", "core");
    expect(typeof html).toBe("string");
    expect(html).not.toContain("~~");
  });

  it("the raw ~~[ search card no longer takes down pages: the failure seats and the nest renders bytes", async () => {
    await pageReady;
    // MEASURED, with the fix for the prepare-scope rethrow: the seated
    // failure re-raises at the DISPATCH boundary for the result-rendering
    // views the capture census gates (:open/:content — render.ts
    // PARSE_DISPATCH_VIEWS), where the nest rescue renders the quiet
    // span on the page lane; the host page here nests the card's :titled
    // view (real bytes in Ruby too — the census's :closed/:title arm), so
    // the page carries bytes, never a 500.
    const host = await pageStorage.engine.render("search host", "core");
    expect(typeof host).toBe("string");
    expect(host.length).toBeGreaterThan(0);
    // And a nest that DOES render a result view (:open) re-raises the
    // seated failure at the dispatch boundary, where the nest's quiet
    // rescue renders the lib_error_rendering span — the page survives.
    await seedCard(pageStorage, {
      id: 43,
      name: "open host",
      dbContent: "BEFORE[{{Bomb Search|open}}]AFTER",
    });
    await pageStorage.engine.prepareItemForRender("open host");
    const openHost = await pageStorage.engine.render("open host", "core");
    expect(openHost).toContain("BEFORE[");
    expect(openHost).toContain("]AFTER");
    expect(openHost).toContain("Error rendering:");
    // The FOCAL :core render answers the seated-empty list — the port's
    // view-gated failure contract, shared with parse failures (an invalid-
    // JSON search card's :core renders the same empty list). Ruby's focal
    // search raises inside the view (a 500); the port answers bytes. That
    // focal-arm divergence PREDATES this lane (it is the BadQuery
    // contract's shape) and is recorded here, not silently widened.
    const focal = await pageStorage.engine.render("Bomb Search", "core");
    expect(focal).toContain("search-no-results");
  });
});
