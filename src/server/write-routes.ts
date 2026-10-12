// The HTTP write surface: card CREATE / UPDATE / DELETE over the
// CardActionEngine, cookie-or-token session auth, hard-redirect and
// soft-redirect responses. Lives as its own module so a host imports it
// with a two-line dispatch (and so the edits to the host's own server file
// never collide with it).
//
// URL grammar — the mounted card engine's routes:
//   POST   /                      -> create (the name rides params[:card][:name])
//   POST   /<mark>                -> create
//   POST   /type/<type>           -> create with type = <type>
//   PUT|PATCH /                   -> update (name from params[:card])
//   PUT|PATCH /<mark>             -> update
//   DELETE   /<mark>              -> delete
//   POST|PUT|PATCH (card)/update(/<mark>)   -> update
//   POST|PATCH     (card)/create(/<mark>)   -> create
//   DELETE         (card)/delete(/<mark>)   -> delete
// Mark resolution: the card-hash name wins over the URL mark; otherwise
// name = mark with "_" -> " ". A ".json" suffix is the format, not part of
// the name. UPDATE of a missing card routes to CREATE — the fetch builds a
// new card from the params when the mark resolves to nothing or to trash.
//
// NOT implemented, on purpose (documented remainder): the GET "explicit
// alternatives" — GETs that mutate stay off the surface; the general
// subcard update grammar (params[:card][:subcards]) is implemented ONLY on
// the *signin update (the :signin event, below).
//
// Multipart uploads: the edit form's file_chooser posts multipart/form-data
// to this same grammar — POST (PUT/PATCH) /update/<mark> with a
// card[<mount>] file part. The multipart body is parsed with the semantics
// in src/server/multipart-form.ts; the file part routes into the engine's
// attachment input; an attachment-typed create with no upload is rejected;
// the success/error responses stay the shared shapes documented below. The
// two-step preliminary upload flow (the editor's attachment_upload param,
// the new_file cache card, the preview_editor round trip) is NOT this
// surface: the direct file-part save is the path for existing cards and for
// creates without the cache detour.
//
// Auth — runs on EVERY request. The authenticators are the Authorization
// header first (`Token ...` / `Bearer ...`), else the token param, else the
// staging session cookie (SESSION_COOKIE_NAME — the cookie the /_signin
// surface issues). Unknown, expired or revoked credentials degrade to
// Anonymous; Anonymous writes are denied per the rules (403).
//
// CSRF — a SECURITY DIVERGENCE (docs/SECURITY.md, "Cross-site requests"):
// every write route and the sign-in action pass the same-origin check in
// request-origin.ts (Sec-Fetch-Site, then Origin, then Referer; requests
// carrying none of them are not from a browser page and pass), which
// refuses a cross-site form with 403 and changes no page bytes (no token).
// DECKO_ORIGIN_CHECK=off restores the upstream behaviour, which arms no
// forgery protection at all. The origin check needs no token, so
// same-origin token-less posts still go straight through to the action
// gates.
//
// Error shapes — the status vocabulary:
//   permission denied -> 403 (view :denial)
//   not found        -> 404
//   user error (validation) -> 422
// The engine's anonymous-actor rejection maps to 403 as well: anonymous
// writes are denied through the SAME ok? machinery. Unsupported views are
// user errors -> 422.
//
// Responses — non-JSON CUD success is a hard_redirect(url, 303) for the
// plain-form flavor, where the redirect URL is absolutized through card_url.
// The ajax flavor (X-Requested-With contains XMLHttpRequest, or
// params[:simulate_xhr]) defaults to the SOFT redirect and re-renders the
// saved card through `show` — 200 + the card's titled slot. An ajax HARD
// redirect answers JSON {redirect: url} instead; the *signin success path
// reproduces that branch because the signin form pins
// success[redirect]=true. JSON requests keep the API shape (200 + ids).

import type { SQLDatabaseDriver } from "./driver.js";
import type { NotifyTransport } from "../card/notify/types.js";
import type { FetchEngine } from "../card/fetch.js";
import { composeCardRecord, type CardRecord } from "../card/fetch/card-record.js";
import type { CardsRow } from "./schema.js";
import { SessionStore } from "../card/auth/index.js";
import { signinAccount } from "../card/auth/signin.js";
import {
  sendAccountVerificationToken,
  sendAccountWelcomeEmail,
  sendResetPasswordToken,
  type AccountFlowContext,
} from "../card/auth/account-verify-reset-flows.js";
import { createCardActionEngineForSession } from "../card/actions/engine-for-session.js";
import { CardActionError, type ActionResult, type AttachmentInput, type SubcardInput } from "../card/actions/types.js";
import type { CardActionRecaptchaConfig } from "../card/actions/card-action-engine.js";
import type { ModEventRuntime, ModEventStageReport } from "../card/mod-loader/mod-event-dispatch.js";
import type { ModEngineHost } from "../card/mod-loader/mod-manifest.js";
import type { AttachmentStore } from "../card/attachments/attachment-store.js";
import type { ScssCompiler } from "../card/assets/scss-compiler.js";
import type { CoffeeCompiler } from "../card/assets/coffee-compiler.js";
import { DeckoName } from "../card/name.js";
import { parseMultipartForm, type MultipartFilePart } from "./multipart-form.js";
import { decodeUriComponentSafe } from "./decode-uri-component-safe.js";
import {
  checkRequestOrigin,
  CROSS_ORIGIN_MESSAGE,
  defaultOriginPolicy,
  type OriginPolicy,
} from "./request-origin.js";
import {
  discardLocationsFor,
  previousLocation,
  readVisitorSession,
  saveLocation,
  storeSessionCardContent,
  visitorSessionCookie,
  type VisitorSession,
} from "../card/session/visitor-session.js";

/** One inbound write request, normalized off the node request. Header keys
 *  are lower-cased (node's convention). The body is the RAW bytes read by
 *  the caller (this module parses it per content type). */
