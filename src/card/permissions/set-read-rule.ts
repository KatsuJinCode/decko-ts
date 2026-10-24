// The WRITE-side read-rule derivation: the port of card-mod-permissions'
// set_read_rule machinery — the save-path event that fills cards.read_rule_id
// / cards.read_rule_class, plus the cascades that keep those columns true
// when the rule graph moves.
//
// Ruby trail (every behavior cites its source):
//
// 1. event :set_read_rule, :store, on: :save, changed: %i[type_id name]
//    (card-mod-permissions-0.20.0 set/all/permissions.rb:1-5): on every
//    save where the type or the name changed (creates always — a new row's
//    nil->value attributes are changes), the card derives
//    permission_rule_id_and_class(:read) and assigns the pair onto the row.
//    The `changed:` gate resolves through Card::Dirty (dirty_options,
//    lib/card/set/event.rb:38), and DirtyNames#name_is_changing?
//    (lib/card/dirty.rb:56-59) counts left_id/right_id rewires as name
//    changes — the same definition the action engine already ports.
//
// 2. permission_rule_id_and_class (permissions.rb:63-65):
//    [permission_rule_id(:read), direct_rule_card(:read).rule_class_name].
//    - permission_rule_id (permissions.rb:55-61): a compound card whose
//      first applicable read rule says "_left" (regex
//      /^\[?\[?_left\]?\]?$/) reads through its LEFT card's permission
//      rule; otherwise it reads through the rule card itself. The
//      create->update action adjustment in left_permission_rule_id
//      (permissions.rb:67-71) is behaviorally inert in the :read flow —
//      `action` is never branched on after the adjustment — so the port
//      omits it.
//    - direct_rule_card (permissions.rb:209-213): Card.quick_fetch of
//      rule_card_id(:read) — the FIRST existing rule card in pattern
//      precedence order (lib/card/rule/all.rb:13-15 walking
//      Set::Pattern::All#rule_lookup_keys; the cache keys themselves are
//      Rule::Cache#lookup_key, lib/card/rule/cache.rb:48-59).
//    - rule_class_name (permissions.rb:87-89): the rule card's trunk is a
//      Set-type card, and the class is its name's trunk tag ("*self",
//      "*all plus", ...); nil when the trunk is not a Set.
//
// 3. event :cascade_read_rule, :finalize, after: :update_rule_cache,
//    when: :rule? (card-mod-permissions-0.20.0 set/right/read.rb:9-14):
//    when the SAVED card is itself a rule (Rule::All#rule? =
//    standard_rule?, lib/card/rule/all.rb:33-40 — right part a Setting,
//    left part a Set) and its name or trash is changing, every member of
//    the rule's set and every card whose stored read_rule_id points at the
//    rule card re-derives (update_read_ruled_cards, read.rb:28-37).
//
// 4. update_read_rule (permissions.rb:11-20): re-run the derivation and
//    `Card.where(id: id).update_all read_rule_id:, read_rule_class:` — a
//    bare column write: no history rows (read_rule columns are not in
//    Card::Change::TRACKED_FIELDS, card-mod-history lib/card/change.rb:25)
//    and no timestamps (without_timestamps, permissions.rb:190-195). Its
//    update_field_read_rules tail (permissions.rb:166-172) re-derives every
//    FIELD card whose own applicable read rule says "_left" — the chain
//    that carries a read rule down a "_left" field tree.
//
// 5. event :set_field_read_rules, after: :set_read_rule, on: :update,
//    changed: :type_id (permissions.rb:7-9): a type-changing update
//    re-derives every field card unconditionally (no "_left" filter).
//
// Rule-less decks: Ruby raises PermissionDenied from require_permission_rule!
// (permissions.rb:77-85) when no read rule resolves at all — every real deck
// bootstraps *all+*read (card/auth/setup.rb:44). The port stores NULLs for
// that case, matching Ruby's stored value (read_rule_id is NULL when
// permission_rule_id resolves nil) and letting the write-permission gate
// decide, which is Ruby's own separation: the row is written, and the gate
// refuses on the read. The read side denies the same deck
// (read-rules.ts canReadByRuleLookup -> false,
// permissions.rb:139-146 read_rules_hash[nil]); the write-permission gate
// remains the engine's canWrite seam (the :check_permissions validate event,
// permissions.rb:22-25, is not ported).

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { CARD_ID_BY_CODENAME_SQL, CARD_ROW_BY_ID_SQL } from "../fetch/card-read-shapes.js";
import type { CardsRow } from "../../server/schema.js";
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { ruleClassName, ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import {
  resolveComposedNameIdsByKeys,
  resolveRuleIdsByComposedKeys,
} from "./read-rules.js";
import { isPreferenceName, quickTypeName } from "../actions/rule-content-walk.js";

/** permissions.rb:56 — the "_left" (or [[_left]]) rule content that makes a
 *  compound card read through its left card. */
const LEFT_RULE_CONTENT = /^\[?\[?_left\]?\]?$/;

/** Codename of the Set CARDTYPE card — Rule::All#standard_rule? compares the
 *  left part's type against SetID (lib/card/rule/all.rb:37-40); the class
 *  derivation compares the rule card's trunk against the same id
 *  (permissions.rb:88). */
const SET_TYPE_CODENAME = "set";
/** Codename of the Setting CARDTYPE card — the right-part check of
 *  standard_rule? (all.rb:38). */
const SETTING_TYPE_CODENAME = "setting";

/** The derived pair the store event assigns onto the cards row
 *  (permissions.rb:2-4). */
export interface ReadRuleRecord {
  readonly readRuleId: number | null;
  readonly readRuleClass: string | null;
}

/** The card state the derivation reads. For a stored row all fields come off
 *  the cards row (compound cards compose their name through the Lexicon);
 *  for a card whose row does not exist yet (the store phase of a create, or
 *  left_or_new's virtual left) the caller supplies the would-be values with
 *  `isNew: true` — new cards skip the *self pattern
 *  (lib/card/set/pattern/all.rb:27-29,
 *  `patterns: new_card? ? concrete_patterns[1..] : concrete_patterns`). */
export interface ReadRuleCardInput {
  readonly name: string;
  /** Null for a virtual card whose type is not yet resolved: the *type
   *  pattern then does not apply (03_type.rb#pattern_applies?:
   *  !!card.type_id). */
  readonly typeId: number | null;
  readonly leftId?: number | null;
  readonly rightId?: number | null;
  readonly isNew?: boolean;
}

/** One first-applicable rule card of the pattern walk — direct_rule_card
 *  (permissions.rb:209-213) plus the content permission_rule_id needs. */
interface DirectRuleCard {
  readonly id: number;
  /** db_content — `rule(action)` is the rule card's db_content
   *  (lib/card/rule/all.rb:5-7). */
  readonly content: string | null;
  readonly leftId: number | null;
  readonly rightId: number | null;
}

/**
 * A scoped rule-lookup overlay: composed rule-name KEY -> rule card id,
 * consulted by the derivation's candidate resolution before storage.
 *
 * This is the deliberate reproduction of Ruby's stale-cache window around a
 * rule RENAME: the rename's row write lands when the storage phase ends
 * (the storage_phase around_save yields AFTER the store and finalize
 * stages, lib/card/director/phases.rb:33-42), so event :cascade_read_rule —
 * which runs at finalize, before the write — re-derives every affected card
 * against the PRE-rename binding (Rule::Cache repopulates from the
 * not-yet-written row: the old "<set>+read" key still resolves to the
 * renamed card; verified against the oracle, tools/persistence/
 * rule-rename-lookup-trace.rb: the host's (*self, read) lookup returns the
 * renamed card id mid-cascade, and only a lookup after the save completes
 * sees the new tag). The port's cascade runs after its own row write, so it
 * carries the pre-write binding explicitly: only the renamed rule's own old
 * name is overlaid, only for the duration of this one cascade.
 */
type RuleLookupOverlay = ReadonlyMap<string, number>;

/** The storage + lexicon seam the derivation reads through. */
export interface ReadRuleWriteDeps {
  readonly driver: SQLDatabaseDriver;
  readonly fetch: FetchEngine;
}

// ---------------------------------------------------------------------------
// derivation — permission_rule_id_and_class(:read)
// ---------------------------------------------------------------------------

/**
 * The port of `permission_rule_id_and_class(:read)` for one card
 * (permissions.rb:1-5, :63-65): the pair the set_read_rule store event
 * assigns. NULLs when the deck carries no applicable read rule, which is
 * Ruby's own stored value for a nil permission_rule_id — the read check
 * denies such a card (permissions.rb:139-146).
 */
export async function deriveReadRuleRecord(
  deps: ReadRuleWriteDeps,
  card: ReadRuleCardInput,
  overlay?: RuleLookupOverlay,
): Promise<ReadRuleRecord> {
  const direct = await firstApplicableReadRule(deps, card, overlay);
  if (direct === undefined) {
    return { readRuleId: null, readRuleClass: null };
  }
  const readRuleId = await permissionRuleId(deps, card, direct, overlay);
  const readRuleClass = await directRuleClassName(deps, direct);
  return { readRuleId, readRuleClass };
}

/**
 * The read-side port of `permission_rule_id(:read)` (permissions.rb:55-61) —
 * the effective rule id a viewer's read verdict checks, `_left` delegation
 * included: a compound card whose first applicable read rule's content is
 * "_left" (or "[[_left]]") reads through its left card's permission rule,
 * recursively. `deriveReadRuleRecord` wraps this plus the class derivation
 * for the write path; the read path (canReadByRuleLookup) needs only the id,
 * so the class queries stay off the render-hot path.
 *
 * Null when no rule resolves, which is Ruby's own answer for a card whose
 * permission_rule_id is nil; the read check denies it
 * (permissions.rb:139-146).
 */
export async function effectiveReadRuleId(
  deps: ReadRuleWriteDeps,
  card: ReadRuleCardInput,
): Promise<number | null> {
  const direct = await firstApplicableReadRule(deps, card);
  if (direct === undefined) return null;
  return permissionRuleId(deps, card, direct);
}

/** permission_rule_id (permissions.rb:55-61): compound cards whose
 *  applicable rule says "_left" read through their left card; everything
 *  else reads through the rule card the walk found. `compound?` in Ruby is
 *  NAME-based (name.parts.length > 1), not id-based — the read side calls
 *  this for virtual cards whose ids do not exist yet, so the name decides
 *  (for stored junction rows both agree: the row's left_id/right_id are set
 *  exactly when the composed name is compound). */
async function permissionRuleId(
  deps: ReadRuleWriteDeps,
  card: ReadRuleCardInput,
  direct: DirectRuleCard,
  overlay?: RuleLookupOverlay,
): Promise<number | null> {
  const compound = DeckoName.parse(card.name).isCompound;
  if (compound && direct.content !== null && LEFT_RULE_CONTENT.test(direct.content)) {
    return leftPermissionRuleId(deps, card, overlay);
  }
  return direct.id;
}

/** left_permission_rule_id (permissions.rb:67-71): the LEFT card's
 *  permission_rule_id. left_or_new falls back to a virtual card when the
 *  left does not exist; the create->update action adjustment is inert in
 *  the :read flow (see module header) and is not ported. */
async function leftPermissionRuleId(
  deps: ReadRuleWriteDeps,
  card: ReadRuleCardInput,
  overlay?: RuleLookupOverlay,
): Promise<number | null> {
  const leftName = DeckoName.parse(card.name).leftName;
  if (leftName === undefined) {
    // Unreachable for a compound card (its name has a left part by
    // construction); refuse to guess rather than silently mis-derive.
    throw new Error(
      `set_read_rule: compound card ${card.name} has no resolvable left name`,
    );
  }
  const leftId =
    card.leftId ?? (await deps.fetch.lexicon.id(leftName)) ?? null;
  if (leftId !== null) {
    const leftRow = await fetchCardsRow(deps.driver, leftId);
    if (leftRow !== undefined && leftRow.trash === 0) {
      const derived = await deriveReadRuleRecord(
        deps,
        await rowCardInput(deps, leftRow),
        overlay,
      );
      return derived.readRuleId;
    }
  }
  // left_or_new: a virtual left — new cards skip the *self pattern, and the
  // *type pattern does not apply until a type is resolved.
  const direct = await firstApplicableReadRule(deps, {
    name: leftName.s,
    typeId: null,
    isNew: true,
  }, overlay);
  return direct?.id ?? null;
}

/** direct_rule_card (:209-213) — the first existing rule card in the card's
 *  pattern-precedence candidates (ruleNamesForCard joins each applicable
 *  set, most specific first, to the setting name; lib/card/rule/all.rb:13-15
 *  + Rule::Cache's key walk, lib/card/rule/cache.rb:48-59). */
async function firstApplicableReadRule(
  deps: ReadRuleWriteDeps,
  card: ReadRuleCardInput,
  overlay?: RuleLookupOverlay,
): Promise<DirectRuleCard | undefined> {
  const patternInput = await patternCardInput(deps, card);
  const candidates = ruleNamesForCard(patternInput, "*read");
  if (candidates.length === 0) return undefined;
  // The candidates are resolved by the PER-KEY walk
  // (resolveRuleIdsByComposedKeys), not the whole-deck universe. Two
  // narrower walks were measured against the serving deck first, and both
  // answers are recorded so nobody re-derives them.
  //
  //   RULE_KEY_RULE_CLOSURE_STATEMENT (resolveRuleIdsByRuleKeys)
  //       1489 rows, 322 ms warm — 13x fewer rows, 3x LONGER. Its five
  //       MATERIALIZED edge CTEs cost more to build than the deck they
  //       prune. It agrees on every rule-shaped key (0 disagreeing, 0
  //       invented over all 1493 of them), so it is a CORRECT swap and a
  //       SLOW one.
  //   resolveComposedNameIdsByKeys (resolveRuleIdsByComposedKeys)
  //       0.095 ms/key against the universe's 203 ms, agreeing on all
  //       19,469 composed names of that deck. This is the swap.
  //
  // The universe walk composes EVERY card in the deck to answer these five
  // keys, and expireAfterWrite drops the memo at every write, so the save
  // paid for it five times: 460 ms of the graded save's 549 ms of
  // statement-exec, measured by tools/diagnose-owner-save-statement-ladder.mjs.
  //
  // A key two cards both compose is NOT guessed here: the per-key walk hands
  // it to the whole-deck universe, whose Map collapses it by output order, so
  // the rare ambiguous candidate gets the same answer this call site gave it
  // before. Equivalence is pinned by
  // tests/card/permissions/rule-candidate-per-key-resolution-equivalence.test.ts.
  const resolved = await resolveRuleIdsByComposedKeys(
    deps.driver,
    candidates.map((name) => DeckoName.parse(name).key),
  );
  for (const name of candidates) {
    const key = DeckoName.parse(name).key;
    const id = overlay?.get(key) ?? resolved.get(key);
    if (id === undefined) continue;
    const row = await fetchCardsRow(deps.driver, id);
    if (row === undefined || row.trash !== 0) continue;
    return {
      id: row.id,
      content: row.db_content,
      leftId: row.left_id,
      rightId: row.right_id,
    };
  }
  return undefined;
}

/** direct_rule_card(...).rule_class_name (permissions.rb:64, :87-89): the
 *  rule card's trunk must be a Set-type card; the class is the rule card
 *  name's trunk tag ("WCC ReadRule+*self+*read" -> "*self",
 *  "*all plus+*read" -> "*all plus"). */
async function directRuleClassName(
  deps: ReadRuleWriteDeps,
  direct: DirectRuleCard,
): Promise<string | null> {
  if (direct.leftId === null || direct.rightId === null) return null;
  const trunkRow = await fetchCardsRow(deps.driver, direct.leftId);
  const setTypeId = await typeIdByCodename(deps, SET_TYPE_CODENAME);
  if (trunkRow === undefined || setTypeId === undefined) return null;
  const trunkName = await composedRowName(deps, trunkRow);
  const settingName = await cardName(deps, direct.rightId);
  if (trunkName === undefined || settingName === undefined) return null;
  const trunkIsSet = trunkRow.type_id === setTypeId;
  // The rule card name's trunk is the set card; its tag is the class
  // (permissions.rb:88 `name.trunk_name.tag`).
  return ruleClassName(`${trunkName}+${settingName}`, trunkIsSet);
}

// ---------------------------------------------------------------------------
// rule? — the cascade gate (lib/card/rule/all.rb:33-40)
// ---------------------------------------------------------------------------

/**
 * Rule::All#standard_rule? (all.rb:37-40): the name's right part is a
 * Setting-type card and its left part is a Set-type card. (preference?,
 * all.rb:42-47 — the SET+USER+SETTING shape — is not ported and does
 * not gate the cascade here.)
 */
export async function isStandardRuleCardRow(
  deps: ReadRuleWriteDeps,
  row: CardsRow,
): Promise<boolean> {
  if ((row.left_id ?? null) === null || (row.right_id ?? null) === null) {
    return false;
  }
  const name = await composedRowName(deps, row);
  if (name === undefined) return false;
  const parsed = DeckoName.parse(name);
  if (!parsed.isCompound) return false;
  const setTypeId = await typeIdByCodename(deps, SET_TYPE_CODENAME);
  const settingTypeId = await typeIdByCodename(deps, SETTING_TYPE_CODENAME);
  if (setTypeId === undefined || settingTypeId === undefined) return false;
  const leftRow = await partRow(deps, parsed.leftName);
  const rightRow = await partRow(deps, parsed.rightName);
  return (
    leftRow !== undefined &&
    rightRow !== undefined &&
    leftRow.type_id === setTypeId &&
    rightRow.type_id === settingTypeId
  );
}

// ---------------------------------------------------------------------------
// update_read_rule + the cascades
// ---------------------------------------------------------------------------

/**
 * update_read_rule (permissions.rb:11-20): re-run the derivation and write
 * the pair with a bare column UPDATE — no history rows, no timestamps
 * (without_timestamps). `changed` tracks the ids already (re)derived in one
 * cascade so diamond field chains converge after one write; the final rows
 * equal Ruby's (whose repeated derivations are idempotent no-op writes).
 */
export async function updateReadRule(
  deps: ReadRuleWriteDeps,
  cardId: number,
  changed?: Set<number>,
  overlay?: RuleLookupOverlay,
): Promise<void> {
  const row = await fetchCardsRow(deps.driver, cardId);
  if (row === undefined || row.trash !== 0) return;
  const derived = await deriveReadRuleRecord(
    deps,
    await rowCardInput(deps, row),
    overlay,
  );
  // Card.where(id: id).update_all ... (permissions.rb:15-16) — unconditional,
  // without_timestamps (permissions.rb:190-195): updated_at/updater_id stay.
  await deps.driver.query(
    "UPDATE cards SET read_rule_id = ?, read_rule_class = ? WHERE id = ?",
    [derived.readRuleId, derived.readRuleClass, cardId],
  );
  const valueChanged =
    derived.readRuleId !== (row.read_rule_id ?? null) ||
    derived.readRuleClass !== (row.read_rule_class ?? null);
  if (!valueChanged) return;
  // update_field_read_rules (permissions.rb:166-172): the fields whose own
  // applicable read rule says "_left" re-derive. (The type_id_changed? half
  // of the guard cannot fire here — update_read_rule never changes a type.)
  await cascadeLeftRuleFieldReadRules(deps, cardId, changed, overlay);
}

/** set_field_read_rules (permissions.rb:7-9): a type-changing update runs
 *  each_field_as_bot(&:update_read_rule) — every field card re-derives, with
 *  NO "_left" filter (that filter is update_read_rule's own tail only). */
export async function cascadeAllFieldReadRules(
  deps: ReadRuleWriteDeps,
  cardId: number,
): Promise<void> {
  for (const fieldId of await fieldCardIds(deps, cardId)) {
    await updateReadRule(deps, fieldId);
  }
}

/** each_field_as_bot's loop with the update_field_read_rules "_left" filter
 *  (permissions.rb:166-172, :174-181): field cards = cards with this card as
 *  trunk (field_ids = child_ids :left, lib/card/name/all/descendants.rb:9-18,
 *  :27-38 — Card.search excludes trash). */
async function cascadeLeftRuleFieldReadRules(
  deps: ReadRuleWriteDeps,
  cardId: number,
  changed?: Set<number>,
  overlay?: RuleLookupOverlay,
): Promise<void> {
  for (const fieldId of await fieldCardIds(deps, cardId)) {
    if (changed?.has(fieldId)) continue;
    const fieldRow = await fetchCardsRow(deps.driver, fieldId);
    if (fieldRow === undefined) continue;
    const direct = await firstApplicableReadRule(
      deps,
      await rowCardInput(deps, fieldRow),
      overlay,
    );
    if (direct === undefined || direct.content === null) continue;
    if (!LEFT_RULE_CONTENT.test(direct.content)) continue;
    changed?.add(fieldId);
    await updateReadRule(deps, fieldId, changed, overlay);
  }
}

/** field_ids = child_ids :left (descendants.rb:17-18, :35-40). */
async function fieldCardIds(
  deps: ReadRuleWriteDeps,
  cardId: number,
): Promise<number[]> {
  const r = await deps.driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE left_id = ? AND trash = 0 ORDER BY id",
    [cardId],
  );
  return r.rows.map((row) => row.id);
}

