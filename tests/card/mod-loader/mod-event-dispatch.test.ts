// The ModEventFn EXECUTION SEAM's dispatcher (src/card/mod-loader/
// mod-event-dispatch.ts) — the stage runner that fires registered set-module
// events at their declared stage, ported from Ruby's applicability algebra:
//
// - event_applies? (card-1.110.0 lib/card/set/event/all.rb:16-22): set
//   membership, then every condition — on, changed/changing, skip, trigger,
//   when.
// - on_condition_applies? (all.rb:32-35): no on: -> every action; :save
//   expanded to [create, update] at registration (set/event/options.rb:70).
// - changed/changing_condition_applies? (all.rb:69-77, alias :77): only
//   gates on :update; empty/absent -> always true; else ANY declared field
//   changing. Field names per Card::Dirty (dirty.rb:8-17): canonical
//   columns name, db_content, trash, type_id, left_id, right_id, codename,
//   with aliases type -> type_id, content -> db_content; DirtyNames
//   (dirty.rb:57-60) folds left/right changes into name_is_changing?.
// - skip_condition_applies? (set/event/skip_and_trigger.rb:80-84): "applies
//   always means event can run". Not listed -> runs. Listed with a plain
//   skip= entry (value true): runs UNLESS the event declared skip: :allowed;
//   a skip_event! entry (value :force) stops even those.
// - trigger_condition_applies? (:86-90): trigger: :required events run only
//   when listed in the act's trigger list.
// - when_condition_applies? (all.rb:79-85): named predicate resolved
//   against the card.
// - stage semantics (lib/card/director.rb:12-28): nine stages, three
//   phases; events with no stage of their own but `after: X` run in X's
//   stage directly after X (set/event/options.rb:73-86 keeps @stage nil
//   when after:/before:/around is present).
// - integration-stage error isolation (lib/card.rb:163-171
//   rescuing_if_integration + set/event.rb:147-159): a failing
//   /integrate/-stage event is rescued so one failed integration event does
//   not harm others; other stages propagate.
//
// Expectations are HAND-DERIVED from those sources; the deck-independent
// units use hand-built cards + a real ModEventRegistry.

import { describe, expect, it } from "vitest";
import { ModEventRegistry } from "../../../src/card/mod-loader/mod-event-registry.js";
import type {
  ModEventCard,
  ModEventRegistration,
} from "../../../src/card/mod-loader/mod-manifest.js";
import {
  runModEventStage,
  type ModEventRuntime,
} from "../../../src/card/mod-loader/mod-event-dispatch.js";

const DUMMY_DEPS = {} as Parameters<typeof runModEventStage>[3];

/** A card with the act-state shape the engine builds per save. */
function card(over: Partial<ModEventCard> = {}): ModEventCard {
  return {
    name: "Test Card",
    id: 50,
    key: "test_card",
    action: "update",
    changedFields: [],
    act: { action: "update" },
    ...over,
  };
}

/** A no-op body. */
function noop(): void {}

interface Captured {
  fired: string[];
  skipped: Array<{ event: string; reason: string }>;
  failed: Array<{ event: string; error: unknown }>;
}

/** Register the events, run one stage, capture the report + thrown error. */
async function run(
  decls: Array<ModEventRegistration & { setPath?: string }>,
  stage: Parameters<typeof runModEventStage>[1],
  theCard: ModEventCard,
  runtimeOver: Partial<ModEventRuntime> = {},
): Promise<{ report: Captured; thrown: unknown }> {
  const registry = new ModEventRegistry();
  for (const decl of decls) {
    registry.register({ ...decl, setPath: decl.setPath ?? "all/test", modName: "test" });
  }
  const runtime: ModEventRuntime = { registry, ...runtimeOver };
  let thrown: unknown;
  let reportJson: Captured = { fired: [], skipped: [], failed: [] };
  try {
    const report = await runModEventStage(runtime, stage, theCard, DUMMY_DEPS);
    reportJson = {
      fired: [...report.fired],
      skipped: report.skipped.map((s) => ({ event: s.event, reason: s.reason })),
      failed: report.failed.map((f) => ({ event: f.event, error: f.error })),
    };
  } catch (error) {
    thrown = error;
  }
  return { report: reportJson, thrown };
}

