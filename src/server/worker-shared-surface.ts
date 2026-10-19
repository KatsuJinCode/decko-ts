// The shared surface of the TWO Workers entries: worker.ts (the root entry
// wrangler.toml `main` ships — the Deploy-to-Cloudflare button's surface)
// and deploy/worker.ts (deploy/wrangler.toml's harness). The twins drifted
// once already — the button shipped a blanket-500 catch while deploy/
// worker.ts mapped missing cards 404, and the deploy button's live
// test-deploy caught it (commit 90d5f31 on the public lineage; the audit
// recorded result an internal work log ASSIGNMENT 2 lists
// the full divergence inventory). This module is the part of that surface
// BOTH entries must answer IDENTICALLY, extracted so they cannot drift
// again; tests/deploy/worker-twins-shared-surface-parity.test.ts drives
// both shipped entries through one fixture and pins the parity.
//
// Web-standard only (no Node APIs), like both entries.

import type { SQLDatabaseDriver } from "./driver.js";
import { DeckoName } from "../card/name.js";
import type { FetchEngine } from "../card/fetch.js";
import type { HistoryRenderParams } from "../card/history/render-seam.js";
import {
  previousLocation,
  readVisitorSession,
} from "../card/session/visitor-session.js";

// ---------------------------------------------------------------------------
// Error -> HTTP status mapping (the Card::Error status_code table)
// ---------------------------------------------------------------------------

/** The rendered-error page shape both entries answer with. */
export interface RenderErrorPage {
  readonly status: number;
  readonly title: string;
}

/**
 * Map an engine error MESSAGE to the HTTP status + page title, per the
 * vendored oracle's own status table (card 1.110.0 lib/card/error.rb):
 *
 *   - `card not found: X`  -> 404 "Card not found"
 *     (Card::Error::NotFound, error.rb:88-89 `self.status_code = 404`)
 *   - `id doesn't exist: N` / `codename doesn't exist: X` -> 404
 *     (DeckoName.badMark's NameNotFoundError / CodenameNotFoundError —
 *     src/card/name/errors.ts maps them to Card::Error::NotFound /
 *     CodenameNotFound < NotFound, error.rb:93)
 *   - `view (X) not supported ...` -> 422 "Unsupported view"
 *     (UnsupportedViewError = the Card::Error::UserError raise,
 *     src/card/render/format.ts:79-81 citing render.rb#view_method;
 *     error.rb:21 sets the Card::Error BASE status_code = 422 and
 *     UserError (:68) inherits it — only ServerError (:46-51) overrides
 *     to 500. The deploy entry's former 500 for this case was the twins'
 *     divergence; the root entry's 422 was the Ruby-correct shape.)
 *   - anything else -> 500 "Render error" (ServerError, error.rb:46-51)
 *
 * The discriminators are the error MESSAGES the engine throws (every
 * raise site formats through `Error` with these prefixes); entries catch
 * at the page boundary where only the message survives.
 */
