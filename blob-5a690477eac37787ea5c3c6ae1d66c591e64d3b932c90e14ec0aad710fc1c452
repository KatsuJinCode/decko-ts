// The mod-porting-harness probe for card-mod-follow — the TRACKED standing
// net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-follow.harness.jsonl, produced by
// `node tools/mod-porting-harness/mod-harness.mjs capture card-mod-follow`).
//
// The capture holds the wave-1 census views' oracle lines: :subedit_notice
// + :follower (set/all/notify/base_views.rb — the BASE format block),
// :rule_editor (set/right/following.rb:32-38) and :errors
// (set/type_plus_right/user/follow.rb:65-78), extracted VERBATIM by the
// static-ruby script tools/mod-porting-harness/ruby-oracles/card-mod-follow/
// follow-census-views.rb under the real interpreter (ruby 3.3.12).
//
// Section A replays the oracle lines through the exported composition
// cores (followProbeSurface — the SAME functions the view bodies call).
// Section B renders the views through the SEEDED runtime engine: the
// subedit_notice rows ride the render-time history seam (render.ts
// HISTORY_SEAM_VIEWS), the rule_editor dispatch rides the follow seam
// (follow-render-seam.ts's rule_editor branch) and the rules mod's ported
// rule_form surface.
//
// RED discipline: while these views are unported, every scenario fails
// here — that failure IS the harness working.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  bindModLoaderToEngine,
  seedCard,
  seedAct,
  seedAction,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModContent from "../../../src/card/mod-loader/mods/card-mod-content.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import cardModFollow, {
  followProbeSurface,
} from "../../../src/card/mod-loader/mods/card-mod-follow.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  bytes?: string;
  title?: string;
  classy?: string;
  body?: string;
  superBytes?: string;
  preferenceName?: string;
}

function followOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-follow.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine);
}

// --- the documented action shapes (the oracle's ActionDouble analogs) ------

const CARD_NAME = "Oracle Basics";
const CREATE_ROWS = [
  { field: "cardtype" as const, shown: "Basic", label: "" },
  { field: "content" as const, shown: "Hello world", label: "" },
];
const UPDATE_RENAMED_ROWS = [
  { field: "name" as const, shown: "Oracle Basics Renamed", label: "new" },
  { field: "content" as const, shown: "New content", label: "new" },
];
const UPDATE_CONTENT_ROWS = [
  { field: "content" as const, shown: "New content", label: "new" },
];
const DELETE_ROWS = [
  { field: "content" as const, shown: "Old content", label: "deleted" },
];

