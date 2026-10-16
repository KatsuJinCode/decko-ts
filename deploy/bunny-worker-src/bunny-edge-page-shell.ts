import { applyFontAwesomeAssetConfiguration } from "../../src/card/render/font-awesome.js";
// deploy/bunny-worker-src/bunny-edge-page-shell.ts — the served-environment
// deltas the Bunny edge applies to the engine's page output, and the /files/
// attachment-URL derivation for the edge's files route.
//
// WHY THE DELTAS ARE A PARAMETER: the edge entry
// used to wrap renders in the root worker.ts layoutPage — a bare inline-styled
// shell with a two-link nav and no stylesheet, scripts, favicon, navbar, or
// footer (measured at 0 <link> and 0 <script> tags against a served site's
// 3 and 9). The engine's OWN page entry — src/card/render/page.ts
// renderPageBytes, the show_with_page_layout port — already assembles the
// full page (per-card *layout rule, *header/*footer nests, html_page head
// with favicon/stylesheet/script tags). What remains for a deployment to
// add is whatever ITS OWN deck serves differently from the engine's own
// output — and that is configuration, not source.
//
// Every deck-specific value used to live here as a module constant, so every
// deployment of the engine served one specific deck's version string, asset
// revisions and SRI hashes. They now arrive through the deltas argument
// (bunny-edge-served-deltas.ts), EMPTY by default: a deployment that
// configures nothing is a stock 0.20.0 deck and every delta pass below is a
// no-op. The values that used to sit here as constants now live in the
// operator's deployment configuration, set explicitly through the
// deployment's environment (the DECKO_SERVED_* variables read by
// bunny-edge-served-deltas.ts), so the shipped source carries no deck's
// identity.
//
// The one delta that is NOT deck identity and therefore stays unconditional
// is the trailing newline: it is a byte shape every served HTML document has,
// not a property of any one deck.
//
// SDK-free by construction (plain string surgery + a pure derivation), so
// vitest loads it directly (tests/deploy/bunny-edge-page-shell.test.ts); the
// platform SDK stays resolved only by the entry (the same testability
// pattern as bunny-edge-engine-request.ts).

import { EMPTY_SERVED_DELTAS, type ServedEnvironmentDeltas } from "./bunny-edge-served-deltas.js";
import { addConflictRetryScript } from './bunny-edge-conflict-retry-script.js';

/** The asset host a deployment's /files/ URLs resolve to, or undefined for
 *  the stock host-relative form (the engine's imageCdnHost-unset shape).
 *  Re-exported from the deltas so the one name every call site already used
 *  keeps its meaning; it is a CONFIG READ now, not a constant. */
export function servedAssetHost(deltas: ServedEnvironmentDeltas): string | undefined {
  return deltas.assetHost;
}

/** The served-environment deltas this deployment applies to the engine's page
 *  bytes. Each pass is skipped when its configuration is absent, so the empty
 *  deltas object is a strict no-op:
 *   1. asset host: the engine's stored endpoint form -> the configured
 *      served host (both the link hrefs and the inline decko.cssPath)
 *   2. stylesheet revision: deck-stored -> served (link + cssPath)
 *   3. script integrity attributes
 *   4. footer version pin (the *version row is empty on some decks; a
 *      deployment that serves a different string rewrites the deck's own
 *      credit form — both the bare `>Decko v</a>` shape and the literal
 *      version the deck's *credit content may embed)
 *   5. trailing newline after </html> (unconditional — a byte shape every
 *      served HTML document has, not a property of any one deck)
 */
export function applyServedEnvironmentDeltas(
  engineHtml: string,
  deltas: ServedEnvironmentDeltas = EMPTY_SERVED_DELTAS,
): string {
  let body = applyFontAwesomeAssetConfiguration(engineHtml, deltas.fontAwesomeAssetMode);
  if (deltas.assetHost !== undefined) {
    // The engine pins the fog endpoint form
    // `http://s3.amazonaws.com//files/…`; a deployment serving from a CDN
    // rewrites it wholesale. Content images already carry the host via
    // RenderEngine#imageCdnHost (set by the entry's bootDeck), so only the
    // engine-emitted forms remain to rewrite here.
    body = body.split(SERVED_ASSET_HOST_PREFIX).join(`${deltas.assetHost}/files/`);
  }
  if (deltas.stylesheetRevision !== undefined) {
    // Rewritten on both the stylesheet link and decko.cssPath. A deck that
    // already stores the served revision makes this a no-op (split/join with
    // no match).
    body = body.split(deltas.stylesheetRevision.from).join(deltas.stylesheetRevision.to);
  }
  if (deltas.scriptIntegrity !== undefined) {
    for (const { src, withIntegrity } of deltas.scriptIntegrity) {
      body = body.split(src).join(withIntegrity);
    }
  }
  if (deltas.footerVersionPin !== undefined) {
    body = body.split(`>Decko v</a>`).join(`>Decko v${deltas.footerVersionPin}</a>`);
    // The literal form: a deck whose *credit content embeds the version
    // literally ("Decko v0.20.0") no-ops on the bare-form rewrite above.
    // The literal rewrite pins the same served byte when configured.
    body = body
      .split(`>Decko v${FOOTER_VERSION_IN_ENGINE_CREDITS}</a>`)
      .join(`>Decko v${deltas.footerVersionPin}</a>`);
  }
  if (!body.endsWith("\n")) body += "\n";
  if(deltas.conflictRetry===true)body=addConflictRetryScript(body);
  return body;
}

/** The fog endpoint form the engine's page bytes carry (page.ts
 *  CLOUD_URL_PREFIX; head-views.ts FOG_CLOUD_URL_HOST + "/files/"). This one
 *  IS engine-owned rather than deck identity: the rewrite's SOURCE has to
 *  match the engine's own output on any deck. */
const SERVED_ASSET_HOST_PREFIX = "http://s3.amazonaws.com//files/";

/** The version string the engine's own credit module answers with
 *  (card-mod-date set/self/version.rb:7-9 reads Cardio::Version.release,
 *  pinned to the card gem's 0.20.0 in src/card/set-module-content-overrides.ts).
 *  A footer version pin rewrites a literal occurrence of THIS value, so the
 *  rewrite source stays correct on a deck whose credits render the engine's
 *  own release string rather than an empty version. */
const FOOTER_VERSION_IN_ENGINE_CREDITS = "0.20.0";

/** The image-size variant carried in a /files/ request leaf
 *  ("3649-small.jpg" -> "small"; carrierwave's version suffixes,
 *  file_card_uploader.rb:274-281). undefined = unsized (the original). */
export function filesLeafVariant(leaf: string): string | undefined {
  const m = /-(small|medium|large|icon|mini|original)\.[^.]+$/.exec(leaf);
  return m?.[1];
}

/** The text/plain 404 body the app serves for a /files/ id it cannot
 *  resolve — 19 bytes, text/plain, "Could not find <id>." */
export function filesNotFoundBody(id: string): string {
  return `Could not find ${id}.`;
}
