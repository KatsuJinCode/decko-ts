// Public synthetic exercises for four engine claims, on decks anyone has.
//
// DATA RULE: every card name, body, user and filename in this file is
// invented text. The decks are built in-process (a fresh in-memory SQLite
// per suite) or seeded from committed capture fixtures - no private deck,
// no network, no hosted service. Nothing here reads a production corpus.
//
// The four claims, each in its own suite:
//   1. README.md:329-331 - set-pattern registry, fetch/cache, renderer with
//      batched inclusion prefetch, rule application.
//   2. docs/coverage-inventory.md:54-57 - the two committed CQL batteries.
//   3. recovery/release/public/ISSUE-1282-FINAL-PROVISIONAL.md:50 ("Site
//      mods run as they do on Ruby: the port serves the production deck
//      with its own mods in place." - that document ships with the
//      release write-up in the MAIN checkout, not in this worktree;
//      the engine-side surface it names is exercised here), and
//   4. docs/coverage-inventory.md:118-123 - arbitrary mods: a hand-ported
//      Ruby mod view beyond the byte-pinned handful is unproven against
//      Ruby's bytes.
//
// Boot helpers are the repository's own: createRenderTestStorage /
// seedCard / bindModLoaderToEngine (tests/card/render/render-test-storage.ts)
// for the render-side suites, createCqlTestStorage /
// seedOracleCaptureDeck (tests/cql/cql-test-storage.ts) for the CQL replay.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import {
  createCqlTestStorage,
  seedOracleCaptureDeck,
  type CqlSeedCard,
  type CqlTestStorage,
} from "../cql/cql-test-storage.js";
import { executeQuery, parseOptionsWithLexicon } from "../../src/cql/execute.js";
import type { DbLexicon } from "../../src/card/fetch/lexicon.js";
import type { CardsRow } from "../../src/server/schema.js";
import { DeckoName } from "../../src/card/name.js";
import {
  PATTERN_TABLE,
  findPattern,
} from "../../src/card/set-patterns/registry.js";
import {
  safeSetKeysForCard,
  setNamesForCard,
} from "../../src/card/set-patterns/card-patterns.js";
import { ruleNamesForCard } from "../../src/card/set-patterns/rule-names.js";
import type { PatternCardInput } from "../../src/card/set-patterns/types.js";
import { findRule } from "../../src/card/rules/lookup.js";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
} from "../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../src/card/mod-loader/mod-manifest.js";
import { defaultDeckSources } from "../../src/card/mod-loader/default-mod-deck.js";
import { HTML_VIEWS } from "../../src/card/render/views.js";
import { UnsupportedViewError, type ViewFn } from "../../src/card/render/format.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The pattern-card facts the set-pattern registry reads, read back OFF
 *  the deck rather than hand-written: id, type_id and the type card's
 *  name. This is what src/card/render.ts:1331 feeds safeSetKeys with. */
async function deckPatternInput(s: RenderTestStorage, name: string): Promise<PatternCardInput> {
  const row = (
    await s.fetcher.driver.query<{ id: number; type_id: number | null }>(
      "SELECT id, type_id FROM cards WHERE name = ? AND trash = 0",
      [name],
    )
  ).rows[0];
  if (row === undefined) throw new Error(`no card "${name}" on the exercise deck`);
  let typeName: string | null = null;
  if (row.type_id !== null) {
    typeName = (
      await s.fetcher.driver.query<{ name: string }>("SELECT name FROM cards WHERE id = ?", [
        row.type_id,
      ])
    ).rows[0]?.name ?? null;
  }
  return { name, id: row.id, typeId: row.type_id, typeName };
}

// ===========================================================================
// Claim 1 - README.md:329-331
// set-pattern registry, fetch/cache, renderer with batched inclusion
// prefetch, rule application
// ===========================================================================

let rulesStorage: RenderTestStorage | undefined;

/** The synthetic deck this claim is exercised on: a *structure rule
 *  hanging off one type-anchored set, a card the rule governs, a card it
 *  does not, and the card the rule's template nests. Every name and body
 *  is invented. */
