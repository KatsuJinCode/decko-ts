// Type resolution for the action layer — how a save turns `:type_id` /
// `:type_code` / `:type` args (or nothing) into cards.type_id.
//
// Ruby truth (card-1.110.0 mod/core/set/all/type.rb):
//   event :validate_type, :validate, changed: :type_id, on: :save do
//     errors.add :type, t(:core_error_no_such_type) unless type_name   # :24-30
//   end
//   def ensure_type_id lookup                                          # :58-66
//     new_type_id = type_id_from_code || type_id_from_template
//   ...
//   def type_id_from_code                                              # :68-76
//     return if simple?                                               # :69 — SIMPLE short-circuit
//     each_type_assigning_module_key do |module_key|
//       type_id = Card::Set::Type.assignment[module_key]&.card_id      # :72
//       return type_id if type_id
//     end
//     nil
//   end
//   def extract_type_id! args={}                                       # :87-96
//     when (type_id = args.delete(:type_id)&.to_i)  then (zero? ? nil : type_id)
//     when (type_code = args.delete(:type_code)&.to_sym) then type_id_from_codename
//     when (type_name = args.delete :type)          then type_id_from_cardname
//   end
//   def type_id_from_codename code   # :98-101 -> Card::Codename.id code
//   def type_id_from_cardname name   # :102-105 -> name.card_id (Lexicon)
//   def default_type_id              # :3-5     -> Card.fetch_type_id %i[all default]
//
// The full precedence on :create with no explicit type args is therefore
// (Card.new args -> handle_type -> ensure_type_id):
//   extract_type_id!  (nil when no type_id/type_code/type in args)
//   || type_id_from_code || type_id_from_template
//   || default_type_id at the FETCH level (Card.fetch_type_id %i[all default])
// validate_type (:24-30) raises when none of the above resolve. The walk
// here mirrors that chain in TS, with the type-assignment walk sitting
// between the explicit-arg check and the default. See
// src/card/set-patterns/set-type-assignment.ts for the registry port.

import { DeckoName, type Nameish } from "../name.js";
import type { FetchEngine } from "../fetch.js";
import { CardActionError, type TypeSpec } from "./types.js";
import { resolveAssignedTypeIdForCard } from "../set-patterns/set-type-assignment.js";
import { patternsForCard } from "../set-patterns/card-patterns.js";
import type { PatternCardInput } from "../set-patterns/types.js";

/** Resolve the cards.type_id for a create/update, or throw type-unknown.
 *  Precedence is extract_type_id!'s (type.rb:87-96): explicit typeId >
 *  typeCode > typeName. When none was given the type-assignment walk runs
 *  (type.rb:68-76 — same shape as ensure_type_id's type_id_from_code; the
 *  walk fires only for COMPOUND cards, exactly like Ruby's `simple?`
 *  guard). Finally, if neither an explicit arg nor an assignment hits,
 *  type_id_from_template (type.rb:76-78) resolves the card's new-card
 *  template through the FULL new_card_template port (templateTypeId below:
 *  the *structure branch first, dup_structure-typed per templating.rb:61-65,
 *  the *default rule as fallback) whose natural tail IS the global
 *  *all+*default rule card — Card.default_type_id (type.rb:3-5) is that
 *  most-general row, kept as the tail fetch. */
/** The type args a save actually keeps. Ruby's extract_type_id! runs while
 *  the card's attributes are assigned (Card.new / assign_attributes ->
 *  normalize_type_attributes, type.rb:82-85): an unknown :type / :type_code
 *  adds "<val> is not a known type." (type_id_or_error, :104-110) and
 *  assigns no type_id. ActiveRecord's valid? then CLEARS errors before the
 *  validation stages run, so that error never reaches the user: the create
 *  proceeds with the default type and an update keeps the current one
 *  (measured against the oracle: a create with type "No Such Type"
 *  answers 303 and stores a RichText card). An explicit unknown type_id is
 *  different: it is assigned, and validate_type rejects it at :validate. */
export async function knownTypeSpec<T extends TypeSpec>(fetcher: FetchEngine, spec: T): Promise<T> {
  if (spec.typeId !== undefined && spec.typeId !== 0) return spec;
  if (spec.typeCode !== undefined && (await fetcher.codenames.id(spec.typeCode)) === undefined) {
    const { typeCode: _dropped, ...rest } = spec;
    return knownTypeSpec(fetcher, rest as T);
  }
  if (spec.typeCode === undefined && spec.typeName !== undefined) {
    const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName as Nameish).key);
    if (id === undefined) {
      const { typeName: _dropped, ...rest } = spec;
      return rest as T;
    }
  }
  return spec;
}

