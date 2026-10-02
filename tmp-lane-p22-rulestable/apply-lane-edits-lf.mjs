// Lane p22-rulestable edit driver, part 2 — LF-faithful replacements (both
// target files are LF-dominant; the 102/60 CRLF lines sit in untouched
// blocks). Every anchor must match exactly once.
import { readFileSync, writeFileSync } from "node:fs";

function edit(path, anchor, replacement) {
  const text = readFileSync(path, "utf8");
  const first = text.indexOf(anchor);
  if (first === -1) throw new Error("ANCHOR NOT FOUND: " + anchor.slice(0, 140));
  if (text.indexOf(anchor, first + 1) !== -1) {
    throw new Error("ANCHOR NOT UNIQUE: " + anchor.slice(0, 140));
  }
  writeFileSync(path, text.slice(0, first) + replacement + text.slice(first + anchor.length));
  console.log("edited", path.split("/").pop(), "anchor", anchor.length, "->", replacement.length);
}

const R = "C:/localProjects/decko-ts-lane-p22-rulestable/src/card/render.ts";
const F = "C:/localProjects/decko-ts-lane-p22-rulestable/src/card/render/format.ts";

// ---------------------------------------------------------------- render.ts

// 2: ensureReadPermission before the help install on the page path
edit(
  R,
  `      if (this.helpResolver === undefined) {
        this.helpResolver = installHelpRules(this, this.fetcher);
        await this.helpResolver.prepare();
      }
      return await fn();`,
  `      // Lane p22-rules-table (head-rule popover counts): the help resolver's
      // deck-wide Setting#count batch filters by the VIEWER's readable rule
      // set (help-popover.ts settingRuleCountsStatement — the port of the
      // Card.search read filter). An UNRESOLVED readPermission degrades that
      // filter to the read_rule_id-IS-NULL branch, and every corpus *head
      // rule carries a stored read_rule_id — the page lane rendered
      // "(0 head rules)" where the oracle pins "(2 head rules)" (the
      // *all+*head / PCTS+*self+*head nest-miss pages). The VIEW path folds
      // the state earlier in render() (the permissionCold pass) before its
      // own install; the page path must too. Once per engine: the state is
      // memoized, render()'s permissionCold goes false, and its cold batch
      // drops the permission statements — the folded-index math is computed
      // from the same conditionals and stays consistent.
      if (this.readPermission === undefined) await this.ensureReadPermission();
      if (this.helpResolver === undefined) {
        this.helpResolver = installHelpRules(this, this.fetcher);
        await this.helpResolver.prepare();
      }
      return await fn();`,
);

// 3: ruleSetPrototypeTypeId method, inserted before newCardDefaultContent
edit(
  R,
  `  /**
   * The *default rule's CONTENT for a nest-miss new card (content/all.rb:`,
  `  /**
   * RenderEngineLike#ruleSetPrototypeTypeId — card-mod-rules set/type/set.rb
   * #prototype.type_id for a RULE card's set (the visible_settings input the
   * categories machinery filters restricted settings by): Card.fetch(
   * subclass_for_set.prototype_args(anchor_name), new:).type_id. The
   * prototype_args per pattern (mod/core/set_pattern/01_all.rb:9 …
   * 09_self.rb:13) compose from the rule card's trunk (the SET name), parsed
   * by parseSetName (set/type/set.rb #subclass_for_set):
   *   - self: {name: anchor} — Card.fetch returns the EXISTING anchor card,
   *     so its stored type wins; a warm-map miss degrades to the new-card
   *     template walk (newCardDefaultType over the anchor's own sets).
   *   - type: {type: anchor} — the anchor NAMES the type explicitly
   *     (type.rb:58-66: the assignment precedes any template walk), so the
   *     prototype's type id IS the anchor type card's id.
   *   - type_plus_right: {name: "+tag", supercard: Card.new(name: "*dummy",
   *     type: anchor.trunk_name)} — the supercard's type makes the TPR set
   *     the prototype's own set, so the *default universe's entry for the
   *     set key answers; without one the walk degrades to the name-only arms
   *     (disclosed approximation; the corpus TPR sets all carry a *default).
   *   - all: {} — Ruby answers with the deck-wide constant
   *     Card.default_type_id (mod/core/set/all/type.rb:3-5, fetch_type_id
   *     %i[all default]) — the *all+*default RULE CARD's own type, which is
   *     the universe's "*all" entry (a constant read, not a walk).
   *   - all_plus/star/rstar/rule/right: the prototype_args' new-card names
   *     ("+", "*dummy", "*dummy+*dummy", "*all+*create", "*dummy+<tag>") —
   *     the candidate walk newCardDefaultType ports (type_id_from_template).
   * Undefined when the set does not parse or no arm resolves (the caller's
   * restricted-setting filter treats that as not-allowed, never allowed).
   */
  ruleSetPrototypeTypeId(card: RenderCard): number | undefined {
    if (!card.name.isCompound) return undefined;
    const parts = card.name.parts;
    if (parts.length < 2) return undefined;
    const setName = DeckoName.parse(parts.slice(0, -1).join("+"));
    const parsed = parseSetName(setName);
    const anchor = parsed.anchorName;
    switch (parsed.patternCode) {
      case "self": {
        if (anchor === null) return undefined;
        const existing = this.fetchRenderCard(anchor.s);
        if (existing !== undefined && existing.unknown !== true && existing.record.typeId !== undefined) {
          return existing.record.typeId;
        }
        return this.newCardDefaultType(anchor)?.typeId;
      }
      case "type": {
        if (anchor === null) return undefined;
        const typeCard = this.fetchRenderCard(anchor.s);
        return typeCard !== undefined && typeCard.unknown !== true ? typeCard.record.id : undefined;
      }
      case "type_plus_right": {
        const direct = this.defaultRuleTypes?.get(setName.key);
        if (direct !== undefined) return direct;
        return this.newCardDefaultType(DeckoName.parse(\`*dummy+\${anchor?.s ?? ""}\`))?.typeId;
      }
      case "all":
        return this.defaultRuleTypes?.get("*all");
      default: {
        const prototypeName =
          parsed.patternCode === "all_plus"
            ? "+"
            : parsed.patternCode === "star"
              ? "*dummy"
              : parsed.patternCode === "rstar"
                ? "*dummy+*dummy"
                : parsed.patternCode === "rule"
                  ? "*all+*create"
                  : parsed.patternCode === "right" && anchor !== null
                    ? \`*dummy+\${anchor.s}\`
                    : undefined;
        if (prototypeName === undefined) return undefined;
        return this.newCardDefaultType(DeckoName.parse(prototypeName))?.typeId;
      }
    }
  }

  /**
   * The *default rule's CONTENT for a nest-miss new card (content/all.rb:`,
);

