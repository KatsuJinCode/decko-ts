// The event :validate_coffeescript_syntax (card-mod-script-0.20.0
// set/type/coffee_script.rb:5-9), ported engine-owned: the action engine's
// validate walk (validateCssSaveTree's coffee_script arm) runs the compile
// on every content/type-changing save of a CoffeeScript card.
//
// Ruby truth under test:
//
//   event :validate_coffeescript_syntax, :validate, on: :save,
//         changed: %i[type_id content] do
//     ::CoffeeScript.compile content
//   rescue ExecJS::RuntimeError => e
//     errors.add :content, e.message.remove("[stdin]:")
//   end
//
// Oracle evidence (executed this session): the gemset's coffee-script
// 2.4.1 (coffee-script-source 1.12.2) through ExecJS on
// "if a then\n  b: c\ngo go go" raises
//   "SyntaxError: [stdin]:1:1: unexpected if"
// -> after the event's remove("[stdin]:"): "SyntaxError: 1:1: unexpected
// if". The npm coffeescript package is pinned at the SAME 1.12.2 compiler;
// the same input throws the same "unexpected if" text with a 0-based
// location, and the port rebuilds Ruby's 1-based bytes from it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  CARDTYPE_ID,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { CardActionError } from "../../../src/card/actions/types.js";
import { coffeeNpmCompiler } from "../../../src/server/coffee-npm-compiler.js";

const BAD_COFFEE = "if a then\n  b: c\ngo go go";
const GOOD_COFFEE = "square = (x) -> x * x\nalert square 4";

let storage: ActionsTestStorage;
let coffeeTypeId = 0;

beforeAll(async () => {
  storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const coffeeType = await seedCard(storage, {
    id: 70,
    name: "CoffeeScript",
    codename: "coffee_script",
    typeId: CARDTYPE_ID,
  });
  coffeeTypeId = coffeeType.id;
});

afterAll(() => {
  storage?.close();
});

function engine(): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    coffeeCompiler: coffeeNpmCompiler(),
  });
}

async function refusalOf(run: Promise<unknown>): Promise<CardActionError> {
  return run.then(
    () => undefined,
    (e: CardActionError) => e,
  ) as Promise<CardActionError>;
}

describe("event :validate_coffeescript_syntax — the compile refuses malformed CoffeeScript saves", () => {
  it("a create with a syntax error refuses with the Ruby-shaped stripped diagnostic", async () => {
    const err = await refusalOf(engine().createCard({ name: "Script A", typeId: coffeeTypeId, content: BAD_COFFEE }));
    expect(err?.code).toBe("validation-failed");
    // Ruby: "SyntaxError: [stdin]:1:1: unexpected if".remove("[stdin]:")
    expect(err?.errorsByAttribute?.content).toBe("SyntaxError: 1:1: unexpected if");
  });

  it("a create with valid CoffeeScript saves", async () => {
    const result = await engine().createCard({ name: "Script B", typeId: coffeeTypeId, content: GOOD_COFFEE });
    expect(result.cardId).toBeGreaterThan(0);
  });

  it("an update changing content to malformed CoffeeScript refuses (changed: :content)", async () => {
    const e = engine();
    const created = await e.createCard({ name: "Script C", typeId: coffeeTypeId, content: GOOD_COFFEE });
    const err = await refusalOf(e.updateCard({ cardId: created.cardId, content: BAD_COFFEE }));
    expect(err?.code).toBe("validation-failed");
    expect(err?.errorsByAttribute?.content).toBe("SyntaxError: 1:1: unexpected if");
  });

  it("a save with the event skipped stands the VALIDATE arm down — any later failure is the asset stage's, not the event's refusal", async () => {
    const e = engine();
    const created = await e.createCard({ name: "Script D", typeId: coffeeTypeId, content: GOOD_COFFEE });
    // skip_event!: validate_coffeescript_syntax (skip_and_trigger.rb:86-90)
    // — the validate walk's skipsEvent gate stands down under the act's
    // skip list. The save's script-asset machinery ALSO compiles coffee
    // content at its own (finalize) stage, exactly as Ruby's asset refresh
    // compiles outside the validate stage — so the observable contract is
    // the STAGE SEPARATION: the refusal, if the act fails at all, is not
    // the validate event's :content error.
    const outcome = await e
      .updateCard({ cardId: created.cardId, content: BAD_COFFEE, skip: ["validate_coffeescript_syntax"] })
      .then(
        () => undefined,
        (err: unknown) => err,
      );
    if (outcome !== undefined) {
      const isValidateRefusal =
        (outcome as { code?: string }).code === "validation-failed" &&
        (outcome as { errorsByAttribute?: { content?: string } }).errorsByAttribute?.content !== undefined;
      expect(isValidateRefusal).toBe(false);
    }
  });
});
