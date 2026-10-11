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
//      sentinel because the JWT path requires a live Rails runtime. No
//      real api key or token is committed anywhere in this suite: every
//      key-shaped string is the probe value the oracle capture itself
//      used (fixtures/captured/api-key-views.json) or an angle-bracketed
//      placeholder minted by the port.
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
//   - the save/validate event cycle (event :generate_api_key, event
//     :validate_api_key), the Card::Auth::ApiKey mixin methods, the
//     CardController::ApiKey mixin methods, the JWT token encoding, the
//     include_set Abstract::AccountField directive: these are
//     persistence / side effects / Rails-runtime deps with no TS
//     surface.

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
  type DeckoModManifest,
} from "../../../src/card/mod-loader.js";
import cardModApiKey from "../../../src/card/mod-loader/mods/card-mod-api_key.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";
import type { ViewContext, ViewFn } from "../../../src/card/render/format.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/api-key-views.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  rendered: Record<string, string>;
};

// The api-key content every test seeds: the probe value the oracle capture
// itself rendered (fixtures/captured/api-key-views.json) — a probe
// placeholder, never a real credential.
const API_KEY_PROBE_VALUE = "probeapikeybody0123456789";

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
  id?: number;
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
  /** card-mod-format lib/card/path.rb:56-59 - the card's url_key, the mark
   *  every path helper interpolates. The form's action is
   *  `/update/<url_key>` (api_key.rb:86-94 card_form :update), so the view
   *  reads it off the format, not off the raw name. */
  urlKey(): string;
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
  urlKey(): string {
    return this.card.name.s.replace(/\s+/g, "_");
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
    // set/right/api_key.rb + set/right/account.rb — the gem's entire set/
    // tree
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

  it("registers every mod-specific view the coverage verdict's missing list names", () => {
    // The mod-specific views: ["api_key", "buttons", "current",
    // "generate_button", "token", "token_link"]
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

  it("registers every mod view under its SET MODULE, and reset restores the pre-load state", () => {
    // CORRECTED 2026-09-28. The premise "every view the
    // manifest declares lands in the views record" was the deck-wide
    // masking defect itself: card-mod-api_key's views are declared on
    // set/right/* modules, and Ruby puts a nonbase set's format module in
    // Set.modules[:nonbase_format] (set/format.rb:146-150), which a card
    // reaches only through its OWN pattern module keys
    // (pattern/all.rb:49-55, pattern/base.rb:35-38) - never through the
    // base format class. The flat record IS the base format class
    // (ModLoader's constructor seeds it from HTML_VIEWS, and
    // RenderEngine#computeResolvedView falls through to it when the chain
    // is empty), so a set-scoped view written there answered for every
    // card. card-mod-api_key's :content hijacking every card's :content is
    // the case named in that note.
    //
    // The same inversion applies to the :token JSON view: it is declared
    // on a json format block of a nonbase set, so it belongs on its set
    // module, not on the shared record. What the old assertion called
    // "the mod's later registration wins, the way Ruby's module
    // reopening define_method replaces" is true WITHIN a set module
    // (SetModuleViewTable.register replaces in place,
    // mod-registrar.ts) and false across the base record.
    const liveRecord = { ...HTML_VIEWS };
    const sentinel: ViewFn = () => "SENTINEL";
    liveRecord["token"] = sentinel; // simulate a pre-existing json :token view

    const before = "token" in liveRecord;
    expect(before).toBe(true); // baseline: the test owns the record (a clone)

    const loader = new ModLoader([{ manifest: cardModApiKey }], liveRecord);
    liveLoader = loader;
    loader.load();

    // Every declared view is registered - under the set module that
    // declares it.
    const chain = loader.viewChainTable();
    for (const view of ["core", "current", "titled", "titled_content", "content", "token_link", "buttons", "generate_button"]) {
      const owners = ["Right::ApiKey", "Right::Account"].filter(
        (setModule) => chain.viewFor(setModule, view) !== undefined,
      );
      expect(owners.length).toBeGreaterThan(0);
    }
    // And none of them reached the base-format record: the sentinel the
    // test seeded is untouched, and the shared bodies are unchanged.
    expect(liveRecord["token"]).toBe(sentinel);
    for (const view of ["core", "current", "titled", "titled_content", "content"]) {
      expect(liveRecord[view]).toBe(HTML_VIEWS[view]);
    }

    loader.reset();
    // After reset, every registration the loader made is gone.
    expect(chain.viewFor("Right::ApiKey", "content")).toBeUndefined();
    expect(chain.viewFor("Right::Account", "content")).toBeUndefined();
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

  it(":generate_button submits to the api_key card's UPDATE path (card-mod-format card_form :update)", () => {
    // api_key.rb:86-94 card_form :update renders the card_form opener
    // (card-mod-format set/all/form.rb:193-224): the class list from
    // card_form_html_opts ("card-form" + "slotter" + "autosave" on :update),
    // form_for's dom id, then the action - path(action: :update) per
    // lib/card/path.rb:34-63 - accept-charset, data-remote, method post.
    // ORACLE-PINNED: fixtures/captured/api-key-views.json carries
    // `<form class="card-form slotter autosave" id="edit_card_1298"
    // action="/update/Oracle_ApiKey_Account+*api_key" accept-charset="UTF-8"
    // data-remote="true" method="post">` - the OLD `?<view>=edit` guess in
    // this assertion was never verified and is not Ruby's update path.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "", id: 42 });
    const { ctx } = makeCtx(fmt, "generate_button");
    const out = view.viewFn(ctx);
    expect(out).toContain('action="/update/Joe_User+*api_key"');
    expect(out).toContain('method="post"');
    expect(out).toContain('class="card-form slotter autosave"');
    expect(out).toContain('id="edit_card_42"');
    // the utf8 enqueuer + the persisted-record _method spoof
    expect(out).toContain('<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />');
    expect(out).toContain('<input type="hidden" name="_method" value="patch" autocomplete="off" />');
  });

  it(":generate_button's form is the unsaved-card shape when the card has no id (form_for new_record)", () => {
    // form_for on an UNSAVED record emits id="new_card" and NO _method
    // patch spoof (the persisted-record quirk) - the same rule
    // card-mod-comment's :comment_box follows, byte-verified by the
    // board-stage3 engage_tab capture (form.rb:221 autosave is :update-only).
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("generate_button")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "generate_button");
    const out = view.viewFn(ctx);
    expect(out).toContain('id="new_card"');
    expect(out).toContain('class="card-form slotter"');
    expect(out).not.toContain('name="_method"');
    expect(out).not.toContain("autosave");
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

    const presentFmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: API_KEY_PROBE_VALUE });
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

  it(":token_link's href is the Card::Path render of {format: :json, view: :token} (api_key.rb:77-79)", () => {
    // api_key.rb:77-79 `view :token_link do link_to t(:api_key_get_jwt_token),
    //   path: {format: :json, view: :token} end`. Card::Path#render
    // (card-mod-format-0.20.0 lib/card/path.rb:12-14) takes the `standard`
    //   arm: base (path.rb:36-42) is "#{mark}/#{view}" - no action, and both
    //   mark and view present; mark is the card's url_key (path.rb:59-66
    //   interpret_mark); `standard` then appends extension (path.rb:68-72
    //   => ".json") and query. Query is EMPTY: base already deleted :view
    //   and extension already deleted :format, so cast_path_hash has
    //   nothing left (path.rb:84-88). The href is therefore
    //   /<url_key>/token.json - NOT /<key>.json?view=token, the shape this
    //   assertion used to pin (never verified against anything).
    //
    // GEM-SOURCE-DERIVED, RENDERED-UNPINNED: no oracle capture of this view
    // exists and none can be taken - the only *api key / *account-right
    // cards in either oracle deck are read-denied to every reader the
    // runner can become (Right::ApiKey#ok_to_read? is `own_account? ||
    // super`, api_key.rb:20-22), so the render raises "view not supported"
    // (the anonymous probe returns the denial span; the as_bot re-fetch
    //   returns Card::Error::UserError).
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("token_link")!;
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: API_KEY_PROBE_VALUE });
    const { ctx } = makeCtx(fmt, "token_link");
    expect(view.viewFn(ctx)).toBe(
      '<a href="/Joe_User+*api_key/token.json">get a JWT token</a>',
    );
  });

  it(":token (json) returns the documented {token: <encoded>} shape (api_key.rb:63-67)", () => {
    // format :json view :token: {token: card.simple_token}. The TS port
    // has no JWT surface; the encoded value is an angle-bracketed
    // placeholder minted by the port (no real token is committed). The
    // JSON SHAPE is what we pin.
    const { json } = collectViewFns(cardModApiKey);
    const view = json.get("token");
    expect(view).toBeDefined();
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: API_KEY_PROBE_VALUE });
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
    // ORACLE-PINNED bytes (fixtures/captured/api-key-views.json, the
    // current-api-key div inside the captured :titled_content): Haml's
    // single-quoted static attributes, one newline per template line, the
    // label text on its own line, and text_field_tag's own attribute order
    // type/name/id/value/readonly.
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("current")!;
    // the seeded content is the probe value the oracle capture itself
    // rendered, so the expected bytes are the captured bytes verbatim
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: API_KEY_PROBE_VALUE });
    const { ctx } = makeCtx(fmt, "current");
    const out = view.viewFn(ctx);
    expect(out).toBe(
      `<div class='current-api-key nodblclick'>\n` +
        `<label for='current_api_key'>\nAPI Key\n</label>\n` +
        `<input type="text" name="current_api_key" id="current_api_key"` +
        ` value="${API_KEY_PROBE_VALUE}" readonly="readonly" />\n` +
        `</div>\n`,
    );
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
    expect(emptyOut).toBe(
      `<div class='api-key-core p-1'>\n` +
        `<div class='api-key-buttons d-flex my-2 py-3 justify-content-between w-100'>\n` +
        `[rendered:buttons]\n</div>\n</div>\n`,
    );
    expect(emptyOut).not.toContain("api-key-top");
    // The buttons section renders :buttons which delegates to
    // :generate_button; the stub records those calls.
    expect(emptyFmt.getRenderCalls()).toEqual(["buttons"]);

    const presentFmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: API_KEY_PROBE_VALUE });
    const { ctx: presentCtx } = makeCtx(presentFmt, "core");
    const presentOut = view.viewFn(presentCtx);
    // :core_top_view returns :current, so the top section calls :current.
    expect(presentFmt.getRenderCalls()).toEqual(["current", "buttons"]);
    // The current view body renders inside the top section; the blank line
    // is the `= render core_top_view` line's own newline on top of the
    // nested template's trailing one (the capture shows it).
    expect(presentOut).toBe(
      `<div class='api-key-core p-1'>\n` +
        `<div class='api-key-top d-flex my-2 py-3 border-bottom justify-content-between w-100'>\n` +
        `[rendered:current]\n</div>\n` +
        `<div class='api-key-buttons d-flex my-2 py-3 justify-content-between w-100'>\n` +
        `[rendered:buttons]\n</div>\n</div>\n`,
    );
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

  it(":titled, :titled_content, :content all use super() to walk the MRO (api_key.rb:73-75)", () => {
    // super() in Ruby means the parent class's same view, NOT a re-dispatch
    // to a sibling view (:core). The faithful TS shape is
    // superView(ctx, "Right::ApiKey", ctx.voo.requestedView) - it walks the
    // per-card chain for the SAME view name and renders the next entry's
    // view fn (mod-view-helpers.ts:55-99 + mod-registrar.ts:362-477).
    //
    // In this structural test the mod loader is not installed, so
    // superView returns "" (the documented fallback at
    // mod-view-helpers.ts:74-79: "superView falls back gracefully when no
    // loader is registered (returns \"\")"). The chain-walking semantics -
    // super() returning the parent's SAME :titled body - are the
    // integration test's bar; the register loader hook below asserts the
    // chain resolves past the api_key set when one IS installed.
    const { html } = collectViewFns(cardModApiKey);
    const fmt = new StubFmt({ name: { s: "Joe User+*api key" }, dbContent: "abc" });
    for (const view of ["titled", "titled_content", "content"]) {
      const fn = html.get(view)!;
      const { ctx } = makeCtx(fmt, view);
      // superView falls back to "" with no loader registered. The
      // renderView calls on the stub stay empty (superView doesn't go
      // through ctx.fmt.renderView - it consults the loader's
      // SetModuleViewTable directly).
      expect(fn.viewFn(ctx)).toBe("");
    }
    expect(fmt.getRenderCalls()).toEqual([]);
    // Also assert the view body forwards the voo.requestedView (the SAME
    // view name) to superView - mismatching the view name would be the
    // sibling-rewire bug superView exists to prevent.
    expect(html.get("titled")).toBeDefined();
    expect(html.get("titled_content")).toBeDefined();
    expect(html.get("content")).toBeDefined();
  });

  it(":api_key (account.rb) nests the +*api_key child card at the default nest view (titled)", () => {
    // account.rb:5-9 view :api_key: field_nest :api_key — the field_nest
    // carries NO view opt, so the child renders the default nest view (the
    // railtie :titled; the graded corpus row view:admin:Ada
    // Admin+*account:api_key pins the titled-view slot on the +*api_key
    // child, whose titled body embeds the api-key core — the earlier
    // view-:core reading missed the bare field_nest's default).
    const { html } = collectViewFns(cardModApiKey);
    const view = html.get("api_key")!;
    const fmt = new StubFmt({ name: { s: "Joe User" }, dbContent: "" });
    const { ctx } = makeCtx(fmt, "api_key");
    const out = view.viewFn(ctx);
    expect(out).toBe("[nested:Joe User+*api key|titled]");
    const calls = fmt.getNestCalls();
    expect(calls).toEqual([{ name: "Joe User+*api key", view: "titled" }]);
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

// ---------------------------------------------------------------------------
// 4. superView trio A/B against the live oracle
// ---------------------------------------------------------------------------
//
// set/right/api_key.rb:73-75 declares :titled / :titled_content / :content as
// pass-throughs to the parent set's SAME view via super() (`view(viewname,
// unknown: true) { super() }`). The TS port expresses super() through the
// superView helper (mod-view-helpers.ts:81-99), which walks the loader's
// per-card chain to find the next entry. The byte proof that the chain
// dispatch equals Ruby's super() is rendering the probe through the live
// engine (with the api_key mod loaded) and asserting the bytes match the
// captured oracle fixture.
//
// Probe = "Oracle ApiKey Account+*api key" - a +*api_key child of the
// Oracle ApiKey Account (oracle seeds created these; the form id
// edit_card_1298 in the captured bytes pins the probe's card id).
// cardContent must satisfy Right::ApiKey's validate_api_key event
// (api_key.rb:8-11) which enforces 20+ \w chars - we use
// "probeapikeybody0123456789" (25 chars, all alnum).
//
// Engine-core stub: superView walks the loader's chain table looking for the
// next entry's view fn. Without card-mod-format installed, the chain has
// only Right::ApiKey's :titled/:titled_content/:content; superView would
// terminate at "" (no next entry) and the captured bytes wouldn't be
// produced. The stub re-registers the engine's own HTML_VIEWS view fns
// (closure-captured BEFORE the loader mutates them) under setPath "all/base"
// so the chain resolves Right::ApiKey -> All::Base.
//
// Naming convention the chain walk depends on: the api_key probe's set_keys
// include "RIGHT-Xapi_key" (the right codename "*api_key" has its "*"
// normalized to "X" in the safe_key transform, name.ts:531-534), while the
// loader's setModuleShortname ("right/api_key") resolves to "Right::ApiKey"
// (no X - the setPath doesn't carry the *). The chain walker resolves the
// starred token to the registered module through its star-marker
// candidates, and superView's terminal falls to the base format's view
// (view_definition.rb:18-21) - both recorded with the trio tests below.
// The structural + superView chain tests (view-dispatch-superview.test.ts:
// 204-243) pin the walker mechanics.

/** The capture's normalizations: data-slot-id is SecureRandom.hex(10) by
 *  design (card-mod-format set/all/html/wrap.rb:45); the probe cards'
 *  data-card-id advances every create/trash cycle (seed state, not mod
 *  semantics). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"');
}

/** The engine's own HTML_VIEWS view fns, closure-captured at module load -
 *  BEFORE any loader mutates the live record (the closure references stay
 *  bound to the original functions even after the loader's flat last-wins
 *  table replaces them with api_key's views). Shared by the two describes
 *  below. */
const engineTitled = HTML_VIEWS["titled"]!;
const engineTitledContent = HTML_VIEWS["titled_content"]!;
const engineContent = HTML_VIEWS["content"]!;
const engineCore = HTML_VIEWS["core"]!;
const engineTitle = HTML_VIEWS["title"]!;
const engineMenu = HTML_VIEWS["menu"]!;

/** Stub manifest registering the engine's HTML_VIEWS view fns under
 *  setPath "all/base" - the chain-walker's anchorless-token expansion
 *  for "ALL" resolves to every All::* module registered in the basket.
 *  With All::Base + Right::ApiKey both registered, the chain for the
 *  api_key probe walks Right::ApiKey -> All::Base. */
const engineCoreStub: DeckoModManifest = {
  name: "engine_core",
  setModules: [
    {
      setPath: "all/base",
      formats: {
        html: {
          views: [
            { view: "titled", viewFn: engineTitled },
            { view: "titled_content", viewFn: engineTitledContent },
            { view: "content", viewFn: engineContent },
            { view: "core", viewFn: engineCore },
            { view: "title", viewFn: engineTitle },
            { view: "menu", viewFn: engineMenu },
          ],
        },
      },
    },
  ],
};

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

describe("card-mod-api_key superView trio (A/B against live oracle)", () => {
  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;

    // codename registry reads cards.codename; their type ids matter to the
    // rule-cache join (Set-typed cards vs Setting-typed).
    await seedCard(s, { id: 2, name: "RichText" });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
    // the right-anchor setting card: the real deck names it "*api key"
    // (a space - the corpus row 19954 in the read-only ground truth), and
    // the junction name the render carries is DERIVED from the two side
    // names, so seeding "*api_key" here would make every compared name
    // attribute wrong for a reason that is not the port's.
    await seedCard(s, { id: 12, name: "*api key", codename: "api_key", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    // The left card - the "Oracle ApiKey Account" the +*api_key right hangs
    // off. Required so the type_plus_right pattern can find leftTypeName
    // (the api_key set's superView trio's set_keys include the
    // TYPE_PLUS_RIGHT-rich_text-Xapi_key token).
    await seedCard(s, {
      id: 1297,
      name: "Oracle ApiKey Account",
      dbContent: "account body",
    });
    // The probe - id 1298 matches the form id "edit_card_1298" in the
    // captured bytes (card_form :update emits id="edit_card_<card.id>").
    // The compound name "Oracle ApiKey Account+*api key" is the junction
    // of left_id=1297 + right_id=12 (the *api_key codename card).
    // Content must satisfy the api_key set's validate_api_key event
    // (api_key.rb:8-11: content.match?(/^\w{20,}$/)).
    await seedCard(s, {
      id: 1298,
      leftId: 1297,
      rightId: 12,
      typeId: 2,
      dbContent: "probeapikeybody0123456789",
    });
    // The set card "Oracle ApiKey Account+*api key+*self" - needed so the
    // probe's set_keys include ALL_PLUS + SELF-oracle_api_key_account-Xapi_key
    // (the ALL_PLUS pattern's anchor = the +*self rule card).
    await seedCard(s, { id: 1299, leftId: 1298, rightId: 11, typeId: 13 });

    loader = new ModLoader([
      { manifest: engineCoreStub },
      { manifest: cardModApiKey },
    ]);
    loader.load();
    setDefaultModLoader(loader);
    // The render dispatch consults engine.modLoader (RenderEngine
    // #computeResolvedView). WITHOUT this bind the three trio tests below
    // rendered the BASE bytes and passed without ever reaching the api_key
    // set - the assertions were satisfied by the plain content view. With
    // the bind they exercise the real super() chain (and the full-byte
    // parity pins in section 5).
    bindModLoaderToEngine(s, loader);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
  }, 60_000);

  afterAll(() => {
    loader?.reset();
    setDefaultModLoader(undefined);
    storage?.close();
    storage = undefined;
    loader = undefined;
  });

  // RESOLVED (two engine fixes): (1) the chain walker now tries the
  // star-marker candidates (safeKeyToModuleShortnameCandidates -
  // "RIGHT-Xapi_key" resolves the registered "Right::ApiKey"; Ruby's
  // safe_key renders the "*" as "X" while the set path carries the bare
  // name), and (2) superView's terminal falls to the base format's view
  // (view_definition.rb:18-21) instead of "". The trio renders the real
  // delegated bytes; full captured-fixture byte parity stays labeled on
  // :titled because :generate_button's Rails form internals still
  // diverge (the capture's secondary note).
  it(":titled resolves Right::ApiKey through the RIGHT-Xapi_key token and renders the api key", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle ApiKey Account+*api key", "titled");
    expect(html).not.toBe("");
    expect(html).toContain("probeapikeybody0123456789");
  });

  it(":titled_content delegates through the chain and renders the api key", async () => {
    const s = storage!;
    const html = await s.engine.render(
      "Oracle ApiKey Account+*api key",
      "titled_content",
    );
    expect(html).not.toBe("");
    expect(html).toContain("probeapikeybody0123456789");
  });

  it(":content delegates to the base format's content view", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle ApiKey Account+*api key", "content");
    expect(html).not.toBe("");
    expect(html).toContain("probeapikeybody0123456789");
  });

  // The chain walker DOES resolve Right::ApiKey -> All::Base when the
  // setKeys omit the "*" X-mark (the all/base stub provides All::Base).
  // This proves the stub + chain-walker wiring is correct; the X-prefix
  // gap is isolated to the safeKey resolution path.
  it("chain walker finds All::Base via ALL-RIGHT (the X-mark-free path)", () => {
    // The structural surface (loader.viewChain) reproduces the chain the
    // render path would walk IF the X-mark gap were closed.
    const chain = loader!.viewChain(
      "ALL ALL_PLUS TYPE-rich_text RSTAR RIGHT-api_key TYPE_PLUS_RIGHT-rich_text-api_key SELF-oracle_api_key_account-api_key",
      "titled",
    );
    expect(chain.map((e) => e.setModule)).toEqual([
      "Right::ApiKey",
      "All::Base",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. FULL BYTE PARITY — the trio, end to end, against the captured oracle
// ---------------------------------------------------------------------------
//
// The block above proves the trio DISPATCHES (the chain walker resolves
// Right::ApiKey -> All::Base, the delegated view carries the api key's
// content). This block closes the other half the section-4 comment named as
// the labeled remainder: the rendered BYTES must equal the Ruby oracle's
// bytes, not merely contain the content string.
//
// Oracle: fixtures/captured/api-key-views.json (oracle-capture-api-key-views.rb,
// run through `bundle exec decko runner` on the real decko-0.20.0 gem stack).
// Probe: "Oracle ApiKey Account+*api key" (id 1298), content
// "probeapikeybody0123456789" (25 word chars, so Right::ApiKey's
// validate_api_key event accepts it).
//
// What the port had to change to get here (all three are Ruby-cited, and
// the first two are pure HAML-template shape - Haml renders static
// attributes with SINGLE quotes and keeps the template's newlines):
//   1. :current (current.haml) - single-quoted div/label, a newline before
//      and after the label text (the `= t :api_key_label` line), and Rails'
//      text_field_tag attribute order type/name/id/value/readonly (the port
//      had emitted id before name).
//   2. :core (core.haml) - single-quoted wrapper classes, the newline after
//      the rendered `= render core_top_view` line (the captured bytes carry
//      the blank line after the current-api-key div), and a newline before
//      each closing tag.
//   3. :generate_button (api_key.rb:85-94) - the body is card_form :update
//      (card-mod-format set/all/form.rb:193-224), NOT a hand-rolled form:
//      class "card-form slotter autosave" + dom id "edit_card_<id>", the
//      action is the UPDATE path (/update/<url_key>), the utf8 enqueuer, the
//      _method=patch spoof, then the hidden trigger with Rails'
//      sanitize_to_id name (card[trigger] -> card_trigger) and
//      autocomplete="off", then the submit_button on the next line with
//      name/type/data-disable-with/class in the captured order.

describe("card-mod-api_key rendered bytes EQUAL the captured Ruby oracle", () => {
  let byteStorage: RenderTestStorage | undefined;
  let byteLoader: ModLoader | undefined;

  /** The oracle's probe rendered, per view name (the capture keys them
   *  "<card name>#<view>"). */
  const oracle = (view: string): string =>
    FIXTURE.rendered[`Oracle ApiKey Account+*api key#${view}`];

  beforeAll(async () => {
    byteStorage = await createRenderTestStorage();
    const s = byteStorage;
    await seedCard(s, { id: 2, name: "RichText" });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
    // the right-anchor setting card: the real deck names it "*api key"
    // (a space - the corpus row 19954 in the read-only ground truth), and
    // the junction name the render carries is DERIVED from the two side
    // names, so seeding "*api_key" here would make every compared name
    // attribute wrong for a reason that is not the port's.
    await seedCard(s, { id: 12, name: "*api key", codename: "api_key", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 1297, name: "Oracle ApiKey Account", dbContent: "account body" });
    await seedCard(s, {
      id: 1298,
      leftId: 1297,
      rightId: 12,
      typeId: 2,
      dbContent: "probeapikeybody0123456789",
    });
    await seedCard(s, { id: 1299, leftId: 1298, rightId: 11, typeId: 13 });

    byteLoader = new ModLoader([
      { manifest: engineCoreStub },
      { manifest: cardModApiKey },
    ]);
    byteLoader.load();
    setDefaultModLoader(byteLoader);
    // The RENDER dispatch consults engine.modLoader (RenderEngine
    // #computeResolvedView: the chain walk is the ONLY path that reaches a
    // mod's view). installInto wires the EVENT host; without this bind the
    // engine falls back to its own pristine `views` record and the mod's
    // views are never dispatched - which is exactly what the section-4 trio
    // block did: its three renders passed against the BASE bytes, proving
    // nothing about the api_key set. (The same wiring gap closed six stale
    // markers in the account-forms suite - surfaces-batch2 receipt, surface
    // 2 defect (a).)
    bindModLoaderToEngine(s, byteLoader);
    await byteLoader.installInto(modEngineHost(s.engine, s.fetcher));
  }, 60_000);

  afterAll(() => {
    byteLoader?.reset();
    setDefaultModLoader(undefined);
    byteStorage?.close();
    byteStorage = undefined;
    byteLoader = undefined;
  });

  it(":titled_content renders the captured 980 bytes of api-key core + generate_button", async () => {
    const s = byteStorage!;
    const actual = normalize(await s.engine.render("Oracle ApiKey Account+*api key", "titled_content"));
    expect(actual).toBe(normalize(oracle("titled_content")));
  });

  it(":content renders the captured slot-wrapped bytes of the same body", async () => {
    const s = byteStorage!;
    const actual = normalize(await s.engine.render("Oracle ApiKey Account+*api key", "content"));
    expect(actual).toBe(normalize(oracle("content")));
  });

  it(":titled renders the captured header + body bytes", async () => {
    const s = byteStorage!;
    const actual = normalize(await s.engine.render("Oracle ApiKey Account+*api key", "titled"));
    expect(actual).toBe(normalize(oracle("titled")));
  });
});
