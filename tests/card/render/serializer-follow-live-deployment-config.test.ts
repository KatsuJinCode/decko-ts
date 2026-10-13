// Pin for the deployment follow-live configuration — when this config is
// set, the serializer + head constants follow the live deployment's forms;
// the UNSET default stays byte-identical to the pre-config engine output.
//
// WHAT IT LOCKS
//   1. DEFAULT (unset): the data-slot `show` key is emitted whenever the
//      show list is non-empty INCLUDING the requested view; the head
//      constants are untouched (no SRI, no attachment revision digits, no
//      card-gem version).
//   2. FOLLOW-LIVE (serializerEra: "live"): the conditional show-key rule
//       — a plain
//      closed root whose show list names only the requested view OMITS the
//      key; a discussion open whose list also carries comment_box emits
//      show minus the requested view (["comment_box"]).
//   3. FOLLOW-LIVE head constants: the SRI integrity attributes land on the
//      CDN remote script tags (after crossorigin, before referrerpolicy);
//      the compiled-CSS revision digits rewrite on main-stylesheet
//      attachment URLs only (the .js asset revision is NOT touched).
//   4. IDENTITY: unset again, every form returns exactly (afterEach
//      restores, so no other suite ever sees the config).
import { describe, expect, it, afterEach } from "vitest";
import { Voo } from "../../../src/card/render/format.js";
import { applyScriptIntegrity } from "../../../src/card/render/page.js";
import { applyDeploymentCssRevision } from "../../../src/card/render/head-views.js";
import {
  deckoRootUrl,
  deploymentDefaultHtmlViewNest,
  footerDeckoVersion,
  recaptchaSiteKey,
  setDeploymentFollowLiveConfig,
  serializerFollowsLive,
} from "../../../src/card/render/deployment-follow-live-config.js";

// The default remote script tags (page.ts REMOTE_SCRIPT_TAGS bytes, the
// unset-config form).
const FROZEN_JQUERY =
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`;
const FROZEN_RAILS =
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`;

// The live-deployment head's byte-verbatim SRI tags (the follow-live
// config's constants).
const LIVE_INTEGRITY = {
  "https://code.jquery.com/jquery-3.5.1.min.js":
    "sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=",
  "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js":
    "sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==",
  "https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js":
    "sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw==",
  "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js":
    "sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==",
};

afterEach(() => {
  setDeploymentFollowLiveConfig(undefined);
});

describe("deployment follow-live config: frozen default preserved", () => {
  it("unset: the data-slot show key always-enrolls the requested view", () => {
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

  it("unset: SRI/revision transforms are identity and the constants read undefined", () => {
    expect(applyScriptIntegrity(`${FROZEN_JQUERY}\n${FROZEN_RAILS}`)).toBe(
      `${FROZEN_JQUERY}\n${FROZEN_RAILS}`,
    );
    expect(
      applyDeploymentCssRevision(
        "https://production-storage.r1.cdn.objectstore.example/files/45514/9999999999.css",
      ),
    ).toBe(
      "https://production-storage.r1.cdn.objectstore.example/files/45514/9999999999.css",
    );
    expect(footerDeckoVersion()).toBeUndefined();
    expect(recaptchaSiteKey()).toBeUndefined();
  });
});

describe("deployment follow-live config: live serializer era", () => {
  it("a plain closed root whose show list names only its own view OMITS show", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const closed = new Voo(undefined, "closed", {}, true);
    closed.processVisibility("show");
    closed.hide("bar_middle");
    expect(closed.slotOptions()).toEqual({
      view: "closed",
      hide: ["bar_middle"],
    });
  });

  it("a discussion open root carries only its body's comment_box", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const open = new Voo(undefined, "open", {}, true);
    open.processVisibility("show");
    open.setViz("comment_box", "show");
    open.hide("bar_middle");
    expect(open.slotOptions()).toEqual({
      view: "open",
      show: ["comment_box"],
      hide: ["bar_middle"],
    });
  });

  it("a root content slot whose show list names only content OMITS show", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const content = new Voo(undefined, "content", {}, true);
    content.processVisibility("show");
    expect(content.slotOptions()).toEqual({ view: "content" });
  });

  it("a page-lane layout nest (parentless voo, not the view-lane root) KEEPS its own requested-view enrollment", () => {
    // The live serializer keeps a layout-body nest's own optional
    // show enrollment (e.g. the {{:footer|content}} nest's
    // show:["content"]): the card-layout body's nests render parentless
    // in the port (processLayoutContent runs on the root format after
    // renderView restored this.voo) but they are NOT the view-lane root
    // — Ruby's layout nests render with a seated voo and the serializer
    // keeps their enrollment.
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const footerNest = new Voo(undefined, "content", {});
    footerNest.processVisibility("show");
    expect(footerNest.slotOptions()).toEqual({
      view: "content",
      show: ["content"],
    });
  });

  it("a child nest keeps its optional-enrolled requested view (+tags|closed)", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const parent = new Voo(undefined, "open", {}, true);
    parent.processVisibility("show");
    const child = new Voo(parent, "closed", {});
    child.processVisibility("show");
    child.hide("bar_middle");
    expect(child.slotOptions()).toEqual({
      view: "closed",
      show: ["closed"],
      hide: ["bar_middle"],
    });
  });

  it("a child content sub-render drops the inherited open, keeps content last", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const parent = new Voo(undefined, "open", {}, true);
    parent.processVisibility("show");
    // bar_bottom rides the render opts' show list (processed in
    // processVisibility, before the optional enrollment) - the opts' show
    // list lands BEFORE the requested view in the emitted order
    // ["bar_bottom","content"].
    const child = new Voo(parent, "content", { show: "bar_bottom" });
    child.processVisibility("show");
    expect(child.slotOptions()).toEqual({
      view: "content",
      show: ["bar_bottom", "content"],
    });
  });

  it("a child nest keeps an inherited entry that names its own requested view", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    const parent = new Voo(undefined, "open", {}, true);
    parent.processVisibility("show");
    const child = new Voo(parent, "open", {});
    child.processVisibility("show");
    child.setViz("comment_box", "show");
    child.hide("bar_middle");
    expect(child.slotOptions()).toEqual({
      view: "open",
      show: ["open", "comment_box"],
      hide: ["bar_middle"],
    });
  });
});

