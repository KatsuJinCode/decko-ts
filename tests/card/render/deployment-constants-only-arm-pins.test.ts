// Pins for the DEPLOYMENT CONSTANTS-ONLY arm — the deployment head/body
// constants, armed through the existing setDeploymentFollowLiveConfig seam
// WITHOUT the live serializer era.
//
// WHY THIS FILE EXISTS
//   The follow-live config carries two INDEPENDENT axes on one object: the
//   live serializer era (the conditional data-slot `show` key + the live
//   class-token order) and the live head/body deployment constants (SRI,
//   compiled-CSS revision digits, footer version, recaptcha site key, decko
//   rootUrl, default_html_view). This arm enables the SECOND without the
//   FIRST.
//
//   The two axes have opposite blast radii, and the difference is the whole
//   point of the split:
//     - the constants move the page-lane head entries, a deployment
//       property (the deployment serves the live site; the version
//       constants must match it);
//     - the serializer era would move the frozen-era view-lane entries RED
//       — those entries pin the frozen-era emission form.
//
//   So "arm the constants" must be expressible as an arm that CANNOT reach
//   the serializer era. That is what LIVE_DEPLOYMENT_CONSTANTS is: a preset
//   whose TYPE omits `serializerEra`, so a deployment that spreads it arms
//   the constants and provably not the era. This file pins both halves —
//   the constants land, the era stays frozen — because an arm that only
//   pinned the first would pass while crating the view lane.
//
// WHAT IT LOCKS
//   1. DEFAULT OFF: with no config set, every constant reads undefined, the
//      byte transforms are identity, and the data-slot `show` key
//      always-enrolls the requested view (the frozen form).
//   2. THE PRESET ARMS THE CONSTANTS: SRI lands after crossorigin/before
//      referrerpolicy on the 4 CDN scripts; the compiled-CSS revision
//      rewrites the 10-digit main-stylesheet component (and leaves the .js
//      asset revision alone); footer 0.19.1; the recaptcha key; the rootUrl;
//      default_html_view content.
//   3. THE SERIALIZER STAYS FROZEN under that arm — the discriminating
//      half: `serializerFollowsLive()` is false, a plain closed root still
//      always-enrolls `show:["closed"]` (the live era OMITS the key there),
//      and a discussion open still carries the full `["open","comment_box"]`
//      list (the live era drops the requested view to `["comment_box"]`).
//   4. THE SPLIT IS TYPE-LEVEL: the preset is declared
//      `Omit<DeploymentFollowLiveConfig, "serializerEra">`, so no deployment
//      can reach the era by spreading it.
//   5. unset again restores every frozen form (afterEach unbinds the config
//      so no other suite ever sees it).
import { describe, expect, it, afterEach } from "vitest";
import { Voo } from "../../../src/card/render/format.js";
import { applyScriptIntegrity } from "../../../src/card/render/page.js";
import { applyDeploymentCssRevision } from "../../../src/card/render/head-views.js";
import {
  LIVE_DEPLOYMENT_CONSTANTS,
  type DeploymentFollowLiveConfig,
  deckoRootUrl,
  deploymentDefaultHtmlViewNest,
  footerDeckoVersion,
  recaptchaSiteKey,
  setDeploymentFollowLiveConfig,
  serializerFollowsLive,
} from "../../../src/card/render/deployment-follow-live-config.js";

