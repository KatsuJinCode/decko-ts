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
// Nothing is predicted from a previous request: the ring is computed from rows
// already read. The store and the exact-statement memo live as long as the
// page's kept entry (live-render.ts), which is valid only while the deck's
// freshness stamp is unchanged; otherwise they die with the request.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { debugFlag, envValue, traceStderr } from "../debug-flags.js";
import { referencedNames } from "../render/nest-syntax.js";
import { DeckoName } from "../name.js";
import { RequestStore, needsOf, type Missing, type SerializedRequestStore, type Widening } from "./request-store.js";
import { CARDS_COLUMNS, foldNoCase } from "./store-row-evaluator.js";
import { compactStatement, compactWrap, decodeCompact } from "./compact-rows.js";
import { searchWithRelatedStatement, decodeSearchWithRelated } from "./search-with-related.js";

/** Thrown by a live render whose request was abandoned (its budget fired). */
import { shareRuleResolutionCache } from "../permissions/index.js";

export const BUNDLE_SCHEMA_VERSION = 2;

export class LiveRenderAborted extends Error {
  constructor() {
    super("live render stopped: the request's budget was exceeded");
    this.name = "LiveRenderAborted";
  }
}

export interface LiveStoreStats {
  round_trips: number;
  local_answers: number;
  exact_answers: number;
  rows_fetched: number;
  statements_sent: number;
  compact_fallbacks: number;
  full_rows: number;
  identity_rows: number;
}

export interface SerializedLivePageBundle {
  v?: number;
  kind?: "full" | "delta";
  store: SerializedRequestStore;
  exact: [string, SQLQueryResult][];
  ruleExpanded: number[];
  ruleSetsAsked: string[];
  globalRulesSent: string[];
  firstTripDone: boolean;
  seeds: string[];
  eagerRefs: string[];
  deniedRootKey?: string;
}

export function diffLivePageBundle(
  base: SerializedLivePageBundle,
  target: SerializedLivePageBundle,
): SerializedLivePageBundle {
  const baseFullById = new Map(base.store.fullRows.map((r) => [Number(r.id), JSON.stringify(r)]));
  const baseIdById = new Map(base.store.identityRows.map((r) => [Number(r.id), JSON.stringify(r)]));
  const baseKeyKnown = new Set(base.store.keyKnown);
  const baseIdKnown = new Set(base.store.idKnown);
  const baseLeftComplete = new Set(base.store.leftComplete);
  const baseExpanded = new Set(base.store.expanded);
  const baseContentExpanded = new Set(base.store.contentExpanded);
  const baseExact = new Map(base.exact.map(([k, v]) => [k, JSON.stringify(v)]));
  const baseRuleExpanded = new Set(base.ruleExpanded);
  const baseRuleSetsAsked = new Set(base.ruleSetsAsked);
  const baseGlobalRules = new Set(base.globalRulesSent);

  return {
    v: BUNDLE_SCHEMA_VERSION,
    kind: "delta",
    store: {
      fullRows: target.store.fullRows.filter((r) => baseFullById.get(Number(r.id)) !== JSON.stringify(r)),
      identityRows: target.store.identityRows.filter(
        (r) => !baseFullById.has(Number(r.id)) && baseIdById.get(Number(r.id)) !== JSON.stringify(r),
      ),
      keyKnown: target.store.keyKnown.filter((k) => !baseKeyKnown.has(k)),
      idKnown: target.store.idKnown.filter((x) => !baseIdKnown.has(x)),
      leftComplete: target.store.leftComplete.filter((x) => !baseLeftComplete.has(x)),
      expanded: target.store.expanded.filter((x) => !baseExpanded.has(x)),
      contentExpanded: target.store.contentExpanded.filter((x) => !baseContentExpanded.has(x)),
    },
    exact: target.exact.filter(([k, v]) => baseExact.get(k) !== JSON.stringify(v)),
    ruleExpanded: target.ruleExpanded.filter((x) => !baseRuleExpanded.has(x)),
    ruleSetsAsked: target.ruleSetsAsked.filter((k) => !baseRuleSetsAsked.has(k)),
    globalRulesSent: target.globalRulesSent.filter((k) => !baseGlobalRules.has(k)),
    firstTripDone: target.firstTripDone,
    seeds: target.seeds,
    eagerRefs: target.eagerRefs,
    ...(target.deniedRootKey !== undefined ? { deniedRootKey: target.deniedRootKey } : {}),
  };
}