export async function resolveTypeId(
  fetcher: FetchEngine,
  spec: TypeSpec & { name?: Nameish },
): Promise<number> {
  if (spec.typeId !== undefined && spec.typeId !== 0) {
    await assertTypeCardExists(fetcher, spec.typeId);
    return spec.typeId;
  }
  if (spec.typeCode !== undefined) {
    // type_id_from_codename via type_id_or_error (type.rb:98-101):
    // a missing codename adds "<val> is not a known type."
    const id = await fetcher.codenames.id(spec.typeCode);
    if (id === undefined) {
      throw new CardActionError("type-unknown", `${spec.typeCode} is not a known type.`);
    }
    await assertTypeCardExists(fetcher, id);
    return id;
  }
  if (spec.typeName !== undefined) {
    // type_id_from_cardname via Card#card_id (the Lexicon lookup).
    const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName as Nameish).key);
    if (id === undefined) {
      throw new CardActionError("type-unknown", `${String(spec.typeName)} is not a known type.`);
    }
    await assertTypeCardExists(fetcher, id);
    return id;
  }
  // type_id_from_code (type.rb:68-76) — the type-assignment walk. Fires
  // only when a name is present and the card is COMPOUND (the simple?
  // guard, type.rb:69, sits in findAssignedTypeName). The walk returns
  // undefined for unresolvable cases (no registration, no anchor
  // codenames), exactly like Ruby's `Card::Set::Type.assignment[...]`
  // returning nil.
  if (spec.name !== undefined) {
    const assignedId = await resolveAssignedTypeIdForCard(fetcher, {
      name: spec.name,
      isNew: true, // ensureSides creates a NEW card; ensure_type_id is a new-arg flow
    });
    if (assignedId !== undefined) return assignedId;
    // type_id_from_template (type.rb:76-78 `name && template&.type_id`):
    // the new-card template is new_card_template (card-mod-content
    // set/all/templating.rb:52-59), ported in full by templateTypeId below
    // — the *default rule (templating.rb:53) AND the *structure branch
    // (templating.rb:54 via dup_structure :61-65), so a name-scoped
    // *default rule ("*all+*right+*default") and a governing *structure
    // rule (the corpus's dominant class is *right-anchored, e.g.
    // "*right+*right+*structure" on every <X>+*right rule slot) both
    // resolve HERE, not just the global rule the old hard-coded fetch saw.
    const templateId = await templateTypeId(fetcher, spec.name);
    if (templateId !== undefined) return templateId;
  }
  return defaultTypeId(fetcher);
}