async function seedRulesDeck(s: RenderTestStorage): Promise<void> {
  // The two type cards the *type pattern anchors on.
  await seedCard(s, { id: 900, name: "Gadget", typeName: "Cardtype" });
  await seedCard(s, { id: 901, name: "Ledger", typeName: "Cardtype" });
  // The setting cards that name the patterns (codename-built).
  await seedCard(s, { id: 910, name: "*type", codename: "type", typeId: 902 });
  await seedCard(s, { id: 911, name: "*structure", codename: "structure", typeId: 902 });
  await seedCard(s, { id: 912, name: "Cardtype", codename: "cardtype", typeId: 902 });
  // Set "Gadget+*type" (the pattern's anchored set card) and the rule card
  // that hangs on it: Gadget+*type+*structure.
  await seedCard(s, { id: 913, leftId: 900, rightId: 910 });
  await seedCard(s, {
    id: 914,
    leftId: 913,
    rightId: 911,
    dbContent: "<p>GADGET TEMPLATE</p><p>{{_self|title}}</p><p>{{Gadget Manual}}</p>",
  });
  // The governed card (matches the rule's pattern) and the card that does
  // not (same shape, different type - the *type pattern's anchor differs,
  // so its set-membership answers differ).
  await seedCard(s, { id: 920, name: "Cog One", typeId: 900, dbContent: "COG OWN BYTES" });
  await seedCard(s, { id: 921, name: "Entry One", typeId: 901, dbContent: "ENTRY OWN BYTES" });
  // The absolute nest target the template inclusion has to prefetch.
  await seedCard(s, { id: 930, name: "Gadget Manual", dbContent: "MANUAL BODY" });
}

beforeAll(async () => {
  const s = await createRenderTestStorage();
  await seedRulesDeck(s);
  rulesStorage = s;
}, 60_000);

afterAll(() => {
  rulesStorage?.close();
});