// ---------------------------------------------------------------- format.ts

// 4: interface member after cardMatchesRuleSet
edit(
  F,
  `  cardMatchesRuleSet?(card: RenderCard): boolean;`,
  `  cardMatchesRuleSet?(card: RenderCard): boolean;
  /** card-mod-rules set/type/set.rb #prototype.type_id for a RULE card's
   *  set — the visible_settings input the categories machinery filters the
   *  restricted settings (content_options / content_option_view) by. See
   *  RenderEngine#ruleSetPrototypeTypeId. Optional: engines without it
   *  answer the restricted-settings recent arm as not-allowed (never
   *  allowed). */
  ruleSetPrototypeTypeId?(card: RenderCard): number | undefined;`,
);

// 5: call site passes the card
edit(
  F,
  `        const categories = this.ruleSetCategories(this.rightPartCodenameForRule());`,
  `        const categories = this.ruleSetCategories(this.rightPartCodenameForRule(), this.card);`,
);

// 6: ruleSetCategories rework + helpers
edit(
  F,
  `  private ruleSetCategories(settingCodename: string | undefined): string[] {
    if (settingCodename === undefined) return [];
    const result = ["all"];
    if (FIELD_SETTINGS.has(settingCodename)) result.push("field");
    if (RECENT_SETTINGS.has(settingCodename)) result.push("recent");
    if (COMMON_SETTINGS.has(settingCodename)) result.push("common");
    return result;
  }`,
  `  private ruleSetCategories(settingCodename: string | undefined, ruleCard: RenderCard): string[] {
    if (settingCodename === undefined) return [];
    const result = ["all"];
    if (FIELD_SETTINGS.has(settingCodename)) result.push("field");
    if (this.recentCategoryApplies(settingCodename, ruleCard)) result.push("recent");
    if (COMMON_SETTINGS.has(settingCodename)) result.push("common");
    return result;
  }

  /** setting_categories.rb:64-67 recent_settings:
   *  \`Card[:recent_settings].item_cards.map(&:codename).compact\` — the
   *  *recent settings POINTER's items (DECK DATA, not code). The item
   *  cards' codenames equal the underscored item names for every canonical
   *  setting name (all 21 raw-corpus row-23808 items: "*content options" ->
   *  content_options, "*follow fields" -> follow_fields), so the derivation
   *  reads the card's db_content lines directly; an absent card yields the
   *  empty membership (Ruby's nil fetch carries no items), never an error. */
  private recentSettingCodenames(): Set<string> {
    const recentCard = this.engine.fetchRenderCard("*recent settings");
    const content =
      recentCard === undefined || recentCard.unknown === true
        ? undefined
        : recentCard.record.dbContent;
    const items = new Set<string>();
    for (const line of (content ?? "").split("\\n")) {
      const item = line.trim();
      if (item === "") continue;
      items.add(item.replace(/^\\*/, "").toLowerCase().replace(/ +/g, "_"));
    }
    return items;
  }

  /** setting_categories.rb:9-15 categories' recent arm, in full:
   *  recent = (recent-card items) ∩ (REGISTERED settings — set/type/set.rb
   *  :73-85 visible_setting_codenames is Card::Setting.groups, the
   *  setting_opts registrations) ∩ (unrestricted ∨ the set prototype's type
   *  codename ∈ the registration's restricted_to_type — setting.rb:74-77
   *  applies_to_cardtype). Oracle-derived verification (845+ rule-item bars
   *  swept from the page-lane oracle bytes, 2026-09-30):
   *  *table of contents / *comment are registered NOWHERE in the gems (no
   *  set/self/*.rb) and pin \`_category-all\` alone (Number page: 0 YES /
   *  4 NO); content_options / content_option_view are restricted to
   *  %i[list pointer session] (card-mod-list set/self/content_options.rb:2,
   *  content_option_view.rb:2 — the only restricted registrations), so they
   *  carry recent exactly on list-family-prototype sets (*style+*right YES —
   *  its *default rule card is List-typed; *all NO — BasicCs-typed). */
  private recentCategoryApplies(settingCodename: string, ruleCard: RenderCard): boolean {
    if (!this.recentSettingCodenames().has(settingCodename)) return false;
    if (!REGISTERED_SETTING_CODENAMES.has(settingCodename)) return false;
    const restrictedTo = RESTRICTED_TO_TYPE.get(settingCodename);
    if (restrictedTo === undefined) return true;
    const prototypeTypeId = this.engine.ruleSetPrototypeTypeId?.(ruleCard);
    if (prototypeTypeId === undefined) return false;
    const prototypeCodename = this.engine.peekCodenameById?.(prototypeTypeId);
    return prototypeCodename !== undefined && restrictedTo.has(prototypeCodename);
  }`,
);

