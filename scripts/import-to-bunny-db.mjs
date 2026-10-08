#!/usr/bin/env node
// Import a deck sqlite file into Bunny Database.
// Uses the HTTP /v2/pipeline endpoint (libSQL-compatible, the protocol the
// Bunny SQL API documents at https://bunny.net/docs/database/connect/sql-api.md).
// Schema first, then rows chunked at <=500. Reports rows written.
//
// USAGE (TRIAL / SMALL SCALE — this is the path to use first):
//   BUNNY_DB_URL=libsql://<id>-<name>.lite.bunnydb.net/ \
//   BUNNY_DB_TOKEN=<jwt> \
//   node scripts/import-to-bunny-db.mjs --limit 200
//
//   --limit N        import at most N rows PER TABLE (small-scale seed; the
//                    whole-deck import is the default only when omitted)
//   --tables a,b     only these tables (default: every non-sqlite table)
//   --source PATH    source sqlite file
//                    (default tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3)
//   --creds PATH     KEY=VALUE file to read BUNNY_DB_URL / BUNNY_DB_TOKEN from
//   --chunk-size N   rows per pipeline POST (max 500)
//   --schema-only    create tables, import no rows
//   --data-only      skip the schema phase (target already has the schema)
//   --dry-run        count and report, issue no writes
//
// CREDENTIALS, in resolution order (2026-10-01 change):
//   1. BUNNY_DB_URL / BUNNY_DB_TOKEN environment variables
//   2. --creds <path>
//   3. (nothing — the script exits 2 with the message below)
// Credentials are never defaulted to any particular account: a trial-account
// import must not be able to silently write to a production account. Pass
// --creds explicitly if you mean a particular file.

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalIndexStatements, isRetiredIndex } from '../tools/migrate/serving-indexes.mjs';

// Flags accept both "--name value" and "--name=value". The old parser only
// understood "--name=value": a space-separated value was dropped on the floor
// and the flag silently became boolean `true` (so "--source <path>" once
// resolved to the default source and reported the default path as missing).
const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) {
      args[m[1]] = m[2];
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[m[1]] = argv[++i];
    } else {
      args[m[1]] = true;
    }
  }
}
const DRY_RUN = !!args['dry-run'];
const CHUNK = Math.min(500, Number(args['chunk-size'] ?? 500));
const SCHEMA_ONLY = !!args['schema-only'];
const DATA_ONLY = !!args['data-only'];
// Per-table row cap for a small-scale seed. 0 = no cap (whole deck).
const LIMIT = Number(args['limit'] ?? 0);
const TABLE_FILTER = typeof args['tables'] === 'string'
  ? args['tables'].split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// creds: env first, then an explicit --creds path, then nothing.
let DB_URL = process.env.BUNNY_DB_URL;
let TOKEN = process.env.BUNNY_DB_TOKEN;
if ((!DB_URL || !TOKEN) && typeof args['creds'] === 'string') {
  const credsPath = resolve(String(args['creds']));
  if (!existsSync(credsPath)) {
    console.error(`--creds file not found: ${credsPath}`);
    process.exit(2);
  }
  const creds = Object.fromEntries(
    readFileSync(credsPath, 'utf8').split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const eq = l.indexOf('=');
        return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
      }),
  );
  DB_URL = DB_URL || creds.BUNNY_DB_URL;
  TOKEN = TOKEN || creds.BUNNY_DB_TOKEN;
}
if (!DB_URL || !TOKEN) {
  console.error(
    'No database credentials.\n' +
    '  Set BUNNY_DB_URL and BUNNY_DB_TOKEN in the environment, or pass --creds <path-to-file>.\n' +
    '  (This script no longer falls back to the production-account creds file.)',
  );
  process.exit(2);
}
console.log(`target: ${DB_URL.replace(/\/\/[^@]*@/, '//<redacted>@')}`);
// derive HTTP endpoint from libsql:// URL
// libsql://<account-id>-<db-name>.lite.bunnydb.net/
//   -> https://<account-id>-<db-name>.lite.bunnydb.net/v2/pipeline
const httpBase = DB_URL.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
const PIPELINE_URL = `${httpBase}/v2/pipeline`;

