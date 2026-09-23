// The card-mod-script gem (card-mod-script-0.20.0), ported through the mod
// loader.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-script-0.20.0/): sixteen set files (7 abstract, 1 all, 1 right,
// 1 self, 4 type, 2 type_plus_right), two lib/ modules, two config/
// initializers, and data/real.yml. The T6 verdict
// (tools/compat-report/mod-compat-report.json, gem ===
// 'card-mod-script-0.20.0', classification.metrics.htmlViewsMissingNames)
// lists six missing html views: compressed, javascript_include_tag,
// javascript_tags, remote_script_tags, script_calls, script_variables.
//
// Five of the six are ported here (the engine's flat view registry serves
// the html format only, so the Ruby set-module layering that shares one
// view name across patterns is reproduced as dispatch INSIDE the viewFn):
// - script_variables, script_calls, javascript_tags (all/head_javascript.rb)
// - javascript_include_tag (three Ruby layers merged: all/head_javascript.rb:
//   29-31 fallback, abstract/00_script.rb:78-80 script-family,
//   right/script.rb:8-12 *script-list walk)
// - remote_script_tags (two Ruby layers merged: type_plus_right/set/
//   script.rb:12-23 rule-card walk, type_plus_right/mod/script.rb:18-26
//   mod-remote walk; other cards raise UnsupportedViewError like Ruby)
//
// ORACLE PIN: an oracle capture ran during this port against the decko
// oracle app (tools/oracle/decko-oracle-app, RAILS_ENV=development
// `bundle exec decko runner`, modeled on
// tests/card/mod-loader/oracle-capture-help-mod.rb; capture script + JSON in
// %TEMP%, values quoted inline below). Pinned facts used in this file:
// - script_variables bytes:
//   "<script>\n//<![CDATA[\ndocko.rootUrl='/';\ndocko.doubleClick='signed_in';"
//   + "\ndocko.cssPath='/files/~447/1790061390.css';\ndocko.signed_in=true;\n"
//   + "\n//]]>\n</script>" (runner ran as bot -> signed_in true; the
//   headless engine's anonymous default is false)
// - script_calls wrapper + trailing trigger_slot_ready line (the captured
//   content additionally carries two cross-mod basket entries,
//   setAceConfig/setTinyMCEConfig, added by card-mod-ace_editor and
//   card-mod-tinymce_editor through basket[:script_calls] - not ported, see
//   below)
// - javascript_tags join shape: remote_script_tags bytes + "\n" +
//   "<!-- MAIN DECKO JAVASCRIPT -->" + "\n" + main tag
// - main tag: '<script src="/files/~307/1790061390.js"></script>'
// - javascript_include_tag fallback bytes:
//   "\n<!-- javascript_include_tag not overridden for NAME -->\n"
// - script-family bytes: '<script src="/Oracle_Script_Probe.js"></script>'
//   (path(format: :js) -> "/#{url_key}.js")
// - remote_script_tags mod-branch bytes: one Rails script tag per remote
//   item, joined "\n"; the captured tags carry crossorigin/referrerpolicy
//   attributes that come from the mods' manifest.yml config hashes (a
//   filesystem surface - see below)
// - Card.config.double_click == :signed_in (lib/card/mod/script.rb:1,
//   "Cardio::Railtie.config.double_click = :signed_in");
//   Env.origin == "" for a requestless runner, so card_url("") == "/"
//   (card-1.110.0 lib/card/env/location.rb:19-21)
//
// NOT ported (honest remainder):
// - view :compressed (abstract/00_script.rb:9-12) and the js-format :core
//   overrides (01_java_script.rb:6-8 _render_raw, 02_coffee_script.rb:22-24
//   CoffeeScript.compile) live in `format :js` / the base format - the TS
//   engine has an html format only (src/card/render/format.ts), and
//   registering those view names flat would claim html-format support Ruby
//   does not give. The compat report's viewsByFormat.html entry for
//   "compressed" is a parser artifact; the only Ruby definition is the js
//   one.
// - the html :core override (00_script.rb:73-76, CodeRay-highlighted div):
//   the T6 verdict counts :core as covered by the engine's core view, and a
//   byte-port of CodeRay's js tokenizer (span color classes) is not
//   headlessly reproducible with a JS highlighter.
// - lib/cardio/utils/ansi2_html.rb: consumed only by the
//   validate_javascript_syntax error message (type/java_script.rb:8) - no
//   reachable consumer headlessly.
// - right/script.rb:1-5 assign_type :list + ok_to_read? true and the
//   card-method layers of the abstract modules (compress?, bare_compile,
//   valid_file_extensions, new_asset_constants, subpath, ...): card
//   behavior the manifest format does not carry (no events/methods field).
// - basket[:script_calls] entries (all/head_javascript.rb:5): the captured
//   deck carries setAceConfig/setTinyMCEConfig entries added by OTHER mods
//   at load time. The headless port reads an empty basket -> only
//   trigger_slot_ready renders. Cross-mod basket population has no manifest
//   surface.
// - the mod-branch remote items' tag ATTRIBUTES (crossorigin,
//   referrerpolicy): they live in each mod's manifest.yml "remote" group
//   config hashes (card-mod-assets set/abstract/mod_assets.rb:73-75
//   manifest_group_items). The card surface (the +*group remote card's
//   content, group_remote.rb:29-31) carries the src list only - the port
//   emits src-only tags from that surface, the established substitution
//   card-mod-assets.ts:64-77 made for the same manifest surface.
// - lib/javascript/*.js assets, data/real.yml seeds, config/early/
//   init_execjs.rb (a require), the README: no render-path surface.

