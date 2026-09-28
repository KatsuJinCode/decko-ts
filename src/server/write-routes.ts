// The HTTP write surface: card CREATE / UPDATE / DELETE over the
// CardActionEngine, with session-token auth and Ruby-equivalent CSRF on
// form posts. Lives as its own module so the staging server imports it
// with a two-line dispatch (and so the sign-in lane's edits to the same
// server file never collide with it).
//
// URL grammar — decko-0.20.0 config/engine_routes.rb:27-48 (the mounted
// Decko::Engine, the only routes a real deck serves):
//   POST   /                      -> create (the name rides params[:card][:name],
//                                    mark.rb:52-54 mark_from_card_hash)
//   POST   /<mark>                -> create
//   POST   /type/<type>           -> create with type = <type> (routes.rb:33)
//   PUT|PATCH /                   -> update (name from params[:card])
//   PUT|PATCH /<mark>             -> update
//   DELETE   /<mark>              -> delete
//   POST|PUT|PATCH (card)/update(/<mark>)   -> update   (routes.rb:46-47)
//   POST|PATCH     (card)/create(/<mark>)   -> create
//   DELETE         (card)/delete(/<mark>)   -> delete
// Mark resolution (card_class.rb:128-133 uri_fetch_opts): the card-hash name
// wins over the URL mark; otherwise name = mark with "_" -> " " (Name#tr).
// A ".json" suffix is the format, not part of the name (routes.rb ":format").
// UPDATE of a missing card routes to CREATE — rest.rb:14-16
// (`card.new_card? ? create : handle { card.update! ... }`: the fetch builds
// a new card from the params when the mark resolves to nothing/trash).
//
// NOT implemented, on purpose (documented remainder): the GET "explicit
// alternatives" (routes.rb:41-43 `get (card)/delete(/:mark)` etc.) — GETs
// that mutate are exactly what CSRF protection exists to prevent; the
// staging surface keeps mutations on state-changing verbs only.
//
// Auth — rest.rb:37-47 authenticate/authenticators: the session token comes
// from the `Authorization` header (`Token token="..."` OR `Bearer ...` —
// actionpack-7.2.3.2 http_authentication.rb:427 TOKEN_REGEX) or the
// `token` param, and resolves through the SessionStore (engine-for-session
// seam). Unknown/expired/revoked tokens degrade to Anonymous
// (auth/current.rb:58-63) — Anonymous writes are denied per the rules
// (PermissionDenied, HTTP 403, exactly like Ruby).
//
// CSRF — decko carries no forgery override anywhere (only the cucumber
// environment disables it), so Rails 7.2's default
// `protect_from_forgery with: :exception` governs real decks. Verified in
// actionpack-7.2.3.2 request_forgery_protection.rb: non-GET/HEAD requests
// need a valid Origin (when the header is present) AND an authenticity
// token that compares against the session's token
// (`session[:_csrf_token]`, SessionStore :319-325); tokens arrive via the
// `authenticity_token` param or the `X-CSRF-Token` header (:461-470); a
// failure raises InvalidAuthenticityToken -> HTTP 422
// (exception_wrapper.rb:21). The port: a form post
// (application/x-www-form-urlencoded) must present a token that equals
// csrfTokenFor(secret, sessionToken) — an HMAC-SHA256 under a server-side
// secret, keyed to the session, unguessable without the secret, rotated
// with the session. Documented divergences from Rails: (1) the token is
// stable per session rather than re-masked per request (BREACH masking —
// irrelevant for a surface that does not compress responses); (2) JSON
// bodies are the API carve-out — they authenticate with the Authorization
// token itself, which a cross-origin browser cannot attach or read (the
// exact threat CSRF exists for), so the token check is scoped to FORM
// posts; (3) a form post with no session behind it has no session token to
// derive a CSRF secret from -> 422 (Rails would bind the token to its
// cookie session; this surface's anonymous-session machinery is a later
// stream).
//
// Error shapes — card-1.110.0 lib/card/error.rb status codes:
//   Card::Error::PermissionDenied -> 403 (view :denial); NotFound -> 404;
//   UserError (validation: name conflicts, type errors, delete guards) -> 422.
// The engine's anonymous-actor rejection maps to 403 as well: Ruby denies
// anonymous writes through the SAME ok? machinery (403 PermissionDenied),
// the port's hard anonymous gate produces the identical HTTP shape.
// CSRF failures -> 422 per Rails. HTML bodies here are minimal staging
// shapes (the full-chrome error pages stay the server file's business).

