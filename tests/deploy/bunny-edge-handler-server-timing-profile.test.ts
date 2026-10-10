// The EDGE PROFILER lane (2026-10-05) — per-phase Server-Timing on every
// response the Bunny edge full-engine handler produces.
//
// WHY: signed-in requests skip the prepared-page stores and run the full
// statement ladder (measured 2026-10-05: home 45.4 s, member pages 504 at
// the 59 s platform wall) while anonymous prepared pages serve in
// 0.04-0.6 s — and NOTHING on the wire says WHERE a slow request spent its
// time. This suite pins the instrument: every response carries
//
//   Server-Timing: auth;dur=X, seat;dur=Y, db;dur=Z;stmt=N, render;dur=W, total;dur=T
//
// (the standard header — curl -v shows it, profilers read it natively),
// with phase ordering fixed and the db phase's stmt=N surfacing the deck
// driver's own statement counter (BunnyDbQueryCounterLike — statements that
// actually hit the wire; render-plan-replayed reads never reach the driver
// and are honestly absent).
//
// PHASE SEMANTICS (pinned here so the header cannot drift):
//   auth   — session resolution wall (cookie scan + the session-store SQL
//            lookup when a cookie is present; ~0 cookieless)
//   seat   — the prepared-page cache layer wall OUTSIDE the render closure
//            (L2 Cache API match + L3 global render-cache lookup/store)
//   db     — AGGREGATE wall across the isolate's Bunny DB pipeline POSTs
//            during this request (deck ladder + session lookup + L3 tier
//            hops all hit the same database; overlaps the other phases by
//            design — it is an aggregate, not a disjoint slice)
//   render — the render closure wall (handleEngineRequest incl. its db)
//   total  — the whole handler wall
//
// ZERO BEHAVIOR CHANGE: the profiler only ADDS the Server-Timing header;
// bodies, statuses, and every pre-existing header (X-Decko-* included) are
// pinned unchanged by the sibling suites (handler parity runs against the
// same fixture). The db ledger rides the driver's OWN seams — the pluggable
// queryCounter and the injectable fetchImpl — so no driver source changes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import {
  edgeDbLedgerSnapshot,
  EDGE_SERVER_TIMING_HEADER,
  serverTimingHeaderValue,
  startEdgeRequestProfile,
  type EdgeRequestProfile,
} from "../../deploy/bunny-worker-src/bunny-edge-server-timing.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

const CREDENTIAL_ENV = {
  BUNNY_DATABASE_URL: "https://fixture-db.lite.bunnydb.net",
  BUNNY_DATABASE_AUTH_TOKEN: "fixture-token",
};

/** Translate BunnyDbDriver's Hrana-v2 pipeline POSTs into local sqlite
 *  queries — the SAME translator the handler parity suite uses (the real
 *  driver runs against the local fixture; globalThis.fetch is stubbed
 *  before the first request boots the deck, and the profiler's timing
 *  fetchImpl resolves globalThis.fetch lazily at call time so this stub is
 *  what runs). */
