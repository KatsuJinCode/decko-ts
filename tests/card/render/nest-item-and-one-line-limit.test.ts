// Regression pins for two parity defects found by the card-mod porting
// fleets (2026-09-22) and fixed in the shared render layer:
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
//    No captured oracle pins these bytes (grep over fixtures/captured,
//    2026-09-22), so the fix is gem-cited, not fixture-derived.
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
  const base = (content: string): RenderCard =>
    ({
      name: { s: "User+*create", rightName: { s: "*create" } },
      setKeys: "type PlusRight RULE",
      typeName: "Type",
      dbContent: content,
    }) as unknown as RenderCard;

  it("content at exactly the limit passes through untruncated", () => {
    const content = "a".repeat(60);
    expect(ruleBarRightHtml(base(content))).toContain(content);
  });

  it("content over the limit truncates at 60 with the ellipsis", () => {
    const html = ruleBarRightHtml(base("b".repeat(61)));
    expect(html).toContain("b".repeat(60) + "...");
    expect(html).not.toContain("b".repeat(61));
  });
});
