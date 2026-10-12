// deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts — the Bunny
// Edge Scripting host adapter for the sign-in + session surface.
//
// WHAT THIS IS, IN ONE LINE
//   It mounts the SAME write surface the Cloudflare Workers host mounts
//   (src/server/cloudflare-write-routes.ts) onto the Bunny edge, with
//   BunnyDbDriver as the storage seam instead of a D1 binding.
//
// WHY A HOST ADAPTER AND NOT NEW AUTH CODE
//   Sign-in on this edge needs no new authentication. Every layer under the
//   host seam already speaks SQLDatabaseDriver, and BunnyDbDriver already IS
//   one (src/card/drivers/bunny-db.ts:180):
//
//     POST /update/*signin
//       -> write-routes.ts:629  handleSigninUpdate
//       -> write-routes.ts:646  signinAccount(driver, sessions, ...)
//       -> signin.ts:362-365    authenticateAccount, then sessions.createSession
//       -> session-store.ts:110 INSERT INTO auth_sessions (...)
//       -> write-routes.ts:666  303 + Set-Cookie: decko_ts_session=<raw token>
//
//   The row lands in the SAME auth_sessions table migration 0005 created for
//   the D1 chain (deploy/migrations/0005-auth-sessions.sql:38-43), over the
//   SAME Hrana v2 wire the read path already uses. So this file adds a MOUNT,
//   not a mechanism — which is the reason the diff is small and the risk is
//   confined to "is the gate armed".
//
// ---------------------------------------------------------------------------
// THE GATES, AND WHY THEY ARE process.env HERE
// ---------------------------------------------------------------------------
// The two [vars] the Cloudflare host reads off its `env` binding
// (cloudflare-write-routes.ts:150-158) are read here off process.env, because
// the Bunny handler receives ONLY a Request — no env argument
// (bunny-edge-engine-entry.ts:52-53 cites the platform contract; secrets
// arrive as environment globals). Same two NAMES, same "1" means armed, same
// absent-means-off, so one operator sentence ("set DECKO_WRITE_PATH=1 on the
// edge script") arms both hosts.
//
// DEFAULT POSTURE, restated because it is the safety property:
//   DECKO_WRITE_PATH unset -> mountBunnyEdgeWriteSurface returns null for
//     every GET/HEAD, and for every non-GET/HEAD the CALLER answers 403. No
//     session is ever issued, nothing is ever written, and the read path is
//     byte-identical to a build without this file. The gate is checked BEFORE
//     any driver query, so an unarmed edge spends nothing to stay unarmed.
//
// ---------------------------------------------------------------------------
// WHY THE COOKIE IS HARDENED HERE AND NOT IN THE SHARED MODULE
// ---------------------------------------------------------------------------
// sessionCookieHeader() (write-routes.ts:223-228) emits HttpOnly, SameSite=Lax
// and Max-Age, but no `Secure`, because the Node staging host also serves
// plain http on localhost. The Cloudflare host appends `Secure` at the edge
// of its own response builder (cloudflare-write-routes.ts:187-191), gated on
// the request having arrived over TLS.
//
//   Bunny Edge Scripting terminates TLS at its own proxy and may hand the
//   script a request whose URL still reads http. If it does, the shared
//   bridge (readWorkersRequest, cloudflare-write-routes.ts:221) computes
//   secure=false and the cookie would ship WITHOUT `Secure` on a deployment
//   that is HTTPS-only — a silent downgrade of the exact protection the
//   Cloudflare host adds. This adapter therefore takes the secure decision
//   from `x-forwarded-proto` as well as the URL scheme. The rule is
//   conservative in the safe direction: any evidence of TLS marks the
//   request secure, and a genuinely plain-http request to a Bunny edge is not
//   a supported deployment anyway.
//
//   The same decision also fixes the redirect scheme: the shared cardUrl
//   (write-routes.ts:568) used to answer a successful sign-in with a literal
//   `http://` Location, a scheme downgrade on this HTTPS-only edge (the
//   cookie on that same 303 was already hardened). readBunnyEdgeRequest
//   below now derives `scheme` from the TLS evidence too.

