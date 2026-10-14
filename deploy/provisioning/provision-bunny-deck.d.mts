// Type declarations for provision-bunny-deck.mjs — the one-key Bunny
// provisioning runner (issue #1282). The .mjs is the implementation; this
// file exists so tsc (NodeNext, strict) can type the tests' imports of it,
// matching the convention scripts/deploy/one-click-teardown.d.mts set.
// Declaration-only; no behavior lives here.

export const SCRIPT_HOST: string;
export const SCHEMA_NAME: "decko-one-key-provisioning-payload";
export const SCHEMA_VERSION: 1;
/** Measured Bunny server-side limit; a longer slug answers HTTP 500. */
export const DB_SLUG_MAX: number;
/** DECKO_PROTECTED_RESOURCE_NAMES (comma-separated) plus extra names. */
export function protectedResourceNames(extra?: string[]): Set<string>;

export const EXIT_OK: number;
export const EXIT_GENERAL: number;
export const EXIT_REFUSED: number;
export const EXIT_PLATFORM_OPS: number;

export const REFUSAL: {
  CONFIRMATION_MISSING: "--confirmation-required";
  TEARDOWN_UNCONFIRMED: "--teardown-requires-yes-and-name";
  NAME_MISMATCH: "--name-mismatch";
  PROTECTED_NAME: "--protected-name-refused";
  PAYLOAD_INVALID: "--payload-invalid";
  API_KEY_MISSING: "--api-key-missing";
  SOURCE_MISSING: "--source-missing";
  SOURCE_WRONG_SHAPE: "--source-wrong-shape";
  WRITE_PATH_UNALLOWED: "--write-path-not-allowed";
  RESOURCE_EXISTS: "--resource-already-exists";
};

export class ProvisionRefusal extends Error {
  constructor(marker: string, message: string, detail?: Record<string, unknown>);
  name: "ProvisionRefusal";
  marker: string;
  detail: Record<string, unknown>;
}

export interface ProvisionPayload {
  schema: typeof SCHEMA_NAME;
  schema_version: number;
  created: string;
  provider: "bunny";
  deck: {
    source_name: string;
    source_sha256: string;
    source_bytes: number;
    limit: number;
    tables: string | null;
  };
  bunny: {
    script_name: string;
    pull_zone_name: string;
    db_group_name: string;
    db_name: string;
    storage_region: string;
    primary_region: string;
    replica_regions: string[];
    db_token_authorization: "full-access" | "read-only";
  };
  edge: {
    cache_enabled: boolean;
    cache_ttl_seconds: number;
    cache_epoch: number;
    render_budget_ms: number;
    write_path: boolean;
  };
}

export interface ParsedArgs {
  payload: string | null;
  execute: boolean;
  verify: boolean;
  teardown: boolean;
  confirmation: boolean;
  yes: boolean;
  name: string | null;
  creds: string | null;
  apiKey: string | null;
  source: string | null;
  allowWritePath: boolean;
  bundle: string | null;
  protect: string[];
  help?: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs;
export function readCredsFile(path: string): Record<string, string>;
export function resolveApiKey(
  args: Pick<ParsedArgs, "apiKey" | "creds">,
): { key: string; via: string };

/** Fail-fast deck-source check: cards must carry the engine's db_content
 *  column, or the deck imports cleanly and then fails every render.
 *  Throws ProvisionRefusal. */
export function assertSourceShape(
  sourcePath: string,
): Promise<{ cards: number; hasDbContent: boolean }>;

/** The deploy migrations a provisioned deck needs, in filename order:
 *  everything in the directory except the demo-content migrations. */
export function engineMigrationFiles(migrationsDir: string): string[];

/** Those migrations split into what runs before the seed (CREATE TABLE and
 *  CREATE INDEX) and after it (triggers, the stamp row, anything else;
 *  INSERTs made INSERT OR IGNORE). */
export function engineSchemaPlan(migrationsDir: string): Promise<{
  files: string[];
  preSeed: string[];
  postSeed: string[];
  /** Every table the plan creates. */
  tables: string[];
}>;

/** Execute statements over the database's SQL API (POST /v2/pipeline). An
 *  index whose table is absent is skipped and counted; any other error
 *  throws. */
export function applySqlStatements(
  pipelineUrl: string,
  dbToken: string,
  statements: string[],
): Promise<{ applied: number; skippedNoTable: number }>;

/** The source tables the seed copies (those the schema has, sessions
 *  excluded) and the rest. */
export function seedTablesFor(
  sourcePath: string,
  targetTables: string[],
): Promise<{ tables: string[]; skipped: string[] }>;

/** The database half of a provision: schema tables and indexes, the seed,
 *  then the triggers and stamp row. */
export function provisionDatabase(opts: {
  dbUrl: string;
  dbToken: string;
  sourcePath: string;
  deck: { limit: number; tables: string | null };
  repoRoot: string;
  log?: (line: string) => void;
}): Promise<{
  migrations: string[];
  preSeedStatements: number;
  postSeedStatements: number;
  seedTables: string[];
  readRule: { installed: boolean; ruleId: number; parties: string[] };
}>;

/** Report the provisioned deck's own catch-all read rule, or install the
 *  stock substrate's when the deck carries none (a deck with no catch-all
 *  read rule denies every card, as Ruby does). */
export function ensureCatchAllReadRule(
  pipelineUrl: string,
  dbToken: string,
): Promise<{ installed: boolean; ruleId: number; parties: string[] }>;

/** Validate a raw payload object; returns a normalized copy. Throws
 *  ProvisionRefusal(REFUSAL.PAYLOAD_INVALID) with the full problem list. */
export interface ValidateOptions {
  /** Names refused in any field (default: protectedResourceNames()). */
  protectedNames?: Set<string>;
}
export function validatePayload(raw: unknown, options?: ValidateOptions): ProvisionPayload;
export function loadPayload(path: string, options?: ValidateOptions): ProvisionPayload;

export interface ProvisionStep {
  name: string;
  writes: boolean;
  describe: () => string;
}

export function buildSteps(
  payload: ProvisionPayload,
  opts: { sourcePath: string | null; writePathAllowed: boolean },
): ProvisionStep[];

export interface BunnyApi {
  call(
    method: string,
    path: string,
    body?: unknown,
    opts?: { expect?: number[] },
  ): Promise<{ status: number; json: any; text: string }>;
}

export function makeBunnyApi(key: string): BunnyApi;
/** The base-parameterized seam behind makeBunnyApi (tests stand a loopback
 *  fixture server in place of https://api.bunny.net). */
export function makeBunnyApiAt(key: string, base: string): BunnyApi;
export function hostSuffixOfDbUrl(url: string): string;
/** Strips an optional scheme + trailing slashes from DefaultHostname. */
export function normalizeHostname(hostname: string): string;
