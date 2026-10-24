// vm-staging-server.mjs — Node HTTP staging copy of the decko-ts
// engine, served from a configurable asset directory so a developer can click
// through real pages in a browser while parity work continues.
// Read-only browse PLUS a session sign-in surface: no editing, no search.
// Every anonymous GET byte is unchanged — the sign-in endpoints are additive.
//
// Routes (the engine-canonical surface, mirrors deploy/worker.ts):
//   GET /                 -> render "Home" card page (HTML, full shell)
//   GET /_status          -> engine + database health JSON
//   GET /_signin          -> the staging sign-in form page
//                            (Default Layout chrome; the served deck renders
//                            the *signin card's own form at this route —
//                            set/self/signin.rb — which the TS engine
//                            cannot render: the account-mod form views
//                            are unported rails)
//   GET /<card-name>      -> render that card page (HTML, full shell)
//   GET /<card-name>.json -> the card record as JSON
//   GET /files/~<id>/<rev>.<ext> -> asset bytes from the corpus's File
//                                   cards (compiled CSS/JS bytes are NOT
//                                   in the scrubbed corpus — these routes
//                                   serve what's available so the layout
//                                   references resolve rather than 404).
//   POST /_signin         -> staging sign-in: identifier (email or name)
//                            + password, verified against the corpus's
//                            real +*account+*password digests (Ruby's
//                            salted SHA-1, Card::Auth.encrypt
//                            auth.rb:36-39 — NOT bcrypt); issues a
//                            session cookie on success
//   POST /_signout        -> staging sign-out: revokes the presented
//                            session (card-mod-account's :signout event
//                            semantics, set/self/signin.rb:25-29)
//   POST /_reset-request  -> the :send_reset_password_token
//                            event (set/self/signin.rb:27-31) — email in,
//                            reset email with the token link out (transport
//                            NOOP unless DECKO_MAIL_CAPTURE=1, which also
//                            exposes GET /_mail-log to drain the capture)
//   GET  /update/<mark>   -> the EMAILED LINK consumption
//        ?card[trigger]=     (set/right/account/views.rb:34-38 token_url;
//        reset_password|     Ruby consumes it via engine_routes' explicit
//        verify_and_activate GET alternative into card#update) — the JWT
//        &token=<jwt>        authenticator + trigger event; 303 to the
//                            +account edit view's PATH address
//                            (/<url_key>/edit) on success. Scoped to
//                            exactly this trigger+token shape; every other
//                            GET stays read-only (write-routes' posture).
//   POST /_account-password -> the +account edit form
//                            submit's staging endpoint (the +*password
//                            validate/store events, set/right/password.rb)
//                            — session cookie required, writes the member's
//                            own digest
//   anything else         -> Decko's full-chrome error pages: an unresolved
//                             card name gets the
//                             not_found page (404, Default Layout chrome,
//                             "Not Found" frame, noindex head meta); a
//                             raising render gets the deck error page
//                             (500, "Wild Card! / 500 Server Error").
//
// Session surface: the presented session token renders GET
// pages AS THAT ACCOUNT — render.viewer is set from the token
// (render-viewer-for-session.ts; an unknown/expired/revoked token degrades
// to the Anonymous viewer exactly like auth/current.rb:58-63). Anonymous
// requests render through the SAME engine instance as before the session
// surface existed,
// untouched. Signed-in requests use a per-actor RenderEngine (the render
// caches memoize permission state — render.ts's viewer field must be set
// before an engine's first render). Two engines are kept; a third account
// evicts the oldest.
//
// Boot:
//   node vm-staging-server.mjs <path-to-corpus.sqlite> [port]
//
// Defaults: port 3100, db path arg required. The corpus file must be
// WRITABLE for sign-in (the auth layer stores session rows in the same
// database, auth_sessions table, applied idempotently at boot through
// runAuthMigrations); read-only corpus files still serve every anonymous
// GET but /_signin fails loudly at boot. Give the server a writable COPY
// of the corpus; the read-only GET paths still never write card data.
//
// PAGE PATH: pages render through the ENGINE's page entry
// (dist/src/card/render/page.js renderPageBytes — the show_with_page_layout
// port: per-card *layout rule walk, main! render, layout-body processing,
// html_page head). This origin deliberately applies NO byte surgery of its
// own on the page path — any fix the engine lands reaches the wire
// immediately. What this file still owns is the SERVED ENVIRONMENT
// (applyServedEnvironmentDeltas): the deployment deltas between the
// engine's pinned environment and the served deck — the Spaces
// asset host, the served CSS revision, the CDN script
// integrity attributes, the "Decko v0.19.1" footer pin (the corpus's
// *version db_content is empty; the served deck prints 0.19.1), and the
// trailing newline after </html>. Error pages keep the literal-substitution
// shell (wrapWithLayout) — their shape is pinned to the served bytes.
//
// Shell context: the page wraps the rendered card view through the deck's
// "Default Layout" (codename `default_layout`). The layout body
// is `<header>...</header> <article ...>{{_main|titled}}</article>
// <footer>...</footer>`; the *header and *footer setting cards carry the
// navbar / credit markup the layout nests. The outer HTML doc
// (`<!DOCTYPE>`, `<html class="h-100">`, head with the active skin
// stylesheet and script, body class `d-flex flex-column h-100`) matches
// the engine's `wrap_with_html_page` + `html_page` view at
// card-mod-format-0.20.0/set/all/html/show.rb:7-17.

import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

import { LocalSqliteDriver } from "./dist/src/server/drivers/local-sqlite.js";
import { nodeAfterResponse } from "./dist/src/card/delayed-job/delayed-job.js";
import { delayingFromEnv, hostDelayedJobs } from "./dist/src/card/delayed-job/host.js";
import { FetchEngine } from "./dist/src/card/fetch.js";
import { RenderEngine } from "./dist/src/card/render.js";
// The serving posture for nested render errors: Cardio's stock boot is QUIET
// (cardio/railtie.rb:38 `config.raise_all_rendering_errors = false`), so a
// raise inside a delegated render — `render_core` from a view body
// (method_delegation.rb:41-47 -> render! -> its own wrap_and_render rescue,
// format/render.rb:96-100) — becomes THAT render's return value (the quiet
// render-error span) while the enclosing view's slot completes. With the
// engine's boot-default LOUD posture the delegated boundary rethrows and the
// raise escapes to the enclosing nest's catch, which discards the nesting
// card's WHOLE view (the read-pages depth boundary: Chain 20's titled shell
// vanished, the span landed inside Chain 19 — the live Ruby observation pins
// the shell surviving with the span as its body, BROWSER-PARITY-SCENARIOS
// section 10.29). The harness adapters set the same posture at boot
// (adapters/ts/adapter.ts); the raising-render 500 surface ("Wild Card!")
// is the FOCAL arm (error.rb:69-73 loud_error re-raises) and does not
// change — only nested/delegated rescues go quiet.
import { setRaiseAllRenderingErrors } from "./dist/src/card/render/format.js";
import { serveFontAwesomeAsset } from "./dist/src/server/font-awesome-assets.js";
import { serveBootstrapFontAsset } from "./dist/src/server/bootstrap-font-assets.js";
import { handleAttachmentRoute } from "./dist/src/server/file-routes.js";
import { jsonViewSearchParams, mapRenderError, isDeprecatedAssetRoute, deprecatedAssetStubResponse } from "./dist/src/server/worker-shared-surface.js";
import { resolveReadAuthenticators } from "./dist/src/server/request-authenticators.js";
import { signinFromApiKey } from "./dist/src/card/auth/api-key-lookup.js";
import { homeMarkContent } from "./dist/src/card/render/page.js";
import { configureFontAwesomeMode, fontAwesomeHeadTag } from "./dist/src/card/render/font-awesome.js";
setRaiseAllRenderingErrors(false);
import { DeckoName } from "./dist/src/card/name.js";
import { renderFormatShow } from "./dist/src/card/render/format-families.js";
import {
  isRegisteredRouteFormat,
  registeredFormatDefaultView,
  renderRegisteredFormat,
  splitRegisteredFormatSuffix,
} from "./dist/src/server/registered-format-route.js";
import { recordAsMain } from "./dist/src/card/name/environment.js";
import { lastDraftContent } from "./dist/src/card/mod-loader/mods/card-mod-history.js";
import { isUpstreamMatchError } from "./dist/src/card/render/errors.js";
import { applyDeckInflections } from "./dist/src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "./dist/src/card/name/oracle-deck-inflections.js";
import { sqliteRegexpUdf } from "./dist/src/cql/sqlite-regexp.js";
// The first-run journey: Ruby's
// Card::Auth.needs_setup? census + the owner create, as a separate HTTP
// surface. Off unless DECKO_FIRST_RUN=1 - handleFirstRunRequest returns null
// for every request when the flag is unset, so the unarmed staging server
// behaves exactly as it did before this module existed.
import { firstRunEnabled, handleFirstRunRequest, SETUP_PATH } from "./dist/src/server/first-run-routes.js";
import { armGeneratedSetupToken } from "./dist/src/card/auth/setup-token.js";

/**
 * The TinyMCE snippet editors' request params (reference_editor.rb:4-5 and
 * apply_tm_snippet_data:18-24): `tinymce_id`, `tm_snippet_raw`,
 * `tm_snippet_start`. The dialog fetches carry them on their query strings and
 * the rendered chrome reads them through RenderEngine#requestEditorParams
 * (render.ts:1342 assigns params.editorParams at every render entry; the link
 * and nest-image editor views bind their Apply button with
 * `data-tinymce-id` = that value, card-mod-tinymce_editor.ts:663 drops the
 * attribute when it is absent).
 *
 * WHY THIS EXISTS: the Bunny edge entry threads these params
 * (worker-shared-surface.ts EDITOR_PARAM_KEYS — the edge twin carried the
 * mapping first and the shared surface moved it to one copy), but the LOCAL
 * serving host never did: every read here passed only `search`/`newCard`, so
 * a locally served modal_link_editor / modal_nest_image chrome always dropped
 * the wire. Measured 2026-10-18 on synthetic-v1: the served Apply button
 * carried no data-tinymce-id while the edge bundle's did (full-run E6/E8
 * evidence at .runtime/edge-signed-in/2026-10-18-runner-harness-full-run/
 * report.md:134-135), and both dialogs stored their seed content after
 * Apply+Save (probe-pageonly-batch6 runs 1-2, ACT-079/ACT-080).
 */
function editorWireParamsFromQuery(searchParams) {
  const out = {};
  for (const key of ["tinymce_id", "tm_snippet_raw", "tm_snippet_start"]) {
    const value = searchParams.get(key);
    if (value !== null) out[key] = value;
  }
  return out;
}
// The same-origin check every state-changing request passes (docs/SECURITY.md,
// "Cross-site requests"): DECKO_ORIGIN_CHECK / DECKO_TRUSTED_ORIGINS, read at boot.
import { checkRequestOrigin, CROSS_ORIGIN_MESSAGE, defaultOriginPolicy } from "./dist/src/server/request-origin.js";
const ORIGIN_POLICY = defaultOriginPolicy();
// The boot-seed capability: Cardio::Seed.load + card:eat's
// account-system surface, so a FRESH (empty) deck boots bootstrapped —
// Anonymous/DeckoBot resolvable and the role/account cards present. Ruby
// seeds at install time right after schema init (card.rake:4-6 card:setup =
// db:setup; db/seeds.rb:3); the port's boot hook sits in the same slot:
// right after this file's runAuthMigrations, only for an empty deck.
import { bootstrapFreshDeck } from "./dist/src/card/auth/boot-seed.js";
import { createVirtualCardLookup } from "./dist/src/card/fetch/virtual-cards.js";
import { newSlotId } from "./dist/src/card/render/slot-html.js";
import { cardWallClockNow } from "./dist/src/card/wall-clock.js";
import { renderPageBytes, renderPageWithStatus } from "./dist/src/card/render/page.js";
// The compiled *all+*script bundle: the OUTPUT side of
// Ruby's script-asset pipeline — per-leaf comment_with_source +
// Uglifier(harmony) compression (see
// src/card/assets/compiled-script-bundle.ts).
import { compileScriptBundle } from "./dist/src/card/assets/compiled-script-bundle.js";
import { uglifyHarmonyCompile, uglifyHarmonySyntaxError } from "./dist/src/card/assets/uglify-harmony-compile-engine.js";
// The deck-boot seam (default-mod-deck.ts): loads the composed 31-mod deck
// and binds the process-wide defaults (mod view configs, content-override
// registry, event registry) — the port of Ruby's one-time boot wiring
// (Cardio::Mod::Dirs, dirs.rb:51-63). Without this call the server process
// runs on the SEED html views only (getDefaultModLoader() unset), so every
// mod-registered view — the whole card-mod-edit form chain (:edit,
// :edit_form, :edit_buttons, :input, ...), history, rules, account forms —
// raises UnsupportedViewError at the serving surface even though the views
// themselves are ported.
import { defaultDeckLoader } from "./dist/src/card/mod-loader/default-mod-deck.js";
import { openSameDatabase, passwordHashModeFor } from "./dist/src/server/same-database.js";
import { ensureNestIndex } from "./dist/src/card/nest-index.js";
// Write path: the whole write surface lives in its own
// module — see src/server/write-routes.ts for the grammar/auth/CSRF sources.
import {
  handleWriteRequest,
  writePathEnabled,
  readSessionCookie,
  sessionCookieHeader,
  clearedSessionCookieHeader,
  sessionCookieSecure,
} from "./dist/src/server/write-routes.js";
// The visitor session's cookie-carried location history (card-mod-session
// set/all/location_history.rb): pageViewCookie is the save_current_location
// host seam — a full-page read of a known card stores its own URL, and the
// write path's `*previous` / configure_successful_deletion redirects resolve
// to the last entry.
import { emptyVisitorSession, pageViewCookie, previousLocation, readVisitorSession, visitorSessionCookie } from "./dist/src/card/session/visitor-session.js";
import { withVisitorEnabledRoles, permissionViewerKey } from "./dist/src/card/session/enabled-roles.js";
// The recaptcha seat's host-config source: reads
// the DECKO_RECAPTCHA_* environment keys into the WriteRouteContext.recaptcha
// seat (write-routes.ts). Undefined until ops sets the keys — INERT by
// default; the rule walk and the real siteverify GET stay the engine's
// defaults. Key NAMES only here; no key VALUES live in this repo.
import { recaptchaConfigFromHostEnv } from "./dist/src/server/staging-server-recaptcha-env-config.js";
// The stock oracle's security response headers (referrer-policy,
// x-content-type-options, x-download-options, x-frame-options,
// x-permitted-cross-domain-policies, x-xss-protection — the measured
// every-response set, src/server/oracle-security-response-headers.ts),
// applied at every response emit below: Ruby's action_dispatch default
// headers middleware answers every response class with them, and the port's
// served pages carried none (the 2026-10-18 header-parity gap).
import {
  applyOracleSecurityResponseHeaders,
} from "./dist/src/server/oracle-security-response-headers.js";
// The attachment storage seam: new uploads land as
// files/<cardId>/<actionId><ext> under DECKO_FILES_DIR — Ruby's
// Card.paths["files"] port (card-mod-carrierwave paths.rb:14-17) — and
// serve through the local fallback in handleAssetFile below.
import { LocalAttachmentStore } from "./dist/src/card/attachments/attachment-store.js";
import { CardActionEngine } from "./dist/src/card/actions/card-action-engine.js";
import { createReadAssetRefresh } from "./dist/src/card/actions/asset-read-refresh.js";
import { libsassProcessCompiler } from "./dist/src/server/libsass-process.js";
import { coffeeNpmCompiler } from "./dist/src/server/coffee-npm-compiler.js";
import { expireRenderCachesAfterSave } from "./dist/src/server/post-save-cache-expiry.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "./dist/src/card/rules/structure.js";
// Write path, session-backed sign-in: the auth store lives in the
// same sqlite file (auth_sessions table, runAuthMigrations at boot) and the
// per-request token picks the render engine whose viewer is that account
// (RenderEngine.viewer, the seam  wires —
// the server resolves the actor once per request and sets the viewer at
// engine construction, before any render).
import {
  SessionStore,
  runAuthMigrations,
  signinAccount,
  signoutAccount,
} from "./dist/src/card/auth/index.js";

// The member account email-token flows: request reset ->
// reset email (token link) -> confirm -> set new password, plus the signup
// arm's verify/activate. Ruby sources: card-mod-account set/self/signin.rb
// (send_reset_password_token), set/right/account/events.rb
// (reset_password + verify_and_activate), set/right/account/views.rb
// (token_url — the email link shape this server consumes at GET
// /update/<mark>), set/right/password.rb (the validate/store events).
import {
  applyNewAccountPassword,
  buildAccountTokenUrl,
  confirmPasswordReset,
  confirmAccountVerification,
  sendResetPasswordToken,
} from "./dist/src/card/auth/account-verify-reset-flows.js";
import {
  CaptureTransport,
  NoopTransport,
} from "./dist/src/card/notify/transport.js";

// DECK BOOT — inflection initializer, FIRST, before any DeckoName.parse.
// A Rails deck's config/initializers/inflections.rb runs before any request;
// this is that moment. The deployed deck keys names under a non-default
// inflection table (uncountables s / this / anonymous — recovered from the
// stored corpus keys, see src/card/name/oracle-deck-inflections.ts). Without
// this call the engine computes `participant_` where the corpus stores
// `participant_s` ("Participant(s)"), the CQL name resolver falls back to
// Ruby's -999 sentinel, and every plus-join on those junctions ("+Project(s)
// Participating" sections, "+Participant(s)" children) returns zero rows.
// applyDeckInflections also drops
// the DeckoName parse cache, so the keys primed below (primeEngine's
// keyToId / idToName maps) are computed under the deck table.
applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);

// ---------------------------------------------------------------------------
// Lexicon / codename cache backing store
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
// Image host (Spaces) + size options
// ---------------------------------------------------------------------------
//
// The deck's stored image URLs (corpus `db_content` on image cards) point at
// the deck's original S3 bucket, but the served deck fronts files from the
// Spaces bucket at the same path scheme
// (`/files/<cardId>/<fileId>-<size>.<ext>`).
//
// Every asset URL on the served pages uses the `.cdn.` Spaces subdomain
// (`https://production-storage.r1.cdn.objectstore.example`) for JS, CSS,
// favicon, logo, and every content image alike. SPACES_HOST below is that
// host; an earlier non-cdn host form was wrong — the served pages never
// name it.
const SPACES_HOST = "https://production-storage.r1.cdn.objectstore.example";

// DECKO_DECK_PROFILE=stock serves any deck the way stock Decko serves it,
// for a fresh deck rather than the production deck this host was tuned on:
//   - pages render through the engine's own views over the deck's mod boot
//     (defaultDeckLoader — stock Decko composes every gem mod at boot,
//     dirs.rb:54-62, and serves the mods' set-scoped views: the file
//     chooser, the pointer input arms, the rename editor; the browser
//     journeys measure against exactly that serving);
//   - no production served-environment deltas (asset CDN host, stylesheet
//     revision, script integrity, footer version pin);
//   - /*signin is the *signin card's own page (its ported sign-in form), not
//     the staging stand-in form;
//   - a page for a card that does not exist renders as Ruby renders it (the
//     new-card form when the viewer may create it, else Not Found).
// Unset, every byte this host serves is unchanged.
const STOCK_DECK = process.env.DECKO_DECK_PROFILE === "stock";

// A deck serves its mods' public files at /mod/<mod>/... (decko setup links
// public/mod/<mod> to each mod's public directory): TinyMCE loads its theme
// from there, ace its modes. DECKO_MOD_PUBLIC_DIR names the directory that
// holds the mods; a member is either the mod's public directory itself (the
// link layout) or the mod's checkout directory with the public files under
// public/ (the decko repo layout, mod/<mod>/public). Unset, /mod/ paths are
// not served.
const MOD_PUBLIC_DIR = process.env.DECKO_MOD_PUBLIC_DIR || undefined;
const MOD_PUBLIC_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

async function serveModPublicFile(pathname) {
  const root = path.resolve(MOD_PUBLIC_DIR, "mod");
  let rel;
  try {
    rel = decodeURIComponent(pathname.slice("/mod/".length));
  } catch {
    return htmlResponse(400, "<h1>Bad request</h1>", "Bad request");
  }
  // /mod/<mod>/... resolves against each layout: <mod>/... (the link layout,
  // where the member IS the public dir) and <mod>/public/... (the decko repo
  // layout). First existing candidate wins; every candidate passes the same
  // traversal guard.
  const segs = rel.split("/").filter((s) => s !== "" && s !== "." && s !== "..");
  const candidates =
    segs.length === 0 ? [] : [path.resolve(root, ...segs), path.resolve(root, segs[0], "public", ...segs.slice(1))];
  for (const file of candidates) {
    if (file !== root && !file.startsWith(root + path.sep)) continue;
    try {
      const bytes = await fs.readFile(file);
      return {
        status: 200,
        headers: {
          "Content-Type": MOD_PUBLIC_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        },
        body: bytes,
      };
    } catch {
      // try the next layout
    }
  }
  return htmlResponse(404, "<h1>Not found</h1>", "Not found");
}
// (Image size variants resolve inside the engine's image views via the
// nest's size option / imageCdnHost — no origin-side image handling.)

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Compiled-asset directory
// ---------------------------------------------------------------------------
//
// The compile step produces real SassC-compiled CSS and Uglifier-compressed
// JS bytes for the deck's two main asset cards. We serve those bytes when
// present on disk so the CDN-fronted pages receive compiled styling and
// script (not the deck's SCSS source / *script manifest), and fall back to
// the existing source-serving paths when the compiled file is missing — the
// fallback keeps the honest `X-Decko-Asset-Note` header so a missing deploy
// is observable, not silent.
//
// Default location: the deployed compiled-assets directory. Override with
// `COMPILED_ASSETS_DIR=/path` for local testing. Files inside the repo
// stay out of this path; deployment copies the compile outputs here.
const COMPILED_ASSETS_DIR =
  process.env.COMPILED_ASSETS_DIR ?? "/opt/decko-bunny-render/oracle-assets";

// URL → compiled filename. Both asset cards have one canonical URL on the
// page (the layout shell links /files/~45514/0000000001.css and
// /files/~50617/0000000002.js). The action_id segment is the deck's
// bucket revision; the bucket it ships against is the same one we mirror
// to disk here. We treat the (cardId, ext) tuple as the key — the action
// id is preserved verbatim in the served URL.
const COMPILED_ASSET_FILES = {
  "45514:css": "all-style.css",
  "50617:js": "all-script.js",
};

// ---------------------------------------------------------------------------
// The compiled *all+*script bundle
// ---------------------------------------------------------------------------
//
// Ruby serves the deck's main JavaScript from the STORED bytes of the
// *all+*script+*asset output file card — the production compile of the
// *all+*script manifest (asset_outputter.rb:20-25 update_asset_output ->
// store_output input_from_item_cards; each leaf through the script
// :compressed view's Uglifier(harmony) arm, 00_script.rb:25-27, under the
// production deck's compress_assets=true). This server mirrors that OUTPUT
// contract:
//
//   1. The deck's main script output card resolves by codename (*all+*script
//      rule's +*asset output child), not hardcoded ids — the same query
//      answers any deck's layout.
//   2. Its bytes come from the deployed compiled-assets directory when the
//      compile step put them there, else the in-process compile of the
//      PINNED assembled input (the fixture path ASSEMBLED_SCRIPT_FIXTURE
//      below, through compiled-script-bundle.ts), else the honest
//      uncompiled-manifest fallback below.
//
// Every flavor names itself in the X-Decko-Asset-* headers. The compile is
// a memoized promise — the first /files fetch of the main script pays it
// (~tens of seconds of uglify), later fetches serve the cached bytes.