function makeBunnyFetchStub(driver: LocalSqliteDriver): typeof fetch {
  const encodeCell = (value: unknown): Record<string, unknown> => {
    if (value === null || value === undefined) return { type: "null" };
    if (typeof value === "number") {
      return Number.isInteger(value)
        ? { type: "integer", value: String(value) }
        : { type: "float", value };
    }
    return { type: "text", value: String(value) };
  };
  return (async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      requests: Array<
        | { type: "execute"; stmt: { sql: string; args: Array<Record<string, unknown>> } }
        | { type: "close" }
      >;
    };
    const results = [];
    for (const request of body.requests ?? []) {
      if (request.type !== "execute") {
        results.push({ type: "ok", response: { type: "close" } });
        continue;
      }
      const args = (request.stmt.args ?? []).map((arg) => {
        if (arg.type === "null") return null;
        if (arg.type === "integer") return Number(arg.value);
        if (arg.type === "float") return arg.value;
        return arg.value;
      });
      const result = await driver.query<Record<string, unknown>>(request.stmt.sql, args);
      const cols: string[] = [];
      for (const row of result.rows) {
        for (const key of Object.keys(row)) {
          if (!cols.includes(key)) cols.push(key);
        }
      }
      results.push({
        type: "ok",
        response: {
          type: "execute",
          result: {
            cols: cols.map((name) => ({ name })),
            rows: result.rows.map((row) => cols.map((col) => encodeCell(row[col]))),
            affected_row_count: 0,
          },
        },
      });
    }
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

let driver: LocalSqliteDriver | undefined;
let handler: (request: Request, env: Record<string, string | undefined>) => Promise<Response>;

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    const sql = readFileSync(file, "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await driver.query(statement, []);
    }
  }
  // The page-shell rows — byte-identical to the handler parity suite's
  // fixture (same cites; see that suite for the CodenameNotFoundError
  // boundary this row set closes).
  const T = "2026-09-20 00:00:00.000";
  const insert = (values: string): string =>
    `INSERT OR IGNORE INTO cards (\n` +
    `  id, name, key, codename, left_id, right_id, current_revision_id,\n` +
    `  created_at, updated_at, creator_id, updater_id,\n` +
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content\n` +
    `) VALUES (\n${values}\n)`;
  for (const statement of [
    insert(`22746, '*all', '*all', 'all', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22747, '*layout', '*layout', 'layout', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22748, NULL, NULL, NULL, 22746, 22747, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, 'Default Layout'`),
    insert(`22749, 'Default Layout', 'default_layout', NULL, NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 22756, '<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>'`),
    insert(`22750, '*header', '*header', 'header', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '<nav class="navbar navbar-expand-lg"><a class="navbar-brand" href="/">Site</a></nav>'`),
    insert(`22751, '*footer', '*footer', 'footer', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '<footer class="footer mt-auto py-3"><a href="/:latest">Decko v</a></footer>'`),
    insert(`22752, '*title', '*title', 'title', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, 'Test Site'`),
    insert(`22753, '*favicon', '*favicon', 'favicon', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '(my_bucket)/103/3649.jpg'`),
    insert(`22754, '*ace', '*ace', 'ace', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '{}'`),
    insert(`22755, '*tiny_mce', '*tiny_mce', 'tiny_mce', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, '{}'`),
    insert(`22756, 'Html', 'html', 'html', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
    insert(`22757, 'Basic', 'basic', 'basic', NULL, NULL, NULL, '${T}', '${T}', 1, 1, NULL, NULL, NULL, 0, 3, NULL`),
  ]) {
    await driver.query(statement, []);
  }
  // The stub must exist BEFORE the first request boots the deck.
  globalThis.fetch = makeBunnyFetchStub(driver!);
  const module = await import("../../deploy/bunny-worker-src/bunny-edge-engine-handler.js");
  handler = module.handleBunnyEngineRequest;
  // Warm the deck so the per-test db-ledger deltas measure REQUEST work,
  // not the one-time boot (the boot rides the first request's profile —
  // test 1 observes that honestly — but the counter-equality pin below
  // wants a stable isolate).
  const warm = await handler(new Request("https://decko-edge.test/"), CREDENTIAL_ENV);
  await warm.text();
});

afterAll(() => {
  driver?.close();
});

function get(path: string, init?: RequestInit): Promise<Response> {
  return handler(new Request(`https://decko-edge.test${path}`, init), CREDENTIAL_ENV);
}

