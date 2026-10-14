// The menu help popover: the help-rule resolution + help-text rendering the
// :menu view's data-bs-content needs (the "&amp;nbsp;" hardcode this file
// replaces rendered every card as help-less).
//
// Ruby chain (all cited files from the installed gems):
// - card-mod-format-0.20.0 set/all/html/menu.rb:35-37  view :help_link ->
//   `help_link render_help_text, help_title`
// - menu.rb:103-107  help_popover_opts -> bootstrap helper
// - card-mod-bootstrap-0.20.0 set/all/bootstrap/helper.rb:46-57  popover_opts:
//   `text = "&nbsp;" unless text.present?` then the text rides the data hash;
//   Rails content_tag escapes attribute values with ERB::Util.html_escape
//   (CGI.escapeHTML semantics: & < > " AND ' -> &#39;) - actionview-7.2.3.2
//   tag_helper.rb:310-323 (tag_option -> ERB::Util.unwrapped_html_escape),
//   activesupport core_ext/erb/util.rb:10-18, ruby 3.3 erb/escape.rb
//   (CGI.escapeHTML).
// - card-mod-help-0.20.0 set/all/help.rb  the help_text view:
//   :14-16 wrap_help_text(help_text); :32-34 help_text = voo.help ||
//   rule_based_help; :36-38 raw_help_text = card.try(:raw_help_text) ||
//   card.help_rule_card&.content; :40-48 rule_based_help = process_content(
//   raw, chunk_list: :references); :18-25 wrap_help_text prepends
//   "<span class='d-none'>#{edit_link}</span>" when card.help_rule_card is
//   readable; :1-4 help_rule_card = rule_card(:help) gated by ok?(:read).
// - card-1.110.0 lib/card/rule/all.rb:9-15  rule_card(:help) walks the rule
//   cache by "<lookup key>+help" over the card's patterns in precedence order;
//   lib/card/rule/cache.rb:10-27 the deck-wide rule load this resolver
//   mirrors (ONE batch, once per deck).
// - card-mod-rules-0.20.0 set/rule/board_rules_editor.rb:17-27  RULE cards
//   override the :help_text view: `wrap_help_text [rule_based_help,
//   setting_link].join(" ")` with setting_link =
//   `<div class="ms-auto"><a class="text-muted known-card" href="/SET">
//   (N title rules)</a></div>`; the N is Setting#count
//   (card-mod-rules set/type/setting.rb:12-14: Card.search left: {type:
//   SetID}, right: id, return: :count).
// - card-mod-rules-0.20.0 set/rule/editor.rb:60-62  the nested rule card's
//   edit_link view targets :rule_edit (href .../rule_edit).
// - card-mod-content-0.20.0 lib/card/content/chunk/link.rb  the [[...]]
//   link chunks process_content resolves: explicit targets
//   (/|https?:|mailto:) render through format.link_to_resource
//   (card-mod-format set/all/links.rb:126-131 + add_resource_opts :150-153:
//   target=_blank + class external-link), name targets nest the referee at
//   view :link (link.rb:71-75) whose anchor carries the known/wanted class
//   (links.rb add_known_or_wanted_class) and the :title view as text
//   (card-mod-format set/all/base.rb:35-43).
//
// QUERY SHAPE: rule resolution is deck-wide and closure-independent (Ruby's
// Rule::Cache design), so the prepare issues ONE driver.batch - [help-rule
// cards + transitive sides, per-setting rule counts] - ONCE per engine
// (canary-guarded), not per render. Warm renders (and every render after the
// first) resolve synchronously from the enriched render-card map: zero
// queries. These two statements ride the cold render's existing
// additionalStatements batch (appended, not a second batch), which
// restores the strict one-batch cold render.

import { DeckoName } from "../name.js";
import { h } from "./slot-html.js";
import type { SQLStatement } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { composeCardRecord, type CardRecord } from "../fetch/card-record.js";
import type { DbLexicon } from "../fetch/lexicon.js";
import type { FetchEngine } from "../fetch.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import { registeredSettingHelpText } from "./setting-help-text.js";
import type { HelpRulesApi, RenderCard, RenderFormat } from "./format.js";

export type { HelpRulesApi };

/** The engine members the resolver needs beyond RenderEngineLike. render.ts
 *  keeps both private; the composition seam (installHelpRules) reaches them
 *  through this structural type until the coordinator folds the prepare into
 *  render()'s own prepare phase. */
