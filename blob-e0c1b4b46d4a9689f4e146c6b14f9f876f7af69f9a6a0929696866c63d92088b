// Served-environment deltas for a synthetic configured deck, packaged as
// test configuration.
//
// The edge code itself carries no deck's identity. The values that once
// lived as module constants in that code — which forced every engine
// deployment to serve one particular deck — are read from the deployment
// environment now (deploy/bunny-worker-src/bunny-edge-served-deltas.ts),
// empty by default, and deploy/bunny-edge-deployment-runbook.md documents
// how a deployment supplies them.
//
// The suites that assert a CONFIGURED deployment's served output import this
// fixture and hand it to the engine through its environment, exactly as a
// production deployment would. A test asserting a particular deck's chrome
// therefore names the deck it configured, rather than leaning on every deck
// silently inheriting the same identity.
//
// The deck this fixture describes is invented. Every identity value in it —
// the asset host, the origin, the site title, and every card id, type id and
// file revision — is a synthetic value chosen to exercise one configuration
// code path, and none of it identifies a real deployment. The ids are
// exported as named constants so a suite that seeds the matching rows, or
// asserts the rendered attributes, reads one source rather than repeating a
// number.
//
// The fixture is not a default: a test that wants the stock (unset) state
// imports EMPTY_SERVED_DELTAS — the configuration-free state, which serves
// no version rewrite, no foreign card ids and no outside asset references.

import type { ServedEnvironmentDeltas } from "../../../deploy/bunny-worker-src/bunny-edge-served-deltas.js";

/** The asset host the configured deck serves /files/ URLs from. */
export const CONFIGURED_ASSET_HOST = "https://assets.deck.example";

/** The site origin the configured deck serves from (with a trailing slash),
 *  and the same identity as the engine's own card_url origin (Ruby's
 *  Cardio.config.deck_origin, no trailing slash). */
export const CONFIGURED_ROOT_URL = "https://deck.example/";
export const CONFIGURED_DECK_ORIGIN = "https://deck.example";

/** The compiled-CSS revisions of the configured deck: the revision its own
 *  database records (the older one) and the revision its pages actually
 *  serve (the newer one). The edge rewrites the recorded value to the
 *  served one. */
export const CONFIGURED_CSS_REVISION_FROM = "41001/1610000001.css";
export const CONFIGURED_CSS_REVISION_TO = "41001/1610000002.css";

/** The file-revision stem of each configured asset URL. Each is a card id
 *  followed by the revision timestamp, the shape a deck's compiled-asset
 *  path takes; the card ids are synthetic. */
export const CONFIGURED_MAIN_JS_FILE = "41002/1610000003.js";
export const CONFIGURED_LOGO_FILE = "41003/1610000004-small.jpg";
export const CONFIGURED_FAVICON_FILE = "41004/1610000005-small.jpg";

/** The configured deck's card and type ids. Each names one thing the served
 *  bytes carry, and a suite that seeds the matching rows or asserts the
 *  rendered attributes uses these constants. */
export const CONFIGURED_NOT_FOUND_TYPE_ID = 41005;
export const CONFIGURED_FOOTER_CARD_ID = 41006;
export const CONFIGURED_ALL_CARD_ID = 41007;
export const CONFIGURED_LAYOUT_POINTER_ID = 41008;
export const CONFIGURED_POINTER_TYPE_ID = 41009;

/** The remote script tags the configured deck's error chrome carries, with
 *  the SRI hashes that deployment's CDN requires — configuration, because a
 *  hash belongs to the file that deployment serves and cannot be derived
 *  here. */
export const CONFIGURED_HEAD_SCRIPTS = [
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous" integrity="sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw=="></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" integrity="sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==" referrerpolicy="no-referrer"></script>`,
  `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>`,
];

/** The SRI rewrite pairs the configured deck's page path applies to the
 *  engine's own pinned remote-script manifest. */
export const CONFIGURED_SCRIPT_INTEGRITY = [
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

/** The whole configured deck's served configuration, in the shape the edge
 *  reads from its environment. */
export const CONFIGURED_DECK_SERVED_DELTAS: ServedEnvironmentDeltas = {
  assetHost: CONFIGURED_ASSET_HOST,
  // The footer version string this deck prints. It deliberately differs
  // from the engine gem's own 0.20.0, and nothing in the code can derive a
  // deployment's version string, so it arrives as configuration.
  footerVersionPin: "0.0.0-synthetic",
  stylesheetRevision: {
    from: CONFIGURED_CSS_REVISION_FROM,
    to: CONFIGURED_CSS_REVISION_TO,
  },
  scriptIntegrity: CONFIGURED_SCRIPT_INTEGRITY,
  notFoundType: {
    id: String(CONFIGURED_NOT_FOUND_TYPE_ID),
    name: "BasicCs",
    classToken: "basic_c",
  },
  footerCardId: String(CONFIGURED_FOOTER_CARD_ID),
  footerTypeId: "50",
  footerTypeName: "HTML",
  allCardId: CONFIGURED_ALL_CARD_ID,
  layoutPointerId: CONFIGURED_LAYOUT_POINTER_ID,
  pointerTypeId: CONFIGURED_POINTER_TYPE_ID,
  mainCssUrl: `${CONFIGURED_ASSET_HOST}/files/${CONFIGURED_CSS_REVISION_TO}`,
  mainJsUrl: `${CONFIGURED_ASSET_HOST}/files/${CONFIGURED_MAIN_JS_FILE}`,
  logoUrl: `${CONFIGURED_ASSET_HOST}/files/${CONFIGURED_LOGO_FILE}`,
  faviconUrl: `${CONFIGURED_ASSET_HOST}/files/${CONFIGURED_FAVICON_FILE}`,
  siteTitleDefault: "Reference Deck",
  rootUrl: CONFIGURED_ROOT_URL,
  // The engine's own card_url origin (Ruby's Cardio.config.deck_origin,
  // no trailing slash) — the same site identity rootUrl carries with its
  // slash, fed to the render engine through setDeckEnvironment at boot.
  deckOrigin: CONFIGURED_DECK_ORIGIN,
  headScripts: CONFIGURED_HEAD_SCRIPTS,
  phantomType: {
    typeId: CONFIGURED_NOT_FOUND_TYPE_ID,
    typeName: "BasicCs",
    typeKey: "basic_c",
  },
};

/** The phantom type as the ENGINE's own config field takes it (the boot
 *  copies the deployment's phantomType onto render.phantomItemType). */
export const CONFIGURED_PHANTOM_ITEM_TYPE = {
  typeId: CONFIGURED_NOT_FOUND_TYPE_ID,
  typeName: "BasicCs",
  typeKey: "basic_c",
};