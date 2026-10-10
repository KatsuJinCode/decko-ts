// deploy/bunny-worker-src/bunny-edge-server-timing.ts — THE EDGE PROFILER
// (edge-profiler lane, 2026-10-05): per-phase request timing surfaced on
// EVERY response as the standard `Server-Timing` header.
//
// WHY THIS EXISTS (measured 2026-10-05): signed-in requests skip the
// prepared-page stores and run the full statement ladder — home 45.4 s,
// member pages 504 at the 59 s platform wall — while anonymous prepared
// pages serve in 0.04-0.6 s, and NOTHING on the wire said WHERE a slow
// request spent its time. This module ends that: every response carries
//
//   Server-Timing: auth;dur=X, seat;dur=Y, db;dur=Z;stmt=N, render;dur=W, total;dur=T
//
// — the standard header (curl -v shows it; browser profilers and perf
// tooling read it natively). The pre-existing X-Decko-* diagnostic headers
// are untouched; this module only ADDS one header, best-effort (an
// immutable-header runtime must never turn a served page into a 500 over a
// label — the same guard convention the cache modules keep).
//
// THE PHASES (the handler's request pipeline: auth -> seat/store -> render
// -> serialize):
//   auth   — session resolution wall: the Cookie scan plus, when a cookie
//            is present, the SessionStore lookup SQL (~0 for cookieless).
//   seat   — the prepared-page cache layer wall OUTSIDE the render closure:
//            the L2 Cache API match, the L3 global render-cache lookup, and
//            their write-through stores (the signed-in per-viewer path
//            bypasses the caches, so its seat is the wrapper overhead only,
//            ~0). Computed as the serve-layer wall minus the render wall —
//            sound in a single-threaded isolate, where the render closure's
//            wall is strictly nested inside the serve layer's wall.
//   db     — AGGREGATE wall across the isolate's database round trips
//            during this request — Bunny DB pipeline POSTs, or D1 binding
//            calls on the Cloudflare host — with stmt=N = statements the
//            deck driver was asked to run (logical; one per query() call,
//            one per statement in batch()), and, where the host measures
//            at the round-trip boundary, wire=M = statements physically
//            carried by those round trips and ops=K = logical driver
//            operations (one query()/batch()/transaction() call, however
//            many round trips it issued — the number trips used to carry
//            before finding 5). db OVERLAPS the wall phases by design —
//            auth's session SELECT, the seat tier's lookup/store hops, and
//            the render ladder all hit the same database; db answers "how
//            much of this request was database", the wall phases answer
//            "where in the pipeline it went". stmt counts REAL wire
//            statements only:
//            the counter rides the deck driver's own
//            BunnyDbQueryCounterLike seam, which a render-plan replay
//            answer never reaches (replayed reads are zero-round-trip by
//            design and are honestly absent from the count). The L3 tier's
//            own single-statement hops ride the db wall (its drivers share
//            the timing fetchImpl) but not stmt (their drivers keep the
//            default no-op counter) — recorded here so the number is never
//            misread.
//   render — the render closure wall: handleEngineRequest including every
//            db hop inside it. Response body production (serialize) is
//            inline in this closure and in the cache store paths already
//            timed — it has no distinct phase boundary to time without a
//            body read that would cost real milliseconds on every response,
//            so it is deliberately NOT a separate metric.
//   total  — the whole handler wall, first line to finished Response.
//
// ATTRIBUTION CONTRACT (honest about the isolate): the db ledger is
// per-ISOLATE and monotonic; a request's db/stmt numbers are DELTAS of that
// ledger across the request's window. When two requests overlap inside one
// isolate, each delta includes the shared hops — the per-request numbers
// are exact whenever requests do not overlap driver activity and bound the
// truth when they do (the deltas of concurrent requests sum to the ledger's
// total, so nothing is invented or lost). Wall phases have the same
// single-threaded-isolate caveat. This is the measurement contract the
// instrument ships with, stated so no one mistakes a shared-isolate number
// for an impossibility.
//
// COST: Date.now() pairs at phase boundaries and one integer add per
// pipeline POST — nothing per byte, nothing per statement beyond the
// add. No opt-in query param: the header is cheap enough to be always-on,
// which is the point (a slow request answered at 3 a.m. carries its own
// autopsy).
//
// SDK-FREE BY CONSTRUCTION (no "@bunny.net/edgescript-sdk" import): the
// handler's tests import this module directly under vitest, the same
// testability pattern the sibling worker-src modules keep.

import { BunnyDbQueryCounter } from "../../src/card/drivers/bunny-db.js";
import { probeRecordPost } from "./bunny-edge-isolate-probe.js";

/** The header this instrument adds to every response. */
export const EDGE_SERVER_TIMING_HEADER = "Server-Timing";

// ---------------------------------------------------------------------------
// The per-isolate db ledger
// ---------------------------------------------------------------------------

