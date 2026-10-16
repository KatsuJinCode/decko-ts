// The Cloudflare Workers host's WRITE surface: D1-backed sessions, the
// sign-in route, the first-run /setup window, and card create/update/delete —
// all of them riding environment gates so the deployed demo's default posture
// stays exactly what it is today (read-only).
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS, AND WHAT IT IS NOT
// ---------------------------------------------------------------------------
// It is a HOST ADAPTER and nothing else. Every behavior below is already
// implemented in three engine modules, none of which this file changes:
//
//   src/server/write-routes.ts       the CUD grammar + the *signin update
//   src/card/auth/session-store.ts   token -> actor over auth_sessions
//   src/server/first-run-routes.ts   GET/POST /setup
//
// What is new here is the Workers-shaped plumbing: turning a Web `Request`
// into the `WriteRouteRequest` those modules take, turning their
// `WriteRouteResponse` back into a `Response` with `Set-Cookie` on it, and
// the two `[vars]` gates. No URL grammar, no validation ladder, no response
// shape is invented here.
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
// entries. The Cloudflare nodejs_compat documentation lists
// "Process: supported" and says NOTHING about process.env mirroring [vars] —
// so this host does not assume it. `syncGateToProcessEnv` below ASSIGNS the
// binding's value into process.env, and the one thing this file relies on is
// the proven part: process.env exists and is a mutable object on workerd under
// compatibility_flags = ["nodejs_compat"] (the flag wrangler.toml already
// sets). Measured by tests/deploy/deploy-worker-write-surface.test.ts, which
// runs the real worker.js bundle in workerd and asserts `firstRunEnabled()`
// flipped.
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
// DECKO_WRITE_PATH unset  ->  every non-GET/HEAD verb that is NOT the login
//                            action answers 403, and no card row is written.
//                            GET/HEAD is untouched. The login action is the
//                            ONE exception and it is not a card write:
//                            POST /update/*signin still dispatches and still
//                            INSERTs an auth_sessions row, because sign-in
//                            mints a session, not a card. Pinned while
//                            DISARMED by
//                            tests/deploy/deploy-worker-write-surface.test.ts
//                            ("signs a real account in while DISARMED
//                            (the login-action exemption)", which asserts the
//                            minted auth_sessions row) and on the button's
//                            real deployment by
//                            tests/exercise/deploy-9.test.ts. "Read-only"
//                            means NO CARD WRITES -- it never meant the
//                            engine is not called.
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

import type { DelayedJobsConfig } from "../card/delayed-job/delayed-job.js";
import type { SQLDatabaseDriver } from "./driver.js";
import type { FetchEngine } from "../card/fetch.js";
import { CloudflareD1Adapter, type D1DatabaseLike } from "./drivers/d1.js";
import {
  handleAuthOnlyRequest,
  handleWriteRequest,
  SESSION_COOKIE_NAME,
  type WriteRouteResponse,
  type WriteRouteContext,
} from "./write-routes.js";
// Re-exported so the second host (the Bunny edge surface) imports the
// auth-only dispatch from THIS module, the one it already depends on —
// one import graph edge fewer to drift.
export { handleAuthOnlyRequest };
import { handleFirstRunRequest, SETUP_PATH } from "./first-run-routes.js";
import { originPolicyFromEnv, type OriginPolicy } from "./request-origin.js";
import { configurePasswordHashing, passwordHashPolicyFromEnv } from "../card/auth/password-hash.js";
import { configureSigninSecurity, signinSecurityPolicyFromEnv } from "../card/auth/signin-security.js";
import { configureSetupToken } from "../card/auth/setup-token.js";
import { expireRenderCachesAfterSave } from "./post-save-cache-expiry.js";
import { libsassWasmCompiler } from "./libsass-wasm.js";
import { coffeeNpmCompiler } from "./coffee-npm-compiler.js";
import type { AttachmentStore } from "../card/attachments/attachment-store.js";
import { RenderEngine } from "../card/render.js";
import { SessionStore } from "../card/auth/session-store.js";
import { readSessionCookie } from "./write-routes.js";
import { cardWallClockNow } from "../card/wall-clock.js";

