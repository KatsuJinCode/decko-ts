// benchmarks/one-trip-render/fact-probe-render-touch.ts
// WHAT THIS IS: the empirical fact probe for the one-trip implementation lane.
// It answers three questions against the LOCAL read-only copy of the trial
// deck before any builder code is written:
//
// 1. EDGE AGREEMENT: do the include edges the REAL parser derives from card
//    content (nest-syntax.ts referencedNames, absolutized against the
//    composed card name — exactly driveClosure's collectFromRecords
//    semantics) agree with the stored card_references rows (ref_type 'I')?
//    Decides whether the closure builder can consume card_references
//    directly (the research verdict's shape) or needs its own parse.
// 2. TOUCHED-ROW CENSUS: for the 5 probe pages (Home, Aikido, About, Eagle,
//    Taking_Stock), the union of every cards-row id the current render
//    actually READS (every result row of every statement that returns card
//    rows) plus the round-trip count — the baseline the closure must
//    superstate and the byte-identity render must match.
// 3. SEARCH + RULE CENSUS: which statements are searches (CQL) and which
//    are rule lookups, so the residue classes are named from data, not
//    guesswork.
//
// READ-ONLY: runs against benchmarks/one-trip-render/
// trial-deck-mirror-readonly-copy.sqlite3 (built once from the db-roundtrip
// worktree's mirror via the backup API; the original is never opened
// writable). No credential is printed.
//
// Run (bundled like the other cold-render probes):
//   npx esbuild --bundle --format=esm --platform=node --target=node20 \
//     "--external:node:*" --external:better-sqlite3 --external:sass --external:coffeescript \
//     --outfile=benchmarks/one-trip-render/fact-probe-render-touch.mjs \
//     benchmarks/one-trip-render/fact-probe-render-touch.ts
//   node benchmarks/one-trip-render/fact-probe-render-touch.mjs \
//     --out benchmarks/one-trip-render/fact-probe-report.json

import { writeFileSync } from "node:fs";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../src/server/driver.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { DeckoName } from "../../src/card/name.js";
import { referencedNames } from "../../src/card/render/nest-syntax.js";

const PROBE_PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"];
const DEFAULT_DB = "benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------------------
// Statement capture proxy (same shape as the db-roundtrip lane's instrument)
// ---------------------------------------------------------------------------

interface CapturedStatement {
  kind: "query" | "batch";
  sql: string;
  params: unknown[];
  rowCount: number;
  /** ids of rows that look like cards rows (have a numeric `id` plus at
   *  least one other cards column) — the render's true read set. */
  cardIds: number[];
}

/** A row "looks like a cards row" when it carries an integer id plus a
 *  cards-shaped column (key/type_id/db_content/trash/left_id). This reads
 *  card rows from every shape that returns them — point reads, closure
 *  walks (aliased c/j/l/r/s/t), search chunked reads, rule rows — without
 *  classifying SQL text. */
function cardIdsFromRows(rows: unknown[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row as Record<string, unknown>;
    const id = rec["id"];
    if (typeof id !== "number" || !Number.isSafeInteger(id)) continue;
    const cardish =
      "key" in rec || "type_id" in rec || "db_content" in rec || "trash" in rec || "left_id" in rec;
    if (cardish) ids.push(id);
  }
  return ids;
}

class CapturingDriver implements SQLDatabaseDriver {
  readonly captured: CapturedStatement[] = [];
  /** Round trips: one driver.query call OR one driver.batch call each. */
  trips = 0;
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.trips += 1;
    const result = await this.inner.query<T>(sql, params);
    this.captured.push({
      kind: "query",
      sql,
      params,
      rowCount: result.rows.length,
      cardIds: cardIdsFromRows(result.rows as unknown[]),
    });
    return result;
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    this.trips += 1;
    const results = await this.inner.batch(statements);
    results.forEach((result, i) => {
      const stmt = statements[i] as { sql: string; params?: unknown[] };
      this.captured.push({
        kind: "batch",
        sql: stmt?.sql ?? "",
        params: stmt?.params ?? [],
        rowCount: result.rows.length,
        cardIds: cardIdsFromRows(result.rows as unknown[]),
      });
    });
    return results;
  }
}

// ---------------------------------------------------------------------------
// Whole-deck name composition (the builder's foundation, exercised here)
// ---------------------------------------------------------------------------

interface DeckCard {
  id: number;
  name: string | null;
  key: string | null;
  leftId: number | null;
  rightId: number | null;
  typeId: number;
  dbContent: string | null;
  trash: number;
}

