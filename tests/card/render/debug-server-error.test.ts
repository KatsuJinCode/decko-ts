// card-mod-format set/all/html/error.rb view :debug_server_error: the error
// page shown for a server error when the *debugger card is on, registered on
// All::Html::Error and rendered from the current server error.

import { describe, expect, it } from "vitest";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { debugErrorPageHtml, debugFrames, debugServerErrorView, withCurrentServerError } from "../../../src/card/render/debug-server-error.js";
import type { ViewContext } from "../../../src/card/render/format.js";

it("debug_server_error is All::Html::Error's, on every card", () => {
  const chain = defaultDeckLoader().viewChain("ALL TYPE-rich_text SELF-pancake", "debug_server_error");
  expect(chain[0]?.setModule).toBe("All::Html::Error");
});

describe("debug_server_error", () => {
  const ctx = {} as ViewContext;

  it("raises when there is no current server error, as Ruby's ErrorPage does on nil", () => {
    expect(() => debugServerErrorView(ctx)).toThrow(/no current server error/);
  });

  it("renders the BetterErrors page for the current error", () => {
    const error = new TypeError("bad <input>\n\n\nsecond line");
    const html = withCurrentServerError(error, "/Some_Card?view=core", () => debugServerErrorView(ctx));
    expect(html).toContain("<strong>TypeError</strong>");
    expect(html).toContain("at /Some_Card?view=core");
    expect(html).toContain("<p>bad &lt;input&gt;\nsecond line</p>");
    expect(html).toContain('<nav class="tabs">');
    expect(html).toContain("<style>");
    expect(html).not.toContain('"#{id}"');
    expect(() => debugServerErrorView(ctx)).toThrow(); // the scope ended
  });

  it("classifies frames the way StackFrame does", () => {
    const error = new Error("x");
    error.stack = [
      "Error: x",
      "    at RenderFormat.renderView (C:/repo/src/card/render/format.ts:120:5)",
      "    at Object.run (C:/repo/node_modules/vitest/dist/index.js:9:1)",
      "    at node:internal/process/task_queues:95:5",
    ].join("\n");
    expect(debugFrames(error)).toEqual([
      { context: "application", className: "RenderFormat", methodName: "#renderView", prettyPath: "src/card/render/format.ts", line: "120" },
      { context: "gem", className: "Object", methodName: "#run", prettyPath: "vitest dist/index.js", line: "9" },
      { context: "dunno", className: "", methodName: "", prettyPath: "node:internal/process/task_queues", line: "95" },
    ]);
    expect(debugErrorPageHtml(error, "/x", "abcd")).toContain('var OID = "abcd";');
  });
});
