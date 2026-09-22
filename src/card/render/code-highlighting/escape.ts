// CodeRay HTML escape table.
//
// Truth source: coderay-1.1.3 lib/coderay/encoders/html.rb#make_html_escape_hash.
// Encoder.html.rb builds the table once and uses it via HTML_ESCAPE_PATTERN
// to map every occurrence in a text_token. The corpus content has no tabs or
// ASCII control codes, but the table has to match the upstream behavior so
// any input the corpus seeds later (a CSS file with a tab, say) renders byte-
// identically.
//
// `tabWidth` defaults to 8 to match the upstream default (:tab_width => 8).
// Set it to 0 (false upstream) to keep tabs verbatim - none of the corpus
// paths do this, so the default is preserved here for parity.

const BASE_HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  ">": "&gt;",
  "<": "&lt;",
};

// (Array(0x00..0x8) + Array(0xB..0x1F)).each -> " "  (encoder.rb:139)
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B-\x1F]/g;

/** Escape a string the way CodeRay's HTML encoder does:
 *  - `&`, `"`, `>`, `<` to their entity equivalents
 *  - every ASCII control code in [\x00-\x08\x0B-\x1F] to a literal space
 *  - tabs to `n` spaces (`n` = tabWidth; upstream default 8)
 *
 *  No-op for substrings that contain none of the above - encoder.rb#text_token
 *  only escapes when the regex matches, and so does this. */
export function coderayEscape(input: string, tabWidth = 8): string {
  let out = input;
  if (out.indexOf("\t") !== -1) {
    out = out.replace(/\t/g, " ".repeat(tabWidth));
  }
  if (CONTROL_CHAR_REGEX.test(out)) {
    out = out.replace(CONTROL_CHAR_REGEX, " ");
    // Reset lastIndex for shared regexes - CONTROL_CHAR_REGEX has the /g flag.
  }
  if (out !== input) {
    // base HTML escape - cheap to just run; only the affected characters change.
    for (const [k, v] of Object.entries(BASE_HTML_ESCAPE)) {
      if (out.indexOf(k) !== -1) out = out.split(k).join(v);
    }
  }
  return out;
}