// --- the seeded runtime (section B) ----------------------------------------

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the type + codename vocabulary
  await seedCard(s, { id: 2, name: "Basic", typeId: 2 }); // the Basic cardtype
  await seedCard(s, { id: 4, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 120, name: "*following", codename: "following", typeId: 14 });
  // the follow-option cards (the applied-string arm's subformat targets)
  await seedCard(s, { id: 150, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 151, name: "*never", codename: "never", typeId: 14 });

  // the subedit_notice fixture: the card + its create action + the changed
  // fields (name=0/type_id=1/db_content=2, the 0-based TRACKED_FIELDS codes)
  await seedCard(s, { id: 400, name: "Oracle Basics", typeId: 2 });
  await seedAct(s, { id: 500, cardId: 400, actorId: 1 });
  await seedAction(s, { id: 9001, cardId: 400, actId: 500, actionType: 0 });
  await s.counting.query(
    `INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)`,
    [9001, 0, "Oracle Basics"],
  );
  await s.counting.query(
    `INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)`,
    [9001, 1, "2"],
  );
  await s.counting.query(
    `INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)`,
    [9001, 2, "Hello world"],
  );
  // a second (update) action for the explicit-action_id arm: the card was
  // RENAMED (previous name) + the content changed; no type change.
  await seedAct(s, { id: 501, cardId: 400, actorId: 1 });
  await seedAction(s, { id: 9002, cardId: 400, actId: 501, actionType: 1 });
  await s.counting.query(
    `INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)`,
    [9002, 0, "Oracle Basics Renamed"],
  );
  await s.counting.query(
    `INSERT INTO card_changes (card_action_id, field, value) VALUES (?, ?, ?)`,
    [9002, 2, "New content"],
  );

  // the rule_editor fixtures: the actor + the following junction (+ the
  // junction rows the preference rule's left chain needs)
  await seedCard(s, { id: 300, name: "Joe User", typeId: 4 });
  await seedCard(s, { id: 310, name: "OracleProbe", typeId: 2 });
  await seedCard(s, {
    id: 311,
    name: "OracleProbe+*following",
    leftId: 310,
    rightId: 120, // +following
    typeId: 14,
    dbContent: "following junction body",
  });
  // the SELF-set junction + the APPLIED preference rule ("*always") — the
  // applied-string arm's walk answers this rule's content
  await seedCard(s, {
    id: 320,
    name: "OracleProbe+*self",
    leftId: 310,
    rightId: 11,
    typeId: 13,
  });
  await seedCard(s, {
    id: 321,
    name: "OracleProbe+*self+Joe User",
    leftId: 320,
    rightId: 300,
    typeId: 2,
  });
  await seedCard(s, {
    id: 322,
    name: "OracleProbe+*self+Joe User+*follow",
    leftId: 321,
    rightId: 110,
    typeId: 14,
    dbContent: "*always",
  });
  // the errors fixture: the User+*follow junction (the errors view's set)
  await seedCard(s, {
    id: 330,
    name: "Joe User+*follow",
    leftId: 300,
    rightId: 110,
    typeId: 14,
    dbContent: "follow junction body",
  });
  // the NO-RULE rule_editor fixture: a second following junction whose left
  // carries no preference rule for the actor
  await seedCard(s, { id: 340, name: "OtherProbe", typeId: 2 });
  await seedCard(s, {
    id: 341,
    name: "OtherProbe+*following",
    leftId: 340,
    rightId: 120,
    typeId: 14,
    dbContent: "following junction body",
  });

  // the rule_form CHAIN loads with it: the rules mod's rule_form renders
  // content_formgroup through the edit/content mods (the rules-nest
  // oracle-pinned suite's load list, follow appended last)
  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModContent },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
    { manifest: cardModFollow },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

// --- section A: the oracle replay through the composition cores -------------