/** type_id_from_template for a NEW card (type.rb:76-78 `name &&
 *  template&.type_id`): the template is new_card_template
 *  (card-mod-content-0.20.0 set/all/templating.rb:52-59), ported here in
 *  full:
 *
 *    default = rule_card :default, skip_modules: true          # :53
 *    return default unless (structure = dup_structure default&.type_id)
 *    structure                                                 # :54-58
 *
 *  - default leg (:53): rule/all.rb:9-15 rule_card_id -> rule_id_lookup
 *    (:66-73) walking the card's rule lookup candidates
 *    (pattern/all.rb:66-68 `patterns.map(&:rule_lookup_key)`.compact) in
 *    pattern precedence, first EXISTING rule card wins. The port walks the
 *    same candidates by SET NAME (Base#to_s — name-level algebra,
 *    cold-safe) through the ASYNC driver-backed fetch, so the walk is live
 *    on a cold engine exactly like Ruby's db-backed cache lookup; a
 *    candidate set whose anchor card does not exist yields no rule card
 *    from the fetch, matching the nil-lookup-key compaction
 *    (instance.ts#ruleLookupKey oracle). The anchorless *all candidate is
 *    intentionally NOT walked for the RETURN value: its rule card is
 *    exactly the defaultTypeId tail (Card.default_type_id, type.rb:3-5 —
 *    the walk's most general row), reached through the caller's tail fetch.
 *  - Rule-cache candidate filters (card-1.110.0 lib/card/rule/cache.rb:14-22)
 *    — a row enters Card::Rule::Cache only when the rule's LEFT part card
 *    is Set-typed (:17 `sets.type_id = #{SetID}`), its RIGHT part card is
 *    Setting-typed (:18 `settings.type_id = #{SettingID}`), and neither
 *    side is trashed (:20-22); SetID/SettingID are boot-time codename
 *    constants, so the port reads them through the codename registry. A
 *    live card merely SITTING at a "<set>+*default" name whose <set> part
 *    is not a Set (the decoy shape pinned in
 *    tests/card/actions/rule-cache-set-type-decoy-probes.test.ts) is NOT a
 *    rule candidate: lookup falls through to the next pattern and finally
 *    to the defaultTypeId tail. Each walk's Setting-side filter
 *    (cache.rb:18) is LOOP-INVARIANT — every candidate row's right part is
 *    that walk's constant setting card ("*default" / "*structure") — so the
 *    port checks each setting card's live+Setting-typedness ONCE, per leg,
 *    and skips a leg's walk outright when its gate is closed (no candidate
 *    row could be cached); the two gates are independent, and the caller's
 *    defaultTypeId tail keeps plain-fetching *all+*default (fetch_type_id
 *    bypasses the cache, type.rb:3-5 / fetch/card_class.rb:92-94), exactly
 *    like Ruby's rule_card-miss-then-default_type_id. The Set-side filter
 *    (cache.rb:17) is PER-CANDIDATE — the left part differs per pattern —
 *    and both walks carry it: a failed gate CONTINUES the walk to the next
 *    pattern (rule_id_lookup's hash-miss fall-through, rule/all.rb:66-73).
 *    The cache's follow-content clause (:19) is dead for these names, and
 *    the trash clauses (:20-22) ride the fetch's look_in_trash=false
 *    retrieval.
 *  - structure leg (:54 via :61-65 dup_structure): the new card is DUPed,
 *    the dup TYPED with the *default rule's type (`default&.type_id ||
 *    Card.default_type_id`, :63 — the *type / *type plus right candidates
 *    are type-dependent, so the template lookup must see the card AS TYPED
 *    BY THE DEFAULT RULE), and structure_rule_card (:44-48: `rule_card
 *    :structure, skip_modules: true`, NIL-ed when its db_content.strip ==
 *    "_self" — the walk does NOT continue past a _self hit) runs on the
 *    DUP. A resolved *structure rule IS the template (its type wins,
 *    type.rb:76-78); :53's *default rule is the fallback. The corpus
 *    exercises this branch: the raw deck (sha 6A44DFDC...) carries 139
 *    live *structure rule rows and 8,780 new-card names whose walks resolve
 *    one (census: tests/card/rules/structure-governance-census-probe.test.ts)
 *    — 2,164 of them with a structure type
 *    DIFFERENT from the default-leg answer. The structure walk applies the
 *    SAME rule-cache filters as the default leg: the loop-invariant :18
 *    gate on the *structure card and the per-candidate :17 Set-typed gate
 *    (zero corpus exposure — the census deck carries no decoy shape — a
 *    completeness/fidelity port exactly like the URI cardtype). Decoy
 *    probes in both directions live in
 *    tests/card/actions/structure-leg-rule-cache-decoy-probes.test.ts.
 *    assign_type_to? (:67-69)
 *    gates only a mid-walk retype to the same id ensure_type_id assigns
 *    next (type.rb:61-66), so it has no port-side observable and is not
 *    ported. */
