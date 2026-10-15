// Depth sweep: the cold-render round-trip law measured over every SHAPE the
// promise covers - chains, fans and whole inclusion trees - at every depth 1
// through 20 and at widths a deck actually carries, in both index postures.
//
// The law (round-trip-law.ts): a cold render costs THREE round trips whatever
// the deck nests, because the prelude's recursive walk of the stored nest
// index (src/card/render/prefetch.ts) brings the whole closure in the
// PRELUDE batch and the closure rounds are answered from it. Content the index
// does not describe costs one round trip per level below the root; the
// engines therefore build the index themselves (src/card/nest-index.ts) and
// this sweep measures what a deck costs AFTER that build, from content alone
// and from content plus a hand-seeded index, and pins that the two postures
// and the un-indexed (walked) render are the same bytes.
//
// Ceiling aligned to the renderer's RUBY_MAX_DEPTH=20 - Card.config.max_depth,
// railtie.rb:17; the sweep once ran 1..42 before the renderer's old 42 guard
// was aligned to the vendored prototype. Depths past 20 raise the too-deep
// guard.
//
// Run via: npx vitest run tests/card/render/depth-sweep.test.ts
//
// Reported numbers populate a JSON results file (not in the public package).
// That write is OPT-IN via DEPTH_SWEEP_WRITE_ARTIFACT=1: the committed
// receipt is authoritative (docs/parity-method.md), and an unconditional
// rewrite put a fresh measured_at + wall-ms into the tree on every suite
// run, dirtying it and forcing housekeeping commits. The assertions below
// run on every execution; only the receipt refresh is gated.

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import { RUBY_MAX_DEPTH } from "../../../src/card/render/format.js";
import { INDEXED_COLD_ROUND_TRIPS, coldRoundTripLaw } from "./round-trip-law.js";
import { ensureNestIndex } from "../../../src/card/nest-index.js";
import {
  chainName,
  fanChildName,
  fanRootName,
  filler,
  seedFan,
  seedTree,
  treeCards,
  treeNodeName,
  treeRootName,
} from "./deep-nesting-fixtures.js";

// Receipt refresh is opt-in (see header): the depth-sweep assertions below
// run on every execution; the TS results file is rewritten
// only when DEPTH_SWEEP_WRITE_ARTIFACT=1.
const ARTIFACT_WRITE_REQUESTED = process.env.DEPTH_SWEEP_WRITE_ARTIFACT === "1";

const DEPTHS = Array.from({ length: RUBY_MAX_DEPTH }, (_, i) => i + 1);
// Ruby depth+3 truth, measured on the oracle app by the R1/R2 Ruby nesting
// benchmark (its results file is not shipped in this repository).
const RUBY_MEASURED: Record<number, number> = { 1: 4, 2: 5, 4: 7, 8: 11, 16: 19 };
// THE LAW (round-trip-law.ts). With the stored nest index a cold render costs
// the three fixed round trips at every depth. Without it (content the index
// does not describe) each nesting level below the root adds one; a depth-N
// chain nests N-1 levels below its root.
const expectedIndexedRts = (_depth: number): number => INDEXED_COLD_ROUND_TRIPS;
const expectedWalkedRts = (depth: number): number => coldRoundTripLaw(depth - 1);
// Statements: twenty-one at depth 1 (the twenty fixed statements plus the
// nest-index statement in the prelude), plus the extra statements of the
// wave's depth-3 key join. That join carries at most 30 names per statement
// (90 bound parameters, under D1's 100-parameter cap), and every chain card
// brings its own *self rule candidates (about four depth-3 names each), so
// the join needs a second statement from depth 6 and a third from depth 14.
// Statements, not round trips: they ride the same wave batch. Without the
// index each level adds its closure statement instead.
const KEY_JOIN_EXTRA = (depth: number): number => (depth >= 14 ? 2 : depth >= 6 ? 1 : 0);
const expectedIndexedSts = (depth: number): number => 21 + KEY_JOIN_EXTRA(depth);
const expectedWalkedSts = (depth: number): number => 21 + Math.max(0, depth - 1) + KEY_JOIN_EXTRA(depth);

