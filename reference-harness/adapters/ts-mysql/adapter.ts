// The decko-ts adapter on MySQL: the adapters/ts adapter with the engine
// served from a real MySQL 8.4 server instead of the deck's SQLite file. Ruby
// Decko's own MySQL schema is created first (db/schema.mysql-reference.sql),
// the deck file's rows are loaded into it, and openSameDatabase adds the
// port's objects exactly as any Node host opening a MySQL deck does. MySQL's
// tables are copied back over the file after every step that wrote, so the
// grader's persistence checks read the state the engine left in MySQL
// (mysql-mirror.ts). Everything else is the adapters/ts adapter.
//
// Every answer comes from an engine entry point (RenderEngine, FetchEngine,
// CardActionEngine, the permission and CQL modules, the sign-in module); this
// file only routes requests and shapes results.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { MysqlDriver } from "../../../src/server/drivers/mysql.js";
import { openSameDatabase } from "../../../src/server/same-database.js";
import { copyMysqlIntoSqlite, loadSqliteIntoMysql, WriteTrackingDriver } from "./mysql-mirror.js";
import { mysqlForHarness } from "./mysql-start.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { getDefaultModLoader } from "../../../src/card/mod-loader.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { setRaiseAllRenderingErrors } from "../../../src/card/render/format.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { CreateCardInput, UpdateCardInput } from "../../../src/card/actions/types.js";
import { DeckoName } from "../../../src/card/name.js";
import type { CardRecord } from "../../../src/card/fetch/card-record.js";
import { createVirtualCardLookup } from "../../../src/card/fetch/virtual-cards.js";
import {
  structureRuleUniverseStatement,
  structureRuleTypesFromResults,
  structureUniverseFromResults,
} from "../../../src/card/rules/structure.js";
import { setCaptureWallClock } from "../../../src/card/wall-clock.js";
import { setDeckEnvironment } from "../../../src/card/render/deck-origin.js";
import {
  deckoBotAccountEmail,
  observedModEventRuntime,
  jsonErrorsViewHash,
} from "../../../src/server/write-routes.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { findRule } from "../../../src/card/rules/lookup.js";
import { patternsForCard } from "../../../src/card/set-patterns/card-patterns.js";
import { settingCardNameForCode } from "../../../src/card/set-patterns/rule-names.js";
import type { PatternCardInput } from "../../../src/card/set-patterns/types.js";
import { ruleWalkPatternInput } from "../../../src/card/actions/rule-content-walk.js";
import {
  canReadByStoredRule,
  readPermissionStateFromViewerResults,
  readPermissionStatements,
  type ReadPermissionState,
  type ReadViewer,
} from "../../../src/card/permissions/read-rules.js";
import {
  allTaskVerdictsForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
} from "../../../src/card/permissions/view-task-rules.js";
import { readPermissionOverride, updatePermissionOverride } from "../../../src/card/permissions/read-override.js";
import { executeCount, executeQuery, parseOptionsWithLexicon } from "../../../src/cql/execute.js";
import { CaptureTransport } from "../../../src/card/notify/transport.js";
import { authenticateAccount } from "../../../src/card/auth/signin.js";
import { actorBot } from "../../../src/card/auth/actor.js";
import { setPreparedSetupVerdict } from "../../../src/card/auth/first-run-setup-verdict-seam.js";
import { applyDeckInflections } from "../../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../../src/card/name/oracle-deck-inflections.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Req = Record<string, any>;