/** The subset of the Workers `env` this surface reads. The D1 binding is the
 *  one the deploy already provisions; the two flags are optional [vars]. */
/** The gate flags alone — the shape a host that owns its own DB binding
 *  passes (the edge-signin-session surface reads only these). */
export interface WriteSurfaceFlags {
  /** "1" opens the /setup window (first-run-routes.ts:97, :145). */
  readonly DECKO_FIRST_RUN?: string;
  /** "1" turns on sign-in and card create/update/delete. Anything else,
   *  including absent, is off. */
  readonly DECKO_WRITE_PATH?: string;
  /** Password storage (auth/password-hash.ts): "pbkdf2" (default) or
   *  "legacy-sha1" for a deck an older engine also serves. */
  readonly DECKO_PASSWORD_HASH?: string;
  /** PBKDF2 iterations for new password hashes (default 600,000, or the
   *  runtime's limit: 100,000 on Cloudflare Workers). */
  readonly DECKO_PASSWORD_PBKDF2_ITERATIONS?: string;
  /** "off" disables the same-origin check on writes and sign-in. */
  readonly DECKO_ORIGIN_CHECK?: string;
  /** Comma-separated extra origins allowed to post to this deck. */
  readonly DECKO_TRUSTED_ORIGINS?: string;
  /** An operator-chosen first-run setup token (auth/setup-token.ts),
   *  accepted beside the deploy-issued one in deck_setup_tokens. Optional:
   *  the deploy chain issues a token of its own, and an edge host generates
   *  none, so with neither /setup refuses and names both. */
  readonly DECKO_SETUP_TOKEN?: string;
  /** Sign-in hardening (auth/signin-security.ts): "on" (default) or "off". */
  readonly DECKO_SIGNIN_THROTTLE?: string;
  readonly DECKO_SIGNIN_MAX_FAILURES?: string;
  readonly DECKO_SIGNIN_MAX_ADDRESS_FAILURES?: string;
  readonly DECKO_SIGNIN_LOCKOUT_SECONDS?: string;
  readonly DECKO_SIGNIN_UNIFORM_FAILURE?: string;
  readonly DECKO_SESSION_REVOCATION?: string;
}

export interface WorkersWriteEnv extends WriteSurfaceFlags {
  readonly DB: D1DatabaseLike;
}

/** The render engine the host already boots (worker.js's `deck.render`). Only
 *  the two members the post-save expiry and the ajax soft redirect need. */
export interface WorkersRenderEngine {
  render(name: string, view: string): Promise<string>;
  expireRenderCard(name: string): void;
  readonly imageCdnHost?: string;
}

export interface WorkersWriteContext {
  /** Host-owned request-local saved-slot renderer. Hosts with remote
   *  drivers batch view reads through their normal serving boot. */
  readonly renderSavedSlot?: (name: string) => Promise<string>;
  /** Explicit production transport + token configuration; absent never
   * claims that a required verification email was sent. */
  readonly accountMail?: WriteRouteContext["accountMail"];
  /** The host's warm FetchEngine — the SAME one the read path uses, so a
   *  post-save expiry reaches the bytes the read path will serve next. */
  readonly fetcher: FetchEngine;
  readonly renderEngine: WorkersRenderEngine;
  /** Overrides the D1 adapter the surface would build from env.DB. Tests
   *  pass the LocalSqliteDriver here; the Worker never does. */
  readonly driver?: SQLDatabaseDriver;
/** The attachment storage seam: the host's bucket (R2 on Cloudflare,
   *  Bunny Storage on Bunny) under BlobAttachmentStore. Absent = uploads and
   *  stored asset outputs fail with the engine's named rejection. */
  readonly attachmentStore?: AttachmentStore;
  /** card-mod-delayed_job: when the deploy sets DECKO_DELAYING, the
   *  integrate_with_delay events of each save are queued (worker.ts). */
  readonly delayedJobs?: DelayedJobsConfig;
}

/** One inbound request, normalized off the Web Request. Same field names and
 *  same lower-cased-header convention write-routes.ts:112-128 documents. */
