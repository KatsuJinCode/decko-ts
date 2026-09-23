// The card-mod-api_key port: structural + behavioral tests for the
// manifest registrations, the view-config table, and the headlessly-
// portable HTML/JSON view bodies.
//
// Tested:
//   1. registration: the two set files load into the right pattern's
//      basket (cardModHelp's load() / kindOfSetPath shape) with the
//      expected setModules, view names, and view configs (unknown: /
//      perms:) - mod-registration.test.ts proves the same wiring for
//      card-mod-help; this file pins the api_key-specific shape.
//   2. event name preservation: the form's hidden trigger input name
//      matches the event :generate_api_key's Ruby name (api_key.rb:4-6).
//   3. locale strings inlined from config/locales/en.yml: the labels
//      the views reference (api_key_label, api_key_generate, etc.) match
//      the en.yml byte-for-byte.
//   4. the :token JSON view returns the documented shape `{"token":
//      <encoded>}` (api_key.rb:63-67); the encoded value is the
//      sentinel because the JWT path requires a live Rails runtime.
//   5. the :token_link view's href encodes format: :json + view: :token
//      (api_key.rb:77-79).
//   6. the :generate_button view's form carries the hidden trigger input
//      + a btn-primary submit (api_key.rb:85-94).
//   7. the :current view renders a readonly text input with the api_key
//      content (api_key.rb:72 + current.haml).
//   8. the :core view (HAML template) wraps the top + buttons sections
//      and skips the top when content is blank (api_key.rb:70-71 +
//      core.haml).
//   9. the :api_key view (account.rb) nests the +*api_key child card
//      with view :core (account.rb:5-9).
//
// NOT tested (honest remainder):
//   - render-time integration (the help-mod-integration A/B pattern):
//     the help mod's render path is pinned against an oracle capture;
//     card-mod-api_key has no captured oracle fixture (the T6 verdict
//     notes 1/7 html views covered and 0 mod-specific views covered -
//     the api_key gem is rendering-only and the live deck never had a
//     captured `*api key` test card; structural tests are the bar).
//   - the save/validate event cycle (event :generate_api_key, event
//     :validate_api_key), the Card::Auth::ApiKey mixin methods, the
//     CardController::ApiKey mixin methods, the JWT token encoding, the
//     include_set Abstract::AccountField directive: these are
//     persistence / side effects / Rails-runtime deps with no TS
//     surface.

import { describe, it, expect, afterEach } from "vitest";
import { ModLoader, type DeckoModManifest } from "../../../src/card/mod-loader.js";
import cardModApiKey from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";
import type { ViewContext, ViewFn } from "../../../src/card/render/format.js";

// ---------------------------------------------------------------------------
// shared: read every view body the manifest registers, bypassing the mod
// loader's live-record mutation. The tests below call these bodies
// directly with a minimal ViewContext (just the card + a passthrough
// renderView/nest), and assert the byte shape the Ruby HAML / set DSL
// pins.
// ---------------------------------------------------------------------------

interface MinimalCard {
  name: { s: string };
  dbContent: string;
}

interface MinimalVoo {
  readonly requestedView: string;
  readonly opts: Record<string, unknown>;
  readonly viz: Map<string, "show" | "hide">;
  readonly classUps: Map<string, string>;
  classUp(klass: string, classier: string): void;
  classy(...classes: (string | string[])[]): string;
}

class StubVoo implements MinimalVoo {
  readonly requestedView: string;
  readonly opts: Record<string, unknown>;
  readonly viz = new Map<string, "show" | "hide">();
  readonly classUps = new Map<string, string>();
  constructor(requestedView: string, opts: Record<string, unknown> = {}) {
    this.requestedView = requestedView;
    this.opts = opts;
  }
  classUp(klass: string, classier: string): void {
    this.classUps.set(klass, [this.classUps.get(klass), classier].filter((s) => s !== undefined && s !== "").join(" "));
  }
  classy(...classes: (string | string[])[]): string {
    const flat: string[] = [];
    for (const group of classes) {
      if (Array.isArray(group)) flat.push(...group);
      else if (group !== "") flat.push(group);
    }
    return flat.filter((s) => s !== "").join(" ");
  }
}

interface MinimalFmt {
  card: MinimalCard;
  renderView(view: string, opts?: Record<string, unknown>): string;
  nest(opts: {
    name: string;
    syntax: string;
    options: { view: string; extra: Record<string, unknown> };
    comment: undefined;
  }): string;
}