async function main(): Promise<void> {
  const dbPath = arg("db", DEFAULT_DB);
  const base = new LocalSqliteDriver({ path: dbPath, readonly: true });

  // --- deck load -----------------------------------------------------------
  const cardsResult = await base.query(
    `SELECT id, name, "key", left_id, right_id, type_id, db_content, trash
       FROM cards WHERE trash = 0`,
    [],
  );
  const byId = new Map<number, DeckCard>();
  for (const row of cardsResult.rows as unknown as Record<string, unknown>[]) {
    byId.set(row["id"] as number, {
      id: row["id"] as number,
      name: (row["name"] as string | null) ?? null,
      key: (row["key"] as string | null) ?? null,
      leftId: (row["left_id"] as number | null) ?? null,
      rightId: (row["right_id"] as number | null) ?? null,
      typeId: (row["type_id"] as number) ?? 0,
      dbContent: (row["db_content"] as string | null) ?? null,
      trash: 0,
    });
  }

  // Composed names: simple cards parse their name column; junctions compose
  // from sides (multi-pass, sides first — the same algebra prefetch.ts uses).
  const names = new Map<number, string>();
  {
    let pending = [...byId.values()];
    for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
      const still: DeckCard[] = [];
      for (const card of pending) {
        if (card.name !== null) {
          names.set(card.id, card.name);
          continue;
        }
        if (card.leftId === null || card.rightId === null) continue;
        const left = names.get(card.leftId);
        const right = names.get(card.rightId);
        if (left === undefined || right === undefined) {
          still.push(card);
          continue;
        }
        names.set(card.id, `${left}+${right}`);
      }
      if (still.length === pending.length) break;
      pending = still;
    }
  }
  const keyToId = new Map<string, number>();
  for (const [id, name] of names) {
    try {
      keyToId.set(DeckoName.parse(name).key, id);
    } catch {
      // unparseable name (codename mark without the registry): skip; the
      // agreement probe still counts the row as present-by-name
    }
  }

  // --- 1. edge agreement: real-parser edges vs card_references -------------
  const parsedEdges = new Map<string, { refererId: number; refereeKey: string; refereeId?: number }>();
  let parseFailures = 0;
  for (const card of byId.values()) {
    const content = card.dbContent;
    if (content === null || content === "") continue;
    const selfName = names.get(card.id);
    for (const ref of referencedNames(content)) {
      if (ref.relative) continue; // driveClosure skips these too
      let absolute: string;
      try {
        const parsed = DeckoName.parse(ref.name);
        absolute = selfName !== undefined ? parsed.absoluteName(DeckoName.parse(selfName)).s : parsed.s;
      } catch {
        parseFailures += 1;
        continue;
      }
      let key: string;
      try {
        key = DeckoName.parse(absolute).key;
      } catch {
        parseFailures += 1;
        continue;
      }
      if (key === "") continue;
      const refereeId = keyToId.get(key);
      parsedEdges.set(`${card.id}->${key}`, { refererId: card.id, refereeKey: key, refereeId });
    }
  }

  const refsResult = await base.query(
    `SELECT referer_id, referee_key, referee_id, ref_type FROM card_references`,
    [],
  );
  const refRows = refsResult.rows as unknown as Record<string, unknown>[];
  const inclusionRows = refRows.filter((r) => r["ref_type"] === "I");
  const refEdgeSet = new Set(
    inclusionRows.map((r) => `${r["referer_id"]}->${r["referee_key"] as string}`),
  );
  const parseEdgeSet = new Set(parsedEdges.keys());
  const parseNotStored = [...parseEdgeSet].filter((e) => !refEdgeSet.has(e));
  const storedNotParsed = [...refEdgeSet].filter((e) => !parseEdgeSet.has(e));

  // --- 2. touched-row census on the probe pages -----------------------------
  const pageReports: Record<
    string,
    {
      trips: number;
      statements: number;
      touchedCardIds: number[];
      touchedCount: number;
      searchStatements: number;
      htmlBytes: number;
      outcome: string;
    }
  > = {};

  for (const name of PROBE_PAGES) {
    const capture = new CapturingDriver(base);
    const fetcher = new FetchEngine(capture);
    await fetcher.codenames.ensureLoaded();
    fetcher.installNameEnvironment();
    const render = new RenderEngine(fetcher);
    let outcome = "ok";
    let htmlBytes = 0;
    try {
      const html = await render.render(name, "open", {});
      htmlBytes = html.length;
    } catch (err) {
      outcome = `${(err as Error)?.name ?? "Error"}: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
    }
    const touched = new Set<number>();
    let searchStatements = 0;
    for (const stmt of capture.captured) {
      for (const id of stmt.cardIds) touched.add(id);
      if (stmt.sql.includes("json_group_array") || stmt.sql.includes("search_type")) {
        searchStatements += 1;
      }
    }
    pageReports[name] = {
      trips: capture.trips,
      statements: capture.captured.length,
      touchedCardIds: [...touched].sort((a, b) => a - b),
      touchedCount: touched.size,
      searchStatements,
      htmlBytes,
      outcome,
    };
  }

  const report = {
    deck: {
      live_cards: byId.size,
      composed_names: names.size,
      card_references_rows: refRows.length,
      inclusion_rows: inclusionRows.length,
    },
    edge_agreement: {
      parsed_edges: parseEdgeSet.size,
      parse_failures: parseFailures,
      parsed_not_stored: parseNotStored.length,
      parsed_not_stored_sample: parseNotStored.slice(0, 10),
      stored_not_parsed: storedNotParsed.length,
      stored_not_parsed_sample: storedNotParsed.slice(0, 10),
    },
    probe_pages: pageReports,
  };
  writeFileSync(arg("out", "benchmarks/one-trip-render/fact-probe-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    deck: report.deck,
    edge_agreement: {
      parsed_edges: report.edge_agreement.parsed_edges,
      parsed_not_stored: report.edge_agreement.parsed_not_stored,
      stored_not_parsed: report.edge_agreement.stored_not_parsed,
    },
    pages: Object.fromEntries(
      Object.entries(pageReports).map(([name, r]) => [
        name,
        { trips: r.trips, touched: r.touchedCount, html: r.htmlBytes, outcome: r.outcome },
      ]),
    ),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
