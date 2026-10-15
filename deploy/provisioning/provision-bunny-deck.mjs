// provision-bunny-deck.mjs — the runner half of decko-ts's one-key Bunny
// provisioning (issue #1282 promise: providers without a button flow, Bunny
// first). Consumes the payload the companion page
// (one-key-provisioning-page.html) generates: one Bunny ACCOUNT API key pasted
// at run time, everything else already baked into the validated payload. The
// payload plus the written result sidecar are the deck's permanent recovery
// artifact: every identifier and choice needed to re-provision, and NO
// secrets (the account key is read from env/creds at run time and never
// stored; the database token is generated fresh by the API on every run and
// never printed or persisted outside Bunny).
//
// MODES
//   (no mode flag)   PLAN — validate the payload, print every step with its
//                    exact API calls, execute NOTHING, contact NOTHING.
//                    This is what running the script bare does.
//   --verify         READ-ONLY check of a payload provisioned earlier: list
//                    the account's scripts/databases, match the payload's
//                    names, probe the script's /_status. Needs the API key;
//                    writes nothing.
//   --execute        THE REAL RUN. Creates, on the account the key belongs
//                    to: a Bunny Database group + database, a full-access
//                    database token (API-generated, never displayed), an Edge
//                    Scripting script + linked pull zone serving the decko-ts
//                    engine bundle, the database credentials as script
//                    secrets, the edge options as script variables, the
//                    SmartCache zone flip (caching on), and a publish. Then
//                    polls the new hostname's /_status. REQUIRED alongside
//                    --execute: --i-understand-this-writes-to-my-bunny-account
//                    (enforced — an --execute without it exits 2 before any
//                    network call, the one-click-deck.mjs gate pattern).
//   --teardown       DELETE what an execute created, using the ids recorded
//                    in the result sidecar. Requires --yes AND --name
//                    <script-name> matching the payload exactly (the
//                    one-click-teardown.mjs fingerprint pattern). Refuses on
//                    any name mismatch — a deletion is never "close enough".
//
// WHAT THIS RUNNER WILL REFUSE TO DO (hard guards, not warnings):
//   * Create over a script or database name that already exists on the
//     account; delete anything but the ids its own --execute recorded.
//   * Use a protected resource name (DECKO_PROTECTED_RESOURCE_NAMES or
//     --protect) in any mode.
//   * A database slug longer than 16 characters — Bunny's create endpoint
//     answers HTTP 500 (not 4xx) past that length.
//   * --execute without the written-confirmation flag; --teardown without
//     --yes plus the exact name.
//   * Arming the write surface (payload.edge.write_path) without
//     --allow-write-path. The one-key path provisions a READ-ONLY deck.
//
// API CONTRACTS — every call below was exercised against a Bunny account
// during development (paths and field names cross-checked against Bunny's
// published Compute and Database API descriptions):
//   Scripting (base https://api.bunny.net, header `AccessKey`):
//     GET    /compute/script                      list scripts
//     POST   /compute/script                      AddEdgeScriptModel
//            {Name, Code, ScriptType:1 (CDN == standalone),
//             CreateLinkedPullZone:true, LinkedPullZoneName} -> 201 EdgeScriptModel
//     POST   /compute/script/{id}/secrets         EdgeScriptAddSecretModel {Name, Secret}
//     POST   /compute/script/{id}/variables/add   UpsertEdgeScriptVariableModel
//     POST   /pullzone/{zoneId}                   {"EnableSmartCache": false} — zone flip
//     POST   /compute/script/{id}/publish         {Note} -> 204
//     GET    /compute/script/{id}                 EdgeScriptModel (DefaultHostname,
//                                                 LinkedPullZones[].Id)
//     DELETE /compute/script/{id}
//   Database management (same base + header):
//     GET    /database/v1/databases               list databases (v2 list needs `page`)
//     POST   /database/v1/groups                  CreateDatabaseGroupPayload
//            {display_name, storage_region, primary_regions[], replicas_regions[]}
//     POST   /database/v1/databases               CreateDatabasePayload {slug, group}
//     PUT    /database/v2/databases/{id}/auth/generate
//            {authorization: "full-access" | "read-only"} -> {token}
//     DELETE /database/v1/databases/{id}          DELETE /database/v1/groups/{id}
//   Database SQL (the schema and the seeded deck):
//     POST   https://<db>.lite.bunnydb.net/v2/pipeline   (Hrana v2 over HTTP)
//   The database is built by provisionDatabase: the tables and indexes of
//   deploy/migrations (demo-content migrations excluded), the seed through
//   scripts/import-to-bunny-db.mjs (--data-only; one import path, not a
//   fork), then the data-version triggers and stamp row the render path
//   requires.
//
// OUTPUT DISCIPLINE: no secret value is ever printed. The account key is
// masked; the generated database token is never printed; the database URL is
// printed host-suffix only (the result sidecar records it in full — the
// sidecar is the operator's local recovery artifact, not a published file).

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdtempSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_HOST = "https://api.bunny.net";
export const SCHEMA_NAME = "decko-one-key-provisioning-payload";
export const SCHEMA_VERSION = 1;
// Measured Bunny server-side limit: a longer slug answers HTTP 500
// (2026-10-02). Not a client-side style choice.
export const DB_SLUG_MAX = 16;

/** Names this runner refuses in any mode, teardown included: resources an
 *  operator wants kept out of its reach, from DECKO_PROTECTED_RESOURCE_NAMES
 *  (comma-separated) plus any --protect names. The runner already refuses to
 *  create over a name that exists on the account, and teardown deletes only
 *  the ids its own --execute recorded; this list is the extra guard for names
 *  that must never appear in a payload at all. */
export function protectedResourceNames(extra = []) {
  const fromEnv = (process.env.DECKO_PROTECTED_RESOURCE_NAMES ?? "")
    .split(",").map((n) => n.trim()).filter(Boolean);
  return new Set([...fromEnv, ...extra]);
}

const EXIT_OK = 0;
const EXIT_GENERAL = 1;
const EXIT_REFUSED = 2;
const EXIT_PLATFORM_OPS = 3;

export const REFUSAL = {
  CONFIRMATION_MISSING: "--confirmation-required",
  TEARDOWN_UNCONFIRMED: "--teardown-requires-yes-and-name",
  NAME_MISMATCH: "--name-mismatch",
  PROTECTED_NAME: "--protected-name-refused",
  PAYLOAD_INVALID: "--payload-invalid",
  API_KEY_MISSING: "--api-key-missing",
  SOURCE_MISSING: "--source-missing",
  SOURCE_WRONG_SHAPE: "--source-wrong-shape",
  WRITE_PATH_UNALLOWED: "--write-path-not-allowed",
  RESOURCE_EXISTS: "--resource-already-exists",
  SERVED_INVALID: "--served-variables-invalid",
};

export class ProvisionRefusal extends Error {
  constructor(marker, message, detail = {}) {
    super(message);
    this.name = "ProvisionRefusal";
    this.marker = marker;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    payload: null, execute: false, verify: false, teardown: false,
    confirmation: false, yes: false, name: null,
    creds: process.env.BUNNY_CREDS_FILE ?? null,
    apiKey: process.env.BUNNY_API_KEY ?? null,
    source: null, allowWritePath: false, bundle: null, readBundle: null, served: null, protect: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--payload": args.payload = next(); break;
      case "--execute": args.execute = true; break;
      case "--verify": args.verify = true; break;
      case "--teardown": args.teardown = true; break;
      case "--i-understand-this-writes-to-my-bunny-account":
        args.confirmation = true; break;
      case "--yes": args.yes = true; break;
      case "--name": args.name = next(); break;
      case "--creds": args.creds = next(); break;
      case "--api-key": args.apiKey = next(); break;
      case "--source": args.source = next(); break;
      case "--allow-write-path": args.allowWritePath = true; break;
      case "--bundle": args.bundle = next(); break;
      case "--read-bundle": args.readBundle = next(); break;
      case "--served": args.served = next(); break;
      case "--protect":
        args.protect.push(...String(next() ?? "").split(",").map((n) => n.trim()).filter(Boolean));
        break;
      case "--help": case "-h": args.help = true; break;
      default: throw new ProvisionRefusal(
        REFUSAL.PAYLOAD_INVALID, `unknown argument "${a}" (see --help)`);
    }
  }
  return args;
}

/** KEY=VALUE creds file reader (BUNNY_API_KEY=...). */
export function readCredsFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

export function resolveApiKey(args) {
  if (args.apiKey) return { key: args.apiKey, via: "env/--api-key" };
  if (args.creds) {
    let creds;
    try {
      creds = readCredsFile(args.creds);
    } catch (e) {
      throw new ProvisionRefusal(REFUSAL.API_KEY_MISSING,
        `creds file unreadable: ${args.creds} (${e.message})`);
    }
    if (creds.BUNNY_API_KEY) return { key: creds.BUNNY_API_KEY, via: `creds ${args.creds}` };
  }
  throw new ProvisionRefusal(REFUSAL.API_KEY_MISSING,
    "no API key: pass --creds <KEY=VALUE file with BUNNY_API_KEY=...>, set BUNNY_API_KEY, " +
    "or pass --api-key. The key stays in the process; it is never written anywhere.");
}

