// The non-read view tasks: ok_to_update? / ok_to_create? / ok_to_delete?
// as the view-permission gate needs them (ok_to_read? lives in
// read-rules.ts — the READ rule algebra is a different mechanism).
//
// Ruby mechanism (card-mod-permissions set/all/permissions.rb):
// - Card#ok? (:35-45): memoizes `send "ok_to_#{action}?"` per actor.
// - ok_to_update? (:148-153): `return false unless permit(:update);
//   return true unless type_id_changed? && !permitted?(:create)`. The
//   type-change clause is a WRITE-path invariant — during a render no
//   type is ever assigned, so ok_to_update? == permit(:update) here.
// - ok_to_create? (:120-126): `permit(:create)` then, for junctions
//   (`simple?` cards return early), ok_to_create_side (:127-137) per
//   side: `return true if side == :left && superleft` (a render has no
//   supercard, so both sides are checked), then the side part card —
//   allowed when it EXISTS (`part_card&.new_card?` false), otherwise
//   denied when the virtual new part fails its own ok?(:create).
// - ok_to_delete? (:155-157): `permit :delete`.
// - A RENAME'S created sides: check_permissions (:22-26) is a :validate
//   event and runs ok? on EVERY card of a save act — the renamed card
//   gets ok?(:update) (action_for_permission_check :197-199), but a
//   rename onto a compound name also CREATES its missing sides in the
//   same act (prepare_left_and_right, mod/core/set/all/name_events.rb
//   :67-72 -> prepare_new_side :137-142 adds each missing side as a
//   subcard; subcards validate through the same director walk,
//   lib/card/director/all.rb:67-69), and a new sidecard's action IS
//   :create — so each created side is judged ok?(:create), the FULL
//   junction walk (permit(:create) under the template-resolved type +
//   ok_to_create_side). A rename that would create a side the actor
//   cannot create aborts whole. Sides that already exist are created by
//   nobody and checked by nobody (prepare_new_side's `!Card[side_id]&.real?`
//   early-return) — the walk gates exactly what the act creates.
// - permit (:113-124) -> permitted? (:105-110):
//   `Auth.as_card.among? who_can(action)` (the always_ok?/read_only
//   short-circuits bracket it; read_only is a deck config the port does
//   not model).
// - who_can (:47-49): `permission_rule_card(action).item_cards.map(&:id)`
//   — the item ids of the rule card the card's *update/*create/*delete
//   setting resolves to (permission_rule_id :55-61, the same
//   set-precedence walk the read side uses, with the setting name
//   swapped; item ids are the rule card's reference rows — the same
//   durable reference-graph source read_rule_cache joins, see
//   read-rules.ts's id_list.rb citation).
// - among? (card-mod-account set/abstract/account_holder.rb:31-36):
//   `ok_ids.any? { |ok_id| ok_id == AnyoneID || parties.member?(ok_id) }`
//   — the rule's item ids against the ACTOR's parties
//   (account_holder.rb:26-28 parties = all_enabled_roles << id; the
//   port's ReadPermissionState.parties already carries exactly that).
//
// Query shape: the party join for all three settings is ONE statement
// (issued as its own driver.batch — once per engine, on the first render
// that actually demands a non-read task; read/none-only surfaces never
// pay it). Per-card verdicts resolve the candidate rule names with the
// SAME composed-key closure the read fallback uses — one query per card
// for ALL tasks at once (allTaskVerdictsForCard), memoized by the
// engine's verdict map, so warm renders stay zero-query (the
// ensureVerdicts model in src/card/render.ts).

