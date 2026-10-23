// cap-P6 (continued) - the update leg reaches the Rules tab on the board path
// the read leg uses.
//
//   node --test tools/edge-signed-in-exercise/test/p6-board-path.test.mjs
//
// THE PIN. A view is a PATH SEGMENT, not a query param. The port states the
// mechanism itself at src/card/render/views.ts:2141-2147, pinning path.rb:31-38
// Card::Path#base: `elsif mark.present? && view.present? then
// "#{mark}/#{view}"`, with only what stays in opts reaching the query. So
// "/NAME?view=board" does not select the board view at all.
//
// THE DEFECT. The update leg navigated "/NAME?view=board" and then opened the
// tab by clicking the first anchor inside a rules tab view. Neither was
// reachable: the card's own core view renders for that URL, and it carries no
// `.board` ancestor and no rules_tab-view slot. The signed-in run of
// 2026-10-22 recorded the leg timing out after 15 s at
// "waiting for locator('.board .rules_tab-view select[name=mark]').first()"
// while the read leg, on "/NAME/board", found that same selector.
//
// This test is scoped to the UPDATE leg's own source block, so the read leg's
// correct path cannot satisfy it by accident.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const checksUrl = new URL("../checks-permission-rules.mjs", import.meta.url);
const viewsUrl = new URL("../../../src/card/render/views.ts", import.meta.url);

const checks = readFileSync(checksUrl, "utf8");

// Isolate the update leg: from its own name down to the read leg's name.
const updateStart = checks.indexOf(
  "P6 the Rule board: an administrator sets an update rule through the Rules tab",
);
const readStart = checks.indexOf(
  "P6 the Rule board: an administrator sets a read rule through the Rules tab",
);
assert.ok(updateStart !== -1, "the update leg is present in the checks module");
assert.ok(readStart > updateStart, "the read leg follows the update leg");
const updateLeg = checks.slice(updateStart, readStart);

test("the port pins the view-as-path-segment mechanism this fix rests on", () => {
  const views = readFileSync(viewsUrl, "utf8");
  // path.rb:31-38 Card::Path#base, quoted by the port's own contract comment.
  assert.match(views, /PATH MECHANISM \(path\.rb:31-38 Card::Path#base\)/);
  assert.match(views, /A `view:` option is a path SEGMENT, not a query param/);
});

test("the update leg navigates to the board as a path segment", () => {
  assert.match(
    updateLeg,
    /admin\.page\.goto\(`\$\{stack\.origin\}\/\$\{encodeURIComponent\(cardName\)\}\/board`/,
    "the update leg goes to /NAME/board, the read leg's URL",
  );
});

test("the update leg no longer asks for the board through the query string", () => {
  assert.equal(
    /cardName\)\}\?view=board/.test(updateLeg),
    false,
    "/NAME?view=board does not select the board view; a view is a path segment",
  );
  // And no leg in the module reaches for the board by query param. Comment
  // lines are excluded: this file's own prose quotes the defect string it is
  // pinning, and prose must not be able to fail (or satisfy) a code assertion.
  const codeLines = checks
    .split("\n")
    .filter(line => !line.trim().startsWith("//"));
  assert.equal(
    codeLines.some(line => line.includes("?view=board")),
    false,
    "no leg navigates to the board through the query string",
  );
});

test("the update leg opens the Rules tab by the nav link that carries its label", () => {
  assert.match(
    updateLeg,
    /admin\.page\.locator\("\.board \.nav-link", \{ hasText: "Rules" \}\)/,
    "the tab is opened the read leg's way, by the Rules nav link",
  );
  // Not by the first anchor inside a rules tab view the wrong URL never rendered.
  assert.equal(/locator\("\.board \.rules_tab-view a"\)/.test(updateLeg), false);
});

test("the update leg still waits for the same set selector on that board", () => {
  // The fix moves the PATH, not the thing being measured: the leg must still
  // read the tab's set selector, or it would pass without measuring anything.
  assert.match(
    updateLeg,
    /locator\("\.board \.rules_tab-view select\[name='mark'\]"\)\.first\(\)/,
  );
  assert.match(updateLeg, /setSelect\.waitFor\(\{ state: "attached", timeout: 15000 \}\)/);
});