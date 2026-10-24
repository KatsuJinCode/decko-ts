// The first-run journey's HTTP surface: GET /setup renders the create-owner
// form, POST /setup runs the create and sends the human to sign in.
//
// This file is only the transport and the form bytes. The account census,
// the validation ladders, the account card shape and the password crypto all
// live in src/card/auth/first-run-setup.ts, whose module header documents
// them.
//
// WHY A ROUTE AND NOT A VIEW
//   The setup form could render as a view on the *user card itself. The card
//   views here are byte-parity surface — the reference deck never carries a
//   `+*setup` view and the rendered-bytes net pins what comes out. Registering
//   that view would change what the engine renders. So the form is a separate
//   surface, mounted only when the env gate is on, which is what keeps the
//   addition strictly additive.
//
//   With DECKO_FIRST_RUN unset this module answers NOTHING —
//   handleFirstRunRequest returns null and the host falls through to its own
//   404, byte-identical to today's surface. No existing route, view, card
//   name or config is touched.
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
//   CSRF: the same-origin check only (request-origin.ts), no token. A full
//   engine arms no forgery protection, so its form posts carry no token and
//   no page carries a csrf meta tag. Inventing one here would make this
//   surface stricter than the write path it sits beside, which is its own
//   kind of bug: a form that works in one place and not the other is a bug
//   report, not a security win. write-routes.ts:57-71 is the cited position.
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
//   driver seam offers only `query` and `batch` — no transaction — and the
//   six creates go through CardActionEngine, which interleaves its own reads
//   and writes per card. So the guarantee is sequential, not concurrent: a
//   second request that arrives after the first owner's junction row is
//   committed re-counts, sees it, and aborts at step 0, but two requests that
//   arrive in the same tick both read a zero census and both create an owner.
//   MEASURED, not assumed — the two pins in
//   tests/card/auth/first-run-setup.test.ts ("the concurrency boundary") run
//   both cases against a real engine and assert that the sequential second
//   create is refused and the concurrent pair is not. A deck reachable by two
//   people at once on a fresh install can therefore end up with two owner
//   accounts; nothing throttles it, and nothing rolls the loser back.
//
//   WHY IT IS NOT ENFORCED HERE, so the next reader does not re-derive it:
//   closing it needs the census and the writes under one transaction, which
//   means a transaction on the SQLDatabaseDriver seam plus a way to thread it
//   through CardActionEngine — a change to the write path that the
//   byte-parity surface cannot absorb for the sake of one env-gated route.
//   A UNIQUE constraint cannot do it either: the census counts
//   (right_id = *account, trash = 0, left_id NOT IN bot/anonymous) rows, and
//   the schema's existing uniqueness on (left_id, right_id) is per-HOLDER, so
//   two different owners never collide — which is exactly why the database
//   permits the second owner.
//
//   Who may use the window: only a request carrying a valid one-time setup
//   token (src/card/auth/setup-token.ts; docs/SECURITY.md, divergence 5) —
//   deploy-issued, DECKO_SETUP_TOKEN, or generated at Node boot — checked
//   before the create runs, so the concurrency boundary above applies only
//   among holders of the token. The token rides the printed link's query
//   (`/setup?token=...`) or the form's setup_token field.
//
//   What this does NOT provide, beyond the boundary above: per-IP
//   throttling, a captcha, or an idempotency key. The window closes on the
//   first owner, so at-most-once-per-deck is the whole guarantee. Stated
//   here rather than implied.
//
// RESPONSE SHAPES
//   The status vocabulary is write-routes.ts's own (write-routes.ts:73-79,
//   :544-548): a closed or unusable window answers 404 (the surface does not
//   exist for this deck, which is what a host 404 means), a form re-render
//   with a validation message answers 422, and a successful create answers 303
//   with a Location header.
//
// SIGN-IN REDIRECT, NOT AUTO-SIGN-IN
//   A full engine's setup form signs the new owner in during the same
//   request. This surface redirects to the sign-in page instead, and the
//   difference is deliberate: auto-sign-in rides the request-scoped session,
//   whereas this route's create runs on the host's engine without one, so
//   issuing a token here would mean minting a session for an actor the
//   request never authenticated. The honest one-step-later shape is the
//   redirect. The owner's account is real and signable the moment the
//   redirect lands — that is the assertion the tests make.

