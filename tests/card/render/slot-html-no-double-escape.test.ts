// emitAttrs / emitHamlAttrs must escape caller values exactly once,
// matching Rails' content_tag → tag_option → unwrapped_html_escape
// (actionview-7.2.3.2 lib/action_view/helpers/tag_helper.rb:310-325 +
// activesupport-7.2.3.2 lib/active_support/core_ext/erb/util.rb:10-17).
// For the raw-string case (a plain String, NOT a SafeBuffer), the helper
// does the full HTML_ESCAPE pass — `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`,
// `"` → `&quot;`, `'` → `&#39;`. For the SafeBuffer case the same call
// returns the value as-is (Ruby's `html_safe?` check); the TS port sees
// only the raw-string branch today — every caller hands emitAttrs a
// pre-escaped string instead of the raw value, which is the call-site
// half of the double-escape.
//
// The defect: the engine emitted `data-card-name="Sample Card - I&amp;#39;m
// Staying Inside"` where the single-escape form is
// `data-card-name="Jane Doe - I&#39;m Staying Inside"`. The `&amp;` is the
// double-escape artefact: callers pass h(name.s) — already `&#39;` — and
// emitAttrs then re-escapes `&` to `&amp;`, producing `&amp;#39;`.
//
// The fix lands on every emitAttrs caller
// that pre-escaped (views.ts:165 / 2298 / 2590, format.ts:653,
// pointer-list.ts:281, mod-search, mod-edit, mod-history,
// mod-view-helpers) — they now pass the raw value, and emitAttrs does the
// single escape. The help-popover path that hands emitAttrs a literal
// `&nbsp;` and depends on the helper escaping `&` → `&amp;` (the
// `data-bs-content="&amp;nbsp;"` shape) keeps working.
//
// THE OTHER SIDE: emitHamlAttrs is the
// same gem method's HAML twin and escapes at a DIFFERENT level, because
// Haml has no html_safe? escape hatch. bar.haml / box.haml pass the very
// same `wrap_data` payload as a HAML `data:` attribute, so an
// apostrophe-bearing name renders `data-card-name='Jane&amp;#39;s Blog'`
// there while the content_tag slot wrap renders the single-escaped
// `data-card-name="Jane Doe - I&#39;m Staying Inside"`. Two levels, one
// payload, and the level is decided by which emitter crossed the attribute
// boundary. The three emitHamlAttrs tests below pin that.

import { describe, it, expect } from "vitest";
import {
  emitAttrs,
  emitHamlAttrs,
  h,
  htmlEscapeExceptQuotes,
  slotOptionsJson,
} from "../../../src/card/render/slot-html.js";

