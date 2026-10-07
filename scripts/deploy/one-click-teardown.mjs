// one-click-teardown.mjs — the ONE-CLICK TEARDOWN for the decko-ts Cloudflare
// deploy. A one-click create without a one-click destroy is half a product:
// this is the destroy.
//
// It is the exact inverse of what a deploy creates, and it attributes every
// deletion to the deploy that would have created it:
//
//   LIST MODE (the default; also what --dry-run means)  — read-only. Reads the
//     wrangler config, then asks the Cloudflare API what exists under the exact
//     names that config declares, using the SAME credential env the deploy uses
//     (CF_API_TOKEN / CLOUDFLARE_API_TOKEN and CF_ACCOUNT_ID /
//     CLOUDFLARE_ACCOUNT_ID — one-click-deck.mjs:68-69). Writes nothing.
//     Prints every candidate with the three facts you need to judge it:
//     NAME, ID, CREATED-DATE. Exits 0.
//
//   DESTROY MODE (--yes)  — deletes exactly the resources LIST mode named, and
//     nothing else. Prints each deletion as it happens. Never deletes by
//     pattern, never deletes a resource whose name the config does not
//     declare, and refuses outright on anything ambiguous.
//
// WHY A SECOND FLAG: --yes alone prints the plan and exits 2 with
// --plan-review-required, handing back a FINGERPRINT of the plan. The caller
// re-runs with --yes --confirm-plan <fingerprint>. You cannot type a
// fingerprint you have not read, so "the caller reviewed the list" is enforced
// by the shape of the CLI rather than by trust. See the README's "One-click
// teardown" section, next to the deploy instructions.
//
// NAME OVERRIDES WITHOUT A CONFIG: --worker-name <name> / --db-name <name>
// attribute against names alone, for deploys with no committed wrangler config
// — the frozen demo pair (Worker  + D1 , named
// only in deploy/cleanup.mjs and docs/one-click-cf-deploy-inventory.md) is
// exactly that case. Without --config no config file is read at all, so the
// overrides cannot silently mix with whatever another config declares. With an
// explicit --config the overrides must AGREE with it; a disagreement is the
// --override-conflicts-with-config refusal, in the same style as every other
// name-mismatch refusal here. Every safety semantic is unchanged: list mode
// stays the read-only default, the destroy double-gate still applies, and
// attribution stays byte-exact.
//
// COMMANDS IT RUNS (destroy mode only), verified against the INSTALLED
// wrangler 4.135.0 on this machine (`wrangler --version` -> 4.135.0):
//
//   npx wrangler delete <worker-name> --config <config>
//       `wrangler delete --help` (4.135.0):
//         wrangler delete [name]
//         POSITIONALS  name  Name of the worker  [string]
//         OPTIONS      --dry-run  Don't actually delete
//                       --force    Delete even if doing so will break other
//                                  Workers that depend on this one
//       => the name is a POSITIONAL, not a --name flag. --force is deliberately
//          NOT passed: if something else depends on this Worker, wrangler's own
//          refusal is the answer, and this script reports it rather than
//          overriding it. (`--dry-run` exists on this command and is the
//          no-op form of LIST mode, but LIST mode here does not shell out at
//          all — it reads the API directly, so it works with no wrangler and
//          no TTY.)
//
//   npx wrangler d1 delete <database_name> --skip-confirmation --config <config>
//       `wrangler d1 delete --help` (4.135.0):
//         wrangler d1 delete <name>
//         POSITIONALS  name  The name or binding of the DB  [string] [required]
//         OPTIONS      -y, --skip-confirmation  Skip confirmation  [boolean]
//       => name-or-BINDING, so the database_name from the config's
//          [[d1_databases]] block resolves directly; the database_id/UUID is
//          printed for the human but is NOT passed (this positional does not
//          take a UUID).
//
//   Deletion order is Worker first, then D1: the Worker's D1 binding points at
//   the database, so removing the Worker first leaves nothing pointing at a
//   half-deleted database.
//
// HOUSE RULES HONOURED HERE:
//   - Attribution, not patterns. A resource is a candidate only if the API's
//     own name/id is byte-equal to a name this config declares. Mismatch ->
//     refusal, never a "close enough" delete.
//   - A failed/!success API response is an ERROR, never an empty plan. An empty
//     plan means "queried fine, nothing matched", which is the one case where
//     zero deletions is correct.
//   - Platform-specific process spawning lives in one-click-deck/platform-ops.mjs
//     (dual-path or a LOUD PLATFORM-OPS error), imported below rather than
//     re-implemented.
//   - Every function that does I/O takes its collaborators as parameters, so the
//     unit tests drive the whole plan/destroy path against recorded API
//     responses with zero network and zero subprocesses.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { npxInvocation, PlatformOpsError } from "./one-click-deck/platform-ops.mjs";

export const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export const EXIT_OK = 0;
export const EXIT_GENERAL = 1;
export const EXIT_REFUSED = 2;
export const EXIT_PLATFORM_OPS = 3;

/** Refusal marker strings — greppable, machine-checkable, one per failure mode. */
export const REFUSAL = {
  PLAN_NOT_REVIEWED: "--plan-review-required",
  PLAN_EMPTY: "--nothing-to-remove",
  NAME_MISMATCH: "--name-mismatch",
  AMBIGUOUS_DATABASE_NAME: "--ambiguous-database-name",
  CREDENTIALS_MISSING: "--credentials-missing",
  CONFIG_UNREADABLE: "--config-unreadable",
  API_FAILED: "--api-failed",
  NOT_DEPLOYED: "--not-deployed",
  OVERRIDE_CONFLICT: "--override-conflicts-with-config",
};

