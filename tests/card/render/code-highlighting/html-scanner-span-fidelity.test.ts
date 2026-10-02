// CodeRay html-scanner span fidelity (lane templatenest-coderay).
//
// The mechanism this pins is encoders/html.rb's span assembly, not the
// scanner's token boundaries. `CodeRay.scan(content, :html).div` resolves
// every emitted token through ONE table:
//
//   span_for_kinds = make_span_for_kinds(:style, false)   html.rb:236
//   css_class      = TokenKinds[kinds.first]             token_kinds.rb
//   style          = css.get_style_for_css_classes(...) encoders/html/css.rb
//
// `TokenKinds` maps a kind symbol to its CSS class name, or to `false`
// for the kinds the theme leaves unstyled (:operator, :space, :plain,
// :ident). `false` is not "unstyled" - it makes `make_span_for_kinds`
// return nil, and a nil span means NO WRAPPER AT ALL (text_token's
// `if style ... else @out << text`; begin_group's `|| '<span>'`).
//
// When a group is open the lookup key becomes the kind PATH
// (`[kind, *@opened]`, html.rb:203), so a `:content` token inside a
// `:string` group resolves through the theme's `.string .content` rule
// rather than the bare `.content` rule. The engine's previous scanner
// looked kinds up in a four-entry table (error/tag/doctype/inline) and
// emitted a bare `<span>` for every quoted attribute value, which is why
// page 22747's layout body rendered
//
//   ...&lt;body</span> class=<span>&quot;d-flex flex-column h-100&quot;</span>...
//
// where Ruby emits
//
//   ...&lt;/body</span> <span style="color:#b48">class</span>=
//     <span style="background-color:hsla(0,100%,50%,0.05)">
//       <span style="color:#710">&quot;</span>
//       <span style="color:#D20">d-flex flex-column h-100</span>
//       <span style="color:#710">&quot;</span></span>...
//
// Every fixture below was produced by tools/capture-coderay-layout-
// template-oracle.rb calling CodeRay.scan(content, :html).div on this
// machine's coderay-1.1.3 gem. The `layout-type-template-22747` fixture
// is byte-identical to the CodeRay block embedded in the captured page
// oracle for card 22747 (tmp/raw-ground-truth/expected-v2/page-lane/
// recapture-raw-shard-000003.jsonl id 22747) - the same 1,678 bytes, so
// a pass here is a pass on the page's real bytes, not a proxy.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { highlight } from "../../../../src/card/render/code-highlighting/index.js";
import { ALPHA_STYLES, styleForKindPath } from "../../../../src/card/render/code-highlighting/alpha-style.js";
import { TOKEN_KINDS, tokenKindClass } from "../../../../src/card/render/code-highlighting/token-kinds.js";

// Repo-relative: the committed coderay oracle captures (the fixture set is
// tracked, so every checkout/worktree resolves its own copy — the earlier
// absolute path into another worktree made this suite fail on any tree
// that was not that one).
const CAPTURED = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/captured/coderay",
);

function loadOracle(fixture: string): string {
  return readFileSync(resolve(CAPTURED, `${fixture}.html`), "utf8");
}

function inner(html: string): string {
  return html
    .slice('<div class="CodeRay">\n  <div class="code"><pre>'.length, -"</pre></div>\n</div>\n".length);
}

describe("code-highlighting: html scanner span fidelity vs the coderay gem", () => {
  // The card 22747 layout body. The `class` attribute pins attribute_name
  // (#b48), the bare `=` pins :operator as a NO-SPAN token, and the
  // quoted value pins the :string group's own style plus its :delimiter
  // and :content children. The {{...}} marks between tags must survive
  // the scanner untouched - that is the input the :template nest mode
  // (layout_type.rb:12-18) then re-emits literally.
  it("layout-type-template-22747 reproduces the page oracle's CodeRay block", () => {
    const content =
      '<body class="d-flex flex-column h-100">\n' +
      "  <header>{{:header|core}}</header>\n" +
      '  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n' +
      '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n' +
      "</body>";
    expect(highlight(content, "html")).toBe(loadOracle("layout-type-template-22747"));
  });

  // attribute_name on every attribute shape, :operator on '=', the bare
  // :attribute_value span on an unquoted value, the :string group on both
  // quote styles, and the `hidden` attribute with no '=' at all.
  it("html-scanner-attributes wraps every attribute shape", () => {
    const content = `<div class=x data-y='z' hidden empty= >text</div>`;
    expect(highlight(content, "html")).toBe(loadOracle("html-scanner-attributes"));
  });

  // :comment, :doctype, :preprocessor, the second :comment branch (<?php),
  // :entity, and the :plain run that must carry NO wrapper.
  it("html-scanner-initial-kinds styles comment/doctype/preprocessor/entity but not plain", () => {
    const content = `<!-- c --><!DOCTYPE html><?xml version="1.0"?><?php echo 1; ?>) &amp;&#65;&#x42;tail`;
    expect(highlight(content, "html")).toBe(loadOracle("html-scanner-initial-kinds"));
  });

  // :tag on the open tag, the self-closing `/>` and the close tag; the
  // :error kind on a bare '<' / '&' / '>' in text position.
  it("html-scanner-tag-shapes styles tag delimiters and error tokens", () => {
    const content = `<img src="x"/>a<br />b< c & d>`;
    expect(highlight(content, "html")).toBe(loadOracle("html-scanner-tag-shapes"));
  });

  // A quoted value that never closes: the whitespace run inside the
  // :string group is a :space token (no wrapper, TokenKinds false) so the
  // group span stays open across the newline, and the '>' that ends the
  // bogus attribute is an :error token OUTSIDE the group.
  it("html-scanner-unterminated-value keeps the string group open across the newline", () => {
    const content = `<div class="oops\nnext>tail</div>`;
    expect(highlight(content, "html")).toBe(loadOracle("html-scanner-unterminated-value"));
  });
});