const SOURCE_DB = resolve(
  repoRoot,
  typeof args['source'] === 'string' ? String(args['source']) : 'tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3',
);
if (!existsSync(SOURCE_DB)) {
  console.error(`source database not found: ${SOURCE_DB}`);
  process.exit(2);
}
const source = new Database(SOURCE_DB, { readonly: true });

const allTables = source.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).all();
const tables = TABLE_FILTER
  ? allTables.filter((t) => TABLE_FILTER.includes(t.name))
  : allTables;
const missing = TABLE_FILTER ? TABLE_FILTER.filter((n) => !allTables.some((t) => t.name === n)) : [];
if (missing.length > 0) {
  console.error(`--tables names not present in ${SOURCE_DB}: ${missing.join(', ')}`);
  process.exit(2);
}
if (LIMIT > 0) {
  console.log(`row cap: ${LIMIT} rows per table (small-scale seed)`);
}


// Quote an identifier for SQL: keep it double-quoted; map " -> "".
function quoteIdent(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }

// Convert SQLite value to a libSQL arg shape (object with type+value).
// Bunny libSQL accepts: null, integer, float, text, blob. Booleans serialize as 0/1
// integers; we coerce unknown shapes to text.
function valueToArg(v) {
  if (v === null || v === undefined) return { type: 'null', value: null };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { type: 'integer', value: String(v) };
    return { type: 'float', value: String(v) };
  }
  if (typeof v === 'bigint') return { type: 'integer', value: String(v) };
  if (v instanceof Uint8Array) {
    // base64-encode
    return { type: 'blob', value: Buffer.from(v).toString('base64') };
  }
  return { type: 'text', value: String(v) };
}

