// The card-mod-help gem (card-mod-help-0.20.0), ported through the mod
// loader - the reference port proving the mechanism end to end.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-help-0.20.0/): six set files, no lib/, no set_pattern/, no
// events. Ported here byte-verifiably: set/all/help.rb (the :help,
// :help_text, :lead views - oracle bytes in
// fixtures/captured/help-mod-loader.json "rendered"), set/all/guide.rb
// (the :guide view - markdown :core dependency resolved by
// card-mod-markdown.ts; no fixture-captured oracle bytes, so the
// port-level test asserts the view dispatches and emits the
// guide-text class list, the d-none edit-link span shape, and the
// nested guide content through the markdown :core path), and the two
// setting_opts files (set/self/help.rb, set/self/guide.rb - oracle
// state under "setting_groups"/"setting_opts_*").
//
// NOT yet ported (honest remainder, see docs/mod-loader-port-notes.md):
// - set/right/help.rb view :popover - the popover_link helper from
//   card-mod-bootstrap-0.20.0 set/all/bootstrap/helper.rb:41-44 (the
//   icon_tag :help + data-bs-toggle: popover anchors) is unported; no
//   oracle capture pins the byte shape, so registering the view would
//   claim a fidelity the fixtures do not pin
// - set/right/guide.rb - set module only defines a card-level
//   `raw_help_text` method (card-mod-help set/right/guide.rb:3-7); no
//   view declared; the SettingHelpText registry already serves the
//   text (render/setting-help-text.ts#registeredSettingHelpText).
// - assets/style/help.scss - stylesheet mods are a separate surface
// - config/admin.yml - the admin surface (settings/views lists) has no TS
//   consumer

import type { ViewContext, ViewFn } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
} from "../mod-manifest.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import { processHelpContent } from "../../render/help-popover.js";
import { parseNestOptions } from "../../render/nest-syntax.js";

// ---------------------------------------------------------------------------
// set/all/help.rb - the card-level methods, then the format :html block
// ---------------------------------------------------------------------------

/** help.rb:1-4 help_rule_card: `rule_card(:help)` gated by ok?(:read).
 *  rule_card walks the card's set names in pattern precedence joined to
 *  "*help" (lib/card/rule/all.rb:9-15); the candidates resolve against the
 *  engine's prepared render-card map (the mod's prepareEngine prefetched
 *  every *help rule card in the deck - the Rule::Cache analog,
 *  lib/card/rule/cache.rb:10-27), so a map miss = the rule card does not
 *  exist. */
function helpRuleCard(ctx: ViewContext): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
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
  for (const candidate of ruleNamesForCard(input, "*help")) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // candidate rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // ok?(:read) false
    return record;
  }
  return undefined;
}

/** help.rb:36-38 raw_help_text: `card.try(:raw_help_text) ||
 *  card.help_rule_card&.content`. The static setting-level defs the first
 *  operand serves are set-module methods this surface's probe cards do not
 *  carry (they live in the settings' self/right sets); undefined falls to
 *  the rule card's content. */
function rawHelpText(ctx: ViewContext): string | undefined {
  const ruleCard = helpRuleCard(ctx);
  return ruleCard === undefined ? undefined : ruleCard.dbContent;
}

/** help.rb:40-48 rule_based_help: process_content(raw, chunk_list:
 *  :references) - nests and [[link]] chunks render through the format's
 *  real machinery (help-popover.ts#processHelpContent is that chunk walk,
 *  shared rather than duplicated). */
function ruleBasedHelp(ctx: ViewContext): string {
  const raw = rawHelpText(ctx);
  if (raw === undefined) return "";
  return processHelpContent(ctx.fmt, raw);
}

/** help.rb:32-34 help_text: `voo.help || rule_based_help`. */
function helpText(ctx: ViewContext): string {
  const vooHelp = ctx.voo.opts["help"];
  if (typeof vooHelp === "string" && vooHelp !== "") return vooHelp;
  return ruleBasedHelp(ctx);
}

/** help.rb:18-25 wrap_help_text: a READABLE help rule card prepends its
 *  edit_link (nest rule_card, view: :edit_link; the rule card's edit_link
 *  override targets :rule_edit - card-mod-rules set/rule/editor.rb:60-62).
 *  The link bytes are menu.rb's edit_link shape
 *  (card-mod-format set/all/html/menu.rb) with the rule_edit view:
 *  `link_text || "#{menu_icon} {text}"` with empty text leaves the icon
 *  plus one trailing space. */
function wrapHelpText(ctx: ViewContext, text: string): string {
  const ruleCard = helpRuleCard(ctx);
  if (ruleCard === undefined) return text;
  const href = `/${ruleCard.name.urlKey}/rule_edit`;
  const editLink =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"` +
    ` data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"` +
    ` href="${href}" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`;
  return `<span class='d-none'>${editLink}</span>${text}`;
}

/** help.rb:6-12 view :help, unknown: true, cache: :never, wrap: :slot:
 *  `help = help_text; return "" unless help.present?; wrap_with :div,
 *  wrap_help_text(help), class: classy("help-text")`. The `wrap: :slot`
 *  config wraps the view in the render pipeline's slot wrapper EVEN WHEN the
 *  body returns blank (format/render.rb:96-97 runs with_wrapper around
 *  final_render unconditionally) - the oracle pins the empty-slot-div bytes
 *  for a rule-less card. */