describe("card-mod-follow harness probe: the wave-1 oracle replay", () => {
  const oracles = followOracles();

  it("the harness captured the follow oracle lines", () => {
    expect(oracles.length).toBe(11);
  });

  it("replays follower (base_views.rb:41-43)", () => {
    const line = oracles.find((l) => l.scenario === "follower_no_active_notice");
    expect(line).toBeDefined();
    expect(followProbeSurface.followerFrom()).toEqual(line!.bytes);
  });

  it("replays subedit_notice create (base_views.rb:25-31)", () => {
    const line = oracles.find((l) => l.scenario === "subedit_notice_create_action");
    expect(line).toBeDefined();
    expect(
      followProbeSurface.subeditNoticeFrom({
        headerName: CARD_NAME,
        actionType: "create",
        rows: CREATE_ROWS,
      }),
    ).toEqual(line!.bytes);
  });

  it("replays subedit_notice renamed update (name_before_action's previous arm)", () => {
    const line = oracles.find((l) => l.scenario === "subedit_notice_update_name_change");
    expect(line).toBeDefined();
    expect(
      followProbeSurface.subeditNoticeFrom({
        headerName: CARD_NAME, // the PREVIOUS name rides the header
        actionType: "update",
        rows: UPDATE_RENAMED_ROWS,
      }),
    ).toEqual(line!.bytes);
  });

  it("replays subedit_notice content-only update + delete (the label arms)", () => {
    const contentLine = oracles.find(
      (l) => l.scenario === "subedit_notice_update_no_name_change",
    );
    expect(contentLine).toBeDefined();
    expect(
      followProbeSurface.subeditNoticeFrom({
        headerName: CARD_NAME,
        actionType: "update",
        rows: UPDATE_CONTENT_ROWS,
      }),
    ).toEqual(contentLine!.bytes);
    const deleteLine = oracles.find((l) => l.scenario === "subedit_notice_delete_action");
    expect(deleteLine).toBeDefined();
    expect(
      followProbeSurface.subeditNoticeFrom({
        headerName: CARD_NAME,
        actionType: "delete",
        rows: DELETE_ROWS,
      }),
    ).toEqual(deleteLine!.bytes);
  });

  it("replays rule_editor's dispatch contracts (following.rb:32-38)", () => {
    // no existing preference: the dispatch lands on the NEW rule_context
    // card at preference_name
    const noRule = oracles.find(
      (l) => l.scenario === "rule_editor_no_existing_preference",
    );
    expect(noRule).toBeDefined();
    const prefName = noRule!.preferenceName!;
    const dispatch = followProbeSurface.ruleEditorDispatchFrom({
      targetName: prefName,
      ruleContextName: prefName,
    });
    expect(dispatch).toEqual({
      targetName: prefName,
      ruleContextName: prefName,
      successView: "open",
      formType: "modal",
    });
    // the oracle's echo embeds the SAME contract
    expect(noRule!.bytes).toContain(`card=${prefName}`);
    expect(noRule!.bytes).toContain(`rule_context=${prefName}`);
    expect(noRule!.bytes).toMatch(/^<div class="edit-rule">/);
    expect(noRule!.bytes).toMatch(/<\/div>$/);

    // applied preference: the string arm's target is the OPTION CARD and
    // the render RAISES (rule? false on the simple card) - the quiet
    // rescue bytes name the rule_editor render
    const applied = oracles.find(
      (l) => l.scenario === "rule_editor_existing_preference_string",
    );
    expect(applied).toBeDefined();
    expect(applied!.bytes).toEqual("Error rendering: Joe+*following (rule_editor view)");
  });

  it("replays the errors arms (user/follow.rb:65-78)", () => {
    const noErrors = oracles.find((l) => l.scenario === "errors_no_errors");
    expect(noErrors).toBeDefined();
    expect(noErrors!.bytes).toEqual("");
    const perm = oracles.find((l) => l.scenario === "errors_permission_denied_arm");
    expect(perm).toBeDefined();
    const arm = followProbeSurface.userFollowErrorsPermissionArm("Joe User");
    expect(arm.title).toEqual(perm!.title);
    expect(arm.classy).toEqual(perm!.classy);
    expect(arm.body).toEqual(perm!.body);
    const sup = oracles.find((l) => l.scenario === "errors_super_arm");
    expect(sup).toBeDefined();
    expect(followProbeSurface.errorsSuperBytes()).toEqual(sup!.superBytes);
  });
});

// --- section B: the views through the seeded runtime engine -----------------

