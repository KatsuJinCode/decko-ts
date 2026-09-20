// Type declarations for verify.mjs (plain-JS tool module).

import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import type { LocalSqliteToolDriver, ImportStats } from "./import.mjs";

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
  engine: Record<string, unknown> & { status: string };
  outOfScope: string[];
  allParity: boolean;
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
  }) => Promise<Record<string, unknown>>;
  /** Random cards to spot-check (default 25). */
  spotCount?: number;
  /** RNG seed for reproducible sampling. */
  seed?: number;
  /** Where to write the JSON report. */
  reportPath?: string;
}

/** Run all checks and assemble the migration report (also written to
 *  reportPath when given). Content-free by construction. */
export function verifyMigration(opts: VerifyOptions): Promise<MigrationReport>;