interface RenderEngineHelpHost {
  fetchRenderCard(name: string): RenderCard | undefined;
  isDenied(card: RenderCard): boolean;
  /** render.ts cacheFetchedRecord - write to the fetch cache + enrich into
   *  the render-card map (so sync fetchRenderCard/isDenied/set-keys work). */
  cacheFetchedRecord(record: CardRecord): Promise<unknown>;
  /** render.ts parseRuleTypeIds memo - read by enrichAndStore's rule?
   *  check while this prepare enriches rule cards. */
  ruleTypeIds: { setting?: number; set?: number; user?: number } | undefined;
  /** render.ts readPermission - the resolved viewer state. The setting-rule
   *  count mirrors Ruby's Card.search read-filter (see
   *  settingRuleCountsStatement below). The deck's alwaysOk actor sees the
   *  whole universe; the anonymous viewer sees only rules whose stored
   *  read_rule_id is in this set or NULL. Empty set is treated as "no
   *  readable rule ids" (count only the NULL-read_rule_id rules). */
  readPermission?: {
    readonly readableRuleIds: ReadonlySet<number>;
    readonly alwaysOk: boolean;
  };
}

// ---------------------------------------------------------------------------
// help content processing: [[link]] chunks over the nest machinery
// ---------------------------------------------------------------------------

/** process_content(raw, chunk_list: :references) for help texts: the decko
 *  chunker scans nests and links left-to-right; this walk delegates nest
 *  spans to the format's real nest machinery and handles [[...]] chunks
 *  here. A "[[" without its closing "]]" never matches Ruby's full_re
 *  (link.rb:13-15 /\A\[\[([^\]]+)\]\]/) and renders verbatim. */
export function processHelpContent(fmt: RenderFormat, raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const brace = raw.indexOf("{{", i);
    const bracket = raw.indexOf("[[", i);
    if (brace === -1 && bracket === -1) {
      out += raw.slice(i);
      break;
    }
    if (bracket !== -1 && (brace === -1 || bracket < brace)) {
      out += fmt.processContent(raw.slice(i, bracket));
      const match = /^\[\[([^\]]+)\]\]/.exec(raw.slice(bracket));
      if (match === null) {
        out += raw.slice(bracket, bracket + 2); // unclosed "[[": literal
        i = bracket + 2;
        continue;
      }
      out += renderLinkChunk(fmt, match[1]);
      i = bracket + match[0].length;
    } else {
      const end = bracket === -1 ? raw.length : bracket;
      out += fmt.processContent(raw.slice(i, end));
      i = end;
    }
  }
  return out;
}

/**
 * The set-module `def raw_help_text` methods: card.try(:raw_help_text)
 * resolves through the card's SET-module chain (all/help.rb:36-38), and the
 * TypePlusRight definitions are the shape the codename-keyed
 * SETTING_HELP_TEXT table cannot key — their membership is (left type,
 * right setting), not a codename. Coverage: every type_plus_right
 * `def raw_help_text` in the installed gems (grep, 2026-09-29):
 * exactly one — card-mod-bootstrap-0.20.0
 * set/type_plus_right/bootswatch_skin/variables.rb:6-9, the heredoc
 *
 *     <<-TEXT
 *       Override bootstrap [[...scss/_variables.scss|variables]]
 *     TEXT
 *
 * served to `<bootswatch skin>+*variables` SCSS field cards (the three
 * corpus customized-skin +*variables pages book their ONLY page diff in
 * this popover's data-bs-content: oracle renders the processed link,
 * engine rendered the &nbsp; placeholder). Ruby's lookup precedence puts
 * TypePlusRight ABOVE Right (pattern specificity), so the check runs
 * after the codename table and before the *help rule-card fallback.
 */
function setModuleRawHelpText(
  card: RenderCard,
  engine: RenderEngineHelpHost,
): string | undefined {
  const rightKey = card.name.rightName?.key;
  // The canonical key SINGULARIZES ("*variables" -> "*variable"); accept
  // both spellings so a non-singularizing environment matches too.
  if (rightKey !== "*variable" && rightKey !== "*variables") return undefined;
  const leftKey = card.name.leftName?.key;
  if (leftKey === undefined) return undefined;
  const left = engine.fetchRenderCard(leftKey);
  if (left === undefined) return undefined;
  if (left.typeCode !== "bootswatch_skin" && left.typeName !== "BootswatchSkin") {
    return undefined;
  }
  // variables.rb:6-9 heredoc, verbatim (4-space indent + trailing newline).
  return (
    "    Override bootstrap [[https://github.com/twbs/bootstrap/blob/v5.1.3/scss/_variables.scss|variables]]\n"
  );
}

/** link.rb:89-109 target_and_link_text: split at the FIRST pipe that is not
 *  inside a {{nest}} span; objectify strips both sides (link.rb:113-122). */