import { UnsupportedViewError, type ViewContext, type ViewFn } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventFn,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// shared helpers - the param_or_rule_card + asset-output seams
// ---------------------------------------------------------------------------

/** card-mod-format set/all/html/head.rb:79-81 param_or_rule_card:
 *  `params[setting]&.card || root.card.rule_card(setting)`. The headless
 *  engine has no request params, so the port is the rule_card walk:
 *  ruleNamesForCard in pattern precedence (lib/card/rule/all.rb:9-15 shape,
 *  the same seam card-mod-help.ts#helpRuleCard walks) against the prepared
 *  render-card map (map miss = rule card does not exist). */
function paramOrRuleCard(ctx: ViewContext, settingCodename: string) {
  const card = ctx.fmt.card;
  if (card.unknown === true) return undefined;
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, `*${settingCodename}`)) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue;
    if (ctx.fmt.engine.isDenied(record)) continue; // ok?(:read) false
    return record;
  }
  return undefined;
}

/** card-mod-assets set/abstract/asset_outputter.rb:78-82 asset_output_url:
 *  `asset_output_card.file&.url`. The file card (card_accessor :asset_output,
 *  asset_outputter.rb:4) stores the carrierwave identifier in db_content
 *  (oracle deck: card 307 "*all+*script+*asset output" db_content
 *  "~307/1790061390.js") and the local file store serves it under /files/
 *  (card-mod-carrierwave lib/carrier_wave/file_card_uploader.rb:111) -
 *  the captured URLs ("/files/~307/1790061390.js",
 *  "/files/~447/1790061390.css") are exactly that composition. Undefined
 *  when the output card is absent (Ruby: file nil -> url nil). */
function assetOutputUrl(ctx: ViewContext, cardName: string): string | undefined {
  const outputCard = ctx.fmt.engine.fetchRenderCard(`${cardName}+*asset output`);
  const content = outputCard?.dbContent;
  if (content === undefined || content === "") return undefined;
  return `/files/${content}`;
}

/** The right part is the *script setting card (Right::Script / the
 *  type_plus_right "*script" anchors match by the junction's right key). */
function rightIsScript(card: ViewContext["fmt"]["card"]): boolean {
  return card.name.isCompound && card.name.rightName?.key === "*script";
}

/** The left part's type codename (the type_plus_right patterns key on the
 *  left card's type: Set for rule cards, Mod for mod asset cards). Undefined
 *  when the left side is not a fetched card. */
function leftTypeCode(ctx: ViewContext): string | undefined {
  const card = ctx.fmt.card;
  if (!card.name.isCompound) return undefined;
  const leftKey = card.name.leftName?.key;
  if (leftKey === undefined) return undefined;
  return ctx.fmt.engine.fetchRenderCard(leftKey)?.typeCode;
}

/** Nest one view of an already-warm card name through the engine's live
 *  registry (Ruby's `card.format(:html).render :view` on the item card).
 *  Returns undefined when the card is not prepared (the caller's compact). */
function renderCardView(ctx: ViewContext, name: string, view: string): string | undefined {
  const target = ctx.fmt.engine.fetchRenderCard(name);
  if (target === undefined) return undefined;
  return ctx.fmt.nestRecord(target, view);
}

