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
// rule-based default content and templates, the ancestor-timestamp id feed
// (update_ancestor_timestamps), subcard staging beyond side creation /
// trash-obstacle renames / child deletion cascades.
// Read-rule columns ARE derived here (set-read-rule.ts — the port of
// card-mod-permissions' set_read_rule store event, permissions.rb:1-5, plus
// the update_read_rule / cascade_read_rule machinery): every save that
// changes type or name fills cards.read_rule_id / read_rule_class, and a
// saved rule card re-derives its set's members and every card pointing at
// it. Write-permission ENFORCEMENT runs here too (assertCanWrite ->
// saveTaskVerdictForCard, the ok_to_create?/ok_to_update?/ok_to_delete?
// algebra of view-task-rules.ts against the deck's rule cards and the
// actor's parties; the anonymous gate stays the sync half) — the canWrite
// hook is a host-side EXTRA gate on top, never an override.
// Reference maintenance status: card_references population on
// create/update (refresh_references_out), cleanup on delete
// (clear_references), the referee-side backfill (refresh_references_in —
// map_referees on every name-bearing save; its unmap_referees arm is
// unused until the save path learns `skip:`), and the rename-side referer
// rewrite (update_referer_content, update-referer-content.ts) ARE built
// here. update_referer_references_out — the rewrite's skip twin — is
// exported but not yet wired (no skip machinery on this save path).

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
  type AttachmentInput,
  type CanWriteHook,
  type CardActionSummary,
  type CreateCardInput,
  type DeleteCardInput,
  type SubcardInput,
  type UpdateCardInput,
} from "./types.js";
import {
  assertNameAvailable,
  findTrashedCardByLex,
  findTrashedKeyObstacle,
  validateNameLegality,
} from "./name-validation.js";
import { knownTypeSpec, resolveTypeId } from "./type-resolution.js";
import { assertNotOwnAncestor } from "./junction-cycle-detection.js";
import {
  cascadeAllFieldReadRules,
  cascadeReadRuleAfterRuleSave,
  deriveReadRuleRecord,
  type ReadRuleWriteDeps,
} from "../permissions/set-read-rule.js";
import {
  readPermissionStatements,
  readPermissionStateFromViewerResults,
  type ReadViewer,
} from "../permissions/read-rules.js";
import {
  saveTaskVerdictForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
  type WriteTask,
} from "../permissions/view-task-rules.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import {
  ruleContentForCard,
  ruleWalkPatternInput,
} from "./rule-content-walk.js";
import { isNewCard } from "../fetch/card-record.js";
import {
  buildFollowNotifyHook,
  defaultFollowNotifyDeps,
  defaultTransport,
  expandActionResultToSavePathEvents,
  makeNotifyContext,
  runIntegrationHooks,
  savePathEventFromAction,
  type FollowerResolver,
  type NotifyTransport,
  type SavePathIntegrationHook,
} from "../notify/index.js";
import {
  detectAttachmentExtension,
  lastContentActionIdFromIdentifier,
  localAttachmentIdentifier,
} from "../attachments/attachment-content.js";
import {
  createVersionsFor,
  mountUsesImageUploader,
  renditionFileNames,
} from "../attachments/image-renditions.js";
import type { AttachmentStore } from "../attachments/attachment-store.js";
import { changeValueForField, trackedFieldIndex } from "../history/change.js";
import {
  clearReferencesOnDelete,
  refreshReferencesOut,
} from "./refresh-references-out.js";
import { refreshReferencesIn } from "./refresh-references-in.js";
import { updateRefererContent } from "./update-referer-content.js";
import {
  runModEventStage,
  type ModEventContext,
  type ModEventRuntime,
  type ModEventSaveInput,
  type ModEventStageReport,
  type ModEventRecaptchaVerify,
} from "../mod-loader/mod-event-dispatch.js";
import {
  recaptchaSiteverifyGet,
  RECAPTCHA_CARDIO_CONFIG_DEFAULTS,
} from "../mod-loader/mods/card-mod-recaptcha.js";

import type {
  ModEngineHost,
  ModEventCard,
  ModEventFn,
  ModEventStage,
} from "../mod-loader/mod-manifest.js";
import { isEditConflict } from "../mod-loader/mods/card-mod-history.js";
import { expireRuleResolutionCache } from "../permissions/read-rules.js";

/** The attachment mounts by type codename — the two sets that include
 *  Abstract::Attachment and therefore run its events: `attachment :file`
 *  (card-mod-carrierwave set/type/file.rb:1, File cards codename `file`)
 *  and `attachment :image` (set/type/image.rb:1, Image cards codename
 *  `image`). validate_file_exist's attachment_name and the multipart
 *  route's card[<mount>] param names derive from these declarations. */
const ATTACHMENT_MOUNTS: Readonly<Record<string, string>> = {
  file: "file",
  image: "image",
};

/** I18n :history_error_not_latest_revision - card-mod-history-0.20.0
 *  config/locales/en.yml:2, "changes not based on latest revision". The
 *  message detect_conflict puts on the card's :conflict error
 *  (set/all/history/events.rb:20); the byte is the ORACLE's
 *  (fixtures/captured/edit-forms.json conflict_probe errors_conflict). */
const HISTORY_ERROR_NOT_LATEST_REVISION = "changes not based on latest revision";

/** The janitor behaviors whose built-in call sites STAND DOWN when the
 *  same-named event is registered at the save path's modEvents runtime —
 *  the real batch (mod/core/set/all/reference_events.rb, ported in
 *  core-mod.ts): Ruby has no built-in copy of these, the event IS the
 *  code. Everything else (the trash/lexicon/type built-ins) keeps running
 *  until its event body is ported — a registered STUB never suppresses its
 *  built-in. */
const EVENT_TAKEOVER_BUILTINS: ReadonlySet<string> = new Set([
  "refresh_references_out",
  "update_referer_content",
  "update_referer_references_out",
  "refresh_references_in",
  "clear_references",
]);

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
  /** The host-side EXTRA permission gate. The rule-based ok? enforcement
   *  (saveTaskVerdictForCard — *create/*update/*delete walks with the
   *  actor's parties) runs first; a provided canWrite is then consulted
   *  per action with the card record (a new-card placeholder for creates)
   *  and may deny further. It can never allow a write the rules denied.
   *  Consulted for ANONYMOUS sessions too — the hook's actor is then the
   *  anonymous codename card (the id the write is attributed to); a
   *  port-only seam (Ruby's permission chain has no host hook), so the
   *  engine's contract is the only contract. */
  canWrite?: CanWriteHook;
  /** The save-path integration seam (card-mod-follow notify.rb — the
   *  integration stage runs AFTER expire, phases.rb:33-39). When empty or
   *  omitted, saves dispatch nothing and the engine behaves exactly as
   *  before. Failures inside hooks are logged, never raised
   *  (email_template.rb:6's rescue Net::SMTPError shape). */
  integrationHooks?: SavePathIntegrationHook[];
  /** The follower lookup the DEFAULT follow-notify hook uses when
   *  integrationHooks is omitted (docs/notify-port-notes.md, "save-path
   *  registration line"): defaultFollowerResolver(fetch) — Ruby's
   *  follow-rule algebra (card-mod-follow set/all/follow/follower_ids.rb
   *  + set/all/follow/followed_by.rb). Injecting an override here keeps
   *  hosts on fixed test resolvers while the template/auth halves stay
   *  deck-backed. Ignored when integrationHooks is provided. */
  followerResolver?: FollowerResolver;
  /** The transport the integration hooks send through (default: the
   *  notify module's NoopTransport default). */
  notifyTransport?: NotifyTransport;
  /** Log sink for integration dispatch lines. */
  notifyLogger?: (line: string) => void;
  /** The attachment storage seam (E4.4.a — card-mod-carrierwave's
   *  CarrierWave::Storage::File port). Required for saves that carry an
   *  `attachment` input; saves without one behave exactly as before. */
  attachmentStore?: AttachmentStore;
  /** The deck's file_storage config (Cardio.config.file_storage port;
   *  undefined = the :local default, the oracle deck's
   *  config_file_storage_default). Shapes validate_file_exist's web? arm:
   *  on a :web deck a File/Image create takes its content as the source
   *  URL ("url is missing" when blank); on :local/:cloud/:coded decks the
   *  attachment arm always applies to creates (01_storage_type.rb:55-57 —
   *  a NEW card's storage_type is storage_type_from_config, never from
   *  content). The render engine's field of the same name models the same
   *  config. */
  fileStorage?: string;
  /** THE ModEventFn EXECUTION SEAM (mod-loader/mod-event-dispatch.ts):
   *  registered set-module events fire at their declared director stages
   *  of every save this engine performs. When the runtime's registry
   *  carries one of the real-batch janitor names (EVENT_TAKEOVER_BUILTINS),
   *  this engine's built-in call for that behavior stands down — the
   *  registered body IS the mechanism, Ruby's shape. Unregistered names
   *  keep the built-in fallback, so a runtime with an empty registry (or
   *  one without the core mod) behaves exactly as before. ABSENT (every
   *  pre-existing caller) -> no dispatch at all, byte-identical behavior. */
  modEvents?: ModEventRuntime;
  /** The recaptcha config port (Cardio.config.recaptcha_* — the seven keys
   *  card-mod-recaptcha lib/card/mod/recaptcha.rb:1-10 initializes).
   *  ABSENT = no keys configured = recaptcha_keys? false = the guard is
   *  off (recaptcha.rb:46-48) — the pre-port behavior, byte-identical.
   *  The event :recaptcha validate wiring reads this when the mod's
   *  runtime is composed (modEvents with the recaptcha registry). */
  recaptcha?: CardActionRecaptchaConfig;
}

/** The recaptcha config + guard inputs the save path turns into the
 *  event's guard snapshot (ModEventRecaptchaGuard). Ruby reads the same
 *  values off Card.config / Env / Auth at validate time
 *  (recaptcha.rb:16-23, 68-72). */
export interface CardActionRecaptchaConfig {
  /** Card.config.recaptcha_site_key / recaptcha_secret_key (:46-48). */
  siteKey?: string;
  secretKey?: string;
  /** Cardio.config.recaptcha_minimum_score (:37; default 0.5,
   *  lib/card/mod/recaptcha.rb:8). */
  minimumScore?: number;
  /** Cardio.config.recaptcha_verify_url (lib/card/mod/recaptcha.rb:9;
   *  default the Google siteverify endpoint). */
  verifyUrl?: string;
  /** Auth.always_ok? (:20) — bot/bypass mode. The engine has no bot-act
   *  surface; hosts that save under one pass true. Default false (the web
   *  request shape, auth.rb's always_ok default). */
  alwaysOk?: boolean;
  /** Auth.needs_setup? (:21) — true until the deck's first admin exists.
   *  Default false (a set-up deck; the seeded decks the engine saves into
   *  are set up). */
  needsSetup?: boolean;
  /** `rule(:captcha)` for the card being saved (recaptcha.rb:22). UNDEFINED
   *  (the default) = Ruby's mechanism: the storage walk resolves the
   *  *captcha rule card from the deck's own rule cards (ruleContentForCard,
   *  rule-content-walk.ts — rule/all.rb:5-15 + 66-73, the candidate walk in
   *  pattern precedence). A function = the host's override read (resolved
   *  per save, awaited); a plain value = a pre-resolved rule content; both
   *  WIN over the walk (the host seam for decks whose rule cards do not
   *  live in this engine's storage). Whatever resolves goes through
   *  Card::Rule.toggle (rule.rb:11-13) — no resolved rule = guard off. */
  captchaRuleContent?:
    | unknown
    | ((cardName: string) => unknown | Promise<unknown>);
  /** The ::Recaptcha.get seam (recaptcha.rb:41-44). Default: the mod's
   *  real recaptchaSiteverifyGet (a live HTTPS GET to the verify URL);
   *  tests inject stubs. */
  verify?: ModEventRecaptchaVerify;
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
  private readonly followerResolver: FollowerResolver | undefined;
  private readonly notifyTransport: NotifyTransport | undefined;
  private readonly notifyLogger: ((line: string) => void) | undefined;
  /** The write-task permission state (who_can universe + actor parties),
   *  built lazily on this engine's first gated save — the render side's
   *  ensureTaskVerdicts model (one batch pair per engine, never per save). */
  private writeTaskState: ViewTaskState | undefined;
  private readonly attachmentStore: AttachmentStore | undefined;
  /** The deck's file_storage config port (CardActionEngineOptions.
   *  fileStorage; undefined = :local). */
  private readonly fileStorage: string | undefined;
  /** The execution seam's runtime (CardActionEngineOptions.modEvents).
   *  Undefined on every engine that does not opt in. */
  private readonly modEvents: ModEventRuntime | undefined;
  /** The recaptcha config port (CardActionEngineOptions.recaptcha).
   *  Undefined = no keys configured = the captcha guard is off
   *  (recaptcha.rb:46-48). */
  private readonly recaptchaConfig: CardActionRecaptchaConfig | undefined;
  /** event :recaptcha's captcha_used state (self/captcha.rb:7-13 — the
   *  *captcha card's @captcha_used ivar, marked by the first validation in
   *  a request, recaptcha.rb:52, and read by validate_recaptcha? :71 so
   *  sibling cards skip). Ruby's lifetime is the request; the engine's is
   *  the instance ("construct per request"). */
  private captchaUsedThisRequest = false;