function dividerIndex(rawSyntax: string): number {
  if (!rawSyntax.includes("|")) return -1;
  let masked = rawSyntax;
  for (const incl of rawSyntax.match(/\{\{[^}]*\}\}/g) ?? []) {
    masked = masked.split(incl).join("x".repeat(incl.length));
  }
  return masked.indexOf("|");
}

/** link.rb:46-54 render_link: explicit targets (/|https?:|mailto:) render
 *  the resource link, name targets nest the referee at view :link. */
function renderLinkChunk(fmt: RenderFormat, rawSyntax: string): string {
  const divider = dividerIndex(rawSyntax);
  const target = (divider === -1 ? rawSyntax : rawSyntax.slice(0, divider)).trim();
  const label = divider === -1 ? undefined : rawSyntax.slice(divider + 1).trim() || undefined;
  if (target === "") return "";
  if (/^(\/|https?:|mailto:)/.test(target)) {
    return explicitLinkBytes(target, label);
  }
  // render_name_link (link.rb:71-75): nest referee_name with view :link;
  // options = {title: link_text || fully_stripped} (link.rb:31-33) - the
  // title is ALWAYS present: the pipe label, else the AUTHORED reference
  // name fully stripped - and the :link view's anchor text/title render
  // it (the corpus's sidebar help link: [[Layouts]] resolves to the
  // Layout card - href /Layout - while the text stays the authored
  // Layouts).
  const title = label ?? (DeckoName.parse(target).fullyStripped?.s ?? target);
  return fmt.nest({
    syntax: `{{${rawSyntax}}}`,
    name: target,
    options: { view: "link", title, extra: {} },
    comment: undefined,
  });
}

/** links.rb:126-131 html link_to_resource + add_resource_opts:150-153: the
 *  class is the resource type; external links get target=_blank. Attribute
 *  order is opts insertion order: target, class, href. */
function explicitLinkBytes(target: string, label: string | undefined): string {
  const type = /^https?:/.test(target)
    ? "external-link"
    : /^\//.test(target)
      ? "internal-link"
      : "email-link";
  const text = label ?? target; // links.rb html link_to: `text || opts[:href]`
  const targetAttr = type === "external-link" ? ' target="_blank"' : "";
  return `<a${targetAttr} class="${type}" href="${h(target)}">${h(text)}</a>`;
}

// ---------------------------------------------------------------------------
// the resolver
// ---------------------------------------------------------------------------

export class HelpRulesResolver implements HelpRulesApi {
  private readonly engine: RenderEngineHelpHost;
  private readonly fetcher: FetchEngine;
  private prepared = false;
  /** key of one composed rule card - the freshness canary (an engine
   *  resetCaches drops the render-card map; the next prepare refetches). */
  private canaryKey: string | undefined;
  private setTypeId: number | undefined;
  private settingTypeId: number | undefined;
  /** The user codename card's id - valid_preferer?'s first arm (all.rb:53). */
  private userTypeId: number | undefined;
  /** Setting#count per setting card id (card-mod-rules set/type/setting.rb). */
  private readonly ruleCounts = new Map<number, number>();

  constructor(engine: RenderEngineHelpHost, fetcher: FetchEngine) {
    this.engine = engine;
    this.fetcher = fetcher;
  }

  /** The deck-wide rule load: ONE batch, once per engine (per canary). */
  async prepare(): Promise<void> {
    if (this.prepared && this.canaryWarm()) return;
    this.prepared = true;
    this.canaryKey = undefined;
    this.ruleCounts.clear();
    await this.fetcher.codenames.ensureLoaded(); // first call only; memoized
    const setTypeId = this.fetcher.codenames.peekId("set");
    const settingTypeId = this.fetcher.codenames.peekId("setting");
    if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
    this.setTypeId = setTypeId;
    this.settingTypeId = settingTypeId;
    this.userTypeId = this.fetcher.codenames.peekId("user");
    const host = this.engineHost();
    // rule-card enrichment runs through the engine's own enrichAndStore,
    // whose RULE set-key check reads the engine's memoized codename ids
    // (render.ts parseRuleTypeIds). Memoize them the same way here so the
    // enrichment below computes RULE set keys correctly; render.ts then sees
    // ruleTypesCold === false and skips its own codehash fold.
    if (host.ruleTypeIds === undefined) {
      host.ruleTypeIds = {
        setting: settingTypeId,
        set: setTypeId,
        user: this.fetcher.codenames.peekId("user"),
      };
    }
    const results = await this.fetcher.driver.batch([
      helpRuleSidesStatement(setTypeId, settingTypeId),
      settingRuleCountsStatement(
        setTypeId,
        settingTypeId,
        // an always-ok actor (Decko Bot, an Administrator) reads every rule
        host.readPermission?.alwaysOk
          ? "all"
          : host.readPermission?.readableRuleIds ?? new Set<number>(),
        host.readPermission?.alwaysOk === true,
      ),
    ]);
    const counts = results[1];
    for (const row of (counts?.rows ?? []) as Array<{ sid: number; c: number }>) {
      this.ruleCounts.set(Number(row.sid), Number(row.c));
    }
    const rows = (results[0]?.rows ?? []) as CardsRow[];
    await this.composeAndCache(rows, host);
  }

