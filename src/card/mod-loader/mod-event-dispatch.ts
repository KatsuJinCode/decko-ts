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
  | "set-not-applicable";

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
  readonly setMember?: (setPath: string, card: ModEventCard) => boolean;
  /** skip= / skip_in_action= names (hash value true). */
  readonly skip?: readonly string[];
  /** skip_event! / skip_event_in_action! names (hash value :force). */
  readonly forceSkip?: readonly string[];
  /** trigger= / trigger_in_action= names. */
  readonly trigger?: readonly string[];
  /** The composition's engine host (ModEventFn's second argument). When a
   *  body needs the host and none was composed, the call fails loudly. */
  readonly host?: unknown;
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
 *  The built-in fallback resolves the TYPE-scoped sets ("type/<codename>":
 *  the card's type carries the codename — set/type/number.rb's
 *  :validate_number and set/type/json.rb :validate_json are the registry's
 *  type-scoped entries); a runtime that supplies its own setMember keeps
 *  precedence. Without one of the two, a scoped event is
 *  set-not-applicable — the silent skip that left the port creating Number
 *  cards Ruby refuses. */
async function setConditionApplies(
  event: RegisteredModEvent,
  runtime: ModEventRuntime,
  card: ModEventCard,
  ctx: ModEventContext | undefined,
): Promise<boolean> {
  if (event.setPath.startsWith("all/")) return true;
  const supplied = runtime.setMember?.(event.setPath, card);
  if (supplied !== undefined) return supplied;
  const typeMatch = /^type\/(.+)$/.exec(event.setPath);
  if (typeMatch === null || ctx === undefined || card.typeId === undefined) return false;
  const codenameRow = await ctx.driver
    .query<{ id: number }>("SELECT id FROM cards WHERE codename = ? AND trash = 0", [typeMatch[1]])
    .then((r) => r.rows[0])
    .catch(() => undefined);
  return codenameRow !== undefined && card.typeId === codenameRow.id;
}

// ---------------------------------------------------------------------------
// the stage walk
// ---------------------------------------------------------------------------

/** The walk's candidates: events declared at this stage, plus events with
 *  no stage of their own whose before:/after: chain roots in this stage
 *  (options.rb:76 keeps @stage nil for before:-/after:-registered events —
 *  "after, before, or around will override stage configuration"). */
function stageCandidates(registry: ModEventRegistry, stage: ModEventStage): RegisteredModEvent[] {
  const direct = registry.forStage(stage);
  if (direct.length === 0) return [];
  const byName = new Map(registry.all().map((e) => [e.event, e]));
  const directNames = new Set(direct.map((e) => e.event));
  const relativeTo = (event: RegisteredModEvent): string | undefined =>
    event.after ?? event.before;
  const rootsInStage = (event: RegisteredModEvent): boolean => {
    const seen = new Set<string>([event.event]);
    let cursor: RegisteredModEvent | undefined = event;
    while (cursor !== undefined) {
      const next = relativeTo(cursor);
      if (next === undefined) break;
      if (seen.has(next)) return false; // before/after cycle: not runnable
      seen.add(next);
      cursor = byName.get(next);
      if (cursor === undefined) return false; // target never registered
    }
    return cursor !== undefined && directNames.has(cursor.event);
  };
  const inherited = registry
    .all()
    .filter((e) => e.at === undefined && relativeTo(e) !== undefined && rootsInStage(e));
  return [...direct, ...inherited];
}

/** Walk order: registration order (= Ruby's definition/load order), with the
 *  relative-ordering entries pinned IMMEDIATELY next to the target they name
 *  — an `after:` entry directly behind it, a `before:` entry directly in
 *  front of it (the documented contract, mod-manifest.ts:209-212 plus the
 *  `before:` twin).
 *
 *  Ruby gets this from ActiveSupport callback chains: every stage event
 *  becomes an `:after` callback on `"#{stage}_stage"` (options.rb:83-86) and
 *  every `before:`/`after:` event becomes one on the named event's OWN
 *  callback chain (`set_callback object_method, kind, event.name, prepend:
 *  true`, callbacks.rb:17-18), all prepended so that the `:after` chain
 *  unwinds in registration order. An `after:`/stage entry therefore runs
 *  immediately after its target's body and BEFORE the next stage event —
 *  not merely somewhere later in the list. The port reproduces that
 *  adjacency as a fixed-point reorder over the candidate list. */
