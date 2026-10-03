// Pin for the deployment follow-live configuration (serializer-follow-live
// lane) — the graded environment emits the LIVE culturesmith deployment's
// serializer forms + head constants when it sets this config, and the
// UNSET default stays byte-identical to the frozen-corpus engine.
//
// WHAT IT LOCKS
//   1. DEFAULT (unset): the data-slot `show` key is emitted whenever the
//      show list is non-empty INCLUDING the requested view (the frozen-era
//      always-enroll form 3,693 corpus slots pin); the head constants are
//      untouched (no SRI, corpus attachment digits, card-gem version).
//   2. LIVE (serializerEra: "live"): the conditional show-key rule
//      (docs/serializer-spec-conditional-data-slot-show-key.md) — a plain
//      closed root whose show list names only the requested view OMITS the
//      key; a discussion open whose list also carries comment_box emits
//      show minus the requested view (["comment_box"]).
//   3. LIVE head constants: the SRI integrity attributes land on the CDN
//      remote script tags (after crossorigin, before referrerpolicy — live
//      head 12/12 pages); the compiled-CSS revision digits rewrite on
//      main-stylesheet attachment URLs only (the .js asset revision is NOT
//      touched — live serves 1768074298.js unchanged).
//   4. IDENTITY: unset again, every form returns exactly (afterEach
//      restores, so no other suite ever sees the config).
import { describe, expect, it, afterEach } from "vitest";
import { Voo } from "../../../src/card/render/format.js";
import { applyScriptIntegrity } from "../../../src/card/render/page.js";
import { applyDeploymentCssRevision } from "../../../src/card/render/head-views.js";
import {
  deckoRootUrl,
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

// The live head's byte-verbatim tags (live-check-71 12/12 pages;
// vm-staging-server.mjs derived constants).
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
        "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1786554352.css",
      ),
    ).toBe(
      "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1786554352.css",
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
    // The live *footer slot on every graded page carries
    // show:["content"] (the {{:footer|content}} nest's own optional
    // enrollment): the card-layout body's nests render parentless in the
    // port (processLayoutContent runs on the root format after renderView
    // restored this.voo) but they are NOT the view-lane root — Ruby's
    // layout nests render with a seated voo and the live serializer keeps
    // their enrollment. Same shape on the mod bar slots (show:["bar"]) and
    // Anyone Signed In (+description show:["lead"], +Dashboard
    // show:["content"], _user+*created/_user+*edited show:["bar"]).
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
    const parent = new Voo(undefined, "open", {});
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
    const parent = new Voo(undefined, "open", {});
    parent.processVisibility("show");
    // bar_bottom rides the render opts' show list (processed in
    // processVisibility, before the optional enrollment) - the Guns:open
    // content sub-render pins the emitted order ["bar_bottom","content"].
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
    setDeploymentFollowLiveConfig({ mainStylesheetRevisionDigits: "1790384218" });
    expect(
      applyDeploymentCssRevision(
        "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1786554352.css",
      ),
    ).toBe(
      "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1790384218.css",
    );
    // the script asset's revision is NOT the stylesheet's — untouched.
    expect(
      applyDeploymentCssRevision(
        "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/50617/1768074298.js",
      ),
    ).toBe(
      "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/50617/1768074298.js",
    );
    // the fog double-slash form (unset asset host) rewrites the same way.
    expect(
      applyDeploymentCssRevision("http://s3.amazonaws.com//files/45514/1786554352.css"),
    ).toBe("http://s3.amazonaws.com//files/45514/1790384218.css");
  });

  it("footer version + recaptcha site key read through the config", () => {
    setDeploymentFollowLiveConfig({
      footerDeckoVersion: "0.19.1",
      recaptchaSiteKey: "6LeRJb4UAAAAANqYxbHo_VwgJY9aWwieAp6493sW",
    });
    setDeploymentFollowLiveConfig({
      footerDeckoVersion: "0.19.1",
      recaptchaSiteKey: "6LeRJb4UAAAAANqYxbHo_VwgJY9aWwieAp6493sW",
      deckoRootUrl: "https://culturesmith.com/",
    });
    expect(footerDeckoVersion()).toBe("0.19.1");
    expect(recaptchaSiteKey()).toBe("6LeRJb4UAAAAANqYxbHo_VwgJY9aWwieAp6493sW");
    expect(deckoRootUrl()).toBe("https://culturesmith.com/");
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
