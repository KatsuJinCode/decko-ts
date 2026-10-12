// The core mod's 31 set-module event declarations (card-1.110.0 mod/core
// set/**). This file pins:
//
// 1. THE REGISTRY: all 31 events declare into the manifest with the gem's
//    stage/trigger/changed/after/when metadata (transcribed per file).
//
// 2. THE ADMIN TASKS EVENT: event :admin_tasks (set/self/admin.rb:24-38) is
//    the event behind the task table the admin :core view renders (its
//    links POST action=update&task=X; the event fires on :initialize of
//    that update). Its body's task-runner machinery is exercised HERE
//    through direct calls (the ModEventFn execution seam is unwired
//    engine-wide — mod-event-registry.ts header — so the declaration
//    carries a stub fn exactly like card-mod-history's six; the exported
//    runner carries the real implementation).
//
// 3. THE REMAINDER, named: the other 30 declarations pin with stub bodies;
//    per-event reasons are in the manifest source (core-mod.ts file notes).

import { describe, it, expect } from "vitest";
import coreMod, {
  CORE_TASK_BASKET,
  runTaskFromTaskBasket,
  notAllowedMessage,
  PermissionDeniedError,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import type { ModEventRegistration } from "../../../src/card/mod-loader/mod-manifest.js";

/** Every event declaration in the manifest, flattened with the declaring
 *  set path (the loader injects the same pair at registration). */
function declaredEvents(): Array<{ setPath: string } & ModEventRegistration> {
  const out: Array<{ setPath: string } & ModEventRegistration> = [];
  for (const file of coreMod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...event });
    }
  }
  return out;
}

/** The 31 event names the core mod's set modules declare. */
const DECLARED_EVENT_NAMES_31 = [
  "admin_tasks",
  "check_for_cards_of_type",
  "check_for_cards_of_type_when_type_changed",
  "clear_references",
  "delete_children",
  "expire_old_name",
  "manage_trash",
  "notable_exception_raised",
  "prepare_left_and_right",
  "refresh_references_in",
  "refresh_references_out",
  "reject_empty_subcards",
  "rename_in_trash",
  "reset_codename_cache",
  "save_draft",
  "set_autoname",
  "set_content",
  "set_default_content",
  "update_lexicon",
  "update_referer_content",
  "update_referer_references_out",
  "validate_cardtype_name",
  "validate_codename",
  "validate_delete",
  "validate_key",
  "validate_legality_of_name",
  "validate_name",
  "validate_renaming",
  "validate_type",
  "validate_type_change",
  "validate_uniqueness_of_name",
] as const;

describe("core mod event registry — all 31 Ruby events declare", () => {
  const events = declaredEvents();

  it("declares exactly those 31 names, no more, no fewer", () => {
    expect(events.map((e) => e.event).sort()).toEqual([...DECLARED_EVENT_NAMES_31].sort());
  });

  it("each declares from its gem set file", () => {
    const byFile = new Map(events.map((e) => [e.event, e.setPath]));
    // spot pins across the six declaring files (full per-file lists in the
    // manifest source):
    expect(byFile.get("admin_tasks")).toBe("self/admin");
    expect(byFile.get("manage_trash")).toBe("all/trash");
    expect(byFile.get("validate_name")).toBe("all/name_events");
    expect(byFile.get("refresh_references_out")).toBe("all/reference_events");
    expect(byFile.get("validate_codename")).toBe("all/codename");
    expect(byFile.get("check_for_cards_of_type")).toBe("type/cardtype");
    expect(byFile.get("set_content")).toBe("all/content");
  });

  it("carries the gem's stage/trigger metadata verbatim", () => {
    const byName = new Map(events.map((e) => [e.event, e]));
    // set/self/admin.rb:24 `event :admin_tasks, :initialize, on: :update`
    expect(byName.get("admin_tasks")).toMatchObject({ at: "initialize", on: ["update"] });
    // all/trash.rb:23 `event :manage_trash, :prepare_to_store, on: :create`
    expect(byName.get("manage_trash")).toMatchObject({ at: "prepare_to_store", on: ["create"] });
    // all/trash.rb:46 `event :delete_children, after: :validate_delete, on: :delete`
    expect(byName.get("delete_children")).toMatchObject({
      after: "validate_delete",
      on: ["delete"],
    });
    // all/name_events.rb:3 `event :validate_name, :validate, on: :save,
    // changed: :name, when: :no_autoname?` — "save" stored verbatim (the
    // execution seam expands it to [create, update], event.rb).
    expect(byName.get("validate_name")).toMatchObject({
      at: "validate",
      on: ["save"],
      changed: ["name"],
      when: "no_autoname?",
    });
    // all/name_events.rb:38 `event :validate_key, after: :validate_name, ...`
    expect(byName.get("validate_key")).toMatchObject({ after: "validate_name" });
    // all/content.rb:12 `event :set_default_content, :prepare_to_validate,
    // on: :create, when: :use_default_content?`
    expect(byName.get("set_default_content")).toMatchObject({
      at: "prepare_to_validate",
      on: ["create"],
      when: "use_default_content?",
    });
    // all/reference_events.rb:16 `event :update_referer_references_out,
    // :finalize, changed: :name, on: :update, when: :skip_update_referers?`
    expect(byName.get("update_referer_references_out")).toMatchObject({
      at: "finalize",
      on: ["update"],
      changed: ["name"],
      when: "skip_update_referers?",
    });
    // all/result.rb:1 `event :notable_exception_raised` — no stage, no
    // triggers (fires on every act's director pass).
    const notable = byName.get("notable_exception_raised")!;
    expect(notable.at).toBeUndefined();
    expect(notable.on).toBeUndefined();
    // all/name_events.rb:12/:46 `skip: :allowed` has no manifest field —
    // the declaration records it through the documented-divergence comment
    // on the event (the surface has no skip field; see core-mod.ts).
    expect(byName.get("validate_uniqueness_of_name")!.at).toBeUndefined();
  });
});

