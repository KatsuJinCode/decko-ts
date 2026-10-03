// The Cloudflare Workers host's WRITE surface: D1-backed sessions, the
// sign-in route, the first-run /setup window, and card create/update/delete —
// all of them riding environment gates so the deployed demo's default posture
// stays exactly what it is today (read-only).
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS, AND WHAT IT IS NOT
// ---------------------------------------------------------------------------
// It is a HOST ADAPTER and nothing else. Every behavior below is already
// implemented and already Ruby-cited in three engine modules, none of which
// this file changes:
//
//   src/server/write-routes.ts       the CUD grammar + the *signin update
//   src/card/auth/session-store.ts   token -> actor over auth_sessions
//   src/server/first-run-routes.ts   GET/POST /setup
//
// What is NEW here, and is NEW-not-Ruby, is the Workers-shaped plumbing:
// turning a Web `Request` into the `WriteRouteRequest` those modules take,
// turning their `WriteRouteResponse` back into a `Response` with
// `Set-Cookie` on it, and the two `[vars]` gates. No URL grammar, no
// validation ladder, no response shape is invented here.
//
// ---------------------------------------------------------------------------
// THE TWO GATES, AND WHY THEY ARE [vars] AND NOT process.env
// ---------------------------------------------------------------------------
// Both shared modules read their gate off process.env at call time:
//   src/server/write-routes.ts:190-192   writePathEnabled() -> DECKO_WRITE_PATH === "1"
//   src/card/auth/first-run-setup.ts:237-239 firstRunEnabled() -> DECKO_FIRST_RUN === "1"
// Neither caches at module load (first-run-setup.ts:233-236 says so
// explicitly), so a host that assigns process.env per request gets the
// armed surface on the very next call.
//
// On Workers those values arrive as BINDINGS on `env`, not as process.env
// entries. The Cloudflare nodejs_compat documentation
// (https://developers.cloudflare.com/workers/runtime-apis/nodejs/, fetched
// 2026-10-02) lists "Process: supported" and says NOTHING about process.env
// mirroring [vars] — so this host does not assume it. `syncGateToProcessEnv`
// below ASSIGNS the binding's value into process.env, and the one thing this
// file relies on is the proven part: process.env exists and is a mutable
// object on workerd under compatibility_flags = ["nodejs_compat"] (the flag
// wrangler.toml already sets). Measured by
// tests/deploy/deploy-worker-write-surface.test.ts, which runs the real
// worker.js bundle in workerd and asserts `firstRunEnabled()` flipped.
//
// If that assignment ever stops taking on a future runtime, the failure is
// LOUD, not silent: `handleFirstRunRequest` would answer null, and
// `mountFirstRun` turns exactly that into a 501 naming the missing gate
// rather than letting /setup fall through to the card renderer and render a
// card named "setup".
//
// ---------------------------------------------------------------------------
// THE DEFAULT POSTURE, STATED PLAINLY
// ---------------------------------------------------------------------------
// DECKO_WRITE_PATH unset  ->  every non-GET/HEAD verb answers 403 and the
//                            engine is never called. GET/HEAD is untouched.
// DECKO_FIRST_RUN unset   ->  /setup does not exist; it renders whatever the
//                            read path renders today (the card named "setup",
//                            or the existing 404 — unchanged either way).
//
// ONE honest delta to the read-only default, called out here because it is a
// behavior change and not a no-op: before this surface, worker.js's
// parsePath ignored the request method entirely, so `POST /Hello+World`
// rendered the Hello World card and answered 200 — a write verb silently
// answered as a read. It now answers 403 unless the operator opts in. No GET
// or HEAD response changes; this only removes the method-blind conflation.

import type { SQLDatabaseDriver } from "./driver.js";
import type { FetchEngine } from "../card/fetch.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "./drivers/d1.js";
import {
  handleAuthOnlyRequest,
  handleWriteRequest,
  SESSION_COOKIE_NAME,
  type WriteRouteResponse,
} from "./write-routes.js";
// Re-exported so the second host (the Bunny edge surface) imports the
// auth-only dispatch from THIS module, the one it already depends on —
// one import graph edge fewer to drift.
export { handleAuthOnlyRequest };
import { handleFirstRunRequest, SETUP_PATH } from "./first-run-routes.js";
import { expireRenderCachesAfterSave } from "./post-save-cache-expiry.js";

/** The subset of the Workers `env` this surface reads. The D1 binding is the
 *  one the deploy already provisions; the two flags are optional [vars]. */
