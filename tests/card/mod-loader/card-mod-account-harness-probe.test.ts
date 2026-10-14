// The mod-porting-harness probe for card-mod-account — the TRACKED standing
// net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-account.harness.jsonl, produced by
// `node tools/mod-porting-harness/mod-harness.mjs capture card-mod-account`).
//
// The capture holds the wave-1 census views' oracle lines: :new +
// :new_buttons (set/type/signup/views.rb), :edit (set/self/signin.rb:154-157,
// the FORGOT-PASSWORD form's voo contract) and :account_tab
// (set/abstract/account_holder.rb:132-137, the board pill sections over the
// verbatim item walks), extracted VERBATIM by the static-ruby script
// tools/mod-porting-harness/ruby-oracles/card-mod-account/
// account-census-views.rb under the real interpreter (ruby 3.3.12).
//
// Replayed against the exported composition cores (accountProbeSurface —
// the SAME functions the view bodies call), plus the ENGINE render of the
// signup :new super() dispatch (the edit mod's live newView under the
// loader).
//
// RED discipline: while these views are unported, every scenario fails
// here — that failure IS the harness working.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModAccount, {
  accountProbeSurface,
} from "../../../src/card/mod-loader/mods/card-mod-account.js";
import {
  preparedSetupVerdict,
  setPreparedSetupVerdict,
} from "../../../src/card/auth/first-run-setup-verdict-seam.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  bytes?: string;
  title?: string;
  dispatch?: string;
  reachable?: boolean;
  editStructure?: string[];
  hide?: string[];
  nestSeams?: string[];
  normalizedConfigs?: Array<[string, Record<string, string>]>;
  signupMultiCardArm?: boolean;
  hiddenFields?: Record<string, unknown>;
  hiddenFieldsBytes?: string;
  setupButtonBytes?: string;
  buttonsGroupBytes?: string;
  voo?: Record<string, unknown>;
  predicate?: string;
  seam?: string;
}

function accountOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-account.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine);
}

