// Served-environment deltas for the production migration deck, packaged as
// test configuration.
//
// The edge code itself carries no deck's identity. These values once lived
// as module constants in that code, which forced every engine deployment to
// serve this one deck; they are read from the deployment environment now
// (deploy/bunny-worker-src/bunny-edge-served-deltas.ts), empty by default,
// and deploy/bunny-edge-deployment-runbook.md documents how a deployment
// supplies them.
//
// The suites that pin this deck's served output import this fixture and
// hand it to the engine through its environment, exactly as a production
// deployment would. A test asserting a particular deck's chrome therefore
// names the deck it configured, rather than leaning on every deck silently
// inheriting the same identity.
//
// The fixture is not a default: a test that wants the stock (unset) state
// imports EMPTY_SERVED_DELTAS — the configuration-free state, which serves
// no version rewrite, no foreign card ids and no outside asset references.

import type { ServedEnvironmentDeltas } from "../../../deploy/bunny-worker-src/bunny-edge-served-deltas.js";

/** The asset host the production deck serves /files/ URLs from. */
export const PRODUCTION_ASSET_HOST =
  "https://production-storage.r1.cdn.objectstore.example";

/** The two compiled-CSS revisions of the production deck: the revision its
 *  own database records (the older one) and the revision its pages actually
 *  serve (the newer one). The edge rewrites the recorded value to the
 *  served one. */
export const PRODUCTION_CSS_REVISION_FROM = "51201/1610000001.css";
export const PRODUCTION_CSS_REVISION_TO = "51201/1610000002.css";

/** The remote script tags the production deck's error chrome carries, with
 *  the SRI hashes that deployment's CDN requires — configuration, because a
 *  hash belongs to the file that deployment serves and cannot be derived
 *  here. */
export const PRODUCTION_HEAD_SCRIPTS = [
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous" integrity="sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw=="></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" integrity="sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==" referrerpolicy="no-referrer"></script>`,
  `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>`,
];

/** The SRI rewrite pairs the production deck's page path applies to the
 *  engine's own pinned remote-script manifest. */
export const PRODUCTION_SCRIPT_INTEGRITY = [
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

/** The whole production deck's served configuration, in the shape the edge
 *  reads from its environment. */
export const PRODUCTION_DECK_SERVED_DELTAS: ServedEnvironmentDeltas = {
  assetHost: PRODUCTION_ASSET_HOST,
  // The footer version string this deck prints. It deliberately differs
  // from the engine gem's own 0.20.0, and nothing in the code can derive a
  // deployment's version string, so it arrives as configuration.
  footerVersionPin: "0.0.0-synthetic",
  stylesheetRevision: {
    from: PRODUCTION_CSS_REVISION_FROM,
    to: PRODUCTION_CSS_REVISION_TO,
  },
  scriptIntegrity: PRODUCTION_SCRIPT_INTEGRITY,
  notFoundType: { id: "72281", name: "BasicCs", classToken: "basic_c" },
  footerCardId: "72749",
  footerTypeId: "50",
  footerTypeName: "HTML",
  allCardId: 9274,
  layoutPointerId: 9255,
  pointerTypeId: 94843,
  mainCssUrl: `${PRODUCTION_ASSET_HOST}/files/${PRODUCTION_CSS_REVISION_TO}`,
  mainJsUrl: `${PRODUCTION_ASSET_HOST}/files/60311/1610000003.js`,
  logoUrl: `${PRODUCTION_ASSET_HOST}/files/61002/1610000004-small.jpg`,
  faviconUrl: `${PRODUCTION_ASSET_HOST}/files/61003/1610000005-small.jpg`,
  siteTitleDefault: "Reference Deck",
  rootUrl: "https://deck.example/",
  // The engine's own card_url origin (Ruby's Cardio.config.deck_origin,
  // no trailing slash) — the same site identity rootUrl carries with its
  // slash, fed to the render engine through setDeckEnvironment at boot.
  deckOrigin: "https://deck.example",
  headScripts: PRODUCTION_HEAD_SCRIPTS,
  phantomType: { typeId: 72281, typeName: "BasicCs", typeKey: "basic_c" },
};

/** The phantom type as the ENGINE's own config field takes it (the boot
 *  copies the deployment's phantomType onto render.phantomItemType). */
export const PRODUCTION_PHANTOM_ITEM_TYPE = {
  typeId: 72281,
  typeName: "BasicCs",
  typeKey: "basic_c",
};