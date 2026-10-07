// THE TYPESCRIPT ENGINE, semantics lane.
//
// Reads the SAME question set the Ruby oracle answered (tools/oracle/
// semantics-answer.rb) and answers every id in the same shape, from the
// same key-repaired deck. The comparator diffs the two files.
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
} from "../../src/card/permissions/read-rules.js";
import {
  viewTaskStateFromResults,
  viewTaskPermissionStatements,
  allTaskVerdictsForCard,
  type ViewTaskState,
} from "../../src/card/permissions/view-task-rules.js";
import { parseOptionsWithLexicon, executeQuery, executeCount } from "../../src/cql/execute.js";
import { getDefaultModLoader } from "../../src/card/mod-loader.js";

const QUESTIONS = JSON.parse(readFileSync(process.env.SEMANTICS_QUESTIONS!, "utf8"));
const OUT_PATH = process.env.SEMANTICS_ANSWERS!;

// ---------------------------------------------------------------- the engine

const db = new Database(RAW_CORPUS_DB, { readonly: true });
const liveIds = (db.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>)
  .map((r) => r.id);
db.close();

const storage = await createRawStructureSeededStorage(new Set(liveIds));
const fetcher = storage.fetcher;
fetcher.installNameEnvironment();
await fetcher.warmLexicon(liveIds);

// Read-permission state for the anonymous viewer (the corpus viewer), and the
// write-task state derived from it: the same two batches RenderEngine issues.
const readBatch = (await fetcher.driver.batch(readPermissionStatements())) as never[];
const anonymousViewer = {
  signedIn: false as const,
  actorId: anonymousIdFromResults(readBatch as never),
};
const readPermission: ReadPermissionState = readPermissionStateFromViewerResults(
  (await fetcher.driver.batch(readPermissionStatements(anonymousViewer))) as never,
  anonymousViewer,
);
const taskState: ViewTaskState = viewTaskStateFromResults(
  (await fetcher.driver.batch(viewTaskPermissionStatements())) as never,
  readPermission,
);

async function nameOfRecord(id: number): Promise<string | undefined> {
  const rec = await fetcher.fetchById(id);
  return rec === undefined ? undefined : nameForRecord(rec);
}

/** A record's full name, rebuilt from left_id/right_id (compound rows store
 * name NULL, Ruby's Card#name does the same walk). CardRecord.name is a
 * DeckoName, so every return is coerced to its string form: an answer must be
 * plain data, never a live name object. */
async function nameForRecord(rec: CardRecord): Promise<string> {
  const raw = rec.name as unknown;
  if (raw !== undefined && raw !== null && rec.leftId === undefined) {
    return raw instanceof DeckoName ? raw.s : String(raw);
  }
  if (rec.leftId !== undefined && rec.rightId !== undefined) {
    const left = await nameOfRecord(rec.leftId);
    const right = await nameOfRecord(rec.rightId);
    if (left !== undefined && right !== undefined) return `${left}+${right}`;
  }
  if (rec.codename !== undefined && rec.codename !== null) return String(rec.codename);
  if (raw instanceof DeckoName) return raw.s;
  return raw === undefined || raw === null ? "" : String(raw);
}

async function typeNameOf(rec: CardRecord): Promise<string> {
  if (rec.typeId === undefined || rec.typeId === null) return "";
  const t = await fetcher.fetchById(rec.typeId);
  return t === undefined ? "" : await nameForRecord(t);
}

/** The PatternCardInput the engine's own rule algebra consumes. Built from a
 * real record plus the *type plus right left-type walk (render.ts
 * structurePatternInputForSync). */
async function patternInputFor(rec: CardRecord): Promise<PatternCardInput> {
  const name = DeckoName.parse(await nameForRecord(rec));
  let leftTypeName: string | undefined;
  if (name.isCompound && name.leftId !== undefined) {
    const left = await fetcher.fetchById(name.leftId);
    if (left !== undefined) leftTypeName = await typeNameOf(left);
  }
  const isRule = await computeIsRule(name, rec);
  return {
    name,
    id: rec.id,
    typeId: rec.typeId ?? undefined,
    typeName: await typeNameOf(rec),
    ...(leftTypeName !== undefined ? { leftTypeName } : {}),
    ...(isRule ? { isRule } : {}),
  };
}

