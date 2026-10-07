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
// What the render asked for (the cards its statements name) and the cards
// read cards NEST arrive whole; the rest of the ring arrives as identity rows
// (request-store.ts, IDENTITY_COLUMNS), which is all a completeness proof or
// a link needs. An identity row the render then reads whole is fetched whole
// with the next trip.
//
// Nothing is recorded and nothing is predicted from a previous request: the
// ring is computed from rows this request has already read. The store and the
// exact-statement memo die with the request. Ported from the proof of concept
// (decko-poc-live-batch benchmarks/poc-live-batch/live-store-render.ts).

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { referencedNames } from "../render/nest-syntax.js";
import { DeckoName } from "../name.js";
import { RequestStore, type Missing, type Widening } from "./request-store.js";
import { CARDS_COLUMNS, foldNoCase } from "./store-row-evaluator.js";
import { compactStatement, compactWrap, decodeCompact } from "./compact-rows.js";

export interface LiveStoreStats {
  round_trips: number;
  local_answers: number;
  exact_answers: number;
  rows_fetched: number;
  statements_sent: number;
  /** statements a compact encoding could not carry, re-sent plain */
  compact_fallbacks: number;
  /** ring rows fetched whole / as identity only */
  full_rows: number;
  identity_rows: number;
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

/** Everything one round trip must fetch. */
class NeedSet {
  readonly fullKeys = new Set<string>();
  readonly idKeys = new Set<string>();
  readonly fullIds = new Set<number>();
  readonly idIds = new Set<number>();
  readonly lefts = new Set<number>();
  readonly leftKeys = new Set<string>();
  readonly pairs = new Map<string, [number, number]>();
  readonly sideL = new Set<string>();
  readonly sideR = new Set<string>();
  readonly exact = new Map<string, SQLStatement>();

  get size(): number {
    return (
      this.fullKeys.size +
      this.idKeys.size +
      this.fullIds.size +
      this.idIds.size +
      this.lefts.size +
      this.leftKeys.size +
      this.pairs.size +
      this.sideL.size +
      this.exact.size
    );
  }

  addMissing(m: Missing): void {
    m.keys.forEach((k) => (m.full ? this.fullKeys : this.idKeys).add(k));
    m.ids.forEach((x) => (m.full ? this.fullIds : this.idIds).add(x));
    m.fullIds.forEach((x) => this.fullIds.add(x));
    m.lefts.forEach((x) => this.lefts.add(x));
    m.leftKeys.forEach((k) => this.leftKeys.add(k));
    m.pairs.forEach((p) => this.pairs.set(`${p[0]},${p[1]}`, p));
    m.sideL.forEach((k) => this.sideL.add(k));
    m.sideR.forEach((k) => this.sideR.add(k));
  }

  addAll(o: NeedSet): void {
    o.fullKeys.forEach((k) => this.fullKeys.add(k));
    o.idKeys.forEach((k) => this.idKeys.add(k));
    o.fullIds.forEach((x) => this.fullIds.add(x));
    o.idIds.forEach((x) => this.idIds.add(x));
    o.lefts.forEach((x) => this.lefts.add(x));
    o.leftKeys.forEach((k) => this.leftKeys.add(k));
    o.pairs.forEach((v, k) => this.pairs.set(k, v));
    o.sideL.forEach((k) => this.sideL.add(k));
    o.sideR.forEach((k) => this.sideR.add(k));
    o.exact.forEach((v, k) => this.exact.set(k, v));
  }

  /** Move everything out into a fresh set. */
  take(): NeedSet {
    const t = new NeedSet();
    t.addAll(this);
    this.fullKeys.clear();
    this.idKeys.clear();
    this.fullIds.clear();
    this.idIds.clear();
    this.lefts.clear();
    this.leftKeys.clear();
    this.pairs.clear();
    this.sideL.clear();
    this.sideR.clear();
    this.exact.clear();
    return t;
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
    compact_fallbacks: 0,
    full_rows: 0,
    identity_rows: 0,
  };
  /** ids of rows the ENGINE has read (as opposed to rows the ring fetched
   *  ahead of it). Only demanded rows are expanded, so the ring stays one hop
   *  ahead of the render instead of walking the whole deck. */
  private readonly demanded = new Set<number>();
  /** content-referenced keys whose left junctions should be fetched */
  private readonly leftKeysPending = new Set<string>();
  private readonly compact: boolean;
  private readonly identityRing: boolean;

  /** ringAll: expand the ring around EVERY fetched row, not only the rows
   *  the engine read. More rows per trip, fewer dependency levels.
   *  compact: the compact result encoding (sendBatch). identityRing: ring
   *  neighbours as identity rows (off: every ring row whole, as before). */
  constructor(
    private readonly base: SQLDatabaseDriver,
    private readonly opts: { ringAll?: boolean; compact?: boolean; identityRing?: boolean } = {},
  ) {
    this.compact = opts.compact ?? true;
    this.identityRing = opts.identityRing ?? true;
  }

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

