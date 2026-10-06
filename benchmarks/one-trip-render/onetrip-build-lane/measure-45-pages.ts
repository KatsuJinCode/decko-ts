// measure-45-pages.ts — one-trip build lane (A1 performance). The D3
// measurement harness (10-one-trip-per-page-measure.ts) adapted to THIS
// lane's worktree line: same deck prep (L2 mirror copy + migration 0003),
// same counting boundary (one driver.query or driver.batch = one trip), same
// house comparator (normalizeSlotIds + sha256), OFF and ON postures, fresh
// engine per page. BEFORE/AFTER numbers for the stamp-as-column slice.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { RenderEngine } from "../../../src/card/render.js";
import { classifyResidueStatement } from "../../../src/card/one-trip/render-plan.js";
import { bootEngine, normalizeSlotIds } from "../../../tests/card/one-trip/one-trip-fixture.js";

const WORK = "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/one-trip-per-page-work";
const L2_MIRROR = "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/l2-plan-recording-work/decks/measure-AFTER-plans.sqlite3";
const MIGRATION_0003 = "C:/localProjects/decko-ts-lane-onetrip-build-2026-10-06/deploy/migrations/0003-deck-data-version-stamp.sql";
const DECK = `${WORK}/decks/onetrip-build-lane-45p.sqlite3`;
const OUT = process.argv[2] ?? `${WORK}/onetrip-build-lane-measure-report.json`;

const require = createRequire("C:/localProjects/decko-ts-lane-onetrip-build-2026-10-06/package.json");
const Database = require("better-sqlite3");

// ---- deck prep: copy + stamp migration ------------------------------------
mkdirSync(`${WORK}/decks`, { recursive: true });
copyFileSync(L2_MIRROR, DECK);
{
  const db = new Database(DECK); // writable COPY; the L2 artifact is untouched
  const migration = readFileSync(MIGRATION_0003, "utf8");
  db.exec(migration); // IF NOT EXISTS / INSERT OR IGNORE — order-safe
  const stamp = db.prepare("SELECT version FROM deck_data_version WHERE id = 1").get();
  const plans = db.prepare("SELECT COUNT(*) AS n FROM one_trip_render_plans").get();
  const pages = db.prepare("SELECT COUNT(DISTINCT page_id) AS n FROM one_trip_render_plans").get();
  if (stamp?.version !== 0 || plans.n !== 5321 || pages.n !== 45) {
    throw new Error(`deck prep sanity failed: ${JSON.stringify({ stamp, plans, pages })}`);
  }
  db.close();
}

// ---- resolve the 45 planned page names from the plans table ----------------
const pageNames: string[] = [];
{
  const db = new Database(DECK, { readonly: true });
  const ids = db.prepare("SELECT DISTINCT page_id FROM one_trip_render_plans ORDER BY page_id").all();
  for (const { page_id } of ids) {
    const card = db.prepare("SELECT name FROM cards WHERE id = ? AND trash = 0").get(page_id);
    if (card?.name) pageNames.push(card.name);
  }
  db.close();
}
if (pageNames.length !== 45) {
  throw new Error(`expected 45 planned pages, resolved ${pageNames.length}`);
}

// ---- the counting driver ---------------------------------------------------
interface Captured { sql: string; params: unknown[] }
class CountingDriver implements SQLDatabaseDriver {
  trips = 0;
  statements = 0;
  readonly captured: Captured[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.trips += 1;
    this.statements += 1;
    this.captured.push({ sql, params });
    return this.inner.query<T>(sql, params);
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    this.trips += 1;
    this.statements += statements.length;
    for (const s of statements) this.captured.push({ sql: s.sql, params: s.params });
    return this.inner.batch(statements);
  }
}

function seatClass(sql: string): string | undefined {
  if (/one_trip_edges|one_trip_render_plans/.test(sql)) return "one-trip-seat-head";
  if (/json_each\(\?\)/.test(sql)) return "one-trip-seat-chunk";
  return undefined;
}

