// deploy/bunny-worker-src/bunny-edge-page-shell.ts — the served-environment
// deltas the Bunny edge applies to the engine's page output, and the /files/
// attachment-URL derivation for the edge's files route.
//
// WHY THIS EXISTS (edge-site-shell lane, 2026-10-02): the edge entry used to
// wrap renders in the root worker.ts layoutPage — a bare inline-styled shell
// with a two-link nav and no stylesheet, scripts, favicon, navbar, or footer
// (measured live 2026-10-02: 0 <link> and 0 <script> tags vs the live site's
// 3 and 9). The engine's OWN page entry — src/card/render/page.ts
// renderPageBytes, the show_with_page_layout port — already assembles the
// full page (per-card *layout rule, *header/*footer nests, html_page head
// with favicon/stylesheet/script tags); the vm-staging host has served those
// bytes with five deployment deltas since r18 (vm-staging-server.mjs:1551-
// 1626). This module carries THE SAME five deltas — constants byte-verbatim
// from that file — so the edge serves the same full shell the staging host
// does, with the live site's asset URLs, and nothing 404s.
//
// SDK-free by construction (plain string surgery + a pure derivation), so
// vitest loads it directly (tests/deploy/bunny-edge-page-shell.test.ts); the
// platform SDK stays resolved only by the entry (the same testability
// pattern as bunny-edge-engine-request.ts).

/** The live deck's asset host (vm-staging-server.mjs:183 SPACES_HOST): the
 *  `.cdn.` Spaces subdomain every live asset URL uses (12/12 live pages,
 *  audit A-1; live receipt src="…cdn…/files/27689/135167-large.jpg"). The
 *  engine's capture pins the fog endpoint form `http://s3.amazonaws.com//files/…`;
 *  delta 1 rewrites it wholesale. Content images already carry this host via
 *  RenderEngine#imageCdnHost (set by the entry's bootDeck), so only the
 *  capture-env forms remain to rewrite. */
export const SPACES_ASSET_HOST =
  "https://reference-deck-production-storage.fra1.cdn.digitaloceanspaces.com";

/** The capture fog form the engine's page bytes carry (page.ts
 *  CLOUD_URL_PREFIX; head-views.ts FOG_CLOUD_URL_HOST + "/files/"). */
const SERVED_ASSET_HOST_PREFIX = "http://s3.amazonaws.com//files/";

/** Audit A-2: live serves /files/45514/1790384218.css (byte receipt vs the
 *  SassC compile); the corpus row stores the OLDER 1786554352 revision,
 *  which the engine resolves from *all+*style+*asset output. Rewritten on
 *  both the stylesheet link and decko.cssPath. A trial deck that later
 *  stores the live revision makes this rewrite a no-op (split/join with no
 *  match). */
const SERVED_CSS_REVISION = "45514/1786554352.css";
const SERVED_CSS_REVISION_LIVE = "45514/1790384218.css";

/** Audit A-4: live loads jquery / jquery-ujs / ace / select2 WITH the
 *  sha256/sha512 integrity hashes (12/12 live pages); the engine's pinned
 *  manifest omits them. Values verbatim from the live head bytes. */
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

/** The five served-environment deltas, byte-identical to the staging host's
 *  applyServedEnvironmentDeltas (vm-staging-server.mjs:1608-1626):
 *   1. asset host: capture fog form -> the served .cdn. Spaces host
 *   2. stylesheet revision: corpus-stored -> live-served (link + cssPath)
 *   3. script integrity attributes
 *   4. footer version pin (corpus *version row is empty; live prints 0.19.1)
 *   5. trailing newline after </html> (live byte shape)
 *  Delta 4 carries a second form the LIVE proof on the deployed edge found
 *  (edge-site-shell lane, 2026-10-02): the trial deck's *credit content
 *  embeds the version LITERALLY ("Decko v0.20.0" — the staging host never
 *  saw this shape because its *credit row stores the bare form), so the
 *  bare-form rewrite no-ops and the edge printed 0.20.0 where live prints
 *  0.19.1. The literal-form rewrite pins the same served byte. */
export function applyServedEnvironmentDeltas(engineHtml: string): string {
  let body = engineHtml;
  body = body.split(SERVED_ASSET_HOST_PREFIX).join(`${SPACES_ASSET_HOST}/files/`);
  body = body.split(SERVED_CSS_REVISION).join(SERVED_CSS_REVISION_LIVE);
  for (const { src, withIntegrity } of SERVED_SCRIPT_INTEGRITY) {
    body = body.split(src).join(withIntegrity);
  }
  body = body.split(`>Decko v</a>`).join(`>Decko v0.19.1</a>`);
  body = body.split(`>Decko v0.20.0</a>`).join(`>Decko v0.19.1</a>`);
  if (!body.endsWith("\n")) body += "\n";
  return body;
}

/** The image-size variant carried in a /files/ request leaf
 *  ("3649-small.jpg" -> "small"; carrierwave's version suffixes,
 *  file_card_uploader.rb:274-281). undefined = unsized (the original). */
export function filesLeafVariant(leaf: string): string | undefined {
  const m = /-(small|medium|large|icon|mini|original)\.[^.]+$/.exec(leaf);
  return m?.[1];
}

/** The text/plain 404 body the LIVE app serves for a /files/ id it cannot
 *  resolve — measured 2026-10-02: GET https://the reference deck/files/103/
 *  3649-small.jpg -> 404, 19 bytes, text/plain, "Could not find 103." */
export function filesNotFoundBody(id: string): string {
  return `Could not find ${id}.`;
}
