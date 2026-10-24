// The ModEventFn EXECUTION SEAM: the dispatcher that fires registered
// set-module events at their declared stage of a save. This is the half
// mod-event-registry.ts explicitly does NOT own (its header: "the EXECUTION
// wiring ... The engine consults eventsForStage at its named stages when
// that seam lands"). It ports Ruby's applicability algebra and stage walk:
//
// - event_applies? (card-1.110.0 lib/card/set/event/all.rb:16-22): set
//   membership first, then every condition must agree.
// - on_condition_applies? (all.rb:32-35): absent on: -> every action;
//   "save" was expanded to [create, update] at registration time in Ruby
//   (set/event/options.rb:70) and is expanded here at dispatch (the
//   registry stores it verbatim, mod-manifest.ts:165-167).
// - changed/changing_condition_applies? (all.rb:69-77, alias :77): only
//   gates :update saves; absent/empty -> always true; else ANY declared
//   field changing. Names resolve through Card::Dirty (dirty.rb:8-17):
//   canonical columns name, db_content, trash, type_id, left_id, right_id,
//   codename; aliases type -> type_id, content -> db_content. The card's
//   changedFields set is built by the save path using DirtyNames semantics
//   (dirty.rb:57-60 — a left/right change IS a name change).
// - skip_condition_applies? (set/event/skip_and_trigger.rb:80-84, the
//   comment IS the spec: "applies always means event can run"): not listed
//   -> runs. Listed with a plain skip= entry (hash value true): an event
//   that declared skip: "allowed" is skipped, one that did not still runs.
//   A skip_event! entry (value :force) stops everything listed.
// - trigger_condition_applies? (:86-90): trigger: "required" events run
//   only when the act's trigger list names them.
// - when_condition_applies? (all.rb:79-85): a named predicate resolved
//   against the card, Ruby's Symbol case being `send block` - the card
//   method the set module defines beside its event. An unresolvable name
//   has NO Ruby branch: it is a NoMethodError that kills the save. This
//   raises for it, so a declaration whose predicate the runtime cannot
//   resolve surfaces as the gap it is instead of silently dropping the
//   event.
// - set scoping (all.rb:26-29 set_condition_applies?): the declaring set
//   module must be included on the card. The registry records setPath;
//   "all/"-pattern files are included on every card. Pattern/self-scoped
//   files consult the runtime's setMember resolver; without one they are
//   skipped "set-not-applicable" (also report-visible).
// - stages (lib/card/director.rb:12-28): nine stages in three phases. An
//   event with no stage of its own but `before:`/`after:` X runs in X's
//   stage, directly before/after X (options.rb:73-86 keeps @stage nil when
//   before:/after:/around: is present — "after, before, or around will
//   override stage configuration" — so the event is a callback on X's
//   chain, set/event/callbacks.rb:14-21). Ordering otherwise: registration
//   order (= Ruby's definition/load order), with relative-ordering entries
//   moved next to the target they name.
// - error isolation (lib/card.rb:163-171 rescuing_if_integration + set/
//   event.rb:147-159): stages matching /integrate/ rescue a failing body so
//   "one failed integration event should not harm others"; every other
//   stage propagates the error to the save.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { RenameSwapLexicon } from "../actions/update-referer-content.js";
import type { CardRecord } from "../fetch/card-record.js";
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import {
  ModEventRegistry,
  type RegisteredModEvent,
} from "./mod-event-registry.js";
import type {
  ModEventCard,
  ModEventStage,
} from "./mod-manifest.js";

/** The add_comment save input (card-mod-comment set/all/comment.rb:5-12):
 *  the flat request params `comment` / `comment_author` the save rode with,
 *  plus the mutation seam — Ruby's `self.content =` inside the event body
 *  mutates the act card BEFORE the row write; the port's setContent closure
 *  is that mutation point (the action engine applies the registered body at
 *  the prepare_to_store position, before the writer call). */