/**
 * The finalize cascade for a saved RULE card — update_read_ruled_cards
 * (set/right/read.rb:28-37, event :cascade_read_rule :9-14): every member of
 * the rule's set re-derives, then every card whose stored read_rule_id points
 * at this rule card. `nameOrTrashChanging` is the event's
 * `name_is_changing? || trash_is_changing?` gate (read.rb:11); creates pass
 * true.
 */
export async function cascadeReadRuleAfterRuleSave(
  deps: ReadRuleWriteDeps,
  ruleCardRow: CardsRow,
  nameOrTrashChanging: boolean,
  overlay?: RuleLookupOverlay,
  priorRuleCardRow?: CardsRow,
): Promise<void> {
  if (!nameOrTrashChanging) return; // read.rb:11
  // This event belongs to set/right/read.rb, not every Setting rule.
  // A rename keeps the event composed from its pre-save read-rule binding.
  const readId = await typeIdByCodename(deps, "read");
  if (readId === undefined ||
      (ruleCardRow.right_id !== readId && priorRuleCardRow?.right_id !== readId)) return;
  if (!(await isStandardRuleCardRow(deps, ruleCardRow))) return; // when: :rule?
  const changed = new Set<number>();

  // update_read_rules_of_set_members (read.rb:39-47): every member of the
  // rule's set. Ruby calls update_read_rule twice per member (read.rb:44-45,
  // the second unless member_has_overriding_rule?); both write the same
  // values, so the port derives once per member.
  const setRow =
    ruleCardRow.left_id !== null
      ? await fetchCardsRow(deps.driver, ruleCardRow.left_id)
      : undefined;
  if (setRow !== undefined) {
    for (const memberId of await setMemberIds(deps, setRow)) {
      if (changed.has(memberId)) continue;
      changed.add(memberId);
      await updateReadRule(deps, memberId, changed, overlay);
    }
  }

  // update_cards_with_read_rule_id (read.rb:56-63): every live card whose
  // stored read_rule_id names this rule card — includes cards that stopped
  // being set members via a rename (read.rb:53-55 edge).
  const pointing = await deps.driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE read_rule_id = ? AND trash = 0 ORDER BY id",
    [ruleCardRow.id],
  );
  for (const { id } of pointing.rows) {
    if (changed.has(id)) continue;
    changed.add(id);
    await updateReadRule(deps, id, changed, overlay);
  }
}