describe("code-highlighting: the kind -> span table the encoder consults", () => {
  // html.rb:css_class_for_kinds reads TokenKinds[kinds.first]; a `false`
  // entry suppresses the wrapper entirely. These are the four kinds the
  // engine's old scanner happened to get right by accident (its table had
  // no entry for them) and the ones whose styles it dropped.
  it("TokenKinds marks the unstyled kinds false, not absent", () => {
    expect(TOKEN_KINDS.operator).toBe(false);
    expect(TOKEN_KINDS.space).toBe(false);
    expect(TOKEN_KINDS.plain).toBe(false);
    expect(TOKEN_KINDS.ident).toBe(false);
    expect(tokenKindClass("no_such_kind")).toBe(false); // Hash.new(false)
    expect(TOKEN_KINDS.attribute_name).toBe("attribute-name");
    expect(TOKEN_KINDS.attribute_value).toBe("attribute-value");
    expect(TOKEN_KINDS.string).toBe("string");
    expect(TOKEN_KINDS.content).toBe("content");
    expect(TOKEN_KINDS.delimiter).toBe("delimiter");
  });

  // encoders/html/css.rb#get_style_for_css_classes: the FIRST class in the
  // path is the rule's own class; each drop moves one step down the
  // selector. The three outcomes are all different bytes, so the whole
  // table is compared against the gem's own answers (dumped by
  // tools/capture-coderay-alpha-style-paths.rb) rather than spot-checked.
  it("resolves every kind path the way the gem's CSS table does", () => {
    const rows = JSON.parse(
      readFileSync(resolve(CAPTURED, "alpha-style-kind-paths.json"), "utf8"),
    ) as Array<{
      kinds: string[];
      classes: Array<string | false>;
      style: string | null;
      style_is_nil: boolean;
    }>;
    expect(rows.length).toBeGreaterThan(50);
    const mismatches: string[] = [];
    for (const row of rows) {
      const expected = row.style_is_nil === true ? undefined : row.style;
      const actual = styleForKindPath(row.classes);
      if (actual !== expected) {
        mismatches.push(
          `${JSON.stringify(row.kinds)} -> classes ${JSON.stringify(row.classes)}: ` +
            `gem ${JSON.stringify(expected)}, port ${JSON.stringify(actual)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("distinguishes the three CSS-lookup outcomes", () => {
    // A group path resolves through the theme's descendant rule.
    expect(styleForKindPath(["content", "string"])).toBe("color:#D20");
    expect(styleForKindPath(["delimiter", "string"])).toBe("color:#710");
    // A depth-0 group rule.
    expect(styleForKindPath(["string"])).toBe("background-color:hsla(0,100%,50%,0.05)");
    // A family that exists but has no rule at depth 0: css.rb's loop never
    // assigns, so it returns nil - NO WRAPPER, not an empty style.
    expect(styleForKindPath(["content"])).toBeUndefined();
    // No family at all: css.rb:32 returns "" - which is TRUTHY in Ruby, so
    // the encoder writes <span style="">.
    expect(styleForKindPath(["no_such_class"])).toBe("");
    // A leading false (a two-deep path whose first kind is unstyled).
    expect(styleForKindPath([false, "string"])).toBe("");
  });

  it("keeps the flat kind->style view the pre-existing gate reads", () => {
    const kinds = new Set(ALPHA_STYLES.map((e) => e.kind));
    for (const kind of ["error", "tag", "doctype", "inline", "attribute_name"]) {
      expect(kinds.has(kind)).toBe(true);
    }
  });
});
