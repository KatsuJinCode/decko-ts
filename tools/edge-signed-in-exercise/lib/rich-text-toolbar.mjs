// The rich text editor's toolbar, graded on Ruby's own configuration
// instead of on five loose word matches.
//
// THE ROW. cap-M1 ("Rich text editor toolbar (formats, lists, table, insert
// menu)", tools/edge-signed-in-exercise/capabilities.json id M1) sits at
// partial with one declared check ("TinyMCE loads for the RichText editor")
// and the finding "Editor loads; format/list/table/insert toolbar operations
// not asserted." A browser check exists (checks-cover-b.mjs, the M1
// attempt): it opens the editor, collects the controls' title/aria-label
// strings and asks whether SOME label matches /bold/, /bullet|numbered|list/,
// /table/, /insert/ and /format/. That is a loose claim on both ends: it
// does not say WHAT configuration the toolbar is supposed to carry, so it
// cannot name which control is missing, and a toolbar that renders one
// button whose label happens to contain "table" passes the table clause
// without a table control being offered.
//
// WHAT RUBY'S TOOLBAR IS. The toolbar is configuration, and the
// configuration is a CARD. The stock deck ships the *tinyMCE card
// (codename tiny_mce, type json) whose content is the TinyMCE config JSON
// (card-mod-tinymce_editor-0.20.0 data/real.yml:1-15):
//
//   {
//     "theme": "silver",
//     "menubar": "edit view insert format table",
//     "plugins": "autoresize code lists hr link autolink table",
//     "toolbar1": "formatselect | bold italic strikethrough forecolor backcolor | deckolink nest |   | numlist bullist outdent indent  | removeformat",
//     ...
//   }
//
// and the runtime adds the nest plugin and the Insert menu
// (assets/script/tinymce_config.js.coffee:57-60):
//
//   addNestPlugin: (conf) ->
//     if conf.plugins?  then conf.plugins += " nest"    else conf.plugins = "nest"
//     conf.menu = { insert: { title: "Insert", items: "deckolink nest image | hr"}}
//
// So "formats, lists, table, insert menu" are not four vibes; they are
// tokens in that config, and each token names a control TinyMCE renders:
//
//   formats:  formatselect, bold, italic, strikethrough, forecolor,
//             backcolor
//   lists:    numlist, bullist
//   table:    the menubar's "table" entry AND the table plugin
//   insert:   the menubar's "insert" entry AND the runtime Insert menu's
//             items (deckolink nest image | hr)
//
// TWO LEGS, EACH WITH ITS OWN CHECK NAME.
//
//   1. THE CONFIG leg (gradeable on committed bytes, no browser): the
//      stock config carries the tokens the row names. This is graded here
//      against the vendored, sha256-pinned gem files, so a drift in
//      Ruby's shipped toolbar fails by name instead of the browser leg
//      quietly grading a toolbar Ruby no longer ships.
//
//   2. THE RENDERED leg (needs a live editor): the opened editor's
//      controls cover the config's tokens. The driver hands in the label
//      strings it collected and the config the page actually carried;
//      the predicate resolves each config token through a matcher table
//      and reports every UNMATCHED token by name, so a red says which
//      control is missing rather than which vague word failed.
//
// ANTI-VACUITY.
//   1. The tokens are read from the CONFIG, not from a hardcoded list in
//      this file. A config that adds a token grades the new token too;
//      a config that drops one stops requiring it (and the stock pin
//      catches the drop at the source).
//   2. Separator tokens ("|") and empty runs are structure, not controls,
//      and are dropped before matching.
//   3. An editor with no controls fails with the full token list as
//      missing, not with a bare false.
//   4. The rendered leg records the config the PAGE carried
//      (configSeen), so a page that served no config is visible in the
//      evidence instead of silently grading against a guess.
//
// WHAT THIS DOES NOT CLAIM. It grades the toolbar's controls. It does not
// click them: whether "bold" wraps text in <strong> is the editor's own
// behaviour and is not this row's contract. It also does not grade the nest
// plugin's EDITOR (cap-E3's row and its own check cover that).

