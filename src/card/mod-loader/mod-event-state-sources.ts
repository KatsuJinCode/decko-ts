// The per-mod ModEventCard state sources (mod-event-card-state.ts) that the
// deck boot registers. One source per mod whose `when:` predicates read
// state the engine does not already put on the event card.
//
// ADDING A PREDICATE'S STATE: add the predicate to the owning mod's table
// (its `<mod>ModEventPredicates` export), and — if it reads anything the
// engine's `eventCard` does not already carry — add or extend that mod's
// source below. A predicate that reads only what `eventCard` supplies (the
// name, the action, the dirty set, the act's skip/trigger state) needs no
// source at all; that is the cheap case.

import type { ModEventCard } from "./mod-manifest.js";
import {
  registerModEventCardStateSource,
  type ModEventCardState,
  type ModEventCardStateContext,
} from "./mod-event-card-state.js";
import { envValue } from "../debug-flags.js";
import {
  rubyBucketFromContent,
  rubyModFromContent,
  rubyStorageTypeFromContent,
} from "./mods/card-mod-carrierwave.js";

/** card/mod/core/set/all/ — the predicates set_autoname (autoname.rb:1),
 *  save_draft + set_default_content (content.rb:7/:13), validate_name +
 *  validate_key (name_events.rb:3/:38) and the cardtype event
 *  (type/cardtype.rb:19-20) consult.
 *
 *  - `Env.params` rides the save for every request path, which is what
 *    draft? (content.rb:17) reads.
 *  - `db_content_before_act` is the port's `changedFields`: use_default_content?
 *    (content.rb:30) asks `!db_content_changed?`, i.e. content was NOT
 *    among the changing columns.
 *  - type_id_before_act is the cardtype predicate's subject
 *    (type/cardtype.rb:11). */
function coreSource(
  card: ModEventCard,
  ctx: ModEventCardStateContext,
): ModEventCardState {
  // set_autoname's ladder is NOT ported: a create that arrives without a
  // name is lexed to `~<id>` by the engine rather than named from the deck's
  // autoname rule (autoname.rb:1-8). Ruby's `name.blank?` half of autoname?
  // therefore never holds, which coreModEventPredicates states directly; no
  // field carries it here.
  return ctx.params !== undefined ? { params: ctx.params } : {};
}

/** mod/history/set/all/history — actionable? / finalize_action? /
 *  rollback_request? (events.rb:53/:61, revision.rb:29).
 *
 *  The three read act-local ivars the history writer owns: whether an
 *  action is open for this card, whether a revert was requested, and
 *  whether this card records history at all (history.rb:6). The engine's
 *  write path is what sets them, so they arrive on the context as the
 *  history writer's own view of the act. */
function historySource(
  card: ModEventCard,
  ctx: ModEventCardStateContext,
): ModEventCardState {
  return {
    // act_card? (director/all.rb:42): the engine's saves are top-level acts.
    isActCard: ctx.isActCard,
    // history? (history.rb:6) defaults true; the account mod's no-history
    // types opt out, and the engine already computes that set for its own
    // dropHistory call (account-fields.ts NO_HISTORY_RIGHT_CODENAMES).
    history: true,
  };
}

/** mod/carrierwave/set/abstract/attachment/** — the storage-type and
 *  attachment facts the mount's `when:` conditions read.
 *
 *  Every field below is Ruby's own method read once per save:
 *
 *  - `storage_type` (01_storage_type.rb:45-47): the assigned type wins
 *    (the writer at :40-43 also raises @explicit_storage_type), else a new
 *    card takes storage_type_from_config (:20-22) and an existing one
 *    storage_type_from_content (:102-116). An ATTACHING save is the
 *    `assign_set_specific_attributes` case (attachment.rb:93-99): the
 *    mount's file is assigned and content is reset to nil, so the
 *    content arm sees nil and the config arm answers.
 *  - `current` (01_storage_type.rb:12-14 `refresh true`) — the row this
 *    save is replacing, read through the card's own content grammar. Its
 *    bucket/mod are `false` for a non-cloud / non-coded card (cloud.rb:10,
 *    coded.rb:16), which is what storage_changed? compares against.
 *  - `bucket` / `mod` on the saving card (cloud.rb:8-11, coded.rb:16-18).
 *  - `attachment.db_content` (attachment.rb:40-45): the mount's stored
 *    identifier — the one the engine's own attachment write produced when
 *    a file rides the save, else the identifier already on the row.
 *  - `action_id_of_cached_upload` (advanced_api.rb:37 adds it as a card
 *    attribute) rides the save input.
 *  - ENV["STORE_CODED_FILES"] (card_mount.rb:59-63) is read here so the
 *    predicate stays a pure function of the card; Ruby reads the
 *    environment at the same moment.
 *
 *  NOT populated: `bucket_config[:read_only]` (cloud.rb:9-11, :118-120).
 *  The port has no bucket configuration at all — no cloud backend, no
 *  Cardio.config.file_buckets — so `load_bucket_config` (:70-72) returns
 *  the {} it returns for a card with no bucket, and the key reads nil. */
