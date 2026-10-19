// Register A10 (decko-completeness-register-2026-10-18.md:754): the nest
// option bridge dropped 11 of the 22 shark keys a nest author may write.
//
// THE MECHANISM
//   Ruby has no per-key drop anywhere on this path. The chunk parses every
//   keymap[:shark]+[:both] key (nest.rb option_string_to_hash), merges
//   nest_name/nest_syntax (:23), and hands the WHOLE hash to content_nest
//   (format/content.rb:20-27) -> nest (format/nesting.rb:16-22) ->
//   Card::Format::Nest#initialize, where `view_opts` IS the voo's option
//   hash (format/nest.rb:13). slot_options (voo_api.rb:51-57) then
//   serializes the normalized options over slot_keys = the FULL keymap
//   minus :skip_perms (key_lists.rb:30-32) — so an authored
//   `cache:never` or `joint:·` shows up in the data-slot JSON. Children
//   inherit every keymap[:both] key (voo_api.rb:133-143
//   inherit_options_from_parent! runs over heir_keys = both + heir).
//   The port's `nestOptionEntries` (src/card/render/format.ts) emitted
//   exactly EIGHT keys (title, size, show, hide, items, unknown, type,
//   filter) and dropped the rest at the one bridge a nest option must
//   cross, so nest-authored variant/help/structure/joint/input_type/
//   header/cache/edit/separator/params/wrap could never arrive.
//
// WHAT THIS FILE PINS
//   1. The slot JSON of a nest carrying the previously-dropped keys now
//      serializes them (Ruby's slot_options slice contract).
//   2. Behavioral readers that already read the voo now receive
//      nest-authored values: variant (base.rb:59-68 date_view's
//      strftime arm), header (html/header.rb:16 header_title's tag),
//      edit (html/menu.rb:21 edit_button's :inline arm), help
//      (help.rb:32-34 help_text), joint (title.rb:45 wrapped_joint's
//      glue), separator (card-mod-list html_views.rb:16
//      standard_pointer_items' join).
//   3. The both-key inheritance: a nest-authored option survives voo
//      hops below the nest (unit pin of voo_api.rb:133-143 for the 11
//      keys the port did not carry).
//   4. wrap's normalization: a comma string becomes the array
//      normalize_wrap (voo_api.rb:68-71) produces.
//   Controls (green before and after) mark what the parser already did.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { parseNestOptions } from "../../../src/card/render/nest-syntax.js";
import { Voo } from "../../../src/card/render/format.js";

/** The bridge host's content: a titled nest carrying every key the A10
 *  census found dropped. `structure` is deliberately absent: authored
 *  structure overrides the nested card's CONTENT (base.rb:79-83
 *  structure_card), a behavioral surface beyond the bridge this file
 *  pins; its delivery rides the same generic loop the other keys prove. */
const BRIDGE_NEST =
  "{{Bridge Target|titled;variant:%Y;help:Bridge cue text;joint:@@;" +
  "input_type:text_area;header:h4;cache:never;edit:inline;separator:@SEP@;" +
  "params:button=label;wrap:modal}}";