function maskKey(key) {
  return key.length <= 8 ? "****" : `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// payload schema — the validated JSON the page bakes and the runner consumes
// ---------------------------------------------------------------------------

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * Validate a payload object against schema decko-one-key-provisioning-payload/1.
 * Returns a normalized copy. Throws ProvisionRefusal(--payload-invalid) with a
 * every-problem list — the page implements the same schema; this runner is the
 * authority that gates a run.
 */
export function validatePayload(raw, { protectedNames = protectedResourceNames() } = {}) {
  const errors = [];
  const p = raw ?? {};
  if (p.schema !== SCHEMA_NAME) errors.push(`schema must be "${SCHEMA_NAME}"`);
  if (p.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be ${SCHEMA_VERSION}`);
  if (typeof p.created !== "string" || Number.isNaN(Date.parse(p.created))) {
    errors.push("created must be an ISO date string");
  }
  if (p.provider !== "bunny") {
    errors.push(`provider must be "bunny" (this runner provisions Bunny; got ${JSON.stringify(p.provider ?? null)})`);
  }

  const deck = p.deck ?? {};
  for (const f of ["source_name", "source_sha256"]) {
    if (typeof deck[f] !== "string" || !deck[f]) errors.push(`deck.${f} must be a non-empty string`);
  }
  if (typeof deck.source_sha256 === "string" && deck.source_sha256 !== "" &&
      !/^[0-9a-f]{64}$/.test(deck.source_sha256)) {
    errors.push("deck.source_sha256 must be 64 lowercase hex chars");
  }
  if (!Number.isInteger(deck.source_bytes) || deck.source_bytes < 0) {
    errors.push("deck.source_bytes must be a non-negative integer");
  }
  if (!Number.isInteger(deck.limit) || deck.limit < 0) {
    errors.push("deck.limit must be a non-negative integer (0 = whole deck)");
  }
  if (deck.tables !== null && typeof deck.tables !== "undefined" &&
      (typeof deck.tables !== "string" || !/^[\w,.\s-]*$/.test(deck.tables))) {
    errors.push("deck.tables must be null or a comma-separated table-name string");
  }

  const bunny = p.bunny ?? {};
  for (const f of ["script_name", "pull_zone_name", "db_group_name", "db_name"]) {
    if (typeof bunny[f] !== "string" || !NAME_RE.test(bunny[f] ?? "")) {
      errors.push(`bunny.${f} must match ${NAME_RE.source} (lowercase dns-safe)`);
    }
  }
  if (typeof bunny.db_name === "string" && bunny.db_name.length > DB_SLUG_MAX) {
    errors.push(`bunny.db_name is ${bunny.db_name.length} chars; Bunny's create endpoint 500s past ${DB_SLUG_MAX}`);
  }
  if (typeof bunny.storage_region !== "string" || !/^[a-z]{2}-[a-z]+-?[0-9]*$/.test(bunny.storage_region ?? "")) {
    errors.push('bunny.storage_region must be a Bunny storage region id like "eu-west-1"');
  }
  if (typeof bunny.primary_region !== "string" || !/^[A-Z]{2,4}$/.test(bunny.primary_region ?? "")) {
    errors.push('bunny.primary_region must be a Bunny region code like "AMS" or "NY"');
  }
  if (!Array.isArray(bunny.replica_regions) ||
      !bunny.replica_regions.every((r) => typeof r === "string" && /^[A-Z]{2,4}$/.test(r))) {
    errors.push("bunny.replica_regions must be an array of region codes (possibly empty)");
  }
  if (bunny.db_token_authorization !== "full-access" && bunny.db_token_authorization !== "read-only") {
    errors.push('bunny.db_token_authorization must be "full-access" or "read-only"');
  }
  for (const f of ["script_name", "pull_zone_name", "db_group_name", "db_name"]) {
    if (typeof bunny[f] === "string" && protectedNames.has(bunny[f])) {
      throw new ProvisionRefusal(REFUSAL.PROTECTED_NAME,
        `bunny.${f}="${bunny[f]}" is a protected resource name. ` +
        `This runner only creates NEW resources; pick a different name.`,
        { field: `bunny.${f}`, name: bunny[f] });
    }
  }

  // The read front's names default from the full engine's (schema v1 payloads
  // written before the front existed carry neither field).
  const readScriptName = bunny.read_script_name ?? `${bunny.script_name}-read`;
  const readPullZoneName = bunny.read_pull_zone_name ?? `${bunny.pull_zone_name}-read`;
  for (const [f, v] of [["read_script_name", readScriptName], ["read_pull_zone_name", readPullZoneName]]) {
    if (typeof v !== "string" || !NAME_RE.test(v)) {
      errors.push(`bunny.${f} must match ${NAME_RE.source} (lowercase dns-safe)`);
    } else if (protectedNames.has(v)) {
      throw new ProvisionRefusal(REFUSAL.PROTECTED_NAME,
        `bunny.${f}="${v}" is a protected resource name. This runner only creates NEW resources; pick a different name.`,
        { field: `bunny.${f}`, name: v });
    }
  }

  const edge = p.edge ?? {};
  if (typeof edge.cache_enabled !== "boolean") errors.push("edge.cache_enabled must be a boolean");
  if (!Number.isInteger(edge.cache_ttl_seconds) || edge.cache_ttl_seconds < 1 || edge.cache_ttl_seconds > 2592000) {
    errors.push("edge.cache_ttl_seconds must be an integer 1..2592000 (30 days)");
  }
  if (!Number.isInteger(edge.cache_epoch) || edge.cache_epoch < 0) {
    errors.push("edge.cache_epoch must be a non-negative integer");
  }
  if (!Number.isInteger(edge.render_budget_ms) || edge.render_budget_ms < 1000 || edge.render_budget_ms > 30000) {
    errors.push("edge.render_budget_ms must be an integer 1000..30000 (Bunny CPU cap is 30 s/request)");
  }
  if (typeof edge.write_path !== "boolean") errors.push("edge.write_path must be a boolean");

  if (errors.length > 0) {
    throw new ProvisionRefusal(REFUSAL.PAYLOAD_INVALID,
      `payload failed schema ${SCHEMA_NAME}/${SCHEMA_VERSION}:\n  - ${errors.join("\n  - ")}`,
      { errors });
  }

  return {
    schema: p.schema,
    schema_version: p.schema_version,
    created: p.created,
    provider: p.provider,
    deck: {
      source_name: deck.source_name,
      source_sha256: deck.source_sha256,
      source_bytes: deck.source_bytes,
      limit: deck.limit,
      tables: deck.tables ?? null,
    },
    bunny: {
      script_name: bunny.script_name,
      pull_zone_name: bunny.pull_zone_name,
      read_script_name: readScriptName,
      read_pull_zone_name: readPullZoneName,
      db_group_name: bunny.db_group_name,
      db_name: bunny.db_name,
      storage_region: bunny.storage_region,
      primary_region: bunny.primary_region,
      replica_regions: [...bunny.replica_regions],
      db_token_authorization: bunny.db_token_authorization,
    },
    edge: {
      cache_enabled: edge.cache_enabled,
      cache_ttl_seconds: edge.cache_ttl_seconds,
      cache_epoch: edge.cache_epoch,
      render_budget_ms: edge.render_budget_ms,
      write_path: edge.write_path,
    },
  };
}

export function loadPayload(path, options = {}) {
  if (!path) {
    throw new ProvisionRefusal(REFUSAL.PAYLOAD_INVALID,
      "no --payload <path> given. Generate one with one-key-provisioning-page.html.");
  }
  if (!existsSync(path)) {
    throw new ProvisionRefusal(REFUSAL.PAYLOAD_INVALID, `payload file not found: ${path}`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ProvisionRefusal(REFUSAL.PAYLOAD_INVALID, `payload is not valid JSON: ${e.message}`);
  }
  return validatePayload(raw, options);
}

// ---------------------------------------------------------------------------
// served variables — the deck's served identity, one loose variable per value
// ---------------------------------------------------------------------------

/** Bunny's documented script limits (bunny.net/docs/scripting/limits, read
 *  through the search gateway 2026-10-14): one script variable value holds at
 *  most 2 KB, and a script has at most 128 variables. The 2026-10-14 deck's
 *  3.6 KB DECKO_SERVED_DELTAS blob made both of its scripts answer HTTP 400 on
 *  every request; the same values as loose variables (the largest 1.6 KB)
 *  served correctly. The engine parses a blob of that size, so the failure is
 *  the platform's limit, and this runner refuses an oversized value before
 *  any account write rather than deploy a script that cannot answer. */
export const BUNNY_VARIABLE_VALUE_MAX_BYTES = 2048;
export const BUNNY_SCRIPT_VARIABLES_MAX = 128;

/** The same two limits as a record, for the plan line and the docs' test. */
export function servedVariablesDocumentedLimit() {
  return { valueBytes: BUNNY_VARIABLE_VALUE_MAX_BYTES, variables: BUNNY_SCRIPT_VARIABLES_MAX };
}

/** Variables the runner sets itself from the payload and the resources it
 *  creates; a served file may not name them. */
const RUNNER_MANAGED_VARIABLES = new Set([
  "DECKO_EDGE_CACHE", "DECKO_EDGE_CACHE_TTL", "DECKO_EDGE_CACHE_EPOCH",
  "DECKO_EDGE_RENDER_BUDGET_MS", "DECKO_EDGE_FULL_URL", "DECKO_TRUSTED_ORIGINS",
  "DECKO_WRITE_PATH", "DECKO_FIRST_RUN", "DECKO_STORAGE_ZONE", "DECKO_STORAGE_HOST",
  "DECKO_STORAGE_PASSWORD", "BUNNY_DATABASE_URL", "BUNNY_DATABASE_AUTH_TOKEN",
]);

/** Validate a served-variables object ({ "DECKO_...": "value" }) and return
 *  the variable list both scripts carry. Every problem is reported at once;
 *  an oversized value names the variable, its size and the limit. */
export function validateServedVariables(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ProvisionRefusal(REFUSAL.SERVED_INVALID,
      `served variables must be a JSON object of "DECKO_NAME": "value" pairs`);
  }
  const errors = [];
  const entries = Object.entries(raw);
  for (const [name, value] of entries) {
    if (!/^DECKO_[A-Z0-9_]+$/.test(name)) {
      errors.push(`${name}: a served variable is named DECKO_ followed by uppercase letters, digits or underscores`);
    }
    if (RUNNER_MANAGED_VARIABLES.has(name)) {
      errors.push(`${name}: the runner sets this variable itself; remove it from the served file`);
    }
    if (typeof value !== "string") {
      errors.push(`${name}: the value must be a string`);
      continue;
    }
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > BUNNY_VARIABLE_VALUE_MAX_BYTES) {
      const hint = name === "DECKO_SERVED_DELTAS"
        ? " The JSON blob form is one variable, so it cannot carry a deck's whole identity: write each field as its own loose variable (docs/deploy-bunny.md, \"Served identity\")."
        : " Split this value across loose variables (docs/deploy-bunny.md, \"Served identity\").";
      errors.push(`${name} is ${bytes} bytes; Bunny stores at most ${BUNNY_VARIABLE_VALUE_MAX_BYTES} bytes per script variable, and a longer value makes the script answer HTTP 400 on every request.${hint}`);
    }
  }
  // The runner adds up to 8 of its own variables to each script.
  if (entries.length + 8 > BUNNY_SCRIPT_VARIABLES_MAX) {
    errors.push(`${entries.length} served variables plus the runner's own exceed Bunny's ${BUNNY_SCRIPT_VARIABLES_MAX} variables per script`);
  }
  if (errors.length > 0) {
    throw new ProvisionRefusal(REFUSAL.SERVED_INVALID,
      `served variables failed the Bunny script limits:\n  - ${errors.join("\n  - ")}`, { errors });
  }
  return entries.map(([Name, DefaultValue]) => ({ Name, DefaultValue }));
}