/** The token matchers: one config token -> the patterns that identify the
 *  control TinyMCE renders for it, matched against the control's title,
 *  aria-label and text. TinyMCE's own English labels are what the patterns
 *  name ("Bullet list", "Numbered list", "Text color", "Background color",
 *  "Clear formatting", "Decrease indent", "Increase indent"). */
export const TOOLBAR_TOKEN_MATCHERS = Object.freeze({
  formatselect: [/format\b/i, /formatselect/i, /paragraph/i],
  bold: [/\bbold\b/i],
  italic: [/\bitalic\b/i],
  strikethrough: [/strikethrough/i, /strike-through/i],
  forecolor: [/text color/i, /forecolor/i],
  backcolor: [/background color/i, /backcolor/i],
  deckolink: [/deckolink/i, /insert\/edit link/i],
  nest: [/nest/i],
  numlist: [/numbered list/i, /numlist/i],
  bullist: [/bullet list/i, /bullist/i],
  outdent: [/outdent/i, /decrease indent/i],
  indent: [/increase indent/i, /\bindent\b/i],
  removeformat: [/clear formatting/i, /removeformat/i],
});

/** The menubar entries the stock config ships, and the patterns that
 *  identify each as a rendered menubar button. */
export const MENUBAR_TOKEN_MATCHERS = Object.freeze({
  edit: [/\bedit\b/i],
  view: [/\bview\b/i],
  insert: [/\binsert\b/i],
  format: [/\bformat\b/i],
  table: [/\btable\b/i],
});

/** The runtime Insert menu's items (tinymce_config.js.coffee:60). */
export const INSERT_MENU_ITEMS = Object.freeze(["deckolink", "nest", "image", "hr"]);

/** The toolbar1/menubar/plugins tokens of one TinyMCE config object,
 *  with separators and empty runs dropped. */
