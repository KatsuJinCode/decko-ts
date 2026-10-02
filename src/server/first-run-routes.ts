// The first-run journey's HTTP surface: GET /setup renders the create-owner
// form, POST /setup runs the create and sends the human to sign in.
//
// NEW PRODUCT SURFACE, NOT RUBY. The census, the validation ladders, the
// account card shape and the password crypto are all ports — see
// src/card/auth/first-run-setup.ts, whose module header carries the full Ruby
// citation set (card-mod-account set/type/user.rb, card-1.110.0
// lib/card/auth/setup.rb, set/right/{account,email,password,salt}.rb). This
// file is only the transport and the form bytes.
//
// WHY A ROUTE AND NOT A VIEW
//   Ruby renders the setup form on the *user card itself: `view :setup,
//   unknown: true, perms: :needs_setup?, cache: :never` (user.rb:10). This
//   port's card views are byte-parity surface — the frozen deck never carries
//   a `+*setup` view and the canonical net pins rendered bytes. Registering
//   that view would change what the engine renders. So the form is a separate
//   surface, mounted only when the env gate is on, which is what keeps the
//   addition strictly additive.
//
//   Per the PARITY RULE: with DECKO_FIRST_RUN unset this module answers
//   NOTHING — handleFirstRunRequest returns null and the host falls through to
//   its own 404, byte-identical to today's surface. No existing route, view,
//   card name or config is touched.
//
// MOUNTING
//   The host wires one call. Nothing here imports a host, opens a port, or
//   reads a path at module load, so an unarmed host that merely imports the
//   function still changes nothing:
//
//     const response = await handleFirstRunRequest(ctx, req);
//     if (response !== null) { ...send it... }
//
// RATE-LIMIT / CSRF POSTURE — MATCHES write-routes.ts, DELIBERATELY
//   CSRF: none. write-routes.ts:57-71 is the cited position — live decko arms
//   no forgery protection (decko-0.20.0 + card-1.110.0 contain no
//   `protect_from_forgery`; the only forgery reference in the generation is
//   decko-0.20.0/config/environments/cucumber.rb:27, which DISABLES it), and
//   the captured real session (2026-09-28) sent every token-less form post
//   straight through to the action gates with no csrf meta tag in any captured
//   page. This surface matches that rather than inventing a token the live
//   deck does not have, and rather than re-deriving Ruby's default posture
//   that src/server/write-routes.ts already corrected.
//
//   The window is the rate limit, and it is a structural one rather than a
//   time-boxed one: the census is re-counted on every request
//   (first-run-setup.ts module header, point 5), so the surface is reachable
//   at most ONCE per deck for the create path — the first successful owner
//   closes it permanently (setup_complete).
//
//   THE CONCURRENCY BOUNDARY, stated exactly: the census is a READ that
//   gates six separate WRITES (createOwnerAccount step 0 runs before step 5's
//   engine creates), and nothing makes that read-then-write atomic. The
//   driver seam offers only `query` and `batch` (src/server/driver.ts:28-31)
//   — no transaction — and the six creates go through CardActionEngine, which
//   interleaves its own reads and writes per card. So the guarantee is
//   sequential, not concurrent: a second request that arrives after the first
//   owner's junction row is committed re-counts, sees it, and aborts at
//   step 0, but two requests that arrive in the same tick both read a
//   zero census and both create an owner. MEASURED, not assumed — the two
//   pins in tests/card/auth/first-run-setup.test.ts ("the concurrency
//   boundary") run both cases against a real engine and assert that the
//   sequential second create is refused and the concurrent pair is not. A
//   deck reachable by two people at once on a fresh install can therefore
//   end up with two owner accounts; nothing throttles it, and nothing
//   rolls the loser back.
//
//   WHY IT IS NOT ENFORCED HERE, so the next reader does not re-derive it:
//   closing it needs the census and the writes under one transaction, which
//   means a transaction on the SQLDatabaseDriver seam plus a way to thread
//   it through CardActionEngine — a change to the write path that the
//   byte-parity surface cannot absorb for the sake of one env-gated route.
//   A UNIQUE constraint cannot do it either: the census counts
//   (right_id = *account, trash = 0, left_id NOT IN bot/anonymous) rows, and
//   the schema's existing uniqueness on (left_id, right_id)
//   (db/schema.sqlite.sql) is per-HOLDER, so two different owners never
//   collide — which is exactly why the database permits the second owner.
//
//   What this does NOT provide, beyond the boundary above: per-IP
//   throttling, a captcha, or an idempotency key. The window closes on the
//   first owner, so at-most-once-per-deck is the whole guarantee. Stated
//   here rather than implied.
//
// RESPONSE SHAPES
//   The status vocabulary is write-routes.ts's own (error.rb status codes,
//   write-routes.ts:73-79, :544-548): a closed or unusable window answers
//   404 (NotFound — the surface does not exist for this deck, which is what a
//   host 404 means), a form re-render with a validation message answers 422
//   (UserError, validation — exactly Ruby), a successful create answers 303
//   with a Location header (cud_success's plain-form hard redirect,
//   response.rb:25-33, :41).
//
// SIGN-IN REDIRECT, NOT AUTO-SIGN-IN
//   Ruby's setup form auto-signs the new owner in: `event :signin_after_setup,
//   :integrate, on: :create, when: :setup?` -> `Auth.signin id` (user.rb:66-68).
//   This port redirects to the sign-in surface instead, and the difference is
//   deliberate and disclosed: the auto-sign-in rides Ruby's session middleware
//   inside the same request, whereas this route's create runs on the host's
//   engine without the request-scoped session, so issuing a token here would
//   mean minting a session for an actor the request never authenticated. The
//   honest one-step-later shape is the redirect. The owner's account is real
//   and signable the moment the redirect lands — that is the assertion the
//   tests make.