  /** all/help.rb:1-4 + :36-38 + bootstrap helper.rb:46-57 - the full
   *  data-bs-content value (unescaped). */
  menuHelpContentBytes(fmt: RenderFormat): string {
    const card = fmt.card;
    if (card.unknown === true) return "";
    const isRule = this.isRuleCard(card);
    // board_rules_editor.rb:17-19 (rule cards) vs all/help.rb:14-16
    let text = this.ruleBasedHelp(fmt, card);
    if (isRule) text = `${text} ${this.settingLinkBytes(card)}`;
    const ruleCard = this.helpRuleCard(card); // help.rb:1-4 help_rule_card
    if (ruleCard !== undefined) {
      // help.rb:18-25 wrap_help_text - the d-none edit_link prefix
      text = `<span class='d-none'>${this.ruleEditLinkBytes(ruleCard)}</span>${text}`;
    }
    // helper.rb:48 `text = "&nbsp;" unless text.present?` - the caller emits
    // the escaped value; "" maps to the nbsp placeholder there.
    return rubyBlank(text) ? "" : text;
  }

  /** help.rb:32-34 + :40-48: voo.help is never set on the menu surface;
   *  rule_based_help = process_content(raw_help_text, chunk_list:
   *  :references), "" when raw_help_text is nil. */
  ruleBasedHelp(fmt: RenderFormat, card: RenderCard): string {
    const raw = this.rawHelpText(card);
    if (raw === undefined) return "";
    return processHelpContent(fmt, raw);
  }

  /** The HelpRulesApi member: the same chain for an arbitrary card — the
   *  rule_help alert's body (card-mod-rules set/rule/editor.rb:24-28
   *  rule_based_help over the rule card) and the setting-card core's
   *  *all-rule help (p20-help-content's loader-less dispatch). */
  ruleBasedHelpForCard(fmt: RenderFormat, card: RenderCard): string {
    return this.ruleBasedHelp(fmt, card);
  }

  /** help.rb:36-38: card.try(:raw_help_text) || card.help_rule_card&.content.
   *  The static table answers card.try for the self/right-set definitions
   *  (setting-help-text.ts); the set-MODULE definitions (card.try resolves
   *  through the card's set-module chain — the TypePlusRight set module is
   *  the one shape the codename-keyed table cannot key) answer in
   *  setModuleRawHelpText below; the readable *help rule card's db_content
   *  is the fallback. */
  private rawHelpText(card: RenderCard): string | undefined {
    // A preference rule row (isRuleCard true, isStandardRuleCard false) is
    // NOT in the setting's right set, so `card.try(:raw_help_text)` is nil
    // there and help.rb:36-38 falls straight to `card.help_rule_card&.content`
    // (all/help.rb:36-38). The static table is keyed on the RIGHT part's
    // codename (setting-help-text.ts:39-42), which over-answers for exactly
    // these cards: the capture's `Get notified about changes.` carries the
    // period the *follow+*right+*help rule card's db_content has and the
    // Right::Follow `raw_help_text` does not.
    const staticHelp = this.isRuleCard(card) && !this.isStandardRuleCard(card)
      ? undefined
      : registeredSettingHelpText(card.record.codename, this.rightPartCodename(card));
    if (staticHelp !== undefined) return staticHelp;
    const setModuleHelp = setModuleRawHelpText(card, this.engine);
    if (setModuleHelp !== undefined) return setModuleHelp;
    const ruleCard = this.helpRuleCard(card);
    return ruleCard === undefined ? undefined : ruleCard.dbContent;
  }

  /** help.rb:1-4: rule_card(:help) if it satisfies ok?(:read). The rule
   *  chain walk (rule/all.rb:13-15 + set/pattern/all.rb:66-68) resolves
   *  candidate names in pattern-precedence order through the enriched
   *  render-card map - every *help rule card in the deck was prefetched by
   *  prepare(), so a map miss = the card does not exist. */
  private helpRuleCard(card: RenderCard): RenderCard | undefined {
    if (card.unknown === true) return undefined;
    for (const candidate of this.ruleCandidateNames(card)) {
      const record = this.engine.fetchRenderCard(candidate);
      if (record === undefined) continue; // candidate rule does not exist
      if (this.engine.isDenied(record)) continue; // ok?(:read) false
      return record;
    }
    return undefined;
  }