describe("mod-event dispatcher — the stage walk", () => {
  it("fires the stage's events in registration order and awaits async bodies", async () => {
    const order: string[] = [];
    const { report, thrown } = await run(
      [
        { event: "first", at: "finalize", fn: () => { order.push("first"); } },
        {
          event: "second",
          at: "finalize",
          fn: async () => {
            await Promise.resolve();
            order.push("second");
          },
        },
        { event: "elsewhere", at: "validate", fn: noop },
      ],
      "finalize",
      card(),
    );
    expect(thrown).toBeUndefined();
    expect(order).toEqual(["first", "second"]);
    expect(report.fired).toEqual(["first", "second"]);
    expect(report.skipped).toEqual([]);
  });

  it("fires no-stage after: events in their target's stage, directly after it", async () => {
    // all/trash.rb:52-59 `event :delete_children, after: :validate_delete` —
    // no stage of its own (options.rb:76 keeps @stage nil); it runs in the
    // validate stage directly after validate_delete.
    const order: string[] = [];
    const { report, thrown } = await run(
      [
        { event: "delete_children", after: "validate_delete", on: ["delete"], fn: () => { order.push("delete_children"); } },
        { event: "before_guard", at: "validate", fn: () => { order.push("before_guard"); } },
        { event: "validate_delete", at: "validate", on: ["delete"], fn: () => { order.push("validate_delete"); } },
      ],
      "validate",
      card({ act: { action: "delete" } }),
    );
    expect(thrown).toBeUndefined();
    expect(order).toEqual(["before_guard", "validate_delete", "delete_children"]);
    expect(report.fired).toEqual(["before_guard", "validate_delete", "delete_children"]);
  });

  it("fires no-stage before: events in their target's stage, directly before it", async () => {
    // mod/account/set/self/signin.rb:27 `event :send_reset_password_token,
    // before: :signin, on: :update, trigger: :required` — before: clears
    // @stage (options.rb:76), so the event has no stage of its own and
    // hangs on signin's callback chain (`set_callback object_method, :before,
    // event.name, prepend: true`, set/event/callbacks.rb:17-18). signin is
    // the :validate stage event (signin.rb:10), so this runs at validate.
    const order: string[] = [];
    const { report, thrown } = await run(
      [
        // signin.rb:10 is declared BEFORE :27 in the module, so the
        // registration order is the opposite of the run order — the
        // before: relation is what puts the token event first, exactly as
        // Ruby's `prepend: true` does.
        { event: "signin", at: "validate", on: ["update"], fn: () => { order.push("signin"); } },
        {
          event: "send_reset_password_token",
          before: "signin",
          on: ["update"],
          trigger: "required",
          fn: () => { order.push("send_reset_password_token"); },
        },
      ],
      "validate",
      card({ act: { action: "update" } }),
      { trigger: ["send_reset_password_token"] },
    );
    expect(thrown).toBeUndefined();
    expect(order).toEqual(["send_reset_password_token", "signin"]);
    expect(report.fired).toEqual(["send_reset_password_token", "signin"]);
  });

  it("pins a before: entry immediately ahead of its target and an after: entry immediately behind", async () => {
    // An `after:` entry is a callback on its target's OWN chain
    // (callbacks.rb:17-18), so it unwinds the moment that target's body
    // returns - BEFORE the next stage event, which is a separate callback
    // on the stage chain. mod/layout/set/right/enabled_roles.rb:28
    // clear_roles_cache before: store_in_session (prepare_to_store);
    // mod/session/set/type/session.rb pairs the store/delete arms.
    const order: string[] = [];
    const { thrown } = await run(
      [
        { event: "store_in_session", at: "prepare_to_store", on: ["save"], fn: () => { order.push("store_in_session"); } },
        { event: "clear_roles_cache", before: "store_in_session", fn: () => { order.push("clear_roles_cache"); } },
        { event: "early", at: "prepare_to_store", fn: () => { order.push("early"); } },
        { event: "seed_session", after: "store_in_session", fn: () => { order.push("seed_session"); } },
      ],
      "prepare_to_store",
      card(),
    );
    expect(thrown).toBeUndefined();
    expect(order).toEqual(["clear_roles_cache", "store_in_session", "seed_session", "early"]);
  });

  it("runs a before: event in no save stage when its target is not a registered event", async () => {
    // mod/session/set/all/location_history.rb:6 `event :save_current_location,
    // before: :show_page, on: :read` — show_page is the page cycle, not a
    // stage event, so the name resolves to nothing in the registry and the
    // entry is a candidate in none of the nine save stages.
    for (const stage of ["validate", "prepare_to_store", "finalize"] as const) {
      const { report, thrown } = await run(
        [{ event: "save_current_location", before: "show_page", fn: noop }],
        stage,
        card(),
      );
      expect(thrown, `stage=${stage}`).toBeUndefined();
      expect(report.fired, `stage=${stage}`).toEqual([]);
      expect(report.skipped, `stage=${stage}`).toEqual([]);
    }
  });

  it("rescues callback failure inside its integration target's wrapper", async () => {
    // event.rb:147-157 wraps run_callbacks in rescuing_if_integration.
    // The relative callback has no rescue of its own; its target does.
    // A minimal run against installed Ruby ActiveSupport confirms this.
    const boom = (): void => {
      throw new Error("boom");
    };
    const ownStage = await run(
      [{ event: "own_integrate", at: "integrate", fn: boom }],
      "integrate",
      card(),
    );
    expect(ownStage.thrown).toBeUndefined();
    expect(ownStage.report.failed.map((f) => f.event)).toEqual(["own_integrate"]);

    const relative = await run(
      [
        { event: "chain_root", at: "integrate", fn: noop },
        { event: "after_chain", after: "chain_root", fn: boom },
      ],
      "integrate",
      card(),
    );
    expect(relative.thrown).toBeUndefined();
    expect(relative.report.fired).toEqual(["chain_root"]);
    expect(relative.report.failed.map(f => f.event)).toEqual(["chain_root"]);
  });

  it.each([
    [{ changed: ["name"] }, {}, "changed"],
    [{ on: ["delete"] }, {}, "on-action"],
    [{ when: "allowed?" }, { predicates: { "allowed?": () => false } }, "when-false"],
    [{ trigger: "required" }, {}, "trigger"],
    [{}, { forceSkip: ["parent"] }, "force-skip"],
    [{ skip: "allowed" }, { skip: ["parent"] }, "skip"],
    [{ setPath: "type/css" }, { setMember: () => false }, "set-not-applicable"],
  ] as const)("never invokes callbacks when the parent fails %j", async (gate, runtime, reason) => {
    const calls: string[] = [];
    const result = await run([
      { event: "parent", at: "validate", ...gate, fn: () => { calls.push("parent"); } },
      { event: "before", before: "parent", when: "must_not_evaluate?", fn: () => { calls.push("before"); } },
      { event: "after", after: "parent", fn: () => { calls.push("after"); } },
      { event: "grandchild", after: "after", fn: () => { calls.push("grandchild"); } },
      { event: "independent", at: "validate", fn: () => { calls.push("independent"); } },
    ], "validate", card(), runtime);
    expect(result.thrown).toBeUndefined();
    expect(calls).toEqual(["independent"]);
    expect(result.report.skipped).toEqual([
      { event: "parent", reason },
      { event: "before", reason: "parent-skipped" },
      { event: "after", reason: "parent-skipped" },
      { event: "grandchild", reason: "parent-skipped" },
    ]);
  });

  it("wraps a permitted target in nested callbacks using Ruby prepend order", async () => {
    const calls: string[] = [];
    const body = (name: string) => () => { calls.push(name); };
    const result = await run([
      { event: "target", at: "validate", changed: ["name"], fn: body("target") },
      { event: "before_first", before: "target", fn: body("before_first") },
      { event: "before_second", before: "target", fn: body("before_second") },
      { event: "after_first", after: "target", fn: body("after_first") },
      { event: "before_nested", before: "after_first", fn: body("before_nested") },
      { event: "after_second", after: "target", fn: body("after_second") },
    ], "validate", card({ changedFields: ["name"] }));
    expect(result.thrown).toBeUndefined();
    expect(calls).toEqual(["before_second", "before_first", "target", "before_nested", "after_first", "after_second"]);
    expect(result.report.fired).toEqual(calls);
  });

  it("expands on: save to create+update and never delete; absent on: fires every action", async () => {
    // all/reference_events.rb:2 `on: :save` (options.rb:70) vs :28
    // clear_references `on: :delete`.
    const fired: string[] = [];
    const decls: ModEventRegistration[] = [
      { event: "save_only", at: "finalize", on: ["save"], fn: () => { fired.push("save_only"); } },
      { event: "delete_only", at: "finalize", on: ["delete"], fn: () => { fired.push("delete_only"); } },
      { event: "any_action", at: "finalize", fn: () => { fired.push("any_action"); } },
    ];
    for (const action of ["create", "update", "delete"] as const) {
      fired.length = 0;
      const { thrown } = await run(decls, "finalize", card({ act: { action } }));
      expect(thrown).toBeUndefined();
      expect(fired, `action=${action}`).toEqual(
        action === "delete"
          ? ["delete_only", "any_action"]
          : ["save_only", "any_action"],
      );
    }
  });
});

