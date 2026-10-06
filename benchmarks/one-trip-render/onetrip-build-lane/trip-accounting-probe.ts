// trip-accounting-probe.ts — one-trip build lane (A1 performance), adapted
// from the arch lane's 11-trip-accounting-probe.ts. Per-TRIP accounting for
// named pages: prints every round trip in order with its statement count and
// the head of each statement, so the trip count's composition is an
// observation, not an inference. Run against THIS lane's worktree line.
import { createRequire } from "node:module";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { bootEngine } from "../../../tests/card/one-trip/one-trip-fixture.js";

const DECK =
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/one-trip-per-page-work/decks/onetrip-build-lane-45p.sqlite3";
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["Laundry", "Home"];

const require = createRequire("C:/localProjects/decko-ts-lane-onetrip-build-2026-10-06/package.json");
void require;

interface Trip { kind: "query" | "batch"; n: number; sqls: string[] }
class TripDriver implements SQLDatabaseDriver {
  readonly trips: Trip[] = [];
  private current: Trip | undefined;
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    void this.current;
    const t: Trip = { kind: "query", n: 1, sqls: [sql] };
    this.trips.push(t);
    return this.inner.query<T>(sql, params);
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const t: Trip = { kind: "batch", n: statements.length, sqls: statements.map((s) => s.sql) };
    this.trips.push(t);
    return this.inner.batch(statements);
  }
}

function label(sql: string): string {
  if (/one_trip_edges|one_trip_render_plans/.test(sql)) return "SEAT-HEAD (walk CTE + plan cell + member ids)";
  if (/json_each\(\?\)/.test(sql)) return "SEAT-CHUNK (card window)";
  if (/deck_data_version/i.test(sql)) return "FRESHNESS-STAMP (live)";
  if (/codename IS NOT NULL|codename IN \('anyone'/i.test(sql)) return "boot-codenames";
  if (/WITH RECURSIVE (reached|anc|name_walk)/i.test(sql)) {
    if (/name_walk/.test(sql)) return `reached-cte:name_walk(${sql.includes("*structure") || /key = \? OR name = \?/.test(sql) ? "bound-setting" : "?"})`;
    return "reached-cte:" + (sql.includes("anc") ? "anc" : "reached");
  }
  if (/rules\.id AS ruleId/i.test(sql)) return "reached-cte:viewTask (0-bind)";
  if (/SELECT DISTINCT j\.\*/i.test(sql)) return "side-key-join (DISTINCT)";
  if (/json_object\(/i.test(sql) && /json_each\(/i.test(sql)) return "closure-json-id-list (folded)";
  if (/WHERE "key" .*IN \(/i.test(sql)) return "cards-key-multi/point";
  if (/left_id = \? AND right_id = \?/i.test(sql)) return "pair-exists";
  if (/SELECT \* FROM cards WHERE id = \?/i.test(sql)) return "point-row-by-id";
  if (/SELECT \* FROM cards WHERE key = \?/i.test(sql)) return "point-row-by-key";
  return sql.replace(/\s+/g, " ").slice(0, 60);
}

process.env.DECKO_ONE_TRIP = "1";
process.env.DECKO_ONE_TRIP_STORE = "inline";
for (const page of PAGES) {
  const driver = new TripDriver(new LocalSqliteDriver({ path: DECK, readonly: true }));
  const { render } = await bootEngine(driver);
  const t0 = Date.now();
  const html = await render.render(page, "open", {});
  console.log(`\n=== ${page}: ${driver.trips.length} trips, ${driver.trips.reduce((a, t) => a + t.n, 0)} statements, ${Buffer.byteLength(html)} bytes, ${Date.now() - t0} ms ===`);
  driver.trips.forEach((t, i) => {
    const labels = t.sqls.map(label);
    const distinct = [...new Set(labels)];
    console.log(`  trip ${i + 1} [${t.kind}] ${t.n} stmt${t.n === 1 ? "" : "s"}: ${distinct.length === 1 ? distinct[0] : distinct.slice(0, 4).join(" ; ") + (distinct.length > 4 ? ` ; +${distinct.length - 4} more` : "")}`);
  });
}
