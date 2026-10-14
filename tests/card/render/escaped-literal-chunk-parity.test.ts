// Escaped literals — Chunk::EscapedLiteral parity.
//
// WHAT THIS PINS
//   A backslash in front of `{{` or `[[` does not escape a CHARACTER, it
//   selects a different chunk class. Chunk::EscapedLiteral registers
//   idx_char "\\" and prefix_re `\\(?:\[\[|\{\{`
//   (card-mod-content lib/card/content/chunk/escaped_literal.rb:13-15), and
//   Chunk.find_class_by_prefix picks by the prefix's FIRST character before
//   its last (card-1.110.0 lib/card/content/chunk.rb:45-56), so the escaped
//   region is claimed before Chunk::Nest ("{") is ever consulted. The region
//   is one literal chunk, never a nest.
//
//   What that chunk RENDERS is format-dependent, and that is the difference
//   the port had:
//
//   - HtmlFormat#escape_literal wraps the escaped character in a span
//     (mod/format/lib/card/format/html_format.rb:20-22), so
//     `\{{Foo}}` renders `<span>{</span>{Foo}}`. The gem's own spec says so
//     in bytes (mod/content/spec/card/content/chunk/escaped_literal_spec.rb:
//     4-12):
//       render_content('write this: \[[text]]')  == "write this: <span>[</span>[text]]"
//       render_content('write this: \{{cardname}}') == "write this: <span>{</span>{cardname}}"
//   - Type::Markdown::HtmlFormat#escape_literal is the identity
//     (mod/markdown/set/type/markdown.rb:16-18, byte-identical to the base
//     Format#escape_literal, card/lib/card/format.rb:90-92), so the backslash
//     is simply consumed and the braces ride out as `{{Foo}}`.
//
//   Both are driven by escaped_literal.rb:21-23
//     @process_chunk = match[0].sub(/^\\(.)/, format.escape_literal('\1'))
//   - the backslash and the ONE character behind it are replaced; the rest of
//   the chunk is verbatim. The escaped CHARACTER may be anything the FULL_RE
//   charset admits: "{" => /\A\\\{\{[^}]*\}\}/ and
//     "[" => /\A\\\[\[[^\]]*\]\]/ (11-12), keyed by `prefix[1, 1]` (17-19).
//     Note `[^}]*`, not the nest chunk's `[^{}]*`.
//
//   Comment nests are the case that proves the class is reached BEFORE Nest:
//   `{{#draft}}` is a Nest chunk and renders the visible comment
//   (chunk/nest.rb:20-21, 34-36), while `\{{#draft}}` is an EscapedLiteral and
//   renders inert braces - the comment is never produced.
//
//   The identity answer is oracle-backed inside this repo: the graded deck
//   holds exactly one escaped literal, in the Markdown-typed card
//   `*structure+*right+*guide` (cards.id 97, type_id 65 = "Markdown"), whose
//   content carries "...opened using the curly bracket\nicon (\{{}}). This
//   tool..." and whose Ruby bytes render `icon ({{}})` — braces, no span.
//
//   The span answer is not in the graded deck; it is pinned from the gem spec
//   quoted above, which is the same `render_content` entry point the spec
//   suite uses and the same default (HtmlFormat) a Basic card renders in.
//
//   The :nest_only case pins chunk.rb:88 — `register_list :nest_only, [:Nest]`
//   — so the class is not consulted at all on a JavaScript / CoffeeScript
//   card. The parser falls through one character at a time (parser.rb:52-54),
//   the backslash stays ordinary text, and the braces behind it still chunk
//   as a Nest.
//
//   Seeded test-storage cards only; every input is a comment nest or an
//   escaped literal, so no assertion depends on a fetch.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RenderFormat } from "../../../src/card/render/format.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

beforeAll(() => {
  defaultDeckLoader();
});

afterAll(() => {
  setDefaultModLoader(undefined);
});

/** The cardtype the probes hang off. "Basic" is the deck's default type and
 *  renders in the default HtmlFormat, so its escape_literal is the
 *  span-wrapping one. */
const BASIC_TYPE_ID = 2;
const MARKDOWN_TYPE_ID = 90;

/** seedDeck: one Basic cardtype, one Markdown cardtype (the identity answer),
 *  and the two probe cards - one of each type. */
