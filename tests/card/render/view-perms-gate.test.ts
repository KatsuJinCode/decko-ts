// The render-format view-permission gate end to end: RenderFormat.renderView
// routing through viewPermissionDenial (src/card/permissions/view-perms.ts)
// with a stub engine supplying the verdict maps — the exact contract the
// real RenderEngine implements via isDenied + the isTaskDenied hook (the
// render.ts wiring is the coordinator patch documented in
// docs/view-perms-notes.md).
//
// Byte contracts proven here:
// - a denied read view is REPLACED by the quiet span (no slot wrapper) —
//   the corpus shape (fixtures/corpus/*: 124,632 "(read)" spans);
// - a denied view configured denial: :blank renders "" (menu, html/menu.rb:8);
// - a perms-:none view renders unchanged on a denied card (title);
// - a denied NON-read task labels the span with its task ("(update)") —
//   the corpus never captures a non-read label (its four views are
//   read/none), so this half is gem-proven, not corpus-proven;
// - the skip_perms render option skips the check (permission.rb:26).

import { describe, it, expect } from "vitest";
import { RenderFormat, type RenderCard, type RenderEngineLike } from "../../../src/card/render/format.js";
import { HTML_VIEWS } from "../../../src/card/render/views.js";
import { DeckoName } from "../../../src/card/name.js";
import type { CardRecord } from "../../../src/card/fetch/card-record.js";
import type { CrudTask } from "../../../src/card/permissions/view-perms.js";

/** A real stored card (id present). */
function card(id: number, name: string, content: string): RenderCard {
  const deckoName = DeckoName.parse(name);
  const record: CardRecord = {
    id,
    codename: undefined,
    leftId: undefined,
    rightId: undefined,
    typeId: undefined,
    dbContent: content,
    trash: false,
    creatorId: undefined,
    updaterId: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    currentRevisionId: undefined,
    readRuleClass: undefined,
    readRuleId: undefined,
    referencesExpired: undefined,
    name: deckoName,
    key: deckoName.key,
    isNew: false,
    fromTrash: false,
    uncacheable: false,
  };
  return {
    record,
    name: deckoName,
    key: deckoName.key,
    typeName: undefined,
    typeId: undefined,
    typeCode: undefined,
    id,
    dbContent: content,
    setKeys: "",
  };
}

interface StubOptions {
  readDenied?: boolean;
  /** task -> ALLOWED, for the engine's taskAllowed hook (write tasks only;
   *  undefined = unverifiable, the canReadByRuleLookup contract). */
  taskAllowedByTask?: Partial<Record<"create" | "update" | "delete", boolean>>;
  withTaskHook?: boolean;
  /** The page chrome session (RenderEngineLike.pageSession): the loud
   *  denial message branches on it (html/error.rb:199-216 Auth.signed_in?). */
  pageSession?: { signedIn: boolean; actorId?: number };
}

function stubEngine(opts: StubOptions): RenderEngineLike {
  const engine: RenderEngineLike = {
    views: HTML_VIEWS,
    fetchRenderCard: () => undefined,
    executeSearch: () => [],
    isDenied: () => opts.readDenied === true,
    resolveView: (_card, view) => HTML_VIEWS[view],
    pageSession: opts.pageSession,
  };
  if (opts.withTaskHook !== false) {
    engine.taskAllowed = (_card, task) => opts.taskAllowedByTask?.[task];
  }
  return engine;
}

