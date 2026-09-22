// The WRITE-path action layer: Set (create), Save/Update, and Delete
// (trash flip) — the card-mutating API on top of the ActWriter history
// machinery. One applyAction call = one Ruby save request = one act.
//
// Ruby trail (every behavior cites its source; full notes in
// docs/actions-port-notes.md):
// - Card.create!/update!/delete! enter the Director pipeline
//   (lib/card/director/card_class.rb:5-13, lib/card/director/all.rb:46-61,
//   mod/core/set/all/trash.rb:11-21) — one act per request
//   (director/all.rb:114-119 start_new_act), subcards share it.
// - Save-time name events: mod/core/set/all/name_events.rb
//   (validate_name :1-17, validate_uniqueness_of_name :19-26,
//   validate_legality_of_name :35-47, validate_renaming :55-61,
//   rename_in_trash :62-66, prepare_left_and_right :68-73,
//   update_lexicon :84-88).
// - Trash: mod/core/set/all/trash.rb (manage_trash :23-27,
//   validate_delete :31-49, delete_children :52-59, pull_from_trash!
//   :57-62, add_to_trash :70-72).
// - Types: mod/core/set/all/type.rb (extract_type_id! :81-92,
//   default_type_id :3-5, validate_type :24-30).
// - Children: lib/card/name/all/descendants.rb:26-31 (each_child).
// - Rename cascades: mod/core/set/all/reference_events.rb:13-19
//   (update_referer_content -> each_descendant -> rename_as_descendant
//   :40-47) — descendants get cache/lexicon maintenance, ZERO row writes
//   (names are virtual post-2020).
// - Cache maintenance after every save: lib/card/director/phases.rb:56-57
//   (`@card.expire` in integration_phase's ensure) -> cache/all.rb:17-24.
//
// Deliberately NOT built here (later streams, per the port tracker):
// full permission resolution (only the anonymous gate + canWrite seam),
// rule-based default content and templates, the ancestor-timestamp id feed
// (update_ancestor_timestamps), subcard staging beyond side creation /
// trash-obstacle renames / child deletion cascades.
// Read-rule columns ARE derived here (set-read-rule.ts — the port of
// card-mod-permissions' set_read_rule store event, permissions.rb:1-5, plus
// the update_read_rule / cascade_read_rule machinery): every save that
// changes type or name fills cards.read_rule_id / read_rule_class, and a
// saved rule card re-derives its set's members and every card pointing at
// it. The ok? write/read CHECKS remain the canWrite seam + the read side.
// Reference maintenance status: card_references population on
// create/update (refresh_references_out) and cleanup on delete
// (clear_references) ARE built here (refresh-references-out.ts). The
// rename-side referer machinery — update_referer_content rewrites and
// refresh_references_in's map_referees/unmap_referees backfill — is still
// a later stream.

import {
  ActWriter,
  cardFieldStateFromRow,
  type CardFieldState,
} from "../history/write-path.js";
import { actionTypeCode } from "../history/action.js";
import { DeckoName } from "../name.js";
import type { CardsRow } from "../../server/schema.js";
import type { FetchEngine } from "../fetch.js";
import {
  composeCardRecord,
  newCardRecord,
  type CardRecord,
} from "../fetch/card-record.js";
import type { Lex } from "../fetch/lexicon.js";
import {
  ANONYMOUS_ACTOR_NAME,
  CardActionError,
  type ActionResult,
  type Actor,
  type ActionRequest,
  type CanWriteHook,
  type CardActionSummary,
  type CreateCardInput,
  type DeleteCardInput,
  type UpdateCardInput,
} from "./types.js";
import {
  assertNameAvailable,
  findTrashedCardByLex,
  findTrashedKeyObstacle,
  validateNameLegality,
} from "./name-validation.js";
import { resolveTypeId } from "./type-resolution.js";
import { assertNotOwnAncestor } from "./junction-cycle-detection.js";
import {
  cascadeAllFieldReadRules,
  cascadeReadRuleAfterRuleSave,
  deriveReadRuleRecord,
  type ReadRuleWriteDeps,
} from "../permissions/set-read-rule.js";
import {
  defaultTransport,
  expandActionResultToSavePathEvents,
  makeNotifyContext,
  runIntegrationHooks,
  type NotifyTransport,
  type SavePathIntegrationHook,
} from "../notify/index.js";
import {
  clearReferencesOnDelete,
  refreshReferencesOut,
} from "./refresh-references-out.js";

export interface CardActionEngineOptions {
  /** The signed-in account. `null` = anonymous session: the engine stays
   *  read-only and every action throws (auth/current.rb:7-9 —
   *  Auth.current_id falls back to Card::AnonymousID; :43-47 signed_in?).
   *  An actor NAMED "*anonymous" is treated the same way. */
  actor: Actor | null;
  /** Clock for every timestamp (defaults to () => new Date()). */
  now?: () => Date;
  /** card_acts.ip_address capture (director/class_methods.rb:27-29). */
  ipAddress?: string | null;
  /** The permission seam: the basic anonymous gate always runs; when
   *  canWrite is provided it is consulted per action with the card record
   *  (a new-card placeholder for creates). Falsy -> permission-denied.
   *  The full ok? rule machinery (card-mod-permissions) is a later
   *  stream. */
  canWrite?: CanWriteHook;
  /** The save-path integration seam (card-mod-follow notify.rb — the
   *  integration stage runs AFTER expire, phases.rb:33-39). When empty or
   *  omitted, saves dispatch nothing and the engine behaves exactly as
   *  before. Failures inside hooks are logged, never raised
   *  (email_template.rb:6's rescue Net::SMTPError shape). */
  integrationHooks?: SavePathIntegrationHook[];
  /** The transport the integration hooks send through (default: the
   *  notify module's NoopTransport default). */
  notifyTransport?: NotifyTransport;
  /** Log sink for integration dispatch lines. */
  notifyLogger?: (line: string) => void;
}