async function templateTypeId(
  fetcher: FetchEngine,
  name: Nameish,
): Promise<number | undefined> {
  const parsed = DeckoName.parse(name);
  const setTypeId = await fetcher.codenames.id("set"); // cache.rb:17 SetID
  const settingTypeId = await fetcher.codenames.id("setting"); // cache.rb:18 SettingID
  // cache.rb:18 Setting-side filter — LOOP-INVARIANT per walk: every
  // candidate row's right part is that walk's constant setting card
  // ("*default" for the default leg, "*structure" for the structure leg),
  // so each card's live+Setting-typedness is checked ONCE, not per
  // candidate. The two gates are INDEPENDENT: rule/all.rb:66-73 looks up
  // "<key>+default" and "<key>+structure" in the SAME cache whose rows all
  // passed BOTH :17 and :18, so a *default card that is not Setting-typed
  // blinds only the default leg (the dup then rides Card.default_type_id,
  // templating.rb:63, and the structure leg still runs), and a *structure
  // card that is not Setting-typed kills only the structure walk. When a
  // leg's gate is closed that leg's walk is skipped outright — no candidate
  // row could be cached — while the caller's defaultTypeId tail keeps
  // plain-fetching *all+*default (fetch_type_id bypasses the cache,
  // type.rb:3-5 / fetch/card_class.rb:92-94), exactly like Ruby's
  // rule_card-miss-then-default_type_id. The cache's follow-content clause
  // (:19) is dead for these names, and the trash clauses (:20-22) ride the
  // fetch's look_in_trash=false retrieval.
  const defaultSettingCard = await fetcher.fetchWithOptions(
    [{ codename: "default" }],
    { skipModules: true },
  );
  const defaultSettingGateOpen =
    settingTypeId !== undefined &&
    defaultSettingCard !== undefined &&
    !defaultSettingCard.trash &&
    defaultSettingCard.typeId === settingTypeId;
  // The gate card is fetched by NAME — the exact card every
  // "<set>+*structure" rule row hangs its right part on (the cache JOINs
  // settings by right_id, cache.rb:16) and the same mark shape the walk's
  // rule fetches use. A name mark, unlike a codename mark (retrieve.ts
  // idFromMark's Codename.id! branch), yields undefined — not a throw —
  // for a deck with no card there; the gate then reads as closed, which is
  // the faithful answer: no *structure card, no structure rows.
  const structureSettingCard = await fetcher.fetchWithOptions(
    [DeckoName.parse("*structure")],
    { skipModules: true },
  );
  const structureSettingGateOpen =
    settingTypeId !== undefined &&
    structureSettingCard !== undefined &&
    !structureSettingCard.trash &&
    structureSettingCard.typeId === settingTypeId;
  const patternCard: PatternCardInput = {
    name,
    isNew: true, // ensure_type_id is a new-arg flow (initialize.rb:54)
    typeId: null,
    typeName: null,
    leftTypeName: null,
    isRule: false,
  };
  // templating.rb:53 — default = rule_card :default, skip_modules: true.
  // A closed :18 gate on the loop-invariant *default card skips the walk:
  // no candidate row could be cached, so defaultType stays undefined and
  // the dup below rides Card.default_type_id (:63).
  let defaultType: number | undefined;
  if (defaultSettingGateOpen) {
    for (const pattern of patternsForCard(patternCard)) {
      if (pattern.anchorless && pattern.patternCode === "all") continue; // defaultTypeId tail
      // cache.rb:15 JOIN rules.left_id = sets.id + :17/:21: the set card must
      // EXIST, live, and BE a Set — kills both the anchored decoy (a non-Set
      // card parked at the set name) and every anchorless non-all candidate
      // (whose "set card" is a Setting-typed pattern card).
      const setCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName)],
        { skipModules: true },
      );
      if (setCard === undefined || setCard.trash) continue;
      if (setTypeId === undefined || setCard.typeId !== setTypeId) continue;
      const ruleCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName), DeckoName.parse("*default")],
        { skipModules: true },
      );
      if (ruleCard !== undefined && ruleCard.typeId !== undefined) {
        defaultType = ruleCard.typeId;
        break;
      }
    }
  }
  // templating.rb:63 — dup_card.type_id = default&.type_id ||
  // Card.default_type_id (type.rb:3-5, the *all+*default row; fetched
  // nil-safe here because Ruby's dup tolerates a nil either way — and the
  // anchorless candidate was skipped above, so the tail row is NOT yet
  // among the walked candidates).
  let dupType = defaultType;
  if (dupType === undefined) {
    const globalDefault = await fetcher.fetchWithOptions(
      [{ codename: "all" }, { codename: "default" }],
      { skipModules: true },
    );
    dupType = globalDefault?.typeId;
  }
  // The dup keeps the new card's NAME, so its superleft context rides
  // along: leftTypeName = the left card's type name when the left exists
  // (nil otherwise — the *type plus right anchor falls to the quick_type
  // default, set-patterns/types.ts leftTypeName contract).
  let leftTypeName: Nameish | null = null;
  if (parsed.isCompound && parsed.leftName !== undefined) {
    const left = await fetcher.fetchByName(parsed.leftName.key, { skipModules: true });
    const leftTypeId = left?.typeId;
    if (leftTypeId !== undefined) {
      leftTypeName = (await fetcher.fetchById(leftTypeId, { skipModules: true }))?.name ?? null;
    }
  }
  const dupInput: PatternCardInput = {
    name,
    isNew: true, // the dup of a new card is new (dup_structure, :62)
    typeId: dupType ?? null,
    typeName:
      dupType !== undefined
        ? ((await fetcher.fetchById(dupType, { skipModules: true }))?.name ?? null)
        : null,
    leftTypeName,
    isRule: false,
  };
  // templating.rb:44-48 structure_rule_card on the DUP — rule_card
  // (:structure, skip_modules: true) over ALL candidates (no tail
  // equivalence exists for *structure: an anchorless *all+*structure row
  // governs like any other), first existing card decides, "_self" content
  // NILS it without continuing the walk.
  // A closed :18 gate on the loop-invariant *structure card skips the walk
  // entirely — no "<set>+*structure" row can be in the cache — and the
  // template falls to the default leg's answer (templating.rb:54
  // `return default unless (structure = ...)`).
  if (structureSettingGateOpen) {
    for (const pattern of patternsForCard(dupInput)) {
      // cache.rb:15 JOIN rules.left_id = sets.id + :17 — the SAME Set-typed
      // candidate gate the default leg carries: the set card must EXIST,
      // live, and BE a Set. Kills both the anchored decoy (a non-Set card
      // parked at the set name) and every anchorless non-all candidate
      // (whose "set card" is a Setting-typed pattern card). Decoy probes,
      // both directions:
      // tests/card/actions/structure-leg-rule-cache-decoy-probes.test.ts
      const setCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName)],
        { skipModules: true },
      );
      if (setCard === undefined || setCard.trash) continue;
      if (setTypeId === undefined || setCard.typeId !== setTypeId) continue;
      const ruleCard = await fetcher.fetchWithOptions(
        [DeckoName.parse(pattern.setName), DeckoName.parse("*structure")],
        { skipModules: true },
      );
      if (ruleCard === undefined) continue;
      if (ruleCard.dbContent !== undefined && ruleCard.dbContent.trim() === "_self") {
        // templating.rb:47 ternary nils the _self card WITHOUT continuing the
        // walk; dup_structure (:61-65) hands that nil back, and templating.rb:54
        // `return default unless (structure = ...)` makes the *default rule the
        // template — its type is the answer. Undefined-safe: when the default
        // leg also missed (or its :18 gate was closed) defaultType is
        // undefined, Ruby's template is nil, and this return sends the caller
        // to its defaultTypeId tail — the same id Ruby's nil-template fall
        // answers (S2/SD2 shapes). Pin: S7 (structure-template suite).
        return defaultType;
      }
      // type.rb:76-78 — template&.type_id: the STRUCTURE rule card's own
      // type (a NULL-content rule still supplies its type; only _self nils
      // the card).
      return ruleCard.typeId;
    }
  }
  // templating.rb:54 — `return default unless (structure = ...)`: no
  // structure resolved, the *default rule is the template.
  return defaultType;
}