export interface ModEventSaveInput {
  /** params[:comment] — present when the request carried the param at all
   *  (Ruby's `when: :comment` gate is mere truthiness; "" is truthy and
   *  reaches the body, which then skips the append for a blank). */
  readonly comment: string | undefined;
  /** params[:comment_author]. */
  readonly commentAuthor: string | undefined;
  /** The signed-in actor's name (undefined when the save rode anonymous —
   *  the format's comment_author branches on Auth.signed_in?). */
  readonly signedInActorName: string | undefined;
  /** The save clock (Time.zone.now in the signature). */
  readonly now: () => Date;
  /** Ruby's Env.session for this save (card-1.110.0 lib/card/env.rb:21-23 —
   *  `request&.session || {}`, never nil in a real run). The comment mod's
   *  add_comment event writes the resolved comment_author into it
   *  (set/all/comment.rb:6 `Env.session[:comment_author] = comment_author
   *  if Env.session`) and the author reader takes the session arm FIRST
   *  (comment.rb:16-19), so a later save in the same session remembers the
   *  author. The CALLER carries the bag across saves (the route layer owns
   *  the real session store; undefined = no session — the pre-port
   *  behavior). */
  readonly session?: { commentAuthor?: string };
  /** The card's pending content (the update's current db_content when the
   *  request changed none). */
  readonly pendingContent: string | undefined;
  /** Ruby's `self.content =` — mutates the pending write. */
  setContent(dbContent: string): void;
  /** Set once the body applied at the SP position; the post-persist stage
   *  walk's `comment` predicate reads it (when-false) so the body never
   *  appends twice. */
  commentApplied: boolean;
  /** The recaptcha validate event's inputs (card-mod-recaptcha set/all/
   *  recaptcha.rb event :recaptcha, :validate): the request token, the
   *  guard snapshot the save path computed, the per-request captcha_used
   *  marker and the siteverify transport seam. Undefined on saves that
   *  carry no recaptcha context (the mod not loaded, or no recaptcha
   *  options composed on the engine — Ruby's guard is off with no
   *  recaptcha_site_key/secret_key configured, recaptcha.rb:46-48). */
  readonly recaptcha?: ModEventRecaptchaInput;
  /** params[:colors] / params[:theme_colors] — the skin colors editor's
   *  posted variable groups (card-mod-bootstrap set/type_plus_right/
   *  bootswatch_skin/colors.rb:144-146 variable_values_from_params reads
   *  Env.params[group] and slices it to VARIABLE_NAMES). Present when the
   *  request carried the group at all; Ruby's `&.slice(...) || {}` no-ops
   *  on both an absent group and an empty one. */
  readonly colorsParams?: Readonly<Record<string, string>>;
  readonly themeColorsParams?: Readonly<Record<string, string>>;
}

/** The guard snapshot `recaptcha_on?` / `validate_recaptcha?` evaluate
 *  (recaptcha.rb:16-23, 68-72) — the deck's config + auth + rule state at
 *  validate time, resolved by the save path before the stage walk (the
 *  captcha rule read is async here; Ruby's `rule(:captcha)` is a sync db
 *  hit inside the same stage). The rule content resolves through the
 *  engine's own candidate walk by default (ruleContentForCard,
 *  actions/rule-content-walk.ts — rule/all.rb:5-15 + 66-73); the engine
 *  config's explicit value/function remains the host override seam. */
export interface ModEventRecaptchaGuard {
  /** Card.config.recaptcha_site_key / recaptcha_secret_key (:46-48). */
  readonly siteKey: unknown;
  readonly secretKey: unknown;
  /** Env.controller (:18) — true on the engine's request save paths. */
  readonly envController: boolean;
  /** Auth.signed_in? / Auth.always_ok? / Auth.needs_setup? (:19-21). */
  readonly signedIn: boolean;
  readonly alwaysOk: boolean;
  readonly needsSetup: boolean;
  /** `rule(:captcha)&.db_content` for the card being saved (:22 — the
   *  candidate walk the save path resolves: ruleContentForCard over the
   *  deck's rule cards, or the host's explicit override; Card::Rule.toggle
   *  turns it into the boolean, rule.rb:11-13). */
  readonly captchaRuleContent: unknown;
  /** Card::Codename.exist? :captcha (:69). */
  readonly captchaCodenameExists: boolean;
  /** Ruby's @supercard flag (:71) — the engine's saves are top-level acts,
   *  so the save path always passes false (the subcard-act context does not
   *  exist in this port; named remainder on the mod header). */
  readonly isSupercard: boolean;
  /** Cardio.config.recaptcha_minimum_score (:37; default 0.5,
   *  lib/card/mod/recaptcha.rb:8). */
  readonly minimumScore: number;
  /** Cardio.config.recaptcha_verify_url (lib/card/mod/recaptcha.rb:9; the
   *  ::Recaptcha.get target, recaptcha-4.13.2 lib/recaptcha.rb#self.get). */
  readonly verifyUrl: string;
}

/** The siteverify transport seam — ::Recaptcha.get's shape
 *  (recaptcha-4.13.2 lib/recaptcha.rb:63-77: GET verify_url + "?" +
 *  URI.encode_www_form(secret, response), body text returned). The real
 *  transport is the recaptcha mod's recaptchaSiteverifyGet; tests inject
 *  stubs. */
export type ModEventRecaptchaVerify = (
  verifyUrl: string,
  query: { secret: string; response: string },
) => Promise<string>;

/** Everything event :recaptcha's body reads off the save
 *  (recaptcha.rb:50-66): the token (Env.params[:recaptcha_token]), the
 *  guard, the *captcha card's per-request captcha_used state (:captcha.card
 *  .captcha_used!/captcha_used?, self/captcha.rb:7-13) and the transport. */
export interface ModEventRecaptchaInput {
  /** Env.params[:recaptcha_token] — may be undefined (a save with no token
   *  still validates: the guard fires, the verify posts response: nil and
   *  Google answers "missing-input-response", recaptcha.rb:41-44). */
  readonly token: string | undefined;
  readonly guard: ModEventRecaptchaGuard;
  /** captcha_used? (self/captcha.rb:7-9) — per-request lifetime (Ruby's
   *  ivar on the *captcha card; the engine holds it per engine instance,
   *  "construct per request"). */
  readonly isUsed: () => boolean;
  /** captcha_used! (:11-13) — the body marks it BEFORE the verify
   *  (recaptcha.rb:52), so a second card in the same request skips. */
  readonly markUsed: () => void;
  /** ::Recaptcha.get's seam (recaptcha.rb:41-44). */
  readonly verify: ModEventRecaptchaVerify;
}

