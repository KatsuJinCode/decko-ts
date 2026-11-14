import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { driverDialect } from "../../server/same-database.js";
import {
  CARD_CODENAME_BY_ID_SQL,
  CARD_ID_BY_CODENAME_SQL,
  CARD_ID_BY_JUNCTION_PLUS_SQL,
  CARD_ID_BY_JUNCTION_SQL,
  CARD_ROW_BY_ID_SQL,
  LIVE_CARD_ROW_BY_ID_SQL,
} from "../fetch/card-read-shapes.js";
import { FetchEngine, type CardRecord } from "../fetch.js";
import { DeckoName } from "../name.js";
import {
  deriveReadRuleRecord,
  fetchCardsRow,
  isStandardRuleCardRow,
  setMemberIds,
  typeIdByCodename,
  type ReadRuleRecord,
  type ReadRuleWriteDeps,
} from "./set-read-rule.js";
import { expireRuleResolutionCache } from "./read-rules.js";

export const DEFAULT_COMPACTION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CARD_EPOCHS_CACHE_CAP = 500_000;
const SCHEMA_PROBE_TTL_MS = 2_000;

export const LAZY_RULE_WATERMARK_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS deck_rule_flags (
     epoch INTEGER PRIMARY KEY AUTOINCREMENT,
     rule_id INTEGER NOT NULL,
     set_id INTEGER,
     pattern_code TEXT NOT NULL,
     anchor_id INTEGER,
     anchor_left_id INTEGER,
     anchor_right_id INTEGER,
     anchor_key TEXT,
     is_delete INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS deck_rule_flags_epoch_idx
     ON deck_rule_flags(epoch)`,
  `CREATE TABLE IF NOT EXISTS deck_card_rule_watermarks (
     card_id INTEGER PRIMARY KEY,
     epoch INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS deck_rule_watermark_meta (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     last_full_compaction_at_ms INTEGER NOT NULL DEFAULT 0,
     compaction_interval_ms INTEGER NOT NULL DEFAULT 2592000000
   )`,
];

const LAZY_RULE_WATERMARK_MYSQL_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS deck_rule_flags (
     epoch BIGINT PRIMARY KEY AUTO_INCREMENT,
     rule_id INT NOT NULL,
     set_id INT,
     pattern_code VARCHAR(191) NOT NULL,
     anchor_id INT,
     anchor_left_id INT,
     anchor_right_id INT,
     anchor_key VARCHAR(255),
     is_delete TINYINT NOT NULL DEFAULT 0,
     created_at VARCHAR(64) NOT NULL,
     INDEX deck_rule_flags_epoch_idx (epoch)
   )`,
  `CREATE TABLE IF NOT EXISTS deck_card_rule_watermarks (
     card_id INT PRIMARY KEY,
     epoch BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS deck_rule_watermark_meta (
     id INT PRIMARY KEY,
     last_full_compaction_at_ms BIGINT NOT NULL DEFAULT 0,
     compaction_interval_ms BIGINT NOT NULL DEFAULT 2592000000
   )`,
];

const LAZY_RULE_WATERMARK_POSTGRES_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS deck_rule_flags (
     epoch BIGSERIAL PRIMARY KEY,
     rule_id INTEGER NOT NULL,
     set_id INTEGER,
     pattern_code TEXT NOT NULL,
     anchor_id INTEGER,
     anchor_left_id INTEGER,
     anchor_right_id INTEGER,
     anchor_key TEXT,
     is_delete INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS deck_rule_flags_epoch_idx
     ON deck_rule_flags(epoch)`,
  `CREATE TABLE IF NOT EXISTS deck_card_rule_watermarks (
     card_id INTEGER PRIMARY KEY,
     epoch BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS deck_rule_watermark_meta (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     last_full_compaction_at_ms BIGINT NOT NULL DEFAULT 0,
     compaction_interval_ms BIGINT NOT NULL DEFAULT 2592000000
   )`,
];

export interface PendingRuleFlag {
  readonly epoch: number;
  readonly ruleId: number;
  readonly setId: number | null;
  readonly patternCode: string;
  readonly anchorId: number | null;
  readonly anchorLeftId: number | null;
  readonly anchorRightId: number | null;
  readonly anchorKey: string | null;
  readonly isDelete: boolean;
  readonly createdAt: string;
}

export interface LazyRuleWatermarkOptions {
  readonly eagerMemberLimit?: number;
  readonly compactionIntervalMs?: number;
  readonly nowMs?: number;
}

export interface CompactionScheduleState {
  readonly lastFullCompactionAtMs: number;
  readonly compactionIntervalMs: number;
  readonly nextScheduledCompactionAtMs: number;
  readonly isDue: boolean;
}

export interface RaiseReadRuleFlagOptions {
  readonly isDelete?: boolean;
  readonly overlay?: ReadonlyMap<string, number>;
  readonly priorRuleCardRow?: CardsRow;
}

export interface CompactionReport {
  readonly evaluatedCards: number;
  readonly updatedCards: number;
  readonly compactedEpochsUpTo: number;
  readonly remainingFlags: number;
  readonly remainingUnwatermarkedCards: number;
  readonly lastFullCompactionAtMs?: number;
  readonly nextScheduledCompactionAtMs?: number;
}

interface DriverWatermarkState {
  enabled: boolean;
  explicitlyDisabled?: boolean;
  schemaInitialized: boolean;
  schemaProbedOnDisk: boolean;
  schemaProbedAtMs: number;
  lastSyncedAtMs: number;
  eagerMemberLimit: number;
  compactionIntervalMs: number;
  lastFullCompactionAtMs: number;
  latestEpoch: number;
  flagsByEpoch: Map<number, PendingRuleFlag>;
  cardEpochs: Map<number, number>;
  syncInFlight?: Promise<boolean>;
  compactionInFlight?: Promise<CompactionReport>;
}

const driverStates = new WeakMap<SQLDatabaseDriver, DriverWatermarkState>();

function setCachedCardEpoch(state: DriverWatermarkState, cardId: number, epoch: number): void {
  const prev = state.cardEpochs.get(cardId);
  if (prev !== undefined && prev >= epoch) {
    return;
  }
  if (prev === undefined && state.cardEpochs.size >= CARD_EPOCHS_CACHE_CAP) {
    state.cardEpochs.clear();
  }
  state.cardEpochs.set(cardId, epoch);
}

function tableExistsStatement(base: SQLDatabaseDriver, tableName: string): SQLStatement {
  if (driverDialect(base) === "mysql") {
    return {
      sql: "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      params: [tableName],
    };
  }
  if (base.constructor?.name === "PostgresDriver") {
    return {
      sql: "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?",
      params: [tableName],
    };
  }
  return {
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    params: [tableName],
  };
}

function watermarkUpsertStatement(
  base: SQLDatabaseDriver,
  entries: ReadonlyArray<readonly [number, number]>,
): SQLStatement {
  const valuesClause = entries.map(() => "(?, ?)").join(", ");
  const params: unknown[] = [];
  for (const [cardId, epoch] of entries) {
    params.push(cardId, epoch);
  }
  if (driverDialect(base) === "mysql") {
    return {
      sql: `INSERT INTO deck_card_rule_watermarks (card_id, epoch) VALUES ${valuesClause}
            ON DUPLICATE KEY UPDATE epoch = GREATEST(deck_card_rule_watermarks.epoch, VALUES(epoch))`,
      params,
    };
  }
  const maxFn = base.constructor?.name === "PostgresDriver" ? "GREATEST" : "MAX";
  return {
    sql: `INSERT INTO deck_card_rule_watermarks (card_id, epoch) VALUES ${valuesClause}
          ON CONFLICT(card_id) DO UPDATE SET epoch = ${maxFn}(deck_card_rule_watermarks.epoch, excluded.epoch)`,
    params,
  };
}

export function unwrapWatermarkDriver(driver: SQLDatabaseDriver): SQLDatabaseDriver {
  const seen = new Set<SQLDatabaseDriver>();
  let current: SQLDatabaseDriver = driver;
  while (current !== null && typeof current === "object") {
    const candidate = current as { base?: SQLDatabaseDriver; inner?: SQLDatabaseDriver };
    const next = candidate.base ?? candidate.inner;
    if (next === undefined || seen.has(current)) break;
    seen.add(current);
    current = next;
  }
  return current;
}

function getOrInitState(driver: SQLDatabaseDriver): DriverWatermarkState {
  const base = unwrapWatermarkDriver(driver);
  let state = driverStates.get(base);
  if (state === undefined) {
    state = {
      enabled: false,
      schemaInitialized: false,
      schemaProbedOnDisk: false,
      schemaProbedAtMs: 0,
      lastSyncedAtMs: 0,
      eagerMemberLimit: 0,
      compactionIntervalMs: DEFAULT_COMPACTION_INTERVAL_MS,
      lastFullCompactionAtMs: 0,
      latestEpoch: 0,
      flagsByEpoch: new Map(),
      cardEpochs: new Map(),
    };
    driverStates.set(base, state);
  }
  return state;
}

export async function ensureLazyRuleWatermarkSchema(
  driver: SQLDatabaseDriver,
  options: { nowMs?: number; compactionIntervalMs?: number } = {},
): Promise<void> {
  const base = unwrapWatermarkDriver(driver);
  const state = getOrInitState(base);
  if (!state.schemaInitialized) {
    const isPostgres = base.constructor?.name === "PostgresDriver" || (base as { dialect?: string }).dialect === "postgres";
    const ddlList =
      driverDialect(base) === "mysql"
        ? LAZY_RULE_WATERMARK_MYSQL_DDL
        : isPostgres
          ? LAZY_RULE_WATERMARK_POSTGRES_DDL
          : LAZY_RULE_WATERMARK_DDL;
    for (const ddl of ddlList) {
      await base.query(ddl, []);
    }
    const initNow = options.nowMs ?? Date.now();
    const interval = options.compactionIntervalMs ?? state.compactionIntervalMs;
    if (driverDialect(base) === "mysql") {
      await base.query(
        `INSERT IGNORE INTO deck_rule_watermark_meta (id, last_full_compaction_at_ms, compaction_interval_ms)
         VALUES (1, ?, ?)`,
        [initNow, interval],
      );
    } else {
      await base.query(
        `INSERT INTO deck_rule_watermark_meta (id, last_full_compaction_at_ms, compaction_interval_ms)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [initNow, interval],
      );
    }
    state.schemaInitialized = true;
    state.schemaProbedOnDisk = true;
    state.schemaProbedAtMs = Date.now();
  }
  const metaRes = await base.query<{
    last_full_compaction_at_ms: number;
    compaction_interval_ms: number;
  }>(
    "SELECT last_full_compaction_at_ms, compaction_interval_ms FROM deck_rule_watermark_meta WHERE id = 1",
    [],
  );
  const metaRow = metaRes.rows[0];
  if (metaRow !== undefined) {
    state.lastFullCompactionAtMs = Math.max(
      state.lastFullCompactionAtMs,
      Number(metaRow.last_full_compaction_at_ms ?? 0),
    );
    state.compactionIntervalMs = Number(
      metaRow.compaction_interval_ms ?? DEFAULT_COMPACTION_INTERVAL_MS,
    );
  }
  await syncFlagsFromDb(base, state);
}