describe("rules-and-sets: registry, fetch/cache, batched inclusion prefetch, rule application", () => {
  it('"set-pattern registry, fetch/cache, renderer with batched inclusion prefetch, rule application" — the Gadget+*type+*structure rule governs Cog One and not Entry One: the matching card renders the template (its own bytes gone), the non-matching card renders its own bytes, and the two cards\' set-membership answers name different sets', async () => {
    const s = rulesStorage!;

    // The rule's effect, as rendered bytes.
    const governed = await s.engine.render("Cog One", "content");
    expect(governed).toContain("GADGET TEMPLATE");
    expect(governed).not.toContain("COG OWN BYTES");
    const untouched = await s.engine.render("Entry One", "content");
    expect(untouched).toContain("ENTRY OWN BYTES");
    expect(untouched).not.toContain("GADGET TEMPLATE");

    // The set-membership answers differ accordingly, computed by the
    // registry from the DECK's own facts.
    const governedSets = setNamesForCard(await deckPatternInput(s, "Cog One"));
    const otherSets = setNamesForCard(await deckPatternInput(s, "Entry One"));
    expect(governedSets).toContain("Gadget+*type");
    expect(otherSets).toContain("Ledger+*type");
    expect(governedSets).not.toContain("Ledger+*type");
    expect(otherSets).not.toContain("Gadget+*type");
  });

  it('"set-pattern registry, fetch/cache, renderer with batched inclusion prefetch, rule application" — the *structure candidate walk finds Gadget+*type+*structure for the governed card through the fetcher cache and finds nothing for the card outside the set', async () => {
    const s = rulesStorage!;
    const governed = await deckPatternInput(s, "Cog One");
    const other = await deckPatternInput(s, "Entry One");

    // ruleNamesForCard is the ordered candidate list the *structure walk
    // reads; only the governed card's list can name the rule.
    expect(ruleNamesForCard(governed, "*structure")).toContain("Gadget+*type+*structure");
    expect(ruleNamesForCard(other, "*structure")).not.toContain("Gadget+*type+*structure");

    // findRule walks that list against the fetcher: the rule card comes
    // back for the governed card, and nothing does for the other one
    // (there is no *all+*structure fallback on this deck).
    const hit = await findRule(s.fetcher, governed, "*structure");
    if (hit === undefined) throw new Error("the *structure rule walk found nothing");
    expect(hit.rule.name?.s).toBe("Gadget+*type+*structure");
    expect(hit.setName).toBe("Gadget+*type");
    expect(hit.candidates[hit.matchedIndex]).toBe("Gadget+*type+*structure");
    const miss = await findRule(s.fetcher, other, "*structure");
    expect(miss).toBeUndefined();

    // The registry itself is the table the walk above is built from, and
    // the *type pattern's applies() is what separates the two cards.
    expect(PATTERN_TABLE.map((spec) => spec.code)).toContain("type");
    expect(findPattern("type")!.applies(governed)).toBe(true);
    expect(findPattern("type")!.applies(other)).toBe(true);
    expect(governed.typeName).toBe("Gadget");
    expect(other.typeName).toBe("Ledger");
    expect(safeSetKeysForCard(governed)).toContain("TYPE-gadget");
    expect(safeSetKeysForCard(other)).toContain("TYPE-ledger");
  });

  it('"set-pattern registry, fetch/cache, renderer with batched inclusion prefetch, rule application" — the template\'s absolute inclusion is prefetched into the same render: Gadget Manual\'s body renders inside the governed card\'s content', async () => {
    const s = rulesStorage!;
    const governed = await s.engine.render("Cog One", "content");
    // {{_self|title}} - the relative inclusion, substituted against the
    // structured card itself.
    expect(governed).toContain("Cog One");
    // {{Gadget Manual}} - an absolute inclusion the closure has to carry
    // in with the render; the target is never nested on the rendered card.
    expect(governed).toContain("MANUAL BODY");
    // The card outside the rule renders its own bytes and never the
    // template's inclusions.
    const untouched = await s.engine.render("Entry One", "content");
    expect(untouched).not.toContain("MANUAL BODY");
  });

  it('"set-pattern registry, fetch/cache, renderer with batched inclusion prefetch, rule application" — the prefetch is batched, not per card: one cold render that resolves BOTH the governed card and the card its template nests reads the rule universe exactly once per setting (twice: *structure and *default), and both reads land in the prelude ahead of the freshness stamp that ends it', async () => {
    // A deck of its own, so the render below is genuinely COLD: the
    // counting driver records every statement in issue order, and a warm
    // engine would answer from cache and prove nothing.
    const fresh = await createRenderTestStorage();
    await seedRulesDeck(fresh);
    try {
      fresh.counting.reset();
      const html = await fresh.engine.render("Cog One", "content");
      // The render really did resolve two cards: the governed one and the
      // target its template nests.
      expect(html).toContain("GADGET TEMPLATE");
      expect(html).toContain("MANUAL BODY");

      const issued = fresh.counting.statements;
      // The rule-universe statement - the recursive CTE the rule cards
      // are read through (src/card/rules/structure.ts). Two settings ask
      // for one (*structure, *default), so two reads, not one per card.
      const universe = issued.filter((sql) => sql.includes("WITH RECURSIVE\nsetting(id) AS"));
      expect(universe).toHaveLength(2);
      // The stamp read is the render path's one per-request freshness
      // statement and closes the prelude batch; both universe reads
      // precede it, so they rode the batch instead of being issued again
      // per nested card.
      const stampIndex = issued.findIndex((sql) => sql.includes("deck_data_version"));
      expect(stampIndex).toBeGreaterThan(-1);
      expect(universe.every((sql) => issued.indexOf(sql) < stampIndex)).toBe(true);
    } finally {
      fresh.close();
    }
  }, 60_000);
});

// ===========================================================================
// Claim 2 - docs/coverage-inventory.md:54-57
// the two committed CQL batteries
// ===========================================================================

interface CapturedQuery {
  query: Record<string, unknown>;
  result: string[] | string;
}

/** Result names recomposed through the fetch layer's Lexicon walk, sorted:
 *  the battery comparison is name-SET parity, the same contract
 *  tests/cql/oracle-replay.test.ts pins. */
