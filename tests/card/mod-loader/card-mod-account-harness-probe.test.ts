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
    expect(oracles.length).toBe(5);
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
