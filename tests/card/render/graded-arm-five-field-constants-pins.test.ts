// Pins for the GRADED ARM — the deployment constants the graded environment
// actually installs, narrowed to FIVE fields.
//
// WHY THIS FILE EXISTS
//   R1 landed `LIVE_DEPLOYMENT_CONSTANTS`, a six-field preset, because the
//   ruling named a sixth field (`defaultHtmlViewNest: "content"`) that the
//   mandate's own list of five does not. R1 then MEASURED which of the six
//   touches the view lane and found that the sixth is the ONLY one that does:
//
//     - `defaultHtmlViewNest` alone moved view-lane bytes: 28 of 78 sampled
//       view83 entries changed normalized bytes, and per-field isolation put
//       100% of that movement on this one field (r1-constants-arm-lane.md
//       step 3d, `tmp/r1-constants/measure/constant-isolation.json`). It
//       closed ZERO verdicts — all 28 were already FAIL.
//     - the other five (`scriptIntegrityBySrc`, `mainStylesheetRevisionDigits`,
//       `footerDeckoVersion`, `recaptchaSiteKey`, `deckoRootUrl`) moved ZERO
//       view-lane bytes, alone or together: same sha as UNSET.
//     - the five view-inert constants are what deliver the graded page flips:
//       16 of the 49 head/page entries FAIL->PASS, measured under the
//       constants alone with the serializer era frozen.
//
//   So the graded arm is the FIVE. `defaultHtmlViewNest` is excluded: it is the
//   smallest-blast-radius form, the corpus does not demand it, and it is the
//   only field that reaches into the lane R2 is concurrently normalizing.
//   Revisit only if grade evidence demands it.
//
// WHAT IT LOCKS
//   1. THE R1 TYPE CAN EXPRESS THE SHRINK. `LIVE_DEPLOYMENT_CONSTANTS` is
//      `Omit<DeploymentFollowLiveConfig, "serializerEra">`; every remaining
//      field on it is optional, so an object that OMITS `defaultHtmlViewNest`
//      is still assignable. That is what makes the shrink a type-level
//      statement rather than a convention, and it is pinned by an
//      assignability check that stops compiling the day it stops being true.
//   2. THE SHRUNK ARM IS FIVE FIELDS, and `defaultHtmlViewNest` is not one of
//      them — by TYPE (the `@ts-expect-error` below) and by OBJECT
//      (`Object.hasOwn` false).
//   3. THE FIVE ARE THE R1 FIVE, byte-equal. The shrunk arm is DERIVED from
//      `LIVE_DEPLOYMENT_CONSTANTS` by rest-destructuring, so the five values
//      cannot drift from the six they came from. This check is what makes the
//      derivation real rather than a copy-paste that can rot.
//   4. THE SIXTH REALLY IS OFF AT RUNTIME, not merely absent from the type.
//      `deploymentDefaultHtmlViewNest()` reads `undefined` under the shrunk
//      arm — the discriminating half. A type-only exclusion would still let a
//      hand-built six-field object through this seam; this assertion is what
//      proves the installed arm carries no nest value.
//   5. THE FIVE STILL ARM: SRI lands, the compiled-CSS revision rewrites the
//      stylesheet, footer/recaptcha/rootUrl read live.
//   6. THE SERIALIZER ERA STAYS FROZEN under the shrunk arm, by the same two
//      halves as R1's pin: the preset carries no `serializerEra` own-property,
//      and the discriminating frozen-form show-key cases still hold.
import { describe, expect, it, afterEach } from "vitest";
import { Voo } from "../../../src/card/render/format.js";
import { applyScriptIntegrity } from "../../../src/card/render/page.js";
import { applyDeploymentCssRevision } from "../../../src/card/render/head-views.js";
import {
  GRADED_ARM_DEPLOYMENT_CONSTANTS,
  LIVE_DEPLOYMENT_CONSTANTS,
  type DeploymentFollowLiveConfig,
  deckoRootUrl,
  deploymentDefaultHtmlViewNest,
  footerDeckoVersion,
  recaptchaSiteKey,
  setDeploymentFollowLiveConfig,
  serializerFollowsLive,
} from "../../../src/card/render/deployment-follow-live-config.js";

