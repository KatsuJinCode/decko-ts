// src/card/live/request-store.ts
//
// THE REQUEST-LOCAL ROW STORE: the `cards` rows ONE request has fetched, plus
// exact knowledge of which lookups those rows answer COMPLETELY.
//
// The engine asks storage about ten statement shapes on the cards table (by
// key, by id, by (left, right) pair, by side keys, IN-lists of each). A shape
// is answered locally (store-row-evaluator.ts) only when the store can PROVE
// the local rows are every row storage would match:
//
//   key k known     <=> a fetch asked storage for key k (any trash state)
//   id i known      <=> a fetch asked storage for id i, or row i arrived
//   left L complete <=> a fetch asked storage for every row with left_id = L
//   pair (l, r)     <=> left l complete
//
// COLUMNS. A row is held either FULL (every `cards` column) or as its
// IDENTITY only (IDENTITY_COLUMNS: what every shape filters on, plus the
// columns the identity-projecting shapes return). Most rows a request fetches
// are ring neighbours that only prove completeness (a left side's other
// junctions) or are only linked, so the ring fetches them as identity rows:
// the great majority of the ring is never read by the engine, and carrying it
// whole would dominate the response for nothing. A statement is answered
// locally only when every row it returns is held with every column it
// projects: a statement that would return an identity-only row through a
// full projection names that row's id as missing (fullIds), and the row is
// fetched whole.
//
// Fetches are trash-AGNOSTIC (no trash filter), so a statement's own
// `trash = 0` filter, applied locally, gives storage's answer. Anything the
// store cannot prove goes to storage. The store is created per request and
// dropped with it: nothing here survives the request.
//
// Keys are compared under SQLite's NOCASE collation, which folds ASCII only
// (foldNoCase); the deck's keys are unique under it.

import type { SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { envValue } from "../debug-flags.js";
import { CARDS_COLUMNS, StoreRowEvaluator, foldNoCase, unwrapCompositionSql, type CardRow } from "./store-row-evaluator.js";

export const IDENTITY_COLUMNS = ["id", "key", "name", "codename", "left_id", "right_id", "type_id", "trash"] as const;

export interface Need {
  keys: string[];
  ids: number[];
  lefts: number[];
  sideLeftKeys?: string[];
  full: boolean;
  pairs?: [number, number][];
  sideRightKeys?: string[];
  chainDepth?: number;
}

export interface Missing {
  keys: string[];
  ids: number[];
  lefts: number[];
  leftKeys: string[];
  fullIds: number[];
  full: boolean;
  pairs: [number, number][];
  sideL: string[];
  sideR: string[];
}

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

export const MAX_COMPOUND_TERMS = 5;

export function unionCtes(name: string, parts: readonly string[], columns = "id"): string[] {
  if (parts.length <= MAX_COMPOUND_TERMS) return [`${name}(${columns}) AS (${parts.join(" UNION ")})`];
  const groups: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += MAX_COMPOUND_TERMS) {
    const sub = `${name}_${groups.length}`;
    out.push(...unionCtes(sub, parts.slice(i, i + MAX_COMPOUND_TERMS), columns));
    groups.push(`SELECT ${columns} FROM ${sub}`);
  }
  if (groups.length <= MAX_COMPOUND_TERMS) {
    out.push(`${name}(${columns}) AS (${groups.join(" UNION ")})`);
  } else {
    out.push(...unionCtes(`${name}_g`, groups, columns));
    out.push(`${name}(${columns}) AS (SELECT ${columns} FROM ${name}_g)`);
  }
  return out;
}

