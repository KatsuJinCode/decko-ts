// Save-timing entry for a Bunny Edge Script. Temporary measurement tool: it
// is deployed next to a scratch database, run once, and deleted.
//
// Routes:
//   GET /schema  loads the core schema (inlined at build time as SCHEMA_SQLITE)
//                and seeds the synthetic minimum deck. The database must be empty.
//   GET /timing  runs the seven measured saves and reports, per save:
//                round trips, total ms, and the transaction's own ms and round
//                trips, measured directly around the driver's transaction().
//
// The database URL and token arrive as the secrets BUNNY_DATABASE_URL and
// BUNNY_DATABASE_AUTH_TOKEN. Every HTTP round trip goes through countingFetch.
import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { CardActionEngine } from "../../src/card/actions/card-action-engine.js";
import { DeckoName } from "../../src/card/name.js";

declare const SCHEMA_SQLITE: string;
declare const process: { env: Record<string, string | undefined> };

let httpCalls = 0;
const countingFetch: typeof fetch = (input, init) => {
  httpCalls += 1;
  return fetch(input as string, init);
};

function newDriver(): BunnyDbDriver {
  const url = (process.env.BUNNY_DATABASE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.BUNNY_DATABASE_AUTH_TOKEN ?? "";
  return new BunnyDbDriver({ url, authToken: token, fetchImpl: countingFetch });
}

const TS = "2026-09-01 00:00:00.000";
const RICH = 2;
const CARDTYPE = 3;
const SET = 300;

/** Synthetic seed, column for column the one the action-layer tests use. */
async function seedCards(driver: BunnyDbDriver): Promise<void> {
  const insert = async (row: {
    id: number; name: string | null; codename?: string | null; leftId?: number | null;
    rightId?: number | null; typeId?: number; dbContent?: string | null;
  }) => {
    const compound = row.leftId !== undefined && row.leftId !== null;
    const parsed = row.name === null ? null : DeckoName.parse(row.name);
    await driver.query(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
         created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id,
         references_expired, trash, type_id, db_content)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
      [
        row.id,
        compound || parsed === null ? null : parsed.s,
        compound || parsed === null ? null : parsed.key,
        row.codename ?? null,
        row.leftId ?? null,
        row.rightId ?? null,
        TS,
        TS,
        row.typeId ?? RICH,
        row.dbContent ?? null,
      ],
    );
  };
  await insert({ id: RICH, name: "RichText", codename: "basic", typeId: CARDTYPE });
  await insert({ id: CARDTYPE, name: "Cardtype", codename: "cardtype", typeId: CARDTYPE });
  await insert({ id: 7, name: "*all", codename: "all", typeId: SET });
  await insert({ id: 8, name: "*default", codename: "default", typeId: CARDTYPE });
  await insert({ id: 9, name: null, leftId: 7, rightId: 8, typeId: RICH });
  await insert({ id: 50, name: "Pudding", dbContent: "v1" });
  await insert({ id: SET, name: "Set", codename: "set" });
  await insert({ id: 301, name: "*create", codename: "create" });
  await insert({ id: 302, name: "*update", codename: "update" });
  await insert({ id: 303, name: "*delete", codename: "delete" });
  await insert({ id: 304, name: "Anyone", codename: "anyone" });
  await insert({ id: 305, name: null, leftId: 7, rightId: 301, typeId: SET, dbContent: "[[Anyone]]" });
  await insert({ id: 306, name: null, leftId: 7, rightId: 302, typeId: SET, dbContent: "[[Anyone]]" });
  await insert({ id: 307, name: null, leftId: 7, rightId: 303, typeId: SET, dbContent: "[[Anyone]]" });
  for (const id of [305, 306, 307]) {
    await driver.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, 'anyone', ?, 'L', NULL)",
      [id, 304],
    );
  }
}

/** Splits the DDL into statements: quote-aware, `--` comments skipped, and
 *  a trigger body's inner semicolons kept. Same rules as the action-layer
 *  tests' loader (tests/card/fetch/fetch-test-storage.ts). */
function splitSqlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let inTriggerBody = false;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < ddl.length && /[A-Za-z0-9_]/.test(ddl[j])) j++;
      const word = ddl.slice(i, j).toUpperCase();
      if (!inTriggerBody && word === "BEGIN" && /CREATE\s+TRIGGER/i.test(current)) inTriggerBody = true;
      else if (inTriggerBody && word === "END") inTriggerBody = false;
      current += ddl.slice(i, j);
      i = j - 1;
      continue;
    }
    if (ch === ";") {
      if (inTriggerBody) {
        current += ch;
        continue;
      }
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((s) => s !== "");
}