import { checkRequestOrigin, CROSS_ORIGIN_MESSAGE, defaultOriginPolicy, type OriginPolicy } from "./request-origin.js";
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
import {
  checkSetupToken,
  clearDeckSetupTokens,
  presentedSetupToken,
  SETUP_TOKEN_PARAM,
} from "../card/auth/setup-token.js";
import { setPreparedSetupVerdict } from "../card/auth/first-run-setup-verdict-seam.js";

/** The route path. A staging-slice name in the `/_*` family the server
 *  already uses for its own non-card endpoints (`/_signin`, `/_signout`,
 *  `/_reset-request`, `/_account-password`) — deliberately NOT a card mark,
 *  so it cannot collide with any card a deck might carry. */
export const SETUP_PATH = "/setup";

/** One inbound request, normalized off the node request — the same shape
 *  write-routes.ts's WriteRouteRequest uses, so a host that already has one
 *  can pass it straight through. */
export interface FirstRunRouteRequest {
  readonly method: string;
  /** The URL pathname, percent-ENCODED as received, trailing slashes already
   *  normalized off by the host (write-routes.ts:115 documents the same). */
  readonly pathname: string;
  /** The Host header, for the absolute Location. */
  readonly host: string | undefined;
  /** The scheme the client used (absent: http), so an https deck never
   *  redirects to http. */
  readonly scheme?: "http" | "https";
  readonly headers: Record<string, string | undefined>;
  readonly body: string;
  /** The URL query string ("?token=..." or ""), where the printed setup link
   *  carries its token. Absent: no query. */
  readonly search?: string;
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
  /** Same-origin policy for the setup POST (request-origin.ts). Absent:
   *  from process.env, else enabled. */
  readonly originPolicy?: OriginPolicy;
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
  // Hand the census verdict to the sync view gate (register-routes B10's
  // portable half, the half the verdict seam's own header names this route
  // as the producer of). Ruby's census is re-counted on every needs_setup?
  // call until it closes - auth/setup.rb:9-15 memoizes ONLY the FALSE
  // (setup.rb:36 `Card.cache.write NEEDS_SETUP, false unless need`), never
  // the TRUE - so the hand-off mirrors that: refreshed to open on every
  // request the route serves while the census is zero, and written sticky
  // false once the census answers setup_complete. A closed reason the
  // census could not actually compute (account_system_absent,
  // bot_card_absent) and the port's own gate states (write_path_disabled)
  // hand NOTHING: Ruby's view gate is purely the census, and this route's
  // non-census closed reasons must not close the card-view gate on the
  // route's behalf. The env-gate-off case never reaches this line (the
  // null return above), so the row's pinned assertion - gate off, zero
  // accounts, the port's window closed - stands unchanged.
  if (window.open) {
    setPreparedSetupVerdict({ open: true, accountCount: window.accountCount });
  } else if (window.reason === "setup_complete") {
    setPreparedSetupVerdict({ open: false, accountCount: window.accountCount });
  }
  if (!window.open) {
    // The surface does not exist for this deck. 404 + a one-line body: a
    // closed window must not leak whether accounts exist to a prober beyond
    // what the 404 already says.
    return notFoundResponse(window.reason);
  }

  // A GET that arrives through the printed setup link is checked at once, so
  // a stale link says so before the form is filled in; the form then posts
  // back to the same link and does not ask for the token again. A GET without
  // a token renders the form with its setup token field.
  const linkToken = presentedSetupToken(req.search, undefined);
  let formAction: string | undefined;
  if (linkToken !== undefined) {
    const check = await checkSetupToken(ctx.driver, linkToken);
    if (!check.ok) {
      return htmlResponse(403, "Set up this deck", renderSetupFormHtml("setup_token", check.message));
    }
    formAction = `${SETUP_PATH}?${SETUP_TOKEN_PARAM}=${encodeURIComponent(linkToken)}`;
  }

