// View-registry-directives ORACLE replay (R3.1.a / R3.1.b / R3.4.b): the
// captured live html view registry — its directive table (perms / denial /
// unknown per view), the zero-arity view callables, and the behavior arms —
// replayed against the port's view-permission seam.
//
// Capture: fixtures/captured/view-registry-directives-oracle.json, written by
// tools/oracle/capture-view-registry-directives.rb inside the booted decko
// oracle app (bundle exec decko runner). READ-ONLY capture — the fixture
// carries the no-write proof (card_actions 5018 before == 5018 after), and
// this suite asserts it before anything else so a future re-capture that
// wrote cannot silently become this contract's oracle.
//
// Ruby truth under test (mirrors the fixture's ruby_truth block):
// - view_perms (card-1.110.0 lib/card/view/permission.rb:13-15)
//   `setting(:perms) || :read` — the captured table resolves every view's
//   perms literal (nil where the definition carries no directive).
// - view_method (lib/card/format/render.rb:59-66) — every captured view
//   callable has ZERO-arity parameters (all 776 entries).
// - skip_check? (permission.rb:25-27): the skip_perms render option and the
//   UNDERSCORE render form (lib/card/format/method_delegation.rb:5-9,48-55)
//   both bypass the check — the captured admin / skip_perms / underscore
//   :edit_inline forms are byte-identical (1698 bytes each).
// - view_for_denial (lib/card/format/error.rb:27-31): the default :denial
//   view renders the quiet span (card-mod-format set/all/html/error.rb
//   quiet_denial); `denial: :blank` views (menu.rb:8 menu, menu.rb:16
//   edit_link, follow base_views.rb:6 list_of_changes) render "".

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  quietDenial,
  resolveViewPerms,
  viewDenialView,
  viewPermissionDenial,
  type ViewPermsGateInput,
} from "../../../src/card/permissions/view-perms.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface CapturedView {
  perms: string | null;
  denial: string | null;
  unknown: string | null;
  method_parameters: string[][];
}
interface CapturedCard {
  name: string;
  type: string;
  view_count: number;
  views: Record<string, CapturedView>;
}
interface Fixture {
  no_write_proof: { card_actions_unchanged: boolean; card_actions: number; cards: number };
  survey: CapturedCard[];
  behavior: Record<string, string>;
  deck_artifacts: Record<string, string>;
}

const fixture: Fixture = JSON.parse(
  readFileSync(`${REPO_ROOT}/fixtures/captured/view-registry-directives-oracle.json`, "utf8"),
);

/** The gate input for a viewer every CRUD task denies (the captured
 *  Anonymous viewer on "Oracle Basics" is read-denied — its :title/:url
 *  arms render anyway because those views are perms :none). */
function deniedGate(renderOpts: Record<string, unknown> = {}): ViewPermsGateInput {
  return { renderOpts, taskAllowed: () => false };
}

describe("no-write proof (capture validity)", () => {
  it("the capture wrote nothing: card_actions unchanged", () => {
    expect(fixture.no_write_proof.card_actions_unchanged).toBe(true);
    expect(fixture.no_write_proof.card_actions).toBe(5018);
  });
});

