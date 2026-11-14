// Type declarations for one-click-teardown.mjs — the one-click teardown for the
// decko-ts Cloudflare deploy. The .mjs is the implementation; this file exists
// so tsc (NodeNext, strict) can type the tests' imports of it, matching the
// convention tools/capture-manifest-provenance.d.mts set. Declaration-only; no
// behavior lives here.

export const CF_API_BASE: string;
export const EXIT_OK: number;
export const EXIT_GENERAL: number;
export const EXIT_REFUSED: number;
export const EXIT_PLATFORM_OPS: number;

export const REFUSAL: {
  PLAN_NOT_REVIEWED: "--plan-review-required";
  PLAN_EMPTY: "--nothing-to-remove";
  NAME_MISMATCH: "--name-mismatch";
  AMBIGUOUS_DATABASE_NAME: "--ambiguous-database-name";
  CREDENTIALS_MISSING: "--credentials-missing";
  CONFIG_UNREADABLE: "--config-unreadable";
  API_FAILED: "--api-failed";
  NOT_DEPLOYED: "--not-deployed";
  OVERRIDE_CONFLICT: "--override-conflicts-with-config";
};

export class TeardownRefusal extends Error {
  constructor(marker: string, message: string, detail?: Record<string, unknown>);
  name: "TeardownRefusal";
  marker: string;
  detail: Record<string, unknown>;
}

export interface CloudflareCredentials {
  token: string | null;
  accountId: string | null;
}

export interface ConfiguredDatabase {
  binding: string | null;
  databaseName: string;
  databaseId: string | null;
  databaseIdIsPlaceholder: boolean;
}

export interface DeployConfig {
  configPath: string;
  /** true when the config was built from --worker-name/--db-name, with no file behind it */
  configless?: boolean;
  workerName: string | null;
  databases: ConfiguredDatabase[];
  warnings: string[];
}

export interface WorkerServiceRecord {
  id: string | null;
  createdOn: string | null;
  modifiedOn: string | null;
  defaultEnvironment: unknown;
}

export interface WorkerDeploymentRecord {
  id: string | null;
  createdOn: string | null;
  source: unknown;
  strategy: unknown;
  authorEmail: string | null;
}

export interface D1DatabaseRecord {
  uuid: string | null;
  name: string | null;
  createdAt: string | null;
  version: string | null;
  jurisdiction: unknown;
}

export interface D1QueryResult {
  ok: boolean;
  rows: Array<Record<string, unknown>>;
  rowsRead: number | null;
  rowsWritten: number | null;
  message?: string;
}

export interface MigrationsState {
  databaseId: string | null;
  available: boolean;
  message?: string;
  tables?: string[];
  tableCount?: number;
  indexes?: string[];
  indexCount?: number;
  hasSchemaMigrations?: boolean;
  hasWranglerMigrationLedger?: boolean;
  rowsRead?: number | null;
  rowsWritten?: number | null;
  note?: string;
  skipped?: string;
}

export interface TeardownCandidate {
  kind: "worker" | "d1";
  name: string;
  id: string | null;
  createdAt: string | null;
  binding?: string | null;
  createdAtSource?: string;
  deploymentId?: string | null;
  version?: string | null;
  jurisdiction?: unknown;
  note: string;
}

export interface TeardownPlan {
  configPath: string;
  configless: boolean;
  workerName: string | null;
  databases: ConfiguredDatabase[];
  generatedFor: string;
  candidates: TeardownCandidate[];
  refusals: Array<{ kind: string; marker: string; message: string }>;
  migrations: MigrationsState | null;
  warnings: string[];
  fingerprint: string;
}

export interface TeardownCommand {
  kind: "worker" | "d1";
  argv: string[];
  resource: TeardownCandidate;
}

export interface TeardownOutcome {
  kind: "worker" | "d1";
  name: string;
  id: string | null;
  createdAt: string | null;
  argv: string[];
  status: "deleted" | "failed";
  exit: number;
}

export function resolveCredentials(env?: NodeJS.ProcessEnv): CloudflareCredentials;
export function assertCredentials(credentials: CloudflareCredentials): void;

