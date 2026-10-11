// notify/dispatch.ts — run the integration hooks for one save's action.
//
// The save path (src/card/actions/card-action-engine.ts) is owned by a
// different stream and is read-only here. That stream owns the call
// site — its save-path registration line fires this dispatcher once per
// completed applyAction():
//
//   await runIntegrationHooks({
//     actId: result.actId,
//     actor: { id, name, email },
//     silent: false,
//     events: expandActionResultToSavePathEvents(result),
//     hooks: [followNotifyHook],
//     context: { transport, logger },
//   });
//
// The dispatcher iterates events, dispatches each to the hooks whose
// notable predicate accepts it, and awaits the resulting mail sends.
// Errors per-hook are caught (matching Ruby's `rescuing_if_integration`,
// set/event.rb — failed hooks warn but do not abort the user's save).

import type {
  NotifyContext,
  NotifyTransport,
  SavePathAct,
  SavePathEvent,
  SavePathIntegrationHook,
} from "./types.js";
import type { ActionResult } from "../actions/types.js";

/** Inputs for one save's integration sweep. The action engine builds this
 *  from its own `applyAction` result; the dispatcher knows nothing about
 *  the engine's internals. */
export interface IntegrationDispatchInput {
  /** The just-completed act's id. */
  readonly actId: number;
  /** The actor responsible for the save (already resolved, no re-fetch). */
  readonly actor: { readonly id: number; readonly name: string; readonly email: string | null };
  /** Whether the engine marked this save as silent (Ruby's `@silent_change`,
   *  card-mod-follow notify.rb:18). */
  readonly silent: boolean;
  /** The actions in the save, expanded to SavePathEvents. */
  readonly events: readonly SavePathEvent[];
  /** The act card's name (Ruby's act.card — the act-level hooks' mail
   *  context, account.rb:18). Null/absent when unresolvable. */
  readonly actCardName?: string | null;
  /** The hooks to fire. Order is preserved. */
  readonly hooks: readonly SavePathIntegrationHook[];
  /** The transport + logger. */
  readonly context: NotifyContext;
  /** Per-hook error handler. Default logs and continues. */
  readonly onError?: (err: unknown, hook: SavePathIntegrationHook, event: SavePathEvent) => void;
}

/** Run every hook. ACT-LEVEL hooks (fireAct present) run ONCE per act
 *  with the whole act's events — Ruby's notify_followers fires once per
 *  act (set/all/notify.rb:8-11 + :57-61 current_act_card?) and dedupes
 *  the act's followers through one FollowerStash (:66-73 + follower_stash
 *  .rb). Per-event hooks run the legacy event loop. Sequential — matches
 *  Ruby's set/event.rb:DelayedEvent's IntegrateWithDelayJob (one save
 *  maps to one ActiveJob that processes events in order). A worker-queue
 *  backlog is the integrate_with_delay-delayed form (delayed_event.rb);
 *  the dispatcher itself is in-line.
 *
 *  Returns a flat list of (hook,event,status) triples for diagnostics —
 *  useful for captures and tests, harmless in production. Act-level
 *  recorded results carry the act's FIRST event as their event reference. */
export async function runIntegrationHooks(
  input: IntegrationDispatchInput,
): Promise<IntegrationHookReceipt[]> {
  const receipts: IntegrationHookReceipt[] = [];
  const act: SavePathAct = {
    actId: input.actId,
    actor: input.actor,
    silent: input.silent,
    events: input.events,
    actCardName: input.actCardName ?? null,
  };
  for (const hook of input.hooks) {
    if (hook.fireAct !== undefined) {
      if (input.events.length === 0) continue; // no actions: nothing stashes, nothing fires
      if (!hook.notable(input.events[0])) {
        receipts.push({ hook: hook.name ?? "<anonymous>", event: input.events[0], status: "skipped" });
        continue;
      }
      try {
        await hook.fireAct(act, input.context);
        receipts.push({ hook: hook.name ?? "<anonymous>", event: input.events[0], status: "fired" });
      } catch (err) {
        const handler = input.onError ?? ((e, h, ev) => {
          input.context.logger?.(`[notify] hook=${h.name ?? "?"} event=card#${ev.card?.id ?? "?"} failed: ${(e as Error).message}`);
        });
        handler(err, hook, input.events[0]);
        receipts.push({ hook: hook.name ?? "<anonymous>", event: input.events[0], status: "failed", error: err });
      }
      continue;
    }
    for (const event of input.events) {
      if (!hook.notable(event)) {
        receipts.push({ hook: hook.name ?? "<anonymous>", event, status: "skipped" });
        continue;
      }
      try {
        await hook.fire(event, input.context);
        receipts.push({ hook: hook.name ?? "<anonymous>", event, status: "fired" });
      } catch (err) {
        const handler = input.onError ?? ((e, h, ev) => {
          input.context.logger?.(`[notify] hook=${h.name ?? "?"} event=card#${ev.card?.id ?? "?"} failed: ${(e as Error).message}`);
        });
        handler(err, hook, event);
        receipts.push({ hook: hook.name ?? "<anonymous>", event, status: "failed", error: err });
      }
    }
  }
  return receipts;
}

export type IntegrationHookReceipt = {
  readonly hook: string;
  readonly event: SavePathEvent;
  readonly status: "fired" | "skipped" | "failed";
  readonly error?: unknown;
};

/** Helper: build the SavePathEvents list from one engine action. The
 *  action's name comes from `ActionResult.name` (the composed name);
 *  verb + ids come from the engine. The card-level lookup is left to
 *  the caller because it requires the FetchEngine — dispatcher is a
 *  pure data shaper. */
export function savePathEventFromAction(
  action: ActionResult,
  actor: { readonly id: number; readonly name: string; readonly email: string | null },
  actId: number,
  silent: boolean,
): SavePathEvent {
  return {
    card: action.name === undefined
      ? null
      : {
          id: action.cardId,
          name: action.name.s ?? null,
          leftName: action.name.leftName?.s ?? null,
          rightName: action.name.rightName?.s ?? null,
          type: null,
          content: null,
          trashed: action.verb === "delete",
        },
    verb: action.verb,
    actId,
    actionId: action.actionId,
    actor,
    silent,
    isDeletePath: action.verb === "delete",
  };
}

/** Helper: build SavePathEvents for the act's primary action and every
 *  subaction in one call. The act's `silent` flag covers ALL events in
 *  the act (Ruby's @silent_change is a `@supercard` chain — see
 *  card-mod-follow notify.rb:55-57). */
export function expandActionResultToSavePathEvents(
  action: ActionResult,
  actor: { readonly id: number; readonly name: string; readonly email: string | null },
  silent: boolean,
): SavePathEvent[] {
  const events: SavePathEvent[] = [];
  events.push(savePathEventFromAction(action, actor, action.actId, silent));
  for (const sub of action.subactions) {
    events.push(savePathEventFromAction(
      { ...sub, actId: action.actId, subactions: [] },
      actor,
      action.actId,
      silent,
    ));
  }
  return events;
}

/** Factory: the standard context (transport + optional logger). */
export function makeNotifyContext(
  transport: NotifyTransport,
  logger?: (line: string) => void,
): NotifyContext {
  return { transport, ...(logger !== undefined ? { logger } : {}) };
}
