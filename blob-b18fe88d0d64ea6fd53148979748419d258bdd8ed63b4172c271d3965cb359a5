// The list mod's five events, and which of them can EVER fire in the
// pinned deck (register row 22, card-mod-list).
//
// RUBY (card-mod-list-0.20.0 set/abstract/01_list/events.rb:1-33 and
// set/abstract/delist.rb:2-9):
//
//   add_and_drop_items      :prepare_to_validate, on: :save
//   insert_item_event       :prepare_to_validate, on: :save, when: :item_to_insert
//   validate_item_type      :validate,           on: :save, when: :validate_item_type?
//   validate_item_uniqueness :validate,          on: :save, when: :unique_items?
//   delist                  :prepare_to_store,   on: :delete
//
// AT THIS TREE:
//
// - add_and_drop_items and insert_item_event are PORTED, at the write
//   route's list-item arm (src/server/write-routes.ts: the add_item /
//   drop_item / insert_item params). Their bytes are pinned by
//   tests/server/write-routes-id-mark-save.test.ts.
//
// - delist CANNOT FIRE. The event lives on the ABSTRACT set module
//   Abstract::Delist, and an abstract set module's code reaches a card
//   only through `include_set` (card-1.110.0 set/inheritance.rb). The
//   repo's own generated include census
//   (src/card/mod-loader/set-include-graph.ts, from
//   tools/oracle/set-include-graph.rb over the loaded Ruby deck) names no
//   includer of Abstract::Delist.
//
// THE VALIDATE PAIR, IMPLEMENTED (register row 22, 2026-10-25). This file
// PINNED THE GAP until then: the two validate events had documented stub
// bodies and the write path had no errors.add seam, so a wrong item type
// was saved where Ruby refuses it. Now:
//
// - the errors.add seam exists (src/card/mod-loader/mod-validation-errors.ts):
//   a validate-stage body adds every message the way Ruby's errors array
//   does and the throw refuses the save, the HTML alert carrying Ruby's
//   standard_errors lines and the JSON errors hash the last message per
//   attribute;
// - validate_item_type and validate_item_uniqueness carry implemented
//   bodies (src/card/mod-loader/mods/card-mod-list.ts), reading
//   ok_item_types off the same three type_plus_right sets the state
//   source resolves, walking item_cards through the deck read, and adding
//   one :content error per out-of-set item (or the duplicates sentence)
//   with the gem's en.yml strings verbatim;
// - the membership arm (abstractListEventsSetMember,
//   src/card/mod-loader/mod-event-set-membership.ts) resolves the abstract
//   set path for the cards whose set-module chain carries Abstract::List -
//   the thirteen concrete set modules the generated include graph names;
//   Ruby's shortname bucket rule (set/helpers.rb:11-15 +
//   inheritance.rb:39) makes the events submodule ride the same include.
//   The arm is gated to the validate pair: the prepare_to_validate pair is
//   the route's own (Ruby's recorded order runs check_permissions BEFORE
//   add_and_drop_items).
//
// The arm is NOT wired into the serving walk yet: the port's boot does
// not create the mod script input cards Ruby's boot creates, so wiring
// today would refuse site-script edits on the port's state where the
// recorded Ruby run answered 303 (the boot-refresh divergence, measured
// in the row's receipt). These tests compose the arm into their runtime
// directly, which is the shape the serving wiring will use.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SET_INCLUDE_GRAPH } from "../../../src/card/mod-loader/set-include-graph.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import { abstractListEventsSetMember } from "../../../src/card/mod-loader/mod-event-set-membership.js";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  CARDTYPE_ID,
  SET_TYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { libsassWasmCompiler } from "../../../src/server/libsass-wasm.js";
import { LocalAttachmentStore } from "../../../src/card/attachments/attachment-store.js";
import { defaultDeckEventPredicates } from "../../../src/card/mod-loader/default-mod-deck.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

/** Every abstract set module the generated include graph names as
 *  included, with the concrete set module that includes it. */
const includersOf = (abstractModule: string): string[] => {
  const includers: string[] = [];
  for (const [setModule, includes] of Object.entries(SET_INCLUDE_GRAPH)) {
    for (const format of ["html", "base"] as const) {
      if (includes[format]?.includes(abstractModule) === true) includers.push(setModule);
    }
  }
  return includers.sort();
};

const eventsOn = (setPath: string) => {
  const module = (cardModList.setModules ?? []).find((entry) => entry.setPath === setPath);
  return module?.events ?? [];
};

/** The deck: the standard write rules, the four allowed type cards (the
 *  names the allowed_types sentence shows), the *style setting card and a
 *  Set-typed left (the shape the when-predicate's state source resolves),
 *  and one item card of each arm. */