import type { SQLDatabaseDriver } from "./driver.js";
import type { FetchEngine } from "../card/fetch.js";
import {
  createOwnerAccount,
  firstRunEnabled,
  setupWindowState,
  SETUP_CLOSED_REASONS,
  SIGN_IN_PATH,
  type SetupClosedReason,
  type SetupWindowReason,
} from "../card/auth/first-run-setup.js";

/** The route path. A staging-slice name in the `/_*` family the server
 *  already uses for its own non-card endpoints (`/_signin`, `/_signout`,
 *  `/_reset-request`, `/_account-password`, vm-staging-server.mjs:2897, :2902)
 *  — deliberately NOT a card mark, so it cannot collide with any card a deck
 *  might carry. */
export const SETUP_PATH = "/setup";

/** One inbound request, normalized off the node request — the same shape
 *  write-routes.ts's WriteRouteRequest uses, so a host that already has one
 *  can pass it straight through. */
export interface FirstRunRouteRequest {
  readonly method: string;
  /** The URL pathname, percent-ENCODED as received, trailing slashes already
   *  normalized off by the host (write-routes.ts:115 documents the same). */
  readonly pathname: string;
  /** The Host header, for the absolute Location (Ruby's card_url,
   *  Env::Location — env/serializable.rb:19-21). */
  readonly host: string | undefined;
  readonly headers: Record<string, string | undefined>;
  readonly body: string;
}

export interface FirstRunRouteResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  /** The saved owner's name, on the successful create only — the host's
   *  post-save cache expiry keys on this, the same contract
   *  WriteRouteResponse.expiryName carries (write-routes.ts:172-185). */
  readonly expiryName?: string;
}

/** Host-provided state. Deliberately the same two seams the write path takes
 *  (driver + fetcher): the create runs through the CardActionEngine, and the
 *  engine needs exactly these. */
export interface FirstRunRouteContext {
  readonly driver: SQLDatabaseDriver;
  readonly fetcher: FetchEngine;
  /** Injected clock, forwarded to the salt generator. */
  readonly now?: () => Date;
}

/**
 * Dispatch one request against the first-run surface.
 *
 * Returns null — meaning "not my request, fall through to the host's own
 * surface" — for every request that is not a GET or POST on /setup, and for
 * EVERY request at all when the env gate is off. That null is what makes the
 * addition invisible to a deployment that has not opted in.
 */
