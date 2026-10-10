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
// new_file cache card, the preview_editor round trip) IS this surface's
// preliminary arm: a save whose request carries attachment_upload beside
// the file part answers handlePreliminaryUpload below (the draft write +
// the bare preview_editor html; WriteRouteContext.renderPreviewEditor is
// the host render seam) and the final save carries the preview's
// card[action_id_of_cached_upload] hidden input through to the engine's
// cached-upload attach (00_upload_cache.rb:27-43 assign_attachment_on_*)
// and integrate-phase cache cleanup (:51-72 delete_cached_upload_file_on_*).
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
// CSRF — a SECURITY DIVERGENCE (docs/SECURITY.md, "Cross-site requests"):
// every write route and the sign-in action pass the same-origin check in
// request-origin.ts (Sec-Fetch-Site, then Origin, then Referer; requests
// carrying none of them are not from a browser page and pass), which
// refuses a cross-site form with 403 and changes no page bytes (no token).
// DECKO_ORIGIN_CHECK=off restores Ruby's behaviour. What Ruby does, for the
// record: live decko arms no forgery protection.
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
// The port's origin check needs no token, so same-origin token-less posts
// (every captured shape) still go straight through to the action gates.
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
import type { FetchEngine } from "../card/fetch.js";
import { composeCardRecord, type CardRecord } from "../card/fetch/card-record.js";
import type { CardsRow } from "./schema.js";
import { SessionStore } from "../card/auth/index.js";
import { signinAccount } from "../card/auth/signin.js";
import { createCardActionEngineForSession } from "../card/actions/engine-for-session.js";
import type { CardActionEngine } from "../card/actions/card-action-engine.js";
import {
  CardActionError,
  type ActionResult,
  type AttachmentInput,
  type SubcardInput,
} from "../card/actions/types.js";
import type { NotifyTransport } from "../card/notify/types.js";
import type { CardActionRecaptchaConfig } from "../card/actions/card-action-engine.js";
import type { ModEventRuntime } from "../card/mod-loader/mod-event-dispatch.js";
import type { ModEngineHost } from "../card/mod-loader/mod-manifest.js";
import type { AttachmentStore } from "../card/attachments/attachment-store.js";
import { DeckoName } from "../card/name.js";
import { parseMultipartForm, type MultipartFilePart } from "./multipart-form.js";
import { decodeUriComponentSafe } from "./decode-uri-component-safe.js";
import {
  checkRequestOrigin,
  CROSS_ORIGIN_MESSAGE,
  defaultOriginPolicy,
  type OriginPolicy,
} from "./request-origin.js";

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
  /** The URL query string as received ("?a=1&b=2", or "" / absent). Rails
   *  merges query parameters into params beneath the body parameters
   *  (request.parameters: query first, body wins); the history pane's revert
   *  links carry their parameters here (revert_actions[], revert_to,
   *  revert_act, look_in_trash — card-mod-history actions.rb:81-89). */
  search?: string;
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
  /** The third parameter carries the POSTED subcards' full names (the
   *  same list the response's expiryNames stamp): the director's
   *  set_stamper assigns their updater at instantiation, so the slot
   *  re-render must read their POST-save state — expiring only the mark
   *  left a changed +*email rendering its pre-save value inside the slot
   *  bytes themselves. */
  renderSlot?: (name: string, view?: string, subcardNames?: string[]) => Promise<string>;
  /** Renders one card's preview_editor view — the host's render machinery
   *  for the two-step upload's success response (00_upload_cache.rb:18-24:
   *  the preliminary abort's success target rendered on view
   *  :preview_editor, answered as the fileupload AJAX's 200 html —
   *  response.rb soft_redirect show). `opts` are the view's render opts:
   *  attachment_upload (the hidden-input name source), original_filename,
   *  attachment_size, and the preliminary round trip's selected_action_id /
   *  cached_upload_identifier. The response body is the BARE view (the
   *  decko.js doneFile handler replaces .chosen-file with it verbatim —
   *  upload.js.coffee:48-51). Absent -> the preliminary upload arm refuses
   *  with a named error (no silent fallthrough into the direct-save
   *  grammar). */
  renderPreviewEditor?: (input: {
    name: string;
    opts: Record<string, unknown>;
  }) => Promise<string>;
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
  /** The same-origin policy for writes and sign-in (request-origin.ts).
   *  Absent: from process.env, else enabled with no extra origins. */
  originPolicy?: OriginPolicy;
  /** The mail transport the saves' notifications go through (follower
   *  mail, card-mod-follow's :notify_followers integration event), passed
   *  to every write engine this module builds. Absent = the engine's
   *  default transport. */
  notifyTransport?: NotifyTransport;
  /** The deck origin and bot address the follower notification's nest
   *  views render with (Cardio.config.deck_origin port + the Decko Bot
   *  account's email for safe_from_and_reply_to!, email_config.rb:52-79).
   *  Absent = the notification template renders without its nest values
   *  (every `{{_|...}}` nest falls back to its bare name). */
  followMail?: { origin: string; deckoBotEmail: string };
}

