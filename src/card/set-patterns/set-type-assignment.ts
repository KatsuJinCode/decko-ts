// The set-type assignment registry — the TypeScript port of
// card-1.110.0 lib/card/set/type.rb (Card::Set::Type.assignment, a
// cattr_accessor Hash) plus the type_id_from_code walk in
// mod/core/set/all/type.rb.
//
// Ruby trail (every line cites its source):
//
// 1. lib/card/set/type.rb:5-6 — class Type < Pattern::Base;
//    cattr_accessor :assignment; self.assignment = {}.
//    The registry stores "module key" -> "type card name" (the codename or
//    name string Ruby's assign_type argument accepted).
//
// 2. lib/card/set/advanced_api.rb:5-8 — AdvancedApi#assign_type(type,
//    module_key=nil): module_key ||= shortname; Type.assignment[module_key]
//    = type. This is the registration primitive every mod-supplied
//    `assign_type :foo` calls (e.g. mod/core/set/right/autoname.rb:1
//    `assign_type :phrase` -> assignment["Right::Autoname"] = "phrase").
//
// 3. lib/card/set/trait.rb:54-58 — #assign_trait_type also calls
//    assign_type for `card_accessor :field, type: ...` declarations, with
//    module_key = [:right, trait] for `*all`-set traits, or
//    [:type_plus_right, set_name_parts[3], trait] for type-set traits.
//
// 4. mod/core/set/all/type.rb:68-76 — type_id_from_code walks
//    each_type_assigning_module_key and returns
//    `Card::Set::Type.assignment[module_key]&.card_id` for the first hit.
//    SIMPLE cards short-circuit on `return if simple?` (type.rb:69), so
//    only compound cards consult the walk.
//
// 5. mod/core/set/all/type.rb:58-66 — ensure_type_id prefers
//    `type_id_from_code || type_id_from_template` over the column. Both
//    can return nil for a freshly constructed compound card whose matching
//    pattern has no registration; type_id_from_template also returns nil
//    for a card without a template. The caller falls back to
//    `Card.default_type_id` (type.rb:3-5, *all+*default rule card's type).
//
// The TypeScript port keeps the same shape (a process-level Map of module
// key -> type card name, plus a walking resolver), because the call sites
// that consume it (`resolveTypeId` in card-action-engine's flow) match the
// Ruby sequence exactly: first explicit type_id/type_code/type_name args,
// then the assignment walk, then the default. The walk is dead for SIMPLE
// names — short-circuit, same as `return if simple?`.

import { DeckoName, type Nameish } from "../name.js";
import type { FetchEngine } from "../fetch.js";
import { patternsForCard, typeAssigningModuleKeys } from "./card-patterns.js";
import { moduleKeyFromAnchorCodenames } from "./instance.js";
import type { PatternCardInput } from "./types.js";

/** A registration entry — the module key the pattern walk emits and the
 *  type card name (or codename) the registration maps it to. Mirrors
 *  `Card::Set::Type.assignment[module_key] = type` (type.rb:5-6,
 *  advanced_api.rb:5-8). */
export interface SetTypeAssignment {
  readonly moduleKey: string;
  readonly typeName: Nameish;
}

/** The process-level registry — Set::Type.assignment (lib/card/set/type.rb:5-6).
 *  Tests and the mod loader populate this; the engine's resolveTypeId reads it. */
const ASSIGNMENTS = new Map<string, Nameish>();

/** Reset the registry — for tests (each test gets a fresh assignment set) and
 *  for hot reload (mod loader streams clear before re-registering). Ruby has
 *  no public resetter — assignment is a cattr_accessor hash mutated in place
 *  at mod-load time. */
export function resetSetTypeAssignments(): void {
  ASSIGNMENTS.clear();
}

/** lib/card/set/advanced_api.rb#assign_type — the registration primitive
 *  every mod's `assign_type :foo` calls. Module key is camel-cased by Ruby
 *  (NormalizeConst); the caller passes the already-camel-cased key. */
export function registerSetTypeAssignment(
  moduleKey: string,
  typeName: Nameish,
): void {
  ASSIGNMENTS.set(moduleKey, typeName);
}

/** The assignment a single module key maps to, or undefined. */
export function getSetTypeAssignment(moduleKey: string): Nameish | undefined {
  return ASSIGNMENTS.get(moduleKey);
}