interface SqliteFlagSummaryCapable {
  peekPendingRuleFlagsSummary(): {
    exists: boolean;
    count: number;
    maxEpoch: number;
    lastCompactionAtMs?: number;
  };
}

const cardRecordCompactionStamp = new WeakMap<CardRecord, number>();

function peekSqliteRuleFlagsSummary(
  base: SQLDatabaseDriver,
): { exists: boolean; count: number; maxEpoch: number; lastCompactionAtMs?: number } | undefined {
  let cursor: unknown = base;
  const seen = new Set<unknown>();
  while (cursor !== null && typeof cursor === "object" && !seen.has(cursor)) {
    seen.add(cursor);
    const candidate = cursor as Partial<SqliteFlagSummaryCapable> & {
      base?: unknown;
      inner?: unknown;
    };
    if (typeof candidate.peekPendingRuleFlagsSummary === "function") {
      return candidate.peekPendingRuleFlagsSummary();
    }
    cursor = candidate.base ?? candidate.inner ?? null;
  }
  return undefined;
}

async function syncFlagsFromDbIfSchemaExists(
  base: SQLDatabaseDriver,
  state: DriverWatermarkState,
  options: { allowCachedSkip?: boolean } = {},
): Promise<boolean> {
  const sqliteSummary = peekSqliteRuleFlagsSummary(base);
  if (sqliteSummary !== undefined) {
    state.schemaProbedOnDisk = true;
    if (!sqliteSummary.exists) {
      if (state.latestEpoch !== 0 || state.flagsByEpoch.size !== 0) {
        state.flagsByEpoch.clear();
        state.latestEpoch = 0;
        state.cardEpochs.clear();
      }
      return false;
    }
    state.schemaInitialized = true;
    if (
      typeof sqliteSummary.lastCompactionAtMs === "number" &&
      sqliteSummary.lastCompactionAtMs > state.lastFullCompactionAtMs
    ) {
      state.lastFullCompactionAtMs = sqliteSummary.lastCompactionAtMs;
      state.cardEpochs.clear();
      expireRuleResolutionCache(base);
    }
    if (
      sqliteSummary.maxEpoch === state.latestEpoch &&
      sqliteSummary.count === state.flagsByEpoch.size
    ) {
      return state.latestEpoch > 0 && state.flagsByEpoch.size > 0;
    }
    await syncFlagsFromDb(base, state);
    return state.latestEpoch > 0 && state.flagsByEpoch.size > 0;
  }

  if (options.allowCachedSkip && state.schemaProbedOnDisk) {
    return state.latestEpoch > 0 && state.flagsByEpoch.size > 0;
  }

  if (state.syncInFlight !== undefined) {
    return state.syncInFlight;
  }

  const run = (async (): Promise<boolean> => {
    const now = Date.now();
    if (!state.schemaInitialized) {
      if (base.constructor?.name === "StoreRowEvaluator") {
        state.schemaProbedOnDisk = true;
        return false;
      }
      if (
        state.schemaProbedOnDisk &&
        !state.enabled &&
        now - state.schemaProbedAtMs < SCHEMA_PROBE_TTL_MS
      ) {
        return false;
      }
      try {
        const probeStmt = tableExistsStatement(base, "deck_rule_flags");
        const probe = await base.query<{ name: string }>(probeStmt.sql, probeStmt.params);
        state.schemaProbedOnDisk = true;
        state.schemaProbedAtMs = Date.now();
        if (probe.rows.length === 0) {
          return false;
        }
        state.schemaInitialized = true;
      } catch {
        state.schemaProbedOnDisk = true;
        state.schemaProbedAtMs = Date.now();
        return false;
      }
    } else if (
      state.lastSyncedAtMs > 0 &&
      now - state.lastSyncedAtMs < SCHEMA_PROBE_TTL_MS
    ) {
      return state.latestEpoch > 0 && state.flagsByEpoch.size > 0;
    }
    await syncFlagsFromDb(base, state);
    return state.latestEpoch > 0 && state.flagsByEpoch.size > 0;
  })();

  state.syncInFlight = run;
  try {
    return await run;
  } finally {
    if (state.syncInFlight === run) {
      state.syncInFlight = undefined;
    }
  }
}

