#!/usr/bin/env node
// Import tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3 into Bunny Database.
// Uses the HTTP /v2/pipeline endpoint (libSQL-compatible). Schema first, then
// rows chunked at <=500. Reports rows written.
//
// Reads credentials from C:\localProjects\brandonDojoTech\library\data\creds:
//   BUNNY_DB_URL, BUNNY_DB_TOKEN
//
// Usage: node scripts/import-to-bunny-db.mjs [--dry-run] [--chunk-size N]

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return [m[1], m[2] ?? true];
  }),
);
const DRY_RUN = !!args['dry-run'];
const CHUNK = Math.min(500, Number(args['chunk-size'] ?? 500));
const SCHEMA_ONLY = !!args['schema-only'];
const DATA_ONLY = !!args['data-only'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// creds
const credsPath = resolve(repoRoot, '../brandonDojoTech/library/data/creds');
const creds = Object.fromEntries(
  readFileSync(credsPath, 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const eq = l.indexOf('=');
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
    }),
);
const DB_URL = creds.BUNNY_DB_URL;
const TOKEN = creds.BUNNY_DB_TOKEN;
if (!DB_URL || !TOKEN) {
  console.error('Missing BUNNY_DB_URL or BUNNY_DB_TOKEN in creds');
  process.exit(1);
}
// derive HTTP endpoint from libsql:// URL
// libsql://01M3C77TGE0WTNWB2P4BMCQSJ3-cs-deck.lite.bunnydb.net/
//   -> https://01M3C77TGE0WTNWB2P4BMCQSJ3-cs-deck.lite.bunnydb.net/v2/pipeline
const httpBase = DB_URL.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
const PIPELINE_URL = `${httpBase}/v2/pipeline`;

const SOURCE_DB = resolve(repoRoot, 'tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3');
const source = new Database(SOURCE_DB, { readonly: true });

const tables = source.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).all();

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
  const requests = [];
  for (const t of tables) {
    requests.push({ type: 'execute', stmt: { sql: t.sql } });
  }
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
  const it = sel.iterate();
  for (const row of it) {
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
  console.log(`  ${t.name}: ${written} rows in ${chunkIdx} chunks`);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n== DONE ==`);
console.log(`  rows written (sum of rows_written per response): ${totalRowsWritten}`);
console.log(`  execute requests sent: ${totalWriteCalls} (+ ${tables.length} schema + close per batch)`);
console.log(`  elapsed: ${elapsed}s`);
if (DRY_RUN) console.log('  (dry run — no writes were issued)');

source.close();