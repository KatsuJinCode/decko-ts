// src/card/live/live-store-driver.ts
//
// A driver that answers the engine from the request store whenever the store
// can prove the answer complete, and otherwise costs ONE round trip that
// carries, besides the statements the render is waiting on, the next ring of
// the page's neighborhood:
//
//   - every card a read card points at: its type, its left and right parts,
//     the cards its content nests or links ({{...}}, [[...]]);
//   - every junction whose left side is a read card, two hops deep
//     (X+*self, X+*self+*layout, Type+*type+*structure, About+image ...): the
//     rows rule resolution and field nests ask for, by pair.
//
// Nothing is recorded and nothing is predicted from a previous request: the
// ring is computed from rows this request has already read. The store and the
// exact-statement memo die with the request. Ported from the proof of concept
// (decko-poc-live-batch benchmarks/poc-live-batch/live-store-render.ts).

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { referencedNames } from "../render/nest-syntax.js";
import { DeckoName } from "../name.js";
import { RequestStore } from "./request-store.js";
import { foldNoCase } from "./store-row-evaluator.js";

export interface LiveStoreStats {
  round_trips: number;
  local_answers: number;
  exact_answers: number;
  rows_fetched: number;
  statements_sent: number;
}

const keyOf = (sql: string, params: readonly unknown[]) =>
  `${sql}\u0000${JSON.stringify(params ?? [], (_k, v) => (typeof v === "bigint" ? `${v}n` : v))}`;

const defer: (fn: () => void) => void =
  typeof setImmediate === "function" ? (fn) => void setImmediate(fn) : (fn) => void setTimeout(fn, 0);

const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

/** The NOCASE keys of the simple parts of a referenced name, resolved against
 *  its context. A junction's own key column is NULL (compound names live as
 *  left/right ids); its simple parts are fetched by key and the junction
 *  arrives through their left-junction hops. */
function keysOfName(raw: string, context: string | undefined): string[] {
  try {
    let parsed = DeckoName.parse(raw.trim());
    if (!parsed.isAbsolute) {
      if (context === undefined) return [];
      parsed = parsed.absoluteName(DeckoName.parse(context));
    }
    return parsed.s
      .split("+")
      .map((part) => foldNoCase(DeckoName.parse(part).key))
      .filter((k) => k !== "");
  } catch {
    return [];
  }
}

export class LiveStoreDriver implements SQLDatabaseDriver {
  readonly store = new RequestStore();
  private readonly exact = new Map<string, SQLQueryResult>();
  readonly stats: LiveStoreStats = {
    round_trips: 0,
    local_answers: 0,
    exact_answers: 0,
    rows_fetched: 0,
    statements_sent: 0,
  };
  /** ids of rows the ENGINE has read (as opposed to rows the ring fetched
   *  ahead of it). Only demanded rows are expanded, so the ring stays one hop
   *  ahead of the render instead of walking the whole deck. */
  private readonly demanded = new Set<number>();
  /** content-referenced keys whose left junctions should be fetched */
  private readonly leftKeysPending = new Set<string>();

  /** ringAll: expand the ring around EVERY fetched row, not only the rows
   *  the engine read. More rows per trip, fewer dependency levels. */
  constructor(
    private readonly base: SQLDatabaseDriver,
    private readonly opts: { ringAll?: boolean } = {},
  ) {}

  private nameOf(id: number, depth = 0): string | undefined {
    if (depth > 8) return undefined;
    const r = this.store.rowById(id);
    if (!r) return undefined;
    if (typeof r.name === "string" && r.name !== "") return r.name;
    if (r.left_id == null || r.right_id == null) return undefined;
    const l = this.nameOf(Number(r.left_id), depth + 1);
    const rr = this.nameOf(Number(r.right_id), depth + 1);
    return l !== undefined && rr !== undefined ? `${l}+${rr}` : undefined;
  }

  private markDemanded(s: SQLStatement, ans: SQLQueryResult): void {
    for (const r of ans.rows as Record<string, unknown>[]) if (r.id != null) this.demanded.add(Number(r.id));
    if (/WHERE id = \?/.test(s.sql)) this.demanded.add(Number((s.params ?? [])[0]));
  }

