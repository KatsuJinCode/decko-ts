// URI scanner trailing word boundary + TLD list parity.
//
// Ruby truth (card-mod-content-0.20.0 lib/card/content/chunk/uri.rb, the gem
// the reference app runs):
//   * HostUri's prefix_re carries a `\b` AFTER the host pattern:
//     `(?:(?!#{REJECTED_PREFIX_RE})#{HOST})\b` (uri.rb:123-127, HOST
//     built at :118-122 from GENERIC + COUNTRY). EmailUri carries the same
//     `\b` (:83-90). The Uri (scheme) class carries NO `\b` (:38-42).
//   * The `\b` is what keeps `ms.dena` plain: the host body matches
//     `ms.` + TLD `de`, then `e`->`n` is word->word — no boundary — so the
//     prefix match fails and no URI chunk registers. The engine's
//     URI_HOST_REGEXP lacked it and autolinked `ms.de` inside `ms.dena`
//     (`<a target="_blank" class="external-link" href="http://ms.de">
//     ms.de</a>na`).
//   * The TLD alternation is the gem's GENERIC + COUNTRY lists verbatim.
//     The engine carried `me` (absent from the gem's COUNTRY — it goes
//     md|mg) and lacked `si` (gem: sh|si|sj), so `.me` hosts autolinked
//     where the reference leaves plain and `.si` hosts stayed plain where the
//     reference autolinks. Both directions are pinned here.
//
// JS `\b` and Ruby's Onigmo `\b` agree on this pattern's ASCII alphabet
// (letters, digits, underscore are word chars on both).

import { describe, expect, it } from "vitest";
import { expandContentLinks } from "../../../src/card/render/format.js";

describe("URI scanner: HostUri/EmailUri trailing word boundary (uri.rb prefix_re \\b)", () => {
  it("leaves ms.dena plain (trailing word chars block the boundary)", () => {
    const out = expandContentLinks("---Love, ms.dena");
    expect(out).toBe("---Love, ms.dena");
    expect(out).not.toContain("<a ");
  });

  it("still autolinks a bare ms.de host (the boundary holds at a non-word char)", () => {
    expect(expandContentLinks("love, ms.de.")).toBe(
      'love, <a target="_blank" class="external-link" href="http://ms.de">ms.de</a>.',
    );
  });

  it("email: the address absorbs trailing word chars (label groups are word-char greedy on both sides)", () => {
    // The EMAIL/host label groups themselves admit letters+digits, so
    // admin@example.comX matches through the X and the boundary holds at
    // the following space — the same consumption Ruby's prefix + full_re
    // performs. The `\b` only rejects matches whose LAST char abuts
    // another word char (the ms.dena case).
    expect(expandContentLinks("mail admin@example.comX now")).toBe(
      'mail <a class="email-link" href="mailto:admin@example.comX">admin@example.comX</a> now',
    );
    expect(expandContentLinks("mail admin@example.com now")).toBe(
      'mail <a class="email-link" href="mailto:admin@example.com">admin@example.com</a> now',
    );
  });

  it("keeps the pinned host shapes autolinking (boundary does not over-trim)", () => {
    expect(expandContentLinks("xmlns=http://www.w3.org/2000/svg")).toContain(
      '<a target="_blank" class="external-link" href="http://www.w3.org/2000/svg"',
    );
    expect(expandContentLinks("visit example.com today")).toContain(
      'href="http://example.com"',
    );
  });
});

describe("URI scanner: TLD list is the gem's GENERIC+COUNTRY verbatim", () => {
  it("autolinks a .si host (in the gem's COUNTRY list: sh|si|sj)", () => {
    expect(expandContentLinks("see example.si today")).toBe(
      'see <a target="_blank" class="external-link" href="http://example.si">example.si</a> today',
    );
  });

  it("leaves a .me host plain (not in the gem's COUNTRY list: md|mg)", () => {
    expect(expandContentLinks("see example.me today")).toBe(
      "see example.me today",
    );
    expect(expandContentLinks("see example.me today")).not.toContain("<a ");
  });

  it("still autolinks the corpus's common TLDs", () => {
    for (const tld of ["com", "org", "net", "de", "jp", "eu"]) {
      const out = expandContentLinks(`see example.${tld} today`);
      expect(out).toContain(`href="http://example.${tld}"`);
    }
  });
});
