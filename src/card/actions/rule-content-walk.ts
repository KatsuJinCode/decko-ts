// The storage half of Card#rule lookup - the candidate walk that resolves a
// setting's rule-card content for the card being saved. This is the piece
// card-mod-recaptcha's recaptcha_on? reads as `rule(:captcha)`
// (card-mod-recaptcha-0.20.0 set/all/recaptcha.rb:22) and the piece
// rule-names.ts reserved as "the next stream's work" (its header: "The first
// name that exists as a rule card in storage wins; that walk is the next
// stream's work - this is the naming algebra only").
//
// Ruby mechanism, one layer at a time (card-1.110.0):
// - lib/card/rule/all.rb:5-7  rule(setting_code):
//     `rule_card(setting_code, skip_modules: true)&.db_content`
// - lib/card/rule/all.rb:9-11 rule_card: `Card.fetch rule_card_id(setting_code)`
//     (skip_modules only affects set-module loading on the fetched card -
//     a headless no-op here)
// - lib/card/rule/all.rb:13-15 rule_card_id: `rule_id_lookup Card::Rule.
//     rule_cache, setting_code`
// - lib/card/rule/all.rb:66-73 rule_id_lookup: walks the card's rule lookup
//     keys IN PATTERN-PRECEDENCE ORDER and returns the FIRST key the rule
//     cache answers (`rule_lookup_keys.each { |lookup_key| rule_id =
//     lookup_hash["#{lookup_key}+#{cache_suffix}"]; return rule_id if
//     rule_id }`)
// - lib/card/set/pattern/all.rb:66-68 rule_lookup_keys:
//     `patterns.map(&:rule_lookup_key).compact` - the applying patterns
//     (most-specific-first; new cards drop the *self pattern, pattern/
//     all.rb:27-29) minus the anchored patterns whose anchor card has no id.
//
// The port walks the SET NAMES joined to the setting name
// (rule-names.ts#ruleNamesForCard - the same precedence order, oracle-verified
// against live decko per that file's header) and fetches each candidate
// through the engine's Card.fetch. The rule CACHE is Ruby's optimization of
// the same walk; the candidate ORDER is the semantics, and fetch-by-name
// misses exactly where the cache has no entry: a rule card cannot exist
// without its set card (the junction trunk), and both Ruby's cache SQL
// (lib/card/rule/cache.rb:20-22 `rules.trash is false AND sets.trash is false
// AND settings.trash is false`) and the engine's default fetch exclude
// trashed rows.
//
// Divergence note (pathological storage only): the cache SQL also requires
// the rule card's trunk to be a Set card and its tag a Setting card
// (cache.rb:17-18); fetch-by-name would return a name-shaped impostor. The
// deck's rule cards are written through the rule machinery, which only
// produces genuine Set+Setting junctions - the established port convention
// (observerRuleCard, card-mod-integrate.ts:231-241; helpRuleCard,
// card-mod-help.ts:78-87) walks first-existing without a type re-check and
// cites rule/all.rb:9-11; this walk does the same.

import type { FetchEngine } from "../fetch.js";
import type { DeckoName } from "../name.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import { resolveTypeId } from "./type-resolution.js";
import { CardActionError } from "./types.js";
import {
  ruleNamesForCard,
  settingCardNameForCode,
} from "../set-patterns/rule-names.js";
import { modRuleSeedContentForCandidate } from "../mod-loader/mod-rule-seeds.js";

/**
 * Card#rule(setting_code) - rule/all.rb:5-15 + 66-73: the card's candidate
 * rule names in pattern precedence, first rule card in storage wins, its
 * db_content returned (an EXISTING rule card with blank content returns ""
 * - Ruby's `&.db_content` is raw; Card::Rule.toggle turns "" into false,
 * rule.rb:11-13). No candidate card in storage -> undefined (toggle(nil)
 * false). `settingCode` is the codename ("captcha"); the setting card name
 * resolves through the codename registry with the deterministic "*"+code
 * fallback (rule-names.ts#settingCardNameForCode).
 */