async function resultNames(lexicon: DbLexicon, rows: CardsRow[]): Promise<string[]> {
  const names: string[] = [];
  for (const row of rows) {
    const composed = await lexicon.name(row.id);
    if (composed !== undefined && composed.s !== "") names.push(composed.s);
  }
  return names.sort();
}

/** peekId is warm-cache-only by contract, so the Lexicon is warmed before
 *  any captured query is interpreted. */
async function warmDeckLexicon(storage: CqlTestStorage): Promise<void> {
  const result = await storage.driver.query<{ id: number }>("SELECT id FROM cards", []);
  await storage.fetcher.warmLexicon(result.rows.map((row) => row.id));
}

// The MySQL-rung match-battery probe deck, modeled on synthetic rows.
// tools/oracle/cql_match_capture.rb SEEDS; ids 700+ so they sort after
// every modeled standard card. No real content: every name and body below
// is invented.
const MATCH_BATTERY_DECK: CqlSeedCard[] = [
  { id: 700, name: "Matchprobe Alpha", typeId: 2, dbContent: "the quick brown fox jumps over the lazy dog" },
  { id: 701, name: "Matchprobe Beta", typeId: 2, dbContent: "a calm brown cow grazes quietly" },
  { id: 702, name: "Matchprobe UPPER", typeId: 2, dbContent: "shouting UPPERCASE token inside lowercase text" },
  { id: 703, name: "matchprobe lower", typeId: 2, dbContent: "quiet lowercase body" },
  { id: 704, name: "Matchprobe Punct", typeId: 2, dbContent: "grep (regex) [braces] + plus.dot? no! a|b ^carat $end" },
  { id: 705, name: "Matchprobe Dots", typeId: 2, dbContent: "wel.come welxcome wellcome welwel version v2.0 beta" },
  { id: 706, name: "Matchprobe Unicode", typeId: 2, dbContent: "words: naïve café Zürich NAÏVE repeat 日本語テキスト" },
  { id: 707, name: "Matchprobe Compound", typeId: 2, dbContent: "compound parent carries the token" },
  { id: 708, name: "zeta", typeId: 2 },
  { id: 709, name: "Matchprobe Compound+zeta", leftId: 707, rightId: 708, typeId: 2, dbContent: "child body without the magic word" },
  { id: 710, name: "Matchprobe Search", typeId: 98, dbContent: '{"match":"matchprobe","sort":"name"}' },
];

/** db_content corrections on the modeled standard deck that two captured
 *  match-battery entries depend on: *all+*read's name column is NULL, so
 *  its row only matches through non-NULL content; *all+*default's stays
 *  NULL because it is absent from Ruby's result. */
const MATCH_BATTERY_CONTENT_PATCH: Record<number, string> = {
  10: "Anyone",
  14: "Cardtype description body",
  19: "User description body",
  29: "Cardtype type rule body",
};

async function seedMatchBatteryDeck(storage: CqlTestStorage): Promise<void> {
  const insert =
    "INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, " +
    "created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, " +
    "references_expired, trash, type_id, db_content) " +
    "VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)";
  for (const card of [...MATCH_BATTERY_DECK].sort((a, b) => a.id - b.id)) {
    const compound = card.name !== undefined && card.name.includes("+");
    if (compound && (card.leftId === undefined || card.rightId === undefined)) {
      throw new Error(`compound seed ${card.id} needs leftId and rightId`);
    }
    await storage.driver.query(insert, [
      card.id,
      compound ? null : (card.name ?? null),
      compound || card.name === undefined ? null : DeckoName.parse(card.name).key,
      card.codename ?? null,
      compound ? card.leftId! : null,
      compound ? card.rightId! : null,
      "2026-10-10 00:00:00.000",
      "2026-10-10 00:00:00.000",
      card.typeId ?? 2,
      card.dbContent ?? null,
    ]);
  }
  for (const [id, content] of Object.entries(MATCH_BATTERY_CONTENT_PATCH)) {
    await storage.driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      content,
      Number(id),
    ]);
  }
}

