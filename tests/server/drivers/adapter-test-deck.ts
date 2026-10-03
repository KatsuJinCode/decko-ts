// The shared adapter TEST DECK: one set of fixtures, queries and expected
// outputs exercised through EVERY SQLDatabaseDriver adapter, producing one
// canonical transcript per adapter. The transcripts must be byte-identical
// across adapters — that is the cross-adapter guarantee the per-adapter
// conformance suite (tests/server/drivers/conformance.ts) cannot express:
// it pins each adapter to fixed expectations, so two adapters could drift
// APART while each still passes. This deck pins them to EACH OTHER and to
// a fixed expected transcript. Upstream promise: decko-commons/decko#1282
// ("a shared conformance suite proving every adapter identical").
//
// Canonicalization rules — the transcript normalizes the provider
// differences that docs/driver-notes.md documents as deliberate, so the
// bytes that REMAIN comparable are values, row order, and counters:
//
// - Values: numbers as num:<JSON>, bigints as int:<decimal>, strings as
//   str:<JSON>, null as null, byte-like values (Buffer / Uint8Array /
//   ArrayBuffer — the documented per-adapter wrapper types) as
//   bytes:<lowercase hex>. The BYTES are the fixture; the JS wrapper type
//   is not (docs/driver-notes.md, "Blob params / returns" row).
// - Error steps record the FACT of a throw, never the message: error text
//   is provider-specific ("D1_ERROR: near ..." vs Hrana SQLITE_ERROR vs
//   SqliteError) by design. Liveness after the error is asserted instead.
// - rowsRead/rowsWritten are omitted: only D1 surfaces them and the driver
//   contract defines absent as "not surfaced", not a comparable zero
//   (src/server/driver.ts field docs).
// - lastInsertRowId is BigInt-normalized and recorded for deck-declared
//   writes; reads omit it because SQLite tracks it per connection, so
//   remote adapters legitimately surface the previous insert's rowid while
//   LocalSqliteDriver omits it (the same documented leniency as
//   conformance.ts).
// - BLOB bind params travel as fixture hex and each provider's bindBlob()
//   converts to ITS documented wrapper; the SQL text, the byte values and
//   every scalar param are identical across adapters.
// - The deck avoids float aggregates (a SUM over INTEGER, never AVG over
//   floats) and orders every read by a unique key, so no cross-SQLite-build
//   floating-point or ordering ambiguity can enter the transcript.

import type { SQLDatabaseDriver, SQLQueryResult } from "../../../src/server/driver.js";
import { createHash } from "node:crypto";

export interface DeckDriver {
  /** Human-readable adapter label used in transcripts' failure reports. */
  readonly label: string;
  readonly driver: SQLDatabaseDriver;
  /** Convert a fixture-hex byte string into this provider's documented BLOB
   *  bind wrapper. Must return a fresh value each call (no shared buffers). */
  bindBlob(hex: string): unknown;
}

export type DeckParam = number | string | null | { readonly bytesHex: string };

export interface DeckWriteStep {
  readonly kind: "exec";
  readonly name: string;
  readonly sql: string;
  readonly params: readonly DeckParam[];
}

export interface DeckReadStep {
  readonly kind: "read";
  readonly name: string;
  readonly sql: string;
  readonly params: readonly DeckParam[];
  /** Column order the transcript serializes rows in (the SELECT list). */
  readonly columns: readonly string[];
}

export interface DeckBatchStep {
  readonly kind: "batch";
  readonly name: string;
  readonly statements: readonly {
    readonly sql: string;
    readonly params: readonly DeckParam[];
    /** Present for read statements inside the batch. */
    readonly readColumns?: readonly string[];
  }[];
}

export interface DeckErrorStep {
  readonly kind: "error";
  readonly name: string;
  readonly sql: string;
}

export type DeckStep = DeckWriteStep | DeckReadStep | DeckBatchStep | DeckErrorStep;

// ---------------------------------------------------------------------------
// Fixtures — the ONE deck every adapter runs
// ---------------------------------------------------------------------------

export const DECK_FIXTURES = {
  unicodeText: "déjà vu ☕ — quotes 'single' and \"double\"",
  plainText: "plain",
  longText: "z".repeat(300),
  batchedText: "batched",
  untypedColText: "untyped-col text",
  updatedText: "updated",
  blobAHex: "00ff107f",
  blobBHex: "8001fe0a",
} as const;

const F = DECK_FIXTURES;