/** Card.default_type_id (type.rb:3-5): `Card.fetch_type_id %i[all default]`
 *  — the type_id of the `*all+*default` rule card itself (seed truth:
 *  mod/core/data/fixtures/real/cards.yml cards_011 = id 11, left_id 7 =
 *  `*all`, right_id 8 = `*default`, type_id 2 = the basic cardtype).
 *  `fetch_type_id` is `fetch(*mark, skip_modules: true)&.type_id`
 *  (fetch/card_class.rb:92-94). */
export async function defaultTypeId(fetcher: FetchEngine): Promise<number> {
  const ruleCard = await fetcher.fetchWithOptions(
    [{ codename: "all" }, { codename: "default" }],
    { skipModules: true },
  );
  if (ruleCard === undefined || ruleCard.typeId === undefined) {
    // validate_type (type.rb:24-30): the default rule names no resolvable
    // type card -> "no such type".
    throw new CardActionError("type-unknown", "no such type (default type rule is missing)");
  }
  return ruleCard.typeId;
}

/** validate_type (type.rb:24-30): `errors.add :type, :no_such_type unless
 *  type_name` — type_name resolves the type CARD (type.rb:32-35
 *  `quick_fetch(type_id)&.name`), so the id must name a live card. */
export async function assertTypeCardExists(
  fetcher: FetchEngine,
  typeId: number,
): Promise<void> {
  const typeCard = await fetcher.fetchById(typeId, { skipModules: true });
  if (typeCard === undefined || typeCard.trash) {
    throw new CardActionError("type-unknown", "no such type");
  }
}
