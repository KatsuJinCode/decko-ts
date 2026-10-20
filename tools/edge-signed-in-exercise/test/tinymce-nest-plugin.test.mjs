// The E3 harness predicate — "the TinyMCE nest plugin is served and opens the
// nest editor" — graded against the bytes Ruby serves and the view Ruby
// renders.
//
//   node --test tools/edge-signed-in-exercise/test/tinymce-nest-plugin.test.mjs
//
// Two fixtures, both Ruby's own bytes:
//   - the plugin source, vendored verbatim from card-mod-tinymce_editor-0.20.0
//     public/plugins/nest/plugin.min.js (sha256 recorded in the lib module);
//   - the :nest_editor view Ruby rendered, recorded in
//     fixtures/captured/tinymce-editor-views.json.
//
// Registry row cap-E3 (tools/edge-signed-in-exercise/capabilities.json, id E3)
// recorded "Editor loads and nest button exists; plugin served condition not
// asserted." A button node proves nothing about the plugin behind it: the
// published TinyMCE distribution has no nest plugin at all, so a host that
// redirects the plugin URL serves an editor whose nest button would do
// nothing. Tests 2 and 3 are that host and a dialog that never opened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  NEST_PLUGIN_PATH,
  nestEditorOpened,
  nestEditorRegion,
  nestPluginRegistrations,
  nestPluginServed,
  nestPluginServedAndOpens,
} from "../lib/tinymce-nest-plugin.mjs";

const RUBY_PLUGIN = readFileSync(
  new URL(
    "../../../fixtures/vendor/card-mod-tinymce_editor-0.20.0/public/plugins/nest/plugin.min.js",
    import.meta.url,
  ),
  "utf8",
);
const TINYMCE = JSON.parse(
  readFileSync(new URL("../../../fixtures/captured/tinymce-editor-views.json", import.meta.url), "utf8"),
);
const RUBY_NEST_EDITOR =
  TINYMCE.rendered[Object.keys(TINYMCE.rendered).find((key) => key.endsWith("#nest_editor"))];

const served = (over = {}) => ({
  status: 200,
  contentType: "application/javascript; charset=utf-8",
  body: RUBY_PLUGIN,
  ...over,
});

test("the vendored plugin bytes are the gem's own, unmodified", () => {
  assert.equal(
    createHash("sha256").update(RUBY_PLUGIN, "utf8").digest("hex"),
    "089c94a67f8f9862be068ec95010004c320105e1fc217b84f7b05a91a36ed6da",
    "the vendored copy has drifted from card-mod-tinymce_editor-0.20.0's file",
  );
});

test("Ruby serves a plugin that registers the nest toolbar button and command", () => {
  const verdict = nestPluginServed(served());
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  // The tooltip is how cy.get("[title='Insert/edit nest']") (spec:1-2) and a
  // person both find the button; the {{}} text and the Nest... menu item are
  // the same registration set Ruby's minified source makes.
  assert.equal(NEST_PLUGIN_PATH, "/mod/tinymce_editor/plugins/nest/plugin.min.js");
  assert.deepEqual(verdict.registrations, {
    plugin: true,
    button: { text: "{{}}", tooltip: "Insert/edit nest" },
    menu: { icon: "nest", text: "Nest...", context: "insert" },
    command: "mceNest",
    shortcut: "Meta+Z",
  });
});

test("a redirect to the published distribution is NOT the plugin served", () => {
  // The distribution genuinely has no nest plugin, so this host answers 200s
  // everywhere and the button that "exists" opens nothing. A status-only check
  // passes here; the body read is what catches it.
  const redirect = nestPluginServed(served({ status: 302, contentType: null, body: "" }));
  assert.equal(redirect.ok, false);
  assert.deepEqual(redirect.failures, ["status", "contentType", "pluginRegistered", "nestButton", "nestMenuItem", "nestCommand"]);
  const distribution = nestPluginServed(
    served({ body: "/*! tinymce 5.10.7 */ tinymce.PluginManager.add(\"link\",function(){})" }),
  );
  assert.equal(distribution.ok, false);
  assert.ok(distribution.failures.includes("nestButton"));
  // A 200 of the right type whose body is an HTML error page fails too.
  const htmlBody = nestPluginServed(served({ contentType: "text/html", body: "<h1>404</h1>" }));
  assert.deepEqual(htmlBody.failures, ["contentType", "pluginRegistered", "nestButton", "nestMenuItem", "nestCommand"]);
});