async function seedDeck(): Promise<{ storage: RenderTestStorage; html: RenderFormat; markdown: RenderFormat }> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: BASIC_TYPE_ID, name: "Basic", codename: "basic", typeId: BASIC_TYPE_ID });
  await seedCard(storage, { id: MARKDOWN_TYPE_ID, name: "Markdown", codename: "markdown", typeId: BASIC_TYPE_ID });
  await seedCard(storage, { id: 91, name: "Html Probe", typeId: BASIC_TYPE_ID, dbContent: "BODY" });
  await seedCard(storage, { id: 92, name: "Markdown Probe", typeId: MARKDOWN_TYPE_ID, dbContent: "BODY" });
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon([BASIC_TYPE_ID, MARKDOWN_TYPE_ID, 91, 92]);
  const htmlCard = await storage.engine.prepareItemForRender("Html Probe");
  const markdownCard = await storage.engine.prepareItemForRender("Markdown Probe");
  if (htmlCard === undefined || markdownCard === undefined) {
    throw new Error("probe cards not preparable after seed");
  }
  return {
    storage,
    html: new RenderFormat(htmlCard, storage.engine),
    markdown: new RenderFormat(markdownCard, storage.engine),
  };
}

describe("Chunk::EscapedLiteral (escaped_literal.rb) on an HtmlFormat card", () => {
  it("wraps the escaped brace in a span — the gem spec's nest case, byte for byte", async () => {
    const { storage, html } = await seedDeck();
    try {
      // mod/content/spec/card/content/chunk/escaped_literal_spec.rb:9-12
      expect(html.processContent("write this: \\{{cardname}}")).toBe(
        "write this: <span>{</span>{cardname}}",
      );
    } finally {
      storage.close();
    }
  });

  it("wraps the escaped bracket in a span — the gem spec's link case, byte for byte", async () => {
    const { storage, html } = await seedDeck();
    try {
      // mod/content/spec/card/content/chunk/escaped_literal_spec.rb:4-7
      expect(html.processContent("write this: \\[[text]]")).toBe(
        "write this: <span>[</span>[text]]",
      );
    } finally {
      storage.close();
    }
  });

  it("escapes a COMMENT nest: the region never reaches Chunk::Nest, so no comment is produced", async () => {
    const { storage, html } = await seedDeck();
    try {
      expect(html.processContent("hide \\{{#draft note}}")).toBe(
        "hide <span>{</span>{#draft note}}",
      );
    } finally {
      storage.close();
    }
  });

  it("leaves the UNESCAPED comment nest to Chunk::Nest, which renders it visibly", async () => {
    const { storage, html } = await seedDeck();
    try {
      // chunk/nest.rb:20-21 -> visible_comment (34-36), in_brackets is the
      // whole bracketed text, tags stripped (28-32).
      expect(html.processContent("hide {{#draft note}}")).toBe("hide <!-- #draft note -->");
    } finally {
      storage.close();
    }
  });

  it("keeps the backslash when FULL_RE does not match — `\\{{a}b}}` is not an escaped region", async () => {
    const { storage, html } = await seedDeck();
    try {
      // escaped_literal.rb:12 "{" charset is `[^}]*`, so a `}` inside the
      // braces fails the full match; Nest's `[^{}]*` fails it too. The
      // parser then records no chunk at all and Content#initialize falls back
      // to the raw string (content.rb:25) - backslash included.
      expect(html.processContent("a \\{{a}b}}")).toBe("a \\{{a}b}}");
    } finally {
      storage.close();
    }
  });
});

describe("Chunk::EscapedLiteral on a Markdown-typed card (markdown.rb:16-18)", () => {
  it("consumes the backslash and renders the braces bare — the graded-deck pin", async () => {
    const { storage, markdown } = await seedDeck();
    try {
      // Type::Markdown::HtmlFormat#escape_literal is the identity, so
      // `\{{}}` renders `{{}}`. The same bytes the graded deck's Ruby run
      // produces for *structure+*right+*guide (cards.id 97): "icon ({{}})".
      expect(markdown.processContent("icon (\\{{}})")).toBe("icon ({{}})");
    } finally {
      storage.close();
    }
  });

  it("escapes the LINK twin the same way", async () => {
    const { storage, markdown } = await seedDeck();
    try {
      expect(markdown.processContent("write this: \\[[text]]")).toBe("write this: [[text]]");
    } finally {
      storage.close();
    }
  });
});

