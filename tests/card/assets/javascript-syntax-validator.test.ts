import { describe, expect, it } from "vitest";
import { uglifyHarmonySyntaxError } from "../../../src/card/assets/uglify-harmony-compile-engine.js";

describe("the real vendored Uglifier save validator", () => {
  it.each(["", "// comment", "let x = 1; const f = n => n + x;", "function f(x) { return x + 1; }"])("accepts harmony source %j", source => {
    expect(uglifyHarmonySyntaxError(source)).toBeUndefined();
  });

  it("uses the actual parser position and stock context/ANSI formatting", () => {
    // Uglifier.rb context_lines_message/format_error_line and Cardio's
    // ansi2_html.rb prescribe these bytes; no engine output is an oracle.
    expect(uglifyHarmonySyntaxError("var ok = 1;\nvar nope = ;\nvar done = 2;")).toBe(
      "Unexpected token: punc (;)\n--\n" +
      "<span style='color: darkcyan; '> 1</span> var ok = 1;\n" +
      "<span style='color: lightcoral; '> => </span>var nope = <span style='color: lightcoral; '>;</span>\n" +
      "<span style='color: darkcyan; '> 3</span> var done = 2;\n==",
    );
  });

  it("retains the eight-line context bound with the stock number width", () => {
    const source = [...Array.from({ length: 12 }, () => "var ok = 1;"), "var bad = ;", ...Array.from({ length: 12 }, () => "var ok = 1;")].join("\n");
    const result = uglifyHarmonySyntaxError(source)!;
    expect(result).toContain("<span style='color: darkcyan; '>  5</span>");
    expect(result).toContain("<span style='color: darkcyan; '> 21</span>");
    expect(result).not.toContain(">  4</span>");
    expect(result).not.toContain("> 22</span>");
    expect(result).toContain("<span style='color: lightcoral; '> => </span>var bad = <span style='color: lightcoral; '>;</span>");
  });
});