import { createHmac, createHash } from "node:crypto";
import type { SQLDatabaseDriver } from "./driver.js";
import type { FetchEngine } from "../card/fetch.js";
import type { CardRecord } from "../card/fetch/card-record.js";
import { SessionStore } from "../card/auth/index.js";
import { createCardActionEngineForSession } from "../card/actions/engine-for-session.js";
import { CardActionError, type ActionResult } from "../card/actions/types.js";
import { DeckoName } from "../card/name.js";

/** One inbound write request, normalized off the node request. Header keys
 *  are lower-cased (node's convention). The body is the RAW bytes read by
 *  the caller (this module parses it per content type). */
export interface WriteRouteRequest {
  method: string;
  /** The URL pathname, percent-ENcoded as received (normalized: no
   *  trailing slashes). */
  pathname: string;
  /** The Host header (origin checks). */
  host: string | undefined;
  headers: Record<string, string | undefined>;
  body: string;
}

/** Host-provided state: the storage seam, the fetch engine the write
 *  engines run through, and the CSRF HMAC secret. */
export interface WriteRouteContext {
  driver: SQLDatabaseDriver;
  fetcher: FetchEngine;
  /** HMAC key for per-session CSRF tokens (Rails session[:_csrf_token]
   *  analog). Rotate on compromise; per-boot random is fine for staging. */
  csrfSecret: string;
  now?: () => Date;
  /** client ip captured on card_acts (director/class_methods.rb:27-29);
   *  defaults to the X-Forwarded-For header, then "127.0.0.1". */
  ipAddress?: string;
}

export interface WriteRouteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Whether the host exposes the write path at all. The staging server
 *  boots its driver READONLY (pure browse) — writes stay off until ops
 *  boots writable with this flag set; unset keeps the historical 405s. */
export function writePathEnabled(): boolean {
  return process.env.DECKO_WRITE_PATH === "1";
}

/** The session's CSRF token — Rails' session[:_csrf_token] analog. HMAC
 *  under the server secret over the session token's DIGEST (the raw token
 *  never feeds a second use). Deterministic per session: forms can embed
 *  it; without the secret it is unguessable; revoking the session rotates
 *  it. Exported for the form-rendering surface (edit forms, sign-in forms)
 *  to embed — the Ruby shape is the hidden authenticity_token input. */
export function csrfTokenFor(ctx: WriteRouteContext, sessionToken: string): string {
  const digest = createHash("sha256").update(sessionToken).digest("hex");
  return createHmac("sha256", ctx.csrfSecret).update(`decko-ts csrf:${digest}`).digest("hex");
}

// -----------------------------------------------------------------------
// params — the card hash (rest.rb:15 card.update! params[:card]) and the
// top-level shortcuts (card_class.rb:128-133 uri_fetch_opts)
// -----------------------------------------------------------------------

interface ParsedBody {
  /** params[:card] — the Card.new/update! args. */
  card: Record<string, string>;
  /** params[:token] (rest.rb:42 authenticators). */
  token?: string;
  /** params[:authenticity_token] (request_forgery_protection.rb:470). */
  authenticityToken?: string;
  /** params[:_method] — the Rails form verb override. */
  methodOverride?: string;
}

function parseBody(req: WriteRouteRequest): ParsedBody {
  const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(req.body);
    const card: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      const match = /^card\[(.+)\]$/.exec(key);
      if (match !== null) card[match[1]] = value;
    }
    return {
      card,
      token: params.get("token") ?? undefined,
      authenticityToken: params.get("authenticity_token") ?? undefined,
      methodOverride: params.get("_method") ?? undefined,
    };
  }
  if (contentType === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body) as unknown;
    } catch {
      throw new CardActionError("name-illegal", "request body is not valid JSON");
    }
    if (typeof parsed !== "object" || parsed === null) return { card: {} };
    const obj = parsed as Record<string, unknown>;
    const rawCard = typeof obj["card"] === "object" && obj["card"] !== null
      ? (obj["card"] as Record<string, unknown>)
      : {};
    const card: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawCard)) {
      if (typeof value === "string") card[key] = value;
      else if (typeof value === "number") card[key] = String(value);
    }
    return {
      card,
      token: typeof obj["token"] === "string" ? obj["token"] : undefined,
      authenticityToken:
        typeof obj["authenticity_token"] === "string" ? obj["authenticity_token"] : undefined,
      methodOverride: typeof obj["_method"] === "string" ? obj["_method"] : undefined,
    };
  }
  return { card: {} };
}