export class TeardownRefusal extends Error {
  constructor(marker, message, detail = {}) {
    super(message);
    this.name = "TeardownRefusal";
    this.marker = marker;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// credentials — the SAME env the deploy uses (one-click-deck.mjs:68-69)
// ---------------------------------------------------------------------------

/**
 * Resolve the Cloudflare credentials exactly as one-click-deck.mjs does.
 * Deliberately NOT reading any other variable: a teardown that authenticates
 * differently from the deploy it is undoing is a teardown that can delete
 * something the deploy never made.
 */
export function resolveCredentials(env = process.env) {
  return {
    token: env.CF_API_TOKEN ?? env.CLOUDFLARE_API_TOKEN ?? null,
    accountId: env.CF_ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID ?? null,
  };
}

export function assertCredentials(credentials) {
  if (!credentials.token) {
    throw new TeardownRefusal(
      REFUSAL.CREDENTIALS_MISSING,
      "no Cloudflare API token in the environment — set CF_API_TOKEN (or CLOUDFLARE_API_TOKEN), " +
        "the same variable the deploy reads",
    );
  }
  if (!credentials.accountId) {
    throw new TeardownRefusal(
      REFUSAL.CREDENTIALS_MISSING,
      "no Cloudflare account id in the environment — set CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), " +
        "the same variable the deploy reads",
    );
  }
}

// ---------------------------------------------------------------------------
// the wrangler config — the only source of attribution
// ---------------------------------------------------------------------------

/** database_id values that mean "never provisioned / never bound". */
const PLACEHOLDER_DATABASE_IDS = new Set([
  "",
  "TBD_REPLACE_AFTER_WRANGLER_D1_CREATE",
  "00000000-0000-0000-0000-000000000001",
]);

export function isPlaceholderDatabaseId(id) {
  if (typeof id !== "string") return true;
  const trimmed = id.trim();
  if (PLACEHOLDER_DATABASE_IDS.has(trimmed)) return true;
  // any TBD_/REPLACE_/PLACEHOLDER_ marker is a placeholder, whatever follows it
  return /^(TBD|REPLACE|PLACEHOLDER)/i.test(trimmed);
}

/** Strip a trailing `#` comment, respecting quoted strings. */
function stripComment(line) {
  let inBasic = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && inBasic) { i++; continue; }
    if (ch === '"') inBasic = !inBasic;
    else if (ch === "#" && !inBasic) return line.slice(0, i);
  }
  return line;
}

/** `key = "value"` -> ["key", "value"]; anything else -> null. */
function parseAssignment(trimmed) {
  const eq = trimmed.indexOf("=");
  if (eq < 0) return null;
  const key = trimmed.slice(0, eq).trim().replace(/^["']|["']$/g, "");
  const raw = trimmed.slice(eq + 1).trim();
  if (raw.length < 2) return null;
  const first = raw[0];
  const last = raw[raw.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return [key, raw.slice(1, -1)];
  }
  // array-of-strings, boolean, number: not needed for attribution. Skip the
  // assignment rather than guessing at a value this script would delete on.
  return null;
}

/**
 * Read the deploy targets out of a wrangler config.
 *
 * This is a strict subset reader, not a TOML parser: it collects `name` and the
 * `[[d1_databases]]` tables and ignores everything else. It FAILS LOUD rather
 * than guessing — a config it cannot attribute cleanly is a config this script
 * will not delete against.
 *
 * @returns {{configPath: string, workerName: string, databases: Array<{binding: string|null, databaseName: string, databaseId: string|null, databaseIdIsPlaceholder: boolean}>, warnings: string[]}}
 */
export function parseWranglerDeployConfig(tomlText, { configPath = "(inline)" } = {}) {
  const warnings = [];
  let workerName = null;
  const databases = [];
  const lines = tomlText.split(/\r?\n/);

  // one pass, two collectors: the root-level `name`, and the raw key/value
  // text of each [[d1_databases]] table.
  let table = "(root)";
  let block = null;
  const flushBlock = () => {
    if (block) databases.push(block);
    block = null;
  };

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      flushBlock();
      table = line.slice(2, -2).trim();
      if (table === "d1_databases") block = { raw: {} };
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      flushBlock();
      table = line.slice(1, -1).trim();
      continue;
    }

    const pair = parseAssignment(line);
    if (!pair) continue;
    const [key, value] = pair;

    if (block) {
      block.raw[key] = value;
      continue;
    }
    if (table === "(root)" && key === "name") {
      if (workerName !== null && workerName !== value) {
        throw new TeardownRefusal(
          REFUSAL.CONFIG_UNREADABLE,
          `${configPath}: two different top-level \`name\` values (${workerName} and ${value}) — refusing to attribute a Worker`,
        );
      }
      workerName = value;
    }
  }
  flushBlock();

  const resolved = databases.map((db) => {
    const databaseName = db.raw.database_name;
    if (!databaseName) {
      throw new TeardownRefusal(
        REFUSAL.CONFIG_UNREADABLE,
        `${configPath}: a [[d1_databases]] table has no database_name — refusing to attribute a D1 database by binding alone`,
      );
    }
    const databaseId = db.raw.database_id ?? null;
    return {
      binding: db.raw.binding ?? null,
      databaseName,
      databaseId,
      databaseIdIsPlaceholder: isPlaceholderDatabaseId(databaseId),
    };
  });

  if (!workerName) {
    warnings.push(
      `${configPath}: no top-level \`name\` — this config declares no Worker, so no Worker is attributed to it`,
    );
  }
  if (resolved.length === 0) {
    warnings.push(`${configPath}: no [[d1_databases]] table — this config declares no D1 database`);
  }
  for (const db of resolved) {
    if (db.databaseIdIsPlaceholder && db.databaseId) {
      warnings.push(
        `${configPath}: database "${db.databaseName}" carries the placeholder id "${db.databaseId}" — ` +
          `attribution falls back to the exact NAME match against the account's database list`,
      );
    }
  }

  return { configPath, workerName, databases: resolved, warnings };
}

export function readWranglerDeployConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new TeardownRefusal(REFUSAL.CONFIG_UNREADABLE, `no wrangler config at ${configPath}`);
  }
  return parseWranglerDeployConfig(readFileSync(configPath, "utf8"), { configPath });
}

// ---------------------------------------------------------------------------
// name overrides — attribution without a config file
// ---------------------------------------------------------------------------