  constructor(fetchEngine: FetchEngine, options: CardActionEngineOptions) {
    this.fetch = fetchEngine;
    this.actor = options.actor;
    this.clock = options.now ?? (() => new Date());
    this.ipAddress = options.ipAddress ?? null;
    this.canWrite = options.canWrite;
    this.integrationHooks = options.integrationHooks;
    this.followerResolver = options.followerResolver;
    this.notifyTransport = options.notifyTransport;
    this.notifyLogger = options.notifyLogger;
    this.attachmentStore = options.attachmentStore;
    this.fileStorage = options.fileStorage;
    this.modEvents = options.modEvents;
    this.recaptchaConfig = options.recaptcha;
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
   * save-path hook. An anonymous actor (Ruby: notifications carry the
   * acting user; anonymous writes notify no one) -> dispatch nothing.
   * Hook failures are logged inside runIntegrationHooks, never raised —
   * mail must not break the save that triggered it.
   *
   * Hook list (docs/notify-port-notes.md, "Save-path registration
   * line"): the host's integrationHooks when provided; otherwise the
   * built-in follow-notify hook — Ruby registers
   * notify_followers_after_save unconditionally (card-mod-follow
   * set/all/notify.rb:13-16), so the default save path resolves real
   * followers with the rule-algebra walk (defaultFollowNotifyDeps ->
   * defaultFollowerResolver) and mails only when the deck has follow
   * rules + a follower_notification_email template. An explicit `[]`
   * still means "no integrations" (?? semantics), which is what every
   * pre-existing caller without hooks observes.
   */
  private async dispatchSavePathIntegrations(
    result: ActionResult | null,
    opts: { actCardActionOmitted?: boolean } = {},
  ): Promise<void> {
    if (result === null) return;
    if (await this.isAnonymousSession()) return;
    const hooks = this.integrationHooks ?? [
      buildFollowNotifyHook(
        defaultFollowNotifyDeps(this.fetch, { followers: this.followerResolver }),
      ),
    ];
    if (hooks.length === 0) return;
    // Unreachable (isAnonymousSession returned false); narrows for the
    // actor read.
    if (this.actor === null) return;
    const actor = { id: this.actor.id, name: this.actor.name, email: null };
    // The act's events: the primary action + its subactions — EXCEPT when
    // the act card's own save was a no-op (actCardActionOmitted): then the
    // subcard actions only, exactly Ruby's act.actions walk (the act card
    // recorded no action; main_action falls to the act's first action,
    // mod/history lib/card/act.rb). actCardName = act.card, the act-level
    // hooks' mail context (account.rb:18).
    const events = opts.actCardActionOmitted === true
      ? result.subactions.map((sub) =>
          savePathEventFromAction({ ...sub, actId: result.actId, subactions: [] }, actor, result.actId, false),
        )
      : expandActionResultToSavePathEvents(result, actor, false);
    await runIntegrationHooks({
      actId: result.actId,
      actor,
      silent: false,
      events,
      actCardName: result.name?.s ?? null,
      hooks,
      context: makeNotifyContext(this.notifyTransport ?? defaultTransport, this.notifyLogger),
    });
  }

  /** subcards.rb:1-16 — "API to create/update/delete additional cards
   *  together with the main card". Each key resolves RELATIVE ("+author"
   *  -> "<main card>+author", the form's subfield shape) or absolute; a
   *  missing card is created, a present one updated, both within THIS
   *  save's act (director/store.rb:37-58 — subcards save in the
   *  supercard's Director run). superActionId chains the subcard action
   *  to the supercard's action (history events.rb:85-92). A subcard save
   *  that changes nothing produces no action (events.rb:34-37). A
   *  trashed name REVIVES through the create path (pull_from_trash!,
   *  trash.rb:57-62). */
  private async saveSubcardsInWriter(
    writer: ActWriter,
    mainName: DeckoName | undefined,
    subcards: Record<string, SubcardInput> | undefined,
    superActionId: number | null,
  ): Promise<(CardActionSummary & { actId: number })[]> {
    const saved: (CardActionSummary & { actId: number })[] = [];
    if (subcards === undefined) return saved;
    for (const [key, sub] of Object.entries(subcards)) {
      const fullName = key.startsWith("+") ? `${mainName?.s ?? ""}${key}` : key;
      const existing = await this.fetch.fetchByName(fullName);
      const existingRow =
        existing?.id !== undefined && existing.id !== null
          ? await this.fetchRowById(existing.id)
          : undefined;
      if (existingRow !== undefined && existingRow.trash === 0) {
        const updated = await this.updateInWriter(
          writer,
          existingRow,
          {
            cardId: existingRow.id,
            // null content on a subcard = no content argument (the update
            // input's "no change" spelling — the scenarios never clear a
            // plus via nil; Ruby's explicit-nil clear is not a pinned arm).
            content: sub.content ?? undefined,
            typeId: sub.typeId,
            typeCode: sub.typeCode,
            typeName: sub.typeName,
            attachment: sub.attachment,
            superActionId,
          },
          undefined,
          { isActCard: false },
        );
        if (updated !== null) {
          saved.push({
            cardId: updated.cardId,
            actionId: updated.actionId,
            actId: updated.actId,
            verb: updated.verb,
            name: updated.name,
          });
        }
      } else {
        const created = await this.createInWriter(
          writer,
          {
            name: fullName,
            content: sub.content,
            typeId: sub.typeId,
            typeCode: sub.typeCode,
            typeName: sub.typeName,
            attachment: sub.attachment,
            superActionId,
          },
          { isActCard: false },
        );
        saved.push({
          cardId: created.cardId,
          actionId: created.actionId,
          actId: created.actId,
          verb: created.verb,
          name: created.name,
        });
      }
    }
    return saved;
  }

  // -----------------------------------------------------------------------
  // Attachment finalization (E4.4.a — card-mod-carrierwave save events).
  //
  // Ruby's attachment save runs, in event order (set/abstract/attachment.rb
  // + lib/carrier_wave/card_mount.rb): :save_original_filename (:20-24 —
  // the action's comment carries the original filename), :write_identifier
  // (:37-39 — self.content = attachment.db_content, the
  // ~<card_id>/<action_id><ext> identifier), the :store phase (the row +
  // action INSERT), then :store_attachment! (card_mount.rb:24-27 — the
  // carrierwave store writes the bytes) and :correct_identifier (:13-17 —
  // `update_column :db_content, attachment.db_content`, a raw column write
  // fixing the stand-in ids the pre-insert identifier pass necessarily
  // carried).
  //
  // This port inverts the same outcome into the writer's shape: the Act
  // Writer assigns action ids by autoincrement, so the final identifier is
  // only computable AFTER the write — exactly Ruby's reason for
  // :correct_identifier. The engine therefore writes the rows first (the
  // update path seeds the db_content change row with the Ruby-shaped
  // intermediate `~<card>/<previous action><ext>` — FileCardUploader#
  // action_id resolves last_content_action_id during prepare_to_store),
  // then stores the bytes at <files_dir>/<card_id>/<action_id><ext>
  // (paths.rb:14-16 + path.rb:33-39) and rewrites the identifier to the
  // final action id. A create leaves NO change rows (first_create? — the
  // writer's lazy backfill picks the final column value up on the first
  // later update, history.rb:38-40), matching Ruby's create shape; an
  // update's existing db_content change row is rewritten to the final
  // identifier so revision selection (SelectedAction#
  // last_content_action_id, set/type/file.rb:8-13) resolves the bytes of
  // exactly the revision that stored them.
  //
  // DISCLOSED (code-read, not oracle-captured — no CarrierWave capture
  // exists; the oracle harness performs read-side captures only, see
  // docs/actions-port-notes.md): the change row of an update save carries
  // the FINAL identifier here; Ruby's intermediate dance around the column
  // write cannot be byte-verified without an oracle capture. The FINAL
  // observable state (column + identifier parse + stored path + comment)
  // is the pinned contract.
  // -----------------------------------------------------------------------

  /** Store one upload's bytes and rewrite the just-written rows to the
   *  final identifier. Runs BEFORE the engine's cache expiry (the card
   *  record the Lexicon caches must already carry the final content). */
  private async finalizeAttachment(
    cardId: number,
    actionId: number,
    attachment: AttachmentInput,
    priorIdentifier: string | null,
    verb: "create" | "update",
  ): Promise<string> {
    if (this.attachmentStore === undefined) {
      // A programming/hosting error, not a domain rejection: an attachment
      // input arrived on an engine constructed without a storage seam.
      throw new Error(
        "attachment save requires the engine's attachmentStore option (CardActionEngineOptions.attachmentStore)",
      );
    }
    const ext = detectAttachmentExtension(attachment.originalFilename, attachment.bytes);
    // The uploader class selection (set/type/image.rb:1 vs
    // set/type/file.rb:1): an IMAGE-typed card stores the rendition set —
    // the -original spelling + one file per version (image_card_uploader.rb
    // :16-27, :44-57; create_versions? = ext != ".svg", image.rb:4-7).
    // File cards store exactly one plain file. The card row's type codename
    // decides (two SELECTs; attachment saves are already multi-statement).
    const cardRow = await this.fetchRowById(cardId);
    const typeRow = cardRow !== undefined ? await this.fetchRowById(cardRow.type_id) : undefined;
    const codename = typeRow?.codename ?? undefined;
    const renditionNames =
      codename !== undefined && codename !== "" && mountUsesImageUploader(codename) && createVersionsFor(ext)
        ? renditionFileNames(actionId, ext)
        : undefined;
    const stored = await this.attachmentStore.store({
      cardId,
      actionId,
      ext,
      bytes: attachment.bytes,
      renditionNames,
    });
    const identifier = localAttachmentIdentifier(cardId, actionId, ext);

    // :correct_identifier (attachment.rb:13-17): update_column :db_content —
    // the raw column write, no history event, no timestamp bump.
    await this.fetch.driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      identifier,
      cardId,
    ]);
    if (verb === "update") {
      // The writer recorded a db_content change row (the intermediate
      // identifier made the field "changed"); rewrite it to the final
      // value so the action resolves to the bytes it stored.
      const result = await this.fetch.driver.query(
        "UPDATE card_changes SET value = ? WHERE card_action_id = ? AND field = ?",
        [
          changeValueForField("db_content", identifier),
          actionId,
          trackedFieldIndex("db_content"),
        ],
      );
      if ((result.rowsAffected ?? 0) === 0 && priorIdentifier !== null) {
        // Defensive: the expected row is missing (never observed). Insert
        // rather than leave the action content-blind.
        await this.fetch.driver.query(
          "INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)",
          [actionId, trackedFieldIndex("db_content"), changeValueForField("db_content", identifier)],
        );
      }
    }
    return identifier;
  }

