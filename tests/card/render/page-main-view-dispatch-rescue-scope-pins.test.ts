// page-main-view-dispatch-rescue-scope-pins.test.ts — the page's OWN main-view
// dispatch is a rescue scope, so a view-dispatch raise cannot fail the page.
//
//   npx vitest run tests/card/render/page-main-view-dispatch-rescue-scope-pins.test.ts
//
// THE DEFECT, and why the boot posture alone did not close it. Ruby production
// sets raise_all_rendering_errors false at boot (cardio/railtie.rb:38), and
// every rescue keyed on that flag then returns the quiet render-error span
// instead of raising: nested renders (format.ts renderNest) and delegated
// renders (format.ts renderDelegated). The edge boot now sets the posture
// (deploy/bunny-worker-src/bunny-edge-engine-entry.ts).
//
// But the page's root view dispatch is not one of those scopes. The root
// view-lane catch at format.ts:1430 is guarded by
// `!viewLaneRoot || allRenderingErrorsRaise()`, and viewLaneRoot is FALSE for
// every format in the tree (format.ts:217 defaults it, and nothing passes
// true), so that catch re-raises whatever the posture says. A raise there
// escaped the page and the edge answered Decko's server_error page.
//
// MEASURED, not assumed: at the tip that carries the boot posture, the
// signed-in run of 2026-10-22 still answered "GET /Harness_date_... 500" with
// its own log line "[bunny-edge-error-page] render failed for Harness date
// ...: invalid date". Ruby raises Date::Error on that content and its RENDERED
// PAGE still answers, carrying the quiet "(core view)" span
// (date-dashed-two-component-raise-pins.test.ts:9-12).

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  allRenderingErrorsRaise,
  setRaiseAllRenderingErrors,
} from "../../../src/card/render/format.js";

const repoRelative = (relative: string): string =>
  fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

const page = readFileSync(repoRelative("src/card/render/page.ts"), "utf8");
const format = readFileSync(repoRelative("src/card/render/format.ts"), "utf8");

describe("the page's own main-view dispatch is rescue-scoped", () => {
  it("imports the quiet span helper and the posture switch", () => {
    expect(page).toMatch(
      /import \{ str, type ViewResult, allRenderingErrorsRaise, quietRenderError \} from "\.\/format\.js"/,
    );
  });

  it("the root view-lane catch is what made the raise unconditional", () => {
    // The guard that ignores the posture: no caller ever passes viewLaneRoot.
    expect(format).toMatch(/if \(!viewLaneRoot \|\| allRenderingErrorsRaise\(\)\) throw error;/);
    expect(format).toMatch(/viewLaneRoot = false,/);
    expect(page).toMatch(
      /format\.ts:1430 is guarded by `!viewLaneRoot \|\| allRenderingErrorsRaise\(\)`/,
    );
  });

  it("the dispatch wraps the main render and falls back to the span", () => {
    expect(page).toMatch(/try \{\s*\n\s*mainBody = skipSync \? "" : str\(rootFormat\.renderView\(/);
    expect(page).toMatch(/if \(allRenderingErrorsRaise\(\)\) throw error;/);
    expect(page).toMatch(
      /mainBody = quietRenderError\(error, rootCard, mainView, rootFormat\);/,
    );
    // And the span is what the page wraps with, as for every other rescue.
    expect(page).toMatch(/rootFormat\.rendered = str\(mainBody\);/);
  });

  it("the loud posture still wins, so direct renders keep raising", () => {
    // The check is FIRST: a development build and every unit-test render call
    // reach the throw, not the span.
    const throwAt = page.indexOf("if (allRenderingErrorsRaise()) throw error;");
    const spanAt = page.indexOf(
      "mainBody = quietRenderError(error, rootCard, mainView, rootFormat);",
    );
    expect(throwAt).toBeGreaterThan(-1);
    expect(spanAt).toBeGreaterThan(throwAt);
  });

  it("the fix cites the measured 500 and Ruby's quiet page", () => {
    expect(page).toMatch(/bunny-edge-error-page\] render failed for Harness date/);
    expect(page).toMatch(/\(core view\)" render-error span/);
  });
});

describe("the posture switch still governs the scope", () => {
  const prior = allRenderingErrorsRaise();

  beforeAll(() => {
    return () => setRaiseAllRenderingErrors(prior);
  });

  it("true re-raises and false reaches the span, by construction of the guard", () => {
    setRaiseAllRenderingErrors(true);
    expect(allRenderingErrorsRaise()).toBe(true);
    setRaiseAllRenderingErrors(false);
    expect(allRenderingErrorsRaise()).toBe(false);
  });
});