const spec = JSON.parse(readFileSync(process.env.HARNESS_DECK_JSON!, "utf8"));
// The synthetic deck is Ruby-built: every account's stored password is
// Ruby's salted SHA-1 (the legacy scheme Ruby itself writes), so the
// adapter pins that storage policy — under the port's modern default a
// sign-in would upgrade the row to PBKDF2 and write a row Ruby never
// writes. Set before any account machinery loads.
process.env.DECKO_PASSWORD_HASH = "legacy-sha1";
// The engine ships stock Decko's inflection rules (card 1.110.0
// config/initializers/inflections.rb) under this name; every stock deck uses
// them, so they are installed before any name is parsed.
applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
const clock = new Date(spec.clock);
setCaptureWallClock(clock);
setDeckEnvironment({
  origin: spec.environment?.origin,
  defaultHtmlView: spec.environment?.default_html_view,
});
// The capture contract (the fixtures' MANIFEST "production render-error
// semantics" line): Cardio.config.raise_all_rendering_errors = false with
// Rails.env production - nested view errors render inline, no debug detail.
setRaiseAllRenderingErrors(false);

const out = process.stdout;
const emit = (obj: unknown): void => {
  out.write(JSON.stringify(obj) + "\n");
};
// Engine diagnostics never reach the protocol stream.
console.log = (...args: unknown[]) => process.stderr.write(args.map(String).join(" ") + "\n");
console.info = console.log;
console.warn = console.log;

const deckFile = new LocalSqliteDriver({ path: process.env.HARNESS_DECK!, readonly: false });
// The render engine's freshness stamp is a port-only table.
await deckFile.query(
  `CREATE TABLE IF NOT EXISTS "deck_data_version" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0)`,
  [],
);
await deckFile.query(`INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)`, []);
// A fresh database on the real MySQL server, one per adapter process.
const server = await mysqlForHarness();
const database = `harness_${process.pid}`;
const admin = await server.connect();
await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci`);
await admin.end();
const mysql = await MysqlDriver.connect({ port: server.port, database });
await loadSqliteIntoMysql(deckFile, mysql);
// The deck is the database Ruby built, opened as it is: the port's objects
// are added additively (same-database.ts), as on any MySQL deck.
await openSameDatabase(mysql);
const driver = new WriteTrackingDriver(mysql);

// THE GRADED CONFIGURATION IS THE SERVED CONFIGURATION.
//
// The harness grades the engine the way the product boots it, so the deck's
// mods are loaded here exactly as both edge hosts load them:
// bootCorpusDeckEngines (deploy/bunny-worker-src/bunny-edge-deck-boot.ts:114)
// calls defaultDeckLoader() once per isolate, before any RenderEngine is
// constructed, and RenderEngine's constructor reads the process-wide default
// loader for its view dispatch (src/card/render.ts:929). Without this line the
// adapter's RenderEngine bound an undefined loader, every render resolved
// through the compiled base view table alone, and a grade taken that way
// measured a configuration the product never serves - it reported a clean
// 100% on a rendering surface that is not the rendering surface.
//
// Bound once, guarded, for the same reason the edge boot guards it: a second
// defaultDeckLoader() call rebinds to a FRESH loader (reload semantics,
// default-mod-deck.ts:189), and this module re-boots after every write
// (boot() below). DEBUGGING ONLY: DECKO_HARNESS_MOD_LOADER=off unbinds the
// mods so a divergence can be attributed to the loader rather than to the
// engine underneath it. It is not a graded configuration - a run taken with it
// off is a diagnosis, never a grade.
if (process.env.DECKO_HARNESS_MOD_LOADER !== "off" && getDefaultModLoader() === undefined) {
  defaultDeckLoader();
}

// ---- engine state, rebuilt after every write ---------------------------------
let fetcher: FetchEngine;
const engines = new Map<string, RenderEngine>();

async function boot(): Promise<void> {
  fetcher = new FetchEngine(driver);
  fetcher.installNameEnvironment();
  const ids = (await driver.query<{ id: number }>("SELECT id FROM cards WHERE trash = 0", [])).rows.map((r) =>
    Number(r.id),
  );
  await fetcher.warmLexicon(ids);
  const [universe] = await driver.batch([structureRuleUniverseStatement()]);
  fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
    contents: structureUniverseFromResults(universe),
    ruleTypeIds: structureRuleTypesFromResults(universe),
  });
  // The setup view's perms predicate census (Card::Auth.needs_setup?,
  // auth/setup.rb:33-40 user_account_count.zero?) — the sync view gate
  // reads the prepared verdict seam; this adapter boot is the producer.
  await prepareSetupVerdictSeam();
  engines.clear();
}

/** The raw census, without the first-run deploy gates (the seam's contract:
 *  Ruby's view gate is purely the census). The predicate is Ruby's OWN
 *  (auth/setup.rb:44-49 user_account_cql): every +*account junction whose
 *  CREATOR is not DeckoBot — the synthetic decks seed every junction
 *  (holders included) with creator_id = the bot, so the holder-side
 *  exclusion the deploy census uses would miscount them as real accounts. */
async function prepareSetupVerdictSeam(): Promise<void> {
  try {
    const [bot, accountRow] = await Promise.all([
      actorBot(driver),
      driver.query<{ id: number }>(
        "SELECT id FROM cards WHERE codename = 'account' AND trash = 0 ORDER BY id LIMIT 1",
        [],
      ),
    ]);
    const accountId = accountRow.rows[0]?.id;
    if (accountId === undefined) {
      setPreparedSetupVerdict({ open: false, accountCount: undefined });
      return;
    }
    const result = await driver.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM cards
       WHERE right_id = ? AND trash = 0 AND (creator_id IS NULL OR creator_id != ?)`,
      [accountId, bot.id],
    );
    const count = Number(result.rows[0]?.n ?? 0);
    setPreparedSetupVerdict({ open: count === 0, accountCount: count });
  } catch {
    setPreparedSetupVerdict({ open: false });
  }
}

