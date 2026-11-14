export function openSourceSqlite(path: string): unknown;
export function inventorySource(db: unknown): Record<
  string,
  { columns: string[]; rows: number; rowCount?: number; columnTypes?: Record<string, string>; [k: string]: unknown }
>;
export function sourceTableRows(
  db: unknown,
  table: string,
  opts?: { chunkRows?: number },
): AsyncGenerator<unknown[]>;
export function sourceAllRows(
  db: unknown,
  opts?: { chunkRows?: number },
): AsyncGenerator<{ table: string; row: unknown[] }>;
