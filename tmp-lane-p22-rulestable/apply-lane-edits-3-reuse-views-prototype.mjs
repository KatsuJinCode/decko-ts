// Lane p22-rulestable edit driver, part 3 — replace the hand-rolled prototype
// accessor with a thin delegation to views.ts's oracle-verified
// setPrototypeTypeCode port (the board's own restriction machinery, verified
// 2026-09-26 against expected-v2). Reuses the assignment-layer arms the
// hand-rolled version lacked.
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

// 1: replace the parseSetName import with the setPrototypeTypeCode import
edit(
  R,
  `import { parseSetName } from "./set-patterns/set-name.js";`,
  `import { setPrototypeTypeCode } from "./render/views.js";`,
);

// 2: replace the hand-rolled accessor body with the delegation
edit(
  R,
  `  ruleSetPrototypeTypeId(card: RenderCard): number | undefined {
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
  }`,
  `  ruleSetPrototypeTypeCode(card: RenderCard): string | undefined {
    if (!card.name.isCompound) return undefined;
    const parts = card.name.parts;
    if (parts.length < 2) return undefined;
    // The rule card's SET card (its trunk) — the closure composes junction
    // names from their side cards, so the trunk is warm wherever the rule
    // card is (composeAndCache's transitive-side passes).
    const setCard = this.fetchRenderCard(parts.slice(0, -1).join("+"));
    if (setCard === undefined) return undefined;
    return setPrototypeTypeCode(this, setCard);
  }`,
);

// 3: fix the accessor doc comment head (name + return type changed)
edit(
  R,
  `   * RenderEngineLike#ruleSetPrototypeTypeId — card-mod-rules set/type/set.rb
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
   */`,
  `   * RenderEngineLike#ruleSetPrototypeTypeCode — card-mod-rules set/type/set.rb
   * #prototype.type_id's CODENAME for a RULE card's set (the visible_settings
   * input the categories machinery filters the restricted settings by):
   * Card.fetch(subclass_for_set.prototype_args(anchor_name), new:).type_id.
   * Delegates to views.ts #setPrototypeTypeCode — the SAME oracle-verified
   * port the set-page board's restricted-setting filter runs (assignment
   * layer right::<setting> / type_plus_right::<type>::<right>, template
   * chain, SELF existing-anchor arm; grep-verified 2026-09-26 against
   * expected-v2) — so the board enumeration and the bar categories read ONE
   * prototype resolution, never two divergent ports. Undefined when the set
   * card is not warm or no arm resolves (the caller's restricted-setting
   * filter treats that as not-allowed, never allowed).
   */`,
);

// 4: format.ts — interface member rename + code semantics
edit(
  F,
  `  /** card-mod-rules set/type/set.rb #prototype.type_id for a RULE card's
   *  set — the visible_settings input the categories machinery filters the
   *  restricted settings (content_options / content_option_view) by. See
   *  RenderEngine#ruleSetPrototypeTypeId. Optional: engines without it
   *  answer the restricted-settings recent arm as not-allowed (never
   *  allowed). */
  ruleSetPrototypeTypeId?(card: RenderCard): number | undefined;`,
  `  /** card-mod-rules set/type/set.rb #prototype.type_id's codename for a
   *  RULE card's set — the visible_settings input the categories machinery
   *  filters the restricted settings (content_options / content_option_view)
   *  by. Delegates to the SAME oracle-verified port the set-page board's
   *  restricted-setting filter runs (views.ts setPrototypeTypeCode). See
   *  RenderEngine#ruleSetPrototypeTypeCode. Optional: engines without it
   *  answer the restricted-settings recent arm as not-allowed (never
   *  allowed). */
  ruleSetPrototypeTypeCode?(card: RenderCard): string | undefined;`,
);

// 5: format.ts — recentCategoryApplies consumes the codename directly
edit(
  F,
  `    const restrictedTo = RESTRICTED_TO_TYPE.get(settingCodename);
    if (restrictedTo === undefined) return true;
    const prototypeTypeId = this.engine.ruleSetPrototypeTypeId?.(ruleCard);
    if (prototypeTypeId === undefined) return false;
    const prototypeCodename = this.engine.peekCodenameById?.(prototypeTypeId);
    return prototypeCodename !== undefined && restrictedTo.has(prototypeCodename);`,
  `    const restrictedTo = RESTRICTED_TO_TYPE.get(settingCodename);
    if (restrictedTo === undefined) return true;
    const prototypeCode = this.engine.ruleSetPrototypeTypeCode?.(ruleCard);
    return prototypeCode !== undefined && restrictedTo.has(prototypeCode);`,
);

// 6: format.ts — RESTRICTED_TO_TYPE doc points at the views.ts twin
edit(
  F,
  `/** card-mod-list set/self/content_options.rb:2 + content_option_view.rb:2 —
 *  restricted_to_type: %i[list pointer session]. The ONLY restricted
 *  registrations in the installed gems (setting.rb:74-77
 *  applies_to_cardtype: an unrestricted registration applies to every
 *  cardtype). Compared against the set prototype's type codename
 *  (RenderEngineLike#ruleSetPrototypeTypeId). */`,
  `/** card-mod-list set/self/content_options.rb:2 + content_option_view.rb:2 —
 *  restricted_to_type: %i[list pointer session]. The ONLY restricted
 *  registrations in the installed gems (setting.rb:74-77
 *  applies_to_cardtype: an unrestricted registration applies to every
 *  cardtype) — the same census as views.ts SETTING_RESTRICTED_TO_TYPE (the
 *  board filter's copy; a format->views import would close a value cycle,
 *  so the two-entry table lives here too). Compared against the set
 *  prototype's type codename (RenderEngineLike#ruleSetPrototypeTypeCode). */`,
);

console.log("part-3 edits applied");