async function syncFlagsFromDb(
  base: SQLDatabaseDriver,
  state: DriverWatermarkState,
): Promise<void> {
  const head = await base.query<{ max_epoch: number; cnt: number }>(
    "SELECT COALESCE(MAX(epoch), 0) AS max_epoch, COUNT(*) AS cnt FROM deck_rule_flags",
    [],
  );
  state.lastSyncedAtMs = Date.now();
  const dbMaxEpoch = Number(head.rows[0]?.max_epoch ?? 0);
  const dbCount = Number(head.rows[0]?.cnt ?? 0);
  if (dbMaxEpoch === state.latestEpoch && dbCount === state.flagsByEpoch.size) {
    return;
  }
  const prevEpoch = state.latestEpoch;
  if (dbCount === 0) {
    state.flagsByEpoch.clear();
    state.latestEpoch = 0;
    state.cardEpochs.clear();
    if (prevEpoch !== 0) {
      expireRuleResolutionCache(base);
    }
    return;
  }
  const res = await base.query<{
    epoch: number;
    rule_id: number;
    set_id: number | null;
    pattern_code: string;
    anchor_id: number | null;
    anchor_left_id: number | null;
    anchor_right_id: number | null;
    anchor_key: string | null;
    is_delete: number;
    created_at: string;
  }>("SELECT * FROM deck_rule_flags ORDER BY epoch ASC", []);
  state.flagsByEpoch.clear();
  let maxEpoch = 0;
  for (const row of res.rows) {
    const epoch = Number(row.epoch);
    if (epoch > maxEpoch) maxEpoch = epoch;
    state.flagsByEpoch.set(epoch, {
      epoch,
      ruleId: Number(row.rule_id),
      setId: row.set_id === null || row.set_id === undefined ? null : Number(row.set_id),
      patternCode: String(row.pattern_code),
      anchorId: row.anchor_id === null || row.anchor_id === undefined ? null : Number(row.anchor_id),
      anchorLeftId:
        row.anchor_left_id === null || row.anchor_left_id === undefined
          ? null
          : Number(row.anchor_left_id),
      anchorRightId:
        row.anchor_right_id === null || row.anchor_right_id === undefined
          ? null
          : Number(row.anchor_right_id),
      anchorKey: row.anchor_key ?? null,
      isDelete: Number(row.is_delete) !== 0,
      createdAt: String(row.created_at),
    });
  }
  state.latestEpoch = maxEpoch;
  if (maxEpoch !== prevEpoch) {
    expireRuleResolutionCache(base);
  }
}

export async function enableLazyRuleWatermarks(
  driver: SQLDatabaseDriver,
  options: LazyRuleWatermarkOptions = {},
): Promise<void> {
  const base = unwrapWatermarkDriver(driver);
  const state = getOrInitState(base);
  state.enabled = true;
  state.eagerMemberLimit = options.eagerMemberLimit ?? 0;
  if (options.compactionIntervalMs !== undefined) {
    state.compactionIntervalMs = options.compactionIntervalMs;
  }
  await ensureLazyRuleWatermarkSchema(base, {
    nowMs: options.nowMs,
    compactionIntervalMs: options.compactionIntervalMs,
  });
  if (options.nowMs !== undefined || options.compactionIntervalMs !== undefined) {
    const nextNow = options.nowMs ?? state.lastFullCompactionAtMs;
    const nextInterval = options.compactionIntervalMs ?? state.compactionIntervalMs;
    await base.query(
      "UPDATE deck_rule_watermark_meta SET last_full_compaction_at_ms = ?, compaction_interval_ms = ? WHERE id = 1",
      [nextNow, nextInterval],
    );
    state.lastFullCompactionAtMs = nextNow;
    state.compactionIntervalMs = nextInterval;
  }
}

export async function recordFullCompactionTimestamp(
  driver: SQLDatabaseDriver,
  nowMs: number = Date.now(),
): Promise<CompactionScheduleState> {
  const base = unwrapWatermarkDriver(driver);
  const state = getOrInitState(base);
  const effectiveNow = Math.max(nowMs, state.lastFullCompactionAtMs + 1);
  try {
    await ensureLazyRuleWatermarkSchema(base, { nowMs: effectiveNow });
    await base.query(
      "UPDATE deck_rule_watermark_meta SET last_full_compaction_at_ms = ? WHERE id = 1",
      [effectiveNow],
    );
  } catch {
    // Allow read-only connections to update in-memory compaction timestamp without failing
  }
  state.lastFullCompactionAtMs = effectiveNow;
  return {
    lastFullCompactionAtMs: state.lastFullCompactionAtMs,
    compactionIntervalMs: state.compactionIntervalMs,
    nextScheduledCompactionAtMs: state.lastFullCompactionAtMs + state.compactionIntervalMs,
    isDue: false,
  };
}

export async function getCompactionScheduleState(
  driver: SQLDatabaseDriver,
  nowMs: number = Date.now(),
): Promise<CompactionScheduleState> {
  const base = unwrapWatermarkDriver(driver);
  await ensureLazyRuleWatermarkSchema(base, { nowMs });
  const state = getOrInitState(base);
  await syncFlagsFromDbIfSchemaExists(base, state);
  const nextScheduledCompactionAtMs = state.lastFullCompactionAtMs + state.compactionIntervalMs;
  const pendingFlagCount = state.flagsByEpoch.size;
  return {
    lastFullCompactionAtMs: state.lastFullCompactionAtMs,
    compactionIntervalMs: state.compactionIntervalMs,
    nextScheduledCompactionAtMs,
    isDue: pendingFlagCount >= 1_000 || nowMs >= nextScheduledCompactionAtMs,
  };
}

export function disableLazyRuleWatermarks(driver: SQLDatabaseDriver): void {
  const base = unwrapWatermarkDriver(driver);
  const state = driverStates.get(base);
  if (state !== undefined) {
    state.enabled = false;
    state.explicitlyDisabled = true;
  }
}

export function isLazyRuleWatermarkEnabled(driver: SQLDatabaseDriver): boolean {
  const base = unwrapWatermarkDriver(driver);
  const state = driverStates.get(base);
  if (state?.enabled === true) return true;
  if (state?.explicitlyDisabled === true) return false;
  if (typeof process !== "undefined" && process.env?.DECKO_LAZY_RULE_WATERMARKS === "0") {
    return false;
  }
  const sqliteSummary = peekSqliteRuleFlagsSummary(base);
  if (sqliteSummary !== undefined && sqliteSummary.exists) {
    const initialized = getOrInitState(base);
    initialized.enabled = true;
    initialized.schemaInitialized = true;
    initialized.schemaProbedOnDisk = true;
    return true;
  }
  return false;
}

export function getEagerMemberLimit(driver: SQLDatabaseDriver): number {
  const base = unwrapWatermarkDriver(driver);
  return driverStates.get(base)?.eagerMemberLimit ?? 0;
}

export function hasPendingRuleFlags(driver: SQLDatabaseDriver): boolean {
  const base = unwrapWatermarkDriver(driver);
  const sqliteSummary = peekSqliteRuleFlagsSummary(base);
  if (sqliteSummary !== undefined) {
    const state = getOrInitState(base);
    state.schemaProbedOnDisk = true;
    if (!sqliteSummary.exists || sqliteSummary.count === 0 || sqliteSummary.maxEpoch === 0) {
      if (state.latestEpoch !== 0 || state.flagsByEpoch.size !== 0) {
        state.flagsByEpoch.clear();
        state.latestEpoch = 0;
        state.cardEpochs.clear();
      }
      return false;
    }
    state.schemaInitialized = true;
    return true;
  }
  const state = driverStates.get(base);
  return state !== undefined && state.latestEpoch > 0 && state.flagsByEpoch.size > 0;
}