const ASSEMBLED_SCRIPT_FIXTURE = path.join(
  HERE,
  "fixtures",
  "captured",
  "all-script-assembled-input.js",
);

let mainScriptAssetOutputCache; // { id, db_content } | null, memoized
async function mainScriptAssetOutput() {
  if (mainScriptAssetOutputCache !== undefined) return mainScriptAssetOutputCache;
  const { rows } = await driver.query(
    "SELECT out_card.id AS id, out_card.db_content AS db_content" +
      " FROM cards all_card" +
      " JOIN cards rule ON rule.left_id = all_card.id AND rule.trash = 0" +
      " JOIN cards setting ON rule.right_id = setting.id AND setting.trash = 0" +
      " JOIN cards out_card ON out_card.left_id = rule.id AND out_card.trash = 0" +
      " JOIN cards out_setting ON out_card.right_id = out_setting.id" +
      " WHERE all_card.codename = 'all' AND all_card.trash = 0" +
      " AND setting.codename = 'script'" +
      " AND out_setting.codename = 'asset_output'",
    [],
  );
  mainScriptAssetOutputCache = rows[0] ?? null;
  return mainScriptAssetOutputCache;
}

let compiledBundlePromise; // Promise<{bytes, note, source} | null>, memoized
function compiledMainScriptBundle() {
  if (compiledBundlePromise === undefined) {
    compiledBundlePromise = (async () => {
      // 1. the deployed compiled bytes (the compile step's output)
      const deployedPath = path.join(COMPILED_ASSETS_DIR, "all-script.js");
      try {
        const bytes = await fs.readFile(deployedPath);
        return { bytes, note: "compiled-bytes", source: deployedPath };
      } catch (err) {
        if (err && err.code !== "ENOENT") {
          console.warn(
            `[vm-staging] compiled asset read failed ${deployedPath}: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
      // 2. compile in process from the pinned assembled input
      try {
        const assembled = await fs.readFile(ASSEMBLED_SCRIPT_FIXTURE, "utf8");
        const startedAt = Date.now();
        const bundle = compileScriptBundle(assembled);
        console.log(
          `[vm-staging] compiled *all+*script bundle in process: ${bundle.length} chars ` +
            `in ${Date.now() - startedAt}ms from ${ASSEMBLED_SCRIPT_FIXTURE}`,
        );
        return {
          bytes: Buffer.from(bundle, "utf8"),
          note: "compiled-in-process-from-assembled-input",
          source: ASSEMBLED_SCRIPT_FIXTURE,
        };
      } catch (err) {
        console.warn(
          `[vm-staging] in-process script compile unavailable: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        return null;
      }
    })();
  }
  return compiledBundlePromise;
}

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

// The write path writes card/act/action/changes rows
// through THIS driver, so when DECKO_WRITE_PATH=1 the browse driver must
// open writable — the boot default (readonly pure-browse) made every routed
// write die with SQLITE_READONLY inside ActWriter.batch. The
// read-only GET paths still never write card data either way.
const driver = new LocalSqliteDriver({ path: dbPath, readonly: !writePathEnabled() });
// CQL match queries compile SQL `field REGEXP ?`; SQLite has no built-in
// REGEXP, so the UDF is registered before the first match query runs
// (registerSqliteRegexpFunction header note: function resolution is at
// statement-prepare time).
driver.registerFunction("regexp", sqliteRegexpUdf, { deterministic: true });

// ---------------------------------------------------------------------------
// Auth boot
// ---------------------------------------------------------------------------
//
// The corpus driver above stays READ-ONLY and is the only driver the GET
// path touches — anonymous bytes cannot change. Session rows live in the
// SAME sqlite file (SessionStore's lookup joins cards for the live-account
// check, session-store.ts), so a second RW driver opens it for the auth
// store only. runAuthMigrations applies db/migrations/*.sql idempotently
// (CREATE IF NOT EXISTS + bookkeeping); on a read-only FILE this fails
// loudly at boot — that is the deployment contract: give the server a
// writable copy of the corpus.
const authDriver = new LocalSqliteDriver({ path: dbPath, readonly: false });
// The attachment store: Ruby's files dir —
// Card.paths["files"] = the deck root's files/ (card-mod-carrierwave
// paths.rb:14-17 files_base_dir). The staging corpus's HISTORICAL
// attachments are cloud-hosted (the bucket front handles them); this dir
// holds only NEW uploads, written by the multipart write path and served
// by handleAssetFile's local fallback. DECKO_FILES_DIR must be writable
// when DECKO_WRITE_PATH=1; the default sits beside the database.
const DECKO_FILES_DIR =
  process.env.DECKO_FILES_DIR ?? path.join(path.dirname(dbPath), "files");
const attachmentStore = new LocalAttachmentStore(DECKO_FILES_DIR);
// The SCSS compiler the style asset events use (skin and CSS asset inputs,
// the site stylesheet): DECKO_SASSC names the LibSass program built by
// tools/libsass/build-native.mjs. Unset = saves that rebuild a stylesheet
// are refused with a named error.
const scssCompiler =
  process.env.DECKO_SASSC !== undefined && process.env.DECKO_SASSC !== ""
    ? libsassProcessCompiler(process.env.DECKO_SASSC)
    : undefined;
// The CoffeeScript compiler the script asset events use (JavaScript and
// CoffeeScript asset inputs, the site script): the npm coffeescript package,
// the compiler the Ruby app's coffee-script-source gem bundles. This host is a
// Node host, so it always has it.
const coffeeCompiler = coffeeNpmCompiler();
// Cardio.config.compress_assets: a deployed site runs it true (card-1.110.0
// lib/cardio/railtie.rb:35), so the script asset inputs and bundles this host
// stores are minified by Uglifier(harmony), the vendored engine the uglifier
// gem runs (card-mod-script set/abstract/00_script.rb:18-27).
// DECKO_COMPRESS_ASSETS=false mirrors a deck configured with it off (the
// development environment's value).
const compressAssets = process.env.DECKO_COMPRESS_ASSETS !== "false";
const scriptCompressor = uglifyHarmonyCompile;
const javascriptValidator = uglifyHarmonySyntaxError;
// Ruby's read-time asset refresh (CardController::Rest#setup runs
// Card::Assets.refresh before a card request renders; a deployed site runs it
// :cautious, card-1.110.0 lib/cardio/railtie.rb:34). The refresh stores the
// asset inputs and bundles, so it runs only on a write-armed boot, the only
// boot whose store accepts those writes. It acts as the deck bot, so no
// session actor is involved.
// DECKO_ASSET_REFRESH names the mode (eager, cautious or never). The default is
// the deployed site's cautious; the browser-journey host sets never, as the
// Ruby oracle does (reference-harness/browser/engines/ruby-server.rb).
const ASSET_REFRESH_MODES = new Set(["eager", "cautious", "never"]);
const assetRefreshMode = process.env.DECKO_ASSET_REFRESH ?? "cautious";
if (!ASSET_REFRESH_MODES.has(assetRefreshMode)) {
  throw new Error(`DECKO_ASSET_REFRESH must be eager, cautious or never; got ${assetRefreshMode}`);
}
const assetReadRefresh = createReadAssetRefresh({
  mode: assetRefreshMode,
  sharedCache: true,
  refresh: () =>
    new CardActionEngine(fetcher, {
      actor: null,
      ipAddress: "127.0.0.1",
      attachmentStore,
      scssCompiler,
      coffeeCompiler,
      compressAssets,
      scriptCompressor,
      javascriptValidator,
    }).refreshReadAssetInputs(),
});
// The recaptcha guard's host config, read ONCE at
// boot from the environment (DECKO_RECAPTCHA_SITE_KEY / _SECRET_KEY, plus
// optional _MINIMUM_SCORE / _VERIFY_URL — see the env-config module header).
// Undefined until ops sets the keys: the composition below then carries NO
// recaptcha field and the write path is the exact pre-wiring shape
// (recaptcha_keys? false, recaptcha.rb:46-48). Throws at boot on a
// malformed _MINIMUM_SCORE — mis-armed guards fail loud, not silent.
const recaptchaConfig =
  recaptchaConfigFromHostEnv(process.env) ?? {
    // Ruby's recaptcha config loader falls back to the mod's DEVELOPMENT
    // default keys when no card value and no config value exist
    // (lib/card/mod/recaptcha.rb @defaults:14-17 through
    // recaptcha_setting_value's card -> config -> deprecated -> default
    // chain) — a STOCK decko boot is therefore armed, and the anonymous
    // create journeys hit the captcha guard exactly as the recorded oracle
    // journey pins (signup-anonymous' "RECAPTCHA: needs correct v3
    // configuration" refusal). The env pass-through stands when ops sets
    // keys (the deployment seam, staging-server-recaptcha-env-config.ts).
    siteKey: "6Lc3c-EoAAAAALnzfnHIWb5Rqy-rNui8l8qsguYG",
    secretKey: "6Lc3c-EoAAAAAEg9K_IAUNgx73eTbtBucCGnOQqf",
  };
// The FORM side of the guard (the card_form token bytes) reads the same
// config through the render seam (card-mod-edit's createCardForm gate).
const { setRenderRecaptchaConfig } = await import(
  "./dist/src/card/render/render-recaptcha-config.js"
);
setRenderRecaptchaConfig(recaptchaConfig);
// The compiled migrations runner resolves its DEFAULT directory relative to
// dist (it is a source/test surface; the deploy stream applies D1
// migrations its own way) — this Node origin passes its own repo-root
// db/migrations explicitly.
// The deck is opened as it is - a database Ruby Decko wrote is served with
// no import: the port adds only its own objects (the freshness stamp on every
// card table via ensureFreshnessStamp, the session table, lookup indexes),
// additively and idempotently, and never alters a table Ruby owns
// (src/server/same-database.ts, src/server/freshness-stamp.ts,
// docs/same-database.md).
const sameDatabase = await openSameDatabase(authDriver, { authMigrationsDir: path.join(HERE, "db", "migrations") });
// A database Ruby also serves keeps Ruby's salted SHA-1 password rows, so
// every password the port writes is one Ruby can verify. An explicit
// DECKO_PASSWORD_HASH wins.
const passwordMode = passwordHashModeFor(sameDatabase.rubyDatabase, process.env.DECKO_PASSWORD_HASH);
if (passwordMode !== undefined) process.env.DECKO_PASSWORD_HASH = passwordMode;
console.log(
  `[vm-staging] database: ${sameDatabase.rubyDatabase ? "Ruby Decko schema, served as it is" : "port schema"}; ` +
    `added ${sameDatabase.created.length === 0 ? "nothing" : sameDatabase.created.join(", ")}; password hash ${passwordMode ?? "pbkdf2"}`,
);

// ---------------------------------------------------------------------------
// Boot-seed: a FRESH deck seeds itself at boot.
// ---------------------------------------------------------------------------
//
// Ruby's order is card:setup = db:setup — schema create+load THEN seed
// (mod/core/lib/tasks/card.rake:4-6; db/seeds.rb:3 Cardio::Seed.load), and
// the mod cards arrive through card:eat after the schema migrations
// (card.rake:14/:22). The port's schema init above is the same slot, so the
// seed hook sits immediately after it. Gated to the fresh-demo profile
// (DECKO_FIRST_RUN=1 + write path) and to an EMPTY deck: a corpus database
// (or any deck with cards) is never touched — seeding is an install-time
// act, not a request-time repair; Ruby has no per-boot reseed either.
// With the seed landed, the /setup census can compute (actorBot resolves)
// and the window behaves as first-run-setup.ts documents.
if (firstRunEnabled() && writePathEnabled()) {
  const cardsCount = await authDriver.query("SELECT COUNT(*) AS n FROM cards", []);
  if (Number(cardsCount.rows[0]?.n ?? 0) === 0) {
    const seeded = await bootstrapFreshDeck({ driver: authDriver });
    console.log(
      `[boot-seed] fresh deck seeded: ${seeded.coreRowsInserted} core fixture rows, ` +
        `${seeded.modCardsCreated.length} account-system cards created ` +
        `(${seeded.modCardsUpdated.length} updated on re-run)`,
    );
  }
}
// The one-time setup token (docs/SECURITY.md, divergence 5): with first-run
// setup on, /setup accepts only a request carrying it. Without an operator
// DECKO_SETUP_TOKEN, one is generated now and printed here, once.
if (firstRunEnabled()) {
  const setupToken = armGeneratedSetupToken();
  console.log(
    setupToken === undefined
      ? "[first-run] /setup requires the token set in DECKO_SETUP_TOKEN"
      : `[first-run] /setup requires this one-time setup token: ${setupToken}`,
  );
}
const sessions = new SessionStore({ driver: authDriver });

// ---------------------------------------------------------------------------
// Account email-token flows boot
// ---------------------------------------------------------------------------
//
// The flows read card rows through the writable auth driver (the same file
// — reads must see the writes the activation/password steps make, and the
// boot driver can be read-only). Mail goes through the notify transport
// seam: NOOP unless DECKO_MAIL_CAPTURE=1, which swaps in CaptureTransport
// and exposes GET /_mail-log (a staging-only debug surface for asserting
// envelopes; production wires the SMTP transport instead).
const mailTransport =
  process.env.DECKO_MAIL_CAPTURE === "1"
    ? new CaptureTransport("capture")
    : new NoopTransport();

// {{:title|core}} — the *title card's content is the site title the email
// templates render. Column shape varies by corpus builder (engine-standard
// db_content vs the python-built content), so resolve defensively.
async function resolveSiteTitle() {
  for (const column of ["db_content", "content"]) {
    try {
      const result = await authDriver.query(
        `SELECT ${column} AS title FROM cards WHERE codename = 'title' AND trash = 0 LIMIT 1`,
        [],
      );
      const title = result.rows[0]?.title;
      if (typeof title === "string" && title !== "") return title;
      return title ?? "";
    } catch {
      // column missing — try the next spelling
    }
  }
  return "";
}

const SITE_TITLE = await resolveSiteTitle();

// The absolute base the email links carry (card_url, env/location.rb:19-24:
// Env.origin). Same host the server itself answers on, so the flow test can
// fetch the link out of the captured mail and hit THIS server.
const DECKO_ORIGIN = process.env.DECKO_ORIGIN ?? `http://127.0.0.1:${port}`;

// The flows' card-write engine input. A dedicated FetchEngine over the
// writable driver: the activation (+*status -> active) and password writes
// must work even when DECKO_WRITE_PATH is off (they are the auth layer's
// own writes, like the session rows — not the general write route).
// Built per call (cheap): TOKEN_CONFIG lives further down the boot file,
// and a module-eval-time reference would read it before initialization.
const flowsFetcher = new FetchEngine(authDriver);
function accountFlowCtx() {
  return {
    driver: authDriver,
    fetcher: flowsFetcher,
    sessions,
    transport: mailTransport,
    token: TOKEN_CONFIG,
    origin: DECKO_ORIGIN,
    siteTitle: SITE_TITLE,
  };
}

function accountFlowResponse(status, body) {
  return { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}

/** The flow writes (+*status activation, +*password digest) go through the
 *  flows' own fetcher, so the boot-time render engines' enriched card maps
 *  must be expired explicitly — the same discipline the write-path dispatch
 *  applies to routed saves. */
function expireFlowWrittenName(mark) {
  const name = decodeURIComponent(mark).replace(/_/g, " ");
  if (name === "") return;
  fetcher.expireName(name);
  render.expireRenderCard(name);
  for (const engine of signedInEngines.values()) {
    engine.expireRenderCard(name);
  }
}

/** POST /_reset-request {email} — the send_reset_password_token event
 *  (set/self/signin.rb:27-31): find account by email, require active,
 *  deliver the reset email with the token link. Unknown/inactive accounts
 *  fail with Ruby's ladder and send nothing. */
async function handleResetRequest(req) {
  let raw;
  try {
    raw = await readRequestBody(req);
  } catch (error) {
    return accountFlowResponse(400, { ok: false, message: `unreadable request body: ${error}` });
  }
  let email = "";
  const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/json" || raw.trimStart().startsWith("{")) {
    try {
      email = String(JSON.parse(raw)?.email ?? "");
    } catch {
      email = "";
    }
  } else {
    email = new URLSearchParams(raw).get("email") ?? "";
  }
  const outcome = await sendResetPasswordToken(accountFlowCtx(), email);
  if (!outcome.ok) {
    return accountFlowResponse(422, { ok: false, message: outcome.message });
  }
  return accountFlowResponse(200, { ok: true, sentTo: outcome.sentTo });
}

/** The email link consumption (GET — and verb-explicit POST/PATCH/PUT —
 *  /update/<mark>?card[trigger]=...&token=...): Ruby routes the emailed
 *  link through the explicit GET alternative
 *  (decko-0.20.0 config/engine_routes.rb "get (card)/update(/:mark)") into
 *  card#update with the JWT authenticator (rest.rb:37-47) running before
 *  the trigger event. This surface consumes EXACTLY that link shape and
 *  nothing else — a GET without the trigger+token pair is NOT a write and
 *  falls through (the write-routes module's no-GET-writes posture stands
 *  for everything outside these two trigger-gated flows).
 *
 *  Response mapping: success 303 (reset -> /<urlkey>/edit, the +account
 *  edit form at Ruby's PATH address; verify -> the card) WITH the session
 *  cookie — Ruby's
 *  Auth.signin (current.rb:35-41) binds the session of the browser that
 *  clicked the link, and the edit form it lands on submits as that member;
 *  token_invalid 403 (PermissionDenied), account_not_found 404 (NotFound),
 *  mismatch 422 (the validation error page; the failure event already
 *  re-sent the email). */
function parseAccountFlowLink(pathname, searchParams) {
  const match = /^\/update\/([^/]+)$/.exec(pathname);
  if (match === null) return null;
  const trigger = searchParams.get("card[trigger]");
  const token = searchParams.get("token");
  if ((trigger !== "reset_password" && trigger !== "verify_and_activate") || token === null) {
    return null;
  }
  return { accountMark: decodeURIComponent(match[1]), trigger, token };
}

async function handleAccountFlowLink(flow, req) {
  if (flow.trigger === "reset_password") {
    const outcome = await confirmPasswordReset(accountFlowCtx(), flow.accountMark, flow.token);
    if (outcome.ok) {
      return withSessionCookie(
        successRedirect(outcome.redirectTo.name, outcome.redirectTo.view, req),
        outcome.session.token,
        req,
      );
    }
    return accountFlowErrorResponse(outcome, flow.accountMark);
  }
  const outcome = await confirmAccountVerification(accountFlowCtx(), flow.accountMark, flow.token);
  if (outcome.ok) {
    return withSessionCookie(
      successRedirect(outcome.redirectTo.name, undefined, req),
      outcome.session.token,
      req,
    );
  }
  return accountFlowErrorResponse(outcome, flow.accountMark);
}

function withSessionCookie(response, sessionToken, req) {
  return {
    ...response,
    headers: { ...response.headers, "Set-Cookie": sessionCookieHeader(sessionToken, nodeCookieSecure(req)) },
  };
}

// Secure on the session cookie (docs/SECURITY.md, divergence 4): set when the
// client reached this server over TLS (its own socket, or X-Forwarded-Proto
// from a TLS-terminating proxy), or as DECKO_COOKIE_SECURE directs.
function nodeCookieSecure(req) {
  return sessionCookieSecure({ scheme: req.socket?.encrypted ? "https" : "http", headers: req.headers });
}

function accountFlowErrorResponse(outcome, accountMark) {
  // The failure pages carry the deck's Default
  // Layout chrome; the bare h1/pre stubs this arm used
  // to emit read as a different site.
  if (outcome.kind === "token_invalid") {
    return renderAccountFlowDenialPage();
  }
  if (outcome.kind === "account_not_found") {
    // Ruby: a VALID token with a missing mark — the authenticator passes,
    // card#update's fetch raises NotFound -> the not_found page (format/
    // error.rb view :not_found, 404). The chromed builder below renders
    // exactly that view.
    return renderDeckoErrorPage(accountMark, "not_found");
  }
  // The validation-failure arm (token mismatch; the failure event already
  // re-sent the email): the failed-update render is the errors alert as
  // the whole main slot, titled by the updated card
  // (format/error.rb view :errors + standard_error_message).
  return renderAccountFlowAlertPage(
    422,
    accountMarkName(accountMark),
    "CONTENT",
    outcome.message,
  );
}

// ---------------------------------------------------------------------------
// Account-flow PAGE chrome. The reset/verify
// surfaces serve the deck's Default Layout wrapper around hand-built
// main-slot HTML.
// ---------------------------------------------------------------------------

/** Rails' html_escape (the h() the alert bodies go through): also folds
 *  the apostrophe, which the server's attribute escapeHtml does not. */
function escapeHtmlRails(text) {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

/** The +account URL mark's Ruby card-name form (underscores fold to
 *  spaces — the same display rule urlDisplayNameForSlug applies to error
 *  pages; the junction names this surface sees are holder+*account). The
 *  mark arrives already percent-decoded (parseAccountFlowLink). */
function accountMarkName(accountMark) {
  return String(accountMark).replace(/_/g, " ");
}

/** Shared chrome wrapper for the account-flow pages: Default Layout shell
 *  (wrapWithLayout) + the caller's main-slot bytes, shaped after
 *  renderSigninPage. */
async function renderChromedAccountFlowPage(mainSlotHtml, opts) {
  const boot = await ensureBootValues();
  const layout = await resolveDefaultLayout();
  const body = applyServedEnvironmentDeltas(
    await wrapWithLayout(opts.cardName ?? "*signin", mainSlotHtml, layout, {
      titleText: opts.titleText,
      headExtraLine: opts.headExtraLine,
      bodyExtraHtml: opts.bodyExtraHtml,
    }),
  );
  return {
    status: opts.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "close",
      "Keep-Alive": "timeout=0",
    },
    body,
  };
}

/** The authenticator's loud denial (token_invalid arm): PermissionDenied
 *  raised BEFORE any card fetch, so the format renders against an EMPTY
 *  card — empty name/title/data attrs, default RichText type keys, and the
 *  no-task denial message "sign in or sign up to do that." (card-mod-format
 *  set/all/html/error.rb:191-229 loud_denial + loud_denial_message with
 *  @denied_task unset -> t(:format_to_do_that)). Status stays 403 — the
 *  PermissionDenied status. */
function buildAccountFlowDenialSlotHtml() {
  const slotJson =
    `{"view":"denial","nest_name":"_main","nest_syntax":"_main|titled",` +
    `"hide":["menu","help"],"main":true,"home_view":"denial","main_view":true,` +
    `"layout":"Default Layout"}`;
  return (
    `<div id="-denial-view" class="card-slot denial-view ALL TYPE-rich_text" ` +
    `data-card-name="" data-card-type-id="2" data-card-type-name="RichText" ` +
    `data-card-link-name="" data-slot-id="${newSlotId()}" ` +
    `data-slot="${escapeHtml(slotJson)}">` +
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title=""></span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text"><h1>Sorry!</h1>\n` +
    `<div><div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
    `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to do that.</div></div>` +
    `</div></div></div>`
  );
}

async function renderAccountFlowDenialPage() {
  const boot = await ensureBootValues();
  // Ruby titles the empty-card denial with the bare site title (the
  // <title> carries no card name).
  return renderChromedAccountFlowPage(buildAccountFlowDenialSlotHtml(), {
    status: 403,
    titleText: boot.siteTitle,
  });
}

/** The failed-update render's main slot: the errors alert IS the whole
 *  main slot (no card-frame wrap) — format/error.rb view :errors
 *  (standard_errors: alert "warning" + class_up card-error-msg; the
 *  heading t(:format_problems_name); each error
 *  `<p><strong>ATTRIBUTE:</strong> h(message)</p>`). Note the class list's
 *  two spaces between alert-dismissible and card-error-msg below — the
 *  class_up join produces exactly that, and the bytes are the contract. */
function buildAccountFlowAlertSlotHtml(cardDisplayName, attributeLabel, message) {
  return (
    `<div class="alert alert-warning alert-dismissible  card-error-msg" role="alert">` +
    `<button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n` +
    `<h4 class="alert-heading error">Problems with ${escapeHtmlRails(cardDisplayName)}</h4>\n` +
    `<p><strong>${attributeLabel}:</strong> ${escapeHtmlRails(message)}</p></div>`
  );
}

async function renderAccountFlowAlertPage(status, cardDisplayName, attributeLabel, message) {
  const boot = await ensureBootValues();
  return renderChromedAccountFlowPage(
    buildAccountFlowAlertSlotHtml(cardDisplayName, attributeLabel, message),
    {
      status,
      // Ruby titles the failed-update render with the updated card's name
      // (the <title> is "<card name> - <site title>").
      titleText: `${cardDisplayName} - ${boot.siteTitle}`,
    },
  );
}

/** set/self/signin.rb:148-151 view :reset_password_success —
 *  `frame { t :account_check_email }` on the *signin card, titled "Sign
 *  In" (account_sign_in_title, the :title override at :134-137). Deliberate
 *  omissions (the same treatment the sign-in form page's frame has): the
 *  card-menu popover/edit/board links inside the frame header are the
 *  card-mod-format menu machinery (rails remainder). */
function buildResetPasswordSuccessSlotHtml(signinCardId) {
  const slotJson =
    `{"view":"reset_password_success","nest_name":"_main","nest_syntax":"_main|titled",` +
    `"hide":["help"],"main":true,"home_view":"reset_password_success","main_view":true,` +
    `"layout":"Default Layout"}`;
  return (
    `<div id="Xsignin-reset_password_success-view" ` +
    `class="card-slot reset_password_success-view ALL TYPE-rich_text STAR SELF-Xsignin" ` +
    `data-card-id="${signinCardId}" data-card-name="*signin" data-card-type-id="2" ` +
    `data-card-type-name="RichText" data-card-link-name="*signin" ` +
    `data-slot-id="${newSlotId()}" data-slot="${escapeHtml(slotJson)}">` +
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title="Sign In">Sign In</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text">Check your email for a link to reset your password</div>` +
    `</div></div>`
  );
}

async function renderResetPasswordSuccessPage() {
  const signinRecord = await fetchCardByName("*signin");
  return renderChromedAccountFlowPage(
    buildResetPasswordSuccessSlotHtml(signinRecord?.id ?? ""),
    { status: 200 },
  );
}

/** GET /*signin?view=edit (and /*signin/edit) — the FORGOT PASSWORD page
 *  (set/self/signin.rb:154-163 view :edit). The served deck renders the
 *  requested edit view INSIDE the page's modal container while the main
 *  article stays the titled sign-in form; the modal rides after
 *  </footer>. The modal shell reproduces that shape; the form inside
 *  is the honest stand-in posting Ruby's EXACT inputs (the full
 *  card-mod-edit form machinery — data-remote/autosave, the type row, the
 *  nested help slot — is unported rails, card-mod-account.ts
 *  NOT-PORTED block; the modal-header board link is menu machinery,
 *  omitted like the sign-in page's frame). */
function buildForgotPasswordModalHtml(signinCardId) {
  const slotJson =
    `{"view":"edit","hide":["help","save_button"],"main":true,"main_view":true,` +
    `"edit_structure":[["+*email",{"title":"email","view":"titled","nest_name":"+*email",` +
    `"skip_perms":true,"home_view":"titled"}]],"title":"Forgot Password"}`;
  return (
    `<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n` +
    `<!-- /, "data-backdrop": "static"} -->\n` +
    `<div class='modal-dialog modal-dialog-centered modal-lg'>\n` +
    `<div class='modal-content'>\n` +
    `<div class='modal-header'>\n` +
    `<span class="card-title" title="Forgot Password">Forgot Password</span>\n` +
    `<div class="modal-menu _modal-menu ms-auto">` +
    `<a class="_close-modal btn-close" data-bs-dismiss="modal" href=""><i class="notranslate material-icons">close</i></a>\n` +
    // The modal menu's board anchor (edit_content.rb:37-41's menu pair —
    // the recorded oracle fragment pins it beside the close button).
    `<a rel="nofollow" class="board-link _confirm slotter" title="Advanced"` +
    ` data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal-replace"` +
    ` data-confirm-msg="Unsaved changes will be lost. Do you want to proceed?"` +
    ` href="/*signin/board" data-remote="true">` +
    `<i class="notranslate material-icons">space_dashboard</i> </a></div>\n` +
    `</div>\n` +
    `<div class='modal-body'>\n` +
    `<div id="Xsignin-edit-view" class="card-slot edit-view ALL TYPE-rich_text STAR SELF-Xsignin" ` +
    `data-card-id="${signinCardId}" data-card-name="*signin" data-card-type-id="2" ` +
    `data-card-type-name="RichText" data-card-link-name="*signin" ` +
    `data-slot-id="${newSlotId()}" data-slot="${escapeHtml(slotJson)}">` +
    // The EDIT TYPE ROW (all/edit_content.rb's type formgroup — the
    // recorded oracle fragment renders it inside the modal's edit form:
    // the "Type" label, the cardtype link, the board_type_formgroup edit
    // link). Oracle-verbatim bytes over the fixture's *signin state.
    `<div id="Xsignin-edit_type_row-view" class="card-slot edit_type_row-view ALL TYPE-rich_text STAR SELF-Xsignin d-flex form-group row" data-card-id="${signinCardId}" data-card-name="*signin" data-card-type-id="2" data-card-type-name="RichText" data-card-link-name="*signin" data-slot-id="${newSlotId()}" data-slot="{&quot;view&quot;:&quot;edit_type_row&quot;,&quot;show&quot;:[&quot;edit_form&quot;,&quot;edit_type_row&quot;],&quot;hide&quot;:[&quot;board_link&quot;,&quot;help&quot;,&quot;save_button&quot;,&quot;type_form&quot;],&quot;home_view&quot;:&quot;edit_type_row&quot;,&quot;edit_structure&quot;:[[&quot;+*email&quot;,{&quot;title&quot;:&quot;email&quot;,&quot;view&quot;:&quot;titled&quot;,&quot;nest_name&quot;:&quot;+*email&quot;,&quot;skip_perms&quot;:true}]],&quot;title&quot;:&quot;Forgot Password&quot;}">` +
    `<div class='col-2 text-start'>\n<label>\nType\n</label>\n</div>\n` +
    `<div class='col-8'>\n<a class="known-card" href="/RichText">RichText</a>\n</div>\n` +
    `<div class='col-2 text-end'>\n<a rel="nofollow" class="ms-2 edit-link slotter" data-cy="edit-link" href="/*signin/board_type_formgroup" data-remote="true"><i class="notranslate material-icons">edit</i></a>\n</div>\n</div>` +
    // The FORM: Ruby's edit form is card-form slotter AUTOSAVE with
    // data-remote (rails-ujs submits via XHR; the reset_password_success
    // slot lands in place and the address stays /*signin — the recorded
    // oracle journey pins the unshifted address), _method patch (form_for
    // on a persisted record), id edit_card_<id>.
    `<form class="card-form slotter autosave" id="edit_card_${signinCardId}" data-slot-selector="modal-origin" data-slot-error-selector=".card-slot" action="/update/*signin" accept-charset="UTF-8" data-remote="true" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<input type="hidden" name="_method" value="patch" autocomplete="off" />` +
    `<input type="hidden" name="success[view]" id="success_view" value="reset_password_success" autocomplete="off" />` +
    `<input type="hidden" name="card[trigger]" id="card_trigger" value="send_reset_password_token" autocomplete="off" />` +
    `<fieldset class="card-editor editor">` +
    `<div class="form-group card-editor RIGHT-Xemail" data-card-name="*signin+*email" data-card-link-name="*signin+*email">` +
    `<label for="card_subcards___email_content"><span class="card-title" title="email">email</span></label>\n` +
    `<div class="editor content-editor">` +
    `<input class="d0-card-content form-control" placeholder="" type="text" value="" name="card[subcards][+*email][content]" id="card_subcards___email_content" />\n` +
    `</div></div></fieldset>\n` +
    `<button name="button" type="submit" class="_close-modal-on-success btn btn-primary">Reset password</button></form>\n` +
    `<!-- decko-ts staging: renders the full card-mod-edit ` +
    `form machinery here (rails remainder); this honest form posts Ruby's ` +
    `exact inputs to /update/*signin. -->\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

async function renderForgotPasswordPage() {
  const signinRecord = await fetchCardByName("*signin");
  const modalHtml = buildForgotPasswordModalHtml(signinRecord?.id ?? "");
  return renderChromedAccountFlowPage(buildSigninSlotHtml(), {
    status: 200,
    bodyExtraHtml: modalHtml,
  });
}

/** POST /update/*signin with card[trigger]=send_reset_password_token — the
 *  forgot-password form's submit (set/self/signin.rb:27-31
 *  send_reset_password_token over HTTP). Response mapping follows Ruby:
 *  success 303 See Other -> the absolute reset_password_success URL
 *  (Ruby's redirect_to after abort :success, success view reset_password_success,
 *  empty body); validation failures 422 + the errors alert page. A POST
 *  WITHOUT the trigger is not the forgot-password submit: Ruby routes it
 *  through the *signin event machinery (the :signin event — the sign-in
 *  POST lives at /_signin on this surface), so the request delegates to
 *  the general write path with the pre-read body — the exact dispatch it
 *  got before this handler existed. */
async function handleForgotPasswordSubmit(req, startedAt = Date.now()) {
  let raw;
  try {
    raw = await readRequestBody(req);
  } catch (error) {
    return accountFlowResponse(400, { ok: false, message: `unreadable request body: ${error}` });
  }
  let email = "";
  let trigger = "";
  const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/json" || raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      email = String(parsed?.email ?? "");
      trigger = String(parsed?.trigger ?? "");
    } catch {
      email = "";
    }
  } else {
    const params = new URLSearchParams(raw);
    email = params.get("card[subcards][+*email][content]") ?? params.get("email") ?? "";
    trigger = params.get("card[trigger]") ?? "";
  }
  if (trigger !== "send_reset_password_token") {
    if (writePathEnabled()) {
      const writeResponse = await dispatchWriteRequest(req, FORGOT_PASSWORD_SUBMIT_PATH, raw);
      if (writeResponse !== null) {
        await applyWriteResponseTail(writeResponse, startedAt, req.method, FORGOT_PASSWORD_SUBMIT_PATH);
        return writeResponse;
      }
    }
    return jsonResponse(405, { error: "method not allowed" });
  }
  const outcome = await sendResetPasswordToken(accountFlowCtx(), email);
  if (!outcome.ok) {
    // the error ladder lands on the FIELD the event blames
    // (set/self/signin.rb:86-102 blank_email?/reset_password_fail):
    // email -> EMAIL, account -> ACCOUNT.
    const attributeLabel = outcome.reason === "not_active" ? "ACCOUNT" : "EMAIL";
    return renderAccountFlowAlertPage(422, "*signin", attributeLabel, outcome.message);
  }
  // Ruby's success redirect: 303 See Other to the absolute
  // reset_password_success URL (captured: Location:
  // http://localhost:3011/*signin/reset_password_success, 0-byte body) —
  // for a PLAIN (non-ajax) form submit. The form is data-remote
  // (rails-ujs): the ajax answer is cud_success's soft redirect — the
  // reset_password_success SLOT at 200, rendered in place with the address
  // unshifted (the recorded oracle journey pins /*signin after the reset).
  if (req.headers["x-requested-with"] === "XMLHttpRequest") {
    const signinRecord = await fetchCardByName("*signin");
    return {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      body: buildResetPasswordSuccessSlotHtml(signinRecord?.id ?? ""),
    };
  }
  const host = String(req.headers.host ?? "").trim();
  const origin = host !== "" ? `http://${host}` : ensureBootValuesOrigin();
  return {
    status: 303,
    headers: { Location: `${origin}/*signin/reset_password_success`, "Cache-Control": "no-store" },
    body: "",
  };
}

function ensureBootValuesOrigin() {
  const configured = process.env.DECKO_ORIGIN;
  return typeof configured === "string" && configured !== "" ? configured : "http://127.0.0.1";
}

/** The success redirect of a link-consumption CUD (Ruby's
 *  card_controller/response.rb:29-33 `redirect_cud_success`):
 *  `hard_redirect success.to_url, 303`.
 *
 *  The address is Success#to_url (card/lib/card/env/success.rb:23-25):
 *  `target.format.path(params)` over the success args the event pushed, so
 *  for `success << {id: name, view: :edit}`
 *  (mod/account/set/right/account/events.rb:100-104) it is
 *  Card::Path#path(view: :edit) on the account card — and Ruby's Path
 *  answers the PATH form, not the query form
 *  (mod/format/lib/card/path.rb:37-45 `base`: a mark AND a view render
 *  "#{mark}/#{view}"; `view` is `opts.delete`d at :60-62, so it never
 *  also lands in the query). Hence "/Mira_Member+*account/edit".
 *
 *  Absolute, as hard_redirect's card_url (response.rb:38-41) makes it:
 *  origin + card_path(relative_path) (mod/format/set/all/path.rb:66-70,
 *  the HTML format's contextualize_path).
 *
 *  THE MARK IS NOT PERCENT-ENCODED. Card::Path builds it from
 *  `name.url_key` (path.rb:64-71 interpret_mark), and Cardname#url_key
 *  already makes a URL-safe mark: word characters and `*` survive, runs
 *  of space/underscore collapse to one "_", parts join with "+"
 *  (cardname/lib/cardname/variants.rb:8-14 + cardname.rb:37 OK4KEY_RE).
 *  Nothing downstream escapes it — Location#card_path returns any string
 *  that starts with "/" untouched (card/lib/card/env/location.rb:12-21)
 *  and redirect_to uses a full URL verbatim — so Ruby answers
 *  "…/Mira_Member+*account/edit" with the junction's "+" and "*"
 *  literal, where encodeURIComponent sent "%2B".
 *
 *  THE EMPTY MARK is Ruby's `success << ""`
 *  (verify_and_activate_success, mod/account/set/right/account/events.rb
 *  :87-92): Success#<< hands a String to `mark=`, process_target's
 *  `when ""` arm keeps it (card/lib/card/env/success.rb:30-35,
 *  success/target.rb:22-34), and to_url returns that "" unrendered
 *  because the target is not a Card (success.rb:23-25). card_url("")
 *  is then the site root (location.rb:12-21). */
function successRedirect(name, view, req) {
  const host = String(req?.headers?.host ?? "").trim();
  const origin = host !== "" ? `http://${host}` : ensureBootValuesOrigin();
  if (name === "") {
    return { status: 303, headers: { Location: `${origin}/`, "Cache-Control": "no-store" }, body: "" };
  }
  const target = `${origin}/${DeckoName.parse(name).urlKey}${view ? `/${view}` : ""}`;
  return { status: 303, headers: { Location: target, "Cache-Control": "no-store" }, body: "" };
}

/** POST /_account-password — the +account edit form submit's staging
 *  endpoint (the set/right/password.rb validate/store events). Requires a
 *  live session (the signed-in member Ruby's flow leaves on the +account
 *  edit page); writes that member's own +*account+*password digest. */
async function handleAccountPassword(req) {
  const sessionToken = readSessionCookie(req.headers.cookie);
  const actor = sessionToken !== null ? await sessions.lookupSession(sessionToken) : null;
  if (actor === null) {
    return accountFlowResponse(401, { ok: false, message: "sign in first (session cookie required)" });
  }
  let raw;
  try {
    raw = await readRequestBody(req);
  } catch (error) {
    return accountFlowResponse(400, { ok: false, message: `unreadable request body: ${error}` });
  }
  let password = "";
  let accountMark = `${actor.name}+*account`;
  const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/json" || raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      password = String(parsed?.password ?? "");
      if (typeof parsed?.account === "string" && parsed.account !== "") accountMark = parsed.account;
    } catch {
      password = "";
    }
  } else {
    const params = new URLSearchParams(raw);
    password = params.get("password") ?? "";
    const account = params.get("account");
    if (account !== null && account !== "") accountMark = account;
  }
  const outcome = await applyNewAccountPassword(
    { driver: authDriver, fetcher: flowsFetcher, actor },
    accountMark,
    password,
  );
  if (!outcome.ok) {
    return accountFlowResponse(422, { ok: false, message: outcome.message });
  }
  expireFlowWrittenName(accountMark);
  return accountFlowResponse(200, { ok: true, noOp: outcome.noOp });
}

/** GET /_mail-log — drain the capture transport (DECKO_MAIL_CAPTURE=1
 *  only). Staging-only debug surface for asserting envelopes. */
function handleMailLog() {
  if (!(mailTransport instanceof CaptureTransport)) {
    return accountFlowResponse(404, { error: "mail capture is off (boot with DECKO_MAIL_CAPTURE=1)" });
  }
  return accountFlowResponse(200, { messages: mailTransport.drain() });
}

// The Auth::Token HMAC secret (Rails' secret_key_base analog, read by
// card-1.110.0/lib/card/auth/token.rb:7 to sign the account verify_url /
// reset_password_url links). Pinned via DECKO_TOKEN_SECRET by exactly the
// same rule as the CSRF secret (declared below with the write-path
// secrets): env so links survive a restart, a per-boot random so an unset
// deployment cannot sign under a known key. It is handed to the engines as
// RenderEngine.tokenConfig and is never written to the repo or to a log
// line. Declared here — not with the other secrets below — because the
// boot sequence reads TOKEN_CONFIG immediately after engine construction;
// declaring it below that first reader was a top-level use-before-declaration
// boot crash.
const TOKEN_SECRET =
  process.env.DECKO_TOKEN_SECRET ?? crypto.randomBytes(32).toString("hex");

/** The token config every engine in this process shares — the same secret,
 *  and the railtie's own expiry default (cardio/railtie.rb:12 `2.days`,
 *  the value Auth::Token.expiration reads). */
const TOKEN_CONFIG = {
  secret: TOKEN_SECRET,
  // The token expiry's "now" rides the CAPTURE wall clock (wall-clock.ts —
  // the same seam the card reads): Ruby's harness freezes Time.now
  // (harness_env.rb freeze_clock!) and token.rb's `from_now.to_i` expires
  // on the frozen instant, so the mailed reset token's JWT exp — and thus
  // the mail bytes — only match when the port mints on the same clock.
  now: () => Math.floor(cardWallClockNow().getTime() / 1000),
};

const fetcher = new FetchEngine(driver, { sharedStore, database: "decko" });
// Deck boot BEFORE any engine construction: RenderEngine's constructor binds
// getDefaultModLoader() (render.ts:539), so the loader must be in place
// before the first engine exists — the same order Ruby boots in (mods load,
// then controllers render). Every profile boots the mods: stock Decko
// composes them (dirs.rb:54-62), and the mod views ARE its serving.
defaultDeckLoader();
const render = new RenderEngine(fetcher);
render.fontAwesomeAssetMode = configureFontAwesomeMode(process.env.DECKO_FONT_AWESOME);
// The Auth::Token signing secret (TOKEN_CONFIG above), same host-deployment
// config shape as imageCdnHost on the next lines.
render.tokenConfig = TOKEN_CONFIG;
// The engine's imageCdnHost is host-deployment config
// (RenderEngineLike.imageCdnHost; undefined = host-relative /files URLs).
// The deck serves carrierwave cloud attachments from the .cdn. Spaces
// subdomain — SPACES_HOST above.
render.imageCdnHost = STOCK_DECK ? undefined : SPACES_HOST;
if (STOCK_DECK) render.renderAbsentCards = true;

// Sync name-environment adapters (mark strings like "~9", ":search_type"
// resolve through engine.peekLexiconId etc., which read warm caches only;
// the worker primes them via primeCqlNameResolver. The Node boot mirrors
// that: load the lexicon, load the codenames, then install).
const HOME_CARD_NAME = "Home";
const OPEN_VIEW = "open";

await primeEngine(fetcher);

// ---------------------------------------------------------------------------
// Layout / asset URLs
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
//      — covers plain <card>+*layout rules
//   2. Junction-of-junction:   left_id = <card>+*self,   right_id = 255
//      — the *self junction (left=<card>, right=264) is a 2-level indirection
//      for cards whose layout rule was authored as <card>+*self+*layout
//   3. *all+*layout fallback:  left_id = 274 (*all),     right_id = 255
//      — the catch-all rule (rule id 275, db="Default Layout").
//
// No type-based `+*type+*layout` rules exist in this corpus, so only the
// exact rule + the *all fallback need to be implemented.
const LAYOUT_POINTER_ID = 255; // *layout set pointer (corpus)
const ALL_CARD_ID = 274; // *all card id (corpus)
const SELF_POINTER_ID = 264; // *self set pointer (corpus)

// *all+*style → a customized skin card (a bootswatch_skin type
// card carrying the `customized_skin` codename). Its
// asset output is card id 45514; the corpus stores the OLDER revision in
// db_content ("(my_bucket)/45514/9999999999.css"), but the revision the
// served deck actually serves is 0000000001. The served stylesheet EQUALS
// our SassC compile of the deck's current skin with the asset-host setting
// applied — mod-relative `url(/mod/…)` font/image URLs rewritten to the
// asset host — and that transformed compile is what the deployed
// compiled-assets directory carries.
const MAIN_CSS_URL = `${SPACES_HOST}/files/45514/0000000001.css`;
// *all+*script (rule id 20616) asset output is card id 50617.
const MAIN_JS_URL = `${SPACES_HOST}/files/50617/0000000002.js`;

// Style-mod file cards (their CSS asset outputs); see card-mod-assets'
// :remote_style_tags. The card-mod-asset compiled bytes are also bucket
// references — there is no compiled CSS in the scrubbed corpus. The
// routes below serve what's available.
const STYLE_MOD_ASSETS = [
  `${SPACES_HOST}/files/45514/0000000001.css`,
];

// All asset output cards the corpus references (type_id 18, db_content
// like "(my_bucket)/NNN/ACTION.EXT" or "~NNN/ACTION.EXT"). Used to validate
// /files routes; loaded at boot from the corpus.
const ASSET_OUTPUT_FILE_CARD_IDS = [];

async function primeEngine(engine) {
  // 1. Codenames (small, one statement).
  await engine.codenames.ensureLoaded();
  // 1b. Codename defensive registration: the corpus
  // leaves `type` / `by_name` / `members` rows
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
  // 3b. The stored nest index describes the content before the first render
  //     (src/card/nest-index.ts). The step runs on the AUTH driver, which is
  //     open writable whatever this host's browse posture is (the browse
  //     driver above is read-only unless DECKO_WRITE_PATH=1), so a read-only
  //     host still brings the index current at boot rather than serving by
  //     walking its nest closure.
  await ensureNestIndex(authDriver, engine.lexicon);
  // 4. Virtual-card rule universe: the
  //    storage factory's responsibility per
  //    src/card/fetch/virtual-cards.ts:44-49. Without this hook,
  //    `<card>+*right`-style compound names that resolve only
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
  // 5. Cold-start warm render: the engine's
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

// Map the deck's main-skin card so the main-CSS route
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
 *  '+' is DECKO'S JOINT (Card::Name.joint, card 1.110.0 lib/cardname.rb) and
 *  must survive into the name — see deploy/worker.ts#decodeName.
 *  Underscores decode to spaces BEFORE the fetch — card_class.rb:126-131
 *  uri_fetch_opts `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`: same
 *  key either way; the decode is what an absent-card render displays
 *  (src/server/worker-shared-surface.ts#decodeName carries the full note). */
function decodeName(raw) {
  try {
    return decodeURIComponent(raw).replace(/_/g, " ");
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
// The fallback value matches the served deck's site title so
// the very first request served before the lazy init completes still
// renders the correct title.
//
// The favicon and logo URLs are derived from the corpus image-card records
// (id 103 = *favicon, id 79 = *logo). Their db_content carries the
// `(my_bucket)/<id>/<fileId>.jpg` shape, so the live URL is
// `<SPACES_HOST>/files/<id>/<fileId>-small.jpg` — the `-small` size suffix
// matches the URLs the served deck's nav-logo <img> and favicon <link>
// carry:
//   /files/79/0000000003-small.jpg   (logo)
//   /files/103/0000000004-small.jpg  (favicon)
// Both return 200 image/jpeg on the Spaces host; SPACES_HOST is the .cdn.
// host form the served pages actually name.
const SITE_TITLE_DEFAULT = "Example Site";
let siteTitleLoaded = null;
async function ensureBootValues() {
  if (siteTitleLoaded !== null) return siteTitleLoaded;
  const result = {
    siteTitle: SITE_TITLE_DEFAULT,
    logoUrl: `${SPACES_HOST}/files/79/0000000003-small.jpg`,
    faviconUrl: `${SPACES_HOST}/files/103/0000000004-small.jpg`,
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
      // db_content matches the hard-coded URLs above. If the corpus shape
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
// slug (e.g. /Basic -> "basic", /help -> "Help"). The page title is
// "<card.name> - <*title>", built from the card's STORED name verbatim so
// the title casing matches what the deck serves for each page.
//
// Card names are case-insensitive in the deck (Card::Name#key is the
// downcase-and-underscore form). Match on lowercased comparison so
// /help finds the "Help" card (stored with capital H) and /Basic finds
// the "basic" card (stored lowercase).
async function resolveCardStoredName(slugName) {
  try {
    // The deck stores names with spaces; URL slugs use underscores.
    // Normalize both sides so the equality
    // matches regardless of which form the caller used, and also drop a
    // trailing "?" some stored names carry that their URL slug omits.
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
// the corpus records directly so the navbar matches the served shape.
//
// Menu source: the *main menu card (type Pointer, db_content a wiki-
// link list). Each line `[[*X|label]]` becomes either a dropdown parent
// (when `*X` is itself a Pointer card with sub-items) or a flat link.
// The dropdown child card (Pointer, db_content list of items with
// `*dropdown divider` markers) becomes the dropdown child list.
//
// Behaviors matched to the served deck:
//   - Skip external URL entries ("https://…|Label") so the dropdown
//     does not emit `<a href="/https://…">` — the malformed `/https://`
//     href the served deck does not produce (it renders a denied span
//     for those entries instead).
//   - Skip the specific nav entry named below that the served deck
//     denies anonymous readers of: the trailing denied span is rendered
//     in its place.
//   - Replace spaces AND "$" with "_" in the rendered href so
//     "$"-bearing names land at the underscored URL (the deck's
//     Card::Name#to_url_key behavior).
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
      // The served deck's navbar_links view DOUBLE-WRAPS
      // the dropdown li — the main-nav bytes are
      // `<ul class="navbar-nav"><li class="nav-item"><li class="nav-item
      // dropdown">…</span></div></li></li>`: a stray empty
      // `<li class="nav-item">` precedes the dropdown li and the pair
      // closes `</li></li>`. Reproduce that shape; each dropdown child
      // and the divider div are followed by a newline.
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
          // Drop external entries: the served deck omits them for the
          // anonymous viewer (they render as a denied span instead).
          continue;
        } else if (child.target === "Adminu") {
          // The served deck shows the denied span instead of rendering
          // this entry for anonymous users (it is not anonymous-readable;
          // matched by name below). Drop the entry; the denied span
          // appended after the loop is the served shape.
          continue;
        } else {
          // Card::Name#to_url_key: spaces become underscores; "$" is
          // not a URL-safe character and the deck slugs it to "_" as well.
          const childKey = child.target
            .replace(/ /g, "_")
            .replace(/\$/g, "_");
          parts.push(
            `<a class="dropdown-item known-card" href="/${escapeHtml(childKey)}"><span class="card-title" title="${escapeHtml(child.target)}">${escapeHtml(child.label)}</span></a>\n`,
          );
        }
      }
      // The served deck closes the dropdown with a denied
      // permission marker for the trailing card; preserve that shape.
      // (The newline before it comes from the trailing child's own \n.)
      parts.push(`<span class="denied"><!-- Sorry, you don't have permission (read) --></span>`);
      // Item separator is the content's own "\r\n": the menu content's
      // CRLF line endings must survive into the output — a plain "\n"
      // here shifted every subsequent byte of the served page.
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
// a wiki-link-style `[[http://…|label]]` for external entries. Dropdown
// cards list each item as a bare card name with `*dropdown divider`
// marker lines between groups.
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
// most common default; the corpus's layouts name their views explicitly
// and both produce parseable nests, so this
// fallback only fires when the layout body is unknown / missing).
function parseMainViewFromLayoutBody(body) {
  if (typeof body !== "string" || body.length === 0) return "content";
  const m = /\{\{_\s*main\s*\|\s*([A-Za-z0-9_]+)/.exec(body);
  if (m !== null && typeof m[1] === "string" && m[1].length > 0) return m[1];
  return "content";
}

// The deck's *footer nests `{{+:image|core}}` (the credit SVG) and
// `<a href="http://decko.org">Decko v{{:version|core}}</a>`. The
// credit_image card's db_content is the rendered SVG; the version string
// is pinned below. The deck wraps the rendered
// body in a card-slot content-view div whose data-slot JSON names the
// :footer|content nest_syntax the layout chain uses to insert the
// footer setting card. Reproduce that wrapper so the
// served page matches the served shape: every footer in
// this corpus uses the `card-slot content-view ALL TYPE-html
// STAR SELF-Xfooter d0-card-content` shape with the credit row inline.
async function renderFooterContent() {
  const creditImage = await fetchCardDbContent("*credit_image");
  // The version is deliberately pinned to "0.19.1" — the value the
  // served deck prints — even though the decko-ts corpus's *version card
  // says 0.20.0 and stock Decko 0.20.0 would print that. This constant is
  // the SERVED value, not the corpus value; do not "correct" it to the
  // corpus's number.
  const version = "0.19.1";
  // The corpus's *credit_image db_content ends "</svg>\n" (a trailing
  // newline the import carried). The template below supplies exactly one
  // "\n" between the SVG close and the decko.org link, so strip the
  // content's trailing newline to avoid doubling it.
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
    // Single escape only: escapeHtml turns each `"` into `&quot;`.
    // Pre-replacing quotes with `.replace(/"/g, "&quot;")` before
    // escapeHtml double-escapes the `&` (`&amp;quot;`), +4 bytes per
    // quote on every served page — a past whole-page corruption bug.
    `<div id="Xfooter-content-view" class="card-slot content-view ALL TYPE-html STAR SELF-Xfooter d0-card-content" data-card-id="22749" data-card-name="*footer" data-card-type-id="50" data-card-type-name="HTML" data-card-link-name="*footer" data-slot-id="33f1de3d32299e8ffeb8" data-slot="${escapeHtml(JSON.stringify(slot))}">${body}</div>`
  );
}

// Wrap the rendered card view in the deck's chosen layout rule's body
// and the outer HTML doc the engine's `wrap_with_html_page` would emit.
//
// Layout rule resolution (parity with Ruby's set-rule lookup):
//   1. Most specific rule: a junction whose right_id = *layout (255)
//      and whose left_id is either the card itself or the card's
//      Card+*self junction (the *self indirection — see
//      LAYOUT_POINTER_ID / SELF_POINTER_ID docs).
//   2. Fallback: *all+*layout (the catch-all rule, db_content "Default
//      Layout"). Every card falls back here unless it has a specific
//      rule.
//
// The layout BODY drives the whole page SHELL, not just
// the main slot. The body's `{{:header|core}}`, `{{_main|<view>}}`,
// `{{:footer|content}}`, and `{{*foot|core}}` tokens are substituted;
// everything around them (body tag attributes, article/footer wrappers)
// is the layout's own bytes. A layout body without the header/footer
// nests yields a bare shell with NO header/nav/footer. The outer
// card-slot nesting follows the layout's mainView.
// `pageOpts` (optional, error pages only — regular pages never pass
// it, and the defaults keep their bytes identical):
//   headExtraLine — a complete extra <head> line (with its trailing "\n")
//     emitted between the viewport meta and the blank line before the
//     favicon link. The served not_found page inserts
//     `<meta content='noindex' name='robots'>` there — the noindex line
//     is the only head difference between the two error shapes.
//   titleText — the full "<name> - <site title>" string. Error pages for
//     names with no stored card row carry the URL display form
//     (underscores folded to spaces), which resolveCardStoredName
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
  // The error pages' main-slot HTML is hand-built above
  // (buildNotFoundSlotHtml / buildServerErrorSlotHtml) and carries no
  // [[...]] tokens or heading quirks, so no body post-processing is
  // needed here.
  const bodyProcessed = viewHtml;
  const pageTitle = pageOpts.titleText ?? `${storedName} - ${boot.siteTitle}`;
  const cssUrl = MAIN_CSS_URL;
  const jsUrl = MAIN_JS_URL;
  // The page SHELL is built from the resolved
  // layout's BODY — the per-card layout rule drives the whole document,
  // not just the main slot. A layout whose body carries only the main
  // nest serves NO header/nav/footer/article chrome — its shell is
  // `<body >` + `<div><div id="main">…`. Default Layout's body
  // (`<body class="d-flex flex-column h-100">…`)
  // produces the standard header/article/footer chrome from the same
  // substitution rules. The layout-body indentation (2-space header/
  // article/footer) is part of the bytes and is preserved as-is.
  //
  // The served document shell is INDENTED — the first
  // bytes of every served page are
  // `      <!DOCTYPE HTML>\n      <html class="h-100">\n        <head>\n          <title>…`
  // (6/6/8/10 spaces), the head closes at 8 spaces, and the body tag
  // sits at 8 spaces with a flush `</body>` and a 6-space `</html>`.
  // The indentation is part of the served bytes and is reproduced
  // verbatim below.
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
  // contains "$" sequences can never be read as
  // special replacement patterns.
  const renderedInner = layoutInner
    .replace(/\{\{:header\|core\}\}/g, () => headerHtml)
    .replace(/\{\{:footer\|content\}\}/g, () => footerHtml)
    // A layout body that nests `<p>{{*foot|core}}</p>`
    // renders `<p></p>` for the anonymous viewer — the nest contributes
    // zero bytes, so substitute "".
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
    // The served deck loads the four CDN scripts WITH the
    // integrity attributes below — jquery sha256, jquery-ujs/ace/select2
    // sha512 — and sets decko.rootUrl to the deployed site's absolute
    // origin (a relative `'/'` is the wrong shape).
    `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>\n` +
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>\n` +
    `<!-- mod: ace editor (remote) -->\n` +
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous" integrity="sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw=="></script>\n` +
    `<!-- mod: bootstrap (remote) -->\n` +
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" integrity="sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==" referrerpolicy="no-referrer"></script>\n` +
    // The shell's Font Awesome tag follows the selected provider (stock kit
    // bytes when unconfigured), exactly as the engine's javascriptTags does
    // for engine-rendered heads (page.ts javascriptTags).
    fontAwesomeHeadTag(render.fontAwesomeAssetMode) + `\n` +
    `<!-- MAIN DECKO JAVASCRIPT -->\n` +
    `<script src="${escapeHtml(jsUrl)}"></script>\n` +
    `<script>\n` +
    `//<![CDATA[\n` +
    `decko.rootUrl='https://example.org/';\n` +
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
    `        ${layout.layoutBody.slice(bodyTagMatch.index, bodyOpenEnd)}${renderedInner}${pageOpts.bodyExtraHtml ?? ""}</body>\n` +
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
  // exactly as the served page does.
  out = out.replace(
    /\{\{:search\|search_box\}\}/g,
    `<div class='d0-search-box'>\n` +
      `<form role="search" class="search-box-form" action="/*search" accept-charset="UTF-8" method="get"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="text" name="query[keyword]" id="query_keyword" class="_search-box search-box form-control w-100" autocomplete="off" data-completepath="/*search/search_box_complete.json" placeholder="Search" /></form>\n` +
      // The search_box view closes with its own newline; without it the
      // form's </div> and the *header wrapper's </div> join onto one line
      // and every later byte of the page shifts.
      `</div>\n`,
  );
  // 6) Account links: Sign up / Sign in <ul> matching the served shape.
  out = out.replace(
    /\{\{:account_links\|navbar_links\}\}/g,
    `<ul class="navbar-nav"><li class="nav-item"><a class="nav-link signup-link known-card" href="/new/Sign_up">Sign up</a></li>\n` +
      `<li class="nav-item"><a class="nav-link signin-link known-card" href="/*signin">Sign in</a></li></ul>`,
  );
  return out;
}

// ---------------------------------------------------------------------------
// Decko error pages (full-chrome error surfaces)
// ---------------------------------------------------------------------------
//
// The bare stubs this
// server used to emit for error renders read as a different site, so both
// served error shapes are reproduced here:
//
//   not_found  — for a requested name with no card row. Default Layout
//   chrome + main slot
//   `<div id="<key>-not_found-view" class="card-slot not_found-view ALL
//   TYPE-basic_c" …>` with h1 "Not Found" and "Could not find <Name>.
//   Please sign in or sign up to create it.", plus
//   `<meta content='noindex' name='robots'>` in the head and the title
//   "<Name> - <site title>" in the URL display form (underscores become
//   spaces). Decko mechanism: format/error.rb page_view_for_unknown →
//   :not_found with root.error_status = 404 (card 1.110.0 lib/card/format/
//   error.rb:49-55), so the response status stays 404.
//
//   server_error — for a page whose render raises (non fetch miss).
//   Default Layout chrome + `<div class='border border-danger text-center
//   p-3'>` with h1 "Wild Card!", h2 "500 Server Error", h4 "Yuck, sorry
//   about that." — Decko's deck error page. No noindex meta. Status 500.
//
// The not-found card's type constants (id 22281, name "BasicCs", class
// token "basic_c") are pinned to the served bytes, not derived: the type a
// fresh Decko card gets comes from the *all+*default rule, and this
// corpus's copy of that rule is empty (cards.id 28, db_content "").
// The served bytes are the contract here, the same policy as the
// "Decko v0.19.1" footer pin.
const NOT_FOUND_DEFAULT_TYPE = {
  id: "22281",
  name: "BasicCs",
  classToken: "basic_c",
};

// The not_found outer slot's data-slot JSON: exactly what a Default Layout
// page's main slot carries (the layout nests {{_main|titled}}; the view
// redirect to not_found changes only the slot's id/class, not the nest
// options). Key order matches the served slot JSON's key order.
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

// The main-slot bytes for the not_found page: the served slot div's
// shape, verbatim except the per-name fields (id prefix, data-card-name,
// em, url key) and the per-request slot id. escapeHtml turns the JSON's
// `"` into `&quot;` (single-escaped — do not double-escape; the footer's
// `&amp;quot;` shape is a page-wide corruption this must not copy).
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
// verbatim to the served shape. No card-slot
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
// semantics fold "_" to " " in displayed names. Only for
// error pages — existing cards always display their stored name.
function urlDisplayNameForSlug(slugName) {
  return slugName.replace(/_/g, " ");
}

// Resolve *all+*layout (the deck-wide Default Layout rule) without a card
// context. The error surfaces are laid out by the deck's default layout —
// the served not_found slot records
// `"layout":"Default Layout"` even though the page's own resolution may
// have picked a specific (or failed) layout before the error. Page
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

// Build and return one of the two served error shapes. Any failure inside the
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
      // way the regular pages do.
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
// Served-environment deltas — the deck-deployment bytes the engine's
// page path intentionally does NOT own.
//
// renderPageBytes pins the engine's fixed environment (see
// src/card/render/page.ts): fog
// attachment URLs at `http://s3.amazonaws.com//files/`, the corpus-stored
// stylesheet revision, the remote-script manifest without integrity
// attributes, and no trailing newline. The SERVED deck differs from that
// pinned environment in five ways, and those deltas are THIS origin's
// deployment config (they live here — SPACES_HOST,
// MAIN_CSS_URL — so the engine's pinned contract survives
// untouched):
//
//   1. Asset host: every served asset URL uses the .cdn. Spaces
//      subdomain — the engine pins the fog
//      endpoint form `http://s3.amazonaws.com//files/...`. Rewritten
//      wholesale; content images already carry the Spaces host via the
//      engine's imageCdnHost seam (render.imageCdnHost above), so only
//      the pinned forms remain to rewrite.
//   2. Stylesheet revision: the served deck serves
//      /files/45514/0000000001.css (equal to our SassC compile of the
//      skin with the asset-host rewrite applied);
//      the corpus row stores the OLDER 9999999999 revision, which the
//      engine resolves from *all+*style+*asset output. Pinned on both the
//      stylesheet link and decko.cssPath.
//   3. CDN script integrity attributes: the served deck loads jquery /
//      jquery-ujs / ace / select2 WITH the sha256/sha512 integrity hashes;
//      the engine's pinned manifest omits them.
//   4. Footer version pin: the served deck prints "Decko v0.19.1"; the
//      corpus's *version row is
//      EMPTY (a corpus data gap, not an
//      engine defect), so the engine's footer nest renders bare
//      `>Decko v</a>`. The pin restores the served byte.
//   5. Trailing newline: every served page ends
//      `</html>\n`; the engine's page string ends at `</html>`.
const SERVED_ASSET_HOST_PREFIX = "http://s3.amazonaws.com//files/";
const SERVED_CSS_REVISION = "45514/9999999999.css";
const SERVED_CSS_REVISION_LIVE = "45514/0000000001.css";
// The script integrity attributes, verbatim as the served head carries them.
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
  // A stock deck is served exactly as the engine renders it.
  if (STOCK_DECK) return engineHtml;
  let body = engineHtml;
  // 1. Asset host: the engine's fog-endpoint form -> the served .cdn.
  //    Spaces host. The
  //    engine's CLOUD_URL_PREFIX already carries the "files/" web path, so
  //    the replacement re-adds it.
  body = body.split(SERVED_ASSET_HOST_PREFIX).join(`${SPACES_HOST}/files/`);
  // 2. Stylesheet revision: corpus-stored -> served (link + cssPath).
  body = body.split(SERVED_CSS_REVISION).join(SERVED_CSS_REVISION_LIVE);
  // 3. Script integrity attributes.
  for (const { src, withIntegrity } of SERVED_SCRIPT_INTEGRITY) {
    body = body.split(src).join(withIntegrity);
  }
  // 4. Footer version pin (the corpus *version row is empty; the served
  //    value is pinned above renderFooterContent).
  body = body.split(`>Decko v</a>`).join(`>Decko v0.19.1</a>`);
  // 5. Trailing newline after </html> (served byte shape).
  if (!body.endsWith("\n")) body += "\n";
  return body;
}

// renderEngine defaults to the module's anonymous engine — every
// pre-existing caller is byte-identical. Signed-in requests pass the actor's
// engine (engineForActor below) so the page renders under that account's
// read rules (render.ts viewer seam; permission state memoizes per engine,
// which is why actors get their own instance instead of a shared mutable
// viewer field).
/** Decko's new-card routes (decko-0.20.0 config/engine_routes.rb):
 *  `get "new/:type"` (view new, no mark) and the legacy
 *  `get "card/:view(/:mark)"` with view new. The card's name, type and
 *  content come from the query as Ruby's controller reads them (card[name],
 *  card[type] or type, card[content]; card_class.rb:104-133). Returns
 *  { name, newCard } for these routes, null for every other path. */
function parseNewCardRoute(segs, query) {
  let typeName;
  let mark;
  if (segs.length === 2 && segs[0] === "new" && segs[1] !== "") {
    typeName = decodeName(segs[1]);
  } else if (segs[0] === "card" && segs[1] === "new" && segs.length <= 3) {
    mark = segs[2] ? decodeName(segs[2]) : undefined;
  } else {
    return null;
  }
  return { name: query.get("card[name]") ?? mark ?? "", mark, typeName };
}

/** The new-card arguments of a request (uri_fetch_opts, card_class.rb:128-133):
 *  the card hash from the query, the type from card[type] or the type
 *  param (or the /new/:type segment), the name from card[name] or else the
 *  mark with underscores read as spaces. They build the card only when it
 *  does not exist. */
async function newCardRenderParams(mark, query, routeType) {
  const newCard = {};
  const name = query.get("card[name]") ?? (mark ? mark.replace(/_/g, " ") : undefined);
  if (name !== undefined) newCard.name = name;
  // The type by name, as extract_type_id resolves it (type.rb:96-107).
  const typeName = query.get("card[type]") || query.get("type") || routeType;
  if (typeName) {
    const typeCard = await fetcher.fetchByName(typeName);
    if (typeCard?.id !== undefined) newCard.typeId = typeCard.id;
  }
  const content = query.get("card[content]");
  if (content !== null) newCard.content = content;
  return { newCard };
}

async function renderCardPage(cardName, renderEngine = render, requestedView, renderParams, pageOpts = {}) {
  // rest.rb:53 load_card's last statement is record_as_main (rest.rb:63-66)
  // — `Card::Env.main_name = params[:main] || card&.name || ""`. This host's
  // load_card+show is this one function, so the record happens here, once
  // per card load, ahead of every render branch below. `_main` resolves
  // through it (cardname contextual.rb #absolutize_contextual_parts).
  recordAsMain(pageOpts.mainParam, cardName);
  // rest.rb:58-60 load_action's edit_draft arm: with the flag present and
  // drafts on the card, the content the render sees is the CARD-SCOPED
  // last draft's last change (content/all.rb:42-44; Card#drafts is
  // draft-true actions in id order, card.rb:173). No drafts -> the saved
  // content stands, Ruby's untouched-content cell. The override rides the
  // render params (the seam the render entry carries), so every branch
  // below sees it.
  if (pageOpts.editDraftPresent === true) {
    const draftCard = await renderEngine.fetcher.fetchByName(cardName);
    if (draftCard?.id !== undefined) {
      const draft = await lastDraftContent(fetcher.driver, draftCard.id);
      if (draft !== undefined) {
        renderParams = { ...(renderParams ?? {}), contentOverride: draft };
      }
    }
  }
  try {
    if (pageOpts.bare) {
      // show_without_page_layout: view ||= home_view || default_page_view.
      const view = requestedView ?? renderEngine.defaultHtmlViewConfig();
      renderEngine.pageErrorStatus = undefined;
      // Ruby's card#read renders the requested view with params[:slot]
      // merged into the render opts (the controller's slot_params walk).
      // decko.js's post-save slot refresh issues exactly that request:
      // GET /~<id>/<view>?slot[main]=true&slot[nest_name]=_main&... — and
      // the recorded Ruby answers carry the saved-slot shape: the MAIN
      // format (h1 header — default_header main? ? :h1 : :h2) and the
      // main-nest data-slot JSON {view, nest_name, nest_syntax, main,
      // home_view} (no "show" viz — the graded h1/h2 arm on the
      // account-change and edit-save journeys came from this staging server
      // serving a bare non-main render). The render goes through the PAGE lane's
      // bareMainOpts seam so the full prepare sequence (the late-seat
      // structure sweep especially) seats the closure the sync main render
      // reads — the edit-nested-summary class rendered its structured body
      // empty when the bare arm ran without it. The :layout param is
      // CONSUMED by show_layout? (it is what decides bare vs layout) and
      // never lands in the emitted slot JSON (the recorded phrase_4 saved
      // slot, whose POST carried slot[layout], emits no layout key).
      const slotParams = pageOpts.slotParams;
      if (slotParams?.main === "true") {
        const { html, status } = await renderPageWithStatus(
          renderEngine,
          cardName,
          view,
          renderParams,
          {
            nest_name: "_main",
            nest_syntax: `_main|${view}`,
            main: true,
            home_view: slotParams.home_view ?? view,
          },
        );
        return {
          status,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          body: html,
        };
      }
      const html = await renderEngine.render(cardName, view, renderParams);
      return {
        status: renderEngine.pageErrorStatus ?? 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        body: html,
      };
    }
    // The ENGINE assembles the page — the show_with_page_layout port
    // (per-card *layout rule, main! render, layout-body processing through
    // the engine's own nest pipeline, html_page head). No origin-side
    // open-view surgery, outer-titled fabrication, nested-titled
    // conversion, image passes, wiki-link expansion, or search bridge:
    // the engine produces those bytes natively. Only the
    // served-environment deltas above are applied to the engine's output.
    // requestedView = the ?view=/ ?v= query param (rest.rb view_from_params:
    // the requested view is the root show view). An unported view raises
    // the engine's UnsupportedViewError — Ruby's unsupported-view UserError
    // (format/render.rb:60-64) — handled below.
    // A stock deck answers with the page's own status (Ruby's
    // root.error_status: 404 for an unknown card, 403 for a denial), and the
    // request's new-card params reach an absent card's form.
    const { html: engineHtml, status } = STOCK_DECK
      ? await renderPageWithStatus(renderEngine, cardName, requestedView, renderParams)
      : { html: await renderPageBytes(renderEngine, cardName, requestedView), status: 200 };
    const body = applyServedEnvironmentDeltas(engineHtml);
    return {
      status,
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
    if (error instanceof Error && error.name === "UnsupportedViewError") {
      // Ruby: an unsupported view is a UserError -> 422
      // (format/render.rb:60-64 raise + error.rb:21 status). With the deck
      // boot wired (defaultDeckLoader above), the ported mod views render;
      // this mapping now catches only genuinely unported view names.
      return htmlResponse(
        422,
        `<pre>${escapeHtml(message)}</pre>`,
        "Error (unsupported view)",
      );
    }
    if (STOCK_DECK && !pageOpts.bare && isUpstreamMatchError(error)) {
      // The keyword-search raise on SQLite (card's AbstractAdapter#match,
      // config/initializers/02_patches/active_record.rb:80-83) escapes the
      // search card's rescuing_bad_query. A deployed site runs with
      // rescue_all_in_controller on, so CardController#handle_exception
      // (decko lib/card_controller/errors.rb) reports it as a
      // Card::Error::ServerError and shows that class's view under the
      // card's page layout: `show :server_error, 500` (card/error.rb:46-55,
      // *debugger off). The engine renders that page itself, the same
      // show_with_page_layout path as every other page, with :server_error
      // as the root view. The request's query params are not passed: the
      // engine's page prepare would evaluate the search with them and raise
      // again, while Ruby's :server_error view never runs the query.
      try {
        const { html } = await renderPageWithStatus(renderEngine, cardName, "server_error", {});
        return {
          status: 500,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Connection": "close",
            "Keep-Alive": "timeout=0",
          },
          body: applyServedEnvironmentDeltas(html),
        };
      } catch (pageError) {
        const pageMessage = pageError instanceof Error ? pageError.message : String(pageError);
        console.error(`[vm-staging] server_error page render failed for ${cardName}: ${pageMessage}`);
      }
    }
    if (/^card not found: /.test(message)) {
      // The served deck answers unresolved names with Decko's full-chrome
      // not_found page — not a bare stub. Status
      // stays 404 (format/error.rb page_status_for_unknown).
      return renderDeckoErrorPage(cardName, "not_found");
    }
    // Any other render raise gets Decko's deck error page (the
    // "Wild Card! / 500 Server Error" shape).
    // UnknownLayoutError (a layout name that fetches to
    // neither a card layout nor a built-in code layout) lands here too —
    // the served deck shows the same Wild Card 500 shape for those pages.
    console.error(`[vm-staging] render 500 on ${cardName}: ${message}\n${error instanceof Error ? error.stack : ""}`);
    return renderDeckoErrorPage(cardName, "server_error");
  }
}

// ---------------------------------------------------------------------------
// The BARE VIEW lane: GET /<name>?view=<view>
// renders RenderEngine.render(name, view) — the exact (card, view) path the
// corpus replay grades (src/testing/replay.ts render-engine handler).
// Deliberately NOT renderCardPage: no layout
// chrome, no html_page head, and none of applyServedEnvironmentDeltas (those
// are PAGE-lane deployment config; the bare view lane's byte contract is the
// engine's pinned environment — development default nest view :titled, raw
// (bucket)/... attachment bytes).
//
// A render raise emits the corpus CAPTURE_ERROR sentinel BYTES at status 200
// (the replay convention compares sentinel strings as bytes, no status
// semantics) — with the ENGINE's own error class naming, not Ruby's
// taxonomy. Base-vs-candidate comparison stays exact (both sides use the
// same mapping); a Ruby-side reference for a raising view records the Ruby
// class name and will not byte-match the engine sentinel — a known fidelity
// limit of the bare-view comparison.
// ---------------------------------------------------------------------------
async function renderCardView(cardName, view, renderEngine = render) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "close",
    "Keep-Alive": "timeout=0",
  };
  try {
    const html = await renderEngine.render(cardName, view);
    return { status: 200, headers, body: html };
  } catch (error) {
    const cls = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    return { status: 200, headers, body: `CAPTURE_ERROR: ${cls}: ${message}` };
  }
}

// The editors' card-name autocomplete over HTTP: the edge host's
// nameMatchResponse/matchingCardNames (deploy/bunny-worker-src/
// bunny-edge-engine-handler.ts) ported to the loopback host's engine
// objects. Up to 8 live card names — prefix matches first, then (when
// `contains`) names containing the term, each group ordered by name —
// Ruby's complete_or_match_search — with every row held to the viewer's
// read rules exactly as the edge handler holds it. This host's generic
// .json card-record arm answers 404 for the virtual search card the route
// names; the deployed edge serves it (the live lane measured
// /*all+by name.json?view=name_match answering a suggestion array on
// 2026-10-16, docs/runs/edge-signed-in-exercise-live-4f2c817d-2026-10-16.md
// line 38), and the CQL the edge handler drives is ported here too
// (src/cql/parser.ts:552 name_match), so the gap was host coverage.
async function nameMatchJsonResponse(url, renderEngine) {
  const rawTerm = (url.searchParams.get("term") ?? url.searchParams.get("query[keyword]") ?? "").trim();
  const view = url.searchParams.get("view");
  const names = await matchingCardNames(renderEngine, rawTerm.toLowerCase(), view !== "name_complete");
  return {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(names),
  };
}

async function matchingCardNames(renderEngine, term, contains) {
  const limit = 8;
  const like = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const names = [];
  const scope = await renderEngine.cqlPermissionOptions();
  const readRuleSql = scope.alwaysOk ? "" : ` and read_rule_id in (${scope.readRuleIds.map(() => "?").join(",") || "NULL"})`;
  const pick = async (pattern) => {
    const excluded = [...names];
    const notIn = excluded.length > 0 ? ` and name not in (${excluded.map(() => "?").join(",")})` : "";
    let offset = 0;
    while (names.length < limit) {
      const result = await renderEngine.fetcher.driver.query(
        `select id, name from cards where trash = 0 and name is not null and lower(name) like ? escape '\\'${readRuleSql}${notIn} order by name limit ? offset ?`,
        [pattern, ...(scope.alwaysOk ? [] : scope.readRuleIds), ...excluded, limit, offset],
      );
      for (const row of result.rows) {
        const record = await renderEngine.fetcher.fetchById(row.id);
        if (record !== undefined && await renderEngine.canReadCard(record)) names.push(row.name);
        if (names.length === limit) break;
      }
      if (result.rows.length < limit) break;
      offset += result.rows.length;
    }
  };
  await pick(`${like(term)}%`);
  if (contains && term !== "" && names.length < limit) await pick(`%${like(term)}%`);
  return names;
}

/**
 * Is this request asking for the rss format? The two spellings Ruby
 * accepts, and why they are one condition here:
 *
 *   - the route's `(.:format)` suffix - engine_routes.rb:22 `get
 *     "/:mark(.:format)" => "card#read"`, so `/Alpha.rss`; and
 *   - `params[:format]` - response.rb:111-113 `requested_format`: `params
 *     [:format].present? ? params[:format].to_s : request.format`. A query
 *     `?format=rss` reaches the same branch by a different door.
 *
 * BOTH doors are gated on a path of at most two segments, which is the
 * edge's gate (bunny-edge-lineage-worker-surface.ts:40-52). rss rides a
 * MARK (1 segment) or a MARK+VIEW (2 segments, engine_routes.rb:51); a
 * deeper path is engine_routes.rb:54's wildcard (`view: bad_address`)
 * whatever its last segment or query says. The edge reaches the same
 * answer structurally rather than by counting: parsePath returns a `kind`
 * for a deep path and the rss wrapper hands it straight back
 * (`if ("kind" in parsed) return parsed`). Counting segments here is the
 * same rule stated earlier, and keeps the two hosts from drifting.
 */
function isRssRequest(pathname, searchParams) {
  const segments = pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length > 3) return false;
  if (segments.length === 3 && segments[1] !== "view") {
    // The :mark/view/:view arm (engine_routes.rb:24) is the only
    // three-segment shape that carries a view segment, so it is the only
    // three-segment shape the rss surface answers. A three-segment shape
    // whose middle segment is not "view" is the generic :mark/:view arm
    // (engine_routes.rb:51) or the wildcard (line 54), and the pinned
    // deck's answer for those is not the rss surface.
    return false;
  }
  return pathname.endsWith(".rss") || searchParams.get("format") === "rss";
}

/**
 * The rss format answer (register-routes D3). The bytes are the engine's
 * own - `renderFormatShow(..., "rss")`, the port of card-mod-format's
 * set/all/rss.rb - not a harness fabrication, and the same call the edge
 * host makes (bunny-edge-engine-request.ts:541-577).
 *
 * The view: rss_format.rb registers :rss on a class inheriting HtmlFormat
 * with no view overrides, so `show` reaches rss.rb:10-13's `view ||= :feed`
 * - the feed is the only default shape. An explicit `?view=` on an rss
 * request is honored and dispatched through the engine in the rss format,
 * which is what the edge's `parsed.view === "feed"` split does.
 *
 * `rssEnabled: false` is the stock default (lib/card/mod/format.rb:4,
 * Cardio.config.rss_enabled defaults FALSE), kept identical to the edge's:
 * recognizing the URL must not silently enable disabled feeds. With the
 * stock value the answer is rss.rb:17-19's `return "RSS feeds disabled"`,
 * served as 200 application/rss+xml - the feed's own content type.
 */
async function rssFormatResponse(url, renderEngine) {
  const pathname = url.pathname;
  // Strip the suffix FIRST, then segment - the edge's parsePath does the
  // same (bunny-edge-lineage-worker-surface.ts:45 `normalized = suffix ?
  // pathname.slice(0, -4) : pathname`), so `.rss` never lands inside the
  // mark's own segment and the segment count is the mark's, not the
  // suffix's.
  const segmentsRaw = pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
  // The three-segment :mark/view/:view arm (engine_routes.rb:24) carries
  // the .:format capture on its VIEW segment, so a .rss suffix on that
  // shape is the rss format there too. The executed PINNED matcher agrees
  // (fixtures/captured/rails-route-recognition-ruby-oracle.json, the case
  // "GET /Front/view/open.rss": the view "open" in the rss format).
  const threeSegmentViewArm = segmentsRaw.length === 3 && segmentsRaw[1] === "view";
  const suffix = (segmentsRaw.length <= 2 || threeSegmentViewArm) && pathname.endsWith(".rss");
  const normalized = suffix ? pathname.slice(0, -".rss".length) : pathname;
  const segments = normalized.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
  // a suffix or ?format=rss request on a single segment names the MARK;
  // two segments are mark + view (engine_routes.rb:51); three segments on
  // the :mark/view/:view arm are mark + view + view (engine_routes.rb:24)
  const mark = decodeName(segments[0] ?? "");
  if (mark === undefined || mark === "") {
    return jsonResponse(404, { error: "card not found", name: "" });
  }
  // The PATH's view wins over the query's, on the three-segment arm: in
  // the pinned deck the path's :view segment IS params[:view], and Rails
  // merges the path parameters over the query parameters.
  const view = threeSegmentViewArm
    ? segments[2]
    : url.searchParams.get("view") || url.searchParams.get("v") ||
      (segments.length <= 1 ? "feed" : segments[1]);
  const fetcherForDeck = renderEngine.fetcher;
  let record;
  try {
    record = await fetcherForDeck.fetchByName(mark);
  } catch (error) {
    if (mapRenderError(error instanceof Error ? error.message : String(error)).status !== 404) throw error;
    return jsonResponse(404, { error: "card not found", name: mark });
  }
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: mark });
  }
  const typeRecord = record.typeId !== undefined
    ? await fetcherForDeck.fetchById(record.typeId) : undefined;
  if (!await renderEngine.canReadCard(record, typeRecord?.name?.s)) {
    return jsonResponse(403, { error: "permission denied", name: mark });
  }
  const body = view === undefined || view === "feed"
    ? await renderFormatShow({
      fetchRenderCard: name => renderEngine.fetchRenderCard(name),
      prepareItemForRender: name => renderEngine.prepareItemForRender(name),
      render: (name, v) => renderEngine.render(name, v),
      codenameById: id => fetcherForDeck.codenames.nameForId(id),
    }, record.name.s, "rss", { rssEnabled: false })
    : await renderEngine.render(record.name.s, view, {
      format: "rss", requestUrl: url.href,
    });
  return {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body,
  };
}

/** THE REGISTERED-FORMAT ARM (row D5). A REGISTERED suffix on
 *  the last segment of a card URL is a FORMAT, not part of the card's name:
 *  the route's (.:format) capture rides the last segment of the card URL
 *  (engine_routes.rb:22 "/:mark(.:format)", :24 "/:mark/view/:view(.:format)",
 *  :51 ":mark/:view(.:format)"), and the pinned registry
 *  (card-1.110.0/lib/card/format/registration.rb:6-9) makes each of the
 *  thirteen names its own format with its own mime type. The pinned
 *  dispatch is in the committed capture
 *  (fixtures/captured/format-registry-ruby-oracle.json): "css" answers the
 *  css format, not the file sender.
 *
 *  Before this arm the suffix was stripped (stripFormat) and the card's
 *  html page answered, so "/Style.css" was the card named "Style.css" and
 *  404ed where the pinned deck answers the css format with text/css.
 *
 *  The names the port cannot answer yet (yaml and yml, which need Ruby's
 *  `to_yaml`, and jsonld, which needs the jsonld support) keep their
 *  suffix in the card's name: see src/server/registered-format-route.ts. */
function registeredFormatRoute(pathname, searchParams) {
  const segments = pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0 || segments.length > 3) return undefined;
  const split = splitRegisteredFormatSuffix(segments[segments.length - 1]);
  if (split === undefined) return undefined;
  const format = split.format;
  if (segments.length === 1) {
    // engine_routes.rb:22's mark-format arm: the card, and the view the
    // request names (view_from_params) or the format's own show default
    // (the css format's `view ||= :content`).
    const name = decodeName(split.base);
    if (name === undefined || name === "") return undefined;
    const requested = searchParams.get("view") || searchParams.get("v") || undefined;
    return { name, view: requested ?? registeredFormatDefaultView(format), format };
  }
  if (segments.length === 2) {
    // engine_routes.rb:51's mark/view arm: the suffix rides the VIEW.
    const name = decodeName(segments[0]);
    const view = decodeViewSegmentJson(split.base);
    if (name === undefined || view === undefined || name === "" || view === "") return undefined;
    return { name, view, format };
  }
  // engine_routes.rb:24's mark/view/view arm: the suffix rides the VIEW.
  if (segments[1] !== "view") return undefined;
  const name = decodeName(segments[0]);
  const view = decodeViewSegmentJson(split.base);
  if (name === undefined || view === undefined || name === "" || view === "") return undefined;
  return { name, view, format };
}

