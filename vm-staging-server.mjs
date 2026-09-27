// vm-staging-server.mjs — read-only Node HTTP staging copy of the decko-ts
// engine, served from /opt/decko-bunny-render on Brandon's portal VM
// (170.9.231.182) so the owner can click through real pages in a browser
// while parity work continues. NO write path, NO editing, NO search —
// pure browse.
//
// Routes (the engine-canonical surface, mirrors deploy/worker.ts):
//   GET /                 -> render "Home" card page (HTML, full shell)
//   GET /_status          -> engine + database health JSON
//   GET /<card-name>      -> render that card page (HTML, full shell)
//   GET /<card-name>.json -> the card record as JSON
//   GET /files/~<id>/<rev>.<ext> -> asset bytes from the corpus's File
//                                   cards (compiled CSS/JS bytes are NOT
//                                   in the scrubbed corpus — these routes
//                                   serve what's available so the layout
//                                   references resolve rather than 404).
//   anything else         -> Decko's full-chrome error pages (live-shape,
//                             2026-09-26): an unresolved card name gets the
//                             not_found page (404, Default Layout chrome,
//                             "Not Found" frame, noindex head meta); a
//                             raising render gets the deck error page
//                             (500, "Wild Card! / 500 Server Error").
//
// Boot:
//   node vm-staging-server.mjs <path-to-corpus.sqlite> [port]
//
// Defaults: port 3100, db path arg required.
//
// PAGE PATH (r18): pages render through the ENGINE's page entry
// (dist/src/card/render/page.js renderPageBytes — the show_with_page_layout
// port: per-card *layout rule walk, main! render, layout-body processing,
// html_page head). The round-9/10 origin-side byte-surgery bridges
// (stripOpenViewWrapper, convertOuterToTitledShape,
// convertNestedTitledViewsToContentView, postProcessImageCards,
// postProcessWikiLinks, postProcessSearchCards) are RETIRED — every engine
// page-lane fix (sentinels, nitpicks context chain, searchctx, R16 bars,
// the R18 item:titled heir-key fix) reaches the wire the moment it lands
// in the engine. What this file still owns is the SERVED ENVIRONMENT
// (applyServedEnvironmentDeltas): the live-receipted deltas between the
// engine's pinned capture environment and the served deck — the Spaces
// asset host (audit A-1), the live CSS revision (A-2), the CDN script
// integrity attributes (A-4), the "Decko v0.19.1" footer pin (the corpus's
// *version db_content is empty; live prints 0.19.1), and the trailing
// newline after </html>. Error pages keep the literal-substitution shell
// (wrapWithLayout) — the not_found shape is byte-pinned from live.
//
// Shell context: the page wraps the rendered card view through the deck's
// "Default Layout" (id 22747, codename `default_layout`). The layout body
// is `<header>...</header> <article ...>{{_main|titled}}</article>
// <footer>...</footer>`; the *header and *footer setting cards carry the
// navbar / credit markup the layout nests. The outer HTML doc
// (`<!DOCTYPE>`, `<html class="h-100">`, head with the active skin
// stylesheet and script, body class `d-flex flex-column h-100`) matches
// the engine's `wrap_with_html_page` + `html_page` view at
// card-mod-format-0.20.0/set/all/html/show.rb:7-17.

import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

import { LocalSqliteDriver } from "./dist/src/server/drivers/local-sqlite.js";
import { FetchEngine } from "./dist/src/card/fetch.js";
import { RenderEngine } from "./dist/src/card/render.js";
import { DeckoName } from "./dist/src/card/name.js";
import { applyDeckInflections } from "./dist/src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "./dist/src/card/name/oracle-deck-inflections.js";
import { sqliteRegexpUdf } from "./dist/src/cql/sqlite-regexp.js";
import { createVirtualCardLookup } from "./dist/src/card/fetch/virtual-cards.js";
import { newSlotId } from "./dist/src/card/render/slot-html.js";
import { renderPageBytes } from "./dist/src/card/render/page.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "./dist/src/card/rules/structure.js";

// DECK BOOT — inflection initializer, FIRST, before any DeckoName.parse.
// A Rails deck's config/initializers/inflections.rb runs before any request;
// this is that moment. The deployed deck keys names under a non-default
// inflection table (uncountables s / this / anonymous — recovered from the
// stored corpus keys, see src/card/name/oracle-deck-inflections.ts). Without
// this call the engine computes `participant_` where the corpus stores
// `participant_s` ("Participant(s)"), the CQL name resolver falls back to
// Ruby's -999 sentinel, and every plus-join on those junctions ("+Project(s)
// Participating" sections, "+Participant(s)" children) returns zero rows
// (2026-09-25 staging "0 results" defect 1). applyDeckInflections also drops
// the DeckoName parse cache, so the keys primed below (primeEngine's
// keyToId / idToName maps) are computed under the deck table.
applyDeckInflections(ORACLE_DECK_INFLECTIONS);

// ---------------------------------------------------------------------------
// Lexicon / codename cache backing store (origin-side round 8 wiring)
// ---------------------------------------------------------------------------
//
// The deck has 49,829 cards in `cards`. The engine's two `CardCache`
// instances default to `maxTemporaryKeys=10000`; priming every lexicon row
// from this corpus writes ~99,658 entries (id -> name and cacheKey(lex) ->
// id per row), which trips the temp cache's `withinKeyCounts` reset and
// evicts the codename cards (`*type`, `*members`, `by name`) whose ids
// (98/184/266) were written early in the loop. Once the temp cache drops
// them, the sync name environment's `lexicon.name(id)` peek returns
// undefined for those ids; `DeckoName.parse(":type")` then takes the
// `badMark` path and throws `codename doesn't exist: type` even though
// the rows are present in the corpus's codehash. A Map-backed shared
// store keeps every write through the full boot, and the temp layer's
// 10k cap still caps resident memory for the hot path.
// ---------------------------------------------------------------------------
const SHARED_LEX_STORE = new Map();
const sharedStore = {
  read(key) { return SHARED_LEX_STORE.get(key); },
  write(key, value) { SHARED_LEX_STORE.set(key, value); },
  exist(key) { return SHARED_LEX_STORE.has(key); },
  delete(key) { SHARED_LEX_STORE.delete(key); },
};

// ---------------------------------------------------------------------------
// Live image host (Spaces) + size options
// ---------------------------------------------------------------------------
//
// The deck's stored image URLs (corpus `db_content` on image cards) point at
// the deck's original S3 bucket, but the live deck's CDN is now fronting
// files from the Spaces bucket culturesmith-production-storage at the same
// path scheme (`/files/<cardId>/<fileId>-<size>.<ext>`).
//
// A-1 (round 10, assumption audit): every asset URL on every live page uses
// the `.cdn.` Spaces subdomain —
// `https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com`
// (12/12 live pages: JS, CSS, favicon, logo, and every content image; e.g.
// Home.html `src="…cdn…/files/27689/135167-large.jpg"`). The previous
// non-cdn host form was derived from a 2026-09-25 200-OK curl receipt, not
// from the live page bytes — the live bytes never name that host.
const SPACES_HOST = "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com";
// (r18: DEFAULT_IMAGE_SIZE retired with the origin image passes — image
// size variants resolve inside the engine's image views via the nest's
// size option / imageCdnHost.)

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Compiled-asset directory
// ---------------------------------------------------------------------------
//
// The compile lane produces real SassC-compiled CSS and Uglifier-compressed
// JS bytes for the deck's two main asset cards. We serve those bytes when
// present on disk so the CDN-fronted pages receive compiled styling and
// script (not the deck's SCSS source / *script manifest), and fall back to
// the existing source-serving paths when the compiled file is missing — the
// fallback keeps the honest `X-Decko-Asset-Note` header so a missing deploy
// is observable, not silent.
//
// Default location: /opt/decko-bunny-render/oracle-assets/ on the VM, which
// is the bunny-render service's working directory. Override with
// `COMPILED_ASSETS_DIR=/path` for local testing. Files inside the repo
// stay out of this path; deployment scp's the compile outputs here.
const COMPILED_ASSETS_DIR =
  process.env.COMPILED_ASSETS_DIR ?? "/opt/decko-bunny-render/oracle-assets";

// URL → compiled filename. Both asset cards have one canonical URL on the
// page (the layout shell links /files/~45514/1790384218.css and
// /files/~50617/1768074298.js). The action_id segment is the deck's
// bucket revision; the bucket it ships against is the same one we mirror
// to disk here. We treat the (cardId, ext) tuple as the key — the action
// id is preserved verbatim in the served URL.
const COMPILED_ASSET_FILES = {
  "45514:css": "all-style.css",
  "50617:js": "all-script.js",
};

// ---------------------------------------------------------------------------
// CLI / boot args
// ---------------------------------------------------------------------------

const dbPath = process.argv[2];
const port = Number.parseInt(process.argv[3] ?? "3100", 10);

if (!dbPath) {
  console.error(
    "usage: node vm-staging-server.mjs <path-to-corpus.sqlite> [port]\n" +
      "  port defaults to 3100 (bind on 127.0.0.1; nginx fronts with basic auth).",
  );
  process.exit(2);
}
if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error(`invalid port: ${process.argv[3]}`);
  process.exit(2);
}

console.log(`[vm-staging] db: ${dbPath}`);
console.log(`[vm-staging] port: ${port}`);

// ---------------------------------------------------------------------------
// Engine boot
// ---------------------------------------------------------------------------

const driver = new LocalSqliteDriver({ path: dbPath, readonly: true });
// CQL match queries compile SQL `field REGEXP ?`; SQLite has no built-in
// REGEXP, so the UDF is registered before the first match query runs
// (registerSqliteRegexpFunction header note: function resolution is at
// statement-prepare time).
driver.registerFunction("regexp", sqliteRegexpUdf, { deterministic: true });

const fetcher = new FetchEngine(driver, { sharedStore, database: "decko" });
const render = new RenderEngine(fetcher);
// Round-10 engineFix gap 1, wired at merge pass 2: the engine's
// imageCdnHost is host-deployment config (RenderEngineLike.imageCdnHost;
// undefined = host-relative /files URLs). The live deck serves carrierwave
// cloud attachments from the .cdn. Spaces subdomain — SPACES_HOST above
// (live Home.html receipt: src="…cdn…/files/27689/135167-large.jpg").
render.imageCdnHost = SPACES_HOST;

