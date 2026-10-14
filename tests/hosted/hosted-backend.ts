// The hosted database a suite runs against, selected by environment
// variables. tools/hosted-conformance/run.mjs creates a scratch database,
// sets these variables and runs each suite with a test-name filter of
// "hosted"; a suite that finds no target adds no hosted cases.
//
//   DECKO_HOSTED_TARGET      d1-http | libsql | bunny
//   DECKO_HOSTED_D1_QUERY_URL, DECKO_HOSTED_D1_API_TOKEN   (d1-http)
//   DECKO_HOSTED_DB_URL, DECKO_HOSTED_DB_TOKEN             (libsql, bunny)
//
// Every suite case expects an empty database, so open() first resets the
// scratch database: it drops every table, view and trigger the suites can
// have created. The runner refuses a database that was not empty before it
// started, so nothing else is ever dropped.

import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { CloudflareD1Adapter } from "../../src/server/drivers/d1.js";
import { DEFAULT_JOURNALED_TABLES } from "../../src/server/drivers/undo-journal.js";
import { LibSqlHttpAdapter } from "../../src/server/drivers/libsql-http.js";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { D1RestDatabase } from "./d1-rest.js";

export interface HostedDeck {
  /** "hosted <target>", used in the suites' test names. */
  readonly label: string;
  readonly target: "d1-http" | "libsql" | "bunny";
  /** A new driver object over the reset scratch database. */
  open(): Promise<SQLDatabaseDriver>;
  /** Another driver object over the same database, without a reset (a
   *  second isolate or connection). */
  connect(): SQLDatabaseDriver;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`hosted target needs ${name}`);
  return value;
}

export function hostedDeck(): HostedDeck | undefined {
  const target = process.env.DECKO_HOSTED_TARGET;
  if (target === undefined || target === "") return undefined;
  let connect: () => SQLDatabaseDriver;
  if (target === "d1-http") {
    const queryUrl = required("DECKO_HOSTED_D1_QUERY_URL");
    const apiToken = required("DECKO_HOSTED_D1_API_TOKEN");
    // conf_tx is the transaction conformance suite's table.
    const journal = { tables: [...DEFAULT_JOURNALED_TABLES, "conf_tx"] };
    connect = () => new CloudflareD1Adapter(new D1RestDatabase({ queryUrl, apiToken }), { journal });
  } else if (target === "libsql" || target === "bunny") {
    const url = required("DECKO_HOSTED_DB_URL");
    const authToken = process.env.DECKO_HOSTED_DB_TOKEN || undefined;
    connect =
      target === "libsql"
        ? () => new LibSqlHttpAdapter({ url, authToken })
        : () => new BunnyDbDriver({ url, authToken });
  } else {
    throw new Error(`DECKO_HOSTED_TARGET must be d1-http, libsql or bunny, not ${target}`);
  }
  return {
    label: `hosted ${target}`,
    target,
    connect,
    open: async () => {
      await resetScratchDatabase(connect);
      return connect();
    },
  };
}

/** Drops every trigger, view and table except SQLite's and Cloudflare's
 *  internal ones, through new driver objects from connect(). Tables are dropped in passes, so an order forced by
 *  foreign keys resolves itself. */
export async function resetScratchDatabase(connect: () => SQLDatabaseDriver): Promise<void> {
  // A fresh driver object per statement: the D1 adapter remembers having
  // seen its lock table, which this reset drops.
  const driver = { query: <T>(sql: string, params: unknown[]) => connect().query<T>(sql, params) };
  const objects = async (type: string) =>
    (
      await driver.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
        [type],
      )
    ).rows.map((r) => r.name);
  const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
  for (const name of await objects("trigger")) await driver.query(`DROP TRIGGER IF EXISTS ${quote(name)}`, []);
  for (const name of await objects("view")) await driver.query(`DROP VIEW IF EXISTS ${quote(name)}`, []);
  for (let pass = 0; ; pass++) {
    const tables = await objects("table");
    if (tables.length === 0) break;
    let lastError: unknown;
    for (const name of tables) {
      try {
        await driver.query(`DROP TABLE IF EXISTS ${quote(name)}`, []);
      } catch (error) {
        lastError = error;
      }
    }
    if (pass > tables.length) throw new Error(`could not empty the scratch database: ${String(lastError)}`);
  }
  await driver.query("DELETE FROM sqlite_sequence", []).catch(() => undefined);
}