  /** The neighborhood ring of the demanded rows not yet expanded, added to
   *  `need`. Parts and left junctions are identity rows; the cards a read
   *  card's content nests are fetched whole (the render reads them next),
   *  the cards it only links as identity rows. A demanded row's content is
   *  scanned once the store holds it whole. */
  private frontier(need: NeedSet): void {
    for (const k of this.leftKeysPending) {
      const id = this.store.keyKnown.has(k) ? this.store.idForKey(k) : undefined;
      if (id !== undefined) {
        if (!this.store.leftComplete.has(id)) need.lefts.add(id);
        this.leftKeysPending.delete(k);
      }
    }
    for (const id of this.opts.ringAll === true ? [...this.store.present] : this.demanded) {
      const r = this.store.rowById(id) as
        | { id: number; type_id: number; left_id: number | null; right_id: number | null; db_content: string | null; trash: number }
        | undefined;
      if (r === undefined) continue;
      if (!this.store.expanded.has(r.id)) {
        this.store.expanded.add(r.id);
        if (!r.trash) {
          for (const i of [r.type_id, r.left_id, r.right_id]) {
            if (i != null && !this.store.full.has(i) && (!this.store.idKnown.has(i) || this.store.present.has(i))) need.fullIds.add(i);
          }
          if (!this.store.leftComplete.has(r.id)) need.lefts.add(r.id);
        }
      }
      if (this.store.contentExpanded.has(r.id) || !this.store.full.has(r.id)) continue;
      this.store.contentExpanded.add(r.id);
      if (r.trash) continue;
      const content = r.db_content ?? "";
      if (content.includes("{{") || content.includes("[[")) {
        const ctx = this.nameOf(r.id);
        const names: { name: string; nest: boolean }[] = [];
        try {
          for (const n of referencedNames(content)) names.push({ name: n.name, nest: true });
        } catch {
          /* unparseable content: nothing to widen */
        }
        for (const m of content.matchAll(LINK_RE)) names.push({ name: m[1]!, nest: false });
        for (const n of names) {
          if (n.name.startsWith("_")) continue;
          for (const k of keysOfName(n.name, ctx)) {
            if (!this.store.keyKnown.has(k)) {
              need.leftKeys.add(k);
              need.fullKeys.add(k);
            } else {
              this.leftKeysPending.add(k);
              const kid = this.store.idForKey(k);
              if (kid !== undefined && !this.store.full.has(kid)) need.fullIds.add(kid);
            }
          }
        }
      }
    }
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
  private readonly spec = new NeedSet();

  /** Statements a speculative pass recorded and has not yet fetched. */
  get pendingCount(): number {
    return this.spec.size;
  }

  async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const results: (SQLQueryResult | undefined)[] = new Array(stmts.length);
      const need = new NeedSet();
      stmts.forEach((s, i) => {
        const params = s.params ?? [];
        const miss = this.store.missing(s.sql, params);
        if (miss !== undefined) {
          if (miss.keys.length + miss.ids.length + miss.lefts.length + miss.leftKeys.length + miss.fullIds.length === 0) {
            const ans = this.store.answer(s.sql, params);
            results[i] = ans;
            this.stats.local_answers += 1;
            this.markDemanded(s, ans);
          } else {
            need.addMissing(miss);
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
        need.exact.set(k, { sql: s.sql, params });
        results[i] = { rows: [], rowsAffected: 0 };
      });
      if (need.size === 0) return results as SQLQueryResult[];
      if (this.mode === "block" && this.blockTrips !== undefined) {
        if (this.blockTrips <= 0) this.mode = "spec";
        else this.blockTrips -= 1;
      }
      if (this.mode === "spec") {
        this.spec.addAll(need);
        return results as SQLQueryResult[];
      }
      // DataLoader-style: every read that misses within the same macrotask
      // (concurrent branches of the render) joins ONE round trip.
      this.tick.addAll(need);
      if (this.tickFlush === undefined) {
        this.tickFlush = new Promise<void>((resolve, reject) => {
          // setImmediate where the runtime has it (Node); a zero timeout on
          // the edge runtime. Either way: after the current macrotask.
          defer(() => {
            const taken = this.tick.take();
            this.tickFlush = undefined;
            this.roundTrip(taken).then(resolve, reject);
          });
        });
      }
      await this.tickFlush;
    }
    throw new Error("live-store driver could not settle a batch in 4 round trips");
  }

  private readonly tick = new NeedSet();
  private tickFlush: Promise<void> | undefined;

  /** Fetch everything a speculative pass recorded (plus the ring) in ONE
   *  round trip. */
  async flushSpeculative(): Promise<void> {
    await this.roundTrip(this.spec.take());
  }

  private async roundTrip(need: NeedSet): Promise<void> {
    // ONE round trip: what the render is waiting on + the ring.
    this.frontier(need);
    const st = this.store;
    const w: Widening = {
      fullKeys: [...need.fullKeys].filter((k) => !st.keyKnown.has(k) || !this.fullForKey(k)),
      idKeys: [...need.idKeys].filter((k) => !st.keyKnown.has(k) && !need.fullKeys.has(k)),
      fullIds: [...need.fullIds].filter((x) => !st.full.has(x) && (!st.idKnown.has(x) || st.present.has(x))),
      idIds: [...need.idIds].filter((x) => !st.idKnown.has(x) && !need.fullIds.has(x)),
      lefts: [...need.lefts].filter((x) => !st.leftComplete.has(x)),
      leftKeys: [...need.leftKeys].filter((k) => !st.keyKnown.has(k)),
      pairs: [...need.pairs.values()].filter(([l]) => !st.leftComplete.has(l)),
      sideL: [...need.sideL],
      sideR: [...need.sideR],
    };
    const widening = st.wideningStatements(w, this.identityRing);
    const exact = [...need.exact.entries()].filter(([k]) => !this.exact.has(k));
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
      ...(widening ? [widening.full, widening.identity] : []),
      ...exact.map(([, v]) => v),
      ...companions.map((c) => c.stmt),
    ];
    if (send.length === 0) return;
    // The store's own fetches select known `cards` columns; the engine's
    // statements are sent as they are, or compacted.
    const storeNames: (readonly string[] | undefined)[] = send.map((_, i) => {
      if (widening !== undefined && i === 0) return CARDS_COLUMNS;
      if (widening !== undefined && i === 1) return widening.identityColumns;
      return i >= send.length - companions.length ? CARDS_COLUMNS : undefined;
    });
    const res = await this.sendBatch(send, storeNames);
    let j = 0;
    if (widening) {
      const fullRows = (res[j++]?.rows ?? []) as Record<string, unknown>[];
      const idRows = (res[j++]?.rows ?? []) as Record<string, unknown>[];
      const before = st.rowsFetched;
      st.absorb(w, fullRows, idRows, widening.identityColumns === CARDS_COLUMNS);
      this.stats.rows_fetched += st.rowsFetched - before;
      this.stats.full_rows += fullRows.length;
      this.stats.identity_rows += idRows.length;
    }
    for (const [k] of exact) this.exact.set(k, res[j++] ?? { rows: [], rowsAffected: 0 });
    if (companions.length > 0) {
      const before = st.rowsFetched;
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
        st.absorbFull(named, rows);
      }
      this.stats.rows_fetched += st.rowsFetched - before;
    }
  }