/** Ruby's authenticators (rest.rb:41-47): `token_from_header || params[:token]`
 *  — the header grammar is actionpack's Token module
 *  (http_authentication.rb:427 `TOKEN_REGEX = /^(Token|Bearer)\s+/`). */
function tokenFromRequest(req: WriteRouteRequest, parsed: ParsedBody): string | null {
  const authorization = req.headers["authorization"];
  if (authorization !== undefined) {
    const match = /^(?:Token|Bearer)\s+(.*)$/i.exec(authorization.trim());
    if (match !== null) {
      const value = match[1].trim();
      // `Token token="abc", opt=...` pair grammar (http_authentication.rb
      // :520 splits pair delimiters) — take the token= pair when present.
      const pairMatch = /token\s*=\s*"([^"]*)"/i.exec(value);
      const token = pairMatch !== null ? pairMatch[1] : value;
      if (token !== "") return token;
    }
  }
  return parsed.token ?? null;
}

// -----------------------------------------------------------------------
// the route table
// -----------------------------------------------------------------------

type WriteVerb = "create" | "update" | "delete";

interface RouteMatch {
  verb: WriteVerb;
  /** The URL mark (percent-encoded, format suffix NOT stripped — the JSON
   *  format rides the mark until markToName). Undefined for the markless
   *  routes (POST / — the name rides the card hash). */
  mark?: string;
  /** POST /type/<type> — the type shortcut (routes.rb:33). */
  typeShortcut?: string;
  /** The route's own JSON mode (the .json suffix). */
  json: boolean;
}

/** engine_routes.rb:27-48, longest-prefix first. `card/read` and the GET
 *  transaction alternatives deliberately fall through (module header). */
function matchRoute(method: string, pathname: string): RouteMatch | null {
  const post = method === "POST";
  const put = method === "PUT" || method === "PATCH";
  const del = method === "DELETE";
  if (!post && !put && !del) return null;
  if (pathname === "/" || pathname === "") {
    if (post) return { verb: "create", json: false };
    if (put) return { verb: "update", json: false };
    return null;
  }
  // super-explicit (card)/<verb>(/<mark>) — routes.rb:45-48
  const explicit = /^\/card\/(create|update|delete)(?:\/(.*))?$/.exec(pathname);
  if (explicit !== null) {
    const verb = explicit[1] as WriteVerb;
    if (verb === "create" && !(post || put)) return null; // via: %i[post patch]
    if (verb === "update" && !(post || put)) return null; // via: %i[post put patch]
    if (verb === "delete" && !del) return null; // via: :delete
    return { verb, mark: explicit[2], json: false };
  }
  if (post) {
    // ":mark" is ONE path segment (Rails route segments never span "/") —
    // multi-segment marks are not routes (Rails: no match -> 404).
    const typed = /^\/type\/(.+)$/.exec(pathname);
    if (typed !== null) return { verb: "create", typeShortcut: markToName(typed[1]), json: false };
    if (!pathname.slice(1).includes("/")) {
      return { verb: "create", mark: pathname.slice(1), json: false };
    }
    return null;
  }
  if (put) {
    return pathname.slice(1).includes("/") ? null : { verb: "update", mark: pathname.slice(1), json: false };
  }
  return pathname.slice(1).includes("/") ? null : { verb: "delete", mark: pathname.slice(1), json: false };
}

/** card_class.rb:131 — `Name[params[:mark]]&.tr "_", " "`: underscores are
 *  spaces; the .json format suffix is not part of the name. */
