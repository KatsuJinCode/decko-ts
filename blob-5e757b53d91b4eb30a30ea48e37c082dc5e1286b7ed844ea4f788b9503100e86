// WITHHELD UNTIL DISCLOSURE. Card::Content.clean! (card-1.110.0
// lib/card/content/clean.rb) as card-1.110.0 runs it, so the withheld
// assertions can measure where the port's cleaner differs from it. This file is
// excluded from every release package and is loaded only when present; when it
// is absent the public suites print `[withheld until disclosure] NOT RUN` on
// stderr. See docs/SECURITY.md ("Stored HTML is sanitised safely").
//
// Nothing here is a copy of upstream's source: the pieces the upstream cleaner
// is assembled from (its tag expression, its allowlist, its attribute read and
// its clean_spaces) are the port's own modules, imported below, and the
// composition below is what makes them run as upstream composes them.

import { ALLOWED_TAGS, cleanSpaces, rubyHtmlAttribs, TAG_RE } from "../../src/card/actions/content-clean.js";

/** Card::Content.clean! exactly as card-1.110.0 runs it, with the port's
 *  modules composed the way upstream composes them. Never used to store
 *  content; the port's own cleaner is `cleanContent`. */
export function rubyCleanContent(input: string): string {
  const tagged = input
    .replace(TAG_RE, (_raw, slash: string, name: string, attrs: string) => {
      const tag = name.toLowerCase();
      const okAttrs = ALLOWED_TAGS.get(tag);
      if (okAttrs === undefined) return " ";
      return `<${slash}${rubyHtmlAttribs(tag, attrs, okAttrs)}>`;
    })
    .replace(/<!--[^\n]*?-->/g, "");
  return cleanSpaces(tagged);
}