function carrierwaveSource(
  card: ModEventCard,
  ctx: ModEventCardStateContext,
): ModEventCardState {
  // Cardio.config.file_storage (01_storage_type.rb:20-22), :local when the
  // deck configures none.
  const configured = ctx.fileStorage ?? "local";
  const save = ctx.saveInput;
  const content = card.dbContent ?? null;
  const before = card.dbContentBeforeAct ?? null;
  const riding = save?.attachmentRides === true;

  // storage_type (01_storage_type.rb:45-47) + the mount's own reset of the
  // content when a file is assigned (attachment.rb:95-97).
  const storageType =
    save?.storageType ??
    (riding || card.action === "create"
      ? configured
      : rubyStorageTypeFromContent(content, configured));
  // `current` — the card as it was before this save.
  const currentType =
    card.action === "create" ? configured : rubyStorageTypeFromContent(before, configured);
  const currentBucket: string | false =
    currentType === "cloud" ? rubyBucketFromContent(before) ?? false : false;
  const currentMod: string | false =
    currentType === "coded" ? rubyModFromContent(before) ?? false : false;
  // The saving card's bucket / mod (cloud.rb:8-11 `cloud? && (...)`,
  // coded.rb:16-18 `coded? && mod_from_content`).
  const savedBucket: string | false =
    storageType === "cloud"
      ? save?.bucket ?? rubyBucketFromContent(content) ?? false
      : false;
  const savedMod: string | false =
    storageType === "coded" ? save?.mod ?? rubyModFromContent(content) ?? false : false;

  return {
    storageType,
    ...(save?.storageType !== undefined ? { explicitStorageType: save.storageType } : {}),
    ...(save?.mod !== undefined ? { assignedMod: save.mod } : {}),
    currentStorageType: currentType,
    currentStorageBucket: currentBucket,
    currentStorageMod: currentMod,
    savedStorageBucket: savedBucket,
    savedStorageMod: savedMod,
    // ENV["STORE_CODED_FILES"] (card_mount.rb:59-63). Any value at all is
    // true in Ruby; an unset variable is nil.
    storeCodedFiles: envValue("STORE_CODED_FILES") !== undefined,
    // attachment.file presence and the mount's dirty flag
    // (attachment.rb:52 `attachment.file.present?`, :77-79
    // `file_is_changing?`) — assigning the mount is what makes both true,
    // so one field answers each.
    attachmentPresent: riding,
    attachmentIsChanging: riding,
    ...(save?.actionIdOfCachedUpload !== undefined
      ? { actionIdOfCachedUpload: save.actionIdOfCachedUpload }
      : {}),
    // attachment.db_content (attachment.rb:40-45): with a file on the save
    // it is the identifier the mount wrote — at the :finalize stage
    // incorrect_identifier? reads, the engine's attachment store has
    // already run and the column carries exactly that identifier
    // (card-action-engine.ts's :store_attachment! + :correct_identifier
    // pair); without one it is the identifier already on the row.
    attachmentIdentifierContent: riding ? (content ?? undefined) : (before ?? undefined),
  };
}

/** Register every source this branch owns. Called once from the deck boot
 *  (default-mod-deck.ts) alongside the predicate tables, so the two halves
 *  of a mod's `when:` support are wired in the same place. */
export function registerDeckModEventCardStateSources(): void {
  registerModEventCardStateSource({
    modName: "core",
    setPaths: ["all/autoname", "all/content", "all/name_events", "type/cardtype"],
    load: coreSource,
  });
  registerModEventCardStateSource({
    modName: "history",
    setPaths: ["all/history", "all/history/events", "all/history/revision"],
    load: historySource,
  });
  registerModEventCardStateSource({
    modName: "carrierwave",
    setPaths: [
      "abstract/attachment",
      "abstract/attachment/00_upload_cache",
      "abstract/attachment/01_storage_type",
      "abstract/attachment/cloud",
      "abstract/attachment/coded",
      "abstract/attachment/local",
    ],
    load: carrierwaveSource,
  });
}