/**
 * The config-free attribution source: --worker-name / --db-name, for deploys
 * that have no committed wrangler config to point --config at. The frozen demo
 * pair (Worker  + D1 , named only in
 * deploy/cleanup.mjs and docs/one-click-cf-deploy-inventory.md) is exactly
 * this case.
 *
 * The shape is the SAME DeployConfig the file reader returns, flagged
 * `configless: true` — so everything downstream (attribution, the plan, the
 * fingerprint, the destroy double-gate) is literally the same code path. The
 * d1 entry carries no database_id, which lands on the placeholder path: exact
 * NAME match against the account's database list, nothing else.
 */
export function buildConfiglessConfig({ workerName = null, dbName = null } = {}) {
  const warnings = [];
  if (!workerName) warnings.push("no --worker-name given — no Worker is attributed to this run");
  if (!dbName) warnings.push("no --db-name given — no D1 database is attributed to this run");
  return {
    configPath: "(no config file — names given with --worker-name/--db-name)",
    configless: true,
    workerName: workerName ?? null,
    databases: dbName
      ? [{ binding: null, databaseName: dbName, databaseId: null, databaseIdIsPlaceholder: true }]
      : [],
    warnings,
  };
}

/**
 * Apply --worker-name / --db-name on top of an explicitly-passed --config.
 * An override may only NAME what the config names or fill a name the config
 * omits — never swap one for another:
 *
 *   - override equals the declared name (or the config declares none)  -> fine
 *   - override disagrees with a name the config declares               -> refusal
 *
 * The refusal carries the OVERRIDE_CONFLICT marker, in the same style as the
 * attribution name-mismatch refusals: greppable, machine-checkable, with the
 * disagreeing pair in `detail`. Overrides never narrow a multi-database
 * config — a config that declares the name stands exactly as declared.
 */
export function applyOverridesToConfig(config, { workerName = null, dbName = null } = {}) {
  let effectiveWorkerName = config.workerName;
  if (workerName != null) {
    if (config.workerName != null && config.workerName !== workerName) {
      throw new TeardownRefusal(
        REFUSAL.OVERRIDE_CONFLICT,
        `--worker-name "${workerName}" disagrees with the Worker name the config declares, ` +
          `"${config.workerName}" (${config.configPath}) — refusing to attribute against two different names`,
        { override: workerName, declared: config.workerName, configPath: config.configPath },
      );
    }
    effectiveWorkerName = config.workerName ?? workerName;
  }

  let databases = config.databases;
  if (dbName != null) {
    if (config.databases.length > 0 && !config.databases.some((d) => d.databaseName === dbName)) {
      throw new TeardownRefusal(
        REFUSAL.OVERRIDE_CONFLICT,
        `--db-name "${dbName}" disagrees with the D1 database(s) the config declares ` +
          `(${config.databases.map((d) => d.databaseName).join(", ")}) (${config.configPath}) — ` +
          `refusing to attribute against two different names`,
        {
          override: dbName,
          declared: config.databases.map((d) => d.databaseName),
          configPath: config.configPath,
        },
      );
    }
    if (config.databases.length === 0) {
      databases = [
        { binding: null, databaseName: dbName, databaseId: null, databaseIdIsPlaceholder: true },
      ];
    }
  }

  return { ...config, workerName: effectiveWorkerName, databases };
}

// ---------------------------------------------------------------------------
// recorded Cloudflare API shapes -> parse (no network; fixtures drive the tests)
// ---------------------------------------------------------------------------

function requireSuccessEnvelope(json, what) {
  if (!json || typeof json !== "object") {
    throw new TeardownRefusal(REFUSAL.API_FAILED, `${what}: response was not a JSON object`);
  }
  if (json.success !== true) {
    const errors = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new TeardownRefusal(REFUSAL.API_FAILED, `${what}: Cloudflare returned success=${json.success}${errors ? ` — ${errors}` : ""}`);
  }
  if (!Array.isArray(json.result)) {
    throw new TeardownRefusal(REFUSAL.API_FAILED, `${what}: response had no result array`);
  }
  return json.result;
}

/**
 * GET /accounts/{id}/workers/services/{name}
 * Shape source: this is the path the installed wrangler 4.135.0 itself calls
 * (wrangler-dist/cli.js, `resolveOwnerWorkerTag` ->
 * `/accounts/${accountId}/workers/services/${scriptName}`, reading
 * `default_environment`). Fields tolerated here are the service envelope.
 */
export function parseWorkerServiceResponse(json) {
  if (!json || json.success !== true || json.result == null || typeof json.result !== "object") {
    return { found: false, service: null };
  }
  const s = json.result;
  return {
    found: true,
    service: {
      id: typeof s.id === "string" ? s.id : null,
      createdOn: typeof s.created_on === "string" ? s.created_on : null,
      modifiedOn: typeof s.modified_on === "string" ? s.modified_on : null,
      defaultEnvironment: s.default_environment ?? null,
    },
  };
}

/**
 * GET /accounts/{id}/workers/scripts/{name}/deployments
 * Shape source: Cloudflare API reference for the deployments list —
 * `result: { deployments: [{ id, created_on, source, strategy, versions, annotations, author_email }] }`.
 * This is where a Worker's CREATED-DATE comes from; the service envelope's
 * `created_on` is the service's, not this deployment's, and the deployment is
 * what `wrangler deploy` actually made.
 */
export function parseWorkerDeploymentsResponse(json) {
  const deployments = json?.result?.deployments;
  if (!Array.isArray(deployments)) return { deployments: [], latest: null };
  const parsed = deployments.map((d) => ({
    id: typeof d?.id === "string" ? d.id : null,
    createdOn: typeof d?.created_on === "string" ? d.created_on : null,
    source: d?.source ?? null,
    strategy: d?.strategy ?? null,
    authorEmail: d?.author_email ?? null,
  }));
  return { deployments: parsed, latest: parsed[0] ?? null };
}

/**
 * GET /accounts/{id}/d1/database
 * Shape source: Cloudflare API reference for the D1 database list —
 * `result: [{ created_at, jurisdiction, name, uuid, version }]`,
 * envelope `success` + `result_info { count, page, per_page, total_count }`.
 */
