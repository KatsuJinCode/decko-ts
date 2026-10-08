// Type declarations for verify.mjs (plain-JS tool module).

import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import type { LocalSqliteToolDriver, ImportStats, TargetSchema } from "./import.mjs";
import type { DeckFilesCopy, DeckFilesReport } from "./files.mjs";

/** What the engine needs beyond the dump's rows before it serves the deck. */
export interface TargetReadiness {
  stampRow: boolean;
  freshnessTriggers: { present: number; expected: number };
  sessionTable: boolean;
  importComplete: boolean;
  ok: boolean;
}

export function checkTargetReadiness(driver: SQLDatabaseDriver, schema: TargetSchema): Promise<TargetReadiness>;

export const OUT_OF_SCOPE: string[];

/** Resolve a compound card's name by walking left/right junctions in SQL
 *  (depth-capped: a junction cycle resolves to false, never a hang). */
export function walkJunctionName(
  driver: SQLDatabaseDriver,
  id: number,
  depth?: number,
  maxDepth?: number,
): Promise<{ name: string | null; resolved: boolean; depth: number }>;

export interface MigrationReport {
  tool: string;
  timestamp: string;
  dump: { file: string; bytes: number };
  import: {
    elapsedMs: number;
    rowsEmitted: number;
    keyRepair: { derived: number; nullSimpleKeys: number };
    errors: { table: string; rowId: unknown; message: string }[];
    skippedTables: Record<string, number>;
    dumpSha256: string | null;
    resumedFromRow: number;
    engineMigrations: string[];
  };
  cards: { sourceCount: number; targetCount: number; parity: boolean } | null;
  tables: Record<
    string,
    {
      sourceCount: number;
      targetCount: number;
      countParity: boolean;
      checksumSource: number | null;
      checksumTarget: number;
      checksumParity: boolean | null;
      minIdSource: number | null;
      minIdTarget?: number;
      maxIdSource: number | null;
      maxIdTarget?: number;
    }
  >;
  junction: { sampled: number; resolved: number; unresolvedIds: number[] };
  engine: {
    status: string;
    spotRender?: { sampled: number; rendered: number; renderErrors: number; contentContainedHits: number };
    [key: string]: unknown;
  };
  readiness: TargetReadiness;
  files: DeckFilesReport;
  outOfScope: string[];
  /** Count and checksum parity on every dump table. */
  allParity: boolean;
  /** The whole verdict: parity, every sampled junction resolved, readiness,
   *  files, engine checks without errors, and no row errors. */
  ok: boolean;
  warnings: string[];
  verifyElapsedMs: number;
}

export interface VerifyOptions {
  /** Source dump path (report metadata only — never re-read). */
  dumpPath: string;
  /** The imported target database. */
  driver: LocalSqliteToolDriver;
  /** Path to db/schema.sqlite.sql. */
  ddlPath: string;
  /** importDump() return value (source counts/checksums). */
  importStats: ImportStats;
  /** Engine-level checks hook (engine-bridge.ts). Optional. */
  engineChecks?: (ctx: {
    driver: LocalSqliteToolDriver;
    spotCount: number;
    seed: number;
  }) => Promise<unknown>;
  /** Random cards to spot-check (default 25). */
  spotCount?: number;
  /** RNG seed for reproducible sampling. */
  seed?: number;
  /** The Ruby deck's files directory, when files were migrated. */
  filesSourceDir?: string;
  /** Where the files were copied (the port's DECKO_FILES_DIR). */
  filesTargetDir?: string;
  /** copyDeckFiles()'s result, carried into the report. */
  filesCopy?: DeckFilesCopy;
  /** Where to write the JSON report. */
  reportPath?: string;
}

/** Run all checks and assemble the migration report (also written to
 *  reportPath when given). Content-free by construction. */
export function verifyMigration(opts: VerifyOptions): Promise<MigrationReport>;