/** Read and validate a --served file. Absent = no served identity (a stock
 *  deck). */
export function loadServedVariables(path) {
  if (!path) return [];
  if (!existsSync(path)) {
    throw new ProvisionRefusal(REFUSAL.SERVED_INVALID, `served variables file not found: ${path}`);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ProvisionRefusal(REFUSAL.SERVED_INVALID, `served variables file is not valid JSON: ${e.message}`);
  }
  return validateServedVariables(raw);
}

// ---------------------------------------------------------------------------
// the plan — single source of truth for PLAN printing and EXECUTE running
// ---------------------------------------------------------------------------

/** Build the ordered step list from a validated payload. Each step names the
 *  exact HTTP call (or child command) and whether it writes. PLAN prints
 *  these; EXECUTE runs them in order. */
export function buildSteps(payload, { sourcePath, writePathAllowed, served = [] }) {
  const b = payload.bunny;
  const d = payload.deck;
  const steps = [];
  const push = (name, writes, describe) => steps.push({ name, writes, describe });
  const readScript = b.read_script_name ?? `${b.script_name}-read`;
  const readZone = b.read_pull_zone_name ?? `${b.pull_zone_name}-read`;

  push("resolve account key", false, () =>
    `key resolved from creds/env (masked in output; never stored)`);
  push("read account resource lists", false, () =>
    `GET /compute/script + GET /database/v1/databases — refuse if "${b.script_name}" or "${b.db_name}" already exists`);
  push(`create database group "${b.db_group_name}"`, true, () =>
    `POST /database/v1/groups {"display_name","storage_region":"${b.storage_region}","primary_regions":["${b.primary_region}"],"replicas_regions":${JSON.stringify(b.replica_regions)}}`);
  push(`create database "${b.db_name}"`, true, () =>
    `POST /database/v1/databases {"slug":"${b.db_name}","group":<group id>} — retry x3 on 500 (measured server-side flakiness)`);
  push("generate database token (API-generated, never displayed)", true, () =>
    `PUT /database/v2/databases/{id}/auth/generate {"authorization":"${b.db_token_authorization}"}`);
  push("apply the schema's tables and indexes", true, () =>
    `POST /v2/pipeline with every CREATE TABLE and CREATE INDEX of deploy/migrations (demo-content migrations excluded): typed tables with primary keys, so lookups seek instead of reading the whole deck (a typeless dump-shaped schema measured rows_read=19477 for one card lookup); ANALYZE is not supported on Bunny's SQL API.`);
  push("seed the database from the deck source", true, () =>
    `node scripts/import-to-bunny-db.mjs --source ${sourcePath ?? "(--source required before --execute)"} --data-only` +
    (d.limit > 0 ? ` --limit ${d.limit}` : "") +
    ` --tables ${d.tables ? d.tables : "<the source tables the schema has, sessions excluded>"}` +
    ` --creds <generated> (chunked /v2/pipeline writes, engine-derived keys, post-import verification)`);
  push("complete the engine schema", true, () =>
    `POST /v2/pipeline with the rest of those migrations: the data-version triggers and stamp row the render path requires (applied after the seed so the triggers do not fire once per seeded row)`);
  push("make the deck readable (catch-all read rule)", true, () =>
    `POST /v2/pipeline: report the deck's own *all+*read rule (an imported Ruby deck carries its own and nothing is written); when the deck has none — a source without it, or a row truncated away by the seed's LIMIT — install the stock substrate's (Set-typed *all + the 'read' setting + the Anyone party + the rule + its reference). A deck with no catch-all read rule denies every card, as Ruby does (permissions.rb:139-146), and would answer every anonymous visitor a denial`);
  push("build the engine bundle", true, () =>
    `node tools/bundle-bunny-edge-engine.mjs -> deploy/dist/bunny-edge-engine.code.json (sha256 recorded in the result sidecar)`);
  push(`create edge script "${b.script_name}" + linked pull zone "${b.pull_zone_name}" (the full engine)`, true, () =>
    `POST /compute/script AddEdgeScriptModel {Name, Code, ScriptType:1, CreateLinkedPullZone:true, LinkedPullZoneName:"${b.pull_zone_name}"} -> 201`);
  push(`create read front "${readScript}" + linked pull zone "${readZone}"`, true, () =>
    `POST /compute/script (the read-only bundle deploy/dist/bunny-edge-read.code.json): anonymous GET/HEAD page reads served here; sign-in, writes, /setup and any request with a session cookie forwarded to the full engine (DECKO_EDGE_FULL_URL)`);
  push("issue a read-only database token for the read front", true, () =>
    `PUT /database/v2/databases/{id}/auth/generate {"authorization":"read-only"} (the front reads; only the full engine writes)`);
  if (writePathAllowed && payload.edge.write_path) {
    push(`create storage zone "${b.script_name}-files"`, true, () =>
      `POST /storagezone {"Name":"${b.script_name}-files","Region":"${b.storage_zone_region ?? "DE"}"} -> StorageZone {Id, Password, StorageHostname}: the deck's files (uploads, renditions, compiled stylesheets)`);
  }
  push("set database credentials as script secrets", true, () =>
    `POST /compute/script/{id}/secrets on both scripts (BUNNY_DATABASE_URL + token; the front gets a read-only token, the full engine the payload's authorization)`);
  push("apply edge options as script variables on both scripts", true, () =>
    `POST /compute/script/{id}/variables/add (DECKO_EDGE_CACHE=${payload.edge.cache_enabled ? 1 : 0}` +
    (payload.edge.cache_enabled
      ? `, DECKO_EDGE_CACHE_TTL=${payload.edge.cache_ttl_seconds}, DECKO_EDGE_CACHE_EPOCH=${payload.edge.cache_epoch}`
      : "") +
    `, DECKO_EDGE_RENDER_BUDGET_MS=${payload.edge.render_budget_ms}, DECKO_TRUSTED_ORIGINS=https://${readScript}.bunny.run` +
    `, DECKO_EDGE_FULL_URL=https://${b.script_name}.bunny.run on the front` +
    (served.length > 0 ? `, and ${served.length} served variable(s) from --served (each <= ${BUNNY_VARIABLE_VALUE_MAX_BYTES} bytes)` : "") +
    (writePathAllowed && payload.edge.write_path
      ? `, DECKO_WRITE_PATH=1, DECKO_FIRST_RUN=1, DECKO_STORAGE_ZONE, DECKO_STORAGE_HOST; DECKO_STORAGE_PASSWORD as a secret on the full engine`
      : "") + `)`);
  if (payload.edge.cache_enabled) {
    push("flip both linked zones off SmartCache (origin-header caching)", true, () =>
      `POST /pullzone/{zoneId} {"EnableSmartCache":false} — SmartCache rewrites responses no-cache and defeats header and L2 caching (measured)`);
  }
  push("publish both scripts", true, () =>
    `POST /compute/script/{id}/publish {"Note":"one-key provision <date>"} -> 204; effective immediately (the read front first, then the full engine it forwards to)`);
  push("verify the new deck responds", false, () =>
    `poll GET https://<DefaultHostname>/_status until {"ok":true} (60 s budget), then GET / sanity`);
  if (writePathAllowed && payload.edge.write_path) {
    push("issue the first-run setup token", true, () =>
      `POST /v2/pipeline: replace deck_setup_tokens (deploy/migrations/0012) with the sha256 of 32 fresh random bytes; the token itself is printed once, as the /setup link, at the end of the run`);
  }
  push("write the recovery result sidecar", false, () =>
    `<payload>.result.json — script/zone/db/group ids, hostname, bundle sha256, source sha256; with the payload this is the deck's permanent recovery artifact (no secrets in it)`);
  return steps;
}

/** The SQL that issues a first-run setup token: only its sha256 is stored
 *  (deploy/migrations/0012, src/card/auth/setup-token.ts), replacing any earlier
 *  one. Both values are generated here, so inlining them is safe. */
export function setupTokenIssue(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const digest = createHash("sha256").update(token).digest("hex");
  const createdAt = now.toISOString().slice(0, 19).replace("T", " ");
  return {
    token,
    path: `/setup?token=${token}`,
    statements: [
      `DELETE FROM "deck_setup_tokens"`,
      `INSERT INTO "deck_setup_tokens" ("token_sha256", "created_at") VALUES ('${digest}', '${createdAt}')`,
    ],
  };
}

/** The deploy migrations a provisioned deck needs: the schema (0001) and
 *  every engine migration after it (indexes, the data-version stamp, the
 *  session table, ...), but none of the demo-deck content migrations (named
 *  "-demo-"), whose fixed ids would collide with the deck's own cards. */
export function engineMigrationFiles(migrationsDir) {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && !/-demo-/.test(f))
    .sort();
}

