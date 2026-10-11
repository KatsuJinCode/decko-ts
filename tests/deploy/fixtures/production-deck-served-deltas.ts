// The PRODUCTION MIGRATION DECK's served-environment deltas, as the test
// CONFIGURATION they now are.
//
// These values used to be module constants inside the shipped edge code, so
// every deployment of the engine served this one deck's identity. They are
// deployment configuration now (deploy/bunny-worker-src/bunny-edge-served-
// deltas.ts), empty by default, and the production migration deployment sets
// them explicitly in deploy/bunny-edge-trial-runbook.md (excluded from the
// export).
//
// The suites that pin this deck's SERVED BYTES import this fixture and hand
// it to the deck, exactly as a production deployment would hand it the same
// values through its environment. That is the point of the change: a test
// asserting a particular deck's chrome now says WHICH deck it configured,
// instead of relying on every other deck inheriting it by accident.
//
// What the fixture is NOT: a default. A test that wants the stock (unset)
// deltas imports EMPTY_SERVED_DELTAS — the state a deployment with no
// configuration serves, which carries no version rewrite, no corpus card
// ids and no private asset references.

import type { ServedEnvironmentDeltas } from "../../../deploy/bunny-worker-src/bunny-edge-served-deltas.js";

/** The asset host the production deck serves /files/ URLs from. */
export const PRODUCTION_ASSET_HOST =
  "https://source-deck-production-storage.r1.cdn.objectstore.example";

/** The compiled CSS revision the production deck stores vs. the revision it
 *  serves (the corpus row stores the older one). */
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
  // The version the production site prints, which is NOT the card gem's
  // 0.20.0 — a live-byte receipt, so it is configuration and not something
  // the engine derives.
  footerVersionPin: "0.19.1",
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
  siteTitleDefault: "SourceDeck",
  rootUrl: "https://source-deck.example/",
  // The engine's own card_url origin (Ruby's Cardio.config.deck_origin,
  // no trailing slash) — the same site identity rootUrl carries with its
  // slash, fed to the render engine through setDeckEnvironment at boot.
  deckOrigin: "https://source-deck.example",
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