/** A point-in-time reading of the isolate's database ledger. */
export interface EdgeDbLedgerSnapshot {
  /** Aggregate wall ms across completed round trips (pipeline POSTs on
   *  Bunny; binding calls on Cloudflare). */
  readonly dbMs: number;
  /** How many round trips completed: pipeline POSTs (Bunny) or D1 binding
   *  calls (Cloudflare), retries and failed attempts included — each is
   *  real wall time the request paid. On Cloudflare this counts what the
   *  binding actually received, not logical driver calls: one driver
   *  operation can issue several binding batches (the lock-state probe
   *  plus its fallback before the transaction-state table is installed, a
   *  lease repair, the journal's begin and commit). */
  readonly posts: number;
  /** Logical statements the deck driver was asked to run (its counter: one
   *  per query() call, one per statement in batch()). This is the
   *  DRIVER-operation view, kept under its own name so dashboards that
   *  read it keep their meaning; the statements physically inside the
   *  round trips are `wireStmts`. */
  readonly stmts: number;
  /** Statements physically carried by the counted round trips (a D1
   *  batch's full statement list, the adapter's own appended
   *  `SELECT changes()`, lock-state probes, lease fences and ownership
   *  asserts included). Recorded only by hosts that measure at the
   *  binding boundary (Cloudflare); Bunny leaves it at zero and the
   *  header omits it rather than printing a false 0. */
  readonly wireStmts: number;
  /** Logical driver operations: SQLDatabaseDriver.query()/batch()/
   *  transaction() invocations, one each however many round trips they
   *  issue. This is the count the trips number used to carry before the
   *  binding-boundary fix (review round 3, finding 5), kept so a
   *  dashboard comparing driver work across hosts still can. Recorded
   *  only on Cloudflare; Bunny leaves it at zero and the header omits it. */
  readonly driverOps: number;
}

let ledgerDbMs = 0;
let ledgerPosts = 0;
let ledgerWireStmts = 0;
let ledgerDriverOps = 0;
/** THE statement counter — the driver's OWN mutable counter class (its
 *  `queryCounter` option takes exactly this type), installed as the deck
 *  driver's counter at boot. Single source of truth for stmt: the ledger
 *  snapshot reads it, so the header's stmt=N is literally the driver's
 *  count for the request window. captureSql stays off: no SQL text is
 *  retained, only the count. */
const ledgerQueryCounter = new BunnyDbQueryCounter();

/** Current ledger reading. */
export function edgeDbLedgerSnapshot(): EdgeDbLedgerSnapshot {
  return {
    dbMs: ledgerDbMs,
    posts: ledgerPosts,
    stmts: ledgerQueryCounter.count(),
    wireStmts: ledgerWireStmts,
    driverOps: ledgerDriverOps,
  };
}

/** Test seam: zero the isolate ledger (isolate-bound state must not leak
 *  across tests — the same convention resetGlobalRenderCacheForTests
 *  keeps). */
export function resetEdgeDbLedgerForTests(): void {
  ledgerDbMs = 0;
  ledgerPosts = 0;
  ledgerWireStmts = 0;
  ledgerDriverOps = 0;
  ledgerQueryCounter.reset();
}

/** The fetch wrapper installed as the drivers' `fetchImpl`: times every
 *  Bunny DB pipeline POST into the ledger. Resolves globalThis.fetch at
 *  CALL time — not construction time like the driver's default
 *  `fetch.bind(globalThis)` — so a test stub installed after the handler
 *  module loads still runs (the parity-suite constraint). In production the
 *  ambient fetch IS the platform fetch: behavior identical, timing added.
 *
 *  The driver's only network call is the pipeline POST, so this sees every
 *  db hop exactly once per attempt (a retried hop accumulates each
 *  attempt's wall — the honest total of what the request paid). */
export function edgeDbTimingFetch(): typeof fetch {
  return async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const t0 = Date.now();
    try {
      return await fetch(input as RequestInfo, init);
    } finally {
      ledgerDbMs += Math.max(0, Date.now() - t0);
      ledgerPosts += 1;
      probeRecordPost(Math.max(0, Date.now() - t0));
    }
  };
}

/** Record one database round trip and its statements, measured where the
 *  round trip actually happens (cf-hosting 2026-10-07; binding-boundary
 *  counting per review round 3, finding 5): its wall time into the ledger,
 *  one trip, and the statements the trip physically carried. A FAILED call
 *  is recorded too — the D1 lock-state probe batch against a database
 *  without the transaction-state table is a round trip the request paid.
 *  One driver operation may record here several times (probe + fallback,
 *  lease repair, the journal's begin and commit); the logical-operation
 *  count lives in recordEdgeDbDriverOp, labelled separately. */
export function recordEdgeDbBindingCall(ms: number, statements: number): void {
  ledgerDbMs += Math.max(0, ms);
  ledgerPosts += 1;
  ledgerWireStmts += Math.max(0, statements);
}