/** Ruby's `Rails.logger` (card-1.110.0 lib/card/set/event.rb:170-173 writes
 *  one debug line per event call; mod/core/set/all/result.rb:3 writes the
 *  reported error's message and backtrace at debug). The port has no logger
 *  of its own: the host supplies one, and a host that supplies none leaves
 *  the seam absent — a body that writes to it does nothing, and the absence
 *  is the port's own documented divergence, not a silent success. */
export interface ModEventLogger {
  debug(message: string): void;
  info(message: string): void;
}

/** Card::Error.current (card-1.110.0 lib/card/error.rb:16, :133): the error
 *  the report chain is currently reporting. The notable_exception_raised
 *  body reads the message and the backtrace off it (result.rb:2-3). */
export interface ModEventCurrentError {
  readonly message: string;
  readonly backtrace: readonly string[];
}

/** Ruby's card.subcards (card-1.110.0 lib/card/subcards.rb:1-16) — the
 *  director's staged subcards — as the save input's own MUTABLE collection.
 *  The reject_empty_subcards body walks it and drops the empty NEW ones
 *  (mod/core/set/all/subcards.rb:5-12). */
export interface ModEventSubcardCollection {
  /** The collection's keys, in the order they were posted. */
  readonly keys: readonly string[];
  /** `subcard.new?` — the subcard under this key is a NEW card: no live
   *  card owns that name. */
  readonly isNew: (key: string) => Promise<boolean>;
  /** `subcard.unfilled?` (content.rb:34-36): blank content, blank comment
   *  and no subcards of its own. */
  readonly isUnfilled: (key: string) => boolean;
  /** `trigger.present?` — the act carries a trigger, so the empty
   *  subcards stay. */
  readonly hasTrigger: boolean;
  /** drop_subcard(key) (subcards/all.rb): the key leaves the collection.
   *  The port's director has no separate staged collection — the save
   *  input's map IS the staging area — so dropping the key is the port's
   *  `drop_subcard` plus `director.subdirectors.delete`. */
  readonly drop: (key: string) => void;
}

/** The trashed card holding a key (name_events.rb:61): the obstacle the
 *  rename_in_trash body looks for. */
export interface ModEventTrashedObstacle {
  readonly id: number;
}

/** The deps a set-module event body needs to run against the deck (the
 *  same pair the reference janitors take; see RenameSwapDeps). */