async function actorRecord(actor: string | undefined): Promise<CardRecord | undefined> {
  const cardName = actor === undefined || actor === "anonymous" ? "Anonymous" : spec.actors?.[actor]?.card;
  if (cardName === undefined) throw new Error(`unknown actor ${actor}`);
  return fetcher.fetchByName(cardName);
}

async function viewerFor(actor: string | undefined): Promise<ReadViewer> {
  if (actor === undefined || actor === "anonymous") {
    const anon = await actorRecord("anonymous");
    return { signedIn: false, actorId: anon?.id };
  }
  const rec = await actorRecord(actor);
  if (rec === undefined) throw new Error(`actor card missing for ${actor}`);
  return { signedIn: true, actorId: rec.id };
}

async function engineFor(actor: string | undefined): Promise<RenderEngine> {
  const key = actor ?? "anonymous";
  let engine = engines.get(key);
  if (engine === undefined) {
    engine = new RenderEngine(fetcher);
    // A render request names any card, present or not, as a request does.
    engine.renderAbsentCards = true;
    const viewer = await viewerFor(actor);
    engine.viewer = viewer;
    engine.pageSession = viewer.signedIn ? viewer : undefined;
    engines.set(key, engine);
  }
  return engine;
}

async function nameOf(rec: CardRecord): Promise<string> {
  if (rec.leftId !== undefined && rec.leftId !== null && rec.rightId !== undefined && rec.rightId !== null) {
    const composed = await fetcher.lexicon.composeName(rec.leftId, rec.rightId);
    if (composed !== undefined) return composed.s;
  }
  const raw = rec.name as unknown;
  return raw instanceof DeckoName ? raw.s : String(raw ?? "");
}

async function liveRecord(name: string): Promise<CardRecord | undefined> {
  const rec = await fetcher.fetchByName(name);
  return rec === undefined || rec.trash || rec.isNew ? undefined : rec;
}

async function patternInput(name: string): Promise<PatternCardInput> {
  const rec = await liveRecord(name);
  return ruleWalkPatternInput(fetcher, {
    name: DeckoName.parse(rec === undefined ? name : await nameOf(rec)),
    id: rec?.id,
    isNew: rec === undefined,
    typeId: rec?.typeId ?? null,
  } as never);
}