// ---------------------------------------------------------------------------
// set/all/head_javascript.rb - the deck-head script views
// ---------------------------------------------------------------------------

/** head_javascript.rb:48-50 trigger_slot_ready - the literal slot-ready
 *  bootstrap line. */
const TRIGGER_SLOT_READY =
  "$('document').ready(function() { $('.card-slot').trigger('decko.slot.ready'); })";

/** Rails ActionView javascript_tag wrapper (actionview-7.2.3.2
 *  lib/action_view/helpers/javascript_helper.rb:75-93 javascript_tag +
 *  javascript_cdata_section, TagHelper content_tag): `<script>` +
 *  "\n//<![CDATA[\n" + content + "\n//]]>\n" + `</script>`. The oracle pins
 *  the exact bytes for script_variables/script_calls. */
function javascriptTag(content: string): string {
  return `<script>\n//<![CDATA[\n${content}\n//]]>\n</script>`;
}

/** head_javascript.rb:33-40 decko_script_variables, in the fixed hash order:
 *  rootUrl / doubleClick / cssPath / signed_in.
 *  - decko.rootUrl: card_url("") (head_javascript.rb:35). location.rb:19-21
 *    card_url = Env.origin + card_path(rel); the oracle captured origin ""
 *    -> "/". The engine has no request origin - the port emits the same
 *    requestless-root bytes.
   *  - decko.doubleClick: Card.config.double_click, set to :signed_in by this
   *    gem's lib/card/mod/script.rb:1 (the Railtie config line);
   *    script_variable_to_js's else branch single-quotes it
   *    (head_javascript.rb:58-59) -> 'signed_in'.
 *  - decko.cssPath: main_stylesheet_path = nest(param_or_rule_card(:style),
 *    view: :stylesheet_path) (card-mod-format head.rb:75-77). The
 *    :stylesheet_path view is card-mod-style's (set/type_plus_right/set/
 *    style.rb:28-34 -> card.asset_output_url), so the bytes come from the
 *    live view registry - rendered here through the real nest so the
 *    composition with card-mod-style produces the captured
 *    "/files/..." bytes. A deck with no *style rule is an unpinned Ruby
 *    state (nest of nil); the port omits the line (documented divergence,
 *    never exercised by real decks, which always seed *style rules).
 *  - decko.signed_in: Auth.signed_in? (card-1.110.0 lib/card/auth/
 *    current.rb:45-47, current_id != AnonymousID). The engine has no auth
 *    surface - the anonymous default false. (The oracle capture ran as bot:
 *    true.) */
function deckoScriptVariables(ctx: ViewContext): string {
  const lines: string[] = [];
  lines.push("decko.rootUrl='/';");
  lines.push("decko.doubleClick='signed_in';");
  const styleRule = paramOrRuleCard(ctx, "style");
  if (styleRule !== undefined) {
    const cssPath = ctx.fmt.nestRecord(styleRule, "stylesheet_path");
    lines.push(`decko.cssPath='${cssPath}';`);
  }
  lines.push(`decko.signed_in=${false};`);
  return lines.join("\n") + "\n";
}

/** head_javascript.rb:9-15 view :script_variables, unknown: true,
 *  cache: :never, perms: :none - javascript_tag over the "k=v;\n" lines. */
const scriptVariablesView: ViewFn = (ctx) => {
  return javascriptTag(deckoScriptVariables(ctx));
};

/** head_javascript.rb:17-23 view :javascript_tags, unknown: true,
 *  cache: :force, perms: :none:
 *  `return unless (asset_card = param_or_rule_card :script)` -> nil renders
 *  "" ; else the array [nest(asset_card, view: :remote_script_tags),
 *  "<!-- MAIN DECKO JAVASCRIPT -->", main_javascript_tag(asset_card)] -
 *  the render machinery joins array view results with "\n" (oracle bytes:
 *  single "\n" between the three parts). main_javascript_tag (:42-44) =
 *  javascript_include_tag asset_card.asset_output_url -> Rails'
 *  `<script src="..."></script>`. When the asset output card is absent
 *  (Ruby: file&.url nil -> the tag has no URL - unpinned sub-state) the
 *  main tag is omitted. */