export interface ModEventContext {
  readonly driver: SQLDatabaseDriver;
  readonly lexicon: RenameSwapLexicon;
  /** The stage whose walk is running (bodies rarely branch on it; the
   *  attachment-style stage-sensitive bodies would). */
  readonly stage: ModEventStage;
  /** skip_event? (skip_and_trigger.rb:68-70): the act's full skip hash
   *  names this event (plain skip= or skip_event! alike). */
  readonly skipEvent: (name: string) => boolean;
  /** The request-param seam (ModEventSaveInput) — present only on save
   *  paths whose action engine carries one. */
  readonly saveInput?: ModEventSaveInput;
  /** The engine-cache pair the rename-referers staleness rides (the
   *  update_referer_content event): all.rb:15's Card[card_id] cache-through
   *  referers fetch, and the update_column staleness pin
   *  (FetchEngine#pinStaleCard). Present when the save runs on an engine
   *  whose FetchEngine the render path shares — absent in model-pure
   *  dispatches, whose referer reads stay raw row queries. */
  readonly fetchRefererCard?: (id: number) => Promise<CardRecord | undefined>;
  readonly pinStaleReferer?: (card: CardRecord) => void;
  /** The read engine, for a predicate that resolves a card shape the way
   *  Ruby does — `rule?` / `preference?` walk Card.fetch_type_id over the
   *  name's parts (card/lib/card/rule/all.rb:33-54), which the port's own
   *  isStandardRuleName / isPreferenceName do (actions/rule-content-walk.ts).
   *  Absent off a model-pure dispatch. */
  readonly fetch?: FetchEngine;
  /** The delete path's WRITE-ORDER seam for the delete_children body
   *  (trash.rb:46-59): the recursive child delete — `each_child { |child|
   *  child.include_set_modules; delete_as_subcard child }` — as the
   *  engine's own cascade (card-action-engine.ts deleteChildren).
   *
   *  Present ONLY in the dispatch the write order owns. The port's
   *  ActWriter creates the action row at write time, so the
   *  super_action linkage the Ruby body needs (history/events.rb:85-92)
   *  exists only AFTER the parent's own write — Ruby's validate-stage
   *  position is unreachable in the port. A stage-walk dispatch carries
   *  no seam, so the body is a no-op there. */
  readonly deleteChildren?: () => Promise<void>;
  /** The create path's WRITE-ORDER seam for the manage_trash body
   *  (trash.rb:23-27): `pull_from_trash!` — the trashed row with the same
   *  name, whose id the create reuses instead of a fresh INSERT.
   *
   *  Present ONLY in the dispatch the write order owns: the port's
   *  ensureSides runs before the lookup (the port's own documented
   *  divergence from Ruby's stage order), so the lookup belongs to the
   *  create path's own order, not to a stage walk. */
  readonly pullFromTrash?: () => Promise<void>;
  /** The logger seam (Ruby's Rails.logger). Present when the host composed
   *  one; absent on a host that has no logger, and a body that writes to it
   *  then does nothing. */
  readonly logger?: ModEventLogger;
  /** Card::Error.current — the error the report chain is reporting.
   *  Present ONLY in the report dispatch (the error-report chain), absent
   *  everywhere else: a stage walk has no error in flight. */
  readonly currentError?: ModEventCurrentError;
  /** `name.simple?` — the card's own name shape. Ruby's
   *  prepare_left_and_right body returns before it prepares anything when
   *  the name is simple (name_events.rb:68), because a simple name has no
   *  sides. The port's body reads it the same way. */
  readonly simpleName?: boolean;
  /** The write order's seam for ONE side of the prepare_left_and_right
   *  body (name_events.rb:67-73): Ruby's own prepare_side (:130-135) with
   *  its two arms — prepare_obstructed_side (:144-150, the side that names
   *  this card itself) and prepare_new_side (:137-142, the side that is new
   *  or whose Lexicon card is not real). The seam answers the side's final
   *  id, the way Ruby's `send "#{side}_id="` sets it.
   *
   *  Present ONLY in the dispatch the write order owns: the port resolves
   *  the sides before the row write, so the preparation cannot run at
   *  Ruby's store-stage position; the write order carries the body
   *  instead. A stage-walk dispatch carries no seam, so the body is a
   *  no-op there. */
  readonly prepareSide?: (side: "left" | "right") => Promise<number | null>;
  /** The save input's subcard collection (Ruby's card.subcards), for the
   *  walks whose save carried one. */
  readonly subcardCollection?: ModEventSubcardCollection;
  /** `Card.find_by_key_and_trash name.key, true` (name_events.rb:61): the
   *  trashed card holding the key a rename would take. Only simple names
   *  carry a stored key (compound cards' key columns are NULL), so the
   *  lookup answers nothing for a compound name — Ruby's own answer. */
  readonly findTrashedKeyObstacle?: (
    key: string,
  ) => Promise<ModEventTrashedObstacle | undefined>;
  /** rename_as_trash_obstacle (name_events.rb:83-87): the trashed obstacle
   *  gets `<name>*trash` and saves in the same act. */
  readonly renameAsTrashObstacle?: (obstacle: ModEventTrashedObstacle) => Promise<void>;
  /** Card::Codename.reset_cache (mod/core/set/all/codename.rb:10): the
   *  codename cache is dropped after a save that changed a codename. */
  readonly resetCodenameCache?: () => void;
  /** save_content_draft content (content.rb:8): the draft write — the
   *  writer's saveDraft (card-mod-history set/all/history.rb:88-94): this
   *  actor's earlier drafts of the card cleared, then a fresh act whose
   *  action carries draft=true and one db_content change.
   *
   *  Present ONLY in the dispatch the write order owns (the update path's
   *  draft arm): the draft save never reaches the ordinary row write, so
   *  a stage walk cannot carry the body. */
  readonly saveContentDraft?: (content: string | undefined) => Promise<void>;
  /** abort :success (result.rb:19-28): the draft save's abort, which ends
   *  the save with the draft's own result and no cards row. The port's
   *  abort IS the return (the draft arm ends the save with the draft
   *  result once the body has run), so the engine's seam carries no work
   *  of its own — it exists so the body's call is the pinned shape
   *  (content.rb:9) and observable to the parity pins. */
  readonly abortSuccess?: () => void;
  /** The autoname rule card (mod/core/set/all/autoname.rb:4): the rule the
   *  deck names a blank-named card from.
   *
   *  Present ONLY in the dispatch the create path owns (the naming site):
   *  the port names the card before its validation walk (Ruby names it at
   *  :prepare_to_store, after validation), so a stage walk cannot reach
   *  it. */
  readonly autonameRule?: () => Promise<ModEventAutonameRule | undefined>;
  /** `autoname rule(:autoname)` (lib/card/name/all.rb:39-45): the first
   *  name the rule's content does not collide with. */
  readonly autonameName?: (seed: string) => Promise<string>;
  /** `self.name =` — the card's name assignment. */
  readonly setCardName?: (name: string) => void;
  /** `autoname_card.update_column :db_content, name` — the rule card's
   *  content becomes the name the card took, so the next create continues
   *  from there. */
  readonly updateAutonameRuleContent?: (name: string) => Promise<void>;
  /** `autoname_card.expire` — the rule card's cache entry is dropped. */
  readonly expireAutonameRule?: () => void;
  /** `prepare_db_content` (content.rb:44-49): the content the row stores
   *  - the standard content, cleaned when the card's clean_html? is true.
   *
   *  Present ONLY in the dispatch the store path owns (the content
   *  preparation): the port prepares the content BEFORE the row write, so
   *  a stage walk that follows the write could not carry the body. */
  readonly prepareDbContent?: (content: string) => Promise<string>;
  /** `self.content =` — the card's content assignment. */
  readonly setContent?: (content: string) => void;
  /** `clear_drafts` (lib/card/content/all.rb:38-40): the acting user's
   *  draft actions for this card go away.
   *
   *  The seam carries no work of its own: the port's writer clears the
   *  actor's drafts for the card inside the SAME batch as the write
   *  (write-path.ts pushClearOwnDrafts), so the clear stays inside the
   *  save's transaction the way Ruby's :store-stage clear does. The seam
   *  exists so the body's call is the pinned shape (content.rb:3) and
   *  observable to the parity pins. */
  readonly clearDrafts?: () => void;
  /** `default_content` (content.rb:27-29): the type's template content -
   *  `template&.db_content`, undefined when the type has no template.
   *
   *  Present ONLY in the dispatch the create path owns (the template
   *  read): the port reads the template before its validation walk, so a
   *  stage walk that follows it cannot carry the body. */
  readonly defaultContent?: () => Promise<string | undefined>;
  /** `self.db_content =` — the card's stored content assignment. */
  readonly setDbContent?: (content: string) => void;
}