// The frozen remote script tags (page.ts REMOTE_SCRIPT_TAGS bytes).
const FROZEN_JQUERY =
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
const FROZEN_RAILS =
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`;

// The frozen main-stylesheet attachment.
const FROZEN_CSS =
  "https://production-storage.r1.cdn.objectstore.example/files/45514/9999999999.css";

afterEach(() => {
  setDeploymentFollowLiveConfig(undefined);
});

describe("deployment constants-only arm: default OFF", () => {
  it("unset: every constant reads undefined and the byte transforms are identity", () => {
    setDeploymentFollowLiveConfig(undefined);
    expect(footerDeckoVersion()).toBeUndefined();
    expect(recaptchaSiteKey()).toBeUndefined();
    expect(deckoRootUrl()).toBeUndefined();
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
    expect(applyScriptIntegrity(`${FROZEN_JQUERY}\n${FROZEN_RAILS}`)).toBe(
      `${FROZEN_JQUERY}\n${FROZEN_RAILS}`,
    );
    expect(applyDeploymentCssRevision(FROZEN_CSS)).toBe(FROZEN_CSS);
  });

  it("unset: the data-slot show key always-enrolls the requested view (frozen form)", () => {
    setDeploymentFollowLiveConfig(undefined);
    expect(serializerFollowsLive()).toBe(false);
    const closed = new Voo(undefined, "closed", {});
    closed.setViz("closed", "show");
    closed.hide("bar_middle");
    expect(closed.slotOptions()).toEqual({
      view: "closed",
      show: ["closed"],
      hide: ["bar_middle"],
    });
  });
});

describe("deployment constants-only arm: the preset arms the constants", () => {
  it("the preset carries the live SRI map, css revision, footer, recaptcha key and rootUrl", () => {
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    expect(LIVE_DEPLOYMENT_CONSTANTS.mainStylesheetRevisionDigits).toBe("0000000001");
    expect(LIVE_DEPLOYMENT_CONSTANTS.footerDeckoVersion).toBe("0.19.1");
    expect(LIVE_DEPLOYMENT_CONSTANTS.recaptchaSiteKey).toBe(
      "6LSYNTHETICLIVEKEY00000000000000000000AA",
    );
    expect(LIVE_DEPLOYMENT_CONSTANTS.deckoRootUrl).toBe("https://culturesmith.com/");
    expect(LIVE_DEPLOYMENT_CONSTANTS.defaultHtmlViewNest).toBe("content");
    // the 4-entry SRI map, one per remote CDN script src
    expect(Object.keys(LIVE_DEPLOYMENT_CONSTANTS.scriptIntegrityBySrc ?? {})).toEqual([
      "https://code.jquery.com/jquery-3.5.1.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js",
    ]);
  });

  it("SRI lands after crossorigin, before referrerpolicy", () => {
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    expect(applyScriptIntegrity(`${FROZEN_JQUERY}\n${FROZEN_RAILS}`)).toBe(
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>\n` +
        `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
    );
  });

  it("the compiled-CSS revision rewrites the stylesheet only, never the .js asset", () => {
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    expect(applyDeploymentCssRevision(FROZEN_CSS)).toBe(
      "https://production-storage.r1.cdn.objectstore.example/files/45514/0000000001.css",
    );
    expect(
      applyDeploymentCssRevision(
        "https://production-storage.r1.cdn.objectstore.example/files/50617/0000000002.js",
      ),
    ).toBe(
      "https://production-storage.r1.cdn.objectstore.example/files/50617/0000000002.js",
    );
  });

  it("footer version, recaptcha key, rootUrl and default_html_view read live", () => {
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    expect(footerDeckoVersion()).toBe("0.19.1");
    expect(recaptchaSiteKey()).toBe("6LSYNTHETICLIVEKEY00000000000000000000AA");
    expect(deckoRootUrl()).toBe("https://culturesmith.com/");
    expect(deploymentDefaultHtmlViewNest()).toBe("content");
  });
});

describe("deployment constants-only arm: the serializer era stays FROZEN", () => {
  it("serializerFollowsLive() is false under the constants arm", () => {
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    expect(serializerFollowsLive()).toBe(false);
  });

  it("a plain closed root STILL always-enrolls its requested view (the live era would omit it)", () => {
    // The live era's discriminating case (serializer-follow-live
    // deployment-config.test.ts:88-98): a closed root whose show list names
    // only its own view emits NO show key at all. Under the constants-only
    // arm that omission must NOT happen — the frozen emission form depends
    // on the always-enroll behavior.
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    const closed = new Voo(undefined, "closed", {}, true);
    closed.processVisibility("show");
    closed.hide("bar_middle");
    expect(closed.slotOptions()).toEqual({
      view: "closed",
      show: ["closed"],
      hide: ["bar_middle"],
    });
  });

  it("a discussion open root STILL carries its own requested view in the show list", () => {
    // The live era drops the requested view from a discussion's show list
    // (["open","comment_box"] -> ["comment_box"]); the frozen form keeps it.
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    const open = new Voo(undefined, "open", {}, true);
    open.processVisibility("show");
    open.setViz("comment_box", "show");
    open.hide("bar_middle");
    expect(open.slotOptions()).toEqual({
      view: "open",
      show: ["open", "comment_box"],
      hide: ["bar_middle"],
    });
  });

  it("a root content slot STILL always-enrolls content (the live era would omit it)", () => {
    setDeploymentFollowLiveConfig(LIVE_DEPLOYMENT_CONSTANTS);
    const content = new Voo(undefined, "content", {}, true);
    content.processVisibility("show");
    expect(content.slotOptions()).toEqual({ view: "content", show: ["content"] });
  });
});

describe("deployment constants-only arm: the split is type-level", () => {
  it("the preset's type omits serializerEra, and the preset object carries no era key", () => {
    // Two halves of the same guarantee. The TYPE half: the annotation below
    // is `Omit<…, "serializerEra">`, so a deployment that spreads the preset
    // cannot reach the era — the compiler rejects the access, which the
    // directive on the next line pins. The RUNTIME half: the preset OBJECT
    // itself has no `serializerEra` own-property, so the arm stays constants-
    // only even if a caller casts its way past the type.
    const preset: Omit<DeploymentFollowLiveConfig, "serializerEra"> = LIVE_DEPLOYMENT_CONSTANTS;
    // @ts-expect-error -- serializerEra is deliberately absent from the preset type
    expect(preset.serializerEra).toBeUndefined();
    expect(Object.hasOwn(preset, "serializerEra")).toBe(false);
    // The arm a deployment actually installs: constants only, no era key.
    setDeploymentFollowLiveConfig({ ...LIVE_DEPLOYMENT_CONSTANTS });
    expect(serializerFollowsLive()).toBe(false);
    expect(footerDeckoVersion()).toBe("0.19.1");
  });
});