const javascriptTagsView: ViewFn = (ctx) => {
  const assetCard = paramOrRuleCard(ctx, "script");
  if (assetCard === undefined) return "";
  const parts: string[] = [];
  parts.push(ctx.fmt.nestRecord(assetCard, "remote_script_tags"));
  parts.push("<!-- MAIN DECKO JAVASCRIPT -->");
  const outputUrl = assetOutputUrl(ctx, assetCard.name.s);
  if (outputUrl !== undefined) {
    parts.push(`<script src="${outputUrl}"></script>`);
  }
  return parts.join("\n");
};

/** head_javascript.rb:25-27 view :script_calls, unknown: true, perms: :none:
 *  javascript_tag { (script_configs << trigger_slot_ready).join "\n\n" }.
 *  script_configs (:69-73) maps basket[:script_calls] - entries other mods
 *  push at load time (oracle deck: setAceConfig, setTinyMCEConfig). The
 *  headless basket is empty -> only the trigger line, joined as the single
 *  element. */
const scriptCallsView: ViewFn = (ctx) => {
  void ctx;
  return javascriptTag(TRIGGER_SLOT_READY);
};

/** view :javascript_include_tag - three Ruby definitions merged into the
 *  pattern-precedence dispatch the set-module chain performs:
 *  1. right/script.rb:8-12 (Right::Script): item_cards.map { |script|
 *     script.format(:html).render :javascript_include_tag } - one recursive
 *     render per list item, joined "\n".
 *  2. abstract/00_script.rb:78-80 (Abstract::Script, the JavaScript /
 *     CoffeeScript cardtypes' include chain): javascript_include_tag
 *     path(format: :js) -> "<script src=\"/#{url_key}.js\"></script>"
 *     (card-mod-format set/all/path.rb:68-73 html paths are site-root
 *     relative; oracle: '/Oracle_Script_Probe.js').
 *  3. all/head_javascript.rb:29-31 (All::HeadJavaScript, the base):
 *     "\n<!-- javascript_include_tag not overridden for #{card.name} -->\n".
 *  All three carry cache: :never; the all-layer adds unknown: true. */
const javascriptIncludeTagView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  // 1. the +*script list walk (right pattern outranks type in the set chain)
  if (rightIsScript(card)) {
    const items = card.dbContent
      .split(/\n+/)
      .map((item) => item.replace(/\[\[|\]\]/g, "").trim())
      .filter((item) => item !== "");
    return items
      .map((item) => renderCardView(ctx, item, "javascript_include_tag") ?? "")
      .join("\n");
  }
  // 2. the Abstract::Script family (type/java_script.rb:3 +
  //    type/coffee_script.rb:3 include chains -> Abstract::Script)
  if (card.typeCode === "java_script" || card.typeCode === "coffee_script") {
    return `<script src="/${card.name.urlKey}.js"></script>`;
  }
  // 3. the all-pattern fallback
  return `\n<!-- javascript_include_tag not overridden for ${card.name.s} -->\n`;
};

// ---------------------------------------------------------------------------
// set/type_plus_right/{set,mod}/script.rb - the remote_script_tags layers
// ---------------------------------------------------------------------------

/** type_plus_right/set/script.rb:18-23 remote_script_tags (the Set+*script
 *  rule-card layer): card.item_cards.map { |mod| remote_script_tags mod }
 *  .compact, joined "\n"; remote_script_tags(card) (:18's helper at :18-23
 *  in the same file, lines 18-23) renders the item's :remote_script_tags
 *  and, when present, wraps it "\n<!-- #{card.name.left} (remote) -->".
 *  Items resolve through the prepared map (this mod's prepareEngine warms
 *  every *script rule card, which is what the real deck's items are);
 *  unresolved items are skipped (Ruby's compact). */
function remoteScriptTagsOfRuleCard(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const items = card.dbContent
    .split(/\n+/)
    .map((item) => item.replace(/\[\[|\]\]/g, "").trim())
    .filter((item) => item !== "");
  const parts: string[] = [];
  for (const item of items) {
    const tags = renderCardView(ctx, item, "remote_script_tags");
    if (tags === undefined || tags === "") continue;
    const left = DeckoName.parse(item).leftName?.s ?? item;
    parts.push(`<!-- ${left} (remote) -->\n${tags}`);
  }
  return parts.join("\n");
}

