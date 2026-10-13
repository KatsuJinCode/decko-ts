// src/card/live/store-row-evaluator.ts
//
// The request store's local answerer: the certified `cards` lookup shapes,
// evaluated in plain JavaScript over the rows ONE request has fetched. No
// node:sqlite, no SQL parser, no WebAssembly, so it runs on the edge runtime.
//
// ROW ORDER IS STORAGE'S ORDER. Every multi-row shape comes back in ascending
// rowid order whatever order the parameters arrive in, with two exceptions,
// both of them planner choices rather than guarantees: a two-arm junction
// OR-chain, and a bare two-element BINARY `key IN (?, ?)`. Each is handled
// explicitly in evaluate() below.
//
// Completeness (which questions may be answered locally at all) is not
// decided here; it stays in request-store.ts. An unrecognized statement
// returns undefined and must go to storage.

/** The `cards` columns, in the deck's own DDL order. `SELECT *` projects these. */
export const CARDS_COLUMNS = [
  "id",
  "name",
  "key",
  "codename",
  "left_id",
  "right_id",
  "current_revision_id",
  "created_at",
  "updated_at",
  "creator_id",
  "updater_id",
  "read_rule_class",
  "read_rule_id",
  "references_expired",
  "trash",
  "type_id",
  "db_content",
] as const;

export type CardRow = Record<string, unknown>;

/** ASCII-only case fold: exactly what SQLite's built-in NOCASE collation does.
 *  `String.prototype.toLowerCase` is NOT this — it also folds Latin-1 and
 *  Greek and CJK, so a key carrying an accented letter would fold
 *  differently here than in a real NOCASE comparison. */
export function foldNoCase(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

/** TEXT affinity: what SQLite applies to a value compared against a TEXT column.
 *  A NULL compares unequal to everything; a BLOB keeps its own storage class. */
function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return sqlNumberToText(v);
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Uint8Array) return null;
  return String(v);
}

/** An INTEGER-bound number prints without a fraction; SQLite renders REAL with
 *  one. Only the integer path is reachable from the engine (keys and ids). */
function sqlNumberToText(n: number): string {
  return Number.isInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n.toString() : String(n);
}

/** Numeric affinity applied to a value compared against an INTEGER column.
 *  A well-formed integer literal in a TEXT parameter converts and can match; any
 *  other text stays TEXT and can never equal an INTEGER storage value. */
function asNumeric(v: unknown): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^[+-]?\d+$/.test(t)) {
      const n = Number(t);
      if (Number.isSafeInteger(n)) return n;
    }
    return v;
  }
  return null;
}

/** `integerColumn = param` under numeric affinity. */
function intEquals(columnValue: unknown, param: unknown): boolean {
  const c = asNumeric(columnValue);
  const p = asNumeric(param);
  if (c === null || p === null) return false;
  if (typeof c === "number" && typeof p === "number") return c === p;
  return false;
}

/** `textColumn = param`, optionally under the NOCASE collation. */
function textEquals(columnValue: unknown, param: unknown, nocase: boolean): boolean {
  const c = asText(columnValue);
  const p = asText(param);
  if (c === null || p === null) return false;
  return nocase ? foldNoCase(c) === foldNoCase(p) : c === p;
}

/** SQLite's BINARY collation is a memcmp over the UTF-8 encoding. Comparing
 *  UTF-16 code units (what `<` does on a JS string) disagrees with that for
 *  astral-plane characters, so encode and compare bytes. */
