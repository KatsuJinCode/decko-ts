// The EDIT CONFLICT pin (registry row cap-E18, "Two edits at the same time:
// second save refused (conflict)").
//
// ORACLE-PINNED: fixtures/captured/edit-conflict.json, captured from the
// pinned gemset (card-mod-edit-0.20.0, card-mod-history-0.20.0,
// card-1.110.0, card-mod-format-0.20.0) by
// tests/card/mod-loader/oracle-capture-edit-conflict.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/form.rb - the REVISION FIELD: the
//      :conflict_tracker view is `return unless card&.real?`,
//      `card.last_action_id_before_edit = card.last_action_id`, `hidden_field
//      :last_action_id_before_edit, class: "current_revision_id"` - the
//      hidden field IS the revision the form holds.
//   2. card-mod-history-0.20.0 set/all/history/events.rb - the DETECTION:
//      the :detect_conflict event is `event :detect_conflict, :validate, on:
//      :update, when: :edit_conflict?` and `errors.add :conflict,
//      ::I18n.t(:history_error_not_latest_revision)`; and edit_conflict? is
//      `last_action_id_before_edit && last_action_id_before_edit.to_i !=
//      last_action_id && (la = last_action) && la.act.actor_id !=
//      Auth.current_id` - the three clauses: a before-edit id is present, it
//      differs from the current revision, and the last action belongs to
//      somebody else.
//   3. card-1.110.0 lib/card.rb - the ATTRIBUTE: :last_action_id_before_edit
//      is an action-specific attribute.
//   4. card-1.110.0 lib/card/error.rb - the 409: the EditConflict class has
//      `self.status_code = 409` and `self.view = :conflict`, and the KEY_MAP
//      is `{ permission_denied: PermissionDenied, conflict: EditConflict }`.
//   5. card-mod-format-0.20.0 set/all/html/error.rb - the CONFLICT VIEW: the
//      :conflict view renders the "Conflict!" alert whose `<span
//      class="new-current-revision-id">` carries the current revision and
//      whose text says the other actor has also been making changes.
//   6. card-mod-format-0.20.0 assets/script/decko/slotter.js.coffee - the
//      CLIENT: showErrorResponse's 409 branch copies the
//      `.new-current-revision-id` text into the form's `.current_revision_id`
//      value, so the retried save is based on the current revision.
//
// The port side is the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the revision hidden field,
// the history mod (src/card/mod-loader/mods/card-mod-history.ts) for the
// three-clause guard, the action engine
// (src/card/actions/card-action-engine.ts) for the conflict error, the write
// route (src/server/write-routes.ts) for the 409, the render seam
// (src/card/render/views.ts) for the conflict view, and the vendored slotter
// script the engine serves (which IS the pinned gem's own file, digest for
// digest).
//
// The third leg is the harness's own E18 check module, whose six legs must
// all pass: the stale save must be refused with the exact 409, the content
// must be unchanged, the history must be unchanged, the visible form's
// revision must be refreshed, and the retry through the same form must
// persist.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/edit-conflict.json", import.meta.url),
    "utf8",
  ),
);
const portEdit = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-edit.ts",
    import.meta.url,
  ),
  "utf8",
);
const portHistory = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-history.ts",
    import.meta.url,
  ),
  "utf8",
);
const actionEngine = readFileSync(
  new URL(
    "./../../../src/card/actions/card-action-engine.ts",
    import.meta.url,
  ),
  "utf8",
);
const writeRoutes = readFileSync(
  new URL("./../../../src/server/write-routes.ts", import.meta.url),
  "utf8",
);
const renderViews = readFileSync(
  new URL("./../../../src/card/render/views.ts", import.meta.url),
  "utf8",
);
const conflictChecks = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-conflict.mjs",
    import.meta.url,
  ),
  "utf8",
);
const vendoredSlotter = readFileSync(
  new URL(
    "./../../../fixtures/vendor/mod-script-assets/card-mod-format/assets/script/decko/slotter.js.coffee",
    import.meta.url,
  ),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/vendor/mod-script-assets/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("the pinned Ruby's own bytes for the edit conflict", () => {
  it("the form owns the revision hidden field", () => {
    expect(capture.facts.conflict_tracker_guard).toBe(
      "return unless card&.real?",
    );
    expect(capture.facts.conflict_tracker_assignment).toBe(
      "card.last_action_id_before_edit = card.last_action_id",
    );
    expect(capture.facts.conflict_tracker_hidden).toBe(
      'hidden_field :last_action_id_before_edit, class: "current_revision_id"',
    );
  });

  it("the detection owns the three clauses and the conflict error", () => {
    expect(capture.facts.detect_conflict_event).toBe(
      "event :detect_conflict, :validate, on: :update, when: :edit_conflict? do",
    );
    expect(capture.facts.detect_conflict_error).toBe(
      "errors.add :conflict, ::I18n.t(:history_error_not_latest_revision)",
    );
    expect(capture.facts.edit_conflict_clause_present).toBe(
      "last_action_id_before_edit &&",
    );
    expect(capture.facts.edit_conflict_clause_differs).toBe(
      "last_action_id_before_edit.to_i != last_action_id &&",
    );
    expect(capture.facts.edit_conflict_clause_actor).toBe(
      "la.act.actor_id != Auth.current_id",
    );
  });

  it("the error class owns the 409 and the conflict view", () => {
    expect(capture.facts.card_attribute).toBe(
      ":last_action_id_before_edit,  # [Integer]",
    );
    expect(capture.facts.edit_conflict_error_class).toBe(
      "class EditConflict < UserError",
    );
    expect(capture.facts.edit_conflict_error_status).toBe(
      "self.status_code = 409",
    );
    expect(capture.facts.edit_conflict_error_view).toBe(
      "self.view = :conflict",
    );
    expect(capture.facts.error_key_map).toBe(
      "KEY_MAP = { permission_denied: PermissionDenied,\n                  conflict: EditConflict }.freeze",
    );
    expect(capture.facts.conflict_view_name).toBe(
      "view :conflict, cache: :never do",
    );
    expect(capture.facts.conflict_view_alert).toBe('alert "warning" do');
    expect(capture.facts.conflict_view_revision_span).toBe(
      '<span class="new-current-revision-id">#{card.last_action_id}</span>',
    );
    expect(capture.facts.conflict_view_actor_line).toBe(
      "<div>#{actor_link} has also been making changes.</div>",
    );
  });

  it("the client owns the revision refresh", () => {
    expect(capture.facts.client_conflict_status).toBe(
      "if status == 409 #edit conflict",
    );
    expect(capture.facts.client_conflict_revision_copy).toBe(
      "@slot().find('.current_revision_id').val(",
    );
    expect(capture.facts.client_conflict_revision_source).toBe(
      "@slot().find('.new-current-revision-id').text()",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.conflict_tracker.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.detect_conflict_event.gem).toBe(
      "card-mod-history-0.20.0",
    );
    expect(capture.oracle.edit_conflict_error.gem).toBe("card-1.110.0");
    expect(capture.oracle.conflict_view.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.conflict_view.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the pinned bytes", () => {
  it("the client script the port serves IS the pinned gem's own file", () => {
    const pinned = capture.oracle.slotter_conflict_branch.file_sha256;
    expect(sha256(vendoredSlotter)).toBe(pinned);
    const groups = manifest.mods.format as Array<{
      files: Array<{ file: string; sha256: string }>;
    }>;
    const entry = groups
      .flatMap((group) => group.files)
      .find((file) => file.file.endsWith("slotter.js.coffee"));
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe(pinned);
  });

  it("the port's form carries the revision hidden field", () => {
    expect(portEdit).toContain(
      "const value = fmt.card.record.currentRevisionId;",
    );
    expect(portEdit).toContain(
      'return `<input class="current_revision_id form-control" autocomplete="off" type="hidden"${valueAttr} name="${h(name)}" id="${h(id)}" />`;',
    );
  });

  it("the port's guard carries the three clauses the way the pinned one does", () => {
    expect(portHistory).toContain(
      "if (lastActionIdBeforeEdit === null || lastActionIdBeforeEdit === undefined) {",
    );
    expect(portHistory).toContain(
      "if (Number(lastActionIdBeforeEdit) === currentId) return false;",
    );
    expect(portHistory).toContain(
      "return act !== undefined && act.actor_id !== currentUserId;",
    );
  });

  it("the port's engine raises the conflict error the way the pinned event does", () => {
    expect(actionEngine).toContain(
      'const HISTORY_ERROR_NOT_LATEST_REVISION = "changes not based on latest revision";',
    );
    expect(actionEngine).toContain(
      'throw new CardActionError(\n      "conflict",\n      HISTORY_ERROR_NOT_LATEST_REVISION,',
    );
    expect(actionEngine).toContain(
      "{ conflict: HISTORY_ERROR_NOT_LATEST_REVISION },",
    );
  });

  it("the port's write route answers the conflict with the pinned 409", () => {
    expect(writeRoutes).toContain('error.code === "conflict" &&');
    expect(writeRoutes).toContain("status: 409,");
  });

  it("the port's conflict view carries the revision span and the actor line", () => {
    expect(renderViews).toContain(
      "`          <span class=\"new-current-revision-id\">${h(lastActionId)}</span>\\n`",
    );
    expect(renderViews).toContain(
      "`          <div>${actorLink} has also been making changes.</div>\\n`",
    );
  });
});

describe("the harness's E18 check cannot pass vacuously", () => {
  it("names the row's six checks exactly", () => {
    expect(conflictChecks).toContain("export const meta={topic:'conflict',capabilityIds:['E18']};");
    for (const name of [
      "conflict journey signs in both isolated browser actors",
      "both editors hold the same actual revision",
      "member saves the first edit through the visible form",
      "stale admin form receives conflict without overwriting or creating history",
      "conflict response refreshes the visible forms revision",
      "retry through the same form persists after a fresh browser read",
    ]) {
      expect(conflictChecks).toContain(`'${name}',`);
    }
  });

  it("grades the exact 409, the unchanged content and the unchanged history", () => {
    expect(conflictChecks).toContain(
      "rejected.status()===409&&html.includes('new-current-revision-id')&&row()?.db_content===first&&JSON.stringify(beforeHistory)===JSON.stringify(afterHistory)",
    );
    expect(conflictChecks).toContain(
      "const same=editors.admin.revision!==''&&editors.admin.revision===editors.member.revision;",
    );
  });

  it("grades that the same form's retry persists after a fresh browser read", () => {
    expect(conflictChecks).toContain(
      "retried.status()<400&&row()?.db_content===last&&fresh.status()===200&&finalHtml.includes(last)",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("refused");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/edit-conflict.json",
        "utf8",
      ),
    ).toContain('"detect_conflict_event"');
  });
});