/** rule? = standard_rule? || preference? (rule/all.rb:32-53). */
async function computeIsRule(
  name: DeckoName,
  rec: CardRecord,
): Promise<boolean> {
  if (!name.isCompound) return false;
  const setTypeId = await typeIdOfNamed("Set");
  const settingTypeId = await typeIdOfNamed("Setting");
  if (setTypeId === undefined || settingTypeId === undefined) return false;
  const rightId = await fetcher.cardId(name.rightName);
  if (rightId === undefined) return false;
  const rightRec = await fetcher.fetchById(rightId);
  if (rightRec === undefined || rightRec.typeId !== settingTypeId) return false;
  // standard_rule?: left part is Set-typed
  const leftId = await fetcher.cardId(name.leftName);
  if (leftId !== undefined) {
    const leftRec = await fetcher.fetchById(leftId);
    if (leftRec !== undefined && leftRec.typeId === setTypeId) return true;
  }
  // preference?: trunk (parts minus the last two) is Set-typed and the
  // preferer part is a User or the `all` codename.
  if (name.parts.length > 2) {
    const trunkKey = DeckoName.parse(name.parts.slice(0, -2).join("+")).key;
    const trunkRec = trunkKey === "" ? undefined : await fetcher.fetchByKey(trunkKey);
    if (trunkRec !== undefined && trunkRec.typeId === setTypeId) {
      const prefererKey = name.parts[name.parts.length - 2];
      const prefererRec = await fetcher.fetchByKey(prefererKey);
      if (prefererRec !== undefined) {
        const userTypeId = await typeIdOfNamed("User");
        if (userTypeId !== undefined && prefererRec.typeId === userTypeId) return true;
        if (prefererRec.codename === "all") return true;
      }
    }
  }
  return false;
}

const typeIdCache = new Map<string, number | undefined>();
async function typeIdOfNamed(typeName: string): Promise<number | undefined> {
  if (typeIdCache.has(typeName)) return typeIdCache.get(typeName);
  const key = DeckoName.parse(typeName).key;
  const rec = await fetcher.fetchByKey(key);
  const id = rec?.id;
  typeIdCache.set(typeName, id);
  return id;
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
    rstar: one(() => (n.isRStar ? true : null)),
  };
}

async function crudVerdicts(rec: CardRecord): Promise<Record<string, unknown>> {
  const input = await patternInputFor(rec);
  const name = await nameForRecord(rec);
  const out: Record<string, unknown> = { id: rec.id, name };
  // READ: ok_to_read? -- the stored read rule against the anonymous viewer.
  out.read = await safe(async () => {
    if (readPermission.alwaysOk) return true;
    if (rec.readRuleId === undefined || rec.readRuleId === null) return false;
    return readPermission.allowedRuleIds !== undefined
      ? readPermission.allowedRuleIds.has(rec.readRuleId)
      : false;
  });
  // WRITE tasks: ok_to_create? / ok_to_update? / ok_to_delete?.
  const verdicts = await safe(() => allTaskVerdictsForCard(fetcher, input, taskState));
  if (typeof verdicts === "string") {
    out.create = verdicts;
    out.update = verdicts;
    out.delete = verdicts;
  } else {
    out.create = verdicts.create ?? null;
    out.update = verdicts.update ?? null;
    out.delete = verdicts.delete ?? null;
  }
  return out;
}

// ------------------------------------------------------------------ answers

const answers: Record<string, unknown> = {};

