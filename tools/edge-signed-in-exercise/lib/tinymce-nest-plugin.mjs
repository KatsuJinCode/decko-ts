// The two halves of row cap-E3's named gap, "the TinyMCE nest plugin is
// served and opens the nest editor": the plugin file the editor lazy-loads,
// and the editor the button opens.
//
// SERVED. TinyMCE resolves plugin files under its baseURL, which for Decko
// is the mod's public folder: /mod/tinymce_editor/plugins/nest/plugin.min.js.
// The published TinyMCE distribution has NO nest plugin — it ships in
// card-mod-tinymce_editor-0.20.0/public/plugins/nest/plugin.min.js — so a
// redirect to the distribution serves an editor with no nest button and no
// nest editor. What must come back is 200, a JavaScript content type, and the
// body that registers the plugin:
//
//   card-mod-tinymce_editor-0.20.0 public/plugins/nest/plugin.min.js
//     tinymce.PluginManager.add("nest", function(t) {
//       t.ui.registry.addIcon("deckolink", "[[]]")
//       t.ui.registry.addIcon("nest", "{{}}")
//       c(t)  addToggleButton deckolink {text:"[[]]", tooltip:"Insert/edit link"}
//       c(t)  addToggleButton nest       {text:"{{}}", tooltip:"Insert/edit nest"}
//       c(t)  addToggleButton image      {text:"image", tooltip:"insert image"}
//       r(t)  addMenuItem deckolink {text:"Link...", context:"insert", icon:"deckolink"}
//       r(t)  addMenuItem nest {icon:"nest", text:"Nest...", context:"insert"}
//       r(t)  addMenuItem image {icon:"image", text:"Image...", context:"insert"}
//       d(t)  addContextMenu nest;  o(t) addCommand "mceNest";
//       u(t)  addShortcut Meta+Z -> execCommand("mceNest")
//
// The bytes this module grades against are the gem's own, vendored at
// fixtures/vendor/card-mod-tinymce_editor-0.20.0/public/plugins/nest/
// plugin.min.js (sha256 089c94a67f8f9862be068ec95010004c320105e1fc217b84f7b05a91a36ed6da,
// byte-identical to
// decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-tinymce_editor-0.20.0/
// public/plugins/nest/plugin.min.js). The port serves the same file with one
// documented substitution — nest.openNestEditor(t) is replaced so the toolbar
// opens the editor for the FIELD'S OWN card instead of the stock ~undefined
// mark (deploy/bunny-worker-src/bunny-edge-tinymce-nest-plugin.ts:7-12) — and
// tests/card/mod-loader/tinymce-nest-plugin-parity.test.ts pins exactly that.
//
// OPENS. Ruby's own spec clicks the toolbar button and reads the editor it
// opened:
//
//   spec/cypress/e2e/edit/nest_editor.spec.coffee:1-2,35-56
//     open_nest_editor = () -> cy.get("[title='Insert/edit nest']").click()
//     specify "nest editor" ->
//       cy.get("._view-select").select2("titled")
//       cy.contains "options".click()
//       cy.get "input#nest_name".type "NaNa"
//       cy.contains "button", "Add item options".click()
//       cy.contains "Apply and Close".click()
//     specify "nest rules editor" ->
//       cy.get("._nest-editor").within () -> cy.contains "rules".click()
//
// and the Ruby view those selectors address is captured verbatim in
// fixtures/captured/tinymce-editor-views.json ("... #nest_editor" arm:
// card-mod-tinymce_editor set/all/nest_editor.haml rendered by Ruby).

/** Ruby's mod public folder prefix, as the editor's baseURL resolves it. */
export const NEST_PLUGIN_PATH = "/mod/tinymce_editor/plugins/nest/plugin.min.js";

/** The registrations Ruby's plugin makes, read off its own source text. The
 *  toolbar button is the one the spec clicks, and its tooltip is how a person
 *  (and cy.get("[title='Insert/edit nest']")) finds it. */