// ---------------------------------------------------------------------------
// set membership — rule_set.item_cards (read.rb:72)
// ---------------------------------------------------------------------------

/**
 * The member card ids of a SET card (all_members, read.rb:71-73 —
 * `rule_set.item_cards limit: 0`): per pattern-code membership over the
 * cards table. The nine core patterns are the whole registry (no installed
 * mod ships a set_pattern — see src/card/set-patterns/registry.ts header), so
 * the switch is total; anything else fails loudly rather than silently
 * returning no members.
 */
/** The `rstar` set's members: the cards whose right part is a star-prefixed
 *  card. Exported so the PostgreSQL conformance tests run this exact text. */
export const STAR_PREFIXED_MEMBERS_STATEMENT =
  `WITH RECURSIVE star_prefixed(id) AS (\n` +
  `  SELECT id FROM cards WHERE trash = 0 AND "key" LIKE '*%'\n` +
  `  UNION\n` +
  `  SELECT j.id FROM star_prefixed s\n` +
  `    JOIN cards j ON j.left_id = s.id AND j.trash = 0\n` +
  `)\n` +
  `SELECT cards.id FROM cards\n` +
  `  JOIN star_prefixed sp ON sp.id = cards.right_id\n` +
  ` WHERE cards.trash = 0 AND cards.right_id IS NOT NULL`;