export interface WriteRouteResponse {
  /** The visitor-session cookie a request that arrived without one receives
   *  (the visitor session the write routes mint), appended after any
   *  session cookie by the host. */
  visitorCookie?: string;
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
  /** Every card the save persisted — the mark plus each posted subcard
   *  (subcards.rb: the director saves each as its own card, each with its
   *  own post-commit expire). The host's render-map expiry walks this list:
   *  the per-engine enriched render-card entries of a saved SUBCARD are
   *  TS-only structures (post-save-cache-expiry.ts header), and expiring
   *  only the mark left a changed +*email rendering its pre-save value. */
  expiryNames?: string[];
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
  /** params[:card][:subcards]["+*email"] etc. — the subcard-hash grammar
   *  the captured sign-in form posts (card[subcards][+*email][content]).
   *  Only the *signin update consumes these (the :signin event); general
   *  subcard saves remain unported. */
  subcards: Record<string, Record<string, string>>;
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
  /** params[:attachment_upload] — the two-step upload's preliminary flag
   *  (card-mod-carrierwave 00_upload_cache.rb:80-82 `preliminary_upload?
   *  = Card::Env.params[:attachment_upload]`): the JS editor's fileupload
   *  formData posts it beside the file part (upload.js.coffee:10-17). The
   *  value names the posted card hash ("card[file]"), which
   *  cached_upload_card_name gsubs into the preview's hidden-input name
   *  (file.rb:144-146). */
  attachmentUpload?: string;
  /** params[:draft] — `Env.params["draft"] == "true"` reads it
   *  (mod/core/set/all/content.rb:20-22), the autosave POST's flag
   *  (card-mod-edit-0.20.0 assets/script/autosave.js.coffee:20 posts
   *  'draft': 'true' alongside the serialized form). */
  draft?: string;
  /** params[:recaptcha_token] — the event :recaptcha input
   *  (card-mod-recaptcha set/all/recaptcha.rb:41-44, 57-66; the grecaptcha
   *  v3 token the recaptcha_token hidden field posts, recaptcha.rb:75-83). */
  recaptchaToken?: string;
  /** params[:look_in_trash] — Card.uri_fetch's trash switch
   *  (card-1.110.0 lib/card/fetch/card_class.rb:118-122). */
  lookInTrash?: boolean;
  /** params[:revert_actions] / params[:revert_to] / params[:revert_act] —
   *  the :rollback_actions event's inputs (card-mod-history
   *  set/all/history/revision.rb actions_to_revert, process_revert_actions). */
  revertActions?: string[];
  revertTo?: string;
  revertAct?: string;
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
  const subMatch = /^card\[subcards\]\[([^\]]+)\]\[([^\]]+)\]$/.exec(key);
  if (subMatch !== null) {
    const slot = (parsed.subcards[subMatch[1]] ??= {});
    slot[subMatch[2]] = value;
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
  else if (key === "attachment_upload") parsed.attachmentUpload = value;
  else if (key === "simulate_xhr") parsed.simulateXhr = value !== "";
  else if (key === "comment") parsed.comment = value;
  else if (key === "comment_author") parsed.commentAuthor = value;
  else if (key === "draft") parsed.draft = value;
  else if (key === "recaptcha_token") parsed.recaptchaToken = value;
  else if (key === "look_in_trash") parsed.lookInTrash = value !== "" && value !== "false";
  else if (key === "revert_actions[]" || key === "revert_actions") {
    (parsed.revertActions ??= []).push(value);
  } else if (key === "revert_to") parsed.revertTo = value;
  else if (key === "revert_act") parsed.revertAct = value;
}

