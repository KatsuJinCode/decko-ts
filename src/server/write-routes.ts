// The HTTP write surface: card CREATE / UPDATE / DELETE over the
// CardActionEngine, cookie-or-token session auth, live-decko redirect and
// soft-redirect responses. Lives as its own module so the staging server
// imports it with a two-line dispatch (and so the edits to
// the same server file never collide with it).
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
// that mutate stay off the staging surface; the general subcard update
// grammar (params[:card][:subcards]) is implemented ONLY where the captured
// real session pinned it: the *signin update (the :signin event, below).
//
// Multipart uploads: the edit form's file_chooser
// posts multipart/form-data to Ruby's own grammar — POST (PUT/PATCH)
// /update/<mark> with a card[<mount>] file part. The multipart body is
// parsed with Rack 2.2.24's semantics (src/server/multipart-form.ts, gem
// file:lines cited there); the file part routes into the engine's
// attachment input (CardMount's file=/image= argument, card_mount.rb:41-44);
// validate_file_exist (attachment.rb:26-34) rejects mount-typed creates
// without an upload; the success/error responses stay the shared cud
// shapes documented below. The two-step preliminary upload flow
// (00_upload_cache.rb — the JS editor's attachment_upload param, the
// new_file cache card, the preview_editor round trip) is NOT this
// surface: the direct file-part save is Ruby's own path for existing
// cards and for creates without the cache detour.
//
// Auth — card_controller/rest.rb:37-40 `Card::Auth.signin_with(**authenticators)`
// runs as a before_action on EVERY request: authenticators are
// `token_from_header || params[:token]` (actionpack http_authentication.rb:427
// TOKEN_REGEX), and signin_with falls through to signin_with_session when no
// token was presented (auth/current.rb:50-63) — the cookie session
// (session[session_user_key]). The port: Authorization header / token param
// first, else the staging session cookie (SESSION_COOKIE_NAME — the cookie
// the /_signin surface issues). Unknown/expired/revoked credentials degrade
// to Anonymous (auth/current.rb:58-63); Anonymous writes are denied per the
// rules (PermissionDenied, HTTP 403, exactly like Ruby).
//
// CSRF — none, deliberately: live decko arms no forgery protection.
// decko-0.20.0 / card-1.110.0 contain no `protect_from_forgery` call
// anywhere (the ONLY forgery reference in the whole generation is
// decko-0.20.0/config/environments/cucumber.rb:27, which DISABLES
// allow_forgery_protection), and the decko application sets no
// load_defaults that would arm Rails' default_protect_from_forgery. The
// receipt is the captured real session (2026-09-28): every token-less form
// post — the sign-in POST, both saves, the anonymous denial — went straight
// through to the action gates (303/200/403; no csrf meta tags in any
// captured page). Rails' origin check (valid_request_origin?) lives inside
// verify_authenticity_token (request_forgery_protection.rb), so it is
// equally unarmed: a cross-origin form post is not a live failure either.
// This reverses the earlier TS posture (HMAC csrfTokenFor + 422), which
// modeled "the Rails default" instead of the live app; the save-path pins
// that enforced it were updated to the live shapes.
//
// Error shapes — card-1.110.0 lib/card/error.rb status codes:
//   Card::Error::PermissionDenied -> 403 (view :denial, error.rb:104);
//   NotFound -> 404 (:83,89); UserError (validation) -> 422 (:21).
// The engine's anonymous-actor rejection maps to 403 as well: Ruby denies
// anonymous writes through the SAME ok? machinery (403 PermissionDenied).
// Unsupported views are UserErrors in Ruby (format/render.rb:60-64
// `raise Card::Error::UserError, unsupported_view_error_message`) -> 422.
//
// Responses — card_controller/response.rb: non-JSON CUD success is
// redirect_cud_success (:25-33): hard_redirect(url, 303) for the plain-form
// flavor (:31; :12 treats [302,303] as redirect), where hard_redirect
// absolutizes the URL through card_url (:40-42). The ajax flavor
// (Card::Env.ajax? = request.xhr? — X-Requested-With contains
// XMLHttpRequest, actionpack-7.2.3.2 request.rb:290-294 — or
// params[:simulate_xhr], env/serializable.rb:24) defaults to the SOFT
// redirect (:36) and re-renders the saved card through `show` (:54-62) —
// the captured XHR save came back 200 + the card's titled slot. An ajax
// HARD redirect renders JSON {redirect: url} instead (:42-46); the *signin
// success path reproduces that branch because the signin form pins
// success[redirect]=true (set/self/signin.rb:171). JSON requests keep the
// API shape (200 + ids) — not part of the captured browser session.

import type { SQLDatabaseDriver } from "./driver.js";
import type { NotifyTransport } from "../card/notify/types.js";
import type { FetchEngine } from "../card/fetch.js";
import type { CardRecord } from "../card/fetch/card-record.js";
import { SessionStore } from "../card/auth/index.js";
import { signinAccount } from "../card/auth/signin.js";
import {
  sendAccountVerificationToken,
  sendResetPasswordToken,
  type AccountFlowContext,
} from "../card/auth/account-verify-reset-flows.js";
import { createCardActionEngineForSession } from "../card/actions/engine-for-session.js";
import { CardActionError, type ActionResult, type AttachmentInput, type SubcardInput } from "../card/actions/types.js";
import type { CardActionRecaptchaConfig } from "../card/actions/card-action-engine.js";
import type { ModEventRuntime, ModEventStageReport } from "../card/mod-loader/mod-event-dispatch.js";
import type { ModEngineHost } from "../card/mod-loader/mod-manifest.js";
import type { AttachmentStore } from "../card/attachments/attachment-store.js";
import { DeckoName } from "../card/name.js";
import { parseMultipartForm, type MultipartFilePart } from "./multipart-form.js";
import { decodeUriComponentSafe } from "./decode-uri-component-safe.js";

/** One inbound write request, normalized off the node request. Header keys
 *  are lower-cased (node's convention). The body is the RAW bytes read by
 *  the caller (this module parses it per content type). */
export interface WriteRouteRequest {
  method: string;
  /** The URL pathname, percent-ENcoded as received (normalized: no
   *  trailing slashes). */
  pathname: string;
  /** The Host header (absolute redirect URLs, Ruby's card_url). */
  host: string | undefined;
  /** The scheme the CLIENT used, derived by the host bridge from its own
   *  inbound evidence: the Request URL scheme on workerd (Cloudflare's is
   *  authoritative), URL scheme first then `x-forwarded-proto` on a
   *  TLS-terminating proxy (the Bunny edge — the same evidence that host's
   *  Secure-cookie decision consumes). Absent means http: the pre-scheme
   *  hardcoded behavior, preserved for every caller that does not derive
   *  the field (engine-level tests, scheme-less hosts). This is card_url's
   *  scheme half (env/serializable.rb:19-21: "scheme+host_with_port").
   *  (fold-10 union: the scheme-downgrade lane's field the edge-signin-form-fix
   *  pick consumes — the deploy lineage landed it in b0f8252.) */
  scheme?: "http" | "https";
  headers: Record<string, string | undefined>;
  body: string;
  /** The RAW body bytes — required for multipart/form-data (binary file
   *  payloads a utf8 string corrupts; the utf8 `body` stays the transport
   *  for the urlencoded/JSON content types). Rack parses multipart off
   *  rack.input's raw stream (rack/multipart.rb:42-49); this field is the
   *  port's rack.input. Absent on a multipart request -> empty params
   *  (the caller's degenerate fallback, not a Ruby shape). */
  bodyBytes?: Uint8Array;
}