export function getLatestRuleFlagEpoch(driver: SQLDatabaseDriver): number {
  const base = unwrapWatermarkDriver(driver);
  const sqliteSummary = peekSqliteRuleFlagsSummary(base);
  if (sqliteSummary !== undefined) {
    const state = getOrInitState(base);
    state.schemaProbedOnDisk = true;
    if (!sqliteSummary.exists || sqliteSummary.count === 0) {
      return 0;
    }
    state.schemaInitialized = true;
    return Math.max(state.latestEpoch, sqliteSummary.maxEpoch);
  }
  return driverStates.get(base)?.latestEpoch ?? 0;
}

export async function getCardRuleWatermarkEpoch(
  driver: SQLDatabaseDriver,
  cardId: number,
): Promise<number> {
  const base = unwrapWatermarkDriver(driver);
  const state = getOrInitState(base);
  await syncFlagsFromDbIfSchemaExists(base, state);
  const cached = state.cardEpochs.get(cardId);
  if (cached !== undefined && (state.latestEpoch === 0 || cached >= state.latestEpoch)) {
    return cached;
  }
  if (!state.schemaInitialized) return 0;
  const r = await base.query<{ epoch: number }>(
    "SELECT epoch FROM deck_card_rule_watermarks WHERE card_id = ?",
    [cardId],
  );
  const epoch = r.rows[0]?.epoch !== undefined ? Number(r.rows[0].epoch) : 0;
  setCachedCardEpoch(state, cardId, epoch);
  return epoch;
}

export async function recordCardRuleWatermark(
  driver: SQLDatabaseDriver,
  cardId: number,
  epoch: number,
): Promise<void> {
  const base = unwrapWatermarkDriver(driver);
  const state = getOrInitState(base);
  if (!state.schemaInitialized) {
    await syncFlagsFromDbIfSchemaExists(base, state);
  }
  if (!state.schemaInitialized) return;
  const current = state.cardEpochs.get(cardId) ?? 0;
  const nextEpoch = Math.max(current, epoch);
  try {
    const stmt = watermarkUpsertStatement(base, [[cardId, nextEpoch]]);
    await base.query(stmt.sql, stmt.params);
  } catch {
    // Allow read-only replicas to still record in-memory watermarks after derivation
  }
  setCachedCardEpoch(state, cardId, nextEpoch);
}

export async function listPendingRuleFlags(
  driver: SQLDatabaseDriver,
): Promise<PendingRuleFlag[]> {
  const base = unwrapWatermarkDriver(driver);
  await ensureLazyRuleWatermarkSchema(base);
  const state = getOrInitState(base);
  return [...state.flagsByEpoch.values()].sort((a, b) => a.epoch - b.epoch);
}

async function resolveSetPatternDetails(
  deps: ReadRuleWriteDeps,
  setRow: CardsRow | undefined,
): Promise<{
  patternCode: string;
  anchorId: number | null;
  anchorLeftId: number | null;
  anchorRightId: number | null;
  anchorKey: string | null;
}> {
  if (setRow === undefined) {
    return {
      patternCode: "all",
      anchorId: null,
      anchorLeftId: null,
      anchorRightId: null,
      anchorKey: null,
    };
  }
  let patternCode: string | null = null;
  if (setRow.right_id !== null && setRow.right_id !== undefined) {
    const r = await deps.driver.query<{ codename: string | null }>(
      "SELECT codename FROM cards WHERE id = ?",
      [setRow.right_id],
    );
    patternCode = r.rows[0]?.codename ?? null;
  } else {
    patternCode = setRow.codename ?? null;
  }
  let code = patternCode ?? "all";
  const anchorId = setRow.left_id ?? null;
  let anchorLeftId: number | null = null;
  let anchorRightId: number | null = null;
  let anchorKey: string | null = null;
  if (anchorId !== null) {
    const anchorRow = await fetchCardsRow(deps.driver, anchorId);
    if (anchorRow !== undefined) {
      anchorLeftId = anchorRow.left_id ?? null;
      anchorRightId = anchorRow.right_id ?? null;
      if (code === "type" && anchorLeftId !== null && anchorRightId !== null) {
        code = "type_plus_right";
      }
      if (anchorRow.left_id !== null && anchorRow.right_id !== null) {
        const composed = await deps.fetch.lexicon.composeName(
          anchorRow.left_id,
          anchorRow.right_id,
        );
        if (composed !== undefined) anchorKey = composed.key;
      } else if (anchorRow.key !== null && anchorRow.key !== undefined) {
        anchorKey = anchorRow.key;
      } else if (anchorRow.name !== null && anchorRow.name !== undefined) {
        anchorKey = DeckoName.parse(anchorRow.name).key;
      }
    }
  }
  return {
    patternCode: code,
    anchorId,
    anchorLeftId,
    anchorRightId,
    anchorKey,
  };
}

