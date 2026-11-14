// The ViewStub chunk — the placeholder tokens the Ruby view cache writes
// into cached container content so nesting content can stay cached while
// nested content changes. TypeScript port of card-mod-content-0.20.0
// lib/card/content/chunk/view_stub.rb + the :stub chunk list
// (card-1.110.0 lib/card/content/chunk.rb:90 register_list :stub,
// [ViewStub]) + format/render.rb#expand_stubs (:136-150).
//
// RUBY ORACLE (read this session):
// - view_stub.rb:11-16 registration: prefix_re Regexp.escape("(StUb"),
//   full_re /\A\(StUb(.*?)sTuB\)/m (non-greedy, dot-matches-newline),
//   idx_char "(".
// - view_stub.rb:18-25 interpret: the inner text JSON.parses into the
//   stub hash; interpret_hash_values dispatches interpret_<key> per key —
//   only :cast, :view_opts and :format_opts exist (view/cache/stub.rb:20-24
//   is the only producer: { cast:, view_opts:, format_opts: { nest_mode,
//   override, context_names } }); Rails' symbolize_keys! is TOP-LEVEL only.
// - :36-49 the per-key arms: cast and view_opts symbolize top-level;
//   format_opts symbolizes, nest_mode becomes a symbol (a string here —
//   JSON has no symbols), override answers hash[:override] == "true" (a
//   STRING comparison: a JSON true fails it, exactly as in Ruby, where
//   true == "true" is false), context_names maps to_name.
// - :51-53 process_chunk: format.stub_nest @stub_hash — render.rb:88-92
//   stub_nest -> prepare_stub_nest (:128-135: Card.fetch_from_cast cast,
//   normalize_special_options! view_opts, nest_name ||= "_self" for a
//   self-stub) -> nest stub_card, view_opts, format_opts. The port hands
//   the parsed hash to a caller-supplied stubNest callback: the Ruby-side
//   consumer is the view CACHE machinery (view/cache/*.rb), which the
//   port does not run — the expansion SEAM is the ported surface.
// - render.rb:136-150 expand_stubs: parse the cached string with the
//   :stub list, process the chunks; a SINGLE-piece content answers
//   pieces.first.to_s (a lone stub in the json format converts back to
//   its original type, e.g. a hash) and anything else answers to_s.
//
// CHUNK-LIST SCOPE (the A19 lesson): ViewStub is in NO list a non-stub
// parse uses — authored card content never carries these tokens through
// the :default/:references walks, so scanViewStubs is its own function and
// nothing here touches nest-syntax.ts's scans.

import { DeckoName } from "../name.js";

/** view_stub.rb:13 full_re /\A\(StUb(.*?)sTuB\)/m — the `s` flag is Ruby
 *  CORE's `m` (dot matches newline); sticky to reproduce the parser's
 *  anchored match. */
const STUB_AT_REGEXP = /\(StUb(.*?)sTuB\)/sy;

/** view/cache/stub.rb:20-24 stub_hash — the only shape a stub carries. */
export interface ViewStubHash {
  /** stub_cast (view/cache/stub.rb:32-35): card.cast minus a nil content. */
  cast: Record<string, unknown>;
  /** normalized_options + normalized_visibility_options at cache-write
   *  time (top-level keys only — Rails symbolize_keys! is not deep). */
  viewOpts: Record<string, unknown>;
  formatOpts: {
    /** format.nest_mode as a string (Ruby symbolizes the JSON string). */
    nestMode: string | undefined;
    /** interpret_format_opts' `hash[:override] == "true"` — the STRING
     *  comparison, faithfully: a JSON boolean true answers false here
     *  exactly as Ruby's true == "true" does. */
    override: boolean;
    /** context_names mapped through to_name. */
    contextNames: DeckoName[];
  };
}

