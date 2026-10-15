// Regression pins for two parity defects and their fixes in the shared
// render layer:
//
// 1. nest-syntax optionStringToHash guarded on SHARK_KEYS BEFORE the :item
//    branch, making the branch dead code — every `item:` nest option was
//    silently dropped. Ruby checks `key == :item` first
//    (card-mod-content lib/card/content/chunk/nest.rb:54-57) and folds it
//    into options[:items][:view]; :item is not a shark key in either
//    implementation.
//
// 2. rule-bar-right's base-branch one-line fallback truncated at 50. The
//    bare `truncate` call in card-mod-rules bar_view.rb:19-21 resolves to
//    card-mod-format content.rb:43-53 whose limit is
//    ONE_LINE_CHARACTER_LIMIT = 60 (content.rb:1), not Rails' 50 default.
//    No pinned fixture carries these bytes, so the fix is gem-cited, not
//    fixture-derived.
import { describe, expect, it } from "vitest";
import { parseNestOptions, scanNests } from "../../../src/card/render/nest-syntax.js";
import { ruleBarRightHtml } from "../../../src/card/render/rule-bar-right.js";
import type { RenderCard } from "../../../src/card/render/format.js";

describe("nest item: options fold into items.view (nest.rb:54-57)", () => {
  it("parseNestOptions folds a lone item: option into items.view", () => {
    expect(parseNestOptions("item: title")).toEqual({
      extra: {},
      items: { view: "title" },
    });
  });

  it("item: coexists with shark keys in one option list", () => {
    expect(parseNestOptions("hide:menu;item:title")).toEqual({
      extra: {},
      hide: "menu",
      items: { view: "title" },
    });
  });

  it("scanNests preserves the item: option bytes through the parsed nest", () => {
    const pieces = scanNests("look at {{My Card|item: title}} here");
    expect(pieces).toHaveLength(3);
    expect(pieces[1].kind).toBe("nest");
    expect(pieces[1].nest?.options).toEqual({
      extra: {},
      items: { view: "title" },
    });
  });

  it("a non-shark, non-item key is still dropped (nest.rb:57)", () => {
    expect(parseNestOptions("bogus:x")).toEqual({ extra: {} });
  });
});

describe("rule bar one-line fallback truncates at 60 (content.rb:1)", () => {
  // The fixture's right is a right set with NO one_line_content of its own
  // (card-mod-layout set/right/head.rb:12-13 is the only *layout module and
  // it covers *head), so the walk reaches the base one_line_content method
  // (card-mod-format set/all/content.rb:47-49). The four permission rights
  // are NOT here: their right sets include Abstract::Permission
  // (right/{create,read,update,delete}.rb:1), whose one_line_content
  // (permission.rb:22-24) renders the item list instead - see the
  // dispatch test below.
  const base = (content: string): RenderCard =>
    ({
      name: { s: "User+*layout", rightName: { s: "*layout" } },
      setKeys: "type PlusRight RULE",
      typeName: "Type",
      dbContent: content,
    }) as unknown as RenderCard;

  it("content at exactly the limit passes through untruncated", () => {
    const content = "a".repeat(60);
    expect(ruleBarRightHtml(base(content))).toContain(content);
  });

  it("content over the limit truncates Rails-style: 57 chars + ... (total 60)", () => {
    // Rails truncate omits the omission from the budget: the TOTAL length
    // is `length` (60), so 60 chars stay untruncated and 61 become
    // 57 + "..." (card-mod-format content.rb:43-53 Rails truncate
    // semantics).
    const html = ruleBarRightHtml(base("b".repeat(61)));
    expect(html).toContain("b".repeat(57) + "...");
    expect(html).not.toContain("b".repeat(58));
    expect(html).not.toContain("b".repeat(61));
  });

  it("a permission-right rule card takes the permission one_line_content whatever its type (right set outranks type)", () => {
    // right/create.rb:1 includes Abstract::Permission; its one_line_content
    // (permission.rb:22-24) is render_core items: { view: :link }, and the
    // permission :core (permission.rb:14-20) renders :pointer_core for any
    // content that is not "_left". The card's TYPE does not enter that
    // dispatch, so a Basic-typed *create rule still gets the pointer wrapper
    // and never the 60-char truncation of the base method.
    const html = ruleBarRightHtml(
      ({
        name: { s: "User+*create", rightName: { s: "*create" } },
        setKeys: "type PlusRight RULE",
        typeName: "Basic",
        dbContent: "b".repeat(61),
      }) as unknown as RenderCard,
    );
    expect(html).toContain('<div class="pointer-list">');
    expect(html).not.toContain("...");
  });

  it("a *following right rule card's one-line is the empty string inside the bar wrapper (follow set/right/following.rb:28-30)", () => {
    // Right::Following's `view :one_line_content do "" end` ranks above the
    // rule set's bar view, so the nested one-line is "" and the bar wrapper is
    // the only markup left - the text the 61 chars would otherwise cut to is
    // never reached.
    const html = ruleBarRightHtml(
      ({
        name: { s: "User+*following", rightName: { s: "*following" } },
        setKeys: "type PlusRight RULE",
        typeName: "Basic",
        dbContent: "b".repeat(61),
      }) as unknown as RenderCard,
    );
    expect(html).toBe('<div class="text-muted one-line"></div>');
  });
});

