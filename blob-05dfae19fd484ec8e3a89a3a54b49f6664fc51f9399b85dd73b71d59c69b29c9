// The card-mod-assets mod loader tests: prove the port's view registrations
// match the Ruby source's per-view semantics, byte-for-byte where the
// engine's surface is portable, and document the gap where it isn't.
//
// Proof shape:
//   - The manifest has the ONE set module with portable html views
//     (set/right/group_remote.rb), and that module's :html format registers
//     exactly the two gem-specific views it declares
//     (javascript_include_tag, stylesheet_include_tag).
//   - The registered view functions emit the same per-URL byte strings
//     Ruby's asset_tag_helper.rb#javascript_include_tag / tag "link"
//     produce for a remote URL (no asset-pipeline digest lookup).
//   - The ModLoader's reset() restores the pre-registration view table, so
//     this test mutates no shared surface (parity with the help mod test's
//     afterAll.reset()).
//
// What this test does NOT pin: the asset pipeline's filesystem-touching
// views (right/asset_output view :not_found -> update_asset_output_live;
// abstract/asset_file view :javascript_include_tag -> card.existing_source_paths),
// documented in card-mod-assets.ts's NOT-PORTED block.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModAssets from "../../../src/card/mod-loader/mods/card-mod-assets.js";
import type { ViewContext, ViewFn } from "../../../src/card/render/format.js";

// The flat/base-format :core entry BEFORE this mod loads. The HTML_VIEWS
// record is process-wide (sibling test files in the same worker may have
// loaded other mods), so the "not masked" pin compares against THIS
// snapshot rather than against undefined.
import { HTML_VIEWS } from "../../../src/card/render/views.js";

let flatCoreBeforeLoad: unknown;
let loader: ModLoader | undefined;

beforeAll(() => {
  flatCoreBeforeLoad = HTML_VIEWS["core"];
  loader = new ModLoader([{ manifest: cardModAssets }]);
  loader.load();
});

afterAll(() => {
  loader?.reset(); // unregister the mod views from the live HTML_VIEWS record
  loader = undefined;
});

/** A ViewContext stub sized for the two ported views: they only read
 *  ctx.fmt.card.dbContent (the URL list newline-joined - group_remote.rb:30
 *  content = urls.join "\n"). voo / engine / nest processing are not
 *  exercised. */
function ctxForUrls(urls: string): ViewContext {
  return {
    fmt: { card: { dbContent: urls } } as unknown as ViewContext["fmt"],
    voo: {} as unknown as ViewContext["voo"],
  };
}

/** Pull the mod-registered view function out of the CHAIN table. Both views
 *  are declared on set/right/group_remote.rb, a nonbase set, so they are
 *  registered against that set module rather than written into the
 *  base-format record the engine falls through to. */
function viewFor(name: string): ViewFn {
  const fn = loader!.viewChainTable().viewFor("Right::GroupRemote", name);
  if (fn === undefined) throw new Error(`view not registered: ${name}`);
  return fn;
}