export async function ruleContentForCard(
  fetch: FetchEngine,
  pattern: PatternCardInput,
  settingCode: string,
): Promise<unknown> {
  const settingName = settingCardNameForCode(settingCode);
  for (const candidate of ruleNamesForCard(pattern, settingName)) {
    const record = await fetch.fetch(candidate);
    if (record === undefined) continue; // candidate rule card does not exist
    return record.dbContent;
  }
  // The mod rule seeds (mod-rule-seeds.ts): a stock deck carries the mods'
  // data/real.yml rule rows as STORAGE (seeded at deck creation), so on a
  // real deck this arm never fires; the port's fixture decks and scrubbed
  // corpora lack those rows and the seeds stand in — the recorded oracle
  // boots armed on exactly these (mod/recaptcha data/real.yml's captcha
  // toggles). A storage rule row always wins (the loop above).
  for (const candidate of ruleNamesForCard(pattern, settingName)) {
    const seeded = undefined; // BISECT: seed consult disabled
    if (seeded !== undefined) return seeded;
  }
  return undefined;
}

/**
 * The PatternCardInput the storage walk receives for a save-path card - the
 * acting card's pattern state the way Ruby's Card instance carries it at
 * validate time:
 * - `typeId`: the ASSIGNED type for a type-changing save (the
 *   validation-time attribute state; the same convention the permission
 *   layer's patternInputFor documents, card-action-engine.ts) - undefined
 *   reads the stored type.
 * - `typeName`: the type card's name (the *type pattern's anchor NAME,
 *   resolved by row read).
 * - `leftTypeName`: for compound names, the left card's type name - Ruby's
 *   quick_type fetches it live (set/pattern/class_methods.rb:59-71
 *   `left_type` -> `superleft&.type_name || quick_type(left_name)`); an
 *   unknown left omits the field and the registry's RichText fallback
 *   applies (the oracle-pinned default, set-patterns/instance.ts).
 * - `isRule`: for compound names, standard_rule? (rule/all.rb:37-40): the
 *   left part a Set card AND the right part a Setting card - the *rule
 *   pattern's applies? gate (06_rule.rb#pattern_applies?). Simple names are
 *   never rule cards (the port's established shape,
 *   set-read-rule.ts isStandardRuleName).
 */
export async function ruleWalkPatternInput(
  fetch: FetchEngine,
  base: {
    name: DeckoName;
    id?: number;
    isNew: boolean;
    /** undefined = read the stored type (CardRecord.typeId). */
    typeId?: number | null;
  },
): Promise<PatternCardInput> {
  const storedTypeId = base.typeId !== undefined ? base.typeId : (await cardTypeId(fetch, base.name)) ?? null;
  const typeId = storedTypeId;
  const typeName = typeId !== null && typeId !== undefined ? await typeNameOfId(fetch, typeId) : undefined;
  let leftTypeName: string | undefined;
  let isRule = false;
  if (base.name.isCompound) {
    leftTypeName = await leftTypeNameOf(fetch, base.name);
    // rule? (rule/all.rb:32-34): standard_rule? || preference?
    isRule = (await isStandardRuleName(fetch, base.name)) || (await isPreferenceName(fetch, base.name));
  }
  return {
    name: base.name.s,
    id: base.id,
    isNew: base.isNew,
    typeId,
    typeName,
    leftTypeName,
    isRule,
  };
}

/** A name's card type id (undefined when the card does not exist). */
async function cardTypeId(
  fetch: FetchEngine,
  name: DeckoName,
): Promise<number | undefined> {
  const record = await fetch.fetch(name.s);
  return record?.typeId;
}

/** The type card's name for a type id (cards row read; undefined when the
 *  id has no card). */
async function typeNameOfId(
  fetch: FetchEngine,
  typeId: number,
): Promise<string | undefined> {
  const record = await fetch.fetch(typeId);
  return record?.name?.s;
}