  if (req.method === "GET") {
    return htmlResponse(200, "Set up this deck", renderSetupFormHtml(null, null, formAction));
  }

  // Same-origin check (docs/SECURITY.md, "Cross-site requests"): the setup
  // POST creates the owner account, so another site must not submit it.
  const origin = checkRequestOrigin({ headers: req.headers, host: req.host }, ctx.originPolicy ?? defaultOriginPolicy());
  if (!origin.ok) {
    return htmlResponse(403, "Set up this deck", renderSetupFormHtml(null, `${CROSS_ORIGIN_MESSAGE} (${origin.reason})`, formAction));
  }

  const submitted = parseSetupForm(req.body, req.headers["content-type"] ?? "");
  if (submitted === null) {
    // An unparseable form body never reaches a card action; the host's
    // error surface owns it. 400 is the honest class (write-routes.ts:335-340
    // routes a malformed body the same way).
    return htmlResponse(
      400,
      "Set up this deck",
      renderSetupFormHtml(null, "Could not read the submitted form.", formAction),
    );
  }

  // The one-time setup token (docs/SECURITY.md, divergence 5): checked
  // before any card machinery runs, so a request without it creates nothing.
  const token = await checkSetupToken(ctx.driver, linkToken ?? presentedSetupToken(undefined, submitted.setupToken));
  if (!token.ok) {
    return htmlResponse(403, "Set up this deck", renderSetupFormHtml("setup_token", token.message, formAction));
  }