export function mapRenderError(message: string): RenderErrorPage {
  if (/^card not found: /.test(message)) return { status: 404, title: "Card not found" };
  if (/^id doesn't exist: /.test(message) || /^codename doesn't exist: /.test(message)) {
    return { status: 404, title: "Card not found" };
  }
  if (/^view \(/.test(message)) return { status: 422, title: "Unsupported view" };
  // act_listing.rb:12 `Act.find(act_id) || raise(Card::NotFound, "act not found")`
  // - Card::NotFound (error.rb:88-91) is 404 with the :not_found view.
  if (/^act not found$/.test(message)) return { status: 404, title: "Card not found" };
  if (message === "limit parameter exceeds maximum for anonymous users (1000)") return { status: 403, title: "Forbidden" };
  return { status: 500, title: "Render error" };
}

// ---------------------------------------------------------------------------
// Hardened name decode
// ---------------------------------------------------------------------------

/**
 * decodeURIComponent that returns undefined on malformed input instead of
 * throwing. The '+' is DECKO'S JOINT (Card::Name.joint,
 * card 1.110.0 lib/cardname.rb) and must survive into the name:
 * /Demo%20Guide+Section%20One is the junction "Demo Guide+Section One"
 * whose canonical engine key is "demo_guide+section_one" (left.key +
 * joint + right.key, name.ts #key). An earlier deploy-entry revision
 * rewrote '+' to ' ' here so multi-word simple names could ride the
 * bare-plus URL form — that made junction names unreachable over HTTP in
 * EVERY form ('+' -> space; '%2B' -> '+' -> space) while the engine still
 * composes junction keys WITH the joint, so every compound GET 404'd (the
 * adversarial probe battery's headline finding, batch 01). Ruby/decko
 * addresses junctions as /A+B and multi-word simple names as /A%20B (or
 * the underscore alias form). Caught by the targeted Cloudflare test
 * 2026-09-23; reconciled to the engine-canonical key 2026-09-24.
 *
 * The underscore decode is card_class.rb:126-131 uri_fetch_opts:
 * `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`. An underscored mark and
 * the same name with spaces fold to the SAME key, so the fetch result is
 * unchanged; the decode is what an ABSENT-card render displays (the
 * placeholder is Card.new(name: mark), fetch/store.rb:21-28). Without it, an
 * orphan-junction page (left_id/right_id NULL rows fetched virtual) rendered
 * the underscored mark — and, through the key-seated render placeholder, the
 * canonical key string — in the masthead and <title> where the oracle renders
 * the requested name (the acceptance's compound-masthead rows).
 *
 * The fold is for PLAIN names only: a codename mark's underscore is the
 * primed codehash key's own spelling (the `:` prefix routes through the
 * codehash, not name folding — folding it 404'd `GET /:search_type`), and a
 * VIEW segment is a snake_case identifier matched literally (folding it
 * turned the unsupported-view grammar's `no_such_view` 422 and the
 * `action_summary` history seam into misses). Hence decodeName folds plain
 * names and skips codename marks, while view segments ride decodeViewSegment
 * (the plain decode — views are not uri_fetch_opts' subject).
 */
export function decodeName(raw: string): string | undefined {
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith(":") ? decoded : decoded.replace(/_/g, " ");
  } catch {
    return undefined;
  }
}

/** The plain decode for path segments that are NOT card names: view
 *  identifiers are snake_case and matched literally, so no fold. */
export function decodeViewSegment(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// History view params (Card::Env.params equivalents)
// ---------------------------------------------------------------------------

/**
 * view_from_params (decko-0.20.0 lib/card_controller/rest.rb:100-103):
 * `%i[view v].each { |k| return params[k] if params[k].present? }` — the
 * first NON-BLANK of the two query params, undefined when neither is
 * present. The value rides VERBATIM into the engine; the path view (the
 * action arg) never falls through to params. All worker entries share
 * this one copy.
 */
export function queryViewFromUrl(url: URL): string | undefined {
  for (const key of ["view", "v"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== "") return value;
  }
  return undefined;
}

/** The wire query keys the history views read (render.ts HistoryRenderParams —
 *  act_listing.rb:9-13 act_from_context "act_id", actions.rb:34-40
 *  "action_id", and the act_listing_opts_from_params / paging keys).
 *  Other views ignore them, so passing them unconditionally is the faithful
 *  shape: Rack hands the controller ALL params and the views pick. */
const HISTORY_PARAM_KEYS = [
  "act_id",
  "action_id",
  "page",
  "act_seq",
  "action_view",
  "hide_diff",
  "act_context",
  "tinymce_id",
  "tm_snippet_raw",
  "tm_snippet_start",
] as const;

/** The TinyMCE snippet editors' request params (reference_editor.rb:4-5 and
 *  apply_tm_snippet_data): carried into HistoryRenderParams.editorParams. */
const EDITOR_PARAM_KEYS = ["tinymce_id", "tm_snippet_raw", "tm_snippet_start"] as const;

/**
 * Translate the WIRE query keys the engine's history seam actually reads.
 *
 * WHY THIS EXISTS: the seam's readers use camelCase fields on
 * HistoryRenderParams (`actId`, `actionId`, ... — the URL params
 * `act_from_context` inspects are snake_case). The worker entries parse the
 * query string into snake_case wire keys, so without this translation
 * `?act_id=<real>` arrived with `params.actId` undefined and act_from_context
 * silently took its no-param fallback branch, rendering the last-act view
 * for every act_id. The Bunny edge entry already had this exact
 * translation (deploy/bunny-worker-src/bunny-edge-engine-request.ts#historyRenderParamsFromWire)
 * and its seam pins; this is that same mapping moved to the shared
 * surface so BOTH twins use one copy. Keys absent from the query are absent
 * from the result; present values pass verbatim (the views own the integer /
 * enum parsing, matching the bunny entry).
 */
export function historyRenderParamsFromWire(
  params: Record<string, string> | undefined,
): HistoryRenderParams {
  if (params === undefined) return {};
  const out: HistoryRenderParams = {};
  if (params["act_id"] !== undefined) out.actId = params["act_id"];
  if (params["action_id"] !== undefined) out.actionId = params["action_id"];
  if (params["act_seq"] !== undefined) out.actSeq = params["act_seq"];
  if (params["action_view"] !== undefined) out.actionView = params["action_view"];
  if (params["hide_diff"] !== undefined) out.hideDiff = params["hide_diff"];
  if (params["act_context"] !== undefined) out.actContext = params["act_context"];
  if (params["page"] !== undefined) out.page = params["page"];
  const editor: Record<string, string> = {};
  for (const key of EDITOR_PARAM_KEYS) {
    if (params[key] !== undefined) editor[key] = params[key];
  }
  if (Object.keys(editor).length > 0) out.editorParams = editor;
  return out;
}

/**
 * Extract the history-view params from a request's query string, for the
 * render call's HistoryRenderParams argument, TRANSLATED into the camelCase
 * fields the seam reads. The root entry extracted the wire keys since the
 * history views landed; the deploy entry dropped them (its render call was
 * 2-arg, so `?act_id=` silently rendered the no-param fallback); and
 * BOTH entries passed the snake_case keys straight through, so act_id was
 * inert even once threaded. This now returns the seam's own param shape.
 */
export function historyViewParams(searchParams: URLSearchParams): HistoryRenderParams {
  const wire: Record<string, string> = {};
  for (const key of HISTORY_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) wire[key] = value;
  }
  const search = jsonViewSearchParams(searchParams);
  return { ...historyRenderParamsFromWire(wire), ...(search !== undefined ? { search } : {}) };
}