// ---- render -------------------------------------------------------------------
async function opRender(req: Req): Promise<Json> {
  const engine = await engineFor(req.actor);
  // The recorder resets Card::Env before every request (harness_env.rb
  // begin_request!), so each recorded render ran on a fresh session: the
  // +*enabled_roles card the roles dropdown fills is blank again, and the
  // edit_inline form's content input renders blank. The engine cache here
  // is a boot-cost cache, not a session; each render re-signs in.
  engine.resetRequestSession();
  const html = req.view ? await engine.render(req.card, req.view) : await engine.renderPage(req.card);
  return { html };
}

// ---- ask --------------------------------------------------------------------------
async function permissionState(actor: string | undefined): Promise<{ read: ReadPermissionState; task: ViewTaskState }> {
  const viewer = await viewerFor(actor);
  const read = readPermissionStateFromViewerResults((await driver.batch(readPermissionStatements(viewer))) as never, viewer);
  const task = viewTaskStateFromResults((await driver.batch(viewTaskPermissionStatements())) as never, read);
  return { read, task };
}

async function opAsk(req: Req): Promise<Json> {
  switch (req.q) {
    case "card": {
      const rec = await liveRecord(req.card);
      if (rec === undefined) return { exists: false };
      const name = DeckoName.parse(await nameOf(rec));
      const type = rec.typeId == null ? undefined : await fetcher.fetchById(rec.typeId);
      const readRule = rec.readRuleId == null ? undefined : await fetcher.fetchById(rec.readRuleId);
      return {
        exists: true,
        id: rec.id,
        name: name.s,
        key: rec.key ?? name.key,
        type: type === undefined ? "" : await nameOf(type),
        codename: rec.codename ?? null,
        left: name.isSimple ? null : name.leftName!.s,
        right: name.isSimple ? null : name.rightName!.s,
        read_rule: readRule === undefined ? null : await nameOf(readRule),
      };
    }
    case "permissions": {
      const { read, task } = await permissionState(req.actor);
      const input = await patternInput(req.card);
      const rec = await liveRecord(req.card);
      const viewerRec = await actorRecord(req.actor);
      const viewerKey = viewerRec?.key ?? undefined;
      let readOk: boolean;
      if (read.alwaysOk) readOk = true;
      else if (rec === undefined) {
        const engine = await engineFor(req.actor);
        readOk = await engine.canReadCard({ name: DeckoName.parse(req.card), isNew: true } as never);
      } else {
        const override = await readPermissionOverride(DeckoName.parse(await nameOf(rec)), {
          viewerKey,
          fetchByKey: (key) => fetcher.fetchByKey(key),
          fetchById: (id) => fetcher.fetchById(id),
          leftReadVerdict: async (leftName) => {
            const left = await fetcher.fetchByName(leftName.s);
            return left?.readRuleId == null ? undefined : canReadByStoredRule(left.readRuleId, read);
          },
        });
        readOk = override ?? (rec.readRuleId == null ? false : canReadByStoredRule(rec.readRuleId, read));
      }
      const verdicts = await allTaskVerdictsForCard(fetcher, input, task);
      let update = verdicts.update ?? false;
      if (!task.alwaysOk) {
        const override = await updatePermissionOverride(DeckoName.parse(String(input.name)), {
          viewerKey,
          fetchByKey: (key) => fetcher.fetchByKey(key),
          fetchById: (id) => fetcher.fetchById(id),
        });
        if (override !== undefined) update = override;
      }
      return { read: !!readOk, create: !!verdicts.create, update: !!update, delete: !!verdicts.delete };
    }
    case "set_names":
      return { sets: patternsForCard(await patternInput(req.card)).map((p) => p.setName) };
    case "rule": {
      const found = await findRule(fetcher, await patternInput(req.card), settingCardNameForCode(req.setting));
      return { rule: found === undefined ? null : await nameOf(found.rule) };
    }
    case "search": {
      const engine = await engineFor(req.actor);
      const options = { parse: parseOptionsWithLexicon(fetcher.lexicon), ...(await engine.cqlPermissionOptions()) };
      const query = req.query as Record<string, unknown>;
      if (query.return === "count") return { count: await executeCount(driver, query, options) };
      const result = await executeQuery(driver, { ...query, return: "name" }, options);
      if ("count" in result) return { count: result.count as number };
      const names: string[] = [];
      for (const row of result.rows as unknown as Array<{ name: string | null; left_id: number | null; right_id: number | null }>) {
        if (row.left_id != null) names.push((await fetcher.lexicon.composeName(row.left_id, row.right_id!))?.s ?? "");
        else names.push(row.name ?? "");
      }
      return { names };
    }
    case "name": {
      const n = DeckoName.parse(req.name);
      return {
        s: n.s,
        key: n.key,
        url_key: n.urlKey,
        parts: n.parts,
        simple: n.isSimple,
        left: n.isSimple ? null : n.left,
        right: n.isSimple ? null : n.right,
        trunk: n.trunk,
        tag: n.tag,
      } as Json;
    }
    default:
      throw new Error(`unknown question ${req.q}`);
  }
}