/** The pattern walk input (PatternCardInput) the typeAssigningModuleKeys
 *  caller already accepts — typeId/typeName/isNew/isRule — plus the bare
 *  `name`. The walk itself reads the same fields. */
export interface AssignedTypeCardInput {
  readonly name: Nameish;
  readonly isNew?: boolean;
  /** *type pattern's anchor — type_id (type.rb:27-29). Optional because the
   *  type walk only fires for COMPOUND cards (simple? short-circuit). */
  readonly typeId?: number | null;
  /** The card's own TYPE NAME — needed by *type plus right's anchor_name
   *  (08_type_plus_right.rb:30-32 left_type). Optional because a new card
   *  with no type set is the case Ruby handles (type.rb:18-22 default
   *  "RichText" or whatever quick_type returns). */
  readonly typeName?: Nameish | null;
  /** *type plus right reads the left card's TYPE NAME (08_type_plus_right.rb
   *  `card.superleft&.type_name`). Optional because a new card has no
   *  superleft. */
  readonly leftTypeName?: Nameish | null;
  /** standard_rule? input — for the *rule pattern's pattern_applies?
   *  (06_rule.rb:15-17). Compound-only and orthogonal to type assignment
 *  walks; pass when known. */
  readonly isRule?: boolean;
}

/** The result of the type-assignment walk: a type name (string form) the
 *  resolver found, or undefined. Callers convert to a type_id via the
 *  fetch's codename/lexicon path (resolveAssignedTypeId below). */
export type AssignedTypeName = string | undefined;

/**
 * type_id_from_code (mod/core/set/all/type.rb:68-76): for a COMPOUND card,
 * iterate the card's assigns_type patterns (each_type_assigning_module_key)
 * in pattern-precedence order and return the first assignment that hits.
 *
 * Simple cards short-circuit (type.rb:69 `return if simple?`) — same here:
 * an isCompound=false input walks zero module keys.
 *
 * Module keys that anchor on codenames the card's anchor parts lack are
 * skipped silently (PatternInstance#module_key returns null when any anchor
 * codename is missing; typeAssigningModuleKeys already filters those out).
 */
export function findAssignedTypeName(
  card: AssignedTypeCardInput,
): AssignedTypeName {
  const parsed = DeckoName.parse(card.name);
  if (!parsed.isCompound) return undefined; // type.rb:69 simple? short-circuit
  for (const moduleKey of typeAssigningModuleKeys(patternInputFor(card))) {
    const typeName = ASSIGNMENTS.get(moduleKey);
    if (typeName !== undefined) {
      return DeckoName.parse(typeName).s;
    }
  }
  return undefined;
}

/** The PatternCardInput the pattern walk builds from an AssignedTypeCardInput
 *  (shared by the sync walk above, the driver-backed walk below, and the
 *  read-side lister). */
function patternInputFor(card: AssignedTypeCardInput): PatternCardInput {
  return {
    name: card.name,
    isNew: card.isNew,
    typeId: card.typeId ?? null,
    typeName: card.typeName ?? null,
    leftTypeName: card.leftTypeName ?? null,
    isRule: card.isRule ?? false,
  };
}

/**
 * Driver-backed anchor_codenames (pattern/base.rb:40-44
 * `anchor_parts.map { |part| part.cardname&.codename || break }`): each
 * anchor part resolves Card::Name#card_id through the ASYNC Lexicon
 * registry and Card::Codename[id] (Integer branch, codename.ts:59-62)
 * through the ASYNC codehash — the db-backed data Ruby answers at Card.new
 * time regardless of cache warmth (base.rb:17-19 find_anchor_id falls back
 * to @anchor_name.card_id, the Lexicon). The sync DeckoName#cardId /
 * #codename peeks (name.ts) answer warm cache entries only — that peek
 * chain is what died on a cold engine. First missing codename breaks the
 * map all-or-nothing (`|| break`), undefined here.
 */
async function anchorCodenameDriverBacked(
  fetcher: FetchEngine,
  part: DeckoName,
): Promise<string | undefined> {
  const id = await fetcher.lexicon.id(part.key);
  if (id === undefined) return undefined;
  return fetcher.codenames.nameForId(id);
}