import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import type { FetchEngine } from "../../src/card/fetch.js";
import type { RenderEngine } from "../../src/card/render.js";
import {
  applySecuritySettings,
  handleWorkersWriteSurface,
  handleAuthOnlyRequest,
  readWorkersRequest,
  toWebResponse,
  WORKERS_SIGNIN_PATH,
  type WorkersWriteRequest,
  type WriteSurfaceFlags,
} from "../../src/server/cloudflare-write-routes.js";

/** Environment bag; on the edge this is process.env, in tests a plain
 *  object. Same convention as the entry's own EdgeEnv. */
export type BunnyEdgeEnv = Record<string, string | undefined>;

/** The two gate names. Identical to the Cloudflare host's [vars] so one
 *  operator instruction arms both deployments. */
export const BUNNY_EDGE_WRITE_GATE = "DECKO_WRITE_PATH";
export const BUNNY_EDGE_FIRST_RUN_GATE = "DECKO_FIRST_RUN";

/** The sign-in form path, re-exported from the Cloudflare adapter so the two
 *  hosts cannot drift on it. It is the `/_*` namespace, deliberately outside
 *  the card-mark grammar so no card can ever be named this. */
export { WORKERS_SIGNIN_PATH as BUNNY_EDGE_SIGNIN_PATH };

/** The deck this surface needs: the warm read engine (shared with the read
 *  path so a post-save expiry reaches the bytes the read path serves next)
 *  and the driver the sessions are written through. */
export interface BunnyEdgeWriteDeck {
  readonly fetcher: FetchEngine;
  readonly render: RenderEngine;
  /** The storage seam. Defaults to fetcher.driver, which on this edge is the
   *  very BunnyDbDriver the read path uses. Named only so a test can inject
   *  a distinct driver. */
  readonly driver?: SQLDatabaseDriver;
}

/**
 * Is the write/sign-in gate armed? Read once per request, before any query.
 * The two hosts share this name and this meaning; that is the whole contract.
 */
export function bunnyEdgeWriteArmed(env: BunnyEdgeEnv): boolean {
  return env[BUNNY_EDGE_WRITE_GATE] === "1";
}

/** Is the /setup first-run gate armed? Separate, as on Cloudflare. */
export function bunnyEdgeFirstRunArmed(env: BunnyEdgeEnv): boolean {
  return env[BUNNY_EDGE_FIRST_RUN_GATE] === "1";
}

/** The two gates and the security settings (docs/SECURITY.md), shaped for
 *  the shared surface's env parameter. No D1 binding: this host supplies its
 *  driver on the context instead. */
export function bunnyEdgeWriteFlags(env: BunnyEdgeEnv): WriteSurfaceFlags {
  return {
    DECKO_WRITE_PATH: env[BUNNY_EDGE_WRITE_GATE],
    DECKO_FIRST_RUN: env[BUNNY_EDGE_FIRST_RUN_GATE],
    DECKO_PASSWORD_HASH: env["DECKO_PASSWORD_HASH"],
    DECKO_PASSWORD_PBKDF2_ITERATIONS: env["DECKO_PASSWORD_PBKDF2_ITERATIONS"],
    DECKO_ORIGIN_CHECK: env["DECKO_ORIGIN_CHECK"],
    DECKO_TRUSTED_ORIGINS: env["DECKO_TRUSTED_ORIGINS"],
  };
}

/** Did this request arrive over TLS? The URL scheme is what the shared
 *  bridge uses; `x-forwarded-proto` is what a TLS-terminating edge proxy
 *  leaves behind when it does not rewrite the URL. Either is sufficient.
 *
 *  EXPORTED, not private: the sign-out surface
 *  (bunny-edge-session-viewer.ts) appends `Secure` to the cleared session
 *  cookie from this SAME decision, so one evidence rule governs both
 *  cookies on this host. Two copies of this predicate would be two
 *  chances to disagree about whether a request was secure. */
export function arrivedOverTls(request: Request, url: URL): boolean {
  if (url.protocol === "https:") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded === null) return false;
  // A proxy may send a comma-separated chain; the FIRST entry is the
  // client-facing hop, which is the one that decides what the browser saw.
  return forwarded.split(",")[0]?.trim().toLowerCase() === "https";
}