// The frozen capture-era remote script tags (page.ts REMOTE_SCRIPT_TAGS
// bytes, the form the corpus pins).
const FROZEN_JQUERY =
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
const FROZEN_RAILS =
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`;

// The frozen capture-era main-stylesheet attachment (the corpus's own digits).
const FROZEN_CSS =
  "https://production-storage.r1.cdn.objectstore.example/files/45514/1786554352.css";

/** The five fields the graded arm installs. Named here, not in the test bodies,
 *  so a sixth addition to the arm has to edit this list to stay green. */
const GRADED_ARM_FIELDS = [
  "scriptIntegrityBySrc",
  "mainStylesheetRevisionDigits",
  "footerDeckoVersion",
  "recaptchaSiteKey",
  "deckoRootUrl",
] as const;

afterEach(() => {
  setDeploymentFollowLiveConfig(undefined);
});

describe("graded arm: the R1 type CAN express five-without-the-sixth", () => {
  it("a hand-built five-field object is assignable to the R1 preset type", () => {
    // This is the confirmation the shrink rests on, pinned so it cannot rot
    // silently. `LIVE_DEPLOYMENT_CONSTANTS` is typed
    // `Omit<DeploymentFollowLiveConfig, "serializerEra">`, and on that type
    // `defaultHtmlViewNest` is OPTIONAL — so an object that never mentions it
    // is still a valid value of the R1 type. If a future change made any of
    // the six required, this line stops compiling and the shrink stops being
    // expressible without a type change.
    const handBuiltFive: Omit<DeploymentFollowLiveConfig, "serializerEra"> = {
      mainStylesheetRevisionDigits: "0000000001",
      footerDeckoVersion: "0.19.1",
      recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
      deckoRootUrl: "https://culturesmith.com/",
    };
    expect(Object.hasOwn(handBuiltFive, "defaultHtmlViewNest")).toBe(false);
    setDeploymentFollowLiveConfig(handBuiltFive);
    expect(footerDeckoVersion()).toBe("0.19.1");
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });

  it("the shrunk arm is itself a valid value of the R1 type", () => {
    const asR1Type: Omit<DeploymentFollowLiveConfig, "serializerEra"> =
      GRADED_ARM_DEPLOYMENT_CONSTANTS;
    expect(asR1Type.mainStylesheetRevisionDigits).toBe("0000000001");
  });
});

describe("graded arm: the preset is FIVE fields and the sixth is excluded", () => {
  it("its TYPE omits defaultHtmlViewNest as well as serializerEra", () => {
    // @ts-expect-error -- defaultHtmlViewNest is deliberately absent from the graded arm's type
    expect(GRADED_ARM_DEPLOYMENT_CONSTANTS.defaultHtmlViewNest).toBeUndefined();
    // @ts-expect-error -- serializerEra is deliberately absent from the graded arm's type
    expect(GRADED_ARM_DEPLOYMENT_CONSTANTS.serializerEra).toBeUndefined();
  });

  it("its OBJECT carries exactly the five fields and no sixth", () => {
    expect(Object.keys(GRADED_ARM_DEPLOYMENT_CONSTANTS).sort()).toEqual(
      [...GRADED_ARM_FIELDS].sort(),
    );
    expect(Object.hasOwn(GRADED_ARM_DEPLOYMENT_CONSTANTS, "defaultHtmlViewNest")).toBe(false);
    expect(Object.hasOwn(GRADED_ARM_DEPLOYMENT_CONSTANTS, "serializerEra")).toBe(false);
  });

  it("the five are the R1 five, byte-equal (derived, not copied)", () => {
    // The shrink is a rest-destructure of LIVE_DEPLOYMENT_CONSTANTS, so the
    // five values cannot silently drift from the six they came from. If a
    // future live-check updates a value in the six, this fails until the
    // derived five follows — which it does automatically, by construction.
    for (const field of GRADED_ARM_FIELDS) {
      expect(GRADED_ARM_DEPLOYMENT_CONSTANTS[field]).toEqual(LIVE_DEPLOYMENT_CONSTANTS[field]);
    }
    // and the sixth is the one that is genuinely different from the R1 preset
    expect(LIVE_DEPLOYMENT_CONSTANTS.defaultHtmlViewNest).toBe("content");
  });
});

describe("graded arm: the sixth is OFF AT RUNTIME under the installed arm", () => {
  it("deploymentDefaultHtmlViewNest() reads undefined", () => {
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });

  it("and stays undefined for a deployment that spreads the arm", () => {
    setDeploymentFollowLiveConfig({ ...GRADED_ARM_DEPLOYMENT_CONSTANTS });
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });
});

describe("graded arm: the FIVE constants still arm", () => {
  it("SRI lands after crossorigin, before referrerpolicy", () => {
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
    expect(applyScriptIntegrity(`${FROZEN_JQUERY}\n${FROZEN_RAILS}`)).toBe(
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>\n` +
        `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
    );
  });

  it("the compiled-CSS revision rewrites the stylesheet, never the .js asset", () => {
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
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
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
    expect(footerDeckoVersion()).toBe("0.19.1");
    expect(recaptchaSiteKey()).toBe("6LSYNTHETICLIVEKEY00000000000000000000AA");
    expect(deckoRootUrl()).toBe("https://culturesmith.com/");
  });

  it("the 4-entry SRI map, one per remote CDN script src", () => {
    expect(Object.keys(GRADED_ARM_DEPLOYMENT_CONSTANTS.scriptIntegrityBySrc ?? {})).toEqual([
      "https://code.jquery.com/jquery-3.5.1.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js",
    ]);
  });
});

describe("graded arm: the serializer era stays FROZEN", () => {
  it("serializerFollowsLive() is false under the graded arm", () => {
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
    expect(serializerFollowsLive()).toBe(false);
  });

  it("a plain closed root STILL always-enrolls its requested view", () => {
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
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
    setDeploymentFollowLiveConfig(GRADED_ARM_DEPLOYMENT_CONSTANTS);
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