describe("render-format view-permission gate", () => {
  it("replaces a read-denied view with the quiet span (corpus bytes)", () => {
    const fmt = new RenderFormat(card(1, "Secret Thing", "body"), stubEngine({ readDenied: true }));
    expect(fmt.renderView("content")).toBe(
      '<span class="denied"><!-- Sorry, you don\'t have permission (read) --></span>',
    );
  });

  it("renders a read-denied menu as blank (denial: :blank, html/menu.rb:8)", () => {
    const fmt = new RenderFormat(card(1, "Secret Thing", "body"), stubEngine({ readDenied: true }));
    expect(fmt.renderView("menu")).toBe("");
  });

  it("renders the perms-:none title unchanged on a denied card", () => {
    const denied = new RenderFormat(
      card(1, "Secret Thing", "body"),
      stubEngine({ readDenied: true }),
    );
    const allowed = new RenderFormat(card(1, "Secret Thing", "body"), stubEngine({}));
    expect(denied.renderView("title")).toBe(allowed.renderView("title"));
    expect(denied.renderView("title")).toContain("card-title");
  });

  it("labels a denied update task in the quiet span", () => {
    const fmt = new RenderFormat(
      card(1, "Secret Thing", "body"),
      stubEngine({ readDenied: false, taskAllowedByTask: { update: false } }),
    );
    // The check runs BEFORE dispatch (permission.rb:19-23 ->
    // view.rb:85-88 ok_view before render.rb:59-63 view_method), so the
    // denial replaces the view without ever consulting the registry —
    // this holds whether or not :edit is registered on the flat record
    // (it is, since the board/edit flat seam; the denial short-circuits
    // first either way).
    expect(fmt.renderView("edit")).toBe(
      '<span class="denied"><!-- Sorry, you don\'t have permission (update) --></span>',
    );
  });

  it("renders an update-allowed view body through to dispatch", () => {
    const fmt = new RenderFormat(
      card(1, "Open Thing", "visible body"),
      stubEngine({ readDenied: false, taskAllowedByTask: { update: true } }),
    );
    expect(fmt.renderView("content")).toContain("visible body");
  });

  it("renders without the check when the options carry skip_perms", () => {
    const fmt = new RenderFormat(card(1, "Secret Thing", "body"), stubEngine({ readDenied: true }));
    // :core's body is process_content(_render_raw) (base.rb:85-87) - no
    // permission-checked sub-render - so the skipped check shows directly.
    // (:content would still show the inner denial span: html/views.rb:12-14
    // renders render_core with a fresh, unchecked-opts voo - Ruby-correct.)
    expect(fmt.renderView("core", { skip_perms: true })).toBe("body");
  });

  it("falls through to dispatch when no task hook is installed", () => {
    // Engines without isTaskDenied (the current RenderEngine until the
    // coordinator patch lands) leave non-read tasks unverified-allowed:
    // the check falls through to DISPATCH, which renders the REAL edit
    // view — Ruby's shape all along (the gate's ok_view runs before
    // render.rb's view_method, and a passed check hands the view to the
    // format). Before the board/edit flat seam this arm could only observe
    // the fall-through through :edit's unsupported-view raise (the view
    // was then unregistered loader-less); the seam registered set/all/edit
    // in the compiled record, so the fall-through now lands in the real
    // body — the pin follows the behavior, not the old stand-in raise.
    const fmt = new RenderFormat(
      card(1, "Secret Thing", "body"),
      stubEngine({ readDenied: false, withTaskHook: false }),
    );
    const html = fmt.renderView("edit");
    // the real :edit bytes: the edit-form modal wrapper and its form —
    // and no permission denial anywhere (the gate passed, so the fall-
    // through must not have been diverted into the quiet span).
    expect(html).toContain("card-form slotter autosave");
    expect(html).not.toContain('<span class="denied">');
  });

  it("never checks unknown cards (alter_unknown owns them)", () => {
    const unknownCard = card(1, "Ghost Thing", "");
    unknownCard.unknown = true;
    unknownCard.id = undefined;
    const fmt = new RenderFormat(
      unknownCard,
      stubEngine({ readDenied: true, taskAllowedByTask: { update: false } }),
    );
    // alter_unknown substitutes the view; no denial span may appear.
    expect(fmt.renderView("content")).not.toContain("denied");
  });

  // R3.4.d's isMain arm (html/error.rb:75-77 focal? ? loud_denial :
  // quiet_denial): the PAGE path constructs the format with main:true
  // (page.ts:252-255, Ruby's show-path main!), so the denial renders the
  // LOUD frame as the main content instead of the quiet span. The corpus
  // pins the anonymous branch's full page bytes
  // (focal-denial-page-corpus-replay.test.ts, 4 exemplars byte-exact);
  // these units pin the branch ROUTING and the signed-in message bytes the
  // corpus cannot capture (its viewer is always Anonymous) — the same bytes
  // the live-Ruby probe tmp/wrong-goal-hunt/focal-denial-ruby-probe/
  // signed-in-loud-denial-probe.rb extracts (loud_denial_message
  // `when Auth.signed_in?` -> format_need_permission_task + format_denied_task
  // = "You need permission to read this.").
  it("renders the loud denial frame on a denied MAIN (page-focal) card", () => {
    const fmt = new RenderFormat(card(1, "Secret Thing", "body"), stubEngine({ readDenied: true }), {
      main: true,
    });
    const html = fmt.renderView("titled");
    // the loud frame AS the content: slot id/class carry the substituted
    // view, data-slot keeps the REQUESTED view (the oracle's dual
    // attribution), frame header + Sorry! heading + the anonymous message.
    expect(html).toContain('id="secret_thing-denial-view"');
    expect(html).toContain("denial-view");
    expect(html).toContain("&quot;view&quot;:&quot;titled&quot;");
    expect(html).toContain("<h1>Sorry!</h1>");
    expect(html).toContain(
      '<div><div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ' +
        '<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to read this.</div></div>',
    );
    expect(html).not.toContain('<span class="denied">');
  });

  // format/error.rb:27-31 view_for_denial: `root.error_status = 403 if
  // focal? && voo.root?`. The page answers 403 when its main card's root
  // view is denied; nothing else sets the status.
  it("sets the page status to 403 when the MAIN card's root view is read-denied", () => {
    const engine = stubEngine({ readDenied: true });
    new RenderFormat(card(1, "Secret Thing", "body"), engine, { main: true }).renderView("titled");
    expect(engine.pageErrorStatus).toBe(403);
  });

  it("leaves the page status alone for a denied NESTED (non-main) card", () => {
    const engine = stubEngine({ readDenied: true });
    new RenderFormat(card(1, "Secret Thing", "body"), engine).renderView("titled");
    expect(engine.pageErrorStatus).toBeUndefined();
  });

  it("leaves the page status alone for a readable main card", () => {
    const engine = stubEngine({});
    new RenderFormat(card(1, "Open Thing", "body"), engine, { main: true }).renderView("titled");
    expect(engine.pageErrorStatus).toBeUndefined();
  });

  it("renders the signed-in loud denial message branch", () => {
    const fmt = new RenderFormat(
      card(1, "Secret Thing", "body"),
      stubEngine({ readDenied: true, pageSession: { signedIn: true, actorId: 300 } }),
      { main: true },
    );
    const html = fmt.renderView("titled");
    expect(html).toContain("<h1>Sorry!</h1>");
    expect(html).toContain("<div>You need permission to read this.</div>");
    // sign_in_or_up_links returns nil when signed in (error.rb:145-146) —
    // the anonymous links must not render.
    expect(html).not.toContain("signin-link");
    expect(html).not.toContain("signup-link");
  });
});

describe("taskAllowed hook contract", () => {
  it("receives only non-read tasks (read rides isDenied)", () => {
    const seen: string[] = [];
    const engine = stubEngine({ readDenied: false });
    engine.taskAllowed = (_card, task: Exclude<CrudTask, "read">) => {
      seen.push(task);
      return false;
    };
    const fmt = new RenderFormat(card(1, "Thing", "body"), engine);
    fmt.renderView("content"); // read task -> isDenied, hook untouched
    expect(seen).toEqual([]);
    fmt.renderView("edit"); // update task -> hook, then the (update) denial
    expect(seen).toEqual(["update"]);
    expect(fmt.voo).toBeUndefined();
  });
});
