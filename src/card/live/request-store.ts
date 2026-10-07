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
// junctions) or are only linked, so the ring fetches them as identity rows;
// on the 40 gate pages about 87 % of the ring's rows were never read by the
// engine and carried 89 % of its content bytes. A statement is answered
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
import { CARDS_COLUMNS, StoreRowEvaluator, foldNoCase, type CardRow } from "./store-row-evaluator.js";

/** The columns an identity row holds. Every certified shape filters only on
 *  these, and the identity-projecting shapes (S2, S5, S6, S8 `id, key`)
 *  return only these. type_id is the ring's own type hop. */
export const IDENTITY_COLUMNS = ["id", "key", "name", "left_id", "right_id", "type_id", "trash"] as const;

export interface Need {
  keys: string[];
  ids: number[];
  lefts: number[];
  /** S10: the left side keys, each of which must be known AND complete. */
  sideLeftKeys?: string[];
  /** The statement projects columns beyond IDENTITY_COLUMNS: every row it
   *  returns must be held full. */
  full: boolean;
  /** S7: the (left, right) pairs it asks for (fetched full with their left
   *  sides, so the matched junctions need no second trip). */
  pairs?: [number, number][];
  /** S10: its right side keys (with sideLeftKeys: the junctions it asks for,
   *  fetched full with their sides) */
  sideRightKeys?: string[];
}

/** What a statement still needs before the store may answer it. */
export interface Missing {
  keys: string[];
  ids: number[];
  lefts: number[];
  leftKeys: string[];
  /** rows held as identity only that the statement returns in full */
  fullIds: number[];
  /** the statement's projection is full (its keys / ids are fetched full) */
  full: boolean;
  pairs: [number, number][];
  /** S10: the side keys of the junctions it asks for (fetched full) */
  sideL: string[];
  sideR: string[];
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
      return { keys: keys([p[0]]), ids: [], lefts: [], full: true };
    case "SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { keys: keys([p[0]]), ids: [], lefts: [], full: false };
    case "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1":
    case "SELECT * FROM cards WHERE id = ? AND trash = 0":
      return { keys: [], ids: ids([p[0]]), lefts: [], full: true };
    case "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1":
      return { keys: [], ids: ids([p[0]]), lefts: [], full: false };
    case "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1":
      return { keys: [], ids: [], lefts: ids([p[0]]), full: false };
  }
  if (/^SELECT j\.\* FROM cards j WHERE j\.trash = 0 AND \(\(j\.left_id = \? AND j\.right_id = \?\)( OR \(j\.left_id = \? AND j\.right_id = \?\))*\)$/.test(s)) {
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < p.length; i += 2) pairs.push([Number(p[i]), Number(p[i + 1])]);
    return { keys: [], ids: [], lefts: ids(p.filter((_, i) => i % 2 === 0)), full: true, pairs };
  }
  const keyIn = s.match(/^SELECT (\*|id, key) FROM cards WHERE ("key" COLLATE NOCASE|key COLLATE NOCASE|key) IN \((\?(, ?)?)+\) AND trash = 0$/);
  if (keyIn) {
    return { keys: keys(p), ids: [], lefts: [], full: keyIn[1] === "*" };
  }
  if (/^SELECT (\*|id, db_content) FROM cards WHERE id IN \((\?(, ?)?)+\)( AND trash = 0)?$/.test(s)) {
    return { keys: [], ids: ids(p), lefts: [], full: true };
  }
  const m = s.match(
    /^SELECT DISTINCT j\.\* FROM cards j JOIN cards l ON l\.id = j\.left_id AND l\."key" COLLATE NOCASE IN \(([?, ]+)\) JOIN cards r ON r\.id = j\.right_id AND r\."key" COLLATE NOCASE IN \(([?, ]+)\) WHERE j\.trash = 0$/,
  );
  if (m) {
    const nl = (m[1]!.match(/\?/g) ?? []).length;
    // Needs both side key sets, and every present LEFT side complete: the
    // left ids are only known once the keys are (see missing()).
    return { keys: keys(p), ids: [], lefts: [], sideLeftKeys: keys(p.slice(0, nl)), sideRightKeys: keys(p.slice(nl)), full: true };
  }
  return undefined;
}