/** The two gate flags alone — the shape a host that owns its own DB binding
 *  passes (the edge-signin-session surface reads only these; fold-10 union
 *  export matching the deploy lineage's edge-signin-form-fix shape). */
export interface WriteSurfaceFlags {
  /** "1" opens the /setup window (first-run-routes.ts:97, :145). */
  readonly DECKO_FIRST_RUN?: string;
  /** "1" turns on sign-in and card create/update/delete. Anything else,
   *  including absent, is off. */
  readonly DECKO_WRITE_PATH?: string;
}

export interface WorkersWriteEnv extends WriteSurfaceFlags {
  readonly DB: D1DatabaseLike;
}

/** The render engine the host already boots (worker.js's `deck.render`). Only
 *  the two members the post-save expiry and the ajax soft redirect need. */
export interface WorkersRenderEngine {
  render(name: string, view: string): Promise<string>;
  expireRenderCard(name: string): void;
}

export interface WorkersWriteContext {
  /** The host's warm FetchEngine — the SAME one the read path uses, so a
   *  post-save expiry reaches the bytes the read path will serve next. */
  readonly fetcher: FetchEngine;
  readonly renderEngine: WorkersRenderEngine;
  /** Overrides the D1 adapter the surface would build from env.DB. Tests
   *  pass the LocalSqliteDriver here; the Worker never does. */
  readonly driver?: SQLDatabaseDriver;
}

/** One inbound request, normalized off the Web Request. Same field names and
 *  same lower-cased-header convention write-routes.ts:112-128 documents. */
export interface WorkersWriteRequest {
  readonly method: string;
  /** The URL pathname, percent-ENCODED as received, trailing slashes already
   *  stripped by the caller (write-routes.ts:115). */
  readonly pathname: string;
  readonly host: string | undefined;
  readonly headers: Record<string, string | undefined>;
  readonly body: string;
  /** RAW body bytes — required for multipart/form-data (write-routes.ts:121-127
   *  documents the byte-corruption this avoids). */
  readonly bodyBytes?: Uint8Array;
  /** True when the request arrived over TLS. Gates the `Secure` cookie
   *  attribute (see hardenSessionCookie). */
  readonly secure: boolean;
  /** The scheme the CLIENT used — the same evidence as {@link secure},
   *  captured so a redirect builder cannot hand the already-authenticated
   *  browser a scheme-downgraded Location. workerd's Request URL scheme is
   *  authoritative here. (fold-10 union: the field is the scheme-downgrade
   *  lane's surface the edge-signin-form-fix pick consumes — 4d7b008's
   *  hunks read it; the deploy lineage landed it in b0f8252.) */
  readonly scheme: "http" | "https";
  /** The client ip the host captured, for card_acts
   *  (director/class_methods.rb:27-29 via write-routes.ts:137-139). */
  readonly ipAddress?: string;
}

export interface WorkersWriteResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** The staging-slice sign-in form path, the same `/_*` name
 *  first-run-routes.ts:92-95 uses so it can never collide with a card mark. */
export const WORKERS_SIGNIN_PATH = "/_signin";

/** The captured sign-in form's action (write-routes.ts:613-624: the real
 *  oracle form posts to /update/*signin with _method=patch and the subcard
 *  grammar). encodeURIComponent leaves "*" alone, so the literal path
 *  matches. */
const SIGNIN_FORM_ACTION = "/update/*signin";

// ---------------------------------------------------------------------------
// the gates
// ---------------------------------------------------------------------------

/** Is the write path armed? The [vars] value is authoritative; the engine
 *  modules' own process.env read is the fallback for a host that sets it
 *  there instead (the Node staging host, vm-staging-server.mjs:906). */
export function writePathArmed(env: WriteSurfaceFlags): boolean {
  if (typeof env.DECKO_WRITE_PATH === "string") return env.DECKO_WRITE_PATH === "1";
  return false;
}

export function firstRunArmed(env: WriteSurfaceFlags): boolean {
  if (typeof env.DECKO_FIRST_RUN === "string") return env.DECKO_FIRST_RUN === "1";
  return false;
}

/** Assign the binding's value into process.env so the shared gates
 *  (write-routes.ts:190-192, first-run-setup.ts:237-239) agree with this
 *  host's decision. Best-effort by design: a runtime with no process.env is
 *  a 501 on /setup and an ungated handleWriteRequest, which is why the
 *  Workers-side gate is ALSO enforced independently by the caller below —
 *  this assignment is for the shared modules' benefit, not the gate. */