const helpView: ViewFn = (ctx) => {
  const help = helpText(ctx);
  const body = /^\s*$/.test(help)
    ? ""
    : `<div class="help-text">${wrapHelpText(ctx, help)}</div>`;
  return modSlotWrap(ctx, "help", body);
};

/** help.rb:14-16 view :help_text, unknown: true, cache: :never:
 *  `wrap_help_text help_text`. No wrap config -> bare bytes (oracle: ""
 *  without a rule; the d-none span + text with one). */
const helpTextView: ViewFn = (ctx) => wrapHelpText(ctx, helpText(ctx));

/** help.rb:27-30 view :lead: `class_up "card-slot", "lead";
 *  _view_content`. _view_content calls the content view's method DIRECTLY
 *  (no render! pass, so no before(:content) hook - the oracle bytes carry
 *  no d0-card-content) - here: the core bytes in the lead slot wrap, the
 *  classy extra landing at the class list's end (the classUp chain). */
const leadView: ViewFn = (ctx) => {
  ctx.voo.classUp("card-slot", "lead");
  return modSlotWrap(ctx, "lead", ctx.fmt.renderView("core"));
};

// ---------------------------------------------------------------------------
// set/all/guide.rb - the guide rule walker, helper methods, then :guide
// ---------------------------------------------------------------------------

/** guide.rb:1-3 card-level guide_card (memoized via @guide_card ||=
 *  determine_guide_card). The format-level methods below call
 *  card.guide_card via Ruby's `delegate :guide_card, to: :card`
 *  (guide.rb:42). For the TS port this is a direct rule-walk: same
 *  cache-checked resolution as helpRuleCard but for *guide rules. */
function guideRuleCard(ctx: ViewContext): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
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
  for (const candidate of ruleNamesForCard(input, "*guide")) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // guide rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // guide.rb:52 ok?(:read)
    return record;
  }
  return undefined;
}

/** guide.rb:34-40 guide_text: `return "" unless guide_card; with_nest_mode
 *  :normal { nest guide_card, view: :core }`. The TS port calls the
 *  format.nest shape directly (format.ts:450-484) with a one-option Nest:
 *  `view: "core"`. nest_name/nest_syntax ride the option_map; the target
 *  name is the guide card's qualified name. */
function guideText(ctx: ViewContext): string {
  const guideCard = guideRuleCard(ctx);
  if (guideCard === undefined) return "";
  return ctx.fmt.nest({
    syntax: `{{${guideCard.name.s}|view:core}}`,
    name: guideCard.name.s,
    options: parseNestOptions("view:core"),
    comment: undefined,
  });
}

/** guide.rb:27-32 prepend_guide_edit_link: `return guide_text unless
 *  guide_card.ok?(:update)`. The TS port consults taskAllowed on the
 *  engine (the same seam viewPermissionDenial uses for :read, format.ts
 *  via view-permissions); update permission here is checked through the
 *  engine's optional taskAllowed hook (unified :update gate). When the
 *  update task is denied, the d-none span wrapping is skipped, exactly
 *  like help.rb's `card.help_rule_card&.ok?(:read)` gate on
 *  wrap_help_text. */
function prependGuideEditLink(ctx: ViewContext, text: string): string {
  const guideCard = guideRuleCard(ctx);
  if (guideCard === undefined) return text;
  const taskAllowed = ctx.fmt.engine.taskAllowed?.(guideCard, "update");
  if (taskAllowed !== undefined && taskAllowed === false) return text;
  const href = `/${guideCard.name.urlKey}/edit`;
  const editLink =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"` +
    ` data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"` +
    ` href="${href}" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`;
  return `<span class='d-none'>${editLink}</span>${text}`;
}

/** guide.rb:6-16 view :guide, unknown: true, cache: :never, wrap: :slot:
 *  `guide` -> wraps with `<div class="guide-text">` (or empty string when
 *  guide_text is blank). The d-none edit_link prefix applies when the
 *  guide_card responds to ok?(:update). */
function guideInnerHtml(ctx: ViewContext): string {
  const text = guideText(ctx);
  if (text === "") return "";
  return `<div class="guide-text">${prependGuideEditLink(ctx, text)}</div>`;
}

const guideView: ViewFn = (ctx) => modSlotWrap(ctx, "guide", guideInnerHtml(ctx));

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time *help rule warm (the Rule::Cache analog)
// ---------------------------------------------------------------------------

/** The *help rule card ids PLUS every transitive side id needed to compose
 *  their junction names: the rule-cache join (lib/card/rule/cache.rb:10-27)
 *  narrowed to codename 'help', with the recursive side walk of the
 *  prefetch's reached-CTE shape. */