function familyHistogram(captured: Captured[]): Record<string, number> {
  const families: Record<string, number> = {};
  for (const { sql } of captured) {
    const f = seatClass(sql) ?? classifyResidueStatement(sql) ?? "unclassified";
    families[f] = (families[f] ?? 0) + 1;
  }
  return families;
}

type Posture = "OFF" | "ON";

async function renderOnce(posture: Posture, page: string) {
  const prevOne = process.env.DECKO_ONE_TRIP;
  const prevStore = process.env.DECKO_ONE_TRIP_STORE;
  if (posture === "OFF") {
    delete process.env.DECKO_ONE_TRIP;
    delete process.env.DECKO_ONE_TRIP_STORE;
  } else {
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
  }
  const counter = new CountingDriver(new LocalSqliteDriver({ path: DECK, readonly: true }));
  const t0 = Date.now();
  try {
    const { render } = await bootEngine(counter);
    const html = await render.render(page, "open", {});
    return {
      posture,
      page,
      trips: counter.trips,
      statements: counter.statements,
      families: familyHistogram(counter.captured),
      htmlBytes: Buffer.byteLength(html, "utf8"),
      htmlNormalizedSha256: createHash("sha256").update(normalizeSlotIds(html), "utf8").digest("hex"),
      localWallMs: Date.now() - t0,
      error: null as string | null,
    };
  } catch (error) {
    return {
      posture,
      page,
      trips: counter.trips,
      statements: counter.statements,
      families: familyHistogram(counter.captured),
      htmlBytes: 0,
      htmlNormalizedSha256: "",
      localWallMs: Date.now() - t0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (prevOne === undefined) delete process.env.DECKO_ONE_TRIP;
    else process.env.DECKO_ONE_TRIP = prevOne;
    if (prevStore === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
    else process.env.DECKO_ONE_TRIP_STORE = prevStore;
  }
}

// ---- run -------------------------------------------------------------------
const rows: Awaited<ReturnType<typeof renderOnce>>[] = [];
for (const page of pageNames) {
  for (const posture of ["OFF", "ON"] as Posture[]) {
    const r = await renderOnce(posture, page);
    rows.push(r);
    console.log(
      `${page.padEnd(40)} ${posture.padEnd(4)} trips=${String(r.trips).padStart(4)} stmts=${String(r.statements).padStart(5)} bytes=${String(r.htmlBytes).padStart(7)} wall=${String(r.localWallMs).padStart(6)}ms ${r.error ?? ""}`,
    );
  }
}

const perPage = pageNames.map((page) => {
  const off = rows.find((r) => r.page === page && r.posture === "OFF")!;
  const on = rows.find((r) => r.page === page && r.posture === "ON")!;
  return {
    page,
    off: { trips: off.trips, statements: off.statements, bytes: off.htmlBytes, sha: off.htmlNormalizedSha256, families: off.families, wallMs: off.localWallMs, error: off.error },
    on: { trips: on.trips, statements: on.statements, bytes: on.htmlBytes, sha: on.htmlNormalizedSha256, families: on.families, wallMs: on.localWallMs, error: on.error },
    byteIdenticalOffVsOn: off.htmlNormalizedSha256 !== "" && off.htmlNormalizedSha256 === on.htmlNormalizedSha256,
    oneTripReached: on.trips === 1 && on.error === null,
  };
});

const identical = perPage.filter((p) => p.byteIdenticalOffVsOn).length;
const oneTrip = perPage.filter((p) => p.oneTripReached).length;
const summary = {
  deck: DECK,
  lineage: "lane-onetrip-build-2026-10-06 (worktree decko-ts-lane-onetrip-build-2026-10-06)",
  pages: pageNames.length,
  byteIdenticalPages: identical,
  oneTripPages: oneTrip,
  tripsOnHistogram: perPage.reduce<Record<number, number>>((acc, p) => {
    acc[p.on.trips] = (acc[p.on.trips] ?? 0) + 1;
    return acc;
  }, {}),
};
writeFileSync(OUT, JSON.stringify({ summary, perPage, rows }, null, 2));
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
console.log(`WROTE ${OUT}`);
