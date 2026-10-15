// deploy/bunny-worker-src/bunny-edge-session-viewer.ts — the edge read
// path's SESSION concept: cookie -> actor -> viewer, and the sign-out
// surface that revokes a session over HTTP.
//
// ---------------------------------------------------------------------------
// THE GAP THIS FILE CLOSES, AND ITS MECHANISM
// ---------------------------------------------------------------------------
//   Before this file the Bunny edge render path had no session concept at
//   all, and the gap was structural rather than a missing feature:
//
//     * handleEngineRequest (bunny-edge-engine-request.ts:103) called
//       deck.render.render(name, view, params) with no actor argument;
//     * ZERO cookie reads existed anywhere on the render / fetch / entry
//       surfaces (the only readSessionCookie caller was the write path,
//       write-routes.ts:762);
//     * the RenderEngine was BUILT with no viewer — `new
//       RenderEngine(fetcher)` at bunny-edge-engine-entry.ts:152,
//       deploy/worker.ts:96 and worker.ts:49 — so src/card/render.ts:447
//       left `viewer` at its ANONYMOUS_VIEWER default;
//     * and clearedSessionCookieHeader (write-routes.ts:240) had exactly
//       ONE caller in the whole repo (vm-staging-server.mjs:2643, the
//       staging host's handleSignout), so a session minted by
//       POST /update/*signin could never be revoked over HTTP on the edge.
//
//   Mechanism, stated so the fix can be judged against it: the engine's
//   permission state MEMOIZES per engine. `ensureReadPermission`
//   (src/card/render.ts:2369-2389) returns early on `this.readPermission
//   !== undefined` and folds into it the viewer it was resolved for — so
//   an engine whose viewer is Anonymous answers every page as Anonymous
//   forever, no matter which account's cookie arrives. That is why this is
//   not "set render.viewer per request": a shared engine mutated per
//   request would race across concurrent requests in one isolate AND would
//   need resetCaches() (dropping the warm-cache property the whole edge is
//   built on) to stop serving the first viewer's verdicts to the second.
//
//   THE SHAPE ADOPTED IS THE ONE THE STAGING HOST ALREADY PROVES:
//   one engine per actor, over the shared FetchEngine (fetch is
//   permission-blind — read rules ride the card records, not the fetch
//   layer). vm-staging-server.mjs:2535-2548 `engineForActor` does exactly
//   this, with the same two-warm-engines LRU. This file ports that shape
//   to the edge rather than inventing a second one, so the two hosts
//   cannot disagree about what a session is.
//
// ---------------------------------------------------------------------------
// WHY ABSENT / INVALID / EXPIRED / REVOKED ALL MEAN ANONYMOUS
// ---------------------------------------------------------------------------
//   auth/current.rb:58-63 — a session whose id no longer resolves to a live
//   account card signs in as Anonymous, never as an error and never as a
//   half-privileged state. SessionStore.lookupSession already folds all four
//   cases into one `null` (unknown token, revoked row, expired expires_at,
//   dead account card — session-store.ts:132-161), and it never throws for
//   a bad token. So the degradation is one comparison, and the anonymous
//   render is reached by the SAME engine object the pre-session edge used.
//
// ---------------------------------------------------------------------------
// THE TWO ENGINE FIELDS, AND WHY BOTH ARE SET
// ---------------------------------------------------------------------------
//   RenderEngine carries the session in two places (render.ts:443-453):
//     viewer      — the read-verdict actor (Auth.as_id). Drives read
//                  permissions, the *self/*all overrides, and the history
//                  seam's currentUserId.
//     pageSession — the page-chrome session (Auth.current). Drives the
//                  signed-in navbar, the account-links items, the follow
//                  seam, and the loud-denial copy branch
//                  (render/format.ts:1095-1104).
//   Wiring only `viewer` would leave the engine in a state Ruby has no
//   equivalent for: reading as one account while the page chrome still
//   says "Please sign in or sign up to read this" (format.ts:1100-1104).
//   Both are set to the SAME resolved actor, and both degrade together —
//   prepareSessionAccountLinks (render.ts:3967-3983) clears pageSession
//   outright if the session account card does not resolve, rather than
//   rendering half a session.
//
// SDK-FREE BY CONSTRUCTION: no "@bunny.net/edgescript-sdk" import, for the
// same reason bunny-edge-engine-request.ts has none — a module that imports
// the platform SDK cannot be loaded under vitest at all, and this is where
// the session logic has to be provable.