/** Side-card resolution result for one compound name. */
interface ResolvedSides {
  leftId: number | null;
  rightId: number | null;
  /** Subcard creates this resolution performed (same act). */
  created: (CardActionSummary & { actId: number })[];
}

/** Engine for one actor; one applyAction = one act. Construct per request
 *  (Ruby: Director.run_act binds the act per request, director/all.rb:114)
 *  or reuse — every call starts its own act, exactly like a new submission. */
export class CardActionEngine {
  readonly fetch: FetchEngine;
  readonly actor: Actor | null;
  private readonly clock: () => Date;
  private readonly ipAddress: string | null;
  private readonly canWrite: CanWriteHook | undefined;
  private readonly integrationHooks: SavePathIntegrationHook[] | undefined;
  private readonly notifyTransport: NotifyTransport | undefined;
  private readonly notifyLogger: ((line: string) => void) | undefined;

  constructor(fetchEngine: FetchEngine, options: CardActionEngineOptions) {
    this.fetch = fetchEngine;
    this.actor = options.actor;
    this.clock = options.now ?? (() => new Date());
    this.ipAddress = options.ipAddress ?? null;
    this.canWrite = options.canWrite;
    this.integrationHooks = options.integrationHooks;
    this.notifyTransport = options.notifyTransport;
    this.notifyLogger = options.notifyLogger;
  }

  /** The shared entry: dispatches one request to its handler. */
  async applyAction(request: ActionRequest): Promise<ActionResult | null> {
    switch (request.verb) {
      case "create":
        return this.createCard(request);
      case "update":
        return this.updateCard(request);
      case "delete":
        return this.deleteCard(request);
    }
  }

  /**
   * The integration stage (phases.rb:33-39): after expire, before the
   * caller sees the result, the act's events go to every registered
   * save-path hook (follow notifications today). No hooks configured or
   * an anonymous actor (Ruby: notifications carry the acting user;
   * anonymous writes notify no one) -> dispatch nothing. Hook failures
   * are logged inside runIntegrationHooks, never raised — mail must not
   * break the save that triggered it.
   */
  private async dispatchSavePathIntegrations(result: ActionResult | null): Promise<void> {
    if (result === null) return;
    if (this.integrationHooks === undefined || this.integrationHooks.length === 0) return;
    if (this.actor === null || this.actor.name === ANONYMOUS_ACTOR_NAME) return;
    const actor = { id: this.actor.id, name: this.actor.name, email: null };
    await runIntegrationHooks({
      actId: result.actId,
      actor,
      silent: false,
      events: expandActionResultToSavePathEvents(result, actor, false),
      hooks: this.integrationHooks,
      context: makeNotifyContext(this.notifyTransport ?? defaultTransport, this.notifyLogger),
    });
  }

  // -----------------------------------------------------------------------
  // Set — Card.create! (director/card_class.rb:5-9: `card = new opts;
  // card.save!`). Junction names auto-create their side cards as subcards
  // in the same act; a name whose lex matches a trashed row revives that
  // row (manage_trash -> pull_from_trash!, trash.rb:23-25/:57-62).
  // -----------------------------------------------------------------------

  async createCard(input: CreateCardInput): Promise<ActionResult> {
    const placeholder = newCardRecord(DeckoName.parse(input.name ?? ""));
    this.assertWritable();
    await this.assertCanWrite(placeholder);
    const writer = this.newWriter();
    const result = await this.createInWriter(writer, input, { isActCard: true });
    await this.dispatchSavePathIntegrations(result);
    return result;
  }