/** Host-provided state: the storage seam, the fetch engine the write
 *  engines run through, and (optionally) a renderer for the ajax
 *  soft-redirect response. */
export interface WriteRouteContext {
  driver: SQLDatabaseDriver;
  fetcher: FetchEngine;
  now?: () => Date;
  /** client ip captured on card_acts (director/class_methods.rb:27-29);
   *  defaults to the X-Forwarded-For header, then "127.0.0.1". */
  ipAddress?: string;
  /** Renders one card's html view to a slot fragment — the host's render
   *  machinery for the ajax soft redirect (response.rb:54-62 soft_redirect
   *  re-renders through `show`). Absent -> ajax saves fall back to the
   *  hard redirect (documented TS deviation for host surfaces with no
   *  renderer; the staging server always provides it). */
  renderSlot?: (name: string) => Promise<string>;
  /** The attachment storage seam (E4.4.a's LocalAttachmentStore), passed
   *  through to every write engine this module builds — the multipart
   *  upload surface stores bytes through it. Absent = attachment saves
   *  fail with the engine's programming-error rejection. */
  attachmentStore?: AttachmentStore;
  /** The deck's file_storage config (Cardio.config.file_storage port;
   *  undefined = the :local default) — validate_file_exist's web? arm and
   *  the storage-type resolution ride it. */
  fileStorage?: string;
  /** The recaptcha guard config (CardActionRecaptchaConfig — the
   *  Cardio.config.recaptcha_* port, card-mod-recaptcha lib/card/mod/
   *  recaptcha.rb:1-10), passed through UNCHANGED to every write engine
   *  this module builds. ABSENT = the guard off (recaptcha.rb:46-48
   *  recaptcha_keys? false) — the pre-seat behavior, byte-identical.
   *  The deck's event runtime itself rides EVERY save through the deck-boot
   *  seam (servingModEventRuntime below — the boot composition walks every
   *  save, dirs.rb:54-62 + loader.rb:16-21 + set/event.rb:71-74); the
   *  :recaptcha event's guard reads THIS config at validate time
   *  (the engine's prepareRecaptchaSaveInput requires the config —
   *  recaptcha_keys? — before the walk), so an unarmed host never fires it.
   *  When the host supplies no captchaRuleContent, the engine defaults to
   *  the deck's own rule walk (ruleContentForCard — recaptcha.rb:22's
   *  Card::Rule.toggle(rule(:captcha)) candidate walk); verify defaults
   *  to the real siteverify GET (recaptcha.rb:41-44). */
  recaptcha?: CardActionRecaptchaConfig;
  /** Observer for every mod-event stage walk a save performs (the
   *  dispatcher's onReport: fired and skipped event names, in walk order).
   *  Diagnostics and the side-effects parity harness read event order
   *  through it. Absent = no observer; dispatch is unchanged either way. */
  onModEventReport?: (report: ModEventStageReport) => void;
  /** The account-mail seat: what the *signin update's
   *  send_reset_password_token trigger needs to build and send the reset
   *  email (card-mod-account set/self/signin.rb:62-84). Absent = the host
   *  sends no account mail, and the trigger answers the not-configured
   *  error instead of silently succeeding. */
  accountMail?: Omit<AccountFlowContext, "driver" | "fetcher" | "sessions">;
  /** Where save-path notifications go: the follower notification emails
   *  card-mod-follow sends after a signed-in save (notify.rb:13-16, the
   *  engine's default follow-notify hook). Absent = the notify module's
   *  no-op transport, which drops them. */
  notifyTransport?: NotifyTransport;
}

export interface WriteRouteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** The saved card's name, set at the successful-mutation point
   *  (successResponse) on EVERY success flavor — JSON and HTML alike. The
   *  host's post-save cache expiry keys on this, never on the response's
   *  HTTP shape: Ruby expires the saved card's cache in the after_commit
   *  integration phase (card-1.110.0 lib/card/director/phases.rb:3,:54)
   *  on every committed save, and a JSON save commits exactly like an
   *  HTML one. Error responses leave it unset (no commit, no expire —
   *  phases.rb:19-21). */
  expiryName?: string;
}

/** Whether the host exposes the write path at all. The staging server
 *  boots its driver READONLY (pure browse) — writes stay off until ops
 *  boots writable with this flag set; unset keeps the historical 405s. */
export function writePathEnabled(): boolean {
  return process.env.DECKO_WRITE_PATH === "1";
}

// -----------------------------------------------------------------------
// session cookie — the transport half of signin_with_session
// (auth/current.rb:59-63). The staging /_signin surface issues this cookie;
// the write path reads it for every session-less (cookie-only) write, the
// way Rails reads session[:user_...] off the cookie session.
// -----------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "decko_ts_session";
// Mirrors SessionStore's DEFAULT_SESSION_TTL_SECONDS (48h) so the cookie
// and the server-side row expire together. Ruby's expiry is app config
// (token_expiry) — this is a port decision, not a ported number.
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 48;