/**
 * type_id_from_code's walk, driver-backed and cold-safe:
 * each_type_assigning_module_key (pattern/all.rb:74-81) over the applying
 * assigns_type patterns, each module key built from the db-backed anchor
 * codenames via moduleKeyFromAnchorCodenames — the exact join
 * PatternInstance#moduleKey performs. The SYNC findAssignedTypeName above
 * is kept for its sync consumers (the render-side new-card typing,
 * render.ts); the WRITE path's resolution goes through here so a cold
 * engine resolves assignments exactly like Ruby — which has no cold state
 * on this axis (mod/core/set/all/initialize.rb:54 handle_type ->
 * ensure_type_id runs the db-backed walk for every new card).
 */
async function findAssignedTypeNameDriverBacked(
  fetcher: FetchEngine,
  card: AssignedTypeCardInput,
): Promise<AssignedTypeName> {
  const parsed = DeckoName.parse(card.name);
  if (!parsed.isCompound) return undefined; // type.rb:69 simple? short-circuit
  for (const pattern of patternsForCard(patternInputFor(card))) {
    if (!pattern.assignsType) continue;
    const codes: string[] = [];
    let broke = false;
    for (const part of pattern.anchorParts) {
      const code = await anchorCodenameDriverBacked(fetcher, part);
      if (code === undefined) {
        broke = true; // base.rb:41 `|| break` - all-or-nothing
        break;
      }
      codes.push(code);
    }
    if (broke) continue;
    const moduleKey = moduleKeyFromAnchorCodenames(pattern.spec, codes);
    const typeName = ASSIGNMENTS.get(moduleKey);
    if (typeName !== undefined) return DeckoName.parse(typeName).s;
  }
  return undefined;
}

/** Resolved id from a found type name — looks up the type CARD's id via
 *  the codename registry (when the assignment was registered with a code)
 *  or the lexicon (when registered with a name). Returns undefined when
 *  the type card doesn't exist in storage — Ruby's `assignment[...]&.card_id`
 *  also returns nil in that case (type.rb:72). */
export async function resolveAssignedTypeId(
  fetcher: FetchEngine,
  typeName: Nameish,
): Promise<number | undefined> {
  const parsed = DeckoName.parse(typeName);
  // Codename path — assignment registered with a short code (most mods).
  const code = parsed.s;
  const byCode = await fetcher.codenames.id(code);
  if (byCode !== undefined) return byCode;
  // Name path — assignment registered with a full card name.
  const byName = await fetcher.lexicon.id(parsed);
  return byName;
}

/** The composite walk + id resolution: type_id_from_code and the
 *  card_id step (type.rb:72 `&.card_id`). Returns undefined when the card
 *  is simple OR no assigns_type pattern has a registration OR the type
 *  card named by the registration does not exist in storage.
 *
 *  The walk is the DRIVER-BACKED one (findAssignedTypeNameDriverBacked):
 *  anchor codenames resolve through the async Lexicon/codehash
 *  registries, so the assignment step of ensure_type_id
 *  (initialize.rb:54 -> type.rb:58-66) stays live on a cold engine,
 *  matching Ruby's db-backed resolution (base.rb:17-19, :40-44). */
export async function resolveAssignedTypeIdForCard(
  fetcher: FetchEngine,
  card: AssignedTypeCardInput,
): Promise<number | undefined> {
  const typeName = await findAssignedTypeNameDriverBacked(fetcher, card);
  if (typeName === undefined) return undefined;
  return resolveAssignedTypeId(fetcher, typeName);
}

/** Read-side helper for tests and the read-rule derivation: list every
 *  registration the walk could produce for a card. Ordered like
 *  typeAssigningModuleKeys — pattern precedence (most specific first). */
export function listAssignedTypeNamesForCard(
  card: AssignedTypeCardInput,
): readonly string[] {
  const parsed = DeckoName.parse(card.name);
  if (!parsed.isCompound) return [];
  const out: string[] = [];
  for (const moduleKey of typeAssigningModuleKeys(patternInputFor(card))) {
    const typeName = ASSIGNMENTS.get(moduleKey);
    if (typeName !== undefined) out.push(DeckoName.parse(typeName).s);
  }
  return out;
}
