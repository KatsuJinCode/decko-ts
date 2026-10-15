// Public synthetic exercises for the deploy and coverage-gap claims.
//
// Every datum in this file is invented for it: the probe table and columns,
// the card name, the card body and the write. The deck they run against is
// reference-harness/fixtures/synthetic-v1, the stock Ruby Decko deck the
// reference harness commits so anyone can boot the engine without local
// data. Everything here runs against committed fixtures: no outside data,
// no hosted service, no network.
//
// The boot helpers are the committed ones, not new machinery:
//
//   - the D1 driver's two exported functions (inlineBoundParameters,
//     balanceOrChains) are exercised directly and the cap behaviour through
//     CloudflareD1Adapter over a recording D1 binding - the seam
//     tests/server/drivers/d1-bound-parameter-cap.test.ts drives;
//   - the card write runs through the reference harness's own TS adapter on a
//     private copy of the committed synthetic deck, opened exactly as
//     tests/card/render/fresh-deck/harness-session.ts opens it (AdapterSession
//     over reference-harness/adapters/ts/adapter.json). The copy's path is
//     kept here so the test can count the rows the write left in the deck's
//     own background-queue table; harness-session.ts deletes its copy on
//     close, which is why this file opens the same session itself.
//
// One claim from the batch this file was written for is NOT exercised here:
// the browser-journey coverage gap. reference-harness/browser/lib/launch.mjs
// drives a real Chrome/Edge/Chromium through playwright-core, and
// playwright-core is not a dependency of this package and does not resolve
// from the harness in a clean checkout, so the machinery cannot execute here
// without an install the public package does not carry. Asserting executability
// under those conditions would be a fake; the gap stays open, exactly as
// docs/coverage-inventory.md states it.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CloudflareD1Adapter,
  balanceOrChains,
  inlineBoundParameters,
  D1_MAX_BOUND_PARAMETERS,
  D1_MAX_EXPR_DEPTH,
  type D1BindValue,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type D1ResultLike,
} from "../../src/server/drivers/d1.js";
import { COMPILED_IN_OR_ABSENT_MODS } from "../../src/card/mod-loader/default-mod-deck.js";
// @ts-expect-error plain ESM module without type declarations
import { AdapterSession, loadAdapterManifest } from "../../reference-harness/runner/adapter-process.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const HARNESS = join(REPO_ROOT, "reference-harness");
const FIXTURE = join(HARNESS, "fixtures", "synthetic-v1");

// --------------------------------------------------------------------------------------
// D1's two limits, as the deploy doc states them (docs/deploy-cloudflare.md:126-147).
// --------------------------------------------------------------------------------------

/** A D1 binding that records what it was asked to prepare and to bind and
 *  answers an empty result set. The seam
 *  tests/server/drivers/d1-bound-parameter-cap.test.ts drives, with the cap
 *  check replaced by a record: what matters here is the SQL the driver hands
 *  D1 and the values it binds beside it. */
function recordingD1Binding(): { db: D1DatabaseLike; prepared: { sql: string; bound: D1BindValue[] }[] } {
  const prepared: { sql: string; bound: D1BindValue[] }[] = [];
  const empty = (): D1ResultLike => ({ success: true, results: [], meta: { changes: 0 } });
  const db: D1DatabaseLike = {
    prepare(sql: string): D1PreparedStatementLike {
      const call = { sql, bound: [] as D1BindValue[] };
      prepared.push(call);
      const statement: D1PreparedStatementLike = {
        bind(...values: D1BindValue[]) {
          call.bound.push(...values);
          return statement;
        },
        async all() {
          return empty();
        },
        async run() {
          return empty();
        },
      };
      return statement;
    },
    async batch(statements) {
      return statements.map(() => empty());
    },
  };
  return { db, prepared };
}

/** Deepest parenthesis nesting in a statement: the depth of the grouping the
 *  regrouping introduces, which is what bounds SQLite's expression tree once
 *  the driver has parenthesised the chain itself. */
const parenDepth = (sql: string): number => {
  let open = 0;
  let deepest = 0;
  for (const ch of sql) {
    if (ch === "(") deepest = Math.max(deepest, ++open);
    else if (ch === ")") open -= 1;
  }
  return deepest;
};

const PROBE_TABLE = "decko_exercise_pairs";