export function parseD1DatabaseListResponse(json) {
  const result = requireSuccessEnvelope(json, "GET /accounts/{id}/d1/database");
  return {
    totalCount: json.result_info?.total_count ?? result.length,
    databases: result
      .filter((db) => db && typeof db === "object")
      .map((db) => ({
        uuid: typeof db.uuid === "string" ? db.uuid : null,
        name: typeof db.name === "string" ? db.name : null,
        createdAt: typeof db.created_at === "string" ? db.created_at : null,
        version: typeof db.version === "string" ? db.version : null,
        jurisdiction: db.jurisdiction ?? null,
      })),
  };
}

/**
 * POST /accounts/{id}/d1/database/{uuid}/query  (read-only SQL: a SELECT)
 * Shape source: Cloudflare API reference for the D1 query endpoint —
 * `result: [{ success, results: [...], meta: { rows_read, rows_written, ... } }]`.
 * Used here ONLY to read sqlite_master (the migrations/schema state). A
 * non-SELECT would be a write; this function rejects one rather than runs it.
 */
export function parseD1QueryResponse(json, { what = "query" } = {}) {
  const result = requireSuccessEnvelope(json, what);
  const first = result[0];
  if (!first || first.success === false) {
    const message = first?.errors?.map?.((e) => e.message).join("; ") ?? "statement failed";
    return { ok: false, rows: [], message };
  }
  return {
    ok: true,
    rows: Array.isArray(first.results) ? first.results : [],
    rowsRead: first.meta?.rows_read ?? null,
    rowsWritten: first.meta?.rows_written ?? null,
  };
}

/** Guard: only a single read-only SELECT is ever sent on the migrations probe. */
export function isReadOnlySelect(sql) {
  return /^\s*(?:WITH\b[\s\S]*?)?\s*SELECT\b/i.test(sql) && !/;\s*\S/.test(sql);
}

// ---------------------------------------------------------------------------
// attribution: API answer -> what may be deleted
// ---------------------------------------------------------------------------

/**
 * Match the account's Worker list against the ONE name the config declares.
 * Any id the API returns that is not byte-equal to the config's name is a
 * mismatch and is refused — there is no nearest-match, ever.
 */
export function attributeWorker(workerName, serviceResponse, deploymentsResponse) {
  if (!workerName) {
    return { kind: "worker", status: "not-declared", name: null, resource: null, reason: "the config declares no Worker name" };
  }
  const { found, service } = parseWorkerServiceResponse(serviceResponse);
  if (!found) {
    return { kind: "worker", status: "absent", name: workerName, resource: null, reason: `no Worker named "${workerName}" is deployed on this account` };
  }
  if (service.id !== workerName) {
    throw new TeardownRefusal(
      REFUSAL.NAME_MISMATCH,
      `Worker attribution mismatch: the config declares "${workerName}" but the account reports ` +
        `service id "${service.id ?? "(none)"}" — refusing to delete anything`,
      { declared: workerName, reported: service.id },
    );
  }
  const { latest } = parseWorkerDeploymentsResponse(deploymentsResponse);
  return {
    kind: "worker",
    status: "removable",
    name: workerName,
    resource: {
      kind: "worker",
      name: workerName,
      id: service.id,
      createdAt: latest?.createdOn ?? service.createdOn ?? null,
      createdAtSource: latest?.createdOn ? "workers script deployments[0].created_on" : "workers services.created_on",
      deploymentId: latest?.id ?? null,
      note: "wrangler delete refuses on its own if another Worker depends on this one; --force is not passed",
    },
  };
}

/**
 * Match the account's D1 list against the ONE database_name each config
 * [[d1_databases]] table declares. Two databases answering to the same exact
 * name is ambiguous and is refused; a config id that disagrees with the account
 * is refused.
 */
export function attributeDatabase(db, listResponse) {
  const { databases, totalCount } = parseD1DatabaseListResponse(listResponse);
  const matches = databases.filter((candidate) => candidate.name === db.databaseName);

  if (matches.length === 0) {
    return {
      kind: "d1",
      status: "absent",
      name: db.databaseName,
      binding: db.binding,
      resource: null,
      reason: `no D1 database named "${db.databaseName}" on this account (the account lists ${totalCount})`,
    };
  }
  if (matches.length > 1) {
    throw new TeardownRefusal(
      REFUSAL.AMBIGUOUS_DATABASE_NAME,
      `D1 attribution is ambiguous: ${matches.length} databases on this account are named ` +
        `"${db.databaseName}" (${matches.map((m) => m.uuid).join(", ")}) — refusing to guess`,
      { declared: db.databaseName, uuids: matches.map((m) => m.uuid) },
    );
  }
  const match = matches[0];
  if (!db.databaseIdIsPlaceholder) {
    const declared = String(db.databaseId).trim();
    const reported = (match.uuid ?? "").toLowerCase();
    const sameUuid = declared.toLowerCase() === reported;
    const sameNameAndIdUnset = reported === "" && declared === "";
    if (!sameUuid && !sameNameAndIdUnset) {
      throw new TeardownRefusal(
        REFUSAL.NAME_MISMATCH,
        `D1 attribution mismatch: the config declares "${db.databaseName}" with id ${declared}, ` +
          `but the account reports "${db.databaseName}" as ${match.uuid} — refusing to delete anything`,
        { declared: db.databaseId, reported: match.uuid },
      );
    }
  }
  return {
    kind: "d1",
    status: "removable",
    name: db.databaseName,
    binding: db.binding,
    resource: {
      kind: "d1",
      name: match.name,
      id: match.uuid,
      binding: db.binding,
      createdAt: match.createdAt,
      createdAtSource: "d1 database list item .created_at",
      version: match.version,
      jurisdiction: match.jurisdiction,
      note: "wrangler d1 delete takes the NAME (or binding) as a positional, not the UUID",
    },
  };
}

// ---------------------------------------------------------------------------
// the plan
// ---------------------------------------------------------------------------

