// Smoke test for the Bunny Edge Scripting STANDALONE entry.
//
// Scope: everything that can be verified with NO bunny.net account and NO
// network call. The worker's request handler is driven against a mock database
// client, so this file never opens a socket: the injected CardClientFactory
// records what it was asked for and returns canned rows, and global fetch is
// replaced by a throwing spy to prove nothing sneaks out.
//
// The real deployment is operator-gated (trial account + pasted API key); the
// runbook for it is deploy/bunny-edge-trial-runbook.md.

import { describe, expect, it } from "vitest";

import {
  DB_CREDENTIAL_VAR_NAMES,
  handleRequest,
  resolveDbConfig,
  type CardClient,
  type CardClientConfig,
  type CardClientFactory,
} from "../../deploy/bunny-worker-src/bunny-worker.js";

// ---------------------------------------------------------------------------
// Mock database
// ---------------------------------------------------------------------------

interface MockDb {
  factory: CardClientFactory;
  /** Every config the handler passed to the factory, in call order. */
  configs: CardClientConfig[];
  /** Every statement the handler executed, in call order. */
  statements: { sql: string; args: unknown[] }[];
}

const CARDS: Record<string, Record<string, unknown>> = {
  Home: {
    id: 1,
    name: "Home",
    key: "*homepage*",
    codename: null,
    type_id: 1000,
    left_id: null,
    right_id: null,
    db_content: "welcome <b>home</b>",
    trash: 0,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-02 00:00:00",
  },
  "Special:All": {
    id: 42,
    name: "Special:All",
    key: null,
    codename: "all_cards",
    type_id: 1001,
    left_id: 1,
    right_id: null,
    db_content: null,
    trash: 0,
    created_at: "2026-01-03 00:00:00",
    updated_at: "2026-01-04 00:00:00",
  },
};

function mockDb(overrides: { cards?: Record<string, Record<string, unknown>> } = {}): MockDb {
  const cards = overrides.cards ?? CARDS;
  const db: MockDb = { factory: () => { throw new Error("factory not set"); }, configs: [], statements: [] };
  const client: CardClient = {
    async execute(statement, args) {
      const sql = typeof statement === "string" ? statement : statement.sql;
      const bound = typeof statement === "string" ? (args ?? []) : (statement.args ?? []);
      db.statements.push({ sql, args: bound });
      if (/COUNT\(\*\)/i.test(sql)) {
        return { rows: [{ n: Object.keys(cards).length }] };
      }
      const name = String(bound[0] ?? "");
      const row = cards[name];
      return { rows: row ? [row] : [] };
    },
  };
  db.factory = (config) => {
    db.configs.push(config);
    return client;
  };
  return db;
}

const TRIAL_ENV = {
  BUNNY_DATABASE_URL: "libsql://trial-placeholder.lite.bunnydb.net/",
  BUNNY_DATABASE_AUTH_TOKEN: "trial-token-placeholder",
};

function get(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bunny edge worker — env credential resolution", () => {
  it("prefers the name pair bunny.net itself injects (BUNNY_DATABASE_*)", () => {
    const resolved = resolveDbConfig({
      ...TRIAL_ENV,
      BUNNY_DB_URL: "libsql://legacy.lite.bunnydb.net/",
      BUNNY_DB_TOKEN: "legacy-token",
    });
    expect(resolved).toMatchObject({
      url: TRIAL_ENV.BUNNY_DATABASE_URL,
      authToken: TRIAL_ENV.BUNNY_DATABASE_AUTH_TOKEN,
      urlVar: "BUNNY_DATABASE_URL",
      tokenVar: "BUNNY_DATABASE_AUTH_TOKEN",
    });
  });

  it("still accepts the legacy BUNNY_DB_* pair when it is the only one set", () => {
    const resolved = resolveDbConfig({ BUNNY_DB_URL: "libsql://legacy.lite.bunnydb.net/", BUNNY_DB_TOKEN: "t" });
    expect(resolved).toMatchObject({ urlVar: "BUNNY_DB_URL", tokenVar: "BUNNY_DB_TOKEN" });
  });

  it("reports a half-set pair by name instead of silently ignoring it", () => {
    const resolved = resolveDbConfig({ BUNNY_DATABASE_URL: "libsql://x.lite.bunnydb.net/" });
    expect(resolved).toEqual({
      error: "BUNNY_DATABASE_URL is set but its partner (BUNNY_DATABASE_AUTH_TOKEN) is not",
    });
  });

  it("names both required variables when nothing is set", () => {
    const resolved = resolveDbConfig({});
    expect(resolved).toEqual({
      error: `no database credentials in env; set ${DB_CREDENTIAL_VAR_NAMES[0].url} and ${DB_CREDENTIAL_VAR_NAMES[0].token}`,
    });
  });

  it("passes the libsql:// URL through to the client verbatim", async () => {
    // @libsql/client/web rewrites a libsql: scheme to https: itself
    // (expandConfig(config, preferHttp=true)); the handler must not
    // pre-rewrite it or the value in the dashboard would stop matching.
    const db = mockDb();
    await handleRequest(get("/_status"), TRIAL_ENV, db.factory);
    expect(db.configs[0]).toEqual({
      url: TRIAL_ENV.BUNNY_DATABASE_URL,
      authToken: TRIAL_ENV.BUNNY_DATABASE_AUTH_TOKEN,
    });
  });
});

