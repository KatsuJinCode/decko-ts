// Deployment emission settings — the head/body byte values and the serializer
// emission forms a deployment can pin, applied process-wide before the first
// render. Every field is independent and optional: UNSET means "keep the
// built-in form", never a partial default. Same contract as
// setDeploymentCloudAssetHost.
//
// The engine carries two generations of emission forms. UNSET emits the older
// generation; a deployment that opts in gets the newer one. The two are
// deliberately not one flag, because they differ in kind — the constants
// describe the deployment being served, the serializer era describes the
// output contract every consumer is written against.
//
// Two axes ride one config because one deployment sets both:
//
// 1. `serializerEra: "live"` — the newer serializer emission forms:
//    (a) the conditional data-slot `show` key (emit `show` iff the slot's
//        show-candidate list minus the requested view is non-empty; when
//        emitted, the list drops the requested view itself), applied at
//        format.ts slotOptions();
//    (b) the newer class-token order at the bar/accordion surfaces — haml
//        static classes first, the conditional/state token last, the
//        computed classy() output after the statics (card 1.110.0 lib/card/
//        view/classy.rb classy() = [classes, extra_classes].join, and the
//        haml templates place that output after their own static class
//        list). UNSET = the older always-enroll + classy-first forms.
//
// This is the high-blast-radius axis: flipping (a) moves the `show`
// attribute on every slot, not on a few. Nothing installs it implicitly.
//
// 2. The head/body constants — byte-verbatim deployment values:
//    - `scriptIntegrityBySrc`: SRI integrity attribute per remote script
//      src URL (jquery sha256, jquery-ujs/ace/select2 sha512), inserted into
//      the emitted remote script tags;
//    - `mainStylesheetRevisionDigits`: the compiled-CSS attachment revision
//      component the deployment serves — rewritten in the main stylesheet
//      tag and the decko.cssPath script variable, both of which derive from
//      the same *style asset output attachment;
//    - `footerDeckoVersion`: the footer credit version string the *version
//      codename renders (the deployment's own version vs the card gem's);
//    - `recaptchaSiteKey`: the site key the comment-box form emits.
//
// The four above change bytes in the served page head or footer, never the
// shape of a rendered view — that is what makes them safe to bundle as one
// preset. `deckoRootUrl` (below) likewise only rewrites origin strings.
// `defaultHtmlViewNest` is the one member of this config that is NOT
// view-inert; it is documented with the arm that excludes it.

export interface DeploymentFollowLiveConfig {
  serializerEra?: "live";
  scriptIntegrityBySrc?: Readonly<Record<string, string>>;
  mainStylesheetRevisionDigits?: string;
  footerDeckoVersion?: string;
  recaptchaSiteKey?: string;
  /** The deployment's decko root URL (script_variables' decko.rootUrl). */
  deckoRootUrl?: string;
  /** The deployment's `Cardio.config.default_html_view` (the value
   *  card-mod-format set/all/html.rb:17-19's default_nest_view reads for
   *  every nest WITHOUT an explicit view; railtie default :titled,
   *  mod/format.rb:2). A deck that configures :content renders every
   *  implicit child nest as content-view — including the implicit
   *  {{_self+*referred_to_by}} nest, where the UNSET arm renders
   *  titled-view instead. UNSET = the railtie default. */
  defaultHtmlViewNest?: string;
}

let config: DeploymentFollowLiveConfig | undefined;

/** The head/body constants as a preset that CANNOT arm the serializer era.
 *
 *  THE VALUES BELOW ARE PLACEHOLDERS. Every one of them is a property a real
 *  deployment sets to match itself — an SRI digest per remote script, the
 *  compiled-CSS revision it serves, the version string in its footer credit,
 *  its reCAPTCHA site key, its own root URL, its `default_html_view`. A
 *  deployment installs them with its own values; the ones here are the
 *  documented defaults for a deck that has not chosen otherwise, not a
 *  capture of anyone's site. Nothing installs this preset implicitly, and no
 *  host in this repository (worker.ts, deploy/, the reference-harness
 *  adapters) does — every render path in the tree runs with the config
 *  UNSET.
 *
 *  WHY A PRESET. The config object carries two independent axes — the
 *  serializer era (the conditional data-slot `show` key + the class-token
 *  order) and the head/body deployment constants — and the two differ in
 *  kind. The constants are a DEPLOYMENT property: they describe the
 *  deployment being served, so a deployment must set them to match itself.
 *  The serializer era is an OUTPUT-CONTRACT property: it changes the shape
 *  of every rendered slot, and existing consumers are written against the
 *  form they were built for. A deployment that wants the first must not
 *  reach the second by accident, so the preset's TYPE omits `serializerEra`:
 *  spreading it arms the constants and provably not the era.
 *
 *  USAGE — the whole arm, default OFF until a deployment installs it:
 *      setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
 *  A deployment that ALSO wants the newer serializer era states that
 *  explicitly and separately (`{...LIVE_DEPLOYMENT_CONSTANTS, serializerEra:
 *  "live"}`) — a deliberate contract change, not a deployment detail. */