/** The autoname rule card (mod/core/set/all/autoname.rb:4). */
export interface ModEventAutonameRule {
  /** The rule card's id (the row the content update writes). */
  readonly id: number;
  /** The rule card's content (the seed name the deck names from). */
  readonly content: string;
}

/** Named `when:` predicates the runtime can resolve (Ruby's Symbol case of
 *  when_condition_applies?, all.rb:80-81 — `send block`). Mods export their
 *  own tables; the composition merges them into the runtime. The second
 *  argument carries the stage context (the comment mod's `when: :comment`
 *  reads its save input); existing single-argument predicates stay
 *  assignable.
 *
 *  A predicate may be async: Ruby's `send` is an ordinary method call and
 *  several of these read the deck (rule/all.rb:33-45 resolves the rule
 *  shape through Card.fetch_type_id), so the port awaits the result. */
export type ModEventPredicateTable = Readonly<
  Record<string, (card: ModEventCard, ctx?: ModEventContext) => boolean | Promise<boolean>>
>;

export type ModEventSkipReason =
  | "on-action"
  | "changed"
  | "skip"
  | "force-skip"
  | "trigger"
  | "when-false"
  | "set-not-applicable"
  | "parent-skipped";

/** What one stage walk did — the dispatcher's observable surface (tests and
 *  hosts pin behavior against it instead of instrumenting bodies). */
export interface ModEventStageReport {
  readonly stage: ModEventStage;
  /** Names whose bodies ran (awaited), in walk order. */
  readonly fired: readonly string[];
  /** Names filtered out, each with the Ruby condition that excluded it. */
  readonly skipped: ReadonlyArray<{ event: string; reason: ModEventSkipReason }>;
  /** Integration-stage failures (rescued, walk continued). */
  readonly failed: ReadonlyArray<{ event: string; error: unknown }>;
}

/** The save-path composition the engine takes in its modEvents option: the
 *  registry to walk, the deck deps bodies get, and the act-level skip/
 *  trigger state (Ruby's skip=/skip_event!/trigger= accessors live on the
 *  act card, skip_and_trigger.rb:17-35). */
export interface ModEventRuntime {
  readonly registry: ModEventRegistry;
  /** Named when: predicates (see ModEventPredicateTable). */
  readonly predicates?: ModEventPredicateTable;
  /** Set membership for scoped (non-"all/") set paths. Absent -> scoped
   *  events are skipped "set-not-applicable". */
  readonly setMember?: (setPath: string, card: ModEventCard) => boolean | Promise<boolean>;
  /** skip= / skip_in_action= names (hash value true). */
  readonly skip?: readonly string[];
  /** skip_event! / skip_event_in_action! names (hash value :force). */
  readonly forceSkip?: readonly string[];
  /** trigger= / trigger_in_action= names. */
  readonly trigger?: readonly string[];
  /** The composition's engine host (ModEventFn's second argument). When a
   *  body needs the host and none was composed, the call fails loudly. */
  readonly host?: unknown;
  /** The event names the WRITE ORDER dispatches, not a stage walk
   *  (delete_children — trash.rb:46-59: the port's ActWriter creates the
   *  action row at write time, so the super_action linkage the Ruby body
   *  needs exists only after the parent's own write; the delete path's
   *  write order carries the body instead). A stage walk skips these
   *  names, so the body runs exactly once. */
  readonly writeOrderOwned?: readonly string[];
  /** The host's logger seam, forwarded into every dispatch's ctx (Ruby's
   *  Rails.logger; the event machinery writes one debug line per event
   *  call, card-1.110.0 lib/card/set/event.rb:170-173). */
  readonly logger?: ModEventLogger;
  /** Every stage report, as it happened. */
  readonly onReport?: (report: ModEventStageReport) => void;
}

// ---------------------------------------------------------------------------
// condition algebra (each gate cites its Ruby line)
// ---------------------------------------------------------------------------