/** The one match-battery entry the battery cannot compare: raw_posix_alpha
 *  differs because the MODELED capture deck composes capture row 29 as
 *  "Cardtype+*type" while Ruby composed "Cardtype+*type+*structure" - a
 *  deck-model row-composition item, disclosed (not swept aside) in
 *  tests/cql/oracle-match-replay.test.ts's KNOWN_DIVERGENCES note. It is
 *  asserted HERE as exactly that entry, so a NEW divergence fails loudly
 *  and this one can never hide behind a widened skip list. */
const MATCH_BATTERY_KNOWN_DIVERGENCE = "raw_posix_alpha";

function readBattery(file: string): Record<string, CapturedQuery> {
  const parsed = JSON.parse(readFileSync(join(REPO_ROOT, "fixtures", "captured", file), "utf8")) as {
    queries: Record<string, CapturedQuery>;
  };
  return parsed.queries;
}

describe("search-cql: the committed batteries replay through src/cql", () => {
  it('"CQL batteries (committed): `fixtures/captured/cql-basic.json` (11 canonical query shapes) and `fixtures/captured/cql-mysql-match.json` (the `match` battery, 30 queries)" — every cql-basic entry with a captured answer replays to that exact name set (10 of 11; the 11th is the capture-failed `match` sentinel, pinned so a re-capture upgrades it)', async () => {
    const fixture = readBattery("cql-basic.json");
    const names = Object.keys(fixture);
    expect(names).toHaveLength(11);

    const storage = await createCqlTestStorage();
    try {
      await seedOracleCaptureDeck(storage);
      await warmDeckLexicon(storage);
      const parse = parseOptionsWithLexicon(storage.fetcher.lexicon);

      const compared: string[] = [];
      const failures: string[] = [];
      for (const [name, captured] of Object.entries(fixture)) {
        if (!Array.isArray(captured.result)) {
          // No captured answer exists for this shape BY CAPTURE (Ruby
          // raises; SQLite has no REGEXP). Pin the sentinel, then run the
          // query through the engine's REGEXP UDF so the shape is still
          // exercised rather than skipped.
          expect(`${name}: ${String(captured.result)}`).toContain("CAPTURE_ERROR");
          const executed = await executeQuery(storage.fetcher.driver, captured.query, { parse });
          if ("count" in executed) throw new Error(`${name}: unexpected count result`);
          expect((await resultNames(storage.fetcher.lexicon, executed.rows)).length).toBeGreaterThan(0);
          continue;
        }
        const result = await executeQuery(storage.fetcher.driver, captured.query, { parse });
        if ("count" in result) throw new Error(`${name}: unexpected count result`);
        const got = await resultNames(storage.fetcher.lexicon, result.rows);
        const want = [...captured.result].sort();
        if (got.length !== want.length || got.some((n, i) => n !== want[i])) {
          failures.push(`${name}: ruby=${JSON.stringify(want)} ts=${JSON.stringify(got)}`);
        }
        compared.push(name);
      }
      expect(failures).toEqual([]);
      expect(compared).toHaveLength(10);
    } finally {
      storage.close();
    }
  }, 60_000);

  it('"CQL batteries (committed): `fixtures/captured/cql-basic.json` (11 canonical query shapes) and `fixtures/captured/cql-mysql-match.json` (the `match` battery, 30 queries)" — 30 of the 31 match-battery entries replay to their captured name sets, and the 31st is the one named row-composition divergence, asserted as itself', async () => {
    const fixture = readBattery("cql-mysql-match.json");
    const entries = Object.entries(fixture);
    expect(entries).toHaveLength(31);

    const storage = await createCqlTestStorage();
    try {
      await seedOracleCaptureDeck(storage);
      await seedMatchBatteryDeck(storage);
      await warmDeckLexicon(storage);
      const parse = parseOptionsWithLexicon(storage.fetcher.lexicon);

      const failures: string[] = [];
      const diverged: string[] = [];
      let compared = 0;
      for (const [name, captured] of entries) {
        if (!Array.isArray(captured.result)) {
          failures.push(`${name}: non-array captured result (unexpected on the MySQL rung)`);
          continue;
        }
        const want = [...captured.result].sort();
        let got: string[];
        try {
          const result = await executeQuery(storage.fetcher.driver, captured.query, { parse });
          if ("count" in result) throw new Error(`${name}: unexpected count result`);
          got = await resultNames(storage.fetcher.lexicon, result.rows);
        } catch (e) {
          got = [`EXECUTE_ERROR: ${(e as Error).message}`];
        }
        if (got.length === want.length && got.every((n, i) => n === want[i])) {
          compared += 1;
          continue;
        }
        if (name === MATCH_BATTERY_KNOWN_DIVERGENCE) {
          diverged.push(name);
          continue;
        }
        failures.push(`${name}: ruby=${JSON.stringify(want)} ts=${JSON.stringify(got)}`);
      }
      // The divergence is NAMED and singular: any second one fails here.
      expect(diverged).toEqual([MATCH_BATTERY_KNOWN_DIVERGENCE]);
      expect(failures).toEqual([]);
      // 31 captured entries, 1 named divergence, 30 compared.
      expect(compared).toBe(30);
    } finally {
      storage.close();
    }
  }, 60_000);
});

