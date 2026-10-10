// Round-trip attribution for the deep-nesting fixtures: for every cold render
// of every renderable fixture, each database round trip is recorded with the
// engine call site that issued it, its statement count and the first words of
// its SQL. The trips are then grouped into named causes, so a published trip
// count can be read as "this many fixed trips for these reasons, plus one per
// nesting level".
//
// Run:
//   npx vitest run tests/card/render/deep-nesting-trip-attribution.test.ts
// With DECKO_BENCH_RUN_DIR=<dir> set, the result is also written to
// <dir>/deep-nesting-ts-<commit>-<UTC time>.json, once: an existing file is
// never overwritten.
//
// The causes are recognised from the call site and the SQL. A trip that no
// cause recognises fails the test, so an unexplained trip cannot be
// published.

import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { cpus, platform } from "node:os";
import { describe, expect, it } from "vitest";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { createRenderTestStorage, type RenderTestStorage } from "./render-test-storage.js";
import {
  DEEP_RENDERABLE_CHAIN_DEPTHS,
  FANOUTS,
  PARITY_CHAIN_DEPTHS,
  TREES,
  chainName,
  fanRootName,
  seedChain,
  seedFan,
  seedTree,
  treeCards,
  treeRootName,
} from "./deep-nesting-fixtures.js";

interface Trip {
  kind: "query" | "batch";
  statements: number;
  sql: string[];
  site: string[];
}

/** Records every driver call with the engine frames that led to it. */
class TracingDriver implements SQLDatabaseDriver {
  trips: Trip[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}

  private site(): string[] {
    const frames = (new Error().stack ?? "").split("\n").slice(1);
    const out: string[] = [];
    for (const f of frames) {
      const m = f.match(/at (?:async )?(\S+)? ?\(?(?:.*[\\/])?(src[\\/][^:)]+):(\d+)/);
      if (m === null) continue;
      const file = m[2]!.replace(/\\/g, "/");
      if (file.startsWith("src/server/drivers/")) continue;
      out.push(`${m[1] ?? "<anonymous>"} ${file}:${m[3]}`);
      if (out.length === 4) break;
    }
    return out;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.trips.push({ kind: "query", statements: 1, sql: [head(sql)], site: this.site() });
    return this.inner.query<T>(sql, params);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    this.trips.push({ kind: "batch", statements: statements.length, sql: statements.map((s) => head(s.sql)), site: this.site() });
    return this.inner.batch(statements);
  }
}

/** The statement's SQL with runs of whitespace collapsed. Fixture names travel
 *  as parameters, never in the SQL text. */
function head(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

interface Shape {
  label: string;
  shape: "chain" | "fan" | "tree";
  root: string;
  cards: number;
  levels: number;
  seed: (s: RenderTestStorage) => Promise<void>;
}

const SHAPES: Shape[] = [
  ...[...PARITY_CHAIN_DEPTHS, ...DEEP_RENDERABLE_CHAIN_DEPTHS]
    .sort((a, b) => a - b)
    .map((d) => ({ label: `chain d${d}`, shape: "chain" as const, root: chainName(d, 1), cards: d, levels: d, seed: (s: RenderTestStorage) => seedChain(s, d) })),
  ...FANOUTS.map((f) => ({ label: `fan f${f}`, shape: "fan" as const, root: fanRootName(f), cards: f + 1, levels: 2, seed: (s: RenderTestStorage) => seedFan(s, f) })),
  ...TREES.map(({ depth, fanout }) => ({
    label: `tree d${depth}xf${fanout}`,
    shape: "tree" as const,
    root: treeRootName(depth, fanout),
    cards: treeCards(depth, fanout),
    levels: depth + 1,
    seed: (s: RenderTestStorage) => seedTree(s, depth, fanout),
  })),
];

async function trace(shape: Shape): Promise<{ trips: Trip[]; htmlBytes: number }> {
  const storage = await createRenderTestStorage();
  try {
    await shape.seed(storage);
    // A fresh engine over the same database, so the render is cold exactly as
    // the sweep's first render is, and every trip passes the tracer.
    const tracer = new TracingDriver(storage.counting);
    const engine = new RenderEngine(new FetchEngine(tracer));
    const html = await engine.render(shape.root, "open");
    return { trips: tracer.trips, htmlBytes: html.length };
  } finally {
    storage.close();
  }
}

/** The named causes, recognised by the engine function that issued the trip. */
const CAUSES = [
  {
    id: "root",
    what: "the requested card, fetched by name",
    match: (t: Trip) => t.kind === "query" && t.site.some((s) => s.startsWith("FetchEngine.fetchWithOptions")),
  },
  {
    id: "prelude",
    what: "one batch of 13 fixed lookups before the walk: the root row by id, the codename table, the permission parties and read rules, two rule-closure walks, the deck's type list, a few named cards, and the deck_data_version freshness stamp",
    match: (t: Trip) => t.kind === "batch" && t.site.some((s) => s.startsWith("prefetchInclusionClosure")) && !t.site.some((s) => s.startsWith("driveClosure")),
  },
  {
    id: "closure",
    what: "one batch per further level of nesting: every card the previous level nests, fetched together",
    match: (t: Trip) => t.kind === "batch" && t.site.some((s) => s.startsWith("driveClosure")),
  },
  {
    id: "wave",
    what: "the derived-state prime before rendering: the types of the cards in hand and the rule cards that could govern them, by name, in waves (a compound rule name is looked up once the wave before has found its parts)",
    match: (t: Trip) => t.kind === "batch" && t.site.some((s) => s.startsWith("RenderEngine.seatNamesByWave")),
  },
] as const;

function causeOf(t: Trip): string | null {
  return CAUSES.find((c) => c.match(t))?.id ?? null;
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
  } catch {
    return "unknown";
  }
}

