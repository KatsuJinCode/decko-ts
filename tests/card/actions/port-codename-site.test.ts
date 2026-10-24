// port-codename-site.test.ts - the port's own codename handling, MEASURED.
//
// The register row reg-evt-1-110-0-validate-codename is Ruby's
// `event :validate_codename, :validate, on: :update, changed: :codename`
// (card-1.110.0/mod/core/set/all/codename.rb:1-5, the pinned declaration
// line the executed capture names): the body runs the permission gate
// (codename.rb:21-25), the uniqueness check (codename.rb:27-32) and the
// simplicity check (codename.rb:34-38), and it runs them on an UPDATE
// whose codename changed.
//
// THE PORT HAS NO SUCH SITE. This file measures that fact instead of
// asserting it:
//
//   1. The codename is create-only in the port. The update input carries
//      no codename field (src/card/actions/types.ts: UpdateCardInput), the
//      tracked field state has no codename (src/card/history/change.ts:
//      CardFieldState), and the row update's SET list writes the changed
//      tracked fields plus the key, the read-rule columns and the stamps
//      (src/card/history/write-path.ts: pushUpdateCardsRow). An update
//      therefore cannot change a codename, so the body's gate
//      (`on: :update, changed: :codename`) selects nothing.
//   2. The create path's codename guard is the DATABASE's unique index
//      (db/schema.sqlite.sql:70, `cards_codename_index`), so a duplicate
//      codename is refused with the driver's unique-constraint error, not
//      with Ruby's "codename <x> already in use" (core_error_code_in_use).
//   3. The create path is not the body's site either: Ruby's declaration
//      is update-only, so a create never runs this body in Ruby. A
//      compound name with a codename is created in Ruby too - the
//      simplicity check lives in the update-only body.
//
// THE NAMED REMAINDER: the port's update-path codename. Until the port's
// update input can carry a codename, the permission gate, the uniqueness
// check and the simplicity check have no update to select, and the row's
// body has no site to be carried at. The port's create path keeps the
// database's unique index as its guard, which is the guard Ruby has on
// the create path too.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  JOE,
  RICH_TEXT_ID,
  fakeClock,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";

function engineFor(storage: Awaited<ReturnType<typeof createActionsTestStorage>>) {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
  });
}

describe("the port's codename handling (measured for reg-evt-1-110-0-validate-codename)", () => {
  it("a create writes the codename and an update does not touch it", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = engineFor(storage);

    const created = await engine.createCard({
      name: "Coded One",
      typeId: RICH_TEXT_ID,
      content: "<p>x</p>",
      codename: "coded_one",
    });
    const afterCreate = await storage.selectOne<{ codename: string | null }>(
      "SELECT codename FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(afterCreate?.codename).toBe("coded_one");

    // The update path writes no codename column: the row keeps the
    // codename its create gave it, whatever the update changed.
    await engine.updateCard({ cardId: created.cardId, content: "<p>y</p>" });
    const afterUpdate = await storage.selectOne<{ codename: string | null }>(
      "SELECT codename FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(afterUpdate?.codename).toBe("coded_one");

    const renamed = await engine.updateCard({ cardId: created.cardId, name: "Coded One Renamed" });
    expect(renamed.cardId).toBe(created.cardId);
    const afterRename = await storage.selectOne<{ codename: string | null }>(
      "SELECT codename FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(afterRename?.codename).toBe("coded_one");

    storage.close();
  });

  it("a duplicate codename is refused by the database's unique index", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = engineFor(storage);

    await engine.createCard({
      name: "Coded One",
      typeId: RICH_TEXT_ID,
      content: "<p>x</p>",
      codename: "coded_duplicate",
    });
    const before = await storage.count("cards");

    // The refusal is the database's, not a port-side check: the error is
    // the driver's unique-constraint failure on cards.codename, where
    // Ruby's body would have added "codename coded_duplicate already in
    // use" to the card's errors.
    await expect(
      engine.createCard({
        name: "Coded Two",
        typeId: RICH_TEXT_ID,
        content: "<p>y</p>",
        codename: "coded_duplicate",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed: cards\.codename/);
    expect(await storage.count("cards")).toBe(before);

    storage.close();
  });

  it("a compound name with a codename is created: the body is update-only in Ruby too", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const engine = engineFor(storage);

    // The simplicity check ("only simple cards can have codenames",
    // core_codename_must_be_simple) lives in the update-only body, so a
    // create with a compound name and a codename is created in Ruby too.
    const created = await engine.createCard({
      name: "*all+Joe",
      typeId: RICH_TEXT_ID,
      content: "<p>z</p>",
      codename: "coded_compound",
    });
    const row = await storage.selectOne<{ codename: string | null; name: string | null }>(
      "SELECT codename, name FROM cards WHERE id = ?",
      [created.cardId],
    );
    expect(row?.codename).toBe("coded_compound");
    expect(row?.name).toBe(null);

    storage.close();
  });
});