function markToName(mark: string): string {
  const withoutFormat = mark.replace(/\.json$/i, "");
  return decodeURIComponentSafe(withoutFormat).replace(/_/g, " ");
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Rack::MethodOverride semantics: only a POST is overridable, and only to
 *  PATCH / PUT / DELETE (the verbs browser forms cannot send natively). */
function effectiveMethod(method: string, parsed: ParsedBody): string {
  if (method !== "POST") return method;
  const override = parsed.methodOverride?.trim().toUpperCase();
  if (override === "PATCH" || override === "PUT" || override === "DELETE") return override;
  return method;
}

// -----------------------------------------------------------------------
// CSRF (module header cites the Rails sources)
// -----------------------------------------------------------------------

/** Rails valid_request_origin? — an Origin header, when present, must be
 *  same-origin with the request's own base URL. No Origin header (curl,
 *  server-to-server) passes. */
function validRequestOrigin(req: WriteRouteRequest): boolean {
  const origin = req.headers["origin"];
  if (origin === undefined || origin === "") return true;
  const host = req.host;
  if (host === undefined) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return parsed.host === host;
}

function isFormPost(req: WriteRouteRequest): boolean {
  const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  return contentType === "application/x-www-form-urlencoded";
}

// -----------------------------------------------------------------------
// responses
// -----------------------------------------------------------------------

function htmlResponse(status: number, title: string, bodyHtml: string): WriteRouteResponse {
  return {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title></head><body>${bodyHtml}</body></html>`,
  };
}

function jsonResponse(status: number, payload: unknown): WriteRouteResponse {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(payload),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** card-1.110.0 lib/card/error.rb status codes: PermissionDenied 403,
 *  NotFound 404, UserError (validation) 422. anonymous-actor is Ruby's
 *  permission denial in engine terms (module header). */
function errorStatus(code: CardActionError["code"]): number {
  if (code === "not-found") return 404;
  if (code === "anonymous-actor" || code === "permission-denied") return 403;
  return 422;
}

function errorResponse(json: boolean, error: CardActionError): WriteRouteResponse {
  const status = errorStatus(error.code);
  return json
    ? jsonResponse(status, { error: { code: error.code, message: error.message } })
    : htmlResponse(status, `Error (${error.code})`, `<pre>${escapeHtml(error.message)}</pre>`);
}

/** Ruby's cud_success (rest.rb:80-89): HTML redirects to the card's
 *  location; JSON reloads (the caller re-fetches — the response carries
 *  the ids to reconcile). */
function successResponse(
  json: boolean,
  name: string,
  saved: { cardId: number; actId: number; actionId: number; verb: WriteVerb },
): WriteRouteResponse {
  if (json) {
    return jsonResponse(200, {
      card: { name, url: `/${locationName(name)}` },
      verb: saved.verb,
      card_id: saved.cardId,
      act_id: saved.actId,
      action_id: saved.actionId,
    });
  }
  return {
    status: 302,
    headers: { Location: `/${locationName(name)}`, "Cache-Control": "no-store" },
    body: "",
  };
}

/** The URL form of a card name (decko location grammar: spaces -> "_"). */
function locationName(name: string): string {
  return encodeURIComponent(name.replace(/ /g, "_"));
}

// -----------------------------------------------------------------------
// the handler
// -----------------------------------------------------------------------

/**
 * Dispatch one non-GET request against the write grammar. Returns the
 * response, or NULL when the request is not a write route at all (the
 * host falls through to its own 404/405 surface — the historical 405s
 * stay for every non-write method/path pair).
 *
 * Per request: token -> actor (SessionStore; unresolvable = Anonymous),
 * form-post CSRF check (422 on failure), engine gate (the ok_to_* rule
 * walk inside the CardActionEngine), save, act rows, response.
 */
export async function handleWriteRequest(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
): Promise<WriteRouteResponse | null> {
  // Response format: the .json suffix on the mark, or the Accept header
  // (routes.rb ":(.:format)" grammar; rest.rb responds per format).
  const json =
    (req.pathname !== "/" && /\.json$/i.test(req.pathname)) ||
    (req.headers["accept"] ?? "").includes("application/json");
  let parsed: ParsedBody;
  try {
    parsed = parseBody(req);
  } catch (error) {
    if (error instanceof CardActionError) return errorResponse(json, error);
    throw error;
  }
  // Rails MethodOverride (rack-method_override: POST + `_method` param
  // rewrites the verb) — how real decko FORMS reach the RESTful routes:
  // an edit form POSTs `card/...` with a hidden `_method=patch`.
  const method = effectiveMethod(req.method, parsed);

  const route = matchRoute(method, req.pathname);
  if (route === null) return null;

  // authenticate (rest.rb:37-47): token -> actor; unresolvable = Anonymous.
  const token = tokenFromRequest(req, parsed);
  const sessions = new SessionStore({ driver: ctx.driver });
  const actor = token !== null ? await sessions.resolveActorFromToken(token) : null;

  // CSRF for form posts (module header): origin check + authenticity token.
  // The token compares against the SESSION's CSRF token — a form post with
  // no resolvable session behind it has nothing to compare (no anonymous
  // session machinery yet) -> 422, the Rails no-session posture.
  if (isFormPost(req)) {
    if (!validRequestOrigin(req)) {
      return csrfFailure(json, "HTTP Origin header didn't match request base URL");
    }
    const presented = parsed.authenticityToken ?? req.headers["x-csrf-token"];
    const expected = actor !== null && token !== null ? csrfTokenFor(ctx, token) : null;
    if (presented === undefined || expected === null || presented !== expected) {
      return csrfFailure(json, "Can't verify CSRF token authenticity.");
    }
  }

  const engine = await createCardActionEngineForSession(ctx.fetcher, ctx.driver, token, {
    ipAddress: ctx.ipAddress ?? req.headers["x-forwarded-for"] ?? "127.0.0.1",
    now: ctx.now,
  });

  try {
    let result: ActionResult | null;
    let name: string;
    if (route.verb === "create") {
      const input = createInputFromParams(route, parsed);
      result = await engine.createCard(input);
      name = result.name?.s ?? input.name;
    } else if (route.verb === "update") {
      const card = parsed.card;
      if (route.mark === undefined && card["name"] === undefined) {
        throw new CardActionError(
          "not-found",
          "no card name in request (no mark, no card[name])",
        );
      }
      const markName = route.mark !== undefined ? markToName(route.mark) : undefined;
      const hashName = card["name"];
      const updateName = hashName ?? markName;
      const existing = await lookupLiveCard(ctx.fetcher, updateName);
      if (existing === undefined) {
        // rest.rb:14-16 — update of a NEW card routes to CREATE (the fetch
        // builds the card from the params; trashed marks fetch as new and
        // the create path revives). The name rides the request's own
        // resolution: card-hash name when present, else the URL mark.
        const created = await engine.createCard({
          ...createInputFromParams(route, parsed),
          name: updateName,
        });
        name = created.name?.s ?? updateName;
        result = created;
      } else {
        const typeIdRaw = card["type_id"];
        result = await engine.updateCard({
          cardId: existing.id,
          // card-hash name WINS over the URL mark (uri_fetch_opts) — a
          // card[name] on an update is the RENAME arg (name_events.rb).
          name: hashName !== undefined && hashName !== markName ? hashName : undefined,
          content: card["content"],
          typeName: card["type"],
          typeId:
            typeIdRaw !== undefined && /^\d+$/.test(typeIdRaw) ? Number(typeIdRaw) : undefined,
        });
        name = result?.name?.s ?? updateName;
      }
    } else {
      if (route.mark === undefined) {
        throw new CardActionError("not-found", "no card name in request (no mark)");
      }
      const markName = markToName(route.mark);
      const existing = await lookupLiveCard(ctx.fetcher, markName);
      if (existing === undefined) {
        throw new CardActionError("not-found", `no such card: ${markName}`);
      }
      result = await engine.deleteCard({ cardId: existing.id });
      name = markName;
    }
    return successResponse(json, name, {
      cardId: result?.cardId ?? 0,
      actId: result?.actId ?? 0,
      actionId: result?.actionId ?? 0,
      verb: result?.verb ?? route.verb,
    });
  } catch (error) {
    if (error instanceof CardActionError) return errorResponse(json, error);
    throw error;
  }
}

function csrfFailure(json: boolean, message: string): WriteRouteResponse {
  return json
    ? jsonResponse(422, { error: { code: "csrf-failure", message } })
    : htmlResponse(422, "Forbidden", `<pre>${escapeHtml(message)}</pre>`);
}

/** Card params for CREATE — uri_fetch_opts (card_class.rb:128-133): the
 *  card hash wins; the mark fills the name; the /type/<type> shortcut
 *  fills the type unless the hash set one. */
function createInputFromParams(
  route: RouteMatch,
  parsed: ParsedBody,
): { name: string; content?: string; typeName?: string; typeId?: number } {
  const card = parsed.card;
  const name = card["name"] ?? (route.mark !== undefined ? markToName(route.mark) : "");
  if (name === "") {
    // Ruby: Card.new(name: nil).save! -> validation error -> 422.
    throw new CardActionError("name-illegal", "param is missing or the value is empty: name");
  }
  const typeName = card["type"] ?? route.typeShortcut;
  const typeIdRaw = card["type_id"];
  return {
    name,
    content: card["content"],
    typeName,
    typeId: typeIdRaw !== undefined && /^\d+$/.test(typeIdRaw) ? Number(typeIdRaw) : undefined,
  };
}

async function lookupLiveCard(
  fetcher: FetchEngine,
  name: string,
): Promise<(CardRecord & { id: number }) | undefined> {
  const key = DeckoName.parse(name).key;
  const record = await fetcher.fetchByKey(key);
  if (record === undefined || record.trash || record.id === undefined) return undefined;
  return record as CardRecord & { id: number };
}