export async function raiseReadRuleFlag(
  deps: ReadRuleWriteDeps,
  ruleCardRow: CardsRow,
  options: RaiseReadRuleFlagOptions = {},
): Promise<PendingRuleFlag | undefined> {
  const readId = await typeIdByCodename(deps, "read");
  if (
    readId === undefined ||
    (ruleCardRow.right_id !== readId && options.priorRuleCardRow?.right_id !== readId)
  ) {
    return undefined;
  }
  if (!(await isStandardRuleCardRow(deps, ruleCardRow))) {
    return undefined;
  }

  const base = unwrapWatermarkDriver(deps.driver);
  const state = getOrInitState(base);
  if (
    state.explicitlyDisabled === true ||
    (typeof process !== "undefined" && process.env?.DECKO_LAZY_RULE_WATERMARKS === "0")
  ) {
    return undefined;
  }
  await ensureLazyRuleWatermarkSchema(base);
  state.enabled = true;

  const setId = ruleCardRow.left_id ?? options.priorRuleCardRow?.left_id ?? null;
  const setRow = setId !== null ? await fetchCardsRow(deps.driver, setId) : undefined;
  const details = await resolveSetPatternDetails(deps, setRow);
  const currentRuleRow = await fetchCardsRow(base, ruleCardRow.id);
  const isLiveRule = currentRuleRow !== undefined && currentRuleRow.trash === 0;
  const isDelete = options.isDelete ?? !isLiveRule;
  const createdAt = new Date().toISOString();

  await base.query(
    `INSERT INTO deck_rule_flags (
       rule_id, set_id, pattern_code, anchor_id, anchor_left_id, anchor_right_id, anchor_key, is_delete, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ruleCardRow.id,
      setId,
      details.patternCode,
      details.anchorId,
      details.anchorLeftId,
      details.anchorRightId,
      details.anchorKey,
      isDelete ? 1 : 0,
      createdAt,
    ],
  );
  await syncFlagsFromDb(base, state);
  expireRuleResolutionCache(deps.driver);
  expireRuleResolutionCache(base);
  // Purge any L3 global rendered-HTML caches (`edge_render_cache` on Cloudflare D1
  // and `decko_edge_render_cache` on Bunny DB) so runtime `*read` rule mutations
  // never leave stale pre-tightening HTML rows in L3 (C1).
  try {
    await base.query("DELETE FROM edge_render_cache", []);
  } catch {
    // Table optional unless L3 cache initialized
  }
  try {
    await base.query("DELETE FROM decko_edge_render_cache", []);
  } catch {
    // Table optional unless Bunny L3 cache initialized
  }

  // If the rule card itself is live, update its own read_rule_id in O(1) and watermark it
  if (isLiveRule) {
    const ruleName =
      currentRuleRow.left_id !== null && currentRuleRow.right_id !== null
        ? (await deps.fetch.lexicon.composeName(currentRuleRow.left_id, currentRuleRow.right_id))
            ?.s ??
          currentRuleRow.name ??
          ""
        : currentRuleRow.name ?? "";
    const derived = await deriveReadRuleRecord(
      deps,
      {
        name: ruleName,
        typeId: currentRuleRow.type_id,
        leftId: currentRuleRow.left_id,
        rightId: currentRuleRow.right_id,
        isNew: false,
      },
      options.overlay,
    );
    if (
      currentRuleRow.read_rule_id !== derived.readRuleId ||
      currentRuleRow.read_rule_class !== derived.readRuleClass
    ) {
      await base.query(
        "UPDATE cards SET read_rule_id = ?, read_rule_class = ? WHERE id = ?",
        [derived.readRuleId, derived.readRuleClass, currentRuleRow.id],
      );
    }
    await recordCardRuleWatermark(base, currentRuleRow.id, state.latestEpoch);
  }

  return state.flagsByEpoch.get(state.latestEpoch);
}

function flagDirectlyMatchesRow(
  flag: PendingRuleFlag,
  row: {
    id: number;
    key?: string | null;
    type_id: number | null;
    left_id: number | null;
    right_id: number | null;
    read_rule_id?: number | null;
  },
  composedKey?: string,
): boolean {
  switch (flag.patternCode) {
    case "all":
      return true;
    case "all_plus":
      return row.left_id !== null && row.right_id !== null;
    case "type":
      return flag.anchorId !== null && row.type_id === flag.anchorId;
    case "right":
      return flag.anchorId !== null && row.right_id === flag.anchorId;
    case "type_plus_right":
      return flag.anchorRightId !== null && row.right_id === flag.anchorRightId;
    case "self": {
      if (flag.anchorId !== null && row.id === flag.anchorId) return true;
      const key = composedKey ?? row.key ?? null;
      return flag.anchorKey !== null && key === flag.anchorKey;
    }
    case "star": {
      const key = composedKey ?? row.key ?? "";
      return key.startsWith("*");
    }
    case "rstar":
    case "rule":
      return true;
    default:
      return true;
  }
}

function flagMayAffectCardRow(
  flag: PendingRuleFlag,
  row: {
    id: number;
    key?: string | null;
    type_id: number | null;
    left_id: number | null;
    right_id: number | null;
    read_rule_id?: number | null;
  },
  composedKey?: string,
): boolean {
  if ((row.read_rule_id ?? null) === flag.ruleId) return true;
  if (flagDirectlyMatchesRow(flag, row, composedKey)) return true;
  // Compound cards may inherit their left ancestor's read_rule_id via [[_left]]
  // or match *type plus right based on their left card's type.
  if (row.left_id !== null && row.left_id !== undefined) {
    return true;
  }
  return false;
}

export async function resolveCardReadRuleWithWatermark(
  deps: ReadRuleWriteDeps,
  cardId: number,
  options: { overlay?: ReadonlyMap<string, number> } = {},
): Promise<ReadRuleRecord | undefined> {
  const base = unwrapWatermarkDriver(deps.driver);
  const row = await fetchCardsRow(base, cardId);
  if (row === undefined || row.trash !== 0) return undefined;

  const state = getOrInitState(base);
  await syncFlagsFromDbIfSchemaExists(base, state);
  if (state.latestEpoch === 0 || state.flagsByEpoch.size === 0) {
    return {
      readRuleId: row.read_rule_id ?? null,
      readRuleClass: row.read_rule_class ?? null,
    };
  }

  const targetEpoch = state.latestEpoch;
  const cardEpoch = await getCardRuleWatermarkEpoch(base, cardId);
  if (cardEpoch >= targetEpoch) {
    return {
      readRuleId: row.read_rule_id ?? null,
      readRuleClass: row.read_rule_class ?? null,
    };
  }

  const composedName =
    row.left_id !== null && row.left_id !== undefined && row.right_id !== null
      ? (await deps.fetch.lexicon.composeName(row.left_id, row.right_id))?.s ?? row.name ?? ""
      : row.name ?? "";
  const composedKey = composedName !== "" ? DeckoName.parse(composedName).key : row.key ?? "";

  let mightMatch = false;
  for (const [epoch, flag] of state.flagsByEpoch) {
    if (epoch <= cardEpoch) continue;
    if (flagMayAffectCardRow(flag, row, composedKey)) {
      mightMatch = true;
      break;
    }
  }

  if (!mightMatch) {
    await recordCardRuleWatermark(base, cardId, targetEpoch);
    return {
      readRuleId: row.read_rule_id ?? null,
      readRuleClass: row.read_rule_class ?? null,
    };
  }

  const derived = await deriveReadRuleRecord(
    { driver: base, fetch: deps.fetch },
    {
      name: composedName,
      typeId: row.type_id,
      leftId: row.left_id,
      rightId: row.right_id,
      isNew: false,
    },
    options.overlay,
  );

  // Atomic idempotent write-back to cards + watermark advance
  const currentWatermark = state.cardEpochs.get(cardId) ?? 0;
  const nextEpoch = Math.max(currentWatermark, targetEpoch);
  const needsCardUpdate =
    derived.readRuleId !== (row.read_rule_id ?? null) ||
    derived.readRuleClass !== (row.read_rule_class ?? null);
  const cardUpdateStmt: SQLStatement = {
    sql: `UPDATE cards SET read_rule_id = ?, read_rule_class = ?
          WHERE id = ?
            AND (COALESCE(read_rule_id, -1) <> COALESCE(?, -1) OR COALESCE(read_rule_class, '') <> COALESCE(?, ''))
            AND NOT EXISTS (
              SELECT 1 FROM deck_card_rule_watermarks w WHERE w.card_id = cards.id AND w.epoch >= ?
            )`,
    params: [
      derived.readRuleId,
      derived.readRuleClass,
      cardId,
      derived.readRuleId,
      derived.readRuleClass,
      nextEpoch,
    ],
  };
  const wmStmt = watermarkUpsertStatement(base, [[cardId, nextEpoch]]);
  if (needsCardUpdate && typeof base.batch === "function") {
    try {
      await base.batch([cardUpdateStmt, wmStmt]);
    } catch {
      // Allow read-only replicas to still return derived rules and cache the epoch in memory
    }
    setCachedCardEpoch(state, cardId, nextEpoch);
  } else {
    if (needsCardUpdate) {
      try {
        await base.query(cardUpdateStmt.sql, cardUpdateStmt.params);
      } catch {
        // Ignore write error on read-only connections
      }
    }
    await recordCardRuleWatermark(base, cardId, targetEpoch);
  }
  return derived;
}

export async function applyPendingRuleFlagsToCardRecord(
  fetch: FetchEngine,
  card: CardRecord,
  freshFromDb = false,
): Promise<CardRecord> {
  if (card.id === undefined || card.isNew || card.trash) return card;
  const base = unwrapWatermarkDriver(fetch.driver);
  const state = getOrInitState(base);
  await syncFlagsFromDbIfSchemaExists(base, state, { allowCachedSkip: !freshFromDb });

  const prevStamp = cardRecordCompactionStamp.get(card);
  if (freshFromDb || prevStamp === undefined) {
    cardRecordCompactionStamp.set(card, state.lastFullCompactionAtMs);
  } else if (state.lastFullCompactionAtMs > prevStamp) {
    const row = await fetchCardsRow(base, card.id);
    if (row !== undefined && row.trash === 0) {
      card.readRuleId = row.read_rule_id ?? undefined;
      card.readRuleClass = row.read_rule_class ?? undefined;
    }
    cardRecordCompactionStamp.set(card, state.lastFullCompactionAtMs);
  }

  if (state.latestEpoch === 0 || state.flagsByEpoch.size === 0) return card;

  const targetEpoch = state.latestEpoch;
  const cardEpoch = await getCardRuleWatermarkEpoch(base, card.id);
  if (cardEpoch >= targetEpoch) return card;

  const resolved = await resolveCardReadRuleWithWatermark(
    { driver: base, fetch },
    card.id,
  );
  if (resolved !== undefined) {
    card.readRuleId = resolved.readRuleId ?? undefined;
    card.readRuleClass = resolved.readRuleClass ?? undefined;
  }
  cardRecordCompactionStamp.set(card, state.lastFullCompactionAtMs);
  return card;
}

function createCompactionCachedDriver(
  base: SQLDatabaseDriver,
  allRowsById: ReadonlyMap<number, CardsRow>,
  liveRowsById: ReadonlyMap<number, CardsRow>,
  rowsByCodename: ReadonlyMap<string, CardsRow>,
  allRowsByStoredKey: ReadonlyMap<string, CardsRow[]>,
  liveJunctionIdsByPair: ReadonlyMap<string, number[]>,
): SQLDatabaseDriver & { readonly base: SQLDatabaseDriver } {
  const tryAnswerInMemory = <T = unknown>(
    sql: string,
    params: unknown[],
  ): SQLQueryResult<T> | undefined => {
    if (sql === CARD_ROW_BY_ID_SQL && params.length === 1 && typeof params[0] === "number") {
      const row = allRowsById.get(params[0]);
      return {
        rows: row !== undefined ? ([row] as unknown as T[]) : [],
        rowsAffected: 0,
      };
    }
    if (sql === LIVE_CARD_ROW_BY_ID_SQL && params.length === 1 && typeof params[0] === "number") {
      const row = liveRowsById.get(params[0]);
      return {
        rows: row !== undefined ? ([row] as unknown as T[]) : [],
        rowsAffected: 0,
      };
    }
    if (sql === CARD_CODENAME_BY_ID_SQL && params.length === 1 && typeof params[0] === "number") {
      const row = allRowsById.get(params[0]);
      return {
        rows: row !== undefined ? ([{ codename: row.codename }] as unknown as T[]) : [],
        rowsAffected: 0,
      };
    }
    if (sql === CARD_ID_BY_CODENAME_SQL && params.length === 1 && typeof params[0] === "string") {
      const row = rowsByCodename.get(params[0]);
      return {
        rows: row !== undefined ? ([{ id: row.id }] as unknown as T[]) : [],
        rowsAffected: 0,
      };
    }
    if (
      (sql === CARD_ID_BY_JUNCTION_PLUS_SQL || sql === CARD_ID_BY_JUNCTION_SQL) &&
      params.length === 2 &&
      typeof params[0] === "number" &&
      typeof params[1] === "number"
    ) {
      const ids = liveJunctionIdsByPair.get(`${params[0]}:${params[1]}`) ?? [];
      const rows =
        sql === CARD_ID_BY_JUNCTION_SQL
          ? ids.slice(0, 1).map((id) => ({ id }))
          : ids.map((id) => ({ id }));
      return {
        rows: rows as unknown as T[],
        rowsAffected: 0,
      };
    }
    if (
      sql.startsWith('SELECT id, "key", trash FROM cards WHERE "key" IN (') &&
      sql.endsWith(")")
    ) {
      const matched: Array<{ id: number; key: string; trash: number | null }> = [];
      for (const p of params) {
        if (typeof p !== "string") continue;
        const list = allRowsByStoredKey.get(p);
        if (list === undefined) continue;
        for (const r of list) {
          if (r.key !== null && r.key !== undefined) {
            matched.push({ id: Number(r.id), key: r.key, trash: r.trash });
          }
        }
      }
      return {
        rows: matched as unknown as T[],
        rowsAffected: 0,
      };
    }
    return undefined;
  };

  return {
    base,
    transactionGuarantee: base.transactionGuarantee,
    async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
      const hit = tryAnswerInMemory<T>(sql, params);
      if (hit !== undefined) return hit;
      return base.query<T>(sql, params);
    },
    async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
      if (statements.length === 0) return [];
      const hits: SQLQueryResult[] = [];
      for (const s of statements) {
        const hit = tryAnswerInMemory(s.sql, s.params);
        if (hit === undefined) {
          return base.batch(statements);
        }
        hits.push(hit);
      }
      return hits;
    },
    transaction: base.transaction ? <R>(work: () => Promise<R>) => base.transaction!(work) : undefined,
  };
}

export async function compactPendingRuleFlags(
  deps: ReadRuleWriteDeps,
  options: { batchSize?: number; nowMs?: number } = {},
): Promise<CompactionReport> {
  const base = unwrapWatermarkDriver(deps.driver);
  const state = getOrInitState(base);
  const isFullCompaction = options.batchSize === undefined || options.batchSize <= 0;
  if (isFullCompaction && state.compactionInFlight !== undefined) {
    return state.compactionInFlight;
  }
  const run = compactPendingRuleFlagsInternal(deps, base, state, options);
  if (isFullCompaction) {
    state.compactionInFlight = run;
    try {
      return await run;
    } finally {
      if (state.compactionInFlight === run) {
        state.compactionInFlight = undefined;
      }
    }
  }
  return run;
}

async function compactPendingRuleFlagsInternal(
  deps: ReadRuleWriteDeps,
  base: SQLDatabaseDriver,
  state: DriverWatermarkState,
  options: { batchSize?: number; nowMs?: number },
): Promise<CompactionReport> {
  const flushTimeMs = options.nowMs ?? Date.now();
  await ensureLazyRuleWatermarkSchema(base, { nowMs: flushTimeMs });
  if (state.flagsByEpoch.size === 0 || state.latestEpoch === 0) {
    await recordFullCompactionTimestamp(base, flushTimeMs);
    return {
      evaluatedCards: 0,
      updatedCards: 0,
      compactedEpochsUpTo: 0,
      remainingFlags: 0,
      remainingUnwatermarkedCards: 0,
      lastFullCompactionAtMs: state.lastFullCompactionAtMs,
      nextScheduledCompactionAtMs: state.lastFullCompactionAtMs + state.compactionIntervalMs,
    };
  }

  const targetEpoch = state.latestEpoch;
  const flags = [...state.flagsByEpoch.values()].sort((a, b) => a.epoch - b.epoch);

  // 1. Preload all existing card watermarks in 1 query
  const existingWatermarks = await base.query<{ card_id: number; epoch: number }>(
    "SELECT card_id, epoch FROM deck_card_rule_watermarks",
    [],
  );
  for (const wm of existingWatermarks.rows) {
    const cid = Number(wm.card_id);
    const ep = Number(wm.epoch);
    const cur = state.cardEpochs.get(cid) ?? 0;
    if (ep > cur) setCachedCardEpoch(state, cid, ep);
  }

  // 2. Bulk preload card metadata rows in 1 query (loading db_content only for *read
  // rule cards so large content bodies are never pulled into memory) so rule derivation,
  // composed-key lookup, and descendant walks run in memory with 0 per-card SQL queries.
  const allCardsRes = await base.query<CardsRow>(
    `SELECT id, name, "key", codename, left_id, right_id, NULL AS current_revision_id,
            created_at, updated_at, creator_id, updater_id,
            read_rule_class, read_rule_id, NULL AS references_expired, trash, type_id,
            CASE WHEN right_id IN (SELECT id FROM cards WHERE codename = 'read' AND trash = 0)
                 THEN db_content ELSE NULL END AS db_content
       FROM cards ORDER BY id ASC`,
    [],
  );
  const allRowsById = new Map<number, CardsRow>();
  const rowsById = new Map<number, CardsRow>();
  const rowsByCodename = new Map<string, CardsRow>();
  const allRowsByStoredKey = new Map<string, CardsRow[]>();
  const liveJunctionIdsByPair = new Map<string, number[]>();
  const childrenByLeftId = new Map<number, number[]>();
  const composedNamesById = new Map<number, string>();
  const composedKeysById = new Map<number, string>();

  const pendingCompoundRows: CardsRow[] = [];
  for (const row of allCardsRes.rows) {
    if (row.id === null || row.id === undefined) continue;
    const id = Number(row.id);
    allRowsById.set(id, row);
    if (typeof row.key === "string" && row.key !== "") {
      let keyList = allRowsByStoredKey.get(row.key);
      if (keyList === undefined) {
        keyList = [];
        allRowsByStoredKey.set(row.key, keyList);
      }
      keyList.push(row);
    }
    if (row.trash !== 0) continue;
    rowsById.set(id, row);
    if (typeof row.codename === "string" && row.codename !== "" && !rowsByCodename.has(row.codename)) {
      rowsByCodename.set(row.codename, row);
    }
    if (row.left_id !== null && row.left_id !== undefined) {
      const leftId = Number(row.left_id);
      let list = childrenByLeftId.get(leftId);
      if (list === undefined) {
        list = [];
        childrenByLeftId.set(leftId, list);
      }
      list.push(id);
      if (row.right_id !== null && row.right_id !== undefined) {
        const pairKey = `${leftId}:${Number(row.right_id)}`;
        let pairList = liveJunctionIdsByPair.get(pairKey);
        if (pairList === undefined) {
          pairList = [];
          liveJunctionIdsByPair.set(pairKey, pairList);
        }
        pairList.push(id);
      }
    }
    if (
      (row.left_id === null || row.left_id === undefined) &&
      row.name !== null &&
      row.name !== undefined
    ) {
      composedNamesById.set(id, row.name);
      const parsed = DeckoName.parse(row.name);
      composedKeysById.set(id, row.key ?? parsed.key);
      deps.fetch.lexicon.write(id, parsed, parsed.s);
    } else if (row.left_id !== null && row.left_id !== undefined && row.right_id !== null) {
      pendingCompoundRows.push(row);
    }
  }

  let unresolved = pendingCompoundRows;
  for (let pass = 0; pass < 32 && unresolved.length > 0; pass++) {
    const nextUnresolved: CardsRow[] = [];
    let madeProgress = false;
    for (const row of unresolved) {
      const id = Number(row.id);
      const leftName =
        row.left_id !== null && row.left_id !== undefined
          ? composedNamesById.get(Number(row.left_id))
          : undefined;
      const rightName =
        row.right_id !== null && row.right_id !== undefined
          ? composedNamesById.get(Number(row.right_id))
          : undefined;
      if (leftName !== undefined && rightName !== undefined) {
        const full = `${leftName}+${rightName}`;
        const parsed = DeckoName.parse(full);
        composedNamesById.set(id, parsed.s);
        composedKeysById.set(id, parsed.key);
        deps.fetch.lexicon.write(id, parsed, [Number(row.left_id), Number(row.right_id)]);
        madeProgress = true;
      } else {
        nextUnresolved.push(row);
      }
    }
    unresolved = nextUnresolved;
    if (!madeProgress) break;
  }

  const cachedDriver = createCompactionCachedDriver(
    base,
    allRowsById,
    rowsById,
    rowsByCodename,
    allRowsByStoredKey,
    liveJunctionIdsByPair,
  );
  const cachedDeps: ReadRuleWriteDeps = { driver: cachedDriver, fetch: deps.fetch };

  // 3. Collect all candidate card IDs that could be affected by pending flags
  const candidateIds = new Set<number>();
  let hasGlobalAllFlag = false;
  for (const flag of flags) {
    if (flag.setId === null || flag.patternCode === "all") {
      hasGlobalAllFlag = true;
      break;
    }
  }
  if (hasGlobalAllFlag) {
    for (const id of rowsById.keys()) {
      candidateIds.add(id);
    }
  } else {
    const flaggedRuleIds = new Set<number>();
    for (const flag of flags) {
      flaggedRuleIds.add(flag.ruleId);
      if (flag.setId !== null) {
        const setRow = rowsById.get(flag.setId) ?? (await fetchCardsRow(cachedDriver, flag.setId));
        if (setRow !== undefined) {
          const members = await setMemberIds(cachedDeps, setRow);
          for (const id of members) candidateIds.add(id);
        } else {
          for (const id of rowsById.keys()) candidateIds.add(id);
        }
      }
    }
    if (flaggedRuleIds.size > 0) {
      for (const [id, row] of rowsById) {
        if (row.read_rule_id !== null && row.read_rule_id !== undefined && flaggedRuleIds.has(Number(row.read_rule_id))) {
          candidateIds.add(id);
        }
      }
    }
    // Transitively include compound field descendants in memory
    let frontier = [...candidateIds];
    while (frontier.length > 0) {
      const nextFrontier: number[] = [];
      for (const parentId of frontier) {
        const children = childrenByLeftId.get(parentId);
        if (children === undefined) continue;
        for (const childId of children) {
          if (!candidateIds.has(childId)) {
            candidateIds.add(childId);
            nextFrontier.push(childId);
          }
        }
      }
      frontier = nextFrontier;
    }
  }

  // Filter to cards whose watermark epoch < targetEpoch
  const workingEpochs = new Map<number, number>(state.cardEpochs);
  const unwatermarked: number[] = [];
  for (const id of candidateIds) {
    const w = workingEpochs.get(id) ?? 0;
    if (w < targetEpoch) {
      unwatermarked.push(id);
    }
  }

  // Sort simple cards (left_id === null) before compound cards so left ancestors settle first (M7)
  unwatermarked.sort((a, b) => {
    const rowA = rowsById.get(a);
    const rowB = rowsById.get(b);
    const compoundA = rowA?.left_id !== null && rowA?.left_id !== undefined ? 1 : 0;
    const compoundB = rowB?.left_id !== null && rowB?.left_id !== undefined ? 1 : 0;
    if (compoundA !== compoundB) return compoundA - compoundB;
    return a - b;
  });

  const limit =
    options.batchSize !== undefined && options.batchSize > 0
      ? options.batchSize
      : unwatermarked.length;
  const queue = unwatermarked.slice(0, limit);
  const queuedSet = new Set<number>(queue);

  let evaluatedCards = 0;
  let updatedCards = 0;
  const watermarkedInThisRun: number[] = [];
  const updatesByRuleTarget = new Map<
    string,
    { readRuleId: number | null; readRuleClass: string | null; ids: number[] }
  >();

  while (queue.length > 0) {
    if (evaluatedCards > 0 && evaluatedCards % 500 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const cardId = queue.shift()!;
    const beforeRow = rowsById.get(cardId);
    if (beforeRow === undefined || beforeRow.trash !== 0) {
      workingEpochs.set(cardId, Math.max(workingEpochs.get(cardId) ?? 0, targetEpoch));
      watermarkedInThisRun.push(cardId);
      continue;
    }
    const cardEpoch = workingEpochs.get(cardId) ?? 0;
    const composedName =
      composedNamesById.get(cardId) ??
      (beforeRow.left_id !== null && beforeRow.left_id !== undefined && beforeRow.right_id !== null
        ? (await deps.fetch.lexicon.composeName(beforeRow.left_id, beforeRow.right_id))?.s ??
          beforeRow.name ??
          ""
        : beforeRow.name ?? "");
    const composedKey =
      composedKeysById.get(cardId) ??
      (composedName !== "" ? DeckoName.parse(composedName).key : beforeRow.key ?? "");

    let mightMatch = false;
    for (const [epoch, flag] of state.flagsByEpoch) {
      if (epoch <= cardEpoch) continue;
      if (flagMayAffectCardRow(flag, beforeRow, composedKey)) {
        mightMatch = true;
        break;
      }
    }

    evaluatedCards += 1;
    workingEpochs.set(cardId, Math.max(cardEpoch, targetEpoch));
    watermarkedInThisRun.push(cardId);

    if (!mightMatch) {
      continue;
    }

    const beforeRuleId = beforeRow.read_rule_id ?? null;
    const beforeRuleClass = beforeRow.read_rule_class ?? null;
    const derived = await deriveReadRuleRecord(cachedDeps, {
      name: composedName,
      typeId: beforeRow.type_id,
      leftId: beforeRow.left_id,
      rightId: beforeRow.right_id,
      isNew: false,
    });

    if (derived.readRuleId !== beforeRuleId || derived.readRuleClass !== beforeRuleClass) {
      updatedCards += 1;
      (beforeRow as { read_rule_id: number | null; read_rule_class: string | null }).read_rule_id =
        derived.readRuleId;
      (beforeRow as { read_rule_id: number | null; read_rule_class: string | null }).read_rule_class =
        derived.readRuleClass;

      const groupKey = `${derived.readRuleId ?? "null"}|${derived.readRuleClass ?? "null"}`;
      let group = updatesByRuleTarget.get(groupKey);
      if (group === undefined) {
        group = {
          readRuleId: derived.readRuleId,
          readRuleClass: derived.readRuleClass,
          ids: [],
        };
        updatesByRuleTarget.set(groupKey, group);
      }
      group.ids.push(cardId);

      // Enqueue any compound field cards (left_id = cardId) in memory
      const children = childrenByLeftId.get(cardId);
      if (children !== undefined) {
        for (const childId of children) {
          const childEpoch = workingEpochs.get(childId) ?? 0;
          if (childEpoch < targetEpoch && !queuedSet.has(childId)) {
            queuedSet.add(childId);
            queue.push(childId);
          }
        }
      }
    }
  }

  // Check if any candidate cards remain below targetEpoch
  let remainingUnwatermarked = 0;
  for (const id of candidateIds) {
    const w = workingEpochs.get(id) ?? 0;
    if (w < targetEpoch) remainingUnwatermarked += 1;
  }

  // Build grouped SQL UPDATE statements for changed cards
  const writeStatements: SQLStatement[] = [];
  for (const group of updatesByRuleTarget.values()) {
    for (let i = 0; i < group.ids.length; i += 400) {
      const chunk = group.ids.slice(i, i + 400);
      const placeholders = chunk.map(() => "?").join(", ");
      writeStatements.push({
        sql: `UPDATE cards SET read_rule_id = ?, read_rule_class = ? WHERE id IN (${placeholders})`,
        params: [group.readRuleId, group.readRuleClass, ...chunk],
      });
    }
  }

  if (remainingUnwatermarked > 0 && watermarkedInThisRun.length > 0) {
    for (let i = 0; i < watermarkedInThisRun.length; i += 200) {
      const chunk = watermarkedInThisRun.slice(i, i + 200);
      writeStatements.push(
        watermarkUpsertStatement(
          base,
          chunk.map((cid) => [cid, targetEpoch] as const),
        ),
      );
    }
  }

  if (writeStatements.length > 0) {
    try {
      if (typeof base.batch === "function") {
        await base.batch(writeStatements);
      } else {
        for (const stmt of writeStatements) {
          await base.query(stmt.sql, stmt.params);
        }
      }
    } catch {
      // Allow read-only connections to complete in-memory watermark reconciliation
    }
  }

  for (const cid of watermarkedInThisRun) {
    const ep = workingEpochs.get(cid);
    if (ep !== undefined) {
      setCachedCardEpoch(state, cid, ep);
    }
  }

  let compactedEpochsUpTo = 0;
  if (remainingUnwatermarked === 0) {
    try {
      await base.query("DELETE FROM deck_rule_flags WHERE epoch <= ?", [targetEpoch]);
      compactedEpochsUpTo = targetEpoch;
      await syncFlagsFromDb(base, state);
      if (state.flagsByEpoch.size === 0) {
        await base.query("DELETE FROM deck_card_rule_watermarks WHERE epoch <= ?", [targetEpoch]);
        state.cardEpochs.clear();
        await recordFullCompactionTimestamp(base, flushTimeMs);
      }
    } catch {
      // Ignore write failures on read-only connections
    }
    expireRuleResolutionCache(deps.driver);
    expireRuleResolutionCache(base);
  }

  return {
    evaluatedCards,
    updatedCards,
    compactedEpochsUpTo,
    remainingFlags: state.flagsByEpoch.size,
    remainingUnwatermarkedCards: remainingUnwatermarked,
    lastFullCompactionAtMs: state.lastFullCompactionAtMs,
    nextScheduledCompactionAtMs: state.lastFullCompactionAtMs + state.compactionIntervalMs,
  };
}

export async function reconcilePendingRuleFlagsForSearch(
  driver: SQLDatabaseDriver,
  fetch?: FetchEngine,
  nowMs?: number,
): Promise<void> {
  const base = unwrapWatermarkDriver(driver);
  const state = getOrInitState(base);
  await syncFlagsFromDbIfSchemaExists(base, state);
  if (state.latestEpoch === 0 || state.flagsByEpoch.size === 0) return;
  try {
    const engine = fetch ?? new FetchEngine(base);
    await compactPendingRuleFlags({ driver: base, fetch: engine }, { nowMs, batchSize: 250 });
  } catch {
    // Do not fail a read/search query if background compaction cannot write to a read-only replica
  }
}

export async function runScheduledCompactionIfDue(
  deps: ReadRuleWriteDeps,
  options: { nowMs?: number } = {},
): Promise<{ ran: boolean; schedule: CompactionScheduleState; report?: CompactionReport }> {
  const nowMs = options.nowMs ?? Date.now();
  const schedule = await getCompactionScheduleState(deps.driver, nowMs);
  if (!schedule.isDue) {
    return { ran: false, schedule };
  }
  const report = await compactPendingRuleFlags(deps, { nowMs });
  const updatedSchedule = await getCompactionScheduleState(deps.driver, nowMs);
  return { ran: true, schedule: updatedSchedule, report };
}

export class RuleWatermarkStore {
  constructor(private readonly driver: SQLDatabaseDriver) {}

  async enable(options: LazyRuleWatermarkOptions = {}): Promise<void> {
    await enableLazyRuleWatermarks(this.driver, options);
  }

  disable(): void {
    disableLazyRuleWatermarks(this.driver);
  }

  isEnabled(): boolean {
    return isLazyRuleWatermarkEnabled(this.driver);
  }

  hasPendingFlags(): boolean {
    return hasPendingRuleFlags(this.driver);
  }

  latestEpoch(): number {
    return getLatestRuleFlagEpoch(this.driver);
  }

  async cardEpoch(cardId: number): Promise<number> {
    return await getCardRuleWatermarkEpoch(this.driver, cardId);
  }

  async compact(
    fetch?: FetchEngine,
    options: { limit?: number; batchSize?: number; nowMs?: number } = {},
  ): Promise<CompactionReport> {
    return await compactPendingRuleFlags(
      { driver: this.driver, fetch: fetch ?? new FetchEngine(this.driver) },
      { batchSize: options.batchSize ?? options.limit, nowMs: options.nowMs },
    );
  }
}