/**
 * The shared request-term/query/paging seam for HTML and JSON dispatch
 * (search_params.rb: term_param || vars.keyword — the navbox typeahead's
 * `?term=` and the `query[keyword]` form pair among them). Undefined when
 * the request carries none, so the render params stay clean. Shared by the
 * deploy entries and Node. The legacy export name remains for existing callers.
 */
export function jsonViewSearchParams(searchParams: URLSearchParams): HistoryRenderParams["search"] {
  const term = searchParams.get("term");
  const main = searchParams.get("main");
  const vars = Object.fromEntries([...searchParams].flatMap(([key, value]) => {
    const match = /^query\[([^\[\]]+)\]$/.exec(key);
    return match ? [[match[1]!, value]] : [];
  }));
  const rawOffset = searchParams.get("offset");
  const offset = rawOffset !== null && /^\d+$/.test(rawOffset) && Number(rawOffset) > 0 ? Number(rawOffset) : undefined;
  if (term === null && main === null && Object.keys(vars).length === 0 && offset === undefined) return undefined;
  return {
    ...(term !== null ? { term } : {}),
    ...(main !== null ? { main } : {}),
    ...(Object.keys(vars).length ? { vars } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}

// ---------------------------------------------------------------------------
// Deck-boot name-environment prime
// ---------------------------------------------------------------------------

interface PrimeIdRow {
  id: number;
  name: string | null;
  left_id: number | null;
  right_id: number | null;
}

/** Junction cards store NULL name columns and ride left_id/right_id (the
 *  2020 Lexicon convention, db/schema.sqlite.sql). Compose their names
 *  recursively (left-associative chain, same as DbLexicon.lexToName),
 *  cycle-guarded. Returns the row list plus a name-of resolver the CQL
 *  primer (deploy entry) reuses for its key->id map. */
export function composeJunctionNames(rows: PrimeIdRow[]): {
  rows: PrimeIdRow[];
  nameOf: (id: number) => string | undefined;
} {
  const byId = new Map<number, PrimeIdRow>();
  const idToName = new Map<number, string>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      idToName.set(row.id, name.s);
    }
  }
  const composing = new Set<number>();
  const composedName = (id: number): string | undefined => {
    const direct = idToName.get(id);
    if (direct !== undefined) return direct;
    if (composing.has(id)) return undefined;
    const row = byId.get(id);
    if (row === undefined || row.left_id === null || row.right_id === null) return undefined;
    composing.add(id);
    try {
      const left = composedName(row.left_id);
      const right = composedName(row.right_id);
      if (left === undefined || right === undefined) return undefined;
      const joined = `${left}${DeckoName.JOINT}${right}`;
      idToName.set(id, joined);
      return joined;
    } finally {
      composing.delete(id);
    }
  };
  return { rows, nameOf: composedName };
}