// ===========================================================================
// Claim 3 - recovery/release/public/ISSUE-1282-FINAL-PROVISIONAL.md:50
// site mods run as they do on Ruby: the port serves the deck with its own
// mods in place
// ===========================================================================

/** A site mod written for this file: two views of its own, on one
 *  set-scoped set path (a TYPE set, so the views belong to the cards of
 *  that type and to nothing else - the per-card MRO dispatch is what
 *  decides). Bodies are literal invented text. */
const SITE_MOD: DeckoModManifest = {
  name: "exercise_site_mod",
  gemName: "card-mod-exercise_site_mod",
  group: "gem",
  setModules: [
    {
      setPath: "type/beacon_skin",
      formats: {
        html: {
          views: [
            {
              view: "beacon_summary",
              viewFn: (() => '<div class="beacon-summary">SITE MOD SUMMARY</div>') as ViewFn,
            },
            {
              view: "beacon_footnote",
              viewFn: (() => '<div class="beacon-footnote">SITE MOD FOOTNOTE</div>') as ViewFn,
            },
          ],
        },
      },
    },
  ],
};

const SITE_MOD_VIEWS = ["beacon_summary", "beacon_footnote"] as const;

/** The fallback the engine reaches when the per-card chain misses: a base
 *  record entry, seeded into the shared view table before the deck is
 *  mounted. Distinct bytes, so "the mod's own view rather than the
 *  fallback" is decidable. */
const FALLBACK_BYTES: Record<(typeof SITE_MOD_VIEWS)[number], string> = {
  beacon_summary: '<div class="base-fallback">BASE FALLBACK SUMMARY</div>',
  beacon_footnote: '<div class="base-fallback">BASE FALLBACK FOOTNOTE</div>',
};

const SITE_MOD_BYTES: Record<(typeof SITE_MOD_VIEWS)[number], string> = {
  beacon_summary: '<div class="beacon-summary">SITE MOD SUMMARY</div>',
  beacon_footnote: '<div class="beacon-footnote">SITE MOD FOOTNOTE</div>',
};

let siteModStorage: RenderTestStorage | undefined;
/** A second engine over an IDENTICAL deck that no mod deck is ever bound
 *  to. It answers the "before the mount" half from a clean state in every
 *  test, instead of depending on which test mounted first (the engine
 *  memoizes its view dispatch per mod-loader generation, so a bound engine
 *  asked to render unmounted would hand back its own cached answer). */
let unmountedStorage: RenderTestStorage | undefined;
let siteModLoader: ModLoader | undefined;

async function seedSiteModDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  // The mod's set anchor: the cardtype card the TYPE token resolves to.
  await seedCard(s, { id: 500, name: "*beacon_skin", codename: "beacon_skin", typeId: 13 });
  await seedCard(s, { id: 600, name: "Beacon Marker", typeId: 500, dbContent: "beacon body" });
  await seedCard(s, { id: 601, name: "Plain Marker", dbContent: "plain body" });
}