describe("emitAttrs / emitHamlAttrs — single-escape, no double-escape (Rails content_tag parity)", () => {
  it("emitAttrs escapes a RAW apostrophe in data-card-name (no double-escape)", () => {
    // Caller (views.ts:165 / wrap.rb:50-54) now passes the raw
    // card.name.s — `"Jane Doe - I'm Staying Inside"` — and emitAttrs
    // does the single Rails content_tag escape:
    // `data-card-name="Jane Doe - I&#39;m Staying Inside"`.
    const html = emitAttrs({
      "data-card-name": "Jane Doe - I'm Staying Inside",
      "data-card-type-id": 814,
    });
    expect(html).toBe(
      ' data-card-name="Jane Doe - I&#39;m Staying Inside" data-card-type-id="814"',
    );
    expect(html).not.toContain("&amp;#39;");
    expect(html).not.toContain("&amp;");
  });

  it("emitAttrs escapes raw `<hr>` / `<p>` text in data-card-name (no double-escape)", () => {
    // A stored name carrying `<hr>`, `<p>`, `<em>` as literal text. After
    // emitAttrs' single escape they become `&lt;hr&gt;`, `&lt;p&gt;`,
    // `&lt;em&gt;` — NOT `&amp;lt;hr&amp;gt;` (the double-escape the
    // engine emitted before the fix).
    const html = emitAttrs({ "data-card-name": "hmmm<hr><p>broken!</p>" });
    expect(html).toBe(' data-card-name="hmmm&lt;hr&gt;&lt;p&gt;broken!&lt;/p&gt;"');
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;gt;");
  });

  it("emitAttrs escapes a pre-escaped value as if it were raw (single pass, NOT idempotent over caller input)", () => {
    // Pin the contract for the help-popover path: the caller hands
    // emitAttrs a literal `&nbsp;` (the helper.rb:48 default), and the
    // helper MUST turn the `&` into `&amp;` (the
    // `data-bs-content="&amp;nbsp;"` shape). This is the SAME contract
    // that fires for raw apostrophes — there's no caller-side safe-flag
    // in the TS port, so the escape is unconditional.
    const html = emitAttrs({ "data-bs-content": "&nbsp;" });
    expect(html).toBe(' data-bs-content="&amp;nbsp;"');
  });

  it("emitAttrs preserves insertion order (Rails content_tag semantics)", () => {
    // The emitAttrs contract documents insertion-order emission
    // (slot-html.ts:67-74). This test pins it alongside the escape
    // contract so a future refactor that swaps to a sorted key order or
    // a different escape rule cannot quietly pass.
    const html = emitAttrs({
      "data-card-name": "A",
      "data-card-id": "1",
      "data-card-type-name": "Basic",
    });
    expect(html).toBe(' data-card-name="A" data-card-id="1" data-card-type-name="Basic"');
  });

  it("emitAttrs encodes the data-slot JSON's `\"` chars (the ONE thing htmlEscapeExceptQuotes does NOT cover)", () => {
    // The data-slot value flows through htmlEscapeExceptQuotes
    // (slot-html.ts:115-122) which encodes & ' < > but NOT `"` (single-
    // quoted contexts need only the four; the JSON's `"` chars stay
    // literal there). emitAttrs must encode `"` → `&quot;` so the JSON
    // fits inside a `"..."` attribute context without breaking the
    // attribute's own quoting. The emitted byte shape is exactly this:
    // `data-slot="{&quot;view&quot;:&quot;bar&quot;...}"`.
    const slot = slotOptionsJson({ view: "bar", type: "consideration" });
    const html = emitAttrs({ "data-slot": slot });
    expect(html).toContain(
      ' data-slot="{&quot;view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;consideration&quot;}"',
    );
  });

  it("emitHamlAttrs applies the FULL Haml escape_attrs pass (two levels on a h()-escaped name)", () => {
    // Haml's escape_attrs semantics: haml-5.2.2
    // lib/haml/attribute_builder.rb:51-59 runs every attribute value through
    // Haml::Helpers.html_escape_without_haml_xss (= CGI.escapeHTML,
    // lib/haml/helpers.rb:609-614) whenever escape_attrs is truthy — Haml's
    // default (lib/haml/options.rb:70-73). There is NO html_safe? branch,
    // unlike Rails' ERB::Util.unwrapped_html_escape
    // (activesupport-7.2.2 lib/active_support/core_ext/erb/util.rb:10-17).
    // (An earlier version of this pin treated the HAML escape_attrs
    // re-escape as "a separate (Ruby-side) issue, not this emitter's
    // concern" — that premise is false, the gem source above says so.)
    //
    // Consequence: the SAME wrap_data payload (card-mod-format
    // set/all/html/wrap.rb:37-48, whose "card-name" is slot_cardname = `h name`
    // per wrap.rb:50-54) is escaped ONCE when content_tag emits the slot wrap
    // and TWICE when bar.haml / box.haml emit it as a HAML `data:` attribute:
    //
    //   data-card-name='Jane&amp;#39;s Blog+*self+*layout'
    //
    // against the slot wrap's single-escaped form
    // data-card-name="Jane Doe - I&#39;m Staying Inside".
    //
    // The value handed in is `h(name)` — what Ruby's slot_cardname
    // returns — and this emitter is the SECOND pass. Both halves matter:
    // handing it the raw name here would give the one-level form, which
    // is the slot wrap's shape, not the bar's.
    const html = emitHamlAttrs({ "data-card-name": h("Jane's Blog+*self+*layout") });
    expect(html).toBe(" data-card-name='Jane&amp;#39;s Blog+*self+*layout'");
  });

  it("emitHamlAttrs escapes the other five attribute characters too (CGI.escapeHTML parity)", () => {
    // The engine's h() is byte-identical to CGI.escapeHTML's map
    // (activesupport/lib/cgi/util.rb escapeHTML TABLE_FOR_ESCAPE_HTML__:
    // ' & < > "). haml-slice-compiler.ts#renderAttribute (line 988) already
    // ported that same gem method WITH its escape; this emitter is the
    // hand-rolled twin that had drifted.
    const html = emitHamlAttrs({ title: `a&b<c>d"e'f` });
    expect(html).toBe(" title='a&amp;b&lt;c&gt;d&quot;e&#39;f'");
  });

  it("emitHamlAttrs keeps Haml's sorted key order and its unescaped-id/class merge", () => {
    // attribute_builder.rb:59 `result.sort!` sorts the RENDERED
    // ` key='value'` strings, so source order does not survive.
    const html = emitHamlAttrs({
      "data-card-name": "List",
      "data-card-id": "17465",
      "data-card-type-name": "List",
    });
    expect(html).toBe(
      " data-card-id='17465' data-card-name='List' data-card-type-name='List'",
    );
  });

  it("h() matches Ruby's ERB::Util.html_escape (single-pass full escape)", () => {
    // The escape function used by all the (now-corrected) callers'
    // non-attribute contexts (links, titles, internal hrefs). It is NOT
    // called on emitAttrs inputs any more — emitAttrs owns the
    // attribute-context escape. h() stays as a building block for
    // template-literal interpolations.
    expect(h("Jane Doe - I'm Staying Inside")).toBe(
      "Jane Doe - I&#39;m Staying Inside",
    );
    expect(h('hmmm<hr><p>broken!</p>')).toBe(
      "hmmm&lt;hr&gt;&lt;p&gt;broken!&lt;/p&gt;",
    );
  });

  it("htmlEscapeExceptQuotes matches Ruby's wrap.rb:152-158 #html_escape_except_quotes (single-quoted attrs)", () => {
    // Ruby: gsub("&", "&amp;").gsub("'", "&apos;").gsub(">", "&gt;").gsub("<", "&lt;")
    // — does NOT escape `"` (single-quoted contexts need only escape `& ' < >`).
    expect(htmlEscapeExceptQuotes("a&b<c>d'e")).toBe("a&amp;b&lt;c&gt;d&apos;e");
    expect(htmlEscapeExceptQuotes('{"a":1}')).toBe('{"a":1}');
  });
});