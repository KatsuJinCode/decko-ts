// CodeRay HTML token encoder: the span-assembly half of
// coderay-1.1.3 lib/coderay/encoders/html.rb.
//
// A scanner decides WHAT each token is; this decides what the token looks
// like in the output. Keeping the two apart is what makes the output
// byte-faithful, because every span the deck emits comes from ONE place:
//
//   text_token text, kind                      html.rb:199-208
//     style = @span_for_kinds[@last_opened ? [kind, *@opened] : kind]
//     text  = escape(text)
//     style ? out << style << text << '</span>' : out << text
//
//   begin_group kind                           html.rb:211-214
//     out << (@span_for_kinds[...] || '<span>')
//     @opened << kind; @last_opened = kind
//
//   end_group kind / close_span                html.rb:215-217, 262-266
//     @out << '</span>'; @last_opened = @opened.last
//
// and `@span_for_kinds` (html.rb:239-259) is a memo over
//
//   css_class = TokenKinds[kinds.first]       false for :operator/:space/
//   style     = css.get_style_for_css_classes  :plain and anything the
//                                              theme does not know
//
// so a token whose KIND is unstyled prints with NO WRAPPER AT ALL, and a
// group whose kind is unstyled prints a BARE <span>. A kind PATH (a token
// inside an open group) resolves through the theme's descendant rules -
// `.string .content`, not `.content`.
//
// The div encoder runs with `:css => :style` and `:hint => false`
// (encoders/div.rb:12-20), so @set_last_opened is true (a group path is
// always consulted) and no title attribute is ever written.

import { styleForKindPath } from "./alpha-style.js";
import { coderayEscape } from "./escape.js";
import { tokenKindClass } from "./token-kinds.js";

/** html.rb:261 `close_span` and the `@opened` stack: the kind path a token
 *  inside the open groups would resolve through. */
export class HtmlTokenEncoder {
  private out = "";
  /** html.rb @opened - the stack of open GROUP kinds, outermost first. */
  private readonly opened: string[] = [];
  /** html.rb @last_opened - the innermost open group, or undefined at
   *  depth 0. Only groups move it; a text_token never does. */
  private lastOpened: string | undefined;
  /** html.rb @span_for_kinds - the memo, keyed by the kind or the kind
   *  path. Cleared past 100 entries (html.rb:254) purely for memory; the
   *  values are a pure function of the key, so the eviction is invisible
   *  in the output. */
  private readonly spanCache = new Map<string, string | undefined>();

  /**
   * html.rb:239-259 make_span_for_kinds, for one kind or kind path.
   * Returns the opening `<span ...>` string, or undefined where Ruby gets
   * nil (the caller then writes no wrapper at all for a text_token, and a
   * bare `<span>` for a begin_group).
   */
  private spanFor(kinds: readonly string[]): string | undefined {
    const key = kinds.join("\0");
    const cached = this.spanCache.get(key);
    if (cached !== undefined || this.spanCache.has(key)) return cached;
    const span = this.buildSpan(kinds);
    if (this.spanCache.size >= 100) this.spanCache.clear();
    this.spanCache.set(key, span);
    return span;
  }

  private buildSpan(kinds: readonly string[]): string | undefined {
    // html.rb:233 css_class_for_kinds: `kinds.is_a?(Symbol) ? kinds :
    // kinds.first` - the CLASS of a path comes from its FIRST kind only.
    const cssClass = tokenKindClass(kinds[0] ?? "");
    if (cssClass === false) return undefined; // `if css_class || title` fails
    // html.rb:242 style_for_kinds maps the WHOLE path, so a token inside a
    // :string group resolves through `.string .content` and friends.
    const style = styleForKindPath(kinds.map((kind) => String(tokenKindClass(kind))));
    // Ruby: `"<span#{title}#{" style=\"#{style}\"" if style}>"`. `style` is
    // "" for a class with no rules at all, and "" is TRUTHY in Ruby - so
    // that case writes `<span style="">` rather than a bare `<span>`.
    return style ? `<span style="${style}">` : "<span>";
  }

  /** html.rb:199-208 text_token. */
  textToken(text: string, kind: string): void {
    const kinds = this.lastOpened === undefined ? [kind] : [kind, ...this.opened];
    const span = this.spanFor(kinds);
    const escaped = coderayEscape(text);
    this.out += span === undefined ? escaped : `${span}${escaped}</span>`;
  }

  /** html.rb:211-214 begin_group. */
  beginGroup(kind: string): void {
    const kinds = this.lastOpened === undefined ? [kind] : [kind, ...this.opened];
    const span = this.spanFor(kinds);
    this.out += span ?? "<span>";
    this.opened.push(kind);
    this.lastOpened = kind; // @set_last_opened is true for :css => :style
  }

  /** html.rb:215-217 end_group -> close_span. */
  endGroup(): void {
    if (this.opened.pop() === undefined) return;
    this.out += "</span>";
    this.lastOpened = this.opened[this.opened.length - 1];
  }

  /** html.rb:195-198 finish - `@out << '</span>' while @opened.pop`:
 *  close every group the token stream left open (a <script> body ending
 *  inside a JS :key group - java_script.rb:215 only closes :string/:regexp
 *  - reaches this through scanHtml's finish). */
  closeAllGroups(): void {
    while (this.opened.pop() !== undefined) {
      this.out += '</span>';
    }
    this.lastOpened = undefined;
  }

  /** The assembled bytes. */
  toString(): string {
    return this.out;
  }
}
