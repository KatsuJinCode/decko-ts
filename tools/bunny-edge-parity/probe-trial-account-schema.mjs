// probe-trial-account-schema.mjs — read the account/session substrate of the
// TRIAL edge database so a throwaway account can be seeded with the exact
// shape the deployed engine authenticates against.
//
// WHY IT EXISTS: the deployed edge read path is anonymous-only (no cookie is
// ever parsed on GET), so an "authenticated parity" measurement needs a real
// actor in the DB before it can even test whether the session is honored.
// This tool answers: does auth_sessions exist on the trial DB, what are the
// account cards, and what does an existing account holder look like.
//
// SECRETS: creds are read by key name, used as a bearer, never printed. Only
// column names, row counts and non-secret card names are emitted.

import { readFileSync } from "node:fs";

// The credentials file location is machine-local and arrives through the
// environment; this script never carries a built-in creds path.
const CREDS_PATH = process.env.BUNNY_CREDS;

function readCreds(path) {
  const raw = readFileSync(path, "utf8");
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim() : undefined;
  };
  const url = get("BUNNY_TRIAL_DB_URL");
  const token = get("BUNNY_TRIAL_DB_TOKEN");
  if (!url || !token) throw new Error("creds missing BUNNY_TRIAL_DB_URL/TOKEN");
  return { url, token };
}

export function pipelineEndpoint(rawUrl) {
  return `${rawUrl.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "")}/v2/pipeline`;
}

/** One statement, args bound as libsql text/integers. */
export async function query(endpoint, token, sql, args = []) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(sqlArg) } },
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`pipeline HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const entry = body.results?.[0];
  if (entry?.type === "error") throw new Error(`sql error: ${entry.error?.message ?? "unknown"}`);
  const rows = entry?.response?.result?.rows ?? [];
  const cols = (entry?.response?.result?.cols ?? []).map((c) => c.name);
  return {
    cols,
    rows: rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, decode(r[i])]))),
    // Hrana v2 reports write effects here, not as a RETURNING row; the
    // seeder needs last_insert_rowid to chain holder -> field inserts.
    affected: entry?.response?.result?.affected_row_count ?? null,
    lastInsertRowid:
      entry?.response?.result?.last_insert_rowid !== undefined &&
      entry?.response?.result?.last_insert_rowid !== null
        ? Number(entry.response.result.last_insert_rowid)
        : null,
  };
}

function sqlArg(a) {
  if (typeof a === "number" && Number.isInteger(a)) return { type: "integer", value: String(a) };
  if (typeof a === "number") return { type: "float", value: a };
  if (a === null) return { type: "null" };
  return { type: "text", value: String(a) };
}

function decode(cell) {
  if (!cell || typeof cell !== "object") return null;
  if ("value" in cell) {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (v.bigint !== undefined) return Number(v.bigint);
    return v;
  }
  return null;
}

async function main() {
  if (!CREDS_PATH) {
    console.error("REFUSAL: set BUNNY_CREDS to the credentials file path (no built-in creds location)");
    process.exit(2);
  }
  const { url, token } = readCreds(CREDS_PATH);
  const endpoint = pipelineEndpoint(url);
  const out = {};

  out.auth_sessions_ddl = (
    await query(endpoint, token, "SELECT sql FROM sqlite_master WHERE name='auth_sessions'")
  ).rows.map((r) => r.sql);

  out.auth_sessions_count = (
    await query(endpoint, token, "SELECT COUNT(*) AS n FROM auth_sessions")
  ).rows[0]?.n;

  out.cards_columns = (
    await query(endpoint, token, "SELECT name FROM pragma_table_info('cards')")
  ).rows.map((r) => r.name);

  out.references_columns = (
    await query(endpoint, token, "SELECT name FROM pragma_table_info('card_references')")
  ).rows.map((r) => r.name);

  // Every account-codename card, with the lengths only (never hash bytes).
  out.account_cards = (
    await query(
      endpoint,
      token,
      `SELECT c.id AS id, c.name AS name, c.key AS key, c.codename AS codename,
              c.type_id AS type_id, c.trash AS trash, c.db_content AS db_content
         FROM cards c
        WHERE c.name LIKE '%+*account%' OR c.name LIKE '%+*email%'
           OR c.name LIKE '%+*password%' OR c.name LIKE '%+*salt%'
           OR c.name LIKE '%+*status%' OR c.name LIKE '%+*web%'
        ORDER BY c.id`,
    )
  ).rows.map((r) => ({ ...r, db_content: r.db_content ? String(r.db_content).slice(0, 400) : null }));

  out.account_names_all = (
    await query(
      endpoint,
      token,
      `SELECT DISTINCT name FROM cards WHERE name LIKE '%+*account%' ORDER BY name`,
    )
  ).rows.map((r) => r.name);

  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch((e) => {
    console.error("PROBE FAILED:", e.message);
    process.exit(1);
  });
}