export function needsOf(sql: string, params: readonly unknown[]): Need | undefined {
  const rawNorm = norm(sql);
  const s = unwrapCompositionSql(rawNorm) ?? rawNorm;
  const p = params as (string | number)[];
  const keys = (xs: readonly unknown[]) => xs.map((x) => foldNoCase(String(x)));
  const ids = (xs: readonly unknown[]) => xs.map((x) => Number(x));
  switch (s) {
    case "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { keys: keys([p[0]]), ids: [], lefts: [], full: true };
    case "SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { keys: keys([p[0]]), ids: [], lefts: [], full: false };
    case "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1":
    case "SELECT * FROM cards WHERE id = ? AND trash = 0":
      return { keys: [], ids: ids([p[0]]), lefts: [], full: true };
    case "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1":
    case "SELECT codename FROM cards WHERE id = ?":
    case "SELECT codename FROM cards WHERE id = ? LIMIT 1":
    case "SELECT codename FROM cards WHERE id = ? AND trash = 0":
    case "SELECT codename FROM cards WHERE id = ? AND trash = 0 LIMIT 1":
      return { keys: [], ids: ids([p[0]]), lefts: [], full: false };
    case "SELECT codename FROM cards WHERE key = ? AND trash = 0":
    case "SELECT codename FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { keys: keys([p[0]]), ids: [], lefts: [], full: false };
    case "SELECT * FROM cards WHERE codename = 'set' AND trash = 0":
      return { keys: ["*set"], ids: [], lefts: [], full: true };
    case "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1":
    case "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1":
      return { keys: [], ids: [], lefts: ids([p[0]]), full: false };
    case "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1":
    case "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 ORDER BY id LIMIT 1":
      return { keys: [], ids: [], lefts: ids([p[0]]), full: true, pairs: [[Number(p[0]), Number(p[1])]] };
    case "SELECT * FROM cards WHERE id IN (?, (SELECT type_id FROM cards WHERE id = ? AND trash = 0)) AND trash = 0":
      return {
        keys: [],
        ids: Array.from(new Set(ids([p[0], p[1]]).filter((n) => Number.isSafeInteger(n) && n > 0))),
        lefts: [],
        full: true,
      };
    case "SELECT j.* FROM cards j JOIN cards s ON s.id = j.right_id WHERE j.left_id = ? AND s.codename = 'test_context' AND j.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')":
      return { keys: [], ids: Number(p[1]) > 0 ? [Number(p[1])] : [], lefts: [], full: false };
    case "SELECT c.id, c.key FROM cards c WHERE c.key COLLATE NOCASE IN ('*to','*from','*cc','*bcc','*attach','*subject','*text message','*html message','*test context') AND c.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')":
      return { keys: [], ids: Number(p[0]) > 0 ? [Number(p[0])] : [], lefts: [], full: false };
  }
  if (/^SELECT j\.\* FROM cards j WHERE j\.trash = 0 AND \(\(j\.left_id = \? AND j\.right_id = \?\)( OR \(j\.left_id = \? AND j\.right_id = \?\))*\)$/.test(s)) {
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < p.length; i += 2) pairs.push([Number(p[i]), Number(p[i + 1])]);
    return { keys: [], ids: [], lefts: ids(p.filter((_, i) => i % 2 === 0)), full: true, pairs };
  }
  const keyIn = s.match(/^SELECT (\*|id, key) FROM cards WHERE ("key" COLLATE NOCASE|key COLLATE NOCASE|"key"|key) IN \(\?(?:,\s*\?)*\) AND trash = 0$/);
  if (keyIn) {
    return { keys: keys(p), ids: [], lefts: [], full: keyIn[1] === "*" };
  }
  if (/^SELECT (id, name, left_id, right_id|\*|id, db_content) FROM cards WHERE id IN \(\?(?:,\s*\?)*\)( AND trash = 0)?$/.test(s)) {
    const full = !/^SELECT id, name, left_id, right_id /.test(s);
    return { keys: [], ids: ids(p), lefts: [], full };
  }
  const m = s.match(
    /^SELECT DISTINCT j\.\* FROM cards j JOIN cards l ON l\.id = j\.left_id AND l\."key" (?:COLLATE NOCASE )?IN \(([?, ]+)\)(?: AND l\.trash = 0)? JOIN cards r ON r\.id = j\.right_id AND r\."key" (?:COLLATE NOCASE )?IN \(([?, ]+)\)(?: AND r\.trash = 0)? WHERE j\.trash = 0$/,
  );
  if (m) {
    const nl = (m[1]!.match(/\?/g) ?? []).length;
    return { keys: keys(p), ids: [], lefts: [], sideLeftKeys: keys(p.slice(0, nl)), sideRightKeys: keys(p.slice(nl)), full: true };
  }
  const jc = s.match(/SELECT DISTINCT c(\d+)\.\* FROM requested CROSS JOIN cards p0 ON p0\."key" = requested\.k0 AND p0\.trash = 0/);
  if (jc) {
    return { keys: Array.from(new Set(keys(p))), ids: [], lefts: [], full: true, chainDepth: Number(jc[1]) };
  }
  return undefined;
}