/** The session token carried by the request's cookie header, or null. */
export function readSessionCookie(cookieHeader: unknown): string | null {
  if (typeof cookieHeader !== "string" || cookieHeader === "") return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

/** The Set-Cookie header value for a fresh session token (the /_signin and
 *  /update/*signin success surfaces). */
export function sessionCookieHeader(token: string): string {
  return (
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`
  );
}

/** The cleared-cookie header (the signout surface). */
export function clearedSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// -----------------------------------------------------------------------
// params — the card hash (rest.rb:15 card.update! params[:card]) and the
// top-level shortcuts (card_class.rb:128-133 uri_fetch_opts)
// -----------------------------------------------------------------------

interface ParsedBody {
  /** params[:card] — the Card.new/update! args. File-part values ride
   *  cardFiles, never this map (a text part under a mount name lands here
   *  as a string — card_mount.rb:41-42's blank early-return shape). */
  card: Record<string, string>;
  /** params[:card][:subcards]["+*email"] etc. — the first level of the
   *  subcard hash as flat fields: the captured sign-in form's grammar
   *  (card[subcards][+*email][content]), read by the :signin event. */
  subcards: Record<string, Record<string, string>>;
  /** params[:card][:subcards] at every depth (subcards.rb:1-16): each
   *  entry's own fields and its nested subcards, in parameter order — a
   *  sign-up posts card[subcards][+*account][subcards][+*email][content]. */
  subcardTree: Record<string, ParsedSubcard>;
  /** params[:success] — the success hash (success[redirect], success[mark]). */
  success: Record<string, string>;
  /** The multipart FILE parts under the card hash, by mount name — the
   *  card[<mount>] file part is Rack's UploadedFile (parser.rb:138-146),
   *  CardMount's file=/image= argument (card_mount.rb:41-44). */
  cardFiles: Record<string, MultipartFilePart>;
  /** params[:token] (rest.rb:42 authenticators). */
  token?: string;
  /** params[:_method] — the Rails form verb override. */
  methodOverride?: string;
  /** params[:simulate_xhr] (env/serializable.rb:24 — the ajax half). */
  simulateXhr?: boolean;
  /** params[:comment] / params[:comment_author] — the add_comment event's
   *  inputs (card-mod-comment set/all/comment.rb:4-12). */
  comment?: string;
  commentAuthor?: string;
  /** params[:draft] — `Env.params["draft"] == "true"` reads it
   *  (mod/core/set/all/content.rb:20-22), the autosave POST's flag
   *  (card-mod-edit-0.20.0 assets/script/autosave.js.coffee:20 posts
   *  'draft': 'true' alongside the serialized form). */
  draft?: string;
  /** params[:recaptcha_token] — the event :recaptcha input
   *  (card-mod-recaptcha set/all/recaptcha.rb:41-44, 57-66; the grecaptcha
   *  v3 token the recaptcha_token hidden field posts, recaptcha.rb:75-83). */
  recaptchaToken?: string;
}

/** The urlencoded/json key grammar every content type shares (the
 *  Rack::Utils.normalize_params walk over one ordered entry). */
function applyParam(
  parsed: ParsedBody,
  key: string,
  value: string,
): void {
  // the subcard shape FIRST — the plain card-hash match below is greedy
  // and would swallow card[subcards][+*email][content] whole.
  if (key.startsWith("card[subcards][")) {
    const segments = [...key.slice("card".length).matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).slice(1);
    addSubcardParam(parsed.subcardTree, segments, value);
    if (segments.length === 2) {
      const slot = (parsed.subcards[segments[0]] ??= {});
      slot[segments[1]] = value;
    }
    return;
  }
  const cardMatch = /^card\[(.+)\]$/.exec(key);
  if (cardMatch !== null) {
    parsed.card[cardMatch[1]] = value;
    return;
  }
  const successMatch = /^success\[([^\]]+)\]$/.exec(key);
  if (successMatch !== null) {
    parsed.success[successMatch[1]] = value;
    return;
  }
  if (key === "token") parsed.token = value;
  else if (key === "_method") parsed.methodOverride = value;
  else if (key === "simulate_xhr") parsed.simulateXhr = value !== "";
  else if (key === "comment") parsed.comment = value;
  else if (key === "comment_author") parsed.commentAuthor = value;
  else if (key === "draft") parsed.draft = value;
  else if (key === "recaptcha_token") parsed.recaptchaToken = value;
}

/** One subcard of the request's card hash: its fields and nested subcards. */
interface ParsedSubcard {
  fields: Record<string, string>;
  subcards: Record<string, ParsedSubcard>;
}

/** Place card[subcards][K1]([subcards][K2])*[field] = value in the tree. */
function addSubcardParam(tree: Record<string, ParsedSubcard>, segments: string[], value: string): void {
  let level = tree;
  let i = 0;
  while (i < segments.length) {
    const node = (level[segments[i]] ??= { fields: {}, subcards: {} });
    const rest = segments.length - i - 1;
    if (rest === 1) {
      node.fields[segments[i + 1]] = value;
      return;
    }
    if (rest < 3 || segments[i + 1] !== "subcards") return; // not the subcard grammar
    level = node.subcards;
    i += 2;
  }
}

/** A JSON card hash's subcards object, at every depth. */
function subcardTreeFromJson(raw: unknown): Record<string, ParsedSubcard> {
  const out: Record<string, ParsedSubcard> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const node: ParsedSubcard = { fields: {}, subcards: {} };
    for (const [field, v] of Object.entries(value as Record<string, unknown>)) {
      if (field === "subcards") node.subcards = subcardTreeFromJson(v);
      else if (typeof v === "string") node.fields[field] = v;
      else if (typeof v === "number") node.fields[field] = String(v);
    }
    out[key] = node;
  }
  return out;
}

function emptyParsedBody(): ParsedBody {
  return { card: {}, subcards: {}, subcardTree: {}, success: {}, cardFiles: {} };
}

function parseBody(req: WriteRouteRequest): ParsedBody {
  const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(req.body);
    const parsed = emptyParsedBody();
    for (const [key, value] of params.entries()) {
      applyParam(parsed, key, value);
    }
    return parsed;
  }
  if (contentType === "multipart/form-data") {
    // Rack::Multipart.extract_multipart (rack/multipart.rb:42-49): the
    // raw byte stream parsed to ordered parts; params assemble in order
    // with LAST-WINS scalar overwrite (query_parser.rb:142) — the
    // file_chooser's hidden card[file]="" loses to the file part.
    if (req.bodyBytes === undefined) return emptyParsedBody();
    const parsed = emptyParsedBody();
    let parts: ReturnType<typeof parseMultipartForm>;
    try {
      parts = parseMultipartForm(req.bodyBytes, req.headers["content-type"] ?? "");
    } catch {
      // Rack's EOFError("bad content body") is a 500 class
      // (parser.rb:300,311; outside user_error_classes), not a card
      // validation — the host's error surface handles it.
      throw new Error("bad content body");
    }
    for (const part of parts) {
      if (part.kind === "file") {
        // The card-hash mount key: the disposition name is the full
        // "card[file]"/"card[image]" form (card_mount.rb's setter args);
        // store under the UNWRAPPED mount name the handler reads.
        const cardMatch = /^card\[(.+)\]$/.exec(part.name);
        parsed.cardFiles[cardMatch !== null ? cardMatch[1] : part.name] = part;
      } else {
        applyParam(parsed, part.name, part.value);
      }
    }
    // the FLAT params the comment box and the autosave POST ride applyParam
    // like the other top-level shortcuts (comment.rb reads params[:comment]
    // / params[:comment_author]; content.rb:20-22 reads params[:draft] —
    // all outside card[...]).
    return parsed;
  }
  if (contentType === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body) as unknown;
    } catch {
      throw new CardActionError("name-illegal", "request body is not valid JSON");
    }
    if (typeof parsed !== "object" || parsed === null) {
      return emptyParsedBody();
    }
    const obj = parsed as Record<string, unknown>;
    const rawCard = typeof obj["card"] === "object" && obj["card"] !== null
      ? (obj["card"] as Record<string, unknown>)
      : {};
    const card: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawCard)) {
      if (typeof value === "string") card[key] = value;
      else if (typeof value === "number") card[key] = String(value);
    }
    const success: Record<string, string> = {};
    const rawSuccess = typeof obj["success"] === "object" && obj["success"] !== null
      ? (obj["success"] as Record<string, unknown>)
      : {};
    for (const [key, value] of Object.entries(rawSuccess)) {
      if (typeof value === "string") success[key] = value;
    }
    const subcardTree = subcardTreeFromJson(rawCard["subcards"]);
    const subcards: Record<string, Record<string, string>> = {};
    for (const [k, node] of Object.entries(subcardTree)) subcards[k] = { ...node.fields };
    return {
      card,
      subcards,
      subcardTree,
      success,
      cardFiles: {},
      token: typeof obj["token"] === "string" ? obj["token"] : undefined,
      methodOverride: typeof obj["_method"] === "string" ? obj["_method"] : undefined,
      simulateXhr: obj["simulate_xhr"] === true || obj["simulate_xhr"] === "true",
      draft:
        typeof obj["draft"] === "string"
          ? obj["draft"]
          : obj["draft"] === true
            ? "true"
            : undefined,
    };
  }
  return emptyParsedBody();
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
  // (card)/<verb>(/<mark>) — engine_routes.rb:46-48. The "card/" prefix is
  // OPTIONAL ("(card)" in the Rails route): POST /update/<mark> is the shape
  // every real decko edit form posts (the captured oracle edit form carries
  // action="/update/<mark>"; engine_routes.rb:47 routes it via
  // %i[post put patch]). When the prefix is absent the mark is REQUIRED —
  // a bare "/update" falls through to the :mark routes below, which
  // engine_routes.rb:36 matches as a card literally named "update".
  // ":mark" stays single-segment (Rails route segments never span "/").
  const explicitMatch = /^\/(card\/)?(create|update|delete)(?:\/([^/]+))?$/.exec(pathname);
  if (explicitMatch !== null) {
    const prefix = explicitMatch[1];
    const verb = explicitMatch[2] as WriteVerb;
    const mark = explicitMatch[3];
    if (prefix !== undefined || mark !== undefined) {
      if (verb === "create" && !(post || put)) return null; // via: %i[post patch]
      if (verb === "update" && !(post || put)) return null; // via: %i[post put patch]
      if (verb === "delete" && !del) return null; // via: :delete
      return { verb, mark, json: false };
    }
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
  return decodeUriComponentSafe(withoutFormat).replace(/_/g, " ");
}

/** Rack::MethodOverride semantics: only a POST is overridable, and only to
 *  PATCH / PUT / DELETE (the verbs browser forms cannot send natively). */
function effectiveMethod(method: string, parsed: ParsedBody): string {
  if (method !== "POST") return method;
  const override = parsed.methodOverride?.trim().toUpperCase();
  if (override === "PATCH" || override === "PUT" || override === "DELETE") return override;
  return method;
}

/** Card::Env.ajax? (env/serializable.rb:24): `request&.xhr? ||
 *  params[:simulate_xhr]`, where xhr? is Rails'
 *  X-Requested-With contains XMLHttpRequest (actionpack request.rb:290-294). */
function isAjax(req: WriteRouteRequest, parsed: ParsedBody): boolean {
  if (parsed.simulateXhr) return true;
  return /XMLHttpRequest/i.test(req.headers["x-requested-with"] ?? "");
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

/** card-1.110.0 lib/card/error.rb status codes: PermissionDenied 403
 *  (:104), NotFound 404 (:83,89), UserError (validation) 422 (:21).
 *  anonymous-actor is Ruby's permission denial in engine terms (module
 *  header). */
function errorStatus(code: CardActionError["code"]): number {
  if (code === "not-found") return 404;
  if (code === "anonymous-actor" || code === "permission-denied") return 403;
  return 422;
}

/** The loud denial's text (card-mod-format set/all/html/error.rb:191-216,
 *  en.yml format_sorry / format_please / format_to_do_that /
 *  format_need_permission_task): anonymous requests are asked to sign in or
 *  sign up; signed-in requests are told they need permission. The
 *  controller-level denial carries no denied task, hence "to do that". */
function denialText(signedIn: boolean): string {
  return signedIn
    ? "Sorry! You need permission to do that."
    : "Sorry! Please sign in or sign up to do that.";
}

/** The text the HTML error surface shows: the denial text for 403s, else
 *  the Ruby-worded message when the throw site supplied one. */
function userFacingMessage(error: CardActionError, signedIn: boolean): string {
  if (errorStatus(error.code) === 403) return denialText(signedIn);
  return error.userMessage ?? error.message;
}

/** Deleting a card that does not exist: the controller fetches a NEW card
 *  for the mark (card_class.rb uri_fetch new: {}), and deleting a new card
 *  raises a bare Card::Error::UserError (error.rb:21, status 422), which the
 *  errors view shows under its class name. */
const MISSING_CARD_DELETE_MESSAGE = "USERERROR: Card::Error::UserError";

/** Whether the request's session resolves to a live account: the
 *  Auth.signed_in? test the denial text branches on. */
async function signedInFor(ctx: WriteRouteContext, sessionToken: string | null): Promise<boolean> {
  if (sessionToken === null) return false;
  return (await new SessionStore({ driver: ctx.driver }).lookupSession(sessionToken)) !== null;
}

/** The errors hash Ruby's JSON errors view reports (card-mod-format
 *  set/all/error.rb format :json view :errors: `{attribute => message}`,
 *  a later message for the same attribute replacing an earlier one). The
 *  throw site's explicit attribute map wins; otherwise the shown
 *  "KEY: message" lines are read back (Ruby upcases the attribute symbol
 *  for display; attributes are lower-case symbols). */
function rubyErrorsHash(error: CardActionError, signedIn: boolean): Record<string, string> {
  if (error.errorsByAttribute !== undefined) return { ...error.errorsByAttribute };
  // A denial without the rule walk's wording (the host write hook, a deck
  // without the anonymous card): still Ruby's :permission_denied key.
  if (errorStatus(error.code) === 403) return { permission_denied: error.message };
  // recaptcha.rb:28-31 errors.add :recaptcha, <message>
  if (error.code === "recaptcha") return { recaptcha: error.message };
  const shown = userFacingMessage(error, signedIn);
  const out: Record<string, string> = {};
  for (const line of shown.split("\n")) {
    const m = /^([A-Z0-9_*+ ]+): ([\s\S]*)$/.exec(line.trim());
    if (m !== null) out[m[1].toLowerCase()] = m[2];
  }
  if (Object.keys(out).length === 0 && shown !== "") out["error"] = shown;
  return out;
}

/** Time#utc.to_s: "YYYY-MM-DD HH:MM:SS UTC". */
function rubyUtcString(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** The request's own URL (Rails request_url): scheme, host, path. */
function requestUrl(req: WriteRouteRequest): string {
  return `${req.scheme ?? "http"}://${req.host ?? ""}${req.pathname}`;
}

function errorResponse(
  json: boolean,
  error: CardActionError,
  signedIn = false,
  meta?: { url: string; now: Date },
): WriteRouteResponse {
  const status = errorStatus(error.code);
  if (json) {
    // card-mod-format set/all/json.rb page_details: the errors view's hash
    // plus url and requested_at, pretty-generated.
    const payload: Record<string, unknown> = {
      error_status: status,
      errors: rubyErrorsHash(error, signedIn),
    };
    if (meta !== undefined) {
      payload["url"] = meta.url;
      payload["requested_at"] = rubyUtcString(meta.now);
    }
    return {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      body: JSON.stringify(payload, null, 2),
    };
  }
  return htmlResponse(
    status,
    `Error (${error.code})`,
    `<pre>${escapeHtml(userFacingMessage(error, signedIn))}</pre>${diagnosticComment(error, signedIn)}`,
  );
}

/** The engine's own reason, kept beside the user-facing text as an HTML
 *  comment when the two differ (Ruby's quiet denial carries its reason the
 *  same way: "<!-- Sorry, you don't have permission (task) -->",
 *  set/all/html/error.rb:185-189). */
function diagnosticComment(error: CardActionError, signedIn: boolean): string {
  if (userFacingMessage(error, signedIn) === error.message) return "";
  return `<!-- ${escapeHtml(error.message).replace(/--/g, "&#45;&#45;")} -->`;
}

/** The Decko Bot account's email (Decko Bot+*account+*email), or the
 *  address the account mod seeds for it (card-mod-account data/real.yml,
 *  decko_bot+account email) when the deck has no such row. Follower mail
 *  is sent from it (safe_from_and_reply_to!). */
async function deckoBotAccountEmail(driver: SQLDatabaseDriver): Promise<string> {
  try {
    const r = await driver.query<{ email: string }>(
      "SELECT e.db_content AS email FROM cards e JOIN cards a ON a.id = e.left_id " +
        "JOIN cards b ON b.id = a.left_id WHERE b.codename = 'decko_bot' " +
        "AND a.right_id = (SELECT id FROM cards WHERE codename = 'account') " +
        "AND e.right_id = (SELECT id FROM cards WHERE codename = 'email') AND e.trash = 0",
      [],
    );
    const email = r.rows[0]?.email;
    if (typeof email === "string" && email !== "") return email;
  } catch {
    // a deck without the account cards: the seeded address below
  }
  return "no-reply@decko.org";
}

/** Ruby's cud_success (rest.rb:80-89): HTML redirects to the card's
 *  location; JSON reloads (the caller re-fetches — the response carries
 *  the ids to reconcile). BOTH flavors carry expiryName: this is the
 *  successful-mutation point, and the save's cache expiry cannot depend
 *  on which response shape the request format produced (module header on
 *  WriteRouteResponse; the JSON flavor's missing Location header was the
 *  deployed build's stale-render defect). */
/** Ruby's card_url (Env::Location): the deck origin, or the request's own
 *  scheme+host_with_port (env/serializable.rb:19-21). hard_redirect runs
 *  every redirect URL through it (response.rb:41), so live Location
 *  headers are absolute (captured: "http://localhost:3011/..."). */
function cardUrl(req: WriteRouteRequest, path: string): string {
  if (req.host === undefined || req.host === "") return path; // no Host: relative (documented degenerate case)
  return `http://${req.host}${path}`;
}

/** Ruby's cud_success for the PLAIN-form flavor (response.rb:25-33): the
 *  hard redirect — `hard_redirect success.to_url, 303` (:31), Location
 *  absolutized through card_url (:41). JSON keeps the API shape. */
function successResponse(
  req: WriteRouteRequest,
  json: boolean,
  name: string,
  saved: { cardId: number; actId: number; actionId: number; verb: WriteVerb },
  redirectPath: string = `/${locationName(name)}`,
): WriteRouteResponse {
  if (json) {
    return {
      ...jsonResponse(200, {
        card: { name, url: `/${locationName(name)}` },
        verb: saved.verb,
        card_id: saved.cardId,
        act_id: saved.actId,
        action_id: saved.actionId,
      }),
      expiryName: name,
    };
  }
  return {
    status: 303,
    headers: { Location: cardUrl(req, redirectPath), "Cache-Control": "no-store" },
    body: "",
    expiryName: name,
  };
}

/** The URL form of a card name: Ruby's path(mark:) is the name's url_key
 *  (variants.rb), whose joint and key characters ("+", "*") stay literal;
 *  only characters a URL path cannot carry are percent-encoded. */
function locationName(name: string): string {
  return encodeURI(DeckoName.parse(name).urlKey).replace(/[?#]/g, (c) => encodeURIComponent(c));
}

/** Ruby's previous_location (location_history.rb:6-21): the last page in
 *  the session's location history, "/" for a fresh history. The port's
 *  write surface keeps no read history, so this is the fresh-history value. */
const PREVIOUS_LOCATION = "/";

/** The success target path (env/success/target.rb process_target):
 *  success[mark] "*previous" -> previous location; an absolute path or URL
 *  as given; another mark -> that card's path; no mark -> the request's own
 *  card. */
function successTargetPath(parsed: ParsedBody, ownName: string): string {
  const mark = parsed.success["mark"] ?? parsed.success["id"];
  if (mark === undefined) return `/${locationName(ownName)}`;
  if (mark === "") return "";
  if (mark === "*previous" || mark === ":previous") return PREVIOUS_LOCATION;
  if (/^(http|\/)/.test(mark)) return mark;
  return `/${locationName(mark)}`;
}

// -----------------------------------------------------------------------
// the *signin update — the :signin event over the captured form grammar
// -----------------------------------------------------------------------

const SIGNIN_KEY = DeckoName.parse("*signin").key;

/** The captured sign-in form (manifest step-02, 2026-09-28) posts
 *  card[subcards][+*email][content] / [+*password][content] (the account
 *  mod's form views) to /update/*signin with _method=patch and
 *  success[redirect]=true&success[mark]=*previous. Ruby runs the :signin
 *  validation event (card-mod-account-0.20.0 set/self/signin.rb:10-12:
 *  authenticate_or_abort field_content(:email), field_content(:password)),
 *  then signin_success aborts the save (:15-17 — no card/act rows), and
 *  the controller's success path redirects to *previous (:171) —
 *  previous_location is the session history's last entry
 *  (env/location_history.rb:19-21), which initializes to "/" (:6-9).
 *  Response: the hard redirect 303 (plain form; captured), or the ajax
 *  hard-redirect JSON {redirect: url} (response.rb:42-46).
 *
 *  Failure shape NOT pinned by the capture (live was only captured
 *  succeeding): the abort :failure ladder message is surfaced as a
 *  UserError 422 (error.rb:21) — disclosed as unverified-against-live. */
async function handleSigninUpdate(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  json: boolean,
  parsed: ParsedBody,
): Promise<WriteRouteResponse> {
  const email = parsed.subcards["+*email"]?.content ?? "";
  const password = parsed.subcards["+*password"]?.content ?? "";
  const fail = (message: string, shown: string): WriteRouteResponse =>
    json
      ? errorResponse(true, new CardActionError("user-error", message, shown), false, {
          url: requestUrl(req),
          now: ctx.now?.() ?? new Date(),
        })
      : htmlResponse(422, "Error (signin-failure)", `<pre>${escapeHtml(shown)}</pre>`);
  // The send_reset_password_token trigger (signin.rb:62-84): the forgot-
  // password form posts the email with card[trigger]; the :signin event
  // does not run.
  if (parsed.card["trigger"] === "send_reset_password_token") {
    return handleResetPasswordTrigger(ctx, req, json, parsed, email, fail);
  }
  // signin.rb:46-48 abort_unless email/password: blank fields abort before
  // any authentication. Ruby shows the attribute and account_error_blank
  // ("email can't be blank", the abort message without an errors key).
  if (email === "" || password === "") {
    const field = email === "" ? "email" : "password";
    return fail(`${field} missing`, `${field} can't be blank`);
  }
  const sessions = new SessionStore({ driver: ctx.driver });
  const outcome = await signinAccount(ctx.driver, sessions, email, password);
  if (!outcome.ok) {
    // authenticate_or_abort adds the ladder message under :signin
    // (signin.rb:50-58 errors.add :signin, ...): "SIGNIN: <message>".
    return fail(outcome.message, `SIGNIN: ${outcome.message}`);
  }
  // The success target (env/success/target.rb): the form's
  // success[mark]=*previous (signin.rb:171) -> previous_location; without a
  // success mark the target is the card itself, *signin.
  const target = cardUrl(req, successTargetPath(parsed, "*signin"));
  if (isAjax(req, parsed)) {
    // the ajax hard redirect (response.rb:42-46)
    const body = jsonResponse(200, { redirect: target });
    return {
      status: body.status,
      headers: { ...body.headers, "Set-Cookie": sessionCookieHeader(outcome.session.token) },
      body: body.body,
    };
  }
  return {
    status: 303,
    headers: { Location: target, "Cache-Control": "no-store", "Set-Cookie": sessionCookieHeader(outcome.session.token) },
    body: "",
  };
}

/** The forgot-password trigger on the *signin update (card-mod-account
 *  set/self/signin.rb:62-84, event :send_reset_password_token): look the
 *  email up, send the reset email to an active account, and redirect to the
 *  success view the form asked for (success[view]; signin.rb's form pins
 *  reset_password_success). Failures are errors on :email
 *  (signin.rb:96-102 error_on), shown as "EMAIL: <message>". */
async function handleResetPasswordTrigger(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  json: boolean,
  parsed: ParsedBody,
  email: string,
  fail: (message: string, shown: string) => WriteRouteResponse,
): Promise<WriteRouteResponse> {
  if (ctx.accountMail === undefined) {
    return fail("account mail is not configured on this host", "account mail is not configured on this host");
  }
  const outcome = await sendResetPasswordToken(
    {
      ...ctx.accountMail,
      driver: ctx.driver,
      fetcher: ctx.fetcher,
      sessions: new SessionStore({ driver: ctx.driver }),
    },
    email,
  );
  if (!outcome.ok) return fail(outcome.message, `EMAIL: ${outcome.message}`);
  const view = parsed.success["view"];
  const path = view === undefined || view === ""
    ? `/${locationName("*signin")}`
    : `/${locationName("*signin")}/${encodeURIComponent(view)}`;
  if (json) return jsonResponse(200, { redirect: cardUrl(req, path) });
  return { status: 303, headers: { Location: cardUrl(req, path), "Cache-Control": "no-store" }, body: "" };
}

/** Sign-out: DELETE /delete/*signin (card-mod-account set/self/signin.rb
 *  event :signout, on: :delete — `Auth.signin nil`, then abort :success so
 *  no card row is touched). The session is revoked, the cookie cleared, and
 *  the request redirected to the *signin card (the delete's success target
 *  is the card itself). */
async function handleSignout(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  json: boolean,
  parsed: ParsedBody,
): Promise<WriteRouteResponse> {
  const token = tokenFromRequest(req, parsed) ?? readSessionCookie(req.headers.cookie);
  if (token !== null) await new SessionStore({ driver: ctx.driver }).revokeSession(token);
  const target = cardUrl(req, `/${locationName("*signin")}`);
  const headers = { "Cache-Control": "no-store", "Set-Cookie": clearedSessionCookieHeader() };
  if (json) {
    const body = jsonResponse(200, { redirect: target });
    return { ...body, headers: { ...body.headers, ...headers } };
  }
  return { status: 303, headers: { ...headers, Location: target }, body: "" };
}

// -----------------------------------------------------------------------
// the handler
// -----------------------------------------------------------------------

/** The serving write surface's mod-event runtime: the DECK's composition
 *  (the deck-boot seam, defaultDeckEventRuntime) + the write-path host,
 *  composed ONCE per process - the port of Ruby's single boot composition
 *  (Cardio::Mod::Dirs#initialize adds core + every gem mod, card-1.110.0
 *  lib/cardio/mod/dirs.rb:54-62; Loader.load_mods registers every set file,
 *  lib/cardio/mod/loader.rb:16-21; the `event` DSL lands each declaration
 *  in the one event space, lib/card/set/event.rb:71-74) that every save -
 *  the serving write path included - walks. The pre-E-16 seat composed a
 *  private recaptcha-only loader and rode it only on armed saves, which left
 *  deck/core event bodies on the engine's built-in equivalents
 *  (EVENT_TAKEOVER_BUILTINS never stood down) and custom mod bodies
 *  (comment's add_comment) undispatched server-side.
 *
 *  The WRITE-PATH HOST: the only host member save-time event bodies reach
 *  is the integrate observers' fetchRenderCard (card-mod-integrate.ts
 *  observerLookupFromHost - the *on_<action> rule-card walk). The write
 *  seat has no sync render-card surface, so the host answers undefined -
 *  observer.rb:20-21's nil rule arm, `|| []`: zero event cards resolve,
 *  exactly a Ruby deck whose observer rule cards resolve nothing (the
 *  oracle deck's *on_create/*on_update/*on_delete rules carry no items).
 *  Every OTHER member throws member-named loud: no save-time body uses
 *  them (they are the prepareEngine/install surfaces, served by the render
 *  path's modEngineHost), and a body reaching for one must fail loudly,
 *  never silently no-op. The dynamic import keeps an unarmed module graph
 *  exactly as before this seat existed, and the cache means a deck composes
 *  the runtime at most one load per process. */
const WRITE_PATH_HOST: ModEngineHost = {
  fetchRenderCard: () => undefined,
  isDenied: () => {
    throw new Error(
      "the serving write path composes no read-permission surface (ModEngineHost.isDenied)",
    );
  },
  batch: async () => {
    throw new Error(
      "the serving write path composes no batch surface (ModEngineHost.batch)",
    );
  },
  codenames: {
    ensureLoaded: async () => {
      throw new Error(
        "the serving write path composes no codename surface (ModEngineHost.codenames.ensureLoaded)",
      );
    },
    peekId: () => {
      throw new Error(
        "the serving write path composes no codename surface (ModEngineHost.codenames.peekId)",
      );
    },
  },
  fetchById: async () => {
    throw new Error(
      "the serving write path composes no fetch surface (ModEngineHost.fetchById)",
    );
  },
  cacheFetchedRecord: async () => {
    throw new Error(
      "the serving write path composes no cache-write surface (ModEngineHost.cacheFetchedRecord)",
    );
  },
  composeAndCacheRows: async () => {
    throw new Error(
      "the serving write path composes no warm-compose surface (ModEngineHost.composeAndCacheRows)",
    );
  },
};

let servingModEventRuntimeSeat: Promise<ModEventRuntime> | undefined;
function servingModEventRuntime(): Promise<ModEventRuntime> {
  servingModEventRuntimeSeat ??= (async () => {
    const [{ defaultDeckEventRuntime }] = await Promise.all([
      import("../card/mod-loader/default-mod-deck.js"),
    ]);
    return defaultDeckEventRuntime(WRITE_PATH_HOST);
  })();
  return servingModEventRuntimeSeat;
}

/** The serving runtime, with the host's stage-report observer attached when
 *  one is given. The shared runtime object is never mutated: an observed
 *  request gets a shallow copy carrying its own onReport. */
async function observedModEventRuntime(ctx: WriteRouteContext): Promise<ModEventRuntime> {
  const runtime = await servingModEventRuntime();
  const codenameOfType = await typeCodenames(ctx.driver);
  return {
    ...runtime,
    setMember: typeSetMember(codenameOfType),
    ...(ctx.onModEventReport === undefined ? {} : { onReport: ctx.onModEventReport }),
  };
}

/** Type-set membership for scoped event set paths: a card belongs to the
 *  set module "type/<codename>[/...]" when its type card carries that
 *  codename (Card::Set::Type, card-1.110.0 lib/card/set/pattern; the set
 *  file's directory is the type's codename). Every other scoped pattern
 *  stays not-applicable, as before this resolver existed. */
function typeSetMember(codenameOfType: ReadonlyMap<number, string>) {
  return (setPath: string, card: { typeId?: number | null }): boolean => {
    const match = /^type\/([^/]+)/.exec(setPath);
    if (match === null || card.typeId === undefined || card.typeId === null) return false;
    return codenameOfType.get(card.typeId) === match[1];
  };
}

/** id -> codename for every codenamed card (the codename table, read once
 *  per driver; codenames are deck structure, not request data). */
const typeCodenameCache = new WeakMap<object, Promise<Map<number, string>>>();
function typeCodenames(driver: SQLDatabaseDriver): Promise<Map<number, string>> {
  let cached = typeCodenameCache.get(driver);
  if (cached === undefined) {
    cached = driver
      .query<{ id: number; codename: string }>(
        "SELECT id, codename FROM cards WHERE codename IS NOT NULL AND codename <> '' AND trash = 0",
        [],
      )
      .then((r) => new Map(r.rows.map((row) => [Number(row.id), String(row.codename)])));
    typeCodenameCache.set(driver, cached);
  }
  return cached;
}

/**
 * Dispatch one non-GET request against the write grammar. Returns the
 * response, or NULL when the request is not a write route at all (the
 * host falls through to its own 404/405 surface — the historical 405s
 * stay for every non-write method/path pair).
 *
 * Per request: token-or-cookie -> session token (rest.rb:37-40 +
 * auth/current.rb:50-63), the *signin subcard-update branch when the mark
 * is *signin (the :signin event), engine gate (the ok_to_* rule walk
 * inside the CardActionEngine), save, act rows, response (303 hard
 * redirect / 200 soft-redirect slot / JSON).
 */
export async function handleWriteRequest(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  opts?: { authOnly?: boolean },
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
    if (error instanceof CardActionError) {
      return errorResponse(json, error, false, { url: requestUrl(req), now: ctx.now?.() ?? new Date() });
    }
    throw error;
  }
  // Rails MethodOverride (rack-method_override: POST + `_method` param
  // rewrites the verb) — how real decko FORMS reach the RESTful routes:
  // an edit form POSTs `card/...` with a hidden `_method=patch`.
  const method = effectiveMethod(req.method, parsed);

  const route = matchRoute(method, req.pathname);
  if (route === null) return null;

  // The *signin update IS the login action (signin.rb:6 "/update/:signin is
  // the login action") — before any card machinery runs.
  if (route.verb === "update" && route.mark !== undefined) {
    if (DeckoName.parse(markToName(route.mark)).key === SIGNIN_KEY) {
      return handleSigninUpdate(ctx, req, json, parsed);
    }
  }
  // The AUTH-ONLY arm (edge-signin-form-fix lane, 2026-10-03): everything
  // below this line is CARD CREATE/UPDATE/DELETE — the surface a deployment
  // flag may lawfully switch off. Sign-in is not a card write (the :signin
  // event aborts the save — no card/act rows — and only mints an
  // auth_sessions row), and Ruby decko never gates the login action behind
  // a deploy flag. A host that wants auth alive while card writes stay off
  // dispatches through handleAuthOnlyRequest, which returns exactly this
  // branch and nothing else.
  if (opts?.authOnly === true) return null;

  // The *signin delete is the logout action (signin.rb event :signout). It
  // stays behind the auth-only gate: disarmed hosts pin every delete route
  // against *signin as a gated card write.
  if (route.verb === "delete" && route.mark !== undefined) {
    if (DeckoName.parse(markToName(route.mark)).key === SIGNIN_KEY) {
      return handleSignout(ctx, req, json, parsed);
    }
  }

  // authenticate (rest.rb:37-40): header/param token first, else the
  // cookie session (auth/current.rb:50-63); unresolvable = Anonymous.
  const sessionToken =
    tokenFromRequest(req, parsed) ?? readSessionCookie(req.headers.cookie);

  const engine = await createCardActionEngineForSession(ctx.fetcher, ctx.driver, sessionToken, {
    ipAddress: ctx.ipAddress ?? req.headers["x-forwarded-for"] ?? "127.0.0.1",
    now: ctx.now,
    attachmentStore: ctx.attachmentStore,
    fileStorage: ctx.fileStorage,
    // the deck's event runtime rides EVERY save (the deck-boot seam,
    // servingModEventRuntime above - Ruby's boot composes all mods once and
    // every save walks the one event space, dirs.rb:54-62 + loader.rb:16-21
    // + set/event.rb:71-74). The recaptcha seat (WriteRouteContext.recaptcha)
    // is the separate opt-in it always was: the config passes through
    // UNCHANGED - the engine's own defaults are the rule walk and the real
    // siteverify GET, and the :recaptcha event's when-predicate reads the
    // config the engine composes at validate time (card-action-engine.ts
    // prepareRecaptchaSaveInput), so an unarmed host registers the event and
    // still never fires the guard (recaptcha_keys? false, recaptcha.rb:46-48).
    modEvents: await observedModEventRuntime(ctx),
    ...(ctx.notifyTransport === undefined ? {} : { notifyTransport: ctx.notifyTransport }),
    followMail: {
      origin: cardUrl(req, ""),
      deckoBotEmail: ctx.accountMail?.deckoBotEmail ?? (await deckoBotAccountEmail(ctx.driver)),
    },
    ...(ctx.recaptcha === undefined ? {} : { recaptcha: ctx.recaptcha }),
  });

  // CardMount's mount argument: the card[<mount>] file part is the
  // file=/image= setter's argument (card_mount.rb:41-44). The deck's
  // attachment cardtypes carry exactly one mount each — `attachment :file`
  // (set/type/file.rb:1) / `attachment :image` (set/type/image.rb:1). A
  // file part under any other card-hash key is Ruby's unknown-attribute
  // error class; this surface reads only the two mounts (documented).
  const attachmentInput =
    parsed.cardFiles["file"] ?? parsed.cardFiles["image"] ?? undefined;
  const attachment: AttachmentInput | undefined = attachmentInput === undefined
    ? undefined
    : {
        bytes: attachmentInput.bytes,
        originalFilename: attachmentInput.filename,
        declaredContentType: attachmentInput.contentType,
      };

  try {
    let result: ActionResult | null;
    let name: string;
    if (route.verb === "create") {
      const input = {
        ...createInputFromParams(route, parsed, attachment),
        comment: parsed.comment,
        commentAuthor: parsed.commentAuthor,
        recaptchaToken: parsed.recaptchaToken,
      };
      result = await engine.createCard(input);
      name = result.name?.s ?? input.name;
      await requestSignupVerification(ctx, name, input.subcards);
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
      // The card is fetched by the URL mark when there is one (uri_fetch,
      // card_class.rb:128-133: Card.fetch(mark, new: opts)); card[name] is
      // then the rename argument. Looking up by card[name] instead would
      // land a rename-onto-an-existing-name on the OTHER card as a no-op.
      const existing = await lookupLiveCard(ctx.fetcher, markName ?? updateName);
      if (existing === undefined) {
        // rest.rb:14-16 — update of a NEW card routes to CREATE (the fetch
        // builds the card from the params; trashed marks fetch as new and
        // the create path revives). The name rides the request's own
        // resolution: card-hash name when present, else the URL mark.
        const created = await engine.createCard({
          ...createInputFromParams(route, parsed, attachment),
          name: updateName,
          comment: parsed.comment,
          commentAuthor: parsed.commentAuthor,
          recaptchaToken: parsed.recaptchaToken,
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
          attachment,
          comment: parsed.comment,
          commentAuthor: parsed.commentAuthor,
          recaptchaToken: parsed.recaptchaToken,
          // the edit form's :conflict_tracker hidden field
          // (card-mod-edit-0.20.0 set/all/form.rb:27-31) - the stale-revision
          // value detect_conflict validates (card-mod-history
          // set/all/history/events.rb:19-22, when: :edit_conflict?).
          lastActionIdBeforeEdit: card["last_action_id_before_edit"],
          // Env.params["draft"] == "true" (mod/core/set/all/content.rb:20-22):
          // the autosave POST (assets/script/autosave.js.coffee:20).
          draft: parsed.draft === "true",
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
        throw new CardActionError("user-error", `no such card: ${markName}`, MISSING_CARD_DELETE_MESSAGE, {
          UserError: "Card::Error::UserError",
        });
      }
      result = await engine.deleteCard({
        cardId: existing.id,
        // params[:recaptcha_token] — the event :recaptcha input rides every
        // save verb (recaptcha.rb:50 has no `on:`; trash.rb:11-21 makes the
        // delete an update save), so the DELETE wire plumbs it like the
        // create/update legs.
        recaptchaToken: parsed.recaptchaToken,
      });
      name = markName;
    }

    const saved = {
      cardId: result?.cardId ?? 0,
      actId: result?.actId ?? 0,
      actionId: result?.actionId ?? 0,
      verb: result?.verb ?? route.verb,
    };

    // The ajax soft redirect (response.rb:25-36 + :54-62): the ajax flavor
    // defaults to "soft" — re-render the saved card through `show` and
    // answer 200 + the rendered slot (the captured XHR save: 200 + the
    // titled slot). JSON requests keep the API shape.
    if (!json && isAjax(req, parsed) && ctx.renderSlot !== undefined) {
      const slotHtml = await ctx.renderSlot(name);
      return {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        body: slotHtml,
        // This 200 slot carries no Location header, and the host's
        // expireRenderCachesAfterSave gate (expiryName) must reach the
        // boot + other-actor engines the renderSlot hook's own expiry
        // (actor engine only) cannot — the save's cache expiry cannot
        // depend on the response shape (WriteRouteResponse module header).
        expiryName: name,
      };
    }
    // configure_successful_deletion (card-mod-session
    // set/all/location_history.rb:12-20): a non-ajax delete redirects to the
    // previous location; other saves to the success target.
    const redirectPath = saved.verb === "delete" && parsed.success["mark"] === undefined
      ? PREVIOUS_LOCATION
      : successTargetPath(parsed, name);
    return successResponse(req, json, name, saved, redirectPath);
  } catch (error) {
    if (error instanceof CardActionError) {
      return errorResponse(json, error, await signedInFor(ctx, sessionToken), {
        url: requestUrl(req),
        now: ctx.now?.() ?? new Date(),
      });
    }
    throw error;
  }
}

/** The AUTH-ONLY dispatch (edge-signin-form-fix lane, 2026-10-03): the
 *  login action and NOTHING else. Resolves to handleSigninUpdate for
 *  POST /update/*signin (both the HTML 303 flavor and the .json/ajax
 *  flavor), null for every other method/path — including a card-hash update
 *  that merely NAMES *signin, a delete/put spoof against it, and every
 *  create/delete route. The caller (the shared Workers surface's disarmed
 *  arm, the Bunny edge surface's disarmed arm) answers its own
 *  write-path-off response when this returns null, so card writes keep the
 *  exact gating they had. */
export async function handleAuthOnlyRequest(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
): Promise<WriteRouteResponse | null> {
  return handleWriteRequest(ctx, req, { authOnly: true });
}

/** Card params for CREATE — uri_fetch_opts (card_class.rb:128-133): the
 *  card hash wins; the mark fills the name; the /type/<type> shortcut
 *  fills the type unless the hash set one. The card[<mount>] file part
 *  rides as the attachment input — assign_set_specific_attributes
 *  (attachment.rb:90-97) resets content when attaching, which the
 *  engine's attachment handling models. */
function createInputFromParams(
  route: RouteMatch,
  parsed: ParsedBody,
  attachment: AttachmentInput | undefined,
): {
  name: string;
  content?: string;
  typeName?: string;
  typeId?: number;
  attachment?: AttachmentInput;
  subcards?: Record<string, SubcardInput>;
} {
  const card = parsed.card;
  const subcards = subcardInputs(parsed.subcardTree);
  const name = card["name"] ?? (route.mark !== undefined ? markToName(route.mark) : "");
  if (name === "") {
    // Ruby: Card.new(name: nil).save! -> validation error -> 422.
    throw new CardActionError("name-illegal", "param is missing or the value is empty: name", "NAME: can't be blank");
  }
  const typeName = card["type"] ?? route.typeShortcut;
  const typeIdRaw = card["type_id"];
  return {
    name,
    content: card["content"],
    typeName,
    typeId: typeIdRaw !== undefined && /^\d+$/.test(typeIdRaw) ? Number(typeIdRaw) : undefined,
    attachment,
    ...(Object.keys(subcards).length > 0 ? { subcards } : {}),
  };
}

/** request_verification (card-mod-account set/type/signup.rb): a sign-up
 *  its creator can approve starts "unverified", and the account's
 *  send_verification_email event mails the verification link at
 *  :integrate. The engine wrote the status; this sends the mail through
 *  the host's account-mail seat. */
async function requestSignupVerification(
  ctx: WriteRouteContext,
  name: string,
  subcards: Record<string, SubcardInput> | undefined,
): Promise<void> {
  if (ctx.accountMail === undefined || subcards?.["+*account"] === undefined) return;
  const status = await lookupLiveCard(ctx.fetcher, `${name}+*account+*status`);
  if (status?.dbContent !== "unverified") return;
  await sendAccountVerificationToken(
    {
      ...ctx.accountMail,
      driver: ctx.driver,
      fetcher: ctx.fetcher,
      sessions: new SessionStore({ driver: ctx.driver }),
    },
    `${name}+*account`,
  );
}

/** The request's subcard tree as the engine's subcard input
 *  (subcards.rb:1-16): content, type and nested subcards per entry. */
function subcardInputs(tree: Record<string, ParsedSubcard>): Record<string, SubcardInput> {
  const out: Record<string, SubcardInput> = {};
  for (const [key, node] of Object.entries(tree)) {
    const typeIdRaw = node.fields["type_id"];
    const nested = subcardInputs(node.subcards);
    out[key] = {
      ...(node.fields["content"] !== undefined ? { content: node.fields["content"] } : {}),
      ...(node.fields["type"] !== undefined ? { typeName: node.fields["type"] } : {}),
      ...(typeIdRaw !== undefined && /^\d+$/.test(typeIdRaw) ? { typeId: Number(typeIdRaw) } : {}),
      ...(Object.keys(nested).length > 0 ? { subcards: nested } : {}),
    };
  }
  return out;
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