// Pipeline POST. Returns parsed result or throws.
let totalRequests = 0;
let totalWriteCalls = 0;
let totalRowsWritten = 0;
async function execPipeline(requests) {
  if (DRY_RUN) {
    totalRequests += requests.length;
    return { results: requests.map(() => ({ type: 'ok', response: { type: 'execute' } })) };
  }
  totalRequests += requests.length;
  const res = await fetch(PIPELINE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  const json = await res.json();
  // Validate every result is "ok"; report the first non-ok.
  if (json.results) {
    for (let i = 0; i < json.results.length; i++) {
      const r = json.results[i];
      if (r.type !== 'ok') {
        const stmt = requests[i]?.stmt?.sql || 'unknown';
        throw new Error(`SQL failed for ${stmt.slice(0, 100)}: ${JSON.stringify(r)}`);
      }
    }
  }
  return json;
}

// Chunked insert.
async function insertChunk(table, cols, rows) {
  const colList = cols.map(quoteIdent).join(',');
  const placeholders = cols.map(() => '?').join(',');
  const sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`;
  const requests = rows.map((row) => ({
    type: 'execute',
    stmt: { sql, args: row.map(valueToArg) },
  }));
  const result = await execPipeline(requests);
  totalWriteCalls += requests.length;
  // rows_written per execute is only the last value; sum from results
  if (result.results) {
    for (const r of result.results) {
      const rw = r?.response?.result?.rows_written;
      if (typeof rw === 'number') totalRowsWritten += rw;
    }
  }
}

// SCHEMA phase
if (!DATA_ONLY) {
  console.log('== SCHEMA phase ==');
  console.log(`  ${tables.length} tables to create`);

  // Indexes come from the source database too, and must be copied in the
  // same phase. This script used to select only `type='table'`, so every
  // database it imported landed with zero indexes: the planner then
  // full-scanned `cards` for every point read. Select `type='index'` and
  // keep only entries that carry their own SQL -- the implicit
  // `sqlite_autoindex_*` rows have none, because SQLite creates those for
  // UNIQUE constraints declared inside CREATE TABLE.
  const allIndexes = source.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name",
  ).all();
  // Indexes the canonical schema has retired (cards_trash_index) are not
  // copied, even when the source still carries them.
  const indexes = (TABLE_FILTER
    ? allIndexes.filter((i) =>
        TABLE_FILTER.some((t) => new RegExp(`ON\\s+"?${t}"?\\s*\\(`).test(i.sql ?? '')))
    : allIndexes).filter((i) => !isRetiredIndex(i.name));

  const requests = tables.map((t) => ({ type: 'execute', stmt: { sql: t.sql } }));
  for (const i of indexes) {
    requests.push({ type: 'execute', stmt: { sql: i.sql } });
  }
  // Then the canonical index set from db/schema.sqlite.sql (IF NOT EXISTS),
  // so a source built before an index joined the schema cannot hand its gap
  // to the imported database. Bunny Database rejects ANALYZE, so the planner
  // never has statistics there; the serving-path indexes in the canonical
  // set are what keep its plans off a whole-table read.
  const canonical = canonicalIndexStatements({ tables: tables.map((t) => t.name) });
  for (const c of canonical) {
    requests.push({ type: 'execute', stmt: { sql: c.sql } });
  }
  console.log(`  ${indexes.length} source indexes + ${canonical.length} canonical indexes (IF NOT EXISTS) to create`);
  // One big batch is fine for CREATE TABLE; chunk it for safety.
  const SCHEMA_CHUNK = 10;
  for (let i = 0; i < requests.length; i += SCHEMA_CHUNK) {
    const slice = requests.slice(i, i + SCHEMA_CHUNK);
    await execPipeline(slice);
    process.stdout.write(`  schema progress: ${Math.min(i + SCHEMA_CHUNK, requests.length)}/${requests.length}\r`);
  }
  console.log(`\n  schema done (${requests.length} statements)`);
}

if (SCHEMA_ONLY) {
  console.log('schema-only mode; exiting');
  source.close();
  process.exit(0);
}

// DATA phase
console.log('== DATA phase ==');
console.log(`  chunk size: ${CHUNK}`);

const t0 = Date.now();
for (const t of tables) {
  // Pull columns from pragma; use them in INSERT order.
  const colInfo = source.prepare(`PRAGMA table_info(${quoteIdent(t.name)})`).all();
  const cols = colInfo.map((c) => c.name);
  if (cols.length === 0) continue;

  const sel = source.prepare(`SELECT ${cols.map(quoteIdent).join(',')} FROM ${quoteIdent(t.name)}`);
  let buf = [];
  let written = 0;
  let chunkIdx = 0;
  let capped = false;
  const it = sel.iterate();
  for (const row of it) {
    if (LIMIT > 0 && written + buf.length >= LIMIT) { capped = true; break; }
    buf.push(cols.map((c) => row[c]));
    if (buf.length >= CHUNK) {
      await insertChunk(t.name, cols, buf);
      written += buf.length;
      buf = [];
      chunkIdx++;
    }
  }
  if (buf.length > 0) {
    await insertChunk(t.name, cols, buf);
    written += buf.length;
    chunkIdx++;
  }
  const total = source.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(t.name)}`).get().n;
  console.log(`  ${t.name}: ${written} rows in ${chunkIdx} chunks${capped ? ` (capped at --limit ${LIMIT} of ${total})` : ` (of ${total})`}`);
}
// No ANALYZE phase. Bunny Database answers ANALYZE (and PRAGMA optimize) with
// "SQL_PARSE_ERROR: unsupported statement", and refuses to create
// sqlite_stat1 by hand ("object name reserved for internal use"), so planner
// statistics cannot exist there. The canonical serving-path indexes applied
// in the schema phase are written for that no-statistics planner.

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n== DONE ==`);
console.log(`  rows written (sum of rows_written per response): ${totalRowsWritten}`);
console.log(`  execute requests sent: ${totalWriteCalls} (+ ${tables.length} schema + close per batch)`);
console.log(`  elapsed: ${elapsed}s`);
if (DRY_RUN) console.log('  (dry run — no writes were issued)');

source.close();