describe("bunny edge worker — routes", () => {
  it("GET / renders the Home card as HTML", async () => {
    const db = mockDb();
    const res = await handleRequest(get("/"), TRIAL_ENV, db.factory);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<h1>Home</h1>");
    expect(body).toContain("welcome &lt;b&gt;home&lt;/b&gt;");
    expect(db.statements[0]?.args).toEqual(["Home"]);
  });

  it("GET /<card> renders that card and escapes its content", async () => {
    const db = mockDb();
    const res = await handleRequest(get("/Special%3AAll"), TRIAL_ENV, db.factory);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<h1>Special:All</h1>");
    expect(body).toContain("all_cards");
    expect(db.statements[0]?.args).toEqual(["Special:All"]);
  });

  it("GET /<card>.json returns the record as JSON", async () => {
    const db = mockDb();
    const res = await handleRequest(get("/Home.json"), TRIAL_ENV, db.factory);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ id: 1, name: "Home", key: "*homepage*", type_id: 1000 });
  });

  it("GET /_status reports the card count and the env var NAMES, never values", async () => {
    const db = mockDb();
    const res = await handleRequest(get("/_status"), TRIAL_ENV, db.factory);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      engine: "decko-ts",
      runtime: "bunny-edge-scripting",
      database: {
        ok: true,
        driver: "@libsql/client/web",
        card_count: 2,
        url_var: "BUNNY_DATABASE_URL",
        token_var: "BUNNY_DATABASE_AUTH_TOKEN",
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("trial-token-placeholder");
    expect(serialized).not.toContain("trial-placeholder");
  });

  it("GET /_status reports 503 when the database call fails", async () => {
    const failing: CardClientFactory = () => ({
      async execute() {
        throw new Error("HTTP 401: bad token");
      },
    });
    const res = await handleRequest(get("/_status"), TRIAL_ENV, failing);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, database: { ok: false, error: "HTTP 401: bad token" } });
  });

  it("GET on a missing card is a 404, HTML for the page route and JSON for .json", async () => {
    const db = mockDb();
    const page = await handleRequest(get("/NoSuchCard"), TRIAL_ENV, db.factory);
    expect(page.status).toBe(404);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("Card not found");

    const json = await handleRequest(get("/NoSuchCard.json"), TRIAL_ENV, db.factory);
    expect(json.status).toBe(404);
    expect(await json.json()).toEqual({ error: "card not found", name: "NoSuchCard" });
  });

  it("non-GET is 405 and never opens a database client", async () => {
    const db = mockDb();
    const res = await handleRequest(new Request("https://script-placeholder.bunny.run/", { method: "POST" }), TRIAL_ENV, db.factory);
    expect(res.status).toBe(405);
    expect(db.configs).toHaveLength(0);
  });

  it("a multi-segment path is a card NAME, so it 404s as a card, not as a route", async () => {
    // Actual behaviour, unchanged from the Sept entry: everything after the
    // first slash is the card name, so "/a/b/c" looks up the card "a/b/c".
    // The handler's trailing `No route for <path>` 404 branch is therefore
    // unreachable (cardName is only ever null for a ".json" path, which is
    // handled earlier) — recorded in the receipt, not changed here.
    const db = mockDb();
    const res = await handleRequest(get("/a/b/c"), TRIAL_ENV, db.factory);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("card not found: a/b/c");
    expect(db.statements[0]?.args).toEqual(["a/b/c"]);
  });

  it("missing credentials is a 500 that names the variables, and no client is built", async () => {
    const db = mockDb();
    const res = await handleRequest(get("/"), {}, db.factory);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("BUNNY_DB_URL or BUNNY_DB_TOKEN missing from env");
    expect(body.detail).toContain("BUNNY_DATABASE_URL");
    expect(db.configs).toHaveLength(0);
  });

  it("a card-row error becomes a 500 with the message, not a thrown isolate", async () => {
    const exploding: CardClientFactory = () => ({
      async execute() {
        throw new Error("connection reset");
      },
    });
    const res = await handleRequest(get("/"), TRIAL_ENV, exploding);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server error", message: "connection reset" });
  });

  it("opens no network connection: every path is served by the injected client", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = ((input: unknown) => {
      calls.push(String(input));
      throw new Error("network access is not allowed in this test");
    }) as typeof fetch;
    try {
      const db = mockDb();
      for (const path of ["/", "/Home", "/Home.json", "/_status", "/Nope", "/Nope.json"]) {
        const res = await handleRequest(get(path), TRIAL_ENV, db.factory);
        expect(res.status).toBeGreaterThanOrEqual(200);
      }
      expect(calls).toEqual([]);
      expect(db.configs.length).toBe(6);
    } finally {
      globalThis.fetch = original;
    }
  });
});