/** One parsed ViewStub chunk. */
export interface ViewStubChunk {
  hash: ViewStubHash;
  /** Full-token span, start inclusive / end exclusive. */
  start: number;
  end: number;
}

/** view_stub.rb:18-25 + :36-49: JSON.parse the inner text and run the
 *  interpret arms. Malformed JSON raises (Ruby's JSON::ParserError — a
 *  stub is machine-written; there is no silent fallback in Ruby either).
 *  An unknown stub-hash key raises the interpret_<key> NoMethodError's
 *  counterpart for the same reason. */
export function interpretViewStub(inner: string): ViewStubHash {
  const parsed = JSON.parse(inner) as Record<string, unknown>;
  const hash: Partial<ViewStubHash> = {};
  for (const key of Object.keys(parsed)) {
    switch (key) {
      case "cast":
        hash.cast = parsed["cast"] as Record<string, unknown>;
        break;
      case "view_opts":
        hash.viewOpts = parsed["view_opts"] as Record<string, unknown>;
        break;
      case "format_opts": {
        const raw = (parsed["format_opts"] ?? {}) as Record<string, unknown>;
        hash.formatOpts = {
          nestMode:
            typeof raw["nest_mode"] === "string" ? (raw["nest_mode"] as string) : undefined,
          override: raw["override"] === "true",
          contextNames: Array.isArray(raw["context_names"])
            ? (raw["context_names"] as string[]).map((n) => DeckoName.parse(n))
            : [],
        };
        break;
      }
      default:
        throw new Error(`unknown stub-hash key: ${key}`);
    }
  }
  return hash as ViewStubHash;
}

/** The :stub chunk list walk (chunk.rb:90 + parser.rb:45-59): a
 *  left-to-right scan whose ONLY chunk class is ViewStub. The prefix
 *  "(StUb" is searched forward; its full match consumes through the
 *  closer; a failed full match advances one character (parser.rb:52-54 —
 *  a half-written "(StUbx" without the sTuB closer stays verbatim text). */
export function scanViewStubs(content: string): ViewStubChunk[] {
  const chunks: ViewStubChunk[] = [];
  let position = 0;
  while (position < content.length) {
    const idx = content.indexOf("(StUb", position);
    if (idx === -1) break;
    STUB_AT_REGEXP.lastIndex = idx;
    const match = STUB_AT_REGEXP.exec(content);
    if (match === null) {
      position = idx + 1;
      continue;
    }
    chunks.push({
      hash: interpretViewStub(match[1] ?? ""),
      start: idx,
      end: idx + match[0].length,
    });
    position = idx + match[0].length;
  }
  return chunks;
}

/** render.rb:136-150 expand_stubs: the :stub parse of a cached string,
 *  processed — every stub becomes its stub_nest answer, the surrounding
 *  text rides verbatim (Card::Content#to_s reconstructs from piece texts;
 *  unprocessed text is unchanged). The SINGLE-PIECE rule (:144-148): a
 *  content whose piece list is one entry long answers that piece's value
 *  verbatim (un-stringified) — the json format's lone stub converts back
 *  to its original type (e.g. a hash). Empty text pieces are not pieces
 *  (parser.rb:84 `unless @interval_string.empty?`). A content with no
 *  stubs answers the original string. */
export function expandViewStubs(
  cachedContent: string,
  stubNest: (hash: ViewStubHash) => unknown,
): unknown {
  const chunks = scanViewStubs(cachedContent);
  if (chunks.length === 0) return cachedContent;
  const pieces: unknown[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const text = cachedContent.slice(cursor, chunk.start);
    if (text !== "") pieces.push(text);
    pieces.push(stubNest(chunk.hash));
    cursor = chunk.end;
  }
  const tail = cachedContent.slice(cursor);
  if (tail !== "") pieces.push(tail);
  if (pieces.length === 1) return pieces[0];
  return pieces.map((piece) => (typeof piece === "string" ? piece : String(piece ?? ""))).join("");
}