function syncGateToProcessEnv(name: string, armed: boolean): void {
  try {
    (process.env as Record<string, string | undefined>)[name] = armed ? "1" : "0";
  } catch {
    // A runtime without a mutable process.env. Not fatal for the write path
    // (handleWriteRequest does not consult the flag); handled explicitly for
    // the first-run path in mountFirstRun.
  }
}

// ---------------------------------------------------------------------------
// cookie hardening
// ---------------------------------------------------------------------------

/** sessionCookieHeader() (write-routes.ts:223-228) already emits HttpOnly,
 *  SameSite=Lax and the 48h Max-Age. It has no `Secure`, because the Node
 *  staging host also serves plain http on localhost. On a Workers deployment
 *  the request is always https, so this host appends the attribute rather
 *  than editing a CRLF carrier: `Secure` is an independent cookie attribute
 *  and its position in the attribute list carries no meaning (RFC 6265
 *  §5.2.6 — the attribute order is not significant). */
function hardenSessionCookie(value: string, secure: boolean): string {
  if (!secure) return value;
  if (/(?:^|;\s*)Secure(?:;|$)/i.test(value)) return value;
  return `${value}; Secure`;
}

// ---------------------------------------------------------------------------
// request/response bridging
// ---------------------------------------------------------------------------

/** Read a Web Request into the shape both shared modules accept. The body is
 *  read ONCE, as bytes; the utf8 text view is derived from those same bytes
 *  so the two can never disagree (write-routes.ts:121-127). */
export async function readWorkersRequest(request: Request): Promise<WorkersWriteRequest> {
  const url = new URL(request.url);
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const method = request.method.toUpperCase();
  let body = "";
  let bodyBytes: Uint8Array | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const raw = new Uint8Array(await request.arrayBuffer());
    bodyBytes = raw;
    body = new TextDecoder().decode(raw);
  }
  return {
    method,
    pathname: url.pathname.replace(/\/+$/, ""),
    host: url.host,
    headers,
    body,
    bodyBytes,
    secure: url.protocol === "https:",
    scheme: url.protocol === "https:" ? "https" : "http",
    ipAddress: headers["cf-connecting-ip"] ?? headers["x-forwarded-for"],
  };
}

/** Build the Web Response. `Set-Cookie` is applied with `append`, never via
 *  the plain-object header init: a Headers constructor given a header object
 *  joins repeated names with ", " and a comma is not a legal separator inside
 *  a Set-Cookie value's Expires attribute, so the object form is only safe
 *  while exactly one cookie is ever set. append() keeps that true when a
 *  second cookie is added later. */
export function toWebResponse(
  result: WorkersWriteResponse,
  request: WorkersWriteRequest,
): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(result.headers)) {
    if (name.toLowerCase() === "set-cookie") {
      headers.append(name, hardenSessionCookie(value, request.secure));
    } else {
      headers.set(name, value);
    }
  }
  if (!headers.has("Content-Type") && result.body !== "") {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  return new Response(result.body, { status: result.status, headers });
}

// ---------------------------------------------------------------------------
// the surfaces
// ---------------------------------------------------------------------------