class StubFmt implements MinimalFmt {
  readonly card: MinimalCard;
  private readonly nestCalls: { name: string; view: string }[] = [];
  private readonly renderCalls: string[] = [];
  constructor(card: MinimalCard) {
    this.card = card;
  }
  renderView(view: string, _opts: Record<string, unknown> = {}): string {
    this.renderCalls.push(view);
    // The :core/:buttons/:generate_button views compose each other; the
    // stub records the dispatch and returns a marker so the test can
    // assert which subviews were invoked.
    return `[rendered:${view}]`;
  }
  nest(opts: {
    name: string;
    syntax: string;
    options: { view: string; extra: Record<string, unknown> };
    comment: undefined;
  }): string {
    this.nestCalls.push({ name: opts.name, view: opts.options.view });
    return `[nested:${opts.name}|${opts.options.view}]`;
  }
  getRenderCalls(): readonly string[] {
    return this.renderCalls;
  }
  getNestCalls(): readonly { name: string; view: string }[] {
    return this.nestCalls;
  }
}

/** Build a minimal ctx from a card + the format stub. The stub's surface
 *  covers everything the api_key mod's view bodies read (card.name.s,
 *  card.dbContent) + the two methods they call back (fmt.renderView,
 *  fmt.nest). The full ViewContext type would require the whole
 *  RenderFormat class; the structural cast documents that the api_key
 *  port only touches this subset, and that broader integration tests
 *  against the live RenderEngine are the next step (the structural +
 *  byte tests are the headless bar). */
function makeCtx(fmt: StubFmt, view: string): {
  ctx: ViewContext;
  fmt: StubFmt;
} {
  const voo = new StubVoo(view);
  const ctx = { fmt: fmt as unknown as ViewContext["fmt"], voo: voo as unknown as ViewContext["voo"] };
  return { ctx: ctx as unknown as ViewContext, fmt };
}

/** Every viewFn the api_key manifest registers, keyed by view name
 *  (html views under HTML_VIEWS; json views stored on the manifest's
 *  json format block). */
function collectViewFns(manifest: DeckoModManifest): {
  html: Map<string, { viewFn: ViewFn; config: unknown }>;
  json: Map<string, { viewFn: ViewFn; config: unknown }>;
} {
  const html = new Map<string, { viewFn: ViewFn; config: unknown }>();
  const json = new Map<string, { viewFn: ViewFn; config: unknown }>();
  for (const module of manifest.setModules ?? []) {
    const formats = module.formats ?? {};
    for (const [format, block] of Object.entries(formats)) {
      const target = format === "json" ? json : html;
      for (const view of block.views ?? []) {
        target.set(view.view, { viewFn: view.viewFn, config: view.config });
      }
    }
  }
  return { html, json };
}

// ---------------------------------------------------------------------------
// harness: clean up the live HTML_VIEWS record after each test
// ---------------------------------------------------------------------------

let liveLoader: ModLoader | undefined;

afterEach(() => {
  liveLoader?.reset();
  liveLoader = undefined;
});

// ---------------------------------------------------------------------------
// 1. registration: the manifest's structure matches the gem tree
// ---------------------------------------------------------------------------

