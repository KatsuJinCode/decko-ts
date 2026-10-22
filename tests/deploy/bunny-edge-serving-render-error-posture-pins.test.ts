// bunny-edge-serving-render-error-posture-pins.test.ts — the deployed edge
// serves with RUBY'S PRODUCTION render-error posture, not the library's
// loud-by-default one.
//
//   npx vitest run tests/deploy/bunny-edge-serving-render-error-posture-pins.test.ts
//
// THE DEFECT. src/card/render/format.ts:689 declares the posture as
// `let raiseAllRenderingErrors = true`. Every rescue reads it:
// format.ts:1418 (the view-lane root) and format.ts:2218 (renderDelegated)
// re-raise while it is true, and only return quietRenderError while it is
// false. That is half of Ruby's error.rb:65-67 `loud_error?`.
//
// The reference-harness adapters and vm-staging-server.mjs set it false at
// boot. The EDGE never did: nothing in deploy/bunny-worker-src/ nor in the
// two bundlers calls setRaiseAllRenderingErrors. So the deployed serving
// process ran loud, a render raise escaped the page instead of becoming the
// quiet span, and the edge answered Decko's server_error page with a 500.
// The signed-in run of 2026-10-22 recorded "GET /Harness_date_... 500" beside
// its own log line "[bunny-edge-error-page] render failed for Harness date
// ...: invalid date" - a Date card whose content cannot parse, which Ruby
// raises on internally and whose RENDERED PAGE carries the quiet
// "(core view)" span (date-dashed-two-component-raise-pins.test.ts:9-12).
//
// Ruby production sets the posture false at boot (cardio/railtie.rb:38), so
// the serving boot must too.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  allRenderingErrorsRaise,
  setRaiseAllRenderingErrors,
} from "../../src/card/render/format.js";

const repoRelative = (relative: string): string =>
  fileURLToPath(new URL(`../../${relative}`, import.meta.url));

const entry = readFileSync(
  repoRelative("deploy/bunny-worker-src/bunny-edge-engine-entry.ts"),
  "utf8",
);
const format = readFileSync(repoRelative("src/card/render/format.ts"), "utf8");

describe("the deployed edge serves with Ruby's production render-error posture", () => {
  it("the serving entry imports the posture setter", () => {
    expect(entry).toContain(
      'import { setRaiseAllRenderingErrors } from "../../src/card/render/format.js"',
    );
  });

  it("the serving entry sets it FALSE at boot, before the handler is registered", () => {
    // At module scope, and BEFORE `BunnySDK.net.http.serve`: a request
    // handled before the posture is set would still raise.
    const set = entry.indexOf("setRaiseAllRenderingErrors(false);");
    expect(set).toBeGreaterThan(-1);
    // The header comment names `BunnySDK.net.http.serve` too, so the
    // registration is the LAST mention: the real call closes the file.
    const serve = entry.lastIndexOf("BunnySDK.net.http.serve(");
    expect(serve).toBeGreaterThan(-1);
    expect(set).toBeLessThan(serve);
    // Module scope, not inside the handler closure: the call's own line
    // carries no leading whitespace, so it is a top-level statement and not
    // a statement inside the serve callback.
    const lines = entry.split("\n").map((l) => l.replace(/\r$/, ""));
    const callLine = lines.findIndex((l) => l === "setRaiseAllRenderingErrors(false);");
    expect(callLine).toBeGreaterThan(-1);
    expect(lines[callLine]).toBe("setRaiseAllRenderingErrors(false);");
    // And it sits after the imports, before the registration.
    const importLine = lines.findIndex((l) =>
      l.includes('import { setRaiseAllRenderingErrors }'),
    );
    expect(callLine).toBeGreaterThan(importLine);
  });

  it("the call cites the Ruby boot that sets the same switch false", () => {
    expect(entry).toMatch(/railtie\.rb:38/);
    expect(entry).toMatch(/raise_all_rendering_errors = false/);
    expect(entry).toMatch(/quiet render-error span/);
  });

  it("the library default stays LOUD, so bare renders keep raising", () => {
    // The boot is the serving truth; the default covers only processes that
    // never boot as a server (unit tests, reference runners).
    expect(format).toMatch(/let raiseAllRenderingErrors = true;/);
    // And the adapters that already set false are untouched by this fix.
    const staging = readFileSync(repoRelative("vm-staging-server.mjs"), "utf8");
    expect(staging).toContain("setRaiseAllRenderingErrors(false)");
  });

  it("the posture comment no longer claims only adapters may set it", () => {
    // The recorded contradiction: page.ts says a view-dispatch raise must not
    // fail the page, which a loud serving posture guarantees it does.
    expect(format).not.toMatch(/harness adapters set false; \*\*nothing else should\*\*/);
    expect(format).toMatch(/bunny-edge-engine-entry\.ts calls/);
  });
});

describe("the posture switch actually governs the rescues", () => {
  const prior = allRenderingErrorsRaise();

  beforeAll(() => {
    // Restored after the suite so no other test inherits a flipped posture.
    return () => setRaiseAllRenderingErrors(prior);
  });

  it("reads true until a boot sets it, false after", () => {
    setRaiseAllRenderingErrors(true);
    expect(allRenderingErrorsRaise()).toBe(true);
    // Exactly what the serving entry does.
    setRaiseAllRenderingErrors(false);
    expect(allRenderingErrorsRaise()).toBe(false);
  });
});