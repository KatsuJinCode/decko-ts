// Pins the exhaustive enumeration runner's navbox (quick-search) affordance
// hint against the markup the reference actually serves.
//
// The pin exists because a hint naming a selector no engine emits produces an
// affordance-not-found red that no engine change can turn green, and it lands
// in the same histogram as a real engine defect. ACT-057 and ACT-103 were such
// reds: the decoder asked for `.navbox input[name*='query']` while decko renders
// the box as `.d0-search-box > form.search-box-form > input[name="query[keyword]"]`.
//
// It reads the selector out of the runner's source (the runner executes run()
// at import time, so it cannot be imported) and then proves, against a booted
// engine on the real fixture, that the served page satisfies both structural
// halves of that selector.
//
// Run: node --test reference-harness/browser/test/exhaustive-search-box-selector.test.mjs
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine, startEngine } from "../lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const runnerPath = path.join(repo, "reference-harness", "browser", "run-exhaustive.mjs");
const fixtureDir = path.join(repo, "reference-harness", "fixtures", "synthetic-v1");
const engineManifest = path.join(repo, "reference-harness", "browser", "engines", "ts.json");

/** The css selector the runner's navbox/quick-search hint pushes. */
function searchBoxSelector() {
  const source = readFileSync(runnerPath, "utf8");
  const line = source
    .split("\n")
    .find((l) => l.includes("quick search") && l.includes("hints.push"));
  assert.ok(line, "the runner no longer decodes a navbox/quick-search hint");
  const m = line.match(/value:\s*"([^"]+)"/);
  assert.ok(m, `no css selector on the navbox hint line: ${line}`);
  return m[1];
}

test("the navbox hint names the search form the reference renders", () => {
  const selector = searchBoxSelector();
  // `.navbox` is not a class decko emits (see the note at the hint): the hint
  // matched nothing on any rendered page of any engine, which is what made
  // ACT-057 and ACT-103 red.
  assert.doesNotMatch(selector, /navbox/);
  // The form class comes from search_box.haml's search_form; the field is the
  // `input name="query[keyword]"` of search_box.rb's search_box_contents.
  assert.equal(selector, ".search-box-form input[name*='query']");
});

let server;
before(async () => {
  server = await startEngine(loadEngine(engineManifest), fixtureDir, {
    logFile: path.join(repo, "tmp", "exhaustive-search-box-selector-test-server.log"),
  });
});
after(async () => {
  await server?.stop();
});

test("the signed-out home page renders both halves of that selector", async () => {
  const html = await (await fetch(server.base + "/")).text();
  const [container, field] = searchBoxSelector().split(" ");
  assert.match(html, new RegExp(`class="${container.slice(1)}"`));
  // The field half: `[name*='query']` is a prefix match on the name attribute,
  // and the reference emits `name="query[keyword]"`.
  const attr = field.match(/\[name\*?=['"]([^'"]+)/);
  assert.ok(attr, `no name attribute in the field half: ${field}`);
  assert.match(html, new RegExp(`name="${attr[1]}\[keyword\]"`));
  // The whole form, as the reference nests it.
  assert.match(html, /<form role="search" class="search-box-form"/);
  // And the class the old hint asked for is absent.
  assert.doesNotMatch(html, /class="navbox/);
});