/** Parse a Server-Timing header value into ordered [name, params] pairs. */
function parseServerTiming(value: string): Array<{ name: string; params: Record<string, string> }> {
  return value.split(",").map((metric) => {
    const parts = metric.trim().split(";").filter((p) => p.trim() !== "");
    const name = parts[0] ?? "";
    const params: Record<string, string> = {};
    for (const part of parts.slice(1)) {
      const eq = part.indexOf("=");
      if (eq >= 0) params[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return { name, params };
  });
}

function serverTimingOf(response: Response): Array<{ name: string; params: Record<string, string> }> {
  const value = response.headers.get(EDGE_SERVER_TIMING_HEADER);
  expect(value, "Server-Timing header must be present on every response").not.toBeNull();
  return parseServerTiming(value!);
}

const EXPECTED_PHASE_ORDER = ["auth", "seat", "db", "render", "total"];

describe("edge profiler — Server-Timing on every response", () => {
  it("a page render over the warm isolate carries the header with all five phases in order", async () => {
    // The deck is warm (beforeAll warmed it); the one-time boot rode that
    // first request's own profile.
    const response = await get("/");
    expect(response.status).toBe(200);
    const metrics = serverTimingOf(response);
    expect(metrics.map((m) => m.name)).toEqual(EXPECTED_PHASE_ORDER);
    await response.text();
  });

  it("the header names the phases in the fixed order: auth, seat, db, render, total", async () => {
    for (const path of ["/", "/_status", "/No+Such+Card", "/api/card/About"]) {
      const response = await get(path);
      await response.text();
      expect(serverTimingOf(response).map((m) => m.name)).toEqual(EXPECTED_PHASE_ORDER);
    }
  });

  it("every response class carries the header — /_status, read-only 403, 404, /api/card JSON", async () => {
    const probes: Array<[string, RequestInit | undefined, number]> = [
      ["/_status", undefined, 200],
      ["/Home", { method: "POST" }, 403],
      ["/No+Such+Card", undefined, 404],
      ["/api/card/About", undefined, 200],
    ];
    for (const [path, init, status] of probes) {
      const response = await get(path, init);
      expect(response.status).toBe(status);
      const metrics = serverTimingOf(response);
      // total is always present and is a non-negative integer.
      const total = metrics.find((m) => m.name === "total");
      expect(total).toBeDefined();
      expect(Number(total!.params.dur)).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(Number(total!.params.dur))).toBe(true);
      await response.text();
    }
  });

  it("db;dur and stmt are non-negative integers on a page render", async () => {
    const response = await get("/About");
    expect(response.status).toBe(200);
    const db = serverTimingOf(response).find((m) => m.name === "db");
    expect(db).toBeDefined();
    expect(db!.params.stmt).toBeDefined();
    expect(Number.isInteger(Number(db!.params.stmt))).toBe(true);
    expect(Number(db!.params.stmt)).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(Number(db!.params.dur))).toBe(true);
    expect(Number(db!.params.dur)).toBeGreaterThanOrEqual(0);
    await response.text();
  });

  it("stmt=N surfaces the DRIVER's own counter: the header equals the exposed ledger delta for the same request (known fixture)", async () => {
    const before = edgeDbLedgerSnapshot();
    const response = await get("/About/closed");
    expect(response.status).toBe(200);
    await response.text();
    const after = edgeDbLedgerSnapshot();
    const db = serverTimingOf(response).find((m) => m.name === "db");
    expect(db).toBeDefined();
    expect(Number(db!.params.stmt)).toBe(after.stmts - before.stmts);
    // And the render ladder is real: a page render over the fixture issues
    // statements (the deck driver's counter moved with the request).
    expect(Number(db!.params.stmt)).toBeGreaterThan(0);
  });

  it("phase walls are internally consistent: total >= render, total >= auth, total >= seat, total >= db", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    const metrics = serverTimingOf(response);
    const dur = (name: string): number => {
      const m = metrics.find((x) => x.name === name);
      expect(m).toBeDefined();
      return Number(m!.params.dur);
    };
    const total = dur("total");
    expect(total).toBeGreaterThanOrEqual(dur("render"));
    expect(total).toBeGreaterThanOrEqual(dur("auth"));
    expect(total).toBeGreaterThanOrEqual(dur("seat"));
    expect(total).toBeGreaterThanOrEqual(dur("db"));
    await response.text();
  });

  it("a cookie-carrying request resolves its session (auth phase runs the session-store SQL) and still carries the full header", async () => {
    // Unknown token: resolveViewerFromToken does the real lookupSession
    // SELECT over auth_sessions and degrades to anonymous (session-store
    // contract). The profile must show the full phase set regardless.
    const response = await get("/", {
      headers: { cookie: "decko_session=profile-lane-unknown-token" },
    });
    expect(response.status).toBe(200);
    expect(serverTimingOf(response).map((m) => m.name)).toEqual(EXPECTED_PHASE_ORDER);
    await response.text();
  });

  it("the pre-existing X-Decko-* headers are untouched when the cache flag is armed (profiler adds, never rewrites)", async () => {
    // Armed posture drives a SEPARATE env bag: the cache layers' diagnostic
    // headers must still be present beside the new Server-Timing header.
    const armed = await handler(
      new Request("https://decko-edge.test/About"),
      { ...CREDENTIAL_ENV, DECKO_EDGE_CACHE: "1" },
    );
    expect(armed.status).toBe(200);
    expect(serverTimingOf(armed).map((m) => m.name)).toEqual(EXPECTED_PHASE_ORDER);
    expect(armed.headers.get("X-Decko-Edge-Cache")).toContain("armed");
    await armed.text();
  });
});