export interface WriteRouteRequest {
  method: string;
  /** The URL pathname, percent-ENcoded as received (normalized: no
   *  trailing slashes). */
  pathname: string;
  /** The Host header (absolute redirect URLs). */
  host: string | undefined;
  /** The scheme the CLIENT used, derived by the host bridge from its own
   *  inbound evidence: the Request URL scheme on workerd (Cloudflare's is
   *  authoritative), URL scheme first then `x-forwarded-proto` on a
   *  TLS-terminating proxy — the same evidence that host's Secure-cookie
   *  decision consumes. Absent means http, preserved for every caller that
   *  does not derive the field (engine-level tests, scheme-less hosts). */
  scheme?: "http" | "https";
  /** The URL query string as received ("?a=1&b=2", or "" / absent). Query
   *  parameters merge into params beneath the body parameters (query first,
   *  body wins); the history pane's revert links carry their parameters here
   *  (revert_actions[], revert_to, revert_act, look_in_trash). */
  search?: string;
  headers: Record<string, string | undefined>;
  body: string;
  /** The RAW body bytes — required for multipart/form-data (binary file
   *  payloads a utf8 string corrupts; the utf8 `body` stays the transport
   *  for the urlencoded/JSON content types). Absent on a multipart request
   *  -> empty params (the caller's degenerate fallback). */
  bodyBytes?: Uint8Array;
}

/** Host-provided state: the storage seam, the fetch engine the write
 *  engines run through, and (optionally) a renderer for the ajax
 *  soft-redirect response. */
export interface WriteRouteContext {
  driver: SQLDatabaseDriver;
  fetcher: FetchEngine;
  now?: () => Date;
  /** client ip captured on card_acts; defaults to the X-Forwarded-For
   *  header, then "127.0.0.1". */
  ipAddress?: string;
  /** Renders one card's html view to a slot fragment — the host's render
   *  machinery for the ajax soft redirect. Absent -> ajax saves fall back
   *  to the hard redirect (documented deviation for host surfaces with no
   *  renderer; the staging server always provides it). */
  renderSlot?: (name: string, view?: string) => Promise<string>;
  /** The attachment storage seam, passed through to every write engine
   *  this module builds — the multipart upload surface stores bytes
   *  through it. Absent = attachment saves fail with the engine's
   *  programming-error rejection. */
  attachmentStore?: AttachmentStore;
  /** The Sass seam the style asset events compile with (skin and CSS asset
   *  inputs, the site stylesheet): LibSass on Node hosts
   *  (libsass-process.ts). Absent = saves that need a compile are refused
   *  with a named error. */
  scssCompiler?: ScssCompiler;
  /** The CoffeeScript seam the script asset events compile with (JavaScript
   *  / CoffeeScript asset inputs, the site script): the npm coffeescript
   *  package on Node hosts (coffee-npm-compiler.ts). Absent = saves that
   *  need a compile are refused with a named error. */
  coffeeCompiler?: CoffeeCompiler;
  /** The deck's file_storage config (undefined = the :local default) —
   *  validate_file_exist's web? arm and the storage-type resolution ride
   *  it. */
  fileStorage?: string;
  /** The recaptcha guard config, passed through UNCHANGED to every write
   *  engine this module builds. ABSENT = the guard off — the byte-identical
   *  unarmed behavior. The deck's event runtime itself rides EVERY save
   *  through the deck-boot seam (servingModEventRuntime below), and the
   *  :recaptcha event's guard reads THIS config at validate time (the
   *  engine's prepareRecaptchaSaveInput requires a configured site+secret
   *  pair before the walk), so an unarmed host never fires it.
   *  When the host supplies no captchaRuleContent, the engine defaults to
   *  the deck's own rule walk (ruleContentForCard); verify defaults to the
   *  real siteverify GET. */
  recaptcha?: CardActionRecaptchaConfig;
  /** The same-origin policy for writes and sign-in (request-origin.ts).
   *  Absent: from process.env, else enabled with no extra origins. */
  originPolicy?: OriginPolicy;
  /** Observer for every mod-event stage walk a save performs (the
   *  dispatcher's onReport: fired and skipped event names, in walk order).
   *  Diagnostics and the side-effects parity harness read event order
   *  through it. Absent = no observer; dispatch is unchanged either way. */
  onModEventReport?: (report: ModEventStageReport) => void;
  /** The account-mail seat: what the *signin update's
   *  send_reset_password_token trigger needs to build and send the reset
   *  email. Absent = the host sends no account mail, and the trigger
   *  answers the not-configured error instead of silently succeeding. */
  accountMail?: Omit<AccountFlowContext, "driver" | "fetcher" | "sessions">;
  /** Where save-path notifications go: the follower notification emails
   *  sent after a signed-in save (the engine's default follow-notify
   *  hook). Absent = the engine's default transport. */
  notifyTransport?: NotifyTransport;
}

export interface WriteRouteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** The saved card's name, set at the successful-mutation point
   *  (successResponse) on EVERY success flavor — JSON and HTML alike. The
   *  host's post-save cache expiry keys on this, never on the response's
   *  HTTP shape: expiry rides every committed save, and a JSON save commits
   *  exactly like an HTML one. Error responses leave it unset (no commit,
   *  no expiry). */
  expiryName?: string;
  /** The visitor-session cookie (card/session/visitor-session.ts) to set
   *  alongside any Set-Cookie header: the location history and Session-card
   *  content the write routes keep for a visitor — appended after any
   *  session cookie by the host. Present only when the request changed that
   *  state. */
  visitorCookie?: string;
}

/** Whether the host exposes the write path at all. The staging server
 *  boots its driver READONLY (pure browse) — writes stay off until ops
 *  boots writable with this flag set; unset keeps the historical 405s. */
export function writePathEnabled(): boolean {
  return process.env.DECKO_WRITE_PATH === "1";
}

// -----------------------------------------------------------------------
// session cookie — the transport half of cookie-session auth. The staging
// /_signin surface issues this cookie; the write path reads it for every
// session-less (cookie-only) write.
// -----------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "decko_ts_session";
// Mirrors SessionStore's DEFAULT_SESSION_TTL_SECONDS (48h) so the cookie
// and the server-side row expire together.
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
// params — the card hash and the top-level shortcuts
// -----------------------------------------------------------------------

