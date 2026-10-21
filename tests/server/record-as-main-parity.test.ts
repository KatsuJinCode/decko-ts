// The `record_as_main` method, measured against the PINNED DECK's own
// method.
//
// The completeness register's B13 row grades the port on `record_as_main`
// (rest.rb:64-66, "Env.main_name from params[:main]"). The row's note
// named the method and the parameter but not the ANSWER, and the answer
// has one case a naive transliteration gets wrong.
//
// fixtures/captured/record-as-main-ruby-oracle.json is what
// oracle-capture-record-as-main-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own record_as_main:
//
//   the method  decko-0.20.0/lib/card_controller/rest.rb:63-66
//                 # TODO: refactor this away this when new layout handling is ready
//                 def record_as_main
//                   Card::Env.main_name = params[:main] || card&.name || ""
//                 end
//   the call    decko-0.20.0/lib/card_controller/rest.rb:49-54 - load_card's
//               LAST statement, so it runs for every action that loads a
//               card and not for the shapes that never reach load_card.
//
// The port's serving-path behavior is measured in
// tests/deploy/routes-record-as-main-b13.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  getNameEnvironment,
  recordAsMain,
  setNameEnvironment,
} from "../../src/card/name/environment.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/record-as-main-ruby-oracle.json"), "utf8"),
) as {
  cases: Record<
    string,
    { params: Record<string, string>; cardName: string | null; mainName: string | null; error: string | null }
  >;
  methodSource: Array<{ line: number; text: string }>;
  actionsForRead: string[];
  actionsForAsset: string[];
  actionsForUpdate: string[];
};

describe("the record_as_main method, against the pinned deck gem", () => {
  it("the param is answered verbatim", () => {
    const row = ORACLE.cases.paramPresent;
    expect(row.error).toBeNull();
    expect(row.mainName).toBe("Branch");
  });

  it("an EMPTY param is the empty string, NOT the card's name", () => {
    // `params[:main] || card&.name || ""` - Ruby's `||` falls through on
    // nil/false only, and "" is the truthy empty string. This is the case
    // a JavaScript `||` transliteration gets observably wrong.
    const row = ORACLE.cases.paramEmpty;
    expect(row.error).toBeNull();
    expect(row.mainName).toBe("");
  });

  it("with no param the card's own name is the focal card", () => {
    expect(ORACLE.cases.paramAbsent.mainName).toBe("Front");
    expect(ORACLE.cases.noParamNoCard.mainName).toBe("");
  });

  it("the method runs for every action that loads a card, and not for the asset action", () => {
    // rest.rb:49-54 - record_as_main is load_card's last statement, and
    // the before_action table gives load_card to every action except
    // `asset`.
    expect(ORACLE.actionsForRead).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
    expect(ORACLE.actionsForUpdate).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(ORACLE.actionsForAsset).toEqual([]);
    const call = ORACLE.methodSource.find((row) => row.text.trim() === "record_as_main");
    expect(call).toBeDefined();
  });
});

describe("the port's record_as_main", () => {
  afterEach(() => {
    setNameEnvironment(undefined);
  });

  it("answers the same four cases as the pinned method", () => {
    expect(recordAsMain("Branch", "Front")).toBe("Branch");
    expect(recordAsMain("", "Front")).toBe("");
    expect(recordAsMain(undefined, "Front")).toBe("Front");
    expect(recordAsMain(undefined, undefined)).toBe("");
  });

  it("installs the value the name layer reads for `_main`", () => {
    // The environment's mainName IS Card::Env.main_name (cardname
    // lib/cardname/contextual.rb #absolutize_contextual_parts).
    recordAsMain("Branch", "Front");
    expect(getNameEnvironment()?.mainName).toBe("Branch");
  });
});