  /** The create implementation, bound to an existing writer so side
   *  subcards join the caller's act (Ruby: subcards save within the
   *  supercard's Director run, director/store.rb:37-58). */
  private async createInWriter(
    writer: ActWriter,
    input: CreateCardInput,
    opts: { isActCard: boolean },
  ): Promise<ActionResult> {
    const name = DeckoName.parse(input.name ?? "");
    validateNameLegality(name); // validate_legality_of_name (name_events.rb:35-47)
    const typeId = await resolveTypeId(this.fetch, input); // extract_type_id! + validate_type
    await assertNameAvailable(this.fetch, name, undefined); // validate_uniqueness_of_name (:19-26)

    // prepare_left_and_right (name_events.rb:68-73): compound names resolve
    // their sides; missing sides become subcard creates in this act
    // (prepare_new_side :118-125).
    const sides = await this.ensureSides(writer, name);

    // manage_trash -> pull_from_trash! (trash.rb:23-25, :57-62): a matching
    // trashed row is revived (its id reused) instead of a fresh INSERT.
    const lex = this.lexOf(name, sides.leftId, sides.rightId);
    const trashed =
      lex === undefined ? undefined : await findTrashedCardByLex(this.fetch.driver, lex);

    if (trashed !== undefined) {
      const before = cardFieldStateFromRow(trashed);
      // pull_from_trash! reuses ONLY the row id (trash.rb:60-62); every
      // other attribute comes from the new record, exactly as this update
      // state expresses it (trash forced false by manage_trash :23-27).
      const after: CardFieldState = {
        name: name.isSimple ? name.s : null,
        type_id: typeId,
        db_content: input.content ?? null,
        trash: 0,
        left_id: name.isSimple ? null : sides.leftId,
        right_id: name.isSimple ? null : sides.rightId,
      };
      const saved = await writer.updateCard({
        cardId: trashed.id,
        before,
        after,
        key: name.isSimple ? name.key : null,
        // set_read_rule store event (permissions.rb:1-5): a revival is a
        // :create save, so the derivation runs (new_card? is true via
        // @from_trash, trash.rb:61-62 — the *self pattern is skipped).
        readRule: await deriveReadRuleRecord(this.readRuleDeps(), {
          name: name.s,
          typeId,
          leftId: sides.leftId,
          rightId: sides.rightId,
          isNew: true,
        }),
        superActionId: input.superActionId ?? null,
        isActCard: opts.isActCard,
      });
      if (saved === null) {
        // Unreachable: trash flips 1 -> 0, which is always a diff.
        throw new CardActionError("not-found", "revival produced no change");
      }
      // identify_action (director/all.rb:19-28): a revival save is a
      // :create action — from_trash makes new_card? true (states.rb:6-8,
      // trash.rb:61-62 sets @from_trash). The ActWriter models the row
      // reuse as :update, so the action row is corrected to the create
      // code (0) here; docs/actions-port-notes.md ("revival action type").
      await this.fetch.driver.query(
        "UPDATE card_actions SET action_type = ? WHERE id = ?",
        [actionTypeCode("create"), saved.actionId],
      );
      await this.expireAfterWrite({
        cardId: trashed.id,
        nameAfter: name,
        lexAfter: lex,
        verb: "create",
        codenameChanged: input.codename != null,
      });
      // INTEGRATION (card_references write path): refresh_references_out on
      // the revival save's content change (reference_events.rb:2-4,
      // `on: :save, changed: :content` — the revival is a :create save).
      await this.maybeRefreshReferencesOut({
        cardId: trashed.id,
        name,
        contentBefore: trashed.db_content,
        contentAfter: input.content ?? null,
      });
      // FINALIZE: a revived RULE card still cascades (event
      // :cascade_read_rule, set/right/read.rb:9-14 — the revival's name is
      // changing).
      const revivedRow = await this.fetchRowById(trashed.id);
      if (revivedRow !== undefined) {
        await cascadeReadRuleAfterRuleSave(this.readRuleDeps(), revivedRow, true);
      }
      return {
        cardId: trashed.id,
        actionId: saved.actionId,
        actId: saved.actId,
        verb: "create",
        name,
        subactions: await this.claimSides(sides.created, saved.actionId),
      };
    }

    const created = await writer.createCard({
      name: name.isSimple ? name.s : null,
      key: name.isSimple ? name.key : null,
      type_id: typeId,
      db_content: input.content ?? null,
      left_id: name.isSimple ? null : sides.leftId,
      right_id: name.isSimple ? null : sides.rightId,
      codename: input.codename ?? null,
      // set_read_rule store event (permissions.rb:1-5): a create save always
      // derives (the new row's name/type attributes are changes). New cards
      // skip the *self pattern (pattern/all.rb:27-29), so `isNew: true`.
      readRule: await deriveReadRuleRecord(this.readRuleDeps(), {
        name: name.s,
        typeId,
        leftId: sides.leftId,
        rightId: sides.rightId,
        isNew: true,
      }),
      superActionId: input.superActionId ?? null,
      isActCard: opts.isActCard,
    });
    await this.expireAfterWrite({
      cardId: created.cardId,
      nameAfter: name,
      lexAfter: lex,
      verb: "create",
      codenameChanged: input.codename != null,
    });
    // FINALIZE: a created RULE card cascades (event :cascade_read_rule,
    // set/right/read.rb:9-14 — a create's name is changing).
    const createdRow = await this.fetchRowById(created.cardId);
    if (createdRow !== undefined) {
      await cascadeReadRuleAfterRuleSave(this.readRuleDeps(), createdRow, true);
    }
    // INTEGRATION (card_references write path): refresh_references_out on
    // create (reference_events.rb:2-4) — fires only when content was
    // actually set (a nil db_content on a new row is "unchanged" in Ruby's
    // `changed: :content`).
    await this.maybeRefreshReferencesOut({
      cardId: created.cardId,
      name,
      contentBefore: null,
      contentAfter: input.content ?? null,
    });
    return {
      cardId: created.cardId,
      actionId: created.actionId,
      actId: created.actId,
      verb: "create",
      name,
      subactions: await this.claimSides(sides.created, created.actionId),
    };
  }