export interface Widening {
  fullKeys: string[];
  idKeys: string[];
  fullIds: number[];
  idIds: number[];
  lefts: number[];
  leftKeys: string[];
  pairs: [number, number][];
  sideL: string[];
  sideR: string[];
  ruleSets?: [number, string][];
  tprSets?: [number, number][];
  wholeLefts?: number[];
  wholeLeftKeys?: string[];
}

export interface SerializedRequestStore {
  fullRows: CardRow[];
  identityRows: CardRow[];
  fullIds?: number[];
  keyKnown: string[];
  idKnown: number[];
  leftComplete: number[];
  expanded: number[];
  contentExpanded: number[];
}

export class RequestStore {
  private readonly rows = new StoreRowEvaluator();
  readonly keyKnown = new Set<string>();
  readonly idKnown = new Set<number>();
  readonly leftComplete = new Set<number>();
  readonly expanded = new Set<number>();
  readonly contentExpanded = new Set<number>();
  readonly present = new Set<number>();
  readonly full = new Set<number>();
  readonly answeredIds = new Set<number>();
  rowsFetched = 0;
  private readonly answerMemo = new Map<string, CardRow[]>();

  retainedPayload(): unknown { return { ...this, rows: this.rows.retainedPayload() }; }

  releaseWitnesses(): void {
    this.rows.clear();
    for (const set of [this.keyKnown, this.idKnown, this.leftComplete, this.expanded,
      this.contentExpanded, this.present, this.full, this.answeredIds]) set.clear();
    this.rowsFetched = 0;
  }

  close(): void {
    this.answerMemo.clear();
  }

  copyFrom(other: RequestStore): void {
    this.rows.copyFrom(other.rows);
    for (const k of other.keyKnown) this.keyKnown.add(k);
    for (const k of other.idKnown) this.idKnown.add(k);
    for (const k of other.leftComplete) this.leftComplete.add(k);
    for (const k of other.expanded) this.expanded.add(k);
    for (const k of other.contentExpanded) this.contentExpanded.add(k);
    for (const k of other.present) this.present.add(k);
    for (const k of other.full) this.full.add(k);
    this.rowsFetched = other.rowsFetched;
    for (const [k, v] of other.answerMemo) this.answerMemo.set(k, v);
  }

  mergeFrom(other: RequestStore): void {
    let added = false;
    for (const [id, r] of other.rows.entries()) {
      if (this.addRow(r, other.full.has(id))) added = true;
    }
    for (const k of other.keyKnown) this.keyKnown.add(k);
    for (const k of other.idKnown) this.idKnown.add(k);
    for (const k of other.leftComplete) this.leftComplete.add(k);
    for (const k of other.expanded) this.expanded.add(k);
    for (const k of other.contentExpanded) this.contentExpanded.add(k);
    if (added) this.answerMemo.clear();
  }

