export function importFromSqlite(opts: {
  sourcePath: string;
  outPath?: string;
  driver?: unknown;
  ddlPath?: string;
  verify?: boolean;
  determinism?: boolean;
  modCompat?: boolean;
  strict?: boolean;
  [k: string]: unknown;
}): Promise<{
  allParity: boolean;
  tables: Record<string, unknown>;
  counts: Record<string, number>;
  schemaMappings: Record<string, string>;
  skippedTables: Record<string, number>;
  warnings: string[];
  errors: unknown[];
  settingsInventory: {
    tables: Array<{ source: string; count: number; sampleKeys?: string[]; [k: string]: unknown }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}>;