/** type_plus_right/mod/script.rb:18-26 (the Mod+*script layer):
 *  remote_include_tags.compact.join "\n" over map_remote_items
 *  (card-mod-assets set/abstract/mod_assets.rb:167-169 -> the left card's
 *  +*group remote card). The group_remote card's content is the remote src
 *  list one per line (card-mod-assets set/right/group_remote.rb:25-31), so
 *  the port reads the card surface the way card-mod-assets.ts:73-77 does;
 *  each src becomes Rails' javascript_include_tag bytes
 *  `<script src="..."></script>` (the captured tags' extra attributes come
 *  from the manifest config hashes - filesystem state, see the header).
 *  No group remote card or empty list -> "". */
function remoteScriptTagsOfModCard(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const leftKey = card.name.leftName?.key;
  if (leftKey === undefined) return "";
  const groupRemote = ctx.fmt.engine.fetchRenderCard(`${leftKey}+*group remote`);
  const content = groupRemote?.dbContent;
  if (content === undefined || content === "") return "";
  return content
    .split("\n")
    .filter((src) => src !== "")
    .map((src) => `<script src="${src}"></script>`)
    .join("\n");
}

/** view :remote_script_tags - the two type_plus_right layers. Ruby defines
 *  the view ONLY for Set+*script and Mod+*script cards; any other card
 *  raises the unsupported-view error, so the merged viewFn re-raises for
 *  cards outside the two patterns (the flat registry would otherwise
 *  over-claim). */
const remoteScriptTagsView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  if (!rightIsScript(card)) {
    throw new UnsupportedViewError("remote_script_tags", card.name.s);
  }
  const leftCode = leftTypeCode(ctx);
  if (leftCode === "set") return remoteScriptTagsOfRuleCard(ctx);
  if (leftCode === "mod") return remoteScriptTagsOfModCard(ctx);
  // left side is neither Set nor Mod (or not fetched): no Ruby set module
  // defines the view for it
  throw new UnsupportedViewError("remote_script_tags", card.name.s);
};

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time *script / *style rule warm
// ---------------------------------------------------------------------------

/** The rule cards whose right side is a setting with codename 'script' or
 *  'style', plus every transitive side (the help-mod CTE shape,
 *  card-mod-help.ts#helpRuleSidesStatement, widened to the two codenames the
 *  script views resolve at render time: param_or_rule_card(:script /
 *  :style)). The join keys on the right-side setting alone - no set-typed
 *  left requirement - because the *script rule walk must warm BOTH the
 *  set-anchored rules ("*all+*script") AND the mod-anchored ones
 *  ("mod: X+*script", whose left cards are Mod-typed; the real deck lists
 *  them as the rule card's items). */
function scriptRuleSidesStatement(settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      "  SELECT rules.id\n" +
      "  FROM cards rules\n" +
      "    JOIN cards settings ON rules.right_id = settings.id\n" +
      "WHERE settings.type_id = ?\n" +
      "  AND settings.codename IN ('script', 'style')\n" +
      "  AND rules.trash = 0 AND settings.trash = 0\n" +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [settingTypeId],
  };
}

/** The card FIELDS of everything the first statement reached: the *script /
 *  *style rules' +*asset output children (asset_outputter.rb:4) and the mod
 *  cards' +*group remote children (the mod-branch remote src surface). */
function scriptRuleChildrenStatement(settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  const base = scriptRuleSidesStatement(settingTypeId);
  // same reached CTE, then the children pass over it
  const cte = base.sql.slice(0, base.sql.indexOf("SELECT c.* FROM cards"));
  return {
    sql:
      cte +
      "SELECT c.* FROM cards c\n" +
      "WHERE c.trash = 0 AND c.left_id IN (SELECT id FROM reached)",
    params: base.params,
  };
}

/** One batch, once per engine: the rule cards, their sides, and their
 *  fields enter the prepared render-card map (the same compose-and-cache
 *  walk card-mod-help.ts#prepareHelpRules runs - junction records reached
 *  by id compose names from their side records, multi-pass, sides first).
 *  After this the script views resolve every card they touch
 *  synchronously - zero queries on the render path. */