describe("mod-event dispatcher — changed:/changing: gates", () => {
  it("gates on :update only: a create save fires regardless of changedFields", async () => {
    // all.rb:70 `return true unless action == :update`.
    const { report, thrown } = await run(
      [{ event: "refresh_references_out", at: "finalize", on: ["save"], changed: ["content"], fn: noop }],
      "finalize",
      card({ act: { action: "create" }, changedFields: [] }),
    );
    expect(thrown).toBeUndefined();
    expect(report.fired).toEqual(["refresh_references_out"]);
  });

  it("fires when ANY declared field is changing (dirty aliases resolved)", async () => {
    // changed: :content (reference_events.rb:3) -> db_content (dirty.rb:12);
    // changing: :type (cardtype.rb:20) -> type_id.
    const refOut = await run(
      [{ event: "ref_out", at: "finalize", on: ["update"], changed: ["content"], fn: noop }],
      "finalize",
      card({ changedFields: ["db_content"] }),
    );
    expect(refOut.thrown).toBeUndefined();
    expect(refOut.report.fired).toEqual(["ref_out"]);

    const cardtype = await run(
      [{ event: "cardtype_check", at: "validate", changing: ["type"], fn: noop }],
      "validate",
      card({ changedFields: ["type_id"] }),
    );
    expect(cardtype.thrown).toBeUndefined();
    expect(cardtype.report.fired).toEqual(["cardtype_check"]);
  });

  it("skips with reason when no declared field is changing", async () => {
    // A name-only save does NOT fire refresh_references_out (changed:
    // :content), but DOES fire update_referer_content (changed: :name).
    const { report } = await run(
      [
        { event: "refresh_references_out", at: "finalize", on: ["update"], changed: ["content"], fn: noop },
        { event: "update_referer_content", at: "finalize", on: ["update"], changed: ["name"], skip: "allowed", fn: noop },
      ],
      "finalize",
      card({ changedFields: ["name"], act: { action: "update", skip: [] } }),
    );
    expect(report.fired).toEqual(["update_referer_content"]);
    expect(report.skipped).toEqual([
      { event: "refresh_references_out", reason: "changed" },
    ]);
  });
});

