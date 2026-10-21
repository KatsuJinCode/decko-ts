// kramdown 2.5.2 subset converter - EXTRACTED from card-mod-markdown.ts
// so non-mod code paths (the rule-bar one-line's
// base one_line_content render) can convert Markdown rule-card cores
// without importing the mod module (which registers views and would close
// a views -> rule-bar-right -> markdown-mod -> views import cycle). The
// moved body is byte-identical to the mod's region; card-mod-markdown.ts
// re-imports kramdownToHtml from here.

import { highlight } from "./code-highlighting/index.js";

// ---------------------------------------------------------------------------
// kramdown 2.5.2 subset - block parsing
// (cross-read against the installed kramdown-2.5.2 +
//  kramdown-syntax-coderay-1.0.1 + coderay-1.1.3 gems' own sources -
//  parser/kramdown.rb, list.rb, blockquote.rb, header.rb, codeblock.rb,
//  converter/html.rb, base.rb - and against the view-level bytes a deck
//  actually serves)
// ---------------------------------------------------------------------------

interface KramdownState {
  /** converter/base.rb:226-231 - the @used_ids map: first use stores 0,
   *  each reuse appends "-<n>" with n pre-incremented. */
  usedIds: Map<string, number>;
}

/** parser/kramdown.rb - the source normalizes to LF with a trailing newline
 *  (PARAGRAPH_MATCH / every block regex end in \n; "" therefore parses as
 *  one blank line and converts to "\n"). */
function normalizeSource(source: string): string {
  let src = source.replace(/\r\n?/g, "\n");
  if (!src.endsWith("\n")) src += "\n";
  return src;
}

/** The parsed block tree (the :blank/:p/:blockquote/:ul-ol/:codeblock/
 *  :header/:hr element subset of kramdown's tree). `transparent` is
 *  p-options[:transparent] - list.rb sets it for TIGHT list items and
 *  convert_li renders it bare (html.rb:189-201). The tree exists because
 *  list.rb's transparency condition inspects the item's PARSED blocks
 *  (list.rb:118-127) - a flat emitter cannot express it. */
type KBlock =
  | { kind: "blank" }
  | { kind: "p"; text: string; transparent: boolean }
  | { kind: "header"; level: number; idAttr: string; text: string }
  | { kind: "hr" }
  | {
      kind: "codeblock";
      /** options[:lang] (the fence's full lang token, "ruby?a=1" included);
       *  undefined for indented codeblocks. */
      lang: string | undefined;
      /** the fence's attr class lang (codeblock.rb:46 "language-#{@src[4]}"). */
      langClass: string | undefined;
      content: string;
    }
  | { kind: "blockquote"; children: KBlock[] }
  | {
      kind: "list";
      ordered: boolean;
      /** per-item parsed blocks + list.rb's transparency verdict; render
       *  through the convert_li shapes (html.rb:189-201). */
      items: { blocks: KBlock[]; transparent: boolean }[];
    };

/** The conversion entry point (parser/kramdown.rb:90-95): parse the whole
 *  document into the block tree, then convert. `indent` is in SPACES (the
 *  recursive callers pass their converter indent). */
export function kramdownToHtml(source: string, shared?: KramdownState, indent = 0): string {
  const state: KramdownState = shared ?? { usedIds: new Map() };
  return convertBlocks(parseBlocks(normalizeSource(source), state), indent);
}

/** convert + convert_blocks (html.rb:57-73): dispatch each block at the
 *  current indent; `inner` converts children at indent + @indent (2). The
 *  root converts at 0 (html.rb:47/:57). Lists render inside parse_list
 *  (their bytes depend on convert_li's per-item shapes). */
function convertBlocks(blocks: readonly KBlock[], indent: number): string {
  const pad = " ".repeat(indent);
  let out = "";
  for (const block of blocks) {
    if (block.kind === "blank") {
      out += "\n"; // html.rb:77-78 convert_blank
    } else if (block.kind === "p") {
      // html.rb:86-87: a transparent p renders its inner text bare (the
      // tight-list case); otherwise format_as_block_html (html.rb:405-407)
      out += block.transparent
        ? parseSpans(block.text, new Set()).html
        : `${pad}<p>${parseSpans(block.text, new Set()).html}</p>\n`;
    } else if (block.kind === "header") {
      // html.rb:149-164 convert_header: the id was resolved at parse time
      // (auto_id via generate_id on the raw text, base.rb:229-244, or the
      // explicit HEADER_ID); format_as_block_html emits the line
      out += `${pad}<h${block.level} id="${escapeAttribute(block.idAttr)}">${parseSpans(block.text, new Set()).html}</h${block.level}>\n`;
    } else if (block.kind === "hr") {
      out += `${pad}<hr />\n`; // html.rb:166-168
    } else if (block.kind === "codeblock") {
      out += codeBlockHtml(block.content, block.lang, block.langClass, indent);
    } else if (block.kind === "blockquote") {
      // html.rb:145-146: format_as_indented_block_html (html.rb:411-413)
      out += `${pad}<blockquote>\n${convertBlocks(block.children, indent + 2)}${pad}</blockquote>\n`;
    } else if (block.kind === "list") {
      // html.rb:173-188 convert_ul/ol (format_as_indented_block_html) +
      // html.rb:189-201 convert_li: a transparent-first li renders inline
      // (`<li>` + inner + the closing indent only when the inner ends in
      // \n); any other li renders block-mode (`<li>\n` + inner at
      // li-children indent (+4) + the closing indent).
      const itemPad = " ".repeat(indent + 2);
      const listTag = block.ordered ? "ol" : "ul";
      out += `${pad}<${listTag}>\n`;
      for (const item of block.items) {
        const first = item.blocks[0];
        if (item.transparent === true && first !== undefined && first.kind === "p") {
          const inner =
            parseSpans(first.text, new Set()).html +
            convertBlocks(item.blocks.slice(1), indent + 4);
          out += `${itemPad}<li>${inner}${/\n$/.test(inner) ? itemPad : ""}</li>\n`;
        } else {
          out += `${itemPad}<li>\n${convertBlocks(item.blocks, indent + 4)}${itemPad}</li>\n`;
        }
      }
      out += `${pad}</${listTag}>\n`;
    }
  }
  return out;
}

/** parser/kramdown.rb:140-160 parse_blocks: dispatch at each position in
 *  @block_parsers order (kramdown.rb:75-77), ported subset only:
 *  blank_line, codeblock, codeblock_fenced, blockquote, atx_header,
 *  horizontal_rule, list, setext_header, paragraph. The unported middle
 *  parsers (definition_list, block_html, block_math, table,
 *  footnote/link/abbrev definitions, block_extensions, eob_marker) never
 *  match here, so their text reaches the paragraph parser exactly like
 *  Ruby's `parsers.any?` chain declining - EXCEPT tables/raw HTML, which
 *  Ruby WOULD render (the documented remainder). */
