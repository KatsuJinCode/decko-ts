import type { SQLDatabaseDriver } from "../../src/server/driver.js";
export function hashTable(db: unknown, table: string): string;
export function proveDeterminism(opts: {
  driverA: SQLDatabaseDriver | unknown;
  driverB: SQLDatabaseDriver | unknown;
  tables?: string[];
  [k: string]: unknown;
}): Promise<{ allTablesDeterministic: boolean; results: Array<{ table: string; deterministic: boolean; [k: string]: unknown }> }>;
