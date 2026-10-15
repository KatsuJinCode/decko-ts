// The WRITE-path action layer: Set (create), Save/Update, and Delete
// (trash flip) — the card-mutating API on top of the ActWriter history
// machinery. One applyAction call = one Ruby save request = one act.
//
// Ruby trail (every behavior below cites its own upstream file and lines;
// there is no separate port-notes document for this file — this comment is
// the citation):
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
// Deliberately NOT built here:
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
// map_referees on every name-bearing save; its unmap_referees arm runs on a
// rename that skips update_referer_content), and the rename-side referer
// rewrite (update_referer_content, update-referer-content.ts) ARE built
// here. update_referer_references_out — the rewrite's skip twin — runs
// when the save's `skip` list (UpdateCardInput.skip, card[skip]) names
// update_referer_content.

import {
  ActWriter,
  cardFieldStateFromRow,
  type CardFieldState,
} from "../history/write-path.js";
import { actionTypeCode } from "../history/action.js";
import { sqlDateTime } from "../history/act.js";
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
  type RevertActionsInput,
  type SubcardInput,
  type UpdateCardInput,
} from "./types.js";
import { actionsToRevert, revisionOf, type Revision } from "./revert-actions.js";
import {
  assertNameAvailable,
  findTrashedCardByLex,
  findTrashedKeyObstacle,
  validateNameLegality,
} from "./name-validation.js";
import { knownTypeSpec, resolveTypeId } from "./type-resolution.js";
import { findRule } from "../rules/lookup.js";
import {
  cleanContent,
  NO_CLEAN_RIGHT_CODENAMES,
  NO_CLEAN_TYPE_CODENAMES,
} from "./content-clean.js";
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
  followRightPermitPassedForCard,
  saveTaskVerdictForCard,
  taskVerdictForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
  type WriteTask,
} from "../permissions/view-task-rules.js";
import { updatePermissionOverride } from "../permissions/read-override.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import {
  quickTypeName,
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

  type SavePathEvent,
  type SavePathIntegrationHook,
} from "../notify/index.js";
import {
  codedAttachmentIdentifier,
  detectAttachmentExtension,
  lastContentActionIdFromIdentifier,
  localAttachmentIdentifier,
  parseLocalAttachmentIdentifier,
} from "../attachments/attachment-content.js";
import {
  createVersionsFor,
  mountUsesImageUploader,
  renditionFileNames,
  IMAGE_VERSION_NAMES,
} from "../attachments/image-renditions.js";
import type { AttachmentStore, AttachmentStoreInput } from "../attachments/attachment-store.js";
import { supportsTransactions } from "../../server/driver.js";
import { canResize, imageDecodes, imageVersionBytes } from "../attachments/image-resize.js";
import { emailIsValid, encryptPassword, normalizeEmail, planAccountFields } from "../auth/account-fields.js";
import { actorBot } from "../auth/actor.js";
import { runObserverEvents } from "../notify/observer.js";
import type { ScssCompiler } from "../assets/scss-compiler.js";
import type { CoffeeCompiler } from "../assets/coffee-compiler.js";
import type { ScriptCompressor } from "../assets/script-compressor.js";
import { VirtualRecordCache } from "../mod-loader/mods/card-mod-virtual.js";
import {
  assertStyleCompilerFor,
  refreshReadAssetInputs,
  runStyleAssetEvents,
  type SavedCard,
  type StyleAssetEventContext,
} from "./style-asset-events.js";
import { changeValueForField, trackedFieldIndex } from "../history/change.js";
import {
  clearReferencesOnDelete,
  refreshReferencesOut,
} from "./refresh-references-out.js";
import { refreshReferencesIn } from "./refresh-references-in.js";
import { updateRefererContent, updateRefererReferencesOut } from "./update-referer-content.js";
import {
  LIST_RIGHT_CODENAMES,
  LIST_SELF_CODENAMES,
  LIST_TYPE_CODENAMES,
  listItemStrings,
  standardizeIdListContent,
  standardizeListContent,
} from "./list-content.js";
import {
  DEFAULT_ACCOUNT_STATUS,
  NO_HISTORY_RIGHT_CODENAMES,
  storedPasswordValue,
  generateSalt,
  passwordErrors,
} from "./account-fields.js";
import type { PasswordHashPolicy } from "../auth/password-hash.js";
import {
  runModEventStage,
  type ModEventContext,
  type ModEventRuntime,
  type ModEventSaveInput,
  type ModEventStageReport,
  type ModEventRecaptchaVerify,
} from "../mod-loader/mod-event-dispatch.js";
import {
  populateModEventCardState,
  type ModEventCardState,
  type ModEventCardStateContext,
  type ModEventSaveAttributes,
} from "../mod-loader/mod-event-card-state.js";
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
import type { SavePathAct } from "../notify/types.js";
import {
  DEFAULT_DELAYED_EVENT_PRIORITY,
  type DelayedEventJob,
  type DelayedJobsConfig,
} from "../delayed-job/delayed-job.js";
import { expireRuleResolutionCache } from "../permissions/read-rules.js";

/** A card's reference FINALIZE events, stashed by createInWriter when the
 *  caller passes deferFinalize (the deferred-reference-finalize seam). The
 *  thunks shape matches runFinalizeEvents'. */
interface DeferredReferenceFinalize {
  card?: ModEventCard;
  thunks?: ReadonlyArray<readonly [string, () => Promise<void>]>;
}

/** The attachment mounts by type codename — the two sets that include
 *  Abstract::Attachment and therefore run its events: `attachment :file`
 *  (card-mod-carrierwave set/type/file.rb:1, File cards codename `file`)
 *  and `attachment :image` (set/type/image.rb:1, Image cards codename
 *  `image`). validate_file_exist's attachment_name and the multipart
 *  route's card[<mount>] param names derive from these declarations. */
/** The mount name per attachment-capable type codename (set/type/image.rb:1
 *  `attachment :image`, set/type/file.rb:1 `attachment :file`). */
export const ATTACHMENT_MOUNTS: Readonly<Record<string, "file" | "image">> = {
  file: "file",
  image: "image",
};

/** I18n :history_error_not_latest_revision - card-mod-history-0.20.0
 *  config/locales/en.yml:2, "changes not based on latest revision". The
 *  message detect_conflict puts on the card's :conflict error
 *  (set/all/history/events.rb:20); the byte is the reference's. */
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
   *  integrationHooks is omitted ("save-path
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
  /** How +*password saves are stored (auth/password-hash.ts). Default: the
   *  deck policy in force when the save runs (passwordHashPolicy()). */
  passwordHashing?: PasswordHashPolicy;
  /** The deck origin and Decko Bot address the follower email needs (its
   *  links and unfollow URL, and the From rule). Without them the mail
   *  carries the template with its nests unfilled. */
  followMail?: { origin: string; deckoBotEmail: string };
  /** card-mod-delayed_job (Cardio.config.delaying). Omitted or delaying
   *  false: integrate_with_delay hooks run in line, as Ruby runs them with
   *  the mod's default config. Delaying true: each applicable
   *  integrate_with_delay hook becomes one delayed job on `queue`
   *  (delayed_event.rb define_event_delaying_method), performed later by
   *  performDelayedJob. */
  delayedJobs?: DelayedJobsConfig;
  /** The attachment storage seam (E4.4.a — card-mod-carrierwave's
   *  CarrierWave::Storage::File port). Required for saves that carry an
   *  `attachment` input; saves without one behave exactly as before. */
  attachmentStore?: AttachmentStore;
  /** The store for CODED attachments (storage_type :coded): the mod's
   *  data/files directory, keyed by codename parts instead of card id
   *  (set/abstract/attachment/coded.rb coded_dir). Absent = a coded save
   *  falls back to the attachmentStore. */
  codedAttachmentStore?: AttachmentStore;
  /** The SassC seam for the style asset events (the skin and CSS asset
   *  inputs and the site stylesheet, style-asset-events.ts). Only LibSass
   *  reproduces the oracle's bytes (assets/scss-compiler.ts). Absent = a
   *  save that needs a compile is refused with a named error. */
  scssCompiler?: ScssCompiler;
  /** The CoffeeScript seam for the script asset events (the JavaScript /
   *  CoffeeScript asset inputs and the site script, style-asset-events.ts).
   *  The npm coffeescript@1.12.2 package reproduces the oracle's bytes
   *  (assets/coffee-compiler.ts). Absent = a save that needs a compile is
   *  refused with a named error. */
  coffeeCompiler?: CoffeeCompiler;
  /** Cardio.config.compress_assets (card-mod-script 00_script.rb compress?):
   *  true minifies every script leaf of the asset inputs and outputs through
   *  scriptCompressor, as a deployed site does (the railtie default,
   *  card-1.110.0 lib/cardio/railtie.rb:35). Absent = false, the development
   *  environment's value (config/environments/development.rb:11). */
  compressAssets?: boolean;
  /** The Uglifier seam for compressAssets (assets/script-compressor.ts). With
   *  compressAssets and no compressor, a save that rebuilds a script asset is
   *  refused with a named error. */
  scriptCompressor?: ScriptCompressor;
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

  /** Card::Env.params for the request this engine serves (env.rb). Read by
   *  the mod-event state sources (mod-loader/mod-event-card-state.ts) so
   *  `when:` predicates that consult request params (`draft`,
   *  `insert_item`, `attachment_upload`) see the same bag Ruby does. */
  params?: Readonly<Record<string, unknown>>;
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
  /** The compound's own action row, reserved before its first missing
   *  side was created (ActWriter.reserveCreateAction). */
  reservedActionId?: number;
}

/** Engine for one actor; one applyAction = one act. Construct per request
 *  (Ruby: Director.run_act binds the act per request, director/all.rb:114)
 *  or reuse — every call starts its own act, exactly like a new submission. */
/** anonymize! (card-mod-account set/abstract/account_holder.rb:83-85):
 *  "ANON-" + SecureRandom.hex(6), twelve random hex digits. */
