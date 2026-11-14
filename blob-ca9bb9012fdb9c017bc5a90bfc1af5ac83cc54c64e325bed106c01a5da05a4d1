import { describe, expect, it } from "vitest";
import { uglifyHarmonySyntaxError, uglifyHarmonyCompile } from "../../../src/card/assets/uglify-harmony-compile-engine.js";
import { staticUglifyHarmonySyntaxError, staticUglifyHarmonyCompile } from "../../../src/card/assets/uglify-harmony-static.js";
import { trustedUglifierFunction } from "../../../src/card/assets/uglify-harmony-static.generated.js";

describe.each([["original Node VM", uglifyHarmonySyntaxError], ["static edge", staticUglifyHarmonySyntaxError]] as const)("the real vendored Uglifier save validator (%s)", (_name, validate) => {
  it.each(["", "// comment", "let x = 1; const f = n => n + x;", "function f(x) { return x + 1; }"])("accepts harmony source %j", source => {
    expect(validate(source)).toBeUndefined();
  });

  it("uses the actual parser position and stock context/ANSI formatting", () => {
    // Uglifier.rb context_lines_message/format_error_line and Cardio's
    // ansi2_html.rb prescribe these bytes; no engine output is an oracle.
    expect(validate("var ok = 1;\nvar nope = ;\nvar done = 2;")).toBe(
      "Unexpected token: punc (;)\n--\n" +
      "<span style='color: darkcyan; '> 1</span> var ok = 1;\n" +
      "<span style='color: lightcoral; '> => </span>var nope = <span style='color: lightcoral; '>;</span>\n" +
      "<span style='color: darkcyan; '> 3</span> var done = 2;\n==",
    );
  });

  it("retains the eight-line context bound with the stock number width", () => {
    const source = [...Array.from({ length: 12 }, () => "var ok = 1;"), "var bad = ;", ...Array.from({ length: 12 }, () => "var ok = 1;")].join("\n");
    const result = validate(source)!;
    expect(result).toContain("<span style='color: darkcyan; '>  5</span>");
    expect(result).toContain("<span style='color: darkcyan; '> 21</span>");
    expect(result).not.toContain(">  4</span>");
    expect(result).not.toContain("> 22</span>");
    expect(result).toContain("<span style='color: lightcoral; '> => </span>var bad = <span style='color: lightcoral; '>;</span>");
  });
});

describe("static initialization retains the actual original parser and minifier", () => {
  const sources = ["", "let x=1;const f=n=>n+x;", "class X { method(x) { return x * 2; } }", "const [x,y]=[1,2]; console.log(`${x+y}`);", "var café = '😀'; console.log(café);", "var fn=new Function('return 1');"];
  it.each(sources)("emits identical minified bytes for %j", source => {
    expect(staticUglifyHarmonyCompile(source)).toBe(uglifyHarmonyCompile(source));
  });
  it.each(["probe invalid", "var café = 1; café café", "var smile='😀'; probe invalid", "var ok=1;\nfunction broken( {", "var invalid = ;", "var a='unterminated"])("keeps real parser diagnostics for %j", source => {
    expect(staticUglifyHarmonySyntaxError(source)).toBe(uglifyHarmonySyntaxError(source));
  });
  it("rejects an unrecorded constructor instead of evaluating or learning it", () => {
    expect(() => trustedUglifierFunction("return 42")).toThrow("unrecorded trusted Uglifier constructor");
    expect(() => trustedUglifierFunction("return 42")).toThrow("unrecorded trusted Uglifier constructor");
  });
});