  addRow(r: Record<string, unknown>, isFull: boolean): boolean {
    const id = Number(r.id);
    if (this.present.has(id)) {
      if (!isFull) return false;
      this.rows.replace(r);
      if (this.full.has(id)) return false;
      this.full.add(id);
      return true;
    }
    if (!this.rows.seat(r)) return false;
    this.present.add(id);
    this.idKnown.add(id);
    if (isFull) this.full.add(id);
    if (typeof r.key === "string") this.keyKnown.add(foldNoCase(r.key));
    this.rowsFetched += 1;
    return true;
  }

  rowById(id: number): CardRow | undefined {
    if (!this.present.has(id)) return undefined;
    return this.rows.evaluate("SELECT * FROM cards WHERE id = ?", [id])?.[0];
  }

  touchedIds(): ReadonlySet<number> {
    if (this.answeredIds.size === 0) return this.rows.touchedIds;
    const out = new Set<number>(this.rows.touchedIds);
    for (const id of this.answeredIds) out.add(id);
    return out;
  }

  clearTouchedIds(): void {
    this.rows.touchedIds.clear();
  }

  idForKey(key: string): number | undefined {
    const r = this.rows.evaluate(`SELECT id FROM cards WHERE "key" COLLATE NOCASE = ?`, [key])?.[0];
    return r === undefined ? undefined : Number(r.id);
  }

  partialAnswer(sql: string, params: readonly unknown[]): Record<string, unknown>[] {
    const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
    let rows: Record<string, unknown>[] | undefined;
    try {
      rows = this.rows.evaluate(sql, ps) as Record<string, unknown>[] | undefined;
    } catch {
      return [];
    }
    if (rows === undefined) return [];
    const out: Record<string, unknown>[] = [];
    for (const r of rows) {
      if (r.id === null || r.id === undefined) return [];
      const id = Number(r.id);
      if (this.full.has(id)) {
        this.answeredIds.add(id);
        out.push({ ...r });
      }
    }
    return out;
  }