const keyOf = (sql: string, params: readonly unknown[]) =>
  `${sql}\u0000${JSON.stringify(params ?? [], (_k, v) => (typeof v === "bigint" ? `${v}n` : v))}`;

const defer: (fn: () => void) => void =
  typeof setImmediate === "function" ? (fn) => void setImmediate(fn) : (fn) => void setTimeout(fn, 0);

const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

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
  readonly ruleSets = new Map<string, [number, string]>();
  readonly tprSets = new Map<string, [number, number]>();

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
    o.ruleSets.forEach((v, k) => this.ruleSets.set(k, v));
    o.tprSets.forEach((v, k) => this.tprSets.set(k, v));
  }

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
    this.ruleSets.clear();
    this.tprSets.clear();
    return t;
  }
}

export class LiveStoreDriver implements SQLDatabaseDriver {
  get cqlRegexpSemantics(): SQLDatabaseDriver["cqlRegexpSemantics"] {
    return this.base.cqlRegexpSemantics;
  }

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
  private readonly demanded = new Set<number>();
  private readonly passExactKeys = new Set<string>();
  private readonly leftKeysPending = new Set<string>();
  private readonly compact: boolean;
  private readonly identityRing: boolean;
  private readonly ruleSetsOn = envValue("DECKO_LIVE_RULE_SETS") !== "0";
  private readonly askedLefts = envValue("DECKO_LIVE_ASKED_LEFTS") !== "0";
  private readonly partialOn = envValue("DECKO_LIVE_PARTIAL") !== "0";
  private readonly anchorLeftsOn = envValue("DECKO_LIVE_ANCHOR_LEFTS") !== "0";
  private readonly ruleExpanded = new Set<number>();
  private readonly ruleSetsAsked = new Set<string>();