/** on_condition_applies? (all.rb:32-35) + the :save expansion (options.rb:70). */
function onConditionApplies(
  declared: readonly string[] | undefined,
  action: "create" | "update" | "delete",
): boolean {
  const actions = (declared ?? []).flatMap((t) =>
    t === "save" ? ["create", "update"] : [t],
  );
  return actions.length === 0 || actions.includes(action);
}

/** Card::Dirty's alias map (dirty.rb:11-13): what `changed:`/`changing:`
 *  names may call the canonical column. */
const DIRTY_ALIASES: Readonly<Record<string, string>> = {
  type: "type_id",
  content: "db_content",
};

/** changed_condition_applies? (all.rb:69-77) + the changing alias (:77). */
function changedConditionApplies(
  declared: readonly string[] | undefined,
  card: ModEventCard,
): boolean {
  if (card.act?.action !== "update") return true;
  const columns = (declared ?? []).map((n) => DIRTY_ALIASES[n] ?? n);
  if (columns.length === 0) return true;
  const changing = new Set(card.changedFields ?? []);
  return columns.some((c) => changing.has(c));
}

/** skip_condition_applies? (skip_and_trigger.rb:80-84): "applies always
 *  means event can run". Plain skip= entries (true) only stop events that
 *  declared skip: "allowed"; skip_event! entries (:force) stop anything. */
function skipConditionApplies(event: RegisteredModEvent, runtime: ModEventRuntime): boolean {
  const plain = runtime.skip?.includes(event.event) ?? false;
  const forced = runtime.forceSkip?.includes(event.event) ?? false;
  if (!plain && !forced) return true;
  const allowed = event.skip === "allowed";
  // allowed ? val.blank? : (val != :force) — true/(:force) are never blank,
  // so an allowed event is skipped by either entry; a non-allowed event
  // only by :force.
  return allowed ? false : !forced;
}

/** trigger_condition_applies? (skip_and_trigger.rb:86-90). */
function triggerConditionApplies(event: RegisteredModEvent, runtime: ModEventRuntime): boolean {
  if (event.trigger !== "required") return true;
  return runtime.trigger?.includes(event.event) ?? false;
}

/** when_condition_applies? (all.rb:79-85), the Symbol case: `send block`,
 *  i.e. the predicate is a card method defined in the SAME set module as the
 *  event. Ruby has no "predicate not found" branch - an unresolvable name
 *  is a NoMethodError that kills the save, and that is exactly what this
 *  raises: a declaration whose predicate the runtime cannot resolve is a
 *  port gap, never a reason to silently drop the event. */
async function whenConditionApplies(
  event: RegisteredModEvent,
  runtime: ModEventRuntime,
  card: ModEventCard,
  ctx?: ModEventContext,
): Promise<{ ok: boolean; reason?: ModEventSkipReason }> {
  if (event.when === undefined) return { ok: true };
  const predicate = runtime.predicates?.[event.when];
  if (predicate === undefined) {
    throw new Error(
      `NoMethodError: unresolvable \`when: ${event.when}\` on event '${event.event}' ` +
        `(set '${event.setPath}', mod '${event.modName}') - Ruby's when_condition_applies? ` +
        `sends the predicate as a card method (set/event/all.rb:82) and raises when the ` +
        `set module defines no such method. Add the predicate to this runtime's table.`,
    );
  }
  return (await predicate(card, ctx)) ? { ok: true } : { ok: false, reason: "when-false" };
}

/** set_condition_applies? (all.rb:26-29): "all/"-pattern set modules are
 *  included on every card; anything scoped consults the runtime resolver.
 *  The built-in fallback resolves two patterns before giving up:
 *  - the SELF sets ("self/<codename>": the card IS the anchor card —
 *    lib/card/set/self.rb; the set file set/self/admin.rb defines
 *    Self::Admin, whose set card "*admin+*self" applies to the one card
 *    whose key is the anchor's, "*admin". Keys keep the star, so a plain
 *    "admin" card does not match). set/self/admin.rb's :admin_tasks is the
 *    live entry.
 *  - the TYPE-scoped sets ("type/<codename>": the card's type carries the
 *    codename — set/type/number.rb's :validate_number and set/type/json.rb
 *    :validate_json are the registry's type-scoped entries);
 *  a runtime that supplies its own setMember keeps precedence. Without one
 *  of the two, a scoped event is set-not-applicable — the silent skip that
 *  left the port creating Number cards Ruby refuses. */