/**
 * Build the teardown plan. Pure: it takes parsed API responses and returns the
 * list, the refusals, and a fingerprint of exactly what a --yes run would
 * delete. Order is Worker first, then D1 (see file header).
 */
export function buildTeardownPlan({
  config,
  workerServiceResponse = null,
  workerDeploymentsResponse = null,
  d1ListResponse = null,
  migrations = null,
} = {}) {
  const refusals = [];
  const candidates = [];

  if (config.workerName) {
    if (workerServiceResponse === null) {
      refusals.push({
        kind: "worker",
        marker: REFUSAL.API_FAILED,
        message: `could not read Worker "${config.workerName}" — the account answer is unknown, so nothing is attributed`,
      });
    } else {
      const attributed = attributeWorker(config.workerName, workerServiceResponse, workerDeploymentsResponse);
      if (attributed.status === "removable") candidates.push(attributed.resource);
      else refusals.push({ kind: "worker", marker: REFUSAL.NOT_DEPLOYED, message: attributed.reason });
    }
  }

  for (const db of config.databases) {
    if (d1ListResponse === null) {
      refusals.push({
        kind: "d1",
        marker: REFUSAL.API_FAILED,
        message: `could not read the account's D1 database list — "${db.databaseName}" is unattributed`,
      });
      continue;
    }
    const attributed = attributeDatabase(db, d1ListResponse);
    if (attributed.status === "removable") candidates.push(attributed.resource);
    else refusals.push({ kind: "d1", marker: REFUSAL.NOT_DEPLOYED, message: attributed.reason });
  }

  const plan = {
    configPath: config.configPath,
    configless: config.configless === true,
    workerName: config.workerName,
    databases: config.databases,
    generatedFor: "one-click Cloudflare deploy (scripts/deploy/one-click-teardown.mjs)",
    candidates,
    refusals,
    migrations,
    warnings: config.warnings ?? [],
  };
  plan.fingerprint = planFingerprint(plan);
  return plan;
}

/**
 * A fingerprint of the exact deletion set. The caller has to read the plan to
 * get it, which is the whole point (see file header).
 */
export function planFingerprint(plan) {
  const material = JSON.stringify(
    plan.candidates.map((c) => [c.kind, c.name, c.id ?? null]),
  );
  return createHash("sha256").update(material).digest("hex").slice(0, 12);
}

/** The wrangler invocations a --yes run performs, in order. A configless plan
 * (attribution from --worker-name/--db-name) carries no --config: there is no
 * config file for wrangler to read, and the names are passed as positionals
 * exactly as the legacy deploy/cleanup.mjs runs them. */
export function teardownCommands(plan, { configPath = plan.configPath } = {}) {
  const configArgs = plan.configless === true ? [] : ["--config", configPath];
  return plan.candidates.map((c) =>
    c.kind === "worker"
      ? { kind: "worker", argv: ["delete", c.name, ...configArgs], resource: c }
      : {
          kind: "d1",
          argv: ["d1", "delete", c.name, "--skip-confirmation", ...configArgs],
          resource: c,
        },
  );
}

// ---------------------------------------------------------------------------
// the destroy gate
// ---------------------------------------------------------------------------

/**
 * The gate. Three ways to stop, all before any subprocess runs:
 *   - no --yes at all                       -> caller asked for LIST
 *   - --yes without a matching fingerprint  -> --plan-review-required
 *   - an empty candidate list               -> --nothing-to-remove
 */