export const LIVE_DEPLOYMENT_CONSTANTS: Omit<DeploymentFollowLiveConfig, "serializerEra"> = {
  scriptIntegrityBySrc: {
    "https://code.jquery.com/jquery-3.5.1.min.js":
      "sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=",
    "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js":
      "sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==",
    "https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js":
      "sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw==",
    "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js":
      "sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==",
  },
  mainStylesheetRevisionDigits: "0000000001",
  footerDeckoVersion: "0.0.0-synthetic",
  recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
  deckoRootUrl: "https://example.org/",
  defaultHtmlViewNest: "content",
};

/** The view-inert arm — the five deployment constants a host installs,
 *  WITHOUT `defaultHtmlViewNest`.
 *
 *  DERIVED FROM `LIVE_DEPLOYMENT_CONSTANTS` BY REST-DESTRUCTURE, not copied.
 *  The five values therefore cannot drift from the six they came from: a
 *  future update that changes a value in the six is picked up here
 *  automatically, and one that changes a value the six does not carry cannot
 *  be picked up at all, which is the point.
 *
 *  WHY THE SIXTH IS EXCLUDED. Measured per field, in isolation:
 *    - `defaultHtmlViewNest` is the ONLY one of the six that moves rendered
 *      view bytes. Isolating each field put 100% of the observed view
 *      movement on it alone; the other five moved zero view bytes, alone or
 *      together.
 *    - The movement it caused fixed nothing: every entry it moved already
 *      matched before it moved. No consumer demands it.
 *    - The five view-INERT constants are what a host actually needs; the
 *      head/page differences they account for resolve with the serializer
 *      era frozen.
 *
 *  So this is the smallest-blast-radius form that still arms everything
 *  worth arming, and it keeps this arm out of the view surface entirely.
 *  REVISIT ONLY IF A CONSUMER DEMANDS IT: the exclusion is a measured
 *  judgement about the output as it stands, not a permanent claim that the
 *  sixth field is wrong.
 *
 *  The TYPE omits BOTH `serializerEra` and `defaultHtmlViewNest`, so both
 *  exclusions are compile-enforced rather than conventional.
 *
 *  USAGE — default OFF until a deployment installs it:
 *      setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
 */
const {
  // The one field this preset excludes. Bound then discarded, so the rest
  // destructures into exactly the five.
  defaultHtmlViewNest: _excludedDefaultHtmlViewNest,
  ...viewInertConstants
} = LIVE_DEPLOYMENT_CONSTANTS;

export const VIEW_INERT_DEPLOYMENT_CONSTANTS: Omit<
  DeploymentFollowLiveConfig,
  "serializerEra" | "defaultHtmlViewNest"
> = viewInertConstants;

export function setDeploymentFollowLiveConfig(
  next: DeploymentFollowLiveConfig | undefined,
): void {
  config = next;
}

export function getDeploymentFollowLiveConfig(): DeploymentFollowLiveConfig | undefined {
  return config;
}

/** True when the deployment set the newer serializer emission era (the
 *  conditional show-key + the newer class-token order). */
export function serializerFollowsLive(): boolean {
  return config?.serializerEra === "live";
}

/** The SRI integrity attribute value for a remote script src, or undefined
 *  when the deployment set none (emit the tag without integrity). */
export function scriptIntegrityFor(src: string): string | undefined {
  return config?.scriptIntegrityBySrc?.[src];
}

/** The compiled-CSS revision digits, or undefined (keep the built-in ones). */
export function mainStylesheetRevisionDigits(): string | undefined {
  return config?.mainStylesheetRevisionDigits;
}

/** The live footer version string, or undefined (keep the card gem's). */
export function footerDeckoVersion(): string | undefined {
  return config?.footerDeckoVersion;
}

/** The deployment's recaptcha site key, or undefined (the host's render-side
 *  recaptcha config decides; there is no built-in fallback key). */
export function recaptchaSiteKey(): string | undefined {
  return config?.recaptchaSiteKey;
}

/** The deployment's decko root URL, or undefined (serve origin-relative
 *  URLs). */
export function deckoRootUrl(): string | undefined {
  return config?.deckoRootUrl;
}

/** The deployment's default_html_view value, or undefined (the railtie
 *  default :titled). Read through RenderEngine.defaultHtmlViewConfig AFTER
 *  the page surface's own pageConfigActive arm. */
export function deploymentDefaultHtmlViewNest(): string | undefined {
  return config?.defaultHtmlViewNest;
}