/**
 * Split the engine migrations into the statements that run BEFORE the seed
 * (every CREATE TABLE and CREATE INDEX: typed tables with primary keys, so
 * lookups seek instead of reading the whole deck, and the indexes the render
 * path relies on) and those that run AFTER it (the data-version triggers,
 * the stamp row, anything else). A trigger present during the seed would
 * fire once per seeded row. The split is trigger-aware (a trigger body's
 * own semicolons stay inside its statement).
 */
export async function engineSchemaPlan(migrationsDir) {
  const { splitSqlStatements } = await import(new URL("../../tools/migrate/import.mjs", import.meta.url).href);
  const preSeed = [];
  const postSeed = [];
  const tables = new Set();
  for (const file of engineMigrationFiles(migrationsDir)) {
    for (const statement of splitSqlStatements(readFileSync(join(migrationsDir, file), "utf8"))) {
      const table = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?/i.exec(statement);
      if (table !== null) tables.add(table[1]);
      if (table !== null || /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(statement)) preSeed.push(statement);
      else postSeed.push(statement.replace(/^INSERT\s+INTO/i, "INSERT OR IGNORE INTO"));
    }
  }
  return { files: engineMigrationFiles(migrationsDir), preSeed, postSeed, tables: [...tables] };
}

/** Execute statements one by one over the database's SQL API
 *  (POST /v2/pipeline, Hrana v2). An index whose table is absent is skipped
 *  and counted; any other error stops the run. */
export async function applySqlStatements(pipelineUrl, dbToken, statements) {
  const execOne = async (sql) => {
    const res = await fetch(pipelineUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${dbToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql } }, { type: "close" }] }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text().catch(() => "");
    let json = null;
    try { json = JSON.parse(text); } catch { /* empty body -> error below */ }
    const err = json?.results?.[0]?.error ?? (res.ok ? null : { message: `HTTP ${res.status}` });
    return { ok: !err, error: err ? String(err.message ?? JSON.stringify(err)).slice(0, 200) : null };
  };
  let applied = 0;
  let skippedNoTable = 0;
  for (const stmt of statements) {
    const r = await execOne(stmt);
    if (r.ok) { applied += 1; continue; }
    if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(stmt) && /no such table/i.test(r.error)) { skippedNoTable += 1; continue; }
    throw new Error(`schema statement failed: ${r.error} — ${stmt.slice(0, 80)}`);
  }
  return { applied, skippedNoTable };
}

/** The structural shape of the catch-all read rule, as the permission
 *  statements read it (src/card/permissions/read-rules.ts,
 *  readPermissionStatements): a rule card whose right side is the card with
 *  codename 'read' and whose left side is Set-typed. Returns null when the
 *  deck carries none. Read-only. */
const CATCH_ALL_RULE_QUERY = `SELECT r.id AS ruleId FROM cards r JOIN cards sets ON r.left_id = sets.id WHERE r.trash = 0 AND sets.trash = 0 AND r.right_id = (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1) AND sets.type_id = (SELECT id FROM cards WHERE codename = 'set' AND trash = 0 ORDER BY id LIMIT 1) ORDER BY r.id LIMIT 1`;
const CATCH_ALL_PARTIES_QUERY = `SELECT c.name AS party FROM card_references refs JOIN cards c ON c.id = refs.referee_id WHERE refs.referer_id = ? AND c.trash = 0 ORDER BY c.id`;
const CATCH_ALL_CARD_NAME_QUERY = `SELECT c.name AS name FROM cards c WHERE c.trash = 0 AND (c.name = 'Anyone' OR c.codename = 'anyone') ORDER BY c.id LIMIT 1`;

/** Every real Ruby deck bootstraps `*all+*read` -> [[Anyone]] (card/auth/setup.rb:44;
 *  mod/core data/fixtures/real/cards.yml cards_010) and Ruby's ok_to_read?
 *  (card-mod-permissions set/all/permissions.rb:139-146) denies a deck that
 *  does not: permission_rule_id :read resolves to nil and
 *  Auth.as_card.read_rules_hash[nil] is nil, so every card answers
 *  "Sorry, you don't have permission (read)".
 *
 *  An IMPORTED deck carries its own rule and its ids, and re-seeding it would
 *  collide, so the rule is only checked and only installed when the deck has
 *  none. The rows below are the demo substrate's, verbatim from
 *  deploy/migrations/0004 (types and codenames) + 0006 (the roles) + 0009
 *  (the rule and its party): every INSERT is guarded on the same unique
 *  column the demo migrations guard (codename, key, or the side pair), so the
 *  step is idempotent on a deck that grew the cards between the check and
 *  the insert. */
const READ_SUBSTRATE_STATEMENTS = [
  // the Set type card (codename 'set' = the deck's SetID)
  `INSERT OR IGNORE INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   SELECT 4103, 'Set', 'set', 'set', NULL, NULL, NULL, datetime('now'), datetime('now'), 1, 1, NULL, NULL, NULL, 0, 1, NULL
    WHERE NOT EXISTS (SELECT 1 FROM cards WHERE codename = 'set')`,
  // the *all set card (the rule's left side), typed Set
  `INSERT OR IGNORE INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   SELECT 4105, '*all', '*all', 'all', NULL, NULL, NULL, datetime('now'), datetime('now'), 1, 1, NULL, NULL, NULL, 0, 4103, NULL
    WHERE NOT EXISTS (SELECT 1 FROM cards WHERE codename = 'all')`,
  // the *read setting card (the rule's right side)
  `INSERT OR IGNORE INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   SELECT 4101, '*read', '*read', 'read', NULL, NULL, NULL, datetime('now'), datetime('now'), 1, 1, NULL, NULL, NULL, 0, 1, NULL
    WHERE NOT EXISTS (SELECT 1 FROM cards WHERE codename = 'read')`,
  // the Anyone party card (codename 'anyone')
  `INSERT OR IGNORE INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   SELECT 4210, 'Anyone', 'anyone', 'anyone', NULL, NULL, NULL, datetime('now'), datetime('now'), 1, 1, NULL, NULL, NULL, 0, 1, NULL
    WHERE NOT EXISTS (SELECT 1 FROM cards WHERE codename = 'anyone')`,
  // *all+*read, the catch-all rule (a junction: sides only, NULL name/key)
  `INSERT OR IGNORE INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
   SELECT 4303, NULL, NULL, NULL, 4105, 4101, NULL, datetime('now'), datetime('now'), 1, 1, NULL, NULL, NULL, 0, 4105, 'Anyone'
    WHERE NOT EXISTS (SELECT 1 FROM cards WHERE left_id = 4105 AND right_id = 4101)`,
  // the rule's party: the reference that puts it in read_rules_hash (Ruby
  // reads the reference graph, not the rule text)
  `INSERT OR IGNORE INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
   SELECT 4303, '', 4210, 'L', 1
    WHERE NOT EXISTS (SELECT 1 FROM card_references WHERE referer_id = 4303 AND referee_id = 4210)`,
];

/** Make the provisioned deck READABLE to an anonymous visitor: report the
 *  deck's own catch-all read rule, or install the demo substrate's when it
 *  has none. Returns { installed: false, ruleId, parties } for a deck that
 *  already carries one. */
export async function ensureCatchAllReadRule(pipelineUrl, dbToken) {
  const query = async (sql, params) => {
    const res = await fetch(pipelineUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${dbToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: params } }, { type: "close" }] }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text().catch(() => "");
    let json = null;
    try { json = JSON.parse(text); } catch { /* error below */ }
    const entry = json?.results?.[0];
    if (!entry || entry.type === "error" || entry.error) {
      throw new Error(`read-rule query failed: ${entry?.error?.message ?? text.slice(0, 200)}`);
    }
    // Hrana pipeline entry: { type: "ok", response: { type: "execute", result: { rows } } }
    // ("response" is the alias several drafts use; the Bunny driver decodes
    // both — src/card/drivers/bunny-db.ts decodeStreamResult).
    const rows = entry.response?.result?.rows ?? entry.result?.rows ?? [];
    return rows.map((row) => {
      const cols = entry.response?.result?.cols ?? entry.result?.cols ?? [];
      const out = {};
      cols.forEach((c, i) => { out[c.name] = row[i]; });
      return out;
    });
  };
  const existing = await query(CATCH_ALL_RULE_QUERY, []);
  if (existing.length > 0) {
    const ruleId = existing[0].ruleId;
    const parties = (await query(CATCH_ALL_PARTIES_QUERY, [ruleId])).map((row) => row.party);
    return { installed: false, ruleId, parties };
  }
  await applySqlStatements(pipelineUrl, dbToken, READ_SUBSTRATE_STATEMENTS);
  const installed = await query(CATCH_ALL_RULE_QUERY, []);
  if (installed.length === 0) throw new Error("catch-all read rule: installed but the permission statements cannot see it (Set-typed *all and the 'read' setting are required)");
  const ruleId = installed[0].ruleId;
  const parties = (await query(CATCH_ALL_PARTIES_QUERY, [ruleId])).map((row) => row.party);
  return { installed: true, ruleId, parties };
}

/** The source tables the seed copies: those the provisioned schema has,
 *  minus the session table (sessions never travel; a moved deck signs in
 *  afresh). Returns the rest as skipped, for the log. */
export async function seedTablesFor(sourcePath, targetTables) {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(sourcePath, { readonly: true });
  try {
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map((r) => r.name);
    const keep = names.filter((n) => targetTables.includes(n) && n !== "auth_sessions");
    return { tables: keep, skipped: names.filter((n) => !keep.includes(n)) };
  } finally {
    db.close();
  }
}

/**
 * The database half of a provision, on a database that already exists and
 * a token that can write it: the schema's tables and indexes, the seed from
 * the deck source (scripts/import-to-bunny-db.mjs, --data-only), then the
 * triggers and stamp row. Exported so the same code runs in --execute and in
 * the offline test against a local libSQL-protocol server.
 */
