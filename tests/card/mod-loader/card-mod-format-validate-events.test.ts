// The two card-mod-format event rows (completeness register events table,
// rows `validate_json` and `validate_number`; both PARTIAL "body
// disposition not individually audited this pass").
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-format-0.20.0:
//
//   set/type/json.rb:3-11
//     event :validate_json, :validate, on: :save, changed: :content do
//       check_json_syntax if content.present?
//     end
//     def check_json_syntax
//       parse_content
//     rescue JSON::ParserError => e
//       errors.add t(:format_invalid_json), e.message.sub(/^\d+: /, "").to_s
//     end
//     def parse_content
//       content.blank? ? "" : JSON.parse(content)
//     end
//
//   set/type/number.rb:7-9
//     event :validate_number, :validate, on: :save do
//       errors.add :content, t(:format_not_numeric, content: content) unless content.number?
//     end
//
// The BODY half of both rows was already ported and Ruby-fixture-pinned
// (format-validations.test.ts against fixtures/json-3.0.2-parse-errors.json
// and ruby-float-acceptance.json). What the register left open, and what
// this file closes, is the EVENT half: the clauses, the set-scoping that
// decides whether the body ever runs for a given card, and the refusal
// arriving through a real save the way Ruby's validate stage raises it.
//
// The reachability question is not academic: both are `type/<codename>`
// scoped, and set_condition_applies? (card-1.110.0 lib/card/set/event/all.rb
// :26-29) drops an event whose set module is not in the card's chain. The
// port's serving resolver (write-routes.ts typeSetMember) answers that
// question through the type card's codename, plus two inherited arms
// (set -> search_type -> json). Those arms are pinned here too, because
// the JSON validator reaches search-type cards and nothing else would
// prove it.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import {
  defaultDeckEventRuntime,
} from "../../../src/card/mod-loader/default-mod-deck.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

const CARDTYPE_ID = 3;

function formatRegistry(): ReturnType<ModLoader["eventRegistry"]> {
  const loader = new ModLoader([{ manifest: cardModFormat }]);
  loader.resolveOrder({ gemMods: ["format"] });
  loader.load();
  return loader.eventRegistry();
}

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

function runtimeFor(events: readonly string[]): ModEventRuntime {
  const registry = formatRegistry();
  return {
    registry: {
      all: () => registry.all().filter((e) => events.includes(e.event)),
      forStage: (stage) =>
        registry.forStage(stage).filter((e) => events.includes(e.event)),
    } as ModEventRuntime["registry"],
    // the serving runtime's type/codename membership (write-routes.ts
    // typeSetMember), reproduced here from the same rule so the test
    // exercises the seam the engine dispatches through.
    setMember: (setPath, card) => {
      const match = /^type\/([^/]+)/.exec(setPath);
      if (match === null) return false;
      return card.typeId === TYPES[match[1]!];
    },
  };
}

const TYPES: Record<string, number> = {
  json: 501,
  number: 502,
  basic: CARDTYPE_ID,
};

/** The deck: the standard write rules, the Basic/JSON/Number TYPE cards
 *  (codenames are the membership key the resolver reads), and one card of
 *  each JSON/Number type to save. */
async function seedTypeDeck(storage: ActionsTestStorage) {
  const f = await seedStandardDeck(storage);
  await seedCard(storage, { id: 501, name: "JSON", codename: "json", typeId: CARDTYPE_ID });
  await seedCard(storage, { id: 502, name: "Number", codename: "number", typeId: CARDTYPE_ID });
  return f;
}

describe("card-mod-format event rows — declarations carry Ruby's exact clauses", () => {
  it("validate_json: :validate, on: :save, changed: :content (json.rb:3)", () => {
    const decl = declaredEvents(cardModFormat).find((d) => d.event === "validate_json");
    expect(decl, "validate_json not declared").toBeDefined();
    expect(decl!.setPath).toBe("type/json");
    expect(decl!.at).toBe("validate");
    expect(decl!.on).toEqual(["save"]);
    expect(decl!.changed).toEqual(["content"]);
    expect(decl!.when).toBeUndefined();
    expect(decl!.fn).toBeDefined();
  });

  it("validate_number: :validate, on: :save, and NO changed: clause (number.rb:7)", () => {
    const decl = declaredEvents(cardModFormat).find((d) => d.event === "validate_number");
    expect(decl, "validate_number not declared").toBeDefined();
    expect(decl!.setPath).toBe("type/number");
    expect(decl!.at).toBe("validate");
    expect(decl!.on).toEqual(["save"]);
    // Ruby declares no `changed:` here — the asymmetry with validate_json
    // is real and load-bearing, so it is pinned rather than normalized.
    expect(decl!.changed).toBeUndefined();
    expect(decl!.fn).toBeDefined();
  });

  it("both reach the deck's validate stage under their type set paths", () => {
    const all = defaultDeckEventRuntime().registry.forStage("validate").map((e) => `${e.setPath}:${e.event}`);
    expect(all).toContain("type/json:validate_json");
    expect(all).toContain("type/number:validate_number");
  });
});