/** Exported for the expire_related structuree walk (update_read_rules.rb:8-11
 *  via card-action-engine.ts — the *structure rule save expires its set's
 *  members), which answers the same set-membership question this walk
 *  answers for cascade_read_rule. */
export async function setMemberIds(
  deps: ReadRuleWriteDeps,
  setRow: CardsRow,
): Promise<number[]> {
  const code = await setPatternCode(deps, setRow);
  switch (code) {
    case "all":
      return allCardIds(deps, "");
    case "all_plus": {
      // the *all plus set: every compound card (02_all_plus.rb —
      // compound_only; a compound ROW is left_id AND right_id set).
      return allCardIds(deps, "AND cards.left_id IS NOT NULL AND cards.right_id IS NOT NULL");
    }
    case "star": {
      // Card::Name#star? = simple? && first char "*" (lib/card/name.rb:115-117)
      // — simple rows only; compound rows carry NULL names/keys.
      return allCardIds(deps, "AND cards.key LIKE '*%'");
    }
    case "rstar": {
      // Card::Name#rstar? (name.rb:118-120): the right part starts with "*".
      // A composed key starts with '*' iff its FIRST segment does, so the
      // star-prefixed universe is a closure over left_id edges seeded by the
      // simple star keys - each card enters once (O(deck + edges), no
      // multi-pass universe composition; the previous whole-deck
      // composed-key CTE re-read the deck per recursion pass to learn the
      // same set).
      const r = await deps.driver.query<{ id: number }>(STAR_PREFIXED_MEMBERS_STATEMENT, []);
      return r.rows.map((row) => row.id);
    }
    case "rule":
      // the *rule set (06_rule.rb — anchorless, applies to rule? cards):
      // junction rows whose left part is Set-typed and right part
      // Setting-typed.
      return junctionsWithPartTypes(deps, SET_TYPE_CODENAME, SETTING_TYPE_CODENAME);
    case "type":
    case "right":
    case "type_plus_right":
    case "self":
      return anchoredPatternMemberIds(deps, setRow, code);
    default:
      throw new Error(
        `set_read_rule cascade: unsupported set pattern '${code ?? "unknown"}' ` +
          `for set card ${setRow.id} — the core registry's nine patterns are ` +
          `the supported membership universe`,
      );
  }
}