function parseSlotJsons(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/data-slot="([^"]*)"/g)) {
    const raw = m[1]!
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    try {
      out.push(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      // non-JSON data-slot (should not happen) — skip
    }
  }
  return out;
}

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 61, name: "Pointer" });
  // the nested target and a compound card for the joint arm (the junction
  // row is SIDE-BACKED: leftId/rightId make the name resolve through the
  // same convention the fetch layer reads)
  await seedCard(s, { id: 910, name: "Bridge Target", typeId: 2, dbContent: "Bridge body" });
  await seedCard(s, { id: 911, name: "Jane Doe", typeId: 2 });
  await seedCard(s, { id: 920, name: "Musings", typeId: 2, dbContent: "musings" });
  await seedCard(s, {
    id: 912, name: "Jane Doe+Musings", typeId: 2,
    leftId: 911, rightId: 920, dbContent: "musings",
  });
  // a pointer card whose items prove the separator join
  await seedCard(s, {
    id: 913, name: "Bridge Pointer", typeId: 61,
    dbContent: "[[Bridge Target]]\n[[Jane Doe]]",
  });
  // the bridge host card: its content IS the nest
  await seedCard(s, {
    id: 914, name: "Bridge Host", typeId: 2, dbContent: BRIDGE_NEST,
  });
  await seedCard(s, {
    id: 915, name: "Joint Host", typeId: 2,
    dbContent: "{{Jane Doe+Musings|titled;joint:@@}}",
  });
  await seedCard(s, {
    id: 916, name: "Separator Host", typeId: 2,
    dbContent: "{{Bridge Pointer|content;separator:@SEP@}}",
  });
  await seedCard(s, {
    id: 917, name: "Variant Host", typeId: 2,
    dbContent: "{{Bridge Target|name;variant:upcase}}",
  });
  await seedCard(s, {
    id: 918, name: "Header Host", typeId: 2,
    dbContent: "{{Bridge Target|titled;header:h4}}",
  });
  s.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("A10: the nest-option bridge delivers every shark key to the voo", () => {
  it("CONTROL: the parser puts every dropped key in options.extra (the defect was never the parser)", () => {
    const opts = parseNestOptions(
      "titled;variant:%Y;help:Cue;joint:@@;input_type:text_area;header:h4;" +
      "cache:never;edit:inline;separator:@SEP@;params:button=label;wrap:modal",
    );
    expect(opts.extra["variant"]).toBe("%Y");
    expect(opts.extra["help"]).toBe("Cue");
    expect(opts.extra["joint"]).toBe("@@");
    expect(opts.extra["input_type"]).toBe("text_area");
    expect(opts.extra["header"]).toBe("h4");
    expect(opts.extra["cache"]).toBe("never");
    expect(opts.extra["edit"]).toBe("inline");
    expect(opts.extra["separator"]).toBe("@SEP@");
    expect(opts.extra["params"]).toBe("button=label");
    expect(opts.extra["wrap"]).toBe("modal");
  });

  it("the nest's slot JSON serializes the authored keys (slot_options over the FULL keymap)", async () => {
    const html = await storage!.engine.render("Bridge Host", "core");
    const slots = parseSlotJsons(html);
    const titled = slots.find((slot) => slot["view"] === "titled");
    expect(titled, `no titled slot in ${html.slice(0, 400)}`).toBeDefined();
    // voo_api.rb:51-57 slot_options serializes normalized options over
    // slot_keys — every authored key rides.
    expect(titled!["variant"]).toBe("%Y");
    expect(titled!["help"]).toBe("Bridge cue text");
    expect(titled!["joint"]).toBe("@@");
    expect(titled!["input_type"]).toBe("text_area");
    expect(titled!["header"]).toBe("h4");
    expect(titled!["cache"]).toBe("never");
    expect(titled!["edit"]).toBe("inline");
    expect(titled!["separator"]).toBe("@SEP@");
    expect(titled!["params"]).toBe("button=label");
    // normalize_wrap (voo_api.rb:68-71): the comma string becomes an array.
    expect(titled!["wrap"]).toEqual(["modal"]);
  });

  it("variant reaches name_variant's vary arm (base.rb:21-23)", async () => {
    // name_variant: `voo.variant ? name.to_name.vary(voo.variant) : name`.
    // Oracle (name_variants.rb:5-13 vary): "upcase" is one of the
    // @@variant_methods, so vary("upcase") on "Bridge Target" answers
    // "BRIDGE TARGET" (verified: the same @@variant_methods table the port's
    // applyVariant transcribes, name.ts:1098-1120).
    const html = await storage!.engine.render("Variant Host", "core");
    expect(html).toContain("BRIDGE TARGET");
    const direct = await storage!.engine.render("Bridge Target", "name", {
      viewOpts: { variant: "upcase" },
    });
    expect(direct.trim()).toBe("BRIDGE TARGET");
    // control: no variant renders the stored name
    const plain = await storage!.engine.render("Bridge Target", "name");
    expect(plain.trim()).toBe("Bridge Target");
  });

  it("joint reaches wrapped_joint's glue (title.rb:45) through the title view", async () => {
    const html = await storage!.engine.render("Joint Host", "core");
    // the compound name's parts join with the authored joint span, and the
    // default "+" span is gone from the title
    expect(html).toContain("<span>@@</span>");
    expect(html).not.toContain("<span>+</span>Musings");
  });

  it("separator reaches standard_pointer_items' join (html_views.rb:16)", async () => {
    const html = await storage!.engine.render("Separator Host", "core");
    expect(html).toContain("@SEP@");
  });

  it("header reaches header_title's tag two voo hops down (html/header.rb:16)", async () => {
    const html = await storage!.engine.render("Header Host", "core");
    // header_title renders INSIDE titled -> header -> header_title: the h4
    // proves both the bridge delivery and the both-key inheritance.
    expect(html).toContain('<h4 class="d0-card-header-title">');
  });

  it("edit:inline reaches edit_button's view choice (html/menu.rb:21)", async () => {
    const html = await storage!.engine.render("Bridge Target", "edit_button", {
      viewOpts: { edit: "inline" },
    });
    expect(html).toContain("/edit_inline");
    // the no-opt control still renders the standard :edit form
    const plain = await storage!.engine.render("Bridge Target", "edit_button");
    expect(plain).toContain("/edit");
    expect(plain).not.toContain("/edit_inline");
  });

  it("help reaches help_text's voo arm (help.rb:32-34)", async () => {
    const html = await storage!.engine.render("Bridge Target", "help", {
      viewOpts: { help: "Custom cue text" },
    });
    expect(html).toContain("Custom cue text");
  });

  it("CONTROL: a nest without the opts renders the default bytes", async () => {
    await seedCard(storage!, {
      id: 919, name: "Plain Host", typeId: 2,
      dbContent: "{{Bridge Target|titled}}",
    });
    storage!.fetcher.installNameEnvironment();
    const html = await storage!.engine.render("Plain Host", "core");
    expect(html).not.toContain("@SEP@");
    expect(html).not.toContain("<span>@@</span>");
    expect(html).toContain('<h2 class="d0-card-header-title">');
  });

  it("both-key inheritance: every keymap[:both] key the nest sets flows to child voos (voo_api.rb:133-143)", () => {
    const parent = new Voo(undefined, "titled", {
      structure: "S", variant: "V", joint: "J", input_type: "I", type: "T",
      header: "H", cache: "C", edit: "E", separator: "S2", filter: "F",
      params: "P",
    });
    // a child that sets NOTHING inherits all eleven (Ruby: ||=
    // parent.live_options[key] for each heir key)
    const child = new Voo(parent, "content", {});
    for (const key of [
      "structure", "variant", "joint", "input_type", "type", "header",
      "cache", "edit", "separator", "filter", "params",
    ]) {
      expect(child.opts[key], key).toBe(parent.opts[key]);
    }
    // a child that SETS its own value overrides (the ||= arm)
    const overriding = new Voo(parent, "content", { header: "h5" });
    expect(overriding.opts["header"]).toBe("h5");
    // the shark-only keys do NOT inherit (wrap is keymap[:shark])
    const wrapParent = new Voo(undefined, "titled", { wrap: ["modal"] });
    const wrapChild = new Voo(wrapParent, "content", {});
    expect(wrapChild.opts["wrap"]).toBeUndefined();
  });
});
