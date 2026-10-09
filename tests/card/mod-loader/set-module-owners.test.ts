// set-module-owners.test.ts — the set module that owns a view, as Ruby's
// method resolution picks it, for the cases the semantics census found
// owned by a different module:
//
//   - set modules are keyed by the anchor's CODENAME (set/pattern/base.rb
//     module_key, anchor_codenames): a Person-typed card whose type codename
//     is user belongs to Type::User; Self::Search belongs to the card whose
//     codename is search ("*search"), not to a card named "Search"; a self
//     anchor with no codename has no self module;
//   - a view defined in a nested file belongs to that file's module
//     (card-mod-account set/type/signup/views.rb :core);
//   - type modules that override a view own it (card-mod-list
//     set/type/link_list.rb and nest_list.rb :input; card-mod-script
//     set/abstract/00_script.rb and set/right/script.rb
//     :javascript_include_tag);
//   - the image html format includes File::HtmlFormat
//     (card-mod-carrierwave set/type/image/html_views.rb:2), so Type::File
//     owns :input and :preview_editor for images, and `preview` is a format
//     method, not a view.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "../render/render-test-storage.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { anchoredModuleCandidates } from "../../../src/card/render/set-keys-to-modules.js";

const loader = defaultDeckLoader();
const owner = (keys: string, view: string) => loader.viewChain(keys, view, "html")[0]?.setModule;

describe("owners that need no name environment", () => {
  it("link and nest lists own their :input override", () => {
    expect(owner("ALL TYPE-link_list", "input")).toBe("Type::LinkList");
    expect(owner("ALL TYPE-nest_list", "input")).toBe("Type::NestList");
  });
  it("script cards resolve :javascript_include_tag to Abstract::Script, +*script cards to Right::Script", () => {
    expect(owner("ALL TYPE-coffee_script", "javascript_include_tag")).toBe("Abstract::Script");
    expect(owner("ALL TYPE-java_script", "javascript_include_tag")).toBe("Abstract::Script");
    expect(owner("ALL RIGHT-Xscript", "javascript_include_tag")).toBe("Right::Script");
    expect(owner("ALL", "javascript_include_tag")).toBe("All::HeadJavascript");
  });
  it("image cards take :input and :preview_editor from Type::File and have no :preview view", () => {
    expect(owner("ALL TYPE-image", "input")).toBe("Type::File");
    expect(owner("ALL TYPE-image", "preview_editor")).toBe("Type::File");
    expect(loader.viewChain("ALL TYPE-image", "preview", "html")).toEqual([]);
    expect(owner("ALL TYPE-image", "core")).toBe("Type::Image::HtmlViews");
  });
});

describe("owners keyed by codename", () => {
  let s: RenderTestStorage | undefined;
  beforeAll(async () => {
    s = await createRenderTestStorage();
    await seedCard(s, { id: 2, name: "RichText" });
    await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype" });
    await seedCard(s, { id: 30, name: "Search", codename: "search_type", typeId: 5 });
    await seedCard(s, { id: 31, name: "*search", codename: "search" });
    await seedCard(s, { id: 40, name: "Person", codename: "user", typeId: 5 });
    await seedCard(s, { id: 50, name: "Plain Page" });
    await seedCard(s, { id: 60, name: "Sign up", codename: "signup", typeId: 5 });
    await seedCard(s, { id: 61, name: "account" });
    await seedCard(s, { id: 62, name: "*account", codename: "account" });
    s.fetcher.installNameEnvironment();
    await s.fetcher.warmLexicon([2, 5, 30, 31, 40, 50, 61, 62]);
  });
  afterAll(() => s?.close());

  it("a Person-typed card (type codename user) owns Type::User's :setup", () => {
    expect(owner("ALL TYPE-person", "setup")).toBe("Type::User");
  });
  it("Self::Search belongs to *search, not to the Search cardtype", () => {
    expect(owner("ALL SELF-Xsearch", "results_for_keyword")).toBe("Self::Search");
    expect(owner("ALL TYPE-cardtype SELF-search", "results_for_keyword")).toBeUndefined();
  });
  it("a self anchor with no codename has no self module", () => {
    expect(loader.viewChain("ALL SELF-plain_page", "core", "html").some((e) => e.setModule.startsWith("Self::"))).toBe(false);
  });
  it("a right anchor with no codename has no right module; its codename twin has", () => {
    // "account" (no codename) and "*account" (codename account): Ruby keys
    // Right::Account to the codename, so a card ending in +account is in no
    // right module, while one ending in +*account is in Right::Account.
    const right = (keys: string) =>
      loader.viewChain(keys, "token_expiry", "html").filter((e) => e.setModule.startsWith("Right::Account"));
    expect(right("ALL ALL_PLUS RIGHT-account")).toEqual([]);
    expect(right("ALL ALL_PLUS RIGHT-Xaccount").map((e) => e.setModule)).toEqual(["Right::Account::Views"]);
    expect(anchoredModuleCandidates("RIGHT-account")).toEqual({ candidates: [], paths: [], definitive: true });
  });
  it("signup :core belongs to Type::Signup's nested views module, keyed by the codename", () => {
    expect(owner("ALL TYPE-sign_up", "core")).toBe("Type::Signup::Views");
    expect(anchoredModuleCandidates("TYPE-sign_up")).toEqual({
      candidates: ["Type::Signup"],
      paths: ["type/signup"],
      definitive: true,
    });
  });
  it("an anchor the name environment cannot resolve is answered by spelling, unmemoized", () => {
    const answer = anchoredModuleCandidates("TYPE-never_seen_type");
    expect(answer.definitive).toBe(false);
    expect(answer.candidates).toContain("Type::NeverSeenType");
  });
});