const UTF8 = new TextEncoder();
function binaryCompare(a: string, b: string): number {
  if (a === b) return 0;
  const x = UTF8.encode(a);
  const y = UTF8.encode(b);
  const n = x.length < y.length ? x.length : y.length;
  for (let i = 0; i < n; i++) {
    const d = x[i]! - y[i]!;
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

export type ShapeId =
  | "S1-key-eq-star" // SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1
  | "S2-key-eq-id" // SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1
  | "S3-id-eq-star-limit" // SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1
  | "S4-id-eq-star" // SELECT * FROM cards WHERE id = ? AND trash = 0
  | "S5-id-eq-trio" // SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1
  | "S6-pair-eq-id" // SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1
  | "S7-pair-or-chain" // SELECT j.* FROM cards j WHERE j.trash = 0 AND ((l,r) OR (l,r)...)
  | "S8-key-in" // SELECT *|id, key FROM cards WHERE [key|"key" COLLATE NOCASE] IN (...) AND trash = 0
  | "S9-id-in" // SELECT *|id, db_content FROM cards WHERE id IN (...) [AND trash = 0]
  | "S10-sidekey-join" // SELECT DISTINCT j.* FROM cards j JOIN cards l ... JOIN cards r ... WHERE j.trash = 0
  | "X-row-by-id" // store-internal: SELECT * FROM cards WHERE id = ?  (no trash filter)
  | "X-row-by-pair" // store-internal: SELECT * FROM cards WHERE left_id = ? AND right_id = ? (no trash filter)
  | "X-id-for-key" // store-internal: SELECT id FROM cards WHERE "key" COLLATE NOCASE = ?
  | "UNRECOGNIZED"; // never answered locally: goes to storage

export interface Classified {
  shape: ShapeId;
  /** `leftIds` for the pair shapes, `rightIds` for S7, `null` elsewhere. */
  leftIds?: number[];
  rightIds?: number[];
  /** Parameter count of the IN list (which half of the S10 params is the left side). */
  leftParamCount?: number;
  /** True when the comparison is NOCASE rather than the column's own BINARY. */
  nocase?: boolean;
  /** True when the statement carries the `AND trash = 0` filter. */
  trashFiltered?: boolean;
  /** Projection, in the statement's own column order. `null` means `*`. */
  columns: readonly string[] | null;
  /** Number of OR arms in S7. Storage's row order turns on exactly 2. */
  arms?: number;
}

const TRIO = ["name", "left_id", "right_id"] as const;
const ID_KEY = ["id", "key"] as const;
const ID_CONTENT = ["id", "db_content"] as const;
const ID_ONLY = ["id"] as const;
const STAR = null;

/**
 * The certified family test. Mirrors request-store.ts's `needsOf()` case for
 * case and regex for regex. The store-internal accessor statements are here too,
 * because the evaluator has to answer those as well as the engine's shapes.
 */
export function classifyShape(sql: string): Classified {
  const s = norm(sql);
  switch (s) {
    case "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { shape: "S1-key-eq-star", columns: STAR, trashFiltered: true };
    case "SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1":
      return { shape: "S2-key-eq-id", columns: ID_ONLY, trashFiltered: true };
    case "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1":
      return { shape: "S3-id-eq-star-limit", columns: STAR, trashFiltered: true };
    case "SELECT * FROM cards WHERE id = ? AND trash = 0":
      return { shape: "S4-id-eq-star", columns: STAR, trashFiltered: true };
    case "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1":
      return { shape: "S5-id-eq-trio", columns: TRIO, trashFiltered: false };
    case "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1":
      return { shape: "S6-pair-eq-id", columns: ID_ONLY, trashFiltered: true };
  }
  if (
    /^SELECT j\.\* FROM cards j WHERE j\.trash = 0 AND \(\(j\.left_id = \? AND j\.right_id = \?\)( OR \(j\.left_id = \? AND j\.right_id = \?\))*\)$/.test(
      s,
    )
  ) {
    const arms = (s.match(/\(j\.left_id = \?/g) ?? []).length;
    return { shape: "S7-pair-or-chain", columns: STAR, trashFiltered: true, arms };
  }
  // The S8 and S9 regexes, taken verbatim from request-store.ts's `needsOf()`
  // rather than re-derived, so the certified family cannot drift between the
  // store and this evaluator.
  if (
    /^SELECT (\*|id, key) FROM cards WHERE ("key" COLLATE NOCASE|key COLLATE NOCASE|key) IN \((\?(, ?)?)+\) AND trash = 0$/.test(
      s,
    )
  ) {
    return {
      shape: "S8-key-in",
      columns: /SELECT \*/.test(s) ? STAR : ID_KEY,
      trashFiltered: true,
      nocase: /COLLATE NOCASE/.test(s),
    };
  }
  if (/^SELECT (\*|id, db_content) FROM cards WHERE id IN \((\?(, ?)?)+\)( AND trash = 0)?$/.test(s)) {
    return {
      shape: "S9-id-in",
      columns: /SELECT \*/.test(s) ? STAR : ID_CONTENT,
      trashFiltered: /AND trash = 0/.test(s),
    };
  }
  const m = s.match(
    /^SELECT DISTINCT j\.\* FROM cards j JOIN cards l ON l\.id = j\.left_id AND l\."key" COLLATE NOCASE IN \(([?, ]+)\) JOIN cards r ON r\.id = j\.right_id AND r\."key" COLLATE NOCASE IN \(([?, ]+)\) WHERE j\.trash = 0$/,
  );
  if (m) {
    const nl = (m[1]?.match(/\?/g) ?? []).length;
    return { shape: "S10-sidekey-join", columns: STAR, trashFiltered: true, leftParamCount: nl };
  }
  // store-internal accessors: the shapes the store asks the evaluator on its
  // own behalf
  if (s === "SELECT * FROM cards WHERE id = ?") {
    return { shape: "X-row-by-id", columns: STAR, trashFiltered: false };
  }
  if (s === "SELECT * FROM cards WHERE left_id = ? AND right_id = ?") {
    return { shape: "X-row-by-pair", columns: STAR, trashFiltered: false };
  }
  if (s === `SELECT id FROM cards WHERE "key" COLLATE NOCASE = ?`) {
    return { shape: "X-id-for-key", columns: ID_ONLY, trashFiltered: false, nocase: true };
  }
  return { shape: "UNRECOGNIZED", columns: STAR, trashFiltered: false };
}

/** Rows in ascending rowid order: the order storage returns multi-row shapes
 *  in, whatever order the parameters arrive in. */
function byRowId(rows: CardRow[]): CardRow[] {
  return rows.sort((a, b) => Number(a.id) - Number(b.id));
}

function project(row: CardRow, columns: readonly string[] | null): CardRow {
  if (columns === null) {
    const out: CardRow = {};
    for (const c of CARDS_COLUMNS) out[c] = row[c] === undefined ? null : row[c];
    return out;
  }
  const out: CardRow = {};
  for (const c of columns) out[c] = row[c] === undefined ? null : row[c];
  return out;
}

/**
 * The request-local row set, with the indexes each certified shape needs.
 * Rows are seated in FETCH order — the store only ever adds, never removes — and
 * every index is derived, so no order information is lost.
 */
export class StoreRowEvaluator {
  private readonly rowsById = new Map<number, CardRow>();
  /** key (BINARY, the column's own collation) -> row id. Keys are unique on the deck. */
  private readonly idByKeyBinary = new Map<string, number>();
  /** key folded ASCII-only (NOCASE) -> row id. */
  private readonly idByKeyNoCase = new Map<string, number>();
  /** left_id -> that side's rows, ascending by row id. */
  private readonly idsByLeft = new Map<number, number[]>();
  /** `left_id` -> `right_id` -> row id (the UNIQUE pair index). */
  private readonly idByPair = new Map<number, Map<number, number>>();

  rowsSeated = 0;

  /** Seat one fetched row. Returns false when its id was already seated, which
   *  mirrors `RequestStore.addRow`. */
  seat(raw: CardRow): boolean {
    const id = asNumeric(raw.id);
    if (typeof id !== "number" || !Number.isSafeInteger(id)) return false;
    if (this.rowsById.has(id)) return false;
    const row: CardRow = {};
    for (const c of CARDS_COLUMNS) row[c] = raw[c] === undefined ? null : raw[c];
    this.rowsById.set(id, row);
    const key = asText(row.key);
    if (key !== null) {
      this.idByKeyBinary.set(key, id);
      this.idByKeyNoCase.set(foldNoCase(key), id);
    }
    const left = asNumeric(row.left_id);
    if (typeof left === "number") {
      let ids = this.idsByLeft.get(left);
      if (ids === undefined) {
        ids = [];
        this.idsByLeft.set(left, ids);
      }
      ids.push(id);
      ids.sort((a, b) => a - b);
      const right = asNumeric(row.right_id);
      if (typeof right === "number") {
        let m = this.idByPair.get(left);
        if (m === undefined) {
          m = new Map<number, number>();
          this.idByPair.set(left, m);
        }
        m.set(right, id);
      }
    }
    this.rowsSeated += 1;
    return true;
  }

  /** Replace a seated row with a fuller copy of it (an identity row read
   *  whole). The indexed columns (key, left, right) are the same values, so
   *  the indexes stand. */
  replace(raw: CardRow): void {
    const id = asNumeric(raw.id);
    if (typeof id !== "number" || !this.rowsById.has(id)) return;
    const row: CardRow = {};
    for (const c of CARDS_COLUMNS) row[c] = raw[c] === undefined ? null : raw[c];
    this.rowsById.set(id, row);
  }

  /** The seated rows whose left side is `left`, ascending by id. */
  idsWithLeft(left: number): readonly number[] {
    return this.idsByLeft.get(left) ?? [];
  }

  get size(): number {
    return this.rowsById.size;
  }

  /** `(sql, params) -> rows`, the same contract as `RequestStore.answer`.
   *  Returns `undefined` for a shape this evaluator does
   *  not implement, which the caller must send to storage. */
  evaluate(sql: string, params: readonly unknown[]): CardRow[] | undefined {
    const c = classifyShape(sql);
    switch (c.shape) {
      case "S1-key-eq-star":
      case "S2-key-eq-id": {
        const id = this.lookupKey(params[0], c.nocase === true);
        if (id === undefined) return [];
        const row = this.rowsById.get(id);
        if (row === undefined) return [];
        if (c.trashFiltered === true && !intEquals(row.trash, 0)) return [];
        return [project(row, c.columns)];
      }
      case "S3-id-eq-star-limit":
      case "S4-id-eq-star":
      case "S5-id-eq-trio":
      case "X-row-by-id": {
        const id = asNumeric(params[0]);
        if (typeof id !== "number") return [];
        const row = this.rowsById.get(id);
        if (row === undefined) return [];
        if (c.trashFiltered === true && !intEquals(row.trash, 0)) return [];
        return [project(row, c.columns)];
      }
      case "S6-pair-eq-id":
      case "X-row-by-pair": {
        const left = asNumeric(params[0]);
        const right = asNumeric(params[1]);
        if (typeof left !== "number" || typeof right !== "number") return [];
        const id = this.idByPair.get(left)?.get(right);
        if (id === undefined) return [];
        const row = this.rowsById.get(id);
        if (row === undefined) return [];
        if (c.trashFiltered === true && !intEquals(row.trash, 0)) return [];
        return [project(row, c.columns)];
      }
      case "X-id-for-key": {
        const id = this.lookupKey(params[0], true);
        if (id === undefined) return [];
        return [{ id }];
      }
      case "S7-pair-or-chain": {
        // Row order is storage's, and storage's changes at exactly two arms:
        // MULTI-INDEX OR emits in arm order, every other arm count falls back
        // to a rowid-ordered search.
        const out: CardRow[] = [];
        const seen = new Set<number>();
        for (let i = 0; i + 1 < params.length; i += 2) {
          const left = asNumeric(params[i]);
          const right = asNumeric(params[i + 1]);
          if (typeof left !== "number" || typeof right !== "number") continue;
          const id = this.idByPair.get(left)?.get(right);
          if (id === undefined || seen.has(id)) continue;
          seen.add(id);
          const row = this.rowsById.get(id);
          if (row === undefined) continue;
          if (!intEquals(row.trash, 0)) continue;
          out.push(project(row, c.columns));
        }
        return c.arms === 2 ? out : byRowId(out);
      }
      case "S8-key-in": {
        const out: CardRow[] = [];
        // `x IN (a, a, b)` returns `a` ONCE: SQLite treats the IN list as a set.
        const seen = new Set<number>();
        for (const p of params) {
          const id = this.lookupKey(p, c.nocase === true);
          if (id === undefined || seen.has(id)) continue;
          seen.add(id);
          const row = this.rowsById.get(id);
          if (row === undefined) continue;
          if (!intEquals(row.trash, 0)) continue;
          out.push(project(row, c.columns));
        }
        // STORAGE'S ORDER, AND IT IS NOT ROWID ORDER HERE. With EXACTLY TWO
        // elements, SQLite compiles `key IN (?, ?)` into a MULTI-INDEX OR over
        // `cards_key_binary_index` and emits rows in INDEX-KEY order; at three
        // elements and up it prefers a scan and returns rowid order. The NOCASE
        // spelling never takes this path — there is no NOCASE index on `key`,
        // so `COLLATE NOCASE IN (?, ?)` still scans and stays rowid-ordered.
        if (c.nocase !== true && params.length === 2) {
          out.sort((a, b) => binaryCompare(asText(a.key) ?? "", asText(b.key) ?? ""));
          return out;
        }
        return byRowId(out);
      }
      case "S9-id-in": {
        const out: CardRow[] = [];
        const seen = new Set<number>();
        for (const p of params) {
          const id = asNumeric(p);
          if (typeof id !== "number" || !Number.isSafeInteger(id) || seen.has(id)) continue;
          seen.add(id);
          const row = this.rowsById.get(id);
          if (row === undefined) continue;
          if (c.trashFiltered === true && !intEquals(row.trash, 0)) continue;
          out.push(project(row, c.columns));
        }
        return byRowId(out);
      }
      case "S10-sidekey-join": {
        const n = c.leftParamCount ?? 0;
        const leftIds = new Set<number>();
        const rightIds = new Set<number>();
        for (let i = 0; i < params.length; i++) {
          const id = this.lookupKey(params[i], true);
          if (id === undefined) continue;
          if (i < n) leftIds.add(id);
          else rightIds.add(id);
        }
        const out: CardRow[] = [];
        for (const leftId of leftIds) {
          for (const rowId of this.idsByLeft.get(leftId) ?? []) {
            const row = this.rowsById.get(rowId);
            if (row === undefined) continue;
            if (!intEquals(row.trash, 0)) continue;
            const right = asNumeric(row.right_id);
            if (typeof right !== "number" || !rightIds.has(right)) continue;
            out.push(project(row, c.columns));
          }
        }
        return byRowId(out); // DISTINCT j.* over a primary key is a dedupe, not a reorder
      }
      case "UNRECOGNIZED":
        return undefined;
    }
  }

  private lookupKey(param: unknown, nocase: boolean): number | undefined {
    const map = nocase ? this.idByKeyNoCase : this.idByKeyBinary;
    if (nocase) {
      const k = asText(param);
      return k === null ? undefined : map.get(foldNoCase(k));
    }
    const k = asText(param);
    return k === null ? undefined : map.get(k);
  }
}