/** Record one logical driver operation: a single SQLDatabaseDriver
 *  query()/batch()/transaction() invocation, however many binding calls it
 *  actually issued. Kept as its own labelled counter (finding 5) so the
 *  trips number can report real round trips without a dashboard that
 *  tracked the old per-invocation figure silently changing meaning. */
export function recordEdgeDbDriverOp(): void {
  ledgerDriverOps += 1;
}

/** The counter handed to the deck driver as its `queryCounter` (the driver
 *  already counts queries; this exposes the counter per request via the
 *  ledger deltas). Install ONCE per isolate — it is a singleton view over
 *  the ledger. */
export function edgeDriverQueryCounter(): BunnyDbQueryCounter {
  return ledgerQueryCounter;
}

// ---------------------------------------------------------------------------
// Per-request profile
// ---------------------------------------------------------------------------

/** One request's phase timers. Created at handler entry; wall phases are
 *  accumulated by the handler at its phase boundaries; db/stmt come from
 *  the ledger delta between `start` and header time. */
export interface EdgeRequestProfile {
  /** Handler-entry wall clock (Date.now()). */
  t0: number;
  /** Session resolution wall (cookie scan + session-store SQL). */
  authMs: number;
  /** Prepared-page cache layer wall outside the render closure. */
  seatMs: number;
  /** Render closure wall (handleEngineRequest incl. its db hops). */
  renderMs: number;
  /** Ledger reading at handler entry. */
  start: EdgeDbLedgerSnapshot;
}

/** Start a request profile. Called once, at the top of the handler. */
export function startEdgeRequestProfile(): EdgeRequestProfile {
  return {
    t0: Date.now(),
    authMs: 0,
    seatMs: 0,
    renderMs: 0,
    start: edgeDbLedgerSnapshot(),
  };
}

/** The db phase for a profile: ledger deltas across the request window,
 *  clamped non-negative (a clock can only go forward; the clamp keeps a
 *  test seam from producing absurd output). `stmt` is the logical-statement
 *  delta; `wire` and `ops` are the binding-statement and logical-driver-
 *  operation deltas, present only where the host measures them. */
export function edgeDbDelta(
  profile: EdgeRequestProfile,
  end: EdgeDbLedgerSnapshot = edgeDbLedgerSnapshot(),
): { dur: number; stmt: number; wire: number; ops: number } {
  return {
    dur: Math.max(0, end.dbMs - profile.start.dbMs),
    stmt: Math.max(0, end.stmts - profile.start.stmts),
    wire: Math.max(0, end.wireStmts - profile.start.wireStmts),
    ops: Math.max(0, end.driverOps - profile.start.driverOps),
  };
}

/** The exact wire value:
 *  `auth;dur=X, seat;dur=Y, db;dur=Z;stmt=N[, wire=M][, ops=K], render;dur=W, total;dur=T`.
 *  Integer milliseconds (`;stmt=` is a custom metric param — spec-legal,
 *  ignored by profilers that do not know it). `wire=` names the statements
 *  physically inside the round trips and `ops=` the logical driver
 *  operations, each appended only when the host measured it — an
 *  unmeasured number is omitted, never printed as 0 (the same honesty the
 *  stmt counter keeps for replayed reads). `end` is a test seam; the
 *  handler omits it and the live ledger answers. */
export function serverTimingHeaderValue(
  profile: EdgeRequestProfile,
  end: EdgeDbLedgerSnapshot = edgeDbLedgerSnapshot(),
): string {
  const r = (n: number): number => Math.max(0, Math.round(n));
  const db = edgeDbDelta(profile, end);
  const dbParams = `db;dur=${r(db.dur)};stmt=${db.stmt}` +
    `${db.wire > 0 ? `;wire=${db.wire}` : ""}${db.ops > 0 ? `;ops=${db.ops}` : ""}`;
  return (
    `auth;dur=${r(profile.authMs)}, seat;dur=${r(profile.seatMs)}, ` +
    `${dbParams}, ` +
    `render;dur=${r(profile.renderMs)}, ` +
    `total;dur=${r(Math.max(0, Date.now() - profile.t0))}`
  );
}

/** Add the header to a finished response. Best-effort: a runtime that
 *  hands back an immutable header guard loses the label, never the page
 *  (the cache modules' own guard convention). The response object is
 *  returned unchanged otherwise — existing headers, bytes, and status are
 *  never touched. */
export function applyEdgeServerTimingHeader<T extends Response>(
  profile: EdgeRequestProfile,
  response: T,
): T {
  try {
    response.headers.set(EDGE_SERVER_TIMING_HEADER, serverTimingHeaderValue(profile));
  } catch {
    /* immutable header guard: unlabeled, bytes and behavior unchanged */
  }
  return response;
}
