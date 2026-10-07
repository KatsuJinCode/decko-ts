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
// Fetches are trash-AGNOSTIC (no trash filter), so a statement's own
// `trash = 0` filter, applied locally, gives storage's answer. Anything the
// store cannot prove goes to storage. The store is created per request and
// dropped with it: nothing here survives the request.
//
// Keys are compared under SQLite's NOCASE collation, which folds ASCII only
// (foldNoCase); the deck's keys are unique under it.

import type { SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { StoreRowEvaluator, foldNoCase, type CardRow } from "./store-row-evaluator.js";

export interface Need {
  keys: string[];
  ids: number[];
  lefts: number[];
  /** S10: the left side keys, each of which must be known AND complete. */
  sideLeftKeys?: string[];
}

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

/** The certified statement families and the keys / ids / left sides each
 *  needs before the store may answer it. undefined = not certifiable. */
export function needsOf(sql: string, params: readonly unknown[]): Need | undefined {
  const s = norm(sql);
  const p = params as (string | number)[];
  const keys = (xs: readonly unknown[]) => xs.map((x) => foldNoCase(String(x)));
  const ids = (xs: readonly unknown[]) => xs.map((x) => Number(x));
  switch (s) {
    case "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
    case "SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { keys: keys([p[0]]), ids: [], lefts: [] };
    case "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1":
    case "SELECT * FROM cards WHERE id = ? AND trash = 0":
    case "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1":
      return { keys: [], ids: ids([p[0]]), lefts: [] };
    case "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1":
      return { keys: [], ids: [], lefts: ids([p[0]]) };
  }
  if (/^SELECT j\.\* FROM cards j WHERE j\.trash = 0 AND \(\(j\.left_id = \? AND j\.right_id = \?\)( OR \(j\.left_id = \? AND j\.right_id = \?\))*\)$/.test(s)) {
    return { keys: [], ids: [], lefts: ids(p.filter((_, i) => i % 2 === 0)) };
  }
  if (/^SELECT (\*|id, key) FROM cards WHERE ("key" COLLATE NOCASE|key COLLATE NOCASE|key) IN \((\?(, ?)?)+\) AND trash = 0$/.test(s)) {
    return { keys: keys(p), ids: [], lefts: [] };
  }
  if (/^SELECT (\*|id, db_content) FROM cards WHERE id IN \((\?(, ?)?)+\)( AND trash = 0)?$/.test(s)) {
    return { keys: [], ids: ids(p), lefts: [] };
  }
  const m = s.match(
    /^SELECT DISTINCT j\.\* FROM cards j JOIN cards l ON l\.id = j\.left_id AND l\."key" COLLATE NOCASE IN \(([?, ]+)\) JOIN cards r ON r\.id = j\.right_id AND r\."key" COLLATE NOCASE IN \(([?, ]+)\) WHERE j\.trash = 0$/,
  );
  if (m) {
    const nl = (m[1]!.match(/\?/g) ?? []).length;
    // Needs both side key sets, and every present LEFT side complete: the
    // left ids are only known once the keys are (see missing()).
    return { keys: keys(p), ids: [], lefts: [], sideLeftKeys: keys(p.slice(0, nl)) };
  }
  return undefined;
}

export class RequestStore {
  private readonly rows = new StoreRowEvaluator();
  readonly keyKnown = new Set<string>();
  readonly idKnown = new Set<number>();
  readonly leftComplete = new Set<number>();
  /** rows whose neighborhood (parts, type, left junctions, content refs) has
   *  already been requested */
  readonly expanded = new Set<number>();
  readonly present = new Set<number>();
  rowsFetched = 0;
  /** Certified answers already computed. An answer is given only once every
   *  key / id / left side it needs is known, and the store only ever ADDS
   *  rows for unknown ids, so no later row can match a certified statement:
   *  its answer is final for the life of the store (one request). Callers get
   *  fresh row objects every time, exactly as from a new query. */
  private readonly answerMemo = new Map<string, CardRow[]>();

  close(): void {
    this.answerMemo.clear();
  }

  addRow(r: Record<string, unknown>): boolean {
    const id = Number(r.id);
    if (this.present.has(id)) return false;
    if (!this.rows.seat(r)) return false;
    this.present.add(id);
    this.idKnown.add(id);
    if (typeof r.key === "string") this.keyKnown.add(foldNoCase(r.key));
    this.rowsFetched += 1;
    return true;
  }

  rowById(id: number): CardRow | undefined {
    if (!this.present.has(id)) return undefined;
    return this.rows.evaluate("SELECT * FROM cards WHERE id = ?", [id])?.[0];
  }

  /** The junction row (left, right), if the store holds it. */
  rowByPair(left: number, right: number): CardRow | undefined {
    return this.rows.evaluate("SELECT * FROM cards WHERE left_id = ? AND right_id = ?", [left, right])?.[0];
  }

  idForKey(key: string): number | undefined {
    const r = this.rows.evaluate(`SELECT id FROM cards WHERE "key" COLLATE NOCASE = ?`, [key])?.[0];
    return r === undefined ? undefined : Number(r.id);
  }

  /** The keys / ids / lefts a statement still needs, or undefined when it is
   *  not a certifiable family. An empty need means: answerable locally now. */
  missing(
    sql: string,
    params: readonly unknown[],
  ): { keys: string[]; ids: number[]; lefts: number[]; leftKeys: string[] } | undefined {
    const need = needsOf(sql, params);
    if (need === undefined) return undefined;
    const keys = need.keys.filter((k) => !this.keyKnown.has(k));
    const ids = need.ids.filter((i) => !this.idKnown.has(i));
    const lefts = need.lefts.filter((l) => !this.leftComplete.has(l));
    const leftKeys: string[] = [];
    if (need.sideLeftKeys) {
      for (const k of need.sideLeftKeys) {
        if (!this.keyKnown.has(k)) {
          // unknown side: fetch it AND its left junctions in the same trip
          leftKeys.push(k);
          continue;
        }
        const id = this.idForKey(k);
        if (id !== undefined && !this.leftComplete.has(id)) lefts.push(id);
      }
    }
    return { keys, ids, lefts, leftKeys };
  }

  answer(sql: string, params: readonly unknown[]): SQLQueryResult {
    const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
    const mk = `${sql}\u0000${JSON.stringify(ps, (_k, v) => (typeof v === "bigint" ? `${v}n` : v))}`;
    const memo = this.answerMemo.get(mk);
    if (memo !== undefined) return { rows: memo.map((r) => ({ ...r })), rowsAffected: 0 };
    const rows = this.rows.evaluate(sql, ps);
    if (rows === undefined) throw new Error(`request store: no local evaluator for a certified shape: ${norm(sql).slice(0, 120)}`);
    this.answerMemo.set(mk, rows.map((r) => ({ ...r })));
    return { rows: rows.map((r) => ({ ...r })), rowsAffected: 0 };
  }

  /** ONE statement that fetches, trash-agnostically: the rows for the given
   *  keys and ids; every row whose left side is in `lefts` (complete), the
   *  next left-hop below those (complete for the hop-1 rows); and the type /
   *  left / right parts of everything selected.
   *
   *  Each list binds as ONE JSON parameter expanded by json_each(?), so the
   *  statement carries at most three parameters however wide the ring is
   *  (D1 caps a statement at 100 bound parameters). The json_each rewrite was
   *  checked row-identical, content and order, against the per-value
   *  placeholder form on 89 real captured parameter sets (batch-shape probe,
   *  brandonDojoTech 401190c7). */
  wideningStatement(keys: string[], ids: number[], lefts: number[], leftKeys: string[] = []): SQLStatement | undefined {
    if (keys.length + ids.length + lefts.length + leftKeys.length === 0) return undefined;
    const ctes: string[] = [];
    const params: unknown[] = [];
    const lfParts: string[] = [];
    if (lefts.length) {
      lfParts.push(`SELECT value FROM json_each(?)`);
      params.push(JSON.stringify(lefts));
    }
    if (leftKeys.length) {
      lfParts.push(`SELECT id FROM cards WHERE "key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(leftKeys));
    }
    if (lfParts.length === 0) lfParts.push("SELECT NULL WHERE 0");
    ctes.push(`lf(id) AS (${lfParts.join(" UNION ")})`);
    const parts: string[] = [
      // the left-side rows themselves (a leftKeys side is fetched here)
      "SELECT id FROM lf",
      "SELECT id FROM cards WHERE left_id IN (SELECT id FROM lf)",
      "SELECT c.id FROM cards c JOIN cards p ON c.left_id = p.id WHERE p.left_id IN (SELECT id FROM lf)",
    ];
    if (keys.length) {
      parts.push(`SELECT id FROM cards WHERE "key" COLLATE NOCASE IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(keys));
    }
    if (ids.length) {
      parts.push(`SELECT id FROM cards WHERE id IN (SELECT value FROM json_each(?))`);
      params.push(JSON.stringify(ids));
    }
    ctes.push(`seed(id) AS (${parts.join(" UNION ")})`);
    ctes.push(
      `ext(id) AS (SELECT id FROM seed ` +
        `UNION SELECT type_id FROM cards WHERE id IN (SELECT id FROM seed) ` +
        `UNION SELECT left_id FROM cards WHERE id IN (SELECT id FROM seed) AND left_id IS NOT NULL ` +
        `UNION SELECT right_id FROM cards WHERE id IN (SELECT id FROM seed) AND right_id IS NOT NULL)`,
    );
    const sql = `WITH ${ctes.join(", ")} SELECT cards.* FROM cards WHERE id IN (SELECT id FROM ext)`;
    return { sql, params };
  }

  /** Record what a widening fetch proved, and seat its rows. Returns the rows
   *  that were new to the store. */
  absorb(
    keys: string[],
    ids: number[],
    lefts: number[],
    rows: Record<string, unknown>[],
    leftKeys: string[] = [],
  ): Record<string, unknown>[] {
    const fresh: Record<string, unknown>[] = [];
    for (const r of rows) if (this.addRow(r)) fresh.push(r);
    for (const k of keys) this.keyKnown.add(k);
    for (const k of leftKeys) this.keyKnown.add(k);
    for (const i of ids) this.idKnown.add(i);
    const leftSet = new Set(lefts);
    const lk = new Set(leftKeys);
    for (const r of rows) if (typeof r.key === "string" && lk.has(foldNoCase(r.key))) leftSet.add(Number(r.id));
    for (const l of leftSet) this.leftComplete.add(l);
    // hop-1 rows (left side in the expanded set) had their own left
    // junctions fetched by the second hop.
    for (const r of rows) if (leftSet.has(Number(r.left_id))) this.leftComplete.add(Number(r.id));
    return fresh;
  }
}