export interface WorkersWriteRequest {
  readonly method: string;
  /** The URL pathname, percent-ENCODED as received, trailing slashes already
   *  stripped by the caller (write-routes.ts:115). */
  readonly pathname: string;
  /** The URL query string ("?..." or ""), write-routes.ts WriteRouteRequest.search. */
  readonly search?: string;
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
   *  authoritative here. */
  readonly scheme: "http" | "https";
  /** The client ip the host captured, for the card_acts write. */
  readonly ipAddress?: string;
}

export interface WorkersWriteResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  /** Further Set-Cookie values (the visitor-session cookie,
   *  write-routes.ts WriteRouteResponse.visitorCookie), appended after any
   *  Set-Cookie header. */
  readonly extraCookies?: readonly string[];
}

/** The staging-slice sign-in form path, the same `/_*` name
 *  first-run-routes.ts:92-95 uses so it can never collide with a card mark. */
export const WORKERS_SIGNIN_PATH = "/_signin";

/** The action the sign-in form posts to: /update/*signin, with _method=patch
 *  and the subcard grammar write-routes.ts:613-624 consumes.
 *  encodeURIComponent leaves "*" alone, so the literal path matches. */
const SIGNIN_FORM_ACTION = "/update/*signin";

// ---------------------------------------------------------------------------
// the edge compilers
// ---------------------------------------------------------------------------
//
// The write surface's asset compilers (the scssCompiler / coffeeCompiler
// engine options, src/card/assets/scss-compiler.ts). An edge runtime cannot
// run the Node host's LibSass program (libsass-process.ts spawns one), so
// the SCSS compile runs HERE through the vendored WebAssembly build of the
// same LibSass 3.6.4 (libsass-wasm.ts; tools/libsass/build-wasm.mjs). The
// CoffeeScript compiler is the npm package on every host — the same compiler
// bytes the oracle's gem bundles; the bundlers stub its three Node-builtin
// requires (see deploy/shims/coffeescript-node-builtin-stub.mjs). Both are
// lazy: the wasm module compiles on first use, and a host that never saves
// a stylesheet or a script pays only their closures.
const edgeScssCompiler = libsassWasmCompiler();
const edgeCoffeeCompiler = coffeeNpmCompiler();

// ---------------------------------------------------------------------------
// the gates
// ---------------------------------------------------------------------------

/** Is the write path armed? The [vars] value is authoritative; the engine
 *  modules' own process.env read is the fallback for a host that sets it
 *  there instead (the Node staging host). */
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
    search: url.search,
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
  for (const cookie of result.extraCookies ?? []) {
    headers.append("Set-Cookie", hardenSessionCookie(cookie, request.secure));
  }
  if (!headers.has("Content-Type") && result.body !== "") {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  return new Response(result.body, { status: result.status, headers });
}

// ---------------------------------------------------------------------------
// the surfaces
// ---------------------------------------------------------------------------

/** Entity-escape a string landing in an HTML text or attribute slot. The
 *  body is verbatim worker.ts's escapeHtml — the same four entities in the
 *  same order, so every HTML emitter in the repo escapes identically. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The write surface's HTML error-page emitter. Title AND message are
 *  entity-escaped HERE, at the emission point (the root worker's error
 *  pages pin the same contract — worker.ts:365-371): the message slot is
 *  one careless call away from embedding a requested name or an engine
 *  error's raw text, and an unescaped interpolation would reflect
 *  executable markup back onto the requesting browser. Today's call sites
 *  pass fixed literals; the escape keeps that fact irrelevant. */