describe("rule bar one-line for list/pointer typeCode dispatches to pointer-list body", () => {
  // Regression pin: a list-typed rule card's bar-right renders the compact
  // pointer-list wrapper. Expected shape:
  //   <div class="text-muted one-line">
  //     <div class="pointer-list">
  //       <div class="pointer-item item-link">
  //         <a class="wanted-card" href="/uflluwkwvaenx">
  //           <span class="card-title" title="uflluwkwvaenx">uflluwkwvaenx</span>
  //         </a>
  //       </div>
  //     </div>
  //   </div>
  //
  // Abstract::List overrides :one_line_content (card-mod-list-0.20.0
  // set/abstract/01_list/html_views.rb) — the compact-mode render_core
  // wraps items in `<div class="pointer-list"><div class="pointer-item
  // item-link">…</div></div>`. Without the typeCode dispatch, the base
  // branch falls through to truncatedCore(card.dbContent) and the
  // wrapper becomes raw content (the card name leaked as text replacing
  // the text-muted block).
  const listRuleCard = (content: string, typeCode: "list" | "pointer" = "list"): RenderCard =>
    ({
      name: { s: "*star+*delete", rightName: { s: "*delete" } },
      setKeys:
        "ALL ALL_PLUS TYPE-xhor RSTAR RULE RIGHT-Xdelete TYPE_PLUS_RIGHT-exi-Xdelete SELF-Xstar-Xdelete",
      typeName: "xhor",
      typeCode,
      dbContent: content,
    }) as unknown as RenderCard;

  it("renders the captured corpus:6560 wrapper shape for a list-typed rule card", () => {
    const html = ruleBarRightHtml(listRuleCard("uflluwkwvaenx"));
    // The text-muted one-line outer wrapper (rule bar_view.rb:15-20).
    expect(html).toContain('<div class="text-muted one-line">');
    // The compact-mode pointer-list inner wrapper (NOT the content-view
    // "card-list card-list-bar pointer-list" form — the bar-right uses
    // the simpler "pointer-list" wrapper).
    expect(html).toContain('<div class="pointer-list">');
    // The compact-mode item form is item-link (NOT the content-view
    // item-bar form).
    expect(html).toContain('<div class="pointer-item item-link">');
    // The wanted-card link (the item is unseeded, so the link view
    // classifies it as wanted).
    expect(html).toContain('<a class="wanted-card" href="/uflluwkwvaenx">');
    expect(html).toContain('<span class="card-title" title="uflluwkwvaenx">uflluwkwvaenx</span>');
    // The raw content must NOT leak as bare text into the text-muted
    // wrapper — that is the bucket-defect shape.
    expect(html).not.toMatch(/<div class="text-muted one-line">uflluwkwvaenx</);
  });

  it("dispatches to pointer-list for typeCode=pointer as well", () => {
    const html = ruleBarRightHtml(listRuleCard("uflluwkwvaenx", "pointer"));
    expect(html).toContain('<div class="pointer-list">');
    expect(html).toContain('<div class="pointer-item item-link">');
    expect(html).toContain('<a class="wanted-card" href="/uflluwkwvaenx">');
  });

  it("renders each dbContent item as its own pointer-item item-link (newlines split)", () => {
    const html = ruleBarRightHtml(listRuleCard("foo\nbar\nbaz"));
    expect(html.match(/<div class="pointer-item item-link">/g)).toHaveLength(3);
    expect(html).toContain('href="/foo"');
    expect(html).toContain('href="/bar"');
    expect(html).toContain('href="/baz"');
  });

  it("strips [[ ]] brackets from item names (item.rb#strip_item)", () => {
    const html = ruleBarRightHtml(listRuleCard("[[foo]]"));
    expect(html).toContain('href="/foo"');
    expect(html).not.toContain("[[");
  });
});