  /** The neighborhood ring of the demanded rows not yet expanded. */
  private frontier(): { ids: number[]; lefts: number[]; leftKeys: string[] } {
    const ids = new Set<number>();
    const lefts = new Set<number>();
    const leftKeys = new Set<string>();
    for (const k of this.leftKeysPending) {
      const id = this.store.keyKnown.has(k) ? this.store.idForKey(k) : undefined;
      if (id !== undefined) {
        if (!this.store.leftComplete.has(id)) lefts.add(id);
        this.leftKeysPending.delete(k);
      }
    }
    for (const id of this.opts.ringAll === true ? [...this.store.present] : this.demanded) {
      if (this.store.expanded.has(id)) continue;
      const r = this.store.rowById(id) as
        | { id: number; type_id: number; left_id: number | null; right_id: number | null; db_content: string | null; trash: number }
        | undefined;
      if (r === undefined) continue;
      this.store.expanded.add(r.id);
      if (r.trash) continue;
      for (const i of [r.type_id, r.left_id, r.right_id]) {
        if (i != null && !this.store.idKnown.has(i)) ids.add(i);
      }
      if (!this.store.leftComplete.has(r.id)) lefts.add(r.id);
      const content = r.db_content ?? "";
      if (content.includes("{{") || content.includes("[[")) {
        const ctx = this.nameOf(r.id);
        const names: { name: string }[] = [];
        try {
          names.push(...referencedNames(content));
        } catch {
          /* unparseable content: nothing to widen */
        }
        for (const m of content.matchAll(LINK_RE)) names.push({ name: m[1]! });
        for (const n of names) {
          if (n.name.startsWith("_")) continue;
          for (const k of keysOfName(n.name, ctx)) {
            if (!this.store.keyKnown.has(k)) leftKeys.add(k);
            else this.leftKeysPending.add(k);
          }
        }
      }
    }
    return { ids: [...ids], lefts: [...lefts], leftKeys: [...leftKeys] };
  }

