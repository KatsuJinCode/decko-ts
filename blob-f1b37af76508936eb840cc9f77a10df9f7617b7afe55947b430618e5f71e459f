// Type declarations for d1-validator.mjs (plain-JS tool module; the .d.mts
// travels beside it so strict-mode TypeScript consumers — tests and the
// engine bridge — import it safely).

import type { SQLDatabaseDriver } from "../../src/server/driver.js";

/** Output tables whose drift is reported but not validated (documented
 *  out-of-scope for the importer's validation pass). */
export const OUT_OF_SCOPE: readonly string[];

export function countTable(
  driver: SQLDatabaseDriver,
  table: string,
): Promise<number>;

export function countAll(
  driver: SQLDatabaseDriver,
  tableNames: readonly string[],
): Promise<Record<string, number>>;

export function countJunctions(driver: SQLDatabaseDriver): Promise<number>;

export interface OrphanJunctions {
  leftCount: number;
  rightCount: number;
  leftIds: number[];
  rightIds: number[];
  samples: Array<{ id: number; leftId: number | null; rightId: number | null }>;
}

export function findOrphanJunctions(
  driver: SQLDatabaseDriver,
  limit?: number,
): Promise<OrphanJunctions>;

export interface JunctionWalkSample {
  sampled: number;
  resolved: number;
}

export function sampleJunctionWalk(
  driver: SQLDatabaseDriver,
  sampleSize?: number,
  maxDepth?: number,
): Promise<JunctionWalkSample>;

/** One chunk as recorded by the d1-chunker manifest. */
export interface ChunkManifestEntry {
  file: string;
  rows: number;
  bytes: number;
  tables: string[];
}

export interface BuildReportInput {
  targetDriver: SQLDatabaseDriver;
  targetKind: string;
  targetPath: string;
  sourcePath: string;
  sourceKind: string;
  sourceBytes: number;
  sourceCardsCount: number;
  sourceJunctionsCount: number;
  tableColumns: Record<string, string[]>;
  chunks: readonly ChunkManifestEntry[];
  totalRows: number;
}

export interface ImportDeckReport {
  tool: string;
  timestamp: string;
  source: { path: string; kind: string; bytes: number; cardsCount: number; junctionsCount: number };
  target: { path: string; kind: string; tables: Record<string, number>; cardsCount: number; junctionsCount: number };
  chunks: {
    count: number;
    totalRows: number;
    totalBytes: number;
    rowsPerChunk: number[];
    bytesPerChunk: number[];
    tablesPerChunk: string[][];
  };
  integrity: {
    orphanLeftCount: number;
    orphanRightCount: number;
    orphanLeftSample: number[];
    orphanRightSample: number[];
    junctionWalk: JunctionWalkSample;
  };
  allChecksPass: boolean;
  warnings: string[];
  outOfScope: readonly string[];
  /** The CLI annotates the report after building (apply stats, dedup
   *  warnings); those keys are intentional but not fixed-shape. */
  [postAppliedField: string]: unknown;
}

/** Build the full validation report from a target driver and the chunk
 *  manifest (source stats collected during ingest ride along). */
export function buildReport(input: BuildReportInput): Promise<ImportDeckReport>;

export function writeReport(report: ImportDeckReport, reportPath: string): void;