// ---- write -----------------------------------------------------------------------
async function opWrite(req: Req): Promise<Json> {
  const actorRec = await actorRecord(req.actor);
  const actor =
    req.actor === undefined || req.actor === "anonymous" ? null : { id: actorRec!.id, name: await nameOf(actorRec!) };
  const transport = new CaptureTransport("harness");
  // The deck's own event composition rides every save, composed exactly as
  // the serving write path composes it (observedModEventRuntime: the deck's
  // declarations PLUS the type-set resolver — without it every type-scoped
  // event, the Number cardtype's validate_number among them, skips
  // "set-not-applicable"). followMail carries the deck origin and the Decko
  // Bot address the follower emails render their links, unfollow URL and
  // From rule from; absent, every nest renders as its bare "_" placeholder.
  const engine = new CardActionEngine(fetcher, {
    actor,
    ipAddress: null,
    now: () => clock,
    notifyTransport: transport,
    modEvents: await observedModEventRuntime({ driver }),
    followMail: {
      origin: spec.environment?.origin ?? "http://deck.example",
      deckoBotEmail: await deckoBotAccountEmail(driver),
    },
  });
  const fields = (req.fields ?? {}) as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  if (fields.type !== undefined) input.typeName = fields.type;
  if (fields.content !== undefined) input.content = fields.content;
  if (fields.fields !== undefined) {
    input.subcards = Object.fromEntries(
      Object.entries(fields.fields as Record<string, unknown>).map(([k, v]) => [k, { content: String(v) }]),
    );
  }
  let saved = true;
  let errors: Json[] = [];
  let card: Json = null;
  try {
    let result: unknown;
    if (req.action === "create") {
      result = await engine.createCard({ name: req.card, ...input } as CreateCardInput);
    } else {
      const rec = await liveRecord(req.card);
      if (rec === undefined) throw new Error(`no such card ${req.card}`);
      if (req.action === "update") {
        if (fields.name !== undefined) input.name = fields.name;
        result = await engine.updateCard({ cardId: rec.id, ...input } as UpdateCardInput);
      } else if (req.action === "delete") {
        result = await engine.deleteCard({ cardId: rec.id });
      } else throw new Error(`unknown write action ${req.action}`);
    }
    const id =
      (result as { cardId?: number })?.cardId ?? (result as { card?: { id?: number } })?.card?.id ?? undefined;
    if (id !== undefined) {
      await boot();
      // A delete's payload card is the TRASHED card (Ruby's payload carries
      // it; the row only carries the trash flag) — fetch past the trash.
      const rec = await fetcher.fetchById(id, { lookInTrash: true });
      card = rec === undefined ? null : { name: await nameOf(rec), id };
    }
  } catch (error) {
    saved = false;
    // The errors view's shape (card-mod-format set/all/error.rb format :json
    // view :errors): {attribute => message}. The engine's denial wording is
    // internal; Ruby words a refusal "You don't have permission to <task>
    // <card>" and keys it :permission_denied; the guard keys :recaptcha; a
    // duplicate name keys :name with the core_error_name_exists text. A
    // refused save still answers with the card when it exists on
    // updates/deletes (Ruby's payload carries it there) — a refused CREATE
    // carries NO card: the name the request targeted either exists untouched
    // or never existed, and Ruby's payload is empty either way.
    const e = error as Error & {
      code?: string;
      field?: string;
      errorsByAttribute?: Record<string, string>;
    };
    const task = req.action === "delete" ? "delete" : String(req.action ?? "update");
    if (e.errorsByAttribute !== undefined && Object.keys(e.errorsByAttribute).length > 0) {
      errors = Object.entries(e.errorsByAttribute).map(([field, message]) => ({ field, message }));
    } else if (e.code === "permission-denied" || e.code === "anonymous-actor") {
      errors = [{ field: "permission_denied", message: `You don't have permission to ${task} ${req.card}` }];
    } else if (e.code === "recaptcha") {
      errors = [{ field: "recaptcha", message: e.message }];
    } else if (e instanceof CardActionError) {
      // The JSON errors view's own reading (write-routes jsonErrorsViewHash):
      // the shown "KEY: message" lines read back as {attribute => message}
      // ("NAME: must be unique; ..." -> {name: "must be unique; ..."},
      // "CONTENT: 'x' is not numeric" -> {content: "'x' is not numeric"}).
      const hash = jsonErrorsViewHash(e, true);
      const entries = Object.entries(hash);
      if (entries.length > 0) {
        errors = entries.map(([field, message]) => ({ field, message }));
      } else {
        errors = [{ field: String(e.code), message: e.message }];
      }
    } else if (Array.isArray((e as { errors?: unknown[] }).errors)) {
      const list = (e as { errors: Array<{ field?: string; message?: string }> }).errors;
      errors = list.map((x) => ({ field: String(x.field ?? ""), message: String(x.message ?? "") }));
    } else if (e.code !== undefined) {
      errors = [{ field: e.code, message: e.message }];
    } else {
      errors = [{ field: "exception", message: `${e.constructor?.name ?? "Error"}: ${e.message}` }];
    }
    const denied = req.action === "create" ? undefined : await liveRecord(req.card).catch(() => undefined);
    card =
      denied === undefined
        ? null
        : { name: await nameOf(denied), id: denied.id };
  }
  await boot();
  const mail = transport.captured().map((m) => ({
    to: String(m.to).split(",").map((s) => s.trim()).filter(Boolean).sort(),
    subject: m.subject,
    text: m.textBody,
  }));
  return { saved, errors, card, mail } as Json;
}