async function prepareScriptRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const settingTypeId = host.codenames.peekId("setting");
  if (settingTypeId === undefined) return; // degenerate deck
  const results = await host.batch([
    scriptRuleSidesStatement(settingTypeId),
    scriptRuleChildrenStatement(settingTypeId),
  ]);
  type FetchedRow = {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
  };
  interface PreparedRecord {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
    record: NonNullable<Awaited<ReturnType<ModEngineHost["fetchById"]>>>;
  }
  const byId = new Map<number, PreparedRecord>();
  for (const result of results) {
    const rows = (result as { rows: FetchedRow[] } | undefined)?.rows ?? [];
    for (const row of rows) {
      if (byId.has(row.id)) continue;
      const record = await host.fetchById(row.id);
      if (record === undefined) continue;
      byId.set(row.id, {
        id: row.id,
        leftId: record.leftId ?? null,
        rightId: record.rightId ?? null,
        name: record.name?.s ?? null,
        record,
      });
    }
  }
  if (byId.size === 0) return;

  // multi-pass junction composition (sides before junctions)
  const names = new Map<number, string>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: PreparedRecord[] = [];
    for (const row of pending) {
      let composed: string | undefined = row.name ?? undefined;
      if (composed === undefined && row.leftId !== null && row.rightId !== null) {
        const left = names.get(row.leftId);
        const right = names.get(row.rightId);
        if (left !== undefined && right !== undefined) composed = `${left}+${right}`;
      }
      if (composed === undefined) {
        still.push(row);
        continue;
      }
      names.set(row.id, composed);
    }
    if (still.length === pending.length) break; // unresolvable sides stay
    pending = still;
  }

  // Assign the composed name onto junction records and cache them (the
  // fetch ladder's assign_name semantics).
  for (const row of byId.values()) {
    const composed = names.get(row.id);
    if (composed === undefined) continue;
    if (row.name === null) {
      row.record.name = DeckoName.parse(composed);
      row.record.key = DeckoName.parse(composed).key;
    }
    await host.cacheFetchedRecord(row.record);
  }
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// type/coffee_script.rb + type/java_script.rb - the two validate events
// ---------------------------------------------------------------------------

/** The validate-stage body stub for both validate_*_syntax events
 *  (type/coffee_script.rb:5-9, type/java_script.rb:5-9). The Ruby bodies
 *  call ::CoffeeScript.compile / Uglifier.compile on `content`, then
 *  `errors.add :content, <formatted message>` on the ExecJS::RuntimeError /
 *  Uglifier::Error - the write-path "errors" seam that names the field and
 *  carries the message into the save validation surface (card-1.110.0
 *  lib/card/error.rb). The TS engine has no errors.add seam yet (the
 *  action engine's validate path is hardcoded, card-action-engine.ts:256-258;
 *  no eventsForStage consult), so the body is a documented stub: it
 *  resolves `card.dbContent`, names the field it would annotate, and
 *  records the compiler/runtime seam the future execution wiring must
 *  compose. Calls into the actual compiler packages (coffeescript,
 *  uglifier) and the missing errors.add surface are documented in the
 *  body comments below. */
const validateSyntaxField = "content";

/** type/coffee_script.rb:5-9 event :validate_coffeescript_syntax, :validate,
 *  on: :save, changed: %i[type_id content] do
 *    ::CoffeeScript.compile content
 *  rescue ExecJS::RuntimeError => e
 *    errors.add :content, e.message.remove("[stdin]:")
 *  end
 *
 *  SEAM: the TS engine has no `errors.add :content` write-path surface
 *  (errors live in lib/card/error.rb - card-1.110.0 - and the action
 *  engine's validate path is hardcoded for the name legality / type
 *  resolution checks, card-action-engine.ts:256-258). The :coffee_script
 *  gem (`coffeescript.org` -> coffeescript npm) is not installed in this
 *  project's node_modules; the ExecJS bridge is unported. The body is
 *  the declaration's recorded shape: it reads the card's content, names
 *  the field it would validate against, and leaves the compile + error
 *  composition as the seam the action engine's validate stage must wire
 *  when mod-event execution lands. */
const validateCoffeescriptSyntaxFn: ModEventFn = (card, _host) => {
  // SEAM (no-op stub, see header): when execution wiring lands, this body
  // must (a) call ::CoffeeScript.compile on card.dbContent (the Ruby
  // `content` method on the acting card), (b) rescue ExecJS::RuntimeError,
  // strip the leading "[stdin]:" from e.message (Ruby's String#remove),
  // and (c) call errors.add :content, <stripped message> against the
  // action engine's write-path error surface. The :coffee_script + execjs
  // gems are unported (no TS compiler bridge); the errors.add seam is
  // unported (no TS error surface); the stage selector below is the only
  // piece the event registry admits today.
  void validateSyntaxField;
  void card;
};

