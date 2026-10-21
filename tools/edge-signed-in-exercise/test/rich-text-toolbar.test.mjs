// cap-M1 - the rich text editor's toolbar, pinned against the Ruby bytes.
//
// WHAT IS PINNED, AND WHERE EACH PIN LIVES.
//
// 1. THE TOOLBAR CONFIGURATION. The toolbar is configuration, and the
//    configuration is a card: the stock deck's *tinyMCE card (codename
//    tiny_mce, type json), whose content is the TinyMCE config JSON. The
//    gem file is vendored verbatim and sha256-pinned here:
//      fixtures/vendor/card-mod-tinymce_editor-0.20.0/data/real.yml
//    The config leg parses the card's :content block OUT OF THOSE BYTES, so
//    no byte of the graded config is typed into this repository.
//
// 2. THE RUNTIME MENU. addNestPlugin (assets/script/tinymce_config.js.coffee:
//    57-60) appends the nest plugin and sets the Insert menu's items. That
//    file is already vendored under fixtures/vendor/mod-script-assets/
//    card-mod-tinymce_editor/ (the script-asset lane put it there); the
//    sha256 is pinned here so a drift in the Insert menu's items fails the
//    pin by name.
//
// WHAT IS NOT CLAIMED. No signed-in run happens here, so nothing below says
// the live editor passes. These are the configuration's tokens and the
// matcher contract, graded on Ruby's own bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  stockTinyMceConfigFromRealYml,
  stockToolbarContract,
  editorToolbarContract,
  toolbarTokens,
  TOOLBAR_TOKEN_MATCHERS,
  MENUBAR_TOKEN_MATCHERS,
  INSERT_MENU_ITEMS,
  RICH_TEXT_TOOLBAR_CHECKS,
} from "../lib/rich-text-toolbar.mjs";

const VENDOR = new URL("../../../fixtures/vendor/", import.meta.url);
const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "card-mod-tinymce_editor-0.20.0/data/real.yml":
    "211473fdd67aae7f870af7e4e466c24e94a3578c9f581d542c06cb1a3432b7ed",
  "mod-script-assets/card-mod-tinymce_editor/assets/script/tinymce_config.js.coffee":
    "92dbb1316d3816417a5b674ec7088ea824e8c4aa9d2bd9d0488915841378ac5a",
};

/** The stock config, read out of the vendored gem bytes. */
function stockConfig() {
  return stockTinyMceConfigFromRealYml(
    readVendor("card-mod-tinymce_editor-0.20.0/data/real.yml").toString("utf8"),
  );
}

test("the vendored Ruby tinymce source is the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-tinymce_editor-0.20.0`);
  }
});

test("the pinned Ruby source carries the toolbar configuration this row grades", () => {
  const real = readVendor("card-mod-tinymce_editor-0.20.0/data/real.yml").toString("utf8");
  // data/real.yml:1-15 - the *tinyMCE card, type json, and its content.
  assert.match(real, /- :name: "\*tinyMCE"\n  :type: :json\n  :codename: tiny_mce\n  :content: \|/);
  assert.match(real, /"menubar": "edit view insert format table"/);
  assert.match(real, /"plugins": "autoresize code lists hr link autolink table"/);
  assert.match(
    real,
    /"toolbar1": "formatselect \| bold italic strikethrough forecolor backcolor \| deckolink nest \|   \| numlist bullist outdent indent  \| removeformat"/,
  );
  const config = readVendor(
    "mod-script-assets/card-mod-tinymce_editor/assets/script/tinymce_config.js.coffee",
  ).toString("utf8");
  // tinymce_config.js.coffee:57-60 - the runtime's nest plugin and Insert
  // menu.
  assert.match(config, /addNestPlugin: \(conf\) ->/);
  assert.match(config, /if conf\.plugins\?  then conf\.plugins \+= " nest"    else conf\.plugins = "nest"/);
  assert.match(config, /conf\.menu = \{ insert: \{ title: "Insert", items: "deckolink nest image \| hr"\}\}/);
});

test("the stock config parses out of the gem's own bytes and carries the four groups", () => {
  const config = stockConfig();
  // The parse is from the vendored bytes, not from a literal here.
  assert.equal(config.theme, "silver");
  assert.equal(config.menubar, "edit view insert format table");
  assert.match(config.toolbar1, /^formatselect \| bold italic strikethrough forecolor backcolor \| deckolink nest/);
  assert.match(config.plugins, /\btable\b/);
  const verdict = stockToolbarContract(config);
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
  // The row's four words, as token facts.
  assert.ok(verdict.tokens.toolbar.includes("formatselect"));
  assert.ok(verdict.tokens.toolbar.includes("numlist") && verdict.tokens.toolbar.includes("bullist"));
  assert.ok(verdict.tokens.menubar.includes("table"));
  assert.ok(verdict.tokens.effectivePlugins.includes("table"));
  assert.ok(verdict.tokens.menubar.includes("insert"));
  assert.deepEqual(verdict.tokens.insertMenu, [...INSERT_MENU_ITEMS]);
});