export const DECK_STEPS: readonly DeckStep[] = [
  {
    kind: "exec",
    name: "01-create",
    sql: "CREATE TABLE conf_deck (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER, f REAL, s TEXT, b BLOB, z)",
    params: [],
  },
  {
    kind: "exec",
    name: "02-insert-a",
    sql: "INSERT INTO conf_deck (n, f, s, b, z) VALUES (?, ?, ?, ?, ?)",
    params: [-3, 2.25, F.unicodeText, { bytesHex: F.blobAHex }, null],
  },
  {
    kind: "exec",
    name: "03-insert-b",
    sql: "INSERT INTO conf_deck (n, f, s, b, z) VALUES (?, ?, ?, ?, ?)",
    params: [42, -0.5, F.plainText, null, null],
  },
  {
    kind: "exec",
    name: "04-insert-c",
    sql: "INSERT INTO conf_deck (n, f, s, b, z) VALUES (?, ?, ?, ?, ?)",
    params: [7, 1000.125, F.longText, { bytesHex: F.blobBHex }, F.untypedColText],
  },
  {
    kind: "batch",
    name: "05-batch-insert-and-count",
    statements: [
      {
        sql: "INSERT INTO conf_deck (n, f, s, b, z) VALUES (?, ?, ?, ?, ?)",
        params: [1, 1.5, F.batchedText, { bytesHex: F.blobBHex }, null],
      },
      { sql: "SELECT COUNT(*) AS c FROM conf_deck", params: [], readColumns: ["c"] },
    ],
  },
  {
    kind: "read",
    name: "06-read-all",
    sql: "SELECT id, n, f, s, z FROM conf_deck ORDER BY id",
    params: [],
    columns: ["id", "n", "f", "s", "z"],
  },
  {
    kind: "read",
    name: "07-read-blobs",
    sql: "SELECT id, b FROM conf_deck WHERE n IN (?, ?) ORDER BY id",
    params: [-3, 1],
    columns: ["id", "b"],
  },
  {
    kind: "read",
    name: "08-read-like",
    sql: "SELECT id, s FROM conf_deck WHERE s LIKE ? ORDER BY id",
    params: ["plain%"],
    columns: ["id", "s"],
  },
  {
    kind: "read",
    name: "09-read-sum",
    sql: "SELECT SUM(n) AS total, COUNT(*) AS c FROM conf_deck",
    params: [],
    columns: ["total", "c"],
  },
  {
    kind: "read",
    name: "10-read-floats",
    sql: "SELECT f FROM conf_deck ORDER BY id",
    params: [],
    columns: ["f"],
  },
  {
    kind: "error",
    name: "11-error-probe",
    sql: "SELEC 1",
  },
  {
    kind: "read",
    name: "12-read-after-error",
    sql: "SELECT COUNT(*) AS c FROM conf_deck",
    params: [],
    columns: ["c"],
  },
  {
    kind: "exec",
    name: "13-exec-update",
    sql: "UPDATE conf_deck SET z = ? WHERE n = ?",
    params: [F.updatedText, 42],
  },
  {
    kind: "read",
    name: "14-read-updated",
    sql: "SELECT z FROM conf_deck WHERE n = ? ORDER BY id",
    params: [42],
    columns: ["z"],
  },
  {
    kind: "read",
    name: "15-read-empty",
    sql: "SELECT id FROM conf_deck WHERE n = ? ORDER BY id",
    params: [999_999],
    columns: ["id"],
  },
];

// ---------------------------------------------------------------------------
// Canonical serialization
// ---------------------------------------------------------------------------

const TRANSCRIPT_HEADER = "adapter-deck v1 (2026-10-03) canonical transcript";

function canonicalValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "number") return `num:${JSON.stringify(v)}`;
  if (typeof v === "bigint") return `int:${v.toString()}`;
  if (typeof v === "string") return `str:${JSON.stringify(v)}`;
  const bytes = canonicalBytes(v);
  if (bytes !== undefined) {
    return `bytes:${Buffer.from(bytes).toString("hex")}`;
  }
  // Never silently coerce: an unexpected value shape must surface as a
  // transcript the expected fixture will reject.
  return `unexpected:${typeof v}:${String(v)}`;
}

/** The byte-wrapper family the adapters actually return, normalized to its
 *  bytes:
 *
 *  - Buffer / Uint8Array — LocalSqliteDriver and LibSqlHttpAdapter.
 *    Detected via Object.prototype.toString, NOT instanceof: cross-realm
 *    values would otherwise be missed.
 *  - ArrayBuffer — the documented @libsql/client shape.
 *  - a plain Array whose every element is an integer 0..255 — the shape
 *    miniflare's LOCAL D1 emulation hands back for BLOB columns (verified
 *    live: constructor Array, all-number elements; the emulation's
 *    serialization drops the typed-array wrapper). Production D1 is a
 *    documented unknown (docs/driver-notes.md "What remains unproven");
 *    the all-bytes guard keeps this normalization from ever eating a
 *    non-blob Array. */
function canonicalBytes(v: unknown): Uint8Array | undefined {
  const tag = Object.prototype.toString.call(v);
  if (tag === "[object Uint8Array]") return v as Uint8Array;
  if (tag === "[object ArrayBuffer]") return new Uint8Array(v as ArrayBuffer);
  if (Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)) {
    return Uint8Array.from(v as number[]);
  }
  return undefined;
}

function canonicalExecLine(name: string, r: SQLQueryResult, recordLastInsertRowId: boolean): string {
  const rid =
    recordLastInsertRowId && r.lastInsertRowId !== undefined
      ? `int:${BigInt(r.lastInsertRowId).toString()}`
      : "-";
  return `exec ${name} rowsAffected=num:${JSON.stringify(r.rowsAffected)} lastInsertRowId=${rid}`;
}