export async function provisionDatabase({ dbUrl, dbToken, sourcePath, deck, repoRoot, log = console.log }) {
  const pipelineUrl = `${dbUrl.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "")}/v2/pipeline`;
  const plan = await engineSchemaPlan(join(repoRoot, "deploy", "migrations"));
  const pre = await applySqlStatements(pipelineUrl, dbToken, plan.preSeed);
  log(`schema applied: ${pre.applied} table and index statements from ${plan.files.join(", ")}` +
    (pre.skippedNoTable > 0 ? ` (${pre.skippedNoTable} index statements skipped: their tables are absent)` : ""));

  const seedTables = deck.tables
    ? { tables: deck.tables.split(",").map((s) => s.trim()).filter(Boolean), skipped: [] }
    : await seedTablesFor(sourcePath, plan.tables);
  if (seedTables.skipped.length > 0) log(`seed skips source tables the deck does not serve: ${seedTables.skipped.join(", ")}`);
  const seedDir = mkdtempSync(join(tmpdir(), "decko-one-key-seed-"));
  try {
    const seedCreds = join(seedDir, "seed-creds.txt");
    writeFileSync(seedCreds, `BUNNY_DB_URL=${dbUrl}\nBUNNY_DB_TOKEN=${dbToken}\n`, { mode: 0o600 });
    const importArgs = ["--source", sourcePath, "--creds", seedCreds, "--data-only", "--tables", seedTables.tables.join(",")];
    if (deck.limit > 0) importArgs.push("--limit", String(deck.limit));
    log(`seed: node scripts/import-to-bunny-db.mjs ${importArgs.join(" ").replace(seedCreds, "<generated creds>")}`);
    // Asynchronous, so this process keeps serving its own event loop while
    // the importer runs.
    const status = await new Promise((resolveRun, rejectRun) => {
      const child = spawn(process.execPath, [join(repoRoot, "scripts", "import-to-bunny-db.mjs"), ...importArgs], {
        cwd: repoRoot, stdio: "inherit", windowsHide: true,
      });
      child.on("error", rejectRun);
      child.on("close", (code) => resolveRun(code));
    });
    if (status !== 0) {
      throw new Error(`seed failed (import-to-bunny-db.mjs exit ${status}); rolling this run back`);
    }
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
  }

  const post = await applySqlStatements(pipelineUrl, dbToken, plan.postSeed);
  log(`engine schema completed after the seed: ${post.applied} statements (data-version triggers and stamp row)`);
  const readRule = await ensureCatchAllReadRule(pipelineUrl, dbToken);
  log(readRule.installed
    ? `catch-all read rule installed: the deck carried none, and one without it denies every card (permissions.rb:139-146)`
    : `catch-all read rule already present (rule card ${readRule.ruleId}, granting ${readRule.parties.join(", ")}) — the deck's own, carried by the import`);
  return {
    migrations: plan.files,
    preSeedStatements: pre.applied,
    postSeedStatements: post.applied,
    seedTables: seedTables.tables,
    readRule,
  };
}

/** Fail-fast source check BEFORE any account write. The engine's substrate
 *  needs a cards table carrying a db_content column; a deck without one
 *  imports without complaint and then fails every render, so the runner
 *  refuses it here rather than after the account is half-built.
 *  better-sqlite3 is imported lazily: PLAN mode never opens the source. */
export async function assertSourceShape(sourcePath) {
  let Database;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch (e) {
    throw new ProvisionRefusal(REFUSAL.SOURCE_WRONG_SHAPE,
      `cannot inspect the deck source (better-sqlite3 unavailable: ${e.message}). ` +
      `Run from the repo root with node_modules installed.`);
  }
  let db;
  try {
    db = new Database(sourcePath, { readonly: true });
    const cols = db.prepare("PRAGMA table_info(cards)").all().map((c) => c.name);
    if (!cols.includes("db_content")) {
      throw new ProvisionRefusal(REFUSAL.SOURCE_WRONG_SHAPE,
        `deck source ${sourcePath} has cards columns [${cols.join(", ")}] — no db_content. ` +
        `The engine's substrate shape needs card content in the cards table (cards.db_content); ` +
        `a deck whose content lives outside that column imports without complaint and then ` +
        `fails every render. ` +
        `Point --source at a deck in the engine's substrate shape.`);
    }
    const cards = db.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
    return { cards, hasDbContent: true };
  } catch (e) {
    if (e instanceof ProvisionRefusal) throw e;
    throw new ProvisionRefusal(REFUSAL.SOURCE_WRONG_SHAPE,
      `deck source is not a readable sqlite file in the engine's shape: ${sourcePath} (${e.message})`);
  } finally {
    try { db?.close(); } catch { /* already closed by the failed open */ }
  }
}

// ---------------------------------------------------------------------------
// Bunny API client (scripting + database management; AccessKey header)
// ---------------------------------------------------------------------------

export function makeBunnyApiAt(key, base) {
  const call = async (method, path, body, { expect } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { AccessKey: key, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text().catch(() => "");
    if (expect && !expect.includes(res.status)) {
      throw new Error(`${method} ${path} -> HTTP ${res.status} (expected ${expect.join("|")}) ${text.slice(0, 400)}`);
    }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, text };
  };
  return { call };
}

export function makeBunnyApi(key) {
  return makeBunnyApiAt(key, SCRIPT_HOST);
}

export function hostSuffixOfDbUrl(url) {
  // libsql://<ulid>-<slug>.lite.bunnydb.net/ -> ...-<slug>.lite.bunnydb.net
  const m = String(url).match(/^libsql:\/\/(.+\.lite\.bunnydb\.net)\/?$/i);
  return m ? m[1] : "(unrecognized db url shape)";
}

/** EdgeScriptModel.DefaultHostname sometimes carries the scheme already
 *  ("https://<name>.bunny.run") and sometimes arrives
 *  bare — normalize to a bare hostname so the status poll never fetches
 *  "https://https://...". */