describe("card-mod-assets mod loader", () => {
  describe("manifest shape (set/right/group_remote.rb setModule entries)", () => {
    // The manifest carries sixteen set modules: the six earlier ones
    // (right/asset_output's :not_found gate, the abstract/asset_outputter
    // bookkeeping entry, the type_plus_right/set/{style,script}
    // :asset_output_url registrations, abstract/asset_inputter's event
    // declarations, right/group_remote) PLUS the 2026-10-19 tree
    // completions (the mods-first-half lane): the gem's remaining set
    // files (abstract/01_manifest_group + the include-only abstracts
    // asset_file/asset_group/folder_group/local_manifest_group/mod_assets,
    // right/asset_input, type/mod) and the manifest-group :core on the
    // abstract's two CONCRETE includers (the abstract itself carries no
    // registration: an abstract-pattern view would FLAT-register and mask
    // the engine's :core deck-wide - Ruby's include_set scoping never
    // does; the type_plus_right/set/{style,script} precedent).
    it("registers the sixteen set modules - the full gem tree + the concrete includers", () => {
      expect(cardModAssets.setModules).toBeDefined();
      expect(cardModAssets.setModules?.length).toBe(16);
      expect(cardModAssets.setModules?.map((m) => m.setPath)).toEqual([
        "right/asset_output",
        "abstract/asset_outputter",
        "abstract/asset_inputter",
        "type_plus_right/set/style",
        "type_plus_right/set/script",
        "right/group_remote",
        "abstract/01_manifest_group",
        "abstract/asset_file",
        "abstract/asset_group",
        "abstract/folder_group",
        "abstract/local_manifest_group",
        "abstract/mod_assets",
        "right/asset_input",
        "type/mod",
        "type/local_script_manifest_group",
        "type/local_style_manifest_group",
      ]);
    });

    it("the right/group_remote format :html block lists :core + the two verdict-named views", () => {
      const html = cardModAssets.setModules?.find((m) => m.setPath === "right/group_remote")
        ?.formats?.html;
      expect(html).toBeDefined();
      const viewNames = (html?.views ?? []).map((v) => v.view).sort();
      expect(viewNames).toEqual(
        ["core", "javascript_include_tag", "stylesheet_include_tag"].sort(),
      );
    });

    it("the javascript_include_tag view carries cache: 'never' (group_remote.rb:44)", () => {
      const view = cardModAssets.setModules
        ?.find((m) => m.setPath === "right/group_remote")
        ?.formats?.html?.views?.find(
        (v) => v.view === "javascript_include_tag",
      );
      expect(view?.config?.cache).toBe("never");
    });

    it("the stylesheet_include_tag view has no cache config (group_remote.rb:50 defines none)", () => {
      const view = cardModAssets.setModules
        ?.find((m) => m.setPath === "right/group_remote")
        ?.formats?.html?.views?.find(
        (v) => v.view === "stylesheet_include_tag",
      );
      expect(view?.config?.cache).toBeUndefined();
    });

    it("the mod's name / gemName / group match the card-mod-assets-0.20.0 manifest", () => {
      expect(cardModAssets.name).toBe("assets");
      expect(cardModAssets.gemName).toBe("card-mod-assets");
      // dirs.rb:66-78 + 148-156: cards-installed gems live under
      // "gem-defaults"; card-mod-assets ships as a gem so the group is
      // "gem-defaults".
      expect(cardModAssets.group).toBe("gem-defaults");
    });
  });

  describe("the mod loader registers the views under its SET MODULE", () => {
    // These two views are declared on set/right/group_remote.rb — a NONBASE
    // set. Ruby keeps a nonbase set's format module in
    // Set.modules[:nonbase_format] (set/format.rb:146-150), which a card
    // reaches only through its own pattern module keys
    // (pattern/all.rb:49-55, pattern/base.rb:35-38), NOT through the base
    // format class. The flat record the engine falls through to IS that base
    // format class, so writing a set-scoped view into it is the deck-wide
    // masking defect: one registration answered for cards that are not in
    // the set.
    //
    // The views are still REGISTERED — the assertion reads the chain table,
    // not the flat record.
    it("registers :javascript_include_tag and :stylesheet_include_tag on Right::GroupRemote", () => {
      const chain = loader!.viewChainTable();
      expect(typeof chain.viewFor("Right::GroupRemote", "javascript_include_tag")).toBe("function");
      expect(typeof chain.viewFor("Right::GroupRemote", "stylesheet_include_tag")).toBe("function");
      // And the base-format record is untouched by them.
      const flat = loader!.viewsTable();
      expect(flat["javascript_include_tag"]).toBeUndefined();
      expect(flat["stylesheet_include_tag"]).toBeUndefined();
    });

    // group_remote.rb:40-42 view :core (`list_group urls`) and
    // 01_manifest_group.rb:4-6 view :core (`list_group card.item_names`,
    // registered on the two CONCRETE includer types - the abstract
    // module itself stays registration-free so nothing flat-registers).
    it("registers :core set-scoped: Right::GroupRemote + the two manifest-group types", () => {
      const chain = loader!.viewChainTable();
      expect(typeof chain.viewFor("Right::GroupRemote", "core")).toBe("function");
      expect(typeof chain.viewFor("Type::LocalScriptManifestGroup", "core")).toBe("function");
      expect(typeof chain.viewFor("Type::LocalStyleManifestGroup", "core")).toBe("function");
      // The abstract module itself carries NO :core registration...
      expect(chain.viewFor("Abstract::ManifestGroup", "core")).toBeUndefined();
      // ...and the flat/base-format record is untouched by this mod (the
      // process-wide record may carry other mods' registrations, so the
      // pin is the unchanged identity, not absence).
      const flat = loader!.viewsTable();
      expect(flat["core"]).toBe(flatCoreBeforeLoad);
    });
  });

  describe("view :javascript_include_tag - group_remote.rb:44-48", () => {
    let registered: ViewFn;
    beforeAll(() => {
      registered = viewFor("javascript_include_tag");
    });

    it("a single URL emits one <script src=...></script> tag with no leading whitespace", () => {
      // group_remote.rb:45 maps the path through javascript_include_tag
      // (Rails emits <script src=\"<url>\"></script> for a remote URL);
      // the join is "\n" with no trailing newline.
      expect(registered(ctxForUrls("https://cdn.example.com/lib.js"))).toBe(
        '<script src="https://cdn.example.com/lib.js"></script>',
      );
    });

    it("multiple URLs emit one tag per URL joined by a single newline (group_remote.rb:47 .join \"\\n\")", () => {
      const out = registered(
        ctxForUrls("https://a.example/x.js\nhttps://b.example/y.js"),
      );
      expect(out).toBe(
        '<script src="https://a.example/x.js"></script>\n' +
          '<script src="https://b.example/y.js"></script>',
      );
    });

    it("empty content emits the empty string (the join of an empty array is \"\")", () => {
      expect(registered(ctxForUrls(""))).toBe("");
    });

    it("a trailing newline is filtered so the output has no trailing newline either", () => {
      // group_remote.rb:25-27 urls filters no blanks explicitly, but the
      // port's url source (card.dbContent = urls.join "\n") carries one
      // trailing newline on cards where the manifest had no remote URLs
      // after the last one. Splitting a trailing newline yields one empty
      // string the helper filters out.
      expect(registered(ctxForUrls("https://cdn.example.com/lib.js\n"))).toBe(
        '<script src="https://cdn.example.com/lib.js"></script>',
      );
    });
  });

  describe("view :stylesheet_include_tag - group_remote.rb:50-54", () => {
    let registered: ViewFn;
    beforeAll(() => {
      registered = viewFor("stylesheet_include_tag");
    });

    it("a single URL emits one <link href=... media=all rel=stylesheet type=text/css /> with the Ruby argument order", () => {
      // group_remote.rb:52 `tag "link", href:, media:, rel:, type:` - Rails'
      // tag helper preserves Hash insertion order, so the byte order is
      // href, media, rel, type.
      expect(registered(ctxForUrls("https://cdn.example.com/lib.css"))).toBe(
        '<link href="https://cdn.example.com/lib.css" media="all" rel="stylesheet" type="text/css" />',
      );
    });

    it("multiple URLs emit one tag per URL joined by a single newline", () => {
      const out = registered(
        ctxForUrls("https://a.example/x.css\nhttps://b.example/y.css"),
      );
      expect(out).toBe(
        '<link href="https://a.example/x.css" media="all" rel="stylesheet" type="text/css" />\n' +
          '<link href="https://b.example/y.css" media="all" rel="stylesheet" type="text/css" />',
      );
    });

    it("empty content emits the empty string", () => {
      expect(registered(ctxForUrls(""))).toBe("");
    });

    it("a trailing newline produces no trailing newline in the output", () => {
      expect(registered(ctxForUrls("https://cdn.example.com/lib.css\n"))).toBe(
        '<link href="https://cdn.example.com/lib.css" media="all" rel="stylesheet" type="text/css" />',
      );
    });
  });

  describe("view :core - group_remote.rb:40-42 + 01_manifest_group.rb:4-6", () => {
    // Both :core bodies are `list_group <items>`: the bootstrap helper's
    // byte shape (bootstrap/helper.rb:12-19 -> list_tag/list_item_tags),
    // measured and quoted in haml-file-views.ts listGroup: items joined by
    // "\n" inside <li class="list-group-item"> wrappers, NOT escaped.
    it("group_remote :core renders the URL list as the bootstrap list-group (list_group urls)", () => {
      const core = loader!.viewChainTable().viewFor("Right::GroupRemote", "core");
      expect(core?.(ctxForUrls("https://a.example/x.js\nhttps://b.example/y.js"))).toBe(
        '<ul class="list-group">' +
          '<li class="list-group-item">https://a.example/x.js</li>\n' +
          '<li class="list-group-item">https://b.example/y.js</li></ul>',
      );
    });

    it("group_remote :core of no urls is the empty list-group (list_group [])", () => {
      const core = loader!.viewChainTable().viewFor("Right::GroupRemote", "core");
      expect(core?.(ctxForUrls(""))).toBe('<ul class="list-group"></ul>');
    });

    it("manifest-group :core renders item_names - the [[ ]] marks stripped (01_manifest_group.rb:4-6)", () => {
      // item_names (collection item.rb): the content read as a newline
      // list, [[ ]] marks stripped. A one-item content is one item; the
      // [[...]] forms are the same item names without the marks. The
      // registration lives on the concrete includer types (the abstract
      // itself stays registration-free - see the set-scoped pin above).
      const core = loader!.viewChainTable().viewFor("Type::LocalStyleManifestGroup", "core");
      expect(core?.(ctxForUrls("[[angular.js]]\n[[jquery]]"))).toBe(
        '<ul class="list-group">' +
          '<li class="list-group-item">angular.js</li>\n' +
          '<li class="list-group-item">jquery</li></ul>',
      );
    });

    it("manifest-group :core of empty content is the empty list-group", () => {
      const core = loader!.viewChainTable().viewFor("Type::LocalStyleManifestGroup", "core");
      expect(core?.(ctxForUrls(""))).toBe('<ul class="list-group"></ul>');
    });
  });

  describe("the mod loader's reset() drops the mod's set-module registrations", () => {
    it("removes both views from the chain table after reset()", () => {
      // The registrations live on the Right::GroupRemote set module, not on
      // the shared base-format record, so reset() clears the chain table
      // (the same restore-the-pre-load-state contract, one table over).
      const chain = loader!.viewChainTable();
      expect(typeof chain.viewFor("Right::GroupRemote", "javascript_include_tag")).toBe("function");
      expect(typeof chain.viewFor("Right::GroupRemote", "stylesheet_include_tag")).toBe("function");

      loader!.reset();

      const after = loader!.viewChainTable();
      expect(after.viewFor("Right::GroupRemote", "javascript_include_tag")).toBeUndefined();
      expect(after.viewFor("Right::GroupRemote", "stylesheet_include_tag")).toBeUndefined();
      // The base-format record never carried them, before or after.
      const flat = loader!.viewsTable();
      expect(flat["javascript_include_tag"]).toBeUndefined();
      expect(flat["stylesheet_include_tag"]).toBeUndefined();
    });
  });
});
