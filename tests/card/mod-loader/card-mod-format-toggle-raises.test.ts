// The two raise-parity views from card-mod-format set/type/toggle.rb's
// html block: :input (line 15-17) + :labeled_editor (line 19-21).
//
// PARITY RAISE — Ruby ArgumentError parity:
//
// Both views' bodies invoke `toggle` (toggle.rb:23-25) which calls
// `check_box :content`. The actionview FormHelper#check_box signature
// is (object_name, method, options={}, checked_value="1",
// unchecked_value="0") (actionview-7.2.3.2 form_helper.rb:1345, 2
// required + 3 optional). `check_box :content` is the SINGLE-ARG call
// — Ruby raises ArgumentError "wrong number of arguments (given 1,
// expected 2..5)". The raise is observed fact, captured live from the
// gem's own runtime (tests/card/mod-loader/
// oracle-capture-format-remaining-views.rb plus an actionview probe run
// from tools/oracle/decko-oracle-app).
//
// :labeled_editor is `toggle + toggle_label`. `toggle` raises first;
// `toggle_label` would emit `<label for="content_X">X</label>`-shape
// bytes (also live-probed), but the view as written raises before that
// half renders — `toggle` is the leftmost operand, Ruby evaluates
// left-to-right and unwinds on the first raise.
//
// These two views were left unported for that exact reason —
// "port the views such that they raise the equivalent error the way
// Ruby does" IS Ruby parity; the engine rendering something would be
// the divergence. They are registered with the parity raise,
// closing the gap as a counted raise instead of a missing view. Same
// precedent as card-mod-tabs `:tabs_static` / `:pills_static` (the
// NoMethodError on `args`; card-mod-tabs.ts:518-525) and the json
// :follow_status defect class.
//
// Proof shape (A/B):
//   WITHOUT the mod: render :input / :labeled_editor on the seeded
//     Toggle-typed probe card raises UnsupportedViewError (the view
//     does not exist on the live registry).
//   WITH the mod: both renders throw with a message that names the
//     underlying parity failure (ArgumentError on check_box :content,
//     via the same MethodDelegation -> actionview seam Ruby hits) so
//     a future port that substitutes "real bytes" is forced to either
//     match Ruby's RAISE or update this test with the new shape —
//     pin, don't guess.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // Toggle-typed probe card — the views live on the Type::Toggle
  // chain, so the rendered card must reach the toggle block. The
  // headless engine does not have a per-type Cardtype registry for
  // the deck seeds, but the engine's :input / :labeled_editor
  // dispatch goes through the same registry as the engine's
  // existing Toggle core view (render/views.ts:345 — typeCode ===
  // "toggle" || typeName === "Toggle"), so seeding typeName="Toggle"
  // is sufficient to identify the card to the views.
  //
  // The mod loader, however, registers :input and :labeled_editor on
  // the MOD's flat view table (mod-registrar.ts ViewRegistrationTable),
  // NOT on the type chain — these two views are Type::Toggle-scoped
  // in Ruby but flat here. So they dispatch on every card regardless
  // of type. The seed is just a Toggle card to keep the parity
  // honest.
  await seedCard(s, { id: 2, name: "Toggle", codename: "toggle" });
  await seedCard(s, {
    id: 300,
    name: "Oracle Toggle Probe",
    typeId: 2,
    dbContent: "1",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-format set/type/toggle — :input + :labeled_editor raise parity", () => {
  it("WITHOUT the mod: both views raise UnsupportedViewError", async () => {
    const s = storage!;
    await expect(
      s.engine.render("Oracle Toggle Probe", "input"),
    ).rejects.toThrow(UnsupportedViewError);
    await expect(
      s.engine.render("Oracle Toggle Probe", "labeled_editor"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mod: :input throws Ruby's ArgumentError parity raise (check_box :content)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModFormat }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // set/type/toggle.rb:15-17 + :23-25 — `toggle` calls
    // `check_box :content`. actionview-7.2.3.2
    // FormHelper#check_box(object_name, method, ...) takes 2-5 args;
    // `check_box :content` is one arg. Ruby raises ArgumentError
    // "wrong number of arguments (given 1, expected 2..5)". The
    // port throws the same parity failure so a future port that
    // renders bytes Ruby never produced has to update this test.
    await expect(
      s.engine.render("Oracle Toggle Probe", "input"),
    ).rejects.toThrow(/ArgumentError.*check_box :content/);
  });

  it("WITH the mod: :labeled_editor throws Ruby's ArgumentError parity raise (toggle + toggle_label)", async () => {
    const s = storage!;
    // set/type/toggle.rb:19-21 — `toggle + toggle_label`. `toggle`
    // raises first (leftmost operand); `toggle_label` would emit
    // `<label for="content_X">X</label>` (live-probed, see
    // an internal work log row "labeled_editor"),
    // but the view as written never reaches it. The parity raise is
    // the same shape as :input's.
    await expect(
      s.engine.render("Oracle Toggle Probe", "labeled_editor"),
    ).rejects.toThrow(/ArgumentError.*check_box :content/);
  });

  it("WITH the mod: the mod loader's load report lists both views", () => {
    const report = loader!.load();
    expect(report.registeredViews).toContain("input");
    expect(report.registeredViews).toContain("labeled_editor");
  });

  it("WITH the mod: a Toggle card's baseline :core view still renders (the mod adds raise-parity views, it does not alter the existing toggle core)", async () => {
    const s = storage!;
    // The engine's :core view (render/views.ts#coreView) renders the
    // toggle's "1" -> "yes" mapping through formatToggleCore. The mod
    // registers :input + :labeled_editor ONLY — :core stays as the
    // engine's existing bytes, exactly like the rest of card-mod-format
    // (the A/B shape every sibling test follows).
    expect(await s.engine.render("Oracle Toggle Probe", "core")).toBe("yes");
  });
});