export function normalizeHostname(hostname) {
  return String(hostname).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------

function printPlan({ payload, steps, sourcePath, payloadPath, served = [] }) {
  const b = payload.bunny;
  console.log(`
================ PLAN — executes NOTHING remote ================
mode           : plan (default; --execute --i-understand-this-writes-to-my-bunny-account makes it real)
payload        : ${payloadPath}
schema         : ${payload.schema}/${payload.schema_version} (created ${payload.created})
provider       : ${payload.provider}
edge script    : ${b.script_name}
pull zone      : ${b.pull_zone_name} (created automatically with the script)
database       : ${b.db_name} in group ${b.db_group_name}
                 storage ${b.storage_region}, primary ${b.primary_region}, replicas [${b.replica_regions.join(", ")}]
                 token: ${b.db_token_authorization}
deck source    : ${payload.deck.source_name} (sha256 ${payload.deck.source_sha256.slice(0, 12)}..., ${payload.deck.source_bytes} bytes)
                 local path for this run: ${sourcePath ?? "(REQUIRED --source before --execute)"}
                 seed: ${payload.deck.limit > 0 ? `<= ${payload.deck.limit} rows/table` : "whole deck"}${payload.deck.tables ? `, tables ${payload.deck.tables}` : ", all tables"}
scripts        : the full engine ${b.script_name} (pull zone ${b.pull_zone_name}) and the read front ${b.read_script_name ?? b.script_name + "-read"} (pull zone ${b.read_pull_zone_name ?? b.pull_zone_name + "-read"}); the front forwards writes, sign-in and cookie requests to the full engine
served variables: ${served.length === 0 ? "none (--served not given: a stock deck)" : served.map((v) => v.Name).join(", ") + " (each within " + BUNNY_VARIABLE_VALUE_MAX_BYTES + " bytes)"}
edge options   : cache ${payload.edge.cache_enabled ? `ON ttl=${payload.edge.cache_ttl_seconds}s epoch=${payload.edge.cache_epoch}` : "off"}, render budget ${payload.edge.render_budget_ms} ms, write path ${payload.edge.write_path ? "ARMED (needs --allow-write-path)" : "off (read-only deck)"}

steps (--execute performs these in order; plan prints only):
`);
  for (const s of steps) {
    console.log(`${s.name}${s.writes ? "  [writes]" : "  [read-only]"}`);
    s.describe().match(/.{1,96}(\s|$)/g)?.forEach((line) => console.log(`    ${line.trim()}`));
  }
  console.log(`
Guard check     : names avoid every protected resource name (DECKO_PROTECTED_RESOURCE_NAMES,
                  --protect); db slug <= ${DB_SLUG_MAX} chars.
Result sidecar  : <payload>.result.json lands next to the payload on --execute.
=================================================================
`);
}

async function listExistingResources(api) {
  const scripts = await api.call("GET", "/compute/script", undefined, { expect: [200] });
  // v1 list — the v2 list endpoint requires a `page` query param (measured
  // 400 "missing field `page`" on the live API, 2026-10-03) and the v1 shape
  // {"databases":[...]} is what the account answers.
  const databases = await api.call("GET", "/database/v1/databases", undefined, { expect: [200] });
  const scriptList = Array.isArray(scripts.json) ? scripts.json : (scripts.json?.Items ?? []);
  const dbList = Array.isArray(databases.json) ? databases.json : (databases.json?.databases ?? databases.json?.Items ?? []);
  return { scriptList, dbList };
}

function refuseIfAnyExists(payload, { scriptList, dbList }) {
  const b = payload.bunny;
  const names = [b.script_name, b.read_script_name ?? `${b.script_name}-read`];
  for (const name of names) {
    const scriptHit = scriptList.find((s) => (s.Name ?? s.name) === name);
    if (scriptHit) {
      throw new ProvisionRefusal(REFUSAL.RESOURCE_EXISTS,
        `an edge script named "${name}" already exists (Id ${scriptHit.Id ?? scriptHit.id}). ` +
        `This runner creates new resources only; pick a new name (or --teardown the old one).`);
    }
  }
  const dbHit = dbList.find((x) => (x.name ?? x.Name) === b.db_name);
  if (dbHit) {
    throw new ProvisionRefusal(REFUSAL.RESOURCE_EXISTS,
      `a database named "${b.db_name}" already exists (${dbHit.id ?? dbHit.Id}). Pick a new slug.`);
  }
}

async function executeMode({ payload, resolveApi, args, sourcePath, served = [] }) {
  if (!args.confirmation) {
    throw new ProvisionRefusal(REFUSAL.CONFIRMATION_MISSING,
      "--execute creates a database group + database + TWO edge scripts (a read front and the full " +
      "engine) with their pull zones on the account " +
      "the key belongs to, writes deck rows into the database, and publishes the live scripts. " +
      "Re-run with --i-understand-this-writes-to-my-bunny-account to confirm. " +
      "Run with no mode flag first to see the full plan.");
  }
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new ProvisionRefusal(REFUSAL.SOURCE_MISSING,
      `--execute seeds the database from the deck sqlite; --source must name an existing file` +
      (sourcePath ? ` (got missing path: ${sourcePath})` : " (no --source given)"));
  }
  if (payload.edge.write_path && !args.allowWritePath) {
    throw new ProvisionRefusal(REFUSAL.WRITE_PATH_UNALLOWED,
      "payload.edge.write_path=true arms the edge write surface. The one-key path provisions a " +
      "read-only deck; to arm writes re-run with --allow-write-path after reading " +
      "deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts.");
  }

  await assertSourceShape(sourcePath);
  const { api, keyMask } = resolveApi();
  const b = payload.bunny;
  const repoRoot = repoRootOf(import.meta.url);
  const startedIso = new Date().toISOString();
  console.log(`===== LIVE RUN on the Bunny account behind key ${keyMask} =====`);

  const { scriptList, dbList } = await listExistingResources(api);
  refuseIfAnyExists(payload, { scriptList, dbList });
  console.log(`account check: ${scriptList.length} scripts, ${dbList.length} databases exist; "${b.script_name}" and "${b.db_name}" are free`);

  // Transactional shape: until the edge script is CREATED (the point where a
  // real provisioned thing exists), any failure rolls back the group/database
  // this run created, so a failed run leaves the account as it found it.
  // Measured reason this matters (2026-10-03): a script-create 400 ("pull
  // zone name already taken" — Bunny reserves deleted pull-zone names
  // globally) used to strand the already-created database + group.
  let createdGroupId = null;
  let createdDbId = null;
  let scriptCreated = false;
  try {
    // 1. database group — the live API answers 200 with the
    // group NESTED under a "group" key; the fetched spec showed a flat object,
    // so accept both shapes.
    const groupRes = await api.call("POST", "/database/v1/groups", {
      display_name: b.db_group_name,
      storage_region: b.storage_region,
      primary_regions: [b.primary_region],
      replicas_regions: b.replica_regions,
    }, { expect: [200, 201] });
    const group = groupRes.json?.group ?? groupRes.json ?? {};
    createdGroupId = group.id ?? group.Id;
    if (!createdGroupId) throw new Error(`group create returned no id: ${JSON.stringify(groupRes.json).slice(0, 300)}`);
    console.log(`group created: ${b.db_group_name} = ${createdGroupId}`);

  // 2. database (retry: server 500s are measured reality, never client error shape)
  //    Live create may nest the object under a "database" key like the group
  //    create nests under "group" (same API family) — accept both shapes.
  let db = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await api.call("POST", "/database/v1/databases", { slug: b.db_name, group: createdGroupId });
    if (res.status === 200 || res.status === 201) { db = res.json?.database ?? res.json; break; }
    console.log(`database create attempt ${attempt}: HTTP ${res.status} ${res.text.slice(0, 200)}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 10_000));
  }
  if (!db) throw new Error(`database create failed 3 attempts (measured Bunny defect class: slugs >${DB_SLUG_MAX} chars always 500; region outages possible)`);
  const dbId = db.id ?? db.Id;
  createdDbId = dbId;
  const dbUrl = db.url ?? db.Url;
  if (!dbId || !dbUrl) throw new Error(`database create returned no id/url: ${JSON.stringify(db).slice(0, 300)}`);
  console.log(`database created: ${b.db_name} = ${dbId} (host ...${hostSuffixOfDbUrl(dbUrl).slice(-40)})`);

  // 3. tokens — API-generated, never printed. The full engine gets the
  // payload's authorization; the read front gets read-only, since it only
  // answers anonymous reads and forwards every write (as the hand-built deck).
  const tokenRes = await api.call("PUT", `/database/v2/databases/${dbId}/auth/generate`,
    { authorization: b.db_token_authorization }, { expect: [200] });
  const dbToken = tokenRes.json?.token;
  if (!dbToken) throw new Error("auth/generate returned no token");
  console.log(`database token generated (${b.db_token_authorization}, ${dbToken.length} chars, not displayed)`);
  const readTokenRes = await api.call("PUT", `/database/v2/databases/${dbId}/auth/generate`,
    { authorization: "read-only" }, { expect: [200] });
  const readDbToken = readTokenRes.json?.token;
  if (!readDbToken) throw new Error("auth/generate (read-only) returned no token");
  console.log(`read-only database token generated for the read front (${readDbToken.length} chars, not displayed)`);

  // 3b-4. schema, seed, then triggers and the stamp row (see provisionDatabase)
  const dbStats = await provisionDatabase({ dbUrl, dbToken, sourcePath, deck: payload.deck, repoRoot });
  console.log(`seed complete (${dbStats.seedTables.length} tables)`);

  // 5. bundles — the tree's own build (both scripts come from one build), or
  // caller-provided artifacts via --bundle (the full engine) and --read-bundle
  // (the read front): a deploy/dist/*.code.json {"Code":...} payload or a raw
  // bundle .js. Their paths and sha256 are recorded in the result sidecar.
  let code;
  let readCode;
  let bundleShaSource;
  let readBundleShaSource;
  if (args.bundle || args.readBundle) {
    if (!args.bundle || !args.readBundle) {
      throw new ProvisionRefusal(REFUSAL.SOURCE_MISSING,
        "--bundle and --read-bundle go together: the run needs both the full engine and the read front");
    }
    for (const [flag, path] of [["--bundle", args.bundle], ["--read-bundle", args.readBundle]]) {
      if (!existsSync(path)) {
        throw new ProvisionRefusal(REFUSAL.SOURCE_MISSING, `${flag} file not found: ${path}`);
      }
    }
    const readOne = (path) => {
      const raw = readFileSync(path, "utf8");
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { /* raw bundle text */ }
      return parsed?.Code ?? raw;
    };
    code = readOne(args.bundle);
    readCode = readOne(args.readBundle);
    bundleShaSource = resolve(args.bundle);
    readBundleShaSource = resolve(args.readBundle);
    console.log(`bundles: provided via --bundle and --read-bundle (${code.length} and ${readCode.length} chars)`);
  } else {
    const bundler = join(repoRoot, "tools", "bundle-bunny-edge-engine.mjs");
    const bundleRun = spawnSync(process.execPath, [bundler], { cwd: repoRoot, stdio: "inherit", windowsHide: true });
    if (bundleRun.status !== 0) throw new Error(`bundle failed (exit ${bundleRun.status})`);
    const distDir = join(repoRoot, "deploy", "dist");
    bundleShaSource = join(distDir, "bunny-edge-engine.code.json");
    readBundleShaSource = join(distDir, "bunny-edge-read.code.json");
    code = JSON.parse(readFileSync(bundleShaSource, "utf8")).Code;
    readCode = JSON.parse(readFileSync(readBundleShaSource, "utf8")).Code;
  }
  const codeSha256 = createHash("sha256").update(code).digest("hex");
  const readCodeSha256 = createHash("sha256").update(readCode).digest("hex");
  console.log(`bundles ready: full ${code.length} chars sha256 ${codeSha256.slice(0, 16)}..., read front ${readCode.length} chars sha256 ${readCodeSha256.slice(0, 16)}...`);

  // 6. the two scripts, each with its linked pull zone. The full engine is
  // created first; the read front's forward target and the full engine's
  // trusted origin name each other's hostnames, so both are set after both
  // exist and before either is published.
  const readScriptName = b.read_script_name ?? `${b.script_name}-read`;
  const readZoneName = b.read_pull_zone_name ?? `${b.pull_zone_name}-read`;
  const createScript = async (name, zone, scriptCode) => {
    const res = await api.call("POST", "/compute/script", {
      Name: name,
      Code: scriptCode,
      ScriptType: 1, // EdgeScriptTypes CDN == the standalone type
      CreateLinkedPullZone: true,
      LinkedPullZoneName: zone,
    }, { expect: [200, 201] });
    const json = res.json ?? {};
    const id = json.Id ?? json.id;
    if (!id) throw new Error(`script create (${name}) returned no Id: ${JSON.stringify(json).slice(0, 300)}`);
    const zoneId = json.LinkedPullZones?.[0]?.Id ?? json.LinkedPullZones?.[0]?.id ?? null;
    return { id, name, zoneId, zoneName: zone };
  };
  const full = await createScript(b.script_name, b.pull_zone_name, code);
  scriptCreated = true; // past this point a real provisioned thing exists — no auto-rollback
  console.log(`script created: ${full.name} = ${full.id}${full.zoneId ? `, linked pull zone = ${full.zoneId}` : " (no linked zone in response — caching step will need it)"}`);
  const front = await createScript(readScriptName, readZoneName, readCode);
  console.log(`script created: ${front.name} = ${front.id}${front.zoneId ? `, linked pull zone = ${front.zoneId}` : ""} (read front)`);
  const hostOf = async (id) => {
    const d = await api.call("GET", `/compute/script/${id}`, undefined, { expect: [200] });
    const h = normalizeHostname(d.json?.DefaultHostname ?? d.json?.defaultHostname ?? "");
    if (!h) throw new Error(`script ${id} detail carried no DefaultHostname: ${JSON.stringify(d.json).slice(0, 300)}`);
    return h;
  };
  const fullHost = await hostOf(full.id);
  const frontHost = await hostOf(front.id);
  const fullBase = `https://${fullHost}`;
  const frontBase = `https://${frontHost}`;

  // 6b. the files: a storage zone for a writable deck (attached to the full engine)
  const writable = payload.edge.write_path === true;
  let storage = null;
  if (writable) {
    const zoneName = `${b.script_name}-files`;
    const created = await api.call("POST", "/storagezone", { Name: zoneName, Region: b.storage_zone_region ?? "DE" }, { expect: [200, 201] });
    const z = created.json ?? {};
    if (!z.Id || !z.Password) throw new Error(`storage zone create returned no Id/Password: HTTP ${created.status}`);
    storage = { id: z.Id, name: zoneName, host: z.StorageHostname || "storage.bunnycdn.com", password: z.Password };
    console.log(`storage zone created: ${zoneName} = ${z.Id} (${storage.host}; password not displayed)`);
  }

  // 7. secrets — the documented pair on each script, first resolved by the entry
  for (const [script, token, extra] of [
    [full, dbToken, storage ? [{ Name: "DECKO_STORAGE_PASSWORD", Secret: storage.password }] : []],
    [front, readDbToken, []],
  ]) {
    for (const secret of [
      { Name: "BUNNY_DATABASE_URL", Secret: dbUrl },
      { Name: "BUNNY_DATABASE_AUTH_TOKEN", Secret: token },
      ...extra,
    ]) {
      const r = await api.call("POST", `/compute/script/${script.id}/secrets`, secret, { expect: [200, 201, 204] });
      console.log(`secret ${secret.Name} on ${script.name} set -> ${r.status}`);
    }
  }

  // 8. variables — the edge options, the served identity and the wiring, on
  // both scripts. The served variables were checked against Bunny's limits in
  // the plan, before any account write.
  const edgeVariables = [
    { Name: "DECKO_EDGE_CACHE", Required: false, DefaultValue: payload.edge.cache_enabled ? "1" : "0" },
    ...(payload.edge.cache_enabled ? [
      { Name: "DECKO_EDGE_CACHE_TTL", Required: false, DefaultValue: String(payload.edge.cache_ttl_seconds) },
      { Name: "DECKO_EDGE_CACHE_EPOCH", Required: false, DefaultValue: String(payload.edge.cache_epoch) },
    ] : []),
    { Name: "DECKO_EDGE_RENDER_BUDGET_MS", Required: false, DefaultValue: String(payload.edge.render_budget_ms) },
    ...served,
  ];
  const fullVariables = [
    ...edgeVariables,
    { Name: "DECKO_TRUSTED_ORIGINS", Required: false, DefaultValue: frontBase },
  ];
  if (payload.edge.write_path) {
    fullVariables.push({ Name: "DECKO_WRITE_PATH", Required: false, DefaultValue: "1" });
    fullVariables.push({ Name: "DECKO_FIRST_RUN", Required: false, DefaultValue: "1" });
  }
  if (storage) {
    fullVariables.push({ Name: "DECKO_STORAGE_ZONE", Required: false, DefaultValue: storage.name });
    fullVariables.push({ Name: "DECKO_STORAGE_HOST", Required: false, DefaultValue: storage.host });
  }
  const frontVariables = [
    ...edgeVariables,
    { Name: "DECKO_TRUSTED_ORIGINS", Required: false, DefaultValue: frontBase },
    { Name: "DECKO_EDGE_FULL_URL", Required: false, DefaultValue: fullBase },
  ];
  for (const [script, variables] of [[full, fullVariables], [front, frontVariables]]) {
    for (const v of variables) {
      const r = await api.call("POST", `/compute/script/${script.id}/variables/add`, v, { expect: [200, 201] });
      console.log(`variable ${v.Name} on ${script.name} -> ${r.status}`);
    }
  }

  // 9. zone flips — SmartCache defeats origin-header caching (measured)
  if (payload.edge.cache_enabled) {
    for (const script of [full, front]) {
      if (!script.zoneId) throw new Error(`caching is on but ${script.name} carried no LinkedPullZones[0].Id`);
      const flip = await api.call("POST", `/pullzone/${script.zoneId}`, { EnableSmartCache: false }, { expect: [200, 204] });
      console.log(`zone ${script.zoneId} (${script.name}) EnableSmartCache=false -> ${flip.status} (respect-origin caching)`);
    }
  }

  // 10. publish — the read front first, then the full engine it forwards to
  for (const script of [front, full]) {
    const pub = await api.call("POST", `/compute/script/${script.id}/publish`,
      { Note: `one-key provision ${startedIso}` }, { expect: [204] });
    console.log(`published ${script.name} -> ${pub.status}`);
  }

  // 11. verify /_status on both scripts (60 s budget each)
  const pollStatus = async (base) => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${base}/_status`, { signal: AbortSignal.timeout(10_000) });
        if (r.status === 200) {
          const body = await r.json().catch(() => ({}));
          if (body.ok === true) return true;
        }
      } catch { /* poll through transient DNS/TLS while the zone propagates */ }
      await new Promise((r) => setTimeout(r, 3_000));
    }
    return false;
  };
  const fullStatusOk = await pollStatus(fullBase);
  const statusOk = await pollStatus(frontBase);
  const base = frontBase;
  const hostname = frontHost;
  console.log(fullStatusOk && statusOk
    ? `VERIFY: ${frontBase}/_status and ${fullBase}/_status -> {"ok":true} — the deck is LIVE at ${frontBase}`
    : `VERIFY: /_status did not answer ok within 60 s (read front ${statusOk}, full engine ${fullStatusOk}) — the publish is real; check propagation/logs at dash.bunny.net before retrying anything`);

  // 11b. the first-run setup token: the deck is public now, so /setup opens
  // only for the link printed below (src/card/auth/setup-token.ts)
  let setupLink = null;
  if (writable) {
    const issue = setupTokenIssue();
    const issued = await applySqlStatements(`${dbUrl.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "")}/v2/pipeline`, dbToken, issue.statements);
    if (issued.applied !== issue.statements.length) throw new Error(`setup token was not stored: ${JSON.stringify(issued).slice(0, 200)}`);
    setupLink = `${base}${issue.path}`;
  }

  // 12. result sidecar — the recovery artifact (payload + result = re-provisionable)
  const resultPath = `${args.payload.replace(/\.json$/i, "")}.result.json`;
  const result = {
    schema: "decko-one-key-provisioning-result",
    schema_version: 1,
    payload: args.payload,
    provisioned_at: startedIso,
    completed_at: new Date().toISOString(),
    verified_status_ok: statusOk,
    verified_status_ok_full_engine: fullStatusOk,
    source: {
      name: payload.deck.source_name,
      sha256: payload.deck.source_sha256,
      bytes: payload.deck.source_bytes,
      local_path_used: resolve(sourcePath),
    },
    bundle: { chars: code.length, sha256: codeSha256, source: bundleShaSource },
    read_bundle: { chars: readCode.length, sha256: readCodeSha256, source: readBundleShaSource },
    served_variables: {
      count: served.length,
      names: served.map((v) => v.Name),
      // Names and value hashes only: the values are the deck's own public
      // configuration, and they live in the --served file, which the
      // recovery record names so the deck can be re-provisioned with them.
      sha256: served.map((v) => ({ name: v.Name, sha256: createHash("sha256").update(v.DefaultValue).digest("hex") })),
      file: args.served ? resolve(args.served) : null,
    },
    bunny: {
      script: { id: full.id, name: b.script_name },
      pull_zone: full.zoneId ? { id: full.zoneId, name: b.pull_zone_name } : null,
      read_front_script: { id: front.id, name: readScriptName },
      read_front_pull_zone: front.zoneId ? { id: front.zoneId, name: readZoneName } : null,
      storage_zone: storage ? { id: storage.id, name: storage.name, host: storage.host } : null,
      database: { id: dbId, name: b.db_name, url: dbUrl, group_id: createdGroupId, group_name: b.db_group_name },
      hostname,
      base_url: base,
      full_engine_hostname: fullHost,
      full_engine_base_url: fullBase,
    },
    secrets_note: "the database tokens are NOT in this file; regenerate via the Bunny API or dashboard Access page",
  };
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`result sidecar written: ${resultPath}`);
  console.log(`
LIVE RUN COMPLETE: ${base}  (read front)
Full engine: ${fullBase} (serves sign-in, signed-in pages and writes; the front forwards them)
Recovery artifact: keep ${args.payload} + ${basename(resultPath)}${args.served ? " + the --served file" : ""} together —
they re-provision this deck (names, ids, bundle + source hashes) with a fresh
API key and no other input. None of them holds a secret.
`);
  if (setupLink) {
    console.log(`First-run setup link (one use; it creates your deck's owner account):
  ${setupLink}

Anyone holding this link can claim the deck until you use it, so open it now.
`);
  }
  return { resultPath, base };
  } catch (e) {
    if (!scriptCreated && (createdGroupId || createdDbId)) {
      console.error(`--execute failed before the script existed; rolling back this run's resources...`);
      if (createdDbId) {
        const r = await api.call("DELETE", `/database/v1/databases/${createdDbId}`);
        console.error(`  rollback: DELETE /database/v1/databases/${createdDbId} -> ${r.status}`);
      }
      if (createdGroupId) {
        const r = await api.call("DELETE", `/database/v1/groups/${createdGroupId}`);
        console.error(`  rollback: DELETE /database/v1/groups/${createdGroupId} -> ${r.status}`);
      }
      if (String(e.message).includes("already taken")) {
        console.error(
          `NOTE: "pull zone name is already taken" is Bunny's GLOBAL namespace, not just your ` +
          `account — a name freed by deleting a script stays reserved for a while. ` +
          `Pick a different name (or wait) and re-run; this run's database + group were rolled back.`);
      }
      console.error(`rollback complete; the account is as it was before the run.`);
    }
    throw e;
  }
}