/** type/java_script.rb:5-9 event :validate_javascript_syntax, :validate,
 *  on: :save, changed: %i[type_id content] do
 *    Uglifier.compile content, harmony: true
 *  rescue Uglifier::Error => e
 *    errors.add :content, "<pre>#{Cardio::Utils.ansi2html(e.message)}</pre>".html_safe
 *  end
 *
 *  SEAM: same as the coffeescript event - the TS engine has no errors.add
 *  seam, the uglifier gem is unported, and Cardio::Utils.ansi2html
 *  (lib/cardio/utils/ansi2_html.rb) is consumed only by this error
 *  message (no other reachable consumer headlessly - see the header's
 *  honest remainder). The body reads the card's content, names the
 *  field, and leaves the compile + ansi2html-wrapped errors.add as the
 *  seam the validate execution wiring must wire. */
const validateJavascriptSyntaxFn: ModEventFn = (card, _host) => {
  // SEAM (no-op stub, see header): when execution wiring lands, this body
  // must (a) call Uglifier.compile(card.dbContent, harmony: true), (b)
  // rescue Uglifier::Error, ANSI->HTML the message through
  // Cardio::Utils.ansi2html (lib/cardio/utils/ansi2_html.rb), wrap it in
  // "<pre>...</pre>".html_safe, and (c) call errors.add :content,
  // <wrapped message> against the action engine's write-path error surface.
  // The uglifier gem is unported (no TS compiler bridge); the ansi2html
  // helper has no headless consumer outside this event; the errors.add
  // seam is unported (no TS error surface); the stage selector below is
  // the only piece the event registry admits today.
  void validateSyntaxField;
  void card;
};

/** A set file whose ported bytes are registration bookkeeping only (the
 *  module basket entry Ruby's SetLoader creates; its card methods / events
 *  have no manifest surface - see the header's NOT-ported list and the
 *  per-entry comments). */
function passiveSetModule(setPath: string): {
  setPath: string;
  formats: { html: { views: [] } };
} {
  return { setPath, formats: { html: { views: [] } } };
}

