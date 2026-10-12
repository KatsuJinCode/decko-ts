// name-key-url-shape.test.ts -- name-key & URL shaping byte pins.
// One case per shape rule:
//
//   R1 query percent-encoding encodes UTF-8 BYTES, not codepoints
//      (Bogot%C3%A1 over %E1 / codepoint-hex).
//   R2 phantom/unknown pointer-item bar body: data-card-link-name carries
//      the name's url_key form (whitespace runs -> one underscore, case
//      preserved); data-card-name carries the raw stored name
//      (link 'Test_Person_01' / name 'Test Person 01'; link
//      '6th_Kyu_Requirements' over raw '6th Kyu  Requirements' with a
//      DOUBLE space).
//   R3 property spot-checks over the name->key/url shapers: spaces,
//      caps, accents, CJK, ampersands, asterisks.

import { describe, it, expect } from "vitest";
import { cgiEscape } from "../../../src/card/render/slot-html.js";
import { pointerListItemBodyForUnknown } from "../../../src/card/render/pointer-list.js";
import { DeckoName } from "../../../src/card/name.js";

describe("name-key/url shape: query percent-encoding (R1, Z5b exemplar bytes)", () => {
  it("encodes Latin-1-supplement characters as UTF-8 octet pairs (oracle Bogot%C3%A1)", () => {
    expect(cgiEscape("Bogotá")).toBe("Bogot%C3%A1");
  });

  it("encodes CJK as UTF-8 octet triples, not codepoint hex (oracle family shape)", () => {
    // 香 U+9999 -> E9 A6 99; り U+308A -> E3 82 8A. The codepoint-hex
    // encoder emitted %9999-style tokens.
    expect(cgiEscape("香り")).toBe("%E9%A6%99%E3%82%8A");
  });

  it("keeps ASCII semantics: space -> +, & and * percent-encoded (oracle %2B %2A %5B %5D)", () => {
    expect(cgiEscape("A & B")).toBe("A+%26+B");
    expect(cgiEscape("*self")).toBe("%2Aself");
    expect(cgiEscape("+")).toBe("%2B");
  });

  it("reproduces the Z5b exemplar's full card[name] query byte-for-byte", () => {
    // The full card[name] query form of a compound name carrying accents,
    // spaces, hyphens, digits, and junction parts.
    const name = "Bill - Michael - Facil Clase Centro Amar Bogotá 20100920+*self+*default";
    expect(cgiEscape(name)).toBe(
      "Bill+-+Michael+-+Facil+Clase+Centro+Amar+Bogot%C3%A1+20100920%2B%2Aself%2B%2Adefault",
    );
  });
});

describe("name-key/url shape: phantom item bar body attrs (R2, V12+Z4 exemplar bytes)", () => {
  it("Banana+Person item: link-name url_key form, card-name raw (Test_Person_01)", () => {
    const body = pointerListItemBodyForUnknown("Test Person 01");
    expect(body).toContain("data-card-link-name='Test_Person_01'");
    expect(body).toContain("data-card-name='Test Person 01'");
  });

  it("Testing Requirements item: whitespace run folds to ONE underscore, raw name keeps the double space", () => {
    const body = pointerListItemBodyForUnknown("6th Kyu  Requirements");
    expect(body).toContain("data-card-link-name='6th_Kyu_Requirements'");
    expect(body).toContain("data-card-name='6th Kyu  Requirements'");
  });

  it("identity-override arm (known-denied rendering through the phantom body) keeps the same link-name rule", () => {
    const body = pointerListItemBodyForUnknown("SHODAN Requirements", {
      setKeys: "ALL TYPE-basic_c",
      typeName: "BasicCs",
      typeId: 22281,
    });
    expect(body).toContain("data-card-link-name='SHODAN_Requirements'");
    expect(body).toContain("data-card-name='SHODAN Requirements'");
  });

  it("url_key folds the apostrophe to an underscore; the bar-shaped name takes Haml's SECOND escape", () => {
    // "Nicole Le'Strix" -> url_key "Nicole_Le_Strix" (' is not \p{L}: it
    // follows the same not-ok -> space -> underscore fold as spaces and
    // hyphens).
    //
    // The data-card-name value is the TWO-level escape. The body is the
    // bar.haml shape (its own doc comment says so), and bar.haml's
    // `data: bar_wrap_data` crosses Haml's escape_attrs boundary, which
    // re-escapes: haml-5.2.2 lib/haml/attribute_builder.rb:51-59 ->
    // Haml::Helpers.html_escape_without_haml_xss (= CGI.escapeHTML,
    // lib/haml/helpers.rb:609-614), with NO html_safe? branch.
    //
    // HONEST LIMIT on THIS pin: "Nicole Le'Strix" is synthetic. The
    // two-level form on the DENIED body is read off the shared bar.haml
    // template rather than off a rendered denied bar whose name carries an
    // apostrophe; the other pins in this block use names with no
    // apostrophe, so their bytes are unchanged either way.
    const body = pointerListItemBodyForUnknown("Nicole Le'Strix");
    expect(body).toContain("data-card-link-name='Nicole_Le_Strix'");
    expect(body).toContain("data-card-name='Nicole Le&amp;#39;Strix'");
  });

  it("hyphenated names fold hyphens to underscores in the link-name, raw keeps them", () => {
    // Hyphens fold to underscores in the link-name; the raw name keeps
    // them: data-card-link-name='mytho_psychology' over
    // data-card-name='mytho-psychology'.
    const body = pointerListItemBodyForUnknown("mytho-psychology");
    expect(body).toContain("data-card-link-name='mytho_psychology'");
    expect(body).toContain("data-card-name='mytho-psychology'");
  });
});

describe("name-key/url shape: name shaper property spot-checks (R3)", () => {
  const cases: Array<[string, string, string]> = [
    // [input, expected key, expected urlKey]
    ["Test Person 01", "test_person_01", "Test_Person_01"],
    ["6th Kyu  Requirements", "6th_kyu_requirement", "6th_Kyu_Requirements"],
    ["Log Entry", "log_entry", "Log_Entry"],
    ["Bogotá Meetup", "bogotá_meetup", "Bogotá_Meetup"],
    ["香り Log", "香り_log", "香り_Log"],
    ["A & B", "a_b", "A_B"],
    // key singularizes each piece (stable_key): "plus" -> "plu";
    // url_key does NOT singularize.
    ["*type plus right", "*type_plu_right", "*type_plus_right"],
    ["*self", "*self", "*self"],
  ];
  for (const [input, key, urlKey] of cases) {
    it(`key/urlKey of ${JSON.stringify(input)}`, () => {
      const parsed = DeckoName.parse(input);
      expect(parsed.key).toBe(key);
      expect(parsed.urlKey).toBe(urlKey);
    });
  }

  it("safeKey maps '*' -> X and joint -> '-' (CSS/HTML-id-safe form, oracle slot id rich_text-hbq-Xtype_plu_right-content-view)", () => {
    expect(DeckoName.parse("*type plus right").safeKey).toBe("Xtype_plu_right");
    expect(DeckoName.parse("RichText+HBQ+*type plus right").safeKey).toBe(
      "rich_text-hbq-Xtype_plu_right",
    );
  });
});