/** Anchored patterns: the set card's LEFT side names the anchor (one part
 *  for *type / *right / *self, the "TYPE+RIGHT" junction for *type plus
 *  right). */
async function anchoredPatternMemberIds(
  deps: ReadRuleWriteDeps,
  setRow: CardsRow,
  code: "type" | "right" | "type_plus_right" | "self",
): Promise<number[]> {
  if (setRow.left_id === null || setRow.left_id === undefined) return [];
  if (code === "type") {
    // "<TYPE>+*type" members: cards of the anchor type.
    return allCardIds(deps, `AND cards.type_id = ${Number(setRow.left_id)}`);
  }
  if (code === "right") {
    // "<RIGHT>+*right" members: cards whose right part is the anchor card.
    return allCardIds(deps, `AND cards.right_id = ${Number(setRow.left_id)}`);
  }
  if (code === "type_plus_right") {
    // "<TYPE>+<RIGHT>+*type plus right": left card's type is the anchor's
    // left part, right part is the anchor's right part.
    const anchor = await fetchCardsRow(deps.driver, setRow.left_id);
    if (anchor === undefined || anchor.left_id === null || anchor.right_id === null) {
      return [];
    }
    const r = await deps.driver.query<{ id: number }>(
      `SELECT cards.id FROM cards
         JOIN cards lefts ON cards.left_id = lefts.id
        WHERE cards.trash = 0 AND lefts.trash = 0
          AND lefts.type_id = ? AND cards.right_id = ?`,
      [anchor.left_id, anchor.right_id],
    );
    return r.rows.map((row) => row.id);
  }
  // self: members are the cards whose COMPOSED name is the anchor's name
  // (lib/card/lexicon.rb DbLexicon#name_to_lex). Per-key: the anchor's
  // composed name comes from the cached lexicon (one side walk), and the
  // member lookup is the per-key composed-name resolver
  // (resolveComposedNameIdsByKeys), which walks only THIS key's own
  // '+'-segment runs instead of the deck's whole composed-key universe.
  // Equivalence with the universe walk is pinned by
  // tests/card/permissions/composed-name-self-pattern-resolution-equivalence.test.ts.
  // This lookup was the universe's only non-rule-key consumer, and the reason a
  // save paid for five whole-deck walks.
  const anchorRow = await fetchCardsRow(deps.driver, setRow.left_id);
  if (anchorRow === undefined) return [];
  const anchorName = await composedRowName(deps, anchorRow);
  if (anchorName === undefined || anchorName === "") return [];
  const anchorKey = DeckoName.parse(anchorName).key;
  const resolved = await resolveComposedNameIdsByKeys(deps.driver, [anchorKey]);
  return resolved.get(anchorKey) ?? [];
}