test("the effective plugin set carries nest even when the card's JSON does not", () => {
  // addNestPlugin (tinymce_config.js.coffee:58) appends "nest" to whatever
  // plugins the config carries, so the rendered editor always has it.
  const config = stockConfig();
  assert.ok(!config.plugins.includes("nest"));
  assert.ok(toolbarTokens(config).effectivePlugins.includes("nest"));
});

test("a config without the list tokens fails the lists group by name", () => {
  const config = stockConfig();
  const stripped = { ...config, toolbar1: config.toolbar1.replace(" numlist bullist", "") };
  const verdict = stockToolbarContract(stripped);
  assert.ok(verdict.failures.includes("listsNumlistMissing"));
  assert.ok(verdict.failures.includes("listsBullistMissing"));
  assert.ok(!verdict.failures.includes("tableMenubarMissing"));
});

test("a config whose menubar lost table fails the table group by name", () => {
  const config = stockConfig();
  const stripped = { ...config, menubar: "edit view insert format" };
  const verdict = stockToolbarContract(stripped);
  assert.ok(verdict.failures.includes("tableMenubarMissing"));
  assert.ok(!verdict.failures.includes("tablePluginMissing"));
});

test("a config whose plugins lost table fails the table plugin leg", () => {
  const config = stockConfig();
  const stripped = { ...config, plugins: "autoresize code lists hr link autolink" };
  const verdict = stockToolbarContract(stripped);
  assert.ok(verdict.failures.includes("tablePluginMissing"));
});

test("a config without an insert menubar entry fails the insert group", () => {
  const config = stockConfig();
  const stripped = { ...config, menubar: "edit view format table" };
  const verdict = stockToolbarContract(stripped);
  assert.ok(verdict.failures.includes("insertMenubarMissing"));
});

test("the rendered leg grades an editor whose controls carry the config's tokens", () => {
  // The labels are what TinyMCE renders for the stock config's tokens: the
  // control titles the English build ships. They are inputs to the
  // predicate, not pins; the pin is the config above.
  const labels = [
    "Paragraph", "Bold", "Italic", "Strikethrough",
    "Text color", "Background color", "Insert/edit link", "Insert/edit nest",
    "Numbered list", "Bullet list", "Decrease indent", "Increase indent",
    "Clear formatting",
    "Edit", "View", "Insert", "Format", "Table",
  ];
  const verdict = editorToolbarContract(labels, stockConfig());
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.configSeen, true);
  assert.ok(verdict.matched.includes("numlist") && verdict.matched.includes("bullist"));
  // The Insert menu's items render on OPEN, not on the toolbar, so what the
  // sweep saw of them is evidence next to the grade.
  assert.deepEqual(verdict.insertMenuSeen, ["deckolink", "nest"]);
});

test("the rendered leg names every token an editor does not carry", () => {
  const config = stockConfig();
  const partial = ["Bold", "Italic", "Edit", "View", "Insert", "Format", "Table"];
  const verdict = editorToolbarContract(partial, config);
  assert.equal(verdict.ok, false);
  for (const token of ["strikethrough", "forecolor", "backcolor", "numlist", "bullist"]) {
    assert.ok(verdict.failures.includes(`missingControl:${token}`), `expected missingControl:${token}`);
    assert.ok(verdict.missing.includes(token));
  }
  // "Paragraph" is the formatselect control's rendered label, so the
  // formatselect token is matched, not missing.
  assert.ok(!verdict.failures.includes("missingControl:formatselect"));
});

test("an editor with no controls fails with the whole token list missing", () => {
  const verdict = editorToolbarContract([], stockConfig());
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("noControls"));
  assert.ok(verdict.missing.includes("bold") && verdict.missing.includes("table"));
});

test("a rendered leg with no config is recorded, not invented", () => {
  const verdict = editorToolbarContract(["Bold"], undefined);
  assert.equal(verdict.configSeen, false);
});

test("a token with no matcher is reported rather than silently skipped", () => {
  // The stock config's tokens all have matchers; a config that ADDED a
  // token this file does not know must surface, not vanish.
  assert.ok(!Object.keys(TOOLBAR_TOKEN_MATCHERS).includes("somefuturecontrol"));
  const verdict = editorToolbarContract(["Bold"], { ...stockConfig(), toolbar1: "bold somefuturecontrol" });
  assert.ok(verdict.failures.includes("missingControl:somefuturecontrol"));
});

test("the menubar matchers tell the five stock entries apart", () => {
  for (const token of Object.keys(MENUBAR_TOKEN_MATCHERS)) {
    assert.ok(tokenMatchedHelper(token), token);
  }
  function tokenMatchedHelper(token) {
    const labels = ["Edit", "View", "Insert", "Format", "Table"];
    return MENUBAR_TOKEN_MATCHERS[token].some((pattern) => labels.some((label) => pattern.test(label)));
  }
});

test("the check names name their own legs", () => {
  assert.match(RICH_TEXT_TOOLBAR_CHECKS.config, /toolbar configuration carries Ruby's format, list, table and insert tokens/);
  assert.match(RICH_TEXT_TOOLBAR_CHECKS.rendered, /controls cover the toolbar configuration's tokens/);
});