function orderCandidates(candidates: RegisteredModEvent[]): RegisteredModEvent[] {
  const list = [...candidates];
  const names = new Set(list.map((e) => e.event));
  /** The entry's relation to its target, or undefined when it is a plain
   *  stage event (or names a target that is not a candidate here). */
  const relationOf = (event: RegisteredModEvent): { target: string; offset: 0 | 1 } | undefined => {
    if (event.before !== undefined && names.has(event.before)) {
      return { target: event.before, offset: 0 };
    }
    if (event.after !== undefined && names.has(event.after)) {
      return { target: event.after, offset: 1 };
    }
    return undefined;
  };
  const order = (): string => list.map((e) => e.event).join(",");
  // A before: entry registered after its target, or an after: entry
  // registered before it, both need moving; repeating converges an entry
  // whose target is itself relative-ordered, since the target's own move
  // carries its dependants along in a later pass.
  for (let pass = 0; pass <= list.length; pass++) {
    let changed = false;
    for (const event of list) {
      const relation = relationOf(event);
      if (relation === undefined) continue;
      const targetIndex = list.findIndex((e) => e.event === relation.target);
      const ownIndex = list.indexOf(event);
      if (ownIndex === targetIndex + relation.offset) continue;
      const before = order();
      list.splice(ownIndex, 1);
      // Removing at ownIndex shifts every later index down by one, so an
      // insertion point past the removal lands one slot earlier.
      const insertAt = ownIndex < targetIndex + relation.offset ? targetIndex + relation.offset - 1 : targetIndex + relation.offset;
      list.splice(insertAt, 0, event);
      // A move that leaves the sequence identical (the entry is already
      // adjacent, and the offsets disagreed only because of it) is not a
      // move - otherwise the loop would never settle.
      if (order() !== before) changed = true;
    }
    if (!changed) break;
  }
  return list;
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
  },
  saveInput?: ModEventSaveInput,
): Promise<ModEventStageReport> {
  const candidates = orderCandidates(stageCandidates(runtime.registry, stage));
  const fired: string[] = [];
  const skipped: Array<{ event: string; reason: ModEventSkipReason }> = [];
  const failed: Array<{ event: string; error: unknown }> = [];
  const ctx: ModEventContext = {
    driver: deps.driver,
    lexicon: deps.lexicon,
    ...(deps.fetchRefererCard !== undefined ? { fetchRefererCard: deps.fetchRefererCard } : {}),
    ...(deps.pinStaleReferer !== undefined ? { pinStaleReferer: deps.pinStaleReferer } : {}),
    ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
    stage,
    skipEvent: (name) =>
      runtime.skip?.includes(name) === true || runtime.forceSkip?.includes(name) === true,
    ...(saveInput !== undefined ? { saveInput } : {}),
  };
  for (const event of candidates) {
    if (!onConditionApplies(event.on, card.act?.action ?? "update")) {
      skipped.push({ event: event.event, reason: "on-action" });
      continue;
    }
    if (!changedConditionApplies(event.changed ?? event.changing, card)) {
      skipped.push({ event: event.event, reason: "changed" });
      continue;
    }
    if (!skipConditionApplies(event, runtime)) {
      skipped.push({
        event: event.event,
        reason: runtime.forceSkip?.includes(event.event) ? "force-skip" : "skip",
      });
      continue;
    }
    if (!triggerConditionApplies(event, runtime)) {
      skipped.push({ event: event.event, reason: "trigger" });
      continue;
    }
    if (!(await setConditionApplies(event, runtime, card, ctx))) {
      skipped.push({ event: event.event, reason: "set-not-applicable" });
      continue;
    }
    const when = await whenConditionApplies(event, runtime, card, ctx);
    if (!when.ok) {
      skipped.push({ event: event.event, reason: when.reason ?? "when-false" });
      continue;
    }
    try {
      await event.fn(card, (runtime.host ?? HOST_REQUIRED) as Parameters<
        typeof event.fn
      >[1], ctx);
      fired.push(event.event);
    } catch (error) {
      // rescuing_if_integration (event.rb:148-152, card.rb:163-171): the
      // rescue is decided when the method is DEFINED, from the event's OWN
      // @stage - which options.rb:76 leaves nil for a before:/after:/around:
      // event. So a relative-ordering event is never integration-rescued,
      // even when it inherits an integrate stage at dispatch.
      if (event.at?.includes("integrate") === true) {
        // rescuing_if_integration (card.rb:163-171): one failed integration
        // event must not harm others.
        failed.push({ event: event.event, error });
        continue;
      }
      throw error;
    }
  }
  const report: ModEventStageReport = { stage, fired, skipped, failed };
  runtime.onReport?.(report);
  return report;
}