/**
 * Install the fetcher's DB-backed name environment and warm it from the
 * deck's card rows — the boot-time composition BOTH entries run (and the
 * local engine boots with: FetchEngine#warmLexicon + installNameEnvironment).
 *
 * The sync name environment (DeckoName's mark resolution for "~<id>" and
 * ":<codename>" strings, name.ts parse -> idFromString) reads ONLY the
 * warm caches through the engine's peek adapters, so the boot has to
 * install the adapters and warm the caches BEFORE the first request:
 * without this, "/~9" answers 500 with "id doesn't exist: 9"
 * (DeckoName.badMark, the NameNotFoundError path) and "/:search_type"
 * 500s with "codename doesn't exist: search_type" — the mark URLs are
 * unusable. The lexicon warm reuses the row load above (no second full
 * scan); the codename codehash is its own small query.
 */
export async function installDeckNameEnvironment(
  driver: SQLDatabaseDriver,
  fetcher: FetchEngine,
): Promise<void> {
  const { rows } = await driver.query<PrimeIdRow>(
    "SELECT id, name, left_id, right_id FROM cards WHERE trash = 0",
    [],
  );
  const { nameOf } = composeJunctionNames(rows);
  fetcher.installNameEnvironment();
  await fetcher.codenames.ensureLoaded();
  for (const row of rows) {
    if (row.left_id !== null && row.right_id !== null) {
      const joined = nameOf(row.id);
      if (joined === undefined) continue;
      fetcher.lexicon.write(row.id, DeckoName.parse(joined), [row.left_id, row.right_id]);
    } else if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      fetcher.lexicon.write(row.id, name, row.name);
    }
  }
}

/**
 * A card's stored content as the JSON surfaces may show it. A password
 * card's content is its digest, which Decko never shows to anyone, owner and
 * administrators included: card-mod-account set/right/password.rb renders
 * its content as "encrypted" (view :raw).
 */
export function publicDbContent(record: { name?: DeckoName; dbContent?: string }): string {
  if (record.name?.rightName?.key === "*password") return "encrypted";
  return record.dbContent ?? "";
}


// ---------------------------------------------------------------------------
// The *previous read-path mark (card_controller/mark.rb:12-14)
// ---------------------------------------------------------------------------

/** card_controller/mark.rb:12-14 interpret_mark: the "*previous" mark
 *  hard_redirects to Card::Env.previous_location (location_history.rb:29-31
 *  = the visitor session's last history entry, seeded with card_path("")
 *  so it is never empty) — BEFORE any view resolution, on every route whose
 *  :mark carries it. The WRITE-path success-mark resolution lives in
 *  write-routes (successTargetPath); this is the READ-path arm. Both Worker
 *  entries call this at their mark-resolution point so the twins cannot
 *  drift.
 *
 *  hard_redirect (response.rb:40-47): card_url makes the URL absolute (the
 *  history already stores absolute original_url shapes; the seeded "/" entry
 *  takes the request's own origin). Ajax answers JSON {redirect} (200) so
 *  the client resets its own location; otherwise a 302. */
export function previousMarkRedirect(
  request: Request,
  url: URL,
  mark: string | undefined,
): Response | null {
  if (mark !== "*previous") return null;
  const visit = readVisitorSession(request.headers.get("Cookie") ?? undefined);
  const target = previousLocation(visit);
  const absolute = /^https?:\/\//i.test(target) ? target : `${url.origin}${target}`;
  if (/XMLHttpRequest/i.test(request.headers.get("X-Requested-With") ?? "")) {
    return new Response(JSON.stringify({ redirect: absolute }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: absolute, "Cache-Control": "no-store" },
  });
}


// ---------------------------------------------------------------------------
// The deprecated asset prefix routes (engine_routes.rb:17-19)
// ---------------------------------------------------------------------------

/** engine_routes.rb:17-19: `get "assets/*mark" => "card#asset"` (and
 *  javascripts/*, jasmine/*) — the DEPRECATED asset prefixes. card#asset
 *  (card_controller/rest.rb:22-27) is deliberate: a 404 whose body is the
 *  exact string below (the rake card:mod:symlink advice rides the LOG line,
 *  :25, not the body). The port's card grammar would 404 these paths
 *  anyway, but with ITS OWN not-found page; the prefixes answer Ruby's
 *  exact bytes instead, before any card dispatch (the routes shadow any
 *  card named assets/javascripts/jasmine in Ruby too). Both Worker twins
 *  call this before their card dispatch. */
export function assetRouteResponse(pathname: string): Response | null {
  if (!/^\/(assets|javascripts|jasmine)\//.test(pathname)) return null;
  return new Response("Decko installation error: missing public directory symlinks", {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