  async query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const [r] = await this.batch([{ sql, params }]);
    return r as SQLQueryResult<T>;
  }

  /** "block": a statement the store cannot answer costs a round trip now (the
   *  render waits for it). "spec": it is recorded, answered with zero rows,
   *  and the render keeps going: a speculative pass. */
  mode: "block" | "spec" = "block";
  /** In "block" mode: how many more blocking round trips this pass may pay
   *  before the driver turns speculative for the rest of the pass (undefined
   *  = no limit). A pass that turns speculative has consumed a speculative
   *  answer, so it is never the page. */
  blockTrips: number | undefined = undefined;
  private readonly specKeys = new Set<string>();
  private readonly specIds = new Set<number>();
  private readonly specLefts = new Set<number>();
  private readonly specLeftKeys = new Set<string>();
  private readonly specExact = new Map<string, SQLStatement>();

  /** Statements a speculative pass recorded and has not yet fetched. */
  get pendingCount(): number {
    return this.specKeys.size + this.specIds.size + this.specLefts.size + this.specLeftKeys.size + this.specExact.size;
  }

  async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const results: (SQLQueryResult | undefined)[] = new Array(stmts.length);
      const needKeys = new Set<string>();
      const needIds = new Set<number>();
      const needLefts = new Set<number>();
      const needLeftKeys = new Set<string>();
      const pendingExact = new Map<string, SQLStatement>();
      stmts.forEach((s, i) => {
        const params = s.params ?? [];
        const miss = this.store.missing(s.sql, params);
        if (miss !== undefined) {
          if (miss.keys.length + miss.ids.length + miss.lefts.length + miss.leftKeys.length === 0) {
            const ans = this.store.answer(s.sql, params);
            results[i] = ans;
            this.stats.local_answers += 1;
            this.markDemanded(s, ans);
          } else {
            miss.keys.forEach((k) => needKeys.add(k));
            miss.ids.forEach((x) => needIds.add(x));
            miss.lefts.forEach((x) => needLefts.add(x));
            miss.leftKeys.forEach((x) => needLeftKeys.add(x));
            results[i] = { rows: [], rowsAffected: 0 };
          }
          return;
        }
        const k = keyOf(s.sql, params);
        const known = this.exact.get(k);
        if (known !== undefined) {
          results[i] = { ...known, rows: known.rows.slice() };
          this.stats.exact_answers += 1;
          return;
        }
        if (!/^\s*(SELECT|WITH)\b/i.test(s.sql)) {
          // Writes never reach this driver: the request path that uses it
          // serves anonymous GET pages only.
          throw new Error(`live-store render reached a non-read statement: ${s.sql.slice(0, 120)}`);
        }
        pendingExact.set(k, { sql: s.sql, params });
        results[i] = { rows: [], rowsAffected: 0 };
      });
      if (pendingExact.size === 0 && needKeys.size + needIds.size + needLefts.size + needLeftKeys.size === 0) {
        return results as SQLQueryResult[];
      }
      if (this.mode === "block" && this.blockTrips !== undefined) {
        if (this.blockTrips <= 0) this.mode = "spec";
        else this.blockTrips -= 1;
      }
      if (this.mode === "spec") {
        needKeys.forEach((k) => this.specKeys.add(k));
        needIds.forEach((x) => this.specIds.add(x));
        needLefts.forEach((x) => this.specLefts.add(x));
        needLeftKeys.forEach((x) => this.specLeftKeys.add(x));
        for (const [k, v] of pendingExact) this.specExact.set(k, v);
        return results as SQLQueryResult[];
      }
      // DataLoader-style: every read that misses within the same macrotask
      // (concurrent branches of the render) joins ONE round trip.
      needKeys.forEach((k) => this.tickKeys.add(k));
      needIds.forEach((x) => this.tickIds.add(x));
      needLefts.forEach((x) => this.tickLefts.add(x));
      needLeftKeys.forEach((x) => this.tickLeftKeys.add(x));
      for (const [k, v] of pendingExact) this.tickExact.set(k, v);
      if (this.tickFlush === undefined) {
        this.tickFlush = new Promise<void>((resolve, reject) => {
          // setImmediate where the runtime has it (Node); a zero timeout on
          // the edge runtime. Either way: after the current macrotask.
          defer(() => {
            const keys = new Set(this.tickKeys);
            const ids = new Set(this.tickIds);
            const lefts = new Set(this.tickLefts);
            const leftKeys = new Set(this.tickLeftKeys);
            const exact = new Map(this.tickExact);
            this.tickKeys.clear();
            this.tickIds.clear();
            this.tickLefts.clear();
            this.tickLeftKeys.clear();
            this.tickExact.clear();
            this.tickFlush = undefined;
            this.roundTrip(keys, ids, lefts, exact, leftKeys).then(resolve, reject);
          });
        });
      }
      await this.tickFlush;
    }
    throw new Error("live-store driver could not settle a batch in 4 round trips");
  }

  private readonly tickKeys = new Set<string>();
  private readonly tickIds = new Set<number>();
  private readonly tickLefts = new Set<number>();
  private readonly tickLeftKeys = new Set<string>();
  private readonly tickExact = new Map<string, SQLStatement>();
  private tickFlush: Promise<void> | undefined;

  /** Fetch everything a speculative pass recorded (plus the ring) in ONE
   *  round trip. */
  async flushSpeculative(): Promise<void> {
    const keys = new Set(this.specKeys);
    const ids = new Set(this.specIds);
    const lefts = new Set(this.specLefts);
    const exact = new Map(this.specExact);
    const leftKeys = new Set(this.specLeftKeys);
    this.specLeftKeys.clear();
    this.specKeys.clear();
    this.specIds.clear();
    this.specLefts.clear();
    this.specExact.clear();
    await this.roundTrip(keys, ids, lefts, exact, leftKeys);
  }

  private async roundTrip(
    needKeys: Set<string>,
    needIds: Set<number>,
    needLefts: Set<number>,
    pendingExact: Map<string, SQLStatement>,
    needLeftKeys: Set<string> = new Set(),
  ): Promise<void> {
    // ONE round trip: what the render is waiting on + the ring.
    const ring = this.frontier();
    ring.ids.forEach((x) => needIds.add(x));
    ring.lefts.forEach((x) => needLefts.add(x));
    ring.leftKeys.forEach((k) => needLeftKeys.add(k));
    const keys = [...needKeys].filter((k) => !this.store.keyKnown.has(k));
    const ids = [...needIds].filter((x) => !this.store.idKnown.has(x));
    const lefts = [...needLefts].filter((x) => !this.store.leftComplete.has(x));
    const leftKeys = [...needLeftKeys].filter((k) => !this.store.keyKnown.has(k));
    const widening = this.store.wideningStatement(keys, ids, lefts, leftKeys);
    const exact = [...pendingExact.entries()].filter(([k]) => !this.exact.has(k));
    // Search companions (round 9 step 1): for every search statement in this
    // trip, the rows its results lead to (each result row, its type, its left
    // and right parts) ride the SAME trip, so the engine's follow-up read of
    // the result rows answers from the store instead of costing a level.
    const companions: { at: number; stmt: SQLStatement }[] = [];
    exact.forEach(([, v], i) => {
      const c = LiveStoreDriver.searchCompanion(v);
      if (c !== undefined) companions.push({ at: i, stmt: c });
    });
    const send: SQLStatement[] = [
      ...(widening ? [widening] : []),
      ...exact.map(([, v]) => v),
      ...companions.map((c) => c.stmt),
    ];
    if (send.length === 0) return;
    this.stats.round_trips += 1;
    this.stats.statements_sent += send.length;
    const res = await this.base.batch(send);
    let j = 0;
    if (widening) {
      const rows = (res[j++]?.rows ?? []) as Record<string, unknown>[];
      const before = this.store.rowsFetched;
      this.store.absorb(keys, ids, lefts, rows, leftKeys);
      this.stats.rows_fetched += this.store.rowsFetched - before;
    }
    for (const [k] of exact) this.exact.set(k, res[j++] ?? { rows: [], rowsAffected: 0 });
    if (companions.length > 0) {
      const before = this.store.rowsFetched;
      for (const c of companions) {
        const rows = (res[j++]?.rows ?? []) as Record<string, unknown>[];
        // The companion reads every row the search's result rows name by id
        // (no trash filter), so each such id is now known: present if its row
        // came back, absent otherwise.
        const named: number[] = [];
        for (const r of (this.exact.get(exact[c.at]![0])?.rows ?? []) as Record<string, unknown>[]) {
          for (const col of ["id", "type_id", "left_id", "right_id"]) {
            if (r[col] !== null && r[col] !== undefined) named.push(Number(r[col]));
          }
        }
        this.store.absorb([], named, [], rows);
      }
      this.stats.rows_fetched += this.store.rowsFetched - before;
    }
  }

  /** The companion of a search statement (a `cards` row select generated by
   *  the CQL engine: `SELECT [DISTINCT] c0.* ...`): every row its result
   *  names by id, read trash-agnostically, with the search's own parameters
   *  (so the companion never binds more than the search does). Undefined for
   *  any other statement, and for REGEXP searches, whose function a server
   *  may not host. */
  static searchCompanion(s: SQLStatement): SQLStatement | undefined {
    if (!/^\s*SELECT\s+(DISTINCT\s+)?c0\.\*/i.test(s.sql) || /REGEXP/i.test(s.sql)) return undefined;
    return {
      sql:
        `WITH __q AS (${s.sql}) SELECT cards.* FROM cards WHERE id IN ` +
        `(SELECT id FROM __q UNION SELECT type_id FROM __q UNION SELECT left_id FROM __q UNION SELECT right_id FROM __q)`,
      params: s.params ?? [],
    };
  }

  close(): void {
    this.store.close();
    this.exact.clear();
  }
}