async function setConditionApplies(
  event: RegisteredModEvent,
  runtime: ModEventRuntime,
  card: ModEventCard,
  ctx: ModEventContext | undefined,
): Promise<boolean> {
  if (event.setPath.startsWith("all/")) return true;
  const supplied = runtime.setMember?.(event.setPath, card);
  if (supplied !== undefined) return supplied;
  const selfMatch = /^self\/(.+)$/.exec(event.setPath);
  if (selfMatch !== null) {
    if (card.key !== undefined) return card.key === `*${selfMatch[1]}`;
    // no key on the snapshot: compose it from the name (Card#key,
    // lib/card/name, the star kept). A nameless card matches nothing.
    return card.name !== "" ? DeckoName.parse(card.name).key === `*${selfMatch[1]}` : false;
  }
  // The RIGHT sets ("right/<codename>"): the card's right card carries the
  // codename (lib/card/set/right.rb; the anchor card is "*<codename>" and
  // keys keep the star, so the lookup is by the starred key).
  const rightMatch = /^right\/(.+)$/.exec(event.setPath);
  if (rightMatch !== null && ctx !== undefined) {
    const right = DeckoName.parse(card.name).rightName;
    if (right === undefined) return false;
    const row = await ctx.driver
      .query<{ codename: string | null }>(
        "SELECT codename FROM cards WHERE key = ? AND trash = 0",
        [DeckoName.parse(right).key],
      )
      .then((r) => r.rows[0])
      .catch(() => undefined);
    return row?.codename === rightMatch[1];
  }
  const typeMatch = /^type\/(.+)$/.exec(event.setPath);
  if (typeMatch === null || ctx === undefined) return false;
  // The set modules attached at this stage ride the PATTERN type when the
  // walk supplies one (Ruby validates a type-changing save with the stored
  // type's modules still attached — see ModEventCard.patternTypeId); the
  // card's assigned type is the fallback.
  const memberTypeId = card.patternTypeId !== undefined ? card.patternTypeId : card.typeId;
  if (memberTypeId === undefined || memberTypeId === null) return false;
  const codenameRow = await ctx.driver
    .query<{ id: number }>("SELECT id FROM cards WHERE codename = ? AND trash = 0", [typeMatch[1]])
    .then((r) => r.rows[0])
    .catch(() => undefined);
  return codenameRow !== undefined && memberTypeId === codenameRow.id;
}

// ---------------------------------------------------------------------------
// the stage walk
// ---------------------------------------------------------------------------

/** The walk's candidates: events declared at this stage, plus events with
 *  no stage of their own whose before:/after: chain roots in this stage
 *  (options.rb:76 keeps @stage nil for before:-/after:-registered events —
 *  "after, before, or around will override stage configuration"). */
function stageCandidates(registry: ModEventRegistry, stage: ModEventStage): RegisteredModEvent[] {
  const all = registry.all();
  const byName = new Map<string, RegisteredModEvent[]>();
  for (const event of all) byName.set(event.event, [...(byName.get(event.event) ?? []), event]);
  // Card defines these non-stage callback chains (card-1.110.0/lib/card.rb:181).
  // They are valid roots, but are driven by page/revision/act entry points.
  const external = new Set(["select_action", "show_page", "act"]);
  const relativeTo = (event: RegisteredModEvent): string | undefined =>
    event.after ?? event.before;
  const rootsInStage = (event: RegisteredModEvent): boolean => {
    // Iterative traversal validates every definition, including branches
    // outside the requested stage, without recursive graph expansion.
    const pending = [{ entry: event, path: [event.event] }];
    let matches = false;
    while (pending.length) {
      const { entry, path } = pending.pop()!;
      const next = relativeTo(entry);
      if (next === undefined) { matches ||= entry.at === stage; continue; }
      if (path.includes(next)) throw new Error(`Invalid event callback cycle: ${[...path, next].join(" -> ")}`);
      const targets = byName.get(next);
      if (targets === undefined) {
        if (!external.has(next)) throw new Error(`Invalid event callback target '${next}' for '${entry.event}' (${entry.setPath})`);
        continue;
      }
      for (const target of targets) pending.push({ entry: target, path: [...path, next] });
    }
    return matches;
  };
  return all.filter(rootsInStage);
}

/** A host stand-in whose every member throws LOUDLY when a body reaches for
 *  a host the composition never supplied (never a silent no-op). */
const HOST_REQUIRED: unknown = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "this event body requires the composition's engine host (ModEventRuntime.host)",
      );
    },
  },
);

/** Run one director stage's events for one card save. `deps` carries the
 *  driver/Lexicon pair the reference janitors take, plus (when the save
 *  runs on an engine whose FetchEngine the render path shares) the
 *  referer-cache pair the update_referer_content staleness rides —
 *  forwarded into the ctx so the mod body's rewrite warms and pins exactly
 *  like the built-in call (all.rb:15 + FetchEngine#pinStaleCard).
 *  Integration-stage failures are rescued into the report (card.rb:163-171);
 *  other stages propagate the first error and abandon the walk. */