// :text_without_nests (set/all/text.rb:15-17) = to_text nestless_content.
// The expected bytes below were produced by a transcription of the Ruby
// pipeline (text.rb:4-17, content.rb:69-71 strip_nests, escaped_literal.rb:
// 21-23 interpret, html_format.rb:20-22 and markdown.rb:16-18 escape_literal,
// text.rb:4-6 to_text = HTMLEntities.decode strip_tags) run under Ruby 3.3.12,
// never from the port's output.
describe("text_without_nests keeps the escaped chunk's rendered bytes (text.rb:8-13)", () => {
  async function renderText(content: string, typeId: number): Promise<string> {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: BASIC_TYPE_ID, name: "Basic", codename: "basic", typeId: BASIC_TYPE_ID });
      await seedCard(storage, { id: MARKDOWN_TYPE_ID, name: "Markdown", codename: "markdown", typeId: BASIC_TYPE_ID });
      await seedCard(storage, { id: 93, name: "Text Probe", typeId, dbContent: content });
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon([BASIC_TYPE_ID, MARKDOWN_TYPE_ID, 93]);
      return await storage.engine.render("Text Probe", "text_without_nests");
    } finally {
      storage.close();
    }
  }

  it("an HtmlFormat escaped brace reads back bare: the span is stripped, the nest is dropped", async () => {
    expect(await renderText("hide \\{{Foo}} and {{Bar}}", BASIC_TYPE_ID)).toBe("hide {{Foo}} and ");
  });

  it("an HtmlFormat escaped bracket reads back bare", async () => {
    expect(await renderText("see \\[[Foo]] now", BASIC_TYPE_ID)).toBe("see [[Foo]] now");
  });

  it("an HtmlFormat escaped comment nest is not a comment: its braces read back bare", async () => {
    expect(await renderText("hide \\{{#draft}} and {{#visible}}", BASIC_TYPE_ID)).toBe(
      "hide {{#draft}} and ",
    );
  });

  it("a Markdown card's identity escape reads back the same braces", async () => {
    expect(await renderText("icon (\\{{}}) done", MARKDOWN_TYPE_ID)).toBe("icon ({{}}) done");
  });
});

// navbar_items (mod/layout/set/all/navbar_links.rb:10-21) walks the chunks
// under `chunk_list: :references` and its `case`'s else arm (17-19) is
// `chunk.process_chunk` - which for an EscapedLiteral IS its interpreted
// bytes (escaped_literal.rb:21-23). :references registers the class
// (chunk.rb:87), so the parser never hands the raw `\[[x]]` to a Link chunk
// and it must not become a nav item. Expected bytes from a transcription of
// that dispatch run under Ruby 3.3.12.
describe("navbar_links renders an escaped region inert (navbar_links.rb:10-21)", () => {
  async function renderNavbar(content: string, typeId: number): Promise<string> {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: BASIC_TYPE_ID, name: "Basic", codename: "basic", typeId: BASIC_TYPE_ID });
      await seedCard(storage, { id: MARKDOWN_TYPE_ID, name: "Markdown", codename: "markdown", typeId: BASIC_TYPE_ID });
      await seedCard(storage, { id: 94, name: "Navbar Probe", typeId, dbContent: content });
      // the mixed case's unescaped `[[Bar]]` nests the target, so the target
      // has to exist for the contrast to be real (navbarLinkChunk's bare-name
      // arm is ctx.fmt.nest, card-mod-layout.ts:605-611)
      await seedCard(storage, { id: 95, name: "Bar", typeId: BASIC_TYPE_ID, dbContent: "bar body" });
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon([BASIC_TYPE_ID, MARKDOWN_TYPE_ID, 94, 95]);
      return await storage.engine.render("Navbar Probe", "navbar_links");
    } finally {
      storage.close();
    }
  }

  it("an HtmlFormat escaped bracket is inert, and an unescaped link beside it is not", async () => {
    // The mixed case is the one that distinguishes the arms: the escaped
    // region reads `<span>[</span>[Foo]]` while `[[Bar]]` still walks
    // linkChunksInText and becomes an anchor.
    const out = await renderNavbar("nav \\[[Foo]] and [[Bar]]", BASIC_TYPE_ID);
    expect(out).toContain("nav <span>[</span>[Foo]] and ");
    expect(out).not.toContain('href="/Foo"');
    expect(out).toMatch(/<a class="[^"]*" href="\/Bar"/);
  });

  it("an HtmlFormat escaped brace is inert", async () => {
    expect(await renderNavbar("nav \\{{Foo}} end", BASIC_TYPE_ID)).toBe(
      '<ul class="navbar-nav">nav <span>{</span>{Foo}} end</ul>',
    );
  });

  it("a Markdown card's identity escape reads back bare", async () => {
    expect(await renderNavbar("nav \\[[Foo]] end", MARKDOWN_TYPE_ID)).toBe(
      '<ul class="navbar-nav">nav [[Foo]] end</ul>',
    );
  });

  it("an escaped comment nest is not a comment and not an item", async () => {
    expect(await renderNavbar("nav \\{{#hidden}} end", BASIC_TYPE_ID)).toBe(
      '<ul class="navbar-nav">nav <span>{</span>{#hidden}} end</ul>',
    );
  });
});

describe("EscapedLiteral is not registered on the :nest_only list (chunk.rb:88)", () => {
  it("leaves the backslash as text and still chunks the braces as a Nest", async () => {
    const { storage, html } = await seedDeck();
    try {
      // parser.rb:52-54 walks on one character at a time, so the `\` is
      // interval text and `{{#draft note}}` chunks as a Nest behind it.
      expect(html.processContent("var x = \\{{#draft note}}", "nest_only")).toBe(
        "var x = \\<!-- #draft note -->",
      );
    } finally {
      storage.close();
    }
  });
});