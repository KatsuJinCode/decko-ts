// The deployment "follow live" configuration — the graded environment's
// LIVE deployment values (culturesmith.com, Decko v0.19.1 era; live-check-71
// 2026-10-03) the engine emits when a deployment sets them, while the UNSET
// default keeps every emission byte-identical to the frozen-corpus engine.
// Same contract as setDeploymentCloudAssetHost (close-71-with-live): a
// process-wide deployment setting the graded instruments apply before the
// first render; every field is independent and optional, and UNSET means
// "the pinned frozen-era form" — never a partial default.
//
// Two axes ride one config because one deployment sets both:
//
// 1. `serializerEra: "live"` — the live serializer's emission forms:
//    (a) the conditional data-slot `show` key
//        (docs/serializer-spec-conditional-data-slot-show-key.md: emit
//        `show` iff the slot's show-candidate list minus the requested
//        view is non-empty; when emitted, the list drops the requested
//        view itself — live 11 carry / 26 omit, 37/37 measured agreement),
//        applied at format.ts slotOptions();
//    (b) the live class-token order at the bar/accordion surfaces — haml
//        static classes first, the conditional/state token last, the
//        computed classy() output after the statics (prototype/lib/card/
//        view/classy.rb classy() = [classes, extra_classes].join, and the
//        haml templates place that output after their own static class
//        list). UNSET = the frozen-era always-enroll + classy-first forms
//        the frozen corpus pins (3,693 slots carry `show`; restoring
//        restore-w2-format BLOCKER C arithmetic: flipping the rule
//        ungated moves ~2,393 passing entries).
//
// 2. The head/body constants — the LIVE deployment's byte-verbatim values
//    (vm-staging-server.mjs derived constants; the edge-site-shell lane's
//    compiled-assets receipt):
//    - `scriptIntegrityBySrc`: SRI integrity attribute per remote script
//      src URL (jquery sha256, jquery-ujs/ace/select2 sha512 — live head,
//      12/12 pages), inserted into the emitted remote script tags;
//    - `mainStylesheetRevisionDigits`: the compiled-CSS attachment revision
//      component the live deployment serves (`/files/45514/1790384218.css`,
//      byte receipt vs the SassC compile 2026-09-26) — rewritten in the
//      main stylesheet tag and the decko.cssPath script variable, both of
//      which derive from the same *style asset output attachment;
//    - `footerDeckoVersion`: the footer credit version string the *version
//      codename renders ("Decko v0.19.1" live vs the card gem's "0.20.0");
//    - `recaptchaSiteKey`: the live env recaptcha site key the comment-box
//      form emits (live 6LeRJb4U... vs the capture-era 6Lc3c-Eo...).

export interface DeploymentFollowLiveConfig {
  serializerEra?: "live";
  scriptIntegrityBySrc?: Readonly<Record<string, string>>;
  mainStylesheetRevisionDigits?: string;
  footerDeckoVersion?: string;
  recaptchaSiteKey?: string;
  /** The live deployment's decko root URL (script_variables'
   *  decko.rootUrl -- live "https://culturesmith.com/"; the corpus
   *  pins the capture-era "/" form). */
  deckoRootUrl?: string;
  /** The deployment's `Cardio.config.default_html_view` (the value
   *  card-mod-format set/all/html.rb:17-19's default_nest_view reads for
   *  every nest WITHOUT an explicit view; railtie default :titled,
   *  mod/format.rb:2). The live deck configures :content — capture
   *  receipt: every live-wire page renders implicit child nests as
   *  content-view (blog.html latest_news-content-view), and the GRADED
   *  corpus's view lane agrees: children:open (recapture-raw-shard-000025)
   *  renders the implicit {{_self+*referred_to_by}} nest as content-view
   *  where the engine's railtie-default arm rendered titled-view. UNSET =
   *  the railtie default the bare-render capture pinned
   *  (r17-nest-default-view-probe.rb). */
  defaultHtmlViewNest?: string;
}

let config: DeploymentFollowLiveConfig | undefined;

export function setDeploymentFollowLiveConfig(
  next: DeploymentFollowLiveConfig | undefined,
): void {
  config = next;
}

export function getDeploymentFollowLiveConfig(): DeploymentFollowLiveConfig | undefined {
  return config;
}

/** True when the deployment set the live serializer emission era (the
 *  conditional show-key + the live class-token order). */
export function serializerFollowsLive(): boolean {
  return config?.serializerEra === "live";
}

/** The SRI integrity attribute value for a remote script src, or undefined
 *  when the deployment set none (emit the tag without integrity). */
export function scriptIntegrityFor(src: string): string | undefined {
  return config?.scriptIntegrityBySrc?.[src];
}

/** The live compiled-CSS revision digits, or undefined (keep the corpus
 *  attachment's own digits). */
export function mainStylesheetRevisionDigits(): string | undefined {
  return config?.mainStylesheetRevisionDigits;
}

/** The live footer version string, or undefined (keep the card gem's). */
export function footerDeckoVersion(): string | undefined {
  return config?.footerDeckoVersion;
}

/** The live recaptcha site key, or undefined (keep the capture-era key). */
export function recaptchaSiteKey(): string | undefined {
  return config?.recaptchaSiteKey;
}

/** The live decko root URL, or undefined (keep the capture-era "/" form). */
export function deckoRootUrl(): string | undefined {
  return config?.deckoRootUrl;
}

/** The deployment's default_html_view value, or undefined (the railtie
 *  default :titled the bare-render capture pinned). Read through
 *  RenderEngine.defaultHtmlViewConfig AFTER the page lane's own
 *  pageConfigActive arm. */
export function deploymentDefaultHtmlViewNest(): string | undefined {
  return config?.defaultHtmlViewNest;
}