interface ParsedBody {
  /** params[:card] — the Card.new/update! args. File-part values ride
   *  cardFiles, never this map (a text part under a mount name lands here
   *  as a string). */
  card: Record<string, string>;
  /** params[:card][:subcards]["+*email"] etc. — the first level of the
   *  subcard hash as flat fields: the sign-in form's grammar
   *  (card[subcards][+*email][content]), read by the :signin event. */
  subcards: Record<string, Record<string, string>>;
  /** params[:card][:subcards] at every depth: each entry's own fields and
   *  its nested subcards, in parameter order — a sign-up posts
   *  card[subcards][+*account][subcards][+*email][content]. */
  subcardTree: Record<string, ParsedSubcard>;
  /** params[:success] — the success hash (success[redirect], success[mark]). */
  success: Record<string, string>;
  /** The multipart FILE parts under the card hash, by mount name. */
  cardFiles: Record<string, MultipartFilePart>;
  /** params[:token] — an authenticator. */
  token?: string;
  /** params[:_method] — the form verb override. */
  methodOverride?: string;
  /** params[:simulate_xhr] — the ajax half. */
  simulateXhr?: boolean;
  /** params[:comment] / params[:comment_author] — the add_comment event's
   *  inputs. */
  comment?: string;
  commentAuthor?: string;
  /** params[:draft] — the autosave POST's flag. */
  draft?: string;
  /** params[:recaptcha_token] — the :recaptcha event's input: the grecaptcha
   *  v3 token the recaptcha_token hidden field posts. */
  recaptchaToken?: string;
  /** params[:look_in_trash] — the fetch's trash switch. */
  lookInTrash?: boolean;
  /** params[:revert_actions] / params[:revert_to] / params[:revert_act] —
   *  the :rollback_actions event's inputs. */
  revertActions?: string[];
  revertTo?: string;
  revertAct?: string;
  /** params[:attachment_upload] — the first step of a two-step upload: the
   *  file is stored as a draft and the request answers its action id. */
  attachmentUpload?: string;
}

/** The urlencoded/json key grammar every content type shares (the
 *  normalize-params walk over one ordered entry). */
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
  else if (key === "look_in_trash") parsed.lookInTrash = value !== "" && value !== "false";
  else if (key === "revert_actions[]" || key === "revert_actions") {
    (parsed.revertActions ??= []).push(value);
  } else if (key === "revert_to") parsed.revertTo = value;
  else if (key === "revert_act") parsed.revertAct = value;
  else if (key === "attachment_upload") parsed.attachmentUpload = value;
}

/** The query-string parameters, applied before the body's so a body
 *  parameter of the same name wins. */
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
    // The raw byte stream parsed to ordered parts; params assemble in order
    // with LAST-WINS scalar overwrite — the file_chooser's hidden
    // card[file]="" loses to the file part.
    if (req.bodyBytes === undefined) return emptyParsedBody();
    const parsed = emptyParsedBody();
    let parts: ReturnType<typeof parseMultipartForm>;
    try {
      parts = parseMultipartForm(req.bodyBytes, req.headers["content-type"] ?? "");
    } catch {
      // A malformed multipart body is a 500 class, not a card
      // validation — the host's error surface handles it.
      throw new Error("bad content body");
    }
    for (const part of parts) {
      if (part.kind === "file") {
        // The card-hash mount key: the disposition name is the full
        // "card[file]"/"card[image]" form; store under the UNWRAPPED mount
        // name the handler reads.
        const cardMatch = /^card\[(.+)\]$/.exec(part.name);
        parsed.cardFiles[cardMatch !== null ? cardMatch[1] : part.name] = part;
      } else {
        applyParam(parsed, part.name, part.value);
      }
    }
    // the FLAT params the comment box and the autosave POST ride applyParam
    // like the other top-level shortcuts (comment / comment_author /
    // draft, all outside card[...]).
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

/** The authenticators: `token_from_header || params[:token]` — the header
 *  grammar is `Token <value>` or `Bearer <value>`. */