export async function runModEventStage(
  runtime: ModEventRuntime,
  stage: ModEventStage,
  card: ModEventCard,
  deps: {
    driver: SQLDatabaseDriver;
    lexicon: RenameSwapLexicon;
    fetchRefererCard?: (id: number) => Promise<CardRecord | undefined>;
    pinStaleReferer?: (card: CardRecord) => void;
    fetch?: FetchEngine;
    subcardCollection?: ModEventSubcardCollection;
  },
  saveInput?: ModEventSaveInput,
): Promise<ModEventStageReport> {
  // The events the WRITE ORDER dispatches are not a stage walk's to run:
  // delete_children (trash.rb:46-59) hangs off validate_delete in Ruby,
  // but the port's ActWriter creates the action row at write time, so the
  // super_action linkage the Ruby body needs exists only after the
  // parent's own write — the delete path's write order carries the body
  // (card-action-engine.ts runDeleteChildrenBody). Skipping the name here
  // keeps the body running exactly once.
  const writeOrderOwned = new Set(runtime.writeOrderOwned ?? []);
  const stageEntries = stageCandidates(runtime.registry, stage).filter(
    (entry) => !writeOrderOwned.has(entry.event),
  );
  const fired: string[] = [];
  const skipped: Array<{ event: string; reason: ModEventSkipReason }> = [];
  const failed: Array<{ event: string; error: unknown }> = [];
  const ctx: ModEventContext = {
    driver: deps.driver,
    lexicon: deps.lexicon,
    ...(deps.fetchRefererCard !== undefined ? { fetchRefererCard: deps.fetchRefererCard } : {}),
    ...(deps.pinStaleReferer !== undefined ? { pinStaleReferer: deps.pinStaleReferer } : {}),
    ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
    ...(deps.subcardCollection !== undefined ? { subcardCollection: deps.subcardCollection } : {}),
    ...(runtime.logger !== undefined ? { logger: runtime.logger } : {}),
    stage,
    skipEvent: (name) =>
      runtime.skip?.includes(name) === true || runtime.forceSkip?.includes(name) === true,
    ...(saveInput !== undefined ? { saveInput } : {}),
  };
  // Distinct set modules may define the same method. Resolve disjoint set
  // membership before attaching callbacks; never attach one callback to
  // several applicable definitions and invent a Ruby module precedence.
  const selected = new Map<string, RegisteredModEvent>();
  for (const event of stageEntries) {
    if (selected.has(event.event)) continue;
    const definitions = stageEntries.filter(entry => entry.event === event.event);
    if (definitions.length === 1) { selected.set(event.event, event); continue; }
    const applicable: RegisteredModEvent[] = [];
    for (const definition of definitions) {
      if (await setConditionApplies(definition, runtime, card, ctx)) applicable.push(definition);
    }
    if (applicable.length > 1) throw new Error(`Ambiguous event callback method '${event.event}': multiple applicable definitions (${applicable.map(entry => entry.setPath).join(", ")}); Ruby module precedence is not established`);
    selected.set(event.event, applicable[0] ?? event);
  }
  const candidates = stageEntries.filter(event => selected.get(event.event) === event);
  // Ruby attaches these to the target's own callback chain, inside its
  // applicability gate. With prepend:true, before runs newest first and
  // after runs oldest first (Event::Callbacks, callbacks.rb:14-19).
  const children = (event: RegisteredModEvent, kind: "before" | "after") =>
    candidates.filter(child => child[kind] === event.event);
  const skipCallbacks = (event: RegisteredModEvent): void => {
    for (const child of [...children(event, "before").reverse(), ...children(event, "after")]) {
      skipped.push({ event: child.event, reason: "parent-skipped" });
      skipCallbacks(child);
    }
  };
  const active = new Set<RegisteredModEvent>();
  const runEvent = async (event: RegisteredModEvent): Promise<void> => {
    if (active.has(event)) throw new Error(`Invalid event callback recursion at '${event.event}'`);
    if (!onConditionApplies(event.on, card.act?.action ?? "update")) {
      skipped.push({ event: event.event, reason: "on-action" });
      skipCallbacks(event);
      return;
    }
    if (!changedConditionApplies(event.changed ?? event.changing, card)) {
      skipped.push({ event: event.event, reason: "changed" });
      skipCallbacks(event);
      return;
    }
    if (!skipConditionApplies(event, runtime)) {
      skipped.push({
        event: event.event,
        reason: runtime.forceSkip?.includes(event.event) ? "force-skip" : "skip",
      });
      skipCallbacks(event);
      return;
    }
    if (!triggerConditionApplies(event, runtime)) {
      skipped.push({ event: event.event, reason: "trigger" });
      skipCallbacks(event);
      return;
    }
    if (!(await setConditionApplies(event, runtime, card, ctx))) {
      skipped.push({ event: event.event, reason: "set-not-applicable" });
      skipCallbacks(event);
      return;
    }
    const when = await whenConditionApplies(event, runtime, card, ctx);
    if (!when.ok) {
      skipped.push({ event: event.event, reason: when.reason ?? "when-false" });
      skipCallbacks(event);
      return;
    }
    try {
      active.add(event);
      for (const child of children(event, "before").reverse()) await runEvent(child);
      await event.fn(card, (runtime.host ?? HOST_REQUIRED) as Parameters<
        typeof event.fn
      >[1], ctx);
      fired.push(event.event);
      for (const child of children(event, "after")) await runEvent(child);
    } catch (error) {
      // Ruby wraps run_callbacks inside the target's integration rescue
      // (event.rb:147-157). A relative callback has no rescue of its own,
      // but its failure reaches the enclosing integration target.
      if (event.at?.includes("integrate") === true) {
        // rescuing_if_integration (card.rb:163-171): one failed integration
        // event must not harm others.
        failed.push({ event: event.event, error });
        return;
      }
      throw error;
    } finally {
      active.delete(event);
    }
  };
  for (const event of candidates) {
    if (event.before === undefined && event.after === undefined) await runEvent(event);
  }
  const report: ModEventStageReport = { stage, fired, skipped, failed };
  runtime.onReport?.(report);
  return report;
}