async function seedListDeck(storage: ActionsTestStorage) {
  const f = await seedStandardDeck(storage);
  await seedCard(storage, { id: 601, name: "CSS", codename: "css", typeId: CARDTYPE_ID });
  await seedCard(storage, { id: 602, name: "SCSS", codename: "scss", typeId: CARDTYPE_ID });
  await seedCard(storage, { id: 603, name: "Skin", codename: "skin", typeId: CARDTYPE_ID });
  await seedCard(storage, {
    id: 604, name: "Bootswatch Skin", codename: "bootswatch_skin", typeId: CARDTYPE_ID,
  });
  await seedCard(storage, { id: 605, name: "*style", codename: "style" });
  await seedCard(storage, { id: 606, name: "A", typeId: SET_TYPE_ID });
  // the Pointer cardtype: a +*style rule card is pointer-typed in Ruby
  // (assign_type :pointer, type_plus_right/set/style.rb:3), and the TYPE
  // pattern is what puts Abstract::List in the card's chain
  await seedCard(storage, { id: 608, name: "Pointer", codename: "pointer", typeId: CARDTYPE_ID });
  // a card of an ALLOWED type (its type card is CSS, codename css)
  await seedCard(storage, { id: 607, name: "Style Sheet", typeId: 601 });
  // the style save's asset pipeline runs before the validate stage and
  // stores the compiled output under this setting card; the output write
  // carries a File-typed attachment, so the File cardtype must exist
  await seedCard(storage, { id: 610, name: "*asset output", codename: "asset_output" });
  await seedCard(storage, { id: 611, name: "File", codename: "file", typeId: CARDTYPE_ID });
  return f;
}

/** The runtime the engine dispatches through: the list mod's own registry,
 *  the deck's merged predicate table (listModEventPredicates +
 *  collectionModEventPredicates live there), and the serving-style
 *  membership arm under test. */
function listEventsRuntime(driver: ActionsTestStorage["driver"]): ModEventRuntime {
  const loader = new ModLoader([{ manifest: cardModList }]);
  loader.resolveOrder({ gemMods: ["list"] });
  loader.load();
  // the deck's when:-state sources (listSource's hasOkItemTypes) register
  // at the deck boot; this runtime registers them the same way
  registerDeckModEventCardStateSources();
  return {
    registry: loader.eventRegistry(),
    predicates: defaultDeckEventPredicates(),
    setMember: abstractListEventsSetMember(driver),
  };
}

describe("the list mod's events that can never fire, and the two that can", () => {
  it("no concrete set module includes Abstract::Delist, so :delist never fires", () => {
    expect(includersOf("Abstract::Delist")).toEqual([]);
  });

  it("registers :delist on the abstract/delist set path anyway", () => {
    expect(eventsOn("abstract/delist").map((event) => event.event)).toContain("delist");
  });

  it("registers the four list events, with the two validate ones gated", () => {
    const events = eventsOn("abstract/01_list/events");
    const names = events.map((event) => event.event);
    expect(names).toEqual([
      "add_and_drop_items",
      "insert_item_event",
      "validate_item_type",
      "validate_item_uniqueness",
    ]);
    const validateType = events.find((event) => event.event === "validate_item_type");
    expect(validateType?.when).toBe("validate_item_type?");
    const validateUniqueness = events.find((event) => event.event === "validate_item_uniqueness");
    expect(validateUniqueness?.when).toBe("unique_items?");
  });
});

