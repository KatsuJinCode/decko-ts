import type { ViewResult } from "../../render/format.js";
// The card-mod-markdown gem (card-mod-markdown-0.20.0), ported through the
// mod loader.
//
// The gem's tree (the installed
// card-mod-markdown-0.20.0/): ONE set file (set/type/markdown.rb), no lib/,
// no set_pattern/, no events, plus seed data (data/real.yml - the Markdown
// cardtype card, codename "markdown") and one migration
// (data/transform/20150116220621_add_markdown_type.rb - Card.ensure for the
// same card). There is NO mod.yml in the gem.
//
// Ported here:
// - set/type/markdown.rb view :core (markdown.rb:5-14): the Markdown
//   cardtype's core renders through kramdown 2.5.2 with coderay syntax
//   highlighting (kramdown-syntax-coderay 1.0.1). The conversion below is a
//   hand port of the kramdown subset, byte-verified against the REAL local
//   gems (ruby 3.3.12, kramdown 2.5.2, coderay 1.1.3,
//   kramdown-syntax-coderay 1.0.1): every byte the tests pin was produced by
//   Kramdown::Document.new(text, {syntax_highlighter: :coderay,
//   syntax_highlighter_opts: {line_numbers: false, default_lang: :ruby}}
//   ).to_html run under Ruby 3.3. The Ruby-cited internals ported:
//   kramdown converter/base.rb:222-240 (generate_id + the used-id "-1"
//   suffix), converter/html.rb (block/span shapes), parser/kramdown/smart_quotes.rb:121-152
//   (the SQ_RULES table, verbatim), typographic_symbol.rb:13-17
//   (TYPOGRAPHIC_SYMS), escaped_chars.rb:14 (ESCAPED_CHARS), codespan.rb,
//   header.rb (ATX), horizontal_rule.rb:13 (HR_START), blockquote.rb,
//   codeblock.rb (indented + fenced), paragraph.rb, list.rb,
//   block_boundary.rb:16-21 (ATX's after_block_boundary?), utils/html.rb:27-70
//   (entity_to_str :as_char + escape maps).
// - the gem's safe_process_content flow (card-1.110.0
//   lib/card/format/content.rb:20-23): nests are STASHED as "{{<i>}}"
//   placeholders (content.rb:142-144), the kramdown conversion sees ONLY the
//   literal remainder, the placeholders are unstashed (content.rb:151-153 -
//   numeric placeholder -> stashed chunk text, Ruby nil -> ""), and the
//   restored string goes through process_content. That order is the README's
//   claim (README.md:20-22): nest bytes are never seen by the markdown
//   processor. The TS composition uses the engine's scanNests +
//   RenderFormat#processContent (format.ts:585) - the same chunk walk.
// - markdown.rb:16-18 escape_literal (identity - byte-identical to the base
//   Format#escape_literal it shadows, format.rb:90-92; consumed by
//   card-mod-content lib/card/content/chunk/escaped_literal.rb:22)
// - markdown.rb:20-22 input_type (:ace_editor) and markdown.rb:24-26
//   ace_mode (:markdown) - exported as values below. NO TS consumer exists
//   (the engine renders no :edit view), the same honest shape as
//   card-mod-help's config/admin.yml remainder.
//
// NOT ported (honest remainder of the kramdown grammar - each listed case
// RUNS through the local kramdown and diverges):
// - coderay TOKENIZATION: the code-block wrapper
//   (<div class="language-X highlighter-coderay"><div class="CodeRay">...)
//   is byte-exact, and code whose content coderay passes through as plain
//   text (no keywords/strings) is byte-exact; code that tokenizes gets
//   inline-styled spans (<span style="color:#080;font-weight:bold">def</span>)
//   this port does not produce. Code spans (<code>) never highlight.
// - setext headers (Title\n=====), tables, footnotes, definition lists,
//   abbreviations, ALDs ({:...}), math, raw HTML blocks/spans, link
//   reference definitions, EOB markers - unported; the affected text falls
//   through to the paragraph parser (kramdown's own block dispatch order,
//   parser/kramdown.rb:75-80, decides the same way for everything not in
//   the ported subset).
// - the decko seed data (data/real.yml + the transform migration) has no
//   manifest slot (DeckoModManifest carries set patterns/modules only); the
//   Markdown cardtype card is a seed-deck concern, exactly how the help
//   mod's test seeds its probe deck.

import type { ViewContext, ViewFn } from "../../render/format.js";
import { HTML_VIEWS } from "../../render/views.js";
import type { DeckoModManifest } from "../mod-manifest.js";
import { kramdownToHtml, kramdownToStashedHtml } from "../../render/kramdown.js";

/** Re-exported for the existing test import path (pre-extraction the
 *  converter lived here). */
export { kramdownToHtml };

// ---------------------------------------------------------------------------
// set/type/markdown.rb - the html format block
// ---------------------------------------------------------------------------

/** The base HtmlFormat#core (views.ts coreView) captured at module load -
 *  the ancestor method Type::Markdown::HtmlFormat#core shadows (Ruby set
 *  modules define the view on a SUBCLASS format; cards outside the set
 *  resolve the base method). Capturing at import time is the pre-registration
 *  value even across loader reset() cycles. */
const priorCore: ViewFn =
  HTML_VIEWS["core"] ??
  ((ctx) => ctx.fmt.processContent(ctx.fmt.renderRaw()));

/** markdown.rb:5-14 view :core, expressed as the set-module override: cards
 *  in the Type::Markdown set take the kramdown path, everything else falls
 *  back to the base core method (the ancestor-chain lookup). No view config
 *  - Ruby declares `view :core` with no options. */
const markdownCoreView: ViewFn = (ctx: ViewContext): ViewResult => {
  if (ctx.fmt.card.typeName !== "Markdown") return priorCore(ctx);
  return markdownCore(ctx);
};

/** markdown.rb:6-13 safe_process_content { Kramdown::Document.new(...).to_html }:
 *  stash nests (content.rb:142-144), convert the literal remainder, unstash
 *  (content.rb:151-153), process the restored nests (content.rb:22). The
 *  stash/convert/unstash machinery lives in render/kramdown.ts (shared with
 *  the bare render paths — see the extraction note there). */
function markdownCore(ctx: ViewContext): string {
  return ctx.fmt.processContent(kramdownToStashedHtml(ctx.fmt.renderRaw()));
}

/** markdown.rb:16-18 escape_literal - identity (same bytes as the base
 *  Format#escape_literal, format.rb:90-92). It is the set module's method,
 *  transcribed; render/format.ts#escapeLiteralForCard picks this answer for
 *  Markdown-typed cards when it interprets a Chunk::EscapedLiteral chunk
 *  (escaped_literal.rb:22), so this transcription stays the reference the
 *  content pass is written against. */
export function escapeLiteral(literal: string): string {
  return literal;
}

/** markdown.rb:20-22 input_type: :ace_editor. No TS consumer (no :edit
 *  view) - the ace editor input lives in card-mod-ace_editor. */
export const inputType = "ace_editor";

/** markdown.rb:24-26 ace_mode: :markdown. */
export const aceMode = "markdown";

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModMarkdown: DeckoModManifest = {
  name: "markdown",
  gemName: "card-mod-markdown",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-markdown-0.20.0/set/type/markdown.rb
      setPath: "type/markdown",
      formats: {
        html: {
          views: [{ view: "core", viewFn: markdownCoreView }],
        },
      },
    },
  ],
};

export default cardModMarkdown;
