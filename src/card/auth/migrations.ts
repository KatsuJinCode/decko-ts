// Tiny migration runner for the auth layer's own DDL
// (db/migrations/*.sql). Deliberately minimal: the deploy stream applies the
// same files through its own tooling (wrangler d1 migrations), this runner
// exists so local engines and tests can bring a database up without it.
//
// Idempotency is doubly ensured: the DDL itself is CREATE ... IF NOT EXISTS
// (the deploy stream's tooling has no access to this runner's bookkeeping
// table, so a deploy-applied database must not error when re-run here), and
// applied versions are recorded in an auth_migrations table and skipped on
// re-run.
//
// Node-only (node:fs for reading the migrations directory). Edge deployments
// never import this module — the deploy stream owns applying migrations
// there.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import { sqlDateTime } from "./session-store.js";

export interface AuthMigrationRunResult {
  /** Migration file names (sorted) applied by THIS run. */
  applied: string[];
  /** Migration file names already recorded as applied (skipped). */
  skipped: string[];
}

export interface AuthMigrationRunOptions {
  /** Directory holding the ordered *.sql migration files. Defaults to the
   *  repo's db/migrations. */
  migrationsDir?: string;
  /** Clock for the bookkeeping rows' applied_at. */
  now?: () => Date;
}

// The repo's db/migrations, resolved LAZILY and memoized.
//
// 2026-10-02 (the Cloudflare Worker write path): this was a module-scope `const`. It
// is lazy for the same reason src/card/render/bootstrap-code-files.ts moved.
// Evaluating `new URL(..., import.meta.url)` at IMPORT time is a module-load
// side effect, and it throws "Invalid URL string" on any runtime whose
// import.meta.url is not absolute — a Cloudflare Workers runtime among them —
// where the failure is the whole Worker refusing to START, before request
// one. This module reaches the Workers graph only as a re-export of the auth
// barrel (src/card/auth/index.ts:30-35), which the write path imports
// (write-routes.ts:98), so the crash landed on the Deploy button's
// worker.js. This is not a Workers special case: nothing in this module can
// do anything without node:fs, so resolving the directory means nothing until
// a caller actually calls runAuthMigrations — and by then the runtime is
// known to be a Node one.
let defaultMigrationsDir: string | undefined;
function DEFAULT_MIGRATIONS_DIR(): string {
  defaultMigrationsDir ??= fileURLToPath(
    new URL("../../../db/migrations", import.meta.url),
  );
  return defaultMigrationsDir;
}

/** The runner's own bookkeeping table (NOT part of the migration files —
 *  the deploy stream has its own version tracking, e.g. d1_migrations). */
const ENSURE_BOOKKEEPING_SQL = `
  CREATE TABLE IF NOT EXISTS "auth_migrations" (
    "version"    TEXT NOT NULL PRIMARY KEY,
    "applied_at" TEXT NOT NULL
  )`;

/**
 * Apply every not-yet-applied *.sql file in the migrations directory, in
 * filename order. Each file's statements run as one driver batch (atomic on
 * the adapters that transact batches — see the driver conformance notes)
 * together with its bookkeeping INSERT.
 */
export async function runAuthMigrations(
  driver: SQLDatabaseDriver,
  options: AuthMigrationRunOptions = {},
): Promise<AuthMigrationRunResult> {
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR();
  const now = options.now ?? (() => new Date());
  await driver.query(ENSURE_BOOKKEEPING_SQL, []);

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const alreadyApplied = await driver.query<{ version: string }>(
      "SELECT version FROM auth_migrations WHERE version = ?",
      [file],
    );
    if (alreadyApplied.rows.length > 0) {
      skipped.push(file);
      continue;
    }
    const ddl = readFileSync(`${migrationsDir}/${file}`, "utf8");
    const statements = splitSqlStatements(ddl);
    await driver.batch([
      ...statements.map((sql) => ({ sql, params: [] as unknown[] })),
      {
        sql: "INSERT INTO auth_migrations (version, applied_at) VALUES (?, ?)",
        params: [file, sqlDateTime(now())],
      },
    ]);
    applied.push(file);
  }
  return { applied, skipped };
}

/** Split a DDL file into individual statements on ";" — valid for plain
 *  CREATE TABLE / CREATE INDEX files (no triggers, no semicolons inside
 *  string literals; the auth migrations are exactly that shape). Line
 *  comments are stripped BEFORE the split so a comment's punctuation can
 *  never fragment a statement. Trailing empties dropped. */
export function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql.replace(/--[^\n]*/g, "");
  return withoutLineComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