describe("card-mod-follow harness probe: the ported views through the engine", () => {
  // subedit_notice lives in all/notify/base_views.rb's BARE `format do`
  // block, and so do the wrap helpers the oracle scenarios were taken
  // through: base_views.rb:105-115 wrap_list_item/wrap_subedit_item
  // ("#{item}\n" / "\n#{yield}\n") - the BYTES the harness captured. The
  // html format overrides exactly those two helpers (all/notify/
  // html_views.rb:10-16: "<li>#{item}</li>\n" / "<li>#{yield}</li>\n"),
  // so these renders answer in a NON-html format (Ruby's own :text, one
  // of the deck's format classes). The html arm is pinned separately,
  // below, so both formats' bytes are netted.
  const TEXT_FORMAT = "text";

  it("renders subedit_notice for an explicit action_id (Action.fetch arm)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Basics", "subedit_notice", {
      viewOpts: { action_id: "9001" },
      format: TEXT_FORMAT,
    });
    // the create action's rows, byte-exact against the oracle scenario
    expect(html).toBe(
      "\nOracle Basics created\n   cardtype: Basic\n   content: Hello world\n\n",
    );
  });

  it("renders subedit_notice for the renamed-update action (the previous-name header)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Basics", "subedit_notice", {
      viewOpts: { action_id: "9002" },
      format: TEXT_FORMAT,
    });
    // action 9002 renamed the card + changed content; the header carries
    // the PREVIOUS name
    expect(html).toBe(
      "\nOracle Basics updated\n  new name: Oracle Basics Renamed\n  new content: New content\n\n",
    );
  });

  it("renders subedit_notice with no action_id (the card.last_action default)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Basics", "subedit_notice", {
      format: TEXT_FORMAT,
    });
    // voo.action_id nil -> card.last_action = the card's LATEST action
    // (9002, the renamed update) - the seam's cardLastAction
    expect(html).toBe(
      "\nOracle Basics updated\n  new name: Oracle Basics Renamed\n  new content: New content\n\n",
    );
  });

  it("renders subedit_notice in html (the html_views.rb wrap overrides)", async () => {
    const s = storage!;
    // the html block's wrap_subedit_item wraps the WHOLE item and
    // wrap_list_item wraps each row - the base bytes' <li> forms
    const html = await s.engine.render("Oracle Basics", "subedit_notice", {
      viewOpts: { action_id: "9001" },
    });
    expect(html).toBe(
      "<li>Oracle Basics created\n" +
        "<li>   cardtype: Basic</li>\n" +
        "<li>   content: Hello world</li>\n" +
        "</li>\n",
    );
  });

  it("renders follower (the page arm of the base view)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Basics", "follower");
    expect(html).toBe("follower");
  });

  it("renders rule_editor with no existing rule (the new rule_context dispatch)", async () => {
    const s = storage!;
    // signed in as Joe User; OtherProbe carries NO preference rule, so the
    // dispatch lands on the NEW pointer card at preference_name
    s.engine.pageSession = { signedIn: true, actorId: 300 };
    const html = await s.engine.render("OtherProbe+*following", "rule_editor");
    s.engine.pageSession = undefined;
    expect(html).toMatch(/^<div class="edit-rule">/);
    expect(html).toMatch(/<\/div>$/);
    // the rules mod's rule_form bytes ride the dispatch: the success mark
    // is the RULE CONTEXT's url key (rule_form.rb:48 + 66-69, the
    // editRuleSuccessHash rule_context opt) and the modal form_type drives
    // the close button
    expect(html).toContain(`name="success[mark]"`);
    expect(html).toContain(`value="OtherProbe+*self+Joe_User+*follow"`);
    expect(html).toContain(`name="success[view]" id="success_view" value="open"`);
    expect(html).toContain(`data-cy="submit-modal"`);
  });

  it("renders rule_editor with an applied rule (the string arm raises)", async () => {
    const s = storage!;
    // the deck HOLDS the applied rule ("*always") for Joe User on
    // OracleProbe+*self - the string arm fetches the *always OPTION CARD
    // and the Rule pattern does not apply to it: the dispatch raises
    // (the oracle's scenario 8 pins the quiet-rescue contract)
    s.engine.pageSession = { signedIn: true, actorId: 300 };
    await expect(
      s.engine.render("OracleProbe+*following", "rule_editor"),
    ).rejects.toThrow(/rule_form/);
    s.engine.pageSession = undefined;
  });

  it("renders errors on the User+*follow card (the no-errors arm)", async () => {
    const s = storage!;
    const html = await s.engine.render("Joe User+*follow", "errors");
    // card.errors.any? is false for every fetched card - the view's
    // reachable arm returns nil -> ""
    expect(html).toBe("");
  });
});