/** A real SQLite deck holding the rows each lookup below should find, plus
 *  near-miss rows it must not return. Invented table, invented columns. */
function probeDeck(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ${PROBE_TABLE} (left_id INTEGER, probe TEXT, tag TEXT)`);
  return db;
}

const PAIR_COUNT = 75;
const PAIR_TERM = "(j.left_id = ? AND j.tag = ?)";
const QUOTE_VALUE = "O'Brien"; // a value carrying a quote
const LINE_COMMENT_VALUE = "tail -- not a comment"; // a value carrying a line-comment marker
const BLOCK_COMMENT_VALUE = "block /* not a comment */"; // a value carrying a block-comment marker

/** 75 OR-ed pairs, two placeholders each: 150 placeholders, fifty clear of
 *  D1_MAX_BOUND_PARAMETERS, carrying a quote value and two comment-marker
 *  values. */
const pairTags = (): string[] => {
  const tags = Array.from({ length: PAIR_COUNT }, (_, k) => `Tag ${k}`);
  tags[3] = QUOTE_VALUE;
  tags[7] = LINE_COMMENT_VALUE;
  tags[11] = BLOCK_COMMENT_VALUE;
  return tags;
};
const pairSql = `SELECT j.rowid AS pair_row FROM ${PROBE_TABLE} j WHERE (${Array.from({ length: PAIR_COUNT }, () => PAIR_TERM).join(" OR ")}) ORDER BY j.rowid`;
const pairParams = (tags: string[]): unknown[] => Array.from({ length: PAIR_COUNT }, (_, k) => [k, tags[k]]).flat();

describe("deploy: D1's per-statement limits", () => {
  it(
    "`src/server/drivers/d1.ts` declares `D1_MAX_BOUND_PARAMETERS = 100`. Above that, the driver rewrites every placeholder as an exact SQL literal. The rewrite is quote- and comment-aware, and declines to run ... for numbered or named parameters, for a count mismatch, or for any value with no exact literal. -- a 150-placeholder junction lookup carrying a quote and two comment markers inlines to exact literals and returns the same rows, while a named-parameter statement and both count-mismatch directions stay bound with their values handed to D1 as parameters",
    async () => {
      expect(D1_MAX_BOUND_PARAMETERS).toBe(100);

      const tags = pairTags();
      const params = pairParams(tags);
      expect(params.length).toBeGreaterThan(D1_MAX_BOUND_PARAMETERS);
      expect(params.length).toBe(150);

      // --- the rewrite, and that its literals are exact ------------------------
      const inlined = inlineBoundParameters(pairSql, params);
      expect(inlined).toBeDefined();
      // No placeholder survives: each value is a literal SQLite compares and
      // returns the same value for.
      expect(inlined).not.toContain("?");
      // A quote in a value is doubled, not left to end the literal early.
      expect(inlined).toContain("'O''Brien'");
      // A comment marker inside a value stays inside its quoted literal, so it
      // is inert rather than the start of a comment.
      expect(inlined).toContain("'tail -- not a comment'");
      expect(inlined).toContain("'block /* not a comment */'");
      // And the inlined statement returns the same rows, in the same order, on
      // a real SQLite engine.
      const db = probeDeck();
      try {
        const insert = db.prepare(`INSERT INTO ${PROBE_TABLE} (left_id, tag) VALUES (?, ?)`);
        for (let k = 0; k < PAIR_COUNT; k++) {
          insert.run(k, tags[k]); // matches pair k
          insert.run(k, `decoy tag ${k}`); // same left_id, wrong tag
          insert.run(-1 - k, tags[k]); // right tag, a left_id the lookup never binds
        }
        expect(db.prepare(inlined as string).all()).toEqual(db.prepare(pairSql).all(...(params as never[])));
        expect((db.prepare(inlined as string).all() as unknown[]).length).toBe(PAIR_COUNT);
      } finally {
        db.close();
      }

      // --- quote- and comment-awareness of the STATEMENT, not just the values -
      expect(inlineBoundParameters("SELECT ?, 'lit ?', \"id?\", [b?] -- ?\n, ? /* ? */", [7, QUOTE_VALUE])).toBe(
        `SELECT 7, 'lit ?', "id?", [b?] -- ?\n, '${QUOTE_VALUE.replace(/'/g, "''")}' /* ? */`,
      );

      // --- the driver applies it above the cap --------------------------------
      const inlining = recordingD1Binding();
      await new CloudflareD1Adapter(inlining.db).query(pairSql, params);
      const inlinedCall = inlining.prepared.filter((c) => c.sql.includes(PROBE_TABLE));
      expect(inlinedCall).toHaveLength(1);
      expect(inlinedCall[0].sql).not.toContain("?");
      expect(inlinedCall[0].sql).toContain("'O''Brien'");
      // Inlined, so nothing was bound beside it.
      expect(inlinedCall[0].bound).toEqual([]);

      // --- numbered parameters, named parameters, count mismatches: declined --
      // Numbered (?1) and named (:p0) placeholders.
      expect(inlineBoundParameters("SELECT ?1", [1])).toBeUndefined();
      expect(inlineBoundParameters("SELECT :p0", [1])).toBeUndefined();
      // A value with no exact literal: NUL inside a string, a boolean (D1
      // refuses to bind one), a number SQLite has no literal for.
      expect(inlineBoundParameters("SELECT ?", ["a\u0000b"])).toBeUndefined();
      expect(inlineBoundParameters("SELECT ?", [true])).toBeUndefined();
      expect(inlineBoundParameters("SELECT ?", [Number.POSITIVE_INFINITY])).toBeUndefined();
      // A count mismatch in either direction.
      expect(inlineBoundParameters("SELECT ?, ?", [1])).toBeUndefined();
      expect(inlineBoundParameters("SELECT ?", [1, 2])).toBeUndefined();

      const named = recordingD1Binding();
      const namedSql = `SELECT j.rowid AS pair_row FROM ${PROBE_TABLE} j WHERE (${Array.from({ length: PAIR_COUNT }, (_, k) => `(j.left_id = :left${k} AND j.tag = :tag${k})`).join(" OR ")}) ORDER BY j.rowid`;
      await new CloudflareD1Adapter(named.db).query(namedSql, params);
      const namedCall = named.prepared.filter((c) => c.sql.includes(PROBE_TABLE));
      expect(namedCall).toHaveLength(1);
      // Left exactly as it was, save for the OR-chain regrouping every
      // statement gets: the named parameters are still named parameters, no
      // value was written into the SQL, and every value went to D1 as a bound
      // parameter. The statement stays bound rather than executed rewritten.
      expect(namedCall[0].sql).toBe(balanceOrChains(namedSql));
      expect(namedCall[0].sql.match(/:[A-Za-z_]\w*/g)).toEqual(namedSql.match(/:[A-Za-z_]\w*/g));
      expect(namedCall[0].sql).toContain(":left0");
      expect(namedCall[0].sql).not.toContain(QUOTE_VALUE);
      expect(namedCall[0].bound).toEqual(params as D1BindValue[]);

      // A value for every placeholder but one, and then a statement with one
      // value too many: 149 of 150 bound, then 150 for 148 placeholders.
      const shorterSql = `SELECT j.rowid AS pair_row FROM ${PROBE_TABLE} j WHERE (${Array.from({ length: PAIR_COUNT - 1 }, () => PAIR_TERM).join(" OR ")}) ORDER BY j.rowid`;
      expect((shorterSql.match(/\?/g) ?? []).length).toBe(148);
      for (const mismatch of [
        { sql: pairSql, params: params.slice(0, params.length - 1) },
        { sql: shorterSql, params },
      ]) {
        const recording = recordingD1Binding();
        await new CloudflareD1Adapter(recording.db).query(mismatch.sql, mismatch.params);
        const call = recording.prepared.filter((c) => c.sql.includes(PROBE_TABLE));
        expect(call).toHaveLength(1);
        // Left bound: the placeholders are intact and the values ride beside
        // them as parameters. Nothing was executed in an inlined form.
        expect(call[0].sql).toBe(balanceOrChains(mismatch.sql));
        expect(call[0].sql).toContain("?");
        expect(call[0].sql).not.toContain(QUOTE_VALUE);
        expect(call[0].bound).toEqual(mismatch.params as D1BindValue[]);
      }
    },
    60_000,
  );

  it(
    "Also `d1.ts`, as `D1_MAX_EXPR_DEPTH = 100`. SQLite parses a flat `OR` chain left-deep ... The driver regroups long flat `OR` chains into a balanced tree ... Terms, their order and the placeholders' order are all preserved -- a 500-term flat OR chain regrouped to a nesting at or below 100, carrying the same terms in the same order and inlining them to the same values in the same order, and still returning the same rows from a real SQLite engine",
    () => {
      expect(D1_MAX_EXPR_DEPTH).toBe(100);

      const TERM_COUNT = 500;
      // Each term carries its own tag literal and binds its own value, so term
      // order and placeholder order are both observable in the emitted SQL.
      const probeValue = (k: number) => `P${String(k).padStart(4, "0")}`;
      const tagLiteral = (k: number) => `K${String(k).padStart(3, "0")}`;
      const term = (k: number) => `(j.probe = ? AND j.tag = '${tagLiteral(k)}')`;
      const TERM_RE = /\(j\.probe = \? AND j\.tag = 'K\d{3}'\)/g;
      const flat = `SELECT j.rowid AS pair_row FROM ${PROBE_TABLE} j WHERE (${Array.from({ length: TERM_COUNT }, (_, k) => term(k)).join(" OR ")}) ORDER BY j.rowid`;
      const params = Array.from({ length: TERM_COUNT }, (_, k) => probeValue(k));

      const flatTerms = flat.match(TERM_RE) ?? [];
      expect(flatTerms).toHaveLength(TERM_COUNT);

      const balanced = balanceOrChains(flat);
      expect(balanced).not.toBe(flat);

      // --- the emitted depth ----------------------------------------------------
      const depth = parenDepth(balanced);
      expect(depth).toBeLessThanOrEqual(D1_MAX_EXPR_DEPTH);
      // ...and it grows with the logarithm of the term count, not with the term
      // count: ceil(log2(500)) == 9 grouping levels over the terms' parentheses.
      expect(depth).toBeLessThanOrEqual(Math.ceil(Math.log2(TERM_COUNT)) + 2);
      // A flat chain of this many terms is parenthesised once, so its text says
      // nothing about the parse: SQLite reads it left-deep, one level per term,
      // which is the depth that would pass the limit.
      expect(parenDepth(flat)).toBe(2);
      expect(TERM_COUNT - 1).toBeGreaterThan(D1_MAX_EXPR_DEPTH);

      const db = probeDeck();
      try {
        // The limit is real, not a stated number: this machine's SQLite refuses
        // a flat OR chain past its own expression-depth limit (D1 reports the
        // same limit ten times lower), and the regrouped form of the very same
        // statement parses and runs - the regrouping is what does the work.
        const flatAt = (n: number) =>
          `SELECT j.rowid AS pair_row FROM ${PROBE_TABLE} j WHERE (${Array.from({ length: n }, () => "(j.left_id = 1 AND j.tag = 'K')").join(" OR ")}) ORDER BY j.rowid`;
        let refusedAt = 0;
        for (const terms of [500, 1000, 2000, 4000]) {
          let refused = false;
          try {
            db.prepare(flatAt(terms));
          } catch (error) {
            refused = /Expression tree is too large/.test(String((error as Error)?.message ?? error));
            if (!refused) throw error;
          }
          if (!refused) continue;
          refusedAt = terms;
          expect(() => db.prepare(balanceOrChains(flatAt(terms))).all()).not.toThrow();
          break;
        }
        expect(refusedAt).toBeGreaterThan(0);

        // --- identical terms, in order ---------------------------------------
        const balancedTerms = balanced.match(TERM_RE) ?? [];
        expect(balancedTerms).toEqual(flatTerms);
        expect(balancedTerms[0]).toBe(term(0));
        expect(balancedTerms[TERM_COUNT - 1]).toBe(term(TERM_COUNT - 1));

        // --- identical placeholders' order: inlining the regrouped statement
        // substitutes the values in exactly the order the flat one did --------
        const flatLiterals = inlineBoundParameters(flat, params) as string;
        const balancedLiterals = inlineBoundParameters(balanced, params) as string;
        const literalsOf = (sql: string) => sql.match(/'P\d{4}'/g) ?? [];
        expect(literalsOf(balancedLiterals)).toEqual(literalsOf(flatLiterals));
        expect(literalsOf(balancedLiterals)).toHaveLength(TERM_COUNT);
        expect(literalsOf(balancedLiterals)[0]).toBe(`'${probeValue(0)}'`);
        expect(literalsOf(balancedLiterals)[TERM_COUNT - 1]).toBe(`'${probeValue(TERM_COUNT - 1)}'`);
        expect(balancedLiterals).not.toContain("?");

        // --- and it means the same thing -------------------------------------
        const insert = db.prepare(`INSERT INTO ${PROBE_TABLE} (probe, tag) VALUES (?, ?)`);
        for (let k = 0; k < TERM_COUNT; k++) insert.run(probeValue(k), tagLiteral(k));
        db.exec("ANALYZE");
        expect(db.prepare(balancedLiterals).all()).toEqual(db.prepare(flatLiterals).all());
        expect((db.prepare(balancedLiterals).all() as unknown[]).length).toBe(TERM_COUNT);
      } finally {
        db.close();
      }
    },
    60_000,
  );
});