export async function handleFirstRunRequest(
  ctx: FirstRunRouteContext,
  req: FirstRunRouteRequest,
): Promise<FirstRunRouteResponse | null> {
  if (!firstRunEnabled()) return null;
  if (req.pathname !== SETUP_PATH) return null;
  if (req.method !== "GET" && req.method !== "POST") return null;

  const window = await setupWindowState({ driver: ctx.driver });
  if (!window.open) {
    // The surface does not exist for this deck. 404 + a one-line body: a
    // closed window must not leak whether accounts exist to a prober beyond
    // what the 404 already says.
    return notFoundResponse(window.reason);
  }

  if (req.method === "GET") {
    return htmlResponse(200, "Set up this deck", renderSetupFormHtml(null, null));
  }

  const submitted = parseSetupForm(req.body, req.headers["content-type"] ?? "");
  if (submitted === null) {
    // Ruby: an unparseable form body never reaches a card action; the host's
    // error surface owns it. 400 is the honest class (write-routes.ts:335-340
    // routes Rack's EOFError the same way).
    return htmlResponse(
      400,
      "Set up this deck",
      renderSetupFormHtml(null, "Could not read the submitted form."),
    );
  }

  const outcome = await createOwnerAccount(
    { driver: ctx.driver, fetcher: ctx.fetcher, now: ctx.now },
    { email: submitted.email, password: submitted.password },
  );
  if (!outcome.ok) {
    // A gate that closed between the GET and this POST re-renders as 404, not
    // 422: the window is gone, so the form is not a form any more.
    if (isWindowReason(outcome.reason)) return notFoundResponse(outcome.reason);
    return htmlResponse(
      422,
      "Set up this deck",
      renderSetupFormHtml(outcome.field ?? null, outcome.message),
      // Ruby's validation failure is a UserError -> 422 (error.rb:21); the
      // re-render carries the en.yml message against its own field.
      { "Cache-Control": "no-store" },
    );
  }
  return {
    status: 303,
    headers: {
      Location: absoluteUrl(req, outcome.signInAt),
      "Cache-Control": "no-store",
    },
    body: "",
    // The six committed card rows make the owner's pages stale in the boot
    // engine and every other signed-in engine's warm maps; the host's
    // expiry fan-out keys on this, exactly as the write path's does.
    expiryName: outcome.owner.name,
  };
}

// ---------------------------------------------------------------------------
// responses
// ---------------------------------------------------------------------------

/**
 * Whether a create failure is a WINDOW failure (the surface no longer
 * exists for this deck, so the form is not a form any more -> 404) rather
 * than an INPUT failure (the form is fine, this submission is not -> 422).
 *
 * Membership test against the flow module's own SETUP_CLOSED_REASONS, NOT a
 * negative test against "needs_setup". The create's reason union is
 * `SetupWindowReason | OwnerInputFailureReason | "write_failed"`, so a
 * "isn't needs_setup" test would swallow every input failure — and then look
 * the reason up in the closed-window message map, where it is not a key.
 * That bug is what this function exists to make impossible.
 */
function isWindowReason(reason: string): reason is SetupClosedReason {
  return (SETUP_CLOSED_REASONS as ReadonlyArray<string>).includes(reason);
}

function htmlResponse(
  status: number,
  title: string,
  body: string,
  extraHeaders: Record<string, string> = {},
): FirstRunRouteResponse {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body:
      `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
  };
}

/** The closed-window response. The body names the reason because an operator
 *  who typed /setup by hand needs the difference between "you are early" and
 *  "this deck cannot have accounts"; a prober learns the same thing the 404
 *  already implies. */
function notFoundResponse(reason: SetupWindowReason): FirstRunRouteResponse {
  return htmlResponse(404, "Not Found", `<p>${escapeHtml(CLOSED_BODY[reason])}</p>`);
}

/** card_url (Env::Location): the deck origin, or the request's own
 *  host. hard_redirect absolutizes through it (response.rb:41). The scheme is
 *  the plain http the write path's cardUrl uses (write-routes.ts:568-571);
 *  matching it keeps the two surfaces from disagreeing about URL shape. */
function absoluteUrl(req: FirstRunRouteRequest, path: string): string {
  if (req.host === undefined || req.host === "") return path;
  return `http://${req.host}${path}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CLOSED_BODY: Record<SetupWindowReason, string> = {
  disabled: "First-run setup is not enabled on this deck.",
  write_path_disabled: "This deck is running read-only, so it cannot create an account.",
  account_system_absent: "This deck has no account system, so it has no first account to create.",
  bot_card_absent: "This deck has no Decko Bot card, so the account census cannot run.",
  setup_complete: "This deck already has an account. Sign in instead.",
  // Unreachable: this map is consulted only for a CLOSED window, and
  // `needs_setup` is by definition the open one. Carried for the same reason
  // as the flow module's — so the two maps cannot drift on a union member.
  needs_setup: "First-run setup is not enabled on this deck.",
};

