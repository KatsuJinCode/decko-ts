// Pins for the VIEW-INERT PRESET — the deployment constants a host installs,
// narrowed to FIVE fields.
//
// WHY FIVE, NOT SIX
//   The live preset `LIVE_DEPLOYMENT_CONSTANTS` carries six fields. The
//   sixth (`defaultHtmlViewNest: "content"`) is the only one that reaches
//   into view rendering; the other five act purely at the page shell (SRI
//   attributes, stylesheet revision digits, footer version, recaptcha site
//   key, root URL). The view-inert preset's rendered-output contract does not
//   require the sixth, and excluding it keeps the preset's blast radius inside
//   the page shell instead of moving view bytes.
//   Revisit only if the output contract changes.
//
// WHAT IT LOCKS
//   1. THE PRESET TYPE CAN EXPRESS THE SHRINK. `LIVE_DEPLOYMENT_CONSTANTS` is
//      `Omit<DeploymentFollowLiveConfig, "serializerEra">`; every remaining
//      field on it is optional, so an object that OMITS `defaultHtmlViewNest`
//      is still assignable. That is what makes the shrink a type-level
//      statement rather than a convention, and it is pinned by an
//      assignability check that stops compiling the day it stops being true.
//   2. THE SHRUNK ARM IS FIVE FIELDS, and `defaultHtmlViewNest` is not one of
//      them — by TYPE (the `@ts-expect-error` below) and by OBJECT
//      (`Object.hasOwn` false).
//   3. THE FIVE ARE THE PRESET'S FIVE, byte-equal. The shrunk arm is DERIVED
//      from `LIVE_DEPLOYMENT_CONSTANTS` by rest-destructuring, so the five
//      values cannot drift from the six they came from. This check is what
//      makes the derivation real rather than a copy-paste that can rot.
//   4. THE SIXTH REALLY IS OFF AT RUNTIME, not merely absent from the type.
//      `deploymentDefaultHtmlViewNest()` reads `undefined` under the shrunk
//      arm — the discriminating half. A type-only exclusion would still let a
//      hand-built six-field object through this seam; this assertion is what
//      proves the installed arm carries no nest value.
//   5. THE FIVE STILL ARM: SRI lands, the compiled-CSS revision rewrites the
//      stylesheet, footer/recaptcha/rootUrl read live.
//   6. THE SERIALIZER ERA STAYS FROZEN under the shrunk arm, by the same two
//      halves the live preset pins: the preset carries no `serializerEra`
//      own-property, and the discriminating frozen-form show-key cases still
//      hold.
import { describe, expect, it, afterEach } from "vitest";
import { Voo } from "../../../src/card/render/format.js";
import { applyScriptIntegrity } from "../../../src/card/render/page.js";
import { applyDeploymentCssRevision } from "../../../src/card/render/head-views.js";
import {
  VIEW_INERT_DEPLOYMENT_CONSTANTS,
  LIVE_DEPLOYMENT_CONSTANTS,
  type DeploymentFollowLiveConfig,
  deckoRootUrl,
  deploymentDefaultHtmlViewNest,
  footerDeckoVersion,
  recaptchaSiteKey,
  setDeploymentFollowLiveConfig,
  serializerFollowsLive,
} from "../../../src/card/render/deployment-follow-live-config.js";