// Sync name-environment adapters (mark strings like "~9", ":search_type"
// resolve through engine.peekLexiconId etc., which read warm caches only;
// the worker primes them via primeCqlNameResolver. The Node boot mirrors
// that: load the lexicon, load the codenames, then install).
const HOME_CARD_NAME = "Home";
const OPEN_VIEW = "open";

await primeEngine(fetcher);

// ---------------------------------------------------------------------------
// Layout / asset URLs (from the discovery lane's corpus query)
// ---------------------------------------------------------------------------
//
// The default layout rule is *all+layout (card id 275) → "Default Layout"
// (id 22747). Its body is
//   <body class="d-flex flex-column h-100">
//     <header>{{:header|core}}</header>
//     <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>
//     <footer class="footer mt-auto py-3">{{:footer|content}}</footer>
//   </body>
// The *header / *footer setting cards (id 22748 / 22749) carry the navbar
// and credit markup the layout nests.
const HEADER_SETTING_NAME = "*header";
const FOOTER_SETTING_NAME = "*footer";

// ---------------------------------------------------------------------------
// Per-card layout-rule resolution
// ---------------------------------------------------------------------------
//
// The deck stores a "set rule" as a junction card whose right_id is the
// pointer card the rule applies to (e.g. *layout id 255) and whose left_id
// is the card or junction being tagged. The rule's db_content is the NAME
// of the layout card to use (e.g. "Default Layout", "Home Layout 1").
//
// Rule shapes present in this corpus:
//   1. Direct junction:        left_id = <card>,        right_id = 255
//      — covers rules like PCTS+*layout, bdwilliamscraig+*layout
//   2. Junction-of-junction:   left_id = <card>+*self,   right_id = 255
//      — the *self junction (left=<card>, right=264) is a 2-level indirection
//      for cards whose layout rule was authored as <card>+*self+*layout
//      (the Home+*layout rule is one of these, junction id 34831 with
//      left=2664, right=255, db="Home Layout 1"; 2664 itself is a junction
//      left=80 [Home], right=264 [*self]).
//   3. *all+*layout fallback:  left_id = 274 (*all),     right_id = 255
//      — the catch-all rule (rule id 275, db="Default Layout").
//
// No type-based `+*type+*layout` rules exist in this corpus (verified by
// querying right_id=*type against the layout-name set: 0 rows). Only the
// exact rule + the *all fallback need to be implemented.
const LAYOUT_POINTER_ID = 255; // *layout set pointer (corpus)
const ALL_CARD_ID = 274; // *all card id (corpus)
const SELF_POINTER_ID = 264; // *self set pointer (corpus)

// *all+*style (rule id 17467) → "slate skin customized" (card id 38274,
// codename `slate_skin_customized`, type_id 33929 bootswatch_skin). Its
// asset output is card id 45514; the corpus stores the OLDER revision in
// db_content ("(my_bucket)/45514/1786554352.css"), but the revision live
// actually serves is 1790384218 (12/12 live pages:
// `/files/45514/1790384218.css` — audit A-2). Byte receipt (2026-09-26):
// live 1790384218.css EQUALS our SassC compile of the deck's current
// skin with live's asset-host setting applied — `url(/mod/…)` →
// `url(https://culturesmith.com/mod/…)` (16 font/image URLs;
// `cmp` clean, 372,356 bytes). The VM's oracle-assets/all-style.css
// carries that transform.
const MAIN_CSS_URL = `${SPACES_HOST}/files/45514/1790384218.css`;
// *all+*script (rule id 20616) asset output is card id 50617.
const MAIN_JS_URL = `${SPACES_HOST}/files/50617/1768074298.js`;

// Style-mod file cards (their CSS asset outputs); see card-mod-assets'
// :remote_style_tags. The card-mod-asset compiled bytes are also bucket
// references — there is no compiled CSS in the scrubbed corpus. The
// routes below serve what's available.
const STYLE_MOD_ASSETS = [
  `${SPACES_HOST}/files/45514/1790384218.css`,
];

// All asset output cards the corpus references (type_id 18, db_content
// like "(my_bucket)/NNN/ACTION.EXT" or "~NNN/ACTION.EXT"). Used to validate
// /files routes; loaded at boot from the corpus.
const ASSET_OUTPUT_FILE_CARD_IDS = [];

async function primeEngine(engine) {
  // 1. Codenames (small, one statement).
  await engine.codenames.ensureLoaded();
  // 1b. Codename defensive registration (round 8, set-500-codename family):
  // the corpus-v2 anonymizer leaves `type` / `by_name` / `members` rows
  // with the codename column set on the canonical ids 266/184/98, but the
  // engine's sync `peekId` consults a memoized codehash — if a future
  // scrubbed corpus drops any of those rows' codename columns, the
  // pattern walk in `setRulesCoreHtml` and the CQL parser's
  // `member_of` / `member` clauses will throw `codename doesn't exist`.
  // Re-register the three names against their canonical card ids so the
  // engine priming holds them independent of sqlite content. The map is
  // populated by the corpus query below; if the ids are absent in the
  // corpus the map stays empty and the original codehash stands.
  const codenameRegistration = await driver.query(
    "SELECT id, codename FROM cards WHERE codename IN ('type','by_name','members') AND trash = 0",
    [],
  );
  const codehashValue = engine.codenames.codehashValue;
  if (codehashValue !== undefined) {
    for (const row of codenameRegistration.rows) {
      codehashValue.c2i.set(row.codename, row.id);
      codehashValue.i2c.set(row.id, row.codename);
    }
  }
  // 2. Lexicon: every live row's id/name/left/right, then a recursive
  //    composition for junction cards. Mirrors deploy/worker.ts
  //    primeCqlNameResolver (the Node-port equivalent — the worker's
  //    version is in TS, the same logic here).
  const { rows } = await driver.query(
    "SELECT id, name, left_id, right_id FROM cards WHERE trash = 0",
    [],
  );
  const byId = new Map();
  const idToName = new Map();
  const keyToId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      idToName.set(row.id, name.s);
      keyToId.set(name.key, row.id);
    }
  }
  const composing = new Set();
  const composedName = (id) => {
    const direct = idToName.get(id);
    if (direct !== undefined) return direct;
    if (composing.has(id)) return undefined;
    const row = byId.get(id);
    if (row === undefined || row.left_id === null || row.right_id === null) {
      return undefined;
    }
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
  for (const row of rows) {
    const name = composedName(row.id);
    if (name !== undefined) keyToId.set(DeckoName.parse(name).key, row.id);
  }
  // 3. Install + warm (the worker's installNameEnvironment + lexicon writes
  //    happen AFTER the codenames load — see worker.ts header).
  fetcher.installNameEnvironment();
  for (const row of rows) {
    if (row.left_id !== null && row.right_id !== null) {
      const joined = composedName(row.id);
      if (joined === undefined) continue;
      fetcher.lexicon.write(row.id, DeckoName.parse(joined), [row.left_id, row.right_id]);
    } else if (row.name !== null && row.name !== "") {
      const name = DeckoName.parse(row.name);
      fetcher.lexicon.write(row.id, name, row.name);
    }
  }
  // 4. Virtual-card rule universe (round 8, wikirate-tag-404 family): the
  //    storage factory's responsibility per
  //    src/card/fetch/virtual-cards.ts:44-49. Without this hook,
  //    `Wikirate+*right` and similar compound names that resolve only
  //    through the structure rule walk return undefined from
  //    `FetchEngine.fetchByName` and the serving path turns that into a
  //    404. The seed statement + helpers come from
  //    src/card/rules/structure.ts (already exported via dist).
  {
    const [universeResult] = await driver.batch([structureRuleUniverseStatement()]);
    fetcher.virtualCardLookup = createVirtualCardLookup(fetcher, {
      contents: structureUniverseFromResults(universeResult),
      ruleTypeIds: structureRuleTypesFromResults(universeResult),
    });
  }
  // 5. Cold-start warm render (round 8, coldstart-500 Fix A): the engine's
  //    render closureWarm path runs once per restart; without a warm pass
  //    the first request to /help walks the cold prefetch + structured
  //    template loop and may throw `codename doesn't exist` on a `:members`
  //    reference that the codehash fold hasn't reached yet. One home
  //    render closes the path so the next request finds closureWarm=true
  //    and skips the cold branch. try/caught so a missing-card doesn't
  //    abort boot.
  try {
    await render.render(HOME_CARD_NAME, OPEN_VIEW);
  } catch (warmError) {
    console.warn(
      `[vm-staging] warm render of ${HOME_CARD_NAME} failed: ${warmError instanceof Error ? warmError.message : String(warmError)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

// Pre-load the asset-output File cards (type_id 18 with bucket / file_dir
// db_content) so the /files routes can resolve `~NNN/ACTION.EXT` to the
// source card id without an extra query per request. Compiled CSS/JS
// bytes live in the cloud bucket the corpus mirrors; what we have is the
// *source* (the skin SCSS, the *all+*script manifest), so the routes
// serve what's in the corpus and surface the gap honestly in headers.
const fileCardsById = new Map();
{
  const { rows } = await driver.query(
    "SELECT id, name, db_content FROM cards WHERE type_id = 18 AND trash = 0",
    [],
  );
  for (const row of rows) {
    fileCardsById.set(Number(row.id), {
      id: Number(row.id),
      name: row.name,
      dbContent: row.db_content ?? "",
    });
  }
}

// Map deck-card id 38274 (slate skin customized) so the main-CSS route
// can serve its SCSS source. The bucket URL itself is the public-facing
// surface, but for the local origin we surface the source.
const MAIN_SKIN_CARD_ID = 38274;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function htmlResponse(status, body, title = "decko-ts staging") {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Send Connection: close so the client closes the socket
      // immediately after the response body. The origin doesn't
      // benefit from keep-alive (Bunny CDN is the connection
      // point), and a kept-alive socket whose handle is mid-uv_close
      // when the caller's process.exit fires on Windows trips
      // libuv's src\win\async.c:94 assertion
      // (!(handle->flags & UV_HANDLE_CLOSING)).
      "Connection": "close",
    },
    body: `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
      `<body>${body}</body></html>`,
  };
}

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "close",
    },
    body: JSON.stringify(body, null, 2),
  };
}