/** What one widening fetch asks for. Full rows: `fullKeys`, `fullIds`,
 *  `pairs`. Identity rows: everything else it reaches. */
export interface Widening {
  fullKeys: string[];
  idKeys: string[];
  fullIds: number[];
  idIds: number[];
  lefts: number[];
  leftKeys: string[];
  pairs: [number, number][];
  /** junctions whose left key is in sideL and right key in sideR: full */
  sideL: string[];
  sideR: string[];
}

export class RequestStore {
  private readonly rows = new StoreRowEvaluator();
  readonly keyKnown = new Set<string>();
  readonly idKnown = new Set<number>();
  readonly leftComplete = new Set<number>();
  /** rows whose neighborhood (parts, type, left junctions) has already been
   *  requested */
  readonly expanded = new Set<number>();
  /** rows whose content references have already been requested */
  readonly contentExpanded = new Set<number>();
  readonly present = new Set<number>();
  /** present rows held with every column */
  readonly full = new Set<number>();
  rowsFetched = 0;
  /** Certified answers already computed. An answer is given only once every
   *  key / id / left side it needs is known and every row it returns is held
   *  with the columns it projects; the store only ever ADDS rows for unknown
   *  ids (an identity row upgraded to full keeps every identity value), so
   *  no later row can match a certified statement: its answer is final for
   *  the life of the store (one request). Callers get fresh row objects
   *  every time, exactly as from a new query. */
  private readonly answerMemo = new Map<string, CardRow[]>();

  close(): void {
    this.answerMemo.clear();
  }