// --------------------------------------------------------------------------------------
// Coverage gap: background jobs (docs/coverage-inventory.md:124-126).
// --------------------------------------------------------------------------------------

/** Windows can hold the deck file for a moment after the adapter process goes
 *  away; reference-harness/browser/lib/engines.mjs retries the same way. */
async function removeTree(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/** The reference harness's TS adapter over a private copy of the committed
 *  synthetic deck - the boot in tests/card/render/fresh-deck/harness-session.ts,
 *  with the copy's path kept so a test can read the deck's own tables. */
async function openDeckCopy(): Promise<{
  deckPath: string;
  write: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  ask: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  close: () => Promise<void>;
}> {
  const work = mkdtempSync(join(tmpdir(), "decko-exercise-deck-"));
  try {
    const deckPath = join(work, "deck.sqlite3");
    cpSync(join(FIXTURE, "deck", "deck.sqlite3"), deckPath);
    const files = join(work, "files");
    const sourceFiles = join(FIXTURE, "deck", "files");
    if (existsSync(sourceFiles)) cpSync(sourceFiles, files, { recursive: true });
    else mkdirSync(files);
    mkdirSync(join(work, "adapter"));
    const slash = (p: string) => p.replaceAll("\\", "/");
    const session = new AdapterSession(loadAdapterManifest(join(HARNESS, "adapters", "ts", "adapter.json")), {
      HARNESS_DECK: slash(deckPath),
      HARNESS_FILES: slash(files),
      HARNESS_DECK_JSON: slash(join(FIXTURE, "deck.json")),
      HARNESS_WORK: slash(join(work, "adapter")),
    });
    await session.start();
    const answered = async (op: string, body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const answer = (await session.request({ op, ...body })) as { ok: boolean; result?: unknown; error?: unknown };
      if (!answer.ok) throw new Error(`${op} failed: ${JSON.stringify(answer.error)}`);
      return answer.result as Record<string, unknown>;
    };
    return {
      deckPath,
      write: (body) => answered("write", body),
      ask: (body) => answered("ask", body),
      close: async () => {
        try {
          await session.close();
        } finally {
          await removeTree(work);
        }
      },
    };
  } catch (error) {
    await removeTree(work);
    throw error;
  }
}

/** The queue the Ruby deck ships (a core engine migration created the table,
 *  db/schema.sqlite.sql:216-233) and card-mod-delayed_job consumes. */
function queueState(deckPath: string): { rows: number; locked: number; failed: number } {
  const reader = new DatabaseSync(deckPath);
  try {
    return reader.prepare("SELECT count(*) AS rows, count(locked_at) AS locked, count(failed_at) AS failed FROM delayed_jobs").get() as {
      rows: number;
      locked: number;
      failed: number;
    };
  } finally {
    reader.close();
  }
}

const CARD_NAME = "Exercise Note Alpha";
const CARD_BODY = "Synthetic body written by the background-work probe.";

describe("background jobs under card-mod-delayed_job's default config", () => {
  let session: Awaited<ReturnType<typeof openDeckCopy>> | undefined;

  beforeAll(async () => {
    session = await openDeckCopy();
  }, 240_000);

  afterAll(async () => {
    await session?.close();
  });

  it(
    "Jobs. The delayed-job backend is ported (the compatibility report marks `card-mod-delayed_job` declared-complete as a backend port). With the mod's default config, delaying is false, so a card create runs its integrate_with_delay work in line as Ruby does: the deck's background queue stays empty, no job table grows, and nothing runs afterwards",
    async () => {
      // --- the committed report records a backend port ----------------------
      // The classification verdict lives in the per-mod table. The report's
      // behavioural table above it also names every mod, but its row says what
      // the behavioural grade is, not the classification, so search only from
      // the per-mod heading down.
      const markdown = readFileSync(join(REPO_ROOT, "tools", "compat-report", "mod-compat-report.md"), "utf8");
      const perModStart = markdown.indexOf("\n## Per-mod report\n");
      expect(perModStart).toBeGreaterThan(-1);
      const row = markdown
        .slice(perModStart)
        .split("\n")
        .find((line) => line.includes("| `card-mod-delayed_job-"));
      expect(row).toBeDefined();
      expect((row as string).split("|").map((cell) => cell.trim())).toContain("declared-complete");
      expect(row).toContain("backend port (src/card/delayed-job/delayed-job.ts)");

      const report = JSON.parse(readFileSync(join(REPO_ROOT, "tools", "compat-report", "mod-compat-report.json"), "utf8")) as {
        mods: {
          gem: string;
          classification: { status: string; evidence: string; metrics: { manifestExists: boolean } };
          inv: { counts: { eventHooks: number } };
        }[];
      };
      const delayedJob = report.mods.find((mod) => mod.gem.startsWith("card-mod-delayed_job"));
      expect(delayedJob).toBeDefined();
      expect(delayedJob?.classification.status).toBe("declared-complete");
      // A backend-only gem: no views, no set tree, no manifest, no event hook.
      // Its port is engine machinery (src/card/delayed-job), not a set module.
      expect(delayedJob?.classification.evidence).toMatch(/no set\/ tree; the mod's surface is engine machinery/);
      expect(delayedJob?.classification.metrics.manifestExists).toBe(false);
      expect(delayedJob?.inv.counts.eventHooks).toBe(0);
      // And the composed default deck carries no delayed_job manifest.
      expect(COMPILED_IN_OR_ABSENT_MODS).toContain("delayed_job");

      // --- a write Ruby runs in line with delaying false ---------------------
      const deck = session!.deckPath;
      expect(queueState(deck)).toEqual({ rows: 0, locked: 0, failed: 0 });

      const result = await session!.write({
        action: "create",
        actor: "admin",
        card: CARD_NAME,
        fields: { type: "Note", content: CARD_BODY },
      });
      expect(result.saved).toBe(true);
      expect(result.errors).toEqual([]);
      // The save finished on its own: the card is there before the write
      // returned, so nothing about it was deferred to a later run.
      expect(result.card).toMatchObject({ name: CARD_NAME });
      expect(await session!.ask({ q: "card", card: CARD_NAME })).toMatchObject({ exists: true, name: CARD_NAME, type: "Note" });

      // --- dispatches nothing -------------------------------------------------
      expect(queueState(deck)).toEqual({ rows: 0, locked: 0, failed: 0 });
      const reader = new DatabaseSync(deck);
      try {
        // No queue table was created for the write to use either.
        const jobTables = reader
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%job%'")
          .all() as { name: string }[];
        expect(jobTables.map((table) => table.name)).toEqual(["delayed_jobs"]);
      } finally {
        reader.close();
      }

      // --- and executes nothing ----------------------------------------------
      // Give anything that had been dispatched the chance to run and be counted
      // as run: a delayed job's row would be gone, or its locked_at / failed_at
      // set. The queue afterwards is the same empty queue.
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(queueState(deck)).toEqual({ rows: 0, locked: 0, failed: 0 });
      // The one piece of work the Ruby engine would have handed to a job here
      // - telling the member who follows everything that the card exists -
      // came back in the write's own response: it ran inline, during the
      // write, with nothing left over to be picked up afterwards.
      const mail = result.mail as { to: string[]; subject: string; text: string }[];
      expect(mail).toHaveLength(1);
      expect(mail[0].to).toEqual(["mira.member@example.test"]);
      expect(mail[0].subject).toContain(CARD_NAME);
      expect(mail[0].text).toContain(CARD_BODY);
    },
    240_000,
  );
});