export function isPlaceholderDatabaseId(id: unknown): boolean;

export function parseWranglerDeployConfig(
  tomlText: string,
  options?: { configPath?: string },
): DeployConfig;
export function readWranglerDeployConfig(configPath: string): DeployConfig;

export function buildConfiglessConfig(options?: {
  workerName?: string | null;
  dbName?: string | null;
}): DeployConfig;
export function applyOverridesToConfig(
  config: DeployConfig,
  options?: { workerName?: string | null; dbName?: string | null },
): DeployConfig;

export interface ParsedArgs {
  yes: boolean;
  json: boolean;
  dryRun: boolean;
  confirmPlan: string | null;
  config: string | null;
  workerName: string | null;
  dbName: string | null;
  token: string | null;
  accountId: string | null;
  help: boolean;
}
export function parseArgs(argv: string[]): ParsedArgs;

export function parseWorkerServiceResponse(json: unknown): {
  found: boolean;
  service: WorkerServiceRecord | null;
};
export function parseWorkerDeploymentsResponse(json: unknown): {
  deployments: WorkerDeploymentRecord[];
  latest: WorkerDeploymentRecord | null;
};
export function parseD1DatabaseListResponse(json: unknown): {
  totalCount: number;
  databases: D1DatabaseRecord[];
};
export function parseD1QueryResponse(json: unknown, options?: { what?: string }): D1QueryResult;
export function isReadOnlySelect(sql: string): boolean;

export function attributeWorker(
  workerName: string | null,
  serviceResponse: unknown,
  deploymentsResponse: unknown,
): {
  kind: "worker";
  status: "not-declared" | "absent" | "removable";
  name: string | null;
  resource: TeardownCandidate | null;
  reason: string;
};
export function attributeDatabase(
  db: ConfiguredDatabase,
  listResponse: unknown,
): {
  kind: "d1";
  status: "absent" | "removable";
  name: string;
  binding: string | null;
  resource: TeardownCandidate | null;
  reason: string;
};

export function buildTeardownPlan(args: {
  config: DeployConfig;
  workerServiceResponse?: unknown;
  workerDeploymentsResponse?: unknown;
  d1ListResponse?: unknown;
  migrations?: MigrationsState | null;
}): TeardownPlan;

export function planFingerprint(plan: TeardownPlan): string;
export function teardownCommands(
  plan: TeardownPlan,
  options?: { configPath?: string },
): TeardownCommand[];

export function assertDestroyAllowed(
  plan: TeardownPlan,
  options?: { yes?: boolean; confirmPlan?: string | null },
): true;

export function dispatchTeardown(
  plan: TeardownPlan,
  options: {
    yes?: boolean;
    confirmPlan?: string | null;
    run?: (argv: string[]) => { status: number; stdout: string; stderr: string };
    configPath?: string;
  },
): { mode: "list" | "destroy"; deleted: TeardownOutcome[]; refused: string | null };

export function summarizeMigrationsCensus(
  parsed: D1QueryResult,
  options?: { databaseId?: string | null },
): MigrationsState;
export function readMigrationsState(
  databaseId: string,
  credentials: CloudflareCredentials,
  fetchImpl?: typeof fetch,
): Promise<MigrationsState>;

export function collectAccountState(
  config: DeployConfig,
  credentials: CloudflareCredentials,
  fetchImpl?: typeof fetch,
): Promise<{
  workerServiceResponse: unknown;
  workerDeploymentsResponse: unknown;
  d1ListResponse: unknown;
  migrations: MigrationsState | null;
  notes: string[];
}>;

export function wranglerRunner(options: { cwd: string }): (argv: string[]) => {
  status: number;
  stdout: string;
  stderr: string;
};
export function runTeardown(
  plan: TeardownPlan,
  options: { run: (argv: string[]) => { status: number; stdout: string; stderr: string }; configPath?: string },
): TeardownOutcome[];

export function renderPlanText(plan: TeardownPlan): string;
export function renderPlanJson(plan: TeardownPlan): string;
export function repoRootFromHere(importMetaUrl: string): string;
export function main(argv?: string[]): Promise<number>;