beforeAll(async () => {
  // The fallbacks first: with no deck bound the engine dispatches the
  // shared record (render.ts:2321 `this.views[view]`).
  for (const view of SITE_MOD_VIEWS) {
    HTML_VIEWS[view] = (() => FALLBACK_BYTES[view]) as ViewFn;
  }
  siteModStorage = await createRenderTestStorage();
  await seedSiteModDeck(siteModStorage);
  unmountedStorage = await createRenderTestStorage();
  await seedSiteModDeck(unmountedStorage);
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  siteModLoader?.reset();
  for (const view of SITE_MOD_VIEWS) delete HTML_VIEWS[view];
  siteModStorage?.close();
  unmountedStorage?.close();
});

/** Mount the site mod the way the deck boot mounts the site's own mods
 *  (src/card/mod-loader/default-mod-deck.ts#defaultDeckLoader: build the
 *  ModLoader over the sources, load, then bind the engine and the
 *  process-wide default). */
async function mountSiteMod(): Promise<ModLoader> {
  if (siteModLoader !== undefined) return siteModLoader;
  const loader = new ModLoader([{ manifest: SITE_MOD }]);
  loader.load();
  bindModLoaderToEngine(siteModStorage, loader);
  await loader.installInto(modEngineHost(siteModStorage!.engine, siteModStorage!.fetcher));
  siteModLoader = loader;
  return loader;
}

describe("mods: the port serves the deck with its own site mods in place", () => {
  it('"Site mods run as they do on Ruby: the port serves the production deck with its own mods in place" — :beacon_summary dispatches to the mounted site mod\'s own view for the card in the mod\'s set, not to the fallback the same card and view got with no mod deck mounted', async () => {
    const s = siteModStorage!;
    // No mod deck mounted: the shared base record answers.
    const before = await unmountedStorage!.engine.render("Beacon Marker", "beacon_summary");
    expect(before).toBe(FALLBACK_BYTES.beacon_summary);

    await mountSiteMod();
    const after = await s.engine.render("Beacon Marker", "beacon_summary");
    expect(after).toBe(SITE_MOD_BYTES.beacon_summary);
    expect(after).not.toContain("BASE FALLBACK");
  });

  it('"Site mods run as they do on Ruby: the port serves the production deck with its own mods in place" — :beacon_footnote, the mod\'s second view, dispatches to the mod\'s own view for the same card and never reaches the fallback', async () => {
    const s = siteModStorage!;
    const before = await unmountedStorage!.engine.render("Beacon Marker", "beacon_footnote");
    expect(before).toBe(FALLBACK_BYTES.beacon_footnote);

    await mountSiteMod();
    const after = await s.engine.render("Beacon Marker", "beacon_footnote");
    expect(after).toBe(SITE_MOD_BYTES.beacon_footnote);
    expect(after).not.toContain("BASE FALLBACK");
  });

  it('"Site mods run as they do on Ruby: the port serves the production deck with its own mods in place" — the walk that decides is per-card: the chain for the card in the mod\'s set names the mod\'s set module first, the card outside the set gets no chain entry at all', async () => {
    const s = siteModStorage!;
    const loader = await mountSiteMod();

    const inSet = safeSetKeysForCard(await deckPatternInput(s, "Beacon Marker"));
    const outOfSet = safeSetKeysForCard(await deckPatternInput(s, "Plain Marker"));
    expect(loader.viewChain(inSet, "beacon_summary").map((e) => e.setModule)[0]).toBe(
      "Type::BeaconSkin",
    );
    expect(loader.viewChain(outOfSet, "beacon_summary")).toEqual([]);

    // The out-of-set card has no chain entry, so with the deck bound the
    // dispatch falls to the base table - which carries no such view, and
    // the render says so instead of borrowing the mod's.
    await expect(s.engine.render("Plain Marker", "beacon_summary")).rejects.toThrow(
      UnsupportedViewError,
    );
  });
});