async function loadSchema(driver: BunnyDbDriver): Promise<number> {
  let n = 0;
  for (const statement of splitSqlStatements(SCHEMA_SQLITE)) {
    if (/^\s*PRAGMA\b/i.test(statement)) {
      await driver.query(statement, []).catch(() => undefined);
      continue;
    }
    await driver.query(statement, []);
    n += 1;
  }
  return n;
}

const ACTOR = { id: 9, name: "Joe User" };
const IP = "192.0.2.7";
let ticks = 0;
const clock = () => new Date(Date.parse("2026-09-20T08:00:00.000Z") + ticks++ * 1000);

interface SaveTiming {
  label: string;
  roundTrips: number;
  totalMs: number;
  txMs: number;
  txRoundTrips: number;
  error?: string;
}

async function timeSave(
  label: string,
  driver: BunnyDbDriver,
  fetchEngine: FetchEngine,
  fn: (engine: CardActionEngine) => Promise<unknown>,
): Promise<SaveTiming> {
  const engine = new CardActionEngine(fetchEngine, { actor: ACTOR, ipAddress: IP, now: clock, integrationHooks: [] });
  const inner = driver.transaction.bind(driver);
  let txMs = 0;
  let txRoundTrips = 0;
  (driver as unknown as { transaction: <R>(w: () => Promise<R>) => Promise<R> }).transaction = async (work) => {
    const started = Date.now();
    const from = httpCalls;
    try {
      return await inner(work);
    } finally {
      txMs = Date.now() - started;
      txRoundTrips = httpCalls - from;
    }
  };
  const from = httpCalls;
  const started = Date.now();
  let error: string | undefined;
  try {
    await fn(engine);
  } catch (e) {
    error = String(e);
  }
  return {
    label,
    roundTrips: httpCalls - from,
    totalMs: Date.now() - started,
    txMs,
    txRoundTrips,
    ...(error !== undefined ? { error } : {}),
  };
}

async function timing(): Promise<{ saves: SaveTiming[] }> {
  const driver = newDriver();
  const fetchEngine = new FetchEngine(driver);
  const nonce = String(Date.now() % 1e9);
  const saves: SaveTiming[] = [];
  const run = (label: string, fn: (e: CardActionEngine) => Promise<unknown>) => timeSave(label, driver, fetchEngine, fn);
  saves.push(await run("create-plain", (e) => e.createCard({ name: `Probe Plain ${nonce}`, content: "hello plain" })));
  saves.push(await run("create-links", (e) => e.createCard({ name: `Probe Linker ${nonce}`, content: `see [[Pudding]] and [[Nowhere Yet ${nonce}]]` })));
  saves.push(await run("create-subcard", (e) => e.createCard({ name: `Probe Parent ${nonce}`, content: "parent body", subcards: { [`+Child ${nonce}`]: { content: "child body" } } })));
  saves.push(await run("update-content", (e) => e.updateCard({ cardId: 50, content: `v2 content ${nonce}` })));
  saves.push(await run("update-content-links", (e) => e.updateCard({ cardId: 50, content: `v3 with [[Probe Plain ${nonce}]]` })));
  saves.push(await run("update-rename", (e) => e.updateCard({ cardId: 50, name: `Pudding Renamed ${nonce}` })));
  saves.push(await run("update-noop", (e) => e.updateCard({ cardId: 50, content: `v3 with [[Probe Plain ${nonce}]]` })));
  return { saves };
}

async function seed(): Promise<{ statements: number; cards: number }> {
  const driver = newDriver();
  const statements = await loadSchema(driver);
  await seedCards(driver);
  const count = await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM cards", []);
  return { statements, cards: Number(count.rows[0]?.n ?? 0) };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

BunnySDK.net.http.serve(async (request: Request) => {
  const { pathname } = new URL(request.url);
  try {
    if (pathname === "/schema") return json(await seed());
    if (pathname === "/timing") return json(await timing());
    return new Response("ok");
  } catch (error) {
    return json({ error: String(error), stack: (error as Error)?.stack?.split("\n").slice(0, 6) }, 500);
  }
});