describe("register row 22 closed - the validate bodies refuse the save", () => {
  it("a <set>+*style pointer save with an out-of-set item is refused at validate and stores nothing (events.rb:13-23)", async () => {
    const storage = await createActionsTestStorage();
    await seedListDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 1, name: "Joe User" },
      ipAddress: "192.0.2.7",
      // a +*style save rebuilds asset files: the host's SCSS compiler is
      // what Ruby's own process always carries, and the port's asset guard
      // asks for it BEFORE the validate stage runs
      scssCompiler: libsassWasmCompiler(),
      modEvents: listEventsRuntime(storage.driver),
    });
    const err = await engine
      .createCard({ name: "A+*style", typeCode: "pointer", content: "[[Pudding]]" })
      .then(
        () => undefined,
        (e: unknown) => e as CardActionError,
      );
    expect(err).toBeInstanceOf(CardActionError);
    // THE REFUSAL IS THE VALIDATOR'S, at the validate stage: en.yml
    // list_invalid_item_type, verbatim - Pudding's type is RichText
    // (codename basic), the allowed list is the style override's four
    // codenames through Card::Codename.name (to_sentence connectors).
    // Ruby's validate stage runs before the style machinery's own asset
    // input gate, and the port's does the same.
    expect(String(err?.message)).toBe(
      "Pudding has an invalid type: RichText. Allowed types: CSS, SCSS, Skin, and Bootswatch Skin.",
    );
    // the errors hash carries the :content attribute (Ruby's errors.add key)
    expect(err?.errorsByAttribute).toEqual({
      content: "Pudding has an invalid type: RichText. Allowed types: CSS, SCSS, Skin, and Bootswatch Skin.",
    });

    // nothing stored: the refusal lands before the row write
    const row = await storage.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE key = ?",
      ["a+*style"],
    );
    expect(row).toBeUndefined();
  });

  it("the validate_item_type body refuses through the seam with Ruby's verbatim message, read off the real deck rows (events.rb:13-23)", async () => {
    const storage = await createActionsTestStorage();
    await seedListDeck(storage);
    const validateType = eventsOn("abstract/01_list/events").find(
      (event) => event.event === "validate_item_type",
    );
    // the body's own reads, against the seeded deck's rows: the right
    // codename resolves the style override's four codenames, the item join
    // answers Pudding's stored name and RichText type, and the message is
    // en.yml list_invalid_item_type with Rails to_sentence connectors.
    await expect(
      (async () =>
        await validateType?.fn?.(
          { name: "A+*style", dbContent: "[[Pudding]]" },
          {} as never,
          { driver: storage.driver } as never,
        ))(),
    ).rejects.toMatchObject({
      message:
        "Pudding has an invalid type: RichText. Allowed types: CSS, SCSS, Skin, and Bootswatch Skin.",
      errorsByAttribute: {
        content:
          "Pudding has an invalid type: RichText. Allowed types: CSS, SCSS, Skin, and Bootswatch Skin.",
      },
    });
    // an in-set item adds no error: the body returns without throwing
    await expect(
      validateType?.fn?.(
        { name: "A+*style", dbContent: "[[Style Sheet]]" },
        {} as never,
        { driver: storage.driver } as never,
      ),
    ).resolves.toBeUndefined();
  });

  it("a save whose items all carry allowed types proceeds, and the validator is recorded as fired (events.rb:16)", async () => {
    const storage = await createActionsTestStorage();
    await seedListDeck(storage);
    const reports: Array<{ stage: string; fired: readonly string[] }> = [];
    const filesDir = mkdtempSync(join(tmpdir(), "regfix2-row22-"));
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 1, name: "Joe User" },
      ipAddress: "192.0.2.7",
      scssCompiler: libsassWasmCompiler(),
      attachmentStore: new LocalAttachmentStore(filesDir),
      modEvents: { ...listEventsRuntime(storage.driver), onReport: (r) => reports.push(r as never) },
    });
    try {
    // the allowed-item save REACHES the validator (the membership arm and
    // the when-gate both open) and records it fired; the save's own tail is
    // the style machinery's asset output, which needs the seeded deck's
    // *asset output codename card - this minimal deck stops there, after
    // the validate report this row's wiring pin reads.
    await engine
      .createCard({
        name: "A+*style",
        typeCode: "pointer",
        content: "[[Style Sheet]]",
      })
      .catch(() => undefined);
    expect(reports.find((r) => r.stage === "validate")?.fired).toContain("validate_item_type");
    } finally {
      rmSync(filesDir, { recursive: true, force: true });
    }
  });

  it("the uniqueness validator is the dead arm Ruby's comment describes: when-gated false on a real save, and refusing when driven directly (events.rb:25-33)", async () => {
    const storage = await createActionsTestStorage();
    await seedListDeck(storage);
    const reports: Array<{ stage: string; skipped: Array<{ event: string; reason: string }> }> = [];
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 1, name: "Joe User" },
      ipAddress: "192.0.2.7",
      scssCompiler: libsassWasmCompiler(),
      modEvents: { ...listEventsRuntime(storage.driver), onReport: (r) => reports.push(r as never) },
    });
    // duplicate items save: unique_items? is false with no override in the
    // gem tree (item_assignment.rb:1-3), so the event never runs - the
    // dedupe lives in standardize_items (events.rb:25-28's comment).
    await engine.createCard({
      name: "C+*style",
      typeCode: "pointer",
      content: "[[Style Sheet]]\n[[Style Sheet]]",
    });
    const validate = reports.find((r) => r.stage === "validate");
    expect(validate?.skipped.map((s) => `${s.event}:${s.reason}`)).toContain(
      "validate_item_uniqueness:when-false",
    );

    // driven directly, the body is Ruby's shape: the duplicates sentence,
    // then the refusal
    const uniqueness = eventsOn("abstract/01_list/events").find(
      (event) => event.event === "validate_item_uniqueness",
    );
    await expect(
      (async () =>
        await uniqueness?.fn?.(
          { name: "C+*style", dbContent: "[[Style Sheet]]\n[[Style Sheet]]" },
          {} as never,
          undefined as never,
        ))(),
    ).rejects.toMatchObject({
      message: "duplicate item names: Style Sheet",
    });
  });

  it("the membership arm resolves the Abstract::List includer shapes and no others (set-include-graph.ts)", async () => {
    const storage = await createActionsTestStorage();
    await seedListDeck(storage);
    const member = abstractListEventsSetMember(storage.driver);
    // a Pointer-typed save snapshot: Type::Pointer is one of the thirteen
    expect(
      await member("abstract/01_list/events", { name: "A+*style", typeId: 608 }),
    ).toBe(true);
    // the self-set shape: *mod's own card (Self::Mod)
    expect(await member("abstract/01_list/events", { name: "*mod" })).toBe(true);
    // a non-member set path and a non-member card
    expect(
      await member("abstract/01_list/html_views", { name: "A+*style", typeId: 608 }),
    ).toBe(false);
    expect(
      await member("abstract/01_list/events", { name: "Pudding", typeId: 2 }),
    ).toBe(false);
  });
});