describe("deployment follow-live config: live head constants", () => {
  it("SRI integrity lands after crossorigin, before referrerpolicy", () => {
    setDeploymentFollowLiveConfig({ scriptIntegrityBySrc: LIVE_INTEGRITY });
    const out = applyScriptIntegrity(`${FROZEN_JQUERY}\n${FROZEN_RAILS}`);
    expect(out).toBe(
      `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0="></script>\n` +
        `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" integrity="sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==" referrerpolicy="no-referrer"></script>`,
    );
  });

  it("a src without a configured integrity keeps its frozen tag bytes", () => {
    setDeploymentFollowLiveConfig({ scriptIntegrityBySrc: LIVE_INTEGRITY });
    const fontawesome =
      `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>`;
    expect(applyScriptIntegrity(fontawesome)).toBe(fontawesome);
  });

  it("the compiled-CSS revision rewrites on main-stylesheet URLs only", () => {
    setDeploymentFollowLiveConfig({ mainStylesheetRevisionDigits: "0000000001" });
    expect(
      applyDeploymentCssRevision(
        "https://production-storage.r1.cdn.objectstore.example/files/45514/9999999999.css",
      ),
    ).toBe(
      "https://production-storage.r1.cdn.objectstore.example/files/45514/0000000001.css",
    );
    // the script asset's revision is NOT the stylesheet's — untouched.
    expect(
      applyDeploymentCssRevision(
        "https://production-storage.r1.cdn.objectstore.example/files/50617/0000000002.js",
      ),
    ).toBe(
      "https://production-storage.r1.cdn.objectstore.example/files/50617/0000000002.js",
    );
    // the fog double-slash form (unset asset host) rewrites the same way.
    expect(
      applyDeploymentCssRevision("http://s3.amazonaws.com//files/45514/9999999999.css"),
    ).toBe("http://s3.amazonaws.com//files/45514/0000000001.css");
  });

  it("footer version + recaptcha site key read through the config", () => {
    setDeploymentFollowLiveConfig({
      footerDeckoVersion: "0.0.0-synthetic",
      recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
    });
    setDeploymentFollowLiveConfig({
      footerDeckoVersion: "0.0.0-synthetic",
      recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
      deckoRootUrl: "https://example.com/",
    });
    expect(footerDeckoVersion()).toBe("0.0.0-synthetic");
    expect(recaptchaSiteKey()).toBe("6LSYNTHETICLIVEKEY00000000000000000000AA");
    expect(deckoRootUrl()).toBe("https://example.com/");
  });

  it("the deployment default_html_view answers implicit-nest view resolution", () => {
    // The follow-live deployment configures default_html_view :content;
    // with it set, an implicit {{_self+*referred_to_by}}-style nest renders
    // as content-view. Unset = the railtie default (:titled).
    setDeploymentFollowLiveConfig({ defaultHtmlViewNest: "content" });
    expect(deploymentDefaultHtmlViewNest()).toBe("content");
    setDeploymentFollowLiveConfig(undefined);
    expect(deploymentDefaultHtmlViewNest()).toBeUndefined();
  });
});

describe("deployment follow-live config: unset restores exactly", () => {
  it("every form returns to the frozen bytes", () => {
    setDeploymentFollowLiveConfig({ serializerEra: "live" });
    setDeploymentFollowLiveConfig(undefined);
    expect(serializerFollowsLive()).toBe(false);
    const closed = new Voo(undefined, "closed", {});
    closed.setViz("closed", "show");
    expect(closed.slotOptions()).toEqual({
      view: "closed",
      show: ["closed"],
    });
  });
});