  /** Seat a fetched row, full or identity only. A full copy of a row held
   *  as identity upgrades it. Returns true when the row is new or upgraded. */
  addRow(r: Record<string, unknown>, isFull: boolean): boolean {
    const id = Number(r.id);
    if (this.present.has(id)) {
      if (!isFull || this.full.has(id)) return false;
      this.rows.replace(r);
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

  idForKey(key: string): number | undefined {
    const r = this.rows.evaluate(`SELECT id FROM cards WHERE "key" COLLATE NOCASE = ?`, [key])?.[0];
    return r === undefined ? undefined : Number(r.id);
  }

  /** What a statement still needs, or undefined when it is not a certifiable
   *  family. All lists empty means: answerable locally now. */
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
          // unknown side: fetch it AND its left junctions in the same trip
          leftKeys.push(k);
          continue;
        }
        const id = this.idForKey(k);
        if (id !== undefined && !this.leftComplete.has(id)) lefts.push(id);
      }
    }
    const fullIds: number[] = [];
    if (need.full && keys.length + ids.length + lefts.length + leftKeys.length === 0) {
      // Every row the statement can return is present: each must be full.
      const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
      for (const r of this.rows.evaluate(sql, ps) ?? []) {
        const id = Number(r.id);
        if (!this.full.has(id)) fullIds.push(id);
      }
    }
    const pairs = need.pairs === undefined ? [] : need.pairs.filter(([l]) => !this.leftComplete.has(l));
    const sideOpen = keys.length + lefts.length + leftKeys.length > 0;
    const sideL = sideOpen ? (need.sideLeftKeys ?? []) : [];
    const sideR = sideOpen ? (need.sideRightKeys ?? []) : [];
    return { keys, ids, lefts, leftKeys, fullIds, full: need.full, pairs, sideL, sideR };
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

  /** The widening fetch: TWO statements for ONE round trip, trash-agnostic.
   *
   *  The reach: the rows for the given keys and ids; every row whose left
   *  side is in `lefts` or is a `leftKeys` card (complete), the next left-hop
   *  below those (complete for the hop-1 rows); and the type / left / right
   *  parts of everything reached.
   *
   *  Statement 1 returns FULL rows: the full keys and ids, the asked pairs,
   *  and identity rows the render now reads whole (fullIds). Statement 2
   *  returns the IDENTITY columns of the rest of the reach. Rows the store
   *  already holds (full ones, for statement 1; any, for statement 2) are
   *  left out of the answer.
   *
   *  Each list binds as ONE JSON parameter expanded by json_each(?), so each
   *  statement carries at most nine parameters however wide the ring is (D1
   *  caps a statement at 100 bound parameters). The json_each rewrite was
   *  checked row-identical, content and order, against the per-value
   *  placeholder form on 89 real captured parameter sets (batch-shape probe,
   *  brandonDojoTech 401190c7). */
  wideningStatements(
    w: Widening,
    identityRows = true,
  ): { full: SQLStatement; identity: SQLStatement; identityColumns: readonly string[] } | undefined {
    const total =
      w.fullKeys.length + w.idKeys.length + w.fullIds.length + w.idIds.length + w.lefts.length + w.leftKeys.length + w.pairs.length;
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
    // Every other junction of a left side arrives as an identity row: a
    // junction the render then reads whole (a field X+image, a rule
    // X+*self) costs one more trip. Fetching the left sides' junctions whole
    // (all of them, or those whose right part is a `*` setting) was measured
    // on the 40 gate pages: 1-2 fewer trips on some pages for about 170 KB
    // more per page, which at the real database's 2.2 s per MB costs more
    // than the trips it saves.
    ctes.push(`fs(id) AS (${fullParts.join(" UNION ")})`);
    const parts: string[] = [
      "SELECT id FROM fs",
      // the left-side rows themselves (a leftKeys side is fetched here)
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
    ctes.push(`seed(id) AS (${parts.join(" UNION ")})`);
    // The type / left / right parts of the rows that arrive whole arrive
    // whole too: they are the deck's shared cards (types, settings, the
    // simple cards a junction is named by), which the render reads whole.
    // The parts of the rest of the reach arrive as identity rows.
    ctes.push(
      `pt(id) AS (SELECT type_id FROM cards WHERE id IN (SELECT id FROM fs) ` +
        `UNION SELECT left_id FROM cards WHERE id IN (SELECT id FROM fs) AND left_id IS NOT NULL ` +
        `UNION SELECT right_id FROM cards WHERE id IN (SELECT id FROM fs) AND right_id IS NOT NULL)`,
    );
    ctes.push(
      `ext(id) AS (SELECT id FROM seed ` +
        `UNION SELECT type_id FROM cards WHERE id IN (SELECT id FROM seed) ` +
        `UNION SELECT left_id FROM cards WHERE id IN (SELECT id FROM seed) AND left_id IS NOT NULL ` +
        `UNION SELECT right_id FROM cards WHERE id IN (SELECT id FROM seed) AND right_id IS NOT NULL)`,
    );
    const head = `WITH ${ctes.join(", ")} `;
    const fullCols = CARDS_COLUMNS.map((c) => `cards.${c}`).join(", ");
    // identityRows off: the rest of the reach arrives whole too (the ring
    // before identity rows, DECKO_LIVE_IDENTITY_RING=0).
    const identityColumns: readonly string[] = identityRows ? IDENTITY_COLUMNS : CARDS_COLUMNS;
    const idCols = identityColumns.map((c) => `cards.${c}`).join(", ");
    return {
      full: {
        sql:
          `${head}SELECT ${fullCols} FROM cards WHERE (id IN (SELECT id FROM fs) OR id IN (SELECT id FROM pt)) ` +
          `AND id NOT IN (SELECT value FROM json_each(?))`,
        params: [...params, JSON.stringify([...this.full])],
      },
      identity: {
        sql:
          `${head}SELECT ${idCols} FROM cards WHERE id IN (SELECT id FROM ext) ` +
          `AND id NOT IN (SELECT id FROM fs) AND id NOT IN (SELECT id FROM pt) AND id NOT IN (SELECT value FROM json_each(?))`,
        params: [...params, JSON.stringify([...this.present])],
      },
      identityColumns,
    };
  }

  /** Record what a widening fetch proved, and seat its rows. Returns the rows
   *  that were new to the store or upgraded to full. */
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
    // hop-1 rows (left side in the expanded set) had their own left
    // junctions fetched by the second hop; the store now holds every hop-1
    // row, including those it held before this fetch.
    for (const l of leftSet) for (const id of this.rows.idsWithLeft(l)) this.leftComplete.add(id);
    return fresh;
  }

  /** Seat rows read whole by another statement (a search companion): every
   *  id in `named` is known, present or absent. */
  absorbFull(named: number[], rows: Record<string, unknown>[]): void {
    for (const r of rows) this.addRow(r, true);
    for (const i of named) this.idKnown.add(i);
  }
}