  /** The attachment input's prior identifier for the update path's
   *  intermediate seeding (see the finalizer's block comment): the
   *  ~<card>/<previous action><ext> form FileCardUploader#action_id
   *  produces at prepare_to_store time (:202-206 last_content_action_id;
   *  the stand-in epoch arm exists but is unobservable here — the
   *  intermediate is always rewritten). */
  private attachmentIntermediateIdentifier(
    cardId: number,
    priorContent: string | null | undefined,
    attachment: AttachmentInput,
  ): string {
    const ext = detectAttachmentExtension(attachment.originalFilename, attachment.bytes);
    const priorAction = lastContentActionIdFromIdentifier(priorContent) ?? 0;
    return localAttachmentIdentifier(cardId, priorAction, ext);
  }

  /** event :validate_file_exist, :validate, on: :create, skip: :allowed
   *  (card-mod-carrierwave set/abstract/attachment.rb:26-34):
   *
   *    return if empty_ok?
   *    if web?
   *      errors.add "url is missing" if content.blank?
   *    elsif !attachment.file.present?
   *      errors.add attachment_name, "is missing"
   *    end
   *
   *  The event lives in Abstract::Attachment, included by exactly the two
   *  mount-typed sets (`attachment :file` set/type/file.rb:1, `attachment
   *  :image` set/type/image.rb:1) — other types never run it. web? is
   *  storage_type == :web (01_storage_type.rb:63-65), and a NEW card's
   *  storage_type is storage_type_from_config (:55-57) — card[content]
   *  never makes a create web, so on a :local deck the attachment arm
   *  fires regardless of content. Message bytes: ActiveRecord::RecordInvalid
   *  wraps save! failures as "Validation failed: #{full_messages.join(', ')}"
   *  (activerecord-7.2.3.2 validations.rb:24-27 + locale/en.yml:17
   *  record_invalid), each full message being "%{attribute} %{message}"
   *  over the humanized attribute (activemodel-7.2.3.2 error.rb:15-56):
   *  "File is missing" / "Image is missing"; the web arm's ONE-ARG
   *  errors.add("url is missing") takes the default :invalid message, so
   *  its full message computes to "Url is missing is invalid" (gem-source
   *  computation, not live-verified).
   *
   *  empty_ok (attachment.rb:3,89-91 — the revision-restore arm,
   *  :121-126) has no port surface yet: the engine's restore path runs
   *  through UPDATE, which this create-only event never touches. */
  private async validateFileExist(input: CreateCardInput, typeId: number): Promise<void> {
    const typeRow = await this.fetchRowById(typeId);
    const codename = typeRow?.codename ?? undefined;
    const mount = codename !== undefined ? ATTACHMENT_MOUNTS[codename] : undefined;
    if (mount === undefined) return;
    if (this.fileStorage === "web") {
      // the web arm: errors.add "url is missing" if content.blank?
      const content = input.content ?? "";
      if (content === "" || /^\s*$/.test(content)) {
        throw new CardActionError(
          "attachment-missing",
          "Validation failed: Url is missing is invalid",
        );
      }
      return;
    }
    if (input.attachment === undefined) {
      // the attachment arm: errors.add attachment_name, "is missing"
      const humanized = mount.charAt(0).toUpperCase() + mount.slice(1);
      throw new CardActionError("attachment-missing", `Validation failed: ${humanized} is missing`);
    }
  }

  // -----------------------------------------------------------------------
  // Set — Card.create! (director/card_class.rb:5-9: `card = new opts;
  // card.save!`). Junction names auto-create their side cards as subcards
  // in the same act; a name whose lex matches a trashed row revives that
  // row (manage_trash -> pull_from_trash!, trash.rb:23-25/:57-62).
  // -----------------------------------------------------------------------

  async createCard(input: CreateCardInput): Promise<ActionResult> {
    try {
      return await this.createCardInner(await knownTypeSpec(this.fetch, input));
    } finally {
      this.pendingSaveInput = undefined;
    }
  }

  private async createCardInner(input: CreateCardInput): Promise<ActionResult> {
    const name = DeckoName.parse(input.name ?? "");    // The anonymous-create arm: Ruby's create permission chain has NO
    // signed-in clause. An anonymous session's Auth.as_id IS the Anonymous
    // card (auth/current.rb:7-9 + auth/proxy.rb:33-35), and ok_to_create?
    // (card-mod-permissions set/all/permissions.rb:120-125) runs for it
    // exactly as for any other actor. The recorded site's own history is
    // the proof the arm is live: 694 cards with creator_id = the anonymous
    // codename card (id 15), 86 of them Signup — whose
    // kfnvyby+*type+*create rule (6580) grants Anyone (its card_references
    // row: referee_id 8). The acting id is the signed-in account or the
    // Anonymous card; the RULE check (assertCanWrite) then decides
    // allow/deny. Only a deck that cannot even form the anonymous actor
    // (no anonymous codename card — a fragment seed; Ruby could not form
    // Card[AnonymousID] there either) keeps the legacy signed-in-only
    // rejection. Update and delete ride the same acting-id pattern
    // (actingIdForWrite) — Ruby's chain rules all three tasks identically.
    const actingId = await this.actingIdForWrite();
    if (actingId === undefined) this.assertWritable();
    // extract_type_id! runs at Card.new time (type.rb:87-96), BEFORE the
    // validate-stage ok? check — so the permission gate sees the WOULD-BE
    // type and the *type+*create rule candidates resolve for the card
    // actually being created.
    const typeId = await resolveTypeId(this.fetch, { ...input, name });
    const placeholder = newCardRecord(name, { typeId });
    await this.assertCanWrite(placeholder, "create");
    const writer = this.newWriter(actingId);
    const result = await this.createInWriter(writer, input, {
      isActCard: true,
      resolvedTypeId: typeId,
    });
    // subcards.rb:1-16: the subcards ride this save's act (director/
    // store.rb:37-58) — the "create Book card with plusses" submission.
    let finalResult = result;
    const subResults = await this.saveSubcardsInWriter(writer, name, input.subcards, result.actionId);
    if (subResults.length > 0) {
      finalResult = { ...result, subactions: [...result.subactions, ...subResults] };
    }
    // II (director.rb:26): the integrate seam runs BEFORE the notify hooks
    // (Ruby's notify_followers is itself an integration event,
    // card-mod-follow set/all/notify.rb:13-16).
    await this.dispatchEventStage(
      "integrate",
      this.eventCard({
        name,
        id: result?.cardId,
        key: name.key,
        action: "create",
        actId: result?.actId,
        trash: false,
        typeId,
      }),
    );
    await this.dispatchSavePathIntegrations(finalResult);
    return finalResult;
  }