/**
 * Dispatch one request against the Bunny edge write surface.
 *
 * Returns `null` — "not mine, fall through to the read path" — for every
 * request the surface does not own. That null is the entire safety
 * property of this file: with the gate unset, a GET/HEAD is returned to the
 * caller untouched, and a non-GET/HEAD is turned back into the caller's own
 * 403. The read path below this call is not imported, not consulted, and
 * not altered.
 *
 * The ONE disarm-time exception: the
 * login action. /update/*signin mints an auth_sessions row and no card rows
 * (the :signin event aborts the save — signin.rb:15-17), and Ruby decko
 * never gates sign-in behind a deploy flag. With DECKO_WRITE_PATH off this
 * mount still dispatches handleAuthOnlyRequest — the login action and
 * NOTHING else; null falls through and the caller's 403 read-only answer
 * for every card create/update/delete is byte-unchanged.
 *
 * Call this ONLY after checking {@link bunnyEdgeWriteArmed}, or accept that
 * an unarmed edge still runs the gate checks (cheap: two env reads) plus the
 * auth-only route test for non-read verbs.
 */
export async function mountBunnyEdgeWriteSurface(
  deck: BunnyEdgeWriteDeck,
  request: Request,
  env: BunnyEdgeEnv,
): Promise<Response | null> {
  const inbound = await readBunnyEdgeRequest(request);
  const flags = bunnyEdgeWriteFlags(env);
  // Short-circuit before any driver work. An unarmed edge must not boot the
  // write path's queries, and must not answer a write verb from here — the
  // login action excepted (the module docstring above); its dispatch needs
  // only the driver, and the caller boots the deck for every non-read verb
  // before this mount runs.
  if (flags.DECKO_WRITE_PATH !== "1" && flags.DECKO_FIRST_RUN !== "1") {
    if (inbound.method === "GET" || inbound.method === "HEAD") return null;
    // The sign-in action reads this host's security settings exactly as the
    // armed surface does (docs/SECURITY.md): the origin check and the
    // password policy for an upgrade at sign-in.
    const originPolicy = applySecuritySettings(flags);
    const auth = await handleAuthOnlyRequest(
      {
        driver: deck.driver ?? deck.fetcher.driver,
        fetcher: deck.fetcher,
        ipAddress: inbound.ipAddress,
        originPolicy,
      },
      {
        method: inbound.method,
        pathname: inbound.pathname,
        host: inbound.host,
        scheme: inbound.scheme,
        headers: inbound.headers,
        body: inbound.body,
        bodyBytes: inbound.bodyBytes,
      },
    );
    if (auth === null) return null;
    return toWebResponse(auth, inbound);
  }

  const result = await handleWorkersWriteSurface(
    {
      fetcher: deck.fetcher,
      renderEngine: deck.render,
      driver: deck.driver ?? deck.fetcher.driver,
    },
    inbound,
    flags,
  );
  if (result === null) return null;
  return toWebResponse(result, inbound);
}

/** Read the Web Request into the shared surface's inbound shape, then apply
 *  the ONE host-specific correction: TLS detection behind a terminating
 *  proxy. The corrected flag gates the `Secure` cookie, and the SAME
 *  decision now also sets the redirect scheme the shared cardUrl
 *  absolutizes Location with (write-routes.ts:568) — an https-only edge
 *  must answer a successful sign-in with `Location: https://...` even when
 *  this proxy handed the script an http URL, exactly as the cookie above
 *  must ship `Secure`. Everything else — body bytes, header lower-casing,
 *  client ip, the trailing-slash strip — is the shared bridge's,
 *  deliberately reused rather than reimplemented, so the two hosts cannot
 *  disagree about a request. */
async function readBunnyEdgeRequest(request: Request): Promise<WorkersWriteRequest> {
  const inbound = await readWorkersRequest(request);
  const secure = arrivedOverTls(request, new URL(request.url));
  const scheme: "http" | "https" = secure ? "https" : "http";
  if (secure === inbound.secure && scheme === inbound.scheme) return inbound;
  return { ...inbound, secure, scheme };
}