// ===========================================================================
// Claim 4 - docs/coverage-inventory.md:118-123
// arbitrary mods: a hand-ported Ruby mod view beyond the byte-pinned
// handful is unproven against Ruby's bytes
// ===========================================================================

/** card-mod-follow's :follow_status - set/right/follow.rb:58-60. Chosen
 *  because no committed capture fixture names it (asserted below), so it
 *  is one of the views the coverage inventory calls unproven against
 *  Ruby's bytes. */
const UNPINNED_VIEW = "follow_status";

let unprovenStorage: RenderTestStorage | undefined;
let unprovenLoader: ModLoader | undefined;

beforeAll(async () => {
  const s = await createRenderTestStorage();
  // Codename / pattern anchors the follow rule walk needs.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 114, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 115, name: "*edited", codename: "edited", typeId: 14 });
  await seedCard(s, { id: 120, name: "following", codename: "following", typeId: 14 });
  await seedCard(s, { id: 130, name: "followers", codename: "followers", typeId: 14 });
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 300, name: "Rae Nomad", typeId: 3 });
  // The followed card and the follow RULE card carrying it.
  await seedCard(s, { id: 200, name: "Lantern Notes", dbContent: "lantern body" });
  await seedCard(s, { id: 210, name: "Lantern Notes+*self", leftId: 200, rightId: 11, typeId: 13 });
  await seedCard(s, {
    id: 215, name: "Lantern Notes+*self+Rae Nomad", leftId: 210, rightId: 300, typeId: 14,
  });
  await seedCard(s, {
    id: 220,
    name: "Lantern Notes+*self+Rae Nomad+*follow",
    leftId: 215,
    rightId: 110,
    typeId: 14,
    dbContent: "*always",
  });
  unprovenStorage = s;
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  unprovenLoader?.reset();
  unprovenStorage?.close();
});

describe("mods: a hand-ported Ruby mod view beyond the byte-pins", () => {
  it('"Existing Ruby mods are not executed — the site\'s own mods are hand-ported, and the compatibility report\'s labels are declaration-level ... A mod view beyond the handful the byte-pins render is unproven against Rub\'s bytes." — :follow_status is named by no committed capture fixture, so there is no Ruby expectation for its bytes and the only public assertion is that the mod loads and renders', async () => {
    const s = unprovenStorage!;

    // The premise, checked rather than asserted: walk the committed
    // capture trees - the Ruby capture fixtures and the reference
    // harness's committed Ruby renders - and count how many mention this
    // view at all.
    const mentions: string[] = [];
    for (const root of ["fixtures/captured", "reference-harness/fixtures"]) {
      (function walk(dir: string): void {
        for (const entry of readdirSync(dir)) {
          const path = join(dir, entry);
          if (statSync(path).isDirectory()) walk(path);
          else if (readFileSync(path, "utf8").includes(UNPINNED_VIEW)) mentions.push(path);
        }
      })(join(REPO_ROOT, root));
    }
    expect(mentions).toEqual([]);

    // With no deck mounted the view does not exist at all - Ruby mods are
    // not executed, the port's own mods supply the view.
    await expect(
      s.engine.render("Lantern Notes+*self+Rae Nomad+*follow", UNPINNED_VIEW),
    ).rejects.toThrow(UnsupportedViewError);

    // Mount the ported deck - every hand-ported Ruby mod, in the captured
    // bundle order (default-mod-deck.ts#defaultDeckSources).
    unprovenLoader = new ModLoader(defaultDeckSources());
    unprovenLoader.load();
    bindModLoaderToEngine(s, unprovenLoader);
    await unprovenLoader.installInto(modEngineHost(s.engine, s.fetcher));

    // The claim this file can actually make: the mod loads and renders.
    const html = await s.engine.render("Lantern Notes+*self+Rae Nomad+*follow", UNPINNED_VIEW);
    expect(html).toContain("Get notified about changes");
    expect(html).toContain("Lantern Notes");
    expect(html.length).toBeGreaterThan(0);
  }, 60_000);
});