  constructor(
    private readonly base: SQLDatabaseDriver,
    private readonly opts: { ringAll?: boolean; compact?: boolean; identityRing?: boolean; signal?: AbortSignal } = {},
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
    if (needsOf(s.sql, s.params ?? [])?.full !== true) return;
    for (const r of ans.rows as Record<string, unknown>[]) if (r.id != null) this.demanded.add(Number(r.id));
    if (/WHERE id = \?/.test(s.sql)) this.demanded.add(Number((s.params ?? [])[0]));
  }

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
      if (this.ruleSetsOn && !r.trash && !this.ruleExpanded.has(r.id)) {
        this.ruleExpanded.add(r.id);
        const add = (anchor: number | null | undefined, code: string) => {
          if (anchor == null) return;
          const k = `${anchor}:${code}`;
          if (this.ruleSetsAsked.has(k)) return;
          this.ruleSetsAsked.add(k);
          need.ruleSets.set(k, [anchor, code]);
        };
        const typeRow = r.type_id != null ? (this.store.rowById(r.type_id) as { codename?: string | null } | undefined) : undefined;
        if (typeRow?.codename !== "cardtype") add(r.id, "self");
        add(r.type_id, "type");
        const anchorLefts = this.anchorLeftsOn;
        if (anchorLefts && r.type_id != null && !this.store.leftComplete.has(r.type_id)) need.lefts.add(r.type_id);
        if (r.left_id != null && r.right_id != null) {
          add(r.right_id, "right");
          if (anchorLefts && !this.store.leftComplete.has(r.right_id)) need.lefts.add(r.right_id);
          const leftType = (this.store.rowById(r.left_id) as { type_id?: number } | undefined)?.type_id;
          if (leftType != null) {
            const k = `${leftType}:${r.right_id}`;
            if (!this.ruleSetsAsked.has(`tpr:${k}`)) {
              this.ruleSetsAsked.add(`tpr:${k}`);
              need.tprSets.set(k, [leftType, r.right_id]);
            }
          }
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
    if (/\bREGEXP\b/i.test(sql)) {
      if (this.opts.signal?.aborted === true) throw new LiveRenderAborted();
      if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error(`live-store render reached a non-read statement: ${sql.slice(0, 120)}`);
      const key = keyOf(sql, params);
      const known = this.exact.get(key);
      if (known !== undefined) {
        this.passExactKeys.add(key);
        return known as SQLQueryResult<T>;
      }
      this.stats.round_trips += 1;
      this.stats.statements_sent += 1;
      const result = await this.base.query<T>(sql, params);
      this.exact.set(key, result);
      this.passExactKeys.add(key);
      return result;
    }
    const [r] = await this.batch([{ sql, params }]);
    return r as SQLQueryResult<T>;
  }

  mode: "block" | "spec" = "block";
  blockTrips: number | undefined = undefined;
  private readonly spec = new NeedSet();

  get pendingCount(): number {
    return this.spec.size;
  }

  private globalRulesSent = new Set<string>();
  private firstTripDone = false;
  private globalRuleSets(): number[] {
    if (!this.ruleSetsOn || envValue("DECKO_LIVE_ALL_RULES") === "0") return [];
    const out: number[] = [];
    for (const k of ["*all", "*all_plu"]) {
      if (this.globalRulesSent.has(k) || !this.store.keyKnown.has(k)) continue;
      this.globalRulesSent.add(k);
      const id = this.store.idForKey(k);
      if (id !== undefined) out.push(id);
    }
    return out;
  }

  hintSetNames(names: readonly string[]): void {
    if (!this.ruleSetsOn) return;
    const CODES: Record<string, string> = { "*self": "self", "*type": "type", "*right": "right" };
    const idOf = (s: string): number | undefined => {
      const k = foldNoCase(DeckoName.parse(s).key);
      return this.store.keyKnown.has(k) ? this.store.idForKey(k) : undefined;
    };
    for (const n of names) {
      let parsed: DeckoName;
      try {
        parsed = DeckoName.parse(n);
      } catch {
        continue;
      }
      if (!parsed.isCompound) continue;
      const tag = parsed.rightName?.key;
      const left = parsed.leftName;
      if (tag === undefined || left === undefined) continue;
      try {
        if (tag === "*type_plu_right") {
          if (!left.isCompound || left.leftName === undefined || left.rightName === undefined) continue;
          if (left.leftName.isCompound || left.rightName.isCompound) continue;
          const l = idOf(left.leftName.s);
          const r = idOf(left.rightName.s);
          if (l === undefined || r === undefined) continue;
          const k = `tpr:${l}:${r}`;
          if (this.ruleSetsAsked.has(k)) continue;
          this.ruleSetsAsked.add(k);
          this.spec.tprSets.set(`${l}:${r}`, [l, r]);
        } else if (CODES[tag] !== undefined && !left.isCompound) {
          const a = idOf(left.s);
          if (a === undefined) continue;
          const k = `${a}:${CODES[tag]}`;
          if (this.ruleSetsAsked.has(k)) continue;
          this.ruleSetsAsked.add(k);
          this.spec.ruleSets.set(k, [a, CODES[tag]!]);
        }
      } catch {
      }
    }
  }

  stackTrace: Map<string, number> | undefined = undefined;
  stackDepth = 6;

  describePending(): Record<string, unknown> {
    const s = this.spec;
    const nm = (x: number) => this.nameOf(x) ?? `#${x}`;
    return {
      fullKeys: [...s.fullKeys],
      idKeys: [...s.idKeys],
      fullIds: [...s.fullIds].map(nm),
      idIds: [...s.idIds].map(nm),
      lefts: [...s.lefts].map(nm),
      leftKeys: [...s.leftKeys],
      pairs: [...s.pairs.values()].map(([l, r]) => `${nm(l)}+${nm(r)}`),
      sideL: [...s.sideL],
      sideR: [...s.sideR],
      exact: [...s.exact.values()].map((x) => `${x.sql.replace(/\s+/g, " ").slice(0, 160)} ${JSON.stringify(x.params ?? []).slice(0, 120)}`),
    };
  }

  async batch(stmts: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const results: (SQLQueryResult | undefined)[] = new Array(stmts.length);
      const need = new NeedSet();
      stmts.forEach((s, i) => {
        const params = s.params ?? [];
        const certified = this.store.certifiedAnswer(s.sql, params);
        if (certified !== undefined) {
          results[i] = certified;
          this.stats.local_answers += 1;
          this.markDemanded(s, certified);
          return;
        }
        const miss = this.store.missing(s.sql, params);
        if (miss !== undefined) {
          if (miss.keys.length + miss.ids.length + miss.lefts.length + miss.leftKeys.length + miss.fullIds.length === 0) {
            const ans = this.store.answer(s.sql, params);
            results[i] = ans;
            this.stats.local_answers += 1;
            this.markDemanded(s, ans);
          } else {
            need.addMissing(miss);
            results[i] = { rows: this.mode === "spec" && this.partialOn ? this.store.partialAnswer(s.sql, params) : [], rowsAffected: 0 };
          }
          return;
        }
        const k = keyOf(s.sql, params);
        const known = this.exact.get(k);
        if (known !== undefined) {
          this.passExactKeys.add(k);
          results[i] = { ...known, rows: known.rows.slice() };
          this.stats.exact_answers += 1;
          return;
        }
        if (!/^\s*(SELECT|WITH)\b/i.test(s.sql)) {
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
        if (this.stackTrace !== undefined) {
          const st = (new Error().stack ?? "").split("\n").slice(2);
          const frames = st
            .map((l) => l.trim().replace(/^at /, "").replace(/ \(.*$/, ""))
            .filter((f) => !/^(async )?(LiveStoreDriver|Object\.|Promise|pro\x63ess|new Promise|Array\.)/.test(f) && f !== "")
            .slice(0, this.stackDepth);
          const k = frames.join(" < ");
          this.stackTrace.set(k, (this.stackTrace.get(k) ?? 0) + need.size);
        }
        this.spec.addAll(need);
        return results as SQLQueryResult[];
      }
      this.tick.addAll(need);
      if (this.tickFlush === undefined) {
        this.tickFlush = new Promise<void>((resolve, reject) => {
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

  debugPending(): string[] {
    const s = this.spec;
    return [
      `fullKeys:${[...s.fullKeys].slice(0, 4).join("|")}`,
      `fullIdList:${[...s.fullIds].join(",")}`,
      `fullIds:${s.fullIds.size} idKeys:${s.idKeys.size} idIds:${s.idIds.size} lefts:${s.lefts.size} leftKeys:${s.leftKeys.size} pairs:${s.pairs.size}`,
      ...[...s.exact.values()].slice(0, 3).map((x) => `exact:${x.sql.replace(/\s+/g, " ").slice(0, 90)} ${JSON.stringify(x.params).slice(0, 60)}`),
    ];
  }

  async flushSpeculative(): Promise<void> {
    await this.roundTrip(this.spec.take());
  }

  private async roundTrip(need: NeedSet): Promise<void> {
    if (this.opts.signal?.aborted === true) throw new LiveRenderAborted();
    if (this.askedLefts) {
      for (const x of need.fullIds) if (this.store.present.has(x) && !this.store.leftComplete.has(x)) need.lefts.add(x);
    }
    let wholeLeftKeys: string[] | undefined;
    if (!this.firstTripDone) {
      this.firstTripDone = true;
      if (this.askedLefts) {
        for (const k of need.fullKeys) {
          if (!this.store.keyKnown.has(k)) need.leftKeys.add(k);
        }
      }
      if (this.ruleSetsOn && envValue("DECKO_LIVE_FIRST_GLOBALS") !== "0") {
        wholeLeftKeys = ["*all", "*all_plu"];
        for (const k of wholeLeftKeys) {
          need.fullKeys.add(k);
          this.globalRulesSent.add(k);
        }
        for (const chromeKey of [
          "default_layout",
          "nav_bar",
          "footer",
          "*head",
          "*header",
          "*footer",
          "*credit",
          "*main_menu",
          "*account_link",
          "*search",
          "*home",
          "*logo",
          "*version",
          "*title",
          "*favicon",
        ]) {
          if (!this.store.keyKnown.has(chromeKey)) {
            need.fullKeys.add(chromeKey);
            need.leftKeys.add(chromeKey);
          }
        }
      }
    }
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
      ruleSets: [...need.ruleSets.values()],
      tprSets: [...need.tprSets.values()],
      wholeLefts: this.globalRuleSets(),
      ...(wholeLeftKeys !== undefined ? { wholeLeftKeys } : {}),
    };
    const widening = st.wideningStatements(w, this.identityRing);
    const exact = [...need.exact.entries()].filter(([k]) => !this.exact.has(k));
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
    const storeNames: (readonly string[] | undefined)[] = send.map((_, i) => {
      if (widening !== undefined && i === 0) return CARDS_COLUMNS;
      if (widening !== undefined && i === 1) return widening.identityColumns;
      return i >= send.length - companions.length ? CARDS_COLUMNS : undefined;
    });
    const exactOffset = widening ? 2 : 0;
    const res = await this.sendBatch(send, storeNames, companions.map((c, i) => ({
      search: exactOffset + c.at, related: exactOffset + exact.length + i,
    })));
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
    for (const [k] of exact) {
      this.exact.set(k, res[j++] ?? { rows: [], rowsAffected: 0 });
      this.passExactKeys.add(k);
    }
    if (companions.length > 0) {
      const before = st.rowsFetched;
      for (const c of companions) {
        const rows = (res[j++]?.rows ?? []) as Record<string, unknown>[];
        const named: number[] = [];
        const results = (this.exact.get(exact[c.at]![0])?.rows ?? []) as Record<string, unknown>[];
        const own: Record<string, unknown>[] = [];
        const unseated = new Set<number>();
        for (const r of results) {
          if (r.id === null || r.id === undefined) continue;
          if (CARDS_COLUMNS.every((col) => col in r)) {
            own.push(Object.fromEntries(CARDS_COLUMNS.map((col) => [col, r[col]])));
            named.push(Number(r.id));
          } else {
            unseated.add(Number(r.id));
          }
        }
        for (const r of results) {
          for (const col of ["type_id", "left_id", "right_id"]) {
            const v = r[col];
            if (v !== null && v !== undefined && !unseated.has(Number(v))) named.push(Number(v));
          }
        }
        st.absorbFull(named, [...own, ...rows]);
      }
      this.stats.rows_fetched += st.rowsFetched - before;
    }
  }

  private fullForKey(k: string): boolean {
    const id = this.store.idForKey(k);
    return id === undefined || this.store.full.has(id);
  }

  private async sendBatch(send: SQLStatement[], storeNames: (readonly string[] | undefined)[], pairs: {search: number; related: number}[] = []): Promise<SQLQueryResult[]> {
    const plain = async (stmts: SQLStatement[]) => {
      this.stats.round_trips += 1;
      this.stats.statements_sent += stmts.length;
      const lead = this.leadStatement;
      if (lead !== undefined) {
        this.leadStatement = undefined;
        try {
          const [first, ...rest] = await this.base.batch([lead, ...stmts]);
          this.leadResult = first;
          if (first !== undefined) {
            this.exact.set(keyOf(lead.sql, lead.params ?? []), first);
          }
          return rest;
        } catch {
          this.stats.round_trips += 1;
        }
      }
      return await this.base.batch(stmts);
    };
    if (!this.compact) return await plain(send);
    const forms = send.map((s, i) => {
      const names = storeNames[i];
      return names !== undefined ? { stmt: compactWrap(s, names, "aggregate"), names, form: "aggregate" as const } : compactStatement(s);
    });
    const paired = new Map(pairs.flatMap(pair => {
      const stmt = searchWithRelatedStatement(send[pair.search]!);
      return stmt === undefined ? [] : [[pair.search, { ...pair, stmt }] as const];
    }));
    const folded = new Set([...paired.values()].map(pair => pair.related));
    const units = send.flatMap((s, i) => folded.has(i) ? [] : [{
      at: i, pair: paired.get(i), stmt: paired.get(i)?.stmt ?? forms[i]?.stmt ?? s,
    }]);
    let wire: SQLQueryResult[];
    try {
      wire = await plain(units.map(unit => unit.stmt));
    } catch {
      this.stats.compact_fallbacks += send.length;
      return await plain(send);
    }
    const out: (SQLQueryResult | undefined)[] = new Array(send.length);
    units.forEach((unit, i) => {
      const r = wire[i];
      if (r === undefined) return;
      if (unit.pair !== undefined) {
        const rows = decodeSearchWithRelated(r.rows);
        if (rows !== undefined) {
          out[unit.at] = { ...r, rows: rows.search };
          out[unit.pair.related] = { ...r, rows: rows.related };
        }
        return;
      }
      const f = forms[unit.at];
      if (f === undefined) { out[unit.at] = r; return; }
      const rows = decodeCompact(r.rows, f.names, f.form);
      out[unit.at] = rows === undefined ? undefined : { ...r, rows };
    });
    const redo = send.flatMap((_, i) => out[i] === undefined ? [i] : []);
    if (redo.length > 0) {
      this.stats.compact_fallbacks += redo.length;
      const again = await plain(redo.map((i) => send[i]!));
      redo.forEach((i, k) => (out[i] = again[k]));
    }
    return out as SQLQueryResult[];
  }

  static searchCompanion(s: SQLStatement): SQLStatement | undefined {
    if (!/^\s*SELECT\s+(DISTINCT\s+)?c0\.\*/i.test(s.sql) || /REGEXP/i.test(s.sql)) return undefined;
    return {
      sql:
        `WITH __q AS (${s.sql}) SELECT ${CARDS_COLUMNS.map((c) => `cards.${c}`).join(", ")} FROM cards WHERE id IN ` +
        `(SELECT type_id FROM __q UNION SELECT left_id FROM __q UNION SELECT right_id FROM __q) ` +
        `AND id NOT IN (SELECT id FROM __q)`,
      params: s.params ?? [],
    };
  }

  leadStatement: SQLStatement | undefined = undefined;
  leadResult: SQLQueryResult | undefined = undefined;

  beginRequest(signal: AbortSignal | undefined): void {
    this.opts.signal = signal;
    this.mode = "block";
    this.blockTrips = undefined;
    this.spec.take();
    this.leadStatement = undefined;
    this.leadResult = undefined;
    for (const k of Object.keys(this.stats) as (keyof LiveStoreStats)[]) this.stats[k] = 0;
  }

  compactForRetention(): void {
    if (this.pendingCount || this.tick.size || this.tickFlush) throw new Error("cannot compact pending live reads");
    this.store.releaseWitnesses();
    this.store.close();
    this.exact.clear();
    for (const set of [this.demanded, this.leftKeysPending, this.ruleExpanded, this.ruleSetsAsked, this.globalRulesSent]) set.clear();
    this.stackTrace = undefined;
    this.leadResult = undefined;
    this.opts.signal = undefined;
  }

  /** Every owned field is inspected, including future additions. The shared
   * base driver is external ownership; the completed request signal must not
   * retain its request. Unsupported/opaque payloads simply cannot be kept. */
  seedFrom(other: LiveStoreDriver): void {
    this.store.copyFrom(other.store);
    for (const [k, v] of other.exact) this.exact.set(k, v);
    for (const x of other.ruleExpanded) this.ruleExpanded.add(x);
    for (const k of other.ruleSetsAsked) this.ruleSetsAsked.add(k);
    for (const k of other.globalRulesSent) this.globalRulesSent.add(k);
    this.firstTripDone = other.firstTripDone;
    shareRuleResolutionCache(other, this);
  }

  mergeFrom(other: LiveStoreDriver): void {
    this.store.mergeFrom(other.store);
    for (const [k, v] of other.exact) {
      if (!this.exact.has(k)) this.exact.set(k, v);
    }
    for (const x of other.ruleExpanded) this.ruleExpanded.add(x);
    for (const k of other.ruleSetsAsked) this.ruleSetsAsked.add(k);
    for (const k of other.globalRulesSent) this.globalRulesSent.add(k);
    if (other.firstTripDone) this.firstTripDone = true;
    shareRuleResolutionCache(other, this);
  }

  retainedPayload(): unknown {
    return { ...this, base: undefined, store: this.store.retainedPayload(),
      spec: { ...this.spec }, tick: { ...this.tick } };
  }

  beginPass(): void {
  }

  exportPageBundle(
    seeds: ReadonlySet<string>,
    eagerRefs: ReadonlySet<string>,
    deniedRootKey: string | undefined,
    pruneToLastPass = false,
  ): SerializedLivePageBundle {
    const storeBundle = this.store.exportBundle(pruneToLastPass ? this.store.touchedIds() : undefined);
    const fullContentById = new Map<number, unknown>();
    for (const r of storeBundle.fullRows) {
      if (typeof r.id === "number" && typeof r.db_content === "string" && r.db_content.length > 64) {
        fullContentById.set(r.id, r.db_content);
      }
    }
    const rawExact =
      pruneToLastPass && this.passExactKeys.size > 0
        ? [...this.exact.entries()].filter(([k]) => this.passExactKeys.has(k))
        : [...this.exact.entries()];
    const activeAnchorIds = new Set<number>(this.store.present);
    for (const r of storeBundle.fullRows) {
      if (typeof r.type_id === "number") activeAnchorIds.add(r.type_id);
      if (typeof r.left_id === "number") activeAnchorIds.add(r.left_id);
      if (typeof r.right_id === "number") activeAnchorIds.add(r.right_id);
    }
    for (const r of storeBundle.identityRows) {
      if (typeof r.type_id === "number") activeAnchorIds.add(r.type_id);
      if (typeof r.left_id === "number") activeAnchorIds.add(r.left_id);
      if (typeof r.right_id === "number") activeAnchorIds.add(r.right_id);
    }
    const exactEntries: [string, SQLQueryResult][] = rawExact.map(([k, v]) => {
      if (/SELECT\s+rules\.id\s+AS\s+rule_id,\s+rules\.db_content\s+AS\s+rule_content/i.test(k)) {
        const filteredRows = (v.rows as Record<string, unknown>[]).filter((r) => {
          if (r.anchor_id == null) return true;
          const aid = Number(r.anchor_id);
          if (activeAnchorIds.has(aid)) return true;
          if (
            r.anchor_left_id != null &&
            r.anchor_right_id != null &&
            activeAnchorIds.has(Number(r.anchor_left_id)) &&
            activeAnchorIds.has(Number(r.anchor_right_id))
          ) {
            return true;
          }
          return false;
        });
        return [k, { ...v, rows: filteredRows }];
      }
      if (/SELECT\s+(DISTINCT\s+)?c0\.\*/i.test(k)) {
        const dedupedRows = (v.rows as Record<string, unknown>[]).map((r) => {
          const id = Number(r.id);
          if (fullContentById.has(id) && r.db_content === fullContentById.get(id)) {
            return { ...r, db_content: "__FROM_STORE__" };
          }
          return r;
        });
        return [k, { ...v, rows: dedupedRows }];
      }
      return [k, v];
    });
    return {
      v: BUNDLE_SCHEMA_VERSION,
      kind: "full",
      store: storeBundle,
      exact: exactEntries,
      ruleExpanded: [...this.ruleExpanded],
      ruleSetsAsked: [...this.ruleSetsAsked],
      globalRulesSent: [...this.globalRulesSent],
      firstTripDone: this.firstTripDone,
      seeds: [...seeds],
      eagerRefs: [...eagerRefs],
      ...(deniedRootKey !== undefined ? { deniedRootKey } : {}),
    };
  }

  importPageBundle(b: SerializedLivePageBundle, currentVersion?: number): void {
    this.store.importBundle(b.store);
    for (const [k, v] of b.exact) {
      if (/SELECT\s+(DISTINCT\s+)?c0\.\*/i.test(k)) {
        const restoredRows = (v.rows as Record<string, unknown>[]).map((r) => {
          if (r.db_content === "__FROM_STORE__") {
            const stRow = this.store.rowById(Number(r.id));
            return { ...r, db_content: stRow?.db_content ?? null };
          }
          return r;
        });
        this.exact.set(k, { ...v, rows: restoredRows });
      } else {
        this.exact.set(k, v);
      }
    }
    if (currentVersion !== undefined) {
      this.exact.set(
        `SELECT "version" FROM "deck_data_version" WHERE "id" = 1\u0000[]`,
        { rows: [{ version: currentVersion }], rowsAffected: 0 },
      );
    }
    for (const x of b.ruleExpanded) this.ruleExpanded.add(x);
    for (const k of b.ruleSetsAsked) this.ruleSetsAsked.add(k);
    for (const k of b.globalRulesSent) this.globalRulesSent.add(k);
    this.firstTripDone = b.firstTripDone;
  }

  close(): void {
    if (debugFlag("DECKO_LIVE_TRACE_ROWS")) {
      traceStderr(`ROWS ${JSON.stringify({ full: [...this.store.full], present: [...this.store.present] })}\n`);
    }
    if (debugFlag("DECKO_LIVE_TRACE_RULESETS")) {
      traceStderr(
        `RULESETS ${JSON.stringify({ asked: [...this.ruleSetsAsked], demanded: [...this.demanded] })}\n`,
      );
    }
    this.store.close();
    this.exact.clear();
  }
}