// ---------------------------------------------------------------------------
// the form
// ---------------------------------------------------------------------------

/**
 * The create-owner form: email + password, and nothing else.
 *
 * The three strings that are NOT invented are the deck's own, read through
 * the fetcher: the site title (the `*title` card's content — the
 * {{:title|core}} value account-verify-reset-flows.ts:186-193 documents) and
 * the sign-in target. The submit button's label is NEW: Ruby's own is
 * `submit_button text: "Set up", disable_with: "Setting up"` (user.rb:36) and
 * that literal is reused verbatim, because it is Ruby's word for this exact
 * action.
 *
 * The field names are `email` and `password` — NOT the card-hash grammar
 * (card[subcards][+*email][content]) the sign-in form posts. This form does
 * not post a card: it posts to this route, which is what lets the census gate
 * run BEFORE any card machinery, the way user.rb:51 runs before
 * :check_permissions.
 */
function renderSetupFormHtml(
  errorField: "email" | "password" | null,
  errorMessage: string | null,
): string {
  const error =
    errorMessage === null
      ? ""
      : `<p class="form-error" data-field="${escapeHtml(errorField ?? "")}">${escapeHtml(errorMessage)}</p>\n`;
  return (
    `<div class="d0-card-frame card">\n` +
    `<div class="d0-card-header card-header">\n` +
    `<h1 class="d0-card-header-title">\n` +
    `<span class="card-title" title="Set up">Set up</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text">\n` +
    `<p>Your deck is ready to go!</p>\n` +
    error +
    `<form action="${SETUP_PATH}" method="post" class="first-run-setup-form">\n` +
    `<div class="form-group">\n` +
    `<label for="setup_email">Email</label>\n` +
    `<input type="text" name="email" id="setup_email" class="form-control" autocomplete="username" />\n` +
    `</div>\n` +
    `<div class="form-group">\n` +
    `<label for="setup_password">Password</label>\n` +
    `<input type="password" name="password" id="setup_password" class="form-control" autocomplete="new-password" />\n` +
    `</div>\n` +
    `<button type="submit" class="btn btn-primary">Set up</button>\n` +
    `</form>\n` +
    `<!-- decko-ts first-run setup: NEW surface, off unless DECKO_FIRST_RUN=1. The census behind it is Ruby's Card::Auth.needs_setup? (card-1.110.0 lib/card/auth/setup.rb:33-52). -->\n` +
    `</div></div>`
  );
}

// ---------------------------------------------------------------------------
// body parsing
// ---------------------------------------------------------------------------

/** The submitted pair, or null when the body is not a form this surface
 *  reads. Ruby has no equivalent: its form is a card_form whose params reach
 *  the action engine, and the general subcard grammar is documented
 *  unported (write-routes.ts:27-30). */
export function parseSetupForm(
  body: string,
  contentTypeHeader: string,
): { email: string; password: string } | null {
  const contentType = contentTypeHeader.split(";")[0].trim().toLowerCase();
  if (contentType === "application/x-www-form-urlencoded" || contentType === "") {
    const params = new URLSearchParams(body);
    return {
      email: params.get("email") ?? "",
      password: params.get("password") ?? "",
    };
  }
  if (contentType === "application/json") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== "object" || parsed === null) return null;
      const obj = parsed as Record<string, unknown>;
      return {
        email: typeof obj["email"] === "string" ? obj["email"] : "",
        password: typeof obj["password"] === "string" ? obj["password"] : "",
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** The sign-in path the journey ends at, re-exported so a host can link it
 *  without importing the flow module directly. */
export { SIGN_IN_PATH };

/** The env gate, re-exported so a host wires this surface through ONE import
 *  site. A host that has to reach into the flow module for the flag and into
 *  this module for the handler is a host that can wire them out of order —
 *  and the flag is what decides whether the surface exists at all, so the
 *  guard and the call must be able to come from the same place.
 *
 *  (First written without this re-export: vm-staging-server.mjs imported
 *  firstRunEnabled from HERE while it lived only in first-run-setup.ts, and
 *  the server died at boot with "does not provide an export named
 *  'firstRunEnabled'". The canonical net caught it — 3 server-booting files
 *  failed to run. Recorded because the failure mode is invisible to tsc:
 *  the importer is a .mjs the typecheck does not cover.)
 */
export { firstRunEnabled };