  const outcome = await createOwnerAccount(
    { driver: ctx.driver, fetcher: ctx.fetcher, now: ctx.now },
    {
      email: submitted.email,
      password: submitted.password,
      // The name the setup form carries, when it carries one (user.rb:14's
      // _render_name_formgroup; features/setup.feature types it and then
      // asserts the owner card by that name). Absent = the email-derived
      // name createOwnerAccount computes itself.
      ...(submitted.cardName !== undefined && submitted.cardName !== ""
        ? { cardName: submitted.cardName }
        : {}),
    },
  );
  if (!outcome.ok) {
    // A gate that closed between the GET and this POST re-renders as 404, not
    // 422: the window is gone, so the form is not a form any more.
    if (isWindowReason(outcome.reason)) return notFoundResponse(outcome.reason);
    return htmlResponse(
      422,
      "Set up this deck",
      renderSetupFormHtml(outcome.field ?? null, outcome.message, formAction),
      // A validation failure is a user error -> 422; the re-render
      // carries the message against its own field.
      { "Cache-Control": "no-store" },
    );
  }
  // The owner exists: the census closes the window from here on, and a
  // deploy-issued token is spent.
  await clearDeckSetupTokens(ctx.driver);
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

/** The deck origin, or the request's own scheme and host. The 303
 *  Location absolutizes through it, exactly as the write path's cardUrl
 *  does. */
function absoluteUrl(req: FirstRunRouteRequest, path: string): string {
  if (req.host === undefined || req.host === "") return path;
  return `${req.scheme ?? "http"}://${req.host}${path}`;
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
 * The create-owner form: the owner's name, email and password — and the
 * deploy's setup token on the plain route.
 *
 * The NAME is Ruby's, field for field: set/type/user.rb:20-29 renders
 * `frame_and_form :create` with `[setup_hidden_fields, _render_name_formgroup,
 * account_formgroups, setup_form_buttons]`, so the owner names themselves
 * (`features/setup.feature`: `fill_in "card_name", with: "The Newber"`, then
 * `I go to card "The Newber+*roles"` and expects "Administrator"). It arrives
 * as `card[name]` because that form is a card CREATE form; this form posts to
 * /setup instead, which is the one deliberate divergence — it is what lets
 * the census gate run before any card machinery is involved.
 *
 * The strings that are NOT invented are the deck's own: the site title and
 * the sign-in target. The submit button's label is "Set up", which is the
 * established wording for this exact action.
 *
 * The account field names are `email` and `password` — NOT the card-hash
 * grammar (card[subcards][+*email][content]) the sign-in form posts. This form
 * does not post a card: it posts to this route, which is what lets the census
 * gate run BEFORE any card machinery is involved. The ONE card-hash key it
 * reads is `card[name]` (above): the name the setup form has always carried,
 * which createOwnerAccount already accepted.
 */
function renderSetupFormHtml(
  errorField: "email" | "password" | "setup_token" | null,
  errorMessage: string | null,
  formAction: string = SETUP_PATH,
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
    `<form action="${escapeHtml(formAction)}" method="post" class="first-run-setup-form">\n` +
    // Reached through the printed setup link, the action already carries the
    // token; otherwise the operator types it here.
    (formAction === SETUP_PATH
      ? `<div class="form-group">\n` +
        `<label for="setup_token">Setup token</label>\n` +
        `<input type="password" name="setup_token" id="setup_token" class="form-control" autocomplete="off" />\n` +
        `</div>\n`
      : "") +
    // user.rb:20-29 setup_form's order is [hidden fields, _render_name_formgroup,
    // account_formgroups, buttons] — the name comes BEFORE the account pair.
    // The input is a card-create form's name field: `card[name]`, with the id
    // Capybara's `fill_in "card_name"` (features/setup.feature) resolves.
    `<div class="form-group">\n` +
    `<label for="card_name">Name</label>\n` +
    `<input type="text" name="card[name]" id="card_name" class="form-control" autocomplete="off" />\n` +
    `</div>\n` +
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
 *  reads. The general subcard grammar this could have used instead is
 *  documented unported (write-routes.ts:27-30).
 *
 *  `cardName` is the ONE card-hash key this surface reads, and Ruby puts it
 *  on the wire: the setup form is a card CREATE form
 *  (card-mod-account-0.20.0 set/type/user.rb:20-29, `frame_and_form :create`
 *  rendering `_render_name_formgroup` first), so the name arrives as
 *  `card[name]`. features/setup.feature drives exactly that field —
 *  `fill_in "card_name", with: "The Newber"` — and then asserts the owner
 *  card carries that name and that its +*roles page shows "Administrator".
 *  Email and password stay flat: this form posts to /setup and never posts a
 *  card, which is what lets the census gate run before any card machinery
 *  (documented above). */
export function parseSetupForm(
  body: string,
  contentTypeHeader: string,
): { email: string; password: string; setupToken: string; cardName: string } | null {
  const contentType = contentTypeHeader.split(";")[0].trim().toLowerCase();
  if (contentType === "application/x-www-form-urlencoded" || contentType === "") {
    const params = new URLSearchParams(body);
    return {
      email: params.get("email") ?? "",
      password: params.get("password") ?? "",
      setupToken: params.get("setup_token") ?? "",
      cardName: params.get("card[name]") ?? "",
    };
  }
  if (contentType === "application/json") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== "object" || parsed === null) return null;
      const obj = parsed as Record<string, unknown>;
      const card = typeof obj["card"] === "object" && obj["card"] !== null
        ? (obj["card"] as Record<string, unknown>)
        : {};
      return {
        email: typeof obj["email"] === "string" ? obj["email"] : "",
        password: typeof obj["password"] === "string" ? obj["password"] : "",
        setupToken: typeof obj["setup_token"] === "string" ? obj["setup_token"] : "",
        cardName: typeof card["name"] === "string" ? card["name"] : "",
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
 *  (First written without this re-export: the staging host imported
 *  firstRunEnabled from HERE while it lived only in first-run-setup.ts, and
 *  the server died at boot with "does not provide an export named
 *  'firstRunEnabled'". Recorded because the failure mode is invisible to
 *  tsc: the importer is a .mjs the typecheck does not cover.)
 */
export { firstRunEnabled };