  /** The create implementation, bound to an existing writer so side
   *  subcards join the caller's act (Ruby: subcards save within the
   *  supercard's Director run, director/store.rb:37-58). `resolvedTypeId`
   *  rides in when the caller already paid resolveTypeId (the gated act
   *  card); side subcards resolve their own. */
  private async createInWriter(
    writer: ActWriter,
    input: CreateCardInput,
    opts: { isActCard: boolean; resolvedTypeId?: number },
  ): Promise<ActionResult> {
    const name = DeckoName.parse(input.name ?? "");
    // The execution seam's validation-phase stages (director.rb:12-16
    // VI/VP/VV). A new card has no id yet (director.rb:47 "has id" from
    // store on) and no dirty set; every core event at these stages is a
    // stub, so the walks fire nothing observable until those bodies
    // land — the seams are the point.
    // The event card's type: the resolved type once known (type-scoped set
    // modules, e.g. set/type/number.rb's :validate_number, apply by it).
    let eventTypeId = opts.resolvedTypeId;
    const validationCard = (): ModEventCard =>
      this.eventCard({
        name,
        key: name.key,
        dbContent: input.content,
        action: "create",
        typeId: eventTypeId,
      });
    await this.dispatchEventStage("initialize", validationCard());
    await this.dispatchEventStage("prepare_to_validate", validationCard());
    validateNameLegality(name); // validate_legality_of_name (name_events.rb:35-47)
    const typeId =
      opts.resolvedTypeId ??
      (await resolveTypeId(this.fetch, { ...input, name })); // extract_type_id! + type_id_from_code + default
    eventTypeId = typeId;
    await assertNameAvailable(this.fetch, name, undefined); // validate_uniqueness_of_name (:19-26)
    await this.validateFileExist(input, typeId); // validate_file_exist (attachment.rb:26-34)
    // event :recaptcha (card-mod-recaptcha set/all/recaptcha.rb:50-55) is a
    // :validate-stage event — its guard snapshot must exist before this
    // walk (prepareRecaptchaSaveInput no-ops without the mod/config). The
    // walk's rule read evaluates on the acting (new) card with its resolved
    // type — recaptcha.rb:22 rule(:captcha).
    await this.prepareRecaptchaSaveInput(
      input.recaptchaToken,
      "create",
      await ruleWalkPatternInput(this.fetch, { name, isNew: true, typeId }),
    );
    await this.dispatchEventStage("validate", validationCard());

    // prepare_left_and_right (name_events.rb:68-73): compound names resolve
    // their sides; missing sides become subcard creates in this act
    // (prepare_new_side :118-125).
    const sides = await this.ensureSides(writer, name);

    // manage_trash -> pull_from_trash! (trash.rb:23-25, :57-62): a matching
    // trashed row is revived (its id reused) instead of a fresh INSERT.
    const lex = this.lexOf(name, sides.leftId, sides.rightId);
    const trashed =
      lex === undefined ? undefined : await findTrashedCardByLex(this.fetch.driver, lex);
    // SP (director.rb:20): manage_trash/set_autoname's stage.
    // add_comment (comment.rb:4-12) at the SP position — the append
    // mutates input.content BEFORE the write branches read it (both the
    // revival's after.db_content and the fresh INSERT compose from it).
    await this.applyAddComment(input, "create", name, input.content ?? undefined, (c) => {
      input.content = c;
    });
    await this.dispatchEventStage("prepare_to_store", validationCard());

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
      // SS (director.rb:21): the store-stage events run before the row
      // write in Ruby (set_content mutates pre-insert, director/store.rb).
      await this.dispatchEventStage(
        "store",
        this.eventCard({
          name,
          id: trashed.id,
          key: name.key,
          dbContent: input.content,
          action: "create",
          trash: false,
          typeId,
          changedFields: [
            "name",
            "type_id",
            "trash",
            ...((input.content ?? null) !== (trashed.db_content ?? null) ? ["db_content"] : []),
          ],
        }),
      );
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
      // :store_attachment! + :correct_identifier for the revival save. The
      // attachment events run on EVERY save of a mount-typed card
      // (card-mod-carrierwave set/abstract/attachment.rb:20-39 — on: :save,
      // no new_record? guard), and pull_from_trash! (trash.rb:57-62) routes
      // the revival through the normal save stack, so a revived File/Image
      // card's upload stores its bytes and its identifier exactly like any
      // other save. The finalizer's "update" arm rewrites THIS action's
      // db_content change row (the revival writer recorded the
      // attachment-less after state) to the final identifier, keeping the
      // module's pinned contract: the action resolves to the bytes it
      // stored. Runs BEFORE the cache expiry, as on the fresh-create path.
      if (input.attachment !== undefined) {
        await this.finalizeAttachment(
          trashed.id,
          saved.actionId,
          input.attachment,
          trashed.db_content ?? null,
          "update",
        );
      }
      await this.expireAfterWrite({
        cardId: trashed.id,
        nameAfter: name,
        lexAfter: lex,
        verb: "create",
        codenameChanged: input.codename != null,
      });
      // FINALIZE (card_references write path) — the SEAM with takeover:
      // the registered refresh_references_out / refresh_references_in
      // bodies (core-mod.ts, reference_events.rb:2-4/:22-25) replace these
      // built-ins when their names are registered; the revival's
      // refresh_references_in is a :create save, so only the map_referees
      // arm runs either way (the unmap arm needs action == :update).
      await this.runFinalizeEvents(
        this.eventCard({
          name,
          id: trashed.id,
          key: name.key,
          dbContent: input.content,
          action: "create",
          trash: false,
          typeId,
          changedFields: [
            "name",
            "type_id",
            "trash",
            ...((input.content ?? null) !== (trashed.db_content ?? null) ? ["db_content"] : []),
          ],
        }),
        [
          [
            "refresh_references_out",
            () =>
              this.maybeRefreshReferencesOut({
                cardId: trashed.id,
                name,
                contentBefore: trashed.db_content,
                contentAfter: input.content ?? null,
              }),
          ],
          [
            "refresh_references_in",
            () => refreshReferencesIn(this.fetch.driver, trashed.id, name.key),
          ],
        ],
      );
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

    // SS (director.rb:21): store-stage events before the row write.
    await this.dispatchEventStage(
      "store",
      this.eventCard({
        name,
        key: name.key,
        dbContent: input.attachment !== undefined ? null : (input.content ?? null),
        action: "create",
        trash: false,
        typeId,
        changedFields: [
          "name",
          "type_id",
          ...(input.attachment !== undefined || input.content != null ? ["db_content"] : []),
          ...(input.codename != null ? ["codename"] : []),
        ],
      }),
    );
    const created = await writer.createCard({
      name: name.isSimple ? name.s : null,
      key: name.isSimple ? name.key : null,
      type_id: typeId,
      // assign_set_specific_attributes (attachment.rb:90-97): an attaching
      // save RESETS content — the identifier replaces any content argument.
      db_content: input.attachment !== undefined ? null : (input.content ?? null),
      left_id: name.isSimple ? null : sides.leftId,
      right_id: name.isSimple ? null : sides.rightId,
      codename: input.codename ?? null,
      // :save_original_filename (attachment.rb:20-24): the action comment
      // carries the original upload filename on attachment creates.
      comment: input.attachment?.originalFilename ?? null,
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
    // :store_attachment! + :correct_identifier (the finalizer's block
    // comment): bytes land at files/<card>/<action><ext> and the column
    // carries the final identifier — BEFORE the cache expiry so the
    // Lexicon's card record is never stale.
    const attachmentIdentifier =
      input.attachment !== undefined
        ? await this.finalizeAttachment(
            created.cardId,
            created.actionId,
            input.attachment,
            null,
            "create",
          )
        : null;
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
    // FINALIZE — the SEAM with takeover (reference_events.rb:2-4/:22-25):
    // the registered janitor bodies replace these built-ins when their
    // names are registered at the runtime. refresh_references_out fires
    // only when content was actually set (a nil db_content on a new row is
    // "unchanged" in Ruby's `changed: :content`); refresh_references_in is
    // a :create save, so only the map_referees arm runs either way.
    await this.runFinalizeEvents(
      this.eventCard({
        name,
        id: created.cardId,
        key: name.key,
        dbContent: attachmentIdentifier ?? (input.content ?? null),
        action: "create",
        trash: false,
        typeId,
        actId: created.actId,
        changedFields: [
          "name",
          "type_id",
          ...(input.attachment !== undefined || input.content != null ? ["db_content"] : []),
          ...(input.codename != null ? ["codename"] : []),
        ],
      }),
      [
        [
          "refresh_references_out",
          () =>
            this.maybeRefreshReferencesOut({
              cardId: created.cardId,
              name,
              contentBefore: null,
              contentAfter: attachmentIdentifier ?? input.content ?? null,
            }),
        ],
        [
          "refresh_references_in",
          () => refreshReferencesIn(this.fetch.driver, created.cardId, name.key),
        ],
      ],
    );
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
    try {
      return await this.updateCardInner(await knownTypeSpec(this.fetch, input));
    } finally {
      this.pendingSaveInput = undefined;
    }
  }

  private async updateCardInner(input: UpdateCardInput): Promise<ActionResult | null> {
    // The anonymous-update arm: same chain as create — ok_to_update?
    // (permissions.rb:148-153 permit(:update) + the type-change clause)
    // has NO signed-in clause; an anonymous session's Auth.as_id IS the
    // Anonymous card (auth/current.rb:7-9 + proxy.rb:33-35). The recorded
    // site's history proves the arm live: 1,808 live cards with
    // updater_id = the anonymous codename card (id 15). Only a fragment
    // seed (no anonymous codename card to act as) keeps the legacy
    // signed-in-only rejection.
    const actingId = await this.actingIdForWrite();
    if (actingId === undefined) this.assertWritable();
    const row = await this.fetchRowById(input.cardId);
    // Card[id] of a missing or trashed card fetches nil (retrieval adds
    // trash = 0 — fetch/retrieval_from_db_query) and update! on nil fails;
    // revival-from-trash is the CREATE path's job.
    if (row === undefined || row.trash === 1) {
      throw new CardActionError("not-found", `no such card: ${input.cardId}`);
    }
    // extract_type_id! precedence (type.rb:81-92) — resolved BEFORE the ok?
    // gate, because Ruby evaluates permissions in the validate stage with
    // the new attributes already assigned: the type-change clause
    // (ok_to_update? :148-153) needs type_id_changed?, and the *type rule
    // candidates of a type-changing save read the ASSIGNED type. Undefined
    // when the save carries no type spec (no spec = no type change).
    const hasTypeSpec =
      input.typeId !== undefined ||
      input.typeCode !== undefined ||
      input.typeName !== undefined;
    const resolvedTypeId = hasTypeSpec
      ? await resolveTypeId(this.fetch, {
          ...input,
          name:
            input.name !== undefined ? DeckoName.parse(input.name) : row.name ?? undefined,
        })
      : undefined;
    const typeChanged = resolvedTypeId !== undefined && resolvedTypeId !== row.type_id;
    const card = await composeCardRecord(row, this.fetch.lexicon);
    // The rename clause: Ruby evaluates the validate-stage permission check
    // (event :check_permissions, permissions.rb:22-26) on the card with its
    // ASSIGNED attributes — Card#name= writes the new name and re-derives
    // left_id/right_id (name/all.rb:21-28, assign_side_ids :76-84), and
    // assign_attributes' refresh_set_modules calls reset_patterns
    // (mod/core/set/all/assign_attributes.rb:63-68), so the set patterns —
    // and with them rule_lookup_keys (lib/card/set/pattern/all.rb:22-29,
    // :66-68) — rebuild from the NEW name before ok_to_update? runs
    // (permissions.rb:148-153). A name-changing save is therefore judged
    // under the ASSIGNED name's anchors, not the old row's (the port's own
    // captcha walk below already reads the assigned name). Passing the
    // assigned name here closed the one-shot-rename over-allow; the rename
    // clause additionally gates the sides the assigned name will CREATE —
    // the act's new sidecards judged ok?(:create) in Ruby's validate stage
    // (prepare_left_and_right, name_events.rb:67-72 -> prepare_new_side
    // :137-142; check_permissions permissions.rb:22-26).
    await this.assertCanWrite(card, "update", {
      typeChanged,
      assignedTypeId: typeChanged ? resolvedTypeId : undefined,
      assignedName:
        input.name !== undefined ? DeckoName.parse(input.name).s : undefined,
    });
    // detect_conflict (card-mod-history set/all/history/events.rb:19-22) is
    // a :validate-stage event, so it runs after ok_to_update? and BEFORE
    // anything persists - a stale-revision save is refused whole.
    await this.assertNoEditConflict(row.id, input.lastActionIdBeforeEdit);
    // save_draft (mod/core/set/all/content.rb:8-15) is a :store-stage event
    // on :update when :draft? - `save_content_draft content; abort :success`.
    // The abort rolls the cards row save back, so the draft's ONLY durable
    // effect is its own act + draft action + db_content change (the writer's
    // saveDraft, card-mod-history set/all/history.rb:88-94). The stages after
    // :store (finalize, integrate, notify) never run on an aborted act.
    if (input.draft === true) {
      // save_draft (mod/core/set/all/content.rb:7-10) is a :store-stage
      // event on :update when :draft? — by the time it runs, the whole
      // validate stage (event :recaptcha included, recaptcha.rb:50-55) has
      // already run, so Ruby refuses a guarded draft before the abort. The
      // draft seam therefore runs the SAME validate walk as the full save
      // before storing (this branch used to return before any
      // validate-stage event, storing attacker content with zero siteverify
      // calls — the bypass the shared walk closes). A refusal here throws
      // before saveDraftInWriter persists anything.
      await this.runUpdateValidationWalk(
        row,
        input,
        cardFieldStateFromRow(row),
        resolvedTypeId,
      );
      return this.saveDraftInWriter(this.newWriter(actingId), row, input);
    }
    const writer = this.newWriter(actingId);
    let result = await this.updateInWriter(writer, row, input, resolvedTypeId);
    // subcards.rb:1-16: the subcards ride this save's act — the multiedit
    // shape (the plusses in the main card's form submission). Ruby saves
    // them within the supercard's Director run (director/store.rb:37-58);
    // a no-change subcard produces no action (events.rb:34-37).
    const subResults = await this.saveSubcardsInWriter(
      writer,
      await this.composedNameOf(row),
      input.subcards,
      result?.actionId ?? null,
    );
    if (result === null && subResults.length > 0) {
      // The act card's own save was a no-op but its subcards changed: the
      // ACT still exists naming the main card (Ruby's act.card — the mail
      // context, account.rb:18) and main_action falls to the act's first
      // action (mod/history lib/card/act.rb main_action =
      // action_on(card_id) || actions.first). The synthesized result
      // marks the act card's action omitted so the notify dispatch
      // carries only the subcard actions.
      result = {
        cardId: row.id,
        actionId: subResults[0].actionId,
        actId: subResults[0].actId,
        verb: "update",
        name: await this.composedNameOf(row),
        subactions: subResults,
        actCardActionOmitted: true,
      };
    } else if (result !== null && subResults.length > 0) {
      result = { ...result, subactions: [...result.subactions, ...subResults] };
    }
    // II (director.rb:26): the integrate seam before the notify hooks (see
    // the create path's note).
    await this.dispatchEventStage(
      "integrate",
      this.eventCard({
        name: result?.name,
        id: result?.cardId ?? row.id,
        action: "update",
        actId: result?.actId,
        trash: false,
        typeId: row.type_id,
      }),
    );
    await this.dispatchSavePathIntegrations(result, {
      actCardActionOmitted: result?.actCardActionOmitted === true,
    });
    return result;
  }

  /** The update save's validate-stage walk (director.rb:12-16), shared by
   *  the full update path and the DRAFT seam. Ruby runs the whole validate
   *  stage — initialize, prepare_to_validate, the name legality/uniqueness
   *  checks, event :recaptcha (card-mod-recaptcha set/all/recaptcha.rb:50-55,
   *  a :validate event) — before ANY :store-stage event, and save_draft
   *  (mod/core/set/all/content.rb:7-10) is a :store-stage event on :update:
   *  a guarded draft is refused in Ruby because validate already ran when
   *  the draft aborts. Extracted so the draft seam runs the same walk
   *  before storing (the draft branch previously returned before any
   *  validate-stage event). The walk sees
   *  the PRE-merge state (Ruby's card carries the ASSIGNED attributes
   *  through these stages; this port's merges happen in the store phase —
   *  a documented fidelity bound of the seam placement) and returns the
   *  derived names the store phase needs. */
  private async runUpdateValidationWalk(
    row: CardsRow,
    input: UpdateCardInput,
    before: CardFieldState,
    preResolvedTypeId?: number,
  ): Promise<{
    currentName: DeckoName | undefined;
    currentKey: string;
    newName: DeckoName | undefined;
    nameChanged: boolean;
  }> {
    const currentName = await this.composedNameOf(row);
    const currentKey = this.keyOf(row, currentName);
    const newName = input.name !== undefined ? DeckoName.parse(input.name) : undefined;
    // At validate time Ruby's card already carries the ASSIGNED attributes
    // (Card#update! assigns, then the director runs the stages): the event
    // card shows the incoming content and type, and the content/type
    // columns changing, so changed: conditions and type-scoped set modules
    // see the save as Ruby does.
    const incomingContent = input.content ?? row.db_content;
    const incomingTypeId = preResolvedTypeId ?? row.type_id;
    const validationChanged: string[] = [];
    if (input.content !== undefined && input.content !== row.db_content) validationChanged.push("db_content");
    if (incomingTypeId !== row.type_id) validationChanged.push("type_id");
    const validationCard = (): ModEventCard =>
      this.eventCard({
        name: newName ?? currentName,
        id: row.id,
        key: currentKey,
        dbContent: incomingContent,
        action: "update",
        trash: false,
        typeId: incomingTypeId,
        nameBeforeAct: currentName?.s,
        changedFields: validationChanged,
      });
    await this.dispatchEventStage("initialize", validationCard());
    await this.dispatchEventStage("prepare_to_validate", validationCard());
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
    // event :recaptcha (card-mod-recaptcha set/all/recaptcha.rb:50-55) is a
    // :validate-stage event — its guard snapshot must exist before this
    // walk (prepareRecaptchaSaveInput no-ops without the mod/config). The
    // later add_comment SP application replaces pendingSaveInput with the
    // comment input; this walk has already consumed the recaptcha one. The
    // rule walk evaluates on the acting card under its ASSIGNED name and
    // type (a type-changing save reads the would-be type, the
    // patternInputFor convention) — recaptcha.rb:22 rule(:captcha).
    const recaptchaWalkName = newName ?? currentName ?? DeckoName.parse("");
    const recaptchaTypeId =
      preResolvedTypeId !== undefined && preResolvedTypeId !== row.type_id
        ? preResolvedTypeId
        : row.type_id;
    await this.prepareRecaptchaSaveInput(
      input.recaptchaToken,
      "update",
      await ruleWalkPatternInput(this.fetch, {
        name: recaptchaWalkName,
        id: row.id,
        isNew: false,
        typeId: recaptchaTypeId,
      }),
    );
    await this.dispatchEventStage("validate", validationCard());
    return { currentName, currentKey, newName, nameChanged };
  }

  private async updateInWriter(
    writer: ActWriter,
    row: CardsRow,
    input: UpdateCardInput,
    preResolvedTypeId?: number,
    opts: { isActCard?: boolean } = {},
  ): Promise<ActionResult | null> {
    const before = cardFieldStateFromRow(row);
    const after: CardFieldState = { ...before };
    const { currentName, currentKey, newName, nameChanged } =
      await this.runUpdateValidationWalk(row, input, before, preResolvedTypeId);

    // extract_type_id! precedence (type.rb:81-92) — already resolved by the
    // gated act-card path (preResolvedTypeId); side/subcard callers resolve
    // here. Resolved before the rename-conflict checks, which need the
    // would-be type_id.
    const resolvedTypeId =
      preResolvedTypeId ??
      (input.typeId !== undefined || input.typeCode !== undefined || input.typeName !== undefined
        ? await resolveTypeId(this.fetch, { ...input, name: newName ?? row.name })
        : undefined);

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
    // add_comment (comment.rb:4-12) at the SP position — the pending
    // content is the merged value (the requested content, else the row's
    // current db_content, exactly Ruby's self.content on the update card);
    // the append mutates both input.content and after.db_content BEFORE
    // the writer call below persists them.
    await this.applyAddComment(
      input,
      "update",
      newName ?? currentName ?? DeckoName.parse(""),
      after.db_content ?? undefined,
      (c) => {
        input.content = c;
        after.db_content = c;
      },
    );
    if (input.attachment !== undefined) {
      // :write_identifier (attachment.rb:37-39) at prepare_to_store: the
      // identifier computed BEFORE the action row exists uses
      // last_content_action_id (FileCardUploader#action_id :202-206) — the
      // Ruby-shaped intermediate the finalizer rewrites to the final
      // action id right after the write. An attaching save discards any
      // content argument (assign_set_specific_attributes :90-97).
      after.db_content = this.attachmentIntermediateIdentifier(
        row.id,
        before.db_content,
        input.attachment,
      );
    }
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
        // prepare_obstructed_side (name_events.rb:144-150): a peeked side
        // that IS this card is the OBSTRUCTED SELF side — ensureSides below
        // restructures it (clear+recreate, the side becomes a FRESH card),
        // so it is not a cycle edge; junction-cycle-detection.ts's own
        // module doc names this direct case as the one Ruby restructures.
        // Only the OTHER peeked sides can witness an ancestry cycle.
        await assertNotOwnAncestor(
          this.fetch.driver,
          row.id,
          [peekedLeft, peekedRight].filter(
            (id): id is number => id !== undefined && id !== row.id,
          ),
        );
        const sides = await this.ensureSides(writer, newName, row.id);
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

    // The dirty set for the seam's changed:/changing: gates — Card::Dirty
    // canonical columns (dirty.rb:8-10); the sides fold into name via
    // nameChanged (DirtyNames, dirty.rb:57-60). Sides also move on a
    // compound rename without a name-column change.
    const updateChangedFields = [
      ...(nameChanged ? ["name"] : []),
      ...(after.left_id !== before.left_id && !nameChanged ? ["left_id"] : []),
      ...(after.right_id !== before.right_id && !nameChanged ? ["right_id"] : []),
      ...(after.db_content !== before.db_content ? ["db_content"] : []),
      ...(after.type_id !== before.type_id ? ["type_id"] : []),
    ];
    const saved = await writer.updateCard({
      cardId: row.id,
      before,
      after,
      key: nameChanged && newName !== undefined ? (newName.isSimple ? newName.key : null) : undefined,
      readRule,
      superActionId: input.superActionId ?? null,
      // :save_original_filename (attachment.rb:20-24): the action comment
      // carries the original upload filename on attachment updates.
      comment: input.attachment?.originalFilename ?? null,
      // The mount assignment is Ruby's dirty flag (write-path
      // UpdateCardInput.dirtyFields): a re-upload whose intermediate
      // identifier equals the current db_content is still a real save —
      // without this the writer's no-op detection would drop it.
      dirtyFields: input.attachment !== undefined ? ["db_content"] : undefined,
      // The act-card claim: true for the caller's own card (the default),
      // false for subcard saves riding the same act (subcards.rb — the
      // writer holds ONE act-card action per act).
      isActCard: opts.isActCard ?? true,
    });
    if (saved === null) return null; // no-op save: nothing persisted
    // SP (director.rb:20) + SS (director.rb:21): the storage-phase seams
    // run for PERSISTED saves only — a no-op save produced no action for
    // events to belong to (disclosed divergence: Ruby's director would
    // walk the stages; this port pins events to persisted saves). Ruby's
    // pre-write store mutations (set_content) stay built-in — the merge
    // into `after` above is that port, as the file header records.
    const storedCard = (): ModEventCard =>
      this.eventCard({
        name: nameChanged && newName !== undefined ? newName : currentName,
        id: row.id,
        key: nameChanged && newName !== undefined ? newName.key : currentKey,
        dbContent: after.db_content,
        action: "update",
        actId: saved.actId,
        trash: false,
        typeId: after.type_id,
        nameBeforeAct: currentName?.s,
        changedFields: updateChangedFields,
      });
    await this.dispatchEventStage("prepare_to_store", storedCard());
    await this.dispatchEventStage("store", storedCard());

    // :store_attachment! + :correct_identifier — same finalization as the
    // create path (see the finalizer's block comment), before expiry.
    const attachmentIdentifier =
      input.attachment !== undefined
        ? await this.finalizeAttachment(
            row.id,
            saved.actionId,
            input.attachment,
            before.db_content ?? null,
            "update",
          )
        : null;

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
    // FINALIZE (card_references write path) — the SEAM with takeover.
    // Ruby's finalize events run in definition order (reference_events.rb:
    // 2, :6, :15, :21): refresh_references_out (`on: :update, changed:
    // :content`), then the rename pair — update_referer_content (:7-10,
    // `on: :update, changed: :name`, skip: :allowed) and refresh_references_
    // in (:22-25, backfill + the unmap arm the skip machinery now reaches).
    // Registered REAL bodies replace these built-ins; the rename thunks
    // keep their own nameChanged gate so the unregistered path is exactly
    // the pre-seam behavior (update-referer-content.ts, refresh-references-
    // in.ts).
    await this.runFinalizeEvents(
      this.eventCard({
        name: nameAfter,
        id: row.id,
        key: nameChanged && newName !== undefined ? newName.key : currentKey,
        dbContent: attachmentIdentifier ?? after.db_content,
        action: "update",
        actId: saved.actId,
        trash: false,
        typeId: after.type_id,
        nameBeforeAct: currentName?.s,
        changedFields: updateChangedFields,
      }),
      [
        [
          "refresh_references_out",
          () =>
            this.maybeRefreshReferencesOut({
              cardId: row.id,
              name: nameAfter,
              contentBefore: before.db_content,
              contentAfter: attachmentIdentifier ?? after.db_content,
            }),
        ],
        [
          "update_referer_content",
          async () => {
            if (nameChanged && nameAfter !== undefined && currentName !== undefined) {
              await updateRefererContent(
                { driver: this.fetch.driver, lexicon: this.fetch.lexicon },
                row.id,
                currentName,
                nameAfter,
              );
            }
          },
        ],
        [
          "refresh_references_in",
          async () => {
            if (nameChanged && nameAfter !== undefined) {
              await refreshReferencesIn(this.fetch.driver, row.id, nameAfter.key);
            }
          },
        ],
      ],
    );
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

  /** detect_conflict + edit_conflict? (card-mod-history-0.20.0
   *  set/all/history/events.rb:19-22, 65-72) - the stale-revision guard:
   *  the save began at a revision that is no longer current AND the card's
   *  last action belongs to somebody else. Ruby raises it as a VALIDATION
   *  error (`errors.add :conflict, I18n.t(:history_error_not_latest_revision)`)
   *  on the :validate stage, so nothing persists - the oracle probe
   *  (fixtures/captured/edit-forms.json conflict_probe) records the message
   *  "changes not based on latest revision" with card_actions 4881 -> 4881.
   *
   *  The comparison rides the ported guard `isEditConflict`
   *  (card-mod-history.ts, events.rb:65-72 verbatim), whose three clauses
   *  are: a before-edit id is present; it differs from last_action_id; the
   *  last action's act actor is not the saving actor. last_action /
   *  last_action_id read NON-DRAFT actions only (last.rb:53-55 over
   *  card.rb:172 `has_many :actions, -> { where(draft: [nil, false]) }`),
   *  so a draft save never trips this guard.
   *
   *  HTTP shape: a validation error is 422 (card-1.110.0 lib/card/error.rb:21
   *  UserError), the same status the other validation rejections use. */
  private async assertNoEditConflict(
    cardId: number,
    lastActionIdBeforeEdit: number | string | null | undefined,
  ): Promise<void> {
    if (lastActionIdBeforeEdit === null || lastActionIdBeforeEdit === undefined) {
      return; // events.rb:66 - `last_action_id_before_edit &&`
    }
    const conflicted = await isEditConflict(
      this.fetch.driver,
      cardId,
      lastActionIdBeforeEdit,
      this.actor?.id ?? 0,
    );
    if (!conflicted) return;
    throw new CardActionError("conflict", HISTORY_ERROR_NOT_LATEST_REVISION);
  }

  /** save_draft (mod/core/set/all/content.rb:8-15) - the autosave save. The
   *  :store event records the draft's own history and then
   *  `abort :success`, so the cards row never changes: the writer's
   *  saveDraft (card-mod-history set/all/history.rb:88-94) is the whole
   *  effect - clear this actor's earlier drafts, then a fresh act, an
   *  action with draft=true + action_type :update, and one db_content
   *  change. The result shape mirrors an ordinary update save (the route
   *  stamps the saved name for the post-save bookkeeping either way); the
   *  stages after :store do not run, so there is no integrate/notify pass
   *  and no cards-row cache expiry to run. */
  private async saveDraftInWriter(
    writer: ActWriter,
    row: CardsRow,
    input: UpdateCardInput,
  ): Promise<ActionResult> {
    const name = await this.composedNameOf(row);
    const saved = await writer.saveDraft({
      cardId: row.id,
      content: input.content ?? null,
    });
    return {
      cardId: row.id,
      actionId: saved.actionId,
      actId: saved.actId,
      verb: "update",
      name,
      subactions: [],
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
      // FINALIZE (card_references write path): the obstacle's own save!
      // runs refresh_references_in too (reference_events.rb:22-25) —
      // through the same seam. Its update_referer_content twin no-ops in
      // Ruby as well — a trashed card's referers resolve to nil and drop
      // out (all.rb:23 Array#compact) — so only the map arm is ported here.
      await this.runFinalizeEvents(
        this.eventCard({
          name: obstacleName,
          id: obstacle.id,
          key: obstacleName.key,
          dbContent: obstacle.db_content,
          action: "update",
          trash: true,
          typeId: obstacle.type_id,
          nameBeforeAct: obstacle.name ?? undefined,
          changedFields: ["name"],
        }),
        [
          [
            "refresh_references_in",
            () => refreshReferencesIn(this.fetch.driver, obstacle.id, obstacleName.key),
          ],
        ],
      );
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
    try {
      return await this.deleteCardInner(input);
    } finally {
      this.pendingSaveInput = undefined;
    }
  }

  private async deleteCardInner(input: DeleteCardInput): Promise<ActionResult | null> {
    // The anonymous-delete arm: ok_to_delete? (permissions.rb:155-157
    // `permit :delete`) has NO signed-in clause — the chain rules it
    // identically to create/update. Corpus adjudication (a probe against
    // the capture corpus): 8 trashed cards with updater_id = the anonymous
    // codename card (id 15) — the trash save re-stamps updater_id
    // (set_stamper, account.rb:20-23), so those rows are anonymous-actor
    // writes on end-trashed cards. Fragment seed keeps the legacy rejection.
    const actingId = await this.actingIdForWrite();
    if (actingId === undefined) this.assertWritable();
    // The execution seam's initialize stage (director.rb:14 — VI). Core's
    // initialize-stage event (admin_tasks) is Self-scoped; without a
    // setMember resolver the walk reports it set-not-applicable.
    await this.dispatchEventStage(
      "initialize",
      this.eventCard({ name: undefined, id: input.cardId, action: "delete" }),
    );
    const row = await this.fetchRowById(input.cardId);
    if (row === undefined) {
      throw new CardActionError("not-found", `no such card: ${input.cardId}`);
    }
    if (row.trash === 1) return null; // already trashed: no-op (ActWriter contract)
    const card = await composeCardRecord(row, this.fetch.lexicon);
    await this.assertCanWrite(card, "delete"); // ok_to_delete? (permissions.rb:155-157)
    if (row.codename !== null && row.codename !== "") {
      // validate_delete (trash.rb:31-34): "error: system card"
      throw new CardActionError(
        "protected-card",
        `card has a codename and cannot be deleted: ${card.name?.s ?? `~${row.id}`}`,
      );
    }
    // event :recaptcha (card-mod-recaptcha set/all/recaptcha.rb:50-55) is a
    // :validate-stage event with NO `on:` clause — Ruby's delete! IS an
    // update save with trash: true (trash.rb:11-21 add_to_trash ->
    // update!), so the guard reaches the delete save exactly as it reaches
    // create/update, and its snapshot must exist before this walk
    // (prepareRecaptchaSaveInput no-ops without the mod/config). The walk's
    // rule read evaluates on the card under its CURRENT name and stored
    // type — recaptcha.rb:22 rule(:captcha). The permission check above
    // (ok_to_delete?) already outranked: a rule-denied deck 403s in front
    // of the guard, Ruby's chain order (permissions.rb:155-157 before the
    // :validate stage).
    const currentName = await this.composedNameOf(row);
    await this.prepareRecaptchaSaveInput(
      input.recaptchaToken,
      "delete",
      await ruleWalkPatternInput(this.fetch, {
        name: currentName ?? DeckoName.parse(""),
        id: row.id,
        isNew: false,
        typeId: row.type_id,
      }),
    );
    // VV (director.rb:16): the validate seam sits with the built-in
    // validate_delete port above it (built-ins first, then dispatch — the
    // documented intra-stage order of this seam).
    await this.dispatchEventStage(
      "validate",
      this.eventCard({
        name: currentName,
        id: row.id,
        key: row.key ?? undefined,
        dbContent: row.db_content,
        action: "delete",
        trash: true,
        typeId: row.type_id,
        changedFields: ["trash"],
      }),
    );
    const writer = this.newWriter(actingId);
    const saved = await writer.trashCard({
      cardId: row.id,
      before: cardFieldStateFromRow(row),
      superActionId: input.superActionId ?? null,
    });
    if (saved === null) return null;
    // SP + SS (director.rb:20-21): persisted deletes only (see the update
    // path's disclosure — events pin to persisted saves).
    const deletedCard = (): ModEventCard =>
      this.eventCard({
        name: currentName,
        id: row.id,
        key: currentName?.key ?? row.key ?? undefined,
        dbContent: row.db_content,
        action: "delete",
        actId: saved.actId,
        trash: true,
        typeId: row.type_id,
        changedFields: ["trash"],
      });
    await this.dispatchEventStage("prepare_to_store", deletedCard());
    await this.dispatchEventStage("store", deletedCard());

    // delete_children cascade. Ruby's subcard deletes run with
    // `validate: false` (director/store.rb:70-73), so child validate_delete
    // guards (codenames) do NOT re-fire down the tree — ported as-is.
    const subactions = await this.deleteChildren(writer, row.id, saved.actionId);
    await this.expireAfterWrite({
      cardId: row.id,
      nameAfter: currentName,
      verb: "delete",
    });
    // FINALIZE (card_references write path) — the SEAM with takeover:
    // clear_references (reference_events.rb:27-31) through the registered
    // body when the name is registered; the built-in otherwise.
    await this.runFinalizeEvents(deletedCard(), [
      [
        "clear_references",
        () => clearReferencesOnDelete(this.fetch.driver, row.id),
      ],
    ]);
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
    // II (director.rb:26): the integrate seam before the notify hooks (see
    // the create path's note).
    await this.dispatchEventStage("integrate", deletedCard());
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
          // FINALIZE — the child's own delete save, its clear_references
          // through the same seam (reference_events.rb:27-31).
          await this.runFinalizeEvents(
            this.eventCard({
              name: await this.composedNameOf(child),
              id: child.id,
              key: child.key ?? undefined,
              dbContent: child.db_content,
              action: "delete",
              trash: true,
              typeId: child.type_id,
              changedFields: ["trash"],
            }),
            [
              [
                "clear_references",
                () => clearReferencesOnDelete(this.fetch.driver, child.id),
              ],
            ],
          );
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

  // -----------------------------------------------------------------------
  // The ModEventFn EXECUTION SEAM (mod-loader/mod-event-dispatch.ts):
  // per-save stage dispatches over the composed runtime. Every helper here
  // no-ops when no runtime was composed (CardActionEngineOptions.modEvents)
  // — the default for every pre-existing caller, byte-identical behavior.
  // -----------------------------------------------------------------------

  /** The ModEventCard this save exposes to event bodies (the widened
   *  ModEventCard surface): identity + dirty state + the act's skip/
   *  trigger lists (skip_and_trigger.rb accessors live on the act card). */
  private eventCard(input: {
    name: DeckoName | undefined;
    id?: number;
    key?: string;
    dbContent?: string | null;
    action: "create" | "update" | "delete";
    actId?: number;
    trash?: boolean;
    typeId?: number | null;
    nameBeforeAct?: string;
    changedFields?: readonly string[];
  }): ModEventCard {
    return {
      name: input.name?.s ?? (input.id !== undefined ? `~${input.id}` : ""),
      id: input.id,
      key: input.key,
      dbContent: input.dbContent ?? undefined,
      action: input.action,
      trash: input.trash,
      typeId: input.typeId ?? null,
      nameBeforeAct: input.nameBeforeAct,
      changedFields: input.changedFields ?? [],
      act: {
        action: input.action,
        actId: input.actId,
        skip: this.modEvents?.skip,
        forceSkip: this.modEvents?.forceSkip,
        trigger: this.modEvents?.trigger,
      },
    };
  }

  /** Dispatch one director stage for this save (no dispatch without a
   *  runtime). The deps pair is the same one the built-in janitors take.
   *  The pending add_comment save input (if this save carries one) rides
   *  the ctx so the `when: :comment` predicate sees it. */
  private dispatchEventStage(
    stage: ModEventStage,
    card: ModEventCard,
  ): Promise<ModEventStageReport | undefined> {
    const runtime = this.modEvents;
    if (runtime === undefined) return Promise.resolve(undefined);
    return runModEventStage(
      runtime,
      stage,
      card,
      {
        driver: this.fetch.driver,
        lexicon: this.fetch.lexicon,
      },
      this.pendingSaveInput,
    );
  }

  /** The pending add_comment save input of the CURRENT save (set by
   *  applyAddComment, cleared when the public create/update entries
   *  finish). */
  private pendingSaveInput: ModEventSaveInput | undefined;

  /**
   * add_comment (card-mod-comment set/all/comment.rb:4-12,
   * `event :add_comment, :prepare_to_store, on: :save, when: :comment`):
   * invoked at the SP position — BEFORE the row write — through the
   * REGISTERED body (Ruby: the event exists only when the comment mod is
   * loaded; without it a comment param rides along inert). The port's
   * stage dispatches run post-persist (the seam placement disclosed in
   * the update path), so the body is invoked HERE, where its
   * `self.content =` mutation can land on the pending write; the
   * post-persist walk then sees when-false via commentApplied.
   *
   * The oracle capture (fixtures/oracle-surfaces/comment.jsonl) pins the
   * appended bytes: "content\n<hr>\n<p>lines…</p>\n<div
   * class="w-comment-author">AUTHOR.....YYYY-MM-DD HH:MM:SS UTC</div>".
   */
  private async applyAddComment(
    input: { comment?: string; commentAuthor?: string },
    action: "create" | "update",
    name: DeckoName,
    pendingContent: string | undefined,
    setContent: (dbContent: string) => void,
  ): Promise<void> {
    const runtime = this.modEvents;
    if (runtime === undefined || input.comment === undefined) return;
    const registered = runtime.registry
      .all()
      .find((e) => e.event === "add_comment");
    if (registered === undefined) return; // the mod is not loaded
    const commentAuthorName =
      this.actor !== null && !(await this.isAnonymousSession()) ? this.actor.name : undefined;
    const saveInput: ModEventSaveInput = {
      comment: input.comment,
      commentAuthor: input.commentAuthor,
      signedInActorName: commentAuthorName,
      now: this.clock,
      pendingContent,
      setContent,
      commentApplied: false,
    };
    this.pendingSaveInput = saveInput;
    const card = this.eventCard({
      name,
      key: name.key,
      dbContent: pendingContent,
      action,
    });
    const ctx: ModEventContext = {
      driver: this.fetch.driver,
      lexicon: this.fetch.lexicon,
      stage: "prepare_to_store",
      skipEvent: (n) =>
        runtime.skip?.includes(n) === true || runtime.forceSkip?.includes(n) === true,
      saveInput,
    };
    await registered.fn(
      card,
      runtime.host as ModEngineHost as Parameters<ModEventFn>[1],
      ctx,
    );
    saveInput.commentApplied = true;
  }

  /**
   * event :recaptcha's save-input snapshot (card-mod-recaptcha
   * set/all/recaptcha.rb:50-55, the :validate stage): built BEFORE the
   * validate-stage walk when the recaptcha mod is loaded (the runtime
   * registers "recaptcha") AND a recaptcha config is composed. Ruby reads
   * Env.params[:recaptcha_token], the config keys, the Auth state and
   * rule(:captcha) at validate time; the port resolves the async pieces
   * (the codename check, the captcha-rule read) here and rides
   * them into the walk through pendingSaveInput (the dispatch's ctx
   * saveInput). The captcha-rule read IS Ruby's candidate walk by default
   * (ruleContentForCard over the deck's own rule cards); the config's
   * explicit value/function remains the host override seam. Without the
   * mod or the config nothing is set — byte-identical pre-port behavior
   * (the guard is off: recaptcha_keys? false, recaptcha.rb:46-48, or no
   * registered event at all).
   */
  private async prepareRecaptchaSaveInput(
    recaptchaToken: string | undefined,
    action: "create" | "update" | "delete",
    pattern: PatternCardInput,
  ): Promise<void> {
    void action; // the event carries no on: — the walk's action rides card.act
    if (this.modEvents === undefined || this.recaptchaConfig === undefined) {
      return;
    }
    const registered = this.modEvents.registry
      .all()
      .some((e) => e.event === "recaptcha");
    if (!registered) return; // the mod is not loaded (Ruby: no gem, no event)
    const cfg = this.recaptchaConfig;
    const captchaCardId = await this.fetch.codenames.id("captcha");
    const ruleContent =
      cfg.captchaRuleContent !== undefined
        ? typeof cfg.captchaRuleContent === "function"
          ? await cfg.captchaRuleContent(DeckoName.parse(pattern.name).s)
          : cfg.captchaRuleContent
        : await ruleContentForCard(this.fetch, pattern, "captcha");
    const signedIn = !(await this.isAnonymousSession());
    const saveInput: ModEventSaveInput = {
      comment: undefined,
      commentAuthor: undefined,
      signedInActorName: signedIn ? this.actor?.name : undefined,
      now: this.clock,
      pendingContent: undefined,
      // the recaptcha body never mutates content (setContent is the
      // add_comment mutation point; nothing calls it on this input)
      setContent: () => undefined,
      commentApplied: false,
      recaptcha: {
        token: recaptchaToken,
        guard: {
          siteKey: cfg.siteKey,
          secretKey: cfg.secretKey,
          // the engine's save paths exist to serve controller requests —
          // Ruby's Env.controller is true inside the same boundary
          envController: true,
          signedIn,
          alwaysOk: cfg.alwaysOk ?? false,
          needsSetup: cfg.needsSetup ?? false,
          captchaRuleContent: ruleContent,
          captchaCodenameExists: captchaCardId !== undefined,
          // top-level acts only — the @supercard subcard-act context does
          // not exist in this port (named remainder, mod header (a))
          isSupercard: false,
          minimumScore:
            cfg.minimumScore ??
            RECAPTCHA_CARDIO_CONFIG_DEFAULTS.recaptcha_minimum_score,
          verifyUrl:
            cfg.verifyUrl ??
            RECAPTCHA_CARDIO_CONFIG_DEFAULTS.recaptcha_verify_url,
        },
        isUsed: () => this.captchaUsedThisRequest,
        markUsed: () => {
          this.captchaUsedThisRequest = true;
        },
        verify: cfg.verify ?? recaptchaSiteverifyGet,
      },
    };
    this.pendingSaveInput = saveInput;
  }

  /** The FINALIZE seam with the takeover contract: dispatch the stage
   *  first, then run each built-in behavior whose event name is not
   *  registered at the runtime (registered REAL bodies replace the
   *  built-in; registered STUBS never do — EVENT_TAKEOVER_BUILTINS). Each
   *  thunk keeps its own condition gates so the unregistered path behaves
   *  exactly as before this seam existed. */
  private async runFinalizeEvents(
    card: ModEventCard,
    thunks: ReadonlyArray<readonly [string, () => Promise<void>]>,
  ): Promise<void> {
    if (this.modEvents === undefined) {
      for (const [, thunk] of thunks) await thunk();
      return;
    }
    await this.dispatchEventStage("finalize", card);
    for (const [name, thunk] of thunks) {
      if (EVENT_TAKEOVER_BUILTINS.has(name)) {
        const registered = this.modEvents.registry.all().some((e) => e.event === name);
        if (registered) continue; // the declaration took over
      }
      await thunk();
    }
  }

  /** The basic permission gate, sync half: anonymous actors are read-only
   *  (auth/current.rb:43-47 signed_in? = current_id != AnonymousID).
   *  No write task runs this gate for a well-formed anonymous session —
   *  the anonymous arms ride the rule check instead (Ruby's permission
   *  chain has no signed_in? clause for any of create/update/delete; see
   *  createCardInner / updateCardInner / deleteCard). What remains here:
   *  the fragment-seed case only (no anonymous codename card to act as —
   *  Ruby could not form Card[AnonymousID] there either). */
  private assertWritable(): void {
    if (this.actor === null) {
      throw new CardActionError(
        "anonymous-actor",
        "write action rejected: no signed-in account (anonymous sessions are read-only)",
      );
    }
    if (this.actor.name === ANONYMOUS_ACTOR_NAME) {
      // legacy belt: id-keyed identity (isAnonymousSession) owns the real
      // decision; a named actor reaches here only with an unusable id
      // (fragment-seed-style rejection for the session that cannot act).
      throw new CardActionError(
        "anonymous-actor",
        `write action rejected: ${ANONYMOUS_ACTOR_NAME} is read-only`,
      );
    }
  }

  /** True when the actor IS the anonymous session: no actor at all, or an
   *  actor whose id is the anonymous codename card's id (the real
   *  Anonymous card). Ruby keys actor identity on the ID — Auth.as runs
   *  `@as_id = Card.id given_user` (auth/proxy.rb:11), as_id falls back to
   *  current_id (proxy.rb:32-35), signed_in? is `current_id != AnonymousID`
   *  (auth/current.rb:43-47) — never on a name. An earlier name-keyed
   *  marker (any actor NAMED *anonymous) misattributed real accounts
   *  carrying that name; only the real Anonymous card matches now. */
  private async isAnonymousSession(): Promise<boolean> {
    if (this.actor === null) return true;
    const anonId = await this.anonymousActorId();
    return anonId !== undefined && this.actor.id === anonId;
  }

  /** The id a WRITE records and runs its rule verdict for (ActWriter
   *  actorId; Ruby records the act's actor_id = Auth.as_id — proxy.rb:33-35
   *  falls back to current_id, AnonymousID for the signed-out session,
   *  auth/current.rb:7-9). Signed-in: the account (id-keyed — see
   *  isAnonymousSession; a host-supplied actor is its own account whatever
   *  its name). Anonymous session: the anonymous codename card's id, or
   *  undefined when the deck cannot form one (fragment seed — the legacy
   *  gate applies). All three write tasks ride this: create (:120-125),
   *  update (:148-153), delete (:155-157) — Ruby's permission chain has no
   *  signed-in clause on any of them. */
  private async actingIdForWrite(): Promise<number | undefined> {
    if (this.actor !== null) {
      const anonId = await this.anonymousActorId();
      // an actor carrying the real Anonymous card's id IS the anonymous
      // session; its acting id is that same id either way.
      return anonId !== undefined && this.actor.id === anonId ? anonId : this.actor.id;
    }
    return this.anonymousActorId();
  }

  private anonymousActorIdPromise: Promise<number | undefined> | undefined;

  /** The anonymous codename card's id (the corpus's 694 creator_id=15 rows
   *  are that card's writes). Memoized: codenames are immutable within an
   *  engine instance. */
  private anonymousActorId(): Promise<number | undefined> {
    this.anonymousActorIdPromise ??= Promise.resolve(
      this.fetch.codenames.id("anonymous"),
    );
    return this.anonymousActorIdPromise;
  }

  /** The permission gate (async half) — Ruby's event :check_permissions
   *  (card-mod-permissions set/all/permissions.rb:22-25): the ported
   *  ok_to_create? / ok_to_update? / ok_to_delete? algebra
   *  (saveTaskVerdictForCard in view-task-rules.ts) runs INSIDE the engine,
   *  against the deck's *create/*update/*delete rule cards and the actor's
   *  own parties. The algebra is deny-by-default: a `false` verdict (an
   *  explicit denial OR missing/empty rule data — who_can -> [] ->
   *  among? -> false, permissions.rb:47-49/:100-118) throws
   *  permission-denied (Ruby's PermissionDenied).
   *  The optional canWrite hook then rides ON TOP as a host-side extra
   *  gate — it can deny what the rules allow, never allow what they deny.
   *  The actor here is either a signed-in account or the anonymous session
   *  whose verdict runs for the Anonymous card (writeViewer); the sync
   *  gate has already rejected only the fragment-seed case (no anonymous
   *  codename card) across all three write tasks. */
  private async assertCanWrite(
    card: CardRecord,
    task: WriteTask,
    opts: { typeChanged?: boolean; assignedTypeId?: number; assignedName?: string } = {},
  ): Promise<void> {
    const pattern = await this.patternInputFor(card, opts.assignedTypeId, opts.assignedName);
    const verdict = await saveTaskVerdictForCard(
      this.fetch,
      pattern,
      task,
      await this.writePermissionState(),
      // assignedName rides the pattern input's name for the RULE walk and
      // opts for the RENAME clause (the sides the assigned name creates —
      // saveTaskVerdictForCard's update branch; name_events.rb:67-72,
      // :137-150, permissions.rb:22-26).
      { typeChanged: opts.typeChanged, assignedName: opts.assignedName },
    );
    if (verdict === false) {
      throw new CardActionError(
        "permission-denied",
        `actor ${this.actor?.name ?? ANONYMOUS_ACTOR_NAME} may not ${task} card ${card.name?.s ?? String(card.id)}`,
      );
    }
    // The host hook is a port-only seam — Ruby's permission chain is the
    // :check_permissions event walk alone (permissions.rb:100-157; no
    // can_write/host hook exists anywhere in card-1.110.0 or the perms
    // mod) — so its contract is whatever this engine makes it: consult it
    // for EVERY session that reaches this gate, the anonymous session
    // included (exactly the writer class a host gates: rate limits,
    // allowlists, moderation holds). The hook's actor for an anonymous
    // session is the anonymous codename card — the same id the write is
    // itself attributed to (actingIdForWrite). A fragment seed never
    // reaches this line: assertWritable rejected it on all three tasks.
    if (this.canWrite !== undefined) {
      let hookActor: Actor;
      // id-keyed like every identity site: the anonymous session is
      // actor null OR the real Anonymous card's id — never a name. An
      // account carrying the name "*anonymous" with its own id is a
      // signed-in account and consults the hook AS ITSELF (auth/proxy.rb:11
      // keys Auth.as on the id; auth/current.rb:43-47 signed_in? = id !=
      // AnonymousID). The earlier name-keyed branch misrouted such
      // accounts to the anonymous hook actor — and refused them outright
      // on decks that cannot form the anonymous card.
      if (this.actor !== null && !(await this.isAnonymousSession())) {
        hookActor = this.actor;
      } else {
        const anonActorId = await this.anonymousActorId();
        if (anonActorId === undefined) {
          throw new CardActionError(
            "anonymous-actor",
            "write action rejected: the deck cannot form the anonymous codename card",
          );
        }
        hookActor = { id: anonActorId, name: ANONYMOUS_ACTOR_NAME };
      }
      const allowed = await this.canWrite(card, hookActor);
      if (!allowed) {
        throw new CardActionError(
          "permission-denied",
          `actor ${this.actor?.name ?? ANONYMOUS_ACTOR_NAME} may not write card ${card.name?.s ?? String(card.id)}`,
        );
      }
    }
  }

  /** The write path's permission viewer — the port of Auth.as_card for the
   *  gated save. Signed-in: the account (unchanged). Anonymous session:
   *  signedIn false + the Anonymous card's id —
   *  readPermissionStateFromViewerResults (read-rules.ts:322/:325) builds
   *  exactly Ruby's anonymous parties (account_holder.rb:27-29 parties =
   *  all_enabled_roles << id with :40's empty roles for Anonymous → the
   *  Anonymous id; plus Anyone from the among? :33 arm), so amongParties
   *  (view-task-rules.ts) answers rules granting Anyone or Anonymous
   *  exactly as account_holder.rb:31-37 does. Memoized with the state
   *  (the actor is fixed at construction). */
  private async writeViewer(): Promise<ReadViewer> {
    if (this.actor !== null) {
      const anonId = await this.anonymousActorId();
      if (anonId !== undefined && this.actor.id === anonId) {
        // the real Anonymous card by id: Ruby's signed_in? is
        // `current_id != AnonymousID` (auth/current.rb:43-47)
        return { signedIn: false, actorId: anonId };
      }
      return { signedIn: true, actorId: this.actor.id };
    }
    return { signedIn: false, actorId: await this.anonymousActorId() };
  }

  /** The write-task permission state: ONE batch for the actor's read
   *  permission facts (alwaysOk = Auth.always_ok?, parties = fetch_roles +
   *  self, account_holder.rb:26-28) and ONE for the who_can universe —
   *  built once per engine on the first gated save, memoized after. */
  private async writePermissionState(): Promise<ViewTaskState> {
    if (this.writeTaskState !== undefined) return this.writeTaskState;
    const viewer = await this.writeViewer();
    const readResults = await this.fetch.driver.batch(readPermissionStatements(viewer));
    const readState = readPermissionStateFromViewerResults(readResults, viewer);
    const taskResults = await this.fetch.driver.batch(viewTaskPermissionStatements());
    this.writeTaskState = viewTaskStateFromResults(taskResults, readState);
    return this.writeTaskState;
  }

  /** The PatternCardInput the rule walk receives — the same fields the
   *  render side's verdictPatternInput supplies (render.ts): name (the
   *  ASSIGNED name for a name-changing save — Ruby's validate-stage check
   *  runs on the card after name= has written the new name and
   *  reset_patterns has rebuilt the rule lookup keys from it:
   *  name/all.rb:21-28, assign_attributes.rb:63-68, pattern/all.rb:22-29,
   *  so the assigned name's anchors govern), id, typeId (the ASSIGNED type
   *  for a type-changing save, matching Ruby's validation-time attribute
   *  state), the type card's name, and — for compound cards, whose *type
   *  plus right composes from it — the left side's type name (for a
   *  rename, the ASSIGNED left part's type, Ruby left_type =
   *  superleft&.type_name || quick_type(name.left_name),
   *  set/pattern/class_methods.rb:59-69). Direct row reads; write-path
   *  calls are rare. */
  private async patternInputFor(
    card: CardRecord,
    assignedTypeId: number | undefined,
    assignedName?: string,
  ): Promise<PatternCardInput> {
    const typeId = assignedTypeId ?? card.typeId;
    const typeName = typeId !== undefined && typeId !== null ? await this.typeNameOf(typeId) : undefined;
    const assigned = assignedName !== undefined ? DeckoName.parse(assignedName) : undefined;
    let leftTypeName: string | undefined;
    if (assigned !== undefined && assigned.isCompound) {
      // a rename: the type_plus_right candidates read the ASSIGNED left
      // part's type (fetched by name; a missing part falls to the
      // registry's quick_type default, as Ruby's quick_type new-card arm
      // does)
      const leftKey = assigned.leftName?.key;
      if (leftKey !== undefined && leftKey !== "") {
        const leftCard = await this.fetch.fetchByName(leftKey);
        if (leftCard !== undefined && leftCard.typeId !== null && leftCard.typeId !== undefined) {
          leftTypeName = await this.typeNameOf(leftCard.typeId);
        }
      }
    } else if (card.leftId !== undefined && card.leftId !== null) {
      const leftRow = await this.fetchRowById(card.leftId);
      if (leftRow !== undefined && leftRow.type_id !== null && leftRow.type_id !== undefined) {
        leftTypeName = await this.typeNameOf(leftRow.type_id);
      }
    }
    return {
      name: assigned?.s ?? card.name?.s ?? (card.id !== undefined ? `~${card.id}` : ""),
      id: card.id,
      isNew: isNewCard(card),
      typeId,
      typeName,
      leftTypeName,
    };
  }

  /** The type card's name (type cards are simple cards — cards.name). */
  private async typeNameOf(typeId: number): Promise<string | undefined> {
    const row = await this.fetchRowById(typeId);
    return row?.name ?? undefined;
  }

  /** `actingId` rides in from the write entries (createCardInner /
   *  updateCardInner / deleteCard) so an anonymous-session write records
   *  the act under the Anonymous card's id (Ruby: the act's actor_id is
   *  Auth.as_id, which IS AnonymousID when signed out —
   *  auth/current.rb:7-9; the corpus's creator_id=15 rows and its
   *  1,808 live + 8 trashed updater_id=15 rows). Undefined
   *  actingId means the fragment-seed callers whose actor must be a
   *  signed-in account (assertWritable has already run for them). */
  private newWriter(actingId?: number): ActWriter {
    const actorId = actingId ?? this.actor?.id;
    if (actorId === undefined) {
      throw new CardActionError("anonymous-actor", "no actor for write");
    }
    return new ActWriter({
      driver: this.fetch.driver,
      actorId,
      ipAddress: this.ipAddress,
      now: this.clock,
    });
  }

  /** prepare_left_and_right (name_events.rb:68-73) + prepare_new_side
   *  (:118-125): resolve the side ids of a compound name; missing sides
   *  become subcard creates in the SAME act. Sides dedupe by key so "A+A"
   *  resolves one card for both sides (Ruby: Director.card(sidename)
   *  returns the already-staged subcard, name_events.rb:121). Left is
   *  resolved first (prepare_side :left runs before :right, :74-79).
   *  `selfId` (the renaming row's id) arms the OBSTRUCTED branch: Ruby's
   *  assign_side_id resolves each side through the Lexicon at name= time
   *  (name/all.rb:87-90), so a side naming the card itself carries the
   *  card's OWN id into the store stage, where prepare_obstructed_side
   *  (:144-150) clears the row and recreates the side as a FRESH subcard —
   *  never the renaming row. The create path passes no selfId: a new card
   *  has no id and cannot obstruct itself. */
  private async ensureSides(
    writer: ActWriter,
    name: DeckoName,
    selfId?: number,
  ): Promise<ResolvedSides> {
    const created: (CardActionSummary & { actId: number })[] = [];
    if (!name.isCompound) return { leftId: null, rightId: null, created };
    const idsByKey = new Map<string, number>();
    const resolveSide = async (sideName: DeckoName | undefined): Promise<number | null> => {
      if (sideName === undefined) return null;
      const key = sideName.key;
      const known = idsByKey.get(key);
      if (known !== undefined) return known;
      let id = await this.fetch.lexicon.id(sideName);
      if (selfId !== undefined && id === selfId) {
        id = await this.recreateObstructedSide(writer, sideName, selfId, created);
      } else if (id === undefined) {
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

  /** prepare_obstructed_side (name_events.rb:144-150) + clear_name
   *  (:121-128): the side slot resolved to the RENAMING card's own id.
   *  Ruby moves the row out of the way with a direct, callback-bypassing
   *  SQL update — name/key/left_id/right_id all NULL (:124) — expires the
   *  side name (:125; for a junction self-side that name is the COMPOSED
   *  name) and drops the lexicon state (:126; Ruby's wholesale
   *  Lexicon.cache.reset, whose own comment says "probably overkill", is
   *  ported as the targeted Lexicon.delete, lexicon.rb:38-41) so the fresh
   *  side's unique-name validation finds nothing (Lexicon.id resolves
   *  `key = ? AND trash = 0`, lexicon.rb:120-128 — the cleared row and the
   *  evicted entry both say no), then creates the side as a FRESH subcard
   *  of this act (:148, subcards/all.rb:15-22). The cleared columns are
   *  all overwritten by this rename's own row write moments later (the
   *  junction row stores name/key NULL plus the resolved side ids), so the
   *  committed end state is exactly Ruby's. Returns the fresh side's id. */
  private async recreateObstructedSide(
    writer: ActWriter,
    sideName: DeckoName,
    selfId: number,
    created: (CardActionSummary & { actId: number })[],
  ): Promise<number> {
    const row = await this.fetchRowById(selfId);
    if (row === undefined) {
      // not-found (the union's "no such card" code): the renaming row cannot
      // vanish between the write entry and this call; the guard is shape.
      throw new CardActionError(
        "not-found",
        `obstructed side ${sideName.s}: card ${selfId} vanished mid-rename`,
      );
    }
    // clear_name (name_events.rb:124): the direct SQL — no callbacks.
    await this.fetch.driver.query(
      "UPDATE cards SET name = NULL, `key` = NULL, left_id = NULL, right_id = NULL WHERE id = ?",
      [selfId],
    );
    // clear_name (:125-126): Card.expire + the lexicon eviction.
    const record = newCardRecord(sideName);
    record.id = selfId;
    this.fetch.expireCard(record);
    this.fetch.lexicon.deleteFor(selfId, this.lexOfRow(row));
    // name_events.rb:148: the side becomes a FRESH subcard in this act.
    const sub = await this.createInWriter(writer, { name: sideName.s }, { isActCard: false });
    created.push(sub);
    return sub.cardId;
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
    // The rule-resolution memo (read-rules.ts resolveRuleRowsByKeys) reads
    // key/trash/content/left_id/right_id — every one of those can change
    // under any committed mutation (a rule card's content, a junction's
    // creation, a trash flag), so the save drops the whole per-driver memo
    // here rather than trying to track which candidate closures a card
    // touches. This is the single invalidation path: every committed save
    // routes through this method, and the memo lives on the same driver
    // this.fetch resolves through.
    expireRuleResolutionCache(this.fetch.driver);
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