/** decodeURIComponent that 400s on malformed input instead of throwing.
 *  '+' is DECKO'S JOINT (Card::Name.joint, prototype/lib/cardname.rb) and
 *  must survive into the name — see deploy/worker.ts#decodeName. */
function decodeName(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

// Render the *header and *footer setting cards. The deck's Default Layout
// nests them with `{{:header|core}}` and `{{:footer|content}}`. The
// decko-ts coreView dispatches on typeCode (toggle/search_type/pointer/
// list/set/date/image/file) and has no generic branch for arbitrary
// HTML-typed setting cards — and the header card's internal nests
// (e.g. `{{:home|home_path}}`) reference codenames the scrubbed corpus
// doesn't always carry. Try the layout-prescribed view first, then a
// plain :content render, then fall back to the literal db_content from
// the corpus. If the literal lookup also fails, surface a marker that
// records the failure rather than dropping the layout structure.
//
// For the *header card the literal fallback still leaves
// `{{:title|core}}`, `{{:logo|core;size:small}}`, `{{:main_menu|navbar_links}}`,
// etc. as raw template tokens. The deck's layout chain resolves those
// at render time through `process_content` substitution against the
// engine's Nest/Subformat pipeline. To approximate that without
// re-implementing sub-formats, we expand each `{{:name|view}}` token in
// the literal header HTML by rendering the referenced *name card with
// the named view (or :content fallback). Cards the engine can't resolve
// (missing codenames, unsupported views) are left as literal tokens.
async function renderCardSlot(name, view, opts = {}) {
  const candidates = [view, "content", "open", "closed", "core"];
  let lastErr = null;
  for (const v of candidates) {
    try {
      return await render.render(name, v);
    } catch (err) {
      lastErr = err;
    }
  }
  if (opts.fallbackToDb) {
    try {
      const { rows } = await driver.query(
        "SELECT db_content FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
        [name],
      );
      const raw = rows[0]?.db_content;
      if (typeof raw === "string") return raw;
    } catch {}
  }
  throw lastErr ?? new Error(`render failed for ${name}:${view}`);
}

// Resolve `{{:name|view;opt=val;opt=val}}` tokens inside a literal HTML
// string. Each token is classified as attribute-context (inside a
// quoted HTML attribute value such as href="...") or body-context;
// the two classes resolve through different pipelines because the
// deck treats them differently at render time:
//
//   * body-context: try the named view first, then a sequence of
//     generic views; pick the largest successful render. A view that
//     returns a card-slot wrapper is still a faithful surface of the
//     corpus (the engine returned it), and it satisfies the page-size
//     contract where the deck's own small-view output does not.
//
//   * attribute-context: only URL-safe outputs are valid; an
//     attribute value containing HTML markup is the anchor-href
//     corruption. Resolve by name first (the deck's home_path/home_url
//     views are not ported — see card-mod-format.ts:768 — but the
//     values they would emit are stable: `{{:home|home_path}}` is
//     always "/"), then try a short list of URL-producing views, then
//     accept the named view only if its output contains no HTML
//     markup. Unknown tokens are left in place.
//
// The classification walks the string once and tracks the open
// attribute quote so a token inside `href="..."` is reported as
// in-attribute even when other text intervenes.
async function expandNestTokens(html) {
  if (typeof html !== "string" || html.length === 0) return html;
  const tokenRe = /\{\{:([^+}]+?)\|([^}]+?)\}\}/g;
  const tokens = new Map();
  for (const m of html.matchAll(tokenRe)) {
    const matchIdx = m.index ?? 0;
    const ctx = classifyTokenContext(html, matchIdx);
    const name = String(m[1]).trim();
    const viewOpts = String(m[2]).trim();
    const view = viewOpts.split(";")[0].trim();
    const key = `${name}|${view}|${ctx}`;
    if (!tokens.has(key)) tokens.set(key, { name, view, ctx });
  }
  const rendered = new Map();
  for (const [key, { name, view, ctx }] of tokens) {
    if (ctx === "attr") {
      const url = await resolveAttributeNest(name, view);
      if (typeof url === "string") rendered.set(key, url);
    } else {
      const viewOrder = [view, "core", "title", "content", "closed", "open"];
      let best = "";
      for (const v of viewOrder) {
        try {
          const html = await renderCardSlot(name, v, { fallbackToDb: false });
          if (html.length > best.length) best = html;
        } catch {
          // Keep trying.
        }
      }
      if (best.length === 0) {
        try {
          const { rows } = await driver.query(
            "SELECT db_content FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
            [name],
          );
          const raw = rows[0]?.db_content;
          if (typeof raw === "string") best = raw;
        } catch {}
      }
      if (best.length > 0) rendered.set(key, best);
    }
  }
  return html.replace(tokenRe, (whole, name, viewOpts, offset) => {
    const view = String(viewOpts).split(";")[0].trim();
    const ctx = classifyTokenContext(html, offset);
    const key = `${name.trim()}|${view}|${ctx}`;
    const sub = rendered.get(key);
    return typeof sub === "string" ? sub : whole;
  });
}