async function seedChain(storage: RenderTestStorage, depth: number, withIndex: boolean): Promise<void> {
  // RichText cardtype (codename :basic) - the same cardtype the captured fixtures use.
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  for (let i = 1; i <= depth; i++) {
    const content = i < depth ? `level ${i} body {{chain_l${i + 1}}}` : `level ${i} end`;
    await seedCard(storage, { id: 100 + i, name: `chain_l${i}`, typeId: 2, dbContent: content });
  }
  if (!withIndex) return;
  // The nest index the write path keeps (refresh-references-out.ts): one
  // ref_type 'I' row per nest, the referee absolutized and its id filled in.
  for (let i = 1; i < depth; i++) {
    await seedReference(storage, 100 + i, 100 + i + 1, `chain_l${i + 1}`, "I");
  }
}

// ---------------------------------------------------------------------------
// The shape sweep
// ---------------------------------------------------------------------------

/** The slot id is a random nonce drawn per render (the same nonce the
 *  bootstrap and headless suites normalise); every other byte is compared. */
function withoutSlotNonces(html: string): string {
  return html.replace(/data-slot-id=(["'])[^"']*\1/g, 'data-slot-id="<nonce>"');
}

/** The 'I' rows a deck holds, as comparable strings. */
async function indexRows(storage: RenderTestStorage): Promise<string[]> {
  const rows = await storage.counting.query<{ referer_id: number; referee_id: number | null; referee_key: string | null }>(
    `SELECT referer_id, referee_id, referee_key FROM card_references WHERE ref_type = 'I' ORDER BY referer_id, referee_key, referee_id`,
    [],
  );
  return rows.rows.map((r) => JSON.stringify([r.referer_id, r.referee_id, r.referee_key]));
}

/** One measured shape: the cards a render reaches, the round trips the cold
 *  render paid, and the un-indexed control of the same deck. */
interface ShapeResult {
  shape: "chain" | "fan" | "tree";
  label: string;
  root: string;
  /** Cards the render reaches: the seed plus the stock read substrate. */
  liveCards: number;
  /** Cards the index build scanned (the cards carrying a nest). */
  indexedCards: number;
  /** Cards the prelude's index statement can bring back (nesters + junctions). */
  poolCards: number;
  roundTrips: number;
  statements: number;
  /** The un-indexed render of the same deck: the per-level walk. */
  walkedRoundTrips: number;
  /** The index is bytes-only: the indexed render and the walked render
   *  produced the same HTML. */
  byteIdentical: boolean;
}

/** NEST_INDEX_LIMIT (prefetch.ts): the pool the prelude's index statement is
 *  bounded to. Past it the rounds fetch the rest, so the constant law is
 *  stated for closures at or under it - the claim the file header above
 *  makes, and the one the shapes below are chosen to sit inside. */
const NEST_INDEX_LIMIT = 2000;

/** Measure one shape in one posture.
 *  'built': the engine's own build from content alone (the boot the hosts run).
 *  'hand': the same content, with the index the write path would leave written
 *  by hand after that boot, checked row for row against the build. */
async function measureShape(spec: ShapeSpec, posture: "built" | "hand"): Promise<ShapeResult> {
  const storage = await createRenderTestStorage();
  let indexedCards = 0;
  let poolCards = 0;
  let cold: { roundTrips: number; statements: number };
  let html: string;
  try {
    await spec.seed(storage);
    const install = await ensureNestIndex(storage.counting, storage.fetcher.lexicon);
    expect(install.state).toBe("built");
    indexedCards = install.scanned;
    const derived = await indexRows(storage);
    if (posture === "hand") {
      await storage.counting.query(`DELETE FROM card_references WHERE ref_type = 'I'`, []);
      for (const [refererId, refereeId, refereeKey] of spec.nestRows()) {
        await seedReference(storage, refererId, refereeId, DeckoName.parse(refereeKey).key, "I");
      }
      // The hand-written index is the derived one, row for row: the build
      // writes what the write path would have written for this content.
      expect({ label: spec.label, rows: (await indexRows(storage)).sort() }).toEqual({
        label: spec.label,
        rows: [...derived].sort(),
      });
    }
    // The marker is current now: a second boot reads it and writes nothing.
    expect(await ensureNestIndex(storage.counting, storage.fetcher.lexicon)).toEqual({
      state: "current",
      dropped: 0,
      scanned: 0,
    });
    // Every card the prelude's index statement can bring back: a card
    // carrying a nest, or a junction (a card's two sides).
    const pool = await storage.counting.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM cards
        WHERE trash = 0
          AND (db_content LIKE '%{{%' OR left_id IS NOT NULL OR right_id IS NOT NULL)`,
      [],
    );
    poolCards = Number(pool.rows[0]?.n ?? 0);

    storage.counting.reset();
    html = await storage.engine.render(spec.root, "content");
    const snap = storage.counting.snapshot();
    cold = { roundTrips: snap.roundTrips, statements: snap.statements };
  } finally {
    storage.close();
  }

  // The same deck with the index rows removed: the render walks the closure
  // level by level, and the bytes must not move.
  const walked = await createRenderTestStorage();
  let walkedRoundTrips = 0;
  let walkedHtml: string;
  try {
    await spec.seed(walked);
    await walked.counting.query(`DELETE FROM card_references WHERE ref_type = 'I'`, []);
    walked.counting.reset();
    walkedHtml = await walked.engine.render(spec.root, "content");
    walkedRoundTrips = walked.counting.snapshot().roundTrips;
  } finally {
    walked.close();
  }

  return {
    shape: spec.shape,
    label: spec.label,
    root: spec.root,
    liveCards: spec.liveCards,
    indexedCards,
    poolCards,
    roundTrips: cold.roundTrips,
    statements: cold.statements,
    walkedRoundTrips,
    byteIdentical: withoutSlotNonces(html) === withoutSlotNonces(walkedHtml),
  };
}

/** One shape the sweep measures: its seed, its root, how many cards a
 *  render of it reaches, and the nest rows a hand-seeded index holds. */
interface ShapeSpec {
  shape: "chain" | "fan" | "tree";
  label: string;
  seed: (storage: RenderTestStorage) => Promise<void>;
  root: string;
  liveCards: number;
  /** Nest rows a hand-seeded index starts from (0 = content alone). */
  seedIndexRows: number;
  nestRows(): Iterable<[number, number, string]>;
  /** Round trips the same deck costs with its index rows removed: the
   *  fixed three plus one per nesting level below the root. A chain of
   *  depth N nests N-1 levels, a fan nests one, a tree of depth d nests d. */
  walkedRoundTrips: number;
}

function chainShape(depth: number): ShapeSpec {
  return {
    shape: "chain",
    label: `chain-d${depth}`,
    seed: async (storage) => seedChain(storage, depth, false),
    root: "chain_l1",
    liveCards: depth,
    seedIndexRows: Math.max(0, depth - 1),
    walkedRoundTrips: coldRoundTripLaw(depth - 1),
    nestRows: () =>
      Array.from({ length: Math.max(0, depth - 1) }, (_, i) => [
        100 + i + 1,
        100 + i + 2,
        `chain_l${i + 2}`,
      ] as [number, number, string]),
  };
}

function fanShape(fanout: number): ShapeSpec {
  return {
    shape: "fan",
    label: `fan-f${fanout}`,
    seed: async (storage) => seedFan(storage, fanout),
    root: fanRootName(fanout),
    liveCards: fanout + 1,
    seedIndexRows: fanout,
    walkedRoundTrips: coldRoundTripLaw(1),
    nestRows: () =>
      Array.from({ length: fanout }, (_, i) => [
        999,
        1000 + i,
        fanChildName(fanout, i),
      ] as [number, number, string]),
  };
}

function treeShape(depth: number, fanout: number): ShapeSpec {
  // Fixture ids: root 1999, level L node j at 2000 + sum_{l=depth..L+1} f^l + (j-1).
  const idOf = (level: number, j: number): number => {
    let id = 2000;
    for (let l = depth; l > level; l--) id += Math.pow(fanout, l);
    return id + j - 1;
  };
  const rows: [number, number, string][] = [];
  for (let k = 0; k < fanout; k++) {
    rows.push([1999, idOf(1, k + 1), treeNodeName(depth, fanout, 1, k + 1)]);
  }
  for (let level = 1; level < depth; level++) {
    const count = Math.pow(fanout, level);
    for (let j = 1; j <= count; j++) {
      for (let k = 0; k < fanout; k++) {
        const childIndex = (j - 1) * fanout + k + 1;
        rows.push([idOf(level, j), idOf(level + 1, childIndex), treeNodeName(depth, fanout, level + 1, childIndex)]);
      }
    }
  }
  return {
    shape: "tree",
    label: `tree-d${depth}-f${fanout}`,
    seed: async (storage) => seedTree(storage, depth, fanout),
    root: treeRootName(depth, fanout),
    liveCards: treeCards(depth, fanout),
    seedIndexRows: rows.length,
    walkedRoundTrips: coldRoundTripLaw(depth),
    nestRows: () => rows,
  };
}

/** The sweep: every depth for chains, every width for fans, and the trees a
 *  deck of this shape can hold inside the pool limit. */
function shapeSpecs(): ShapeSpec[] {
  const specs: ShapeSpec[] = [];
  for (const depth of DEPTHS) specs.push(chainShape(depth));
  for (const fanout of [10, 20, 50, 100, 200]) specs.push(fanShape(fanout));
  for (const [depth, fanout] of [
    [2, 10],
    [3, 10],
    [4, 4],
    [6, 3],
    [8, 2],
    [12, 2],
  ] as const) {
    if (treeCards(depth, fanout) <= NEST_INDEX_LIMIT) specs.push(treeShape(depth, fanout));
  }
  return specs;
}

async function sweepShapes(posture: "built" | "hand" = "built"): Promise<ShapeResult[]> {
  const rows: ShapeResult[] = [];
  for (const spec of shapeSpecs()) {
    rows.push(await measureShape(spec, posture));
  }
  return rows;
}

function printShapes(title: string, rows: ShapeResult[]): void {
  // eslint-disable-next-line no-console
  console.log(`\n${title}\n`);
  // eslint-disable-next-line no-console
  console.log("shape            | cards | nests | cold RT | walked RT | same bytes");
  // eslint-disable-next-line no-console
  console.log("-----------------+-------+-------+---------+-----------+-----------");
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `${r.label.padEnd(15)} | ${String(r.poolCards).padStart(5)} | ${String(r.indexedCards).padStart(5)} | ${String(r.roundTrips).padStart(7)} | ${String(r.walkedRoundTrips).padStart(9)} | ${String(r.byteIdentical).padStart(10)}`,
    );
  }
}

// The fixed round trips, the same in both postures: RT1 the root key row,
// RT2 the PRELUDE batch (src/card/render/prefetch.ts prefetchInclusionClosure:
// the root's side priming, the root's TYPE row with that type's own type row,
// the root's set-pattern anchor priming, the stored nest index's closure
// statement, and the engine's permission/codename/structure/rule-walk/stamp
// folds), RT3 the wave's one round (the type-card prime and the Set TYPE
// card's row folded in as the batch preamble, the rule candidates of every
// card the closure reached by key, their depth-2 junctions by side keys and
// their depth-3 names through the depth-2 junction by keys). Ruby
// derivation: the wave asks the rule-candidate names of the view-time
// settings (*content options, *help, *structure, *default) that Ruby
// resolves per lookup through Set#rule/rule_card (rule/all.rb) plus the
// prepared records' type cards (Card#type_card, type.rb:32-35) - batched
// here, point-by-point in Ruby's cache.
//
// THE DECK CARRIES ITS READ RULE. The seeds go through
// createRenderTestStorage(), which seeds the stock `*all+*read` rule card:
// Ruby has no allowance for a deck without one (card-mod-permissions
// set/all/permissions.rb:139-146). The read permission's one-time setup
// rides the PRELUDE batch, so it adds statements to the fixed cost and no
// round trips. A deck with no read rule card measures the same round trips
// with two fewer statements. The deck_data_version freshness stamp folds
// LAST into the cold batch (+1 statement at every depth, +0 round trips).
describe("Depth sweep: TypeScript queries-per-render at every depth 1 through 20", () => {
  it("a deck with its stored nest index renders in a constant number of round trips", { timeout: 60_000 }, async () => {
    const rows = await sweep(true);
    // Constant in depth: the prelude's nest-index statement brings the whole
    // nest closure, and the closure rounds are answered from it
    // (NestIndexPool) without a round trip. Ruby's measured truth is depth+3.
    for (const r of rows) {
      expect({ depth: r.depth, roundTrips: r.roundTrips }).toEqual({
        depth: r.depth,
        roundTrips: expectedIndexedRts(r.depth),
      });
      expect({ depth: r.depth, statements: r.statements }).toEqual({
        depth: r.depth,
        statements: expectedIndexedSts(r.depth),
      });
    }
    // Warm cache: the second render pays exactly the freshness-stamp
    // statement (one statement, one round trip) and nothing else.
    expect(rows.every((r) => r.warmRoundTrips === 1 && r.warmStatements === 1)).toBe(true);

    if (ARTIFACT_WRITE_REQUESTED) {
      const walked = await sweep(false);
      mkdirSync("benchmarks/results", { recursive: true });
      writeFileSync(
        "benchmarks/results/depth-sweep-ts.json",
        JSON.stringify(
          {
            measured_at: new Date().toISOString(),
            reproduce: "DEPTH_SWEEP_WRITE_ARTIFACT=1 npx vitest run tests/card/render/depth-sweep.test.ts",
            environment: "local better-sqlite3 over production-schema DDL; synthetic chains",
            axes: {
              round_trips: "driver calls: query() + batch() each count ONE",
              statements: "individual SQL statements (batch members count one each)",
              warm: "second render of same chain in same engine instance",
            },
            ruby_measured_truth: {
              source: "decko-ts/benchmarks/results/ruby-nesting-r1-r2.json",
              formula: "depth + 3; depth 32 hard-capped by Card.config.max_depth=20 with 'Man, you're too deep' UserError",
              table: RUBY_MEASURED,
            },
            ts_constant: { round_trips: rows[0]!.roundTrips, statements: rows[0]!.statements },
            rows,
            rows_without_nest_index: walked,
            ts_reduces_query_count_by: rows
              .filter((r) => r.rubyMeasured !== null)
              .map((r) => ({ depth: r.depth, ruby: r.rubyMeasured, ts: r.roundTrips, ratio: r.rubyRatio })),
          },
          null,
          2,
        ),
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "\n(receipt not refreshed: set DEPTH_SWEEP_WRITE_ARTIFACT=1 to rewrite the TS results file)",
      );
    }
    printTable("Depth sweep, stored nest index - TypeScript vs Ruby queries-per-render:", rows);
  });

  it("content the nest index does not describe falls back to one round trip per level", { timeout: 60_000 }, async () => {
    // No card_references rows: every closure round goes to the database, one
    // batched round trip per nesting level below the root.
    const rows = await sweep(false);
    for (const r of rows) {
      expect({ depth: r.depth, roundTrips: r.roundTrips }).toEqual({
        depth: r.depth,
        roundTrips: expectedWalkedRts(r.depth),
      });
      expect({ depth: r.depth, statements: r.statements }).toEqual({
        depth: r.depth,
        statements: expectedWalkedSts(r.depth),
      });
    }
    expect(rows.every((r) => r.warmRoundTrips === 1 && r.warmStatements === 1)).toBe(true);
    printTable("Depth sweep, no nest index (per-level walk):", rows);
  });
});

interface SweepRow {
  depth: number;
  roundTrips: number;
  statements: number;
  coldWallMs: number;
  warmWallMs: number;
  warmRoundTrips: number;
  warmStatements: number;
  rubyMeasured: number | null;
  rubyRatio: number | null;
}

async function sweep(withIndex: boolean): Promise<SweepRow[]> {
  const rows: SweepRow[] = [];
  for (const depth of DEPTHS) {
    const storage = await createRenderTestStorage();
    try {
      await seedChain(storage, depth, withIndex);
      // The renderer caps at RUBY_MAX_DEPTH=20 by default
      // (src/card/render/format.ts, Card.config.max_depth railtie.rb:17).
      // Past 20 the Format-object recursion throws "nest depth exceeded".
      if (depth > RUBY_MAX_DEPTH) {
        throw new Error(`DEPTHS should not exceed renderer RUBY_MAX_DEPTH=${RUBY_MAX_DEPTH}`);
      }

      // Cold render
      storage.counting.reset();
      const t0 = performance.now();
      await storage.engine.render("chain_l1", "content");
      const t1 = performance.now();
      const cold = storage.counting.snapshot();

      // Warm render (same engine instance, same chain)
      storage.counting.reset();
      const w0 = performance.now();
      await storage.engine.render("chain_l1", "content");
      const w1 = performance.now();
      const warm = storage.counting.snapshot();

      const ruby = RUBY_MEASURED[depth] ?? null;
      rows.push({
        depth,
        roundTrips: cold.roundTrips,
        statements: cold.statements,
        coldWallMs: Number((t1 - t0).toFixed(3)),
        warmWallMs: Number((w1 - w0).toFixed(3)),
        warmRoundTrips: warm.roundTrips,
        warmStatements: warm.statements,
        rubyMeasured: ruby,
        rubyRatio: ruby !== null ? Number((ruby / cold.roundTrips).toFixed(2)) : null,
      });
    } finally {
      storage.close();
    }
  }
  return rows;
}

function printTable(title: string, rows: SweepRow[]): void {
  // eslint-disable-next-line no-console
  console.log(`\n${title}\n`);
  // eslint-disable-next-line no-console
  console.log("depth | ruby q | ts RT | ts SQL | cold ms | warm ms");
  // eslint-disable-next-line no-console
  console.log("------+-------+------+-------+---------+--------");
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `${String(r.depth).padStart(5)} | ${String(r.rubyMeasured ?? "n/a").padStart(5)} | ${String(r.roundTrips).padStart(4)} | ${String(r.statements).padStart(5)} | ${String(r.coldWallMs).padStart(7)} | ${String(r.warmWallMs).padStart(7)}`,
    );
  }
}

// The shape sweep, the part the release promise is stated over: every shape
// (chains, fans, trees), every depth 1 through 20, widths up to 200 and trees
// up to the pool limit, from content alone and from a hand-seeded index.
describe("Shape sweep: three round trips per cold render, whatever the shape", () => {
  it(
    "chains, fans and trees cost three round trips once the engine has built the index",
    { timeout: 300_000 },
    async () => {
      const rows = await sweepShapes();
      const byLabel = new Map(shapeSpecs().map((spec) => [spec.label, spec]));
      for (const r of rows) {
        expect({ label: r.label, roundTrips: r.roundTrips }).toEqual({
          label: r.label,
          roundTrips: INDEXED_COLD_ROUND_TRIPS,
        });
        // Bytes, not trips: the index decides what a render COSTS, never
        // what it renders. The un-indexed render of the same deck is the
        // control.
        expect({ label: r.label, byteIdentical: r.byteIdentical }).toEqual({
          label: r.label,
          byteIdentical: true,
        });
        // The un-indexed control walked: the law's per-level cost, which is
        // what the index removed. A shape that nests one level (a fan) walks
        // one extra round trip; a shape that nests none costs the same three.
        const spec = byLabel.get(r.label);
        expect(spec).toBeDefined();
        expect({ label: r.label, walked: r.walkedRoundTrips }).toEqual({
          label: r.label,
          walked: spec!.walkedRoundTrips,
        });
      }
      printShapes("Shape sweep, stored nest index built by the engine:", rows);
    },
  );

  it(
    "a hand-seeded index and a content-only deck render the same bytes and cost the same trips",
    { timeout: 300_000 },
    async () => {
      // The two ways a deck arrives with the index: rows the write path left
      // behind, and content the engine has not described yet. Both must come
      // out of ensureNestIndex holding the same rows.
      const seeded = await sweepShapes("hand");
      expect(seeded.length).toBeGreaterThan(0);
      for (const r of seeded) {
        expect({ label: r.label, roundTrips: r.roundTrips }).toEqual({
          label: r.label,
          roundTrips: INDEXED_COLD_ROUND_TRIPS,
        });
        expect({ label: r.label, byteIdentical: r.byteIdentical }).toEqual({
          label: r.label,
          byteIdentical: true,
        });
      }
      printShapes("Shape sweep, hand-seeded index:", seeded);
    },
  );

  if (ARTIFACT_WRITE_REQUESTED) {
    it("records the shape sweep", { timeout: 300_000 }, async () => {
      const rows = await sweepShapes();
      mkdirSync("benchmarks/results", { recursive: true });
      writeFileSync(
        "benchmarks/results/shape-sweep-ts.json",
        JSON.stringify(
          {
            measured_at: new Date().toISOString(),
            reproduce:
              "DEPTH_SWEEP_WRITE_ARTIFACT=1 npx vitest run tests/card/render/depth-sweep.test.ts",
            environment:
              "local better-sqlite3 over production-schema DDL; synthetic chains, fans and trees",
            axes: {
              round_trips: "driver calls: query() + batch() each count ONE",
              pool_limit: NEST_INDEX_LIMIT,
              walked_round_trips: "the same deck with its 'I' rows deleted (the per-level walk)",
              byte_identical: "indexed render vs walked render, byte for byte",
            },
            rows,
          },
          null,
          2,
        ),
      );
    });
  }
});