  // -----------------------------------------------------------------------
  // Save/Update — Card#update! (director/all.rb:59-61). Handles content
  // changes, type changes, renames (simple column rewrite / junction side
  // rewiring), trash-name obstacles, and cycle rejection. A save that
  // changes nothing persists nothing (null result — history events.rb:34-37).
  // -----------------------------------------------------------------------

  async updateCard(input: UpdateCardInput): Promise<ActionResult | null> {
    this.assertWritable();
    const row = await this.fetchRowById(input.cardId);
    // Card[id] of a missing or trashed card fetches nil (retrieval adds
    // trash = 0 — fetch/retrieve.rb#retrieval_from_db_query) and update!
    // on nil fails; revival-from-trash is the CREATE path's job.
    if (row === undefined || row.trash === 1) {
      throw new CardActionError("not-found", `no such card: ${input.cardId}`);
    }
    const card = await composeCardRecord(row, this.fetch.lexicon);
    await this.assertCanWrite(card);
    const writer = this.newWriter();
    const result = await this.updateInWriter(writer, row, input);
    await this.dispatchSavePathIntegrations(result);
    return result;
  }

  private async updateInWriter(
    writer: ActWriter,
    row: CardsRow,
    input: UpdateCardInput,
  ): Promise<ActionResult | null> {
    const before = cardFieldStateFromRow(row);
    const after: CardFieldState = { ...before };
    const currentName = await this.composedNameOf(row);
    const currentKey = this.keyOf(row, currentName);
    const newName = input.name !== undefined ? DeckoName.parse(input.name) : undefined;
    // "name is changing" per Card::Dirty (lib/card/dirty.rb:57-60,
    // DirtyNames#name_is_changing? = `super || left_id_is_changing? ||
    // right_id_is_changing?`): the name COLUMN changed, or — the compound
    // rename path — either side id changes. A compound VARIANT (same sides,
    // NULL column) is therefore a no-op, exactly as in Ruby.
    let nameChanged = false;
    if (newName !== undefined) {
      if ((newName.isSimple ? newName.s : null) !== before.name) {
        nameChanged = true;
      } else if (newName.isCompound) {
        const peekedLeft =
          newName.leftName !== undefined
            ? await this.fetch.lexicon.id(newName.leftName)
            : undefined;
        const peekedRight =
          newName.rightName !== undefined
            ? await this.fetch.lexicon.id(newName.rightName)
            : undefined;
        nameChanged =
          (peekedLeft ?? null) !== before.left_id || (peekedRight ?? null) !== before.right_id;
      }
    }

    if (nameChanged && newName !== undefined) {
      validateNameLegality(newName); // validate_legality_of_name
      await assertNameAvailable(this.fetch, newName, row.id); // validate_uniqueness_of_name
    }

    // extract_type_id! precedence (type.rb:81-92) — resolved before the
    // rename-conflict checks, which need the would-be type_id.
    const resolvedTypeId =
      input.typeId !== undefined || input.typeCode !== undefined || input.typeName !== undefined
        ? await resolveTypeId(this.fetch, input)
        : undefined;

    if (nameChanged && newName !== undefined) {
      // validate_renaming (name_events.rb:55-61) — skipped when the change
      // is only a new variant of the same key (`name_before_act == name`
      // is key equality, cardname.rb#==).
      if (newName.key !== currentKey) {
        if (input.content !== undefined && input.content !== (before.db_content ?? undefined)) {
          throw new CardActionError(
            "rename-conflict",
            "content cannot change in the same save as a rename",
          );
        }
        if (resolvedTypeId !== undefined && resolvedTypeId !== before.type_id) {
          throw new CardActionError(
            "rename-conflict",
            "type cannot change in the same save as a rename",
          );
        }
        // detect_illegal_compound_names / changing_existing_tag_to_compound?
        // (name_events.rb:56-58, :90-101): a simple card that is in use as
        // a tag (some live card has right_id = id) cannot become compound.
        if (before.name !== null && newName.isCompound) {
          const tags = await this.childIds("right", row.id);
          if (tags.length > 0) {
            throw new CardActionError(
              "rename-conflict",
              `illegal name change; existing names end in +${currentName?.s ?? before.name}`,
            );
          }
        }
      }
      // rename_in_trash (name_events.rb:62-66): a trashed card holding the
      // new key is renamed "<name>*trash" in this act first. Only simple
      // names carry a stored key, so compound renames never find one
      // (find_by_key_and_trash against a NULL key column matches nothing).
      if (newName.isSimple) {
        const obstacle = await findTrashedKeyObstacle(this.fetch.driver, newName.key);
        if (obstacle !== undefined && obstacle.id !== row.id) {
          await this.renameTrashObstacle(writer, obstacle, newName);
        }
      }
    }

    // Attribute merges.
    if (input.content !== undefined) after.db_content = input.content;
    if (resolvedTypeId !== undefined && resolvedTypeId !== before.type_id) {
      after.type_id = resolvedTypeId;
    }
    const lexBefore = this.lexOfRow(before);
    let lexAfter = lexBefore;
    let renameSides: ResolvedSides["created"] | undefined;

    if (nameChanged && newName !== undefined) {
      if (newName.isSimple) {
        after.name = newName.s;
        after.left_id = null; // assign_side_ids (lib/card/name/all.rb:51-56)
        after.right_id = null;
        lexAfter = newName.s;
      } else {
        // prepare_left_and_right on rename: rewire left_id/right_id; the
        // name/key columns stay NULL (post-2020 virtual names). The cycle
        // guard runs BEFORE any side creation so a rejection writes nothing.
        const peekedLeft =
          newName.leftName !== undefined
            ? await this.fetch.lexicon.id(newName.leftName)
            : undefined;
        const peekedRight =
          newName.rightName !== undefined
            ? await this.fetch.lexicon.id(newName.rightName)
            : undefined;
        await assertNotOwnAncestor(this.fetch.driver, row.id, [peekedLeft, peekedRight]);
        const sides = await this.ensureSides(writer, newName);
        after.name = null;
        after.left_id = sides.leftId;
        after.right_id = sides.rightId;
        lexAfter = this.lexOf(newName, sides.leftId, sides.rightId);
        // Side subcards join this act; their super_action_id points at this
        // card's action (patched below, once this action's id exists).
        renameSides = sides.created;
      }
    }

    // set_read_rule store event (permissions.rb:1-5, changed: %i[type_id
    // name]): the derivation runs only when the type or the name changed —
    // a content-only save keeps its stored read-rule columns, exactly as in
    // Ruby. The post-save name/sides feed the walk (real card: the *self
    // pattern applies). Stored on the same row UPDATE below.
    const typeChanged = after.type_id !== before.type_id;
    const readRule =
      nameChanged || typeChanged
        ? await deriveReadRuleRecord(this.readRuleDeps(), {
            name:
              nameChanged && newName !== undefined
                ? newName.s
                : currentName?.s ?? before.name ?? "",
            typeId: after.type_id,
            leftId: after.left_id,
            rightId: after.right_id,
          })
        : undefined;

    const saved = await writer.updateCard({
      cardId: row.id,
      before,
      after,
      key: nameChanged && newName !== undefined ? (newName.isSimple ? newName.key : null) : undefined,
      readRule,
      superActionId: input.superActionId ?? null,
      isActCard: true,
    });
    if (saved === null) return null; // no-op save: nothing persisted

    let subactions: CardActionSummary[] = [];
    if (renameSides !== undefined && renameSides.length > 0) {
      subactions = await this.claimSides(renameSides, saved.actionId);
    }

    const nameAfter = nameChanged ? newName : currentName;
    // Card#expire runs after EVERY save (phases.rb:56-57); the Lexicon
    // maintenance only on renames (update_lexicon is `changed: :name`,
    // name_events.rb:84-88), plus the per-descendant refresh of
    // rename_as_descendant (reference_events.rb:40-47).
    await this.expireAfterWrite({
      cardId: row.id,
      nameAfter,
      nameBefore: currentName,
      lexBefore: nameChanged ? lexBefore : undefined,
      lexAfter: nameChanged ? lexAfter : undefined,
      verb: "update",
    });
    // INTEGRATION (card_references write path): refresh_references_out on
    // update (reference_events.rb:2-4) — `changed: :content` fires only
    // when db_content actually changed in this save.
    await this.maybeRefreshReferencesOut({
      cardId: row.id,
      name: nameAfter,
      contentBefore: before.db_content,
      contentAfter: after.db_content,
    });
    // STORE tail (event :set_field_read_rules, permissions.rb:7-9 — after
    // :set_read_rule, on: :update, changed: :type_id): a type-changing save
    // re-derives every field card.
    if (typeChanged) {
      await cascadeAllFieldReadRules(this.readRuleDeps(), row.id);
    }
    // FINALIZE (event :cascade_read_rule, set/right/read.rb:9-14): a saved
    // RULE card whose name is changing re-derives its set's members and
    // every card pointing at it. The gate reads the SAVED row (the sides may
    // have been rewired by this rename).
    if (nameChanged) {
      const savedRow = await this.fetchRowById(row.id);
      if (savedRow !== undefined) {
        await cascadeReadRuleAfterRuleSave(this.readRuleDeps(), savedRow, true);
      }
    }
    if (nameChanged) await this.refreshDescendantCaches(row.id);
    return {
      cardId: row.id,
      actionId: saved.actionId,
      actId: saved.actId,
      verb: "update",
      name: nameAfter,
      subactions,
    };
  }

