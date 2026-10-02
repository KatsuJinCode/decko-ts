// D2 lane: DeckoName#fieldName's Cardish overload — WAGN's Array#to_name is
// Card::Name.compose (card-1.110.0
// config/initializers/01_core_extensions/array.rb:80-83), so a SYMBOL tag
// resolves through the codename registry to the codename card's NAME.
// card-mod-edit set/all/template_nest.rb:27's
// `[type, name].to_name.field_name :type_plus_right` is the live consumer:
// `:type_plus_right` must compose to the `*type plus right` setting card's
// name, otherwise the junction resolves to nothing.
import { afterEach, describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

const NAMES: Record<string, string> = {
  type_plus_right: "*type plus right",
  right: "*right",
  self: "*self",
  description: "description",
};

afterEach(() => setNameEnvironment(undefined));

function installEnv(): void {
  setNameEnvironment({
    codename: {
      id: (codename) => 1,
      name: (codename) => NAMES[codename],
      nameForId: () => undefined,
    },
    lexicon: { name: () => undefined, id: () => undefined },
  });
}

describe("DeckoName#fieldName with a codename tag (template_link_set_name)", () => {
  it("composes a SYMBOL tag through the codename registry to the codename card's name", () => {
    installEnv();
    const pair = DeckoName.compose(["Role", "description"]);
    expect(pair.s).toBe("Role+description");
    // card-mod-edit template_nest.rb:27
    expect(pair.fieldName({ codename: "type_plus_right" }).s).toBe("Role+description+*type plus right");
    // template_nest.rb:29 (the non-type-set arm)
    expect(DeckoName.parse("description").fieldName({ codename: "right" }).s).toBe("description+*right");
    // template_nest.rb:17 (the absolute arm)
    expect(DeckoName.parse("Role+description").fieldName({ codename: "self" }).s).toBe("Role+description+*self");
  });

  it("keeps the string-tag behavior: a leading + is dropped, nothing else changes", () => {
    installEnv();
    // fields.rb:16 `tag = tag.to_s[1..] if !tag.is_a?(Symbol) && tag.to_s[0] == "+"`
    // — the + is STRIPPED, not read as a codename mark, so "+right" composes
    // the bare part and only the Symbol form reaches the registry.
    expect(DeckoName.parse("Role+description").fieldName("*right").s).toBe("Role+description+*right");
    expect(DeckoName.parse("Role+description").fieldName("+right").s).toBe("Role+description+right");
    expect(DeckoName.parse("Role+description").fieldName("type_plus_right").s).toBe(
      "Role+description+type_plus_right",
    );
  });

  it("template_nest's field_only gate is true for a bare relative junction and false otherwise", () => {
    // fields.rb:33-35 field_only?
    expect(DeckoName.parse("+description").fieldOnly).toBe(true);
    expect(DeckoName.parse("+*members").fieldOnly).toBe(true);
    expect(DeckoName.parse("Role+description").fieldOnly).toBe(false);
    expect(DeckoName.parse("_self").fieldOnly).toBe(false);
  });

  it("fully_stripped drops the leading joint so the set name composes from the bare field", () => {
    // variants.rb:35 fully_stripped
    expect(DeckoName.parse("+description").fullyStripped.s).toBe("description");
    expect(DeckoName.parse("+*members").fullyStripped.s).toBe("*members");
  });
});