function helpRuleSidesStatement(setTypeId: number, settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  const ruleJoin =
    "FROM cards rules\n" +
    "  JOIN cards sets ON rules.left_id = sets.id\n" +
    "  JOIN cards settings ON rules.right_id = settings.id\n" +
    "WHERE sets.type_id = ? AND settings.type_id = ? AND settings.codename = 'help'\n" +
    "  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0";
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      `  SELECT rules.id ${ruleJoin}\n` +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [setTypeId, settingTypeId],
  };
}

/** The *guide rule card ids plus every transitive side id needed to compose
 *  their junction names - the rule-cache join narrowed to codename 'guide'
 *  (card-mod-help set/all/guide.rb:47-52 determine_guide_card +
 *  card-1.110.0 lib/card/rule/cache.rb:10-27's join). The reachable-CTE
 *  mirrors helpRuleSidesStatement; the only difference is the setting
 *  codename. Adding the *guide warm here keeps card-mod-help
 *  self-contained: card-mod-layout also warms *guide rules via its own
 *  prepareEngine (prepareGuideRules there), so a deck that loads both
 *  mods issues the warm twice (the second pass is a no-op since the rule
 *  cards are already in the prepared render-card map). */
function guideRuleSidesStatement(setTypeId: number, settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  const ruleJoin =
    "FROM cards rules\n" +
    "  JOIN cards sets ON rules.left_id = sets.id\n" +
    "  JOIN cards settings ON rules.right_id = settings.id\n" +
    "WHERE sets.type_id = ? AND settings.type_id = ? AND settings.codename = 'guide'\n" +
    "  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0";
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      `  SELECT rules.id ${ruleJoin}\n` +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [setTypeId, settingTypeId],
  };
}

/** One batch, once per codename: every rule card with that codename enters
 *  the prepared render-card map. Junction names compose in-memory from the
 *  fetched side records (multi-pass: sides first, then their junctions) -
 *  a rule card reached by ID has no name mark to seed the lexicon's
 *  on-demand composition, so this mirrors the prefetch's composeAndCache
 *  shape (prefetch.ts). After this the helpRuleCard + guideRuleCard
 *  helpers resolve rule cards synchronously - zero queries on the render
 *  path. */
async function prepareRulesForCodename(
  host: ModEngineHost,
  setTypeId: number,
  settingTypeId: number,
  codename: "help" | "guide",
): Promise<void> {
  const stmt =
    codename === "help"
      ? helpRuleSidesStatement(setTypeId, settingTypeId)
      : guideRuleSidesStatement(setTypeId, settingTypeId);
  const results = await host.batch([stmt]);
  type FetchedRow = {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
  };
  const rows = (results[0] as { rows: FetchedRow[] } | undefined)?.rows ?? [];
  if (rows.length === 0) return;

  interface PreparedRecord {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
    record: NonNullable<Awaited<ReturnType<ModEngineHost["fetchById"]>>>;
  }
  const byId = new Map<number, PreparedRecord>();
  for (const row of rows) {
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
  // fetch ladder's assign_name semantics - a record reached by id carries
  // no name mark, so the composed name is assigned here).
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

/** The card-mod-help prepareEngine: warm *help rules (helpRuleCard) AND
 *  *guide rules (guideRuleCard) in two sequential batches. Both rule walks
 *  share the same prepared render-card map the engine exposes via
 *  fetchRenderCard. */
async function prepareHelpAndGuideRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  await prepareRulesForCodename(host, setTypeId, settingTypeId, "help");
  await prepareRulesForCodename(host, setTypeId, settingTypeId, "guide");
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModHelp: DeckoModManifest = {
  name: "help",
  gemName: "card-mod-help",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-help-0.20.0/set/all/help.rb
      setPath: "all/help",
      formats: {
        html: {
          views: [
            { view: "help", viewFn: helpView, config: { unknown: true, cache: "never", wrap: "slot" } },
            { view: "help_text", viewFn: helpTextView, config: { unknown: true, cache: "never" } },
            { view: "lead", viewFn: leadView },
          ],
        },
      },
    },
    {
      // card-mod-help-0.20.0/set/all/guide.rb: the :guide view (unknown:
      // true, cache: :never, wrap: :slot - identical config to :help). The
      // view body's bytes run the guide card's Markdown core through
      // nest(view: :core); that path is provided by card-mod-markdown
      // (Type::Markdown::HtmlFormat#core, card-mod-markdown.ts:87-90).
      setPath: "all/guide",
      formats: {
        html: {
          views: [
            { view: "guide", viewFn: guideView, config: { unknown: true, cache: "never", wrap: "slot" } },
          ],
        },
      },
    },
    {
      // card-mod-help-0.20.0/set/self/help.rb
      setPath: "self/help",
      settingOpts: {
        group: "editing",
        position: 1,
        ruleTypeEditable: true,
        shortHelpText: "help text people will see when editing",
        helpText:
          "[[http://decko.org/custom_help_text|Help text]] people will see when editing.",
      },
    },
    {
      // card-mod-help-0.20.0/set/self/guide.rb
      setPath: "self/guide",
      settingOpts: {
        group: "editing",
        position: 3,
        ruleTypeEditable: true,
        shortHelpText: "appears in the full editor view to guide users",
      },
    },
  ],
  prepareEngine: prepareHelpAndGuideRules,
};

export default cardModHelp;