/** The arm's answer: the card in its own format, with the format's own mime
 *  type. The bytes are the engine's own (the format-scoped view dispatch,
 *  src/card/render.ts:2553 `params.format`), not a harness fabrication. */
async function registeredFormatResponse(route, url, renderEngine = render) {
  const fetcherForDeck = renderEngine.fetcher;
  const record = await fetcherForDeck.fetchByName(route.name);
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: route.name });
  }
  const answer = await renderRegisteredFormat(
    {
      render: (name, view, params) => renderEngine.render(name, view, params),
      renderCsvFormat: async (name) => await renderFormatShow({
        fetchRenderCard: n => renderEngine.fetchRenderCard(n),
        prepareItemForRender: n => renderEngine.prepareItemForRender(n),
        render: (n, v) => renderEngine.render(n, v),
        codenameById: id => fetcherForDeck.codenames.nameForId(id),
      }, name, "csv", {}),
    },
    record.name.s,
    route.format,
    route.view,
    url.href,
    url.searchParams.get("disposition"),
  );
  return {
    status: answer.status,
    headers: { "Content-Type": answer.contentType, "Cache-Control": "no-store" },
    body: answer.body,
  };
}

async function cardRecordJson(cardName, renderEngine = render) {
  let record;
  try {
    record = await fetcher.fetchByName(cardName);
  } catch (error) {
    // Numeric and codename marks raise the same NotFound family the Worker
    // entries already map. Keep genuine database/runtime failures as500.
    if (mapRenderError(error instanceof Error ? error.message : String(error)).status !== 404) throw error;
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  if (record === undefined || record.name === undefined) {
    return jsonResponse(404, { error: "card not found", name: cardName });
  }
  const typeRecord =
    record.typeId !== undefined ? await fetcher.fetchById(record.typeId) : undefined;
  const readable = await renderEngine.canReadCard(record, typeRecord?.name?.s);
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
    // A password card's content is its digest, which Decko never shows
    // (card-mod-account set/right/password.rb `view :raw` answers
    // "encrypted"), not even to the account's owner or an administrator.
    db_content:
      record.name?.rightName?.key === "*password" ? "encrypted" : (record.dbContent ?? null),
  });
}