// --- the seeded runtime (the signup :new super dispatch) ---------------------

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the type + codename vocabulary the create-form walk reads
  await seedCard(s, { id: 2, name: "Basic", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the Sign up cardtype + a probe card of that type
  await seedCard(s, { id: 5, name: "Sign Up", codename: "signup", typeId: 2 });
  await seedCard(s, { id: 400, name: "Probe Signup", typeId: 5 });
  // the walk's cards: the +*account trait + its email/password field cards
  // (the account_formgroups dispatch target + the nested editors)
  await seedCard(s, { id: 401, name: "Probe Signup+*account", leftId: 400, rightId: 507, typeId: 52 });
  // the junction rights resolve through the tag cards
  await seedCard(s, { id: 505, name: "email", typeId: 2 });
  await seedCard(s, { id: 506, name: "password", typeId: 2 });
  await seedCard(s, { id: 507, name: "*account", codename: "account", typeId: 14 });
  await seedCard(s, { id: 402, name: "Probe Signup+*account+email", leftId: 401, rightId: 505, typeId: 52 });
  await seedCard(s, { id: 403, name: "Probe Signup+*account+password", leftId: 401, rightId: 506, typeId: 52 });
  // the setup render's vocabulary: the User cardtype + a User card + the
  // admin's own account trait + field cards (the setup form's walk target)
  await seedCard(s, { id: 6, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 404, name: "Probe Admin", typeId: 6 });
  await seedCard(s, { id: 405, name: "Probe Admin+*account", leftId: 404, rightId: 507, typeId: 52 });
  await seedCard(s, { id: 406, name: "Probe Admin+*account+email", leftId: 405, rightId: 505, typeId: 52 });
  await seedCard(s, { id: 407, name: "Probe Admin+*account+password", leftId: 405, rightId: 506, typeId: 52 });
  // the create-permission grant the :new gate reads (the follow suite's
  // *all+*update recipe, widened to create: real decks bootstrap
  // *all+*create off the *all set; [[Anyone]] one step wider than
  // real.yml's Anyone Signed In default - the suite isolates DISPATCH)
  await seedCard(s, { id: 310, name: "*create", codename: "create", typeId: 14 });
  await seedCard(s, { id: 311, name: "Anyone", codename: "anyone" });
  await seedCard(s, {
    id: 312,
    name: "*all+*create",
    leftId: 10,
    rightId: 310,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 312, 311, "anyone");

  // the HELP mod: the edit mod's framed :new carries showHelp (the help
  // view the frame header renders)
  loader = new ModLoader([
    { manifest: cardModHelp },
    { manifest: cardModEdit },
    { manifest: cardModAccount },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  // the superView helper reads the process-wide default (the api_key
  // suite's pattern)
  setDefaultModLoader(loader);
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  loader?.reset();
  storage?.close();
});

// --- section A: the oracle replay through the composition cores -------------

describe("card-mod-account harness probe: the wave-1 oracle replay", () => {
  const oracles = accountOracles();

  it("the harness captured the account oracle lines", () => {
    expect(oracles.length).toBe(9);
  });

  it("replays new's signed-out title + the invitation contract (signup/views.rb:6-9)", () => {
    const signedOut = oracles.find((l) => l.scenario === "new_signed_out_title");
    expect(signedOut).toBeDefined();
    expect(accountProbeSurface.signupNewTitle()).toEqual(signedOut!.title);
    expect(signedOut!.dispatch).toContain("super()");
    const invitation = oracles.find(
      (l) => l.scenario === "new_invitation_title_contract",
    );
    expect(invitation).toBeDefined();
    expect(invitation!.title).toEqual("Invite");
    expect(invitation!.reachable).toBe(false);
  });

  it("replays new_buttons' create-only formgroup (signup/views.rb:15-18)", () => {
    const line = oracles.find((l) => l.scenario === "new_buttons_create_only");
    expect(line).toBeDefined();
    expect(accountProbeSurface.signupNewButtonsHtml()).toEqual(line!.bytes);
  });

  it("replays signin edit's reset_password_voo contract (signin.rb:154-163)", () => {
    const line = oracles.find((l) => l.scenario === "signin_edit_reset_password_voo");
    expect(line).toBeDefined();
    const voo = accountProbeSurface.signinEditVoo();
    expect(voo.title).toEqual(line!.title);
    expect(voo.editStructure.map((f) => f.name)).toEqual(line!.editStructure);
    expect(voo.hide).toEqual(line!.hide);
    expect(line!.dispatch).toContain("super()");
  });

  it("replays account_tab's pill sections (account_holder.rb:132-137)", () => {
    const line = oracles.find((l) => l.scenario === "account_tab_sections");
    expect(line).toBeDefined();
    expect(accountProbeSurface.accountTabHtml("Joe User")).toEqual(line!.bytes);
  });
});

// --- section C: the walk + setup (the mod-completion-100 oracle lines) -------

describe("card-mod-account harness probe: the walk + the setup view", () => {
  const oracles = accountOracles();

  it("captured the walk + setup oracle lines", () => {
    expect(oracles.find((l) => l.scenario === "signup_content_formgroups_walk")).toBeDefined();
    expect(oracles.find((l) => l.scenario === "walk_empty_configs_structure_link")).toBeDefined();
    expect(oracles.find((l) => l.scenario === "setup_voo_and_form_chain")).toBeDefined();
    expect(oracles.find((l) => l.scenario === "needs_setup_predicate")).toBeDefined();
  });

  it("replays the walk's normalized field marks (the real-cardname field math)", () => {
    const walk = oracles.find((l) => l.scenario === "signup_content_formgroups_walk")!;
    expect(walk.normalizedConfigs).toEqual([
      ["Probe Signup+*account+email", { title: "email" }],
      ["Probe Signup+*account+password", { title: "password" }],
    ]);
    expect(walk.signupMultiCardArm).toBe(false);
    // the fieldset bytes + the nest seams (the oracle's gem-source region)
    expect(walk.bytes).toContain('<fieldset class="card-editor editor">');
    expect(walk.bytes).toContain('%%NEST_SEAM[Probe Signup+*account+email]%%');
    expect(walk.bytes).toContain('%%NEST_SEAM[Probe Signup+*account+password]%%');
    expect(walk.nestSeams).toEqual([
      "Probe Signup+*account+email",
      "Probe Signup+*account+password",
    ]);
  });

  it("replays the structure_link empty arm + the setup voo contract + the predicate", () => {
    const empty = oracles.find((l) => l.scenario === "walk_empty_configs_structure_link")!;
    expect(empty.bytes).toContain("Uneditable; content is");
    const setup = oracles.find((l) => l.scenario === "setup_voo_and_form_chain")!;
    const voo = setup.voo as Record<string, unknown>;
    expect(voo["title"]).toEqual("Your deck is ready to go!");
    expect(voo["show"]).toEqual(["help"]);
    expect(voo["hide"]).toEqual(["menu"]);
    expect(voo["nestMode"]).toEqual("edit");
    expect(String(voo["helpBytes"])).toContain("First, set up an account.");
    expect(setup.hiddenFields).toEqual({
      card_type_id: 501,
      card_trigger: ["check_setup"],
      success: { redirect: true, mark: "/" },
    });
    expect(setup.setupButtonBytes).toEqual(
      '<button name="button" type="submit" data-disable-with="Setting up" class="btn btn-primary">Set up</button>',
    );
    const pred = oracles.find((l) => l.scenario === "needs_setup_predicate")!;
    expect(pred.seam).toContain("prepared verdict");
  });

  it("renders signup :content_formgroups through the engine - the walk with REAL field editors", async () => {
    const s = storage!;
    const html = await s.engine.render("Probe Signup", "content_formgroups");
    // the +*account subformat's before hook set edit_structure; the edit
    // mod's walk normalized + nested the field cards; the fieldset wraps
    expect(html).toContain('<fieldset class="card-editor editor">');
    // the nested field cards rendered through the nest machinery (real
    // editors, not seams) - their marks are the normalized field marks
  });

  it("renders :setup with the prepared verdict open - and the denial closed", async () => {
    const s = storage!;
    // the census producer's verdict (setupWindowState's shape)
    setPreparedSetupVerdict({ open: true, accountCount: 0 });
    expect(preparedSetupVerdict()?.open).toBe(true);
    const html = await s.engine.render("Probe Admin", "setup");
    // the voo contract + the form chain
    expect(html).toContain("Your deck is ready to go!");
    expect(html).toContain("First, set up an account.");
    expect(html).toContain(`name="card[type_id]"`);
    expect(html).toContain(`name="success[mark]" id="success_mark" value="/"`);
    expect(html).toContain('data-disable-with="Setting up"');
    expect(html).toContain("Set up</button>");
    // the walk's field editors inside the setup form (nest_mode :edit)
    expect(html).toContain("email");
    expect(html).toContain("password");
    // `voo.hide! :menu` (set/type/user.rb:14): the header's render_menu is
    // an optional render (format/set/all/html/header.rb:6), so the hidden
    // menu is nil and output() compacts it - the header closes straight
    // after the title, as the synthetic-v2 oracle's
    // `view:admin:Quinn Contractor:setup` bytes do
    // (`...ready to go!</span></h2></div>\n<div id="..-help-view"`).
    expect(html).toContain(
      `<span class="card-title" title="Your deck is ready to go!">Your deck is ready to go!</span></h2></div>\n<div id="probe_admin-help-view"`,
    );
    expect(html).not.toContain("card-menu");
    // frame_and_form :create -> card_form -> `form_for card` (edit
    // set/all/form.rb:193-199): Rails names the form and picks the verb
    // from the record, so a stored card is edit_card_<id> with the
    // _method=patch spoof while the url stays /card/create (the oracle's
    // `id="edit_card_913" action="/card/create"` form tag).
    expect(html).toContain(
      `<form class="card-form slotter" id="edit_card_404" action="/card/create" accept-charset="UTF-8" data-remote="true" method="post">` +
        `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
        `<input type="hidden" name="_method" value="patch" autocomplete="off" />`,
    );

    // closed verdict -> Ruby's perms denial
    setPreparedSetupVerdict({ open: false, accountCount: 7 });
    const denied = await s.engine.render("Probe Admin", "setup");
    expect(denied).toContain('class="denied"');
    expect(denied).toContain("don't have permission");
  });
});

// --- section B: the signup :new super() dispatch through the engine ----------

describe("card-mod-account harness probe: the ported views through the engine", () => {
  it("renders signup :new through the super() chain (the edit mod's framed create form)", async () => {
    const s = storage!;
    const html = await s.engine.render("Probe Signup", "new");
    // the title composition rides the voo opt the frame's header reads
    expect(html).toContain("Sign up");
    // the super() target is the edit mod's live :new (framed_create_form):
    // the main-success + success[mark] create-form markers
    expect(html).toContain(`data-main-success="{&quot;redirect&quot;:true}"`);
    expect(html).toContain(`name="success[mark]"`);
  });
});