// 7: lane note appended to the ruleSetCategories doc block
edit(
  F,
  `   *  their settings (captcha et al.) ARE recent members, so those pins
   *  keep their bytes under the membership form. */
  private ruleSetCategories(`,
  `   *  their settings (captcha et al.) ARE recent members, so those pins
   *  keep their bytes under the membership form.
   *
   *  Lane p22-rules-table correction (2026-09-30): recent is now the FULL
   *  Ruby arm — items ∩ registered ∩ restriction (recentCategoryApplies) —
   *  read from the deck's *recent settings card; the static RECENT_SETTINGS
   *  const is retired. CLUSTER 35's pins keep their bytes (captcha et al.
   *  are recent members under the full arm); the R16 membership correction
   *  stands (autoname/on_* are not items). */
  private ruleSetCategories(`,
);

// 8: constants — retire RECENT_SETTINGS, add the registry + restriction map
edit(
  F,
  `/** R16: recent_settings — card-mod-rules setting_categories.rb:43-45
 *  \`Card[:recent_settings].item_cards\` ∩ visible settings. The *recent
 *  settings card is corpus row 23808 (content cited on ruleSetCategories);
 *  its items minus the two non-corpus names are the membership here.
 *  Missing from this list (and therefore category-less beyond \`all\`):
 *  autoname, on_create, on_update, on_delete. */
const RECENT_SETTINGS: ReadonlySet<string> = new Set([
  "read", "structure", "script", "content_options", "input_type", "default",
  "layout", "help", "thanks", "update", "guide", "head", "follow", "style",
  "content_option_view", "create", "follow_fields", "delete", "captcha",
  "table_of_contents", "comment",
]);`,
  `/** lane p22-rules-table: set/type/set.rb:73-85 visible_setting_codenames —
 *  the setting_opts REGISTRY (Card::Setting.groups). Gem-complete census
 *  across the installed gems (grep, 2026-09-30): exactly these 23 codenames
 *  register. *table of contents and *comment have NO set/self/*.rb in any
 *  gem — never in the groups — so the recent intersection drops them (the
 *  R16-era static RECENT_SETTINGS const carried both and is retired; the
 *  corpus-derived membership lives in the deck's *recent settings card,
 *  read live by recentSettingCodenames). */
export const REGISTERED_SETTING_CODENAMES: ReadonlySet<string> = new Set([
  "autoname",                                            // card-1.110.0 mod/core
  "create", "delete", "read", "update",                  // card-mod-permissions
  "default", "structure",                                // card-mod-content
  "input_type",                                          // card-mod-edit
  "follow", "follow_fields",                             // card-mod-follow
  "guide", "help",                                       // card-mod-help
  "on_create", "on_delete", "on_update", "thanks",       // card-mod-integrate
  "head", "layout",                                      // card-mod-layout
  "content_options", "content_option_view",              // card-mod-list
  "captcha",                                             // card-mod-recaptcha
  "script",                                              // card-mod-script
  "style",                                               // card-mod-style
]);

/** card-mod-list set/self/content_options.rb:2 + content_option_view.rb:2 —
 *  restricted_to_type: %i[list pointer session]. The ONLY restricted
 *  registrations in the installed gems (setting.rb:74-77
 *  applies_to_cardtype: an unrestricted registration applies to every
 *  cardtype). Compared against the set prototype's type codename
 *  (RenderEngineLike#ruleSetPrototypeTypeId). */
const RESTRICTED_TO_TYPE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["content_options", new Set(["list", "pointer", "session"])],
  ["content_option_view", new Set(["list", "pointer", "session"])],
]);`,
);

console.log("all remaining edits applied");