export function assertDestroyAllowed(plan, { yes = false, confirmPlan = null } = {}) {
  if (!yes) {
    throw new TeardownRefusal(
      REFUSAL.PLAN_NOT_REVIEWED,
      "destroy mode needs --yes; running without it is LIST mode and deletes nothing",
    );
  }
  if (plan.candidates.length === 0) {
    throw new TeardownRefusal(
      REFUSAL.PLAN_EMPTY,
      "nothing is attributable to this deploy on this account — deleting nothing (a re-run after a " +
        "successful teardown lands here; a failed API call raises --api-failed instead, never this)",
    );
  }
  if (confirmPlan !== plan.fingerprint) {
    throw new TeardownRefusal(
      REFUSAL.PLAN_NOT_REVIEWED,
      `the plan changed or was not reviewed: pass --confirm-plan ${plan.fingerprint} ` +
        `(the fingerprint printed by this run)`,
      { expected: plan.fingerprint, got: confirmPlan },
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// running the deletions
// ---------------------------------------------------------------------------

/** Default runner: spawn the real wrangler CLI. Injected in tests. */
export function wranglerRunner({ cwd }) {
  return (argv) => {
    const { command, wranglerArgsPrefix, useShell } = npxInvocation();
    const full = [...wranglerArgsPrefix, ...argv];
    console.log(`  $ ${command} ${full.join(" ")}`);
    const result = spawnSync(command, full, {
      cwd,
      shell: useShell,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

/**
 * The mode dispatch — the one place that decides whether a subprocess may run.
 *
 *   no --yes  -> LIST. `run` is not called. Ever.
 *   --yes     -> the gate throws --plan-review-required. `run` is not called.
 *   --yes + a matching fingerprint -> `run` is called once per candidate, in
 *               order.
 *
 * `run` is a parameter, so the guarantee "nothing is deleted before the plan is
 * reviewed" is a testable property of this function rather than a promise in a
 * comment. main() supplies the real wrangler runner; the unit tests supply a
 * spy.
 */
export function dispatchTeardown(plan, { yes = false, confirmPlan = null, run, configPath = plan.configPath } = {}) {
  if (!yes) {
    return { mode: "list", deleted: [], refused: null };
  }
  assertDestroyAllowed(plan, { yes, confirmPlan });
  if (typeof run !== "function") {
    throw new Error("destroy mode needs a runner; dispatchTeardown was called without `run`");
  }
  return { mode: "destroy", deleted: runTeardown(plan, { run, configPath }), refused: null };
}

/** Execute the plan. Every deletion is reported as it happens. */
export function runTeardown(plan, { run, configPath = plan.configPath } = {}) {
  const commands = teardownCommands(plan, { configPath });
  const results = [];
  for (const command of commands) {
    const label = command.kind === "worker" ? `Worker "${command.resource.name}"` : `D1 database "${command.resource.name}"`;
    console.log(`\n--> deleting ${label} (id ${command.resource.id ?? "(none)"})`);
    const outcome = run(command.argv);
    const ok = outcome.status === 0;
    console.log(ok ? `    removed: ${label}` : `    FAILED (exit ${outcome.status}): ${label}`);
    if (!ok && outcome.stderr) console.log(`    ${outcome.stderr.trim().split("\n").slice(-6).join("\n    ")}`);
    results.push({
      kind: command.kind,
      name: command.resource.name,
      id: command.resource.id ?? null,
      createdAt: command.resource.createdAt ?? null,
      argv: command.argv,
      status: ok ? "deleted" : "failed",
      exit: outcome.status,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// reading the account (read-only; the only place this script touches the network)
// ---------------------------------------------------------------------------

async function cfGet(path, credentials, fetchImpl) {
  const response = await fetchImpl(`${CF_API_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${credentials.token}`, "Content-Type": "application/json" },
  });
  const json = await response.json().catch(() => null);
  if (response.status === 404) return { status: 404, json };
  if (!response.ok || json?.success !== true) {
    const errors = (json?.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new TeardownRefusal(
      REFUSAL.API_FAILED,
      `GET ${path} failed: HTTP ${response.status}${errors ? ` — ${errors}` : ""}`,
    );
  }
  return { status: response.status, json };
}

async function cfPost(path, credentials, body, fetchImpl) {
  const response = await fetchImpl(`${CF_API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${credentials.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true) {
    const errors = (json?.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new TeardownRefusal(REFUSAL.API_FAILED, `POST ${path} failed: HTTP ${response.status}${errors ? ` — ${errors}` : ""}`);
  }
  return { status: response.status, json };
}

/**
 * Normalize a sqlite_master census into the plan's `migrations` shape. Pure,
 * so the live path and the fixture-driven tests produce the identical object.
 */
export function summarizeMigrationsCensus(parsed, { databaseId = null } = {}) {
  if (!parsed.ok) {
    return {
      databaseId,
      available: false,
      message: parsed.message ?? "the census statement failed",
      note:
        "this deploy applies its DDL with `wrangler d1 execute --file`, not `wrangler d1 migrations apply`, " +
        "so there is no wrangler d1_migrations ledger to read; the table census IS the migrations state",
    };
  }
  const tables = parsed.rows.filter((r) => r.type === "table").map((r) => r.name);
  const indexes = parsed.rows.filter((r) => r.type === "index").map((r) => r.name);
  return {
    databaseId,
    available: true,
    tables,
    tableCount: tables.length,
    indexes,
    indexCount: indexes.length,
    hasSchemaMigrations: tables.includes("schema_migrations"),
    hasWranglerMigrationLedger: tables.includes("d1_migrations"),
    rowsRead: parsed.rowsRead,
    rowsWritten: parsed.rowsWritten,
    note:
      "this deploy applies its DDL with `wrangler d1 execute --file`, not `wrangler d1 migrations apply`, " +
      "so there is no wrangler d1_migrations ledger to read; the table census IS the migrations state",
  };
}

/** Read the D1's schema state — a SELECT over sqlite_master, never a write. */
export async function readMigrationsState(databaseId, credentials, fetchImpl) {
  const sql = "SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name";
  if (!isReadOnlySelect(sql)) throw new Error("migrations probe is not a read-only SELECT");
  const { json } = await cfPost(`/accounts/${credentials.accountId}/d1/database/${databaseId}/query`, credentials, { sql }, fetchImpl);
  const parsed = parseD1QueryResponse(json, { what: "migrations probe" });
  return summarizeMigrationsCensus(parsed, { databaseId });
}

/** LIST mode's whole read path. Read-only; four GETs and one read-only SELECT. */
export async function collectAccountState(config, credentials, fetchImpl = fetch) {
  const account = `/accounts/${credentials.accountId}`;
  let workerServiceResponse = null;
  let workerDeploymentsResponse = null;
  let d1ListResponse = null;
  const notes = [];

  if (config.workerName) {
    const service = await cfGet(`${account}/workers/services/${encodeURIComponent(config.workerName)}`, credentials, fetchImpl);
    if (service.status === 404) notes.push(`Worker "${config.workerName}" is not deployed on this account`);
    else workerServiceResponse = service.json;
    if (service.status !== 404) {
      const deployments = await cfGet(
        `${account}/workers/scripts/${encodeURIComponent(config.workerName)}/deployments`,
        credentials,
        fetchImpl,
      );
      if (deployments.status === 404) {
        notes.push(`no deployments recorded for Worker "${config.workerName}" — falling back to the service created_on`);
      } else {
        workerDeploymentsResponse = deployments.json;
      }
    }
  }

  const list = await cfGet(`${account}/d1/database`, credentials, fetchImpl);
  d1ListResponse = list.json;

  let migrations = null;
  const target = config.databases
    .map((db) => (d1ListResponse.result ?? []).find((candidate) => candidate?.name === db.databaseName))
    .find(Boolean);
  if (target?.uuid) {
    migrations = await readMigrationsState(target.uuid, credentials, fetchImpl);
  } else {
    migrations = { skipped: "no configured database_name matched the account list — nothing to census" };
  }

  return { workerServiceResponse, workerDeploymentsResponse, d1ListResponse, migrations, notes };
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function pad(value, width) {
  const s = String(value ?? "");
  return s + " ".repeat(Math.max(0, width - s.length));
}

export function renderPlanText(plan) {
  const out = [];
  out.push("=".repeat(78));
  out.push("one-click teardown — LIST MODE (read-only; nothing above this line was deleted)");
  out.push("=".repeat(78));
  out.push(`config    : ${plan.configPath}`);
  out.push(`worker    : ${plan.workerName ?? "(none declared)"}`);
  out.push(`databases : ${plan.databases.length} configured`);
  for (const warning of plan.warnings) out.push(`  note     : ${warning}`);

  out.push("");
  if (plan.candidates.length === 0) {
    out.push("NOTHING IS ATTRIBUTABLE TO THIS DEPLOY on this account — 0 deletions.");
  } else {
    out.push(`${plan.candidates.length} resource(s) a --yes run would delete, in this order:`);
    out.push("");
    out.push(`  ${pad("#", 3)}${pad("KIND", 8)}${pad("NAME", 26)}${pad("ID", 38)}CREATED`);
    plan.candidates.forEach((c, i) => {
      out.push(
        `  ${pad(i + 1, 3)}${pad(c.kind, 8)}${pad(c.name, 26)}${pad(c.id ?? "(none)", 38)}${c.createdAt ?? "(unknown)"}`,
      );
      if (c.note) out.push(`      ${c.note}`);
    });
  }

  if (plan.refusals.length > 0) {
    out.push("");
    out.push("NOT deleteable (each one is a refusal, not a near-miss):");
    for (const refusal of plan.refusals) out.push(`  - ${refusal.message}`);
  }

  if (plan.migrations?.skipped) {
    out.push("");
    out.push(`migrations state: ${plan.migrations.skipped}`);
  } else if (plan.migrations && plan.migrations.available === false) {
    out.push("");
    out.push(`migrations state: unavailable — ${plan.migrations.message} (the listing stands on its own)`);
  } else if (plan.migrations && plan.migrations.available) {
    out.push("");
    out.push(
      `migrations state of ${plan.migrations.databaseId}: ${plan.migrations.tableCount} tables ` +
        `(${plan.migrations.hasSchemaMigrations ? "schema_migrations present" : "no schema_migrations"}), ` +
        `${plan.migrations.indexCount} indexes — sqlite_master census, ${plan.migrations.rowsRead} rows read, ` +
        `${plan.migrations.rowsWritten} written`,
    );
    out.push(`  ${plan.migrations.note}`);
  }

  out.push("");
  out.push("The exact commands a --yes run performs:");
  for (const command of teardownCommands(plan)) {
    out.push(`  $ npx wrangler ${command.argv.join(" ")}`);
  }
  out.push("");
  out.push(`plan fingerprint : ${plan.fingerprint}`);
  out.push("To delete, review the list above, then re-run with:");
  out.push(`  --yes --confirm-plan ${plan.fingerprint}`);
  out.push("=".repeat(78));
  return out.join("\n");
}

export function renderPlanJson(plan) {
  return JSON.stringify(
    {
      mode: "list",
      configPath: plan.configPath,
      workerName: plan.workerName,
      warnings: plan.warnings,
      candidates: plan.candidates,
      refusals: plan.refusals,
      migrations: plan.migrations,
      fingerprint: plan.fingerprint,
      commands: teardownCommands(plan).map((c) => `npx wrangler ${c.argv.join(" ")}`),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Exported for the tests that pin the CLI argv vectors. */
export function parseArgs(argv) {
  const args = {
    yes: false,
    json: false,
    dryRun: false,
    confirmPlan: null,
    config: null,
    workerName: null,
    dbName: null,
    token: null,
    accountId: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // declared inside the loop so it closes over the loop's `i`
    const value = (flag) => {
      const v = argv[++i];
      if (typeof v !== "string" || v.trim() === "") throw new Error(`${flag} needs a name`);
      return v;
    };
    switch (a) {
      case "--yes": case "-y": args.yes = true; break;
      case "--json": args.json = true; break;
      case "--dry-run": args.dryRun = true; break;
      case "--confirm-plan": args.confirmPlan = value(a); break;
      case "--config": case "-c": args.config = value(a); break;
      case "--worker-name": args.workerName = value(a); break;
      case "--db-name": args.dbName = value(a); break;
      case "--token": args.token = value(a); break;
      case "--account-id": args.accountId = value(a); break;
      case "--help": case "-h": args.help = true; break;
      default: throw new Error(`unknown argument "${a}" (see --help)`);
    }
  }
  return args;
}

function help() {
  return `one-click-teardown — remove exactly what the one-click Cloudflare deploy created

MODES
  (no flags)                  LIST: read-only. Prints every resource this deploy
                              created and still owns, with its name, id and
                              created-date, and the exact wrangler commands a
                              deletion would run. Writes nothing. Always safe.
  --dry-run                   Same as no flags (spelled out for the record).
  --json                      The same list as a JSON report on stdout.
  --yes                       Destroy mode. Prints the plan, then EXITS 2 with
                              --plan-review-required and a plan fingerprint.
  --yes --confirm-plan <fp>   The deletion, and only then.

OPTIONS
  -c, --config <path>         wrangler config to attribute against
                              (default: <repo>/wrangler.toml). Point it at
                              scripts/deploy/one-click-deck/wrangler.oneclick.toml
                              or deploy/wrangler.scale.toml for those deploys.
  --worker-name <name>        attribute a Worker by name. Without --config:
                              no config file is read at all. With --config:
                              must agree with the config's name or the run is
                              refused (--override-conflicts-with-config).
  --db-name <name>            attribute one D1 database by name, on the same
                              terms as --worker-name.
  --token <t>                 CF token (default: $CF_API_TOKEN / $CLOUDFLARE_API_TOKEN)
  --account-id <id>           CF account (default: $CF_ACCOUNT_ID / $CLOUDFLARE_ACCOUNT_ID)
  --json                      JSON report mode.

ATTRIBUTION
  Only resources whose name the config declares (or the --worker-name/--db-name
  overrides name), matched byte-for-byte against the account. A mismatch, a
  duplicate name, or an unknown API answer is a refusal, never a deletion.

Examples
  node scripts/deploy/one-click-teardown.mjs
  node scripts/deploy/one-click-teardown.mjs --json
  node scripts/deploy/one-click-teardown.mjs -c scripts/deploy/one-click-deck/wrangler.oneclick.toml
  node scripts/deploy/one-click-teardown.mjs --worker-name  --db-name 
  node scripts/deploy/one-click-teardown.mjs --yes
  node scripts/deploy/one-click-teardown.mjs --yes --confirm-plan <fingerprint>
`;
}

/** Repo root, derived from this file's own location (scripts/deploy/<this>). */
export function repoRootFromHere(importMetaUrl) {
  return join(dirname(fileURLToPath(importMetaUrl)), "..", "..");
}

function relFromCwd(target) {
  const rel = relative(process.cwd(), target);
  return rel === "" ? target : rel.split(sep).join("/");
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`one-click-teardown: ${e.message}`);
    return EXIT_GENERAL;
  }
  if (args.help) { console.log(help()); return EXIT_OK; }

  const repoRoot = repoRootFromHere(import.meta.url);
  // Name overrides (--worker-name/--db-name) without an explicit --config
  // attribute WITHOUT a config file at all: no default wrangler.toml is
  // consulted, so a teardown of a configless deploy (the frozen demo pair) can
  // never collide with whatever this repo's own config declares. With an
  // explicit --config the overrides must agree with it, or the run is refused.
  const hasOverrides = args.workerName !== null || args.dbName !== null;

  const credentials = {
    token: args.token ?? resolveCredentials().token,
    accountId: args.accountId ?? resolveCredentials().accountId,
  };

  let config;
  let resolvedConfigPath = null;
  if (args.config === null && hasOverrides) {
    config = buildConfiglessConfig({ workerName: args.workerName, dbName: args.dbName });
  } else {
    // --config is resolved against the caller's cwd first (that is where they
    // typed it), then against the repo root, so the tool works from a
    // subdirectory and from the root. An explicit --config that resolves
    // nowhere is a refusal; the default that resolves nowhere is too.
    const requested = args.config ?? "wrangler.toml";
    const tried = [...new Set(isAbsolute(requested) ? [requested] : [resolve(process.cwd(), requested), join(repoRoot, requested)])];
    resolvedConfigPath = tried.find((p) => existsSync(p));
    if (!resolvedConfigPath) {
      console.error(
        `one-click-teardown: ${REFUSAL.CONFIG_UNREADABLE} — no wrangler config at ${tried.join(" or ")}` +
          (args.config
            ? ""
            : ` (the default is wrangler.toml; pass --config for another deploy's config, or --worker-name/--db-name to attribute without one)`),
      );
      return EXIT_REFUSED;
    }

    try {
      config = readWranglerDeployConfig(resolvedConfigPath);
    } catch (e) {
      console.error(`one-click-teardown: ${e.message}`);
      return e instanceof TeardownRefusal ? EXIT_REFUSED : EXIT_GENERAL;
    }
    config = { ...config, configPath: relFromCwd(resolvedConfigPath) };
    if (hasOverrides) {
      try {
        config = applyOverridesToConfig(config, { workerName: args.workerName, dbName: args.dbName });
      } catch (e) {
        console.error(`one-click-teardown: ${e.marker} — ${e.message}`);
        return EXIT_REFUSED;
      }
    }
  }

  // LIST mode needs no credentials to describe what WOULD be removed from the
  // config; it needs them to say whether it exists. Say which.
  if (!credentials.token || !credentials.accountId) {
    const missing = [
      !credentials.token ? "CF_API_TOKEN/CLOUDFLARE_API_TOKEN" : null,
      !credentials.accountId ? "CF_ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID" : null,
    ].filter(Boolean);
    console.log(`one-click-teardown: LIST MODE needs a Cloudflare credential to check the account; missing ${missing.join(" and ")}.`);
    console.log(`  The deploy reads the same two variables (scripts/deploy/one-click-deck/one-click-deck.mjs:68-69).`);
  }

  let state;
  try {
    assertCredentials(credentials);
    state = await collectAccountState(config, credentials);
  } catch (e) {
    if (e instanceof TeardownRefusal) {
      console.error(`one-click-teardown: ${e.marker} — ${e.message}`);
      return EXIT_REFUSED;
    }
    throw e;
  }

  const plan = buildTeardownPlan({
    config,
    workerServiceResponse: state.workerServiceResponse,
    workerDeploymentsResponse: state.workerDeploymentsResponse,
    d1ListResponse: state.d1ListResponse,
    migrations: state.migrations,
  });

  for (const note of state.notes) console.error(`one-click-teardown: ${note}`);

  // Every path goes through dispatchTeardown, including LIST mode, so "nothing
  // is deleted before the plan is reviewed" is one property of one function.
  const configPathArg = resolvedConfigPath;
  let dispatch;
  try {
    dispatch = dispatchTeardown(plan, {
      yes: args.yes,
      confirmPlan: args.confirmPlan,
      configPath: configPathArg,
      run: wranglerRunner({ cwd: process.cwd() }),
    });
  } catch (e) {
    if (e instanceof TeardownRefusal) {
      console.log(args.json ? JSON.stringify({ mode: "destroy", refused: e.marker, message: e.message, plan }, null, 2) : renderPlanText(plan));
      console.error(`one-click-teardown: ${e.marker} — ${e.message}`);
      return EXIT_REFUSED;
    }
    throw e;
  }

  if (dispatch.mode === "list") {
    console.log(args.json ? renderPlanJson(plan) : renderPlanText(plan));
    return EXIT_OK;
  }

  // destroy mode: the reviewed plan goes to stdout one last time, so the log
  // shows name + id + created-date immediately above the deletions it caused.
  console.log(args.json ? JSON.stringify({ mode: "destroy", plan }, null, 2) : renderPlanText(plan));

  const results = dispatch.deleted;
  const failed = results.filter((r) => r.status !== "deleted");
  if (args.json) {
    console.log(JSON.stringify({ mode: "destroy", plan, results }, null, 2));
  } else {
    console.log("");
    console.log(`teardown complete: ${results.length - failed.length}/${results.length} removed.`);
  }
  return failed.length === 0 ? EXIT_OK : EXIT_GENERAL;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      if (error instanceof PlatformOpsError) {
        console.error(`one-click-teardown: --platform-ops-blocked — ${error.message}`);
        process.exitCode = EXIT_PLATFORM_OPS;
        return;
      }
      console.error(`one-click-teardown: ${error?.message ?? error}`);
      process.exitCode = EXIT_GENERAL;
    },
  );
}