describe("mod-event dispatcher — skip:/trigger: machinery", () => {
  it("a plain skip= entry stops only events that declared skip: allowed", async () => {
    // skip_and_trigger.rb:80-84: allowed ? val.blank? : (val != :force).
    // update_referer_content declares skip: :allowed (reference_events.rb:6);
    // refresh_references_in (:22) declares nothing. The skip= list rides on
    // the RUNTIME (the act's hash); the dispatcher walks it.
    const { report } = await run(
      [
        { event: "update_referer_content", at: "finalize", on: ["update"], changed: ["name"], skip: "allowed", fn: noop },
        { event: "refresh_references_in", at: "finalize", on: ["save"], changed: ["name"], fn: noop },
      ],
      "finalize",
      card({ changedFields: ["name"] }),
      { skip: ["update_referer_content"] },
    );
    expect(report.fired).toEqual(["refresh_references_in"]);
    expect(report.skipped).toEqual([
      { event: "update_referer_content", reason: "skip" },
    ]);
  });

  it("a force-skip entry (skip_event!) stops even non-allowed events", async () => {
    const { report } = await run(
      [{ event: "refresh_references_in", at: "finalize", on: ["save"], changed: ["name"], fn: noop }],
      "finalize",
      card({ changedFields: ["name"] }),
      { forceSkip: ["refresh_references_in"] },
    );
    expect(report.fired).toEqual([]);
    expect(report.skipped).toEqual([
      { event: "refresh_references_in", reason: "force-skip" },
    ]);
  });

  it("trigger: required events run only when the act triggers them", async () => {
    // skip_and_trigger.rb:86-90.
    const decls: ModEventRegistration[] = [
      { event: "explicit_only", at: "finalize", trigger: "required", fn: noop },
    ];
    const untriggered = await run(decls, "finalize", card());
    const triggered = await run(decls, "finalize", card(), {
      trigger: ["explicit_only"],
    });
    expect(untriggered.report.fired).toEqual([]);
    expect(untriggered.report.skipped).toEqual([
      { event: "explicit_only", reason: "trigger" },
    ]);
    expect(triggered.report.fired).toEqual(["explicit_only"]);
  });
});

