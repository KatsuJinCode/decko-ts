// The Number and JSON cardtypes' save-time validations (card-mod-format
// set/type/number.rb :validate_number, set/type/json.rb :validate_json),
// pinned against fixtures captured from Ruby: Kernel#Float acceptance under
// Ruby 3.3, and JSON.parse error messages under json 3.0.2 (the oracle
// bundle's pin).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  jsonSyntaxError,
  jsonValidationMessage,
  numberValidationMessage,
  rubyFloatParsable,
} from "../../../src/card/mod-loader/mods/format-validations.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";

const fixture = (name: string): Array<[string, unknown]> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("validate_number: String#number? (Kernel#Float)", () => {
  const cases = fixture("ruby-float-acceptance.json") as Array<[string, boolean]>;
  it.each(cases)("Float(%j) accepted = %s", (input, accepted) => {
    expect(rubyFloatParsable(input)).toBe(accepted);
  });

  it("words the error as the errors view shows it", () => {
    expect(numberValidationMessage("abc")).toBe("CONTENT: 'abc' is not numeric");
    expect(numberValidationMessage("42")).toBeNull();
    // blank content is not numeric either: the event has no presence guard
    expect(numberValidationMessage("")).toBe("CONTENT: '' is not numeric");
  });
});

describe("validate_json: json 3.0.2 parse errors", () => {
  const cases = fixture("json-3.0.2-parse-errors.json") as Array<[string, string | null]>;
  it.each(cases)("JSON.parse(%j)", (input, message) => {
    expect(jsonSyntaxError(input)).toBe(message);
  });

  it("skips blank content and prefixes the errors key", () => {
    expect(jsonValidationMessage("   ")).toBeNull();
    expect(jsonValidationMessage("{bad")).toBe(
      "INVALID JSON: expected object key, got 'bad' at line 1 column 2",
    );
  });
});

describe("registration", () => {
  it("registers both events at :validate on their type sets", () => {
    const registry = defaultDeckEventRuntime().registry;
    const all = registry.forStage("validate").map((e) => `${e.setPath}:${e.event}`);
    expect(all).toContain("type/number:validate_number");
    expect(all).toContain("type/json:validate_json");
  });
});