// ---- sign in -----------------------------------------------------------------------
async function opSignin(req: Req): Promise<Json> {
  const result = await authenticateAccount(driver, String(req.email ?? ""), String(req.password ?? ""));
  if (result.ok) return { signed_in: true, actor: result.account.holder.name };
  return { signed_in: false, actor: "Anonymous" };
}

/** Copies MySQL's tables over the deck file after a step that wrote. */
async function syncDeckFile(): Promise<void> {
  if (!driver.dirty) return;
  await copyMysqlIntoSqlite(mysql, deckFile);
  driver.dirty = false;
}

const HANDLERS: Record<string, (req: Req) => Promise<Json>> = {
  render: opRender,
  ask: opAsk,
  write: opWrite,
  signin: opSignin,
};

await boot();
emit({ ready: true, protocol: 1, engine: "decko-ts", version: { package: "decko-ts" } });

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  if (line.trim() === "") continue;
  const req = JSON.parse(line) as Req;
  if (req.op === "quit") break;
  try {
    const handler = HANDLERS[req.op];
    if (handler === undefined) throw new Error(`unknown op ${req.op}`);
    const result = await handler(req);
    await syncDeckFile();
    emit({ id: req.id, ok: true, result });
  } catch (error) {
    await syncDeckFile();
    const e = error as Error;
    emit({ id: req.id, ok: false, error: { class: e?.constructor?.name ?? "Error", message: String(e?.message ?? e).slice(0, 500) } });
  }
}
await driver.close();
deckFile.close();
process.exit(0);