  /** The key's row is held whole (or the key is known absent). */
  private fullForKey(k: string): boolean {
    const id = this.store.idForKey(k);
    return id === undefined || this.store.full.has(id);
  }

  /** One round trip for `send`, its results decoded into exactly the rows the
   *  plain statements return. With compaction on (default; DECKO_LIVE_COMPACT=0
   *  turns it off) every statement whose output names are certain travels in
   *  the compact JSON encoding (compact-rows.ts): the store's own fetches as
   *  one aggregate cell (the store indexes rows by id, so their order does
   *  not matter), the engine's statements per compactStatement. A statement
   *  whose compact result is refused is sent again, plain, in one more trip;
   *  a trip the server rejects is sent again, plain, whole. */
  private async sendBatch(send: SQLStatement[], storeNames: (readonly string[] | undefined)[]): Promise<SQLQueryResult[]> {
    const plain = async (stmts: SQLStatement[]) => {
      this.stats.round_trips += 1;
      this.stats.statements_sent += stmts.length;
      return await this.base.batch(stmts);
    };
    if (!this.compact) return await plain(send);
    const forms = send.map((s, i) => {
      const names = storeNames[i];
      return names !== undefined ? { stmt: compactWrap(s, names, "aggregate"), names, form: "aggregate" as const } : compactStatement(s);
    });
    let wire: SQLQueryResult[];
    try {
      wire = await plain(send.map((s, i) => forms[i]?.stmt ?? s));
    } catch {
      this.stats.compact_fallbacks += send.length;
      return await plain(send);
    }
    const out: (SQLQueryResult | undefined)[] = wire.map((r, i) => {
      const f = forms[i];
      if (f === undefined) return r;
      const rows = decodeCompact(r.rows, f.names, f.form);
      return rows === undefined ? undefined : { ...r, rows };
    });
    const redo = out.flatMap((r, i) => (r === undefined ? [i] : []));
    if (redo.length > 0) {
      this.stats.compact_fallbacks += redo.length;
      const again = await plain(redo.map((i) => send[i]!));
      redo.forEach((i, k) => (out[i] = again[k]));
    }
    return out as SQLQueryResult[];
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
        `WITH __q AS (${s.sql}) SELECT ${CARDS_COLUMNS.map((c) => `cards.${c}`).join(", ")} FROM cards WHERE id IN ` +
        `(SELECT id FROM __q UNION SELECT type_id FROM __q UNION SELECT left_id FROM __q UNION SELECT right_id FROM __q)`,
      params: s.params ?? [],
    };
  }

  close(): void {
    this.store.close();
    this.exact.clear();
  }
}