  /** ruleNamesForCard in pattern-precedence order; compound cards resolve
   *  the type-plus-right anchor's left type through the enriched map (the
   *  same quick_type fallback applies when the left card is absent). */
  private ruleCandidateNames(card: RenderCard): string[] {
    const input: PatternCardInput = {
      name: card.name.s,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName,
    };
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      const left = leftKey !== undefined ? this.engine.fetchRenderCard(leftKey) : undefined;
      input.leftTypeName = left?.typeName;
    }
    return ruleNamesForCard(input, "*help");
  }

  /** rule/all.rb:33-54 `rule?` = `standard_rule? || preference?`, ported
   *  clause for clause (the same clause set render.ts computeIsRuleSync
   *  implements; oracle-pinned by
   *  truth-table.jsonl (not in the public package), which runs
   *  the gem's own verbatim all.rb lines over the corpus facts):
   *
   *  standard_rule? (all.rb:37-40): the right part's type is Setting and the
   *  left part's type is Set - any part count (name.left of "A+B+C" is
   *  "A+B").
   *
   *  preference? (all.rb:42-47): parts > 2, the right part's type is
   *  Setting, `name[0..-3]`'s type is Set, and `valid_preferer?`
   *  (all.rb:51-54) - the `self[-2]` part is a User-typed card OR carries
   *  codename `all`.
   *
   *  WHY NOT THE WIDENED SUPERSET. 8f8f9ca admitted "right is a Setting and
   *  the left part resolves" because the corpus lookup for the *follow
   *  guards' trunk looked unevaluable. The corpus facts close that: the
   *  trunk cards ARE Set-typed rows (`Sample Card 074+*self` id
   *  26849 and `Make Contact+*self` id 6854, both type 259 = Set), and the
   *  oracle's truth table shows the verbatim Ruby predicate admits all 3
   *  guard rows (the 9 `*follow` entries) while refusing all 34 distinct
   *  `mod: <x>+*style/script` rows (2-part; left `mod: <x>` is
   *  Mod-cardtype-typed 45410, not Set 259 - standard_rule? false;
   *  parts = 2 - preference? false). The widened tail admitted those 34
   *  mod rows and put settingLinkBytes into their popover data-bs-content -
   *  exactly the 68 grade7-to-8 regressions this file's predicate is here
   *  to refuse (first diff: expected "Skin (collection of stylesheets) for
   *  card&#39;s page..." / "JavaScript (or CoffeeScript) for card&#39;s
   *  page...", actual " &lt;div class=&quot;ms-auto&quot;&gt;..."). */
  private isRuleCard(card: RenderCard): boolean {
    if (this.settingTypeId === undefined) return false;
    if (!card.name.isCompound) return false;
    const rightKey = card.name.rightName?.key;
    const leftKey =
      card.name.parts.length > 1
        ? DeckoName.parse(card.name.parts.slice(0, -1).join("+")).key
        : undefined;
    if (rightKey === undefined || leftKey === undefined || leftKey === "") return false;
    const right = this.engine.fetchRenderCard(rightKey);
    if (right === undefined) return false;
    // the right part is a Setting gates BOTH arms (all.rb:38,44)
    if (right.record.typeId !== this.settingTypeId) return false;
    const left = this.engine.fetchRenderCard(leftKey);
    // standard_rule? (all.rb:37-40) - the left part's type is Set.
    if (left !== undefined && left.record.typeId === this.setTypeId) return true;
    // preference? (all.rb:42-47): parts > 2, then `name[0..-3]` is
    // Set-typed, then valid_preferer? (all.rb:51-54): the [-2] part is
    // User-typed, or that part's codename is "all". The map reads mirror
    // render.ts computeIsRuleSync (fetchRenderCard is the cache-only
    // render-path accessor); a miss = Ruby's fetch-returns-nil path =
    // clause false.
    if (card.name.parts.length <= 2) return false;
    const trunkKey = DeckoName.parse(card.name.parts.slice(0, -2).join("+")).key;
    if (trunkKey === "") return false;
    const trunk = this.engine.fetchRenderCard(trunkKey);
    if (trunk === undefined || trunk.record.typeId !== this.setTypeId) return false;
    const prefererKey = DeckoName.parse(card.name.parts[card.name.parts.length - 2] ?? "").key;
    if (prefererKey === "") return false;
    const preferer = this.engine.fetchRenderCard(prefererKey);
    if (preferer === undefined) return false;
    if (this.userTypeId !== undefined && preferer.record.typeId === this.userTypeId) return true;
    return preferer.record.codename === "all";
  }

  /** Whether this rule row is a standard_rule? (left Set-typed) card. The
   *  raw_help_text split below keys on it: help.rb:36-38 is
   *  `card.try(:raw_help_text) || card.help_rule_card&.content`, and the
   *  capture shows the static right-set table does NOT answer for a
   *  preference rule row - the readable *help rule card's db_content does
   *  (`*follow+*right+*help`, card 22724, content "Get notified about
   *  changes." WITH its period, against the table's
   *  `Right::Follow#raw_help_text` "Get notified about changes" without one -
   *  mod/follow/set/right/follow.rb:39-41 vs mod/follow/data/real.yml:14). */
  private isStandardRuleCard(card: RenderCard): boolean {
    const leftKey =
      card.name.parts.length > 1
        ? DeckoName.parse(card.name.parts.slice(0, -1).join("+")).key
        : undefined;
    if (leftKey === undefined || leftKey === "") return false;
    const left = this.engine.fetchRenderCard(leftKey);
    return left !== undefined && this.setTypeId !== undefined && left.record.typeId === this.setTypeId;
  }

  /** board_rules_editor.rb:21-27 setting_link. The anchor text keeps Ruby's
   *  leading space (`" (#{count} #{title} rules)"`). */
  private settingLinkBytes(card: RenderCard): string {
    const settingName = card.name.rightName?.s ?? "";
    const settingKey = card.name.rightName?.key;
    const settingRecord = settingKey !== undefined ? this.engine.fetchRenderCard(settingKey) : undefined;
    const known = settingRecord !== undefined && settingRecord.unknown !== true;
    const count = settingRecord?.id !== undefined ? (this.ruleCounts.get(settingRecord.id) ?? 0) : 0;
    const title = settingName.replace(/\*/g, ""); // rules.rb:44-46 tr "*", ""
    const href = `/${h(DeckoName.parse(settingName).urlKey)}`;
    return (
      `<div class="ms-auto"><a class="text-muted ${known ? "known-card" : "wanted-card"}"` +
      ` href="${href}"> (${count} ${h(title)} rules)</a></div>`
    );
  }

  /** board_rules_editor.rb:17-19 (the Rule-set :help_text view body) -
   *  `[rule_based_help, setting_link].join(" ")`. NO wrap_help_text (no
   *  d-none edit_link prefix) - the captured :help_text on *all+*read
   *  (rules-views.json rule_card.views.help_text) does not carry the
   *  d-none span. The card-mod-rules registration
   *  reaches this through engine.helpRules.ruleHelpTextBytes(fmt). */
  ruleHelpTextBytes(fmt: RenderFormat): string {
    const card = fmt.card;
    if (card.unknown === true) return "";
    if (!this.isRuleCard(card)) return "";
    const text = this.ruleBasedHelp(fmt, card);
    return `${text} ${this.settingLinkBytes(card)}`.trimStart();
  }

  /** help.rb:21 nest(rule_card, view: :edit_link) with the rule card's
   *  edit_link_view override (editor.rb:60-62 -> :rule_edit). Byte shape =
   *  menu.rb edit_link (link_to_view slotter attrs) with the rule_edit view;
   *  `link_text || "#{menu_icon} #{text}"` with empty text leaves the icon
   *  plus one trailing space. */
  private ruleEditLinkBytes(ruleCard: RenderCard): string {
    const href = `/${h(ruleCard.name.urlKey)}/rule_edit`;
    return (
      `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"` +
      ` data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"` +
      ` href="${href}" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`
    );
  }

  private rightPartCodename(card: RenderCard): string | undefined {
    if (!card.name.isCompound) return undefined;
    const rightKey = card.name.rightName?.key;
    if (rightKey === undefined) return undefined;
    return this.engine.fetchRenderCard(rightKey)?.record.codename;
  }

  /** Memory peek: the static setting-help text this card's self/right set
   *  serves (setting-help-text.ts), or undefined when none is registered.
   *  The render engine's link-target warm pass (view-fail class V4) reads
   *  this in the prepare phase so a rule row's popover links ([[List]]
   *  [[Pointer]] [[Search]] — the *content options shape) resolve
   *  known-card BEFORE the sync render, without scanning the whole static
   *  table for renders that never show a help popover. */
  peekStaticHelpTextFor(card: RenderCard): string | undefined {
    return registeredSettingHelpText(card.record.codename, this.rightPartCodename(card));
  }

  private canaryWarm(): boolean {
    return this.canaryKey === undefined || this.engine.fetchRenderCard(this.canaryKey) !== undefined;
  }

  private engineHost(): RenderEngineHelpHost {
    return this.engine;
  }

  /** Compose the fetched rows (sides before junctions, multi-pass) and funnel
   *  every record through the engine's own cacheFetchedRecord so rule cards
   *  join the enriched render-card map exactly like walked closure cards.
   *  Mirrors prefetch.ts composeAndCache (same lexicon writes; that copy is
   *  module-private there). */
  private async composeAndCache(rows: CardsRow[], host: RenderEngineHelpHost): Promise<void> {
    const byId = new Map<number, CardsRow>();
    for (const row of rows) byId.set(row.id, row);
    const lexicon = this.fetcher.lexicon;
    const names = new Map<number, DeckoName>();
    // named rows enter the local map first (their sides then compose from the
    // map without lexicon queries - the prefetch.ts composeAndCache passes)
    for (const row of byId.values()) {
      if (row.name !== null) names.set(row.id, DeckoName.parse(row.name));
    }
    let pending = [...byId.values()];
    for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
      const still: CardsRow[] = [];
      for (const row of pending) {
        const composed = await this.tryComposeName(row, names, lexicon);
        if (composed !== undefined) names.set(row.id, composed);
        else still.push(row);
      }
      if (still.length === pending.length) break; // unresolvable sides stay
      pending = still;
    }
    let firstRuleKey: string | undefined;
    const composed: CardRecord[] = [];
    for (const row of byId.values()) {
      const name = names.get(row.id);
      if (name === undefined) continue;
      if (row.name !== null) lexicon.write(row.id, name, row.name);
      else if (row.left_id !== null && row.right_id !== null) {
        lexicon.write(row.id, name, [row.left_id, row.right_id]);
      }
    }
    // Phase the cache writes BEFORE the enrichment pass: enrichAndStore
    // fetches type/left cards for each record, and every fetched row here is
    // itself in `rows` - writing them all first keeps that traffic on the
    // fetch cache (zero queries), the same invariant prefetch.ts's
    // sides-before-junctions batch ordering provides for the closure walk.
    for (const row of byId.values()) {
      if (names.get(row.id) === undefined) continue;
      composed.push(await composeCardRecord(row, lexicon));
    }
    for (const record of composed) this.fetcher.writeToCache(record);
    for (const record of composed) {
      await host.cacheFetchedRecord(record);
      if (firstRuleKey === undefined && record.key?.includes("+*help") === true) {
        firstRuleKey = record.key;
      }
    }
    if (firstRuleKey !== undefined) this.canaryKey = firstRuleKey;
  }

  private async tryComposeName(
    row: CardsRow,
    names: Map<number, DeckoName>,
    lexicon: DbLexicon,
  ): Promise<DeckoName | undefined> {
    if (row.name !== null) return DeckoName.parse(row.name);
    if (row.left_id === null || row.right_id === null) return undefined;
    const left = await this.sideName(row.left_id, names, lexicon);
    const right = await this.sideName(row.right_id, names, lexicon);
    if (left === undefined || right === undefined) return undefined;
    return DeckoName.parse(`${left.s}+${right.s}`);
  }

  private async sideName(
    id: number,
    names: Map<number, DeckoName>,
    lexicon: DbLexicon,
  ): Promise<DeckoName | undefined> {
    const local = names.get(id);
    if (local !== undefined) return local;
    try {
      const viaLexicon = await lexicon.name(id);
      return viaLexicon !== undefined && viaLexicon.s !== "" ? viaLexicon : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Ruby-blank: nil/empty/whitespace-only strings are blank
 *  (ActiveSupport String#blank?); present? = !blank?. */
function rubyBlank(s: string): boolean {
  return /^\s*$/.test(s);
}

// ---------------------------------------------------------------------------
// SQL - the deck-wide rule facts, closure-independent (Rule::Cache shape)
// ---------------------------------------------------------------------------

/** The *help rule cards (rule rows joined through their set + setting cards,
 *  lib/card/rule/cache.rb:10-27's join with the setting narrowed to codename
 *  'help') plus every transitive side card needed to compose their names.
 *  The recursive reached-CTE mirrors prefetch.ts SELECT_TYPE_AND_SIDE.
 *
 *  SCOPE: deck-wide by construction and deliberately so — the product is
 *  the help popover's rule facts, closure-independent, which is the same
 *  precompute Ruby's Rule::Cache does once per process
 *  (lib/card/rule/cache.rb:25-30). It is NOT narrowed to the rendered
 *  card's closure: a page's popover asks about the SETTINGS that page
 *  shows, and which those are depends on the page's content, so the row
 *  set is not knowable before the page is walked. What was wrong is the
 *  recursive step's PLAN, and the plan was the whole cost: the two-valued
 *  `s.id IN (j.left_id, j.right_id)` cannot use the cards primary-key
 *  index, so the step degrades to a scan per reached row. `s.id` IS the
 *  primary key, so that predicate matches exactly the two non-null side
 *  ids and the join to `cards s` contributes nothing — splitting it into
 *  two indexed arms returns the identical set (the UNION dedupe is
 *  unchanged) on a plan the index can serve. Measured on the trial deck's
 *  all-settings twin (card-mod-rules.ts ruleSidesStatement, same step):
 *  the IN form did not complete inside 40 s standalone against the trial
 *  database, the two-arm form returned the identical 4,779-id closure in
 *  170 ms; mirrored locally, 60 s+ against 17.6 s, with the two-arm set
 *  matching an independent breadth-first walk id for id. See
 *  probe-reached-rules-walk-wire.ts (not in the public package). */
function helpRuleSidesStatement(setTypeId: number, settingTypeId: number): SQLStatement {
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
      "  SELECT j.left_id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    WHERE j.left_id IS NOT NULL\n" +
      "  UNION\n" +
      "  SELECT j.right_id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    WHERE j.right_id IS NOT NULL\n" +
      "  UNION\n" +
      "  SELECT j.type_id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id\n" +
      "    WHERE j.type_id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [setTypeId, settingTypeId],
  };
}

/** Setting#count for every setting at once
 *  (card-mod-rules set/type/setting.rb:12-14: `Card.search left: {type:
 *  SetID}, right: id, return: :count` - CQL defaults to trash: false).
 *
 *  Read filter (the permission family mechanism): Ruby's Card.search
 *  honors the viewer's read_rules_hash (lib/card/auth/setup.rb#read_rule
 *  _hash; account_holder.rb#fetch_read_rules). Anonymous joins [Anyone];
 *  a rule card is counted only when its `read_rule_id` is in the
 *  viewer's readable set OR is NULL (no restriction). The engine
 *  mirrors this with a SQL predicate that takes the readable rule ids
 *  as params (callers pass `Array.from(state.readableRuleIds)` and an
 *  empty params list when alwaysOk). Without this filter the engine
 *  counts every live rule card matching the structural joins - on the
 *  corpus that produces 140 *default rules vs Ruby's 49 (corpus:87/88/91
 *  /105/155/201/205/217/242/248/253/257 + 251 on *input_type). */
export function settingRuleCountsStatement(
  setTypeId: number,
  settingTypeId: number,
  readableRuleIds: ReadonlySet<number> | "all",
  alwaysOk = false,
): SQLStatement {
  const all = readableRuleIds === "all";
  const readableIds = all ? [] : Array.from(readableRuleIds);
  const hasFilter = readableIds.length > 0;
  const readableParams: number[] = hasFilter && !alwaysOk ? readableIds : [];
  const sql =
    "SELECT settings.id AS sid, COUNT(*) AS c\n" +
    "FROM cards rules\n" +
    "  JOIN cards sets ON rules.left_id = sets.id\n" +
    "  JOIN cards settings ON rules.right_id = settings.id\n" +
    "WHERE sets.type_id = ? AND settings.type_id = ?\n" +
    "  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0\n" +
    // Card.search adds no read restriction for Auth.always_ok? (an
    // administrator counts every rule).
    (alwaysOk
      ? ""
      : hasFilter
      ? "  AND (rules.read_rule_id IS NULL OR rules.read_rule_id IN (" +
        readableParams.map(() => "?").join(",") +
        "))\n"
      : all
        ? ""
        : "  AND rules.read_rule_id IS NULL\n") +
    "GROUP BY settings.id";
  return { sql, params: [setTypeId, settingTypeId, ...readableParams] };
}

// ---------------------------------------------------------------------------
// composition seam
// ---------------------------------------------------------------------------

/** Attach the resolver to the engine (the optional `helpRules` member of
 *  RenderEngineLike). Pure attachment - no queries. The engine passes
 *  structurally as the help host; its private cacheFetchedRecord/ruleTypeIds
 *  members are reached through the prepared cast (render.ts owns them until
 *  the coordinator's fold). */
export function installHelpRules(engine: {
  helpRules?: HelpRulesApi;
  fetchRenderCard(name: string): RenderCard | undefined;
  isDenied(card: RenderCard): boolean;
}, fetcher: FetchEngine): HelpRulesResolver {
  const resolver = new HelpRulesResolver(
    engine as unknown as RenderEngineHelpHost,
    fetcher,
  );
  (engine as { helpRules?: HelpRulesApi }).helpRules = resolver;
  return resolver;
}