describe("deep-nesting round-trip attribution", () => {
  it("names the cause of every cold round trip", { timeout: 300_000 }, async () => {
    const rows = [];
    for (const shape of SHAPES) {
      const { trips, htmlBytes } = await trace(shape);
      const nestLevels = shape.levels - 1;
      const byCause: Record<string, { trips: number; statements: number }> = {};
      const unexplained: Trip[] = [];
      for (const t of trips) {
        const c = causeOf(t);
        if (c === null) unexplained.push(t);
        const k = c ?? "unexplained";
        byCause[k] = { trips: (byCause[k]?.trips ?? 0) + 1, statements: (byCause[k]?.statements ?? 0) + t.statements };
      }
      expect(unexplained, `${shape.label}: trips with no named cause`).toEqual([]);
      // The law the attribution supports: fixed root + prelude + two waves,
      // plus one closure batch per level of nesting below the root.
      expect(byCause.root?.trips ?? 0).toBe(1);
      expect(byCause.prelude?.trips ?? 0).toBe(1);
      expect(byCause.closure?.trips ?? 0).toBe(nestLevels);
      expect(byCause.wave?.trips ?? 0).toBe(2);
      rows.push({
        fixture: shape.label,
        shape: shape.shape,
        root: shape.root,
        cards: shape.cards,
        nest_levels_below_root: nestLevels,
        round_trips: trips.length,
        statements: trips.reduce((s, t) => s + t.statements, 0),
        html_chars: htmlBytes,
        by_cause: byCause,
        trips: trips.map((t) => ({ cause: causeOf(t), kind: t.kind, statements: t.statements, sites: t.site.map((s) => s.replace(/:\d+$/, "")), sql: t.sql })),
      });
    }

    const commit = git(["rev-parse", "HEAD"]);
    const result = {
      schema: "decko-deep-nesting-attribution/1",
      generated_at: new Date().toISOString(),
      engine_commit: commit,
      engine_tree_dirty: git(["status", "--porcelain", "--untracked-files=no"]).length > 0,
      node: process.version,
      platform: platform(),
      cpu: cpus()[0]?.model ?? null,
      definitions: {
        round_trip: "one call to the database driver: a query, or a batch of statements sent together (one HTTP request on the edge drivers)",
        statement: "one SQL statement; a batch of n statements counts n",
        cold: "the first render of the root card by a new engine over a database holding only the fixture and its type card",
        database: "better-sqlite3 in memory, schema db/schema.sqlite.sql",
        nest_levels_below_root: "chain of n cards: n - 1; fan: 1; tree of depth d: d",
      },
      causes: CAUSES.map((c) => ({ id: c.id, what: c.what })),
      law: "round trips = 1 root + 1 prelude + 1 closure batch per nest level below the root + 2 wave = 4 + nest levels below the root",
      rows,
    };

    const outDir = process.env.DECKO_BENCH_RUN_DIR;
    if (outDir !== undefined && outDir !== "") {
      mkdirSync(outDir, { recursive: true });
      const stamp = result.generated_at.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
      const path = join(outDir, `deep-nesting-ts-${commit.slice(0, 8)}-${stamp}.json`);
      const fd = openSync(path, "wx"); // never overwrite a recorded run
      try {
        writeSync(fd, JSON.stringify(result, null, 2) + "\n");
      } finally {
        closeSync(fd);
      }
      // eslint-disable-next-line no-console
      console.log(`wrote ${path}`);
    }
    // eslint-disable-next-line no-console
    console.log(rows.map((r) => `${r.fixture.padEnd(14)} ${String(r.round_trips).padStart(3)} trips  ${JSON.stringify(r.by_cause)}`).join("\n"));
  });

  it("a warm render of the same card costs the freshness stamp alone", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedChain(storage, 4);
      const tracer = new TracingDriver(storage.counting);
      const engine = new RenderEngine(new FetchEngine(tracer));
      await engine.render(chainName(4, 1), "open");
      tracer.trips = [];
      await engine.render(chainName(4, 1), "open");
      expect(tracer.trips.map((t) => [t.kind, t.statements, /deck_data_version/.test(t.sql.join(" "))])).toEqual([["query", 1, true]]);
    } finally {
      storage.close();
    }
  });
});
