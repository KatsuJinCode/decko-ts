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
import type { FetchEngine } from "../fetch.js";
import { DeckoName } from "../name.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import type { ReadPermissionState } from "./read-rules.js";
import { resolveRuleIdsByKeys } from "./read-rules.js";
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
  partyId: number | null;
}

/**
 * The resolved write-task permission state for the engine's viewer — the
 * who_can maps plus the actor facts it inherits from the read state
 * (alwaysOk = Auth.always_ok?, viewerParties = Auth.as_card parties).
 *
 * hasTaskRules gates the rule-less/partial-seed divergence exactly like
 * the read side's hasReadRules (read-rules.ts): a deck with no *update
 * rule cards at all carries no permission data for the task, and the
 * verdict degrades to "unverifiable" (undefined = allow) instead of
 * fabricating denials from missing data.
 */
export interface ViewTaskState {
  readonly alwaysOk: boolean;
  readonly viewerParties: number[];
  readonly hasTaskRules: Record<WriteTask, boolean>;
  /** rule card id -> the party ids its content references (who_can's
   *  item ids; an empty set = an empty rule, which denies). */
  readonly ruleParties: Record<WriteTask, Map<number, Set<number>>>;
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
  const hasTaskRules: Record<WriteTask, boolean> = {
    update: false,
    create: false,
    delete: false,
  };
  for (const row of rows) {
    if (!isWriteTask(row.task)) continue;
    const task = row.task;
    hasTaskRules[task] = true;
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
  };
}

function isWriteTask(task: string): task is WriteTask {
  return (WRITE_TASK_CODENAMES as readonly string[]).includes(task);
}

/**
 * ok_to_<task>? for one card (format/error.rb:5-8 + permissions.rb
 * :105-157): undefined = unverifiable (the documented rule-less /
 * partial-seed divergence — the port allows rather than fabricating a
 * denial from missing rule data, mirroring canReadByRuleLookup).
 */
export async function taskVerdictForCard(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
  depth = 0,
): Promise<boolean | undefined> {
  if (state.alwaysOk) return true; // permitted? :108-109 (Auth.always_ok?)
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
    update: undefined,
    create: undefined,
    delete: undefined,
  };
  if (state.alwaysOk) {
    return { update: true, create: true, delete: true }; // permitted? :108-109
  }
  const needed = WRITE_TASK_CODENAMES.filter((task) => state.hasTaskRules[task]);
  if (needed.length === 0) return out;
  const candidateKeys: string[] = [];
  const perTask = new Map<WriteTask, string[]>(); // task -> candidate keys (subset view)
  for (const task of needed) {
    const names = ruleNamesForCard(card, TASK_SETTING_NAME[task]).map(
      (name) => DeckoName.parse(name).key,
    );
    perTask.set(task, names);
    candidateKeys.push(...names);
  }
  const resolved = await resolveRuleIdsByKeys(fetcher.driver, candidateKeys);
  for (const task of needed) {
    const names = perTask.get(task) ?? [];
    const firstResolved = names
      .map((key) => resolved.get(key))
      .find((ruleId) => ruleId !== undefined);
    if (firstResolved === undefined) continue; // divergence: no applicable rule card in the seed
    // permissions.rb:148-153 update == permit(:update) at render time.
    if (task !== "create") {
      out[task] = amongParties(state, task, firstResolved);
      continue;
    }
    if (!amongParties(state, task, firstResolved)) {
      out.create = false; // ok_to_create? :121 permit(:create) failed
      continue;
    }
    out.create = await createSidesAllowed(fetcher, card, state, depth); // :123-125
  }
  return out;
}

/** permitted? (:105-110) — the applicable rule card's item ids against the
 *  actor's parties (among?, account_holder.rb:31-36). An applicable rule
 *  with NO item ids denies (who_can -> [] -> any? -> false). */
function amongParties(state: ViewTaskState, task: WriteTask, ruleId: number): boolean {
  const parties = state.ruleParties[task].get(ruleId) ?? new Set<number>();
  return state.viewerParties.some((party) => parties.has(party));
}

/** permit(action) for one task: resolve the card's applicable rule card
 *  (permission_rule_id :55-61 — first candidate that exists) and run the
 *  party check. undefined = no applicable rule card in the seed (the
 *  divergence documented on canReadByRuleLookup — a card whose rule is
 *  absent cannot honestly be denied). */
async function permitVerdict(
  fetcher: FetchEngine,
  card: PatternCardInput,
  task: WriteTask,
  state: ViewTaskState,
): Promise<boolean | undefined> {
  if (!state.hasTaskRules[task]) return undefined; // no rule data for the task at all
  const candidates = ruleNamesForCard(card, TASK_SETTING_NAME[task]).map(
    (name) => DeckoName.parse(name).key,
  );
  const resolved = await resolveRuleIdsByKeys(fetcher.driver, candidates);
  for (const key of candidates) {
    const ruleId = resolved.get(key);
    if (ruleId === undefined) continue;
    return amongParties(state, task, ruleId);
  }
  return undefined;
}

/** ok_to_create? :123-125 + ok_to_create_side :127-137 — junction sides:
 *  a side is allowed when its part card EXISTS; a missing part is checked
 *  as a virtual new card (send(side, new: {}) -> part_card.ok?(:create)).
 *  `side == :left && superleft` (:128) never short-circuits here: a render
 *  carries no supercard. Depth-bounded: part names strictly shrink. */
async function createSidesAllowed(
  fetcher: FetchEngine,
  card: PatternCardInput,
  state: ViewTaskState,
  depth: number,
): Promise<boolean | undefined> {
  const name = DeckoName.parse(card.name);
  if (!name.isCompound || depth >= 4) return true;
  let sawUnverifiable = false;
  for (const partName of [name.leftName, name.rightName]) {
    if (partName === undefined) continue;
    const partKey = partName.key;
    if (partKey === "") continue;
    const existing = (await fetcher.fetchByName(partKey)) ?? undefined;
    if (existing !== undefined && existing.id !== undefined) continue; // part_card.new_card? false
    const virtualPart: PatternCardInput = { name: partName.s, isNew: true };
    const verdict = await taskVerdictForCard(fetcher, virtualPart, "create", state, depth + 1);
    if (verdict === false) return false; // deny_because you_cant("create ...") (:134-135)
    if (verdict === undefined) sawUnverifiable = true;
  }
  return sawUnverifiable ? undefined : true;
}