describe("mod-event dispatcher — when: predicates", () => {
  it("resolves a named predicate against the card", async () => {
    // reference_events.rb:16-19 update_referer_references_out
    // when: :skip_update_referers? — true when update_referer_content is
    // skipped (protected method, reference_events.rb:34-36).
    const decls: ModEventRegistration[] = [
      {
        event: "update_referer_references_out",
        at: "finalize",
        on: ["update"],
        changed: ["name"],
        when: "skip_update_referers?",
        fn: noop,
      },
    ];
    const skippedRename = await run(decls, "finalize", card({
      changedFields: ["name"],
      act: { action: "update", skip: ["update_referer_content"] },
    }), {
      predicates: {
        "skip_update_referers?": (c) =>
          c.act?.skip?.includes("update_referer_content") === true ||
          c.act?.forceSkip?.includes("update_referer_content") === true,
      },
    });
    expect(skippedRename.report.fired).toEqual(["update_referer_references_out"]);

    const plainRename = await run(decls, "finalize", card({
      changedFields: ["name"],
      act: { action: "update" },
    }), {
      predicates: {
        "skip_update_referers?": (c) =>
          c.act?.skip?.includes("update_referer_content") === true ||
          c.act?.forceSkip?.includes("update_referer_content") === true,
      },
    });
    expect(plainRename.report.fired).toEqual([]);
    expect(plainRename.report.skipped).toEqual([
      { event: "update_referer_references_out", reason: "when-false" },
    ]);
  });

  it("raises when the runtime cannot resolve the when: predicate", async () => {
    // Ruby has no "predicate not found" branch: when_condition_applies?
    // (all.rb:79-85) does `when Symbol then send block`, and a card with no
    // such method raises NoMethodError, killing the save. The port raises
    // for the same reason rather than silently dropping the event.
    const { report, thrown } = await run(
      [{ event: "set_autoname", at: "prepare_to_store", on: ["create"], when: "autoname?", fn: noop }],
      "prepare_to_store",
      card({ act: { action: "create" } }),
    );
    expect(report.fired).toEqual([]);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("NoMethodError");
    expect((thrown as Error).message).toContain("autoname?");
    expect((thrown as Error).message).toContain("set_autoname");
  });

  it("evaluates the resolved predicate instead of raising", async () => {
    const { report, thrown } = await run(
      [{ event: "set_autoname", at: "prepare_to_store", on: ["create"], when: "autoname?", fn: noop }],
      "prepare_to_store",
      card({ act: { action: "create" } }),
      { predicates: { "autoname?": () => false } },
    );
    expect(thrown).toBeUndefined();
    expect(report.fired).toEqual([]);
    expect(report.skipped).toEqual([{ event: "set_autoname", reason: "when-false" }]);

    const allowed = await run(
      [{ event: "set_autoname", at: "prepare_to_store", on: ["create"], when: "autoname?", fn: noop }],
      "prepare_to_store",
      card({ act: { action: "create" } }),
      { predicates: { "autoname?": () => true } },
    );
    expect(allowed.thrown).toBeUndefined();
    expect(allowed.report.fired).toEqual(["set_autoname"]);
  });
});