  missing(sql: string, params: readonly unknown[]): Missing | undefined {
    const need = needsOf(sql, params);
    if (need === undefined) return undefined;
    const keys = need.keys.filter((k) => !this.keyKnown.has(k));
    const ids = need.ids.filter((i) => !this.idKnown.has(i));
    const lefts = need.lefts.filter((l) => !this.leftComplete.has(l));
    const leftKeys: string[] = [];
    if (need.sideLeftKeys) {
      for (const k of need.sideLeftKeys) {
        if (!this.keyKnown.has(k)) {
          leftKeys.push(k);
          continue;
        }
        const id = this.idForKey(k);
        if (id !== undefined && !this.leftComplete.has(id)) lefts.push(id);
      }
    }
    const fullIds: number[] = [];
    const rawNorm = norm(sql);
    const unwrapped = unwrapCompositionSql(rawNorm);
    const s = unwrapped ?? rawNorm;
    const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
    if (need.chainDepth !== undefined) {
      const d = need.chainDepth;
      const step = d;
      for (let i = 0; i + step <= params.length; i += step) {
        const k0 = foldNoCase(String(params[i]));
        let currId = this.keyKnown.has(k0) ? this.idForKey(k0) : undefined;
        for (let j = 1; j < d; j++) {
          if (currId === undefined) break;
          if (!this.leftComplete.has(currId) && !lefts.includes(currId)) lefts.push(currId);
          const rk = foldNoCase(String(params[i + j]));
          const rightId = this.keyKnown.has(rk) ? this.idForKey(rk) : undefined;
          if (rightId === undefined) break;
          currId = this.rows.nonTrashedPairId(currId, rightId);
        }
      }
    }
    if (s === "SELECT * FROM cards WHERE id IN (?, (SELECT type_id FROM cards WHERE id = ? AND trash = 0)) AND trash = 0") {
      const id1 = Number(params[1]);
      const r1 = this.rowById(id1);
      const tid = typeof r1?.type_id === "number" ? r1.type_id : undefined;
      if (tid !== undefined && tid > 0) {
        if (!this.idKnown.has(tid) && !ids.includes(tid)) ids.push(tid);
      }
    } else if (
      s ===
      "SELECT j.* FROM cards j JOIN cards s ON s.id = j.right_id WHERE j.left_id = ? AND s.codename = 'test_context' AND j.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')"
    ) {
      const typeId = Number(params[1]);
      if (typeId > 0 && this.idKnown.has(typeId) && this.rowById(typeId)?.codename === "email_template") {
        const leftId = Number(params[0]);
        if (leftId > 0 && !this.leftComplete.has(leftId) && !lefts.includes(leftId)) lefts.push(leftId);
        else {
          for (const r of this.rows.evaluateRows(sql, ps) ?? []) {
            const id = Number(r.id);
            if (!this.full.has(id)) fullIds.push(id);
          }
        }
      }
    } else if (
      s ===
      "SELECT c.id, c.key FROM cards c WHERE c.key COLLATE NOCASE IN ('*to','*from','*cc','*bcc','*attach','*subject','*text message','*html message','*test context') AND c.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')"
    ) {
      const typeId = Number(params[0]);
      if (typeId > 0 && this.idKnown.has(typeId) && this.rowById(typeId)?.codename === "email_template") {
        for (const k of ["*to", "*from", "*cc", "*bcc", "*attach", "*subject", "*text message", "*html message", "*test context"]) {
          if (!this.keyKnown.has(k) && !keys.includes(k)) keys.push(k);
        }
      }
    }
    if (keys.length + ids.length + lefts.length + leftKeys.length === 0) {
      const matched = this.rows.evaluateRows(sql, ps) ?? [];
      if (need.full) {
        for (const r of matched) {
          const id = Number(r.id);
          if (!this.full.has(id)) fullIds.push(id);
        }
      }
      if (unwrapped !== undefined && matched.length > 0) {
        const rootIds = matched.map((r) => Number(r.id)).filter((n) => Number.isSafeInteger(n) && n > 0);
        for (const missingId of this.rows.missingReachIds(rootIds)) {
          if (!ids.includes(missingId)) ids.push(missingId);
        }
      }
    }
    const pairs = need.pairs === undefined ? [] : need.pairs.filter(([l]) => !this.leftComplete.has(l));
    const sideOpen = keys.length + lefts.length + leftKeys.length > 0;
    const sideL = sideOpen ? (need.sideLeftKeys ?? []) : [];
    const sideR = sideOpen ? (need.sideRightKeys ?? []) : [];
    return { keys, ids, lefts, leftKeys, fullIds, full: need.full, pairs, sideL, sideR };
  }

  certifiedAnswer(sql: string, params: readonly unknown[]): SQLQueryResult | undefined {
    if (this.answerMemo.size === 0) return undefined;
    const memo = this.answerMemo.get(memoKeyOf(sql, params));
    if (memo === undefined) return undefined;
    for (const r of memo) if (r.id != null) this.answeredIds.add(Number(r.id));
    return { rows: memo.map((r) => ({ ...r })), rowsAffected: 0 };
  }

  answer(sql: string, params: readonly unknown[]): SQLQueryResult {
    const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
    const mk = memoKeyOf(sql, params);
    const memo = this.answerMemo.get(mk);
    if (memo !== undefined) {
      for (const r of memo) if (r.id != null) this.answeredIds.add(Number(r.id));
      return { rows: memo.map((r) => ({ ...r })), rowsAffected: 0 };
    }
    const rows = this.rows.evaluate(sql, ps);
    if (rows === undefined) throw new Error(`request store: no local evaluator for a certified shape: ${norm(sql).slice(0, 120)}`);
    for (const r of rows) if (r.id != null) this.answeredIds.add(Number(r.id));
    this.answerMemo.set(mk, rows.map((r) => ({ ...r })));
    return { rows: rows.map((r) => ({ ...r })), rowsAffected: 0 };
  }

