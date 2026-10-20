// Engine-owned pin for card-mod-bootstrap set/type/bootswatch_skin/events.rb
// create events — copy_theme (:10-12) here; validate_theme_template lands in
// its own commit (register row bootstrap #5).
//
// Ruby oracle (read this session, card-mod-bootstrap-0.20.0):
//   event :copy_theme, :prepare_to_store, on: :create do
//     initialize_theme
//   end
//   ... events.rb:28-31:
//   def initialize_theme
//     field :colors, type: :scss
//     field :variables, type: :scss
//   end
// `field` is Card#field (card-1.110.0 lib/card/subcards/all.rb:32-39) ->
// subcards.add_field -> add_child (lib/card/subcards/add.rb:49-54), which
// `prepend_joint`s the given name: the created subcards are "<skin>+colors"
// and "<skin>+variables", typed scss (the mod's own header comment, line 23,
// names them "+:colors, +:variables, +:stylesheets" — no star).
//
// NAMED DIVERGENCE (not hidden by this pin): the port creates the fields
// under the STARRED tags "+*colors"/"+*variables"
// (card-action-engine.ts applySkinCreateEvents, subcards["+*colors"]). The
// in-act creation shape — same act, SCSS type, blank content, permission
// checked, a posted field wins over the generated one — matches Ruby; the
// tag spelling does not. The starred spelling is shared with the port's
// other skin machinery (checkSkinFieldPermissions' probe name), so renaming
// is an integration decision, not a one-lane edit. Per the parity law the
// divergence is named here and in the register report; the test pins the
// port's actual observable behavior so the row is not silently "done".

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { libsassWasmCompiler } from "../../../src/server/libsass-wasm.js";

async function skinDeck(storage: ActionsTestStorage): Promise<{
  bootswatchSkinTypeId: number;
  scssTypeId: number;
}> {
  await seedStandardDeck(storage);
  const bootswatchSkin = await seedCard(storage, {
    id: 470,
    name: "bootswatch skin",
    codename: "bootswatch_skin",
    typeId: 3, // Cardtype
  });
  const scss = await seedCard(storage, {
    id: 471,
    name: "SCSS",
    codename: "scss",
    typeId: 3,
  });
  return { bootswatchSkinTypeId: bootswatchSkin.id, scssTypeId: scss.id };
}

function engine(storage: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    // a skin save rebuilds asset files; the preflight requires a compiler
    scssCompiler: libsassWasmCompiler(),
  });
}

describe("copy_theme (bootswatch_skin events.rb:10-12, engine-owned)", () => {
  it("a new skin gains its colors and variables fields in the same act", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    const result = await engine(storage).createCard({
      name: "Zed Skin",
      typeId: ids.bootswatchSkinTypeId,
    });
    const fields = await storage.selectAll<{ tag: string; type_id: number; trash: number }>(
      "SELECT r.name AS tag, c.type_id, c.trash FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.left_id = ? ORDER BY tag",
      [result.cardId],
    );
    // Two field rows, both SCSS-typed, both live — the shapes
    // `field :colors, type: :scss; field :variables, type: :scss` produce.
    // (The junction rows carry NULL name/key by the storage convention;
    // identity rides the side rows.)
    expect(fields.map((f) => [f.tag, f.type_id, f.trash])).toEqual([
      ["*colors", ids.scssTypeId, 0],
      ["*variables", ids.scssTypeId, 0],
    ]);
    // NAMED DIVERGENCE (header): Ruby's tags are "zed_skin+colors" /
    // "zed_skin+variables"; the port writes the starred spellings. The row
    // stays engine-owned-with-a-named-divergence, not PORTED.
    // In-act: every created row rides the skin's act (the fields are
    // subcards, card-acts count stays 1). Five actions: the skin, its two
    // fields, and the two newly-created *colors/*variables tag cards.
    expect(await storage.count("card_acts")).toBe(1);
    const actionCards = await storage.selectAll<{ card_id: number }>(
      "SELECT card_id FROM card_actions",
      [],
    );
    expect(actionCards).toHaveLength(5);
  });

  it("a posted field's content wins over the generated blank", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    const result = await engine(storage).createCard({
      name: "Posted Skin",
      typeId: ids.bootswatchSkinTypeId,
      subcards: {
        "+*colors": { content: "$brand: red;" },
      },
    });
    const rows = await storage.selectAll<{ tag: string; db_content: string | null }>(
      "SELECT r.name AS tag, c.db_content FROM cards c JOIN cards r ON r.id = c.right_id WHERE c.left_id = ? ORDER BY tag",
      [result.cardId],
    );
    const colors = rows.find((r) => r.tag === "*colors");
    expect(colors?.db_content).toBe("$brand: red;");
  });

  it("a non-skin create gains no fields", async () => {
    const storage = await createActionsTestStorage();
    await skinDeck(storage);
    const result = await engine(storage).createCard({ name: "Plain Note", content: "hi" });
    const fields = await storage.selectAll<{ key: string }>(
      "SELECT key FROM cards WHERE left_id = ?",
      [result.cardId],
    );
    expect(fields).toEqual([]);
  });
});

// validate_theme_template (bootswatch_skin events.rb:14-18, register row
// bootstrap #5), engine-owned inside applySkinCreateEvents
// (card-action-engine.ts:1699-1704):
//   event :validate_theme_template, :validate, on: :create do
//     return unless (theme = theme_card) && theme.type_code != :bootswatch_skin
//     errors.add :abort, t(:bootstrap_not_valid_theme, theme_name: theme.name)
//   end
// theme_card (bootswatch_skin.rb:65-68) walks to the +parent pointer's
// first card when that parent is real and not self; a simple skin's
// theme_card is itself (never an error).
//
// NAMED DIVERGENCE (documented at the implementation, kept honest here):
// when the +parent names an EXISTING non-skin card, Ruby recurses
// parent_skin_card.theme_card into a card that has no theme_card method
// and raises NoMethodError (a 500); the port refuses the create with the
// error the event was written to give ("not a valid theme <name>").
describe("validate_theme_template (bootswatch_skin events.rb:14-18, engine-owned)", () => {
  it("a +parent naming an existing non-skin card refuses the create", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    await engine(storage).createCard({ name: "Plain Wall", content: "brick" });
    await expect(
      engine(storage).createCard({
        name: "Orphan Skin",
        typeId: ids.bootswatchSkinTypeId,
        subcards: { "+parent": { content: "[[Plain Wall]]" } },
      }),
    ).rejects.toThrow(/not a valid theme Plain Wall/);
    expect(
      await storage.selectOne("SELECT id FROM cards WHERE key = 'orphan_skin'", []),
    ).toBeUndefined();
  });

  it("a +parent naming a real bootswatch_skin proceeds", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    await engine(storage).createCard({ name: "Base Skin", typeId: ids.bootswatchSkinTypeId });
    const child = await engine(storage).createCard({
      name: "Child Skin",
      typeId: ids.bootswatchSkinTypeId,
      subcards: { "+parent": { content: "[[Base Skin]]" } },
    });
    expect(child.cardId).toBeGreaterThan(0);
  });

  it("a +parent naming a nonexistent card proceeds (Ruby: parent? is false, theme_card is self)", async () => {
    const storage = await createActionsTestStorage();
    const ids = await skinDeck(storage);
    const ghost = await engine(storage).createCard({
      name: "Ghost Parent Skin",
      typeId: ids.bootswatchSkinTypeId,
      subcards: { "+parent": { content: "[[Never Was]]" } },
    });
    expect(ghost.cardId).toBeGreaterThan(0);
  });
});