export function plainText(status: number, title: string, message: string): WorkersWriteResponse {
  return {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body:
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`,
  };
}

/** The default-off answer for any non-GET/HEAD verb. 403 is the right class
 *  here: the actor refusing the write is the deployment's own posture rather
 *  than a person, but "not permitted" is still what happened, and a 500 would
 *  report a deliberate policy as a fault. */
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
 *  This is a stand-in surface, not the *signin card's own view. A full
 *  engine renders the sign-in card's own form at this route; the card views
 *  here are byte-parity surface and the account form views are not part of
 *  that surface, so serving the real view would change rendered bytes for
 *  every page that includes one. The staging host serves the same kind of
 *  stand-in.
 *
 *  What is NOT invented: the form's action, verb, hidden fields and field
 *  names are the grammar write-routes.ts:613-671 already consumes —
 *  `card[subcards][+*email][content]` and
 *  `card[subcards][+*password][content]` posted to /update/*signin with
 *  _method=patch and success[redirect]=true&success[mark]=*previous. The
 *  engine's signin_success aborts the save and the controller redirects to
 *  *previous, so this form changes no engine behavior at all. */
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

/** GET /setup — delegated whole to first-run-routes.ts. The form bytes, the
 *  404-when-closed and the 422 validation ladder are all that module's; this
 *  host only supplies the driver and the fetcher, which are the two seams
 *  its FirstRunRouteContext asks for (first-run-routes.ts:127-134). */
async function mountFirstRun(
  ctx: WorkersWriteContext,
  driver: SQLDatabaseDriver,
  req: WorkersWriteRequest,
  originPolicy: OriginPolicy,
): Promise<WorkersWriteResponse> {
  // The setup token gate (deploy-issued, DECKO_SETUP_TOKEN) is the engine
  // module's, so every host checks the same sources the same way.
  const result = await handleFirstRunRequest(
    { driver, fetcher: ctx.fetcher, originPolicy },
    {
      method: req.method,
      pathname: req.pathname,
      host: req.host,
      scheme: req.scheme,
      headers: req.headers,
      body: req.body,
      ...(req.search === undefined ? {} : { search: req.search }),
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
  originPolicy: OriginPolicy,
): Promise<WorkersWriteResponse> {
  const result: WriteRouteResponse | null = await handleWriteRequest(
    {
      driver,
      fetcher: ctx.fetcher,
      ipAddress: req.ipAddress,
      now: cardWallClockNow,
      originPolicy,
      ...(ctx.accountMail === undefined ? {} : { accountMail: ctx.accountMail, notifyTransport: ctx.accountMail.transport }),
      // The ajax soft redirect re-renders the SAVED card through the host's
      // render engine. Expiry must come first — without it the slot render
      // reads the pre-save warm maps (post-save-cache-expiry.ts).
      renderSlot: async (name) => {
        ctx.fetcher.expireName(name);
        ctx.renderEngine.expireRenderCard(name);
        if (ctx.renderSavedSlot !== undefined) return await ctx.renderSavedSlot(name);
        return ctx.renderEngine.render(name, "titled");
      },
      // carrierwave's real two-step upload answers with its preview_editor,
      // including the draft action's hidden save field. Render under this
      // request's account; never mutate the shared anonymous engine's viewer.
      renderPreviewEditor: async ({ name, opts }) => {
        const token = readSessionCookie(req.headers.cookie);
        const actor = token === null ? null : await new SessionStore({ driver }).lookupSession(token);
        if (actor === null) throw new Error("upload preview requires the authenticated request session");
        ctx.fetcher.expireName(name);
        const render = new RenderEngine(ctx.fetcher);
        render.viewer = { signedIn: true, actorId: actor.id };
        render.pageSession = render.viewer;
        render.imageCdnHost = ctx.renderEngine.imageCdnHost;
        return await render.render(name, "preview_editor", { viewOpts: opts });
      },
      // The edge compilers (the scssCompiler / coffeeCompiler seams): the
      // WebAssembly LibSass and the npm coffeescript package, so stylesheet
      // and script saves compile here instead of being refused.
      scssCompiler: edgeScssCompiler,
      coffeeCompiler: edgeCoffeeCompiler,
      // compressAssets is left off: the Uglifier engine the Node hosts run
      // (assets/script-compressor.ts) builds its keyword predicates with
      // `new Function`, which the Workers runtime refuses, so script asset
      // inputs saved here are stored unminified, as on a deck configured
      // with compress_assets false.
      // The host's bucket (env.FILES on Cloudflare): uploads, image
      // renditions and the stored asset outputs (the site stylesheet the
      // style asset events write on save) land here, keyed exactly as the
      // Node host's files directory keys them (attachment-store.ts). A host
      // that binds no bucket passes nothing, and an upload fails with the
      // engine's named rejection rather than silently writing nothing.
      ...(ctx.attachmentStore === undefined ? {} : { attachmentStore: ctx.attachmentStore }),
      // card-mod-delayed_job: with DECKO_DELAYING set, the integrate_with_delay
      // events of a save are queued for the Queues consumer (worker.ts).
      ...(ctx.delayedJobs === undefined ? {} : { delayedJobs: ctx.delayedJobs }),
    },
    {
      method: req.method,
      pathname: req.pathname,
      search: req.search,
      host: req.host,
      scheme: req.scheme,
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
  return {
    status: result.status,
    headers: result.headers,
    body: result.body,
    ...(result.visitorCookie === undefined ? {} : { extraCookies: [result.visitorCookie] }),
  };
}

/** Expiry rides every committed save. The engine models it on the shared
 *  FetchEngine; the host must also drop the render-side warm maps the fetch
 *  layer cannot reach (post-save-cache-expiry.ts). Keyed on expiryName,
 *  never on the response shape. */
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
    return mountFirstRun(ctx, resolveDriver(ctx, env), req, applySecuritySettings(env));
  }

  // The sign-in form, when the write gate is armed (sign-in mints a session
  // row, so it rides the same gate as the rest of the write surface).
  if (write && req.method === "GET" && req.pathname === WORKERS_SIGNIN_PATH) {
    return signinFormPage();
  }

  if (readMethod) {
    // The account module emits real GET update links for approval and its
    // email tokens. Keep unrelated reads and the disarmed posture untouched.
    const trigger = new URLSearchParams(req.search ?? "").get("card[trigger]");
    if (write && req.method === "GET" && /^\/(?:card\/)?update\/[^/]+$/.test(req.pathname) &&
        ["reset_password", "verify_and_activate", "approve_with_verification", "approve_without_verification"].includes(trigger ?? "")) {
      return mountWrite(ctx, resolveDriver(ctx, env), req, applySecuritySettings(env));
    }
    return null;
  }
  const originPolicy = applySecuritySettings(env);
  if (!write) {
    // AUTH IS NOT A CARD WRITE: with the write path off, the login action
    // still dispatches — /update/*signin mints an auth_sessions row and no
    // card rows. The auth-only dispatch resolves to handleSigninUpdate for
    // POST /update/*signin and null for everything else, so every card
    // create/update/delete keeps the exact off-response it has always
    // answered here.
    const auth = await handleAuthOnlyRequest(
      {
        driver: resolveDriver(ctx, env),
        fetcher: ctx.fetcher,
        ipAddress: req.ipAddress,
        originPolicy,
      },
      {
        method: req.method,
        pathname: req.pathname,
        search: req.search,
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
  return mountWrite(ctx, resolveDriver(ctx, env), req, originPolicy);
}

/** The security settings from this host's settings bag (docs/SECURITY.md):
 *  the password policy is set for the engine modules this request reaches,
 *  and the origin policy is returned for the write and setup dispatch. Read
 *  per state-changing request, never on reads, so a misconfigured value
 *  fails the write loudly and leaves the read surface untouched. */
export function applySecuritySettings(env: WriteSurfaceFlags): OriginPolicy {
  configurePasswordHashing(passwordHashPolicyFromEnv(env));
  configureSigninSecurity(signinSecurityPolicyFromEnv(env));
  configureSetupToken(env.DECKO_SETUP_TOKEN);
  return originPolicyFromEnv(env);
}

/** The D1 adapter for the write path. CloudflareD1Adapter is a stateless
 *  wrapper over the binding (drivers/d1.ts), so building it per request shares
 *  nothing with the host's read adapter and warms nothing. DB is optional in
 *  the env bag this takes: a flags-only host supplies ctx.driver, and
 *  neither being present is the write path's own named error. */
export function resolveDriver(ctx: WorkersWriteContext, env: WriteSurfaceFlags & { readonly DB?: D1DatabaseLike }): SQLDatabaseDriver {
  if (ctx.driver !== undefined) return ctx.driver;
  if (env.DB === undefined) {
    throw new Error(
      "write surface needs a storage binding: pass ctx.driver (host adapter) or env.DB (the D1 binding)",
    );
  }
  return new CloudflareD1Adapter(env.DB);
}

export { SESSION_COOKIE_NAME, SETUP_PATH };