  wideningStatements(
    w: Widening,
    identityRows = true,
  ): { full: SQLStatement; identity: SQLStatement; identityColumns: readonly string[] } | undefined {
    const total =
      w.fullKeys.length + w.idKeys.length + w.fullIds.length + w.idIds.length + w.lefts.length + w.leftKeys.length + w.pairs.length +
      (w.ruleSets?.length ?? 0) + (w.tprSets?.length ?? 0) + (w.wholeLefts?.length ?? 0) + (w.wholeLeftKeys?.length ?? 0);
    if (total === 0) return undefined;
    const ctes: string[] = [];
    const params: unknown[] = [];
    const lfParts: string[] = ["SELECT id FROM la"];
    ctes.push(`la(id) AS (${w.lefts.length ? "SELECT value FROM json_each(?)" : "SELECT NULL WHERE 0"})`);
    if (w.lefts.length) params.push(JSON.stringify(w.lefts));
    if (w.leftKeys.length) {
      lfParts.push(`SELECT id FROM cards WHERE "key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(w.leftKeys));
    }
    ctes.push(`lf(id) AS (${lfParts.join(" UNION ")})`);
    const fullParts: string[] = ["SELECT NULL WHERE 0"];
    if (w.fullKeys.length) {
      fullParts.push(`SELECT id FROM cards WHERE "key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(w.fullKeys));
    }
    if (w.fullIds.length) {
      fullParts.push(`SELECT id FROM cards WHERE id IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(w.fullIds));
    }
    if (w.pairs.length) {
      fullParts.push(
        `SELECT c.id FROM json_each(?) p JOIN cards c ON c.left_id = json_extract(p.value, '$[0]') AND c.right_id = json_extract(p.value, '$[1]')`,
      );
      params.push(JSON.stringify(w.pairs));
    }
    if (w.sideL.length && w.sideR.length) {
      fullParts.push(
        `SELECT j.id FROM cards j JOIN cards l ON l.id = j.left_id AND l."key" COLLATE NOCASE IN (SELECT value FROM json_each(?)) ` +
          `JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`,
      );
      params.push(JSON.stringify(w.sideL), JSON.stringify(w.sideR));
    }
    if (w.wholeLefts?.length) {
      fullParts.push(`SELECT id FROM cards WHERE left_id IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(w.wholeLefts));
    }
    if (w.wholeLeftKeys?.length) {
      const anchors = `SELECT id FROM cards WHERE "key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`;
      fullParts.push(anchors, `SELECT id FROM cards WHERE left_id IN (${anchors})`);
      fullParts.push(
        `SELECT l.id FROM cards r JOIN cards s ON s.id = r.right_id AND s.codename = 'layout' ` +
          `JOIN cards l ON l.name = trim(replace(replace(r.db_content, '[[', ''), ']]', '')) ` +
          `WHERE r.trash = 0 AND l.left_id IS NULL`,
      );
      const k = JSON.stringify(w.wholeLeftKeys);
      params.push(k, k);
    }
    if (w.ruleSets?.length || w.tprSets?.length) {
      const setParts: string[] = [];
      const setParams: string[] = [];
      if (w.ruleSets?.length) {
        setParts.push(
          `SELECT s.id FROM json_each(?) p JOIN cards s ON s.left_id = json_extract(p.value, '$[0]') ` +
            `JOIN cards sr ON sr.id = s.right_id AND sr.codename = json_extract(p.value, '$[1]')`,
        );
        setParams.push(JSON.stringify(w.ruleSets));
      }
      if (w.tprSets?.length) {
        setParts.push(
          `SELECT s.id FROM json_each(?) p JOIN cards m ON m.left_id = json_extract(p.value, '$[0]') AND m.right_id = json_extract(p.value, '$[1]') ` +
            `JOIN cards s ON s.left_id = m.id JOIN cards sr ON sr.id = s.right_id AND sr.codename = 'type_plus_right'`,
        );
        setParams.push(JSON.stringify(w.tprSets));
      }
      const sets = setParts.join(" UNION ");
      const RULES = `('structure','default','content_options')`;
      const ruleOf = `SELECT c.id FROM cards c JOIN cards cr ON cr.id = c.right_id AND cr.codename IN ${RULES} WHERE c.left_id IN (${sets})`;
      const selfMode = envValue("DECKO_LIVE_RULE_SETS_SELF") ?? "all";
      const setCards =
        selfMode === "all"
          ? sets
          : `SELECT s.id FROM cards s JOIN cards sr ON sr.id = s.right_id WHERE s.id IN (${sets}) AND (sr.codename <> 'self' OR s.id IN (SELECT left_id FROM cards WHERE id IN (${ruleOf})))`;
      if (selfMode === "all") fullParts.push(...setParts, ruleOf);
      else fullParts.push(setCards, ruleOf);
      if (selfMode === "all") params.push(...setParams, ...setParams);
      else params.push(...setParams, ...setParams, ...setParams);
    }
    ctes.push(...unionCtes("fs", fullParts));
    const parts: string[] = [
      "SELECT id FROM fs",
      "SELECT id FROM lf",
      "SELECT id FROM cards WHERE left_id IN (SELECT id FROM lf)",
      "SELECT c.id FROM cards c JOIN cards p ON c.left_id = p.id WHERE p.left_id IN (SELECT id FROM lf)",
    ];
    if (w.idKeys.length) {
      parts.push(`SELECT id FROM cards WHERE "key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(w.idKeys));
    }
    if (w.idIds.length) {
      parts.push(`SELECT id FROM cards WHERE id IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(w.idIds));
    }
    ctes.push(...unionCtes("seed", parts));
    ctes.push(
      `pt(id) AS (SELECT type_id FROM cards WHERE id IN (SELECT id FROM fs) ` +
        `UNION SELECT left_id FROM cards WHERE id IN (SELECT id FROM fs) AND left_id IS NOT NULL ` +
        `UNION SELECT right_id FROM cards WHERE id IN (SELECT id FROM fs) AND right_id IS NOT NULL)`,
    );
    ctes.push(
      `ext(id) AS (SELECT id FROM seed ` +
        `UNION SELECT type_id FROM cards WHERE id IN (SELECT id FROM seed) ` +
        `UNION SELECT CASE WHEN side.n = 0 THEN c.left_id ELSE c.right_id END ` +
        `FROM ext e JOIN cards c ON c.id = e.id CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 AS n) side ` +
        `WHERE (side.n = 0 AND c.left_id IS NOT NULL) OR (side.n = 1 AND c.right_id IS NOT NULL))`,
    );
    const starMode = envValue("DECKO_LIVE_STAR_FULL");
    const SETS = `('self','type','right','type_plus_right','all_plus','rstar','star','ltype_rtype')`;
    ctes.push(
      starMode === "1"
        ? `star(id) AS (SELECT c.id FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.id IN (SELECT id FROM ext) AND r."key" LIKE '*%')`
        : starMode === "2"
          ? `star(id) AS (SELECT c.id FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.id IN (SELECT id FROM ext) AND r.codename IN ${SETS})`
          : starMode === "3"
            ? `star(id) AS (SELECT c.id FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.id IN (SELECT id FROM ext) AND r.codename IN ${SETS} ` +
              `UNION SELECT c.id FROM cards c JOIN cards s ON s.id = c.left_id JOIN cards sr ON sr.id = s.right_id JOIN cards r ON r.id = c.right_id ` +
              `WHERE c.id IN (SELECT id FROM ext) AND sr.codename IN ${SETS} AND r."key" LIKE '*%')`
            : `star(id) AS (SELECT NULL WHERE 0)`,
    );
    const head = `WITH RECURSIVE ${ctes.join(", ")} `;
    const fullCols = CARDS_COLUMNS.map((c) => `cards.${c}`).join(", ");
    const identityColumns: readonly string[] = identityRows ? IDENTITY_COLUMNS : CARDS_COLUMNS;
    const idCols = identityColumns.map((c) => `cards.${c}`).join(", ");
    return {
      full: {
        sql:
          `${head}SELECT ${fullCols} FROM cards WHERE (id IN (SELECT id FROM fs) OR id IN (SELECT id FROM pt) OR id IN (SELECT id FROM star)) ` +
          `AND id NOT IN (SELECT value FROM json_each(?))`,
        params: [...params, JSON.stringify([...this.full])],
      },
      identity: {
        sql:
          `${head}SELECT ${idCols} FROM cards WHERE id IN (SELECT id FROM ext) ` +
          `AND id NOT IN (SELECT id FROM fs) AND id NOT IN (SELECT id FROM pt) AND id NOT IN (SELECT id FROM star) AND id NOT IN (SELECT value FROM json_each(?))`,
        params: [...params, JSON.stringify([...this.present])],
      },
      identityColumns,
    };
  }

  absorb(
    w: Widening,
    fullRows: Record<string, unknown>[],
    identityRows: Record<string, unknown>[],
    identityRowsAreFull = false,
  ): Record<string, unknown>[] {
    const fresh: Record<string, unknown>[] = [];
    for (const r of fullRows) if (this.addRow(r, true)) fresh.push(r);
    for (const r of identityRows) if (this.addRow(r, identityRowsAreFull)) fresh.push(r);
    for (const k of w.fullKeys) this.keyKnown.add(k);
    for (const k of w.idKeys) this.keyKnown.add(k);
    for (const k of w.leftKeys) this.keyKnown.add(k);
    for (const i of w.fullIds) this.idKnown.add(i);
    for (const i of w.idIds) this.idKnown.add(i);
    const leftSet = new Set(w.lefts);
    for (const k of w.leftKeys) {
      const id = this.idForKey(k);
      if (id !== undefined) leftSet.add(id);
    }
    for (const l of leftSet) this.leftComplete.add(l);
    for (const l of leftSet) for (const id of this.rows.idsWithLeft(l)) this.leftComplete.add(id);
    return fresh;
  }

  absorbFull(named: number[], rows: Record<string, unknown>[]): void {
    for (const r of rows) this.addRow(r, true);
    for (const i of named) this.idKnown.add(i);
  }

  exportBundle(keepFullIds?: ReadonlySet<number>): SerializedRequestStore {
    const fullRows: CardRow[] = [];
    const identityRows: CardRow[] = [];
    for (const [id, r] of this.rows.entries()) {
      if (this.full.has(id) && (keepFullIds === undefined || keepFullIds.has(id))) {
        fullRows.push(r);
      } else {
        const proj: CardRow = {};
        for (const c of IDENTITY_COLUMNS) proj[c] = r[c] === undefined ? null : r[c];
        identityRows.push(proj);
      }
    }
    return {
      fullRows,
      identityRows,
      keyKnown: [...this.keyKnown],
      idKnown: [...this.idKnown],
      leftComplete: [...this.leftComplete],
      expanded: [...this.expanded],
      contentExpanded: [...this.contentExpanded],
    };
  }

  importBundle(b: SerializedRequestStore): void {
    for (const r of b.fullRows) {
      this.addRow(r, true);
      if (r.id != null) this.answeredIds.add(Number(r.id));
    }
    for (const r of b.identityRows) this.addRow(r, false);
    for (const k of b.keyKnown) this.keyKnown.add(k);
    for (const i of b.idKnown) this.idKnown.add(i);
    for (const l of b.leftComplete) this.leftComplete.add(l);
    for (const e of b.expanded) this.expanded.add(e);
    for (const c of b.contentExpanded) this.contentExpanded.add(c);
  }
}

function memoKeyOf(sql: string, params: readonly unknown[]): string {
  const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
  return `${sql}\u0000${JSON.stringify(ps, (_k, v) => (typeof v === "bigint" ? `${v}n` : v))}`;
}
