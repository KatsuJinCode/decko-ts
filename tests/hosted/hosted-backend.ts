// The hosted database a suite runs against, selected by environment
// variables. tools/hosted-conformance/run.mjs creates (or checks) a scratch
// database, sets these variables and runs each suite; a shared suite adds
// its hosted cases only when a target is set, and the runner selects them
// with a test-name filter of "hosted".
//
//   DECKO_HOSTED_TARGET         d1-http | d1-binding | libsql | bunny
//   d1-http:     DECKO_HOSTED_D1_QUERY_URL, DECKO_HOSTED_D1_API_TOKEN
//                (Cloudflare's D1 HTTP API)
//   d1-binding:  DECKO_HOSTED_D1_NAME, DECKO_HOSTED_D1_ID, optional
//                DECKO_HOSTED_WRANGLER_MODULE (a wrangler remote binding
//                through getPlatformProxy; uses wrangler's own login)
//   libsql, bunny: DECKO_HOSTED_DB_URL, DECKO_HOSTED_DB_TOKEN
//   DECKO_HOSTED_ALLOW_RESET=1  permits emptying a database that is not
//                empty when this process first opens it
//
// Every suite case expects an empty database, so open() empties it first:
// it drops every table, view and trigger except SQLite's and Cloudflare's
// internal ones. Emptying a database that held something before this
// process touched it would destroy it on a mis-set variable, so the first
// open in a process refuses a non-empty database unless
// DECKO_HOSTED_ALLOW_RESET=1. The runner sets it only for scratch databases
// it created or found empty itself.

import { afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "../../src/server/drivers/d1.js";
import { DEFAULT_JOURNALED_TABLES } from "../../src/server/drivers/undo-journal.js";
import { LibSqlHttpAdapter } from "../../src/server/drivers/libsql-http.js";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { D1RestDatabase } from "./d1-rest.js";

export type HostedTarget = "d1-http" | "d1-binding" | "libsql" | "bunny";

export interface HostedDeck {
  /** "hosted <target>", used in the suites' test names. */
  readonly label: string;
  readonly target: HostedTarget;
  /** A new driver object over the emptied scratch database. */
  open(): Promise<SQLDatabaseDriver>;
  /** Another driver object over the same database, without emptying it (a
   *  second isolate or connection). Call after open(). */
  connect(): SQLDatabaseDriver;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`hosted target needs ${name}`);
  return value;
}

/** The D1 journal covers the save tables and conf_tx, the transaction
 *  conformance suite's table. */
const D1_JOURNAL = { tables: [...DEFAULT_JOURNALED_TABLES, "conf_tx"] };

/** True once this process has opened the database and checked it was empty
 *  (or been allowed to empty it). Later opens empty what this process's own
 *  suites created. */
let firstOpenChecked = false;

export function hostedDeck(): HostedDeck | undefined {
  const target = process.env.DECKO_HOSTED_TARGET;
  if (target === undefined || target === "") return undefined;
  let connect: () => SQLDatabaseDriver;
  let prepare: () => Promise<void> = async () => undefined;
  if (target === "d1-http") {
    const queryUrl = required("DECKO_HOSTED_D1_QUERY_URL");
    const apiToken = required("DECKO_HOSTED_D1_API_TOKEN");
    connect = () => new CloudflareD1Adapter(new D1RestDatabase({ queryUrl, apiToken }), { journal: D1_JOURNAL });
  } else if (target === "d1-binding") {
    const name = required("DECKO_HOSTED_D1_NAME");
    const id = required("DECKO_HOSTED_D1_ID");
    let binding: D1DatabaseLike | undefined;
    prepare = async () => {
      binding ??= await openRemoteD1Binding(name, id);
    };
    connect = () => {
      if (binding === undefined) throw new Error("d1-binding: call open() before connect()");
      return new CloudflareD1Adapter(binding, { journal: D1_JOURNAL });
    };
  } else if (target === "libsql" || target === "bunny") {
    const url = required("DECKO_HOSTED_DB_URL");
    const authToken = process.env.DECKO_HOSTED_DB_TOKEN || undefined;
    connect = target === "libsql" ? () => new LibSqlHttpAdapter({ url, authToken }) : () => new BunnyDbDriver({ url, authToken });
  } else {
    throw new Error(`DECKO_HOSTED_TARGET must be d1-http, d1-binding, libsql or bunny, not ${target}`);
  }
  return {
    label: `hosted ${target}`,
    target,
    connect: () => connect(),
    open: async () => {
      await prepare();
      if (!firstOpenChecked) {
        const held = await userObjects(connect);
        if (held.length > 0 && process.env.DECKO_HOSTED_ALLOW_RESET !== "1") {
          throw new Error(
            `refusing to empty a database that holds ${held.length} tables, views or triggers; ` +
              "point the target at a throwaway database and set DECKO_HOSTED_ALLOW_RESET=1",
          );
        }
        firstOpenChecked = true;
      }
      await resetScratchDatabase(connect);
      return connect();
    },
  };
}