// The remote script tags in the exact byte form page.ts's
// REMOTE_SCRIPT_TAGS emit, the form the SRI assertions run against.
const FROZEN_JQUERY =
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
const FROZEN_RAILS =
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`;

// A main-stylesheet URL whose revision digits match the ones the constants install.
const FROZEN_CSS =
  "https://production-storage.r1.cdn.objectstore.example/files/45514/9999999999.css";

/** The five fields the view-inert preset installs. Named here, not in the test
 *  bodies, so a sixth addition to the preset has to edit this list to stay
 *  green. */
const VIEW_INERT_FIELDS = [
  "scriptIntegrityBySrc",
  "mainStylesheetRevisionDigits",
  "footerDeckoVersion",
  "recaptchaSiteKey",
  "deckoRootUrl",
] as const;

afterEach(() => {
  setDeploymentFollowLiveConfig(undefined);
});

describe("view-inert preset: the live preset type CAN express five-without-the-sixth", () => {
  it("a hand-built five-field object is assignable to the live preset type", () => {
    // This is the confirmation the shrink rests on, pinned so it cannot rot
    // silently. `LIVE_DEPLOYMENT_CONSTANTS` is typed
    // `Omit<DeploymentFollowLiveConfig, "serializerEra">`, and on that type
    // `defaultHtmlViewNest` is OPTIONAL — so an object that never mentions it
    // is still a valid value of the live preset type. If a future change made
    // any of the six required, this line stops compiling and the shrink stops
    // being expressible without a type change.
    const handBuiltFive: Omit<DeploymentFollowLiveConfig, "serializerEra"> = {
      mainStylesheetRevisionDigits: "0000000001",
      footerDeckoVersion: "0.19.1",
      recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
      deckoRootUrl: "https://example.org/",
    };
    expect(Object.hasOwn(handBuiltFive, "defaultHtmlViewNest")).toBe(false);
    setDeploymentFollowLiveConfig(handBuiltFive);
    expect(footerDeckoVersion()).toBe("0.19.1");
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });

  it("the shrunk preset is itself a valid value of the live preset type", () => {
    const asLivePresetType: Omit<DeploymentFollowLiveConfig, "serializerEra"> =
      VIEW_INERT_DEPLOYMENT_CONSTANTS;
    expect(asLivePresetType.mainStylesheetRevisionDigits).toBe("0000000001");
  });
});

describe("view-inert preset: the preset is FIVE fields and the sixth is excluded", () => {
  it("its TYPE omits defaultHtmlViewNest as well as serializerEra", () => {
    // @ts-expect-error -- defaultHtmlViewNest is deliberately absent from the view-inert preset's type
    expect(VIEW_INERT_DEPLOYMENT_CONSTANTS.defaultHtmlViewNest).toBeUndefined();
    // @ts-expect-error -- serializerEra is deliberately absent from the view-inert preset's type
    expect(VIEW_INERT_DEPLOYMENT_CONSTANTS.serializerEra).toBeUndefined();
  });

  it("its OBJECT carries exactly the five fields and no sixth", () => {
    expect(Object.keys(VIEW_INERT_DEPLOYMENT_CONSTANTS).sort()).toEqual(
      [...VIEW_INERT_FIELDS].sort(),
    );
    expect(Object.hasOwn(VIEW_INERT_DEPLOYMENT_CONSTANTS, "defaultHtmlViewNest")).toBe(false);
    expect(Object.hasOwn(VIEW_INERT_DEPLOYMENT_CONSTANTS, "serializerEra")).toBe(false);
  });

  it("the five are the live preset's five, byte-equal (derived, not copied)", () => {
    // The shrink is a rest-destructure of LIVE_DEPLOYMENT_CONSTANTS, so the
    // five values cannot silently drift from the six they came from. If a
    // future update changes a value in the six, this fails until the
    // derived five follows — which it does automatically, by construction.
    for (const field of VIEW_INERT_FIELDS) {
      expect(VIEW_INERT_DEPLOYMENT_CONSTANTS[field]).toEqual(LIVE_DEPLOYMENT_CONSTANTS[field]);
    }
    // and the sixth is the one field where the live preset and the view-inert preset differ
    expect(LIVE_DEPLOYMENT_CONSTANTS.defaultHtmlViewNest).toBe("content");
  });
});

describe("view-inert preset: the sixth is OFF AT RUNTIME under the installed preset", () => {
  it("deploymentDefaultHtmlViewNest() reads undefined", () => {
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });

  it("and stays undefined for a deployment that spreads the preset", () => {
    setDeploymentFollowLiveConfig({ ...VIEW_INERT_DEPLOYMENT_CONSTANTS });
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });
});

describe("view-inert preset: the FIVE constants still arm", () => {
  it("SRI lands after crossorigin, before referrerpolicy", () => {
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
    expect(applyScriptIntegrity(`${FROZEN_JQUERY}\n${FROZEN_RAILS}`)).toBe(
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>\n` +
        `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
    );
  });

  it("the compiled-CSS revision rewrites the stylesheet, never the .js asset", () => {
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
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

  it("footer version, recaptcha key and rootUrl read live", () => {
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
    expect(footerDeckoVersion()).toBe("0.19.1");
    expect(recaptchaSiteKey()).toBe("6LSYNTHETICLIVEKEY00000000000000000000AA");
    expect(deckoRootUrl()).toBe("https://example.org/");
  });

  it("the 4-entry SRI map, one per remote CDN script src", () => {
    expect(Object.keys(VIEW_INERT_DEPLOYMENT_CONSTANTS.scriptIntegrityBySrc ?? {})).toEqual([
      "https://code.jquery.com/jquery-3.5.1.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js",
    ]);
  });
});

describe("view-inert preset: the serializer era stays FROZEN", () => {
  it("serializerFollowsLive() is false under the view-inert preset", () => {
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
    expect(serializerFollowsLive()).toBe(false);
  });

  it("a plain closed root STILL always-enrolls its requested view", () => {
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
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
    setDeploymentFollowLiveConfig(VIEW_INERT_DEPLOYMENT_CONSTANTS);
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
});