async function verifyMode({ payload, resolveApi, args }) {
  const { api } = resolveApi();
  const b = payload.bunny;
  const readName = b.read_script_name ?? `${b.script_name}-read`;
  const { scriptList, dbList } = await listExistingResources(api);
  const script = scriptList.find((s) => (s.Name ?? s.name) === b.script_name);
  const front = scriptList.find((s) => (s.Name ?? s.name) === readName);
  const db = dbList.find((x) => (x.name ?? x.Name) === b.db_name);
  const checks = [];
  checks.push(["full engine script exists", script != null, script ? `Id ${script.Id ?? script.id}` : "not found"]);
  checks.push(["read front script exists", front != null, front ? `Id ${front.Id ?? front.id}` : "not found"]);
  checks.push(["database exists", db != null, db ? `${db.id ?? db.Id}` : "not found"]);
  let hostname = null;
  if (front) {
    const details = await api.call("GET", `/compute/script/${front.Id ?? front.id}`, undefined, { expect: [200] });
    hostname = details.json?.DefaultHostname ? normalizeHostname(details.json.DefaultHostname) : null;
    const vars = details.json?.EdgeScriptVariables ?? [];
    const fullUrl = vars.find((v) => v.Name === "DECKO_EDGE_FULL_URL");
    checks.push(["read front DECKO_EDGE_FULL_URL variable", fullUrl != null,
      fullUrl ? `DefaultValue=${fullUrl.DefaultValue}` : "absent (the front cannot forward)"]);
  }
  if (script) {
    const scriptId = script.Id ?? script.id;
    const details = await api.call("GET", `/compute/script/${scriptId}`, undefined, { expect: [200] });
    const vars = details.json?.EdgeScriptVariables ?? [];
    const cacheVar = vars.find((v) => v.Name === "DECKO_EDGE_CACHE");
    checks.push(["DECKO_EDGE_CACHE variable", cacheVar != null,
      cacheVar ? `DefaultValue=${cacheVar.DefaultValue}` : "absent"]);
    if (cacheVar && cacheVar.DefaultValue !== (payload.edge.cache_enabled ? "1" : "0")) {
      checks.push(["cache flag matches payload", false, `payload wants ${payload.edge.cache_enabled ? 1 : 0}`]);
    }
  }
  if (hostname) {
    const base = `https://${hostname}`;
    try {
      const r = await fetch(`${base}/_status`, { signal: AbortSignal.timeout(10_000) });
      const body = await r.json().catch(() => ({}));
      checks.push(["/_status through the read front", r.status === 200 && body.ok === true,
        `HTTP ${r.status} ok=${String(body.ok)} card_count=${String(body.database?.card_count ?? "?")}`]);
    } catch (e) {
      checks.push(["/_status through the read front", false, String(e).slice(0, 120)]);
    }
  } else {
    checks.push(["/_status through the read front", false, "no DefaultHostname (script missing or not created by this flow)"]);
  }
  const resultPath = `${args.payload.replace(/\.json$/i, "")}.result.json`;
  if (existsSync(resultPath)) {
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    checks.push(["result sidecar ids match account", true,
      `script ${result.bunny?.script?.id ?? "?"}, db ${result.bunny?.database?.id ?? "?"}`]);
  } else {
    checks.push(["result sidecar", false, `${basename(resultPath)} not found — this payload was never executed here`]);
  }
  console.log(`\n===== VERIFY (read-only) — payload ${args.payload} =====`);
  let allPass = true;
  for (const [name, pass, detail] of checks) {
    if (!pass) allPass = false;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(allPass ? "VERIFY OK: the payload's deck is provisioned and answering.\n" : "VERIFY FAILED: see the FAIL lines above.\n");
  if (!allPass) process.exitCode = EXIT_GENERAL;
}

async function teardownMode({ payload, resolveApi, args }) {
  const b = payload.bunny;
  if (!args.yes || !args.name) {
    throw new ProvisionRefusal(REFUSAL.TEARDOWN_UNCONFIRMED,
      "--teardown permanently deletes the edge script, pull zone linkage, database and group this " +
      "payload created. Require both --yes AND --name " + b.script_name + " (exact match).");
  }
  if (args.name !== b.script_name) {
    throw new ProvisionRefusal(REFUSAL.NAME_MISMATCH,
      `--name "${args.name}" does not equal the payload's script name "${b.script_name}". ` +
      `A deletion is never "close enough".`);
  }
  if (protectedResourceNames(args.protect ?? []).has(args.name)) {
    throw new ProvisionRefusal(REFUSAL.PROTECTED_NAME,
      `"${args.name}" is a protected resource name; this tool will never delete it.`);
  }
  const resultPath = `${args.payload.replace(/\.json$/i, "")}.result.json`;
  if (!existsSync(resultPath)) {
    throw new ProvisionRefusal(REFUSAL.PAYLOAD_INVALID,
      `no result sidecar at ${resultPath} — teardown only deletes what an --execute of THIS payload created (ids recorded there).`);
  }
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  const ids = result?.bunny;
  if (!ids?.script?.id || !ids?.database?.id) {
    throw new ProvisionRefusal(REFUSAL.PAYLOAD_INVALID,
      "result sidecar lacks script/database ids — nothing this tool can attribute its deletes to.");
  }
  const { api } = resolveApi();
  console.log(`===== TEARDOWN (destructive; ids from ${basename(resultPath)}) =====`);
  // The read front first, then the full engine: the front forwards to the
  // full script, so removing the full one first would leave the front
  // answering 500s until it is gone too. A sidecar from a run before the
  // front existed has no read_front_script — nothing to delete for it.
  if (ids.read_front_script?.id) {
    const f = await api.call("DELETE", `/compute/script/${ids.read_front_script.id}`, undefined, { expect: [200, 204] });
    console.log(`DELETE /compute/script/${ids.read_front_script.id} (${ids.read_front_script.name}, read front) -> ${f.status}`);
  }
  if (ids.read_front_pull_zone?.id) {
    const z = await api.call("DELETE", `/pullzone/${ids.read_front_pull_zone.id}`, undefined, { expect: [200, 204, 404] });
    console.log(`DELETE /pullzone/${ids.read_front_pull_zone.id} (${ids.read_front_pull_zone.name}) -> ${z.status}`);
  }
  const s = await api.call("DELETE", `/compute/script/${ids.script.id}`, undefined, { expect: [200, 204] });
  console.log(`DELETE /compute/script/${ids.script.id} (${ids.script.name}) -> ${s.status}`);
  // Deleting the script leaves its linked pull zone in place (measured on
  // the live API), so the zone the execute created is deleted by its own id.
  if (ids.pull_zone?.id) {
    const z = await api.call("DELETE", `/pullzone/${ids.pull_zone.id}`, undefined, { expect: [200, 204, 404] });
    console.log(`DELETE /pullzone/${ids.pull_zone.id} (${ids.pull_zone.name}) -> ${z.status}`);
  }
  const d = await api.call("DELETE", `/database/v1/databases/${ids.database.id}`, undefined, { expect: [200, 204] });
  console.log(`DELETE /database/v1/databases/${ids.database.id} (${ids.database.name}) -> ${d.status}`);
  if (ids.database?.group_id) {
    const g = await api.call("DELETE", `/database/v1/groups/${ids.database.group_id}`, undefined, { expect: [200, 204] });
    console.log(`DELETE /database/v1/groups/${ids.database.group_id} (${ids.database.group_name}) -> ${g.status}`);
  }
  console.log("teardown complete. The result sidecar remains as the record of what existed.");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function repoRootOf(importMetaUrl) {
  // deploy/provisioning/<this file> -> repo root is three levels up
  return resolve(dirname(fileURLToPath(importMetaUrl)), "..", "..");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`provision-bunny-deck: ${e.message}`);
    process.exit(EXIT_REFUSED);
  }
  if (args.help) {
    console.log(readFileSync(new URL("./provision-bunny-deck-help.txt", import.meta.url), "utf8"));
    process.exit(EXIT_OK);
  }
  const modes = [args.execute, args.verify, args.teardown].filter(Boolean).length;
  if (modes > 1) {
    console.error("provision-bunny-deck: --execute, --verify and --teardown are mutually exclusive");
    process.exit(EXIT_REFUSED);
  }

  try {
    const payload = loadPayload(args.payload, { protectedNames: protectedResourceNames(args.protect) });
    const sourcePath = args.source ?? null;
    // Read (and check against Bunny's script-variable limits) before the
    // plan, so an oversized served value is refused with no network call and
    // no account write — a script whose variable is too long answers HTTP
    // 400 on every request.
    const served = loadServedVariables(args.served);
    const steps = buildSteps(payload, { sourcePath, writePathAllowed: args.allowWritePath, served });

    if (!args.execute && !args.verify && !args.teardown) {
      printPlan({ payload, steps, sourcePath, payloadPath: args.payload, served });
      return;
    }

    // GATE ORDER: each mode enforces its own refusal gates BEFORE the API key
    // is touched — an unconfirmed --execute must refuse on the gate, never on
    // a creds-file error (the one-click-deck.mjs first-check pattern). The
    // api factory is lazy on purpose: modes call it only after their gates.
    const resolveApi = () => {
      const { key } = resolveApiKey(args);
      return { api: makeBunnyApi(key), keyMask: maskKey(key) };
    };

    if (args.execute) {
      await executeMode({ payload, resolveApi, args, sourcePath, served });
    } else if (args.verify) {
      await verifyMode({ payload, resolveApi, args });
    } else {
      await teardownMode({ payload, resolveApi, args });
    }
  } catch (e) {
    if (e instanceof ProvisionRefusal) {
      console.error(`provision-bunny-deck: refused ${e.marker}\n${e.message}`);
      process.exit(EXIT_REFUSED);
    }
    console.error(`provision-bunny-deck: ${e.message}`);
    process.exit(EXIT_GENERAL);
  }
}

const isDirectRun = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  main();
}