test("the dialog Ruby opens carries the controls its spec drives", () => {
  const verdict = nestEditorOpened(RUBY_NEST_EDITOR);
  assert.equal(verdict.ok, true, verdict.failures.join(", "));
  // cy.get("input#nest_name").type "NaNa" (spec:42-43,89)
  assert.match(RUBY_NEST_EDITOR, /<input type="text" name="nest_name" id="nest_name"[^>]*class="form-control _nest-name _autocomplete /);
  // cy.get("._view-select").select2("titled") (spec:38,65)
  assert.match(RUBY_NEST_EDITOR, /<select name="view" id="view" class="tags _view-select _nest-option-value"/);
  // cy.contains "options" / "rules" (spec:40,66,83)
  for (const tab of ["view", "options", "rules"]) {
    assert.match(RUBY_NEST_EDITOR, new RegExp(`data-tab-name="${tab}"`));
  }
  // cy.contains "button", "Add item options" (spec:44-45)
  assert.match(RUBY_NEST_EDITOR, /class="_configure-items-button btn-sm btn btn-secondary"/);
  // cy.contains "Apply and Close" (spec:56-57) — the _nest-apply submit
  assert.match(RUBY_NEST_EDITOR, /<button name="button" type="submit" class="_nest-apply btn-sm me-3 btn btn-primary">/);
});

test("a page that never opened the editor fails the opened leg (the cap-E3 defect)", () => {
  // The button was there and the editor was there; the nest editor was not.
  assert.equal(nestEditorRegion(RUBY_NEST_EDITOR) !== null, true);
  assert.equal(nestEditorOpened("<html><body><div class='tox-tinymce'></div></body></html>").ok, false);
  // A dialog present but not the visible one: the browser says it is hidden,
  // so a copy elsewhere on the page cannot satisfy the leg.
  assert.deepEqual(nestEditorOpened(RUBY_NEST_EDITOR, false).failures, ["nestEditorVisible"]);
  // The dialog with its name field removed fails that leg alone.
  const noName = RUBY_NEST_EDITOR.replace(/id="nest_name"/g, 'id="other"');
  assert.deepEqual(nestEditorOpened(noName).failures, ["nestNameField"]);
  // The rules tab gone fails that leg alone (spec:83 reads it).
  const noRules = RUBY_NEST_EDITOR.replace(/data-tab-name="rules"/g, 'data-tab-name="other"');
  assert.deepEqual(nestEditorOpened(noRules).failures, ["tab:rules"]);
  // The apply control is a submit; a bare button is not what the spec clicks.
  const plainApply = RUBY_NEST_EDITOR.replace(
    /<button name="button" type="submit" class="_nest-apply/,
    '<button name="button" class="_nest-apply',
  );
  assert.deepEqual(nestEditorOpened(plainApply).failures, ["applyControl"]);
});

test("the check's own predicate needs both halves", () => {
  const good = nestPluginServedAndOpens(served(), RUBY_NEST_EDITOR);
  assert.equal(good.ok, true);
  assert.deepEqual(good.servedFailures, []);
  assert.deepEqual(good.openedFailures, []);
  const pluginOnly = nestPluginServedAndOpens(served(), "<html><body></body></html>");
  assert.equal(pluginOnly.ok, false);
  assert.deepEqual(pluginOnly.servedFailures, []);
  assert.deepEqual(pluginOnly.openedFailures, ["nestEditorVisible"]);
  const dialogOnly = nestPluginServedAndOpens(served({ status: 404, contentType: "text/html", body: "" }), RUBY_NEST_EDITOR);
  assert.equal(dialogOnly.ok, false);
  assert.ok(dialogOnly.servedFailures.includes("status"));
  assert.deepEqual(dialogOnly.openedFailures, []);
});

test("the registrations are read off the source text, not assumed", () => {
  // An empty body yields nulls rather than throwing, so a broken asset grades
  // as a list of named failures instead of killing the run.
  assert.deepEqual(nestPluginRegistrations(""), {
    plugin: false,
    button: null,
    menu: null,
    command: null,
    shortcut: null,
  });
  // A plugin that registers a differently-named button is not Ruby's.
  const renamed = RUBY_PLUGIN.replace('tooltip:"Insert/edit nest"', 'tooltip:"Insert nest"');
  assert.ok(nestPluginServed(served({ body: renamed })).failures.includes("nestButton"));
  assert.ok(nestPluginServed(served({ body: RUBY_PLUGIN.replace('addCommand("mceNest"', 'addCommand("nest"') })).failures.includes("nestCommand"));
});