import type { SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { resolveTypeId } from "../actions/type-resolution.js";
import { CardActionError } from "../actions/types.js";
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { CodenameNotFoundError, NameNotFoundError } from "../name/errors.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import type { ReadPermissionState } from "./read-rules.js";
import { resolveRuleIdsByRuleKeys } from "./read-rules.js";
import type { CrudTask } from "./view-perms.js";

/** The tasks the view gate checks beyond read (permission.rb:11 CRUD). */
export type WriteTask = Exclude<CrudTask, "read">;

const WRITE_TASK_CODENAMES: readonly WriteTask[] = ["update", "create", "delete"];

/** Setting card codenames per task — the right side of a permission rule
 *  ("Basic+*type+*update" hangs off the *update setting card; its codename
 *  is "update" per the codename bootstrapping read-rules.ts cites). */
const TASK_SETTING_NAME: Record<CrudTask, string> = {
  read: "*read",
  create: "*create",
  update: "*update",
  delete: "*delete",
};

/** permissions.rb:56's rule-value test — `rule(action)
 *  .match?(/^\[?\[?_left\]?\]?$/)`: the bare, [_left], or [[_left]] spellings
 *  of the inherit-from-left rule value, nothing else. */
const LEFT_RULE_VALUE = /^\[?\[?_left\]?\]?$/;

/**
 * The who_can universe for the write tasks (permissions.rb:47-49) — every
 * live *update/*create/*delete rule card joined to its item references,
 * LEFT JOINED so EMPTY rules resolve too (Ruby denies on them:
 * who_can -> [] -> among? -> false; dropping the rows would mis-allow).
 * One statement, self-contained (scalar subqueries for the set-type
 * codename card, same shape as the read cache's statement in
 * read-rules.ts).
 */
export function viewTaskPermissionStatements(): SQLStatement[] {
  return [
    {
      sql:
        `SELECT rules.id AS ruleId, setting_cards.codename AS task, ` +
        `rules.db_content AS content, ` +
        `refs.referee_id AS partyId ` +
        `FROM cards rules ` +
        `JOIN cards setting_cards ON rules.right_id = setting_cards.id ` +
        `  AND setting_cards.codename IN ('update', 'create', 'delete') ` +
        `JOIN cards sets ON rules.left_id = sets.id ` +
        `LEFT JOIN card_references refs ON refs.referer_id = rules.id ` +
        `WHERE sets.type_id = ` +
        `  (SELECT id FROM cards WHERE codename = 'set' AND trash = 0 ORDER BY id LIMIT 1) ` +
        `AND rules.trash = 0 AND setting_cards.trash = 0 AND sets.trash = 0`,
      params: [],
    },
  ];
}

/** One parsed row of the who_can statement. */
interface TaskRuleRow {
  ruleId: number;
  task: string;
  content: string | null;
  partyId: number | null;
}

/**
 * The resolved write-task permission state for the engine's viewer — the
 * who_can maps plus the actor facts it inherits from the read state
 * (alwaysOk = Auth.always_ok?, viewerParties = Auth.as_card parties).
 *
 * hasTaskRules records whether the deck carries ANY rule cards for the
 * task; it no longer gates an allow. Ruby DENIES when the applicable rule
 * is missing or empty — permitted? -> who_can -> among? on [] -> false
 * (permissions.rb:100-118; account_holder.rb:31-37 any? on []), and a
 * rule id that does not resolve is "should not be possible" ->
 * PermissionDenied (permissions.rb:77-85). The port previously degraded
 * to undefined-allow here; that divergence is closed: deny-on-empty,
 * Ruby's fail-closed default.
 */
export interface ViewTaskState {
  readonly alwaysOk: boolean;
  readonly viewerParties: number[];
  readonly hasTaskRules: Record<WriteTask, boolean>;
  /** rule card id -> the party ids its content references (who_can's
   *  item ids; an empty set = an empty rule, which denies). */
  readonly ruleParties: Record<WriteTask, Map<number, Set<number>>>;
  /** rule card id -> the rule's stored content, trimmed (the _left
   *  inheritance detector reads it; permissions.rb:56 rule(action)
   *  .match?). Absent/empty for rules whose row the batch somehow missed
   *  -- those never inherit. */
  readonly ruleContent: Record<WriteTask, Map<number, string>>;
  /** The signed-in actor's id (ReadPermissionState#signedInActorId). */
  readonly signedInActorId?: number;
}

/** Parse the batch results (statements in viewTaskPermissionStatements
 *  order) against the engine's read state. */
export function viewTaskStateFromResults(
  results: SQLQueryResult[],
  readState: ReadPermissionState | undefined,
): ViewTaskState {
  const rows = (results[0]?.rows ?? []) as TaskRuleRow[];
  const ruleParties: Record<WriteTask, Map<number, Set<number>>> = {
    update: new Map(),
    create: new Map(),
    delete: new Map(),
  };
  const ruleContent: Record<WriteTask, Map<number, string>> = {
    update: new Map(),
    create: new Map(),
    delete: new Map(),
  };
  const hasTaskRules: Record<WriteTask, boolean> = {
    update: false,
    create: false,
    delete: false,
  };
  for (const row of rows) {
    if (!isWriteTask(row.task)) continue;
    const task = row.task;
    hasTaskRules[task] = true;
    if (!ruleContent[task].has(row.ruleId)) {
      ruleContent[task].set(row.ruleId, (row.content ?? "").trim());
    }
    let parties = ruleParties[task].get(row.ruleId);
    if (parties === undefined) {
      parties = new Set<number>();
      ruleParties[task].set(row.ruleId, parties);
    }
    if (row.partyId !== null && row.partyId !== undefined) parties.add(row.partyId);
  }
  return {
    alwaysOk: readState?.alwaysOk ?? false,
    viewerParties: readState?.parties ?? [],
    hasTaskRules,
    ruleParties,
    ruleContent,
    signedInActorId: readState?.signedInActorId,
  };
}

/**
 * card-mod-follow-0.20.0 set/right/follow.rb:27-54 — a follow preference
 * (`<set>+<user>+*follow`) overrides `permit` so that create, update and
 * delete are allowed when `allowed_to_change_follow_status?`: the viewer is
 * signed in and is the preference's rule_user (card-mod-rules
 * set/rstar/rule_user.rb: `preference? ? self[-2] : nil`). always_ok? is
 * answered before this. preference? (card-1.110.0 rule/all.rb:42-53): more
 * than two parts, the right side Setting-typed, everything but the last two
 * parts a Set-typed card, and the preferer (part -2) a User card or *all.
 * Answers true for the override, undefined to fall through to the rules.
 */
async function followPreferencePermit(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ViewTaskState,
): Promise<true | undefined> {
  const actorId = state.signedInActorId;
  if (actorId === undefined) return undefined;
  const name = card.name instanceof DeckoName ? card.name : DeckoName.parse(String(card.name));
  const parts = name.parts;
  if (parts.length <= 2) return undefined;
  // Right::Follow: the right part is the :follow codename card — compared by
  // key first (memoized lookups) so other cards cost no reads here.
  const followId = await fetcher.codenames.id("follow");
  if (followId === undefined) return undefined;
  const followName = await fetcher.lexicon.name(followId);
  if (followName === undefined || DeckoName.parse(parts[parts.length - 1]!).key !== followName.key) return undefined;
  const right = await fetcher.fetchById(followId);
  if (right === undefined) return undefined;
  const [settingTypeId, setTypeId, userTypeId] = await Promise.all([
    fetcher.codenames.id("setting"),
    fetcher.codenames.id("set"),
    fetcher.codenames.id("user"),
  ]);
  if (right.typeId !== settingTypeId) return undefined;
  const setName = DeckoName.parse(parts.slice(0, -2).join("+"));
  const set = await fetcher.fetchByName(setName.s);
  if (set === undefined || set.typeId !== setTypeId) return undefined;
  const preferer = await fetcher.fetchByName(parts[parts.length - 2]!);
  if (preferer === undefined || preferer.trash) return undefined;
  if (preferer.typeId !== userTypeId && preferer.codename !== "all") return undefined; // valid_preferer?
  return preferer.id === actorId ? true : undefined;
}

function isWriteTask(task: string): task is WriteTask {
  return (WRITE_TASK_CODENAMES as readonly string[]).includes(task);
}

/**
 * ok_to_<task>? for one card (format/error.rb:5-8 + permissions.rb
 * :105-157). Deny-by-default: a deck with no applicable rule card — or an
 * applicable rule with no parties — DENIES, exactly as Ruby's
 * who_can -> [] -> among? -> false (permissions.rb:47-49, :100-118;
 * account_holder.rb:31-37). The READ side keeps its own lookup contract
 * (read-rules.ts); only the write-task algebra is fail-closed.
 */
export async function taskVerdictForCard(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
  depth = 0,
): Promise<boolean | undefined> {
  if (state.alwaysOk) return true; // permitted? :108-109 (Auth.always_ok?)
  if ((await followPreferencePermit(fetcher, card, state)) === true) return true; // right/follow.rb permit
  // card-mod-session set/type/session.rb ok_to_create? / ok_to_update?.
  if (task !== "delete" && (await isSessionTyped(fetcher, card))) return true;
  const trunk = await permitVerdict(fetcher, card, task, state);
  if (trunk !== true) return trunk; // false (denied) or undefined (no rule data)
  if (task === "create") {
    return createSidesAllowed(fetcher, card, state, depth); // ok_to_create? :123-125
  }
  return true; // update: type_id_changed? is a write-path invariant (see module doc)
}

/**
 * All three non-read tasks for one card — one candidate-resolution query
 * total (the candidates of all three settings resolved in a single CTE
 * round trip, then picked per task in precedence order). This is what the
 * engine's prepare phase loops over its prepared cards (the
 * ensureVerdicts model), so the per-card cost lands once per card, never
 * per render.
 */
export async function allTaskVerdictsForCard(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ViewTaskState,
  depth = 0,
): Promise<Record<WriteTask, boolean | undefined>> {
  const out: Record<WriteTask, boolean | undefined> = {
    update: false, // deny-by-default: no applicable rule -> among?([]) -> false
    create: false,
    delete: false,
  };
  if (state.alwaysOk) {
    return { update: true, create: true, delete: true }; // permitted? :108-109
  }
  if ((await followPreferencePermit(fetcher, card, state)) === true) {
    return { update: true, create: true, delete: true }; // right/follow.rb permit
  }
  // card-mod-session set/type/session.rb: a Session card's ok_to_create? and
  // ok_to_update? are `true` for every viewer (session content is per
  // browser session, never a shared write). Delete keeps the rule walk.
  const session = await isSessionTyped(fetcher, card);
  if (session) {
    out.create = true;
    out.update = true;
  }
  const needed = WRITE_TASK_CODENAMES.filter(
    (task) => state.hasTaskRules[task] && !(session && task !== "delete"),
  );
  if (needed.length === 0) return out;
  for (const task of needed) {
    const resolved = await applicableRule(fetcher, card, task, state, depth);
    if (resolved === undefined) continue; // no applicable rule card -> deny (already false)
    // permissions.rb:148-153 update == permit(:update) at render time.
    if (task !== "create") {
      out[task] = amongParties(state, resolved.task, resolved.ruleId);
      continue;
    }
    if (!amongParties(state, resolved.task, resolved.ruleId)) {
      out.create = false; // ok_to_create? :121 permit(:create) failed
      continue;
    }
    out.create = await createSidesAllowed(fetcher, card, state, depth); // :123-125
  }
  return out;
}

/** Whether the card is typed by the Session cardtype (codename session). */
async function isSessionTyped(fetcher: FetchEngine, card: PatternCardInput): Promise<boolean> {
  if (card.typeId === undefined || card.typeId === null) return false;
  const sessionId = await fetcher.codenames.id("session");
  return sessionId !== undefined && card.typeId === sessionId;
}

/**
 * The save-time verdict — the WRITE path's ok? (the action engine's gate,
 * card-action-engine.ts assertCanWrite). ok_to_create? / ok_to_delete? are
 * exactly the render algebra (taskVerdictForCard). ok_to_update? gains the
 * clause the render never sees: the TYPE-CHANGE invariant
 * (permissions.rb:148-153 — `return false unless permit(:update);
 * return true unless type_id_changed? && !permitted?(:create)`) — a save
 * that changes the card's type additionally requires create permission on
 * the SAME card (permitted?, not the full ok_to_create? — no side walk).
 * The caller supplies typeChanged (the engine knows the would-be type from
 * the request; a render never does).
 *
 * Deny-by-default on missing rule data (taskVerdictForCard above): the
 * engine gate denies on `false`, and the render gate's
 * `taskAllowed(task) !== false` contract now hides edit affordances on
 * rule-less decks exactly as Ruby's ok_to_update? denial does.
 *
 * The rename clause (opts.assignedName): when the save assigns a name,
 * the update verdict additionally walks the sides that name will CREATE —
 * the act's new sidecards judged ok?(:create) in Ruby (see the module
 * doc's rename paragraph; name_events.rb:67-72/:137-150, permissions.rb
 * :22-26/:120-137). Walking an unchanged name is a no-op: an existing
 * card's sides exist, and existing sides are skipped — Ruby's
 * prepare_new_side only creates (and its validate stage only judges)
 * what is missing, so legitimate renames — including renames onto names
 * whose sides all exist — stay judged by permit(:update) alone.
 */
export async function saveTaskVerdictForCard(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
  opts: { typeChanged?: boolean; assignedName?: string } = {},
): Promise<boolean | undefined> {
  if (state.alwaysOk) return true; // permitted? :108-109 (Auth.always_ok?)
  if ((await followPreferencePermit(fetcher, card, state)) === true) return true; // right/follow.rb permit
  if (task !== "update") {
    return taskVerdictForCard(fetcher, card, task, state); // :120-126 / :155-157
  }
  const update = await permitVerdict(fetcher, card, "update", state); // permit(:update) :148
  if (update !== true) return update; // false = denied; undefined = unverifiable
  if (opts.typeChanged === true) {
    // :151 — permitted?(:create), same card
    const create = await permitVerdict(fetcher, card, "create", state);
    if (create !== true) return create;
  }
  if (opts.assignedName === undefined) return true; // no name spec: no sides are created
  return renameCreatedSidesVerdict(fetcher, card, opts.assignedName, state);
}

/**
 * The rename clause's walk — the sides of the ASSIGNED name that the
 * act will create, each judged exactly as the create path judges a
 * virtual side (ok_to_create? :120-137 on the act's new sidecard). The
 * card's own id matters for the OBSTRUCTED self-side: renaming a card
 * onto a name one of whose sides IS the card (Pod -> Crib+Pod) clears
 * and recreates that side in Ruby (prepare_obstructed_side,
 * name_events.rb:144-150), so it is create-checked like a missing side,
 * not skipped like a bystander. A simple assigned name creates no sides
 * (prepare_left_and_right's `return if name.simple?`, :68).
 */
async function renameCreatedSidesVerdict(
  fetcher: FetchEngine,
  card: PatternCardInput,
  assignedName: string,
  state: ViewTaskState,
): Promise<boolean | undefined> {
  const name = DeckoName.parse(assignedName);
  if (!name.isCompound) return true; // name_events.rb:68
  return createSidesAllowed(fetcher, { name }, state, 0, card.id ?? undefined);
}

/** permitted? (:105-110) — the applicable rule card's item ids against the
 *  actor's parties (among?, account_holder.rb:31-36). An applicable rule
 *  with NO item ids denies (who_can -> [] -> any? -> false). */
function amongParties(state: ViewTaskState, task: WriteTask, ruleId: number): boolean {
  // The applicable rule can belong to another task's map than `task`: the
  // _left walk for a junction's :create judges the LEFT card's :update rule
  // (permissions.rb:69), so the returned rule id is an update rule while the
  // verdict is a create verdict. A rule card hangs off exactly one setting,
  // so its party row lives in exactly one map; search them all and deny when
  // none holds the id. A rule found with an empty party set still denies
  // (who_can -> [] -> among? -> false).
  const own = state.ruleParties[task].get(ruleId);
  if (own !== undefined) return state.viewerParties.some((party) => own.has(party));
  for (const [otherTask, map] of Object.entries(state.ruleParties)) {
    if (otherTask === task) continue;
    const parties = (map as Map<number, Set<number>>).get(ruleId);
    if (parties !== undefined) return state.viewerParties.some((party) => parties.has(party));
  }
  return false;
}

/** permit(action) for one task: resolve the card's applicable rule card
 *  (permission_rule_id :55-71, the _left-aware walk below) and run the
 *  party check. NO undefined-allow: a deck with no rule cards for the
 *  task, or a card none of whose candidates resolve, DENIES — Ruby's
 *  who_can -> [] -> among? -> false (permissions.rb:47-49, :100-118), and
 *  a rule id that does not resolve is "should not be possible" ->
 *  PermissionDenied (permissions.rb:77-85). Fail-closed. */
async function permitVerdict(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
): Promise<boolean | undefined> {
  const resolved = await applicableRule(fetcher, card, task, state);
  if (resolved === undefined) return false;
  return amongParties(state, resolved.task, resolved.ruleId);
}

/** The applicable rule card AND the task whose party table judges it. The
 *  two differ after a `_left` remap: a compound card's :create inherits the
 *  real left's :update rule (permissions.rb:69), so the verdict is
 *  `Auth.as_card.among? who_can(:update)` over that update rule's items. The
 *  party tables are keyed by task, so looking an update rule up in the create
 *  table finds no parties and denies a member Ruby allows. */
async function applicableRule(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
  depth = 0,
): Promise<{ ruleId: number; task: WriteTask } | undefined> {
  return applicableRuleId(fetcher, card, task, state, depth);
}

/** Card::Query-free port of permissions.rb:55-71 permission_rule_id: the
 *  first set-pattern candidate that resolves to a stored rule, UNLESS that
 *  rule's value is the relative "_left" ([_left]/[[_left]] included) AND
 *  the card is COMPOUND — then the verdict recurses to the LEFT card's own
 *  permission rule (left_permission_rule_id :67-71: `lcard =
 *  left_or_new(skip_virtual: true, skip_modules: true)`; a real left's
 *  :create remaps to :update at :69 because the existing trunk is not the
 *  act's creation target). The recursion terminates because each step
 *  strictly shrinks the name (a simple left hits the compound? guard and
 *  answers its own first candidate — which may be the same _left rule,
 *  whose "_left" content parses no party items and denies, Ruby's exact
 *  shape for the no-inheritable-rule deck).
 *
 *  Corpus receipts (2026-10-03): Joan_Callahan_20230902+discussion (45298)
 *  inherits through *all plus+*update (6571, "_left") to Joan Callahan
 *  20230902's *self rule 45186 ("Anyone") — the comment box renders;
 *  Klickstein continues+discussion answers from its own *self rule 9841
 *  before any _left; Perennial/Work Week/MNv discussions recurse to lefts
 *  with no *update rule, land back on 6571 from a simple card, and deny
 *  (their graded blanks). */
async function applicableRuleId(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
  depth = 0,
): Promise<{ ruleId: number; task: WriteTask } | undefined> {
  if (!state.hasTaskRules[task]) return undefined;
  const candidates = ruleNamesForCard(card, TASK_SETTING_NAME[task]).map(
    (name) => DeckoName.parse(name).key,
  );
  const resolved = await resolveRuleIdsByRuleKeys(fetcher.driver, candidates);
  let firstResolved: number | undefined;
  for (const key of candidates) {
    const ruleId = resolved.get(key);
    if (ruleId !== undefined) {
      firstResolved = ruleId;
      break;
    }
  }
  if (firstResolved === undefined) return undefined;
  // permissions.rb:56 — the _left inheritance fires only for compound
  // cards; the rule VALUE test is the anchored /_left/ bracket-tolerant
  // match over the stored content.
  const name = DeckoName.parse(card.name);
  const value = state.ruleContent[task].get(firstResolved) ?? "";
  // The verdict reads the resolved rule's parties under the task it was
  // resolved FOR: a real left's :create inherits through its :update rule
  // (:69), so that rule's parties live in the update map.
  if (depth >= 16 || !LEFT_RULE_VALUE.test(value) || !name.isCompound) {
    return { ruleId: firstResolved, task };
  }
  const leftName = name.leftName;
  if (leftName === undefined || leftName.key === "") return { ruleId: firstResolved, task };
  const left = await fetcher.fetchByName(leftName.key, { skipVirtual: true });
  // The real left's type anchor (the *type candidate) — CardRecord carries
  // the id, the anchor NAME comes from the type card (the same shape
  // virtualSidePart builds for new parts).
  let leftTypeName: string | undefined;
  if (left?.typeId !== undefined && left.typeId !== null) {
    leftTypeName = (await fetcher.fetchById(left.typeId, { skipModules: true }))?.name?.s;
  }
  // permissions.rb:69 — a REAL left's :create verdict is judged as :update
  // (the existing trunk is nobody's creation target); a missing left keeps
  // the original task on its new-card walk (left_or_new).
  const inheritedTask: WriteTask =
    task === "create" && left?.id !== undefined ? "update" : task;
  return applicableRuleId(
    fetcher,
    {
      name: left?.name?.s ?? leftName.s,
      id: left?.id,
      typeId: left?.typeId,
      typeName: leftTypeName,
    },
    inheritedTask,
    state,
    depth + 1,
  );
}

/** ok_to_create? :123-125 + ok_to_create_side :127-137 — junction sides:
 *  a side is allowed when its part card EXISTS; a missing part is checked
 *  as a virtual new card (send(side, new: {}) -> part_card.ok?(:create)).
 *  `side == :left && superleft` (:128) never short-circuits here: a render
 *  carries no supercard. UNBOUNDED like Ruby (:127-137 has no depth bound;
 *  the recursion terminates because each side's name strictly shrinks) —
 *  every prefix of a deep name is checked, so no part escapes the walk.
 *  selfId (the rename clause's obstructed-self comparison): a fetched
 *  part whose id IS the renamed card is not a bystander — Ruby clears and
 *  recreates it in the same act (prepare_obstructed_side,
 *  name_events.rb:144-150) — so it is create-checked like a missing side.
 *  The create path passes no selfId: `existing.id !== undefined` then,
 *  identical to this walk's historical behavior. */
async function createSidesAllowed(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ViewTaskState,
  depth: number,
  selfId?: number,
): Promise<boolean | undefined> {
  const name = DeckoName.parse(card.name);
  if (!name.isCompound) return true;
  for (const partName of [name.leftName, name.rightName]) {
    if (partName === undefined) continue;
    const partKey = partName.key;
    if (partKey === "") continue;
    const existing = (await fetcher.fetchByName(partKey)) ?? undefined;
    if (existing !== undefined && existing.id !== undefined && existing.id !== selfId) {
      continue; // part_card.new_card? false (a real bystander side)
    }
    const virtualPart = await virtualSidePart(fetcher, partName.s);
    const verdict = await taskVerdictForCard(fetcher, virtualPart, "create", state, depth + 1);
    if (verdict === false) return false; // deny_because you_cant("create ...") (:134-135)
    // deny-by-default means the recursion can no longer return an
    // unverifiable undefined: a part with no applicable rule DENIES.
  }
  return true;
}

/** The missing side's VIRTUAL card with its WOULD-BE type (ok_to_create_side's
 *  `send side, new: {}`, permissions.rb:130). Ruby resolves the part's type at
 *  Card.new time — newish -> handle_type -> ensure_type_id (initialize.rb:54;
 *  type.rb:58-69 type_id_from_code || type_id_from_template, the *default
 *  template chain) — BEFORE the validate-stage ok? check, so the part carries
 *  a real type_id and the *type pattern applies to it (03_type.rb
 *  #pattern_applies?: !!card.type_id): Basic+*type+*create is among the
 *  part's candidates. The port resolves the same type the write path assigns
 *  when it physically creates the side (createInWriter -> resolveTypeId) —
 *  the gate and the write cannot diverge. A type that cannot resolve mirrors
 *  type_id_or_error (type.rb:106-112): the error belongs to the save, not the
 *  permission walk, so the part proceeds TYPELESS — which drops the *type
 *  candidate exactly like Ruby's nil type_id does. (The fetch layer raises
 *  CodenameNotFoundError for a missing codename card where Ruby's
 *  Card.fetch returns nil — e.g. no *default card in the seed; same
 *  typeless-part walk. Driver failures propagate.) */
async function virtualSidePart(
  fetcher: FetchEngine,
  partName: string,
): Promise<PatternCardInput> {
  try {
    const typeId = await resolveTypeId(fetcher, { name: partName });
    const typeCard = await fetcher.fetchById(typeId, { skipModules: true });
    return {
      name: partName,
      isNew: true,
      typeId,
      typeName: typeCard?.name?.s,
    };
  } catch (error) {
    if (
      error instanceof CardActionError ||
      error instanceof CodenameNotFoundError ||
      error instanceof NameNotFoundError
    ) {
      return { name: partName, isNew: true }; // type unresolvable -> *type pattern dropped
    }
    throw error;
  }
}
