// End-to-end smoke test: boot the worker entry under miniflare's local D1
// (workerd), apply the real schema, seed "Hello World" + "Home", and verify
// the documented routes return the documented shapes.
//
// This is the M2 acceptance test — proves the worker.ts entry wires the
// engine through D1 cleanly without a real Cloudflare account.
//
// On Windows: miniflare 5 alpha boots workerd cleanly via convertV4MiniflareOptions
// (see docs/driver-notes.md for the v4/v5 shape saga and why we wrap).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import type { D1Database } from "@cloudflare/workers-types";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function splitSqlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (ch === ";") {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((s) => s !== "");
}

// Inline the worker as a miniflare script. Vite exports transformWithEsbuild
// (workerd sees ES modules; we feed it JS stripped of TS type annotations).
// This is the SAME pipeline wrangler uses internally — the test exercises
// the production-shape code, not a transpiled approximation.
import { transformWithEsbuild } from "vite";
import workerTsSource from "../worker.ts?raw";

async function compileWorker(): Promise<string> {
  const result = await transformWithEsbuild(workerTsSource, "worker.ts", {
    loader: "ts",
    format: "esm",
    target: "es2022",
    sourcemap: false,
  });
  return result.code;
}

describe("worker entry — full E2E under miniflare (M2 smoke)", () => {
  let mf: Miniflare | undefined;
  let db: D1Database | undefined;

  beforeAll(async () => {
    const script = await compileWorker();
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script,
        d1Databases: { DB: "decko-worker-m2-smoke" },
      }),
    );
    db = await mf.getD1Database("DB");

    // Apply the real SQLite schema (same DDL file `wrangler d1 execute` runs
    // against production). We strip the PRAGMA (D1 doesn't honor it; D1's
    // journal mode is WAL by default and foreign keys are off by default).
    const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
    const statements = splitSqlStatements(ddl).filter((s) => !s.toUpperCase().startsWith("PRAGMA"));
    for (const statement of statements) {
      await db.prepare(statement).run();
    }

    // Seed the minimum "deck" for the M2 demo:
    //   Home   (id=1) : the root
    //   Hello World (id=2) : a leaf
    //   +Hello (id=3, left=1, right=2) : the compound junction
    await db.prepare(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 2, NULL)`,
    ).bind(1, "Home", "home", "2026-09-19 00:00:00.000", "2026-09-19 00:00:00.000").run();
    await db.prepare(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 2, 'Welcome to the decko-ts demo running on Cloudflare Workers.')`,
    ).bind(2, "Hello World", "hello_world", "2026-09-19 00:00:00.000", "2026-09-19 00:00:00.000").run();
    await db.prepare(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 2, NULL)`,
    ).bind(3, 1, 2, "2026-09-19 00:00:00.000", "2026-09-19 00:00:00.000").run();
  }, 180_000);

  afterAll(async () => {
    await mf?.dispose();
  });

  it("GET / returns Home card HTML", async () => {
    const res = await mf!.fetch("https://example.com/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/html/);
    const body = await res.text();
    expect(body).toContain("<!doctype html>");
  });

  it("GET /api/status returns engine metadata JSON", async () => {
    const res = await mf!.fetch("https://example.com/api/status");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^application\/json/);
    const body = await res.json() as { ok: boolean; runtime: string; engine: string };
    expect(body.ok).toBe(true);
    expect(body.runtime).toBe("workers");
    expect(body.engine).toBe("decko-ts");
  });

  it("GET /api/card/Hello+World returns card metadata JSON", async () => {
    const res = await mf!.fetch("https://example.com/api/card/Hello+World");
    expect(res.status).toBe(200);
    const body = await res.json() as { id: number; name: string; key: string };
    expect(body.id).toBe(2);
    expect(body.name).toBe("Hello World");
    expect(body.key).toBe("hello_world");
  });

  it("GET /api/card/Missing returns 404 JSON", async () => {
    const res = await mf!.fetch("https://example.com/api/card/Missing");
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string; name: string };
    expect(body.error).toBe("card not found");
    expect(body.name).toBe("Missing");
  });

  it("GET /Hello+World renders that card's :open view", async () => {
    const res = await mf!.fetch("https://example.com/Hello+World");
    expect(res.status).toBe(200);
    const body = await res.text();
    // The open view emits a bar/accordion wrapping for known cardtypes.
    // Without real rule cards this is the basic scaffold — we just confirm
    // the worker returned the card-slot wrapper (the engine ran end-to-end).
    expect(body).toContain("card-slot");
  });

  it("GET /Hello+World/content returns the :content view", async () => {
    const res = await mf!.fetch("https://example.com/Hello+World/content");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Welcome to the decko-ts demo");
  });

  it("GET /NoSuchPath returns 404 HTML", async () => {
    const res = await mf!.fetch("https://example.com/no/such/path/with/bad/view");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("Not found");
  });
});