function anonymousAccountName(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `ANON-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export class CardActionEngine {
  readonly fetch: FetchEngine;
  readonly actor: Actor | null;
  private readonly clock: () => Date;
  private readonly ipAddress: string | null;
  private readonly delayedJobs: DelayedJobsConfig | undefined;
  private readonly canWrite: CanWriteHook | undefined;
  private readonly integrationHooks: SavePathIntegrationHook[] | undefined;
  private readonly followerResolver: FollowerResolver | undefined;
  private readonly notifyTransport: NotifyTransport | undefined;
  private readonly notifyLogger: ((line: string) => void) | undefined;
  private readonly passwordHashing: PasswordHashPolicy | undefined;
  private readonly followMail: { origin: string; deckoBotEmail: string } | undefined;
  /** The write-task permission state (who_can universe + actor parties),
   *  built lazily on this engine's first gated save — the render side's
   *  ensureTaskVerdicts model (one batch pair per engine, never per save). */
  private writeTaskState: ViewTaskState | undefined;
  private readonly attachmentStore: AttachmentStore | undefined;
  private readonly codedAttachmentStore: AttachmentStore | undefined;
  private readonly scssCompiler: ScssCompiler | undefined;
  private readonly coffeeCompiler: CoffeeCompiler | undefined;
  private readonly compressAssets: boolean;
  private readonly scriptCompressor: ScriptCompressor | undefined;
  /** Card::Cache[Virtual] for the card_virtuals rows this engine writes. */
  private readonly virtualCache = new VirtualRecordCache();
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
  /** Card::Env.params for the save (lib/card/env.rb) — the request-param
   *  bag Ruby's `when:` predicates read (`draft`, `insert_item`,
   *  `attachment_upload`). Undefined on an engine built for a non-request
   *  save; a predicate that needs it then reads false, which is what Ruby
   *  does for a param the request did not carry. */
  private readonly saveParams: Readonly<Record<string, unknown>> | undefined;
  /** The assigned attributes of the save in flight, as the mod-event state
   *  sources read them (mod-loader/mod-event-card-state.ts
   *  ModEventSaveAttributes): Ruby's `set_specific` / the card's own
   *  attribute writers (advanced_api.rb:33-38). Set once the save input is
   *  final — after the two-step upload's cached attachment is installed —
   *  and restored by the public entries' `finally`, like saveSkip. */
  private activeSaveAttributes: ModEventSaveAttributes | undefined;

  constructor(fetchEngine: FetchEngine, options: CardActionEngineOptions) {
    this.fetch = fetchEngine;
    this.actor = options.actor;
    this.clock = options.now ?? (() => new Date());
    this.ipAddress = options.ipAddress ?? null;
    this.delayedJobs = options.delayedJobs;
    this.canWrite = options.canWrite;
    this.integrationHooks = options.integrationHooks;
    this.followerResolver = options.followerResolver;
    this.notifyTransport = options.notifyTransport;
    this.notifyLogger = options.notifyLogger;
    this.passwordHashing = options.passwordHashing;
    this.followMail = options.followMail;
    this.attachmentStore = options.attachmentStore;
    this.codedAttachmentStore = options.codedAttachmentStore;
    this.scssCompiler = options.scssCompiler;
    this.coffeeCompiler = options.coffeeCompiler;
    this.compressAssets = options.compressAssets ?? false;
    this.scriptCompressor = options.scriptCompressor;
    this.fileStorage = options.fileStorage;
    this.modEvents = options.modEvents;
    this.recaptchaConfig = options.recaptcha;
    this.saveParams = options.params;
  }

  /** How many saves are running on this engine right now: 1 inside a
   *  top-level save, more while a save runs another (revert -> update). */
  private saveDepth = 0;
  /** The integration phase of the save in progress, run once it commits. */
  private afterCommitSteps: (() => Promise<void>)[] = [];
  /** Files the save in progress stored, removed again if it rolls back. */
  private filesStoredThisSave: AttachmentStoreInput[] = [];

  /**
   * One save, all or nothing (Ruby: with_transaction_returning_status, card
   * mod/core/set/all/result.rb:63-72, wraps the validation and storage
   * phases in one database transaction). Everything the save writes — the
   * card rows, its subcards, its acts, actions and changes, its references
   * and virtual-card rows — goes through the driver inside transaction(), so
   * a failure at any point leaves the database as it was. The integration
   * phase (ancestor timestamps, integrate-stage events, recently edited
   * settings, follower mail) runs only after the commit, as Ruby's
   * after_commit :integration_phase does (director/phases.rb:4); a failed
   * save sends no mail. Files a failed save stored are deleted again, and
   * the shared fetch caches, which saw the uncommitted rows, are reset.
   *
   * A save started while another runs on this engine (a revert's nested
   * update) joins the running one.
   */
  private async atomicSave<R>(work: () => Promise<R>): Promise<R> {
    if (this.saveDepth > 0) {
      this.saveDepth += 1;
      try {
        return await work();
      } finally {
        this.saveDepth -= 1;
      }
    }
    const driver = this.fetch.driver;
    if (!supportsTransactions(driver)) {
      throw new Error(
        "the SQL driver offers no transaction(), and a save must be atomic: refusing to write (src/server/driver.ts)",
      );
    }
    this.saveDepth = 1;
    this.afterCommitSteps = [];
    this.filesStoredThisSave = [];
    let result: R;
    try {
      result = await driver.transaction(work);
    } catch (error) {
      this.afterCommitSteps = [];
      await this.forgetRolledBackSave();
      throw error;
    } finally {
      this.saveDepth = 0;
    }
    const steps = this.afterCommitSteps;
    this.afterCommitSteps = [];
    this.filesStoredThisSave = [];
    for (const step of steps) await step();
    return result;
  }

  /** Queue an integration-phase step for after the running save commits
   *  (run at once when no save is running). */
  private async afterCommit(step: () => Promise<void>): Promise<void> {
    if (this.saveDepth > 0) this.afterCommitSteps.push(step);
    else await step();
  }

  /** Undo what a rolled-back save left outside the database. */
  private async forgetRolledBackSave(): Promise<void> {
    const files = this.filesStoredThisSave;
    this.filesStoredThisSave = [];
    if (this.attachmentStore?.discard !== undefined || this.codedAttachmentStore?.discard !== undefined) {
      for (const file of files) {
        try {
          // Coded files discard from the coded store (its own root).
          const store =
            file.coded !== undefined && this.codedAttachmentStore !== undefined
              ? this.codedAttachmentStore
              : this.attachmentStore;
          await store?.discard?.(file);
        } catch {
          // A file left behind is unreferenced (no row names it); the
          // rollback itself has already succeeded.
        }
      }
    }
    // The save expired and re-read cards as it wrote them; those cached
    // rows, names and verdicts describe a state that no longer exists.
    this.pendingSalts.clear();
    this.writeTaskState = undefined;
    this.fetch.resetCaches();
    await this.fetch.reprimeBootState();
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
   * Hook list ("Save-path registration
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
    opts: { actCardActionOmitted?: boolean; delayedStageDropped?: boolean; withinOtherAct?: boolean } = {},
  ): Promise<void> {
    if (result === null) return;
    // observer_<action> (card-mod-integrate observer.rb): the act card's
    // *on <action> email rule, for every actor. A delivery that raises
    // leaves an error on the card, and Ruby then runs none of its later
    // integrate stages — the follower notice included.
    let observerFailed = false;
    if (this.followMail !== undefined && result.name !== undefined) {
      const row = await this.fetchRowById(result.cardId);
      const outcome = await runObserverEvents(this.fetch, {
        card: { id: result.cardId, name: result.name.s, typeId: row?.type_id },
        action: result.verb,
        transport: this.notifyTransport ?? defaultTransport,
        origin: this.followMail.origin,
        deckoBotEmail: this.followMail.deckoBotEmail,
        actorName: this.actor?.name ?? ANONYMOUS_ACTOR_NAME,
        ...(this.notifyLogger !== undefined ? { logger: this.notifyLogger } : {}),
      });
      observerFailed = outcome.failed;
    }
    if (await this.isAnonymousSession()) return;
    const allHooks = this.integrationHooks ?? [
      buildFollowNotifyHook(
        defaultFollowNotifyDeps(this.fetch, {
          followers: this.followerResolver,
          ...(this.followMail === undefined ? {} : { mail: this.followMail }),
        }),
      ),
    ];
    // A save whose request carries an uploaded file never runs the
    // integrate_with_delay stage in Ruby: the stage is queued through
    // ActiveJob with the request params, the uploaded file object cannot be
    // serialized ("Unsupported argument type: ActionDispatch::Http::
    // UploadedFile", activejob serializers.rb:34), and the integrate stage
    // swallows the error (set/event.rb rescuing_if_integration). The
    // follower notice after an upload is therefore never sent; the delete
    // notice (:integrate) is unaffected.
    const hooks = opts.delayedStageDropped === true || observerFailed
      ? allHooks.filter((h) => h.stage !== "integrate_with_delay")
      : allHooks;
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
      : expandActionResultToSavePathEvents(result, actor, opts.withinOtherAct === true);
    const actCardName = result.name?.s ?? null;
    // Cardio.config.delaying: the integrate_with_delay stage schedules each
    // applicable event as a job instead of running it (event/all.rb#schedule
    // -> <event>_with_delay -> IntegrateWithDelayJob.perform_later). The
    // event's conditions are evaluated now, at scheduling time.
    let inline = hooks;
    if (this.delayedJobs?.delaying === true) {
      inline = hooks.filter((h) => h.stage !== "integrate_with_delay");
      const first = events[0];
      for (const hook of hooks) {
        if (hook.stage !== "integrate_with_delay" || first === undefined) continue;
        if (!hook.notable(first)) continue;
        await this.delayedJobs.queue.enqueue(this.delayedEventJob(hook, result, actor.id));
      }
    }
    if (inline.length === 0) return;
    await runIntegrationHooks({
      actId: result.actId,
      actor,
      silent: false,
      events,
      actCardName,
      hooks: inline,
      context: makeNotifyContext(this.notifyTransport ?? defaultTransport, this.notifyLogger),
    });
  }

  /** perform_delayed_job_args (delayed_event.rb:99-106) for one hook: the
   *  act id, the act card, its action attributes, Card::Env.serialize and
   *  Card::Auth.serialize (as_id is the signed-in user when nobody is
   *  impersonated), and the event's simple method name. */
  private delayedEventJob(hook: SavePathIntegrationHook, result: ActionResult, actorId: number): DelayedEventJob {
    const event = hook.event ?? hook.name ?? "integrate_with_delay";
    let protocol: string | null = null;
    let host: string | null = null;
    if (this.followMail !== undefined) {
      try {
        const url = new URL(this.followMail.origin);
        protocol = `${url.protocol}//`;
        host = url.hostname;
      } catch {
        // origin not a URL: protocol/host stay nil, as for a request-less Env
      }
    }
    return {
      queue: event,
      priority: hook.priority ?? DEFAULT_DELAYED_EVENT_PRIORITY,
      actId: result.actId,
      cardId: result.cardId,
      cardAttribs: { action: result.verb, currentActionId: result.actionId },
      env: {
        origin: this.followMail?.origin ?? "",
        html: true,
        "ajax?": null,
        "html?": true,
        ip: this.ipAddress,
        protocol,
        params: { ...(this.saveParams ?? {}) },
        main_name: null,
        ajax: null,
        host,
      },
      auth: { as_id: actorId, current_id: actorId },
      methodName: `${event}_without_callbacks`,
    };
  }

  /** The act a delayed job names, read back from card_acts/card_actions —
   *  Ruby's Act.find(act_id) in with_delay_act, then act.reload in
   *  notify_followers. */
  private async delayedJobAct(job: DelayedEventJob): Promise<SavePathAct> {
    const driver = this.fetch.driver;
    const actId = job.actId ?? 0;
    const actRow = (await driver.query<{ card_id: number | null; actor_id: number | null }>(
      "SELECT card_id, actor_id FROM card_acts WHERE id = ? LIMIT 1",
      [actId],
    )).rows[0];
    const actorId = job.auth.current_id ?? actRow?.actor_id ?? 0;
    const actorCard = await this.fetch.fetchById(actorId);
    const actor = { id: actorId, name: actorCard?.name?.s ?? "", email: null };
    const actions = (await driver.query<{ id: number; card_id: number; action_type: number | null }>(
      "SELECT id, card_id, action_type FROM card_actions WHERE card_act_id = ? AND (draft IS NULL OR draft = 0) ORDER BY id",
      [actId],
    )).rows;
    const VERBS = ["create", "update", "delete"] as const;
    const events: SavePathEvent[] = [];
    for (const action of actions) {
      const card = await this.fetch.fetchById(action.card_id, { lookInTrash: true });
      const verb = VERBS[action.action_type ?? 1] ?? "update";
      events.push({
        card: card?.name === undefined
          ? null
          : {
              id: action.card_id,
              name: card.name.s ?? null,
              leftName: card.name.leftName?.s ?? null,
              rightName: card.name.rightName?.s ?? null,
              type: null,
              content: null,
              trashed: verb === "delete",
            },
        verb,
        actId,
        actionId: action.id,
        actor,
        silent: false,
        isDeletePath: verb === "delete",
      });
    }
    const actCard = actRow?.card_id == null ? undefined : await this.fetch.fetchById(actRow.card_id, { lookInTrash: true });
    return { actId, actor, silent: false, events, actCardName: actCard?.name?.s ?? null };
  }

  /**
   * IntegrateWithDelayJob#perform (delayed_event.rb:57-81) for a job this
   * engine's hooks scheduled: Director.contextualize_delayed_event restores
   * the act, env and auth, then the event's simple method runs. The hook is
   * found by its event name (the job's queue). A missing hook or a hook
   * failure throws, so the worker records the row as failed
   * (handle_perform re-raises after Card::Error.report).
   */
  async performDelayedJob(job: DelayedEventJob): Promise<void> {
    const hooks = this.integrationHooks ?? [
      buildFollowNotifyHook(
        defaultFollowNotifyDeps(this.fetch, {
          followers: this.followerResolver,
          ...(this.followMail === undefined ? {} : { mail: this.followMail }),
        }),
      ),
    ];
    const hook = hooks.find((h) => (h.event ?? h.name) === job.queue);
    if (hook === undefined) {
      throw new Error(`undefined method '${job.methodName}' for an instance of Card`);
    }
    const act = await this.delayedJobAct(job);
    await runIntegrationHooks({
      actId: act.actId,
      actor: act.actor,
      silent: act.silent,
      events: act.events,
      actCardName: act.actCardName ?? null,
      hooks: [hook],
      context: makeNotifyContext(this.notifyTransport ?? defaultTransport, this.notifyLogger),
      onError: (err) => {
        throw err;
      },
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
    finalizeQueue?: (() => Promise<void>)[],
    deferredSubFinalizes?: DeferredReferenceFinalize[],
  ): Promise<(CardActionSummary & { actId: number })[]> {
    const saved: (CardActionSummary & { actId: number })[] = [];
    if (subcards === undefined) return saved;
    const trashedHere: (CardActionSummary & { actId: number })[] = [];
    for (const [key, sub] of await this.subcardStoreOrder(mainName, subcards)) {
      const fullName = key.startsWith("+") ? `${mainName?.s ?? ""}${key}` : key;
      const existing = await this.fetch.fetchByName(fullName);
      const existingRow =
        existing?.id !== undefined && existing.id !== null
          ? await this.fetchRowById(existing.id)
          : undefined;
      if (existingRow !== undefined && existingRow.trash === 0 && sub.trash === true) {
        const trashed = await this.trashInWriter(writer, existingRow, superActionId);
        saved.push(...trashed);
        trashedHere.push(...trashed);
        continue;
      }
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
            ...(sub.name !== undefined ? { name: sub.name } : {}),
            typeId: sub.typeId,
            typeCode: sub.typeCode,
            typeName: sub.typeName,
            attachment: sub.attachment,
            superActionId,
          },
          undefined,
          { isActCard: false, ...(finalizeQueue !== undefined ? { finalizeQueue } : {}) },
        );
        if (updated !== null) {
          saved.push({
            cardId: updated.cardId,
            actionId: updated.actionId,
            actId: updated.actId,
            verb: updated.verb,
            name: updated.name,
          });
        } else {
          // A POSTED subcard whose tracked fields all match still writes its
          // row: the director's set_stamper assigns updater_id/updated_at at
          // instantiation, so the controller-path save stamps the row with
          // no action and no change rows (events.rb:34-37 skips only the
          // action). The browser-journeys lane's oracle probe pins it: the
          // account form's password change moves the whole +*account
          // family's updater to the acting member (rows 618/619/620 — the
          // mark, the posted +*password, and the no-change +*email — one
          // act; the model-level update! without the posted no-change
          // subcard writes only the password row). An ABORTED subcard save
          // is different: validate_password_present sends a blank posted
          // +*password home before the stamp ("storing nothing" — no row
          // write at all), so the touch skips it.
          const abortedBlankPassword =
            (existingRow.right_id !== null && (await this.fetch.codenames.nameForId(existingRow.right_id))) === "password" &&
            (sub.content ?? "").trim() === "";
          if (!abortedBlankPassword) {
            await this.fetch.driver.query(
              "UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?",
              [sqlDateTime(this.clock()), (await this.actingIdForWrite()) ?? this.actor?.id ?? null, existingRow.id],
            );
          }
        }
        if (sub.subcards !== undefined) {
          saved.push(
            ...(await this.saveSubcardsInWriter(
              writer,
              DeckoName.parse(fullName),
              sub.subcards,
              updated?.actionId ?? superActionId,
              finalizeQueue,
              deferredSubFinalizes,
            )),
          );
        }
      } else {
        // A posted NEW subcard with no content and no type arguments is a
        // no-op save: "" is the stored default (prepare_db_content's
        // `standard_db_content || ""`), so the subcard's director aborts
        // unchanged — no action row, no INSERT, no mail section. The
        // structured form's pointer fields post exactly this shape (the
        // +related field's hidden blank content field — with the field's
        // *default-template type riding the hidden type_id input; the type
        // does not make the save: a blank-content subcard stores nothing
        // whatever its type).
        const blankNoop =
          sub.fromEventField !== true &&
          (sub.content === undefined || sub.content === "") &&
          sub.attachment === undefined &&
          (sub.subcards === undefined || Object.keys(sub.subcards).length === 0);
        if (blankNoop) continue;
        // The subcard's own reference FINALIZE defers until after its own
        // subcards save below — Ruby's stage order again (the subcard's
        // finalize stage follows its whole store stage).
        const subReferenceFinalize: DeferredReferenceFinalize = {};
        const created = await this.createInWriter(
          writer,
          {
            name: fullName,
            // the subcard's own subcards ride along so its validation sees
            // them (require_field); they are saved below, after it
            ...(sub.subcards !== undefined ? { subcards: sub.subcards } : {}),
            content: sub.content,
            typeId: sub.typeId,
            typeCode: sub.typeCode,
            typeName: sub.typeName,
            attachment: sub.attachment,
            superActionId,
            ...(sub.history === false ? { history: false } : {}),
            ...(sub.passwordEncrypted === true ? { passwordEncrypted: true } : {}),
          },
          { isActCard: false, deferFinalize: subReferenceFinalize },
        );
        // The stash lands HERE, before the card's own subcards recurse: the
        // deferred events run in store order (the oracle's reference-row ids
        // are sequential over the act's cards in store order).
        deferredSubFinalizes?.push(subReferenceFinalize);
        // a history-less card records no action (actionId 0): it is not a
        // subaction of the act
        if (sub.history !== false) {
          saved.push({
            cardId: created.cardId,
            actionId: created.actionId,
            actId: created.actId,
            verb: created.verb,
            name: created.name,
          });
        }
        // A subcard's own subcards (the sign-up form's
        // card[subcards][+*account][subcards][+*email]) save after it,
        // within the same act, chained to its action; a history-less
        // subcard's own subcards chain to the act itself.
        if (sub.subcards !== undefined) {
          saved.push(
            ...(await this.saveSubcardsInWriter(
              writer,
              DeckoName.parse(fullName),
              sub.subcards,
              sub.history === false ? superActionId : created.actionId,
              finalizeQueue,
              deferredSubFinalizes,
            )),
          );
        }
        await this.ensureAccountDefaults(
          writer,
          DeckoName.parse(fullName),
          created.cardId,
          created.actionId,
          saved,
        );
        // FINALIZE (after the store stage): the deferred reference events.
        // With a collector the caller runs them — the act card's own
        // reference events go first (reference_events.rb's order), then the
        // subcards' in store order.
        if (deferredSubFinalizes === undefined) {
          await this.runDeferredReferenceFinalize(subReferenceFinalize);
        }
      }
    }
    // delete_children (trash.rb:46-57) fires on EVERY :delete save — also on
    // a subcard trashed within a bigger save. The cascade runs once the act's
    // OWN trash arms have all processed, and skips the cards those arms
    // trashed (Ruby's director reuses a subcard already in the act: the card
    // keeps the supercard's action as its super action) while still walking
    // THROUGH them — their descendants cascade under the in-act card's own
    // delete action, exactly the oracle's revert cascade (leftover probe
    // step 12: the act's subcard deletes under the main action, the cards
    // outside the act under their cascade parents).
    if (trashedHere.length > 0) {
      const inAct = new Set<number>(trashedHere.map((t) => t.cardId));
      for (const t of trashedHere) {
        saved.push(...(await this.deleteChildren(writer, t.cardId, t.actionId, inAct)));
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
  // DISCLOSED (code-read, not verified against the reference — the
  // reference harness exercises read paths only, and no CarrierWave run
  // records a write): the change row of an update save carries the FINAL
  // identifier here; Ruby's intermediate dance around the column write
  // cannot be byte-verified. The FINAL observable state (column +
  // identifier parse + stored path + comment) is the pinned contract.
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
    const mount = codename !== undefined ? ATTACHMENT_MOUNTS[codename] : undefined;
    // Coded storage (attachment.coded): the files live under the mod's
    // data/files/<codename parts> and are named by the mount
    // ("image-original.svg", "file.txt") — coded.rb coded_dir +
    // FileCardUploader#filename — and the identifier is the coded one.
    const coded = attachment.coded;
    // full_filename (image_card_uploader.rb:44-57): the base file of an
    // IMAGE-mount upload carries -original whatever its extension (versions
    // alone depend on create_versions?); a FILE mount stores the plain
    // "<mount><ext>" (file_card_uploader.rb filename).
    const renditionNames =
      coded === undefined
        ? codename !== undefined && codename !== "" && mountUsesImageUploader(codename) && createVersionsFor(ext)
          ? renditionFileNames(actionId, ext)
          : undefined
        : mountUsesImageUploader(codename ?? "")
          ? [
              `${mount}-original${ext}`,
              ...(createVersionsFor(ext) ? IMAGE_VERSION_NAMES.map((v) => `${mount}-${v}${ext}`) : []),
            ]
          : undefined;
    // The version files (image_card_uploader.rb:16-27): resized renditions
    // keyed by their stored names — the SAME names renditionNames lists,
    // per storage class (the store looks bytes up by name): local keys are
    // action-id-keyed (Versions#full_filename), coded keys mount-keyed.
    let renditionBytes: Record<string, Uint8Array> | undefined;
    if (renditionNames !== undefined) {
      const versions = await imageVersionBytes(attachment.bytes, ext);
      if (versions !== undefined) {
        renditionBytes = {};
        for (const v of IMAGE_VERSION_NAMES) {
          renditionBytes[coded === undefined ? `${actionId}-${v}${ext}` : `${mount}-${v}${ext}`] = versions[v];
        }
      }
    }
    const storeInput: AttachmentStoreInput = {
      cardId,
      actionId,
      ext,
      bytes: attachment.bytes,
      renditionNames,
      ...(coded !== undefined && coded.mod !== undefined
        ? {
            coded: {
              mod: coded.mod,
              dirParts: await this.attachmentCodenameParts(cardRow),
              mountName: mount ?? "file",
            },
          }
        : {}),
      // Recorded before the write, so a store that fails half-way is cleaned
      // up with the rest of a rolled-back save.
    };
    this.filesStoredThisSave.push(storeInput);
    // Coded files live under the mod's data/files (their own store root).
    const store = coded !== undefined && this.codedAttachmentStore !== undefined ? this.codedAttachmentStore : this.attachmentStore;
    const stored = await store.store({
      ...storeInput,
      ...(renditionBytes !== undefined ? { renditionBytes } : {}),
    });
    const identifier =
      coded !== undefined && coded.mod !== undefined
        ? codedAttachmentIdentifier(
            (storeInput.coded as { dirParts: readonly string[] }).dirParts,
            coded.mod,
            ext,
          )
        : localAttachmentIdentifier(cardId, actionId, ext);

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
    const humanized = mount.charAt(0).toUpperCase() + mount.slice(1);
    const missing = (): CardActionError =>
      new CardActionError(
        "attachment-missing",
        `Validation failed: ${humanized} is missing`,
        `${mount.toUpperCase()}: is missing`,
        undefined,
        typeof input.name === "string" ? input.name : undefined,
      );
    if (input.attachment === undefined) {
      // the attachment arm: errors.add attachment_name, "is missing"
      throw missing();
    }
    // An image upload whose bytes cannot be processed: the version
    // processing fails, CarrierWave leaves the mount without a file, and
    // the same arm reports it missing (oracle: a PNG signature over
    // non-image bytes answers 422 "IMAGE: is missing", nothing written).
    if (mountUsesImageUploader(mount)) {
      const ext = detectAttachmentExtension(input.attachment.originalFilename, input.attachment.bytes);
      if (canResize(ext) && !(await imageDecodes(input.attachment.bytes))) throw missing();
    }
  }

  /**
   * event :validate_coded_storage_type, :validate, on: :save, when: :coded?
   * (card-mod-carrierwave set/abstract/attachment/coded.rb:7-10):
   *
   *   storage_type_error :mod_argument_needed_to_save unless mod
   *   storage_type_error :codename_needed_for_storage unless coded_ok?
   *
   * A coded save is one whose attachment carries the coded marker (the port
   * has no storage_type column; the marker is the assigned attribute). The
   * two errors accumulate, so a save with neither a mod nor full codename
   * coverage reports both, joined as ActiveRecord's RecordInvalid joins full
   * messages (locale en.yml: "mod argument needed to save card as coded",
   * "codename needed for storage type coded"; attribute Storage type).
   * coded_ok? (:22-24): no blank among the name parts' codenames.
   */
  private async validateCodedStorageType(
    attachment: AttachmentInput | undefined,
    name: DeckoName,
  ): Promise<void> {
    const coded = attachment?.coded;
    if (coded === undefined) return;
    const problems: string[] = [];
    if (coded.mod === undefined || coded.mod === "") {
      problems.push("Storage type mod argument needed to save card as coded");
    }
    const parts = await Promise.all(
      name.partNames.map(async (part) => {
        const id = await this.fetch.lexicon.id(part);
        return id === undefined ? undefined : (await this.fetchRowById(id))?.codename ?? undefined;
      }),
    );
    if (parts.some((p) => p === undefined || p === "")) {
      problems.push("Storage type codename needed for storage type coded");
    }
    if (problems.length > 0) {
      throw new CardActionError(
        "validation-failed",
        `Validation failed: ${problems.join(", ")}`,
        `STORAGE TYPE: ${problems.map((p) => p.replace(/^Storage type /, "")).join(", ")}`,
      );
    }
  }

  /** The card name's codename parts, in order (coded.rb codename_parts:
   *  `name.parts.map { |p| p.codename&.to_s }`) — the coded file directory
   *  under the mod's data/files. */
  private async attachmentCodenameParts(cardRow: CardsRow | undefined): Promise<readonly string[]> {
    if (cardRow === undefined) return [];
    const name = (await this.fetch.fetchById(cardRow.id))?.name;
    const parts: string[] = [];
    if (name !== undefined) {
      for (const part of name.partNames) {
        const id = await this.fetch.lexicon.id(part);
        const code = id === undefined ? undefined : (await this.fetchRowById(id))?.codename ?? undefined;
        if (code !== undefined && code !== "") parts.push(code);
      }
    }
    return parts;
  }

  // -----------------------------------------------------------------------
  // Set — Card.create! (director/card_class.rb:5-9: `card = new opts;
  // card.save!`). Junction names auto-create their side cards as subcards
  // in the same act; a name whose lex matches a trashed row revives that
  // row (manage_trash -> pull_from_trash!, trash.rb:23-25/:57-62).
  // -----------------------------------------------------------------------

  async createCard(input: CreateCardInput): Promise<ActionResult> {
    const outerAttributes = this.activeSaveAttributes;
    try {
      return await this.atomicSave(async () => this.createCardInner(await knownTypeSpec(this.fetch, input)));
    } finally {
      this.pendingSaveInput = undefined;
      this.activeSaveAttributes = outerAttributes;
    }
  }

  /** The account events on a create (card-mod-account): Sign up requires
   *  a +*account subcard (require_field :account); a +*account subcard's
   *  fields are validated (email format and uniqueness, password rules),
   *  normalized (downcased email, encrypted password) and completed (salt,
   *  default status), and password and salt are written without actions.
   *  Errors are raised in Ruby's shown form, before any write. */
  private async applyAccountFieldEvents(input: CreateCardInput, typeId: number): Promise<CreateCardInput> {
    const signupId = await this.fetch.codenames.id("signup");
    const holderIsSignup = signupId !== undefined && typeId === signupId;
    const account = input.subcards?.["+*account"];
    if (account === undefined) {
      if (holderIsSignup) {
        throw new CardActionError("user-error", "sign up without an account", "ACCOUNT: required");
      }
      return input;
    }
    const fields: Record<string, { content?: string | null }> = {};
    for (const [k, v] of Object.entries(account.subcards ?? {})) fields[k] = { content: v.content };
    const emailId = await this.fetch.codenames.id("email");
    const plan = await planAccountFields({
      fields,
      holderIsSignup,
      canApprove: holderIsSignup && (await this.canCreateDefaultAccountedType()),
      emailTaken: async (email) => {
        if (emailId === undefined) return false;
        const r = await this.fetch.driver.query<{ id: number }>(
          "SELECT id FROM cards WHERE right_id = ? AND db_content = ? AND trash = 0 LIMIT 1",
          [emailId, email],
        );
        return r.rows.length > 0;
      },
      now: this.clock(),
    });
    if (plan.errors.length > 0) {
      throw new CardActionError("user-error", `account fields rejected: ${plan.errors.join("; ")}`, plan.errors.join("\n"));
    }
    const subcards: Record<string, SubcardInput> = {};
    for (const w of plan.writes) {
      subcards[w.key] = {
        ...(account.subcards?.[w.key] ?? {}),
        content: w.content,
        ...(w.history ? {} : { history: false }),
        ...(w.key === "+*password" ? { passwordEncrypted: true } : {}),
      };
    }
    return { ...input, subcards: { ...input.subcards, "+*account": { ...account, subcards } } };
  }

  /** Renaming an account holder is refused before anything is written unless
   *  the actor is the account itself or a member of Help Desk. */
  private async assertMayRenameAccountHolder(cardId: number): Promise<void> {
    const accountId = await this.fetch.codenames.id("account");
    if (accountId === undefined) return;
    const r = await this.fetch.driver.query<{ id: number }>(
      "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1",
      [cardId, accountId],
    );
    if (r.rows.length === 0) return; // not an account holder
    // No blanket allow arm: an administrator who is not in Help Desk may not
    // rename another account.
    const state = await this.writePermissionState();
    if (this.actor !== null && this.actor.id === cardId) return; // own account
    const helpDesk = await this.fetch.codenames.id("help_desk");
    if (helpDesk !== undefined && state.viewerParties.includes(helpDesk)) return;
    throw new CardActionError(
      "user-error",
      "cannot rename Account Holder",
      "NAME: cannot rename Account Holder",
    );
  }

  /** card-mod-bootstrap set/type/bootswatch_skin/events.rb copy_theme: a
   *  new Bootswatch skin adds its +*variables and +*colors fields (SCSS),
   *  and each is permission-checked as its own create; a denied field
   *  rejects the whole save (shown as "+*VARIABLES: permission_denied
   *  You don't have permission to create <skin>+*variables"). On a new
   *  skin only +*variables is checked here, as Ruby's create path does
   *  (type_plus_right/bootswatch_skin/colors.rb ok_to_create?). The
   *  fields' own creation on an allowed save is not ported. */
  private async checkSkinFieldPermissions(name: DeckoName, typeId: number): Promise<void> {
    const skinTypeId = await this.fetch.codenames.id("bootswatch_skin");
    if (skinTypeId === undefined || typeId !== skinTypeId) return;
    const scssId = await this.fetch.codenames.id("scss");
    if (scssId === undefined) return;
    const fieldName = `${name.s}+*variables`;
    const probe = newCardRecord(DeckoName.parse(fieldName), { typeId: scssId });
    const verdict = await saveTaskVerdictForCard(
      this.fetch,
      await this.patternInputFor(probe, scssId),
      "create",
      await this.writePermissionState(),
    );
    if (verdict !== true) {
      const message = `You don't have permission to create ${fieldName}`;
      throw new CardActionError(
        "user-error",
        `skin field denied: ${message}`,
        `+*VARIABLES: permission_denied ${message}`,
        { "+*variables": `permission_denied ${message}` },
      );
    }
  }

  /** update_layout_registry (card-mod-layout set/type/layout_type.rb:7-10,
   *  :finalize, on: :update) re-registers the layout and raises
   *  `Card::Error, "no main nest found in layout \"<name>\""` when neither
   *  its content nor the cards it nests (five levels deep,
   *  lib/card/layout/card_layout.rb:20-40) holds a {{_main}} nest. The
   *  raise rolls the act back; the port refuses before writing.
   *
   *  The raised class is the BASE Card::Error, not ServerError. The
   *  controller's rescue (card_controller/errors.rb:18 handle_exception,
   *  reached because a deployed site sets rescue_all_in_controller — see
   *  decko-0.20.0 config/environments/production.rb:1-3) reports it through
   *  Card::Error.report, which keeps an exception that already IS a
   *  Card::Error (card/error.rb cardify_exception, :146) rather than
   *  rewrapping it as ServerError. The base class carries view :errors and
   *  status_code 422 (card/error.rb:20-21), so the deployed answer is the
   *  errors-view alert at 422 — the "ERROR" key is the class name's last
   *  segment upcased (card/error.rb add_card_errors, :159-161) — and not the
   *  500 Wild Card page a ServerError would give. */
  private async assertLayoutHasMainNest(
    row: CardsRow,
    content: string | null | undefined,
    assignedTypeId: number | undefined,
  ): Promise<void> {
    const layoutTypeId = await this.fetch.codenames.id("layout_type");
    if (layoutTypeId === undefined || (assignedTypeId ?? row.type_id) !== layoutTypeId) return;
    const nests = (text: string): string[] =>
      [...text.matchAll(/\{\{([^}|]*)/g)].map((m) => m[1].trim()).filter((n) => n !== "");
    const hasMain = async (text: string, depth: number): Promise<boolean> => {
      const names = nests(text);
      if (names.some((n) => n === "_main")) return true;
      if (depth > 5) return false;
      for (const n of names) {
        if (n.startsWith("_")) continue;
        const nested = await this.fetch.fetchByKey(DeckoName.parse(n).key);
        if (nested !== undefined && !nested.trash && (await hasMain(nested.dbContent ?? "", depth + 1))) return true;
      }
      return false;
    };
    if (await hasMain(content ?? row.db_content ?? "", 0)) return;
    const name = (await this.composedNameOf(row))?.s ?? String(row.id);
    const message = `no main nest found in layout "${name}"`;
    throw new CardActionError("user-error", message, `ERROR: ${message}`, { Error: message }, name);
  }

  /** initialize_because_of_type_change (card-mod-bootstrap
   *  set/type/bootswatch_skin/events.rb:1-8, :prepare_to_store, on:
   *  :update, changed: :type): a card that becomes a Bootswatch skin gets
   *  its +*colors and +*variables fields, and its old item list (less
   *  "bootstrap default skin") becomes its +*stylesheets field — a Skin
   *  list whose items must be CSS or SCSS cards (validate_item_type,
   *  shown as "+*STYLESHEETS: <item> has an invalid type: <type>. Allowed
   *  types: CSS and SCSS."). */
  private async applySkinTypeChange(
    row: CardsRow,
    input: UpdateCardInput,
    assignedTypeId: number | undefined,
  ): Promise<UpdateCardInput> {
    const skinTypeId = await this.fetch.codenames.id("bootswatch_skin");
    if (skinTypeId === undefined || assignedTypeId !== skinTypeId) return input;
    const cssId = await this.fetch.codenames.id("css");
    const scssId = await this.fetch.codenames.id("scss");
    const skinListId = await this.fetch.codenames.id("skin");
    if (scssId === undefined) return input;
    const items = (row.db_content ?? "")
      .split(/\n+/)
      .map((i) => i.replace(/\[\[|\]\]/g, "").trim())
      .filter((i) => i !== "" && DeckoName.parse(i).key !== DeckoName.parse("bootstrap default skin").key);
    const typeNames = await Promise.all(
      [cssId, scssId].map(async (id) => (id === undefined ? undefined : await this.typeNameOf(id))),
    );
    const allowed = typeNames.filter((n): n is string => n !== undefined).join(" and ");
    const problems: string[] = [];
    for (const item of items) {
      const card = await this.fetch.fetchByKey(DeckoName.parse(item).key);
      const typeId = card?.typeId ?? undefined;
      if (typeId === cssId || typeId === scssId) continue;
      const typeName = typeId === undefined || typeId === null ? "?" : await this.typeNameOf(typeId);
      problems.push(`+*STYLESHEETS: ${card?.name?.s ?? item} has an invalid type: ${typeName}. Allowed types: ${allowed}.`);
    }
    if (problems.length > 0) {
      throw new CardActionError("user-error", "skin stylesheets rejected", problems.join("\n"));
    }
    const subcards: Record<string, SubcardInput> = { ...input.subcards };
    subcards["+*colors"] ??= { typeId: scssId, fromEventField: true };
    subcards["+*variables"] ??= { typeId: scssId, fromEventField: true };
    if (items.length > 0) {
      subcards["+*stylesheets"] ??= {
        ...(skinListId === undefined ? {} : { typeId: skinListId }),
        content: items.join("\n"),
        fromEventField: true,
      };
    }
    return { ...input, subcards };
  }

  /** A new Bootswatch skin's create events (card-mod-bootstrap
   *  set/type/bootswatch_skin/events.rb):
   *  - validate_theme_template (:validate): a skin whose +parent names a
   *    card that is not itself a Bootswatch skin is refused with "not a
   *    valid theme <name>" (en.yml bootstrap_not_valid_theme). Ruby never
   *    reaches the message: theme_card calls theme_card on the non-skin
   *    parent and raises NoMethodError (a 500). The port gives the error
   *    the event was written to give — a deliberate difference.
   *  - copy_theme (:prepare_to_store): the skin gets its +*colors and
   *    +*variables fields, typed SCSS, in the same act. */
  private async applySkinCreateEvents(input: CreateCardInput, typeId: number): Promise<CreateCardInput> {
    const skinTypeId = await this.fetch.codenames.id("bootswatch_skin");
    if (skinTypeId === undefined || typeId !== skinTypeId) return input;
    const parentId = await this.fetch.codenames.id("parent");
    const parentCard = parentId === undefined ? undefined : await this.fetch.fetchById(parentId);
    const parentKey = parentCard?.name?.key ?? DeckoName.parse("parent").key;
    const parentEntry = Object.entries(input.subcards ?? {}).find(
      ([k]) => DeckoName.parse(k.replace(/^\+/, "")).key === parentKey,
    )?.[1];
    const firstItem = (parentEntry?.content ?? "")
      .split(/\n+/)
      .map((i) => i.replace(/\[\[|\]\]/g, "").trim())
      .find((i) => i !== "");
    if (firstItem !== undefined) {
      const parent = await this.fetch.fetchByKey(DeckoName.parse(firstItem).key);
      if (parent !== undefined && !parent.trash && parent.typeId !== skinTypeId) {
        const message = `not a valid theme ${parent.name?.s ?? firstItem}`;
        throw new CardActionError("user-error", message, `ABORT: ${message}`, { abort: message });
      }
    }
    const scssId = await this.fetch.codenames.id("scss");
    if (scssId === undefined) return input;
    const subcards: Record<string, SubcardInput> = { ...input.subcards };
    for (const field of ["+*colors", "+*variables"]) {
      if (subcards[field] === undefined) subcards[field] = { typeId: scssId, fromEventField: true };
    }
    return { ...input, subcards };
  }

  /** card-mod-account set/right/password.rb on a save that writes a
   *  +*password card's content itself (a password change, or a password
   *  field created outside a sign-up): validate_password_present (an
   *  update to blank changes nothing), validate_password_length /
   *  validate_password_chars on the raw value (shown as "PASSWORD: ..."),
   *  and encrypt_password with the account's stored salt (Auth.encrypt
   *  with a nil salt when there is none). Undefined when the card is not a
   *  password field; `skip` for the blank update. */
  private async passwordFieldContent(
    rightId: number | undefined,
    leftId: number | null | undefined,
    content: string | null | undefined,
    verb: "create" | "update",
  ): Promise<{ content: string } | { skip: true } | undefined> {
    const passwordId = await this.fetch.codenames.id("password");
    if (passwordId === undefined || rightId !== passwordId) return undefined;
    const raw = content ?? "";
    if (verb === "update" && raw.trim() === "") return { skip: true };
    const problems = passwordErrors(raw);
    if (problems.length > 0) {
      throw new CardActionError(
        "user-error",
        "password field rejected",
        problems.map((m) => `PASSWORD: ${m}`).join("\n"),
      );
    }
    let salt = "";
    const saltId = await this.fetch.codenames.id("salt");
    if (leftId !== null && leftId !== undefined && saltId !== undefined) {
      const r = await this.fetch.driver.query<{ db_content: string | null }>(
        "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1",
        [leftId, saltId],
      );
      salt = r.rows[0]?.db_content ?? "";
    }
    return { content: await encryptPassword(raw, salt) };
  }

  /** Sign up's can_approve? (set/type/signup.rb): the actor may create a
   *  card of the default accounted type (User). */
  private async canCreateDefaultAccountedType(): Promise<boolean> {
    const userTypeId = await this.fetch.codenames.id("user");
    if (userTypeId === undefined) return false;
    // Ruby's Card.new(type_id:) has no name; a simple placeholder name
    // walks the same rule candidates (its *self set holds no rule).
    const probe = newCardRecord(DeckoName.parse("can approve probe"), { typeId: userTypeId });
    const verdict = await saveTaskVerdictForCard(
      this.fetch,
      await this.patternInputFor(probe, userTypeId),
      "create",
      await this.writePermissionState(),
    );
    return verdict === true;
  }

  private async createCardInner(input: CreateCardInput): Promise<ActionResult> {
    const name = DeckoName.parse(input.name ?? "");    // The anonymous-create arm: Ruby's create permission chain has NO
    // signed-in clause. An anonymous session's Auth.as_id IS the Anonymous
    // card (auth/current.rb:7-9 + auth/proxy.rb:33-35), and ok_to_create?
    // (card-mod-permissions set/all/permissions.rb:120-125) runs for it
    // exactly as for any other actor. That the arm is live is not in doubt:
    // anonymous-created cards exist, and the *type+*create rules that grant
    // Anyone are what make them creatable. The acting id is the signed-in
    // account or the
    // Anonymous card; the RULE check (assertCanWrite) then decides
    // allow/deny. Only a deck that cannot even form the anonymous actor
    // (no anonymous codename card — a fragment seed; Ruby could not form
    // Card[AnonymousID] there either) keeps the legacy signed-in-only
    // rejection. Update and delete ride the same acting-id pattern
    // (actingIdForWrite) — Ruby's chain rules all three tasks identically.
    this.assertAccountsHaveEmail(input.subcards);
    await this.assertAccountFieldLeftExists(name);
    const actingId = await this.actingIdForWrite();
    if (actingId === undefined) this.assertWritable();
    // extract_type_id! runs at Card.new time (type.rb:87-96), BEFORE the
    // validate-stage ok? check — so the permission gate sees the WOULD-BE
    // type and the *type+*create rule candidates resolve for the card
    // actually being created.
    const typeId = await resolveTypeId(this.fetch, { ...input, name });
    const placeholder = newCardRecord(name, { typeId });
    await this.assertCanWrite(placeholder, "create");
    // The two-step upload's final save (00_upload_cache.rb:27-34
    // assign_attachment_on_create, after :assign_action, when
    // save_preliminary_upload?): the cached DRAFT action's stored file
    // becomes this save's attachment — its comment (the original filename)
    // rides the action comment through the writer's attachment arm, and
    // the integrate phase (below) deletes the draft action + its cache
    // file while the draft's ACT survives. The cache bytes live in the tmp
    // area under the *new file/*new image card; cachedUploadAttachment
    // resolves that shape from the action id alone. An unresolvable id
    // leaves the save WITHOUT an attachment — Ruby's arm returns early the
    // same way (Card::Action.fetch nil), and validate_file_exist then
    // refuses the mount-typed create ("File/Image is missing", 422).
    let cachedUpload: { attachment: AttachmentInput; release: () => Promise<void> } | undefined;
    if (input.actionIdOfCachedUpload !== undefined) {
      const typeRow = await this.fetchRowById(typeId);
      const mount =
        typeRow?.codename != null && typeRow.codename !== ""
          ? ATTACHMENT_MOUNTS[typeRow.codename]
          : undefined;
      if (mount !== undefined) {
        cachedUpload = await this.cachedUploadAttachment(input.actionIdOfCachedUpload, { mount });
        if (cachedUpload !== undefined) input = { ...input, attachment: cachedUpload.attachment };
      }
    }
    // The account field events (auth/account-fields.ts) run over the whole
    // +*account subtree before anything is written: Ruby validates every
    // subcard in the validate stage, so a rejected sign-up stores nothing.
    input = await this.applyAccountFieldEvents(input, typeId);
    await this.checkSkinFieldPermissions(name, typeId);
    input = await this.applySkinCreateEvents(input, typeId);
    this.setActiveSaveAttributes(input);
    await assertStyleCompilerFor(this.styleAssetContext(actingId), name, typeId);
    const writer = this.newWriter(actingId);
    // Ruby runs every card's finalize events after the whole act's store
    // phase, so the act card's reference janitors see the subcards' rows:
    // the stores below enqueue their finalize thunks and they all run after
    // (act card first, then the subcards in save order).
    const finalizeQueue: (() => Promise<void>)[] = [];
    let result: ActionResult;
    // The act card's reference FINALIZE defers until after the subcard
    // stores: Ruby's finalize stage runs after the whole store stage
    // (director/phases.rb storage_phase — store, then finalize), and the
    // subcards save inside that store stage (director/store.rb:37-58), so
    // the reference walk's Lexicon.id resolves every card created earlier
    // in the SAME act (the structured create's +summary: the walk answers
    // its id, no partial arm). The deferred body runs below, after the last
    // store-stage write of the act.
    const referenceFinalize: DeferredReferenceFinalize = {};
    try {
      result = await this.createInWriter(writer, input, {
        isActCard: true,
        resolvedTypeId: typeId,
        deferFinalize: referenceFinalize,
      });
    } catch (error) {
      await this.dropUnfilledActions(writer);
      throw error;
    }
    // subcards.rb:1-16: the subcards ride this save's act (director/
    // store.rb:37-58) — the "create Book card with plusses" submission.
    let finalResult = result;
    const deferredSubFinalizes: DeferredReferenceFinalize[] = [];
    const subResults = await this.saveSubcardsInWriter(writer, name, input.subcards, result.actionId, finalizeQueue, deferredSubFinalizes);
    await this.ensureAccountDefaults(writer, name, result.cardId, result.actionId, subResults);
    if (subResults.length > 0) {
      finalResult = { ...result, subactions: [...result.subactions, ...subResults] };
    }
    // FINALIZE (after the store stage): the act card's deferred reference
    // events FIRST, then the subcards' in store order — reference_events.rb's
    // definition order per card, cards in the director's store order. The
    // synthetic-v1 oracle's create-topic-with-fields step pins the row-id
    // sequence: the act's four reference rows precede the subcard's.
    await this.runDeferredReferenceFinalize(referenceFinalize);
    for (const d of deferredSubFinalizes) {
      await this.runDeferredReferenceFinalize(d);
    }
    // II (director.rb:26): the integration phase runs after the save's
    // transaction commits (after_commit :integration_phase, director/
    // phases.rb:4), and the integrate seam runs BEFORE the notify hooks
    // (Ruby's notify_followers is itself an integration event,
    // card-mod-follow set/all/notify.rb:13-16).
    await this.afterCommit(async () => {
      // FINALIZE: the style asset events (asset inputs, the site stylesheet).
      const savedCards = this.savedCardsOf(finalResult);
      await runStyleAssetEvents(this.styleAssetContext(actingId), savedCards);
      await this.bumpAncestorTimestamps(CardActionEngine.savedCardIds(finalResult));
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
      // delete_cached_upload_file_on_create (:integrate, 00_upload_cache.rb
      // :51-57): the cache files + the DRAFT action row go
      // (upload_cache_card.delete_files_for_action action; action.delete —
      // ActiveRecord #delete, so the draft's change rows stay); the
      // draft's ACT survives — the oracle rows pin the surviving orphan
      // (card_acts card_id null beside the create's own act).
      if (cachedUpload !== undefined) await cachedUpload.release();
      await this.saveRecentlyEditedSettings(finalResult);
      await this.dispatchSavePathIntegrations(finalResult, {
        delayedStageDropped: input.attachment !== undefined && input.attachment.fromCachedUpload !== true,
        withinOtherAct: (input as { withinOtherAct?: boolean }).withinOtherAct === true,
      });
    });
    return finalResult;
  }

  /** The create implementation, bound to an existing writer so side
   *  subcards join the caller's act (Ruby: subcards save within the
   *  supercard's Director run, director/store.rb:37-58). `resolvedTypeId`
   *  rides in when the caller already paid resolveTypeId (the gated act
   *  card). `finalizeQueue` defers this card's finalize events (its
   *  runFinalizeEvents stage walk + reference janitors) to the caller: Ruby
   *  runs every card's finalize AFTER the whole act's store phase, so the
   *  act card's refresh_references_out sees its subcards' rows (and their
   *  Lexicon entries) — an inline finalize parses the template content
   *  before the subcards exist and emits partial "P" rows Ruby never
   *  writes. Absent (every other caller): finalize runs inline, unchanged. */
  private async createInWriter(
    writer: ActWriter,
    input: CreateCardInput,
    opts: {
      isActCard: boolean;
      resolvedTypeId?: number;
      /** When provided, the card's reference FINALIZE events (the
       *  refresh_references_out/in built-ins) are not run inline; the box
       *  receives them and the caller runs runDeferredReferenceFinalize
       *  after the act's store-stage writes complete — Ruby's stage order
       *  (director/phases.rb: store, then finalize; the subcards save
       *  inside the store stage). */
      deferFinalize?: DeferredReferenceFinalize;
    },
  ): Promise<ActionResult> {
    const name = DeckoName.parse(input.name ?? "");
    // A +*password card's content is validated and stored encrypted (the
    // sign-up plan's password arrives encrypted already).
    if (input.passwordEncrypted !== true && name.isCompound && name.rightName !== undefined) {
      const rightId = await this.fetch.lexicon.id(name.rightName);
      const leftId = name.leftName !== undefined ? await this.fetch.lexicon.id(name.leftName) : undefined;
      const pw = await this.passwordFieldContent(rightId, leftId, input.content, "create");
      if (pw !== undefined && "content" in pw) input = { ...input, content: pw.content, passwordEncrypted: true };
    }
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
        dbContentBeforeAct: null,
        action: "create",
        typeId: eventTypeId,
      });
    await this.dispatchEventStage("initialize", validationCard());
    await this.dispatchEventStage("prepare_to_validate", validationCard());
    validateNameLegality(name); // validate_legality_of_name (name_events.rb:35-47)
    const typeId =
      opts.resolvedTypeId ??
      (await resolveTypeId(this.fetch, { ...input, name })); // extract_type_id! + type_id_from_code + default
    // The validate-stage event card reads this variable (the closure below):
    // once the form's type resolution lands, the type-scoped set modules'
    // events (set/type/number.rb :validate_number — card-mod-format's
    // `errors.add :content, t(:format_not_numeric) unless content.number?`)
    // match by it. Leaving the caller's undefined in place silently skipped
    // every type-scoped validate event on a create whose type the request
    // itself resolved.
    eventTypeId = typeId;
    // set_default_content (content.rb:12-15, :prepare_to_validate, on:
    // :create, when: use_default_content?): a create that assigns no content
    // takes the new-card template's content. Ruby's db_content_changed? is
    // false only when no content was assigned at all; an explicit "" counts
    // as assigned. An attaching save derives its own content.
    // Assigned content is standardized first (prepare_assignment_params,
    // assign_attributes.rb:35-39); template content is not assigned.
    if (input.content != null && input.attachment === undefined) {
      input.content = await this.standardizeAssignedContent(
        input.content,
        typeId,
        name.isCompound && name.leftName !== undefined ? ((await this.fetch.lexicon.id(name.leftName)) ?? null) : null,
        name.isCompound && name.rightName !== undefined ? ((await this.fetch.lexicon.id(name.rightName)) ?? null) : null,
        // The saved card's own codename (the self-set list cards): a create
        // carries one only when assigned; an existing name is refused below,
        // so the update path supplies the row's codename instead.
        (input as { codename?: string }).codename,
      );
    }
    if (input.content == null && input.attachment === undefined) {
      const templateContent = await this.newCardTemplateContent(name, typeId);
      if (templateContent !== undefined) input.content = templateContent;
    }
    await assertNameAvailable(this.fetch, name, undefined); // validate_uniqueness_of_name (:19-26)
    await this.validateFileExist(input, typeId); // validate_file_exist (attachment.rb:26-34)
    await this.validateCodedStorageType(input.attachment, name); // validate_coded_storage_type (coded.rb:7-10)
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

    // A compound card's own action row is saved before the side subcards
    // its create makes (ActWriter.reserveAction has the Ruby mechanism), so
    // it is reserved here and filled by the row write below. A history-less
    // create records no action at all (write-path returns before the fill),
    // so reserving for one would strand an orphaned cardless action row —
    // Ruby records nothing for a no-history create (the account plan's
    // +*salt / +*password writes).
    const reservedActionId = name.isCompound && input.history !== false
      ? await writer.reserveAction({ actionType: "create", superActionId: input.superActionId ?? null })
      : undefined;
    // prepare_left_and_right (name_events.rb:68-73): compound names resolve
    // their sides; missing sides become subcard creates in this act
    // (prepare_new_side :118-125). The compound's own action is recorded
    // before the sides' actions, as Ruby orders them.
    const sides = await this.ensureSides(writer, name, undefined, { reserveOwnAction: true });

    // manage_trash -> pull_from_trash! (trash.rb:23-25, :57-62): a matching
    // trashed row is revived (its id reused) instead of a fresh INSERT.
    const lex = this.lexOf(name, sides.leftId, sides.rightId);
    // Known divergence: when a side is created or revived in this act, Ruby's
    // manage_trash (prepare_to_store) runs before prepare_left_and_right
    // assigns the side id (:store), so its lex query cannot find the trashed
    // junction and Ruby INSERTs a second (left_id, right_id) row. On a schema
    // with the upstream UNIQUE (left_id, right_id) index that insert fails
    // the save; on a deck without it a duplicate junction row is left behind.
    // The port revives the trashed row instead.
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
    // set_content (:store, content.rb:1-5): prepare_db_content cleans the
    // stored HTML before the row write.
    if (input.content != null && input.attachment === undefined) {
      input.content = await this.cleanForStore(
        input.content,
        typeId,
        name.isSimple ? null : sides.rightId,
      );
    }

    if (trashed !== undefined) {
      const before = cardFieldStateFromRow(trashed);
      // pull_from_trash! reuses ONLY the row id (trash.rb:60-62); every
      // other attribute comes from the new record, exactly as this update
      // state expresses it (trash forced false by manage_trash :23-27).
      const after: CardFieldState = {
        name: name.isSimple ? name.s : null,
        type_id: typeId,
        // set_content (content.rb:1-5): prepare_db_content stores
        // `standard_db_content || ""` — a save never writes NULL content.
        db_content: input.content ?? "",
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
          dbContentBeforeAct: trashed.db_content ?? null,
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
        // The revived record is new apart from its id (trash.rb:57-62), so
        // every assigned field counts as changed against a blank record:
        // the oracle records name, type_id, db_content and trash changes for
        // a revived simple card even where the trashed row held the same
        // values.
        changedFields: (Object.keys(after) as (keyof CardFieldState)[]).filter(
          (f) => after[f] !== null,
        ),
        reservedActionId,
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
      // code (0) here;  ("revival action type").
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
      // With deferFinalize the events are STASHED for the caller (the
      // deferred-reference-finalize seam — see the fresh-create arm).
      const revivalFinalizeCard = (): ModEventCard =>
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
        });
      const revivalFinalizeThunks: ReadonlyArray<readonly [string, () => Promise<void>]> = [
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
      ];
      if (opts.deferFinalize !== undefined) {
        opts.deferFinalize.card = revivalFinalizeCard();
        opts.deferFinalize.thunks = revivalFinalizeThunks;
      } else {
        await this.runFinalizeEvents(revivalFinalizeCard(), revivalFinalizeThunks);
      }
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
    // Account fields (account-fields.ts): encrypt_password at :store, over
    // the account's salt (a salt generated earlier in this act counts).
    const rightCode =
      name.isSimple || sides.rightId === null ? undefined : await this.fetch.codenames.nameForId(sides.rightId);
    if (rightCode === "password" && input.content != null && input.attachment === undefined && input.passwordEncrypted !== true) {
      // validate_password_length / validate_password_chars (:validate) run on
      // the assigned password, before encrypt_password (:store) — skipped
      // when the caller already stored the digest (passwordEncrypted).
      const problems = passwordErrors(input.content);
      if (problems.length > 0) {
        throw new CardActionError("validation-failed", `Validation failed: ${problems.join(", ")}`);
      }
      input.content = await storedPasswordValue(input.content, await this.accountSalt(sides.leftId), this.passwordHashing);
    }
    // The +*email save's validate events (right/email.rb:7-32): a +*email
    // card is only stored with a well-formed, downcased, unique address.
    if (rightCode === "email" && input.content != null && input.attachment === undefined && sides.rightId !== null) {
      input.content = await this.validatedEmailContent(input.content, sides.rightId, null);
    }
    // require_field :email (set/right/account.rb:8): an account is created
    // only with its +*email, named in this save's subcards or already stored.
    if (rightCode === "account") {
      const named = Object.keys(input.subcards ?? {}).some(
        (k) => k.split("+").map((p) => p.trim().toLowerCase()).pop() === "*email",
      );
      const stored =
        !named && (await this.fetch.lexicon.id(DeckoName.parse(`${name.s}+*email`))) !== undefined;
      if (!named && !stored) {
        // require_field :email is errors.add :email, :required, so the JSON
        // errors view reports { email: "required" } and the HTML error view
        // shows "EMAIL: required".
        throw new CardActionError(
          "field-required",
          "Validation failed: Email required",
          "EMAIL: required",
          { email: "required" },
        );
      }
    }
    const created = await writer.createCard({
      name: name.isSimple ? name.s : null,
      key: name.isSimple ? name.key : null,
      type_id: typeId,
      // assign_set_specific_attributes (attachment.rb:90-97): an attaching
      // save RESETS content — the identifier replaces any content argument.
      // set_content (content.rb:1-5): `standard_db_content || ""` — a
      // content-less create stores "", never NULL.
      db_content: input.attachment !== undefined ? null : (input.content ?? ""),
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
      ...(sides.reservedActionId !== undefined ? { reservedActionId: sides.reservedActionId } : {}),
      ...(input.history === false ? { history: false } : {}),
      superActionId: input.superActionId ?? null,
      isActCard: opts.isActCard,
      reservedActionId,
    });
    if (rightCode !== undefined && NO_HISTORY_RIGHT_CODENAMES.has(rightCode)) {
      await this.dropHistory(created.actionId, created.actId, created.actPreexisted === true);
    }
    // set_default_salt (account/events.rb:3-5): the account's salt is
    // generated now, so a password saved later in this act encrypts over it;
    // the salt card itself is stored after the request's own fields
    // (ensureAccountDefaults).
    if (rightCode === "account") {
      this.pendingSalts.set(created.cardId, generateSalt(this.clock()));
    }
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
    //
    // With deferFinalize the events are STASHED, not run: the caller runs
    // them after the act's store-stage writes (the subcards) complete —
    // Ruby's stage order (director/phases.rb storage_phase: store, then
    // finalize), which is what lets the reference walk's Lexicon.id resolve
    // the cards created earlier in the same act.
    const referenceFinalizeCard = (): ModEventCard =>
      this.eventCard({
        name,
        id: created.cardId,
        key: name.key,
        dbContent: attachmentIdentifier ?? (input.content ?? null),
        dbContentBeforeAct: null,
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
      });
    const referenceFinalizeThunks: ReadonlyArray<readonly [string, () => Promise<void>]> = [
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
    ];
    if (opts.deferFinalize !== undefined) {
      opts.deferFinalize.card = referenceFinalizeCard();
      opts.deferFinalize.thunks = referenceFinalizeThunks;
    } else {
      await this.runFinalizeEvents(referenceFinalizeCard(), referenceFinalizeThunks);
    }
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
    // card[skip] (skip_and_trigger.rb): the events this save's act skips,
    // seen by every event of the act, nested saves included.
    const outerSkip = this.saveSkip;
    const outerAttributes = this.activeSaveAttributes;
    if (input.skip !== undefined && input.skip.length > 0) {
      this.saveSkip = [...(outerSkip ?? []), ...input.skip];
    }
    try {
      return await this.atomicSave(async () => this.updateCardInner(await knownTypeSpec(this.fetch, input)));
    } finally {
      this.saveSkip = outerSkip;
      this.pendingSaveInput = undefined;
      this.activeSaveAttributes = outerAttributes;
    }
  }

  /** The current save's own skip list (UpdateCardInput.skip), merged with
   *  the runtime's engine-wide skip list wherever an event asks. */
  private saveSkip: string[] | undefined;

  /** skip_event? (skip_and_trigger.rb:68-70) for the current save. */
  private skipsEvent(event: string): boolean {
    return (
      this.saveSkip?.includes(event) === true ||
      this.modEvents?.skip?.includes(event) === true ||
      this.modEvents?.forceSkip?.includes(event) === true
    );
  }

  private actSkipList(): readonly string[] | undefined {
    if (this.saveSkip === undefined) return this.modEvents?.skip;
    return [...(this.modEvents?.skip ?? []), ...this.saveSkip];
  }

  private async updateCardInner(input: UpdateCardInput): Promise<ActionResult | null> {
    // The anonymous-update arm: same chain as create — ok_to_update?
    // (permissions.rb:148-153 permit(:update) + the type-change clause)
    // has NO signed-in clause; an anonymous session's Auth.as_id IS the
    // Anonymous card (auth/current.rb:7-9 + proxy.rb:33-35). That the arm
    // is live is not in doubt: anonymous-updated cards exist. Only a fragment
    // seed (no anonymous codename card to act as) keeps the legacy
    // signed-in-only rejection.
    const actingId = await this.actingIdForWrite();
    if (actingId === undefined) this.assertWritable();
    const row = await this.fetchRowById(input.cardId);
    // Card[id] of a missing or trashed card fetches nil (retrieval adds
    // trash = 0 — fetch/retrieval_from_db_query) and update! on nil fails;
    // revival-from-trash by name is the CREATE path's job. A look_in_trash
    // fetch (retrieve.rb:31) reaches the trashed row: the history pane's
    // revert requests update a trashed card that way.
    if (row === undefined || (row.trash === 1 && input.lookInTrash !== true)) {
      throw new CardActionError("not-found", `no such card: ${input.cardId}`);
    }
    // The *signin card's :signin event (card-mod-account set/self/signin.rb:
    // 4-6, `event :signin, :validate, on: :update`) runs on every update of
    // the card: authenticate_or_abort reads the form's email and password
    // first, and aborts with :email_missing / :password_missing when either
    // is absent (signin.rb:53-56, en.yml account_email_missing /
    // account_password_missing). The abort stores nothing. A save that
    // carries both fields continues to the sign-in route's own authentication.
    if (row.codename === "signin") {
      const fields = Object.keys(input.subcards ?? {}).map((k) => k.split("+").map((p) => p.trim().toLowerCase()).pop());
      if (!fields.includes("*email")) {
        throw new CardActionError("user-error", "email can't be blank", undefined, { abort: "email can't be blank" });
      }
      if (!fields.includes("*password")) {
        throw new CardActionError("user-error", "password can't be blank", undefined, { abort: "password can't be blank" });
      }
    }
    // The two-step upload's replace arm (00_upload_cache.rb:36-42
    // assign_attachment_on_update, after :assign_action, when
    // save_preliminary_upload?): the cached DRAFT action's file — stored
    // under THIS card's own files dir at the preliminary step — is read
    // back with the draft action selected and becomes the save's
    // attachment (its comment, the original filename, rides the action
    // comment). The integrate phase (below) deletes the draft's stored
    // file + action row; the draft's ACT survives. An unresolvable id
    // leaves the save without an attachment — Ruby's arm returns early
    // (Card::Action.fetch nil) and the update saves whatever else it
    // carried.
    let cachedUpload: { attachment: AttachmentInput; release: () => Promise<void> } | undefined;
    if (input.actionIdOfCachedUpload !== undefined) {
      const typeRow = await this.fetchRowById(row.type_id);
      const mount =
        typeRow?.codename != null && typeRow.codename !== ""
          ? ATTACHMENT_MOUNTS[typeRow.codename]
          : undefined;
      if (mount !== undefined) {
        cachedUpload = await this.cachedUploadAttachment(input.actionIdOfCachedUpload, {
          cardId: row.id,
          mount,
        });
        if (cachedUpload !== undefined) input = { ...input, attachment: cachedUpload.attachment };
      }
    }
    this.setActiveSaveAttributes(input);
    // Renaming a card that carries an account needs an account manager —
    // the account itself, or a Help Desk member.
    if (input.name !== undefined) {
      const current = (await this.fetch.fetchById(row.id))?.name?.key;
      if (DeckoName.parse(input.name).key !== current) await this.assertMayRenameAccountHolder(row.id);
    }
    // A +*password card's content is validated and stored encrypted.
    if (input.content !== undefined && input.content !== null && input.passwordEncrypted !== true) {
      const pw = await this.passwordFieldContent(row.right_id ?? undefined, row.left_id, input.content, "update");
      if (pw !== undefined && "skip" in pw) return null;
      if (pw !== undefined) input = { ...input, content: pw.content, passwordEncrypted: true };
    }
    if (input.trash === true && input.withinRollback !== true) {
      throw new CardActionError(
        "revert-unsupported",
        "an update cannot trash a card; trashing is deleteCard",
      );
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
    await this.assertLayoutHasMainNest(row, input.content, resolvedTypeId);
    if (typeChanged) input = await this.applySkinTypeChange(row, input, resolvedTypeId);
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
    await assertStyleCompilerFor(
      this.styleAssetContext(actingId),
      (input.name !== undefined ? DeckoName.parse(input.name) : await this.composedNameOf(row)) ?? DeckoName.parse(""),
      resolvedTypeId ?? row.type_id,
    );
    const writer = this.newWriter(actingId);
    // The act card's finalize defers past the subcard saves (Ruby's finalize
    // phase runs after the whole act's store — see the create path).
    const finalizeQueue: (() => Promise<void>)[] = [];
    let result = await this.updateInWriter(writer, row, input, resolvedTypeId, { finalizeQueue });
    // subcards.rb:1-16: the subcards ride this save's act — the multiedit
    // shape (the plusses in the main card's form submission). Ruby saves
    // them within the supercard's Director run (director/store.rb:37-58);
    // a no-change subcard produces no action (events.rb:34-37).
    const deferredSubFinalizes: DeferredReferenceFinalize[] = [];
    const subResults = await this.saveSubcardsInWriter(
      writer,
      await this.composedNameOf(row),
      input.subcards,
      result?.actionId ?? null,
      finalizeQueue,
      deferredSubFinalizes,
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
    if (
      result === null &&
      subResults.length === 0 &&
      input.subcards !== undefined &&
      writer.currentActId() === null
    ) {
      // The save RAN (the director instantiated the posted subcards) but no
      // card changed: Ruby's update! still records the ACT on the mark —
      // one card_acts row, zero actions (the oracle probe's "one act"; the
      // graded account-change-password delta is card_acts +1 {card_id 618,
      // actor 617, acted_at, ip} with cards ~3 updater touches only — the
      // posted +*password re-encrypts to the stored digest, the no-change
      // +*email subcard and the mark itself carry only the director touch).
      // The writer's act INSERT is lazy (first persisted action), so the
      // all-no-op save inserts it here, verbatim columns. The result stays
      // null: no action exists for the integrate phase to see.
      //
      // currentActId() guards the one-act-per-request shape (act.rb:64-68):
      // the mark's own no-op save is the act card, and the writer's
      // `finalize_act` arm already left its act row (write-path.ts:400-405,
      // `Director.act.update! card_id: id`). Ruby stores ONE act per request,
      // so inserting here too would double the row.
      await this.fetch.driver.query(
        "INSERT INTO card_acts (card_id, actor_id, acted_at, ip_address) VALUES (?, ?, ?, ?)",
        [
          row.id,
          (await this.actingIdForWrite()) ?? this.actor?.id ?? null,
          sqlDateTime(this.clock()),
          this.ipAddress,
        ],
      );
    }
    // II (director.rb:26): the integrate seam before the notify hooks (see
    // the create path's note). A no-op save commits nothing, so ActiveRecord
    // runs no after_commit integration phase for it (phases.rb:3) and its
    // nesters are not touched.
    if (input.withinRollback === true) {
      // :rollback_actions ends with `abort :success`: the director is
      // aborted, so the integration phase never runs for the request
      // (phases.rb:13-15, :48-50) — no ancestor timestamps, no integrate
      // events, no follower notifications. The cache expiry already ran.
      return result;
    }
    // The integration phase, after the transaction commits (phases.rb:4).
    const committed = result;
    await this.afterCommit(async () => {
      // FINALIZE: the style asset events (asset inputs, the site stylesheet).
      const savedCards = this.savedCardsOf(committed, row);
      await runStyleAssetEvents(this.styleAssetContext(actingId), savedCards);
      await this.bumpAncestorTimestamps(
        CardActionEngine.savedCardIds(committed).filter(
          (id) => !(committed?.actCardActionOmitted === true && id === row.id),
        ),
      );
      await this.dispatchEventStage(
        "integrate",
        this.eventCard({
          name: committed?.name,
          id: committed?.cardId ?? row.id,
          action: "update",
          actId: committed?.actId,
          trash: false,
          typeId: row.type_id,
        }),
      );
      await this.saveRecentlyEditedSettings(committed);
      // delete_cached_upload_file_on_update (:integrate, 00_upload_cache.rb
      // :66-72): the draft's stored file (under this card's files dir) +
      // the draft action row go; the draft's ACT survives (the oracle
      // update-arm rows pin the surviving orphan act beside the update's
      // own stamped act).
      if (cachedUpload !== undefined) await cachedUpload.release();
      // Events the request triggered for the :integrate stage (trigger:
      // :required, e.g. send_verification_email / send_welcome_email) run
      // with that stage, before the delayed follower notice.
      if (input.triggeredIntegrate !== undefined) await input.triggeredIntegrate();
      await this.dispatchSavePathIntegrations(committed, {
        actCardActionOmitted: committed?.actCardActionOmitted === true,
        delayedStageDropped: input.attachment !== undefined && input.attachment.fromCachedUpload !== true,
        withinOtherAct: input.withinOtherAct === true,
      });
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
        dbContentBeforeAct: row.db_content ?? null,
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
    // validate_coded_storage_type (coded.rb:7-10) is on: :save — the update
    // path runs it under the card's assigned name, like the create path.
    await this.validateCodedStorageType(input.attachment, newName ?? currentName ?? DeckoName.parse(""));
    return { currentName, currentKey, newName, nameChanged };
  }

  private async updateInWriter(
    writer: ActWriter,
    row: CardsRow,
    input: UpdateCardInput,
    preResolvedTypeId?: number,
    opts: { isActCard?: boolean; finalizeQueue?: (() => Promise<void>)[] } = {},
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
      // is key equality, cardname.rb#==), and when the request carries
      // card[skip]=validate_renaming (the history revert links do).
      if (newName.key !== currentKey && input.skipValidateRenaming !== true) {
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

    // Attribute merges. Assigned content is standardized under the card's
    // new type (prepare_assignment_params, assign_attributes.rb:35-39).
    if (input.content !== undefined && input.attachment === undefined) {
      input.content = await this.standardizeAssignedContent(
        input.content,
        resolvedTypeId ?? before.type_id,
        before.left_id,
        before.right_id,
        row.codename ?? undefined,
      );
    }
    // Account fields (account-fields.ts): encrypt_password runs when the
    // content changes; +*password and +*salt saves keep no history.
    const updateRightCode =
      before.right_id === null ? undefined : await this.fetch.codenames.nameForId(before.right_id);
    // validate_password_present (:prepare_to_validate, on: :update): a blank
    // password aborts the save as a success, storing nothing.
    if (updateRightCode === "password" && input.content !== undefined && input.content.trim() === "") {
      return null;
    }
    if (
      updateRightCode === "password" &&
      input.content !== undefined &&
      input.attachment === undefined &&
      input.passwordEncrypted !== true &&
      input.content !== (before.db_content ?? undefined)
    ) {
      const problems = passwordErrors(input.content);
      if (problems.length > 0) {
        throw new CardActionError("validation-failed", `Validation failed: ${problems.join(", ")}`);
      }
      input.content = await storedPasswordValue(input.content, await this.accountSalt(before.left_id), this.passwordHashing);
    }
    if (updateRightCode === "email" && input.content !== undefined && input.attachment === undefined && before.right_id !== null) {
      input.content = await this.validatedEmailContent(input.content, before.right_id, row.id);
    }
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
    // Card#update!(trash: false) on a trashed row: an ordinary :update save
    // whose only difference may be the trash flag (identify_action gives
    // :update — the trash change is not to true). Trashing is deleteCard.
    if (input.trash === false) after.trash = 0;
    // withinRollback: the rollback's nested update! may trash the card and
    // still records an :update action (corrected after the write below).
    if (input.trash === true && input.withinRollback === true) after.trash = 1;
    const lexBefore = this.lexOfRow(before);
    let lexAfter = lexBefore;
    let renameSides: ResolvedSides["created"] | undefined;
    let reservedActionId: number | undefined;

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
        // The renamed card's own action row precedes the actions of the side
        // cards the rename creates, as on a compound create (Ruby saves the
        // supercard's action before the subcards it stores).
        reservedActionId = await writer.reserveAction({
          actionType: "update",
          superActionId: input.superActionId ?? null,
        });
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

    // set_content (:store, content.rb:1-5) runs on every save:
    // prepare_db_content re-cleans the stored HTML even when the content
    // itself was not assigned (a rename or type change of a card whose
    // stored content predates cleaning stores the cleaned form).
    if (input.attachment === undefined && after.db_content !== null) {
      after.db_content = await this.cleanForStore(after.db_content, after.type_id, after.right_id);
      if (input.content !== undefined) input.content = after.db_content;
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
      ...(after.trash !== before.trash ? ["trash"] : []),
    ];
    // history? false: +*password, +*salt (account-fields.ts) and
    // *recent settings (card-mod-rules set/self/recent_settings.rb). Their
    // saves keep no action and no change rows, including the change rows a
    // first update would backfill for the create action.
    const noHistory =
      (updateRightCode !== undefined && NO_HISTORY_RIGHT_CODENAMES.has(updateRightCode)) ||
      row.codename === "recent_settings";
    const changesBefore = noHistory
      ? Number(
          (await this.fetch.driver.query<{ m: number | null }>("SELECT MAX(id) AS m FROM card_changes", [])).rows[0]
            ?.m ?? 0,
        )
      : 0;
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
      reservedActionId,
    });
    if (saved === null) {
      // The mark itself was POSTED (it is the update target): the director's
      // set_stamper assigned its updater_id/updated_at at instantiation, so
      // a no-op mark save still stamps its row (no action, no change rows) —
      // the same director-layer touch the subcard path below applies. The
      // stamp rides only saves that POSTED subcards (the director
      // instantiated them): a plain no-op content save instantiates nothing
      // and writes nothing (the writer-layer pins hold).
      if (input.subcards !== undefined) {
        await this.fetch.driver.query(
          "UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?",
          [sqlDateTime(this.clock()), (await this.actingIdForWrite()) ?? this.actor?.id ?? null, row.id],
        );
      }
      return null; // no-op save: no action rows persisted
    }
    if (noHistory) {
      await this.fetch.driver.query("DELETE FROM card_changes WHERE id > ?", [changesBefore]);
      await this.dropHistory(saved.actionId, saved.actId, saved.actPreexisted === true);
    }
    if (after.trash === 1 && before.trash === 0) {
      // Only the rollback's nested update! reaches here (guarded above): the
      // ActWriter identifies a trash flip as :delete, but the outer
      // director's action is :update (lib/card/director/all.rb:19-28).
      await this.fetch.driver.query("UPDATE card_actions SET action_type = ? WHERE id = ?", [
        actionTypeCode("update"),
        saved.actionId,
      ]);
    }
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
        dbContentBeforeAct: before.db_content ?? null,
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
    // skip_update_referers? (:34-36) = this act skips update_referer_content
    // (the rename form's "do not update references" box, card[skip]).
    // Registered REAL bodies replace these built-ins; the rename thunks
    // keep their own nameChanged gate so the unregistered path is exactly
    // the pre-seam behavior (update-referer-content.ts, refresh-references-
    // in.ts).
    const skipReferers = this.skipsEvent("update_referer_content");
    // Ruby's refresh_references_out body parses `card.content`
    // (structured_content || standard_content) — a structured card's rows
    // rebuild from the RULE's template, never from the just-saved column
    // value (structureReferencesContent's note; the harness's
    // update-topic-as-member step records exactly that: db_content becomes
    // the submitted text while the rows come back as the template's three
    // inclusions). The registered core-mod body reads THIS record's
    // dbContent, so it carries the structure-resolved value too.
    const refsContentAfter = attachmentIdentifier ??
      (await this.structureReferencesContent(row, after.db_content));
    await this.runFinalizeEvents(
      this.eventCard({
        name: nameAfter,
        id: row.id,
        key: nameChanged && newName !== undefined ? newName.key : currentKey,
        dbContent: attachmentIdentifier ?? refsContentAfter,
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
              contentAfter: refsContentAfter,
            }),
        ],
        [
          "update_referer_content",
          async () => {
            if (
              nameChanged &&
              nameAfter !== undefined &&
              currentName !== undefined &&
              !skipReferers
            ) {
              await updateRefererContent(
                {
                  driver: this.fetch.driver,
                  lexicon: this.fetch.lexicon,
                  // all.rb:15's Card[card_id]: the referers mapping fetches
                  // each referer through the SHARED cache — on a miss it
                  // warms the pre-rewrite card into the cache the render
                  // path reads, and the update_column below rewrites the
                  // row behind it with no expire (reference_events.rb:52-
                  // 58). That stale entry is what serves the pre-rename
                  // bytes on the referer's next render — the
                  // rename-referers oracle's pinned staleness — and the
                  // pin keeps it alive across the freshness gate's resets
                  // (FetchEngine#pinStaleCard; the referer's own expire
                  // drops it, so the staleness never accumulates).
                  fetchRefererCard: (id) => this.fetch.bracket(id),
                  pinStaleReferer: (card) => this.fetch.pinStaleCard(card),
                },
                row.id,
                currentName,
                nameAfter,
              );
            }
          },
        ],
        [
          // reference_events.rb:16-19, `when: :skip_update_referers?`: the
          // referers keep their content and rebuild their rows from it.
          "update_referer_references_out",
          async () => {
            if (nameChanged && skipReferers) {
              await updateRefererReferencesOut(
                { driver: this.fetch.driver, lexicon: this.fetch.lexicon },
                row.id,
              );
            }
          },
        ],
        [
          "refresh_references_in",
          async () => {
            if (nameChanged && nameAfter !== undefined) {
              await refreshReferencesIn(this.fetch.driver, row.id, nameAfter.key, {
                unmapExisting: skipReferers,
              });
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
    //
    // A RENAME carries the pre-write binding as a lookup overlay (see
    // RuleLookupOverlay in set-read-rule.ts): Ruby's row write lands after
    // the finalize cascade, so its re-derivation still resolves the rule
    // under the OLD tag — the stored read_rule columns keep naming the
    // renamed card (oracle: leftover probe step 3, tools/persistence/
    // rule-rename-lookup-trace.rb).
    if (nameChanged) {
      const savedRow = await this.fetchRowById(row.id);
      if (savedRow !== undefined) {
        const overlay =
          currentName !== undefined && currentName.key !== nameAfter?.key
            ? new Map([[currentName.key, savedRow.id]])
            : undefined;
        await cascadeReadRuleAfterRuleSave(this.readRuleDeps(), savedRow, true, overlay);
      }
    }
    if (nameChanged) await this.refreshDescendantCaches(row.id);
    return {
      cardId: row.id,
      actionId: saved.actionId,
      actId: saved.actId,
      verb: "update",
      name: nameAfter,
      // name_before_act (dirty.rb) — the response's expiry fan-out expires
      // the renamed card's BEFORE-name render-map entries with it (Ruby's
      // expire_names covers both key versions, cache/all.rb:104-108).
      nameBeforeAct: nameChanged ? currentName : undefined,
      subactions,
    };
  }

  /** detect_conflict + edit_conflict? (card-mod-history-0.20.0
   *  set/all/history/events.rb:19-22, 65-72) - the stale-revision guard:
   *  the save began at a revision that is no longer current AND the card's
   *  last action belongs to somebody else. Ruby raises it as a VALIDATION
   *  error (`errors.add :conflict, I18n.t(:history_error_not_latest_revision)`)
   *  on the :validate stage, so nothing persists - the reference records the
   *  message "changes not based on latest revision" with the action's
   *  revision unchanged.
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

  /** event :update_ancestor_timestamps (card-mod-history-0.20.0
   *  set/all/history/events.rb:1-7, :integrate stage, every committed save):
   *  every card that nests a saved card — directly, or through nesters of
   *  nesters (history_ancestor_ids, set/all/history.rb:20-26, at most five
   *  levels below the saved card) — gets updater_id = the acting account and
   *  updated_at = now, then its cache entry expires. Nesters come from
   *  card_references rows with ref_type "I" (nesting_ids, history.rb:98-102);
   *  a nester's own nesters are followed only while it is live (`id.card&.`,
   *  a trash-filtering fetch). Runs after the finalize stage, so it sees the
   *  references the save itself just wrote or cleared. */
  private async bumpAncestorTimestamps(cardIds: readonly number[]): Promise<void> {
    const driver = this.fetch.driver;
    const nestersOf = async (id: number): Promise<number[]> =>
      (
        await driver.query<{ referer_id: number }>(
          `SELECT DISTINCT referer_id FROM card_references
           WHERE ref_type = 'I' AND referee_id = ? AND referer_id IS NOT NULL`,
          [id],
        )
      ).rows.map((r) => Number(r.referer_id));
    const isLive = async (id: number): Promise<boolean> => {
      const row = await this.fetchRowById(id);
      return row !== undefined && row.trash === 0;
    };
    const ancestors = async (id: number, level: number): Promise<number[]> => {
      if (level > 5) return [];
      const direct = await nestersOf(id);
      const out = [...direct];
      for (const parent of direct) {
        if (await isLive(parent)) out.push(...(await ancestors(parent, level + 1)));
      }
      return out;
    };
    const ids = new Set<number>();
    for (const cardId of cardIds) for (const a of await ancestors(cardId, 0)) ids.add(a);
    if (ids.size === 0) return;
    const list = [...ids];
    const actingId = (await this.actingIdForWrite()) ?? this.actor?.id ?? null;
    await driver.query(
      `UPDATE cards SET updater_id = ?, updated_at = ? WHERE id IN (${list.map(() => "?").join(", ")})`,
      [actingId, sqlDateTime(this.clock()), ...list],
    );
    for (const id of list) {
      const row = await this.fetchRowById(id);
      const name = row !== undefined ? await this.composedNameOf(row) : undefined;
      if (name !== undefined) {
        const record = newCardRecord(name);
        record.id = id;
        this.fetch.expireCard(record);
      }
    }
    expireRuleResolutionCache(driver);
  }

  /** close_account (card-mod-account set/abstract/account_holder.rb:75-79,
   *  :83-89) inside the account's delete: the holder is renamed (anonymize!)
   *  and its fields other than +*account are deleted (closure_deletions),
   *  each as part of the same act. */
  private async closeAccount(
    writer: ActWriter,
    holderId: number,
    accountCardId: number,
    anonName: string,
    accountActionId: number,
  ): Promise<CardActionSummary[]> {
    const holder = await this.fetchRowById(holderId);
    if (holder === undefined || holder.trash === 1) return [];
    const summaries: CardActionSummary[] = [];
    const nameBefore = await this.composedNameOf(holder);
    const renamed = await writer.updateCard({
      cardId: holder.id,
      before: cardFieldStateFromRow(holder),
      after: { ...cardFieldStateFromRow(holder), name: anonName },
      key: DeckoName.parse(anonName).key,
      superActionId: accountActionId,
    });
    await this.expireAfterWrite({
      cardId: holder.id,
      nameBefore,
      nameAfter: DeckoName.parse(anonName),
      verb: "update",
    });
    if (renamed !== null) {
      summaries.push({ cardId: holder.id, actionId: renamed.actionId, verb: "update", name: DeckoName.parse(anonName) });
    }
    const accountId = await this.fetch.codenames.id("account");
    for (const field of await this.childRows(holder.id)) {
      if (field.left_id !== holder.id || field.right_id === accountId || field.id === accountCardId) continue;
      const saved = await writer.trashCard({
        cardId: field.id,
        before: cardFieldStateFromRow(field),
        superActionId: accountActionId,
        history: await this.fieldHasHistory(field),
      });
      if (saved === null) continue;
      if (saved.actionId !== 0) {
        summaries.push({ cardId: field.id, actionId: saved.actionId, verb: "delete", name: await this.composedNameOf(field) });
      }
      summaries.push(...(await this.deleteChildren(writer, field.id, saved.actionId)));
    }
    return summaries;
  }

  /** history? (card-mod-history set/all/history.rb): false for the account
   *  mod's password and salt fields, which record no actions. */
  private async fieldHasHistory(row: CardsRow): Promise<boolean> {
    if (row.right_id === null) return true;
    const passwordId = await this.fetch.codenames.id("password");
    const saltId = await this.fetch.codenames.id("salt");
    return row.right_id !== passwordId && row.right_id !== saltId;
  }

  /** The cards an act saved, for the style asset events: the act card's own
   *  action (unless its save was a no-op) and the subcard actions, in order.
   *  `before` is the act card's row as it stood before the save. */
  private savedCardsOf(result: ActionResult | null, before?: CardsRow): SavedCard[] {
    if (result === null) return [];
    const out: SavedCard[] = [];
    if (result.actCardActionOmitted !== true) {
      out.push({
        cardId: result.cardId,
        actionId: result.actionId,
        verb: result.verb,
        ...(before !== undefined && before.id === result.cardId ? { contentBefore: before.db_content } : {}),
      });
    }
    for (const sub of result.subactions) out.push({ cardId: sub.cardId, actionId: sub.actionId, verb: sub.verb });
    return out;
  }

  /** The read path's asset-input refresh (Card::Assets.refresh, card-mod-assets
   *  lib/card/assets.rb:13-28, run on every request by CardController::Rest#setup,
   *  decko lib/card_controller/rest.rb:32). The writes it makes are the decko
   *  bot's: update_asset_input runs `Card::Auth.as_bot` (asset_inputter.rb:37-39),
   *  so the acting id is the bot's, whatever the request's session. A deck whose
   *  inputs are present pays the reads and nothing else. */
  async refreshReadAssetInputs(): Promise<void> {
    const bot = await actorBot(this.fetch.driver);
    await refreshReadAssetInputs(this.styleAssetContext(bot.id));
  }

  /** What the style asset events borrow from this engine. */
  private styleAssetContext(actingId: number | undefined): StyleAssetEventContext {
    return {
      fetch: this.fetch,
      clock: this.clock,
      newWriter: () => this.newWriter(actingId),
      expire: (cardId, name) => this.expireAfterWrite({ cardId, nameAfter: name, verb: "update" }),
      attachmentStore: this.attachmentStore,
      compile: this.scssCompiler,
      compileCoffee: this.coffeeCompiler,
      compressAssets: this.compressAssets,
      compressScript: this.scriptCompressor,
      virtuals: this.virtualCache,
    };
  }

  /** The cards a result saved: the act card and every subcard action. */
  private static savedCardIds(result: ActionResult | null): number[] {
    if (result === null) return [];
    return [...new Set([result.cardId, ...result.subactions.map((s) => s.cardId)])];
  }

  // -----------------------------------------------------------------------
  // Revert — the history pane's "revert to this" / "revert to previous" /
  // restore requests (card-mod-history set/all/history/events.rb:40-46
  // :rollback_actions, revision.rb process_revert_actions). The request is an
  // update of the card fetched look_in_trash with card[skip]=
  // validate_renaming; when it names actions, :rollback_actions replaces it
  // with `update! update_args` (the revisions) and aborts the outer save with
  // :success, so the stored result is ONE ordinary save of the reverted
  // attributes. Other cards' actions in the request become subcards of that
  // save (update_args[:subcards][action.card.name]).
  // -----------------------------------------------------------------------

  async revertActions(input: RevertActionsInput): Promise<ActionResult | null> {
    return this.atomicSave(() => this.revertActionsInner(input));
  }

  private async revertActionsInner(input: RevertActionsInput): Promise<ActionResult | null> {
    const driver = this.fetch.driver;
    const row = await this.fetchRowById(input.cardId);
    if (row === undefined) {
      throw new CardActionError("not-found", `no such card: ${input.cardId}`);
    }
    const actions = await actionsToRevert(driver, {
      actId: input.actId,
      actionIds: input.actionIds,
    });
    if (actions.length === 0) {
      // rollback_request? is false: the outer update runs as sent (only the
      // skip flag assigned), a no-op save.
      return this.updateCard({ cardId: row.id, lookInTrash: true, skipValidateRenaming: true });
    }
    let own: Revision = {};
    const others = new Map<number, { row: CardsRow; rev: Revision }>();
    for (const action of actions) {
      const actionCard = action.card_id === row.id ? row : await this.fetchRowById(action.card_id);
      if (actionCard === undefined) continue;
      const rev = await revisionOf(driver, actionCard, action, input.revertToPrevious === true);
      if (action.card_id === row.id) own = { ...own, ...rev };
      else others.set(action.card_id, { row: actionCard, rev: { ...(others.get(action.card_id)?.rev ?? {}), ...rev } });
    }
    const subcards: Record<string, SubcardInput> = {};
    // The REVIVAL arm (the oracle's step 9): a revision whose trash comes
    // back false on an already trashed card — reverting an act that cascade-
    // deleted it. Ruby's nested save applies the revision as a subcard: the
    // save adopts the trashed row (pull_from_trash!, trash.rb:57-68), writes
    // trash back, and its reserved subaction is REMOVED at finalize as a
    // no-change save (finalize_action's empty arm, history events.rb:34-37 —
    // traced live: INSERT card_actions + DELETE of that row, UPDATE cards
    // SET trash; tools/persistence/revert-trace.rb) — the row flips with NO
    // action and NO change rows. The port writes the row directly.
    const revivals: { row: CardsRow; rev: Revision }[] = [];
    // Another card this revert RENAMES back. Ruby's rollback_actions builds
    // one subcard hash carrying both `name` and `trash`, so one nested save
    // assigns both (process_subcards -> subcard(name).name= / .trash=,
    // subcards.rb); the port writes the revival row first and then renames
    // it as a subcard, which lands the same row values (updated_at is the
    // same stamp either way).
    const renames: number[] = [];
    for (const { row: other, rev } of others.values()) {
      const otherName = await this.composedNameOf(other);
      // A revision that renames the other card back. Ruby assigns the whole
      // revision in ONE nested save (process_subcards -> subcard(name).name=,
      // subcards.rb), so `name` and `trash` land together; the revival arm
      // below only sees the trash half and the rename rides the subcard
      // hash. Reading this revision as a plain revival would leave the card
      // under its post-rename name — the shape the persistence probe's step
      // 67 caught.
      const renamesCard =
        otherName !== undefined &&
        ((rev.name !== undefined && rev.name !== otherName.s) ||
          (rev.left_id !== undefined && rev.left_id !== other.left_id) ||
          (rev.right_id !== undefined && rev.right_id !== other.right_id));
      if (renamesCard) {
        if (other.trash === 1) {
          // The trash half of the revision. Ruby applies it in the same save
          // as the rename (one subcard hash, both keys); the port writes the
          // row here and lets the subcard save carry the name.
          await driver.query("UPDATE cards SET trash = 0, updated_at = ? WHERE id = ?", [
            sqlDateTime(this.clock()),
            other.id,
          ]);
        }
        subcards[otherName.s] = { name: rev.name ?? otherName.s };
        renames.push(other.id);
        continue;
      }
      if (rev.trash === false && other.trash === 1) {
        revivals.push({ row: other, rev });
        continue;
      }
      // A revision that trashes the other card (revision_before_action of
      // its create: { trash: true }) becomes a trashing subcard, a :delete
      // action under this card's action, as in Ruby. An already trashed
      // card stays as it is.
      if (rev.trash === true && otherName !== undefined) {
        if (other.trash === 0) subcards[otherName.s] = { trash: true };
        continue;
      }
      if (otherName === undefined || other.trash === 1) {
        throw new CardActionError(
          "revert-unsupported",
          `reverting another card's trash state with further changes is not supported (card ${other.id})`,
        );
      }
      subcards[otherName.s] = {
        content: rev.db_content ?? "",
        ...(typeof rev.type_id === "number" ? { typeId: rev.type_id } : {}),
      };
    }
    for (const { row: other, rev } of revivals) {
      // The revival is exact only when the revision restores the row's own
      // values (a delete action ever only changed trash, so the revision
      // before it repeats the pre-delete row). A differing field would make
      // Ruby's save store an action; that shape has no oracle evidence and
      // stays refused.
      const exact =
        (rev.db_content ?? null) === (other.db_content ?? null) &&
        (rev.type_id ?? null) === other.type_id &&
        (rev.left_id ?? null) === other.left_id &&
        (rev.right_id ?? null) === other.right_id;
      if (!exact) {
        throw new CardActionError(
          "revert-unsupported",
          `reverting another card's trash state with further changes is not supported (card ${other.id})`,
        );
      }
      await driver.query(
        "UPDATE cards SET trash = 0, updated_at = ? WHERE id = ?",
        [sqlDateTime(this.clock()), other.id],
      );
    }
    const hasSubcards = Object.keys(subcards).length > 0;
    // The card's own revision. A revision with trash: true (reverting a
    // create "to previous") trashes the card through the same nested
    // update!: an :update action, no delete events (withinRollback).
    const isCompound = row.left_id !== null;
    if (isCompound && (own.left_id !== undefined && own.left_id !== row.left_id ||
      own.right_id !== undefined && own.right_id !== row.right_id)) {
      throw new CardActionError(
        "revert-unsupported",
        `reverting a compound card's parts is not supported (card ${row.id})`,
      );
    }
    const result = await this.updateCard({
      cardId: row.id,
      lookInTrash: true,
      skipValidateRenaming: true,
      withinRollback: true,
      ...(!isCompound && own.name !== undefined && own.name !== row.name ? { name: own.name } : {}),
      ...(own.db_content !== undefined && own.db_content !== null ? { content: own.db_content } : {}),
      ...(typeof own.type_id === "number" && own.type_id !== row.type_id ? { typeId: own.type_id } : {}),
      ...(own.trash === false && row.trash === 1 ? { trash: false } : {}),
      ...(own.trash === true && row.trash === 0 ? { trash: true } : {}),
      ...(hasSubcards ? { subcards } : {}),
    });
    // :rollback_actions then runs clear_drafts (this actor's drafts of the
    // card); a save that changed something already cleared them.
    if (result === null) {
      await this.newWriter(await this.actingIdForWrite()).clearOwnDrafts(row.id);
    }
    return result;
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
      return await this.atomicSave(() => this.deleteCardInner(input));
    } finally {
      this.pendingSaveInput = undefined;
    }
  }

  private async deleteCardInner(input: DeleteCardInput): Promise<ActionResult | null> {
    // The anonymous-delete arm: ok_to_delete? (permissions.rb:155-157
    // `permit :delete`) has NO signed-in clause — the chain rules it
    // identically to create/update. A trash save re-stamps updater_id
    // (set_stamper, account.rb:20-23), so an end-trashed card carries the
    // anonymous codename card as its updater. Fragment seed keeps the legacy
    // rejection.
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
      // validate_delete (trash.rb:31-34): errors.add :delete,
      // t(:core_error_system_card, name: name, codename: codename) —
      // card/mod/core/config/locales/en.yml:18 "%{name} is is a system
      // card. (%{codename})" (the doubled "is" is the shipped template's).
      // The errors view shows the attribute upcased before the message
      // (standard_errors "<KEY>: <message>") and titles the alert
      // "Problems with <name>".
      const message = `${card.name?.s ?? `~${row.id}`} is is a system card. (${row.codename})`;
      throw new CardActionError(
        "protected-card",
        message,
        `DELETE: ${message}`,
        { delete: message },
        card.name?.s,
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
        dbContentBeforeAct: row.db_content ?? null,
        action: "delete",
        trash: true,
        typeId: row.type_id,
        changedFields: ["trash"],
      }),
    );
    const writer = this.newWriter(actingId);
    // delete_account (card-mod-account set/right/account/events.rb:45-47):
    // deleting an account closes it — close_account (account_holder.rb:75-79)
    // renames the holder "ANON-<12 hex digits>" and deletes the holder's
    // other fields. Deleting the holder itself deletes its +*account, so the
    // holder's own delete action carries the rename too.
    const accountId = await this.fetch.codenames.id("account");
    const deletesAccount = accountId !== undefined && row.right_id === accountId && row.left_id !== null;
    const holderAccount = accountId === undefined || row.left_id !== null
      ? undefined
      : (await this.childRows(row.id)).find((c) => c.right_id === accountId && c.left_id === row.id);
    const anonName = deletesAccount || holderAccount !== undefined ? anonymousAccountName() : undefined;
    const saved = await writer.trashCard({
      cardId: row.id,
      before: cardFieldStateFromRow(row),
      ...(holderAccount !== undefined && anonName !== undefined
        ? { after: { ...cardFieldStateFromRow(row), name: anonName, trash: 1 }, key: DeckoName.parse(anonName).key }
        : {}),
      superActionId: input.superActionId ?? null,
    });
    if (saved === null) return null;
    let closure: CardActionSummary[] = [];
    if (deletesAccount && anonName !== undefined && row.left_id !== null) {
      closure = await this.closeAccount(writer, row.left_id, row.id, anonName, saved.actionId);
    }
    // SP + SS (director.rb:20-21): persisted deletes only (see the update
    // path's disclosure — events pin to persisted saves).
    const deletedCard = (): ModEventCard =>
      this.eventCard({
        name: currentName,
        id: row.id,
        key: currentName?.key ?? row.key ?? undefined,
        dbContent: row.db_content,
        dbContentBeforeAct: row.db_content ?? null,
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
    const subactions = [...closure, ...(await this.deleteChildren(writer, row.id, saved.actionId))];
    await this.expireAfterWrite({
      cardId: row.id,
      nameAfter: currentName,
      verb: "delete",
    });
    if (holderAccount !== undefined && anonName !== undefined) {
      await this.expireAfterWrite({ cardId: row.id, nameAfter: DeckoName.parse(anonName), verb: "update" });
    }
    // FINALIZE (card_references write path) — the SEAM with takeover:
    // clear_references (reference_events.rb:27-31) through the registered
    // body when the name is registered; the built-in otherwise.
    // FINALIZE (event :asset_input_changed_on_delete, card-mod-assets
    // asset_inputter.rb:20-23, before: :clear_references): a deleted
    // inputter's referers re-derive — dependent inputters re-store their
    // asset inputs, outputters rebuild their files, now without the trashed
    // card. Runs for every card this act deleted, before the references are
    // cleared (the referers still point here).
    const deletedCards: SavedCard[] = [
      { cardId: row.id, actionId: saved.actionId, verb: "delete" as const },
      ...subactions.map((s) => ({
        cardId: s.cardId,
        actionId: s.actionId,
        verb: "delete" as const,
      })),
    ];
    await runStyleAssetEvents(this.styleAssetContext(actingId), deletedCards);
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
      // A closed account's +*account card is named after its renamed
      // holder by the time the act's notices go out.
      name: deletesAccount && anonName !== undefined && currentName?.rightName !== undefined
        ? DeckoName.parse(`${anonName}+${currentName.rightName.s}`)
        : currentName,
      subactions,
    };
    // II (director.rb:26): the integrate seam before the notify hooks (see
    // the create path's note), after the transaction commits.
    await this.afterCommit(async () => {
      await this.bumpAncestorTimestamps(CardActionEngine.savedCardIds(result));
      await this.dispatchEventStage("integrate", deletedCard());
      await this.dispatchSavePathIntegrations(result);
    });
    return result;
  }

  /** The order an act stores its subcards in: as given, except that a
   *  trashing subcard whose left or right part is itself trashed by the act
   *  is stored right after that part. Ruby's delete_children (on the part's
   *  delete) takes the child into the part's own subcards, so it is stored
   *  in the part's store stage, after the part. */
  private async subcardStoreOrder(
    mainName: DeckoName | undefined,
    subcards: Record<string, SubcardInput>,
  ): Promise<[string, SubcardInput][]> {
    const entries = Object.entries(subcards);
    if (!entries.some(([, sub]) => sub.trash === true)) return entries;
    const rows = new Map<string, CardsRow | undefined>();
    for (const [key] of entries) {
      const fullName = key.startsWith("+") ? `${mainName?.s ?? ""}${key}` : key;
      const id = await this.fetch.lexicon.id(DeckoName.parse(fullName));
      rows.set(key, id === undefined ? undefined : await this.fetchRowById(id));
    }
    const trashIds = new Map<number, string>();
    for (const [key, sub] of entries) {
      const row = rows.get(key);
      if (sub.trash === true && row !== undefined) trashIds.set(row.id, key);
    }
    const parentKey = (key: string): string | undefined => {
      const row = rows.get(key);
      if (row === undefined || subcards[key]?.trash !== true) return undefined;
      for (const side of [row.left_id, row.right_id]) {
        const owner = side === null ? undefined : trashIds.get(side);
        if (owner !== undefined && owner !== key) return owner;
      }
      return undefined;
    };
    const out: [string, SubcardInput][] = [];
    const placed = new Set<string>();
    const place = (key: string): void => {
      if (placed.has(key)) return;
      placed.add(key);
      out.push([key, subcards[key]]);
      for (const [child] of entries) if (parentKey(child) === key) place(child);
    };
    for (const [key] of entries) if (parentKey(key) === undefined) place(key);
    for (const [key] of entries) place(key);
    return out;
  }

  /** A subcard trashed within the caller's act (SubcardInput.trash): a
   *  delete action chained to the supercard's action, its references
   *  cleared, and its set's read rules re-derived when it is a rule. Its
   *  live children are trashed by saveSubcardsInWriter once the act's own
   *  subcards are saved, so a child that is itself a subcard of the act
   *  keeps the supercard's action as its super action, as Ruby's director
   *  reuses a subcard already in the act. */
  private async trashInWriter(
    writer: ActWriter,
    row: CardsRow,
    superActionId: number | null,
  ): Promise<(CardActionSummary & { actId: number })[]> {
    const saved = await writer.trashCard({
      cardId: row.id,
      before: cardFieldStateFromRow(row),
      superActionId,
    });
    if (saved === null) return [];
    const name = await this.composedNameOf(row);
    await this.expireAfterWrite({ cardId: row.id, nameAfter: name, verb: "delete" });
    await this.runFinalizeEvents(
      this.eventCard({
        name,
        id: row.id,
        key: name?.key ?? row.key ?? undefined,
        dbContent: row.db_content,
        dbContentBeforeAct: row.db_content ?? null,
        action: "delete",
        actId: saved.actId,
        trash: true,
        typeId: row.type_id,
        changedFields: ["trash"],
      }),
      [["clear_references", () => clearReferencesOnDelete(this.fetch.driver, row.id)]],
    );
    await cascadeReadRuleAfterRuleSave(this.readRuleDeps(), row, true);
    // The delete_children cascade does NOT run here: a subcard trashed by a
    // multi-subcard save must leave the cards that are THEMSELVES that
    // save's trash subcards under the supercard's action (Ruby's director
    // reuses a subcard already in the act), and trashing them early would
    // turn their own arms into pull-from-trash revivals. The caller runs
    // the cascade once the act's own subcard arms have all processed (see
    // saveSubcardsInWriter).
    return [{ cardId: row.id, actionId: saved.actionId, actId: saved.actId, verb: "delete", name }];
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
    skip?: Set<number>,
  ): Promise<(CardActionSummary & { actId: number })[]> {
    const summaries: (CardActionSummary & { actId: number })[] = [];
    const visited = new Set<number>([rootId]);
    let frontier: { parentId: number; parentActionId: number }[] = [
      { parentId: rootId, parentActionId: rootActionId },
    ];
    while (frontier.length > 0) {
      const next: { parentId: number; parentActionId: number }[] = [];
      for (const { parentId, parentActionId } of frontier) {
        for (const child of await this.childRows(parentId)) {
          if (visited.has(child.id)) continue;
          // A card the act itself trashes (one of the save's own trash
          // subcards) keeps its own super-action linkage: skip registering
          // it here — its own trash arm walks its subtree.
          if (skip?.has(child.id)) {
            visited.add(child.id);
            continue;
          }
          visited.add(child.id);
          const history = await this.fieldHasHistory(child);
          const saved = await writer.trashCard({
            cardId: child.id,
            before: cardFieldStateFromRow(child),
            superActionId: parentActionId,
            history,
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
          if (history) {
            summaries.push({
              cardId: child.id,
              actionId: saved.actionId,
              actId: saved.actId,
              verb: "delete",
              name: await this.composedNameOf(child),
            });
          }
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
    dbContentBeforeAct?: string | null;
  }): ModEventCard {
    return {
      name: input.name?.s ?? (input.id !== undefined ? `~${input.id}` : ""),
      id: input.id,
      key: input.key,
      dbContent: input.dbContent ?? undefined,
      dbContentBeforeAct: input.dbContentBeforeAct,
      action: input.action,
      trash: input.trash,
      typeId: input.typeId ?? null,
      nameBeforeAct: input.nameBeforeAct,
      changedFields: input.changedFields ?? [],
      // Env.controller (env.rb:18): the engine's saves serve controller
      // requests (see the recaptcha guard's envController note).
      envController: true,
      act: {
        action: input.action,
        actId: input.actId,
        skip: this.actSkipList(),
        forceSkip: this.modEvents?.forceSkip,
        trigger: this.modEvents?.trigger,
      },
    };
  }

  /** The save-scoped context the mod-event state sources populate against
   *  (mod-loader/mod-event-card-state.ts): Ruby's `Env.params` and
   *  `Auth.current_id` reach a predicate through the card's own accessors,
   *  and this is where the port supplies them. */
  private eventStateContext(stage: ModEventStage): ModEventCardStateContext {
    return {
      ...(this.saveParams !== undefined ? { params: this.saveParams } : {}),
      authCurrentId: this.actor?.id ?? null,
      isActCard: true,
      stage,
      ...(this.activeSaveAttributes !== undefined
        ? { saveInput: this.activeSaveAttributes }
        : {}),
      // Cardio.config.file_storage (01_storage_type.rb:20-22
      // storage_type_from_config) — the deck's configured backend, the
      // fallback arm of storage_type and the answer a content that names
      // no backend resolves to. Undefined = :local (the field's doc).
      ...(this.fileStorage !== undefined ? { fileStorage: this.fileStorage } : {}),
      driver: this.fetch.driver,
      lexicon: this.fetch.lexicon,
      fetch: this.fetch,
    };
  }

  /** Record the save's assigned attributes for the mod-event state sources
   *  (mod-loader/mod-event-card-state.ts ModEventSaveAttributes). Called
   *  once the save input is final — the two-step upload's cached
   *  attachment is already installed, which is what makes
   *  `save_preliminary_upload?` (00_upload_cache.rb:84-86) and the mount's
   *  file presence agree with what the events will actually run. */
  private setActiveSaveAttributes(input: {
    attachment?: { coded?: { mod?: string } };
    actionIdOfCachedUpload?: number | string;
  }): void {
    this.activeSaveAttributes = {
      attachmentRides: input.attachment !== undefined,
      ...(input.actionIdOfCachedUpload !== undefined
        ? { actionIdOfCachedUpload: input.actionIdOfCachedUpload }
        : {}),
      // `mod` assigned through the mount's writer (coded.rb:12-14): the
      // port's coded save carries it on the attachment, the only place a
      // caller can name the mod a coded file belongs to
      // (AttachmentInput.coded).
      ...(input.attachment?.coded?.mod !== undefined
        ? { mod: input.attachment.coded.mod }
        : {}),
      ...(input.attachment?.coded !== undefined ? { storageType: "coded" } : {}),
    };
  }

  /** The mod-event state this engine contributes directly, beyond the
   *  per-mod sources (mod-loader/mod-event-card-state.ts): the answers the
   *  engine already computes for its own gates, which the same predicates
   *  consult. Merged in before the sources run, so a source may override
   *  any of it.
   *
   *  - canApprove — `can_approve?` (mod/account/set/type/signup.rb:12-14):
   *    `Card.new(type_id: Card.default_accounted_type_id).ok? :create`. The
   *    engine already answers this for signup's own arm
   *    (canCreateDefaultAccountedType below); answering it twice would mean
   *    two permission probes per save, so the first answer is kept.
   *  - accountId / setupApproved — `current_account?`
   *    (set/abstract/account_holder.rb:23 `id && Auth.current_id == id`) and
   *    `setup?` (set/type/user.rb:72 `@setup_approved == true`), which is
   *    this act's flag on the User card it just created. */
  private async engineEventCardState(): Promise<ModEventCardState> {
    const state: ModEventCardState = {
      authCurrentId: this.actor?.id ?? null,
    };
    if (this.actor !== null) {
      return { ...state, canApprove: await this.canCreateDefaultAccountedType() };
    }
    return state;
  }

  /** Dispatch one director stage for this save (no dispatch without a
   *  runtime). The deps pair is the same one the built-in janitors take.
   *  The pending add_comment save input (if this save carries one) rides
   *  the ctx so the `when: :comment` predicate sees it.
   *
   *  The card is POPULATED first (mod-loader/mod-event-card-state.ts): the
   *  per-mod state sources contribute what Ruby's `when:` predicates read
   *  off the acting card, which the structural snapshot does not carry. */
  private async dispatchEventStage(
    stage: ModEventStage,
    card: ModEventCard,
  ): Promise<ModEventStageReport | undefined> {
    const runtime = this.modEvents;
    if (runtime === undefined) return undefined;
    const engineState = await this.engineEventCardState();
    const populated = await populateModEventCardState(
      { ...card, ...engineState },
      this.eventStateContext(stage),
    );
    return runModEventStage(
      this.saveSkip === undefined ? runtime : { ...runtime, skip: this.actSkipList() },
      stage,
      populated,
      {
        driver: this.fetch.driver,
        lexicon: this.fetch.lexicon,
        // The mod takeover of update_referer_content (core-mod's real batch)
        // IS the mechanism on this path — the engine's built-in call stands
        // down — so the mod body needs the same engine-cache pair the
        // built-in passes: all.rb:15's Card[card_id] referers fetch (whose
        // miss warms the pre-rewrite referer into the cache the render
        // path reads) and the update_column staleness pin (the
        // rename-referers oracle's frozen staleness, dropped only by the
        // referer's own expire).
        fetchRefererCard: (id) => this.fetch.bracket(id),
        pinStaleReferer: (card) => this.fetch.pinStaleCard(card),
        // rule? / preference? (card/lib/card/rule/all.rb:33-54) resolve a
        // card shape by walking the name's parts, which the port's own
        // rule helpers do with the read engine.
        fetch: this.fetch,
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
   * The reference pins the appended bytes
   * (card-mod-comment.harness.jsonl (not in the public package)):
   * "content\n<hr>\n<p>lines…</p>\n<div
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

  /** The deferred-reference-finalize seam's other half: run the events a
   *  createInWriter call stashed (deferFinalize). The caller runs this
   *  after the act's store-stage writes complete — Ruby's stage order
   *  (director/phases.rb storage_phase: store, then finalize; the subcards
   *  save inside the store stage), so the reference walk's Lexicon.id
   *  resolves the cards created earlier in the SAME act (the structured
   *  create's +summary — the walk answers its id and the partial
   *  reference arm never fires, all.rb:84 `unless id`). An empty box (no
   *  deferred events) is a no-op. */
  private async runDeferredReferenceFinalize(deferred: DeferredReferenceFinalize): Promise<void> {
    if (deferred.card !== undefined && deferred.thunks !== undefined) {
      await this.runFinalizeEvents(deferred.card, deferred.thunks);
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

  /** The anonymous codename card's id — the card an unauthenticated write is
   *  stamped with. Memoized: codenames are immutable within an
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
  /** ok?(:update) on an existing card for this engine's actor, as the
   *  validate stage judges it: throws the permission-denied error when the
   *  actor may not update it. */
  async assertMayUpdate(cardId: number): Promise<void> {
    const row = await this.fetchRowById(cardId);
    if (row === undefined || row.trash === 1) {
      throw new CardActionError("not-found", `no such card: ${cardId}`);
    }
    await this.assertCanWrite(await composeCardRecord(row, this.fetch.lexicon), "update");
  }

  /** `Card.new(type_id: <type>).ok? :create` for this engine's actor: may
   *  the actor create a (nameless) card of that type? */
  async mayCreateCardOfType(typeId: number): Promise<boolean> {
    const pattern: PatternCardInput = {
      name: "",
      isNew: true,
      typeId,
      typeName: await this.typeNameOf(typeId),
    };
    const verdict = await saveTaskVerdictForCard(this.fetch, pattern, "create", await this.writePermissionState());
    return verdict === true;
  }

  /** The first step of a two-step upload (card-mod-carrierwave
   *  set/abstract/attachment/00_upload_cache.rb prepare_attachment, when
   *  params[:attachment_upload]): the file is stored and one draft action
   *  records it, and nothing else is written.
   *  - for an existing card: an update draft on the card itself, the file
   *    stored with the card's files;
   *  - for a new card: a create draft filed on the upload-cache card
   *    (*new file / *new image), the file kept in the upload cache.
   *  The port checks permission first (update permission on the card, or
   *  create permission for the new card's type) and refuses otherwise,
   *  storing nothing. */
  async recordPreliminaryUpload(input: {
    cardId?: number;
    typeId: number;
    mount: "file" | "image";
    attachment: AttachmentInput;
  }): Promise<{
    actionId: number;
    cacheCardName: string | undefined;
    /** The stored identifier ("~<card>/<draft action><ext>") — the draft
     *  action's db_content change row and Ruby's in-memory content after
     *  write_identifier (the cards row stays untouched). */
    identifier: string;
    /** The stored byte count — number_to_human_size's input for the
     *  preview_editor render (preview_editor.haml's attachment.size). */
    size: number;
    /** The original filename — the draft action's comment
     *  (save_original_filename) and the preview's p.name byte. */
    originalFilename: string;
  }> {
    if (this.attachmentStore === undefined) {
      throw new Error("a preliminary upload requires the engine's attachmentStore option");
    }
    const actingId = await this.actingIdForWrite();
    if (actingId === undefined) this.assertWritable();
    let cardId: number;
    let cacheCardName: string | undefined;
    if (input.cardId !== undefined) {
      await this.assertMayUpdate(input.cardId);
      cardId = input.cardId;
    } else {
      if (!(await this.mayCreateCardOfType(input.typeId))) {
        throw new CardActionError(
          "permission-denied",
          `actor ${this.actor?.name ?? ANONYMOUS_ACTOR_NAME} may not create a card of type ${input.typeId}`,
        );
      }
      const cacheId = await this.fetch.codenames.id(`new_${input.mount}`);
      if (cacheId === undefined) throw new CardActionError("not-found", `no *new ${input.mount} card`);
      cardId = cacheId;
      cacheCardName = (await this.fetch.fetchById(cacheId))?.name?.s;
    }
    const ext = detectAttachmentExtension(input.attachment.originalFilename, input.attachment.bytes);
    const writer = this.newWriter(actingId);
    const saved = await writer.recordUploadDraft({
      cardId,
      actionType: input.cardId === undefined ? "create" : "update",
      comment: input.attachment.originalFilename,
      changes: (actionId) =>
        input.cardId === undefined
          ? [["name", ""], ["type_id", input.typeId], ["db_content", localAttachmentIdentifier(cardId, actionId, ext)]]
          : [["db_content", localAttachmentIdentifier(cardId, actionId, ext)]],
    });
    await this.attachmentStore.store({
      cardId,
      actionId: saved.actionId,
      ext,
      bytes: input.attachment.bytes,
      ...(input.cardId === undefined ? { area: "tmp" as const } : {}),
    });
    return {
      actionId: saved.actionId,
      cacheCardName,
      identifier: localAttachmentIdentifier(cardId, saved.actionId, ext),
      size: input.attachment.bytes.byteLength,
      originalFilename: input.attachment.originalFilename,
    };
  }

  /** The second step (assign_attachment_on_create / _on_update,
   *  00_upload_cache.rb:27-43): the cached draft action's file becomes the
   *  save's attachment, and once the save has run the draft action and its
   *  file are removed (delete_cached_upload_file_on_*; the action's change
   *  rows stay, as Action#delete leaves them). Undefined when the action
   *  is not a cached upload for this card. */
  async cachedUploadAttachment(
    actionId: number | string,
    opts: { cardId?: number; mount: "file" | "image" },
  ): Promise<{ attachment: AttachmentInput; release: () => Promise<void> } | undefined> {
    const id = Number(actionId);
    if (!Number.isInteger(id) || this.attachmentStore === undefined) return undefined;
    const cacheCardId = opts.cardId ?? (await this.fetch.codenames.id(`new_${opts.mount}`));
    const action = (
      await this.fetch.driver.query<{ card_id: number | null; comment: string | null }>(
        "SELECT card_id, comment FROM card_actions WHERE id = ? AND draft = 1",
        [id],
      )
    ).rows[0];
    if (action === undefined || cacheCardId === undefined || Number(action.card_id) !== cacheCardId) return undefined;
    const change = (
      await this.fetch.driver.query<{ value: string | null }>(
        "SELECT value FROM card_changes WHERE card_action_id = ? AND field = ? ORDER BY id DESC LIMIT 1",
        [id, trackedFieldIndex("db_content")],
      )
    ).rows[0];
    const parsed = parseLocalAttachmentIdentifier(change?.value ?? null);
    if (parsed === undefined) return undefined;
    const area = opts.cardId === undefined ? ("tmp" as const) : ("files" as const);
    const bytes = await this.attachmentStore.read(parsed.cardId, parsed.actionId, parsed.ext, undefined, area);
    if (bytes === undefined) return undefined;
    const store = this.attachmentStore;
    return {
      attachment: {
        bytes,
        originalFilename: action.comment ?? `${parsed.actionId}${parsed.ext}`,
        fromCachedUpload: true,
      },
      release: async () => {
        await this.fetch.driver.query("DELETE FROM card_actions WHERE id = ?", [id]);
        await store.remove?.(parsed.cardId, parsed.actionId, parsed.ext, area);
      },
    };
  }

  private async assertCanWrite(
    card: CardRecord,
    task: WriteTask,
    opts: { typeChanged?: boolean; assignedTypeId?: number; assignedName?: string } = {},
  ): Promise<void> {
    const pattern = await this.patternInputFor(card, opts.assignedTypeId, opts.assignedName);
    const state = await this.writePermissionState();
    // The account mods' ok_to_update? overrides (account_holder.rb:59,
    // right/account.rb:33, account_field.rb:16, right/status.rb:16-22):
    // `(own_account? && !type_id_changed? [&& !name_changed?]) || super`,
    // and the own-status lock. They shadow Set::All#ok_to_update? for a
    // save that changes neither type nor name; always_ok? still wins first.
    const override =
      task === "update" && !state.alwaysOk && opts.typeChanged !== true && opts.assignedName === undefined && card.name !== undefined
        ? await updatePermissionOverride(card.name, {
            viewerKey: this.actor !== null && !(await this.isAnonymousSession())
              ? DeckoName.parse(this.actor.name).key
              : undefined,
            fetchByKey: (key) => this.fetch.fetchByKey(key),
            fetchById: (cardId) => this.fetch.fetchById(cardId),
          })
        : undefined;
    const verdict = override ?? await saveTaskVerdictForCard(
      this.fetch,
      pattern,
      task,
      state,
      // assignedName rides the pattern input's name for the RULE walk and
      // opts for the RENAME clause (the sides the assigned name creates —
      // saveTaskVerdictForCard's update branch; name_events.rb:67-72,
      // :137-150, permissions.rb:22-26).
      { typeChanged: opts.typeChanged, assignedName: opts.assignedName },
    );
    if (verdict === false) {
      // permissions.rb:117 deny_because you_cant("#{verb} #{name}"), added
      // to card.errors under :permission_denied (:204).
      const shownName = card.name?.s !== undefined && card.name.s !== "" ? card.name.s : "this";
      // A COMPOUND create whose own permit passed but whose SIDE walk failed
      // (permissions.rb:127-137 ok_to_create_side: a missing part is judged
      // as a virtual new card's own ok?(:create)) composes the SUBCARD-ERROR
      // shape the act reports: the part card's permission_denied error folds
      // onto the supercard under the part's name (subcards/all.rb:65-80
      // handle_subcard_errors: `errors.add subcard.name.from(name),
      // "#{error.attribute} #{msg}"`), and the surviving act.errors carry
      // ONLY that part-named attribute — the live-oracle probe (deck copy,
      // Auth.as("Mira Member") { Card.new(name:
      // "Topic 009+*self+Mira Member+*follow", content: "[[*never]]").save!
      // }) answered RecordInvalid with errors exactly
      // ["Topic 009+*self+Mira Member => permission_denied You don't have
      // permission to create Topic 009+*self+Mira Member"]. error.rb:177-182
      // invalid_card_error_class then finds NO :permission_denied/:conflict
      // KEY on the act and bottoms out at base Card::Error: status 422, view
      // :errors — the standard_errors alert reads "<PART NAME UP>:
      // permission_denied You don't have permission to create <part name>"
      // under the "Problems with <card>" heading. The board follow-family's
      // unfollow link pins these bytes (the virtual left
      // "Topic 009+*self+Mira Member" denies where the act's own permit
      // passed). The 422 class is the client-visible half of the swap: the
      // deck script's showErrorResponse (slotter.js.coffee) answers 403
      // with showAsModal but a 422 with notify — the alert lands in the
      // closest card-slot (the follow_section slot), not the body modal.
      // The gate below is the Right::Follow override shape
      // (followRightPermitPassedForCard): the only acts whose ok_to_create?
      // carries NO sides walk, so a denied side surfaces purely as the
      // fold. EVERY other act — the secverify deep-name probes (standard
      // ok_to_create?: its own sides walk lands the act's own
      // :permission_denied) and unfollow-from-mail's "Mira Member+*follow"
      // (the override's permit denied) — keeps the plain permission-denied
      // arm below. All three shapes probed against the live oracle on a
      // deck copy.
      if (
        task === "create" &&
        card.name !== undefined &&
        card.name.isCompound === true &&
        (await followRightPermitPassedForCard(this.fetch, pattern, state))
      ) {
        const side = await this.failingCreateSide(card.name);
        if (side !== undefined) {
          throw new CardActionError(
            "user-error",
            `actor ${this.actor?.name ?? ANONYMOUS_ACTOR_NAME} may not ${task} card ${card.name.s}`,
            `${side.toUpperCase()}: permission_denied You don't have permission to create ${side}`,
            { [side.toLowerCase()]: `permission_denied You don't have permission to create ${side}` },
            card.name.s,
          );
        }
      }
      throw new CardActionError(
        "permission-denied",
        `actor ${this.actor?.name ?? ANONYMOUS_ACTOR_NAME} may not ${task} card ${card.name?.s ?? String(card.id)}`,
        undefined,
        { permission_denied: `You don't have permission to ${task} ${shownName}` },
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
  /** The failing side of a compound create whose own permit passed
   *  (permissions.rb:127-137 ok_to_create_side: an existing part passes;
   *  a missing part is judged as a virtual new card's own ok?(:create)).
   *  The side name when one denies, undefined when both sides pass (the
   *  caller falls back to the plain card denial — the failure was the
   *  permit arm, not a side). */
  private async failingCreateSide(name: DeckoName): Promise<string | undefined> {
    const state = await this.writePermissionState();
    for (const partName of [name.leftName, name.rightName]) {
      if (partName === undefined) continue;
      const existing = await this.fetch.fetchByKey(partName.key);
      if (existing !== undefined && existing.id !== undefined) continue; // ok_to_create_side's part_card&.new_card? false
      const verdict = await taskVerdictForCard(
        this.fetch,
        { name: partName, isNew: true },
        "create",
        state,
      );
      if (verdict === false) return partName.s;
    }
    return undefined;
  }

  private async patternInputFor(    card: CardRecord,
    assignedTypeId: number | undefined,
    assignedName?: string,
  ): Promise<PatternCardInput> {
    const typeId = assignedTypeId ?? card.typeId;
    const typeName = typeId !== undefined && typeId !== null ? await this.typeNameOf(typeId) : undefined;
    const assigned = assignedName !== undefined ? DeckoName.parse(assignedName) : undefined;
    let leftTypeName: string | undefined;
    // quick_type(name.left_name) (class_methods.rb:59-71): the left part is
    // fetched BY NAME with `new: {}`, so a missing or trashed left answers
    // the type a new card of that name would get. For a rename the name is
    // the ASSIGNED one.
    const patternName = assigned ?? card.name;
    if (patternName !== undefined && patternName.isCompound) {
      leftTypeName = await quickTypeName(this.fetch, patternName.leftName);
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
   *  auth/current.rb:7-9). Undefined
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
  /** The content set_default_content assigns to a new card, or undefined
   *  when use_default_content? is false (content.rb:25-32: default_content
   *  = template&.db_content, used only when present?). The template of a
   *  new card is new_card_template (card-mod-content set/all/templating.rb:
   *  52-58): the card's *default rule card, unless a structure rule applies
   *  (dup_structure, :60-64), in which case the structure wins. A structure
   *  whose content is "_self" counts as none (structure_rule_card, :44-48).
   *
   *  dup_structure sets the copy's type_id to the default rule's type, but
   *  `dup` carries the card's set patterns, already computed from its own
   *  type when its set modules were included, so the structure lookup runs
   *  on the card's own type. The deck shows the effect: every Cardtype card
   *  stores a copy of Cardtype+*type+*structure although *all+*default is
   *  RichText-typed. */
  private async newCardTemplateContent(name: DeckoName, typeId: number): Promise<string | undefined> {
    const pattern = await ruleWalkPatternInput(this.fetch, { name, isNew: true, typeId });
    const defaultRule = await findRule(this.fetch, pattern, "*default");
    const structureRule = await findRule(this.fetch, pattern, "*structure");
    const structure =
      structureRule !== undefined && (structureRule.rule.dbContent ?? "").trim() !== "_self"
        ? structureRule.rule
        : undefined;
    const content = (structure ?? defaultRule?.rule)?.dbContent;
    // present? — nil, "" and whitespace-only are all blank.
    return typeof content === "string" && content.trim() !== "" ? content : undefined;
  }

  /** prepare_db_content's HTML step (content.rb:44-49): the stored content
   *  passes through Card::Content.clean! unless the card's clean_html? is
   *  false (its type's or right part's set overrides it). */
  /** event :save_recently_edited_settings (card-mod-rules set/rule/rules.rb
   *  :1-6, :integrate, on: :save, changed: %i[type content]): every rule
   *  card saved in the act moves its setting to the front of
   *  *recent settings (`insert_item 0, name.right`, collection
   *  item_assignment.rb:47-52), saved as a subcard. *recent settings keeps
   *  no history (set/self/recent_settings.rb history? false), so the save is
   *  its cards row (content and stamps) and its rebuilt references. */
  private async saveRecentlyEditedSettings(result: ActionResult | null): Promise<void> {
    if (result === null) return;
    const driver = this.fetch.driver;
    const recentId = await this.fetch.codenames.id("recent_settings");
    if (recentId === undefined) return;
    const settingTypeId = await this.fetch.codenames.id("setting");
    const actions = [
      { cardId: result.cardId, actionId: result.actionId, verb: result.verb, name: result.name },
      ...result.subactions.map((s) => ({ cardId: s.cardId, actionId: s.actionId, verb: s.verb, name: s.name })),
    ];
    for (const action of actions) {
      if (action.verb === "delete") continue;
      const row = await this.fetchRowById(action.cardId);
      if (row === undefined || row.trash === 1 || row.left_id === null || row.right_id === null) continue;
      const right = await this.fetchRowById(row.right_id);
      // set/rule/rules.rb's set is EVERY rule-and-preference card (the right
      // part is a Setting) — the follow family's PREFERENCE saves
      // ("Topic 008+*self+Ada Admin+*follow", whose direct left is a User
      // junction, not a Set) fire it exactly like a set-anchored rule does;
      // the set-anchored left check dropped the preference arm entirely.
      // (Both merge lines landed this event-set fix — merge 50 as Card#rule?'s
      // standard_rule?/preference? disjunction, this branch as the event set's
      // own right-Setting membership; the set definition is the binding one
      // and admits the superset, so the right-Setting membership stays.)
      if (right === undefined || right.type_id !== settingTypeId || right.trash === 1) continue;
      if (action.verb === "update") {
        const changed = (
          await driver.query<{ n: number }>(
            "SELECT COUNT(*) AS n FROM card_changes WHERE card_action_id = ? AND field IN (1, 2)",
            [action.actionId],
          )
        ).rows[0];
        if (Number(changed?.n ?? 0) === 0) continue;
      }
      const recent = await this.fetchRowById(recentId);
      if (recent === undefined || recent.trash === 1) continue;
      // `insert_item 0, name.right` — the RULE card's own right name as
      // saved (rules.rb:3), not the setting card's stored name: the
      // pointer-input journeys create "Tag+*right+*input_type" and the
      // list's new lead entry is "*input_type" where the stored setting
      // card's name is "*input type" (the old space-form entry drops —
      // Array#delete's Card::Name == is key equality). The AUTHORED name
      // rides the action summary (compound rows carry name NULL, and the
      // sides resolve through the lexicon — the setting card's stored name).
      const settingName = action.name?.rightName?.s;
      if (settingName === undefined) continue;
      const settingKey = DeckoName.parse(settingName).key;
      const items = listItemStrings(recent.db_content).filter(
        (item) => DeckoName.parse(item).key !== settingKey,
      );
      const content = [settingName, ...items].join("\n");
      if (content === (recent.db_content ?? "")) {
        // insert_item assigned the identical list: the subcard save still
        // runs (the director's set_stamper stamps the row — the follow
        // journey's oracle pins the updater_id-only update) with no content
        // change row and no reference event (changed: :content is false).
        await driver.query("UPDATE cards SET updated_at = ?, updater_id = ? WHERE id = ?", [
          sqlDateTime(this.clock()),
          this.actor?.id ?? null,
          recentId,
        ]);
        continue;
      }
      await driver.query("UPDATE cards SET db_content = ?, updated_at = ?, updater_id = ? WHERE id = ?", [
        content,
        sqlDateTime(this.clock()),
        this.actor?.id ?? null,
        recentId,
      ]);
      const recentName = (await this.fetch.lexicon.name(recentId)) ?? DeckoName.parse("*recent settings");
      await refreshReferencesOut(driver, this.fetch.lexicon, recentId, recentName, content);
    }
  }

  /** A create that fails after reserving action rows (a compound card's own
   *  action, its sides') leaves no row behind: the reserved actions that no
   *  save filled, and the act when it holds nothing else, are removed. */
  private async dropUnfilledActions(writer: ActWriter): Promise<void> {
    const actId = writer.currentActId();
    if (actId === null) return;
    const driver = this.fetch.driver;
    await driver.query("DELETE FROM card_actions WHERE card_act_id = ? AND card_id IS NULL", [actId]);
    const left = (
      await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions WHERE card_act_id = ?", [actId])
    ).rows[0];
    if (Number(left?.n ?? 0) === 0) await driver.query("DELETE FROM card_acts WHERE id = ?", [actId]);
  }

  /** The +*email save's validate stage (card-mod-account set/right/email.rb):
   *  downcase_email at :prepare_to_validate downcases, validate_email at
   *  :validate strips and applies the address grammar, validate_unique_email
   *  (after it) adds the duplicate error when another +*email holds the same
   *  content. Both errors land on :content, so the later one replaces the
   *  earlier in Ruby's errors hash. Returns the content the save must store. */
  private async validatedEmailContent(raw: string, rightId: number, selfId: number | null): Promise<string> {
    const content = normalizeEmail(raw);
    if (content === "") return content;
    let message: string | null = null;
    if (!emailIsValid(content)) message = "must be valid address";
    const taken = (
      await this.fetch.driver.query<{ id: number }>(
        "SELECT id FROM cards WHERE right_id = ? AND db_content = ? AND trash = 0 AND id IS NOT ? LIMIT 1",
        [rightId, content, selfId],
      )
    ).rows;
    if (taken.length > 0) message = "must be unique";
    if (message === null) return content;
    throw new CardActionError("validation-failed", `Validation failed: ${message}`, `CONTENT: ${message}`, {
      content: message,
    });
  }

  /** Salts generated for accounts created in this engine's acts, by account
   *  card id, until their +*salt card is stored (account-fields.ts). */
  private readonly pendingSalts = new Map<number, string>();

  /** `left&.salt` for a +*password save: the account's stored +*salt, or the
   *  salt generated for an account created earlier in this act. */
  private async accountSalt(accountId: number | null): Promise<string | undefined> {
    if (accountId === null) return undefined;
    const pending = this.pendingSalts.get(accountId);
    if (pending !== undefined) return pending;
    const saltId = await this.fetch.codenames.id("salt");
    if (saltId === undefined) return undefined;
    const row = (
      await this.fetch.driver.query<{ db_content: string | null }>(
        "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0",
        [accountId, saltId],
      )
    ).rows[0];
    return row?.db_content ?? undefined;
  }

  /** history? false (account-fields.ts): the save keeps its cards row but no
   *  action and no changes. Ruby's history-less cards never run assign_action
   *  (events.rb:11-13, `when: :actionable?`) — the port creates the action to
   *  write the save and drops it here. The act row goes with the action ONLY
   *  when this operation lazily created it (a pure history-less save leaves
   *  no act at all); an act that predates the operation is Ruby's
   *  finalize_act shape — the act card's bare row (events.rb:48-50) — and
   *  survives its zero actions. */
  private async dropHistory(actionId: number, actId: number, actPreexisted: boolean): Promise<void> {
    const driver = this.fetch.driver;
    await driver.query("DELETE FROM card_changes WHERE card_action_id = ?", [actionId]);
    await driver.query("DELETE FROM card_actions WHERE id = ?", [actionId]);
    if (actPreexisted) return;
    const left = (
      await driver.query<{ n: number }>("SELECT COUNT(*) AS n FROM card_actions WHERE card_act_id = ?", [actId])
    ).rows[0];
    if (Number(left?.n ?? 0) === 0) {
      await driver.query("DELETE FROM card_acts WHERE id = ?", [actId]);
    }
  }

  /** set_default_salt + set_default_status (account/events.rb:3-9): after
   *  the request's own fields, a created account gets its +*salt (the salt
   *  generated when the account was stored) and its +*status, unless the
   *  request named them. */
  private async ensureAccountDefaults(
    writer: ActWriter,
    accountName: DeckoName,
    accountId: number,
    accountActionId: number,
    saved: (CardActionSummary & { actId: number })[],
  ): Promise<void> {
    const salt = this.pendingSalts.get(accountId);
    if (salt === undefined) return;
    const fields: [string, string][] = [
      ["*salt", salt],
      ["*status", DEFAULT_ACCOUNT_STATUS],
    ];
    for (const [field, content] of fields) {
      const fieldName = DeckoName.parse(`${accountName.s}+${field}`);
      const existing = await this.fetch.lexicon.id(fieldName);
      const live = existing === undefined ? undefined : await this.fetchRowById(existing);
      if (live !== undefined && live.trash === 0) continue;
      const created = await this.createInWriter(
        writer,
        { name: fieldName.s, content, superActionId: accountActionId },
        { isActCard: false },
      );
      if (field !== "*salt") {
        saved.push({
          cardId: created.cardId,
          actionId: created.actionId,
          actId: created.actId,
          verb: created.verb,
          name: created.name,
        });
      }
    }
    this.pendingSalts.delete(accountId);
  }

  /** require_field :email (set/right/account.rb:8): an account created
   *  through subcards of a new card must name its +*email. Checked before
   *  anything is written, as Ruby's validation stage runs before the store
   *  stage. Only relative keys ("+*account") are certain to name a new
   *  account; an absolute key may name an existing one. */
  /** card-mod-api_key set/right/api_key.rb: `ok_to_create?` is
   *  `own_account? || super`, and own_account? walks `account_card`
   *  (set/abstract/account_field.rb:3-5: `left.tap`). With no left card that
   *  walk has no receiver, so Ruby raises before the permission verdict and
   *  saves nothing. The port refuses the save the same way: an exception,
   *  not a permission denial, and no rows. */
  private async assertAccountFieldLeftExists(name: DeckoName): Promise<void> {
    if (name.isSimple || name.rightName === undefined || name.leftName === undefined) return;
    const right = await this.fetch.fetchByKey(name.rightName.key);
    if (right === undefined || right.codename !== "api_key") return;
    const left = await this.fetch.fetchByKey(name.leftName.key);
    if (left !== undefined && left.id !== undefined) return;
    throw new Error(
      `cannot create ${name.s}: its left card does not exist, so the api_key right has no account to check ownership against`,
    );
  }

  private assertAccountsHaveEmail(subcards: Record<string, SubcardInput> | undefined): void {
    if (subcards === undefined) return;
    for (const [key, sub] of Object.entries(subcards)) {
      const parts = key.split("+").map((p) => p.trim().toLowerCase());
      if (key.trim().startsWith("+") && parts[parts.length - 1] === "*account") {
        const named = Object.keys(sub.subcards ?? {}).some(
          (k) => k.split("+").map((p) => p.trim().toLowerCase()).pop() === "*email",
        );
        if (!named) throw new CardActionError("field-required", `${key} email required`);
      }
      this.assertAccountsHaveEmail(sub.subcards);
    }
  }

  /** Abstract::List#standardize_content on assigned content (list-content.ts):
   *  a card in a list set stores its items one per line, without brackets.
   *  The self sets of *recent settings and the Mod card are list sets too
   *  (LIST_SELF_CODENAMES), so assigned content of those two cards
   *  standardizes the same way. Content of any other card is returned
   *  unchanged. */
  private async standardizeAssignedContent(
    content: string,
    typeId: number | null,
    leftId: number | null,
    rightId: number | null,
    ownCode?: string | null,
  ): Promise<string> {
    const typeCode = typeId === null ? undefined : await this.fetch.codenames.nameForId(typeId);
    const rightCode = rightId === null ? undefined : await this.fetch.codenames.nameForId(rightId);
    let isList =
      (typeCode !== undefined && LIST_TYPE_CODENAMES.has(typeCode)) ||
      (rightCode !== undefined && LIST_RIGHT_CODENAMES.has(rightCode)) ||
      (ownCode !== undefined && ownCode !== null && ownCode !== "" && LIST_SELF_CODENAMES.has(ownCode));
    const leftType = async (): Promise<string | undefined> => {
      if (leftId === null) return undefined;
      const left = await this.fetchRowById(leftId);
      return left?.type_id === undefined || left.type_id === null
        ? undefined
        : this.fetch.codenames.nameForId(left.type_id);
    };
    // Role+*members is an id list (Abstract::IdList): items stored as ~<id>.
    if (rightCode === "members" && (await leftType()) === "role") {
      return standardizeIdListContent(content, async (item) => {
        try {
          return await this.fetch.lexicon.id(DeckoName.parse(item));
        } catch {
          return undefined;
        }
      });
    }
    if (!isList && rightCode === "follow") isList = (await leftType()) === "user";
    if (!isList) return content;
    return standardizeListContent(content, {
      nameForId: async (id) => (await this.fetch.lexicon.name(id))?.s,
      nameForCodename: async (code) => (await this.fetch.codenames.name(code))?.s,
    });
  }

  /** prepare_db_content's HTML step (content.rb:44-49): the stored content
   *  passes through Card::Content.clean! unless the card's clean_html? is
   *  false (its type's or right part's set overrides it). */
  private async cleanForStore(
    content: string,
    typeId: number | null,
    rightId: number | null,
  ): Promise<string> {
    if (content === "") return content;
    const typeCode = typeId === null ? undefined : await this.fetch.codenames.nameForId(typeId);
    if (typeCode !== undefined && NO_CLEAN_TYPE_CODENAMES.has(typeCode)) return content;
    const rightCode = rightId === null ? undefined : await this.fetch.codenames.nameForId(rightId);
    if (rightCode !== undefined && NO_CLEAN_RIGHT_CODENAMES.has(rightCode)) return content;
    return cleanContent(content);
  }

  private async ensureSides(
    writer: ActWriter,
    name: DeckoName,
    selfId?: number,
    opts: { reserveOwnAction?: boolean } = {},
  ): Promise<ResolvedSides> {
    const created: (CardActionSummary & { actId: number })[] = [];
    if (!name.isCompound) return { leftId: null, rightId: null, created };
    const idsByKey = new Map<string, number>();
    let reservedActionId: number | undefined;
    const resolveSide = async (sideName: DeckoName | undefined): Promise<number | null> => {
      if (sideName === undefined) return null;
      const key = sideName.key;
      const known = idsByKey.get(key);
      if (known !== undefined) return known;
      let id = await this.fetch.lexicon.id(sideName);
      // prepare_new_side (name_events.rb:136-141) creates the side when
      // `!Card[side_id]&.real?`. The Lexicon keeps a trashed card's entry
      // (trash is not a name change, so update_lexicon never runs), and
      // Card[id] filters trash, so a side whose lexicon id is a trashed row
      // is MISSING: it becomes a side subcard, whose own manage_trash then
      // pulls that row back from the trash.
      if (id !== undefined && id !== selfId) {
        const sideRow = await this.fetchRowById(id);
        if (sideRow === undefined || sideRow.trash === 1) id = undefined;
      }
      if (selfId !== undefined && id === selfId) {
        id = await this.recreateObstructedSide(writer, sideName, selfId, created);
      } else if (id === undefined) {
        // The compound's own action is already reserved by the caller (the
        // writer's reserveAction pre-pass); a side's create records its own
        // action here, as a subaction of the act.
        const sub = await this.createInWriter(writer, { name: sideName.s }, { isActCard: false });
        id = sub.cardId;
        created.push(sub);
      }
      idsByKey.set(key, id);
      return id;
    };
    const leftId = await resolveSide(name.leftName);
    const rightId = await resolveSide(name.rightName);
    return { leftId, rightId, created, ...(reservedActionId !== undefined ? { reservedActionId } : {}) };
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
   *  happen here: that is the post-2020 junction-truth answer. */
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

  /** Ruby Card#content (content/all.rb:5-7): `structured_content ||
   *  standard_content` — a card governed by a *structure rule
   *  (templating.rb:30-34, a "_self" rule card counts as none) reads the
   *  rule card's content whatever its own db_content column carries. The
   *  reference janitors parse this content (all.rb:124-128 content_object
   *  over `content`), so a structured card's save rebuilds its
   *  card_references rows from the TEMPLATE, not from the freshly saved
   *  column value (the harness's update-topic-as-member step records
   *  exactly that: db_content becomes the submitted text while the rows
   *  come back as the template's three inclusions). */
  private async structureReferencesContent(
    row: CardsRow,
    dbContent: string | null | undefined,
  ): Promise<string | null | undefined> {
    const name = await this.composedNameOf(row);
    if (name === undefined) return dbContent;
    const pattern = await ruleWalkPatternInput(this.fetch, {
      name,
      id: row.id,
      isNew: false,
      typeId: row.type_id,
    });
    const structureRule = await findRule(this.fetch, pattern, "*structure");
    if (structureRule === undefined || (structureRule.rule.dbContent ?? "").trim() === "_self") {
      return dbContent;
    }
    return structureRule.rule.dbContent ?? dbContent;
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