for (const question of QUESTIONS.questions) {
  const id = String(question.id);
  const kind = question.kind as string;
  const payload = question.payload as Record<string, never>;
  let answer: unknown;

  switch (kind) {
    case "counts": {
      const count = async (sql: string, params: unknown[] = []): Promise<number> => {
        const r = await fetcher.driver.query<{ n: number }>(sql, params);
        return (await r).rows[0]?.n ?? -1;
      };
      const typeId = async (t: string): Promise<number | undefined> => typeIdOfNamed(t);
      answer = {
        live: await count("SELECT count(*) n FROM cards WHERE trash = 0"),
        trashed: await count("SELECT count(*) n FROM cards WHERE trash = 1"),
        total: await count("SELECT count(*) n FROM cards"),
        cardtypes: await count(
          "SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = ?",
          [(await typeId("Cardtype")) ?? -1],
        ),
        sets: await count("SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = ?", [
          (await typeId("Set")) ?? -1,
        ]),
        settings: await count("SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = ?", [
          (await typeId("Setting")) ?? -1,
        ]),
        roles: await count("SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = ?", [
          (await typeId("Role")) ?? -1,
        ]),
        users: await count("SELECT count(*) n FROM cards WHERE trash = 0 AND type_id = ?", [
          (await typeId("User")) ?? -1,
        ]),
      };
      break;
    }

    case "live_ids":
      answer = liveIds;
      break;

    case "cards": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      answer = await Promise.all(
        rows.map(async (row) => {
          const c = await fetcher.fetchById(row.id);
          if (c === undefined) return { id: row.id, missing: true };
          return {
            id: c.id,
            name: await nameForRecord(c),
            key: c.key,
            type: await typeNameOf(c),
            codename: c.codename ?? "",
            trash: c.trash === true,
          };
        }),
      );
      break;
    }

    case "rule_cards": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      answer = await Promise.all(
        rows.map(async (row) => {
          const c = await fetcher.fetchById(row.id);
          if (c === undefined) return { id: row.id, missing: true };
          const name = DeckoName.parse(await nameForRecord(c));
          const isRule = await computeIsRule(name, c);
          // standard_rule? / preference? asked separately so a difference
          // between the composite and its parts is visible.
          let standard: boolean | string = "ERR";
          let pref: boolean | string = "ERR";
          try {
            const setTypeId = await typeIdOfNamed("Set");
            const settingTypeId = await typeIdOfNamed("Setting");
            const rightId = await fetcher.cardId(name.rightName);
            const rightRec = rightId === undefined ? undefined : await fetcher.fetchById(rightId);
            if (setTypeId !== undefined && settingTypeId !== undefined && rightRec?.typeId === settingTypeId) {
              const leftId = await fetcher.cardId(name.leftName);
              const leftRec = leftId === undefined ? undefined : await fetcher.fetchById(leftId);
              standard = leftRec?.typeId === setTypeId;
              if (!standard && name.parts.length > 2) {
                const trunkKey = DeckoName.parse(name.parts.slice(0, -2).join("+")).key;
                const trunkRec = trunkKey === "" ? undefined : await fetcher.fetchByKey(trunkKey);
                if (trunkRec?.typeId === setTypeId) {
                  const prefererRec = await fetcher.fetchByKey(name.parts[name.parts.length - 2]);
                  if (prefererRec !== undefined) {
                    const userTypeId = await typeIdOfNamed("User");
                    pref = (userTypeId !== undefined && prefererRec.typeId === userTypeId) ||
                      prefererRec.codename === "all";
                  }
                }
              }
            } else {
              standard = false;
              pref = false;
            }
          } catch (e) {
            standard = errText(e);
            pref = errText(e);
          }
          return {
            id: c.id,
            name: name.s,
            key: c.key,
            left: await safe(async () => {
              const lid = c.leftId;
              if (lid === undefined || lid === null) return null;
              const l = await fetcher.fetchById(lid);
              return l === undefined ? null : await nameForRecord(l);
            }),
            right: await safe(async () => {
              const rid = c.rightId;
              if (rid === undefined || rid === null) return null;
              const r = await fetcher.fetchById(rid);
              return r === undefined ? null : await nameForRecord(r);
            }),
            trunk: await safe(() => name.trunk),
            tag: await safe(() => name.tag),
            "rule?": isRule,
            "standard_rule?": standard,
            "preference?": pref,
            content: c.dbContent ?? "",
          };
        }),
      );
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
      answer = await Promise.all(
        sets.map(async (sname) => {
          const rec = await fetcher.fetchByName(sname);
          if (rec === undefined || rec.id === undefined) return { set: sname, missing: true };
          const input = await patternInputFor(rec);
          return {
            set: sname,
            id: rec.id,
            type: await typeNameOf(rec),
            codename: rec.codename ?? "",
            safe_set_keys: await safe(() => safeSetKeysForCard(input)),
            concrete_patterns: await safe(() =>
              concretePatternsForCard(input).map((p) => p.setName),
            ),
            set_names: await safe(() => patternsForCard(input).map((p) => p.setName)),
            rule_lookup_keys: await safe(() => ruleLookupKeysForCard(input)),
          };
        }),
      );
      break;
    }

    case "set_subcard_order": {
      const sets = payload.sets as unknown as string[];
      answer = await Promise.all(
        sets.map(async (sname) => {
          const rec = await fetcher.fetchByName(sname);
          if (rec === undefined) return { set: sname, missing: true };
          const id = await fetcher.cardId(sname);
          const rows = await fetcher.driver.query<{ id: number }>(
            "SELECT id FROM cards WHERE left_id = ? AND trash = 0",
            [id ?? -1],
          );
          const ruleIds = (await rows).rows.map((r) => r.id);
          const names: string[] = [];
          for (const rid of ruleIds) {
            const r = await fetcher.fetchById(rid);
            if (r !== undefined) names.push(await nameForRecord(r));
          }
          return {
            set: sname,
            rule_cards: names,
            rule_cards_by_name: [...names].sort(),
            visible_setting_codenames: "ERR:NoMethodError:visible_setting_codenames not ported",
          };
        }),
      );
      break;
    }

    case "per_card": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      answer = await Promise.all(
        rows.map(async (row) => {
          const c = await fetcher.fetchById(row.id);
          if (c === undefined) return { id: row.id, missing: true };
          const input = await patternInputFor(c);
          const rule: Record<string, unknown> = {};
          for (const setting of ["read", "create", "update", "delete"] as const) {
            const settingCard = settingCardNameForCode(setting);
            rule[setting] = await safe(async () => {
              const found = await findRule(fetcher, input, settingCard);
              if (found === undefined) return null;
              return await nameForRecord(found.rule);
            });
          }
          return {
            id: c.id,
            name: await nameForRecord(c),
            type: await typeNameOf(c),
            rule,
            read_rule_id: c.readRuleId ?? null,
            read_rule_class: c.readRuleClass ?? "",
            set_names: await safe(() => patternsForCard(input).map((p) => p.setName)),
          };
        }),
      );
      break;
    }

    case "roles": {
      const roles = payload.roles as unknown as string[];
      const roleTypeId = await typeIdOfNamed("Role");
      answer = await Promise.all(
        roles.map(async (rname) => {
          const rec = await fetcher.fetchByName(rname);
          if (rec === undefined) return { role: rname, missing: true };
          void roleTypeId;
          return { role: rname, id: rec.id, type: await typeNameOf(rec) };
        }),
      );
      break;
    }

    case "read_all": {
      // ok_to_read? / create / update / delete for EVERY live card.
      const out: unknown[] = [];
      for (const cid of liveIds) {
        const c = await fetcher.fetchById(cid);
        if (c === undefined) {
          out.push({ id: cid, missing: true });
          continue;
        }
        out.push(await crudVerdicts(c));
      }
      answer = out;
      break;
    }

    case "queries": {
      const queries = payload.queries as unknown as Array<{
        label: string;
        query: Record<string, unknown>;
      }>;
      answer = await Promise.all(
        queries.map(async (qq) => {
          const opts = parseOptionsWithLexicon(fetcher.lexicon);
          const names = await safe(async () => {
            const r = await executeQuery<{ name: string }>(
              fetcher.driver,
              qq.query,
              { ...opts, return: "name" },
            );
            if ("count" in r) return [];
            return r.rows.map((row) => row.name);
          });
          const count = await safe(async () => {
            const r = await executeCount(fetcher.driver, qq.query, opts);
            return "count" in r ? r.count : -1;
          });
          return { label: qq.label, count, names };
        }),
      );
      break;
    }

    case "new_card_type": {
      const names = payload.names as unknown as string[];
      answer = await Promise.all(
        names.map(async (n) => {
          const name = DeckoName.parse(n);
          const rec = await fetcher.fetchByName(n);
          const exists = rec !== undefined && rec.id !== undefined;
          if (exists && rec !== undefined) {
            return {
              name: n,
              type: await typeNameOf(rec),
              type_id: rec.typeId ?? null,
              new_card: false,
              exists: true,
            };
          }
          // A new card: the engine's own default-type walk
          // (RenderEngine#newCardDefaultType: assignment, then *default,
          // then the *structure template).
          const resolved = await safe(() => storage.engine.newCardDefaultType(name));
          if (typeof resolved === "string") {
            return { name: n, error: resolved, new_card: true, exists: false };
          }
          return {
            name: n,
            type: resolved?.typeName ?? null,
            type_id: resolved?.typeId ?? null,
            new_card: true,
            exists: false,
          };
        }),
      );
      break;
    }

    case "structure_rules": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      answer = await Promise.all(
        rows.map(async (row) => {
          const c = await fetcher.fetchById(row.id);
          if (c === undefined) return { id: row.id, missing: true };
          const name = DeckoName.parse(await nameForRecord(c));
          return {
            id: c.id,
            name: name.s,
            left: await safe(async () => {
              const lid = c.leftId;
              if (lid === undefined || lid === null) return null;
              const l = await fetcher.fetchById(lid);
              return l === undefined ? null : await nameForRecord(l);
            }),
            content: c.dbContent ?? "",
            "rule?": await computeIsRule(name, c),
          };
        }),
      );
      break;
    }

    case "default_rules": {
      const rows = payload.rows as unknown as Array<{ id: number }>;
      answer = await Promise.all(
        rows.map(async (row) => {
          const c = await fetcher.fetchById(row.id);
          if (c === undefined) return { id: row.id, missing: true };
          const name = DeckoName.parse(await nameForRecord(c));
          return {
            id: c.id,
            name: name.s,
            left: await safe(async () => {
              const lid = c.leftId;
              if (lid === undefined || lid === null) return null;
              const l = await fetcher.fetchById(lid);
              return l === undefined ? null : await nameForRecord(l);
            }),
          };
        }),
      );
      break;
    }

    case "view_defs": {
      const sets = payload.sets as unknown as string[];
      const views = payload.views as unknown as string[];
      const loader = getDefaultModLoader();
      answer = await Promise.all(
        sets.map(async (sname) => {
          const rec = await fetcher.fetchByName(sname);
          if (rec === undefined || rec.id === undefined) return { set: sname, missing: true };
          const input = await patternInputFor(rec);
          const setKeys = safeSetKeysForCard(input);
          return {
            set: sname,
            views: loader === undefined
              ? views.map(() => "ERR:no mod loader")
              : views.filter((v) => loader.viewChain(setKeys, v).length > 0),
            set_keys: setKeys,
          };
        }),
      );
      break;
    }

    case "event_defs": {
      const sets = payload.sets as unknown as string[];
      const registry = getDefaultModLoader()?.eventRegistry();
      const all = registry?.all() ?? [];
      answer = await Promise.all(
        sets.map(async (sname) => {
          const rec = await fetcher.fetchByName(sname);
          if (rec === undefined || rec.id === undefined) return { set: sname, missing: true };
          const input = await patternInputFor(rec);
          const setKeys = safeSetKeysForCard(input);
          // An event applies to this card when its declaring set module's
          // token is one of the card's set keys (event/all.rb:22-24).
          const tokens = new Set(setKeys.split(/\s+/).filter((t) => t !== ""));
          const events = all
            .filter((e) => {
              const parts = e.setPath.split("/");
              const anchor = parts[parts.length - 2];
              const pattern = parts[parts.length - 1];
              const upper = `${pattern.toUpperCase()}-${anchor.toUpperCase()}`;
              return tokens.has(upper) || tokens.has(`${pattern.toUpperCase()}`);
            })
            .map((e) => e.event);
          return { set: sname, events: [...new Set(events)].sort() };
        }),
      );
      break;
    }

    default:
      answer = { unsupported_kind: kind };
  }

  answers[id] = answer;
  process.stdout.write(`ANSWERED ${id} ${kind}\n`);
}

// A cycle-safe serialiser. Every answer here should be plain JSON; if one is
// not, the key path is named rather than the whole run dying at the write, so
// the defect is visible instead of silent.
function serialise(value: unknown): string {
  const seen = new WeakSet<object>();
  const cyclic: string[] = [];
  const path: string[] = [];
  const text = JSON.stringify(value, function (this: unknown, key: string, v: unknown) {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) {
        cyclic.push([...path, key].join("."));
        return "[CIRCULAR]";
      }
      seen.add(v);
      path.push(key);
    } else {
      path.pop();
    }
    return v;
  });
  if (cyclic.length > 0) {
    process.stdout.write(`CYCLIC PATHS (replaced, not fatal): ${cyclic.slice(0, 10).join(" | ")}\n`);
  }
  return text as string;
}

writeFileSync(OUT_PATH, serialise({ engine: "typescript", answers }));
process.stdout.write(`WROTE ${OUT_PATH}\n`);
storage.close();