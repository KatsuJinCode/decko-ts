// THE TYPESCRIPT ENGINE, semantics lane.
//
// Reads the SAME question set the Ruby oracle answered (tools/oracle/
// semantics-answer.rb, semantics-answer-wave2.rb) and answers every id in the
// same shape, from the same key-repaired deck. The comparator diffs the files.
//
// Every answer comes from an engine entry point, not from logic in this file:
//   pattern input        ruleWalkPatternInput (the action engine's rule walk)
//   set patterns         safeSetKeysForCard / patternsForCard / ...
//   rule lookup          findRule
//   read verdicts        RenderEngine#canReadCard (anonymous), canReadByStoredRule
//                        over the per-actor read state (role_permissions)
//   write verdicts       allTaskVerdictsForCard
//   CQL                  executeQuery / executeCount with the engine's own
//                        permission options
//   new-card type        RenderEngine#newCardDefaultType
//   views and events     the default mod deck (defaultDeckLoader)
//
// Two questions read inputs from the Ruby wave-2 answers (SEMANTICS_RUBY_WAVE2):
// role_permissions takes the member Ruby chose for each role, and
// inflection_rows takes the rows Ruby found. Both are deck facts, not answers.
//
// Boot is the graded one: createRawStructureSeededStorage (the committed
// seeding module), installNameEnvironment, warmLexicon.

import { readFileSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { createRawStructureSeededStorage, RAW_CORPUS_DB } from "../../tests/card/render/raw-corpus-seeding.js";
import { DeckoName } from "../../src/card/name.js";
import type { CardRecord } from "../../src/card/fetch/card-record.js";
import { findRule } from "../../src/card/rules/lookup.js";
import {
  concretePatternsForCard,
  patternsForCard,
  ruleLookupKeysForCard,
  safeSetKeysForCard,
} from "../../src/card/set-patterns/card-patterns.js";
import { settingCardNameForCode } from "../../src/card/set-patterns/rule-names.js";
import type { PatternCardInput } from "../../src/card/set-patterns/types.js";
import {
  readPermissionStateFromViewerResults,
  readPermissionStatements,
  anonymousIdFromResults,
  canReadByStoredRule,
  type ReadPermissionState,
  type ReadViewer,
} from "../../src/card/permissions/read-rules.js";
import {
  viewTaskStateFromResults,
  viewTaskPermissionStatements,
  allTaskVerdictsForCard,
  type ViewTaskState,
} from "../../src/card/permissions/view-task-rules.js";
import { parseOptionsWithLexicon, executeQuery, executeCount } from "../../src/cql/execute.js";
import { ruleWalkPatternInput } from "../../src/card/actions/rule-content-walk.js";
import { defaultDeckLoader } from "../../src/card/mod-loader/default-mod-deck.js";
import { HTML_VIEWS } from "../../src/card/render/views.js";

const QUESTIONS = JSON.parse(readFileSync(process.env.SEMANTICS_QUESTIONS!, "utf8"));
const OUT_PATH = process.env.SEMANTICS_ANSWERS!;
const RUBY_WAVE2 = process.env.SEMANTICS_RUBY_WAVE2
  ? JSON.parse(readFileSync(process.env.SEMANTICS_RUBY_WAVE2, "utf8")).answers
  : {};
const ONLY = process.env.SEMANTICS_ONLY_KINDS
  ? new Set(process.env.SEMANTICS_ONLY_KINDS.split(","))
  : undefined;

// ---------------------------------------------------------------- the engine

const raw = new Database(RAW_CORPUS_DB, { readonly: true });
const liveIds = (raw.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>)
  .map((r) => r.id);

const storage = await createRawStructureSeededStorage(new Set(liveIds));
const fetcher = storage.fetcher;
const engine = storage.engine;
fetcher.installNameEnvironment();
await fetcher.warmLexicon(liveIds);

const codenameIds = new Map<string, number>(
  (raw.prepare("SELECT id, codename FROM cards WHERE codename IS NOT NULL AND codename <> ''").all() as Array<{
    id: number;
    codename: string;
  }>).map((r) => [r.codename, r.id]),
);

/** Read state and write-task state for one viewer: the two batches
 *  RenderEngine issues. */
async function permissionStateFor(viewer: ReadViewer): Promise<{ read: ReadPermissionState; task: ViewTaskState }> {
  const read = readPermissionStateFromViewerResults(
    (await fetcher.driver.batch(readPermissionStatements(viewer))) as never,
    viewer,
  );
  const task = viewTaskStateFromResults(
    (await fetcher.driver.batch(viewTaskPermissionStatements())) as never,
    read,
  );
  return { read, task };
}

const firstBatch = (await fetcher.driver.batch(readPermissionStatements())) as never[];
const anonymousId = anonymousIdFromResults(firstBatch as never);
const anonymous = await permissionStateFor({ signedIn: false, actorId: anonymousId });

async function nameOfRecord(id: number): Promise<string | undefined> {
  const rec = await fetcher.fetchById(id);
  return rec === undefined ? undefined : nameForRecord(rec);
}

/** A record's full name, rebuilt from left_id/right_id (compound rows store
 *  name NULL; Ruby's Card#name does the same walk). Always a plain string. */
async function nameForRecord(rec: CardRecord): Promise<string> {
  const rawName = rec.name as unknown;
  if (rawName !== undefined && rawName !== null && rec.leftId === undefined) {
    return rawName instanceof DeckoName ? rawName.s : String(rawName);
  }
  if (rec.leftId !== undefined && rec.rightId !== undefined) {
    const left = await nameOfRecord(rec.leftId);
    const right = await nameOfRecord(rec.rightId);
    if (left !== undefined && right !== undefined) return `${left}+${right}`;
  }
  if (rawName instanceof DeckoName) return rawName.s;
  if (rawName !== undefined && rawName !== null) return String(rawName);
  return rec.codename ?? "";
}

async function typeNameOf(rec: CardRecord): Promise<string> {
  if (rec.typeId === undefined || rec.typeId === null) return "";
  const t = await fetcher.fetchById(rec.typeId);
  return t === undefined ? "" : await nameForRecord(t);
}

/** The engine's own pattern input for a stored card. */
async function patternInputFor(rec: CardRecord): Promise<PatternCardInput> {
  return ruleWalkPatternInput(fetcher, {
    name: DeckoName.parse(await nameForRecord(rec)),
    id: rec.id,
    isNew: false,
    typeId: rec.typeId ?? null,
  });
}

// ------------------------------------------------------------------ helpers

function errText(e: unknown): string {
  if (e instanceof Error) return `ERR:${e.constructor.name}:${e.message.slice(0, 120)}`;
  return `ERR:${String(e).slice(0, 120)}`;
}
async function safe<T>(fn: () => Promise<T> | T): Promise<T | string> {
  try {
    return await fn();
  } catch (e) {
    return errText(e);
  }
}

/** Name algebra, engine-neutral: derived from the name string alone. */
function nameAlgebra(s: string): Record<string, unknown> {
  const n = DeckoName.parse(s);
  const one = (fn: () => unknown): unknown => {
    try {
      return fn();
    } catch (e) {
      return errText(e);
    }
  };
  return {
    s: n.s,
    key: n.key,
    parts: n.parts,
    num_parts: n.numParts,
    trunk: one(() => n.trunk),
    tag: one(() => n.tag),
    left: n.left,
    right: n.right,
    stripped: one(() => n.stripped.s),
    fully_stripped: one(() => n.fullyStripped.s),
    url_key: one(() => n.urlKey),
    simple: n.isSimple,
    compound: n.isCompound,
    relative: one(() => n.isRelative),
    absolute: one(() => n.isAbsolute),
    starts_with_joint: n.startsWithJoint,
    star: n.isStar,
    rstar: one(() => n.isRStar),
  };
}

async function writeVerdicts(
  input: PatternCardInput,
  task: ViewTaskState,
): Promise<{ create: unknown; update: unknown; delete: unknown }> {
  const verdicts = await safe(() => allTaskVerdictsForCard(fetcher, input, task));
  if (typeof verdicts === "string") return { create: verdicts, update: verdicts, delete: verdicts };
  return {
    create: verdicts.create ?? null,
    update: verdicts.update ?? null,
    delete: verdicts.delete ?? null,
  };
}

const cqlOptions = async () => ({
  parse: parseOptionsWithLexicon(fetcher.lexicon),
  ...(await engine.cqlPermissionOptions()),
});

async function cqlNames(query: Record<string, unknown>): Promise<string[] | string> {
  return safe(async () => {
    const r = await executeQuery(fetcher.driver, { ...query, return: "name" }, await cqlOptions());
    if ("count" in r) return `ERR:count-result-for-name-query`;
    // return: "name" projects name, left_id, right_id (SqlStatement#full_field);
    // the name is the stored simple name or Lexicon.lex_to_name of the sides,
    // as Ruby's Query::Run does for the same rows.
    const out: string[] = [];
    for (const row of r.rows as unknown as Array<{ name: string | null; left_id: number | null; right_id: number | null }>) {
      if (row.left_id !== null && row.left_id !== undefined) {
        const composed = await fetcher.lexicon.composeName(row.left_id, row.right_id);
        out.push(composed === undefined ? "" : composed.s);
      } else {
        out.push(row.name ?? "");
      }
    }
    return out;
  });
}

// The mod deck, booted once (views and events).
// The engine-native flat views (render/views.ts HTML_VIEWS) answer on every
// set; snapshot their names before the mod deck registers into the same record.
const engineFlatViews = new Set(Object.keys(HTML_VIEWS));
const loader = defaultDeckLoader();
const tsViewNames = Object.keys(loader.viewsTable()).sort();

// The engine's new-card type walk needs the *default and *structure
// universes loaded; one render loads them (the same first-render path).
let engineWarm = false;
async function warmEngine(): Promise<void> {
  if (engineWarm) return;
  await engine.render("*all", "core");
  engineWarm = true;
}

/** Event applicability through the set-module path the registry records:
 *  all/* applies to every card (event/all.rb set_condition_applies?); a
 *  pattern/anchor path applies when its token is in the card's set keys;
 *  abstract/* modules apply only through include_set, which the registry
 *  does not record, so those are reported as undecidable. */
function eventApplies(setPath: string, tokens: Set<string>): boolean | "abstract" {
  const parts = setPath.split("/");
  const pattern = parts[0] ?? "";
  if (pattern === "all") return true;
  if (pattern === "abstract") return "abstract";
  const anchor = parts.slice(1).join("-");
  return tokens.has(`${pattern.toUpperCase()}-${anchor}`);
}

// ------------------------------------------------------------------ answers

const answers: Record<string, unknown> = {};

for (const question of QUESTIONS.questions) {
  const id = String(question.id);
  const kind = question.kind as string;
  if (ONLY !== undefined && !ONLY.has(kind)) continue;
  const payload = question.payload as Record<string, never>;
  let answer: unknown;

  switch (kind) {
    case "counts": {
      const n = (sql: string, ...p: unknown[]) => (raw.prepare(sql).get(...p) as { n: number }).n;
      const typed = (code: string) => {
        const tid = codenameIds.get(code);
        return tid === undefined ? -1 : n("SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = ?", tid);
      };
      answer = {
        live: n("SELECT count(*) n FROM cards WHERE trash = 0"),
        trashed: n("SELECT count(*) n FROM cards WHERE trash = 1"),
        total: n("SELECT count(*) n FROM cards"),
        cardtypes: typed("cardtype"),
        sets: typed("set"),
        settings: typed("setting"),
        roles: typed("role"),
        users: typed("user"),
      };
      break;
    }

    case "live_ids":
      answer = liveIds;
      break;

    case "cards": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      const out: unknown[] = [];
      for (const row of rows) {
        const c = await fetcher.fetchById(row.id);
        if (c === undefined) {
          out.push({ id: row.id, missing: true });
          continue;
        }
        out.push({
          id: c.id,
          name: await nameForRecord(c),
          key: c.key,
          type: await typeNameOf(c),
          codename: c.codename ?? "",
          trash: c.trash === true,
        });
      }
      answer = out;
      break;
    }

    case "rule_cards": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      const out: unknown[] = [];
      for (const row of rows) {
        const c = await fetcher.fetchById(row.id);
        if (c === undefined) {
          out.push({ id: row.id, missing: true });
          continue;
        }
        const name = DeckoName.parse(await nameForRecord(c));
        const input = await patternInputFor(c);
        const sideName = async (sid: number | undefined | null) => {
          if (sid === undefined || sid === null) return null;
          const s = await fetcher.fetchById(sid);
          return s === undefined ? null : await nameForRecord(s);
        };
        out.push({
          id: c.id,
          name: name.s,
          key: c.key,
          left: await safe(() => sideName(c.leftId)),
          right: await safe(() => sideName(c.rightId)),
          trunk: await safe(() => name.trunk),
          tag: await safe(() => name.tag),
          // The engine carries standard_rule? only (set-read-rule.ts: the
          // preference? stream is not ported), so rule? is standard_rule?.
          "rule?": input.isRule === true,
          "standard_rule?": input.isRule === true,
          "preference?": "ERR:NotPorted:preference? has no engine predicate",
          content: c.dbContent ?? "",
        });
      }
      answer = out;
      break;
    }

    case "all_names":
    case "edge_names": {
      const names = payload.names as unknown as string[];
      answer = names.map(nameAlgebra);
      break;
    }

    case "set_definitions": {
      const sets = payload.sets as unknown as string[];
      const out: unknown[] = [];
      for (const sname of sets) {
        const rec = await fetcher.fetchByName(sname);
        if (rec === undefined || rec.id === undefined) {
          out.push({ set: sname, missing: true });
          continue;
        }
        const input = await patternInputFor(rec);
        out.push({
          set: sname,
          id: rec.id,
          type: await typeNameOf(rec),
          codename: rec.codename ?? "",
          safe_set_keys: await safe(() => safeSetKeysForCard(input)),
          concrete_patterns: await safe(() => concretePatternsForCard(input).map((p) => p.setName)),
          set_names: await safe(() => patternsForCard(input).map((p) => p.setName)),
          rule_lookup_keys: await safe(() => ruleLookupKeysForCard(input)),
        });
      }
      answer = out;
      break;
    }

    case "set_subcard_order": {
      // Ruby: Card.search(left: set) -- the same CQL statement, through the
      // engine's executor and permission filter.
      const sets = payload.sets as unknown as string[];
      const out: unknown[] = [];
      for (const sname of sets) {
        const rec = await fetcher.fetchByName(sname);
        if (rec === undefined) {
          out.push({ set: sname, missing: true });
          continue;
        }
        const names = await cqlNames({ left: sname });
        out.push({
          set: sname,
          rule_cards: names,
          rule_cards_by_name: typeof names === "string" ? names : [...names].sort(),
          visible_setting_codenames: "ERR:NotPorted:visible_setting_codenames has no engine counterpart",
        });
      }
      answer = out;
      break;
    }

    case "per_card": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      const out: unknown[] = [];
      for (const row of rows) {
        const c = await fetcher.fetchById(row.id);
        if (c === undefined) {
          out.push({ id: row.id, missing: true });
          continue;
        }
        const input = await patternInputFor(c);
        const rule: Record<string, unknown> = {};
        for (const setting of ["read", "create", "update", "delete"] as const) {
          rule[setting] = await safe(async () => {
            const found = await findRule(fetcher, input, settingCardNameForCode(setting));
            if (found === undefined) return null;
            return await nameForRecord(found.rule);
          });
        }
        out.push({
          id: c.id,
          name: await nameForRecord(c),
          type: await typeNameOf(c),
          rule,
          read_rule_id: c.readRuleId ?? null,
          read_rule_class: c.readRuleClass ?? "",
          set_names: await safe(() => patternsForCard(input).map((p) => p.setName)),
        });
      }
      answer = out;
      break;
    }

    case "roles": {
      const roles = payload.roles as unknown as string[];
      const out: unknown[] = [];
      for (const rname of roles) {
        const rec = await fetcher.fetchByName(rname);
        out.push(rec === undefined ? { role: rname, missing: true } : { role: rname, id: rec.id, type: await typeNameOf(rec) });
      }
      answer = out;
      break;
    }

    case "read_all": {
      const out: unknown[] = [];
      for (const cid of liveIds) {
        const c = await fetcher.fetchById(cid);
        if (c === undefined) {
          out.push({ id: cid, missing: true });
          continue;
        }
        const input = await patternInputFor(c);
        out.push({
          id: c.id,
          name: await nameForRecord(c),
          read: await safe(() => engine.canReadCard(c, typeof input.typeName === "string" ? input.typeName : undefined)),
          ...(await writeVerdicts(input, anonymous.task)),
        });
      }
      answer = out;
      break;
    }

    case "queries": {
      const queries = payload.queries as unknown as Array<{ label: string; query: Record<string, unknown> }>;
      const out: unknown[] = [];
      for (const qq of queries) {
        const names = await cqlNames(qq.query);
        const count = await safe(async () => executeCount(fetcher.driver, qq.query, await cqlOptions()));
        out.push({ label: qq.label, count, names });
      }
      answer = out;
      break;
    }

    case "new_card_type": {
      await warmEngine();
      const names = payload.names as unknown as string[];
      const out: unknown[] = [];
      for (const n of names) {
        const name = DeckoName.parse(n);
        const rec = await fetcher.fetchByName(n);
        if (rec !== undefined && rec.id !== undefined) {
          out.push({ name: n, type: await typeNameOf(rec), type_id: rec.typeId ?? null, new_card: false, exists: true });
          continue;
        }
        let leftTypeName: string | undefined;
        if (name.isCompound) {
          const left = name.leftName === undefined ? undefined : await fetcher.fetchByName(name.leftName.s);
          if (left !== undefined) leftTypeName = await typeNameOf(left);
        }
        const resolved = await safe(() => engine.newCardDefaultType(name, leftTypeName));
        if (typeof resolved === "string") {
          out.push({ name: n, error: resolved, new_card: true, exists: false });
        } else {
          out.push({
            name: n,
            type: resolved?.typeName ?? null,
            type_id: resolved?.typeId ?? null,
            new_card: true,
            exists: false,
          });
        }
      }
      answer = out;
      break;
    }

    case "structure_rules":
    case "default_rules": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      const out: unknown[] = [];
      for (const row of rows) {
        const c = await fetcher.fetchById(row.id);
        if (c === undefined) {
          out.push({ id: row.id, missing: true });
          continue;
        }
        const name = DeckoName.parse(await nameForRecord(c));
        let left: string | null = null;
        if (c.leftId !== undefined && c.leftId !== null) {
          const l = await fetcher.fetchById(c.leftId);
          left = l === undefined ? null : await nameForRecord(l);
        }
        const entry: Record<string, unknown> = { id: c.id, name: name.s, left };
        if (kind === "structure_rules") {
          entry.content = c.dbContent ?? "";
          entry["rule?"] = (await patternInputFor(c)).isRule === true;
        }
        out.push(entry);
      }
      answer = out;
      break;
    }

    case "view_defs":
    case "event_defs":
      // Superseded by view_defs_full / event_defs_full (the first-wave Ruby
      // probe for these asked respond_to?(:render_x), true for every name).
      answer = "SUPERSEDED";
      break;

    case "view_defs_full": {
      const sets = payload.sets as unknown as string[];
      const out: unknown[] = [];
      for (const sname of sets) {
        const rec = await fetcher.fetchByName(sname);
        if (rec === undefined || rec.id === undefined) {
          out.push({ set: sname, missing: true });
          continue;
        }
        const setKeys = safeSetKeysForCard(await patternInputFor(rec));
        const views: unknown[] = [];
        for (const v of tsViewNames) {
          const chain = loader.viewChain(setKeys, v, "html");
          if (chain.length > 0) views.push({ view: v, owner: chain[0]!.setModule });
          else if (engineFlatViews.has(v)) views.push({ view: v, owner: "ENGINE" });
        }
        out.push({ set: sname, set_keys: setKeys, views });
      }
      answer = out;
      break;
    }

    case "event_defs_full": {
      const sets = payload.sets as unknown as string[];
      const all = loader.eventRegistry().all();
      const out: unknown[] = [];
      for (const sname of sets) {
        const rec = await fetcher.fetchByName(sname);
        if (rec === undefined || rec.id === undefined) {
          out.push({ set: sname, missing: true });
          continue;
        }
        const setKeys = safeSetKeysForCard(await patternInputFor(rec));
        const tokens = new Set(setKeys.split(/\s+/).filter((t) => t !== ""));
        const events = new Map<string, Record<string, unknown>>();
        for (const e of all) {
          if (events.has(e.event)) continue;
          const applies = eventApplies(e.setPath, tokens);
          if (applies === false) continue;
          events.set(e.event, { event: e.event, owner: e.setPath, mod: e.modName, abstract: applies === "abstract" });
        }
        out.push({ set: sname, events: [...events.values()].sort((a, b) => String(a.event).localeCompare(String(b.event))) });
      }
      answer = out;
      break;
    }

    case "id_fetch": {
      const ids = payload.ids as unknown as number[];
      const out: unknown[] = [];
      for (const cid of ids) {
        const c = await fetcher.fetchById(cid);
        const name = c === undefined ? undefined : await nameForRecord(c);
        const byName = name === undefined || name === "" ? undefined : await fetcher.fetchByName(name);
        out.push({
          id: cid,
          fetch_by_id: c?.id ?? null,
          name: name ?? null,
          fetch_by_name: byName?.id ?? null,
        });
      }
      answer = out;
      break;
    }

    case "inflection_rows": {
      const ruby = RUBY_WAVE2[id] as { divergent?: Array<{ id: number; name: string; captured_key: string; stock_key: string }> } | undefined;
      const rows = ruby?.divergent ?? [];
      const out: unknown[] = [];
      for (const r of rows) {
        const computed = DeckoName.parse(r.name).key;
        const byName = await fetcher.fetchByName(r.name);
        const byCapturedKey = await fetcher.fetchByKey(r.captured_key);
        const byStockKey = await fetcher.fetchByKey(r.stock_key);
        const byId = await fetcher.fetchById(r.id);
        out.push({
          id: r.id,
          name: r.name,
          computed_key: computed,
          fetch_by_name: byName?.id ?? null,
          fetch_by_captured_key: byCapturedKey?.id ?? null,
          fetch_by_stock_key: byStockKey?.id ?? null,
          fetch_by_id: byId?.id ?? null,
          fetch_by_id_key: byId?.key ?? null,
        });
      }
      answer = { source: ruby === undefined ? "MISSING-RUBY-WAVE2" : "ruby-wave2", rows: out };
      break;
    }

    case "role_permissions": {
      const ruby = RUBY_WAVE2[id] as Array<{ role: string; actor_id: number | null }> | undefined;
      const cardIds = payload.card_ids as unknown as number[];
      const out: unknown[] = [];
      for (const a of ruby ?? []) {
        if (a.actor_id === null || a.actor_id === undefined) {
          out.push({ role: a.role, actor_id: null, verdicts: null, note: "no member found" });
          continue;
        }
        const viewer: ReadViewer = a.actor_id === anonymousId
          ? { signedIn: false, actorId: anonymousId }
          : { signedIn: true, actorId: a.actor_id };
        const state = await permissionStateFor(viewer);
        const verdicts: unknown[] = [];
        for (const cid of cardIds) {
          const c = await fetcher.fetchById(cid);
          if (c === undefined) {
            verdicts.push([cid, "missing"]);
            continue;
          }
          const input = await patternInputFor(c);
          const read = c.readRuleId === undefined || c.readRuleId === null
            ? "ERR:no-read-rule-id"
            : canReadByStoredRule(c.readRuleId, state.read);
          const w = await writeVerdicts(input, state.task);
          verdicts.push([cid, read, w.create, w.update, w.delete]);
        }
        out.push({ role: a.role, actor_id: a.actor_id, verdicts });
      }
      answer = ruby === undefined ? "MISSING-RUBY-WAVE2" : out;
      break;
    }

    default:
      answer = { unsupported_kind: kind };
  }

  answers[id] = answer;
  process.stdout.write(`ANSWERED ${id} ${kind}\n`);
}

writeFileSync(OUT_PATH, JSON.stringify({ engine: "typescript", answers }));
process.stdout.write(`WROTE ${OUT_PATH}\n`);
raw.close();
storage.close();