describe("mod-event dispatcher — set scoping", () => {
  it("fires all/-pattern events universally; scoped events need the setMember resolver", async () => {
    // set_condition_applies? (all.rb:26-29): the set module must be included
    // on the card's singleton class. The registry records setPath; "all/"
    // files are included on every card, self//type//right/ files only on
    // their members.
    const decls: Array<ModEventRegistration & { setPath?: string }> = [
      { event: "ref_out", at: "finalize", setPath: "all/reference_events", fn: noop },
      { event: "admin_tasks", at: "initialize", on: ["update"], setPath: "self/admin", fn: noop },
    ];
    const noResolver = await run(decls, "initialize", card(), {});
    expect(noResolver.report.fired).toEqual([]);
    expect(noResolver.report.skipped).toEqual([
      { event: "admin_tasks", reason: "set-not-applicable" },
    ]);

    const withResolver = await run(decls, "initialize", card(), {
      setMember: (setPath) => setPath === "self/admin",
    });
    expect(withResolver.report.fired).toEqual(["admin_tasks"]);
  });
});

describe("mod-event dispatcher — error semantics", () => {
  it("abandons the target and its after callbacks when a before callback fails", async () => {
    const failure = new Error("before rejected");
    const calls: string[] = [];
    const result = await run([
      { event: "target", at: "validate", fn: () => { calls.push("target"); } },
      { event: "before", before: "target", fn: () => { calls.push("before"); throw failure; } },
      { event: "after", after: "target", fn: () => { calls.push("after"); } },
      { event: "later", at: "validate", fn: () => { calls.push("later"); } },
    ], "validate", card());
    expect(result.thrown).toBe(failure);
    expect(calls).toEqual(["before"]);
  });

  it("propagates a validation/storage-stage failure to the save", async () => {
    const boom = new Error("validator blew up");
    const order: string[] = [];
    const { thrown } = await run(
      [
        { event: "first_ok", at: "validate", fn: () => { order.push("first_ok"); } },
        { event: "explodes", at: "validate", fn: () => { throw boom; } },
      ],
      "validate",
      card(),
    );
    // The throw abandons the walk and propagates (no report returns — the
    // save dies, exactly Ruby's non-integration callback shape); first_ok
    // RAN before the throw.
    expect(order).toEqual(["first_ok"]);
    expect(thrown).toBe(boom);
  });

  it("isolates an integration-stage failure and keeps the walk going", async () => {
    // lib/card.rb:163-171: one failed integration event must not harm
    // others (rescuing_if_integration — stages matching /integrate/).
    const order: string[] = [];
    const { report, thrown } = await run(
      [
        { event: "explodes", at: "integrate", fn: () => { throw new Error("mail down"); } },
        { event: "notify_after", at: "integrate", fn: () => { order.push("notify_after"); } },
      ],
      "integrate",
      card(),
    );
    expect(thrown).toBeUndefined();
    expect(order).toEqual(["notify_after"]);
    expect(report.fired).toEqual(["notify_after"]);
    expect(report.failed).toHaveLength(1);
    expect((report.failed[0] as { error: Error }).error.message).toBe("mail down");
  });
});