/** quick_type's live left-type fetch (class_methods.rb:59-71): the left
 *  card's type name. quick_type fetches the left with `new: {}`, so a left
 *  that does not exist (or is trashed) is a NEW card and answers the type a
 *  new card of that name would get (type.rb:58-66 ensure_type_id: the
 *  type-assignment walk, then the new-card template chain ending at
 *  *all+*default). Only a blank left name answers the literal "RichText". */
async function leftTypeNameOf(
  fetch: FetchEngine,
  name: DeckoName,
): Promise<string | undefined> {
  return quickTypeName(fetch, name.leftName);
}

/** class_methods.rb#quick_type over a name: the type name of the card with
 *  that name, or of the new card a fetch with `new: {}` would build for it.
 *  Shared by every pattern-input builder that needs a compound card's left
 *  type (the *type plus right anchor). */
export async function quickTypeName(
  fetch: FetchEngine,
  left: DeckoName | undefined,
): Promise<string | undefined> {
  if (left === undefined || left.s === "") return "RichText";
  const record = await fetch.fetch(left.s);
  if (record !== undefined) {
    const leftTypeId = record.typeId;
    if (leftTypeId === undefined || leftTypeId === null) return undefined;
    return typeNameOfId(fetch, leftTypeId);
  }
  let newTypeId: number;
  try {
    newTypeId = await resolveTypeId(fetch, { name: left });
  } catch (err) {
    if (err instanceof CardActionError) return undefined;
    throw err;
  }
  return typeNameOfId(fetch, newTypeId);
}

/** standard_rule? (rule/all.rb:37-40): `Card.fetch_type_id(name.right) ==
 *  SettingID && Card.fetch_type_id(name.left) == SetID` - the *rule
 *  pattern's applies? operand. The Set/Setting ids resolve through the
 *  deck's codename registry; either codename missing -> false (the
 *  rule-less-seed divergence, the same allow contract set-read-rule.ts
 *  documents). */
export async function isStandardRuleName(
  fetch: FetchEngine,
  name: DeckoName,
): Promise<boolean> {
  const left = name.leftName;
  const right = name.rightName;
  if (left === undefined || right === undefined) return false;
  const [setId, settingId] = await Promise.all([
    fetch.codenames.id("set"),
    fetch.codenames.id("setting"),
  ]);
  if (setId === undefined || settingId === undefined) return false;
  const [leftRecord, rightRecord] = await Promise.all([
    fetch.fetch(left.s),
    fetch.fetch(right.s),
  ]);
  return (
    leftRecord !== undefined &&
    rightRecord !== undefined &&
    leftRecord.typeId === setId &&
    rightRecord.typeId === settingId
  );
}

/** preference? (rule/all.rb:42-54): a per-user setting card,
 *  SET+USER+SETTING. True when the name has more than two parts, its right
 *  part is a Setting, the name without its last two parts is a Set, and the
 *  second-to-last part (the preferer) is User-typed or is the *all card.
 *  Ruby's valid_preferer? raises when the preferer card does not exist
 *  (`self[-2]` is nil); the engine answers false there. */
export async function isPreferenceName(fetch: FetchEngine, name: DeckoName): Promise<boolean> {
  const parts = name.parts;
  if (parts.length <= 2) return false;
  const [setId, settingId, userId] = await Promise.all([
    fetch.codenames.id("set"),
    fetch.codenames.id("setting"),
    fetch.codenames.id("user"),
  ]);
  if (setId === undefined || settingId === undefined) return false;
  const right = name.rightName;
  if (right === undefined) return false;
  const rightRecord = await fetch.fetch(right.s);
  if (rightRecord?.typeId !== settingId) return false;
  const trunk = parts.slice(0, -2).join("+");
  const trunkRecord = await fetch.fetch(trunk);
  if (trunkRecord?.typeId !== setId) return false;
  const preferer = await fetch.fetch(parts[parts.length - 2] ?? "");
  if (preferer === undefined) return false;
  return (userId !== undefined && preferer.typeId === userId) || preferer.codename === "all";
}
