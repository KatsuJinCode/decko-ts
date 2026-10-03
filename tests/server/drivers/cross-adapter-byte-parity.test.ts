// Cross-adapter BYTE PARITY: the shared test deck (adapter-test-deck.ts) is
// run through EVERY SQLDatabaseDriver adapter — LocalSqliteDriver,
// LibSqlHttpAdapter (over the protocol-faithful mock Hrana server),
// CloudflareD1Adapter (miniflare local D1) and the @libsql/client file:
// cross-check wrapper — and every transcript must be BYTE-IDENTICAL, both
// to each other and to the deck's fixed expected transcript.
//
// This is the strongest form of the #1282 conformance promise ("a shared
// conformance suite proving every adapter identical"): the per-adapter
// conformance suite pins each adapter to fixed expectations; THIS suite
// additionally pins the adapters to each other, so no two adapters can
// drift apart while each individually still passes.
//
// Same fixtures, same queries, same expected outputs; only each provider's
// documented bind wrapper differs (see adapter-test-deck.ts header for the
// canonicalization rules and docs/driver-notes.md for the provider
// differences being normalized).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createClient, type Client, type InValue } from "@libsql/client";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { CloudflareD1Adapter } from "../../../src/server/drivers/d1.js";
import { LibSqlHttpAdapter } from "../../../src/server/drivers/libsql-http.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { startMockHranaServer, type MockHranaServer } from "./mock-hrana-server.js";
import {
  runAdapterDeck,
  transcriptSha256,
  EXPECTED_TRANSCRIPT,
  type DeckDriver,
} from "./adapter-test-deck.js";

// -- Local SQLite (temp file) -------------------------------------------------

const sqliteTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "decko-deck-parity-sqlite-"));

// -- @libsql/client file: cross-check wrapper ---------------------------------

const libsqlTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "decko-deck-parity-libsql-"));
const libsqlDbPath = path.join(libsqlTempDir, "deck.db").replace(/\\/g, "/");

class LibSqlClientFileDriver implements SQLDatabaseDriver {
  constructor(private readonly client: Client) {}

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const rs = await this.client.execute({ sql, args: params as InValue[] });
    return {
      rows: rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]]))) as T[],
      rowsAffected: rs.rowsAffected,
      lastInsertRowId: rowIdOrOmit(rs.lastInsertRowid),
    };
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    // "write" mode = transactional batch, matching the other adapters.
    const rss = await this.client.batch(
      statements.map((s) => ({ sql: s.sql, args: s.params as InValue[] })),
      "write",
    );
    return rss.map((rs) => ({
      rows: rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, row[i]]))),
      rowsAffected: rs.rowsAffected,
      lastInsertRowId: rowIdOrOmit(rs.lastInsertRowid),
    }));
  }

  close(): void {
    this.client.close();
  }
}

/** The driver contract's documented 0-rule, applied here too: SQLite
 *  reports 0 for "no insert happened" (e.g. CREATE TABLE DDL, observed
 *  live: @libsql/client 0.18.0 returns 0n there) and 0 becomes "omitted",
 *  exactly as LocalSqliteDriver and CloudflareD1Adapter already normalize
 *  it (local-sqlite.ts rowIdOrOmit, d1.ts rowIdOrOmit). */
function rowIdOrOmit(lastInsertRowid: bigint | undefined): bigint | undefined {
  return lastInsertRowid !== undefined && lastInsertRowid > 0n ? lastInsertRowid : undefined;
}

// -- Harness state ------------------------------------------------------------

interface AdapterRun {
  readonly label: string;
  readonly transcript: string;
}

let runs: AdapterRun[] = [];
let mockServer: MockHranaServer | undefined;
let mf: Miniflare | undefined;
let libsqlDriver: LibSqlClientFileDriver | undefined;
let localDriver: LocalSqliteDriver | undefined;