describe("edge profiler — header format units", () => {
  it("serverTimingHeaderValue renders the exact pinned wire shape for a synthetic profile", async () => {
    const profile: EdgeRequestProfile = {
      t0: 1_000,
      authMs: 3.4,
      seatMs: 0,
      renderMs: 1_234.6,
      start: { dbMs: 500, posts: 10, stmts: 40, wireStmts: 0, driverOps: 0 },
    };
    // Freeze the ledger end so the db delta is known: +231.2 ms, +21
    // statements, +15 binding-carried statements and +5 logical driver
    // operations OVER THE PROFILE'S OWN start snapshot. total;dur is
    // wall-clock (t0 = 1_000, long past) — pinned as a prefix so the
    // assertion cannot flake on the clock.
    const value = serverTimingHeaderValue(profile, {
      dbMs: profile.start.dbMs + 231.2,
      posts: profile.start.posts + 5,
      stmts: profile.start.stmts + 21,
      wireStmts: profile.start.wireStmts + 15,
      driverOps: profile.start.driverOps + 5,
    });
    // The exact wire shape the operator sees (everything but total;dur).
    expect(
      value.startsWith(
        "auth;dur=3, seat;dur=0, db;dur=231;stmt=21;wire=15;ops=5, render;dur=1235, total;dur=",
      ),
    ).toBe(true);
    // The db metric's params ride one metric, comma-free.
    expect(value).not.toContain("db;dur=231,");
    expect(value).toContain("db;dur=231;stmt=21;wire=15;ops=5");
  });

  it("a host that does not measure at the binding boundary omits wire and ops instead of printing 0", () => {
    const profile: EdgeRequestProfile = {
      t0: 1_000,
      authMs: 0,
      seatMs: 0,
      renderMs: 5,
      start: { dbMs: 0, posts: 0, stmts: 0, wireStmts: 0, driverOps: 0 },
    };
    const value = serverTimingHeaderValue(profile, {
      dbMs: 20,
      posts: 3,
      stmts: 7,
      wireStmts: 0,
      driverOps: 0,
    });
    // The Bunny host's shape is unchanged: stmt only.
    expect(value).toContain("db;dur=20;stmt=7, render;dur=5");
    expect(value).not.toContain("wire=");
    expect(value).not.toContain("ops=");
  });

  it("startEdgeRequestProfile starts every phase at zero and snapshots the ledger", () => {
    const profile = startEdgeRequestProfile();
    expect(profile.authMs).toBe(0);
    expect(profile.seatMs).toBe(0);
    expect(profile.renderMs).toBe(0);
    expect(profile.start.dbMs).toBe(edgeDbLedgerSnapshot().dbMs);
    expect(profile.start.stmts).toBe(edgeDbLedgerSnapshot().stmts);
  });
});