describe("the admin_tasks runner — the core mod's task surface", () => {
  it("runs the matched task's policy when params.task names a basket task", () => {
    const executed: string[] = [];
    const config = {
      ...CORE_TASK_BASKET,
      clear_cache: {
        ...CORE_TASK_BASKET.clear_cache!,
        executePolicy: () => {
          executed.push("clear_cache");
        },
      },
    };
    runTaskFromTaskBasket("clear_cache", config);
    expect(executed).toEqual(["clear_cache"]);
  });

  it("runs nothing when no task is named", () => {
    // self/admin.rb:25 `return unless (task = Env.params[:task]&.to_sym) && ...`
    let ran = false;
    runTaskFromTaskBasket(undefined, {
      ...CORE_TASK_BASKET,
      clear_cache: {
        ...CORE_TASK_BASKET.clear_cache!,
        executePolicy: () => {
          ran = true;
        },
      },
    });
    expect(ran).toBe(false);
  });

  it("refuses irreversible tasks while allow_irreversible_admin_tasks is off", () => {
    // self/admin.rb:40-46 run_task_from_task_basket + :48-52 not_allowed:
    // the message carries the task's LINK TEXT (the en.yml translation),
    // the security sentence, the <br>, and the config-option sentence.
    const task = CORE_TASK_BASKET.empty_trash!; // irreversible: true (the core-admin-facts probe's basket_tasks fact)
    expect(() => runTaskFromTaskBasket("empty_trash", { empty_trash: task })).toThrow(
      PermissionDeniedError,
    );
    expect(() => runTaskFromTaskBasket("empty_trash", { empty_trash: task })).toThrow(
      notAllowedMessage("Empty Trash"),
    );
    expect(notAllowedMessage("Empty Trash")).toBe(
      "The admin task 'Empty Trash' is disabled for security reasons.<br>" +
        "You can enable it with the config option 'allow_irreversible_admin_tasks'",
    );
  });

  it("executes an irreversible task once the config option is on", () => {
    const executed: string[] = [];
    const task = {
      ...CORE_TASK_BASKET.empty_trash!,
      executePolicy: () => {
        executed.push("empty_trash");
      },
    };
    runTaskFromTaskBasket("empty_trash", { empty_trash: task }, {
      allowIrreversibleAdminTasks: true,
    });
    expect(executed).toEqual(["empty_trash"]);
  });

  it("does nothing for a task name outside the basket", () => {
    // basket[:tasks][task] is nil -> the whole event returns early.
    let ran = false;
    runTaskFromTaskBasket("repair_references", {
      clear_cache: {
        ...CORE_TASK_BASKET.clear_cache!,
        executePolicy: () => {
          ran = true;
        },
      },
    });
    expect(ran).toBe(false);
  });
});