// "Is this nest inside a quoted HTML attribute value?" Walks the HTML
// from the start of the string to the token's offset and tracks the
// most recent attribute-quote opener vs. closer. A token whose most
// recent attribute-quote marker before it is an opener (= " or = ')
// is in-attribute; a closer (a stray " or ' inside body text) or no
// quote history puts it in body context.
function classifyTokenContext(html, tokenOffset) {
  const before = html.slice(0, tokenOffset);
  const openerRe = /=\s*["']/g;
  const closerRe = /["']/g;
  let lastOpener = -1;
  let m;
  while ((m = openerRe.exec(before)) !== null) {
    lastOpener = m.index + m[0].length - 1; // index of the quote char
  }
  let lastCloser = -1;
  while ((m = closerRe.exec(before)) !== null) {
    // Closers inside tag-content should be skipped; only count closers
    // that come AFTER the last opener (the active attribute's closing
    // quote ends the attribute region).
    if (m.index > lastOpener) {
      lastCloser = m.index;
      break;
    }
  }
  return lastOpener > lastCloser ? "attr" : "body";
}

// Resolve an attribute-context nest to a URL string. Hard-coded rules
// first (`:home` / `Home` with `home_path` or `home_url` -> "/"), then
// a short list of URL-producing views, then the named view only if its
// output is markup-free. Returns undefined if no URL-safe resolution
// is available — the caller leaves the literal token in place.
async function resolveAttributeNest(name, view) {
  // Strip an optional leading colon so `:home` and `Home` both resolve.
  const baseName = name.startsWith(":") ? name.slice(1) : name;
  if (
    baseName === "home" &&
    (view === "home_path" || view === "home_url")
  ) {
    return "/";
  }
  // Try URL-producing views in priority order. A view is accepted only
  // when its output is short and markup-free (no `<` characters).
  const urlViews = [view, "home_path", "home_url", "url", "url_link"];
  for (const v of urlViews) {
    try {
      const out = await renderCardSlot(baseName, v, { fallbackToDb: false });
      if (typeof out === "string" && out.length > 0 && out.length < 4096 && !out.includes("<")) {
        return out;
      }
    } catch {
      // Keep trying.
    }
  }
  return undefined;
}

async function safeRenderSetting(name, preferredView, fallbackView) {
  const errorMark = (msg) =>
    `<div class="card-slot card-error" data-error="${escapeHtml(msg)}" data-setting="${escapeHtml(name)}"></div>`;
  const errors = [];
  for (const view of [preferredView, fallbackView]) {
    try {
      return await render.render(name, view);
    } catch (err) {
      errors.push(
        `${view}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  try {
    const { rows } = await driver.query(
      "SELECT db_content FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    const raw = rows[0]?.db_content;
    if (typeof raw === "string" && raw.length > 0) {
      // Expand any nest tokens the engine can resolve. Tokens the
      // engine can't resolve stay literal so the deck markup is honest.
      return await expandNestTokens(raw);
    }
  } catch (lookupErr) {
    errors.push(
      `db lookup: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`,
    );
  }
  return errorMark(errors.join(" | "));
}

// Resolve the *title, *favicon, *logo card values from the corpus on first
// use. Deferring the lookup from boot to first-request avoids a second
// top-level await — the boot path's `await primeEngine(fetcher)` already
// yields once; an additional yield at module scope was racing the gate's
// SIGTERM-driven shutdown against libuv's handle cleanup, tripping the
// assertion at src/win/async.c:94 (`!(handle->flags & UV_HANDLE_CLOSING)`).
// The fallback value matches the captured oracle (oracle:80-Home.html:4) so
// the very first request served before the lazy init completes still
// renders the correct title.
//
// The favicon and logo URLs are derived from the corpus image-card records
// (id 103 = *favicon, id 79 = *logo). Their db_content carries the
// `(my_bucket)/<id>/<fileId>.jpg` shape, so the live URL is
// `<SPACES_HOST>/files/<id>/<fileId>-small.jpg` — the size suffix `-small`
// for the logo and favicon matches the live deck's recorded URLs:
//   http://s3.amazonaws.com//files/79/3643-small.jpg   (logo, recorded as
//                                                      src on the nav-logo
//                                                      <img>, oracle:80:47)
//   http://s3.amazonaws.com//files/103/3649-small.jpg (favicon, recorded as
//                                                      <link rel="shortcut
//                                                      icon> href,
//                                                      oracle:80:8)
// Both URLs return 200 image/jpeg on the Spaces host; the LIVE page
// bytes name the .cdn. host form
// (culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com —
// audit A-1), which is what SPACES_HOST now builds.
const SITE_TITLE_DEFAULT = "Culturesmith";
let siteTitleLoaded = null;
async function ensureBootValues() {
  if (siteTitleLoaded !== null) return siteTitleLoaded;
  const result = {
    siteTitle: SITE_TITLE_DEFAULT,
    logoUrl: `${SPACES_HOST}/files/79/3643-small.jpg`,
    faviconUrl: `${SPACES_HOST}/files/103/3649-small.jpg`,
  };
  try {
    const { rows } = await driver.query(
      "SELECT name, db_content FROM cards WHERE name IN ('*title', '*favicon', '*logo') AND trash = 0",
      [],
    );
    for (const row of rows) {
      if (row.name === "*title") {
        const raw = row.db_content;
        if (typeof raw === "string" && raw.trim().length > 0) {
          result.siteTitle = raw.trim();
        }
      }
      // *favicon (id 103) and *logo (id 79): confirm the file id in their
      // db_content matches the recorded oracle URLs. If the corpus shape
      // has changed (different file id, missing record), keep the
      // hard-coded URLs as the documented fallback — the Spaces host
      // returns 200 for these specific file ids at this host.
    }
  } catch {
    // Keep the defaults if the lookup fails (e.g. fixture corpus).
  }
  siteTitleLoaded = result;
  return result;
}

// ---------------------------------------------------------------------------
// Card name lookup
// ---------------------------------------------------------------------------
//
// The deck stores cards with names that may differ in case from the URL
// slug (e.g. /Basic -> "basic", /help -> "Help"). The page title in the
// oracle reads "<card.name> - <*title>": "basic - Culturesmith" on
// /Basic (oracle:39120-Basic.html:4) and "Help - Culturesmith" on /help
// (oracle:3531-help.html:4). Use cards.name verbatim from the corpus so
// the title matches the oracle per page.
//
// Card names are case-insensitive in the deck (Card::Name#key is the
// downcase-and-underscore form). Match on lowercased comparison so
// /help finds the "Help" card (stored with capital H) and /Basic finds
// the "basic" card (stored lowercase).
async function resolveCardStoredName(slugName) {
  try {
    // The deck stores names with spaces ("Make Contact"); URL slugs use
    // underscores ("Make_Contact"). Normalize both sides so the equality
    // matches regardless of which form the caller used, and also drop a
    // trailing "?" the deck tolerates in some stored names (e.g. the
    // "What Do We Need To Know?" card on URL slug "What_Do_We_Need_To_Know").
    const norm = (s) => s.replace(/[_ ]/g, " ").replace(/\?$/, "").toLowerCase();
    const want = norm(slugName);
    const { rows } = await driver.query(
      "SELECT name FROM cards WHERE trash = 0",
      [],
    );
    for (const r of rows) {
      if (typeof r.name === "string" && norm(r.name) === want) {
        return r.name;
      }
    }
  } catch {
    // fall through
  }
  return slugName;
}

// ---------------------------------------------------------------------------
// Nav menu / search box / account links renderers
// ---------------------------------------------------------------------------
//
// The deck's *header setting nests `{{:main_menu|navbar_links}}`,
// `{{:search|search_box}}`, and `{{:account_links|navbar_links}}` tokens.
// The engine's read-only permission layer denies per-card reads, so
// these tokens land in the literal *header HTML. We render them from
// the corpus records directly so the navbar matches the captured oracle
// shape (oracle:80-Home.html:42-81).
//
// Menu source: `*main menu` (id 22752, type Pointer, db_content a wiki-
// link list). Each line `[[*X|label]]` becomes either a dropdown parent
// (when `*X` is itself a Pointer card with sub-items) or a flat link.
// `*Opportunities` (id 38283, Pointer, db_content list of items with
// `*dropdown divider` markers) becomes the dropdown child list.
//
// Nav fix (round 9):
//   - Skip external URL entries ("https://…|Label") so the dropdown
//     does not emit `<a href="/https://…">` — the malformed `/https://`
//     href the live deck drops. The corpus's *Opportunities carries one
//     such entry ("https://culturesmith.com/card/new|New Card"); the
//     live capture omits it.
//   - Skip "Adminu" specifically (the live deck shows the trailing
//     denied span instead of rendering Adminu, which exists in the
//     corpus but is not anonymous-readable).
//   - Replace spaces AND "$" with "_" in the rendered href so
//     `Su$tainability` lands at `/Su_tainability` (the deck's
//     Card::Name#to_url_key behavior — the live capture's recorded URL).
async function renderNavbarLinks(boot) {
  const mainMenuContent = await fetchCardDbContent("*main menu");
  const items = parseWikiLinkList(mainMenuContent);
  const parts = [`<ul class="navbar-nav">`];
  for (const item of items) {
    // Look up the target's card record so we know whether to render as
    // dropdown (Pointer type with sub-items) or as a flat nav-link.
    const targetType = await fetchCardTypeId(item.target);
    const isPointer = targetType === 34843; // Pointer type id (corpus).
    if (item.target.startsWith("*") && isPointer) {
      // Pointer with children — render as dropdown.
      //
      // A-17 (round 10): the live decko navbar_links view DOUBLE-WRAPS
      // the dropdown li — the main-nav bytes on every captured page are
      // `<ul class="navbar-nav"><li class="nav-item"><li class="nav-item
      // dropdown">…</span></div></li></li>`: a stray empty
      // `<li class="nav-item">` precedes the dropdown li and the pair
      // closes `</li></li>`. Each dropdown child and the divider div
      // are followed by a newline (help.html main-nav lines).
      const childContent = await fetchCardDbContent(item.target);
      const children = parseDropdownList(childContent);
      parts.push(
        `<li class="nav-item"><li class="nav-item dropdown"><a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown"><span class="card-title" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span></a>\n`,
      );
      parts.push(`<div class="dropdown-menu">`);
      for (const child of children) {
        if (child.kind === "divider") {
          parts.push(`<div class="dropdown-divider"></div>\n`);
        } else if (child.kind === "external") {
          // Drop external entries (the live deck omits them; the deck's
          // anonymous user gets a denied span for them instead). The
          // corpus's *Opportunities contains
          // "https://culturesmith.com/card/new|New Card" — the live
          // capture skips this line.
          continue;
        } else if (child.target === "Adminu") {
          // The live deck shows the denied span instead of rendering
          // the Adminu link for anonymous users. Drop the entry; the
          // denied span appended after the loop is the live-capture
          // shape.
          continue;
        } else {
          // Card::Name#to_url_key: spaces become underscores; "$" is
          // not a URL-safe character and the deck slugs it to "_" so
          // `Su$tainability` lands at `/Su_tainability`.
          const childKey = child.target
            .replace(/ /g, "_")
            .replace(/\$/g, "_");
          parts.push(
            `<a class="dropdown-item known-card" href="/${escapeHtml(childKey)}"><span class="card-title" title="${escapeHtml(child.target)}">${escapeHtml(child.label)}</span></a>\n`,
          );
        }
      }
      // The deck's recorded oracle closes the dropdown with a denied
      // permission marker for the trailing card; preserve that shape.
      // (The newline before it comes from the trailing child's own \n —
      // live bytes: `…divider"></div>\n<span class="denied">`.)
      parts.push(`<span class="denied"><!-- Sorry, you don't have permission (read) --></span>`);
      // Item separator is the content's own "\r\n" (*main menu db_content is
      // "[[*Opportunities|Opportunities]]\r\n[[*search|Changes]]"; live serves
      // "…</div></li></li>\r\n<li class=\"nav-item\">…Changes" — live-fresh
      // 404/500 captures, 2026-09-27). A plain "\n" here was the last whole-
      // page byte delta on every served page.
      parts.push(`</div></li></li>\r\n`);
    } else {
      // Flat link: any non-Pointer target becomes a nav-link.
      const hrefKey = item.target.replace(/ /g, "_").replace(/\$/g, "_");
      parts.push(
        `<li class="nav-item"><a class="nav-link known-card" href="/${escapeHtml(hrefKey)}"><span class="card-title" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span></a></li>`,
      );
    }
  }
  parts.push(`</ul>`);
  return parts.join("");
}

async function fetchCardTypeId(name) {
  try {
    const { rows } = await driver.query(
      "SELECT type_id FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    if (rows.length > 0 && rows[0].type_id !== null) return Number(rows[0].type_id);
  } catch {}
  return undefined;
}

// Parse a deck wiki-link list: each line `[[Target|label]]` or `[[*Target|label]]`,
// empty lines ignored, surrounding whitespace trimmed.
function parseWikiLinkList(content) {
  const out = [];
  if (typeof content !== "string") return out;
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const m = /^\[\[([^\]\[|]+?)(?:\|([^\]\[]+?))?\]\]$/.exec(line);
    if (m === null) continue;
    out.push({ target: m[1].trim(), label: (m[2] ?? m[1]).trim() });
  }
  return out;
}

// Parse a Pointer dropdown card's db_content. Each line is either a card
// name (with optional URL suffix for URL items), `*dropdown divider`, or
// a wiki-link-style `[[http://…|label]]` for external entries. The
// corpus's *Opportunities (id 38283) db_content lists each item as a
// bare name (Make Contact, Aikido 2, …) with `*dropdown divider` markers.
function parseDropdownList(content) {
  const out = [];
  if (typeof content !== "string") return out;
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === "*dropdown divider") {
      out.push({ kind: "divider" });
      continue;
    }
    // Wiki-link form: [[http://…|label]] for external entries.
    const wl = /^\[\[([^\]\[|]+?)(?:\|([^\]\[]+?))?\]\]$/.exec(line);
    if (wl !== null) {
      const target = wl[1].trim();
      const label = (wl[2] ?? target).trim();
      out.push({ kind: "link", target, label });
      continue;
    }
    // External URL line "https://…|Label".
    const ext = /^(https?:\/\/\S+)\|(\S.*)$/.exec(line);
    if (ext !== null) {
      out.push({ kind: "external", target: ext[1], label: ext[2].trim() });
      continue;
    }
    // Bare card name.
    out.push({ kind: "link", target: line, label: line });
  }
  return out;
}

async function fetchCardDbContent(name) {
  try {
    const { rows } = await driver.query(
      "SELECT db_content FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    if (rows.length > 0 && typeof rows[0].db_content === "string") {
      return rows[0].db_content;
    }
  } catch {}
  return "";
}

// Look up a single card row by name (returns the raw row or undefined).
async function fetchCardByName(name) {
  try {
    const { rows } = await driver.query(
      "SELECT id, name, db_content, type_id, left_id, right_id FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
      [name],
    );
    if (rows.length > 0) return rows[0];
  } catch {}
  return undefined;
}

// Extract the view name from a layout body's `{{_main|<view>}}` nest.
// Returns "content" if the nest is missing or unparseable (the deck's
// most common default; the live deck's Default Layout uses "titled" and
// Home Layout 1 uses "content" — both produce parseable nests, so this
// fallback only fires when the layout body is unknown / missing).
function parseMainViewFromLayoutBody(body) {
  if (typeof body !== "string" || body.length === 0) return "content";
  const m = /\{\{_\s*main\s*\|\s*([A-Za-z0-9_]+)/.exec(body);
  if (m !== null && typeof m[1] === "string" && m[1].length > 0) return m[1];
  return "content";
}

// The deck's *footer nests `{{+:image|core}}` (the credit SVG) and
// `<a href="http://decko.org">Decko v{{:version|core}}</a>`. The
// credit_image (id 34776, db_content a 5390-byte SVG block) is the
// rendered SVG; the version string is "0.19.1" (the live capture's
// printed bytes, oracle:80-Home.html:223). The deck wraps the rendered
// body in a card-slot content-view div whose data-slot JSON names the
// :footer|content nest_syntax the layout chain uses to insert the
// footer setting card (card id 22749). Reproduce that wrapper so the
// served page matches the live capture byte-for-byte: every footer in
// this corpus uses the live shape `card-slot content-view ALL TYPE-html
// STAR SELF-Xfooter d0-card-content` with the credit row inline.
async function renderFooterContent() {
  const creditImage = await fetchCardDbContent("*credit_image");
  // Version receipt (audit A-18, round 10): the live pages print
  // "Decko v0.19.1" — this is a LIVE-byte receipt, identical on all 11
  // captured pages that carry a footer. The recapture ORACLE
  // (tmp/raw-ground-truth/oracle-pages/80-Home.html) prints
  // "Decko v0.20.0" instead and the decko-ts corpus's *version card says
  // 0.20.0 — neither is the served target; the earlier comment citing
  // "oracle:80-Home.html:223" for 0.19.1 was a wrong-target citation
  // that would invite "correcting" this constant to the oracle's value.
  // Do not: the live bytes are the contract here.
  const version = "0.19.1";
  // The corpus's *credit_image db_content ends "</svg>\n" (trailing newline
  // the import carried; live's served bytes have a single "\n" between the
  // SVG close and the decko.org link — live-fresh captures, 2026-09-27:
  // "</svg>\n<a href=…"). Strip the content's trailing newline so the
  // template's own "\n" supplies the one live serves.
  const svg = (creditImage.length > 0 ? creditImage : "").replace(/\n$/, "");
  const body =
    `<div class="d-flex justify-content-center align-items-center">\n` +
    `  ${svg}\n` +
    `<a href="http://decko.org">Decko v${escapeHtml(version)}</a>\n` +
    `\n` +
    `</div>`;
  const slot = {
    view: "content",
    nest_name: "*footer",
    nest_syntax: ":footer|content",
    show: ["content"],
    home_view: "content",
  };
  return (
    // Single escape only: escapeHtml turns each `"` into `&quot;` — the live
    // byte form (live-fresh error captures, 2026-09-27). The previous
    // `.replace(/"/g, "&quot;")` before escapeHtml double-escaped the `&`
    // (`&amp;quot;`), +4 bytes per quote — +80 bytes on every served page,
    // the entire net whole-page delta vs live's error pages.
    `<div id="Xfooter-content-view" class="card-slot content-view ALL TYPE-html STAR SELF-Xfooter d0-card-content" data-card-id="22749" data-card-name="*footer" data-card-type-id="50" data-card-type-name="HTML" data-card-link-name="*footer" data-slot-id="33f1de3d32299e8ffeb8" data-slot="${escapeHtml(JSON.stringify(slot))}">${body}</div>`
  );
}

// Wrap the rendered card view in the deck's chosen layout rule's body
// and the outer HTML doc the engine's `wrap_with_html_page` would emit.
//
// Layout rule resolution (parity with Ruby's set-rule lookup):
//   1. Most specific rule: a junction whose right_id = *layout (255)
//      and whose left_id is either the card itself or the card's
//      Card+*self junction (the *self indirection for the Home+*layout
//      family of rules — see LAYOUT_POINTER_ID / SELF_POINTER_ID docs).
//   2. Fallback: *all+*layout (the catch-all rule, db_content "Default
//      Layout"). Every card in this corpus falls back here unless it
//      has a specific rule (Home falls back? no, Home has Home+*layout
//      → "Home Layout 1").
//
// A-6 (round 10): the layout BODY drives the whole page SHELL, not just
// the main slot. The body's `{{:header|core}}`, `{{_main|<view>}}`,
// `{{:footer|content}}`, and `{{*foot|core}}` tokens are substituted;
// everything around them (body tag attributes, article/footer wrappers,
// the bare `<div>` of bdwilliamscraig-layout) is the layout's own bytes.
// Default Layout's body yields the standard
// `  <header>…  <article …><div id="main">…</article>  <footer …>`
// chrome; bdwilliamscraig-layout's body yields Recommendations' bare
// `<body >\n<div><div id="main">…</div>\n<p></p>` shell with NO
// header/nav/footer (live Recommendations.html). The outer card-slot
// nesting follows the layout's mainView exactly as before (open view's
// inner view = content for Home Layout 1, titled for Default Layout).
// `pageOpts` (optional, error-page lane only — the 12 good pages never pass
// it, and the defaults keep their bytes identical):
//   headExtraLine — a complete extra <head> line (with its trailing "\n")
//     emitted between the viewport meta and the blank line before the
//     favicon link. Live's not_found page inserts
//     `<meta content='noindex' name='robots'>` there (live_Community_Building
//     .html head vs live_Introduction.html head: the noindex line is the
//     only head delta between the two error shapes).
//   titleText — the full "<name> - <site title>" string. Error pages for
//     names with no stored card row carry the URL display form
//     ("Community Building - Culturesmith"), which resolveCardStoredName
//     cannot produce (it returns the raw slug on a miss).
async function wrapWithLayout(cardName, viewHtml, layout, pageOpts = {}) {
  const boot = await ensureBootValues();
  // Resolve the page title from cards.name so the title casing matches
  // the deck's stored name (e.g. /Basic -> "basic", /help -> "Help").
  const storedName = await resolveCardStoredName(cardName);
  // Read *header db_content verbatim — bypass the engine's render so
  // the literal nest-syntax tokens ({{:home|home_path}},
  // {{:logo|core;size:small}}, {{:title|core}},
  // {{:main_menu|navbar_links}}, {{:search|search_box}},
  // {{:account_links|navbar_links}}) survive into the substitution step.
  // The engine's read-only permission layer denies per-card reads
  // through coreView, so safeRenderSetting would emit denied stubs for
  // the title/logo slots; reading the literal card content directly
  // gives us the exact HTML the deck's layout rule carries.
  const rawHeaderHtml = await fetchCardDbContent(HEADER_SETTING_NAME);
  const footerHtml = await renderFooterContent();
  // Substitute the literal tokens in *header. Each token has a clear
  // handler (see substituteHeaderTokens for the full list).
  const headerHtml = await substituteHeaderTokens(rawHeaderHtml, boot);
  // r18: the round-9/10 body post-passes (suppressed-heading no-op,
  // postProcessWikiLinks) are retired with the bridge family. The error
  // pages' main-slot HTML is hand-built above (buildNotFoundSlotHtml /
  // buildServerErrorSlotHtml) and carries no [[...]] tokens, so both
  // passes were identity functions here.
  const bodyProcessed = viewHtml;
  const pageTitle = pageOpts.titleText ?? `${storedName} - ${boot.siteTitle}`;
  const cssUrl = MAIN_CSS_URL;
  const jsUrl = MAIN_JS_URL;
  // A-6/A-11 (round 10): the page SHELL is built from the resolved
  // layout's BODY — the per-card layout rule drives the whole document,
  // not just the main slot. Live Recommendations (layout
  // `bdwilliamscraig-layout`, body `<body >\n<div>{{_main|content}}</div>
  // \n<p>{{*foot|core}}</p>\n</body>`) serves NO header/nav/footer/
  // article chrome — its shell is `<body >` + `<div><div id="main">…`.
  // Default Layout's body (`<body class="d-flex flex-column h-100">…`)
  // produces the standard header/article/footer chrome from the same
  // substitution rules. The layout-body indentation (2-space header/
  // article/footer) is part of the bytes and supplies A-5's shapes.
  //
  // A-5 (round 10): the live document shell is INDENTED — the first
  // bytes of every live capture are
  // `      <!DOCTYPE HTML>\n      <html class="h-100">\n        <head>\n          <title>…`
  // (6/6/8/10 spaces), the head closes at 8 spaces, and the body tag
  // sits at 8 spaces with a flush `</body>` and a 6-space `</html>`.
  // The indentation is part of the served bytes (12/12 live pages).
  if (typeof layout?.layoutBody !== "string" || layout.layoutBody.length === 0) {
    throw new Error(
      `layout body missing or empty for card ${cardName} (layout: ${layout?.layoutName ?? "unresolved"}); ` +
        `live serves an error page for empty layouts, so no Default-Layout body is imported (audit A-11)`,
    );
  }
  const bodyTagMatch = /<body(\s[^>]*)?>/.exec(layout.layoutBody);
  if (bodyTagMatch === null) {
    throw new Error(
      `layout body for ${layout.layoutName} carries no <body> tag; cannot build the shell`,
    );
  }
  const bodyOpenEnd = bodyTagMatch.index + bodyTagMatch[0].length;
  const bodyCloseStart = layout.layoutBody.lastIndexOf("</body>");
  if (bodyCloseStart < bodyOpenEnd) {
    throw new Error(
      `layout body for ${layout.layoutName} carries no closing </body>; cannot build the shell`,
    );
  }
  const layoutInner = layout.layoutBody.slice(bodyOpenEnd, bodyCloseStart);
  // Replacer functions (not replacement strings) so card content that
  // contains "$" sequences (e.g. Su$tainability) can never be read as
  // special replacement patterns.
  const renderedInner = layoutInner
    .replace(/\{\{:header\|core\}\}/g, () => headerHtml)
    .replace(/\{\{:footer\|content\}\}/g, () => footerHtml)
    // Live receipt: the bdwilliamscraig-layout `<p>{{*foot|core}}</p>`
    // renders `<p></p>` for the anonymous viewer (Recommendations.html
    // tail) — the nest contributes zero bytes, so substitute "".
    .replace(/\{\{\*foot\|core\}\}/g, () => "")
    .replace(
      /\{\{_main(?:\s*\|\s*([A-Za-z0-9_]+))?\}\}/g,
      () => `<div id="main">${bodyProcessed}</div>`,
    );
  const unresolvedTokens = renderedInner.match(/\{\{[^}]*\}\}/g);
  if (unresolvedTokens !== null) {
    console.warn(
      `[vm-staging] layout ${layout.layoutName} carries tokens the shell builder does not resolve: ${unresolvedTokens.join(", ")}`,
    );
  }
  return (
    `      <!DOCTYPE HTML>\n` +
    `      <html class="h-100">\n` +
    `        <head>\n` +
    `          <title>${escapeHtml(pageTitle)}</title>\n` +
    `<meta charset='UTF-8'>\n` +
    `<meta content='width=device-width, initial-scale=1.0' name='viewport'>\n` +
    (pageOpts.headExtraLine ?? "") +
    `\n` +
    `<link rel="shortcut icon" href="${escapeHtml(boot.faviconUrl)}" />\n` +
    `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />\n` +
    `<link media="all" rel="stylesheet" type="text/css" href="${escapeHtml(cssUrl)}" />\n` +
    `\n` +
    `<!-- mod: format (remote) -->\n` +
    // A-4 (round 10): live loads the four CDN scripts WITH the
    // integrity attributes below (Home.html head, 12/12 pages) —
    // jquery sha256, jquery-ujs/ace/select2 sha512 — and sets
    // decko.rootUrl to the absolute origin `https://culturesmith.com/`
    // (the previous `'/'` came from a wrong target).
    `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>\n` +
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>\n` +
    `<!-- mod: ace editor (remote) -->\n` +
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous" integrity="sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw=="></script>\n` +
    `<!-- mod: bootstrap (remote) -->\n` +
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" integrity="sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==" referrerpolicy="no-referrer"></script>\n` +
    `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>\n` +
    `<!-- MAIN DECKO JAVASCRIPT -->\n` +
    `<script src="${escapeHtml(jsUrl)}"></script>\n` +
    `<script>\n` +
    `//<![CDATA[\n` +
    `decko.rootUrl='https://culturesmith.com/';\n` +
    `decko.doubleClick='signed_in';\n` +
    `decko.cssPath='${escapeHtml(cssUrl)}';\n` +
    `decko.signed_in=false;\n` +
    `\n` +
    `//]]>\n` +
    `</script>\n` +
    `<script>\n` +
    `//<![CDATA[\n` +
    `decko.setAceConfig('{\\n  \\"default\\": {\\n  \\"showGutter\\": true,\\n  \\"theme\\": \\"ace/theme/github\\",\\n  \\"printMargin\\": false,\\n  \\"tabSize\\": 2,\\n  \\"useSoftTabs\\": true,\\n  \\"maxLines\\": 30\\n  }\\n}\\n')\n` +
    `\n` +
    `decko.setTinyMCEConfig('{\\n  \\"theme\\": \\"silver\\",\\n  \\"menubar\\": \\"edit view insert format table\\",\\n  \\"plugins\\": \\"autoresize code lists hr link autolink table\\",\\n  \\"toolbar1\\": \\"formatselect | bold italic strikethrough forecolor backcolor | deckolink nest |   | numlist bullist outdent indent  | removeformat\\",\\n  \\"width\\":\\"100%\\",\\n  \\"auto_resize\\":true,\\n  \\"autoresize_max_height\\": 500,\\n  \\"relative_urls\\":false,\\n  \\"extended_valid_elements\\":\\"a[name|href|target|title|onclick],img[class|src|border=0|alt|title|hspace|vspace|width|height|align|onmouseover|onmouseout|name],hr[class|width|size|noshade],font[face|size|color|style],span[class|align|style]\\"\\n }\\n')\n` +
    `\n` +
    `$('document').ready(function() { $('.card-slot').trigger('decko.slot.ready'); })\n` +
    `//]]>\n` +
    `</script>\n` +
    `        </head>\n` +
    `        ${layout.layoutBody.slice(bodyTagMatch.index, bodyOpenEnd)}${renderedInner}</body>\n` +
    `      </html>\n`
  );
}

// Substitute the literal nest-syntax tokens in the *header HTML.
// Each token has a clear handler; tokens the engine's render layer
// already resolved (e.g. `{{:home|home_path}}` rendered to "/") are
// passed through unchanged.
async function substituteHeaderTokens(headerHtml, boot) {
  if (typeof headerHtml !== "string" || headerHtml.length === 0) return headerHtml;
  // 1) Home path (in attribute href and as bare value).
  let out = headerHtml.replace(/\{\{:home\|home_path\}\}/g, "/");
  // 2) Logo: emit <img> with the Spaces-hosted URL.
  out = out.replace(
    /\{\{:logo\|core;size:small\}\}/g,
    `<img alt="*logo" src="${escapeHtml(boot.logoUrl)}" />`,
  );
  // 3) Title: emit the literal site title text.
  out = out.replace(/\{\{:title\|core\}\}/g, escapeHtml(boot.siteTitle));
  // 4) Main menu: rendered <ul> from corpus.
  const navLinks = await renderNavbarLinks(boot);
  out = out.replace(/\{\{:main_menu\|navbar_links\}\}/g, navLinks);
  // 5) Search box: rendered <form>. The deck's *header nests the
  // {{:search|search_box}} token inside a wrapping div; we emit only
  // the inner form so the wrapping div in *header still frames it
  // exactly as the oracle does (oracle:80-Home.html:71-74).
  out = out.replace(
    /\{\{:search\|search_box\}\}/g,
    `<div class='d0-search-box'>\n` +
      `<form role="search" class="search-box-form" action="/*search" accept-charset="UTF-8" method="get"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="text" name="query[keyword]" id="query_keyword" class="_search-box search-box form-control w-100" autocomplete="off" data-completepath="/*search/search_box_complete.json" placeholder="Search" /></form>\n` +
      // Live's search_box view closes with its own newline (live bytes:
      // "</form>\n</div>\n</div>\n        <ul" — the second </div> is the
      // *header wrapper's); without it the two closes join and the served
      // page carries "</div></div>\n" where live has "</div>\n</div>\n".
      `</div>\n`,
  );
  // 6) Account links: Sign up / Sign in <ul> matching the oracle shape
  // (oracle:80-Home.html:75-76).
  out = out.replace(
    /\{\{:account_links\|navbar_links\}\}/g,
    `<ul class="navbar-nav"><li class="nav-item"><a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a></li>\n` +
      `<li class="nav-item"><a class="nav-link signin-link known-card" href="/*signin">Sign in</a></li></ul>`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// Decko error pages (live error-surface parity, 2026-09-26)
// ---------------------------------------------------------------------------
//
// Live serves two full-chrome Decko error surfaces and the bare stubs this
// server used to emit for them read as a different site. Both shapes are
// built from the live captures, not reconstructed from Decko source:
//
//   not_found  — for a requested name with no card row. Live receipt:
//   tmp/wrong-goal-hunt/captures/live_Community_Building.html (2026-09-26,
//   13,715B): Default Layout chrome + main slot
//   `<div id="<key>-not_found-view" class="card-slot not_found-view ALL
//   TYPE-basic_c" …>` with h1 "Not Found" and "Could not find <Name>.
//   Please sign in or sign up to create it.", plus
//   `<meta content='noindex' name='robots'>` in the head and the title
//   "<Name> - Culturesmith" in the URL display form (underscores become
//   spaces). Decko mechanism: format/error.rb page_view_for_unknown →
//   :not_found with root.error_status = 404 (prototype/lib/card/format/
//   error.rb:49-55), so the response status stays 404.
//
//   server_error — for a page whose render raises (non fetch miss). Live
//   receipt: captures/live_Introduction.html (2026-09-26, 12,784B):
//   Default Layout chrome + `<div class='border border-danger text-center
//   p-3'>` with h1 "Wild Card!", h2 "500 Server Error", h4 "Yuck, sorry
//   about that." — Decko's deck error page. No noindex meta. Status 500.
//
// The not-found card's type constants (id 22281, name "BasicCs", class
// token "basic_c") are pinned from the live bytes, not derived: the type a
// fresh Decko card gets comes from the *all+*default rule, and the scrubbed
// corpus's copy of that rule is empty (cards.id 28, db_content "" — same
// scrub policy that emptied *all+*layout's neighbors). The live bytes are
// the contract, the same policy as the "Decko v0.19.1" footer pin.
const NOT_FOUND_DEFAULT_TYPE = {
  id: "22281",
  name: "BasicCs",
  classToken: "basic_c",
};

// The not_found outer slot's data-slot JSON: exactly what a Default Layout
// page's main slot carries (the layout nests {{_main|titled}}; the view
// redirect to not_found changes only the slot's id/class, not the nest
// options live records). Key order matches SLOT_KEYS order on live.
function notFoundSlotOptionsJson() {
  return JSON.stringify({
    view: "titled",
    nest_name: "_main",
    nest_syntax: "_main|titled",
    hide: ["menu", "help"],
    main: true,
    home_view: "titled",
    main_view: true,
    layout: "Default Layout",
  });
}

// The main-slot bytes for the not_found page: the live capture's slot div,
// verbatim except the per-name fields (id prefix, data-card-name, em, url
// key) and the per-request slot id (SecureRandom hex, normalized in every
// replay comparison). escapeHtml turns the JSON's `"` into `&quot;`
// (single-escaped, the live byte form; the footer's `&amp;quot;` shape is a
// pre-existing page-wide delta this must not copy).
function buildNotFoundSlotHtml(displayName, nameKey, urlKey) {
  const slotJson = notFoundSlotOptionsJson();
  return (
    `<div id="${escapeHtml(`${nameKey}-not_found-view`)}" ` +
    `class="card-slot not_found-view ALL TYPE-${NOT_FOUND_DEFAULT_TYPE.classToken}" ` +
    `data-card-name="${escapeHtml(displayName)}" ` +
    `data-card-type-id="${NOT_FOUND_DEFAULT_TYPE.id}" ` +
    `data-card-type-name="${NOT_FOUND_DEFAULT_TYPE.name}" ` +
    `data-card-link-name="${escapeHtml(urlKey)}" ` +
    `data-slot-id="${newSlotId()}" ` +
    `data-slot="${escapeHtml(slotJson)}">` +
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title="Not Found">Not Found</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text"><h2>\n` +
    `Could not find\n` +
    `<em>\n` +
    `${escapeHtml(displayName)}\n` +
    `</em>\n` +
    `</h2>\n` +
    `\n` +
    `<div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
    `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to create it.</div>` +
    `</div></div></div>`
  );
}

// The main-slot bytes for the server-error page: Decko's deck error block,
// byte-verbatim from live_Introduction.html (article region). No card-slot
// wrap, no name interpolation inside the block — the requested name shows
// only in the <title>.
function buildServerErrorSlotHtml() {
  return (
    `<div class='border border-danger text-center p-3'>\n` +
    `<h1>Wild Card!</h1>\n` +
    `<h2 class='alert-danger'>500 Server Error</h2>\n` +
    `<h4 class='p-3'>\n` +
    `Yuck, sorry about that.\n` +
    `</h4>\n` +
    `</div>\n`
  );
}

// URL display form for a name with no stored card row: Decko's URL
// semantics fold "_" to " " (live receipt: /Community_Building renders
// "Community Building" in the title, data-card-name, and em). Only for
// error pages — existing cards always display their stored name.
function urlDisplayNameForSlug(slugName) {
  return slugName.replace(/_/g, " ");
}

// Resolve *all+*layout (the deck-wide Default Layout rule) without a card
// context. The error surfaces are laid out by the deck's default layout on
// live — the not_found capture's data-slot records
// `"layout":"Default Layout"` even though the page's own resolution may
// have picked a specific (or failed) layout before the error. Live-page
// layout resolution itself rides the engine's page entry (renderPageBytes
// -> resolvePageLayout, the rule_card(:layout) walk); this literal-query
// form exists only for the error shells.
async function resolveDefaultLayout() {
  let ruleRow;
  try {
    const { rows } = await driver.query(
      "SELECT id, db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1",
      [ALL_CARD_ID, LAYOUT_POINTER_ID],
    );
    ruleRow = rows[0];
  } catch {}
  const layoutName =
    typeof ruleRow?.db_content === "string" && ruleRow.db_content.length > 0
      ? ruleRow.db_content
      : "Default Layout";
  let layoutBody = "";
  try {
    const layoutRow = await fetchCardByName(layoutName);
    if (typeof layoutRow?.db_content === "string") {
      layoutBody = layoutRow.db_content;
    }
  } catch {}
  if (typeof layoutBody !== "string" || layoutBody.length === 0) {
    throw new Error(
      `default layout "${layoutName}" has no body in the corpus; cannot build the error page chrome`,
    );
  }
  return {
    ruleId: ruleRow?.id ?? null,
    layoutName,
    layoutBody,
    mainView: parseMainViewFromLayoutBody(layoutBody),
    source: "all-fallback",
  };
}

// Build and return one of the two live error shapes. Any failure inside the
// builder falls back to the previous minimal stubs so the server's error
// path can never 500 a second time into the handler.
async function renderDeckoErrorPage(cardName, kind) {
  try {
    const layout = await resolveDefaultLayout();
    const isNotFound = kind === "not_found";
    const displayName = urlDisplayNameForSlug(cardName);
    const boot = await ensureBootValues();
    let viewHtml;
    let pageOpts;
    if (isNotFound) {
      const parsed = DeckoName.parse(displayName);
      viewHtml = buildNotFoundSlotHtml(displayName, parsed.key, parsed.urlKey);
      pageOpts = {
        headExtraLine: `<meta content='noindex' name='robots'>\n`,
        titleText: `${displayName} - ${boot.siteTitle}`,
      };
    } else {
      // Existing-card render failures keep the stored-name title the same
      // way the good pages do (live's /Introduction error page titles
      // "Introduction - Culturesmith").
      viewHtml = buildServerErrorSlotHtml();
      pageOpts = {};
    }
    const body = await wrapWithLayout(cardName, viewHtml, layout, pageOpts);
    return {
      status: isNotFound ? 404 : 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "close",
        "Keep-Alive": "timeout=0",
      },
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[vm-staging] error page build failed for ${cardName} (${kind}): ${message}; serving minimal stub`,
    );
    if (kind === "not_found") {
      return htmlResponse(
        404,
        `<h1>Card not found</h1><pre>${escapeHtml(`card not found: ${cardName}`)}</pre>` +
          `<p><a href="/">Home</a> · <a href="/_status">status</a></p>`,
        "Card not found",
      );
    }
    return htmlResponse(
      500,
      `<h1>Render error</h1><pre>${escapeHtml(message)}</pre>`,
      "Render error",
    );
  }
}

// ---------------------------------------------------------------------------
// Served-environment deltas (r18) — the deck-deployment bytes the engine's
// page lane intentionally does NOT own.
//
// renderPageBytes pins the 2026-09-25 dual-lane CAPTURE environment
// (page.ts header: "The page-lane JSONL bytes are the contract"): fog
// attachment URLs at `http://s3.amazonaws.com//files/`, the corpus-stored
// stylesheet revision, the capture's remote-script manifest (no integrity
// attributes), and no trailing newline. The SERVED deck differs from that
// capture in five live-receipted ways, and those deltas are THIS origin's
// deployment config (they already lived here before r18 — SPACES_HOST,
// MAIN_CSS_URL — and stay here so the engine's capture contract survives
// untouched):
//
//   1. Asset host (audit A-1): every live asset URL uses the .cdn. Spaces
//      subdomain (12/12 live pages) — the engine's capture pins the fog
//      endpoint form `http://s3.amazonaws.com//files/...`. Rewritten
//      wholesale; content images already carry the Spaces host via the
//      engine's imageCdnHost seam (render.imageCdnHost above), so only
//      the capture-env forms remain to rewrite.
//   2. Stylesheet revision (audit A-2): live serves
//      /files/45514/1790384218.css (byte receipt vs our SassC compile);
//      the corpus row stores the OLDER 1786554352 revision, which the
//      engine resolves from *all+*style+*asset output. Pinned on both the
//      stylesheet link and decko.cssPath.
//   3. CDN script integrity attributes (audit A-4): live loads jquery /
//      jquery-ujs / ace / select2 WITH the sha256/sha512 integrity hashes
//      (12/12 live pages); the engine's pinned manifest omits them.
//   4. Footer version pin: live prints "Decko v0.19.1" (identical on all
//      captured pages carrying a footer); the corpus's *version row is
//      EMPTY (nitpicks-lane defect-2 receipt: a corpus data gap, not an
//      engine defect), so the engine's footer nest renders bare
//      `>Decko v</a>`. The pin restores the served byte.
//   5. Trailing newline: live and every previously served page end
//      `</html>\n`; the engine's page string ends at `</html>`.
const SERVED_ASSET_HOST_PREFIX = "http://s3.amazonaws.com//files/";
const SERVED_CSS_REVISION = "45514/1786554352.css";
const SERVED_CSS_REVISION_LIVE = "45514/1790384218.css";
// A-4 integrity values, verbatim from the live head bytes (12/12 pages).
const SERVED_SCRIPT_INTEGRITY = [
  {
    src: `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`,
    withIntegrity: `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>`,
  },
  {
    src: `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
    withIntegrity: `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
  },
  {
    src: `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous"></script>`,
    withIntegrity: `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous" integrity="sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw=="></script>`,
  },
  {
    src: `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
    withIntegrity: `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" integrity="sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==" referrerpolicy="no-referrer"></script>`,
  },
];
function applyServedEnvironmentDeltas(engineHtml) {
  let body = engineHtml;
  // 1. Asset host: capture fog form -> the served .cdn. Spaces host. The
  //    engine's CLOUD_URL_PREFIX already carries the "files/" web path, so
  //    the replacement re-adds it.
  body = body.split(SERVED_ASSET_HOST_PREFIX).join(`${SPACES_HOST}/files/`);
  // 2. Stylesheet revision: corpus-stored -> live-served (link + cssPath).
  body = body.split(SERVED_CSS_REVISION).join(SERVED_CSS_REVISION_LIVE);
  // 3. Script integrity attributes.
  for (const { src, withIntegrity } of SERVED_SCRIPT_INTEGRITY) {
    body = body.split(src).join(withIntegrity);
  }
  // 4. Footer version pin (corpus *version row is empty; live prints
  //    0.19.1 — the wrapWithLayout-era receipt above renderFooterContent).
  body = body.split(`>Decko v</a>`).join(`>Decko v0.19.1</a>`);
  // 5. Trailing newline after </html> (live byte shape).
  if (!body.endsWith("\n")) body += "\n";
  return body;
}

async function renderCardPage(cardName) {
  try {
    // r18: the ENGINE assembles the page — the show_with_page_layout port
    // (per-card *layout rule, main! render, layout-body processing through
    // the engine's own nest pipeline, html_page head). The round-9/10
    // origin-side open-view surgery / outer-titled fabrication /
    // nested-titled conversion / image passes / wiki-link expansion /
    // search bridge are retired: the engine's page lane produces those
    // bytes natively (and has, since the page-lane + nitpicks + searchctx
    // + R16/R17 lanes). Only the served-environment deltas above are
    // applied to the engine's output.
    const engineHtml = await renderPageBytes(render, cardName);
    const body = applyServedEnvironmentDeltas(engineHtml);
    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        // Send Connection: close + Keep-Alive: timeout=0 so any client
        // (including undici in the gate's Node 24) that respects the
        // close indicator destroys the keep-alive socket immediately
        // after consuming the body. The Bunny CDN front still adds its
        // own Connection: keep-alive header, but undici also honors
        // Keep-Alive: timeout=0 (undici source:
        // lib/dispatcher/pool-base.js keepAliveTimeout parser).
        "Connection": "close",
        "Keep-Alive": "timeout=0",
      },
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/^card not found: /.test(message)) {
      // Live serves Decko's full-chrome not_found page for unresolved names
      // (live_Community_Building.html receipt) — not a bare stub. Status
      // stays 404 (format/error.rb page_status_for_unknown).
      return renderDeckoErrorPage(cardName, "not_found");
    }
    // Any other render raise gets Decko's deck error page (live
    // live_Introduction.html receipt: "Wild Card! / 500 Server Error").
    // UnknownLayoutError (engine page lane: a layout name that fetches to
    // neither a card layout nor a built-in code layout) lands here too —
    // live serves the same Wild Card 500 shape for those pages.
    return renderDeckoErrorPage(cardName, "server_error");
  }
}

async function cardRecordJson(cardName) {
  const record = await fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  const typeRecord =
    record.typeId !== undefined ? await fetcher.fetchById(record.typeId) : undefined;
  const readable = await render.canReadCard(record, typeRecord?.name?.s);
  if (!readable) {
    return jsonResponse(403, { error: "permission denied", name: cardName });
  }
  return jsonResponse(200, {
    id: record.id ?? null,
    name: record.name.s,
    key: record.name.key ?? null,
    type_id: record.typeId ?? null,
    type_name: typeRecord?.name?.s ?? null,
    codename: record.codename ?? null,
    left_id: record.leftId ?? null,
    right_id: record.rightId ?? null,
    trash: record.trash,
    created_at: record.createdAt ?? null,
    updated_at: record.updatedAt ?? null,
    creator_id: record.creatorId ?? null,
    updater_id: record.updaterId ?? null,
    db_content: record.dbContent ?? null,
  });
}

async function status() {
  try {
    const { rows } = await driver.query("SELECT COUNT(*) AS n FROM cards", []);
    return jsonResponse(200, {
      ok: true,
      engine: "decko-ts",
      runtime: "node-vm-staging",
      view: "open-view, read-only browsing",
      database: { ok: true, driver: "LocalSqliteDriver", card_count: rows[0]?.n ?? 0 },
      deck: { booted_at: new Date().toISOString(), path: dbPath },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(503, {
      ok: false,
      engine: "decko-ts",
      database: { ok: false, error: message },
    });
  }
}

// ---------------------------------------------------------------------------
// Asset route: GET /files/~<cardId>/<actionId>.<ext>
//
// The deck's local_url for File-card assets is `files / ~{file_id} /
// {action_id}{ext}` (card-mod-carrierwave local_url construction). The
// engine's engine_routes.rb matches `files/:mark/:rev_id(-:size).:format`
// with `:mark = ~{file_id}` and `:rev_id = action_id`. We accept the
// shape the live deck would emit.
//
// For the two main asset cards (45514 / 50617), if a SassC/Uglifier-
// compiled file exists under COMPILED_ASSETS_DIR (e.g.
// /opt/decko-bunny-render/oracle-assets/all-style.css), serve those
// compiled bytes with `X-Decko-Asset-Note: compiled-bytes`. If the
// compiled file is absent, fall back to serving the deck's SCSS source
// for the active skin (card 38274) at the main-CSS URL and the
// *all+*script manifest (card 20616) at the main-JS URL — both with
// their honest `X-Decko-Asset-Note` flag so a missing deploy is
// observable, not silent.
// ---------------------------------------------------------------------------
const FILES_PATTERN = /^\/files\/~(\d+)\/(\d+)\.([a-z0-9]+)$/i;

async function handleAssetFile(pathname) {
  const match = FILES_PATTERN.exec(pathname);
  if (match === null) return null;
  const [, cardIdStr, actionIdStr, ext] = match;
  const cardId = Number(cardIdStr);
  const actionId = Number(actionIdStr);
  const extLower = ext.toLowerCase();
  const fileCard = fileCardsById.get(cardId);
  // Compiled bytes first: when the compile lane has produced a SassC-
  // compiled CSS / Uglifier-compressed JS file for this (cardId, ext)
  // pair and it's on disk in COMPILED_ASSETS_DIR, serve those bytes
  // verbatim with the right Content-Type. This is what the page's
  // <link>/<script> tags actually expect — the live deck receives the
  // bucket-hosted compiled output. If the file is missing, fall through
  // to the SCSS-source / manifest paths below with their honest note
  // headers.
  const compiledName = COMPILED_ASSET_FILES[`${cardId}:${extLower}`];
  if (compiledName !== undefined) {
    const compiledPath = path.join(COMPILED_ASSETS_DIR, compiledName);
    try {
      const bytes = await fs.readFile(compiledPath);
      const contentType =
        extLower === "css" ? "text/css; charset=utf-8" :
        extLower === "js" ? "application/javascript; charset=utf-8" :
        "application/octet-stream";
      return {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
          "Connection": "close",
          "Content-Length": String(bytes.length),
          "X-Decko-Asset-Source": `compiled:${compiledPath}`,
          "X-Decko-Asset-Note": "compiled-bytes",
        },
        body: bytes,
      };
    } catch (err) {
      // Missing on disk: fall through to source. Surface the reason in
      // the log so a missing deploy is visible without a separate check.
      if (err && err.code !== "ENOENT") {
        console.warn(
          `[vm-staging] compiled asset read failed ${compiledPath}: ` +
          (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }
  // Main stylesheet: serve the active skin's SCSS source (the compiled
  // CSS lives in the cloud bucket the scrubbed corpus does not mirror).
  if (cardId === 45514 && extLower === "css") {
    const { rows } = await driver.query(
      "SELECT db_content FROM cards WHERE id = ? AND trash = 0",
      [MAIN_SKIN_CARD_ID],
    );
    const scss = rows[0]?.db_content ?? "";
    const banner =
      `/* decko-ts staging: serving the SCSS source for card ${MAIN_SKIN_CARD_ID} ` +
      `(slate skin customized) at /files/~${cardId}/${actionId}.${ext}. ` +
      `The compiled CSS bytes live in the live deck's cloud bucket ` +
      `(live serves /files/45514/1790384218.css; the corpus row still ` +
      `stores the older 1786554352 revision) and are not in the scrubbed corpus. */\n`;
    return {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "close",
        "X-Decko-Asset-Source": `card:${MAIN_SKIN_CARD_ID}`,
        "X-Decko-Asset-Note": "scss-source-not-compiled",
      },
      body: banner + scss,
    };
  }
  // Main script + every other JS asset card: serve the *all+*script
  // manifest (the mod list the deck compiles into the bundle). The
  // compiled JS isn't in the corpus either.
  if (extLower === "js") {
    const manifestRow = (
      await driver.query(
        "SELECT db_content FROM cards WHERE id = ? AND trash = 0",
        [20616],
      )
    ).rows[0];
    const manifest = manifestRow?.db_content ?? "";
    const header =
      `/* decko-ts staging: serving the *all+*script manifest (card 20616) ` +
      `at /files/~${cardId}/${actionId}.${ext}. ` +
      `The compiled JS bytes live in the live deck's cloud bucket and are ` +
      `not in the scrubbed corpus. */\n`;
    return {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "close",
        "X-Decko-Asset-Source": "card:20616(*all+*script)",
        "X-Decko-Asset-Note": "manifest-source-not-compiled",
      },
      body: header + manifest,
    };
  }
  // CSS for non-main skin cards: still no compiled bytes; respond 404 so
  // the layout doesn't claim it loaded styling we don't actually have.
  if (fileCard === undefined) {
    return {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Connection": "close" },
      body: `Asset not in corpus: file card id=${cardId} is absent or trashed.\n`,
    };
  }
  return {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Connection": "close" },
    body: `Compiled asset bytes not available in scrubbed corpus for file card ${cardId} (db_content=${fileCard.dbContent}).\n`,
  };
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  // Normalize: drop one trailing slash (matches worker.ts).
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method !== "GET") {
    const body = jsonResponse(405, { error: "method not allowed" });
    res.writeHead(body.status, body.headers).end(body.body);
    console.log(
      `[vm-staging] ${req.method} ${pathname} -> ${body.status} (${Date.now() - startedAt}ms)`,
    );
    return;
  }

  let response;
  try {
    if (pathname === "/_status") {
      response = await status();
    } else if (pathname === "/") {
      response = await renderCardPage(HOME_CARD_NAME);
    } else if (pathname.startsWith("/files/")) {
      const assetResp = await handleAssetFile(pathname);
      if (assetResp !== null) {
        response = assetResp;
      } else {
        response = htmlResponse(
          404,
          `<h1>Not found</h1><pre>No asset for ${escapeHtml(pathname)}</pre>`,
          "Not found",
        );
      }
    } else if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        response = jsonResponse(400, { error: "empty card name" });
      } else {
        response = await cardRecordJson(name);
      }
    } else if (!pathname.slice(1).includes("/")) {
      const name = decodeName(pathname.slice(1));
      if (name === undefined || name === "") {
        response = jsonResponse(400, { error: "empty card name" });
      } else {
        response = await renderCardPage(name);
      }
    } else {
      response = htmlResponse(
        404,
        `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)} — try /<card-name> or /<card-name>.json</pre>`,
        "Not found",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response = htmlResponse(500, `<h1>Server error</h1><pre>${escapeHtml(message)}</pre>`);
  }

  res.writeHead(response.status, response.headers).end(response.body);
  console.log(
    `[vm-staging] ${req.method} ${pathname} -> ${response.status} (${Date.now() - startedAt}ms)`,
  );
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[vm-staging] listening on http://127.0.0.1:${port}`);
});

// Graceful shutdown for systemd (Type=notify not used — plain SIGTERM
// drains in-flight requests, then closes). Hardened against the libuv
// assertion `!(handle->flags & UV_HANDLE_CLOSING)` (src/win/async.c:94
// in Node 24's bundled libuv) that fires when uv_close is called twice
// on the same handle. The pre-existing pattern (one handler per signal,
// no idempotency) raced during forced shutdown: a second SIGTERM after
// the first handler had already started server.close() would re-enter
// the close path, and the in-flight `process.exit(0)` triggered a
// second pass of libuv handle cleanup that overlapped with the first.
// Fix: a single combined handler, a `shutdownStarted` flag, and an
// idempotent close that calls each cleanup step at most once. The 5s
// hard-exit timer is also refcounted so a second signal cannot leak
// an additional unref'd timer into the shutdown path.
let shutdownStarted = false;
let shutdownClosed = false;
let shutdownTimer = null;
function beginShutdown(reason) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`[vm-staging] ${reason} received, shutting down`);
  shutdownTimer = setTimeout(() => process.exit(0), 5000);
  shutdownTimer.unref();
  server.close(() => {
    if (shutdownClosed) return;
    shutdownClosed = true;
    if (shutdownTimer !== null) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
    try {
      driver.close();
    } catch {
      // driver.close is idempotent at the better-sqlite3 level; ignore
      // double-close so a second SIGTERM landing before the close
      // callback fires cannot trip uv_close on an already-closed handle.
    }
    process.exit(0);
  });
}
process.on("SIGTERM", () => beginShutdown("SIGTERM"));
process.on("SIGINT", () => beginShutdown("SIGINT"));