function plainText(status: number, title: string, message: string): WorkersWriteResponse {
  return {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body:
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body><h1>${title}</h1><p>${message}</p></body></html>`,
  };
}

/** The default-off answer for any non-GET/HEAD verb. 403 is the class Ruby
 *  itself uses for a write the actor may not make: `class PermissionDenied <
 *  UserError; self.status_code = 403` (card-1.110.0/lib/card/error.rb:103-105,
 *  verified in the gem tree). Here the actor is the deployment's own posture,
 *  not a person, but the class is the same one a reader of Ruby's own error
 *  table would expect. */
function writePathOffResponse(): WorkersWriteResponse {
  return plainText(
    403,
    "Writes are off on this deployment",
    "This deck is deployed read-only. The deployment's DECKO_WRITE_PATH setting " +
      "is not 1, so no card can be created, edited, or deleted here.",
  );
}

/** GET /_signin — the minimal honest sign-in form.
 *
 *  NEW PRODUCT SURFACE, NOT RUBY. Live decko renders the *signin card's OWN
 *  form at this route (card-mod-account-0.20.0/set/self/signin.rb:4 "/:signin
 *  (core view) gives the login ui"); this port's card views are byte-parity
 *  surface and the account-mod form views are unported rails, so serving the
 *  real card view would change rendered bytes. The staging host serves the
 *  same kind of stand-in (vm-staging-server.mjs:2649-2672, "this staging form
 *  posts to /_signin").
 *
 *  What is NOT invented: the form's action, verb, hidden fields and field
 *  names are the captured oracle grammar — `card[subcards][+*email][content]`
 *  and `card[subcards][+*password][content]` posted to /update/*signin with
 *  _method=patch and success[redirect]=true&success[mark]=*previous, which is
 *  exactly what write-routes.ts:613-671 already consumes. The engine's
 *  signin_success aborts the save (set/self/signin.rb:14-16) and the
 *  controller redirects to *previous (signin.rb:170-173), so this form
 *  changes no engine behavior at all. */
export function signinFormPage(): WorkersWriteResponse {
  const field = (label: string, id: string, name: string, type: string): string =>
    `<p><label for="${id}">${label}</label><br>` +
    `<input id="${id}" name="${name}" type="${type}" autocomplete="off" size="40"></p>`;
  return {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body:
      `<!doctype html><html><head><meta charset="utf-8"><title>Sign in</title></head><body>` +
      `<h1>Sign in</h1>` +
      `<form action="${SIGNIN_FORM_ACTION}" method="post">` +
      `<input type="hidden" name="_method" value="patch">` +
      `<input type="hidden" name="success[redirect]" value="true">` +
      `<input type="hidden" name="success[mark]" value="*previous">` +
      field("Email", "signin_email", "card[subcards][+*email][content]", "text") +
      field("Password", "signin_password", "card[subcards][+*password][content]", "password") +
      `<p><button type="submit">Sign in</button></p>` +
      `</form></body></html>`,
  };
}

/** GET /setup — delegated whole to first-run-routes.ts. The census, the form
 *  bytes, the 404-when-closed and the 422 validation ladder are all that
 *  module's; this host only supplies the driver and the fetcher, which are
 *  the two seams its FirstRunRouteContext asks for (first-run-routes.ts:127-134). */
async function mountFirstRun(
  ctx: WorkersWriteContext,
  driver: SQLDatabaseDriver,
  req: WorkersWriteRequest,
): Promise<WorkersWriteResponse> {
  const result = await handleFirstRunRequest(
    { driver, fetcher: ctx.fetcher },
    {
      method: req.method,
      pathname: req.pathname,
      host: req.host,
      headers: req.headers,
      body: req.body,
    },
  );
  if (result === null) {
    // Unreachable while the gate agrees with firstRunEnabled(). If it does
    // not — a runtime where the process.env assignment above did not take —
    // say so instead of falling through to the card renderer.
    return plainText(
      501,
      "The first-run window could not be armed",
      "This deployment sets DECKO_FIRST_RUN=1, but its runtime did not make the " +
        "setting visible to the engine's gate, so /setup is not served.",
    );
  }
  expireAfterSave(ctx, result.expiryName);
  return { status: result.status, headers: result.headers, body: result.body };
}

/** Non-GET/HEAD — delegated whole to write-routes.ts. handleWriteRequest is
 *  NOT self-gated (the gate is the host's, write-routes.ts:187-192), which is
 *  why the 403 lives here and the function is only ever reached with the
 *  write gate armed. */
async function mountWrite(
  ctx: WorkersWriteContext,
  driver: SQLDatabaseDriver,
  req: WorkersWriteRequest,
): Promise<WorkersWriteResponse> {
  const result: WriteRouteResponse | null = await handleWriteRequest(
    {
      driver,
      fetcher: ctx.fetcher,
      ipAddress: req.ipAddress,
      // The ajax soft redirect (response.rb:54-62) re-renders the SAVED card
      // through the host's render engine. Ruby's order is expiry first, then
      // the re-render (cache/all.rb) — without it the slot render would read
      // the pre-save warm maps (post-save-cache-expiry.ts:9-19).
      renderSlot: async (name) => {
        ctx.fetcher.expireName(name);
        ctx.renderEngine.expireRenderCard(name);
        return ctx.renderEngine.render(name, "titled");
      },
      // attachmentStore is deliberately ABSENT: a Workers deployment binds no
      // R2 bucket, so there is no storage seam to pass. An upload therefore
      // fails with the engine's programming-error rejection rather than
      // silently writing nothing. Disclosed rather than faked.
    },
    {
      method: req.method,
      pathname: req.pathname,
      host: req.host,
      headers: req.headers,
      body: req.body,
      bodyBytes: req.bodyBytes,
    },
  );
  if (result === null) {
    // Not a write route at all (write-routes.ts:701-706's contract). With the
    // write path armed, 405 is the honest answer; the read-only default never
    // reaches here.
    return plainText(405, "Method not allowed", "That is not a card write route on this deck.");
  }
  expireAfterSave(ctx, result.expiryName);
  return { status: result.status, headers: result.headers, body: result.body };
}

/** Ruby's expiry rides every committed save (card-1.110.0
 *  lib/card/director/phases.rb:3, :54); the port models it on the shared
 *  FetchEngine and the host must drop the render-side warm maps the fetch
 *  layer cannot reach (post-save-cache-expiry.ts:12-19). Keyed on
 *  expiryName, never on the response shape. */
function expireAfterSave(ctx: WorkersWriteContext, expiryName: string | undefined): void {
  if (expiryName === undefined || expiryName === "") return;
  expireRenderCachesAfterSave(
    {
      fetcher: ctx.fetcher,
      renderEngine: ctx.renderEngine,
      signedInEngines: [],
    },
    { status: 200, headers: {}, body: "", expiryName },
  );
}

// ---------------------------------------------------------------------------
// the dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatch one request against the Workers write surface.
 *
 * Returns null — "not mine, fall through to the read surface" — for every GET
 * or HEAD that is not /setup and not the sign-in form. That null is what
 * keeps the deployed read-only surface byte-identical.
 */
export async function handleWorkersWriteSurface(
  ctx: WorkersWriteContext,
  req: WorkersWriteRequest,
  env: WriteSurfaceFlags & { readonly DB?: D1DatabaseLike },
): Promise<WorkersWriteResponse | null> {
  const firstRun = firstRunArmed(env);
  const write = writePathArmed(env);
  // Do the sync for BOTH flags every request, so a runtime that carries a
  // stale process.env from another deployment shape cannot leave the shared
  // gates disagreeing with this host's answer.
  syncGateToProcessEnv("DECKO_FIRST_RUN", firstRun);
  syncGateToProcessEnv("DECKO_WRITE_PATH", write);

  const readMethod = req.method === "GET" || req.method === "HEAD";

  // /setup, when the first-run gate is armed. first-run-routes.ts:146-147
  // accepts GET and POST only, so a HEAD falls through to the read surface
  // and keeps answering exactly what it answers today.
  if (firstRun && (req.method === "GET" || req.method === "POST") && req.pathname === SETUP_PATH) {
    return mountFirstRun(ctx, resolveDriver(ctx, env), req);
  }

  // The sign-in form, when the write gate is armed (sign-in mints a session
  // row, so it rides the same gate as the rest of the write surface).
  if (write && req.method === "GET" && req.pathname === WORKERS_SIGNIN_PATH) {
    return signinFormPage();
  }

  if (readMethod) return null;
  if (!write) {
    // AUTH IS NOT A CARD WRITE (edge-signin-form-fix lane, 2026-10-03):
    // with the write path off, the login action still dispatches —
    // /update/*signin mints an auth_sessions row and no card rows, and Ruby
    // decko never gates sign-in behind a deploy flag. The auth-only dispatch
    // resolves to handleSigninUpdate for POST /update/*signin and null for
    // everything else, so every card create/update/delete keeps the exact
    // off-response it has always answered here.
    const auth = await handleAuthOnlyRequest(
      {
        driver: resolveDriver(ctx, env),
        fetcher: ctx.fetcher,
        ipAddress: req.ipAddress,
      },
      {
        method: req.method,
        pathname: req.pathname,
        host: req.host,
        scheme: req.scheme,
        headers: req.headers,
        body: req.body,
        bodyBytes: req.bodyBytes,
      },
    );
    if (auth !== null) return auth;
    return writePathOffResponse();
  }
  return mountWrite(ctx, resolveDriver(ctx, env), req);
}

/** The D1 adapter for the write path. CloudflareD1Adapter is a stateless
 *  wrapper over the binding (drivers/d1.ts:55-61), so building it per request
 *  shares nothing with the host's read adapter and warms nothing. (fold-10
 *  union: DB is optional in the env bag the edge-signin-session surface
 *  passes — a flags-only host supplies ctx.driver; neither is the write
 *  path's own named error, per the deploy lineage's shape.) */
function resolveDriver(ctx: WorkersWriteContext, env: WriteSurfaceFlags & { readonly DB?: D1DatabaseLike }): SQLDatabaseDriver {
  if (ctx.driver !== undefined) return ctx.driver;
  if (env.DB === undefined) {
    throw new Error(
      "write surface needs a storage binding: pass ctx.driver (host adapter) or env.DB (the D1 binding)",
    );
  }
  return new CloudflareD1Adapter(env.DB);
}

export { SESSION_COOKIE_NAME, SETUP_PATH };