export function nestPluginRegistrations(body) {
  const source = String(body);
  const button = /addToggleButton\("nest",\{text:"([^"]*)",tooltip:"([^"]*)"/.exec(source);
  const menu = /addMenuItem\("nest",\{icon:"([^"]*)",text:"([^"]*)",context:"([^"]*)"/.exec(source);
  const command = /addCommand\("([^"]*)"/.exec(source);
  const shortcut = /addShortcut\("([^"]*)","",/.exec(source);
  return {
    plugin: /PluginManager\.add\("nest"/.test(source),
    button: button === null ? null : { text: button[1], tooltip: button[2] },
    menu: menu === null ? null : { icon: menu[1], text: menu[2], context: menu[3] },
    command: command === null ? null : command[1],
    shortcut: shortcut === null ? null : shortcut[1],
  };
}

/**
 * The served leg. `response` is {status, contentType, body} as read off the
 * wire. A redirect fails by construction — the distribution it would redirect
 * to carries no nest plugin — and so does a 200 whose body is not the plugin.
 */
export function nestPluginServed(response) {
  const failures = [];
  const status = response?.status ?? null;
  const contentType = String(response?.contentType ?? "");
  const registrations = nestPluginRegistrations(response?.body ?? "");
  if (status !== 200) failures.push("status");
  if (!/javascript|ecmascript/i.test(contentType)) failures.push("contentType");
  if (registrations.plugin !== true) failures.push("pluginRegistered");
  if (registrations.button === null || registrations.button.tooltip !== "Insert/edit nest") {
    failures.push("nestButton");
  }
  if (registrations.menu === null || registrations.menu.text !== "Nest...") failures.push("nestMenuItem");
  if (registrations.command !== "mceNest") failures.push("nestCommand");
  return { ok: failures.length === 0, failures, registrations };
}

function attrMap(attrs) {
  const map = {};
  for (const match of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
    map[match[1].toLowerCase()] = match[2];
  }
  // Ruby writes some attributes with single quotes (nest_editor.haml does).
  for (const match of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*'([^']*)'/g)) {
    if (map[match[1].toLowerCase()] === undefined) map[match[1].toLowerCase()] = match[2];
  }
  return map;
}

const classList = (attrs) => String(attrs.class ?? "").split(/\s+/).filter(Boolean);

/** The inner HTML of the first `div._nest-editor` in the document. */
export function nestEditorRegion(html) {
  const source = String(html);
  for (const match of source.matchAll(/<div\b([^>]*)>/g)) {
    const attrs = attrMap(match[1]);
    if (!classList(attrs).includes("_nest-editor")) continue;
    const scanner = /<(\/?)div\b(?:"[^"]*"|[^>"])*?>/g;
    scanner.lastIndex = match.index + match[0].length;
    let depth = 0;
    for (let s = scanner.exec(source); s !== null; s = scanner.exec(source)) {
      if (s[1] === "/") {
        if (depth === 0) return source.slice(match.index + match[0].length, s.index);
        depth -= 1;
      } else if (!/\/>$/.test(s[0])) {
        depth += 1;
      }
    }
  }
  return null;
}

/**
 * The opened leg: the dialog the nest button opened, read by the selectors
 * Ruby's own spec drives. `visible` is what the browser reports for the
 * dialog (the button opens an overlay; a hidden copy of the view elsewhere on
 * the page must not satisfy this).
 */
export function nestEditorOpened(html, visible = true) {
  const failures = [];
  const region = visible === true ? nestEditorRegion(html) : null;
  if (region === null) {
    return { ok: false, failures: ["nestEditorVisible"], region: null };
  }
  const tags = [...region.matchAll(/<(input|select|button|a)\b([^>]*)>/g)].map((m) => ({
    name: m[1],
    attrs: attrMap(m[2]),
  }));
  // cy.get("input#nest_name") (spec:42-43) and the _nest-name class the port's
  // own journey fills (lib/editor-dialogs.mjs:113 and lib/nest-rules-journey.mjs).
  const name = tags.find((t) => t.name === "input" && t.attrs.id === "nest_name");
  if (name === undefined || !classList(name.attrs).includes("_nest-name")) failures.push("nestNameField");
  // cy.get("._view-select").select2("titled") (spec:38,65).
  if (!tags.some((t) => t.name === "select" && classList(t.attrs).includes("_view-select"))) {
    failures.push("viewSelect");
  }
  // cy.contains "options".click() / cy.contains "rules".click() (spec:40,66,83):
  // the three tabs of tab_views.rb's nest editor, keyed by data-tab-name.
  const tabNames = new Set(
    [...region.matchAll(/data-tab-name="([^"]*)"/g)].map((m) => m[1]),
  );
  for (const tab of ["view", "options", "rules"]) {
    if (!tabNames.has(tab)) failures.push(`tab:${tab}`);
  }
  // cy.contains "button", "Add item options" (spec:44-45): the items-options
  // control, which the view classes _configure-items-button.
  if (!tags.some((t) => t.name === "button" && classList(t.attrs).includes("_configure-items-button"))) {
    failures.push("itemsOptionsButton");
  }
  // cy.contains "Apply and Close" (spec:56-57): the modal editor's apply
  // control, the _nest-apply submit.
  const apply = tags.find((t) => t.name === "button" && classList(t.attrs).includes("_nest-apply"));
  if (apply === undefined || apply.attrs.type !== "submit") failures.push("applyControl");
  return { ok: failures.length === 0, failures, region };
}

/** The check's own predicate: served AND opened. */
export function nestPluginServedAndOpens(servedResponse, dialogHtml, visible = true) {
  const served = nestPluginServed(servedResponse);
  const opened = nestEditorOpened(dialogHtml, visible);
  return {
    ok: served.ok && opened.ok,
    servedFailures: served.failures,
    openedFailures: opened.failures,
    registrations: served.registrations,
  };
}