/** The set pattern's code: anchored sets carry the pattern card as their
 *  right part; anchorless sets are simple cards whose own codename IS the
 *  pattern (lib/card/rule/cache.rb:51-56 — set_tag_id anchored, set_id
 *  anchorless). */
async function setPatternCode(
  deps: ReadRuleWriteDeps,
  setRow: CardsRow,
): Promise<string | null> {
  if (setRow.right_id !== null && setRow.right_id !== undefined) {
    const r = await deps.driver.query<{ codename: string | null }>(
      "SELECT codename FROM cards WHERE id = ?",
      [setRow.right_id],
    );
    return r.rows[0]?.codename ?? null;
  }
  return setRow.codename ?? null;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** The PatternCardInput the pattern registry reads (storage questions
 *  answered: type name for the *type pattern, the left card's type name for
 *  *type plus right, the standard-rule? answer for the *rule pattern). */
async function patternCardInput(
  deps: ReadRuleWriteDeps,
  card: ReadRuleCardInput,
): Promise<PatternCardInput> {
  const parsed = DeckoName.parse(card.name);
  let leftTypeName: string | null = null;
  if (parsed.isCompound && parsed.leftName !== undefined) {
    const leftId =
      card.leftId ?? (await deps.fetch.lexicon.id(parsed.leftName)) ?? null;
    const leftRow = leftId !== null ? await fetchCardsRow(deps.driver, leftId) : undefined;
    if (leftRow !== undefined && leftRow.trash === 0) {
      leftTypeName = (await cardName(deps, leftRow.type_id)) ?? null;
    } else {
      // quick_type's new-card arm (class_methods.rb:59-71): a missing or
      // trashed left answers the type a new card of that name would get.
      leftTypeName = (await quickTypeName(deps.fetch, parsed.leftName)) ?? null;
    }
  }
  return {
    name: card.name,
    id: null,
    isNew: card.isNew ?? false,
    typeId: card.typeId,
    typeName: card.typeId !== null ? ((await cardName(deps, card.typeId)) ?? null) : null,
    leftTypeName,
    isRule: parsed.isCompound
      ? (await isStandardRuleName(deps, parsed)) || (await isPreferenceName(deps.fetch, parsed))
      : false,
  };
}

/** standard_rule? from a composed name (the row variant composes then
 *  delegates). */
async function isStandardRuleName(
  deps: ReadRuleWriteDeps,
  name: DeckoName,
): Promise<boolean> {
  const setTypeId = await typeIdByCodename(deps, SET_TYPE_CODENAME);
  const settingTypeId = await typeIdByCodename(deps, SETTING_TYPE_CODENAME);
  if (setTypeId === undefined || settingTypeId === undefined) return false;
  const leftRow = await partRow(deps, name.leftName);
  const rightRow = await partRow(deps, name.rightName);
  return (
    leftRow !== undefined &&
    rightRow !== undefined &&
    leftRow.type_id === setTypeId &&
    rightRow.type_id === settingTypeId
  );
}

async function allCardIds(
  deps: ReadRuleWriteDeps,
  extraWhere: string,
): Promise<number[]> {
  const r = await deps.driver.query<{ id: number }>(
    `SELECT cards.id FROM cards WHERE cards.trash = 0 ${extraWhere}`,
    [],
  );
  return r.rows.map((row) => row.id);
}

/** standard_rule?-shaped junction membership for the *rule set. */
async function junctionsWithPartTypes(
  deps: ReadRuleWriteDeps,
  leftTypeCodename: string,
  rightTypeCodename: string,
): Promise<number[]> {
  const r = await deps.driver.query<{ id: number }>(
    `SELECT cards.id FROM cards
       JOIN cards lefts ON cards.left_id = lefts.id
       JOIN cards rights ON cards.right_id = rights.id
      WHERE cards.trash = 0
        AND lefts.type_id = (SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1)
        AND rights.type_id = (SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1)`,
    [leftTypeCodename, rightTypeCodename],
  );
  return r.rows.map((row) => row.id);
}

/** Exported for the expire_related structuree walk (update_read_rules.rb:8-11
 *  via card-action-engine.ts) — the set row the walk re-derives. */
export async function fetchCardsRow(
  driver: SQLDatabaseDriver,
  id: number,
): Promise<CardsRow | undefined> {
  const r = await driver.query<CardsRow>(
    CARD_ROW_BY_ID_SQL,
    [id],
  );
  return r.rows[0];
}

async function partRow(
  deps: ReadRuleWriteDeps,
  partName: DeckoName | undefined,
): Promise<CardsRow | undefined> {
  if (partName === undefined) return undefined;
  const id = await deps.fetch.lexicon.id(partName);
  if (id === undefined) return undefined;
  return fetchCardsRow(deps.driver, id);
}

/** The card input for a stored row — the update_read_rule shape (real card,
 *  self pattern included, name composed through the Lexicon). */
async function rowCardInput(
  deps: ReadRuleWriteDeps,
  row: CardsRow,
): Promise<ReadRuleCardInput> {
  const name = (await composedRowName(deps, row)) ?? "";
  return {
    name,
    typeId: row.type_id,
    leftId: row.left_id,
    rightId: row.right_id,
    isNew: false,
  };
}

/** The composed name of a row — simple cards read the column, junction rows
 *  compose through the Lexicon (lib/card/name/all.rb:12-14). */
async function composedRowName(
  deps: ReadRuleWriteDeps,
  row: CardsRow,
): Promise<string | undefined> {
  if (row.left_id !== null && row.left_id !== undefined && row.right_id !== null) {
    const composed = await deps.fetch.lexicon.composeName(row.left_id, row.right_id);
    if (composed !== undefined) return composed.s;
  }
  return row.name ?? undefined;
}

/** Exported for the expire_related structuree walk (update_read_rules.rb:8-11
 *  via card-action-engine.ts) — the member's composed name, expiry's key. */
export async function cardName(deps: ReadRuleWriteDeps, id: number): Promise<string | undefined> {
  const row = await fetchCardsRow(deps.driver, id);
  if (row === undefined) return undefined;
  return composedRowName(deps, row);
}

/** Exported for the expire_related structuree walk (update_read_rules.rb:8-11
 *  via card-action-engine.ts) — the Set-type check on the rule's trunk. */
export async function typeIdByCodename(
  deps: ReadRuleWriteDeps,
  codename: string,
): Promise<number | undefined> {
  // THE SHAPE IS THE REGISTRY'S (src/card/fetch/card-read-shapes.ts), so the
  // deck's standard-card declaration can answer this read: a prefetch only
  // answers a reader whose statement is IDENTICAL to the one it prefetched.
  const r = await deps.driver.query<{ id: number }>(CARD_ID_BY_CODENAME_SQL, [codename]);
  const id = r.rows[0]?.id;
  return id === undefined ? undefined : Number(id);
}
