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

/** Escape a string the way CodeRay's HTML encoder does, in one pass:
 *  - `&`, `"`, `>`, `<` to their entity equivalents
 *  - every ASCII control code in [\x00-\x08\x0B-\x1F] to a literal space
 *  - tabs to `n` spaces (`n` = tabWidth; upstream default 8)
 *
 *  Upstream's regex is /[\t"&><\0-\x8\xB-\x1F]/ - we build a parallel
 *  pass that matches the same character set and produces the same bytes. */
export function coderayEscape(input: string, tabWidth = 8): string {
  if (input.length === 0) return input;
  // Fast-path: when the input contains nothing in the escape set, no work.
  if (!/[\t"&><\x00-\x08\x0B-\x1F]/.test(input)) return input;
  const tabReplacement = " ".repeat(tabWidth);
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    const ch = input[i];
    if (ch === "&") out += "&amp;";
    else if (ch === '"') out += "&quot;";
    else if (ch === ">") out += "&gt;";
    else if (ch === "<") out += "&lt;";
    else if (ch === "\t") out += tabReplacement;
    else if (c <= 0x08 || (c >= 0x0B && c <= 0x1F)) out += " ";
    else out += ch;
  }
  return out;
}