describe("card-mod-format event rows — the refusal arrives through a real save", () => {
  it("a malformed JSON save is refused at validate and stores nothing (json.rb:3-11)", async () => {
    const storage = await createActionsTestStorage();
    await seedTypeDeck(storage);
    const reports: Array<{ stage: string; failed: Array<{ event: string }> }> = [];
    const engine = new CardActionEngine(
      storage.engine,
      {
        actor: { id: 1, name: "Joe User", email: null },
        ipAddress: "192.0.2.7",
        modEvents: {
          ...runtimeFor(["validate_json"]),
          onReport: (r) => reports.push(r as never),
        },
      },
    );
    await expect(
      engine.createCard({ name: "Bad JSON", typeCode: "json", content: "{bad" }),
    ).rejects.toBeInstanceOf(CardActionError);

    // nothing stored: the refusal lands before the row write
    const row = await storage.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE key = ?",
      ["bad_json"],
    );
    expect(row).toBeUndefined();
    // A validate-stage body failure PROPAGATES (card.rb:163-171 rescues
    // /integrate/ only), and the walk abandons before it reports — so
    // there is no validate-stage report at all. Pinned so a future change
    // to rescue validate like integrate shows up as a diff here.
    expect(reports.find((r) => r.stage === "validate")).toBeUndefined();
  });

  it("a well-formed JSON save proceeds AND the body is recorded as fired (json.rb:4)", async () => {
    const storage = await createActionsTestStorage();
    await seedTypeDeck(storage);
    const reports: Array<{ stage: string; fired: readonly string[] }> = [];
    const engine = new CardActionEngine(
      storage.engine,
      {
        actor: { id: 1, name: "Joe User", email: null },
        ipAddress: "192.0.2.7",
        modEvents: {
          ...runtimeFor(["validate_json"]),
          onReport: (r) => reports.push(r as never),
        },
      },
    );
    const result = await engine.createCard({
      name: "Good JSON",
      typeCode: "json",
      content: '{"a": 1}',
    });
    expect(result.cardId).toBeGreaterThan(0);
    // the validator really saw this card — a skip would store the same row
    expect(reports.find((r) => r.stage === "validate")?.fired).toContain("validate_json");
  });

  it("a non-numeric Number save is refused at validate and stores nothing (number.rb:7-9)", async () => {
    const storage = await createActionsTestStorage();
    await seedTypeDeck(storage);
    const reports: Array<{ stage: string; failed: Array<{ event: string }> }> = [];
    const engine = new CardActionEngine(
      storage.engine,
      {
        actor: { id: 1, name: "Joe User", email: null },
        ipAddress: "192.0.2.7",
        modEvents: {
          ...runtimeFor(["validate_number"]),
          onReport: (r) => reports.push(r as never),
        },
      },
    );
    const err = await engine
      .createCard({ name: "Bad Number", typeCode: "number", content: "abc" })
      .then(
        () => undefined,
        (e: unknown) => e as CardActionError,
      );
    expect(err).toBeInstanceOf(CardActionError);
    // number.rb adds under the :content key; the errors view shows
    // "'abc' is not numeric"
    expect(String(err?.message)).toContain("'abc' is not numeric");

    const row = await storage.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE key = ?",
      ["bad_number"],
    );
    expect(row).toBeUndefined();
    // same: the refusal propagates; no validate-stage report is emitted
    expect(reports.find((r) => r.stage === "validate")).toBeUndefined();
  });

  it("a numeric Number save proceeds", async () => {
    const storage = await createActionsTestStorage();
    await seedTypeDeck(storage);
    const engine = new CardActionEngine(
      storage.engine,
      {
        actor: { id: 1, name: "Joe User", email: null },
        ipAddress: "192.0.2.7",
        modEvents: runtimeFor(["validate_number"]),
      },
    );
    const result = await engine.createCard({ name: "Good Number", typeCode: "number", content: "42" });
    expect(result.cardId).toBeGreaterThan(0);
  });
});

describe("card-mod-format event rows — set scoping decides whether the body runs", () => {
  it("a Basic-typed card is not in type/json or type/number, so both events are set-not-applicable", async () => {
    const storage = await createActionsTestStorage();
    await seedTypeDeck(storage);
    const reports: Array<{ stage: string; skipped: Array<{ event: string; reason: string }> }> = [];
    const engine = new CardActionEngine(
      storage.engine,
      {
        actor: { id: 1, name: "Joe User", email: null },
        ipAddress: "192.0.2.7",
        modEvents: {
          ...runtimeFor(["validate_json", "validate_number"]),
          onReport: (r) => reports.push(r as never),
        },
      },
    );
    // malformed-for-both content on a Basic card: Ruby would not refuse,
    // because neither set module is in a Basic card's chain.
    await engine.createCard({ name: "Plain", content: "{bad and not a number" });
    const validate = reports.find((r) => r.stage === "validate");
    const reasons = new Set(validate?.skipped.map((s) => `${s.event}:${s.reason}`));
    expect(reasons).toContain("validate_json:set-not-applicable");
    expect(reasons).toContain("validate_number:set-not-applicable");
  });
});
