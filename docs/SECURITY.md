# Security policy

decko-ts is a port of Ruby Decko (card 1.110.0, decko 0.20.0). Its acceptance criterion is exact parity with Ruby Decko in rendering, persistence, semantics and side effects, including Ruby's defects, so that an existing deck behaves the same on either engine.

There are two exceptions, and only two:

1. **Security holes.** Where Ruby's behaviour lets one user act against another (run script in their browser, act with their session, read or guess their credentials), the port does not copy it.
2. **Crashes.** Where Ruby fails with an internal error, the port gives the error Ruby intended.

Each exception is an *approved security divergence*: it is listed below with what Ruby does, what the port does, why, what it costs in compatibility, how to configure it, and the test that pins it. Anything not listed here is meant to behave exactly as Ruby Decko does; a difference that is not listed is a defect.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainers rather than in a public issue. Include the request or content that triggers the problem and what you observed. Where the same flaw exists in Ruby Decko, we also report it upstream.

## Approved divergences

### 1. Stored HTML is sanitised safely

| | |
|---|---|
| **Ruby** | `Card::Content.clean!` (`lib/card/content/clean.rb`) finds tags and attribute values with regular expressions, writes kept values back between quotes without escaping them, and does not check URLs. Stored content can therefore carry `javascript:` links, event-handler attributes rebuilt from malformed values (`<img src=x"onerror="...>`), markup spliced together by comment removal, and unterminated markup that runs into the page around it. |
| **Port** | The same tag and attribute allowlists, and the same tag-finding expression, so the same tags are kept and dropped. Attributes are read with the HTML tokenizer's rules; URL attributes (`href`, `src`, `cite`) must be relative or use a non-script scheme (`http`, `https`, `mailto`, `tel`, `sms`, `ftp`, `skype`, `callto`, `webcal`, `irc`, `ircs`, `xmpp`, `geo`, `news`, `nntp`, `feed`), plus `data:image/*` for `img src` with SVG excluded; `style` values may not contain `expression()`, `behavior:`, `-moz-binding`, `@import` or a script URL; values are escaped; comments are removed only where they lie in text; a stray `<` that would open markup is written as `&lt;`. When a browser reads exactly the same attributes from Ruby's output as the port keeps, Ruby's bytes are stored unchanged. |
| **Why** | Any user who may edit a RichText card could otherwise store script that runs for every reader. |
| **Compatibility** | Ordinary content is stored byte for byte as Ruby stores it. Measured over the stored HTML of a real 19,000-card deck, 7,208 of 7,354 HTML-bearing cards clean identically. The other 146 are cards whose Ruby cleaning is malformed or misreads an attribute (an empty `alt=""` becomes `alt=""""`; a `title=` inside a link's query string is taken as the title; `style=` inside `data-mce-style=` is taken as the style) or that link to dead or script-capable schemes (`gdlookup:`, `chrome:`, `file:`, `javascript:`). Existing content changes only when it is saved again. |
| **Configuration** | None. Card types that Ruby does not clean (HTML, layout, email template, script and style types, `+*html_message`) are not cleaned by the port either; editing those types should be limited to trusted roles, as in Ruby. |
| **Tests** | `tests/card/actions/content-clean-security.test.ts`: a corpus built from the OWASP XSS Filter Evasion Cheat Sheet and the cleaner's own edge cases, checked by an independent browser-tokenizer verifier, alone and followed by page markup; 4,000 random hostile mixtures; ordinary content byte-identical to Ruby. The persistence oracle declares the resulting row differences (`tests/fixtures/persistence-oracle/deliberate-differences.json`, steps 20, 22 and 31). |
