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

/** Cloudflare D1's SQLite refuses a compound SELECT of more than five terms
 *  ("too many terms in compound SELECT"). */
export const MAX_COMPOUND_TERMS = 5;

/** `name(id) AS (p1 UNION p2 ...)` as one or more CTEs whose compound
 *  SELECTs each have at most MAX_COMPOUND_TERMS terms: a longer list becomes
 *  `name_0`, `name_1`, ... of up to five terms each, and `name` is their
 *  UNION. The set of ids is the same either way, and every statement that
 *  reads these CTEs tests membership only (`id IN (SELECT id FROM name)`),
 *  so neither the rows nor their order can change. */
export function unionCtes(name: string, parts: readonly string[]): string[] {
  if (parts.length <= MAX_COMPOUND_TERMS) return [`${name}(id) AS (${parts.join(" UNION ")})`];
  const groups: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += MAX_COMPOUND_TERMS) {
    const sub = `${name}_${groups.length}`;
    out.push(...unionCtes(sub, parts.slice(i, i + MAX_COMPOUND_TERMS)));
    groups.push(`SELECT id FROM ${sub}`);
  }
  if (groups.length <= MAX_COMPOUND_TERMS) {
    out.push(`${name}(id) AS (${groups.join(" UNION ")})`);
  } else {
    // More than five groups: union the groups under a distinct name, so
    // their own sub-CTEs cannot collide with this level's.
    out.push(...unionCtes(`${name}_g`, groups));
    out.push(`${name}(id) AS (SELECT id FROM ${name}_g)`);
  }
  return out;
}

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
  /** RULE SETS: [anchor id, set codename] — the set card anchor+<set> and
   *  every rule card under it (set+<setting>) arrive whole. [left id, right
   *  id] with codename "type_plus_right": the set card
   *  <left+right>+*type plus right and its rules. Optional. */
  ruleSets?: [number, string][];
  tprSets?: [number, number][];
  /** set cards whose every junction (their rules) arrives whole: *all and
   *  *all plus, which every page's rule walk reads. Optional. */
  wholeLefts?: number[];
  /** the same by key, for the first trip, before any id is known; with
   *  them, the card each one's *layout rule names (a [[link]] or a bare
   *  name), whole. Optional. */
  wholeLeftKeys?: string[];
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
   *  the active request. Completed idle retention may discard witnesses but
   *  keeps these complete answers only under the caller's checked DB stamp.
   *  Callers get fresh row objects every time, exactly as from a new query. */
  private readonly answerMemo = new Map<string, CardRow[]>();

  retainedPayload(): unknown { return { ...this, rows: this.rows.retainedPayload() }; }

  /** Completed, version-checked idle stores need only their already certified
   * answers. Drop ALL evidence for answering any other query: unseen shapes
   * must fetch again, never infer an empty answer from removed row indexes. */
  releaseWitnesses(): void {
    this.rows.clear();
    for (const set of [this.keyKnown, this.idKnown, this.leftComplete, this.expanded,
      this.contentExpanded, this.present, this.full]) set.clear();
    this.rowsFetched = 0;
  }

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

  /** A SPECULATIVE answer for a certifiable statement the store cannot yet
   *  prove complete: the matching rows it already holds whole, in storage
   *  order. Rows held only as identity rows are left out. A pass that reads
   *  this answer has consumed a speculative answer (the statement's missing
   *  parts are fetched with the next trip), so it is never the page; the
   *  rows it does get are storage's own. Returns [] when any returned row
   *  carries no id (a projection the store cannot tell whole from partial). */
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
      if (this.full.has(Number(r.id))) out.push({ ...r });
    }
    return out;
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

  /** The memoized certified answer, or undefined. A statement answered once
   *  stays answerable (see answerMemo), so the caller may skip missing(). */
  certifiedAnswer(sql: string, params: readonly unknown[]): SQLQueryResult | undefined {
    if (this.answerMemo.size === 0) return undefined;
    const memo = this.answerMemo.get(memoKeyOf(sql, params));
    return memo === undefined ? undefined : { rows: memo.map((r) => ({ ...r })), rowsAffected: 0 };
  }

  answer(sql: string, params: readonly unknown[]): SQLQueryResult {
    const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
    const mk = memoKeyOf(sql, params);
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
   *  caps a statement at 100 bound parameters). The json_each form and the
   *  per-value placeholder form are equivalent here: same rows, same columns,
   *  same order. */
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
      // The layout card a *layout rule under them names: its content is one
      // [[link]] or a bare name. A hint: a miss costs bytes, never output.
      fullParts.push(
        `SELECT l.id FROM cards r JOIN cards s ON s.id = r.right_id AND s.codename = 'layout' ` +
          `JOIN cards l ON l.name = trim(replace(replace(r.db_content, '[[', ''), ']]', '')) ` +
          `WHERE r.left_id IN (${anchors}) AND l.left_id IS NULL`,
      );
      const k = JSON.stringify(w.wholeLeftKeys);
      params.push(k, k, k);
    }
    // RULE SETS of rows the engine reads (live-store-driver.ts frontier):
    // the set cards its rule walk resolves (X+*self, Type+*type,
    // Right+*right, <Type+Right>+*type plus right) and the rule cards under
    // them, whole. The walk reads exactly these whole; as identity rows each
    // set level and each rule level cost one more trip.
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
      // Inlined twice (the set cards, then the rules under them), so the
      // parameters follow the text order. Only the settings the page render
      // reads through these sets are fetched (*structure, *default and
      // *content options); the read/write settings a page does not resolve
      // through these sets stay identity rows, as before. The set cards
      // themselves arrive whole (DECKO_LIVE_RULE_SETS_SELF=filtered: a
      // `*self` set card only when it carries one of those rules, trading a
      // trip on the deepest pages for a large drop in bytes).
      const sets = setParts.join(" UNION ");
      const RULES = `('structure','default','content_options')`;
      const ruleOf = `SELECT c.id FROM cards c JOIN cards cr ON cr.id = c.right_id AND cr.codename IN ${RULES} WHERE c.left_id IN (${sets})`;
      const selfMode = (typeof process !== "undefined" ? process.env?.DECKO_LIVE_RULE_SETS_SELF : undefined) ?? "all";
      const setCards =
        selfMode === "all"
          ? sets
          : `SELECT s.id FROM cards s JOIN cards sr ON sr.id = s.right_id WHERE s.id IN (${sets}) AND (sr.codename <> 'self' OR s.id IN (SELECT left_id FROM cards WHERE id IN (${ruleOf})))`;
      // Each set part joins fs as its own term (same text, same parameter
      // order), so unionCtes counts every term of fs's compound SELECT.
      if (selfMode === "all") fullParts.push(...setParts, ruleOf);
      else fullParts.push(setCards, ruleOf);
      if (selfMode === "all") params.push(...setParams, ...setParams);
      else params.push(...setParams, ...setParams, ...setParams);
    }
    // Every other junction of a left side arrives as an identity row: a
    // junction the render then reads whole (a field X+image, a rule
    // X+*self) costs one more trip. Fetching those junctions whole instead
    // saves a trip here and there, but it moves far more content down every
    // trip, and on a connection where bytes are the expensive side that
    // trade loses.
    ctes.push(...unionCtes("fs", fullParts));
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
    ctes.push(...unionCtes("seed", parts));
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
    // starFull: junctions of the reach whose right part is a `*` card (set
    // cards X+*right, rule cards X+*type+*default ...) arrive whole: the
    // engine's rule walks read them whole, each a trip later otherwise.
    const starMode = typeof process !== "undefined" ? process.env?.DECKO_LIVE_STAR_FULL : undefined;
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
    const head = `WITH ${ctes.join(", ")} `;
    const fullCols = CARDS_COLUMNS.map((c) => `cards.${c}`).join(", ");
    // identityRows off: the rest of the reach arrives whole too (the ring
    // before identity rows, DECKO_LIVE_IDENTITY_RING=0).
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

/** answerMemo's key: the statement text and its normalized parameters. */
function memoKeyOf(sql: string, params: readonly unknown[]): string {
  const ps = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
  return `${sql}\u0000${JSON.stringify(ps, (_k, v) => (typeof v === "bigint" ? `${v}n` : v))}`;
}