/** The slice of wrangler's getPlatformProxy used here, declared
 *  structurally: wrangler is an operator tool, not a dependency of this
 *  package. */
interface WranglerPlatformProxy {
  env: { DB: D1DatabaseLike };
  dispose: () => Promise<void>;
}
type WranglerGetPlatformProxy = (opts: { configPath: string }) => Promise<WranglerPlatformProxy>;

/** A real remote D1 binding from wrangler's getPlatformProxy. The database
 *  name and id arrive as environment variables and are written to a
 *  throwaway wrangler config, removed with the proxy after the file's
 *  tests; neither appears in a committed file. DECKO_HOSTED_WRANGLER_MODULE
 *  names the module to load (an install path, or "wrangler" when it
 *  resolves from here). */
async function openRemoteD1Binding(name: string, id: string): Promise<D1DatabaseLike> {
  const specifier = process.env.DECKO_HOSTED_WRANGLER_MODULE || "wrangler";
  const { getPlatformProxy } = (await import(specifier)) as { getPlatformProxy: WranglerGetPlatformProxy };
  const dir = mkdtempSync(join(tmpdir(), "decko-hosted-d1-"));
  try {
    const configPath = join(dir, "wrangler.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        name: "decko-hosted-conformance",
        main: "worker.js",
        compatibility_date: "2025-01-01",
        d1_databases: [{ binding: "DB", database_name: name, database_id: id, remote: true }],
      }),
    );
    const proxy = await getPlatformProxy({ configPath });
    afterAll(async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    }, 600_000);
    return proxy.env.DB;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

const OBJECTS_SQL =
  "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view', 'trigger') " +
  "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'";

async function userObjects(connect: () => SQLDatabaseDriver): Promise<{ type: string; name: string }[]> {
  return (await connect().query<{ type: string; name: string }>(OBJECTS_SQL, [])).rows.map((r) => ({
    type: String(r.type),
    name: String(r.name),
  }));
}

/** Drops every trigger, view and table except SQLite's and Cloudflare's
 *  internal ones, each statement through a new driver object from
 *  connect() (the D1 adapter remembers having seen its lock table, which
 *  this drops). Tables are dropped in passes, so an order forced by foreign
 *  keys resolves itself. */
export async function resetScratchDatabase(connect: () => SQLDatabaseDriver): Promise<void> {
  const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
  const order: Record<string, number> = { trigger: 0, view: 1, table: 2 };
  let lastError: unknown;
  for (let pass = 0; pass < 50; pass++) {
    const objects = await userObjects(connect);
    if (objects.length === 0) {
      await connect()
        .query("DELETE FROM sqlite_sequence", [])
        .catch(() => undefined);
      return;
    }
    objects.sort((a, b) => order[a.type] - order[b.type]);
    for (const o of objects) {
      try {
        await connect().query(`DROP ${o.type.toUpperCase()} IF EXISTS ${quote(o.name)}`, []);
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw new Error(`could not empty the scratch database: ${String(lastError)}`);
}