beforeAll(async () => {
  // 1. LocalSqliteDriver, file-backed fresh temp db.
  localDriver = new LocalSqliteDriver({
    path: path.join(sqliteTempDir, "deck.db"),
  });

  // 2. LibSqlHttpAdapter over the mock Hrana server (fresh in-memory store).
  mockServer = await startMockHranaServer();
  const libsqlHttp = new LibSqlHttpAdapter({
    url: mockServer.url,
    authToken: "deck-parity-token",
    timeoutMs: 10_000,
  });

  // 3. CloudflareD1Adapter under miniflare's local D1 (fresh ephemeral db).
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: `export default { fetch() { return new Response("ok"); } }`,
      d1Databases: { DB: "deck-parity" },
    }),
  );
  const d1Binding = await mf.getD1Database("DB");
  const d1 = new CloudflareD1Adapter(d1Binding);

  // 4. @libsql/client file: URL cross-check (fresh temp db).
  libsqlDriver = new LibSqlClientFileDriver(createClient({ url: "file:" + libsqlDbPath }));

  const deckDrivers: DeckDriver[] = [
    {
      label: "local-sqlite (better-sqlite3 file)",
      driver: localDriver,
      // better-sqlite3 binds BLOBs as Buffer (docs/driver-notes.md).
      bindBlob: (hex) => Buffer.from(hex, "hex"),
    },
    {
      label: "libsql-http (mock Hrana v2 server)",
      driver: libsqlHttp,
      // LibSqlHttpAdapter binds BLOBs as Uint8Array (base64 on the wire).
      bindBlob: (hex) => new Uint8Array(Buffer.from(hex, "hex")),
    },
    {
      label: "cloudflare-d1 (miniflare local D1)",
      driver: d1,
      // D1 binds ArrayBuffer/Uint8Array as BLOB (docs/driver-notes.md);
      // the copy avoids Buffer's pooled backing store.
      bindBlob: (hex) => new Uint8Array(Buffer.from(hex, "hex")),
    },
    {
      label: "@libsql/client (file: URL, cross-check)",
      driver: libsqlDriver,
      // InValue accepts Uint8Array (@libsql/core api.d.ts).
      bindBlob: (hex) => new Uint8Array(Buffer.from(hex, "hex")),
    },
  ];

  runs = [];
  for (const dd of deckDrivers) {
    runs.push({ label: dd.label, transcript: await runAdapterDeck(dd) });
  }
}, 120_000);

afterAll(async () => {
  localDriver?.close();
  libsqlDriver?.close();
  await mockServer?.close();
  await mf?.dispose();
  // Swallow cleanup failures (Windows file-lock lag); temp litter is fine.
  try {
    fs.rmSync(sqliteTempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch { /* temp litter is acceptable */ }
  try {
    fs.rmSync(libsqlTempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch { /* temp litter is acceptable */ }
});

// -- Helpers -------------------------------------------------------------------

function transcriptReport(): string {
  return runs.map((r) => `  ${r.label}: sha256=${transcriptSha256(r.transcript)} (${Buffer.byteLength(r.transcript, "utf8")} bytes)`).join("\n");
}

function firstDiffContext(a: string, b: string): string {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  const from = Math.max(0, i - 60);
  return `first divergence at byte ${i}:\n  A ...${JSON.stringify(a.slice(from, i + 80))}\n  B ...${JSON.stringify(b.slice(from, i + 80))}`;
}

// -- The parity gates -----------------------------------------------------------

describe("cross-adapter byte parity: one deck through every adapter", () => {
  it("produces byte-identical transcripts across ALL adapters", () => {
    expect(runs.map((r) => r.label)).toHaveLength(4);
    const base = runs[0] as AdapterRun;
    for (const r of runs.slice(1)) {
      expect(r.transcript, `${r.label} vs ${base.label}: ${firstDiffContext(base.transcript, r.transcript)}\ntranscripts:\n${transcriptReport()}`).toBe(
        base.transcript,
      );
    }
  });

  it("every adapter's transcript matches the deck's EXPECTED transcript byte-for-byte", () => {
    for (const r of runs) {
      expect(
        r.transcript,
        `${r.label} vs expected fixture: ${firstDiffContext(EXPECTED_TRANSCRIPT, r.transcript)}\ntranscripts:\n${transcriptReport()}`,
      ).toBe(EXPECTED_TRANSCRIPT);
    }
  });

  it("the promise's named pair — CloudflareD1Adapter and LibSqlHttpAdapter — are byte-identical", () => {
    const d1 = runs.find((r) => r.label.startsWith("cloudflare-d1"));
    const libsql = runs.find((r) => r.label.startsWith("libsql-http"));
    expect(d1, transcriptReport()).toBeDefined();
    expect(libsql, transcriptReport()).toBeDefined();
    expect((libsql as AdapterRun).transcript, firstDiffContext((d1 as AdapterRun).transcript, (libsql as AdapterRun).transcript)).toBe(
      (d1 as AdapterRun).transcript,
    );
  });
});
