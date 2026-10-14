// memoizeScssCompiler (src/card/assets/scss-compiler.ts): the memo the Node
// and edge LibSass compilers sit behind. The properties pinned here are the
// ones that make the memo invisible to a caller: a repeated (source, style)
// answers from memory with the same bytes, a failed compile is never kept,
// concurrent repeats share one compile, and the memo holds at most
// `maxEntries` results. The compiler under test is a counting fake, so the
// suite runs without LibSass.

import { describe, expect, it } from "vitest";

import { memoizeScssCompiler, type ScssCompiler } from "../../../src/card/assets/scss-compiler.js";

/** A compiler that records each call and answers with a derived string. */
function countingCompiler(): { compile: ScssCompiler; calls: string[] } {
  const calls: string[] = [];
  const compile: ScssCompiler = async (source, style) => {
    calls.push(`${style}|${source}`);
    return `${style}:${source.toUpperCase()}`;
  };
  return { compile, calls };
}

describe("memoizeScssCompiler", () => {
  it("compiles a repeated source and style once and answers the same bytes", async () => {
    const { compile, calls } = countingCompiler();
    const memo = memoizeScssCompiler(compile);
    const first = await memo("a{b:c}", "compressed");
    const second = await memo("a{b:c}", "compressed");
    expect({ first, second, calls: calls.length }).toEqual({
      first: "compressed:A{B:C}",
      second: "compressed:A{B:C}",
      calls: 1,
    });
  });

  it("keeps a different output style as its own entry", async () => {
    const { compile, calls } = countingCompiler();
    const memo = memoizeScssCompiler(compile);
    await memo("a{b:c}", "compressed");
    await memo("a{b:c}", "nested");
    expect(calls).toEqual(["compressed|a{b:c}", "nested|a{b:c}"]);
  });

  it("shares one compile between repeats that are still in flight", async () => {
    const { compile, calls } = countingCompiler();
    const memo = memoizeScssCompiler(compile);
    const [x, y] = await Promise.all([memo("p", "compressed"), memo("p", "compressed")]);
    expect({ x, y, calls: calls.length }).toEqual({ x: "compressed:P", y: "compressed:P", calls: 1 });
  });

  it("does not keep a failed compile, so the next repeat compiles again", async () => {
    let attempts = 0;
    const flaky: ScssCompiler = async (source, style) => {
      attempts += 1;
      if (attempts === 1) throw new Error("LibSass compile failed: line 1");
      return `${style}:${source}`;
    };
    const memo = memoizeScssCompiler(flaky);
    await expect(memo("q", "compressed")).rejects.toThrow("line 1");
    await expect(memo("q", "compressed")).resolves.toBe("compressed:q");
    expect(attempts).toBe(2);
  });

  it("holds at most maxEntries results and evicts the least recently used", async () => {
    const { compile, calls } = countingCompiler();
    const memo = memoizeScssCompiler(compile, 2);
    await memo("one", "compressed");
    await memo("two", "compressed");
    await memo("one", "compressed"); // refreshes "one"; "two" is now the oldest
    await memo("three", "compressed"); // evicts "two"
    await memo("one", "compressed"); // still held
    await memo("two", "compressed"); // evicted, compiles again
    expect(calls).toEqual([
      "compressed|one",
      "compressed|two",
      "compressed|three",
      "compressed|two",
    ]);
  });
});