/** The plain decode for the ROUTE's view segment (engine_routes.rb:51
 *  ":mark/:view(.:format)"): view identifiers are snake_case and matched
 *  literally, so no underscore fold — the mark rides decodeName
 *  (uri_fetch_opts), the view does not (worker-shared-surface.ts
 *  #decodeViewSegment's contract, mirrored for the harness surface). */
function decodeViewSegmentJson(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/** The ENGINE's json-format view render (Ruby card#read with the route's
 *  .:format json — engine_routes.rb:51): the view dispatch in the json
 *  format answers the ported json-format views' own bytes (search_box_complete's
 *  JsonFormat#show pretty form among them); an unported view name raises
 *  the UnsupportedViewError the 422 mapping below serves (the same shape
 *  renderCardPage serves the html arm). The term/main/query[keyword]
 *  request params ride the render params' search seam (search_params.rb —
 *  term_param || vars.keyword). */
async function renderCardViewJson(cardName, view, url, renderEngine = render) {
  const search = jsonViewSearchParams(url.searchParams);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "close",
  };
  try {
    const body = await renderEngine.render(cardName, view, {
      ...(search !== undefined ? { search } : {}),
      format: "json",
      requestUrl: url.href,
      ...(url.searchParams.has("compress") ? { compress: url.searchParams.get("compress") } : {}),
    });
    return { status: 200, headers, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === "UnsupportedViewError") {
      // Ruby: an unsupported view is a UserError -> 422
      // (format/render.rb:60-64 raise + error.rb:21 status) — the same
      // mapping renderCardPage serves the html arm.
      return {
        status: 422,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
        body: message,
      };
    }
    return jsonResponse(500, { error: message });
  }
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
// shape the served deck would emit.
//
// For the two main asset cards (45514 / 50617), if a SassC/Uglifier-
// compiled file exists under COMPILED_ASSETS_DIR (e.g.
// <assets>/all-style.css), serve those
// compiled bytes with `X-Decko-Asset-Note: compiled-bytes`. If the
// compiled file is absent, fall back to serving the deck's SCSS source
// for the active skin (card 38274) at the main-CSS URL and the
// *all+*script manifest (card 20616) at the main-JS URL — both with
// their honest `X-Decko-Asset-Note` flag so a missing deploy is
// observable, not silent.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Session surface: cookie helpers, per-actor render engines,
// POST /_signin, POST /_signout, and the GET sign-in form page.
// ---------------------------------------------------------------------------

// The cookie helpers (name, read, issue, clear) live in the write-routes
// module (the write path reads the same cookie per rest.rb:37-40 +
// auth/current.rb:50-63); this file imports them.
// The render caches memoize permission state per engine (render.ts viewer
// field docs: set BEFORE the first render), so each signed-in account gets
// its own RenderEngine over the shared FetchEngine (fetch is
// permission-blind: read rules ride the card records). Two accounts are
// kept warm; a third evicts the oldest (insertion order).
const MAX_SIGNED_IN_ENGINES = 2;
const signedInEngines = new Map();

async function engineForActor(actorId, cookieHeader) {
  const viewer = await withVisitorEnabledRoles(fetcher, { signedIn: true, actorId }, cookieHeader,
    () => render.ensureFreshness());
  const key = permissionViewerKey(viewer);
  let engine = signedInEngines.get(key);
  if (engine === undefined) {
    engine = new RenderEngine(fetcher);
    engine.imageCdnHost = render.imageCdnHost;
    engine.fontAwesomeAssetMode = render.fontAwesomeAssetMode;
    engine.renderAbsentCards = render.renderAbsentCards;
    engine.tokenConfig = TOKEN_CONFIG;
    engine.viewer = viewer;
    // The page chrome's session (Ruby Auth.current): the navbar's account
    // links, "my card" and roles dropdown render for this account. Without
    // it a signed-in page showed the signed-out navbar's empty account
    // list. Set before the first render, as the edge host does.
    engine.pageSession = engine.viewer;
    if (signedInEngines.size >= MAX_SIGNED_IN_ENGINES) {
      signedInEngines.delete(signedInEngines.keys().next().value);
    }
    signedInEngines.set(key, engine);
  }
  return engine;
}

// jsonResponse with a header extension (Set-Cookie rides every auth
// response; the base three headers stay byte-identical).
function authJsonResponse(status, body, extraHeaders) {
  const base = jsonResponse(status, body);
  return { ...base, headers: { ...base.headers, ...extraHeaders } };
}

function readRequestBody(req, limitBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Accept JSON ({identifier, password}) or form-urlencoded (what the
// sign-in form page posts). Both field names are the staging surface's
// own; Ruby's *signin form posts email/password under Rails' update
// grammar, which this origin does not implement.
function parseSigninBody(raw, contentTypeHeader) {
  const contentType = String(contentTypeHeader ?? "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/json" || (contentType === "" && raw.trimStart().startsWith("{"))) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object") return null;
      return {
        identifier: typeof parsed.identifier === "string" ? parsed.identifier
          : typeof parsed.email === "string" ? parsed.email : "",
        password: typeof parsed.password === "string" ? parsed.password : "",
      };
    } catch {
      return null;
    }
  }
  if (contentType === "application/x-www-form-urlencoded" || contentType === "") {
    const params = new URLSearchParams(raw);
    const identifier = params.get("identifier") ?? params.get("email") ?? "";
    const password = params.get("password") ?? "";
    return { identifier, password };
  }
  return null;
}

// POST /_signin — the :signin event over HTTP (set/self/signin.rb:12-15):
// authenticate against the corpus's real +*account+*password digest
// (Card::Auth.encrypt, salted SHA-1), issue the session on success.
async function handleSignin(req) {
  let raw;
  try {
    raw = await readRequestBody(req);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: `unreadable request body: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  const parsed = parseSigninBody(raw, req.headers["content-type"]);
  if (parsed === null) {
    return jsonResponse(400, {
      ok: false,
      error: "unsupported content type — send application/json or form-urlencoded with identifier + password",
    });
  }
  const outcome = await signinAccount(driver, sessions, parsed.identifier, parsed.password, {
    clientAddress: req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress,
  });
  if (!outcome.ok) {
    // Ruby's ladder surfaces the i18n message with a failure status; the
    // staging surface maps that to 401 Unauthorized.
    return jsonResponse(401, { ok: false, error: outcome.message });
  }
  return authJsonResponse(
    200,
    { ok: true, name: outcome.actor.name },
    { "Set-Cookie": sessionCookieHeader(outcome.session.token, nodeCookieSecure(req)) },
  );
}

// POST /_signout — the :signout event (set/self/signin.rb:25-29):
// Auth.signin AnonymousID + Env.reset_session. The port's state change is
// the auth_sessions row deletion; idempotent like Ruby's (signing out
// Anonymous is a no-op success).
async function handleSignout(req) {
  const token = readSessionCookie(req.headers.cookie);
  const revoked = await signoutAccount(sessions, token);
  return authJsonResponse(200, { ok: true, revoked }, { "Set-Cookie": clearedSessionCookieHeader(nodeCookieSecure(req)) });
}

// The sign-in form page: the served deck renders the *signin card's OWN
// form at this route (set/self/signin.rb format :html core view — card_form +
// email/password fields); the TS engine cannot render it (the account-mod
// form views are unported rails, card-mod-account.ts header), so the
// staging surface serves this minimal honest form posting to /_signin.
// Chrome = the deck's Default Layout, the same shell the error pages use.
function buildSigninSlotHtml() {
  return (
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title="Sign In">Sign In</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text">\n` +
    `<form action="/_signin" method="post" class="signin-form">\n` +
    `<div class="form-group">\n` +
    `<label for="signin_identifier">Email or name</label>\n` +
    `<input type="text" name="identifier" id="signin_identifier" class="form-control" autocomplete="username" />\n` +
    `</div>\n` +
    `<div class="form-group">\n` +
    `<label for="signin_password">Password</label>\n` +
    `<input type="password" name="password" id="signin_password" class="form-control" autocomplete="current-password" />\n` +
    `</div>\n` +
    `<button type="submit" class="btn btn-primary">Sign in</button>\n` +
    `</form>\n` +
    `<!-- decko-ts staging: renders the *signin card's own form at this route (set/self/signin.rb, rails); this staging form posts to /_signin. -->\n` +
    `</div></div>`
  );
}

async function renderSigninPage() {
  const boot = await ensureBootValues();
  const layout = await resolveDefaultLayout();
  const body = applyServedEnvironmentDeltas(
    await wrapWithLayout("*signin", buildSigninSlotHtml(), layout, {
      titleText: `Sign In - ${boot.siteTitle}`,
    }),
  );
  return {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "close",
      "Keep-Alive": "timeout=0",
    },
    body,
  };
}