export function toolbarTokens(config) {
  const split = (value) =>
    String(value ?? "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token !== "" && token !== "|");
  const plugins = split(config?.plugins);
  return {
    toolbar: split(config?.toolbar1),
    menubar: split(config?.menubar),
    plugins,
    // addNestPlugin appends "nest" to whatever plugins the config carries
    // (tinymce_config.js.coffee:58), so the effective plugin set carries it
    // even when the card's JSON does not.
    effectivePlugins: plugins.includes("nest") ? plugins : [...plugins, "nest"],
    insertMenu: config?.menu?.insert?.items
      ? split(config.menu.insert.items)
      : [...INSERT_MENU_ITEMS],
  };
}

/**
 * The CONFIG leg: the stock config carries the tokens the row names.
 *
 * The row's four words are graded as claims about the tokens:
 *   formats: the toolbar carries formatselect and the inline format
 *            controls (bold italic strikethrough forecolor backcolor)
 *   lists:   the toolbar carries numlist AND bullist
 *   table:   the menubar carries table AND the plugins carry table
 *   insert:  the menubar carries insert AND the Insert menu carries items
 */
export function stockToolbarContract(config) {
  const failures = [];
  const tokens = toolbarTokens(config);
  const has = (list, token) => list.includes(token);

  // formats
  if (!has(tokens.toolbar, "formatselect")) failures.push("formatsFormatselectMissing");
  for (const token of ["bold", "italic", "strikethrough", "forecolor", "backcolor"]) {
    if (!has(tokens.toolbar, token)) failures.push(`formats${token.charAt(0).toUpperCase()}${token.slice(1)}Missing`);
  }
  // lists
  if (!has(tokens.toolbar, "numlist")) failures.push("listsNumlistMissing");
  if (!has(tokens.toolbar, "bullist")) failures.push("listsBullistMissing");
  // table
  if (!has(tokens.menubar, "table")) failures.push("tableMenubarMissing");
  if (!tokens.effectivePlugins.includes("table")) failures.push("tablePluginMissing");
  // insert
  if (!has(tokens.menubar, "insert")) failures.push("insertMenubarMissing");
  if (tokens.insertMenu.length === 0) failures.push("insertMenuEmpty");
  for (const item of INSERT_MENU_ITEMS) {
    if (!tokens.insertMenu.includes(item)) failures.push(`insertMenu${item.charAt(0).toUpperCase()}${item.slice(1)}Missing`);
  }
  return { ok: failures.length === 0, failures, tokens };
}

/** Whether one token is matched by any of the collected label strings. */
function tokenMatched(token, matchers, labels) {
  const patterns = matchers[token];
  if (patterns === undefined) {
    // A token this file has no matcher for is not silently skipped: it is
    // reported, so a renamed TinyMCE control surfaces instead of vanishing.
    return false;
  }
  return labels.some((label) => patterns.some((pattern) => pattern.test(label)));
}

/**
 * The RENDERED leg: the opened editor's controls cover the config's
 * toolbar and menubar tokens.
 *
 * `labels`  the control strings the driver collected (title + aria-label +
 *           text per control)
 * `config`  the TinyMCE config object (the page's own when it carried one,
 *           else the stock config - recorded either way)
 *
 * Returns {ok, failures, missing, matched, tokens, configSeen}.
 */
export function editorToolbarContract(labels, config) {
  const collected = (Array.isArray(labels) ? labels : []).map((label) => String(label ?? ""));
  const tokens = toolbarTokens(config);
  const failures = [];
  const missing = [];
  const matched = [];
  if (collected.length === 0) {
    failures.push("noControls");
    missing.push(...tokens.toolbar, ...tokens.menubar);
  } else {
    for (const token of tokens.toolbar) {
      if (tokenMatched(token, TOOLBAR_TOKEN_MATCHERS, collected)) matched.push(token);
      else {
        missing.push(token);
        failures.push(`missingControl:${token}`);
      }
    }
    for (const token of tokens.menubar) {
      if (tokenMatched(token, MENUBAR_TOKEN_MATCHERS, collected)) matched.push(token);
      else {
        missing.push(token);
        failures.push(`missingMenubar:${token}`);
      }
    }
  }
  // The Insert menu's items render on OPEN, not on the toolbar, so a
  // closed toolbar's label sweep cannot see them. They are recorded as
  // evidence (insertMenuSeen) and are not part of the grade: the menubar's
  // insert entry is the control the sweep can see.
  const insertMenuSeen = tokens.insertMenu.filter((item) => tokenMatched(item, TOOLBAR_TOKEN_MATCHERS, collected));
  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    missing: [...new Set(missing)],
    matched,
    tokens,
    configSeen: config !== undefined && config !== null,
    insertMenuSeen,
  };
}

/**
 * The stock config, parsed out of the gem's own data/real.yml.
 *
 * The *tinyMCE card's :content is a literal block (data/real.yml:4-15);
 * this reads that block out of the vendored bytes, dedents it and parses
 * the JSON, so the graded config is the gem's bytes and not a copy typed
 * into this file. Throws when the card or its content is missing, so a
 * drifted vendor fails loudly rather than grading an invented default.
 */
export function stockTinyMceConfigFromRealYml(yaml) {
  const source = String(yaml ?? "");
  const card = /- :name: "\*tinyMCE"\n  :type: :json\n  :codename: tiny_mce\n  :content: \|\n((?:    [^\n]*\n?)+)/.exec(source);
  if (card === null) throw new Error("the vendored data/real.yml carries no *tinyMCE content block");
  const dedented = card[1]
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.slice(4))
    .join("\n");
  return JSON.parse(dedented);
}

/** The check names each leg records, so the evidence names its own leg. */
export const RICH_TEXT_TOOLBAR_CHECKS = Object.freeze({
  config: "the editor's toolbar configuration carries Ruby's format, list, table and insert tokens",
  rendered: "the opened editor's controls cover the toolbar configuration's tokens",
});