/** The query-string parameters, applied before the body's so a body
 *  parameter of the same name wins (Rails request.parameters merges
 *  query_parameters, then request_parameters). */
function applyQuery(parsed: ParsedBody, search: string | undefined): ParsedBody {
  if (search === undefined || search === "" || search === "?") return parsed;
  const fromQuery = emptyParsedBody();
  for (const [key, value] of new URLSearchParams(search).entries()) {
    applyParam(fromQuery, key, value);
  }
  return {
    ...fromQuery,
    ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)),
    card: { ...fromQuery.card, ...parsed.card },
    subcards: { ...fromQuery.subcards, ...parsed.subcards },
    success: { ...fromQuery.success, ...parsed.success },
    cardFiles: parsed.cardFiles,
  } as ParsedBody;
}

function emptyParsedBody(): ParsedBody {
  return { card: {}, subcards: {}, success: {}, cardFiles: {} };
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
    return {
      card,
      subcards: {},
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

/** A write or sign-in refused by the same-origin check: 403, the class Ruby
 *  uses for a forbidden action (error.rb:103-105). The reason is logged by
 *  hosts that log responses; the visitor sees a plain explanation. */
function crossOriginResponse(json: boolean, reason: string): WriteRouteResponse {
  const message = `${CROSS_ORIGIN_MESSAGE} (${reason})`;
  return json
    ? jsonResponse(403, { error: { code: "cross-origin", message } })
    : htmlResponse(403, "Error (cross-origin)", `<pre>${escapeHtml(message)}</pre>`);
}

function errorResponse(json: boolean, error: CardActionError): WriteRouteResponse {
  const status = errorStatus(error.code);
  return json
    ? jsonResponse(status, { error: { code: error.code, message: error.message } })
    : htmlResponse(status, `Error (${error.code})`, cardErrorAlertHtml(error));
}

/** The errors view's alert bytes (card-mod-format set/all/html/error.rb:54-66
 *  view :errors + :120-127 standard_errors + layout/set/all/alert.rb:7-25):
 *  `alert "warning", true` = the dismissible bootstrap warning alert with
 *  the card-error-msg class_up, the btn-close button, the
 *  "Problems with <card name>" h4 heading (t :format_problems_name) and one
 *  `<p><strong>KEY:</strong> message</p>` per error (:132-133
 *  standard_error_message). The ajax save's 422 body lands in the form's
 *  card-notice (the slotter JS), so these bytes are the whole observable
 *  difference. */
function cardErrorAlertHtml(error: CardActionError): string {
  // standard_error_message splits the shown key from the message at the
  // first ": " — but ONLY for the throw sites that compose "<KEY>:
  // <message>" deliberately (userMessage). A bare message renders whole
  // (splitting an arbitrary message at its first colon would eat half of
  // it into the strong tag).
  const shown = error.userMessage ?? error.message;
  const sep = error.userMessage !== undefined ? shown.indexOf(": ") : -1;
  const key = sep > 0 ? shown.slice(0, sep) : undefined;
  const message = sep > 0 ? shown.slice(sep + 2) : shown;
  const heading =
    error.cardName !== undefined ? `Problems with ${escapeHtml(error.cardName)}` : undefined;
  return (
    `<div class="alert alert-warning alert-dismissible card-error-msg" role="alert">` +
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>` +
    (heading !== undefined ? `<h4 class="alert-heading error">${heading}</h4>` : "") +
    (key !== undefined
      ? `<p><strong>${escapeHtml(key)}:</strong> ${escapeHtml(message)}</p>`
      : `<p>${escapeHtml(message)}</p>`) +
    `</div>`
  );
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
  // The client's own scheme, so an https deck never redirects to http.
  return `${req.scheme ?? "http"}://${req.host}${path}`;
}

/** Ruby's cud_success for the PLAIN-form flavor (response.rb:25-33): the
 *  hard redirect — `hard_redirect success.to_url, 303` (:31), Location
 *  absolutized through card_url (:41). JSON keeps the API shape. */
function successResponse(
  req: WriteRouteRequest,
  json: boolean,
  name: string,
  saved: { cardId: number; actId: number; actionId: number; verb: WriteVerb },
  subcardNames: string[] | undefined,
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
      ...(subcardNames !== undefined && subcardNames.length > 0 ? { expiryNames: subcardNames } : {}),
    };
  }
  return {
    status: 303,
    headers: { Location: cardUrl(req, `/${locationName(name)}`), "Cache-Control": "no-store" },
    body: "",
    expiryName: name,
    ...(subcardNames !== undefined && subcardNames.length > 0 ? { expiryNames: subcardNames } : {}),
  };
}

/** The errors view's alert bytes for the *signin failure
 *  (set/self/signin.rb's authenticate_or_abort errors.add :signin — the
 *  recorded page shows the attribute key upcased, "SIGNIN:", ahead of the
 *  message): the same standard_errors shape cardErrorAlertHtml emits. */
function signinErrorAlertHtml(message: string): string {
  return (
    `<div class="alert alert-warning alert-dismissible card-error-msg" role="alert">` +
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>` +
    `<h4 class="alert-heading error">Problems with *signin</h4>` +
    `<p><strong>SIGNIN:</strong> ${escapeHtml(message)}</p>` +
    `</div>`
  );
}

/** The URL form of a card name (decko location grammar: spaces -> "_"). */
function locationName(name: string): string {
  return encodeURIComponent(name.replace(/ /g, "_"));
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
  // signin.rb:46-48 abort_unless email/password — "email missing" /
  // "password missing" are failure aborts before any authentication.
  if (email === "" || password === "") {
    const message = email === "" ? "email missing" : "password missing";
    return json
      ? jsonResponse(422, { error: { code: "signin-failure", message } })
      : htmlResponse(422, "Error (signin-failure)", signinErrorAlertHtml(message));
  }
  const sessions = new SessionStore({ driver: ctx.driver });
  const outcome = await signinAccount(ctx.driver, sessions, email, password);
  if (!outcome.ok) {
    const message = outcome.message;
    return json
      ? jsonResponse(422, { error: { code: "signin-failure", message } })
      : htmlResponse(422, "Error (signin-failure)", signinErrorAlertHtml(message));
  }
  // *previous (signin.rb:171) -> previous_location -> "/" fresh
  // (location_history.rb:6-9); the session history stack itself is
  // unported (documented).
  const target = cardUrl(req, "/");
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
export function servingModEventRuntime(): Promise<ModEventRuntime> {
  servingModEventRuntimeSeat ??= (async () => {
    const [{ defaultDeckEventRuntime }] = await Promise.all([
      import("../card/mod-loader/default-mod-deck.js"),
    ]);
    return defaultDeckEventRuntime(WRITE_PATH_HOST);
  })();
  return servingModEventRuntimeSeat;
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
    parsed = applyQuery(parseBody(req), req.search);
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

  // Same-origin check (request-origin.ts; docs/SECURITY.md): every write
  // route and the sign-in action. A security divergence: Ruby checks nothing.
  const originVerdict = checkRequestOrigin(
    { headers: req.headers, host: req.host },
    ctx.originPolicy ?? defaultOriginPolicy(),
  );
  if (!originVerdict.ok) return crossOriginResponse(json, originVerdict.reason);

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
    modEvents: await servingModEventRuntime(),
    ...(ctx.recaptcha === undefined ? {} : { recaptcha: ctx.recaptcha }),
    ...(ctx.notifyTransport === undefined ? {} : { notifyTransport: ctx.notifyTransport }),
    ...(ctx.followMail === undefined ? {} : { followMail: ctx.followMail }),
  });

  // CardMount's mount argument: the card[<mount>] file part is the
  // file=/image= setter's argument (card_mount.rb:41-44). The deck's
  // attachment cardtypes carry exactly one mount each — `attachment :file`
  // (set/type/file.rb:1) / `attachment :image` (set/type/image.rb:1). A
  // file part under any other card-hash key is Ruby's unknown-attribute
  // error class; this surface reads only the two mounts (documented).
  const mount: "file" | "image" | undefined =
    parsed.cardFiles["file"] !== undefined
      ? "file"
      : parsed.cardFiles["image"] !== undefined
      ? "image"
      : undefined;
  const attachmentInput = mount !== undefined ? parsed.cardFiles[mount] : undefined;
  const attachment: AttachmentInput | undefined = attachmentInput === undefined
    ? undefined
    : {
        bytes: attachmentInput.bytes,
        originalFilename: attachmentInput.filename,
        declaredContentType: attachmentInput.contentType,
      };

  try {
    // THE TWO-STEP UPLOAD's preliminary arm (00_upload_cache.rb:8-25
    // prepare_attachment, when preliminary_upload?): a card save whose
    // request carries params[:attachment_upload] beside a file part stores
    // the file + one draft action and ABORTS :success with the
    // preview_editor view of the cache card (new card) or the card itself
    // (update) — the ajax response decko.js's doneFile swaps into
    // .chosen-file. The abort happens at :prepare_to_validate, so no full
    // save runs: this arm answers before the create/update dispatch below.
    if (
      parsed.attachmentUpload !== undefined &&
      parsed.attachmentUpload !== "" &&
      attachment !== undefined &&
      (route.verb === "create" || route.verb === "update")
    ) {
      return await handlePreliminaryUpload(ctx, engine, route, parsed, attachment, mount);
    }
    let result: ActionResult | null;
    let name: string;
    if (route.verb === "create") {
      const input = {
        ...createInputFromParams(route, parsed, attachment),
        // the preview's hidden input (00_upload_cache.rb:2's
        // attr_accessor, reached through Rails assign_attributes): the
        // final save's cached-upload action id (00_upload_cache.rb:27-34
        // assign_attachment_on_create, when save_preliminary_upload?).
        ...(cachedUploadActionParam(parsed) !== undefined
          ? { actionIdOfCachedUpload: cachedUploadActionParam(parsed) }
          : {}),
        comment: parsed.comment,
        commentAuthor: parsed.commentAuthor,
        recaptchaToken: parsed.recaptchaToken,
      };
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
      // THE CARD IS THE MARK (rest.rb's update action fetches the card the
      // URL names); a card-hash name is the RENAME argument (name_events.rb),
      // not the fetch key. Resolving by the hash name first turned every
      // rename into an update-of-a-new-card CREATE (the rename form posts
      // card[name]="Phrase One" against /update/Phrase_1 and the engine
      // created Phrase One instead of renaming Phrase 1). The mark resolves
      // the card; the hash name resolves only when the request names no mark.
      const resolveName = markName ?? hashName;
      const reverting =
        (parsed.revertActions !== undefined && parsed.revertActions.length > 0) ||
        (parsed.revertAct !== undefined && parsed.revertAct !== "");
      // look_in_trash (uri_fetch): a trashed card is fetched as itself, not
      // as a new card. The history pane's revert requests send it.
      const trashedTarget =
        parsed.lookInTrash === true ? await lookupTrashedCard(ctx.fetcher, resolveName) : undefined;
      const existing = (await lookupLiveCard(ctx.fetcher, resolveName)) ?? trashedTarget;
      if (existing !== undefined && reverting) {
        // :rollback_actions (card-mod-history set/all/history/events.rb:40-46)
        // replaces the update with the revisions the request names.
        result = await engine.revertActions({
          cardId: existing.id,
          actionIds: parsed.revertActions,
          actId: parsed.revertAct,
          revertToPrevious: parsed.revertTo === "previous",
        });
        name = result?.name?.s ?? updateName;
      } else if (existing === undefined) {
        // rest.rb:14-16 — update of a NEW card routes to CREATE (the fetch
        // builds the card from the params; trashed marks fetch as new and
        // the create path revives). The name rides the request's own
        // resolution: card-hash name when present, else the URL mark.
        const created = await engine.createCard({
          ...createInputFromParams(route, parsed, attachment),
          name: updateName,
          ...(cachedUploadActionParam(parsed) !== undefined
            ? { actionIdOfCachedUpload: cachedUploadActionParam(parsed) }
            : {}),
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
          ...(existing.trash ? { lookInTrash: true } : {}),
          ...(card["skip"] === "validate_renaming" ? { skipValidateRenaming: true } : {}),
          // card[skip] names an event the act skips (skip_and_trigger.rb);
          // the rename form's box sends update_referer_content.
          ...(card["skip"] !== undefined && card["skip"] !== "" ? { skip: [card["skip"]] } : {}),
          // card-hash name WINS over the URL mark (uri_fetch_opts) — a
          // card[name] on an update is the RENAME arg (name_events.rb).
          name: hashName !== undefined && hashName !== markName ? hashName : undefined,
          content: card["content"],
          typeName: card["type"],
          typeId:
            typeIdRaw !== undefined && /^\d+$/.test(typeIdRaw) ? Number(typeIdRaw) : undefined,
          attachment,
          ...(cachedUploadActionParam(parsed) !== undefined
            ? { actionIdOfCachedUpload: cachedUploadActionParam(parsed) }
            : {}),
          comment: parsed.comment,
          commentAuthor: parsed.commentAuthor,
          recaptchaToken: parsed.recaptchaToken,
          // the edit form's :conflict_tracker hidden field
          // (card-mod-edit-0.20.0 set/all/form.rb:27-31) - the stale-revision
          // value detect_conflict validates (card-mod-history
          // set/all/history/events.rb:19-22, when: :edit_conflict?).
          lastActionIdBeforeEdit: card["last_action_id_before_edit"],
          // the structured form's field subcards
          // (card[subcards][+summary][content], subcards.rb) save in this
          // act: missing subcards created, existing ones updated.
          subcards: subcardInputsFromParams(parsed),
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
        throw new CardActionError("not-found", `no such card: ${markName}`);
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
    // The success target (Card::Env::Success): success[mark] names another
    // card ("_self", the default, is the saved card), success[view] the view.
    const successMark = parsed.success["mark"];
    const successName =
      successMark !== undefined && successMark !== "" && !successMark.startsWith("_") ? successMark : name;
    // redirect_cud_success: success[redirect] other than "soft" is the hard
    // redirect, which an ajax request receives as {redirect: url} so the
    // page itself navigates (response.rb hard_redirect) — the new-card
    // form's data-main-success path.
    // Every card the save persisted: the mark (name) plus each posted
    // subcard's full name (subcards.rb — each saves as its own card with
    // its own post-commit expire). The host render-map expiry walks this
    // list so a changed subcard (the account form's +*email) never
    // renders its pre-save value.
    const subcardExpiryNames = Object.keys(parsed.subcards)
      .filter((slot) => slot.startsWith("+"))
      .map((slot) => `${name}${slot}`);
    const redirect = parsed.success["redirect"];
    if (!json && isAjax(req, parsed) && redirect !== undefined && redirect !== "" && redirect !== "soft") {
      return {
        ...jsonResponse(200, { redirect: cardUrl(req, `/${locationName(successName)}`) }),
        expiryName: name,
        expiryNames: subcardExpiryNames,
      };
    }
    if (!json && isAjax(req, parsed) && ctx.renderSlot !== undefined) {
      const slotHtml = await ctx.renderSlot(successName, parsed.success["view"] || undefined, subcardExpiryNames);
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
        expiryNames: subcardExpiryNames,
      };
    }
    return successResponse(req, json, name, saved, subcardExpiryNames);
  } catch (error) {
    if (error instanceof CardActionError) return errorResponse(json, error);
    throw error;
  }
}

/** card[action_id_of_cached_upload] — the preview_editor hidden input the
 *  swapped-in preview posts back with the final save
 *  (00_upload_cache.rb:2's attr_accessor; save_preliminary_upload? reads
 *  it, :84-86). A subcard-scoped variant
 *  (card[subcards][+x][action_id_of_cached_upload]) stays unported with the
 *  rest of the general subcard grammar (the module header's documented
 *  remainder; the journeys' forms post the top-level name only). */
function cachedUploadActionParam(parsed: ParsedBody): string | undefined {
  const value = parsed.card["action_id_of_cached_upload"];
  return value !== undefined && value !== "" ? value : undefined;
}

/** The preliminary upload arm (00_upload_cache.rb:8-25 prepare_attachment):
 *  store the uploaded bytes, file the draft action, and answer the
 *  preview_editor html the JS editor swaps into .chosen-file
 *  (upload.js.coffee:48-51). Ruby's abort :success skips the rest of the
 *  save — no cards row, no finalize, and the draft's ACT stays card_id
 *  NULL (the oracle rows pin it: upload-remove-preview-admin carries one
 *  act beside the draft action filed on the cache card). */
async function handlePreliminaryUpload(
  ctx: WriteRouteContext,
  engine: CardActionEngine,
  route: RouteMatch,
  parsed: ParsedBody,
  attachment: AttachmentInput,
  mount: "file" | "image" | undefined,
): Promise<WriteRouteResponse> {
  if (mount === undefined) {
    // validate_file_exist's shape: a mount-typed save without an upload is
    // the "<mount> is missing" 422 (attachment.rb:26-34) — but this arm is
    // only entered WITH a file part (the caller's guard); unreachable.
    throw new CardActionError("field-required", `${route.verb} requires an upload`);
  }
  if (ctx.renderPreviewEditor === undefined) {
    // Loud, per the dual-path rule: a hosting surface without the render
    // seam must not silently fall through into the direct-save grammar.
    throw new Error(
      "the preliminary upload arm requires WriteRouteContext.renderPreviewEditor (the host's preview_editor render seam)",
    );
  }
  let cardId: number | undefined;
  let typeId: number;
  if (route.verb === "update") {
    if (route.mark === undefined) {
      throw new CardActionError("not-found", "no card name in request (no mark)");
    }
    const existing = await lookupLiveCard(ctx.fetcher, markToName(route.mark));
    if (existing === undefined) {
      throw new CardActionError("not-found", `no such card: ${markToName(route.mark)}`);
    }
    cardId = existing.id;
    if (existing.typeId === undefined) {
      throw new CardActionError("not-found", `card ${existing.id} carries no type`);
    }
    typeId = existing.typeId;
  } else {
    const typeIdRaw = parsed.card["type_id"];
    if (typeIdRaw === undefined || !/^\d+$/.test(typeIdRaw)) {
      // the editor's fileupload formData always posts card[type_id]
      // (upload.js.coffee:13, the #attachment_type_id value); without it
      // the save has no type — Ruby's Card.new(type_id: nil) would fail
      // validation, and no oracle shape reaches here.
      throw new CardActionError("type-unknown", "a preliminary upload requires card[type_id]");
    }
    typeId = Number(typeIdRaw);
  }
  const { actionId, cacheCardName, identifier, size, originalFilename } =
    await engine.recordPreliminaryUpload({
      ...(cardId !== undefined ? { cardId } : {}),
      typeId,
      mount,
      attachment,
    });
  // The success target (00_upload_cache.rb:19): the cache card (*new file /
  // *new image) for a new card's upload, the card itself for an update.
  const renderName = cardId !== undefined
    ? await lookupLiveCardName(ctx, cardId)
    : cacheCardName;
  if (renderName === undefined) {
    throw new CardActionError("not-found", "no *new cache card for the preliminary upload");
  }
  // The response renders the save's OWN post-draft state (Ruby renders the
  // in-memory success target: selected_action_id = the draft just filed —
  // the success hash's rev_id through select_action_by_params — and the
  // draft identifier as the selected content). The host hook expires the
  // name so its render engines see the draft rows this request wrote.
  const html = await ctx.renderPreviewEditor({
    name: renderName,
    opts: {
      // cached_upload_card_name (file.rb:144-146): the posted
      // attachment_upload value gsubbed to the hidden-input name.
      attachment_upload: parsed.attachmentUpload,
      original_filename: originalFilename,
      attachment_size: size,
      selected_action_id: actionId,
      cached_upload_identifier: identifier,
    },
  });
  return {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: html,
  };
}

/** The render target's name by id (the update arm renders the card
 *  itself). */
async function lookupLiveCardName(ctx: WriteRouteContext, cardId: number): Promise<string> {
  const record = await ctx.fetcher.fetchById(cardId);
  const name = record?.name?.s;
  if (name === undefined) throw new CardActionError("not-found", `no such card: ${cardId}`);
  return name;
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
    attachment,
    subcards: subcardInputsFromParams(parsed),
  };
}

/** params[:card][:subcards] as the action engine's SubcardInput map
 *  (subcards.rb): the structured-form and account fields the edit surface
 *  posts beside the main card (card[subcards][+summary][content] etc.).
 *  Only the keys the forms actually post are carried: content and type. */
function subcardInputsFromParams(parsed: ParsedBody): Record<string, SubcardInput> | undefined {
  const entries = Object.entries(parsed.subcards);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([slot, sub]) => [
      slot,
      {
        ...(sub.content !== undefined ? { content: sub.content } : {}),
        ...(sub.type !== undefined && sub.type !== "" ? { typeName: sub.type } : {}),
      } satisfies SubcardInput,
    ]),
  );
}

/** A trashed card by name — a look_in_trash fetch (retrieve.rb:31). Simple
 *  names match the stored key; a compound name matches the trashed junction
 *  of its two (live or trashed) parts. */
async function lookupTrashedCard(
  fetcher: FetchEngine,
  name: string,
): Promise<(CardRecord & { id: number }) | undefined> {
  const parsedName = DeckoName.parse(name);
  const driver = fetcher.driver;
  const pick = async (sql: string, params: unknown[]): Promise<number | undefined> => {
    const { rows } = await driver.query<{ id: number }>(sql, params);
    return rows[0] === undefined ? undefined : Number(rows[0].id);
  };
  const idOfKey = (key: string): Promise<number | undefined> =>
    pick("SELECT id FROM cards WHERE key = ? ORDER BY trash, id LIMIT 1", [key]);
  let id: number | undefined;
  if (parsedName.isSimple) {
    id = await pick("SELECT id FROM cards WHERE key = ? AND trash = 1 ORDER BY id DESC LIMIT 1", [
      parsedName.key,
    ]);
  } else if (parsedName.leftName !== undefined && parsedName.rightName !== undefined) {
    const resolve = async (part: DeckoName): Promise<number | undefined> =>
      part.isSimple ? idOfKey(part.key) : (await lookupTrashedOrLive(fetcher, part.s))?.id;
    const left = await resolve(parsedName.leftName);
    const right = await resolve(parsedName.rightName);
    if (left !== undefined && right !== undefined) {
      id = await pick(
        "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 1 ORDER BY id DESC LIMIT 1",
        [left, right],
      );
    }
  }
  if (id === undefined) return undefined;
  const { rows } = await driver.query<CardsRow>("SELECT * FROM cards WHERE id = ?", [id]);
  if (rows[0] === undefined) return undefined;
  return { ...(await composeCardRecord(rows[0], fetcher.lexicon)), id } as CardRecord & { id: number };
}

async function lookupTrashedOrLive(
  fetcher: FetchEngine,
  name: string,
): Promise<(CardRecord & { id: number }) | undefined> {
  return (await lookupLiveCard(fetcher, name)) ?? lookupTrashedCard(fetcher, name);
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