function canonicalReadLines(name: string, r: SQLQueryResult<Record<string, unknown>>, columns: readonly string[]): string[] {
  const out = [`read ${name} rows=${r.rows.length}`];
  for (const row of r.rows) {
    const cells = columns.map((c) => `${c}=${canonicalValue(row[c])}`);
    out.push(`  row ${cells.join(" | ")}`);
  }
  return out;
}

function resolveParams(params: readonly DeckParam[], dd: DeckDriver): unknown[] {
  return params.map((p) => (p !== null && typeof p === "object" && "bytesHex" in p ? dd.bindBlob(p.bytesHex) : p));
}

/** Run the WHOLE deck through one adapter and return its canonical
 *  transcript (LF-terminated lines). */
export async function runAdapterDeck(dd: DeckDriver): Promise<string> {
  const lines: string[] = [TRANSCRIPT_HEADER];
  for (const step of DECK_STEPS) {
    switch (step.kind) {
      case "exec": {
        const r = await dd.driver.query(step.sql, resolveParams(step.params, dd));
        lines.push(canonicalExecLine(step.name, r, true));
        break;
      }
      case "read": {
        const r = await dd.driver.query<Record<string, unknown>>(step.sql, resolveParams(step.params, dd));
        lines.push(...canonicalReadLines(step.name, r, step.columns));
        break;
      }
      case "batch": {
        const results = await dd.driver.batch(
          step.statements.map((s) => ({ sql: s.sql, params: resolveParams(s.params, dd) })),
        );
        if (results.length !== step.statements.length) {
          throw new Error(`deck step ${step.name}: expected ${step.statements.length} batch results, got ${results.length}`);
        }
        lines.push(`batch ${step.name} results=${results.length}`);
        step.statements.forEach((s, i) => {
          const r = results[i] as SQLQueryResult;
          if (s.readColumns !== undefined) {
            for (const l of canonicalReadLines(`[${i}]`, r as SQLQueryResult<Record<string, unknown>>, s.readColumns)) {
              lines.push(`  ${l}`);
            }
          } else {
            lines.push(`  ${canonicalExecLine(`[${i}]`, r, true)}`);
          }
        });
        break;
      }
      case "error": {
        let threw = false;
        try {
          await dd.driver.query(step.sql, []);
        } catch {
          threw = true;
        }
        lines.push(`error ${step.name} thrown=${threw ? "yes" : "NO-THROW"}`);
        break;
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** SHA-256 of a transcript — the byte-identity witness the test reports. */
export function transcriptSha256(transcript: string): string {
  return createHash("sha256").update(transcript, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// The expected transcript (fixed fixture, shared by every adapter)
// ---------------------------------------------------------------------------

function expectedRead(name: string, columns: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const out = [`read ${name} rows=${rows.length}`];
  for (const row of rows) {
    out.push(`  row ${row.map((v, i) => `${columns[i]}=${v}`).join(" | ")}`);
  }
  return out;
}

const E = canonicalValue;

/** The deck's expected output, computed once from the fixtures. Every
 *  adapter's transcript must equal this BYTE FOR BYTE (and therefore every
 *  adapter equals every other). */
export const EXPECTED_TRANSCRIPT: string = [
  TRANSCRIPT_HEADER,
  "exec 01-create rowsAffected=num:0 lastInsertRowId=-",
  "exec 02-insert-a rowsAffected=num:1 lastInsertRowId=int:1",
  "exec 03-insert-b rowsAffected=num:1 lastInsertRowId=int:2",
  "exec 04-insert-c rowsAffected=num:1 lastInsertRowId=int:3",
  "batch 05-batch-insert-and-count results=2",
  "  exec [0] rowsAffected=num:1 lastInsertRowId=int:4",
  "  read [1] rows=1",
  "    row c=num:4",
  ...expectedRead("06-read-all", ["id", "n", "f", "s", "z"], [
    ["num:1", "num:-3", E(2.25), E(F.unicodeText), "null"],
    ["num:2", "num:42", E(-0.5), E(F.plainText), "null"],
    ["num:3", "num:7", E(1000.125), E(F.longText), E(F.untypedColText)],
    ["num:4", "num:1", E(1.5), E(F.batchedText), "null"],
  ]),
  ...expectedRead("07-read-blobs", ["id", "b"], [
    ["num:1", `bytes:${F.blobAHex}`],
    ["num:4", `bytes:${F.blobBHex}`],
  ]),
  ...expectedRead("08-read-like", ["id", "s"], [["num:2", E(F.plainText)]]),
  ...expectedRead("09-read-sum", ["total", "c"], [["num:47", "num:4"]]),
  ...expectedRead("10-read-floats", ["f"], [["num:2.25"], ["num:-0.5"], ["num:1000.125"], ["num:1.5"]]),
  "error 11-error-probe thrown=yes",
  ...expectedRead("12-read-after-error", ["c"], [["num:4"]]),
  "exec 13-exec-update rowsAffected=num:1 lastInsertRowId=int:4",
  ...expectedRead("14-read-updated", ["z"], [[E(F.updatedText)]]),
  ...expectedRead("15-read-empty", ["id"], []),
].join("\n") + "\n";