describe("card-mod-api_key manifest structure", () => {
  it("names + groups + gemName mirror the gem's metadata (dirs.rb:144-150)", () => {
    expect(cardModApiKey.name).toBe("api_key");
    expect(cardModApiKey.gemName).toBe("card-mod-api_key");
    expect(cardModApiKey.group).toBe("gem");
  });

  it("declares exactly the two set files the gem's set/ tree ships", () => {
    // set/right/api_key.rb + set/right/account.rb (verdict
    // mod-compat-report.json "setModules": 2)
    const paths = (cardModApiKey.setModules ?? []).map((m) => m.setPath);
    expect(paths).toEqual(["right/api_key", "right/account"]);
  });

  it("set/right/api_key.rb registers the 8 html views + 1 json view", () => {
    const setFile = (cardModApiKey.setModules ?? []).find(
      (m) => m.setPath === "right/api_key",
    );
    expect(setFile).toBeDefined();
    const html = setFile!.formats?.["html"]?.views?.map((v) => v.view) ?? [];
    expect(html).toEqual([
      "core",
      "current",
      "titled",
      "titled_content",
      "content",
      "token_link",
      "buttons",
      "generate_button",
    ]);
    const json = setFile!.formats?.["json"]?.views?.map((v) => v.view) ?? [];
    expect(json).toEqual(["token"]);
  });

  it("set/right/account.rb registers the api_key html view (account.rb:5-9)", () => {
    const setFile = (cardModApiKey.setModules ?? []).find(
      (m) => m.setPath === "right/account",
    );
    expect(setFile).toBeDefined();
    const html = setFile!.formats?.["html"]?.views?.map((v) => v.view) ?? [];
    expect(html).toEqual(["api_key"]);
  });

  it("registers every mod-specific view the T6 verdict's missing list names", () => {
    // compat-report mod-compat-report.json for card-mod-api_key-0.20.0
    // classification.metrics.htmlViewsMissingNames:
    //   ["api_key", "buttons", "current", "generate_button", "token",
    //    "token_link"]
    const { html, json } = collectViewFns(cardModApiKey);
    const htmlNames = new Set(html.keys());
    const jsonNames = new Set(json.keys());
    for (const name of ["api_key", "buttons", "current", "generate_button", "token_link"]) {
      expect(htmlNames.has(name)).toBe(true);
    }
    expect(jsonNames.has("token")).toBe(true);
  });

  it("preserves the Ruby unknown: true tag on every mod-specific html view", () => {
    const { html } = collectViewFns(cardModApiKey);
    // :buttons + :generate_button carry perms: :update on top of
    // unknown: true (api_key.rb:81, 85). The other mod-specific views
    // are pure unknown: true.
    for (const view of ["core", "current", "titled", "titled_content", "content"]) {
      expect(html.get(view)?.config).toEqual({ unknown: true });
    }
    expect(html.get("buttons")?.config).toEqual({ unknown: true, perms: "update" });
    expect(html.get("generate_button")?.config).toEqual({ unknown: true, perms: "update" });
  });

  it("preserves the perms: :update tag on :buttons + :generate_button", () => {
    const { html } = collectViewFns(cardModApiKey);
    expect(html.get("buttons")?.config).toEqual({ unknown: true, perms: "update" });
    expect(html.get("generate_button")?.config).toEqual({ unknown: true, perms: "update" });
  });

  it("loads into the nonbase basket: card_mod_api_key's Right::ApiKey + Right::Account", () => {
    const loader = new ModLoader([{ manifest: cardModApiKey }], { ...HTML_VIEWS });
    liveLoader = loader;
    loader.load();
    const basket = loader.setModules();
    const right = basket.nonbase.get("Right::ApiKey") ?? [];
    expect(right.length).toBe(1);
    expect(right[0]?.shortname).toBe("Right::ApiKey");
    expect(right[0]?.kind).toBe("nonbase");
    expect(right[0]?.modName).toBe("api_key");
    const account = basket.nonbase.get("Right::Account") ?? [];
    expect(account.length).toBe(1);
    expect(account[0]?.shortname).toBe("Right::Account");
    expect(account[0]?.modName).toBe("api_key");
  });

  it("registers every mod view into the views record and reset restores the pre-load state", () => {
    // The mod loader's ViewRegistrationTable is one record shared
    // across formats (the format dispatch lives at the render-engine
    // level, not at the registration level - mod-loader.ts:101-103).
    // The test verifies: every view declared by the manifest lands in
    // the views record, and reset() restores the pre-load state for
    // each touched key.
    const liveRecord = { ...HTML_VIEWS };
    const sentinel: ViewFn = () => "SENTINEL";
    liveRecord["token"] = sentinel; // simulate a pre-existing json :token view

    const before = "token" in liveRecord;
    expect(before).toBe(true); // baseline: the test owns the record (a clone)

    const loader = new ModLoader([{ manifest: cardModApiKey }], liveRecord);
    liveLoader = loader;
    loader.load();

    for (const view of ["core", "current", "titled", "titled_content", "content", "token_link", "buttons", "generate_button"]) {
      expect(typeof liveRecord[view]).toBe("function");
    }
    // The :token JSON view lives in a json format block; the views
    // record is one table shared across formats (mod-loader.ts:101),
    // so the json :token OVERRIDES the sentinel - the mod's later
    // registration wins, exactly the way Ruby's module reopening
    // define_method replaces the prior method.
    expect(liveRecord["token"]).toBeDefined();
    expect(liveRecord["token"]).not.toBe(sentinel);

    loader.reset();
    // After reset, every touched view goes back to its pre-load value
    // (the sentinel for views that pre-existed, undefined for views
    // the loader added).
    expect(liveRecord["token"]).toBe(sentinel);
    expect(loader.viewConfigFor("buttons")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. event name preservation: hidden trigger name matches the Ruby event
// ---------------------------------------------------------------------------

describe("card-mod-api_key view bodies", () => {
  it(":generate_button's hidden trigger input name matches the Ruby event", () => {
    // api_key.rb:4-6 event :generate_api_key, :prepare_to_validate,
    // trigger: :required - the event name an upstream handler keys on.
    // api_key.rb:96-98 generate_button_hidden_tags: {card: {trigger:
    // :generate_api_key}} - Rails renders the nested hash as
    // name="card[trigger]" value="generate_api_key".
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button");
    expect(view).toBeDefined();
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    const out = view!.viewFn(ctx);
    expect(out).toContain('name="card[trigger]"');
    expect(out).toContain('value="generate_api_key"');
  });

  it(":generate_button submits to the api_key card's edit path (card-mod-format card_form :update)", () => {
    // api_key.rb:86-94 card_form :update: Rails card_form helper emits
    // <form action="<card_path(card, view: :edit)>" method="post" ...
    // The TS port emits /<card_key>?view=edit (the same shape).
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    const out = view.viewFn(ctx);
    expect(out).toContain('action="/joe_user+*api_key?view=edit"');
    expect(out).toContain('method="post"');
    expect(out).toContain('class="card-form update-form"');
  });

  it(":generate_button's button label flips on content (api_key.rb:100-102)", () => {
    // generate_button_text: card.content.present? ? :api_key_regenerate
    // : :api_key_generate. The "Regenerate" branch fires when an api_key
    // already exists; the "Generate" branch is the empty-card path.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button")!;

    const emptyFmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx: emptyCtx } = makeCtx(emptyFmt, "generate_button");
    expect(view.viewFn(emptyCtx)).toContain("Generate API Key");
    expect(emptyFmt.getRenderCalls()).toEqual([]); // no subviews invoked from the button itself

    const presentFmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc123def456ghi789jkl0" });
    const { ctx: presentCtx } = makeCtx(presentFmt, "generate_button");
    expect(view.viewFn(presentCtx)).toContain("Regenerate API Key");
  });

  it(":generate_button's submit class is btn-primary (api_key.rb:104-106 + bootstrap btn-primary)", () => {
    // api_key.rb:104-106 generate_button_situation: :primary -> Rails
    // submit_button(situation: :primary) emits class="btn btn-primary".
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    const out = view.viewFn(ctx);
    expect(out).toContain('class="btn btn-primary"');
    expect(out).toContain('type="submit"');
  });

  it(":generate_button carries the disable-with attribute (api_key.rb:91 disable_with: t(:api_key_generating))", () => {
    // Rails submit_button helper renders disable_with as a
    // data-disable-with attribute on the submit button.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    expect(view.viewFn(ctx)).toContain('data-disable-with="Generating API Key"');
  });

  it(":token_link's href encodes format: :json + view: :token (api_key.rb:77-79)", () => {
    // link_to t(:api_key_get_jwt_token), path: {format: :json, view:
    // :token} -> <a href="/<card_key>.json?view=token">get a JWT token</a>
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("token_link")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc123" });
    const { ctx } = makeCtx(fmt, "token_link");
    const out = view.viewFn(ctx);
    expect(out).toContain('href="/joe_user+*api_key.json?view=token"');
    expect(out).toContain("get a JWT token");
  });

  it(":token (json) returns the documented {token: <encoded>} shape (api_key.rb:63-67)", () => {
    // format :json view :token: {token: card.simple_token}. The TS port
    // has no JWT surface; the encoded value is a sentinel. The JSON
    // SHAPE is what we pin.
    const { json } = collectViewFns(cardModApiKey);
    const view = json.get("token");
    expect(view).toBeDefined();
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc123" });
    const { ctx } = makeCtx(fmt, "token");
    const out = view!.viewFn(ctx);
    expect(out).toBe('{"token":"<jwt-token-pending-runtime>"}');
  });

  it(":current renders a readonly text input with the api_key content (current.haml)", () => {
    // current.haml:
    //   .current-api-key.nodblclick
    //     %label{ for: :current_api_key }
    //       = t :api_key_label
    //     = text_field_tag :current_api_key, card.content, readonly: true
    // The TS port emits <input type="text" id="current_api_key"
    // name="current_api_key" value="<content>" readonly="readonly" />.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("current")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc123def456ghi789" });
    const { ctx } = makeCtx(fmt, "current");
    const out = view.viewFn(ctx);
    expect(out).toContain('<div class="current-api-key nodblclick">');
    expect(out).toContain('<label for="current_api_key">API Key</label>');
    expect(out).toContain('id="current_api_key"');
    expect(out).toContain('name="current_api_key"');
    expect(out).toContain('value="abc123def456ghi789"');
    expect(out).toContain('readonly="readonly"');
  });

  it(":core's top section is conditional on card.content (core.haml `if card.content.present?`)", () => {
    // core.haml: the top div (rendering :current via core_top_view) only
    // appears when card.content.present?. Empty content -> no top; the
    // buttons section still renders.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("core")!;

    const emptyFmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx: emptyCtx } = makeCtx(emptyFmt, "core");
    const emptyOut = view.viewFn(emptyCtx);
    expect(emptyOut).toContain('<div class="api-key-core p-1">');
    expect(emptyOut).toContain('<div class="api-key-buttons d-flex my-2 py-3 justify-content-between w-100">');
    expect(emptyOut).not.toContain("api-key-top");
    // The buttons section renders :buttons which delegates to
    // :generate_button; the stub records those calls.
    expect(emptyFmt.getRenderCalls()).toEqual(["buttons"]);

    const presentFmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc123" });
    const { ctx: presentCtx } = makeCtx(presentFmt, "core");
    const presentOut = view.viewFn(presentCtx);
    expect(presentOut).toContain('<div class="api-key-top d-flex my-2 py-3 border-bottom justify-content-between w-100">');
    // :core_top_view returns :current, so the top section calls :current.
    expect(presentFmt.getRenderCalls()).toEqual(["current", "buttons"]);
    // The current view body renders inside the top section's marker.
    expect(presentOut).toContain("[rendered:current]");
    expect(presentOut).toContain("[rendered:buttons]");
  });

  it(":buttons delegates to :generate_button (api_key.rb:81-83 `render_generate_button`)", () => {
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("buttons")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "buttons");
    const out = view.viewFn(ctx);
    expect(out).toBe("[rendered:generate_button]");
    expect(fmt.getRenderCalls()).toEqual(["generate_button"]);
  });

  it(":titled, :titled_content, :content all delegate to :core (api_key.rb:73-75 super())", () => {
    // super() in Ruby means the parent class's same view. The api_key's
    // :core (the HAML template) IS the api_key's "view of self"; the
    // pass-throughs route through it.
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc" });
    for (const view of ["titled", "titled_content", "content"]) {
      const fn = html.get(view)!;
      const { ctx } = makeCtx(fmt, view);
      expect(fn.viewFn(ctx)).toBe("[rendered:core]");
    }
    expect(fmt.getRenderCalls()).toEqual(["core", "core", "core"]);
  });

  it(":api_key (account.rb) nests the +*api_key child card with view :core", () => {
    // account.rb:5-9 view :api_key: field_nest :api_key. The child is
    // <account>+*api key; view :core.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("api_key")!;
    const fmt = new StubFmt({ name: { s: "Joe User" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "api_key");
    const out = view.viewFn(ctx);
    expect(out).toBe("[nested:Joe User+*api key|core]");
    const calls = fmt.getNestCalls();
    expect(calls).toEqual([{ name: "Joe User+*api key", view: "core" }]);
  });
});

// ---------------------------------------------------------------------------
// 3. locale strings inlined from config/locales/en.yml
// ---------------------------------------------------------------------------

describe("card-mod-api_key locale strings (config/locales/en.yml)", () => {
  // en.yml pins the 9 strings the gem's set files reference. The TS port
  // inlines them into the view bodies; we pin the values the views emit.
  it("emits 'API Key' for api_key_label (en.yml:5)", () => {
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc" });
    const { ctx } = makeCtx(fmt, "current");
    expect(html.get("current")!.viewFn(ctx)).toContain("API Key");
  });

  it("emits 'Generate API Key' for api_key_generate (en.yml:6)", () => {
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    expect(html.get("generate_button")!.viewFn(ctx)).toContain("Generate API Key");
  });

  it("emits 'Regenerate API Key' for api_key_regenerate (en.yml:7)", () => {
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "present" });
    const { ctx } = makeCtx(fmt, "generate_button");
    expect(html.get("generate_button")!.viewFn(ctx)).toContain("Regenerate API Key");
  });

  it("emits 'Generating API Key' for api_key_generating (en.yml:8)", () => {
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    expect(html.get("generate_button")!.viewFn(ctx)).toContain('data-disable-with="Generating API Key"');
  });

  it("emits 'get a JWT token' for api_key_get_jwt_token (en.yml:10)", () => {
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc" });
    const { ctx } = makeCtx(fmt, "token_link");
    expect(html.get("token_link")!.viewFn(ctx)).toContain("get a JWT token");
  });
});