function tokenFromRequest(req: WriteRouteRequest, parsed: ParsedBody): string | null {
  const authorization = req.headers["authorization"];
  if (authorization !== undefined) {
    const match = /^(?:Token|Bearer)\s+(.*)$/i.exec(authorization.trim());
    if (match !== null) {
      const value = match[1].trim();
      // `Token token="abc", opt=...` pair grammar — take the token= pair
      // when present.
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
  /** POST /type/<type> — the type shortcut. */
  typeShortcut?: string;
  /** The route's own JSON mode (the .json suffix). */
  json: boolean;
}

/** The route table, longest-prefix first. `card/read` and the GET
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
  // (card)/<verb>(/<mark>) — the "card/" prefix is OPTIONAL: POST
  // /update/<mark> is the shape every real edit form posts. When the prefix
  // is absent the mark is REQUIRED — a bare "/update" falls through to the
  // :mark routes below, which match a card literally named "update".
  // ":mark" stays single-segment (route segments never span "/").
  const explicitMatch = /^\/(card\/)?(create|update|delete)(?:\/([^/]+))?$/.exec(pathname);
  if (explicitMatch !== null) {
    const prefix = explicitMatch[1];
    const verb = explicitMatch[2] as WriteVerb;
    const mark = explicitMatch[3];
    if (prefix !== undefined || mark !== undefined) {
      if (verb === "create" && !(post || put)) return null; // post or patch
      if (verb === "update" && !(post || put)) return null; // post, put or patch
      if (verb === "delete" && !del) return null; // delete only
      return { verb, mark, json: false };
    }
  }
  if (post) {
    // ":mark" is ONE path segment — multi-segment marks are not routes
    // (no match -> 404).
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

/** Underscores in a mark are spaces; the .json format suffix is not part
 *  of the name. */
function markToName(mark: string): string {
  const withoutFormat = mark.replace(/\.json$/i, "");
  return decodeUriComponentSafe(withoutFormat).replace(/_/g, " ");
}

/** Method-override semantics: only a POST is overridable, and only to
 *  PATCH / PUT / DELETE (the verbs browser forms cannot send natively). */
function effectiveMethod(method: string, parsed: ParsedBody): string {
  if (method !== "POST") return method;
  const override = parsed.methodOverride?.trim().toUpperCase();
  if (override === "PATCH" || override === "PUT" || override === "DELETE") return override;
  return method;
}

/** Is this an ajax request? `X-Requested-With` contains XMLHttpRequest, or
 *  params[:simulate_xhr] is set. */
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

/** The status vocabulary: permission denied 403, not found 404, user error
 *  (validation) 422. anonymous-actor is the engine's permission denial. */
function errorStatus(code: CardActionError["code"]): number {
  if (code === "not-found") return 404;
  if (code === "server-error") return 500;
  if (code === "anonymous-actor" || code === "permission-denied") return 403;
  return 422;
}

/** A write or sign-in refused by the same-origin check: 403, the class for
 *  a forbidden action. The reason is logged by hosts that log responses;
 *  the visitor sees a plain explanation. */
function crossOriginResponse(json: boolean, reason: string): WriteRouteResponse {
  const message = `${CROSS_ORIGIN_MESSAGE} (${reason})`;
  return json
    ? jsonResponse(403, { error: { code: "cross-origin", message } })
    : htmlResponse(403, "Error (cross-origin)", `<pre>${escapeHtml(message)}</pre>`);
}

/** The loud denial's text: anonymous requests are asked to sign in or sign
 *  up; signed-in requests are told they need permission. The
 *  controller-level denial carries no denied task, hence "to do that". */
function denialText(signedIn: boolean): string {
  return signedIn
    ? "Sorry! You need permission to do that."
    : "Sorry! Please sign in or sign up to do that.";
}

/** The text the HTML error surface shows: the denial text for 403s, else
 *  the message when the throw site supplied one. */
function userFacingMessage(error: CardActionError, signedIn: boolean): string {
  if (errorStatus(error.code) === 403) return denialText(signedIn);
  return error.userMessage ?? error.message;
}

/** Deleting a card that does not exist: the fetch builds a NEW card for the
 *  mark, and deleting a new card is a bare user error (422), which the
 *  errors view shows under its class name. */
const MISSING_CARD_DELETE_MESSAGE = "USERERROR: Card::Error::UserError";

/** Whether the request's session resolves to a live account: the
 *  signed_in? test the denial text branches on. */
async function signedInFor(ctx: WriteRouteContext, sessionToken: string | null): Promise<boolean> {
  if (sessionToken === null) return false;
  return (await new SessionStore({ driver: ctx.driver }).lookupSession(sessionToken)) !== null;
}

/** The errors hash the JSON errors view reports: `{attribute => message}`,
 *  a later message for the same attribute replacing an earlier one. The
 *  throw site's explicit attribute map wins; otherwise the shown
 *  "KEY: message" lines are read back (the attribute is upcased for
 *  display; attributes are lower-case). Exported for the harness adapter's
 *  error payload mapping (same shape, same reading). */
export function rubyErrorsHash(error: CardActionError, signedIn: boolean): Record<string, string> {
  if (error.errorsByAttribute !== undefined) return { ...error.errorsByAttribute };
  // A denial without the rule walk's wording (the host write hook, a deck
  // without the anonymous card): still the :permission_denied key.
  if (errorStatus(error.code) === 403) return { permission_denied: error.message };
  // The captcha guard adds its message under :recaptcha.
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

/** The request's own URL: scheme, host, path. */
/** "YYYY-MM-DD HH:MM:SS UTC". */
function rubyUtcString(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** The request's own URL: scheme, host, path. */
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
    // The JSON errors view's page details: the errors hash plus url and
    // requested_at, pretty-generated.
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
 *  comment when the two differ (a quiet denial carries its reason the same
 *  way, inside a comment the visitor does not see). */
function diagnosticComment(error: CardActionError, signedIn: boolean): string {
  if (userFacingMessage(error, signedIn) === error.message) return "";
  return `<!-- ${escapeHtml(error.message).replace(/--/g, "&#45;&#45;")} -->`;
}

/** The bot account's email, or the seeded fallback address when the deck
 *  has no such row. Follower mail is sent from it. Exported for the harness
 *  adapter, whose direct CardActionEngine construction needs the same
 *  followMail wiring the serving engine gets below. */
export async function deckoBotAccountEmail(driver: SQLDatabaseDriver): Promise<string> {
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

/** HTML redirects to the card's location; JSON reloads (the caller
 *  re-fetches — the response carries the ids to reconcile). BOTH flavors
 *  carry expiryName: this is the successful-mutation point, and the save's
 *  cache expiry cannot depend on which response shape the request format
 *  produced (module header on WriteRouteResponse; a JSON flavor's missing
 *  Location header once let a deployed build serve a stale render). */
/** The deck origin, or the request's own scheme + host. Every redirect URL
 *  absolutizes through this, so live Location headers are absolute. */
function cardUrl(req: WriteRouteRequest, path: string): string {
  if (req.host === undefined || req.host === "") return path; // no Host: relative (documented degenerate case)
  // The client's own scheme, so an https deck never redirects to http.
  return `${req.scheme ?? "http"}://${req.host}${path}`;
}

/** The plain-form success flavor: the hard redirect, 303, with the Location
 *  absolutized through cardUrl. JSON keeps the API shape. */
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
    headers: { Location: absoluteTarget(req, redirectPath), "Cache-Control": "no-store" },
    body: "",
    expiryName: name,
  };
}

/** The URL form of a card name: the name's url_key, whose joint and key
 *  characters ("+", "*") stay literal; only characters a URL path cannot
 *  carry are percent-encoded. */
function locationName(name: string): string {
  return encodeURI(DeckoName.parse(name).urlKey).replace(/[?#]/g, (c) => encodeURIComponent(c));
}

/** A redirect target as the hard redirect sends it: a full URL as given
 *  (the location history stores request URLs), a path prefixed with the
 *  deck origin. */
function absoluteTarget(req: WriteRouteRequest, target: string): string {
  return /^https?:\/\//.test(target) ? target : cardUrl(req, target);
}

/** The success target path: success[mark] "*previous" -> the visitor's
 *  previous location (the location history); an absolute path or URL as
 *  given; another mark -> that card's path; no mark -> the request's own
 *  card. */
function successTargetPath(parsed: ParsedBody, ownName: string, visit: VisitorSession): string {
  const mark = parsed.success["mark"] ?? parsed.success["id"];
  if (mark === undefined) return `/${locationName(ownName)}`;
  if (mark === "") return "";
  if (mark === "*previous" || mark === ":previous") return previousLocation(visit);
  if (/^(http|\/)/.test(mark)) return mark;
  return `/${locationName(mark)}`;
}

// -----------------------------------------------------------------------
// the *signin update — the :signin event over the sign-in form grammar
// -----------------------------------------------------------------------

const SIGNIN_KEY = DeckoName.parse("*signin").key;

/** The sign-in form posts card[subcards][+*email][content] /
 *  [+*password][content] to /update/*signin with _method=patch and
 *  success[redirect]=true&success[mark]=*previous. The engine runs the
 *  :signin validation (authenticate_or_abort on the email and password
 *  fields), then signin_success aborts the save — no card/act rows — and
 *  the success path redirects to *previous, the location history's last
 *  entry, which initializes to "/".
 *  Response: the hard redirect 303 (plain form), or the ajax hard-redirect
 *  JSON {redirect: url}.
 *
 *  The failure ladder's message is surfaced as a user error 422. That
 *  branch has only been exercised by the tests, not against a live deck —
 *  disclosed as unverified. */
async function handleSigninUpdate(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  json: boolean,
  parsed: ParsedBody,
  visit: VisitorSession,
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
  // The send_reset_password_token trigger: the forgot-password form posts the
  // email with card[trigger]; the :signin event does not run.
  if (parsed.card["trigger"] === "send_reset_password_token") {
    return handleResetPasswordTrigger(ctx, req, json, parsed, email, fail);
  }
  // Blank fields abort before any authentication. The abort names the
  // attribute and the blank message ("email can't be blank"), with no
  // errors key.
  if (email === "" || password === "") {
    const field = email === "" ? "email" : "password";
    return fail(`${field} missing`, `${field} can't be blank`);
  }
  const sessions = new SessionStore({ driver: ctx.driver });
  const outcome = await signinAccount(ctx.driver, sessions, email, password);
  if (!outcome.ok) {
    // authenticate_or_abort adds the ladder message under :signin:
    // "SIGNIN: <message>".
    return fail(outcome.message, `SIGNIN: ${outcome.message}`);
  }
  // The success target: the form's success[mark]=*previous -> the previous
  // location; without a success mark the target is the card itself, *signin.
  const target = absoluteTarget(req, successTargetPath(parsed, "*signin", visit));
  if (isAjax(req, parsed)) {
    // the ajax hard redirect
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

/** The forgot-password trigger on the *signin update (event
 *  :send_reset_password_token): look the email up, send the reset email to
 *  an active account, and redirect to the success view the form asked for
 *  (success[view]; the form pins reset_password_success). Failures are
 *  errors on :email, shown as "EMAIL: <message>". */
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

/** Sign-out: DELETE /delete/*signin (event :signout, on: :delete — sign in
 *  nil, then abort :success so no card row is touched). The session is
 *  revoked, the cookie cleared, and the request redirected to the *signin
 *  card (the delete's success target is the card itself). Resetting the
 *  session drops the rest of the visitor's session too: the location
 *  history and Session-card content. */
async function handleSignout(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  json: boolean,
  parsed: ParsedBody,
  visit: VisitorSession,
): Promise<WriteRouteResponse> {
  const token = tokenFromRequest(req, parsed) ?? readSessionCookie(req.headers.cookie);
  if (token !== null) await new SessionStore({ driver: ctx.driver }).revokeSession(token);
  delete visit.history;
  visit.cards = {};
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
 *  composed ONCE per process — the single boot composition every save walks,
 *  the serving write path included.
 *
 *  The WRITE-PATH HOST: the only host member save-time event bodies reach
 *  is the integrate observers' fetchRenderCard (card-mod-integrate.ts
 *  observerLookupFromHost — the *on_<action> rule-card walk). The write
 *  path has no synchronous render-card surface, so the host answers
 *  undefined: zero event cards resolve, exactly as on a deck whose observer
 *  rule cards resolve nothing. Every OTHER member throws member-named loud:
 *  no save-time body uses them (they are the prepareEngine/install surfaces,
 *  served by the render path's modEngineHost), and a body reaching for one
 *  must fail loudly, never silently no-op. The dynamic import keeps an
 *  unarmed module graph exactly as before this host existed, and the cache
 *  means a deck composes the runtime at most one load per process. */
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

/** The serving runtime, with the type-set resolver and the host's
 *  stage-report observer attached. The shared runtime object is never
 *  mutated: an observed request gets a shallow copy carrying its own
 *  setMember/onReport. Exported (driver-scoped) so the harness adapter's
 *  direct engine construction composes the SAME runtime the serving write
 *  path builds — without the resolver, every type-scoped deck event (the
 *  Number cardtype's validate_number among them) skips "set-not-applicable"
 *  (mod-event-dispatch.ts set_condition_applies). */
export async function observedModEventRuntime(
  ctx: Pick<WriteRouteContext, "driver" | "onModEventReport">,
): Promise<ModEventRuntime> {
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
 *  codename (the set file's directory is the type's codename). Every other
 *  scoped pattern stays not-applicable. */
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
 * Per request: token-or-cookie -> session token, the *signin
 * subcard-update branch when the mark is *signin (the :signin event),
 * engine gate (the ok_to_* rule walk inside the CardActionEngine), save,
 * act rows, response (303 hard redirect / 200 soft-redirect slot / JSON).
 */
export async function handleWriteRequest(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  opts?: { authOnly?: boolean },
): Promise<WriteRouteResponse | null> {
  // The visitor's session state (location history, Session-card content):
  // read from its cookie, changed by the request, stored back only when it
  // changed.
  const visit = readVisitorSession(req.headers.cookie);
  const before = visitorSessionCookie(visit);
  const res = await dispatchWriteRequest(ctx, req, opts, visit);
  if (res === null) return null;
  if (visitorSessionCookie(visit) === before) return res;
  return { ...res, visitorCookie: visitorSessionCookie(visit, { secure: req.scheme === "https" }) };
}

async function dispatchWriteRequest(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
  opts: { authOnly?: boolean } | undefined,
  visit: VisitorSession,
): Promise<WriteRouteResponse | null> {
  // Response format: the .json suffix on the mark, or the Accept header.
  const json =
    (req.pathname !== "/" && /\.json$/i.test(req.pathname)) ||
    (req.headers["accept"] ?? "").includes("application/json");
  let parsed: ParsedBody;
  try {
    parsed = applyQuery(parseBody(req), req.search);
  } catch (error) {
    if (error instanceof CardActionError) {
      return errorResponse(json, error, false, { url: requestUrl(req), now: ctx.now?.() ?? new Date() });
    }
    throw error;
  }
  // Method override (POST + `_method` param rewrites the verb) — how real
  // FORMS reach the RESTful routes: an edit form POSTs `card/...` with a
  // hidden `_method=patch`.
  const method = effectiveMethod(req.method, parsed);

  const route = matchRoute(method, req.pathname);
  if (route === null) return null;

  // Same-origin check (request-origin.ts; docs/SECURITY.md): every write
  // route and the sign-in action. A security divergence — the upstream
  // engine checks nothing.
  const originVerdict = checkRequestOrigin(
    { headers: req.headers, host: req.host },
    ctx.originPolicy ?? defaultOriginPolicy(),
  );
  if (!originVerdict.ok) return crossOriginResponse(json, originVerdict.reason);

  // The *signin update IS the login action ("/update/:signin is the login
  // action") — before any card machinery runs.
  if (route.verb === "update" && route.mark !== undefined) {
    if (DeckoName.parse(markToName(route.mark)).key === SIGNIN_KEY) {
      return handleSigninUpdate(ctx, req, json, parsed, visit);
    }
  }
  // The AUTH-ONLY arm: everything below this line is CARD
  // CREATE/UPDATE/DELETE — the surface a deployment flag may lawfully
  // switch off. Sign-in is not a card write (the :signin event aborts the
  // save — no card/act rows — and only mints an auth_sessions row). A host
  // that wants auth alive while card writes stay off dispatches through
  // handleAuthOnlyRequest, which returns exactly this branch and nothing
  // else.
  if (opts?.authOnly === true) return null;

  // The *signin delete is the logout action (event :signout). It
  // stays behind the auth-only gate: disarmed hosts pin every delete route
  // against *signin as a gated card write.
  if (route.verb === "delete" && route.mark !== undefined) {
    if (DeckoName.parse(markToName(route.mark)).key === SIGNIN_KEY) {
      return handleSignout(ctx, req, json, parsed, visit);
    }
  }

  // authenticate: header/param token first, else the cookie session;
  // unresolvable = Anonymous.
  const sessionToken =
    tokenFromRequest(req, parsed) ?? readSessionCookie(req.headers.cookie);

  const engine = await createCardActionEngineForSession(ctx.fetcher, ctx.driver, sessionToken, {
    ipAddress: ctx.ipAddress ?? req.headers["x-forwarded-for"] ?? "127.0.0.1",
    now: ctx.now,
    attachmentStore: ctx.attachmentStore,
    ...(ctx.scssCompiler === undefined ? {} : { scssCompiler: ctx.scssCompiler }),
    ...(ctx.coffeeCompiler === undefined ? {} : { coffeeCompiler: ctx.coffeeCompiler }),
    fileStorage: ctx.fileStorage,
    // the deck's event runtime rides EVERY save (the deck-boot seam,
    // servingModEventRuntime above — boot composes all mods once and every
    // save walks the one event space). The recaptcha config
    // (WriteRouteContext.recaptcha) is the separate opt-in it always was:
    // the config passes through UNCHANGED — the engine's own defaults are
    // the rule walk and the real siteverify GET, and the :recaptcha event's
    // when-predicate reads the config the engine composes at validate time
    // (card-action-engine.ts prepareRecaptchaSaveInput), so an unarmed host
    // registers the event and still never fires the guard.
    modEvents: await observedModEventRuntime(ctx),
    ...(ctx.notifyTransport === undefined ? {} : { notifyTransport: ctx.notifyTransport }),
    followMail: {
      origin: cardUrl(req, ""),
      deckoBotEmail: ctx.accountMail?.deckoBotEmail ?? (await deckoBotAccountEmail(ctx.driver)),
    },
    ...(ctx.recaptcha === undefined ? {} : { recaptcha: ctx.recaptcha }),
    ...(ctx.notifyTransport === undefined ? {} : { notifyTransport: ctx.notifyTransport }),
  });

  // The card[<mount>] file part is the attachment setter's argument. The
  // deck's attachment cardtypes carry exactly one mount each — `attachment
  // :file` / `attachment :image`. A file part under any other card-hash key
  // is an unknown-attribute error; this surface reads only the two mounts
  // (documented).
  const attachmentInput =
    parsed.cardFiles["file"] ?? parsed.cardFiles["image"] ?? undefined;
  const attachment: AttachmentInput | undefined = attachmentInput === undefined
    ? undefined
    : {
        bytes: attachmentInput.bytes,
        originalFilename: attachmentInput.filename,
        declaredContentType: attachmentInput.contentType,
      };

  let signOutAfterDelete: { sessions: SessionStore; token: string } | undefined;
  try {
    let result: ActionResult | null;
    let name: string;
    if (route.verb === "create" && parsed.attachmentUpload !== undefined && attachment !== undefined) {
      // The first step of a two-step upload for a new card: the file is
      // cached and the response sends the uploader to the cache card's
      // preview_editor view for that draft (success target: the cache card
      // and the draft's rev_id).
      const typeName = parsed.card["type"] ?? route.typeShortcut ?? "";
      const typeRaw = parsed.card["type_id"];
      const typeId = typeRaw !== undefined && /^\d+$/.test(typeRaw)
        ? Number(typeRaw)
        : (await ctx.fetcher.fetchByKey(DeckoName.parse(typeName).key))?.id;
      if (typeId === undefined) throw new CardActionError("not-found", `no such cardtype: ${typeName}`);
      const mount = parsed.cardFiles["image"] !== undefined ? "image" : "file";
      const cached = await engine.recordPreliminaryUpload({ typeId, mount, attachment });
      const target = cached.cacheCardName ?? `*new ${mount}`;
      return successResponse(
        req,
        json,
        target,
        { cardId: 0, actId: 0, actionId: cached.actionId, verb: "create" },
        `/${locationName(target)}/preview_editor?rev_id=${cached.actionId}`,
      );
    }
    if (route.verb === "create") {
      const cachedUpload = parsed.card["action_id_of_cached_upload"] !== undefined
        ? await engine.cachedUploadAttachment(parsed.card["action_id_of_cached_upload"], {
            mount: (await ctx.fetcher.fetchByKey(DeckoName.parse(parsed.card["type"] ?? "").key))?.codename === "image"
              ? "image"
              : "file",
          })
        : undefined;
      const input = {
        ...createInputFromParams(route, parsed, cachedUpload?.attachment ?? attachment),
        comment: parsed.comment,
        commentAuthor: parsed.commentAuthor,
        recaptchaToken: parsed.recaptchaToken,
      };
      if (await isSessionTypeCreate(ctx.fetcher, input)) {
        // A Session-cardtype create: ok_to_create? is true for
        // everyone, and store_in_session keeps the content in the visitor's
        // session and aborts with success, so nothing reaches the card
        // tables. The content is kept in the visitor session under the
        // card's key.
        storeSessionCardContent(visit, input.name, input.content);
        return successResponse(
          req,
          json,
          input.name,
          { cardId: 0, actId: 0, actionId: 0, verb: "create" },
          successTargetPath(parsed, input.name, visit),
        );
      }
      result = await engine.createCard(input);
      name = result.name?.s ?? input.name;
      await cachedUpload?.release();
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
      // The card is fetched by the URL mark when there is one; card[name] is
      // then the rename argument. Looking up by card[name] instead would
      // land a rename-onto-an-existing-name on the OTHER card as a no-op.
      const reverting =
        (parsed.revertActions !== undefined && parsed.revertActions.length > 0) ||
        (parsed.revertAct !== undefined && parsed.revertAct !== "");
      // look_in_trash: a trashed card is fetched as itself, not as a new
      // card. The history pane's revert requests send it.
      const trashedTarget =
        parsed.lookInTrash === true ? await lookupTrashedCard(ctx.fetcher, markName ?? updateName) : undefined;
      const existing = (await lookupLiveCard(ctx.fetcher, markName ?? updateName)) ?? trashedTarget;
      const trigger = card["trigger"];
      if (existing !== undefined && reverting) {
        // :rollback_actions replaces the update with the revisions the
        // request names.
        result = await engine.revertActions({
          cardId: existing.id,
          actionIds: parsed.revertActions,
          actId: parsed.revertAct,
          revertToPrevious: parsed.revertTo === "previous",
        });
        name = result?.name?.s ?? updateName;
      } else if (
        existing !== undefined &&
        (trigger === "approve_with_verification" || trigger === "approve_without_verification") &&
        (await typeCodenameOf(ctx.fetcher, existing.typeId)) === "signup"
      ) {
        name = existing.name?.s ?? updateName;
        result = await approveSignup(ctx, engine, existing.id, name, trigger === "approve_with_verification");
      } else if (
        existing !== undefined &&
        trigger === "use_as_current_skin" &&
        (await typeCodenameOf(ctx.fetcher, existing.typeId)) === "bootswatch_skin"
      ) {
        // use_as_current_skin: the skin's own save changes nothing (its act
        // stays empty) and the event saves the *all+*style rule with the
        // skin's name, inside that act.
        name = existing.name?.s ?? updateName;
        await engine.assertMayUpdate(existing.id);
        const style = await lookupLiveCard(ctx.fetcher, "*all+*style");
        if (style === undefined) throw new CardActionError("not-found", "no *all+*style rule card");
        result = await engine.updateCard({ cardId: style.id, content: name, withinOtherAct: true });
      } else if (existing === undefined) {
        // update of a NEW card routes to CREATE (the fetch builds the card
        // from the params; trashed marks fetch as new and the create path
        // revives). The name rides the request's own resolution: card-hash
        // name when present, else the URL mark.
        const created = await engine.createCard({
          ...createInputFromParams(route, parsed, attachment),
          name: updateName,
          comment: parsed.comment,
          commentAuthor: parsed.commentAuthor,
          recaptchaToken: parsed.recaptchaToken,
        });
        name = created.name?.s ?? updateName;
        result = created;
      } else if (parsed.attachmentUpload !== undefined && attachment !== undefined) {
        // The first step of a two-step upload for an existing card: a draft
        // action holds the new file; the card itself is unchanged.
        name = existing.name?.s ?? updateName;
        const mount = parsed.cardFiles["image"] !== undefined ? "image" : "file";
        const cached = await engine.recordPreliminaryUpload({
          cardId: existing.id,
          typeId: existing.typeId ?? 0,
          mount,
          attachment,
        });
        return successResponse(
          req,
          json,
          name,
          { cardId: existing.id, actId: 0, actionId: cached.actionId, verb: "update" },
          `/${locationName(name)}/preview_editor?rev_id=${cached.actionId}`,
        );
      } else {
        const typeIdRaw = card["type_id"];
        const cachedUpload = card["action_id_of_cached_upload"] !== undefined
          ? await engine.cachedUploadAttachment(card["action_id_of_cached_upload"], {
              cardId: existing.id,
              mount: (await typeCodenameOf(ctx.fetcher, existing.typeId)) === "image" ? "image" : "file",
            })
          : undefined;
        result = await engine.updateCard({
          cardId: existing.id,
          ...(existing.trash ? { lookInTrash: true } : {}),
          ...(card["skip"] === "validate_renaming" ? { skipValidateRenaming: true } : {}),
          // card[skip] names an event the act skips; the rename form's
          // box sends update_referer_content.
          ...(card["skip"] !== undefined && card["skip"] !== "" ? { skip: [card["skip"]] } : {}),
          // card-hash name WINS over the URL mark — a card[name] on an
          // update is the RENAME argument.
          name: hashName !== undefined && hashName !== markName ? hashName : undefined,
          content: card["content"],
          typeName: card["type"],
          typeId:
            typeIdRaw !== undefined && /^\d+$/.test(typeIdRaw) ? Number(typeIdRaw) : undefined,
          attachment: cachedUpload?.attachment ?? attachment,
          comment: parsed.comment,
          commentAuthor: parsed.commentAuthor,
          recaptchaToken: parsed.recaptchaToken,
          // the edit form's conflict_tracker hidden field — the stale-revision
          // value detect_conflict validates (when: the edit-conflict check).
          lastActionIdBeforeEdit: card["last_action_id_before_edit"],
          // params[:draft] == "true" is the autosave POST's flag.
          draft: parsed.draft === "true",
        });
        await cachedUpload?.release();
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
// signout_upon_delete (the integrate stage, when: current_account?):
        // closing your own account signs you out. The upstream event names a
        // constant that does not exist, the integrate stage swallows the
        // NameError, and the closed account stays signed in; this signs out
        // as the event intends (a deliberate difference).
      const accountCodenameId = await ctx.fetcher.codenames.id("account");
      if (
        sessionToken !== null &&
        accountCodenameId !== undefined &&
        existing.rightId === accountCodenameId &&
        existing.leftId !== null &&
        existing.leftId !== undefined
      ) {
        const sessions = new SessionStore({ driver: ctx.driver });
        const actor = await sessions.lookupSession(sessionToken);
        if (actor !== null && actor.id === existing.leftId) signOutAfterDelete = { sessions, token: sessionToken };
      }
      result = await engine.deleteCard({
        cardId: existing.id,
        // params[:recaptcha_token] — the :recaptcha event's input rides every
        // save verb (the guard has no verb restriction, and trash makes the
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

    // The ajax soft redirect: the ajax flavor defaults to "soft" — re-render
    // the saved card through `show` and answer 200 + the rendered slot.
    // JSON requests keep the API shape.
    // The success target: success[mark] names another card ("_self", the
    // default, is the saved card), success[view] the view.
    const successMark = parsed.success["mark"];
    const successName =
      successMark !== undefined && successMark !== "" && !successMark.startsWith("_") ? successMark : name;
    // success[redirect] other than "soft" is the hard redirect, which an ajax
    // request receives as {redirect: url} so the page itself navigates —
    // the new-card form's data-main-success path.
    const redirect = parsed.success["redirect"];
    if (!json && isAjax(req, parsed) && redirect !== undefined && redirect !== "" && redirect !== "soft") {
      return {
        ...jsonResponse(200, { redirect: cardUrl(req, `/${locationName(successName)}`) }),
        expiryName: name,
      };
    }
    if (!json && isAjax(req, parsed) && ctx.renderSlot !== undefined) {
      const slotHtml = await ctx.renderSlot(successName, parsed.success["view"] || undefined);
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
    // discard_deleted_locations: a deleted card leaves the visitor's location
    // history, and a non-ajax delete is sent to the previous location; other
    // saves go to the success target.
    if (saved.verb === "delete") discardLocationsFor(visit, name);
    const redirectPath = saved.verb === "delete" && parsed.success["mark"] === undefined
      ? previousLocation(visit)
      : successTargetPath(parsed, name, visit);
    const response = successResponse(req, json, name, saved, redirectPath);
    if (signOutAfterDelete !== undefined) {
      await signOutAfterDelete.sessions.revokeSession(signOutAfterDelete.token);
      delete visit.history;
      visit.cards = {};
      return { ...response, headers: { ...response.headers, "Set-Cookie": clearedSessionCookieHeader() } };
    }
    return response;
  } catch (error) {
    if (error instanceof CardActionError) {
      // An error page renders the request's card, and a known card's page view
      // joins the location history like any other (the save-current-location
      // event fires before the error page renders): the request URL is saved
      // for HTML, non-ajax requests on an existing card.
      if (!json && !isAjax(req, parsed) && route.mark !== undefined) {
        const shown = await lookupLiveCard(ctx.fetcher, markToName(route.mark));
        if (shown !== undefined && shown.codename !== "signin") saveLocation(visit, requestUrl(req));
      }
      return errorResponse(json, error, await signedInFor(ctx, sessionToken), {
        url: requestUrl(req),
        now: ctx.now?.() ?? new Date(),
      });
    }
    throw error;
  }
}

/** The AUTH-ONLY dispatch: the login action and NOTHING else. Resolves to
 *  handleSigninUpdate for POST /update/*signin (both the HTML 303 flavor and
 *  the .json/ajax flavor), null for every other method/path — including a
 *  card-hash update that merely NAMES *signin, a delete/put spoof against
 *  it, and every create/delete route. The caller (the Workers surface's
 *  disarmed arm, the edge surface's disarmed arm) answers its own
 *  write-path-off response when this returns null, so card writes keep the
 *  exact gating they had. */
export async function handleAuthOnlyRequest(
  ctx: WriteRouteContext,
  req: WriteRouteRequest,
): Promise<WriteRouteResponse | null> {
  return handleWriteRequest(ctx, req, { authOnly: true });
}

/** Card params for CREATE: the card hash wins; the mark fills the name;
 *  the /type/<type> shortcut fills the type unless the hash set one. The
 *  card[<mount>] file part rides as the attachment input — attaching resets
 *  content, which the engine's attachment handling models. */
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
    // A create with no name is a validation error -> 422.
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

/** Whether the create names the Session cardtype (by name or id). */
async function isSessionTypeCreate(
  fetcher: FetchEngine,
  input: { typeName?: string; typeId?: number },
): Promise<boolean> {
  const type = input.typeId !== undefined
    ? await fetcher.fetchById(input.typeId)
    : input.typeName !== undefined
      ? await fetcher.fetchByName(input.typeName)
      : undefined;
  return type !== undefined && !type.trash && type.codename === "session";
}

/** request_verification: a sign-up its creator can approve starts
 *  "unverified", and the account's send_verification_email event mails the
 *  verification link at :integrate. The engine wrote the status; this sends
 *  the mail through the host's account-mail seat. */
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

/** The codename of a card's type card ("" when it has none). */
async function typeCodenameOf(fetcher: FetchEngine, typeId: number | null | undefined): Promise<string> {
  if (typeId === null || typeId === undefined) return "";
  return (await fetcher.fetchById(typeId))?.codename ?? "";
}

/** An administrator's approval of a pending sign-up (the "Send verification
 *  email" and "Approve without verification" links of the sign-up's
 *  verification_links view).
 *
 *  Both are update saves of the Sign up card carrying card[trigger]. The
 *  validate stage judges ok?(:update) first; a denied approval then reaches
 *  the event's abort(:failure), which reports the card's permission error
 *  as a plain user error (422, "PERMISSION_DENIED: ..."), not as the 403
 *  denial page. `approvable` requires can_approve? (the actor may create a
 *  User), else aborts "illegal approval".
 *
 *  with verification: request_verification sets +*account+*status to
 *  "unverified" and triggers send_verification_email;
 *  without: activate_accounted makes the card a User, and activate_account
 *  sets the status "active" and triggers send_welcome_email. */
async function approveSignup(
  ctx: WriteRouteContext,
  engine: Awaited<ReturnType<typeof createCardActionEngineForSession>>,
  cardId: number,
  name: string,
  withVerification: boolean,
): Promise<ActionResult | null> {
  try {
    await engine.assertMayUpdate(cardId);
  } catch (error) {
    if (error instanceof CardActionError && error.code === "permission-denied") {
      const message = error.errorsByAttribute?.["permission_denied"] ?? `You don't have permission to update ${name}`;
      throw new CardActionError("user-error", error.message, `PERMISSION_DENIED: ${message}`, {
        permission_denied: message,
      });
    }
    throw error;
  }
  // The accounted cardtype: the User cardtype.
  const accountedTypeId = await ctx.fetcher.codenames.id("user");
  if (accountedTypeId === undefined || !(await engine.mayCreateCardOfType(accountedTypeId))) {
    throw new CardActionError("user-error", "illegal approval", "ABORT: illegal approval");
  }
  const accountMail = ctx.accountMail;
  const flow = accountMail === undefined
    ? undefined
    : { ...accountMail, driver: ctx.driver, fetcher: ctx.fetcher, sessions: new SessionStore({ driver: ctx.driver }) };
  return engine.updateCard({
    cardId,
    ...(withVerification ? {} : { typeId: accountedTypeId }),
    subcards: {
      "+*account": { subcards: { "+*status": { content: withVerification ? "unverified" : "active" } } },
    },
    triggeredIntegrate: async () => {
      if (flow === undefined) return;
      if (withVerification) await sendAccountVerificationToken(flow, `${name}+*account`);
      else await sendAccountWelcomeEmail(flow, `${name}+*account`);
    },
  });
}

/** The request's subcard tree as the engine's subcard input: content, type
 *  and nested subcards per entry. */
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

/** A trashed card by name — a look_in_trash fetch. Simple names match the
 *  stored key; a compound name matches the trashed junction of its two
 *  (live or trashed) parts. */
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