import { SessionStore } from "../../src/card/auth/session-store.js";
import { signoutAccount } from "../../src/card/auth/signin.js";
import type { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import {
  CROSS_ORIGIN_MESSAGE,
  checkRequestOrigin,
  defaultOriginPolicy,
  type OriginPolicy,
} from "../../src/server/request-origin.js";
import {
  ANONYMOUS_VIEWER,
  type ReadViewer,
} from "../../src/card/permissions/read-rules.js";
import {
  clearedSessionCookieHeader,
  readSessionCookie,
} from "../../src/server/write-routes.js";
import { arrivedOverTls } from "./bunny-edge-signin-session-surface.js";
import { json, type Deck } from "./bunny-edge-engine-request.js";

/**
 * The sign-out route. The `/_*` namespace, deliberately outside the
 * card-mark grammar (the lineage surface's parsePath) so no card can ever
 * be named this — the same convention WORKERS_SIGNIN_PATH uses
 * (cloudflare-write-routes.ts). Mirrors vm-staging-server.mjs's `/_signout`
 * exactly, so the staging host and the edge share one operator mental
 * model for "leave".
 */
export const EDGE_SIGNOUT_PATH = "/_signout";

/** The deck an actor-scoped render needs: the warm read engine plus the
 *  driver the session lookup rides. Same shape the entry's Deck is. */
export interface SessionDeck {
  readonly fetcher: FetchEngine;
  readonly render: RenderEngine;
}

/** The session token carried by this request's Cookie header, or null.
 *
 *  This is the ONLY new work an anonymous request does, and it is a header
 *  string scan: no query, no driver contact, no cache contact. The caller
 *  uses its null answer to take the pre-session code path verbatim, which
 *  is what keeps the anonymous bytes identical. */
export function sessionTokenFromRequest(request: Request): string | null {
  return readSessionCookie(request.headers.get("cookie"));
}

/**
 * Resolve a session token to the ReadViewer the engine should render under.
 *
 * Absent / unknown / revoked / expired / dead-account all return
 * ANONYMOUS_VIEWER (auth/current.rb:58-63). Never throws for a bad token;
 * a DRIVER error also degrades to Anonymous rather than failing the
 * request — a read page is worth more than its session, and the previous
 * behavior (render as Anonymous) is exactly what degrading preserves.
 */
export async function resolveViewerFromToken(
  token: string | null,
  sessions: SessionStore,
): Promise<ReadViewer> {
  if (token === null || token === "") return ANONYMOUS_VIEWER;
  try {
    const actor = await sessions.lookupSession(token);
    if (actor === null) return ANONYMOUS_VIEWER;
    return { signedIn: true, actorId: actor.id };
  } catch {
    // A database hiccup must not turn every page into a 500. The engine
    // renders as Anonymous — the pre-session behavior — and the next
    // request retries the lookup.
    return ANONYMOUS_VIEWER;
  }
}

/** {@link resolveViewerFromToken} for a whole Request: read the cookie,
 *  then resolve. Provided for call sites that do not need the two steps
 *  apart (the sign-out surface, the tests). */
export async function resolveRequestViewer(
  request: Request,
  sessions: SessionStore,
): Promise<ReadViewer> {
  return resolveViewerFromToken(sessionTokenFromRequest(request), sessions);
}

/**
 * One RenderEngine per signed-in actor, over the SHARED FetchEngine.
 *
 * Why per-actor and not a mutable field: the engine memoizes its
 * permission state for the viewer it was first resolved for
 * (render.ts:2369-2389 `ensureReadPermission`), and a single isolate
 * serves concurrent requests. One engine per actor is what makes the
 * memoization sound — and it is the shape the staging host already runs
 * (vm-staging-server.mjs:2535-2548), including the warm-set size and the
 * insertion-order eviction.
 */
export class ActorRenderEngines {
  private readonly engines = new Map<number, RenderEngine>();
  private readonly base: Deck;
  private readonly maxWarm: number;

  constructor(base: Deck, maxWarm = 2) {
    this.base = base;
    this.maxWarm = maxWarm;
  }

  /** The actor's engine, built on first use. */
  deckFor(actorId: number): Deck {
    const existing = this.engines.get(actorId);
    if (existing !== undefined) return this.actorDeck(existing);

    const render = new RenderEngine(this.base.fetcher);
    // Deployment config the HOST owns (render.ts:495-505) is copied off the
    // shared engine rather than re-derived, so an actor render can never
    // silently lose the CDN host or the token secret the anonymous engine
    // was given.
    render.imageCdnHost = this.base.render.imageCdnHost;
    render.tokenConfig = this.base.render.tokenConfig;
    render.fileStorage = this.base.render.fileStorage;
    // The deck's phantom (unknown item) type is host-deployment config on
    // the same terms as the three above, so it
    // is copied off the shared engine rather than re-derived — an actor
    // render that lost it would render unknown pointer items with no type
    // chip, which is a different page from the one the anonymous engine
    // served.
    render.phantomItemType = this.base.render.phantomItemType;
    // The session itself. Set BEFORE the first render — the field docs
    // (render.ts:443-447) and the memoization above both say so.
    const viewer: ReadViewer = { signedIn: true, actorId };
    render.viewer = viewer;
    render.pageSession = viewer;

    // Insertion-order eviction, same as the staging host: a third account
    // evicts the oldest rather than growing the isolate's heap without
    // bound.
    if (this.engines.size >= this.maxWarm) {
      const oldest = this.engines.keys().next();
      if (!oldest.done) this.engines.delete(oldest.value);
    }
    this.engines.set(actorId, render);
    return this.actorDeck(render);
  }

  /** The actor's deck view. The deployment's served deltas (asset host,
   *  stylesheet revision, script integrity) ride along from the shared deck:
   *  without them a signed-in page keeps the engine's fog asset URLs, and
   *  the browser blocks the stylesheet as mixed content. */
  private actorDeck(render: RenderEngine): Deck {
    const deck: Deck = { fetcher: this.base.fetcher, render };
    if (this.base.servedDeltas !== undefined) deck.servedDeltas = this.base.servedDeltas;
    return deck;
  }

  /** How many actor engines are warm — for the pins. */
  get size(): number {
    return this.engines.size;
  }
}

/**
 * The sign-out surface: `GET|POST /_signout`.
 *
 * Mirrors vm-staging-server.mjs:2636-2644 handleSignout — the same
 * `signoutAccount` over the same SessionStore, the same 200 JSON shape
 * `{ ok, revoked }`, the same cleared cookie — with ONE host-specific
 * correction: the cleared cookie carries `Secure` when the request
 * arrived over TLS, for the reason the session cookie does
 * (bunny-edge-signin-session-surface.ts header: Bunny's proxy can hand the
 * script an http URL on an HTTPS-only deployment, and the shared
 * clearedSessionCookieHeader carries no Secure because the Node staging
 * host also serves plain http on localhost).
 *
 * THE ORIGIN GATE: sign-out is a
 * state-changing request, and docs/SECURITY.md's approved-divergences row
 * says writes AND sign-in/sign-out pass the same-origin check — the same
 * checkRequestOrigin policy (request-origin.ts: Sec-Fetch-Site, then
 * Origin, then Referer; a request with none of the three did not come
 * from a browser page and passes, so scripts and API clients keep
 * working; a same-origin or address-bar GET navigation passes; a
 * cross-site or same-site one is refused) the write routes run before
 * their own state changes (write-routes.ts dispatch) and the edge's
 * sign-in surface runs through the same OriginPolicy its host derives
 * (applySecuritySettings over the DECKO_ORIGIN_CHECK /
 * DECKO_TRUSTED_ORIGINS env). The handler passes that SAME policy here,
 * so one env derivation governs sign-in, sign-out and the write surface
 * on this host. A refusal answers the write routes' 403 cross-origin
 * shape (write-routes.ts crossOriginResponse, the JSON arm this
 * surface's own responses speak) and revokes NOTHING.
 *
 * Idempotent, like Ruby's: signing out Anonymous is a no-op success, so a
 * second sign-out with the same (now dead) cookie answers 200 revoked:false.
 *
 * Returns `null` — "not mine" — for every request this route does not own,
 * so the caller falls through to its own dispatch unchanged.
 */
export async function handleEdgeSignout(
  deck: SessionDeck,
  request: Request,
  originPolicy?: OriginPolicy,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "POST") return null;
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") !== EDGE_SIGNOUT_PATH) return null;

  // The origin gate, BEFORE any session work: the same header evidence the
  // write routes judge (lower-cased headers record + the URL's host, the
  // same derivation readWorkersRequest hands the shared surface). A
  // refused request must not touch the session row.
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const originVerdict = checkRequestOrigin(
    { headers, host: url.host },
    originPolicy ?? defaultOriginPolicy(),
  );
  if (!originVerdict.ok) {
    return json(403, {
      error: {
        code: "cross-origin",
        message: `${CROSS_ORIGIN_MESSAGE} (${originVerdict.reason})`,
      },
    });
  }

  const sessions = new SessionStore({ driver: deck.fetcher.driver });
  const token = sessionTokenFromRequest(request);
  const revoked = await signoutAccount(sessions, token);
  // The shared cleared header is the byte shape the staging host emits
  // (write-routes.ts:240-242); Secure is appended from the same TLS
  // evidence the sign-in cookie uses.
  const secure = arrivedOverTls(request, url);
  const setCookie = secure
    ? `${clearedSessionCookieHeader()}; Secure`
    : clearedSessionCookieHeader();
  return json(200, { ok: true, revoked }, { "Set-Cookie": setCookie });
}