  /** rename_as_trash_obstacle (name_events.rb:76-81): the trashed obstacle
   *  gets `<name>*trash` and saves in the same act (its own action, no
   *  super_action — it is not a subcard, `@supercard` is nil). */
  private async renameTrashObstacle(
    writer: ActWriter,
    obstacle: CardsRow,
    newName: DeckoName,
  ): Promise<void> {
    const obstacleName = DeckoName.parse(`${newName.s}*trash`);
    const before = cardFieldStateFromRow(obstacle);
    const after: CardFieldState = { ...before, name: obstacleName.s };
    const saved = await writer.updateCard({
      cardId: obstacle.id,
      before,
      after,
      key: obstacleName.key,
      isActCard: false,
    });
    if (saved !== null) {
      await this.expireAfterWrite({
        cardId: obstacle.id,
        nameAfter: obstacleName,
        nameBefore: obstacle.name !== null ? DeckoName.parse(obstacle.name) : undefined,
        lexBefore: this.lexOfRow(before),
        lexAfter: obstacleName.s,
        verb: "update",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Delete — Card#delete! (trash.rb:11-21): an update save with trash:
  // true. Codenamed (system) cards are undeletable (validate_delete
  // :31-34); children are deleted recursively in the same act with
  // super_action_id pointing at their direct parent's action
  // (delete_children :52-59 -> each_child, descendants.rb:26-31).
  // -----------------------------------------------------------------------

  async deleteCard(input: DeleteCardInput): Promise<ActionResult | null> {
    this.assertWritable();
    const row = await this.fetchRowById(input.cardId);
    if (row === undefined) {
      throw new CardActionError("not-found", `no such card: ${input.cardId}`);
    }
    if (row.trash === 1) return null; // already trashed: no-op (ActWriter contract)
    const card = await composeCardRecord(row, this.fetch.lexicon);
    await this.assertCanWrite(card);
    if (row.codename !== null && row.codename !== "") {
      // validate_delete (trash.rb:31-34): "error: system card"
      throw new CardActionError(
        "protected-card",
        `card has a codename and cannot be deleted: ${card.name?.s ?? `~${row.id}`}`,
      );
    }
    const currentName = await this.composedNameOf(row);
    const writer = this.newWriter();
    const saved = await writer.trashCard({
      cardId: row.id,
      before: cardFieldStateFromRow(row),
      superActionId: input.superActionId ?? null,
    });
    if (saved === null) return null;

    // delete_children cascade. Ruby's subcard deletes run with
    // `validate: false` (director/store.rb:70-73), so child validate_delete
    // guards (codenames) do NOT re-fire down the tree — ported as-is.
    const subactions = await this.deleteChildren(writer, row.id, saved.actionId);
    await this.expireAfterWrite({
      cardId: row.id,
      nameAfter: currentName,
      verb: "delete",
    });
    // INTEGRATION (card_references write path): clear_references on delete
    // (reference_events.rb:28-31) — the referer's rows go away and the
    // deleted id is unmapped from other cards' rows (unmap_referees,
    // reference.rb:31-33).
    await clearReferencesOnDelete(this.fetch.driver, row.id);
    // FINALIZE (event :cascade_read_rule, set/right/read.rb:9-14): a deleted
    // RULE card's trash is changing, so its set's members and every card
    // pointing at it re-derive (their applicable rule is gone). Read rules
    // are PRESERVED on the deleted row itself — the clear_read_rule event is
    // commented out upstream (permissions.rb:159-164, "we have to preserve
    // read rules to make delete acts visible in recent changes").
    await cascadeReadRuleAfterRuleSave(this.readRuleDeps(), row, true);
    const result = {
      cardId: row.id,
      actionId: saved.actionId,
      actId: saved.actId,
      verb: "delete" as const,
      name: currentName,
      subactions,
    };
    await this.dispatchSavePathIntegrations(result);
    return result;
  }

  /** Breadth-first trash cascade: every live card whose left_id or right_id
   *  names the parent gets its own delete action in the same act, with
   *  super_action_id = its DIRECT parent's action id (super_action =
   *  `@supercard.current_action`, history events.rb:85-92). A visited set
   *  keeps diamond junctions single-deletion. */
  private async deleteChildren(
    writer: ActWriter,
    rootId: number,
    rootActionId: number,
  ): Promise<CardActionSummary[]> {
    const summaries: CardActionSummary[] = [];
    const visited = new Set<number>([rootId]);
    let frontier: { parentId: number; parentActionId: number }[] = [
      { parentId: rootId, parentActionId: rootActionId },
    ];
    while (frontier.length > 0) {
      const next: { parentId: number; parentActionId: number }[] = [];
      for (const { parentId, parentActionId } of frontier) {
        for (const child of await this.childRows(parentId)) {
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          const saved = await writer.trashCard({
            cardId: child.id,
            before: cardFieldStateFromRow(child),
            superActionId: parentActionId,
          });
          if (saved === null) continue; // unreachable: trash always flips
          // INTEGRATION (card_references write path): each cascaded child
          // is its own delete save in Ruby, so its clear_references fires
          // too (reference_events.rb:28-31).
          await clearReferencesOnDelete(this.fetch.driver, child.id);
          summaries.push({
            cardId: child.id,
            actionId: saved.actionId,
            verb: "delete",
            name: await this.composedNameOf(child),
          });
          next.push({ parentId: child.id, parentActionId: saved.actionId });
        }
      }
      frontier = next;
    }
    return summaries;
  }

  // -----------------------------------------------------------------------
  // internals
  // -----------------------------------------------------------------------

  /** The set_read_rule machinery's storage seam (card-mod-permissions
   *  set/all/permissions.rb:1-5 and set/right/read.rb) reads through the
   *  same driver/Lexicon pair as the write path. */
  private readRuleDeps(): ReadRuleWriteDeps {
    return { driver: this.fetch.driver, fetch: this.fetch };
  }

  /** The basic permission gate, sync half: anonymous actors are read-only
   *  (auth/current.rb:43-47 signed_in? = current_id != AnonymousID). */
  private assertWritable(): void {
    if (this.actor === null) {
      throw new CardActionError(
        "anonymous-actor",
        "write action rejected: no signed-in account (anonymous sessions are read-only)",
      );
    }
    if (this.actor.name === ANONYMOUS_ACTOR_NAME) {
      throw new CardActionError(
        "anonymous-actor",
        `write action rejected: ${ANONYMOUS_ACTOR_NAME} is read-only`,
      );
    }
  }

  /** The permission seam (async half): the optional canWrite hook. The full
   *  ok? rule resolution (card-mod-permissions set/all/permissions.rb:37-51,
   *  event :check_permissions :22-25) is a later stream and replaces this
   *  hook, not the anonymous gate. */
  private async assertCanWrite(card: CardRecord): Promise<void> {
    if (this.canWrite === undefined || this.actor === null) return;
    const allowed = await this.canWrite(card, this.actor);
    if (!allowed) {
      throw new CardActionError(
        "permission-denied",
        `actor ${this.actor.name} may not write card ${card.name?.s ?? String(card.id)}`,
      );
    }
  }

  private newWriter(): ActWriter {
    if (this.actor === null) {
      throw new CardActionError("anonymous-actor", "no actor for write");
    }
    return new ActWriter({
      driver: this.fetch.driver,
      actorId: this.actor.id,
      ipAddress: this.ipAddress,
      now: this.clock,
    });
  }

  /** prepare_left_and_right (name_events.rb:68-73) + prepare_new_side
   *  (:118-125): resolve the side ids of a compound name; missing sides
   *  become subcard creates in the SAME act. Sides dedupe by key so "A+A"
   *  resolves one card for both sides (Ruby: Director.card(sidename)
   *  returns the already-staged subcard, name_events.rb:121). Left is
   *  resolved first (prepare_side :left runs before :right, :74-79). */
  private async ensureSides(writer: ActWriter, name: DeckoName): Promise<ResolvedSides> {
    const created: (CardActionSummary & { actId: number })[] = [];
    if (!name.isCompound) return { leftId: null, rightId: null, created };
    const idsByKey = new Map<string, number>();
    const resolveSide = async (sideName: DeckoName | undefined): Promise<number | null> => {
      if (sideName === undefined) return null;
      const key = sideName.key;
      const known = idsByKey.get(key);
      if (known !== undefined) return known;
      let id = await this.fetch.lexicon.id(sideName);
      if (id === undefined) {
        const sub = await this.createInWriter(writer, { name: sideName.s }, { isActCard: false });
        id = sub.cardId;
        created.push(sub);
      }
      idsByKey.set(key, id);
      return id;
    };
    const leftId = await resolveSide(name.leftName);
    const rightId = await resolveSide(name.rightName);
    return { leftId, rightId, created };
  }

  /** Patch the direct subcards' super_action_id to the supercard's action
   *  (events.rb:85-92). Ruby assigns the association before insert
   *  (belongs_to autosave); the port creates the sides first (their ids are
   *  needed for the junction row), so the linkage lands as one follow-up
   *  UPDATE — same rows, different insert order (documented divergence). */
  private async claimSides(
    created: readonly (CardActionSummary & { actId: number })[],
    superActionId: number,
  ): Promise<CardActionSummary[]> {
    if (created.length > 0) {
      const ids = created.map((c) => c.actionId);
      await this.fetch.driver.query(
        `UPDATE card_actions SET super_action_id = ? WHERE id IN (${ids
          .map(() => "?")
          .join(", ")})`,
        [superActionId, ...ids],
      );
    }
    return created.map(({ actId: _actId, ...summary }) => summary);
  }

  /** reference_events.rb:40-47 rename_as_descendant: every DESCENDANT of a
   *  renamed card re-expires and updates its Lexicon entry — its composed
   *  name changed virtually while its row stayed untouched. No row writes
   *  happen here (that is the post-2020 junction-truth answer; see
   *  docs/actions-port-notes.md). */
  private async refreshDescendantCaches(rootId: number): Promise<void> {
    const visited = new Set<number>([rootId]);
    let frontier = [rootId];
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const parentId of frontier) {
        for (const child of await this.childRows(parentId)) {
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          const name = await this.composedNameOf(child);
          if (name !== undefined) {
            const record = newCardRecord(name); // expire (reference_events.rb:44)
            record.id = child.id;
            this.fetch.expireCard(record);
            // Lexicon.update self (reference_events.rb:45) — the add half
            // only; descendants carry no lex_before_act.
            if (child.left_id !== null && child.right_id !== null) {
              this.fetch.lexicon.write(child.id, name, [child.left_id, child.right_id]);
            }
          }
          next.push(child.id);
        }
      }
      frontier = next;
    }
  }

  private async fetchRowById(id: number): Promise<CardsRow | undefined> {
    const result = await this.fetch.driver.query<CardsRow>(
      "SELECT * FROM cards WHERE id = ? LIMIT 1",
      [id],
    );
    return result.rows[0];
  }

  /** The composed name of a row — lib/card/name/all.rb:12-14 (compound
   *  names compose through the Lexicon; simple cards read the column). */
  private async composedNameOf(row: CardsRow): Promise<DeckoName | undefined> {
    if (row.left_id !== null && row.left_id !== undefined) {
      const composed = await this.fetch.lexicon.composeName(row.left_id, row.right_id);
      if (composed !== undefined) return composed;
    }
    return row.name !== null && row.name !== undefined ? DeckoName.parse(row.name) : undefined;
  }

  /** The effective key of a row (lib/card/name/all.rb:17-19). */
  private keyOf(row: CardsRow, composedName: DeckoName | undefined): string {
    if (row.left_id !== null && row.left_id !== undefined) {
      return composedName?.key ?? row.key ?? "";
    }
    return row.key ?? "";
  }

  /** descendants.rb:26-31 each_child — live rows whose left OR right is
   *  the card (the delete cascade and the rename-descendant walk). */
  private async childRows(parentId: number): Promise<CardsRow[]> {
    const result = await this.fetch.driver.query<CardsRow>(
      "SELECT * FROM cards WHERE (left_id = ? OR right_id = ?) AND trash = 0",
      [parentId, parentId],
    );
    return result.rows;
  }

  /** descendants.rb:32-40 child_ids (one side). */
  private async childIds(side: "left" | "right", cardId: number): Promise<number[]> {
    const result = await this.fetch.driver.query<Pick<CardsRow, "id">>(
      `SELECT id FROM cards WHERE ${side}_id = ? AND trash = 0`,
      [cardId],
    );
    return result.rows.map((r) => r.id);
  }

  /** card.lex: the name string for simple cards, [left_id, right_id] for
   *  compound cards (lexicon.rb module doc); undefined when unresolvable. */
  private lexOf(
    name: DeckoName,
    leftId: number | null,
    rightId: number | null,
  ): Lex | undefined {
    if (name.isSimple) return name.s;
    if (leftId === null || rightId === null) return undefined;
    return [leftId, rightId];
  }

  private lexOfRow(
    state: Pick<CardFieldState, "name" | "left_id" | "right_id">,
  ): Lex | undefined {
    if (state.left_id !== null && state.right_id !== null) {
      return [state.left_id, state.right_id];
    }
    return state.name ?? undefined;
  }

  /** INTEGRATION seam for the card_references write path: the
   *  refresh_references_out event body runs only under Ruby's `changed:
   *  :content` condition (reference_events.rb:2-4) — a save whose
   *  db_content is identical before/after skips it, exactly here. */
  private async maybeRefreshReferencesOut(input: {
    cardId: number;
    name: DeckoName | undefined;
    contentBefore: string | null | undefined;
    contentAfter: string | null | undefined;
  }): Promise<void> {
    if (input.name === undefined) return;
    if ((input.contentAfter ?? null) === (input.contentBefore ?? null)) return;
    await refreshReferencesOut(
      this.fetch.driver,
      this.fetch.lexicon,
      input.cardId,
      input.name,
      input.contentAfter ?? null,
    );
  }

  /** Post-save cache maintenance: Card#expire after every save
   *  (phases.rb:56-57 -> cache/all.rb:17-24 — both key versions via
   *  name_before_act, the "~id" key, the left card); the Lexicon cache
   *  maintenance only where Ruby does it — creates and renames
   *  (update_lexicon is `changed: :name`, name_events.rb:84-88 ->
   *  lexicon.rb:33-41/86-91). Deletes clean nothing (Ruby has no caller
   *  for Lexicon.delete — documented wart, ported as-is). */
  private async expireAfterWrite(input: {
    cardId: number;
    nameAfter: DeckoName | undefined;
    nameBefore?: DeckoName;
    lexBefore?: Lex;
    lexAfter?: Lex;
    verb: "create" | "update" | "delete";
    codenameChanged?: boolean;
  }): Promise<void> {
    const { cardId, nameAfter, nameBefore, lexBefore, lexAfter, verb } = input;
    if (nameAfter !== undefined) {
      // Card#expire — a minimal record suffices: expire reads id, name and
      // name_before_act only (cache/all.rb:66-108).
      const record = newCardRecord(nameAfter);
      record.id = cardId;
      if (nameBefore !== undefined) record.nameBeforeAct = nameBefore;
      this.fetch.expireCard(record);
    }
    if (verb === "create") {
      // update_lexicon: create -> Lexicon.add (lexicon.rb:86-91).
      if (nameAfter !== undefined && lexAfter !== undefined) {
        this.fetch.lexicon.write(cardId, nameAfter, lexAfter);
      }
    } else if (verb === "update" && lexBefore !== undefined) {
      // update_lexicon: update -> Lexicon.update = add + expire_lex
      // (lexicon.rb:33-36, :93-95).
      this.fetch.lexicon.deleteFor(undefined, lexBefore);
      if (nameAfter !== undefined && lexAfter !== undefined) {
        this.fetch.lexicon.write(cardId, nameAfter, lexAfter);
      }
    }
    // verb "delete": Ruby has no Lexicon.delete caller on the trash path.
    if (input.codenameChanged === true) {
      // reset_codename_cache (mod/core/set/all/codename.rb:9-13).
      this.fetch.codenames.resetCache();
    }
  }
}
