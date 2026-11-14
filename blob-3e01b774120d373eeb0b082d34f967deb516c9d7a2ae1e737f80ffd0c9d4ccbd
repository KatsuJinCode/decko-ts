// The content.rb row's chunk-query surface, pinned against the pinned
// Card::Content's own answers.
//
// The oracle run: tests/server/oracle-probes-workbatch-c-20261025/
// content-chunks-probe.rb loads the pinned content.rb by its own bytes under
// Ruby 3.4.11 (with clean.rb, the deck's Object#number? and ActiveSupport's
// Array.wrap stood in - all three are what the deck's runtime carries) and
// runs the pinned methods over the fixed parse Ruby answers for "a [[L]] b
// {{N}} c \{{E}}": a Link, a Nest and an EscapedLiteral around text. The
// assertions below are those answers:
//
//   find_chunks(nil)            -> []        (nil interprets to the Chunk
//                                            MODULE; is_a? never matches)
//   find_chunks(:Link)          -> ["[[L]]"]
//   has_chunk?(:Nest)           -> RAISES NoMethodError, "undefined method
//                                  'any' for an instance of Enumerator"
//                                  (the pinned bytes' own `.any` bug)
//   stash_chunks([Nest])        -> ["{{N}}"], masked marker "{{0}}"
//   without_chunks(Nest)        -> "a [[L]] B {{N}} c \{{E}}" (the block ran
//                                  on the text, the nest restored verbatim)
//   without_references + upcase -> "A [[L]] B {{N}} C \{{E}}"
//   unstash numeric-only        -> "x {{N}} y {{z}}" (only Float-parseable
//                                  inners restore; Ruby's array read past
//                                  the end renders as nothing)
//   strip_chunks(Nest)          -> "a [[L]] b  c \{{E}}" (the nest's text is
//                                  gone; the double space is what remains)
//   interpret_chunk_type nil    -> the Chunk module; "Nest"/:Link/classes
//                                  pass; 42 -> ArgumentError

import { describe, expect, it } from "vitest";
import {
  eachChunk,
  findChunks,
  hasChunk,
  interpretChunkType,
  scanChunks,
  stashChunks,
  stripChunks,
  unstashChunks,
  withoutChunks,
  withoutNests,
  withoutReferences,
} from "../../../src/card/render/content-chunks.js";

// The same source the oracle parse mirrors: a link, a nest and an escaped
// literal around text.
const SOURCE = "a [[L]] b {{N}} c \\{{E}}";

describe("content.rb#each_chunk / the parser walk", () => {
  it("carries the chunks in parse order: link, nest, escaped", () => {
    expect(eachChunk(SOURCE).map((c) => [c.kind, c.text])).toEqual([
      ["link", "[[L]]"],
      ["nest", "{{N}}"],
      ["escaped", "\\{{E}}"],
    ]);
  });

  it("keeps an escaped literal out of the nest scan (the backslash prefix wins)", () => {
    const chunks = scanChunks("x \\{{not a nest}} y");
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.kind).toBe("escaped");
    expect(chunks[0]!.text).toBe("\\{{not a nest}}");
  });

  it("leaves an unterminated candidate as text (the advance-one-char rule)", () => {
    expect(scanChunks("open {{brace and [[link without")).toEqual([]);
  });
});

describe("content.rb#interpret_chunk_type (:124-135)", () => {
  it("answers the Chunk module for nil, which nothing is an instance of", () => {
    expect(interpretChunkType(undefined)).toBeUndefined();
  });

  it("maps the Ruby constant names and the port's kind names", () => {
    expect(interpretChunkType("Nest")).toBe("nest");
    expect(interpretChunkType("Link")).toBe("link");
    expect(interpretChunkType("EscapedLiteral")).toBe("escaped");
  });

  it("raises for anything else (Ruby's ArgumentError / const_get NameError)", () => {
    expect(() => interpretChunkType("NoSuch" as never)).toThrow("unknown chunk type: NoSuch");
  });
});

describe("content.rb#find_chunks (:38-41)", () => {
  it("selects the chunks of a type in parse order", () => {
    expect(findChunks(SOURCE, "link").map((c) => c.text)).toEqual(["[[L]]"]);
    expect(findChunks(SOURCE, "nest").map((c) => c.text)).toEqual(["{{N}}"]);
  });

  it("answers empty for nil, the pinned bytes' own answer", () => {
    expect(findChunks(SOURCE)).toEqual([]);
  });
});

describe("content.rb#has_chunk? (:43-45), the pinned raise", () => {
  it("raises the pinned NoMethodError on every call", () => {
    expect(() => hasChunk(SOURCE, "nest")).toThrow(
      "undefined method 'any' for an instance of Enumerator",
    );
  });
});

describe("content.rb#stash_chunks / unstash_chunks (:137-152)", () => {
  it("masks the stashed classes with {{N}} markers in chunk order", () => {
    const { masked, stashed } = stashChunks(SOURCE, ["nest"]);
    expect(masked).toBe("a [[L]] b {{0}} c \\{{E}}");
    expect(stashed).toEqual(["{{N}}"]);
  });

  it("restores numeric inners only, and an out-of-range index restores nothing", () => {
    expect(unstashChunks("x {{0}} y {{z}}", ["{{N}}"])).toBe("x {{N}} y {{z}}");
    expect(unstashChunks("x {{5}} y", ["{{N}}"])).toBe("x  y");
  });

  it("keeps Ruby's Float() parse rule, not Number()'s", () => {
    // Ruby Float("") and Float(" ") raise (the deck's number? -> false);
    // JS Number() answers 0 for both, so the set is spelled out.
    expect(unstashChunks("a {{}} b", [])).toBe("a {{}} b");
    expect(unstashChunks("a {{ }} b", [])).toBe("a {{ }} b");
  });
});

describe("content.rb#without_chunks (:107-112)", () => {
  it("runs the block on the text and restores the stashed chunks verbatim", () => {
    const out = withoutChunks(SOURCE, ["nest"], (masked) => masked.replace(" b ", " B "));
    expect(out).toBe("a [[L]] B {{N}} c \\{{E}}");
  });

  it("keeps the reference classes' bytes through without_references", () => {
    const out = withoutReferences(SOURCE, (masked) => masked.toUpperCase());
    expect(out).toBe("A [[L]] B {{N}} C \\{{E}}");
  });

  it("withoutNests is the Nest-only form (the link text rides the block like Ruby's)", () => {
    const out = withoutNests(SOURCE, (masked) => masked.toUpperCase());
    expect(out).toBe("A [[L]] B {{N}} C \\{{E}}");
  });
});

describe("content.rb#strip_chunks (:118-120)", () => {
  it("removes the selected chunks' text from the content", () => {
    expect(stripChunks(SOURCE, "nest")).toBe("a [[L]] b  c \\{{E}}");
  });

  it("removes nothing for nil (the Chunk-module select)", () => {
    expect(stripChunks(SOURCE)).toBe(SOURCE);
  });
});