function parseBlocks(src: string, state: KramdownState): KBlock[] {
  const blocks: KBlock[] = [];
  let pos = 0;
  // block_boundary.rb:17-21 after_block_boundary?: no previous block, or
  // the previous block is a blank line (the :eob/:block_ial arms are the
  // unported remainder). Gates ATX headers (header.rb:31).
  const afterBoundary = (): boolean => {
    const last = blocks[blocks.length - 1];
    return last === undefined || last.kind === "blank";
  };
  while (pos < src.length) {
    const rest = src.slice(pos);
    // blank_line (BLANK_LINE = /(?>^\s*\n)+/, blank_line.rb:14 - one MERGED
    // element per run; convert_blank -> "\n" either way).
    const blank = /^(?:[ \t]*\n)+/.exec(rest);
    if (blank !== null) {
      blocks.push({ kind: "blank" });
      pos += blank[0].length;
      continue;
    }
    // codeblock (codeblock.rb:19-26, CODEBLOCK_START = INDENT,
    // kramdown.rb:345) - indented runs, absorbing blank-separated indented
    // runs (the CODEBLOCK_MATCH repetition: "x\n\ny\n" is ONE div)
    if (/^(?:\t| {4})/.test(rest)) {
      const codeblock = parseIndentedCode(rest);
      if (codeblock !== null) {
        blocks.push(codeblock.block);
        pos += codeblock.length;
        continue;
      }
    }
    // codeblock_fenced (codeblock.rb:35-52, FENCED_CODEBLOCK_START =
    // /^~{3,}/, FENCED_CODEBLOCK_MATCH = /^((~){3,})\s*?((\S+?)(?:\?\S*)?)?
    // \s*?\n(.*?)^\1\2*\s*?\n/m): the info string is ONE token - an
    // "~~~ ruby extra" line never opens a fence (the match declines and
    // the paragraph parser takes the line). options[:lang]
    // = group 3 (codeblock.rb:45), the class lang = group 4 (codeblock.rb:46).
    // A failed FENCED_CODEBLOCK_MATCH consumes nothing.
    const fence = /^((~){3,})[ \t]*((\S+?)(?:\?\S*)?)?[ \t]*\n/.exec(rest);
    if (fence !== null) {
      const closer = new RegExp(`^${fence[1]}~*[ \\t]*\\n`, "gm");
      closer.lastIndex = fence[0].length;
      const closeMatch = closer.exec(rest);
      if (closeMatch !== null) {
        blocks.push({
          kind: "codeblock",
          lang: fence[3],
          langClass: fence[4],
          content: rest.slice(fence[0].length, closeMatch.index),
        });
        pos += closeMatch.index + closeMatch[0].length;
        continue;
      }
    }
    // blockquote (blockquote.rb:14-28, BLOCKQUOTE_START = /^ {0,3}> ?/
    // - OPT_SPACE is spaces-only, kramdown.rb:347): PARAGRAPH_MATCH lines
    // collected until LAZY_END (a blank line), "> " markers stripped, then
    // parse_blocks recursion (parse_blocks(el, result)); the children
    // convert at indent+2 (inner(), html.rb:66-73 + :145-146). NOT
    // boundary-gated - a "> " line right after a paragraph is consumed by
    // that paragraph first (the greedy dispatcher order: a "> " line right
    // after a paragraph is eaten by that paragraph, and a list marker
    // inside a quote stays with the quote).
    const bq = /^ {0,3}> ?/.exec(rest);
    if (bq !== null) {
      let end = 0;
      for (;;) {
        const line = /^[^\n]*\n/.exec(rest.slice(end));
        if (line === null) break;
        if (/^[ \t]*\n/.test(line[0])) break; // LAZY_END blank line
        end += line[0].length;
      }
      const stripped = rest
        .slice(0, end)
        .split("\n")
        .map((quoteLine) => quoteLine.replace(/^ {0,3}> ?/, ""))
        .join("\n");
      blocks.push({ kind: "blockquote", children: parseBlocks(stripped, state) });
      pos += end;
      continue;
    }
    // atx_header (header.rb:27-38): level 1-6, boundary-gated (header.rb:31
    // returns false -> the dispatcher continues and the line reaches
    // paragraph). parse_header_contents (header.rb:44-53) runs in Ruby's
    // order: rstrip, HEADER_ID = /[\t ]{#...}\z/ (XML-name chars
    // approximated by [^\s{}]+), THEN the trailing-unescaped-# strip +
    // rstrip (header.rb:33-34); empty text declines the parser (header.rb:35).
    const atx = /^(#{1,6})[ \t]*([^ \t][^\n]*)\n/.exec(rest);
    if (atx !== null && afterBoundary()) {
      const parsed = parseAtxContents(atx[2]);
      if (parsed !== undefined) {
        blocks.push({
          kind: "header",
          level: atx[1].length,
          idAttr: parsed.id ?? generateId(parsed.text, state),
          text: parsed.text,
        });
        pos += atx[0].length;
        continue;
      }
    }
    // horizontal_rule (horizontal_rule.rb:13, HR_START = /^ {0,3}(\*|-|_)
    // [ \t]*\1[ \t]*\1(\1|[ \t])*\n): one char of [*_-] repeated 3+ times
    // with spaces/hyphens interleaved - not boundary-gated.
    const hr = /^ {0,3}([*_-])[ \t]*\1[ \t]*\1(?:\1|[ \t])*\n/.exec(rest);
    if (hr !== null) {
      blocks.push({ kind: "hr" });
      pos += hr[0].length;
      continue;
    }
    // list (list.rb parse_list - the full algorithm below) - not
    // boundary-gated either ("# H\n- a" parses the list).
    const list = parseList(rest, state);
    if (list !== null) {
      blocks.push(list.block);
      if (list.trailingBlank) blocks.push({ kind: "blank" }); // list.rb:152
      pos += list.length;
      continue;
    }
    // setext_header (header.rb:17-26, SETEXT_HEADER_START =
    // /^ {0,3}(?<contents>[^ \t].*)\n(?<level>[-=])[-=]*[ \t\r\f\v]*\n/):
    // a text line at 0-3 leading spaces whose NEXT line starts at column 0
    // with '=' (level 1, header.rb:24) or '-' (level 2). The underline line
    // carries no OPT_SPACE, so an indented "  ---" underline is NOT a
    // setext header. Boundary-gated (header.rb:21): inside a paragraph the
    // underline is ordinary text, because this parser is reached only where
    // the earlier block parsers declined and it runs BEFORE :paragraph in
    // @block_parsers (kramdown.rb:76). The empty-text decline is
    // header.rb:22; there is no trailing-# strip here (header.rb:33 is
    // ATX-only). add_header consumes the whole match (header.rb:60).
    const setext = /^ {0,3}([^ \t][^\n]*)\n([=-])[-=]*[ \t\r\f\v]*\n/.exec(rest);
    if (setext !== null && afterBoundary()) {
      const parsed = parseHeaderContents(setext[1]);
      if (parsed.text !== "") {
        blocks.push({
          kind: "header",
          level: setext[2] === "-" ? 2 : 1,
          idAttr: parsed.id ?? generateId(parsed.text, state),
          text: parsed.text,
        });
        pos += setext[0].length;
        continue;
      }
    }
    // paragraph (paragraph.rb:24-42): PARAGRAPH_MATCH lines until LAZY_END
    const para = parseParagraphInto(blocks, src, pos);
    pos = para.nextPos;
  }
  return blocks;
}

/** codeblock.rb:19-26 parse_codeblock. CODEBLOCK_MATCH =
 *  (?: BLANK_LINE? (INDENT [ \t]*\S.*\n)+ (lazy ^[ \t]*\S.*\n)* )* :
 *  blank-separated indented runs merge into ONE codeblock, UNINDENTED
 *  non-blank lines continue it lazily
 *  ("    x\nplain" -> content "x plain\n") unless
 *  a blank run is not followed by an indented line - that run is left
 *  unconsumed (regex backtracking drops the iteration). The gsubs run on
 *  the WHOLE match, in order (codeblock.rb:23-24): /\n( {0,3}\S)/ ->
 *  " \1" (the space-join; 4-space line starts are untouched by {0,3}),
 *  then INDENT (kramdown.rb:345) stripped per line. The converter's
 *  outer div closing tag carries the indent (convert_codeblock,
 *  html.rb:121). */
function parseIndentedCode(rest: string): { block: KBlock; length: number } | null {
  const indentLine = /^(?:\t| {4})[ \t]*\S[^\n]*\n/;
  const lazyLine = /^[ \t]*\S[^\n]*\n/;
  let raw = "";
  let consumed = 0;
  let iterations = 0;
  for (;;) {
    if (iterations > 0) {
      const blanks = /^(?:[ \t]*\n)+/.exec(rest.slice(consumed));
      if (blanks === null) break;
      if (!indentLine.test(rest.slice(consumed + blanks[0].length))) break;
      raw += blanks[0];
      consumed += blanks[0].length;
    }
    let indented = 0;
    for (;;) {
      const line = indentLine.exec(rest.slice(consumed));
      if (line === null) break;
      raw += line[0];
      consumed += line[0].length;
      indented += 1;
    }
    if (indented === 0) {
      if (iterations === 0) return null; // START matched, MATCH declined
      break;
    }
    for (;;) {
      const line = lazyLine.exec(rest.slice(consumed));
      if (line === null) break;
      raw += line[0];
      consumed += line[0].length;
    }
    iterations += 1;
  }
  const content = raw
    .replace(/\n(?: {0,3}\S)/g, (m) => ` ${m.slice(1)}`) // codeblock.rb:23
    .replace(/^(?:\t| {4})/gm, ""); // codeblock.rb:24 (INDENT, kramdown.rb:345)
  return {
    block: { kind: "codeblock", lang: undefined, langClass: undefined, content },
    length: consumed,
  };
}

/** converter/html.rb:115-145 convert_codeblock + the coderay highlighter
 *  (kramdown-syntax-coderay coderay.rb `call`: CodeRay.scan(text, lang)
 *  .html(wrap: :div, line_numbers: false).chomp << "\n") +
 *  add_syntax_highlighter_to_class_attr (html.rb:417-427): the div class
 *  becomes "language-<lang|ruby> highlighter-coderay"; the OUTER div's
 *  closing tag carries the convert indent (html.rb:121
 *  ' '*indent<div...>...highlighted...' '*indent</div>), the CodeRay
 *  wrapper's own inner lines keep their builtin indentation (the same
 *  inside a blockquoted code block). A lang carrying the "?opts" suffix RAISES in CodeRay
 *  (coderay.rb rescues -> nil), which sends convert_codeblock down its
 *  fallback branch (html.rb:126-141): <pre><code class="language-<g4>>
 *  with kramdown's :all escaping (ESCAPE_ALL_RE - no quote entities).
 *  CodeRay's own plain-content escaping ADDS &quot; for double quotes
 *  (probe: say "hi" -> say &quot;hi&quot;, apostrophes untouched) -
 *  escapeHtmlCoderay below; tokenizing content (keywords/strings in a
 *  known language) diverges (the header's honest remainder). Indented
 *  codeblocks arrive with lang/langClass undefined and take the
 *  default_lang :ruby div (coderay.rb:92 lang ||= default_lang). */
function codeBlockHtml(
  content: string,
  lang: string | undefined,
  langClass: string | undefined,
  indent: number,
): string {
  const pad = " ".repeat(indent);
  if (lang !== undefined && lang.includes("?")) {
    const cls = langClass ?? "";
    // html.rb:129-130: result.chomp! then an explicit "\n" - one trailing
    // newline regardless of the content's own
    const chomped = escapeHtmlAll(content).replace(/\n$/, "");
    return `${pad}<pre><code${
      cls === "" ? "" : ` class="language-${cls}"`
    }>${chomped}\n</code></pre>\n`;
  }
  const language = langClass ?? "ruby";
  return (
    `${pad}<div class="language-${language} highlighter-coderay"><div class="CodeRay">\n` +
    `  <div class="code"><pre>${escapeHtmlCoderay(content)}</pre></div>\n` +
    `</div>\n${pad}</div>\n`
  );
}

/** header.rb:44-53 parse_header_contents: rstrip!, then the
 *  END-anchored HEADER_ID extraction (the " {#id}" tail - "My {#sec}"
 *  matches). Shared by BOTH header parsers. It does NOT do the ATX-only
 *  trailing-# strip (header.rb:33 lives in parse_atx_header) and does not
 *  decide emptiness - each caller applies its own decline rule. */
function parseHeaderContents(
  rawContents: string,
): { text: string; id: string | undefined } {
  let text = rawContents.replace(/\s+$/, ""); // header.rb:46 rstrip!
  const idMatch = /[ \t]\{#([^\s{}]+)\}$/.exec(text);
  let id: string | undefined;
  if (idMatch !== null) {
    id = idMatch[1];
    text = text.slice(0, text.length - idMatch[0].length).replace(/\s+$/, "");
  }
  return { text, id };
}

/** header.rb:31-35 parse_atx_header's postamble on top of the shared
 *  parse_header_contents, in Ruby's order: the unescaped trailing-# strip
 *  + rstrip, then the empty-text decline (header.rb:35). */
function parseAtxContents(
  rawContents: string,
): { text: string; id: string | undefined } | undefined {
  const parsed = parseHeaderContents(rawContents);
  let { text } = parsed;
  const stripped = text.replace(/(?<!\\)#+$/, ""); // header.rb:33
  if (stripped !== text) text = stripped.replace(/\s+$/, ""); // rstrip! only on success
  if (text === "") return undefined;
  return { text, id: parsed.id };
}

/** converter/base.rb:222-240 generate_id: strip leading non-letters, delete
 *  everything outside [a-zA-Z0-9 -], spaces to hyphens, downcase; empty ->
 *  "section"; duplicates get the "-<n>" suffix from @used_ids. */
function generateId(rawText: string, state: KramdownState): string {
  let gen = rawText.replace(/^[^a-zA-Z]+/, "");
  gen = gen.replace(/[^a-zA-Z0-9 -]/g, "");
  gen = gen.replace(/ /g, "-").toLowerCase();
  if (gen === "") gen = "section";
  if (state.usedIds.has(gen)) {
    const next = (state.usedIds.get(gen) ?? 0) + 1;
    state.usedIds.set(gen, next);
    gen += `-${next}`;
  } else {
    state.usedIds.set(gen, 0);
  }
  return gen;
}

/** list.rb parse_list (list.rb:63-133). Items: markers *, +, -, or digits
 *  + "." with a one-whitespace-minimum tail (PATTERN_TAIL, list.rb:59-61).
 *  Only the SAME marker type continues the list, with the leading-space
 *  allowance tightened per item indentation (fetch_pattern, list.rb:238-257
 *  - up to min(indentation,4)-1 spaces), so a deeper-indented marker line
 *  is CONTENT of the current item: when its indent-stripped text starts a
 *  list marker it SPLITS a new group - the nested list (list.rb:86-91).
 *  A lazy line that itself starts a list marker
 *  after a nested list was found is RE-INDENTED into the nested group
 *  (list.rb:88-90). Blank runs land INSIDE the current group's text
 *  (list.rb:99-104), so each item's groups parse through the REAL block
 *  parser into a shared per-item tree and the per-item transparency
 *  condition (list.rb:118-127) decides tight-vs-block rendering; the last
 *  item's trailing blank is popped and re-emitted AFTER the list
 *  (list.rb:149-152 — the trailing blank leaves the list, so a rule
 *  following it closes the list rather than joining it).
 *  convert_li (html.rb:189-201) renders a transparent-first li inline and
 *  other lis block-mode at li-children indent (+4). */
function parseList(
  rest: string,
  state: KramdownState,
): { block: KBlock; length: number; trailingBlank: boolean } | null {
  const firstMarker =
    /^( {0,3})([-+*])([\t ]+)([^\n]*)\n/.exec(rest) ??
    /^( {0,3})(\d+[.])([\t ]+)([^\n]*)\n/.exec(rest);
  if (firstMarker === null) return null;
  const ordered = firstMarker[2].includes(".");
  const items: { groups: string[][] }[] = [];
  let pos = 0;
  let contentIndent =
    firstMarker[1].length + firstMarker[2].length + firstMarker[3].length;
  let markerRe = listMarkerRe(ordered, contentIndent);
  // list.rb:90 nested_list_found = (item.value =~ LIST_START) on the
  // whitespace-stripped first content
  let nestedListFound = listStartRe.test(firstMarker[4]!.replace(/^[ \t]+/, ""));
  items.push({ groups: [[firstMarker[4]!]] });
  pos += firstMarker[0].length;
  let lastIsBlank = false;

  for (;;) {
    const at = rest.slice(pos);
    // list.rb:71-72: a horizontal rule after a blank line ends the list
    if (
      lastIsBlank &&
      /^ {0,3}([*_-])[ \t]*\1[ \t]*\1(?:\1|[ \t])*\n/.test(at)
    ) {
      break;
    }
    const marker = markerRe.exec(at);
    if (marker !== null) {
      items.push({ groups: [[marker[4]!]] });
      contentIndent = marker[1].length + marker[2].length + marker[3].length;
      markerRe = listMarkerRe(ordered, contentIndent);
      nestedListFound = listStartRe.test(marker[4]!.replace(/^[ \t]+/, ""));
      lastIsBlank = false;
      pos += marker[0].length;
      continue;
    }
    const line = /^[^\n]*\n/.exec(at);
    if (line === null) break;
    if (/^[ \t]*\n/.test(line[0])) {
      // blank (list.rb:99-104): the WHOLE run lands in the current group's
      // text; whether the list continues is decided by the following lines
      // (marker / indented content / the else-break at list.rb:104)
      const current = items[items.length - 1];
      if (current === undefined) break;
      const run = /^(?:[ \t]*\n)+/.exec(at)![0];
      const lines = run.replace(/\n$/, "").split("\n");
      current.groups[current.groups.length - 1]!.push(...lines);
      pos += run.length;
      lastIsBlank = true;
      continue;
    }
    // content/lazy (list.rb:83-96): content_re runs REGARDLESS of
    // last_is_blank (list.rb:83's `||` chain gates only the lazy arm); a
    // line indented by the item's indentation loses that indent
    // (indent_re, list.rb:38) and - when the stripped text starts a list
    // marker before any nested list was found - splits the nested group
    // (list.rb:86-91); a dedented marker line after a nested list was
    // found is re-indented into that nested group (list.rb:88-90); any
    // other line lazy-joins the current group (lazy only when NOT right
    // after a blank - the else-break at list.rb:104 ends the list).
    const current = items[items.length - 1];
    if (current === undefined) break;
    const tabsExpanded = line[0]
      .replace(/\n$/, "")
      .replace(/^(\t+)/, (tabs) => " ".repeat(4 * tabs.length)); // list.rb:84
    const indentationFound = new RegExp(`^ {${contentIndent}}`).test(tabsExpanded);
    const stripped = indentationFound ? tabsExpanded.slice(contentIndent) : tabsExpanded;
    const lastGroup = current.groups[current.groups.length - 1];
    if (lastGroup === undefined) break;
    if (indentationFound) {
      if (!nestedListFound && listStartRe.test(stripped)) {
        current.groups.push([stripped]); // list.rb:87: new (nested) group
        nestedListFound = true;
      } else {
        lastGroup.push(stripped);
      }
      lastIsBlank = false;
      pos += line[0].length;
      continue;
    }
    if (!lastIsBlank) {
      let text = tabsExpanded;
      if (nestedListFound && listStartRe.test(stripped)) {
        text = " ".repeat(contentIndent + 4) + stripped; // list.rb:89 re-indent
      }
      lastGroup.push(text);
      lastIsBlank = false;
      pos += line[0].length;
      continue;
    }
    break; // list.rb:104: a non-content line right after a blank ends the list
  }

  // list.rb:111-148: parse each group into the item's SHARED block tree,
  // then the transparency condition and the trailing-blank pop.
  const itemBlocks: KBlock[][] = items.map((item) => {
    const blocks: KBlock[] = [];
    for (const group of item.groups) {
      blocks.push(...parseBlocks(group.map((l) => `${l}\n`).join(""), state));
    }
    return blocks;
  });
  const transparents: boolean[] = [];
  let trailingBlankAfterList = false;
  for (let i = 0; i < itemBlocks.length; i++) {
    const blocks = itemBlocks[i]!;
    if (blocks.length === 0) {
      transparents[i] = false;
      continue;
    }
    const first = blocks[0]!;
    let transparent = false;
    if (
      first.kind === "p" &&
      (blocks.length < 2 ||
        blocks[1]!.kind !== "blank" ||
        (i === items.length - 1 && blocks.length === 2)) && // && !eob_found
      (i !== items.length - 1 ||
        items.length === 1 ||
        itemBlocks
          .slice(0, -1)
          .some(
            (earlier) =>
              earlier[0] === undefined ||
              earlier[0].kind !== "p" ||
              earlier[0].transparent === true,
          ))
    ) {
      transparent = true;
      if (blocks.length > 1 && blocks[1]!.kind !== "blank") {
        first.text += "\n"; // list.rb:129: the joiner newline
      }
      first.transparent = true;
    }
    transparents[i] = transparent;
    const lastBlock = blocks[blocks.length - 1]!;
    if (lastBlock.kind === "blank") {
      blocks.pop(); // list.rb:149
      if (i === items.length - 1) trailingBlankAfterList = true;
    }
  }

  // Rendering happens in convertBlocks (html.rb:173-201); parse_list
  // returns the parsed items + transparency verdicts (list.rb:149-152: the
  // last item's trailing blank re-emerges AFTER the list, in the parent
  // tree).
  return {
    block: {
      kind: "list",
      ordered,
      items: itemBlocks.map((blocks, i) => ({ blocks, transparent: transparents[i] === true })),
    },
    length: pos,
    trailingBlank: trailingBlankAfterList,
  };
}

/** fetch_pattern (list.rb:238-257): the continuing marker allows up to
 *  min(indentation,4)-1 leading spaces. The four capture groups mirror the
 *  LIST_START shape (lead spaces, marker, whitespace tail, content). */
function listMarkerRe(ordered: boolean, indentation: number): RegExp {
  const lead = Math.min(indentation, 4) - 1;
  return new RegExp(
    `^( {0,${lead}})(${ordered ? "\\d+[.]" : "[-+*]"})([\\t ]+)([^\\n]*)\\n`,
  );
}

/** list.rb:31 LIST_START (either marker type, {0,3} lead, whitespace tail
 *  required) - the nested-content test on indent-stripped text. */
const listStartRe = /^(?: {0,3}[-+*]| {0,3}\d+[.])[\t ]/;

/** paragraph.rb:24-42: PARAGRAPH_MATCH = /^.*?\n/ lines until LAZY_END (a
 *  blank run ahead or EOS), rstrip the whole result, then the last_child
 *  join (paragraph.rb:35-42) with the "  \n"/"\n" joiner (paragraph.rb:36
 *  extracts the three source chars before the paragraph - "  \n" keeps the
 *  hard break). The join is unreachable at the document root (blank lines
 *  separate paragraphs) but live in list-item group recursion. */
function parseParagraphInto(blocks: KBlock[], src: string, startPos: number): { nextPos: number } {
  const lines: string[] = [];
  let pos = startPos;
  for (;;) {
    const at = src.slice(pos);
    if (/^[ \t]*\n/.test(at)) break; // LAZY_END blank run
    const line = /^[^\n]*\n/.exec(at);
    if (line === null) break; // \Z
    lines.push(line[0].replace(/\n$/, ""));
    pos += line[0].length;
  }
  const text = lines.join("\n").replace(/\s+$/, "");
  const last = blocks[blocks.length - 1];
  if (last !== undefined && last.kind === "p") {
    const before = src.slice(Math.max(0, startPos - 3), startPos);
    last.text = `${last.text}${before === "  \n" ? "  \n" : "\n"}${text}`;
  } else {
    blocks.push({ kind: "p", text, transparent: false });
  }
  return { nextPos: pos };
}

// ---------------------------------------------------------------------------
// kramdown 2.5.2 subset - span parsing
// ---------------------------------------------------------------------------

/** The span walk: parser order mirrors @span_parsers
 *  (parser/kramdown.rb:79-81) for the ported subset - emphasis, codespan,
 *  autolink, link, smart_quotes, html_entity, typographic_syms,
 *  line_break, escaped_chars (span_html, footnote_marker, inline_math,
 *  span_extensions unported). The scheduler is leftmost-position-first;
 *  walking positions and checking each parser in order reproduces it.
 *
 *  `stop` carries the emphasis close condition - kramdown's parse_spans
 *  (parser/kramdown.rb:215-247) unites the stop regex with the span-start
 *  regexes in ONE leftmost scan, so the close is only honored at a walk
 *  position no earlier parser consumed; a valid stop ends the walk
 *  (stoppedAt = the delimiter run's start, -1 = never stopped). */
function parseSpans(
  text: string,
  ancestors: ReadonlySet<string>,
  begin = 0,
  stop?: { ch: string; run: number; elem: "em" | "strong"; from: number },
): { html: string; stoppedAt: number } {
  let out = "";
  let i = begin;
  while (i < text.length) {
    if (
      stop !== undefined &&
      i > stop.from && // !el.children.empty? (emphasis.rb:40)
      text.startsWith(stop.ch.repeat(stop.run), i) &&
      stopValid(text, i, stop)
    ) {
      return { html: out, stoppedAt: i };
    }
    const ch = text[i];
    if (ch === "*" || ch === "_") {
      const parsed = parseEmphasis(text, i, ancestors);
      if (parsed !== null) {
        out += parsed.html;
        i = parsed.next;
        continue;
      }
    }
    if (ch === "`") {
      const parsed = parseCodespan(text, i);
      out += parsed.html;
      i = parsed.next;
      continue;
    }
    if (ch === "<") {
      const auto = parseAutolink(text, i);
      if (auto !== null) {
        out += auto.html;
        i = auto.next;
        continue;
      }
    }
    if (ch === "[" || (ch === "!" && text[i + 1] === "[")) {
      const link = parseLinkOrImage(text, i, ancestors);
      if (link !== null) {
        out += link.html;
        i = link.next;
        continue;
      }
    }
    if (ch === "'" || ch === '"' || isQuoteAhead(text, i)) {
      const sq = parseSmartQuote(text, i);
      if (sq !== null) {
        out += sq.html;
        i = sq.next;
        continue;
      }
    }
    if (ch === "&") {
      const entity = parseHtmlEntity(text, i);
      if (entity !== null) {
        out += entity.html;
        i = entity.next;
        continue;
      }
    }
    const typo = parseTypographic(text, i);
    if (typo !== null) {
      out += typo.html;
      i = typo.next;
      continue;
    }
    const br = /^(?:  |\\\\)\n/.exec(text.slice(i));
    if (br !== null) {
      out += "<br />\n"; // convert_br, converter/html.rb:279-281
      i += br[0].length;
      continue;
    }
    const esc = parseEscapedChar(text, i);
    if (esc !== null) {
      out += esc.html;
      i = esc.next;
      continue;
    }
    out += escapeHtmlText(ch);
    i += 1;
  }
  return { html: out, stoppedAt: -1 };
}

/** The scheduler's span_start for smart_quotes is `[^\\]?["']` - it claims
 *  the position BEFORE the quote (unless that char is a backslash or there
 *  is none). */
function isQuoteAhead(text: string, i: number): boolean {
  return text[i] !== "\\" && (text[i + 1] === "'" || text[i + 1] === '"');
}

/** emphasis.rb:31-40's stop condition block: preceding char non-space; an
 *  em close not sitting at a nested strong start (`**(?!*)`); an
 *  underscore close not followed by an alnum. */
function stopValid(
  text: string,
  i: number,
  stop: { ch: string; run: number; elem: "em" | "strong" },
): boolean {
  const prev = i > 0 ? text[i - 1] : "";
  if (/\s/.test(prev)) return false;
  if (stop.elem === "em") {
    const after = text.slice(i, i + 2);
    if (after === `${stop.ch}${stop.ch}` && text[i + 2] !== stop.ch) return false;
  }
  if (stop.ch === "_" && /[a-zA-Z0-9]/.test(text[i + stop.run] ?? "")) return false;
  return true;
}

/** emphasis.rb:12-55: delimiter run of 1-2 same chars; strong for 2.
 *  Rejected when: underscore intraword (pre_match
 *  /[[:alpha:]]-?[[:alpha:]]*_*\z/ - approximated by an alphanumeric or
 *  underscore run before the delimiter), the next char is whitespace, or
 *  the same element type is already open. The content is span-parsed with
 *  the close condition riding as the walk's stop (sub_parse's
 *  parse_spans(el, stop_re) + block); an unclosed strong falls back to
 *  single-char em from the next char (emphasis.rb:42-46). */
function parseEmphasis(
  text: string,
  start: number,
  ancestors: ReadonlySet<string>,
): { html: string; next: number } | null {
  const ch = text[start];
  let run = 1;
  while (run < 2 && text[start + run] === ch) run += 1;
  const elem: "em" | "strong" = run === 2 ? "strong" : "em";
  const prev = start > 0 ? text[start - 1] : "";
  const nextCh = text[start + run];
  if (ch === "_" && /[a-zA-Z0-9_]/.test(prev)) return null; // intraword _
  if (nextCh === undefined || /\s/.test(nextCh)) return null;
  if (ancestors.has(elem)) return null;
  const contentStart = start + run;
  const innerAncestors = new Set(ancestors);
  innerAncestors.add(elem);
  const walked = parseSpans(text, innerAncestors, contentStart, {
    ch,
    run,
    elem,
    from: contentStart,
  });
  if (walked.stoppedAt >= 0) {
    return {
      html: `<${elem}>${walked.html}</${elem}>`,
      next: walked.stoppedAt + run,
    };
  }
  if (elem === "strong") {
    // unclosed strong -> retry as em from the next char (emphasis.rb:42-46)
    const retry = parseEmphasis(text, start + 1, ancestors);
    if (retry !== null) {
      return { html: escapeHtmlText(text[start]) + retry.html, next: retry.next };
    }
  }
  return null;
}

/** codespan.rb:13-50: a backtick run; single backticks with whitespace
 *  before AND after are literal (codespan.rb:22-25); content between equal
 *  runs is a codespan, single spaces at both ends stripped for multi-
 *  backtick delimiters; an unclosed run re-enters the text verbatim
 *  (codespan.rb:50 add_text(result)). */
function parseCodespan(text: string, start: number): { html: string; next: number } {
  let run = 0;
  while (text[start + run] === "`") run += 1;
  const simple = run === 1;
  const prevOk = start === 0 || /\s/.test(text[start - 1]);
  if (simple && prevOk && /\s/.test(text[start + 1] ?? " ")) {
    return { html: escapeHtmlText("`"), next: start + 1 };
  }
  const closeStart = text.indexOf("`".repeat(run), start + run);
  if (closeStart === -1) {
    return { html: escapeHtmlText("`".repeat(run)), next: start + run };
  }
  let content = text.slice(start + run, closeStart);
  if (!simple) {
    if (content.startsWith(" ")) content = content.slice(1);
    if (content.endsWith(" ")) content = content.slice(0, -1);
  }
  return { html: `<code>${escapeHtmlAll(content)}</code>`, next: closeStart + run };
}

/** autolink.rb:15 AUTOLINK_START: <scheme:...> or <user@host>. */
function parseAutolink(text: string, start: number): { html: string; next: number } | null {
  const match = /^<(mailto|https?|ftps?):([^ \t<>]+)>/.exec(text.slice(start));
  if (match === null) return null;
  const scheme = match[1];
  const rest = match[2];
  if (scheme === "mailto") {
    return {
      html: `<a href="mailto:${escapeAttribute(rest)}">${escapeHtmlText(rest)}</a>`,
      next: start + match[0].length,
    };
  }
  const url = `${scheme}:${rest}`;
  return {
    html: `<a href="${escapeAttribute(url)}">${escapeHtmlText(url)}</a>`,
    next: start + match[0].length,
  };
}

/** link.rb: [text](url "title") and images ![alt](src "title"). Nested
 *  brackets counted; <URL> forms unwrapped; the link text span-parses, the
 *  image alt is the raw inner text. Without a (url) part the bytes fall
 *  back to literal brackets around span-parsed text. */
function parseLinkOrImage(
  text: string,
  start: number,
  ancestors: ReadonlySet<string>,
): { html: string; next: number } | null {
  const isImage = text[start] === "!";
  let i = start + (isImage ? 1 : 0);
  let depth = 1;
  let close = -1;
  for (i += 1; i < text.length && close === -1; i++) {
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]") {
      depth -= 1;
      if (depth === 0) close = i;
    }
  }
  if (close === -1) return null;
  const innerText = text.slice(start + (isImage ? 2 : 1), close);
  const after = text.slice(close + 1);
  const target = /^[(]([^)]*)[)]/.exec(after);
  if (target === null) {
    if (isImage) return null;
    return {
      html: `[${parseSpans(innerText, ancestors).html}]`,
      next: close + 1,
    };
  }
  const targetInner = target[1];
  const angle = /^<([^>]*)>/.exec(targetInner);
  let url = angle !== null ? angle[1] : targetInner;
  let title: string | undefined;
  const titleMatch = /^(?:<[^>]*>|[^"\s]+)[ \t]+["']([^"']*)["'][ \t]*$/.exec(targetInner);
  if (titleMatch !== null) {
    url = angle !== null ? angle[1] : titleMatch[0].replace(/[ \t]+["'][^"']*["'][ \t]*$/, "");
    title = titleMatch[1];
  }
  if (isImage) {
    const attrs = ` src="${escapeAttribute(url)}" alt="${escapeAttribute(innerText)}"${
      title === undefined ? "" : ` title="${escapeAttribute(title)}"`
    }`;
    return { html: `<img${attrs} />`, next: close + 1 + target[0].length };
  }
  const inner = parseSpans(innerText, ancestors).html;
  const attrs = ` href="${escapeAttribute(url)}"${
    title === undefined ? "" : ` title="${escapeAttribute(title)}"`
  }`;
  return { html: `<a${attrs}>${inner}</a>`, next: close + 1 + target[0].length };
}

// --- smart quotes (parser/kramdown/smart_quotes.rb:121-152, verbatim) ----

const SQ_PUNCT = "[!\"#$%&'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~]";
const SQ_CLOSE = "[^ \\\\\t\r\n\\[{(-]";

/** One substitution step: a capture group re-emitted as text, a literal
 *  quote character, or a context rule resolved through SQ_SUBSTS against
 *  the captured quote character (group: which capture holds the quote). */
type SqSubst =
  | { kind: "text"; group: number }
  | { kind: "quote"; char: string }
  | { kind: "context"; via: "lquote" | "rquote"; group: number };

const SQ_RULES: { re: RegExp; substs: SqSubst[] }[] = [
  { re: new RegExp(`("|')(?=[_*]{1,2}\\S)`, "y"), substs: [{ kind: "context", via: "lquote", group: 1 }] },
  { re: new RegExp(`("|')(?=${SQ_PUNCT}(?!\\.\\.)\\B)`, "y"), substs: [{ kind: "context", via: "rquote", group: 1 }] },
  { re: new RegExp(`(\\s)"'(?=\\w)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u201c" }, { kind: "quote", char: "\u2018" }] },
  { re: new RegExp(`(\\s)'"(?=\\w)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u2018" }, { kind: "quote", char: "\u201c" }] },
  { re: new RegExp(`(\\s)'(?=\\d\\ds)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u2019" }] },
  { re: new RegExp(`(\\s)('|")(?=\\w)`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "context", via: "lquote", group: 2 }] },
  { re: new RegExp(`(${SQ_CLOSE})('|")`, "y"), substs: [{ kind: "text", group: 1 }, { kind: "context", via: "rquote", group: 2 }] },
  { re: new RegExp(`("|')(?=\\s|s\\b|$)`, "y"), substs: [{ kind: "context", via: "rquote", group: 1 }] },
  { re: new RegExp(`(.?)'`, "sy"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u2018" }] },
  { re: new RegExp(`(.?)"`, "sy"), substs: [{ kind: "text", group: 1 }, { kind: "quote", char: "\u201c" }] },
];

/** SQ_SUBSTS (smart_quotes.rb:138-147): context rules resolve to a quote
 *  per the actual quote character matched. */
function sqSubstChar(via: "lquote" | "rquote", quote: string): string {
  if (quote === '"') return via === "lquote" ? "\u201c" : "\u201d";
  return via === "lquote" ? "\u2018" : "\u2019";
}

/** parse_smart_quotes (smart_quotes.rb:158-169): the FIRST matching rule
 *  wins; capture groups re-enter as text, quote tokens convert through
 *  entity_to_str :as_char (the actual characters). */
function parseSmartQuote(text: string, start: number): { html: string; next: number } | null {
  for (const rule of SQ_RULES) {
    rule.re.lastIndex = start;
    const match = rule.re.exec(text);
    if (match === null) continue;
    let html = "";
    for (const subst of rule.substs) {
      if (subst.kind === "text") {
        const captured = match[subst.group];
        if (captured !== undefined && captured !== "") html += escapeHtmlText(captured);
      } else if (subst.kind === "quote") {
        html += subst.char;
      } else {
        html += sqSubstChar(subst.via, match[subst.group] ?? "'");
      }
    }
    return { html, next: start + match[0].length };
  }
  return null;
}

// --- entities / typographic symbols / escapes ----------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', copy: "\u00a9", reg: "\u00ae",
  trade: "\u2122", nbsp: "\u00a0", mdash: "\u2014", ndash: "\u2013",
  hellip: "\u2026", laquo: "\u00ab", raquo: "\u00bb", lsquo: "\u2018",
  rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", deg: "\u00b0",
  plusmn: "\u00b1", frac12: "\u00bd", times: "\u00d7", divide: "\u00f7",
  middot: "\u00b7", bull: "\u2022", dagger: "\u2020", sect: "\u00a7",
  para: "\u00b6", euro: "\u20ac", pound: "\u00a3", yen: "\u00a5", cent: "\u00a2",
};

/** html_entity + entity_to_str :as_char (utils/html.rb:27-41): a decoded
 *  entity whose char is NOT one of <>&" outputs the CHARACTER; those four
 *  (and numeric forms, which carry an :original) output the ORIGINAL bytes
 *  verbatim. An UNKNOWN name is not in kramdown's entity table, so the
 *  parser declines entirely (nil) and the "&" falls to convert_text's
 *  escape - "a &foobar; b" renders "a &amp;foobar; b". */
function parseHtmlEntity(text: string, start: number): { html: string; next: number } | null {
  const match = /^&([A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);/.exec(text.slice(start));
  if (match === null) return null;
  const original = match[0];
  const body = match[1];
  let char: string | undefined;
  if (body.startsWith("#")) {
    const code = body[1] === "#" || body[1] === "x" || body[1] === "X"
      ? parseInt(body.slice(2), body[1]?.toLowerCase() === "x" ? 16 : 10)
      : parseInt(body.slice(1), 10);
    if (Number.isFinite(code)) char = String.fromCodePoint(code);
  } else {
    char = NAMED_ENTITIES[body];
    if (char === undefined) return null; // not in the entity table: parser declines
  }
  if (char === undefined) {
    // a numeric reference with an invalid codepoint keeps its original
    // bytes (the :as_input arm of entity_to_str, utils/html.rb:33-35)
    return { html: original, next: start + original.length };
  }
  if (char === "<" || char === ">" || char === "&" || char === '"') {
    return { html: original, next: start + original.length };
  }
  return { html: char, next: start + original.length };
}

const TYPOGRAPHIC_SUBSTS: [RegExp, string, number][] = [
  [/^---/, "\u2014", 3],
  [/^--/, "\u2013", 2],
  [/^\.\.\./, "\u2026", 3],
  [/^\\<</, "&lt;&lt;", 4],
  [/^\\>>/, "&gt;&gt;", 4],
  [/^<< /, "\u00ab\u00a0", 3],
  [/^ >>/, "\u00a0\u00bb", 3],
  [/^<</, "\u00ab", 2],
  [/^>>/, "\u00bb", 2],
];

/** typographic_symbol.rb:13-17 TYPOGRAPHIC_SYMS, converter/html.rb:351-357
 *  + TYPOGRAPHIC_SYMS (html.rb:341-350): entity :as_char output; the raw
 *  "&lt;&lt;"/"&gt;&gt;" entries pass through as literal bytes. */
function parseTypographic(text: string, start: number): { html: string; next: number } | null {
  for (const [re, replacement, length] of TYPOGRAPHIC_SUBSTS) {
    if (re.test(text.slice(start, start + length))) {
      return { html: replacement, next: start + length };
    }
  }
  return null;
}

/** escaped_chars.rb:14 ESCAPED_CHARS: backslash + punctuation -> literal. */
function parseEscapedChar(text: string, start: number): { html: string; next: number } | null {
  const match = /^\\([\\.*_+`<>(){}[\]#!:|"'$=-])/.exec(text.slice(start));
  if (match === null) return null;
  return { html: escapeHtmlText(match[1]), next: start + match[0].length };
}

// --- html escaping (utils/html.rb:53-70) ---------------------------------

/** ESCAPE_ALL_RE: <, >, & (codespans, codeblocks). */
function escapeHtmlAll(s: string): string {
  return s.replace(/[<>&]/g, (m) => (m === "<" ? "&lt;" : m === ">" ? "&gt;" : "&amp;"));
}

/** CodeRay's own token escaping for PLAIN code content: & < > plus &quot;
 *  for double quotes (apostrophes untouched) - probe against coderay 1.1.3:
 *  say "hi" & <b> it's -> say &quot;hi&quot; &amp; &lt;b&gt; it's. */
function escapeHtmlCoderay(s: string): string {
  return escapeHtmlAll(s).replace(/"/g, "&quot;");
}

/** ESCAPE_TEXT_RE: <, >, & outside entities (entity refs reach the
 *  html_entity parser first and never land here unhandled). The two
 *  Ruby regexes (ESCAPE_TEXT_RE and ESCAPE_ALL_RE) reduce to the same
 *  replacement, so this is escapeHtmlAll's implementation. */
function escapeHtmlText(s: string): string {
  return escapeHtmlAll(s);
}

/** ESCAPE_ATTRIBUTE_RE: <, >, &, " (html_attributes, utils/html.rb:44-49). */
function escapeAttribute(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// markdown.rb:6-13 safe_process_content { Kramdown::Document.new(...).to_html }:
// stash references (content.rb:9-16 - chunk_list: :references, "Break out
// references (nests / links) into separate chunks"), convert the literal
// remainder, unstash (content.rb:151-153). Moved from card-mod-markdown.ts
// with the converter so both the mod's view and the bare render paths share
// one implementation. The caller runs the returned bytes through
// processContent (content.rb:22 - the restored chunks process).
// ---------------------------------------------------------------------------
export function kramdownToStashedHtml(raw: string): string {
  // The stash walk is ONE left-to-right pass over the raw content in Ruby's
  // chunk order (content.rb:104 without_references stashes Chunk::Nest +
  // Chunk::Link + Chunk::EscapedLiteral; stash_chunks content.rb:137-146
  // burns the {{<i>}} placeholders over the ONE shared stash array in
  // document order):
  //
  //   EscapedLiteral (card-mod-content chunk/escaped_literal.rb:13-16,
  //   prefix_re \\(?:\[\[|\{\{), FULL_RE \{\{[^}]*\}\} / \[\[[^\]]*\]\])
  //   stashed WHOLE, backslash included (chunk.text): kramdown must never
  //   see the escaped braces - its own \{ escape (ESCAPED_CHARS) would eat
  //   the backslash and leave a re-formed `{{<i>}}` the unstash would
  //   wrongly restore through, and the final process_content must receive
  //   the backslash so its own EscapedLiteral pass consumes it
  //   (escaped_literal.rb:22, escape_literal identity per markdown.rb:16-18).
  //   The escape pattern leads the alternation and wins by position: a
  //   `\{{` nest's backslash starts one char before the nest's braces.
  //
  //   Nest (nest.rb full_re \{\{([^{}]*)\}\}) and Link (link.rb:14 full_re
  //   \[\[([^\]]+)\]\] - the [^\]\n charset here is this port's existing
  //   link-stash shape): stashed verbatim; the unstash restores them and
  //   process_content renders them through the normal nest/link passes.
  //   Without the link stash kramdown's emphasis parser consumes the stars
  //   inside link marks whose card names carry them
  //   (`[[*guide|*guide rules]]` -> `<em>` mangling; a *all+*guide core
  //   render shows the intact link).
  type StashPiece = { kind: "text"; text: string } | { kind: "ref"; text: string };
  const merged: StashPiece[] = [];
  const REF_PATTERN =
    /\\(?:\{\{[^{}]*\}\}|\[\[[^\]\n]+\]\])|\{\{[^{}]*\}\}|\[\[[^\]\n]+\]\]/g;
  let last = 0;
  for (const match of raw.matchAll(REF_PATTERN)) {
    const start = match.index;
    if (start > last) merged.push({ kind: "text", text: raw.slice(last, start) });
    merged.push({ kind: "ref", text: match[0] });
    last = start + match[0].length;
  }
  if (last < raw.length) merged.push({ kind: "text", text: raw.slice(last) });
  let stashed = "";
  const stash: string[] = [];
  for (const piece of merged) {
    if (piece.kind === "text") {
      stashed += piece.text;
    } else {
      stashed += `{{${stash.length}}}`;
      stash.push(piece.text);
    }
  }
  return unstashNests(kramdownToHtml(stashed), stash);
}

/** content.rb:151-153 unstash_chunks: Chunk::Nest.gsub - a nest whose inner
 *  content is a number (Object#number?, card-1.110.0 config/initializers/
 *  01_core_extensions/object.rb:2-6 - Float() semantics) restores the
 *  stashed chunk text; an out-of-range index restores Ruby's nil (the gsub
 *  block returns nil -> ""); anything else is rebuilt as the same nest. */
function unstashNests(converted: string, stash: readonly string[]): string {
  return converted.replace(/{{([^{}]*)}}/g, (whole, inner: string) => {
    if (!isRubyNumber(inner)) return whole;
    return stash[Number(inner)] ?? "";
  });
}

/** Object#number? - `true if Float(self)` (01_core_extensions/object.rb:3-5).
 *  Float strips surrounding whitespace; "" raises (false). */
function isRubyNumber(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed === "") return false;
  return Number.isFinite(Number(trimmed));
}