describe("R3.1.a: the captured directive table resolves through the port registry", () => {
  it("every captured view's perms literal matches resolveViewPerms (all surveyed cards)", () => {
    // captured perms null -> Ruby's `setting(:perms) || :read` fallback;
    // captured "none" -> check:false; a CRUD task -> that task.
    for (const card of fixture.survey) {
      for (const [view, captured] of Object.entries(card.views)) {
        const resolution = resolveViewPerms(view);
        if (captured.perms === null) {
          expect(resolution, `${card.name} ${view}`).toEqual({
            check: true,
            predicate: false,
            task: "read",
          });
        } else if (captured.perms === "none") {
          expect(resolution, `${card.name} ${view}`).toEqual({ check: false });
        } else if (["read", "create", "update", "delete"].includes(captured.perms)) {
          expect(resolution, `${card.name} ${view}`).toEqual({
            check: true,
            predicate: false,
            task: captured.perms,
          });
        } else {
          // a METHOD-predicate perms directive (permission.rb:61 `format.send
          // task`) — e.g. configure_button's can_configure?, captured on the
          // set cards whose format registries carry the set-scoped views.
          expect(resolution, `${card.name} ${view}`).toEqual({
            check: true,
            predicate: true,
            task: captured.perms,
          });
        }
      }
    }
  });

  it("every captured view's denial literal matches viewDenialView (all surveyed cards)", () => {
    for (const card of fixture.survey) {
      for (const [view, captured] of Object.entries(card.views)) {
        expect(viewDenialView(view), `${card.name} ${view}`).toEqual(
          captured.denial ?? undefined,
        );
      }
    }
  });

  it("shared views carry identical directives across all surveyed cards", () => {
    // The view SETS differ per card (set cards expose set-scoped views:
    // *read 192, *all 202, basic/RichText 191) — the port's flat registry
    // keys the NAME, so what must hold is: wherever a view appears on
    // several cards, its directive row is identical.
    const seen = new Map<string, CapturedView>();
    for (const card of fixture.survey) {
      for (const [view, captured] of Object.entries(card.views)) {
        const prior = seen.get(view);
        if (prior) {
          expect(
            { perms: captured.perms, denial: captured.denial },
            `${card.name} ${view}`,
          ).toEqual({ perms: prior.perms, denial: prior.denial });
        } else {
          seen.set(view, captured);
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(190);
  });

  it("R3.1.a's callable arm: every captured view method is zero-arity", () => {
    // render.rb:59-66 view_method — the Method object's parameters; all 776
    // captured entries are [] (the html view dispatch passes no view args).
    let count = 0;
    for (const card of fixture.survey) {
      for (const [view, captured] of Object.entries(card.views)) {
        expect(captured.method_parameters, `${card.name} ${view}`).toEqual([]);
        count += 1;
      }
    }
    expect(count).toBe(776);
  });

  it("the capture surveyed the oracle deck's html registry at the recorded size", () => {
    for (const card of fixture.survey) {
      expect(Object.keys(card.views).length).toBe(card.view_count);
    }
  });
});

describe("R3.1.b: skip_check? — the option, the underscore form, perms :none", () => {
  it("skip_perms renders a guarded view the denial would have replaced", () => {
    // captured: Anonymous + skip_perms renders the FULL :edit_inline form
    // (1698 bytes) on a read-denied card whose :edit_inline is :update.
    expect(
      viewPermissionDenial("edit_inline", deniedGate({ skip_perms: true })),
    ).toBeUndefined();
  });

  it("the captured admin, skip_perms, and underscore forms are byte-identical", () => {
    // method_delegation.rb:48-55 — `_render_<view>` sets skip_perms, so the
    // underscore arm must equal the option arm AND the allowed (admin) arm.
    const admin = fixture.behavior["guarded_update_admin_edit_inline"];
    const option = fixture.behavior["guarded_update_anonymous_skip_perms"];
    const underscore = fixture.behavior["guarded_update_anonymous_underscore_form"];
    expect(admin.length).toBe(1698);
    expect(option).toBe(admin);
    expect(underscore).toBe(admin);
  });

  it("perms-:none views render for a viewer every task denies (:title, :url)", () => {
    // captured: Anonymous renders both :title and :url on the read-denied
    // "Oracle Basics" with no denial substitution.
    expect(viewPermissionDenial("title", deniedGate())).toBeUndefined();
    expect(viewPermissionDenial("url", deniedGate())).toBeUndefined();
  });

  it("without the bypass the guarded view denies", () => {
    // the gate fires for the :update task; the capture cannot pin the
    // BYTES on this deck (the anonymized deck's update-rule fetch gap —
    // deck_artifacts in the fixture), so this pins the DECISION, not bytes.
    const denial = viewPermissionDenial("edit_inline", deniedGate());
    expect(denial).toBeDefined();
    expect(viewDenialView("edit_inline")).toBeUndefined(); // default :denial view
  });
});

describe("R3.4.b: view_for_denial — the default span and the :blank registry", () => {
  it("the default denial view renders the captured quiet span byte-exact", () => {
    // captured on BOTH a basic card and a set card (both read-denied):
    // `<span class="denied"><!-- Sorry, you don't have permission (read) -->
    //  </span>`
    expect(fixture.behavior["guarded_read_anonymous_titled_denial_basic"]).toBe(
      quietDenial("read"),
    );
    expect(fixture.behavior["guarded_read_anonymous_titled_denial_set_card"]).toBe(
      quietDenial("read"),
    );
  });

  it("denial: :blank views render the empty string (menu, edit_link, list_of_changes)", () => {
    // menu.rb:8 (menu), menu.rb:16 (edit_link), follow base_views.rb:6
    // (list_of_changes) — captured Anonymous arms are all "".
    expect(fixture.behavior["denial_blank_substitution_menu"]).toBe("");
    expect(fixture.behavior["denial_blank_substitution_edit_link"]).toBe("");
    expect(viewPermissionDenial("menu", deniedGate())).toBe("");
    expect(viewPermissionDenial("edit_link", deniedGate())).toBe("");
    expect(viewPermissionDenial("list_of_changes", deniedGate())).toBe("");
  });

  it("the fixture records the anonymized deck's fetch gap separately from behavior", () => {
    // The oracle deck has no usable junction-name lexicon: the update RULE
    // fetch behind ok?(:update) raises NoMethodError (item_cards on nil) for
    // a card Anonymous cannot read. That is the DECK's artifact, not the
    // view-registry contract — recorded under deck_artifacts so no future
    // reader mistakes it for Ruby truth the port must replay.
    expect(fixture.deck_artifacts["guarded_update_anonymous_default_denial"]).toMatch(
      /^CAPTURE_ERROR: NoMethodError/,
    );
    expect(fixture.deck_artifacts["update_permission_check_itself"]).toMatch(
      /^CAPTURE_ERROR: NoMethodError/,
    );
  });
});