// The sign-in routes. /*signin is the served deck's route shape (the nav's
// Sign in link points there); /_signin is the
// staging alias named alongside the POST endpoints.
const SIGNIN_PAGE_PATHS = new Set(STOCK_DECK ? ["/_signin"] : ["/_signin", "/*signin", "/*signin/titled"]);

// The forgot-password form's submit route: Ruby's own card_form :update
// target for *signin (set/self/signin.rb format :html edit view).
const FORGOT_PASSWORD_SUBMIT_PATH = "/update/*signin";

const FILES_PATTERN = /^\/files\/~(\d+)\/(\d+)\.([a-z0-9]+)$/i;

async function handleAssetFile(pathname) {
  const match = FILES_PATTERN.exec(pathname);
  if (match === null) return null;
  const [, cardIdStr, actionIdStr, ext] = match;
  const cardId = Number(cardIdStr);
  const actionId = Number(actionIdStr);
  const extLower = ext.toLowerCase();
  const fileCard = fileCardsById.get(cardId);
  // Compiled bytes first: when a SassC-
  // compiled CSS / Uglifier-compressed JS file exists for this (cardId, ext)
  // pair and it's on disk in COMPILED_ASSETS_DIR, serve those bytes
  // verbatim with the right Content-Type. This is what the page's
  // <link>/<script> tags actually expect — the deployed deck receives the
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
  // Local uploads: a NEW upload's identifier is
  // ~<cardId>/<actionId><ext> with its bytes under DECKO_FILES_DIR (Ruby's
  // files_base_dir scheme, paths.rb:10-17). The card row is the
  // authority: when its CURRENT db_content names exactly the requested
  // (cardId, actionId, ext) as a local identifier, the local file wins —
  // this is how a just-uploaded file serves before any bucket copy exists
  // (the served deck uses the same local_url form).
  {
    const row = fileCard ?? (
      await driver.query("SELECT db_content FROM cards WHERE id = ? AND trash = 0", [cardId])
    ).rows[0];
    const dbContent = row?.db_content ?? "";
    const localMatch = /^~(\d+)\/(\d+)(\.[A-Za-z0-9]+)$/.exec(dbContent);
    if (
      localMatch !== null &&
      Number(localMatch[1]) === cardId &&
      Number(localMatch[2]) === actionId &&
      localMatch[3].toLowerCase() === `.${extLower}`
    ) {
      const localPath = path.join(DECKO_FILES_DIR, String(cardId), `${actionId}.${extLower}`);
      try {
        const bytes = await fs.readFile(localPath);
        const contentType =
          extLower === "css" ? "text/css; charset=utf-8" :
          extLower === "js" ? "application/javascript; charset=utf-8" :
          extLower === "png" || extLower === "jpg" || extLower === "jpeg" || extLower === "gif" ?
            `image/${extLower === "jpg" ? "jpeg" : extLower}` :
          extLower === "svg" ? "image/svg+xml" :
          "application/octet-stream";
        return {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
            "Connection": "close",
            "Content-Length": String(bytes.length),
            "X-Decko-Asset-Source": `local:${localPath}`,
            "X-Decko-Asset-Note": "local-upload",
          },
          body: bytes,
        };
      } catch (err) {
        // ENOENT stays quiet (corpus rows can carry local-form identifiers
        // whose bytes were never in this deployment); anything else is
        // surfaced like the compiled block above.
        if (err && err.code !== "ENOENT") {
          console.warn(
            `[vm-staging] local upload read failed ${localPath}: ` +
            (err instanceof Error ? err.message : String(err)),
          );
        }
        // An IMAGE upload stores the rendition set, not the bare name: the
        // version-less file lives under the -original spelling the
        // ImageCardUploader writes (image_card_uploader.rb:44-57; the store
        // seam names it in attachment-store.ts store(), and the engine's own
        // read() resolves the bare identifier through that spelling). Serve
        // it here so the stored identifier the deck writes down answers the
        // bytes it names — a bare 404 here short-circuits
        // handleAttachmentRoute below, whose store-level fall-through never
        // runs for the spelling FILES_PATTERN matches.
        if (err && err.code === "ENOENT") {
          const originalPath = path.join(DECKO_FILES_DIR, String(cardId), `${actionId}-original.${extLower}`);
          try {
            const bytes = await fs.readFile(originalPath);
            return {
              status: 200,
              headers: {
                "Content-Type":
                  extLower === "png" || extLower === "jpg" || extLower === "jpeg" || extLower === "gif" ?
                    `image/${extLower === "jpg" ? "jpeg" : extLower}` :
                  extLower === "svg" ? "image/svg+xml" :
                  "application/octet-stream",
                "Cache-Control": "no-store",
                "Connection": "close",
                "Content-Length": String(bytes.length),
                "X-Decko-Asset-Source": `local:${originalPath}`,
                "X-Decko-Asset-Note": "local-upload-original-rendition",
              },
              body: bytes,
            };
          } catch (originalErr) {
            if (originalErr && originalErr.code !== "ENOENT") {
              console.warn(
                `[vm-staging] local upload original-rendition read failed ${originalPath}: ` +
                (originalErr instanceof Error ? originalErr.message : String(originalErr)),
              );
            }
          }
        }
        // fall through to the corpus 404s below — the identifier says
        // local but the bytes are gone; that is a real 404.
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
      `(<skin>) at /files/~${cardId}/${actionId}.${ext}. ` +
      `The compiled CSS bytes live in the live deck's cloud bucket ` +
      `(live serves /files/45514/0000000001.css; the corpus row still ` +
      `stores the older 9999999999 revision) and are not in the scrubbed corpus. */\n`;
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
  // Main script + every other JS asset card. The deck's MAIN script (the
  // *all+*script+*asset output card this URL names) serves the COMPILED
  // bundle — the deployed compile bytes when present, else the in-process
  // compile of the pinned assembled input (the compile pipeline's output
  // contract; the note header names the flavor). Other JS asset cards keep
  // the honest uncompiled-manifest fallback.
  if (extLower === "js") {
    const mainOut = await mainScriptAssetOutput();
    if (mainOut !== null && mainOut.id === cardId) {
      const compiled = await compiledMainScriptBundle();
      if (compiled !== null) {
        return {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store",
            "Connection": "close",
            "Content-Length": String(compiled.bytes.length),
            "X-Decko-Asset-Source": `*all+*script compile (${compiled.source})`,
            "X-Decko-Asset-Note": compiled.note,
          },
          body: compiled.bytes,
        };
      }
    }
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

// The sign-in POST endpoints (the staging aliases).
const SIGNIN_POST_PATHS = new Set(["/_signin", "/_signout"]);

// The account-flow POST endpoints (the account-flow staging surface):
// the reset request and the password set. The reset LINK itself is a GET
// to /update/<mark> handled by parseAccountFlowLink before any of this.
const ACCOUNT_POST_PATHS = new Set(["/_reset-request", "/_account-password"]);

// ---------------------------------------------------------------------------
// Write-path dispatch
// ---------------------------------------------------------------------------
//
// The Auth::Token secret (TOKEN_SECRET/TOKEN_CONFIG) is declared beside the
// engine boot above, which reads it first. The write path carries no CSRF
// secret: the served decko arms no forgery protection (the write-routes
// module header cites the sources), so the earlier
// DECKO_CSRF_SECRET HMAC machinery is gone.

/** Bridge the node request to the write-routes module. Returns the write
 *  response, or null when the method/path pair is not a write route (the
 *  caller falls through to its 405). The renderSlot hook lets the ajax
 *  soft redirect (response.rb:54-62) render through the ACTOR's own
 *  engine — the same per-actor engines the GET surface uses. The optional
 *  pre-read body is the account-flow form-handler seam: the account-flow
 *  POST handlers parse the body once and hand it here so the write-path
 *  delegation never re-reads the consumed stream.
 *
 *  Uploads: the RAW bytes ride along as bodyBytes — the multipart
 *  upload grammar parses the byte stream (Rack's rack.input), which a
 *  utf8 string round-trip would corrupt for binary payloads. */
let followMailContext;

// card-mod-delayed_job. DECKO_DELAYING=true is Ruby's config.delaying = true:
// a save's integrate_with_delay events (the follower notice) are written as
// delayed_jobs rows and performed by the in-process worker after the
// response (next event-loop turn, plus a 5 s poll for rows another process
// wrote). Unset, they run inside the request — the mod's default. Built on
// the first write, once the follower-mail context is known, so the worker's
// engine sends the same mail the request's engine would.
const DELAYING = delayingFromEnv(process.env.DECKO_DELAYING);
let delayedJobsHost;
function delayedJobsForWrites() {
  if (!DELAYING || !writePathEnabled()) return undefined;
  if (delayedJobsHost === undefined) {
    const log = (line) => process.stderr.write(`[delayed_job] ${line}\n`);
    delayedJobsHost = hostDelayedJobs({
      driver,
      fetcher,
      delaying: true,
      afterResponse: nodeAfterResponse(log),
      engineOptions: { notifyTransport: mailTransport, followMail: followMailContext },
      workerName: `host:${process.env.HOSTNAME ?? "localhost"} pid:${process.pid}`,
      log,
    });
    delayedJobsHost.worker.start(5000);
  }
  return delayedJobsHost.config;
}

async function dispatchWriteRequest(req, pathname, preReadBody) {
  let body = preReadBody;
  let bodyBytes;
  const contentTypeHeader = String(req.headers["content-type"] ?? "");
  if (typeof body !== "string" || /^multipart\/form-data/i.test(contentTypeHeader)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    if (/^multipart\/form-data/i.test(contentTypeHeader)) {
      bodyBytes = new Uint8Array(raw);
      body = "";
    } else {
      body = raw.toString("utf8");
    }
  }
  const cookieToken = readSessionCookie(req.headers.cookie);
  const cookieActor = cookieToken !== null ? await sessions.lookupSession(cookieToken) : null;
  // The follower-notification nest views render against the deck origin
  // (Cardio.config.deck_origin, DECKO_ORIGIN above) and resolve the
  // template's "Decko Bot" from-name through the bot account's +*email
  // (safe_from_and_reply_to!, email_config.rb:52-79). Read once; a missing
  // field reads as the empty string, the deck's own state.
  if (followMailContext === undefined) {
    const botEmail = await fetcher.fetchByName("Decko Bot+*email").catch(() => undefined);
    followMailContext = { origin: DECKO_ORIGIN, deckoBotEmail: botEmail?.dbContent ?? "" };
  }
  return handleWriteRequest(
    {
      driver,
      fetcher,
      attachmentStore,
      // Signup approval/creation uses the general write route's triggered
      // account-mail integration, alongside the dedicated reset endpoints.
      accountMail: {
        transport: mailTransport,
        token: TOKEN_CONFIG,
        origin: DECKO_ORIGIN,
        siteTitle: SITE_TITLE,
      },
      followMail: followMailContext,
      ...((delayedJobs) => (delayedJobs === undefined ? {} : { delayedJobs }))(delayedJobsForWrites()),
      ...(scssCompiler === undefined ? {} : { scssCompiler }),
      coffeeCompiler,
      compressAssets,
      scriptCompressor,
      javascriptValidator,
      // The recaptcha seat, composed only when the
      // boot-time env read produced a config — the conditional spread keeps
      // the unarmed context byte-identical (the seat's own discipline,
      // write-routes.ts:154-168). The config passes through UNCHANGED; the
      // engine's rule walk and siteverify GET stay the defaults.
      ...(recaptchaConfig === undefined ? {} : { recaptcha: recaptchaConfig }),
      // Follower notifications go through the same transport as the account
      // mail (capture when DECKO_MAIL_CAPTURE=1, otherwise none).
      notifyTransport: mailTransport,
      renderSlot:
        cookieActor !== null
          ? async (name, view, subcardNames) => {
              // Ruby's order: the save expires the saved card's cache
              // (cache/all.rb) BEFORE the soft redirect re-renders it —
              // without this the slot render reads the pre-save warm maps.
              fetcher.expireName(name);
              const actorEngine = await engineForActor(cookieActor.id, req.headers.cookie);
              actorEngine.expireRenderCard(name);
              // The save's POSTED subcards are cards too (subcards.rb —
              // each saves as its own card with its own post-commit
              // expire): the slot re-render must read their POST-save
              // state, or a changed +*email renders its pre-save value in
              // the slot bytes themselves.
              for (const sub of subcardNames ?? []) {
                if (!sub) continue;
                fetcher.expireName(sub);
                actorEngine.expireRenderCard(sub);
              }
              // The ajax response re-render runs on the request's MAIN
              // format (the response's card is the ajax request's main
              // card, so the slot's header renders h1 — the recorded
              // session pins h1 in the saved slot). The bare render lane
              // is not main; the modal arm's main-format shape is what
              // Ruby answers with.
              // The save expired the mark + posted subcards (above), so the
              // render-card map ALWAYS misses here. Prepare through the
              // engine's full render first (it seats the fresh post-save
              // closure — a coded core's field children ride the prepare's
              // junction-children warm), then re-render the seated card on
              // the MAIN format: Ruby's soft redirect answers the ajax save
              // with the saved card as the request's main card (response.rb
              // :54-62; the recorded session pins h1 in the saved slot), and
              // a bare render() is not the main format — its titled header
              // rendered h2 (the h1/h2 residual the account-change and
              // edit-save journeys carried).
              try {
                await actorEngine.render(name, view ?? "titled");
              } catch {
                // the prepare render's own failure surfaces through the main render below
              }
              const slotCard = actorEngine.fetchRenderCard(name);
              if (slotCard === undefined) return actorEngine.render(name, view ?? "titled");
              const { RenderFormat } = await import("./dist/src/card/render/format.js");
              // The ajax response re-render runs on the request's MAIN
              // format with the MAIN-NEST opts - the recorded session's
              // saved slot carries the data-slot JSON {view, nest_name
              // "_main", nest_syntax "_main|titled", main:true, home_view},
              // whose main:true is what pins the h1 card-header. The
              // previous bare {main, main_view} opts left the nest keys out
              // and the slot rendered h2.
              const slotView = view ?? "titled";
              return new RenderFormat(slotCard, actorEngine, { main: true, nestQuietErrors: true }).renderView(
                slotView,
                {
                  nest_name: "_main",
                  nest_syntax: `_main|${slotView}`,
                  main: true,
                  home_view: slotView,
                },
                null,
              );
            }
          : undefined,
      // The explicit-GET update alternative's non-ajax denial page (the
      // plain-href follow links navigate; Ruby's card#update rescue renders
      // the target card's denial view through the FULL layout at 403 —
      // renderErrorPage in write-routes.ts). The page lane runs on the
      // request's own session engine, exactly like every GET page.
      renderErrorPage: async (name, view) => {
        const actorEngine = cookieActor !== null ? await engineForActor(cookieActor.id, req.headers.cookie) : render;
        // html/error.rb:200-204's @denied_task-nil arm: the controller
        // rescue's loud denial reads "to do that", not a view-level task.
        actorEngine.pageLoudDenialTaskPhrase = "do that";
        try {
          const { html } = await renderPageWithStatus(actorEngine, name, view, {});
          return html;
        } finally {
          actorEngine.pageLoudDenialTaskPhrase = undefined;
        }
      },
      // The two-step upload's preliminary arm (00_upload_cache.rb:18-24):
      // the success answer is the BARE preview_editor view of the target
      // card (the cache card for a new card's upload, the card itself for
      // an update) — decko.js's doneFile replaces .chosen-file with the
      // response body verbatim (upload.js.coffee:48-51), and the captured
      // oracle round trip shows no card-slot wrapper around it. The render
      // is the ACTING account's engine (the request's own session), expired
      // first so it reads the draft rows the write path just stored — the
      // same expiry discipline the renderSlot hook applies. No main-format
      // opts: this render is not the page's main card (Ruby's soft redirect
      // show renders it view-only; the observed preview carries the bare
      // .chosen-file bytes).
      renderPreviewEditor:
        cookieActor !== null
          ? async ({ name, opts }) => {
              fetcher.expireName(name);
              const actorEngine = await engineForActor(cookieActor.id, req.headers.cookie);
              actorEngine.expireRenderCard(name);
              const { RenderFormat } = await import("./dist/src/card/render/format.js");
              // The seat render runs the view WITHOUT the round-trip opts —
              // they ride only the final renderView below. A view whose
              // posture raises on the missing param (preview_editor's
              // gsub-on-nil, the raise-posture lane's stock shape) must not
              // fail the flow here: Ruby renders preview_editor exactly
              // once, WITH the request params present. The seating itself
              // happens in the render's prepare phase, before the view body
              // runs, so the card is seated even when the view raises; the
              // same catch-and-reread pattern the renderSlot hook above
              // uses. The final renderView keeps the posture: a genuinely
              // param-less render raises to the caller unchanged.
              try {
                await actorEngine.render(name, "preview_editor");
              } catch {
                // the seat's view error is the final renderView's to raise (or not)
              }
              const previewCard = actorEngine.fetchRenderCard(name);
              if (previewCard === undefined) {
                throw new Error(`preview_editor render could not seat the card: ${name}`);
              }
              return new RenderFormat(previewCard, actorEngine, { nestQuietErrors: true }).renderView(
                "preview_editor",
                opts,
              );
            }
          : undefined,
    },
    {
      method: req.method,
      pathname,
      search: new URL(req.url ?? "/", "http://localhost").search,
      host: req.headers.host,
      ...(req.socket?.encrypted ? { scheme: "https" } : {}),
      headers: req.headers,
      body,
      bodyBytes,
    },
  );
}

/**
 * Bridge one first-run request to the first-run-routes module.
 *
 * The body is read here, once, and handed down - the same seam
 * dispatchWriteRequest uses for a pre-read body, so neither surface
 * re-reads a consumed stream.
 *
 * The response tail is the write path's own (applyWriteResponseTail): the
 * create commits six card rows, and the boot engine plus every
 * signed-in engine's warm maps must be expired for the owner's name. The
 * module stamps expiryName on its success response for exactly that
 * keying, the same contract WriteRouteResponse.expiryName carries.
 */
async function dispatchFirstRunRequest(req, pathname, startedAt) {
  let body = "";
  if (req.method === "POST") {
    try {
      body = await readRequestBody(req);
    } catch (error) {
      return jsonResponse(400, {
        ok: false,
        error: `unreadable request body: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  const firstRunResponse = await handleFirstRunRequest(
    { driver, fetcher },
    {
      method: req.method,
      pathname,
      host: req.headers.host,
      headers: req.headers,
      body,
      // The printed setup link carries its token in the query.
      search: new URL(req.url ?? "/", "http://localhost").search,
    },
  );
  if (firstRunResponse === null) {
    // Unreachable through this branch (the module answers null only for an
    // unarmed flag or a different method/path, both already checked), but
    // the host contract is a response-or-fall-through and a null here must
    // not become a crash.
    return jsonResponse(404, { error: "not found" });
  }
  await applyWriteResponseTail(firstRunResponse, startedAt, req.method, pathname);
  return firstRunResponse;
}

/** The write-path branch's post-response tail (cache expiry for the saved
 *  card + the request log line), extracted so the forgot-password submit's
 *  write-path delegation applies the same discipline. */
async function applyWriteResponseTail(writeResponse, startedAt, method, pathname) {
  // The expiry half delegates to the module-extracted, tested successor of
  // the inline block this tail was carved from: the gate is the mutation
  // point's expiryName — stamped on
  // EVERY success flavor — never the Location header, which only the HTML
  // flavor carries (a Location gate let JSON saves expire nothing and left
  // warm engines
  // serving pre-save pages). Same expiry fan-out the main write branch
  // runs; the forgot-password write-path delegation shares it.
  expireRenderCachesAfterSave(
    {
      fetcher,
      renderEngine: render,
      signedInEngines: signedInEngines.values(),
    },
    writeResponse,
  );
  console.log(
    `[vm-staging] ${method} ${pathname} -> ${writeResponse.status} (${Date.now() - startedAt}ms)`,
  );
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  // THE ORACLE'S SECURITY HEADERS, middleware-style: every response this
  // server writes passes here (Ruby answers every response class with the
  // same set through action_dispatch's default-headers middleware, captured
  // live on pages, 404s, json and file arms — see
  // src/server/oracle-security-response-headers.ts), so the merge sits on
  // writeHead itself rather than at each branch's emit: a per-branch apply
  // would silently skip the next added route. An explicitly set header
  // wins (applyOracleSecurityResponseHeaders never overwrites), so the
  // attachment route's own X-Content-Type-Options and any Set-Cookie
  // branch carries are untouched.
  const rawWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, headers) =>
    rawWriteHead(status, applyOracleSecurityResponseHeaders(headers));
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  // Normalize: drop one trailing slash (matches worker.ts).
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const vendorRequest = new Request(url, { method: req.method });
  const vendorAsset = serveFontAwesomeAsset(vendorRequest) ?? serveBootstrapFontAsset(vendorRequest);
  if (vendorAsset !== undefined) {
    res.writeHead(vendorAsset.status, Object.fromEntries(vendorAsset.headers));
    res.end(req.method === "HEAD" ? undefined : Buffer.from(await vendorAsset.arrayBuffer()));
    return;
  }
  // The requested view (?view=/ ?v= — rest.rb view_from_params: the first
  // PRESENT param of [:view, :v] is the root show view). Absent/blank -> the
  // page default.
  const requestedView =
    url.searchParams.get("view")?.trim() || url.searchParams.get("v")?.trim() || undefined;
  // html/show.rb show_layout?: an ajax request renders the view alone, with
  // no page layout, unless it asks for one (params[:layout]). Decko's own
  // scripts load modals, slots and save results this way.
  const slotParams = {};
  for (const [key, value] of url.searchParams) {
    const m = /^slot\[(.+)\]$/.exec(key);
    if (m && m[1] !== "layout") slotParams[m[1]] = value;
  }
  const pageOpts = {
    bare: STOCK_DECK && req.headers["x-requested-with"] === "XMLHttpRequest" && !url.searchParams.has("layout"),
    slotParams,
    // rest.rb:64-66 record_as_main reads params[:main]; carried here so
    // renderCardPage (this host's load_card) can set Card::Env.main_name.
    // get() already answers null for an ABSENT param, so `?main=` (the empty
    // string, truthy in Ruby) and no param at all stay distinguishable.
    mainParam: url.searchParams.get("main") ?? undefined,
    // rest.rb:56-61 load_action's edit_draft arm (register-routes B11): the
    // param's PRESENCE is Ruby's truthiness (every query value is a string,
    // and "false" the string is TRUTHY in Ruby). renderCardPage (this
    // host's load_card+show) consumes the flag: the card-scoped last
    // draft's last change becomes the content the render sees.
    editDraftPresent: url.searchParams.has("edit_draft"),
  };

  // Every state-changing request (sign-in and sign-out, the account forms,
  // first-run setup, card writes) must come from this deck's own pages.
  if (req.method !== "GET" && req.method !== "HEAD") {
    const verdict = checkRequestOrigin({ headers: req.headers, host: req.headers.host }, ORIGIN_POLICY);
    if (!verdict.ok) {
      req.resume();
      const refused = jsonResponse(403, {
        error: { code: "cross-origin", message: `${CROSS_ORIGIN_MESSAGE} (${verdict.reason})` },
      });
      res.writeHead(refused.status, refused.headers).end(refused.body);
      console.log(`[vm-staging] ${req.method} ${pathname} -> 403 cross-origin (${Date.now() - startedAt}ms)`);
      return;
    }
  }

  // Resolve the session cookie ONCE per request, before any
  // render. A request with no cookie takes the exact pre-session path (the
  // shared anonymous engine). A cookie that fails to resolve — unknown,
  // expired, revoked, dead account card — renders as Anonymous
  // (auth/current.rb:58-63, never an error and never a half-privileged
  // state). lookupSession is one indexed SELECT and never throws.
  // Ruby's request setup refreshes the asset inputs before a card request
  // renders (CardController::Rest#setup, decko-0.20.0 lib/card_controller/rest.rb:33).
  // Staging-internal endpoints (/_...) and asset files (/files/...) are not
  // card requests, and a read-only boot cannot store the refresh's writes.
  // A refresh that throws answers this request with a 500 and the error's
  // message. It must not escape the handler: an unhandled rejection ends the
  // whole host process, and every later request then fails to connect.
  if (req.method === "GET" && writePathEnabled() && !pathname.startsWith("/_") && !pathname.startsWith("/files/")) {
    try {
      await assetReadRefresh.beforeRead({ explicitFile: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[vm-staging] asset read refresh failed for ${pathname}: ${message}`);
      const failed = htmlResponse(500, `<h1>Server error</h1><pre>${escapeHtml(message)}</pre>`);
      res.writeHead(failed.status, failed.headers).end(failed.body);
      return;
    }
  }

  let actor = null;
  if (req.method === "GET") {
    // THE AUTHENTICATOR ORDER (rest.rb:37-47): the Authorization header's
    // Token/Bearer value, or the ?token= param, is the FIRST authenticator,
    // ahead of the session cookie (auth/current.rb:50-63). A token that
    // does not validate is a 403 in Ruby (auth/token.rb:18-23), not an
    // anonymous read.
    //
    // THE api_key ARM (card-mod-api_key-0.20.0/lib/card/auth/api_key.rb:7-15)
    // sits BETWEEN the token arm and the session arm: a request that
    // carries a token takes the token arm whatever else it carries, and a
    // request that carries an X-API-Key header (or an ?api_key= param) and
    // no token is signed in as the account whose *api_key card carries the
    // key (register-routes C17). A key that names no account, or whose
    // card's content differs from the key as presented, is the api_key
    // gem's own refusal ("API key authentication failed"), a 403 here.
    const tokenAuth = await resolveReadAuthenticators(
      { authorization: req.headers.authorization, "x-api-key": req.headers["x-api-key"] },
      url.searchParams,
      TOKEN_CONFIG,
      (apiKey) => signinFromApiKey(authDriver, apiKey),
    );
    if (tokenAuth.kind === "denied") {
      const denied = jsonResponse(403, {
        error: "permission denied",
        reason: tokenAuth.reason,
      });
      res.writeHead(denied.status, denied.headers).end(denied.body);
      return;
    }
    if (tokenAuth.kind === "actor") {
      actor = { id: tokenAuth.actorId };
    } else if (tokenAuth.kind === "anonymous") {
      actor = null;
    } else {
      const sessionToken = readSessionCookie(req.headers.cookie);
      if (sessionToken !== null) {
        actor = await sessions.lookupSession(sessionToken);
      }
    }
  } else if (
    req.method === "POST" &&
    (SIGNIN_POST_PATHS.has(pathname) ||
      ACCOUNT_POST_PATHS.has(pathname) ||
      // the forgot-password form posts to Ruby's own route
      // (set/self/signin.rb card_form :update -> /update/*signin); the
      // trigger check happens in the handler after the body is read.
      pathname === FORGOT_PASSWORD_SUBMIT_PATH ||
      // the first-run setup post must reach the first-run surface BELOW,
      // not the write branch. Ruby's setup journey rides the ordinary
      // write through mark interpretation only under the needs_setup?
      // condition (decko-0.20.0 lib/card_controller/mark.rb:28-33
      // implicit_mark -> initial_setup? -> prepare_setup_card!), so the
      // port's equivalent is THIS yield: armed only when the env gate is
      // on. Without it the write branch answers first and a fresh-deploy
      // owner-create dies as a card-mark write ("may not create card
      // setup", 403). The security boundary stays in the module — its
      // runtime census (setupWindowState, card-1.110.0
      // lib/card/auth/setup.rb:33-52) 404s every method once the deck has
      // an account, so an existing deck never becomes setuptable; and
      // with the gate off this clause is false and the write branch sees
      // /setup exactly as before.
      (firstRunEnabled() && pathname === SETUP_PATH))
  ) {
    // Sign-in/sign-out + account-flow + first-run setup POSTs:
    // fall through to the shared dispatch chain below (handleSignin/
    // handleSignout/handleResetRequest/handleAccountPassword/
    // handleForgotPasswordSubmit/handleFirstRunRequest). They take
    // precedence over the write-path marks — staging endpoints are
    // not card marks.
  } else if (parseAccountFlowLink(pathname, url.searchParams) !== null) {
    // The emailed reset/verify link arriving with a verb-explicit POST/
    // PUT/PATCH (the link itself is a GET; see handleAccountFlowLink).
    // Consumed here — ahead of the write-path dispatch — because the link
    // is authenticator-token traffic, not a session-CSRF form post.
  } else {
    // Write path: all write logic lives in
    // dist/src/server/write-routes.js — this file only dispatches. Opt-in
    // via DECKO_WRITE_PATH=1 AND a writable DB boot (this server's default
    // boot is readonly pure-browse; unset keeps the historical 405s).
    if (writePathEnabled()) {
      const writeResponse = await dispatchWriteRequest(req, pathname);
      if (writeResponse !== null) {
        res.writeHead(writeResponse.status, writeResponse.headers).end(writeResponse.body);
        // Ruby expires the saved card's cache on every save (card-1.110.0
        // director/phases.rb:54 after_commit -> cache/all.rb:17-24 expire).
        // The write engine runs on its own per-request fetcher, so the
        // boot-time render engine's cache must be expired explicitly —
        // otherwise the next page render serves the pre-save row. The gate
        // keys on the successful-mutation point's expiryName (stamped on
        // EVERY success flavor, including the ajax 200 slot which carries
        // no Location) — NOT on the Location header, which only the HTML
        // flavor carries: a Location gate let JSON saves expire nothing
        // and left warm engines serving pre-save pages. This is the
        // module-extracted form of the inline expiry block — same expiry
        // fan-out (fetcher + boot render engine + every signed-in engine);
        // the module is its tested successor.
        expireRenderCachesAfterSave(
          {
            fetcher,
            renderEngine: render,
            signedInEngines: signedInEngines.values(),
          },
          writeResponse,
        );
        console.log(
          `[vm-staging] ${req.method} ${pathname} -> ${writeResponse.status} (${Date.now() - startedAt}ms)`,
        );
        return;
      }
    }
    const body = jsonResponse(405, { error: "method not allowed" });
    res.writeHead(body.status, body.headers).end(body.body);
    console.log(
      `[vm-staging] ${req.method} ${pathname} -> ${body.status} (${Date.now() - startedAt}ms)`,
    );
    return;
  }
  const requestEngine = actor !== null ? await engineForActor(actor.id, req.headers.cookie) : render;

  let response;
  // The REGISTERED-FORMAT route (row D5): a registered suffix on
  // the last segment of a card URL. Computed once, ahead of the branch
  // chain, because the chain's own order decides which arm answers.
  const registeredRoute = registeredFormatRoute(pathname, url.searchParams);
  // The card name the page branches served (the location-history push checks
  // its known-ness against the fetcher once, after the branch chain).
  let servedCardName;
  try {
    // engine_routes.rb:14-16 — the DEPRECATED asset routes
    // `%w[assets javascripts jasmine].each { |prefix| get
    // "#{prefix}/*mark" => "card#asset" }`. card#asset (rest.rb:22-27,
    // @deprecated) answers a fixed installation-error body at 404 — not a
    // card render; the :mark/:view arm would otherwise parse /assets/<mark>
    // as the card "assets" in view <mark>. HEAD rides the GET route (Rails'
    // HEAD fallback). The glob needs a segment after the prefix; /assets
    // alone stays the card arm.
    const readPathSegments = pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/");
    const isAssetActionRoute =
      // The asset ACTION arm (engine_routes.rb:41-43) sits at table order
      // 24, but the :mark(.:format) arm sits at order 6 and comes FIRST, so
      // the one-segment "/asset" is the card named "asset" and not the
      // action. The executed PINNED matcher says so
      // (fixtures/captured/rails-route-recognition-ruby-oracle.json, the
      // case "GET /asset": the card "asset" on route 6).
      (readPathSegments[0] === "asset" && readPathSegments.length === 2) ||
      (readPathSegments[0] === "card" && readPathSegments[1] === "asset" && readPathSegments.length <= 3);
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      (isDeprecatedAssetRoute(readPathSegments) || isAssetActionRoute)
    ) {
      const assetStub = deprecatedAssetStubResponse();
      res.writeHead(assetStub.status, Object.fromEntries(assetStub.headers));
      res.end(req.method === "HEAD" ? undefined : Buffer.from(await assetStub.arrayBuffer()));
      console.log(`[vm-staging] ${req.method} ${pathname} -> ${assetStub.status} (deprecated asset route, ${Date.now() - startedAt}ms)`);
      return;
    }
    const flowLinkCandidate = parseAccountFlowLink(pathname, url.searchParams);
    // engine_routes.rb:41-44's explicit GET alternative for UPDATE (the
    // create/read/delete/asset actions stay page-branch — the recorded
    // remainder): GET /update/<mark> routes to card#update exactly like the
    // verb-explicit forms (rest.rb:14-16 — the save runs with the query's
    // card params; the follow-family follow-links are data-remote anchors
    // and the emailed links are plain hrefs, both GET). The trigger+token
    // flow links above keep priority; a GET the module does not route (any
    // non-update path) answers null and falls to the page branch unchanged.
    if (
      flowLinkCandidate === null &&
      req.method === "GET" &&
      writePathEnabled()
    ) {
      const writeResponse = await dispatchWriteRequest(req, pathname);
      if (writeResponse !== null) {
        expireRenderCachesAfterSave(
          {
            fetcher,
            renderEngine: render,
            signedInEngines: signedInEngines.values(),
          },
          writeResponse,
        );
        console.log(
          `[vm-staging] ${req.method} ${pathname} -> ${writeResponse.status} (${Date.now() - startedAt}ms)`,
        );
        res.writeHead(writeResponse.status, writeResponse.headers).end(writeResponse.body);
        return;
      }
    }
    const flowLink = flowLinkCandidate;
    if (
      req.method !== "GET" &&
      flowLink === null &&
      !(
        req.method === "POST" &&
        (SIGNIN_POST_PATHS.has(pathname) ||
          ACCOUNT_POST_PATHS.has(pathname) ||
          pathname === FORGOT_PASSWORD_SUBMIT_PATH ||
          // the first-run setup post. Guarded by
          // firstRunEnabled() INSIDE the module, so with the flag unset this
          // clause is false and the 405 posture is byte-identical to before.
          (firstRunEnabled() && pathname === SETUP_PATH))
      )
    ) {
      response = jsonResponse(405, { error: "method not allowed" });
    } else if (flowLink !== null) {
      // The emailed reset/verify link (set/right/account/views.rb:34-38
      // token_url -> the engine_routes explicit GET alternative): the JWT
      // authenticator + trigger event over HTTP. Scoped to exactly this
      // shape — trigger param present AND a token — so no other GET is a
      // write (write-routes' no-GET-writes posture stands everywhere else).
      req.resume(); // drain any verb-explicit POST body; params ride the query
      response = await handleAccountFlowLink(flowLink, req);
      if (response.status >= 200 && response.status < 400) {
        expireFlowWrittenName(flowLink.accountMark);
      }
    } else if (req.method === "POST" && pathname === "/_signin") {
      response = await handleSignin(req);
    } else if (req.method === "POST" && pathname === "/_signout") {
      response = await handleSignout(req);
    } else if (req.method === "POST" && pathname === "/_reset-request") {
      response = await handleResetRequest(req);
    } else if (req.method === "POST" && pathname === "/_account-password") {
      response = await handleAccountPassword(req);
    } else if (req.method === "POST" && pathname === FORGOT_PASSWORD_SUBMIT_PATH) {
      response = await handleForgotPasswordSubmit(req, startedAt);
    } else if (firstRunEnabled() && (req.method === "GET" || req.method === "POST") && pathname === SETUP_PATH) {
      // The first-run journey. NEW surface, off
      // unless DECKO_FIRST_RUN=1: with the flag unset this branch is never
      // reached, /setup falls through to the card renderer exactly as before,
      // and no existing route, view or rendered byte changes. The census
      // behind it is Ruby Card::Auth.needs_setup? (card-1.110.0
      // lib/card/auth/setup.rb:33-52); see src/card/auth/first-run-setup.ts.
      response = await dispatchFirstRunRequest(req, pathname, startedAt);
    } else if (req.method === "GET" && pathname === "/*signin/reset_password_success") {
      response = await renderResetPasswordSuccessPage();
    } else if (
      req.method === "GET" &&
      (pathname === "/*signin/edit" ||
       (pathname === "/*signin" && url.searchParams.get("view") === "edit"))
    ) {
      // decko.js's slotter link (signin.rb:185-188 reset_password_link —
      // link_to_view :edit, path slot hide board_link) fetches this URL and
      // routes the response through slotContent: only a response whose ROOT
      // element carries _modal-slot reaches _slotContentFromElement's
      // `el.hasClass("_modal-slot") || mode === "modal"` -> showAsModal ->
      // el.modal("show"). A full-page answer parses as html/head/body,
      // misses the class check and falls to the slot-replacement arm — the
      // modal fills but never shows (the reset journey's fill-*.modal
      // timeout). Ruby's controller answers params[:slot] with the SLOT
      // ALONE (the modal fragment); the plain navigation (no slot params,
      // no ajax header) keeps the full page.
      const slotRequested =
        [...url.searchParams.keys()].some((k) => k.startsWith("slot[")) ||
        req.headers["x-requested-with"] === "XMLHttpRequest";
      if (slotRequested) {
        const signinRecord = await fetchCardByName("*signin");
        // The BARE fragment — the response's ROOT element must be the
        // modal div (htmlResponse's doctype/head/body chrome would make
        // $(newContent)'s root the html node and the hasClass check
        // would miss it, exactly like the full-page arm).
        response = {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          body: buildForgotPasswordModalHtml(signinRecord?.id ?? ""),
        };
      } else {
        response = await renderForgotPasswordPage();
      }
    } else if (
      STOCK_DECK &&
      writePathEnabled() &&
      req.method === "GET" &&
      req.headers["x-requested-with"] === "XMLHttpRequest" &&
      /^\/(card\/)?(create|update|delete)\/[^/]+$/.test(pathname) &&
      !/^\/(card\/)?delete\/\*signin$/i.test(pathname)
    ) {
      // Decko's routes take create, update and delete over GET as well
      // (engine_routes.rb "(card)/<action>(/:mark)"), and its own links use
      // them through ajax: the follow buttons (GET /update/<card>+*follow?...)
      // and the edit form's Delete. Served here for same-origin ajax only:
      // the X-Requested-With header cannot be set by another site without
      // CORS, so a plain cross-site link or image cannot change a card. The
      // parameters ride the query string, as Ruby reads them.
      const verb = /\/(create|update|delete)\//.exec(pathname)[1];
      const writeReq = Object.assign(Object.create(req), {
        method: verb === "delete" ? "DELETE" : "POST",
        headers: req.headers,
        url: req.url,
      });
      response = (await dispatchWriteRequest(writeReq, pathname, "")) ?? jsonResponse(404, { error: "no write route" });
      expireRenderCachesAfterSave(
        { fetcher, renderEngine: render, signedInEngines: signedInEngines.values() },
        response,
      );
    } else if (STOCK_DECK && req.method === "GET" && /^\/(card\/)?delete\/\*signin$/i.test(pathname)) {
      // The navbar's "Sign out" link is GET /delete/*signin: Decko's routes
      // take delete over GET (engine_routes.rb "(card)/delete(/:mark)"), and
      // the *signin card's :signout event ends the session
      // (set/self/signin.rb), then the page shows *signin. Env.reset_session
      // (signin.rb:21) drops the REST of the visitor's session with it — the
      // location history and Session-card content — exactly what the write
      // path's DELETE arm does through its visitor-session wrapper; this GET
      // arm owns the reset itself.
      const token = readSessionCookie(req.headers.cookie);
      await signoutAccount(sessions, token);
      response = {
        status: 302,
        headers: {
          Location: "/*signin",
          "Set-Cookie": [clearedSessionCookieHeader(nodeCookieSecure(req)), visitorSessionCookie(emptyVisitorSession())],
          "Cache-Control": "no-store",
        },
        body: "",
      };
    } else if (req.method === "GET" && pathname === "/_mail-log") {
      response = handleMailLog();
    } else if (pathname === "/_status") {
      response = await status();
    } else if (pathname === "/") {
      // The home page renders for the session's account like any other page.
      // mark.rb:42-44: the bare arm's mark is implicit_mark -> home_mark —
      // `Card::Rule.global_setting(:home) || "Home"` — read per request
      // (the *home rule's content when it exists and is not blank;
      // rule.rb:5-9 strips, whitespace-only falls back). HOME_CARD_NAME
      // stays the boot warm-up's name only.
      //
      // THE MARK SOURCE (this row's other sub-point). Ruby's interpret_mark
      // (mark.rb:10-20) reads params[:mark] FIRST: a mark in the query is
      // an EXPLICIT mark (explicit_mark, mark.rb:17-18) and only a request
      // with NO mark reaches implicit_mark's home fallback. The serving host
      // already carries that precedence on its bare arm
      // (bunny-edge-engine-request.ts's bareRootArm check); this host did
      // not, so the two hosts answered differently when both the query and
      // the rule were in play. The query's mark wins here too, and its
      // underscores fold to spaces (card-1.110.0/lib/card/fetch/
      // card_class.rb:129 — `opts[:name] ||= Name[params[:mark]]&.tr "_", " "`).
      const markQuery = url.searchParams.get("mark");
      const homeMarkName = markQuery === null
        ? await homeMarkContent(render)
        : (markQuery.replace(/_/g, " ") || "Home");
      response = await renderCardPage(homeMarkName, requestEngine, requestedView, undefined, pageOpts);
      servedCardName = homeMarkName;
    } else if (STOCK_DECK && MOD_PUBLIC_DIR !== undefined && pathname.startsWith("/mod/")) {
      response = await serveModPublicFile(pathname);
    } else if (pathname.startsWith("/files/")) {
      const assetResp = await handleAssetFile(pathname);
      if (assetResp !== null) {
        response = assetResp;
      } else {
        const actorRender = actor !== null ? await engineForActor(actor.id, req.headers.cookie) : render;
        await actorRender.ensureFreshness();
        const codedResponse = await handleAttachmentRoute(new Request(url, { method: req.method }), {
          driver, fetchEngine: fetcher, attachmentStore,
          createEngine: () => { throw new Error("file GET does not create an action engine"); },
          canReadCard: async id => {
            const record = await fetcher.fetchById(id);
            if (!record) return false;
            const type = record.typeId !== undefined ? await fetcher.fetchById(record.typeId) : undefined;
            return actorRender.canReadCard(record, type?.name?.s);
          },
        });
        if (codedResponse !== null) {
          res.writeHead(codedResponse.status, Object.fromEntries(codedResponse.headers));
          res.end(req.method === "HEAD" ? undefined : Buffer.from(await codedResponse.arrayBuffer()));
          return;
        }
        response = htmlResponse(
          404,
          `<h1>Not found</h1><pre>No asset for ${escapeHtml(pathname)}</pre>`,
          "Not found",
        );
      }
    } else if (isRssRequest(pathname, url.searchParams)) {
      // THE RSS FORMAT ON THIS HOST (register-routes D3). engine_routes.rb
      // carries rss the way it carries every other format: as the route's
      // (.:format) suffix, so `/<mark>.rss` and `?format=rss` are the same
      // request (response.rb:111-113 `requested_format` - params[:format]
      // when present, else request.format; the suffix IS params[:format]).
      // `rss` is a REGISTERED format (mod/format rss_format.rb:7
      // `register :rss`), so `format_name_from_params` (response.rb:102-105)
      // keeps it as :rss rather than folding it to :file - D4's arm, which
      // this one is the counter-example to.
      //
      // Before this row the two spellings fell through to the html arms: a
      // `.rss` path lost its suffix to stripFormat and rendered the card's
      // PAGE, so this host answered 200 text/html for a feed request.
      response = await rssFormatResponse(url, requestEngine);
    } else if (registeredRoute !== undefined) {
      // THE REGISTERED-FORMAT ARM (row D5): a registered suffix
      // on a card URL is a FORMAT, not part of the card's name.
      response = await registeredFormatResponse(registeredRoute, url, requestEngine);
    } else if (pathname.endsWith(".json") &&
               ["name_match", "name_complete"].includes(url.searchParams.get("view") ?? "")) {
      // The editors' card-name autocomplete (card-mod-search set/abstract/
      // 0_search/views.rb name_match / name_complete on the `<anything>+by
      // name` search card, the view read off ?view= as card#read does).
      response = await nameMatchJsonResponse(url, requestEngine);
    } else if (pathname.endsWith(".json")) {
      const raw = pathname.slice(0, -".json".length).replace(/^\//, "");
      const name = decodeName(raw);
      if (name === undefined || name === "") {
        response = jsonResponse(400, { error: "empty card name" });
      } else if (raw.includes("/")) {
        // Ruby route line 51: get ":mark/:view(.:format)" => "card#read".
        // A two-segment .json path is mark + view + json format (a card
        // name cannot carry "/" — the joint is "+"), so the ENGINE answers:
        // the view dispatch in the json format for ported json-format views
        // (search_box_complete, mod/search set/self/search.rb:70-72 — the
        // navbox typeahead's JSON), Ruby's 422 unsupported-view shape
        // otherwise. The bytes are the engine's (render raw + format json),
        // not a harness fabrication — the harness-side serving shim this
        // arm carried before (commit e2062847) is deleted: the board's
        // typeahead journey proves the engine path.
        const slash = raw.indexOf("/");
        const markName = decodeName(raw.slice(0, slash));
        const viewName = decodeViewSegmentJson(raw.slice(slash + 1));
        if (markName === undefined || markName === "" || viewName === undefined || viewName === "") {
          response = jsonResponse(400, { error: "empty card name" });
        } else {
          response = await renderCardViewJson(markName, viewName, url, requestEngine);
        }
      } else {
        response = await cardRecordJson(name, requestEngine);
      }
    } else if (SIGNIN_PAGE_PATHS.has(pathname)) {
      // Live renders the *signin card's own sign-in form at /*signin
      // (set/self/signin.rb); the staging form is the honest stand-in.
      response = await renderSigninPage();
    } else if (!pathname.slice(1).includes("/")) {
      // THE FILE SENDER for the general mapping (row D4): a card read whose
      // requested format is UNREGISTERED is the file sender (the pinned fold,
      // response.rb:102-105 `explicit_file_format?(rf) ? :file : rf.to_sym`),
      // and the answer is the card's OWN file. The shape is the one-segment
      // mark arm with an unregistered suffix (engine_routes.rb:22's
      // (.:format) capture), so "/Alpha.bin" is the card "Alpha" and the
      // file sender, not the card named "Alpha.bin". The arm lives in the
      // port's own file-routes module (the same store the /files/ route
      // reads), and it answers 404 for a card with no file, which is the
      // pinned deck's own answer there (the file format's :core view
      // returns the not-found view when the card has no attachment).
      const senderResponse = await handleAttachmentRoute(new Request(url, { method: req.method }), {
        driver, fetchEngine: fetcher, attachmentStore,
        createEngine: () => { throw new Error("file GET does not create an action engine"); },
        canReadCard: async id => {
          const record = await fetcher.fetchById(id);
          if (!record) return false;
          const type = record.typeId !== undefined ? await fetcher.fetchById(record.typeId) : undefined;
          const actorRender = actor !== null ? await engineForActor(actor.id, req.headers.cookie) : render;
          return actorRender.canReadCard(record, type?.name?.s);
        },
      });
      if (senderResponse !== null) {
        res.writeHead(senderResponse.status, Object.fromEntries(senderResponse.headers));
        res.end(req.method === "HEAD" ? undefined : Buffer.from(await senderResponse.arrayBuffer()));
        console.log(`[vm-staging] ${req.method} ${pathname} -> ${senderResponse.status} (file sender)`);
        return;
      }
      const name = decodeName(pathname.slice(1));
      // View-lane dispatch: a non-empty ?view= query renders the BARE view
      // (renderCardView above); its absence or emptiness keeps the page
      // path byte-identical. The query is the dispatch key (the corpus
      // URL convention "/<name>?view=<view>"), not the request headers.
      //
      // Two byte contracts meet here and both hold: the bare view
      // lane answers a RAISING render with the CAPTURE_ERROR sentinel at
      // status 200 — the shadow parity stage's byte-comparison semantics —
      // but the session surface pins Ruby's unsupported-view shape
      // (422, format/render.rb:60-64 via error.rb:21) in the
      // standing-net member tests/server/edit-session-replay.test.ts
      // ("unported view names 422 and deep paths 404"). The contracts are
      // reconciled by scoping the sentinel behavior to the process that asks
      // for it: the shadow tool sets DECKO_SHADOW_VIEW_LANE=1 on the servers
      // it spawns (bin/migration-parity-shadow.mjs); every other boot — the
      // pinned tests, the session-replay surface, default staging — keeps
      // the fall-through to renderCardPage, whose unsupported-view
      // answer is the 422.
      const requestedView = url.searchParams.get("view");
      const shadowViewLane = process.env.DECKO_SHADOW_VIEW_LANE === "1";
      // mark.rb:12-14 interpret_mark("*previous"): the READ-path *previous
      // mark hard-redirects to Card::Env.previous_location - the visitor
      // session's location history's last entry (the same seam the write
      // path's success[mark]=*previous resolves). Ruby's hard_redirect
      // (response.rb:39-50): absolute via card_url, 302 for a normal
      // request, the {redirect: url} JSON for ajax. No card fetch happens.
      // The empty history bottoms out at the deck root (location_history.rb:7).
      if (name === "*previous" || name === ":previous") {
        const previousVisit = readVisitorSession(req.headers.cookie);
        const previousTarget = new URL(previousLocation(previousVisit), `http://${req.headers.host ?? "127.0.0.1"}`).toString();
        if (req.headers["x-requested-with"] === "XMLHttpRequest") {
          const xhrBody = JSON.stringify({ redirect: previousTarget });
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(xhrBody);
        } else {
          res.writeHead(302, { Location: previousTarget, "Cache-Control": "no-store" });
          res.end();
        }
        console.log(`[vm-staging] ${req.method} ${pathname} -> 302 *previous (${Date.now() - startedAt}ms)`);
        return;
      }
      // engine_routes.rb:41-43: the (card)/read and (card)/asset action
      // routes outrank /:mark for these names — /read is card#read of the
      // IMPLICIT mark (the home-mark page) and /asset is card#asset (the
      // fixed installation-error stub). A deck card literally named "read"
      // or "asset" is unreachable at its bare URL, exactly as in Ruby.
      // The create/delete single-segment names stay the card arm: Ruby's
      // action routes for them are STATE-CHANGING GETs, which this host's
      // recorded hardening (same-origin-XHR-only GET mutations, the C16
      // posture) keeps off the plain-link surface — named divergence.
      if (name === "read") {
        const readHomeName = await homeMarkContent(requestEngine);
        response = await renderCardPage(readHomeName, requestEngine, requestedView, undefined, pageOpts);
        servedCardName = readHomeName;
      } else if (name === "asset") {
        const assetActionStub = deprecatedAssetStubResponse();
        res.writeHead(assetActionStub.status, Object.fromEntries(assetActionStub.headers));
        res.end(req.method === "HEAD" ? undefined : Buffer.from(await assetActionStub.arrayBuffer()));
        console.log(`[vm-staging] ${req.method} ${pathname} -> ${assetActionStub.status} (card#asset action, ${Date.now() - startedAt}ms)`);
        return;
      } else if (name === undefined || name === "") {
        response = jsonResponse(400, { error: "empty card name" });
      } else if (shadowViewLane && requestedView !== null && requestedView !== "") {
        response = await renderCardView(name, requestedView, requestEngine);
      } else {
        const pageRenderParams =
          STOCK_DECK ? await newCardRenderParams(name, url.searchParams) : undefined;
        const searchReqSingle = jsonViewSearchParams(url.searchParams);
        const editorParamsSingle = editorWireParamsFromQuery(url.searchParams);
        response = actor === null && searchReqSingle?.offset > 1000
          ? htmlResponse(403, "<h1>Forbidden</h1><pre>limit parameter exceeds maximum for anonymous users (1000)</pre>", "Forbidden")
          : await renderCardPage(
          name,
          requestEngine,
          requestedView,
          {
            ...(pageRenderParams ?? {}),
            ...(searchReqSingle !== undefined
              ? {
                  search: searchReqSingle,
                }
              : {}),
            ...(Object.keys(editorParamsSingle).length > 0
              ? {
                  editorParams: editorParamsSingle,
                }
              : {}),
          },
          pageOpts,
        );
        servedCardName = name;
      }
    } else {
      // Multi-segment GET grammar — decko-0.20.0 config/engine_routes.rb,
      // all resolving to card#read (the read action renders the page with
      // the named view, exactly what the ?view= param does via
      // view_from_params):
      //   line 51: get ":mark/:view(.:format)" => "card#read"  (the
      //     "super-lazy" form — and the form the page chrome's own
      //     edit links emit: href="/<card>/<view>");
      //   line 24: get ":mark/view/:view(.:format)" (the API-doc form);
      //   line 25: get "card/:view(/:mark(.:format))", view restricted to
      //     new|edit (the legacy explicit form — "/card/:name/edit").
      // Ruby route order puts these BELOW the single-segment /:mark (line
      // 19), preserved by the branch order above. The (.:format) suffix
      // rides the last segment (served format is html either way). An
      // unported view name raises UnsupportedViewError -> the 422 mapping
      // inside renderCardPage (Ruby's unsupported-view UserError,
      // format/render.rb:60-64 + error.rb:21). Deeper paths and the
      // transaction-form arms of lines 42-48 (GET /card/create|update|
      // delete|asset/:mark) stay the 404: those actions are not page
      // renders in decko either (they process transactions), and the
      // bad_address wildcard (line 54) is an unported view.
      const segs = pathname.slice(1).split("/");
      const stripFormat = (s) => s.replace(/\.[A-Za-z0-9]+$/, "");
      let routeName;
      let routeView;
      let renderParams;
      // search_params.rb:12-18 + paging.rb:37-45: the request's query vars
      // (Env.hash(params[:query])) and the paging offset (Env.params[:offset],
      // focal-only) ride every page render; the search warm applies them to
      // the FOCAL card's own search only (renderSearchFocalKey). The
      // anonymous offset cap is legal_search_param's MAX_ANONYMOUS_SEARCH_
      // PARAM (1000): over it, Ruby raises PermissionDenied — surfaced as
      // the 403 below.
      const searchOffsetRaw = url.searchParams.get("offset");
      const searchOffset =
        searchOffsetRaw !== null && /^\d+$/.test(searchOffsetRaw) && Number(searchOffsetRaw) > 0
          ? Number(searchOffsetRaw)
          : undefined;
      if (
        searchOffset !== undefined &&
        actor === null &&
        searchOffset > 1000
      ) {
        response = htmlResponse(
          403,
          `<h1>Forbidden</h1><pre>limit parameter exceeds maximum for anonymous users (1000)</pre>`,
          "Forbidden",
        );
        res.writeHead(response.status, response.headers).end(response.body);
        console.log(`[vm-staging] ${req.method} ${pathname} -> 403 anonymous offset (${Date.now() - startedAt}ms)`);
        return;
      }
      const searchReq = jsonViewSearchParams(url.searchParams);
      // The snippet editors' request params (see editorWireParamsFromQuery):
      // threaded on the multi-segment card routes so the dialog views render
      // their Apply wire, exactly as the single-segment and new-card routes
      // below do.
      const editorWireParams = editorWireParamsFromQuery(url.searchParams);
      const hasEditorWireParams = Object.keys(editorWireParams).length > 0;
      const newCardRoute = STOCK_DECK ? parseNewCardRoute(segs, url.searchParams) : null;
      // engine_routes.rb:23 `get "type/:type" => "card#read"` — no view,
      // no mark. load_mark's implicit_mark (mark.rb:28-40) lands on
      // home_mark (mark.rb:42-44, the *home rule || "Home"): the segment
      // rides uri_fetch_opts' opts[:type] (card_class.rb:128-133), which
      // standard_uri_fetch applies only to the new-card fallback — on any
      // deck whose home mark exists the render is the HOME CARD's page.
      // Routed ahead of the :mark/:view arm (Ruby's table order), which
      // would otherwise parse /type/<x> as the card "type" in view <x>.
      // The route carries no .:format capture, so the whole second segment
      // is the :type param (inert for the render). The type threads into
      // the missing-home new-card fallback via newCardRenderParams.
      const typeRoute = segs.length === 2 && segs[0] === "type" && segs[1] !== "";
      // engine_routes.rb:41-43's read alternative, above the :mark/:view
      // arm in Ruby's table: /read/<mark> and /card/read/<mark> are
      // card#read OF <mark> (show(nil) — the query view applies), never the
      // card "read" in view <mark>. The markless /card/read is card#read of
      // the IMPLICIT mark (the home-mark page). Multi-segment /create and
      // /delete action shapes stay unadmitted (the C16-posture hardening
      // named at the single-segment arm).
      const readActionRoute =
        (segs.length === 2 && segs[0] === "read" && segs[1] !== "") ||
        (segs.length === 3 && segs[0] === "card" && segs[1] === "read" && segs[2] !== "");
      const marklessCardRead = segs.length === 2 && segs[0] === "card" && segs[1] === "read";
      if (newCardRoute !== null) {
        routeName = newCardRoute.name;
        routeView = "new";
        renderParams = await newCardRenderParams(newCardRoute.mark, url.searchParams, newCardRoute.typeName);
        if (hasEditorWireParams) renderParams = { ...renderParams, editorParams: editorWireParams };
      } else if (typeRoute) {
        routeName = await homeMarkContent(requestEngine);
        renderParams = STOCK_DECK
          ? await newCardRenderParams(routeName, url.searchParams, decodeName(segs[1]))
          : undefined;
        if (hasEditorWireParams) renderParams = { ...(renderParams ?? {}), editorParams: editorWireParams };
      } else if (readActionRoute) {
        routeName = decodeName(segs[0] === "read" ? segs[1] : segs[2]);
        routeView = undefined; // show(nil): the query's ?view= applies
      } else if (marklessCardRead) {
        routeName = await homeMarkContent(requestEngine);
        routeView = undefined;
      } else if (segs.length === 2 && segs[0] !== "" && segs[1] !== "") {
        routeName = segs[0];
        routeView = stripFormat(segs[1]);
      } else if (segs.length === 3 && segs[1] === "view" && segs[0] !== "" && segs[2] !== "") {
        routeName = segs[0];
        routeView = stripFormat(segs[2]);
      } else if (
        segs.length === 3 &&
        segs[0] === "card" &&
        (segs[1] === "new" || segs[1] === "edit") &&
        segs[2] !== ""
      ) {
        routeName = segs[2];
        routeView = segs[1];
      }
      if (newCardRoute !== null) {
        response = await renderCardPage(routeName, requestEngine, routeView, renderParams, pageOpts);
      } else if ((typeRoute || readActionRoute || marklessCardRead) && routeName !== undefined) {
        // show(nil): the query's ?view= is view_from_params (rest.rb
        // :100-103), exactly like the bare single-segment arm's
        // requestedView.
        response = await renderCardPage(routeName, requestEngine, url.searchParams.get("view"), renderParams, pageOpts);
        servedCardName = routeName;
      } else if (routeName !== undefined && routeView !== undefined) {
        const name = decodeName(routeName);
        if (name === undefined || name === "") {
          response = jsonResponse(400, { error: "empty card name" });
        } else {
          // The harness-side search_box_complete arm this branch carried
          // (commit e2062847) is DELETED: `/:mark/:view` without the
          // .:format suffix is an HTML-format render (Ruby's route line 51
          // default), and search_box_complete is a json-format-only view —
          // the engine's UnsupportedViewError -> the 422 mapping inside
          // renderCardPage is Ruby's answer (the typeahead never rides this
          // form; the navbar's data-completepath carries the .json suffix).
          response = await renderCardPage(
            name,
            requestEngine,
            routeView,
            searchReq || hasEditorWireParams
              ? { ...(searchReq ? { search: searchReq } : {}), ...(hasEditorWireParams ? { editorParams: editorWireParams } : {}) }
              : undefined,
            pageOpts,
          );
          servedCardName = name;
        }
      } else {
        // engine_routes.rb:54 `get *mark => "card#read", view:
        // "bad_address"`: the glob mark carries the whole path (slashes ->
        // the junction "+"), and uri_fetch's new-card fallback means the
        // registered bad_address VIEW renders whether or not a card exists
        // there — through the page chrome, the view's root.error_status =
        // 404 carrying the status (card-mod-format set/all/error.rb:23-26;
        // the port's pageErrorStatus). NOT the router's bare stub this arm
        // answered before. A segment that fails the hardened decode keeps
        // the stub (a malformed % is a bad request, not a bad address).
        // The renderAbsentCards seat is taken around the render and
        // released: stock boots hold it permanently; on a non-stock boot a
        // concurrent missing-card page render inside the window would see
        // the seat (a transient new-form-instead-of-404 answer — named
        // here, not silently accepted).
        const wildcardSegments = pathname.replace(/\/+$/, "").replace(/^\/+/, "").split("/").filter(Boolean);
        const wildcardParts = [];
        let wildcardDecodeFailed = false;
        for (const wildcardSegment of wildcardSegments) {
          const decoded = decodeName(wildcardSegment);
          if (decoded === undefined || decoded === "") {
            wildcardDecodeFailed = true;
            break;
          }
          wildcardParts.push(decoded);
        }
        if (wildcardParts.length === 0 || wildcardDecodeFailed) {
          response = htmlResponse(
            404,
            `<h1>Not found</h1><pre>No route for ${escapeHtml(pathname)} — try /<card-name> or /<card-name>.json</pre>`,
            "Not found",
          );
        } else {
          // KNOWN card at a wildcard address: the bad_address VIEW renders
          // (its error_status carries the 404). UNKNOWN card: Ruby's view
          // gate (card/view/permission.rb:33-44 alter_unknown ->
          // format/error.rb:17-22 view_for_unknown) replaces the view for
          // an unknown main card with page_view_for_unknown (:new for a
          // viewer who may create, :not_found otherwise) — the missing-card
          // raise inside renderCardPage answers the deck's not_found chrome
          // page (the C10-pinned shape), Ruby's anonymous arm. Named
          // remainder: the signed-in may-create :new-form arm (Ruby 200) at
          // wildcard addresses rides the single-segment machinery only.
          // servedCardName stays undefined: save_current_location pushes
          // only KNOWN cards.
          const wildcardName = wildcardParts.join("+");
          response = await renderCardPage(wildcardName, requestEngine, "bad_address", undefined, pageOpts);
        }
      }
    }
    // event :save_current_location (mod/session set/all/location_history.rb):
    // a full-page read of a KNOWN card pushes its own URL onto the session's
    // location history (save_location?, location_history.rb:47-51:
    // event :save_current_location (mod/session set/all/location_history.rb):
    // a full-page read of a KNOWN card pushes its own URL onto the visitor
    // session's cookie-carried location history (pageViewCookie — the
    // write-routes visitor-session module's host seam; save_location?,
    // location_history.rb:47-51: non-ajax, html, known, not the *signin
    // codename). The `*previous` success mark and the delete's
    // configure_successful_deletion redirect resolve to the LAST entry, so a
    // delete fired from an edit page answers its hard-redirect JSON with
    // that page's own address.
    if (
      req.method === "GET" &&
      servedCardName !== undefined &&
      response.status === 200 &&
      String(response.headers["Content-Type"] ?? "").includes("text/html") &&
      req.headers["x-requested-with"] !== "XMLHttpRequest" &&
      String(req.headers.accept ?? "").includes("text/html") &&
      !SIGNIN_PAGE_PATHS.has(pathname)
    ) {
      const knownRecord = await requestEngine.fetcher.fetchByName(servedCardName).catch(() => undefined);
      if (knownRecord?.id !== undefined) {
        const setCookie = pageViewCookie(req.headers.cookie, `http://${req.headers.host}${url.pathname}${url.search}`, {
          known: true,
          html: true,
          ajax: false,
          // save_location?'s own codename leg (location_history.rb:47-51):
          // the *signin card's page never joins the history — Ruby reads
          // card.codename on the rendered card, so the seam carries the
          // record's codename rather than a path-shape guess (the stock
          // profile serves the sign-in page through the card-page branch,
          // where a path set cannot see the card).
          codename: knownRecord.codename,
        });
        if (setCookie !== undefined && response.headers["Set-Cookie"] === undefined) {
          response.headers["Set-Cookie"] = setCookie;
        }
      }
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