const cardModScript: DeckoModManifest = {
  name: "script",
  gemName: "card-mod-script",
  group: "gem-defaults",
  setModules: [
    // card-mod-script-0.20.0/set/abstract/00_script.rb - Abstract::Script:
    // the html :javascript_include_tag script-family layer rides the merged
    // registration on all/head_javascript below; the html :core override
    // (CodeRay) and the js-format :compressed/:core views are not ported.
    passiveSetModule("abstract/00_script"),
    // set/abstract/01_asset_script.rb - Abstract::AssetScript (AssetFile
    // include + compress? from @minimize): no view/setting surface.
    passiveSetModule("abstract/01_asset_script"),
    // set/abstract/01_java_script.rb - Abstract::JavaScript (Script include,
    // js :core _render_raw): js-format, not registrable.
    passiveSetModule("abstract/01_java_script"),
    // set/abstract/02_coffee_script.rb - Abstract::CoffeeScript (bare_compile
    // + compile_coffee via CoffeeScript.compile): js-side compiler surface.
    passiveSetModule("abstract/02_coffee_script"),
    // set/abstract/03_asset_java_script.rb - AssetScript + JavaScript includes.
    passiveSetModule("abstract/03_asset_java_script"),
    // set/abstract/04_asset_coffee_script.rb - AssetScript + CoffeeScript.
    passiveSetModule("abstract/04_asset_coffee_script"),
    // set/abstract/script_group.rb - ScriptGroup (asset_input_content js core,
    // new_asset_constants, valid_file_extensions): card methods, no surface.
    passiveSetModule("abstract/script_group"),
    // set/all/head_javascript.rb - All::HeadJavaScript: the deck-head script
    // views + the javascript_include_tag base layer (the merged three-layer
    // registration; right/script and abstract/00_script's Ruby definitions
    // are the dispatch's first two branches).
    {
      setPath: "all/head_javascript",
      formats: {
        html: {
          views: [
            // head_javascript.rb:9-15
            {
              view: "script_variables",
              viewFn: scriptVariablesView,
              config: { unknown: true, cache: "never", perms: "none" },
            },
            // head_javascript.rb:17-23
            {
              view: "javascript_tags",
              viewFn: javascriptTagsView,
              config: { unknown: true, cache: "force", perms: "none" },
            },
            // head_javascript.rb:25-27
            {
              view: "script_calls",
              viewFn: scriptCallsView,
              config: { unknown: true, perms: "none" },
            },
            // head_javascript.rb:29-31 (base) + 00_script.rb:78-80 +
            // right/script.rb:8-12 (dispatch layers). The registered config
            // is the all-layer's (unknown: true rides only the base
            // definition in Ruby; the flat config table cannot express the
            // per-layer difference - the script-family/right layers carry
            // cache: :never only).
            {
              view: "javascript_include_tag",
              viewFn: javascriptIncludeTagView,
              config: { unknown: true, cache: "never", perms: "none" },
            },
          ],
        },
      },
    },
    // set/right/script.rb - Right::Script: assign_type :list, ok_to_read?,
    // the javascript_include_tag list layer (merged above), raw_help_text.
    passiveSetModule("right/script"),
    // set/self/script.rb - Self::Script: setting_opts (setting.rb group/position).
    {
      setPath: "self/script",
      settingOpts: {
        group: "webpage",
        position: 5,
      },
    },
    // set/type/coffee_script.rb - Type::CoffeeScript (Script include +
    // validate_coffeescript_syntax save event - type/coffee_script.rb:5-9,
    // adopted below).
    {
      setPath: "type/coffee_script",
      events: [
        {
          // type/coffee_script.rb:5-9 event :validate_coffeescript_syntax,
          // :validate, on: :save, changed: %i[type_id content] do
          //   ::CoffeeScript.compile content
          // rescue ExecJS::RuntimeError => e
          //   errors.add :content, e.message.remove("[stdin]:")
          // end
          // SEAM: body is a no-op stub - the action engine's validate path
          // is hardcoded (no eventsForStage consult), the :coffee_script +
          // execjs gems are unported (no TS compiler bridge), and the
          // `errors.add :content` write-path surface has no TS port.
          event: "validate_coffeescript_syntax",
          at: "validate",
          on: ["save"],
          changed: ["type_id", "content"],
          fn: validateCoffeescriptSyntaxFn,
        },
      ],
    },
    // set/type/java_script.rb - Type::JavaScript (Script include +
    // validate_javascript_syntax save event - type/java_script.rb:5-9,
    // adopted below).
    {
      setPath: "type/java_script",
      events: [
        {
          // type/java_script.rb:5-9 event :validate_javascript_syntax,
          // :validate, on: :save, changed: %i[type_id content] do
          //   Uglifier.compile content, harmony: true
          // rescue Uglifier::Error => e
          //   errors.add :content,
          //     "<pre>#{Cardio::Utils.ansi2html(e.message)}</pre>".html_safe
          // end
          // SEAM: body is a no-op stub - same as the coffeescript event;
          // uglifier + Cardio::Utils.ansi2html are unported, and the
          // `errors.add :content` write-path surface has no TS port.
          event: "validate_javascript_syntax",
          at: "validate",
          on: ["save"],
          changed: ["type_id", "content"],
          fn: validateJavascriptSyntaxFn,
        },
      ],
    },
    // set/type/local_script_folder_group.rb - FolderGroup + ScriptGroup +
    // non_createable_types basket.
    passiveSetModule("type/local_script_folder_group"),
    // set/type/local_script_manifest_group.rb - LocalManifestGroup +
    // ScriptGroup + non_createable_types basket.
    passiveSetModule("type/local_script_manifest_group"),
    // set/type_plus_right/mod/script.rb - Mod+*script (AssetInputter +
    // ModAssets): the remote_script_tags mod layer rides the merged
    // registration below; subpath/folder_group_type_id are card methods.
    passiveSetModule("type_plus_right/mod/script"),
    // set/type_plus_right/set/script.rb - Set+*script (AssetOutputter): the
    // merged remote_script_tags registration (the last of the two tpr files
    // in path order; the flat registry keeps one entry per view name).
    {
      setPath: "type_plus_right/set/script",
      formats: {
        html: {
          views: [
            // type_plus_right/set/script.rb:12-16 + type_plus_right/mod/
            // script.rb:18-20, merged with the pattern dispatch
            { view: "remote_script_tags", viewFn: remoteScriptTagsView },
          ],
        },
      },
    },
  ],
  prepareEngine: prepareScriptRules,
};

export default cardModScript;
