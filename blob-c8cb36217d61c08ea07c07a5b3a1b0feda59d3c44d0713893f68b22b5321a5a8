import { describe, expect, it } from "vitest";
import { estimateRetainedPayload, RetainedPages, retainedPagesDiagnostics as diagnostics } from "../../../src/card/live/retained-pages.js";
import { LiveStoreDriver } from "../../../src/card/live/live-store-driver.js";
import { RequestStore } from "../../../src/card/live/request-store.js";
import { CARDS_COLUMNS } from "../../../src/card/live/store-row-evaluator.js";
import { DatabaseSync } from "node:sqlite";
import type { SQLQueryResult } from "../../../src/server/driver.js";

const estimate = (value: unknown, limit = 8 * 1024 * 1024) => estimateRetainedPayload(value, limit);
describe("bounded kept payloads", () => {
  it("charges strings, keys, rows, index Maps/Sets and backing buffers, with bounded cyclic traversal", () => {
    const cycle: Record<string, unknown> = { text: "x" }; cycle.self = cycle;
    expect(estimate(cycle)).toBeGreaterThan(128);
    expect(estimate(new Map([["index", new Set([cycle])]]))).toBeGreaterThan(estimate(cycle));
    expect(estimate({ text: "x".repeat(2000) })).toBeGreaterThan(4000);
    expect(estimate(new Uint8Array(100))).toBeGreaterThan(6400);
    expect(estimate(new Uint8Array(2 * 1024 * 1024), 1000)).toBe(Infinity);
    expect(estimate(Array(1_000_000), 1000)).toBe(Infinity);
    Object.defineProperty(cycle, "hidden", { value: "x".repeat(2000) });
    expect(estimate(cycle)).toBeGreaterThan(4000);
  });
  it("fails closed without evaluating getters or hidden closure/opaque ownership", () => {
    let invoked = false;
    const value = Object.defineProperty({}, "payload", { get() { invoked = true; return "unsafe"; } });
    expect(estimate(value)).toBe(Infinity); expect(invoked).toBe(false);
    const view = Object.defineProperty(new Uint8Array(1), "buffer", { get() { invoked = true; return new ArrayBuffer(1); } });
    const map = Object.defineProperty(new Map(), "size", { get() { invoked = true; return 0; } });
    expect(estimate(view)).toBe(Infinity); expect(estimate(map)).toBe(Infinity); expect(invoked).toBe(false);
    for (const opaque of [() => {}, Promise.resolve(), new WeakMap(), new Date(), Symbol("x")]) {
      expect(estimate({ opaque })).toBe(Infinity);
    }
    class Hidden extends Map { #secret = "held"; }
    expect(estimate(new Hidden())).toBe(Infinity);
    let deep: unknown = "end"; for (let i = 0; i < 70; i++) deep = [deep];
    expect(estimate(deep)).toBe(Infinity);
  });
  it("accounts actual store rows and exact-query answers while excluding only the shared driver", async () => {
    let baseClosed = false;
    const base = {
      query: async <T>(): Promise<SQLQueryResult<T>> => ({ rows: [{ value: "x".repeat(5 * 1024 * 1024) }] as T[], rowsAffected: 0 }),
      batch: async () => [], close: () => { baseClosed = true; },
    };
    const live = new LiveStoreDriver(base, { signal: new AbortController().signal });
    expect(estimate(live.retainedPayload())).toBe(Infinity); // active request signal is not hidden
    live.compactForRetention();
    expect(estimate(live.retainedPayload())).toBeLessThan(20_000);
    await live.query("SELECT ? REGEXP ?", ["value", "pattern"]);
    expect(estimate(live.retainedPayload())).toBe(Infinity);
    live.close(); expect(baseClosed).toBe(false);
    live.store.addRow({ id: 1, key: "payload", db_content: "x".repeat(5 * 1024 * 1024) }, true);
    expect(estimate(live.retainedPayload())).toBe(Infinity);
  });
  it("drops ALL witnesses together while preserving only exact certified answers at the same stamp", () => {
    const store = new RequestStore();
    const sql = "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1";
    store.addRow({ id: 1, key: "one", name: "One", db_content: "certified", left_id: 10, right_id: 11, trash: 0 }, true);
    store.leftComplete.add(10); store.expanded.add(1); store.contentExpanded.add(1);
    const complete = store.answer(sql, ["one"]);
    store.keyKnown.add("absent"); expect(store.answer(sql, ["absent"]).rows).toEqual([]);
    store.releaseWitnesses();
    expect(store.certifiedAnswer(sql, ["one"])).toEqual(complete);
    expect(store.certifiedAnswer(sql, ["absent"])?.rows).toEqual([]);
    expect(store.rowById(1)).toBeUndefined(); expect(store.idForKey("one")).toBeUndefined();
    for (const set of [store.keyKnown, store.idKnown, store.leftComplete, store.expanded, store.contentExpanded, store.present, store.full]) expect(set.size).toBe(0);
    const unseen = "SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1";
    expect(store.certifiedAnswer(unseen, ["one"])).toBeUndefined();
    expect(store.missing(unseen, ["one"])?.keys).toEqual(["one"]);
    expect(store.missing(unseen, ["absent"])?.keys).toEqual(["absent"]);
    expect(store.missing("SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1", [10, 11])?.lefts).toEqual([10]);
  });
  it("refuses compaction of pending speculative reads without changing the active request", async () => {
    const live = new LiveStoreDriver({ query: async () => ({ rows: [], rowsAffected: 0 }), batch: async () => [] });
    live.mode = "spec";
    await live.query("SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["still-pending"]);
    expect(live.pendingCount).toBeGreaterThan(0);
    expect(() => live.compactForRetention()).toThrow(/pending live reads/);
    expect(live.pendingCount).toBeGreaterThan(0);
    live.close();
  });
  type Entry = { stamp: number; payload: unknown };
  it("serves retained certified answers but sends an unseen projection back to actual SQLite", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE cards (${CARDS_COLUMNS.join(", ")}); CREATE TABLE card_references(referer_id,referee_id,referee_key,ref_type,is_present)`);
    db.exec("INSERT INTO cards(id,name,key,db_content,trash) VALUES(1,'One','one','sqlite witness',0)");
    let trips = 0;
    const query = async <T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> => ({ rows: db.prepare(sql).all(...params as never[]) as T[], rowsAffected: 0 });
    const live = new LiveStoreDriver({ query, batch: async statements => { trips++; return Promise.all(statements.map(s => query(s.sql, s.params))); } }, { compact: false });
    try {
      const sql = "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1";
      const first = await live.query(sql, ["one"]); expect(first.rows).toHaveLength(1);
      live.compactForRetention(); expect(live.store.present.size).toBe(0);
      trips = 0; expect(await live.query(sql, ["one"])).toEqual(first); expect(trips).toBe(0);
      const projected = await live.query<{ id: number }>("SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["one"]);
      expect(projected.rows).toEqual([{ id: 1 }]); expect(trips).toBeGreaterThan(0);
    } finally { live.close(); db.close(); }
  });
  function fixture(maxBytes?: number, maxEntries?: number) {
    const closed: Entry[] = [];
    const cache = new RetainedPages<Entry>(value => closed.push(value), value => value.payload, maxBytes, maxEntries);
    return { cache, closed };
  }
  it("keeps a small repeat hit and shares the default eight-entry ceiling across ALL viewer scopes", () => {
    const { cache, closed } = fixture();
    const first = { stamp: 1, payload: "same" };
    const key = (i: number) => `viewer:${i % 3}\u0000page:${i}`;
    cache.put(key(0), first); expect(cache.take(key(0))).toBe(first); expect(closed).toEqual([]);
    cache.put(key(0), first);
    for (let i = 1; i < 9; i++) cache.put(key(i), { stamp: 1, payload: "same" });
    expect(diagnostics(cache).entries).toBe(8); expect(closed).toEqual([first]);
    expect(cache.take(key(0))).toBeUndefined();
  });
  it("evicts least-recently-returned idle data for the TOTAL byte budget", () => {
    const one = estimate(["viewer:1\u0000page:a", "payload".repeat(20)]);
    const { cache, closed } = fixture(one * 2 - 1, 8);
    const a = { stamp: 1, payload: "payload".repeat(20) }, b = { ...a };
    cache.put("viewer:1\u0000page:a", a); cache.put("viewer:2\u0000page:b", b);
    expect(diagnostics(cache)).toEqual({ entries: 1, estimatedBytes: one });
    expect(closed).toEqual([a]); expect(cache.take("viewer:2\u0000page:b")).toBe(b);
    expect(diagnostics(cache)).toEqual({ entries: 0, estimatedBytes: 0 });
  });
  it("closes oversized/unsupported entries without retaining them or touching an external driver", () => {
    const { cache, closed } = fixture();
    const oversized = { stamp: 1, payload: "x".repeat(5 * 1024 * 1024) };
    cache.put("big", oversized);
    const opaque = { stamp: 1, payload: Promise.resolve() }; cache.put("opaque", opaque);
    expect(closed).toEqual([oversized, opaque]); expect(diagnostics(cache).entries).toBe(0);
  });
  it("eagerly removes ALL obsolete versions even when incoming data is oversized", () => {
    const { cache, closed } = fixture(2000);
    const a = { stamp: 1, payload: "old" }, b = { ...a }, changed = { stamp: 2, payload: "x".repeat(3000) };
    cache.put("a", a); cache.put("b", b); cache.put("new", changed);
    expect(closed).toEqual([a, b, changed]); expect(diagnostics(cache).entries).toBe(0);
  });
  it("does not close checked-out owners or let an older concurrent completion purge newer data", () => {
    const { cache, closed } = fixture();
    const old = { stamp: 1, payload: "old" }, fresh = { stamp: 2, payload: "new" };
    cache.put("same", old); expect(cache.take("same")).toBe(old);
    cache.put("same", fresh); expect(closed).toEqual([]);
    cache.put("other", old); expect(closed).toEqual([old]); expect(cache.take("same")).toBe(fresh);
  });
  it("keeps independent driver caches and closes only the idle values on explicit clear", () => {
    const a = fixture(), b = fixture(); const entry = { stamp: 1, payload: "owned" };
    a.cache.put("viewerA/view1", entry); b.cache.put("viewerB/view2", { ...entry });
    a.cache.clear(); expect(a.closed).toEqual([entry]); expect(diagnostics(a.cache).entries).toBe(0);
    expect(diagnostics(b.cache).entries).toBe(1); expect(b.closed).toEqual([]);
  });
});
