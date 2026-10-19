/**
 * DeckoName key algebra vs the Ruby oracle, on the digit+capital boundary.
 *
 * WHAT THIS PINS. Cardname#key (cardname 0.20.0 lib/cardname.rb #generate_key
 * -> #simple_key) runs the name through ActiveSupport's `underscore` BEFORE
 * anything else. `underscore` inserts "_" between a lowercase letter or digit
 * and a following capital — activesupport-7.2.4
 * lib/active_support/inflector/methods.rb:100 `word.gsub!(/([a-z\d])([A-Z])/,
 * '\1_\2')` — and then downcases. So an UPPERCASE token whose final letter is
 * preceded by a digit keys DIFFERENTLY from its lowercase spelling:
 *
 *     Cardname.new("MVEMONUT31C").key == "mvemonut31_c"
 *     Cardname.new("mvemonut31c").key == "mvemonut31c"     # DIFFERENT NAMES
 *
 * That is not a port defect and it is not "digit+C" specifically — it is any
 * digit before any capital: "CARD 3X" keys "card_3_x", "CARD 2ND" keys
 * "card_2_nd", "CARD 1ST" keys "card_1_st".
 *
 * WHERE THE "_" COMES FROM. `underscore` (src/card/name/inflect.ts). It does
 * NOT come from simpleKeyUncached's NOT_OK_FOR_KEY fold (src/card/name.ts:128):
 * on a word made only of characters that fold already allows, the fold is a
 * no-op — "_" is a connector punctuation (\p{Pc}) and is inside its own allowed
 * class. The split/rejoin that follows re-separates on every "_" and rejoins
 * with "_", so the underscore step's separators survive intact.
 *
 * WHY THE VALUES BELOW ARE ORACLE VALUES. Measured by running
 * card-1.110.0's Card::Name (the class DeckoName ports) against cardname-0.20.0
 * and activesupport-7.2.4 from the pinned gemset, with no deck inflection
 * initializer applied — matching this suite's default tables. The measured
 * records are kept in tmp/act185-parity/ for the run that produced them.
 *
 * WHY IT MATTERS. An earlier probe read the digit+capital key split as an
 * engine bug and expected an all-caps digit+C address to resolve to the card it
 * was created from. It does not, and must not: in Ruby those two strings are
 * two different names, so the by-key lookup misses and Ruby Decko answers the
 * unknown-name page (card-mod-format-0.20.0 set/all/html/error.rb:81-86 — an
 * unknown card whose actor may create renders :new at status 200). "Fixing"
 * the port to fold the underscore away would diverge from Ruby, so this file
 * exists to make that divergence a loud test failure rather than a quiet
 * "improvement".
 */

import { describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { underscore } from "../../../src/card/name/inflect.js";

/** Card::Name#key, measured in the Ruby oracle (see the file header). */
const ORACLE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  // the trigger table the probe reports
  AB1C: "ab1_c",
  AB99C: "ab99_c",
  ABC: "abc",
  CARDC: "cardc",
  STATUSC: "statusc",
  mvemonut31c: "mvemonut31c",
  MVEMONUT31C: "mvemonut31_c",
  HOME: "home",
  home: "home",
  FOCUS: "focu",
  focus: "focu",
  // the trigger is digit + ANY capital, not digit + "C"
  "9C": "9_c",
  "9c": "9c",
  "C9": "c9",
  "c9": "c9",
  "CARD 3X": "card_3_x",
  "Card 3x": "card_3x",
  "CARD 2ND": "card_2_nd",
  "Card 2nd": "card_2nd",
  "CARD 1ST": "card_1_st",
  "Card 1st": "card_1st",
  "Card 9C": "card_9_c",
  "Card 9c": "card_9c",
  "CARD 9CX": "card_9_cx",
  "Card 9Cx": "card_9_cx",
  // the ACT-185 probe pair: one card's name vs its all-caps spelling
  "Harness Plurality Digit 9c mvfgvhsv": "harness_plurality_digit_9c_mvfgvhsv",
  "HARNESS PLURALITY DIGIT 9C MVFGVHSV": "harness_plurality_digit_9_c_mvfgvhsv",
  Harness_Plurality_Digit_9c_mvfgvhsv: "harness_plurality_digit_9c_mvfgvhsv",
  HARNESS_PLURALITY_DIGIT_9C_MVFGVHSV: "harness_plurality_digit_9_c_mvfgvhsv",
  // the control: no digit+capital adjacency, so all four spellings are one name
  "Harness Plurality Caseprobe 91": "harness_plurality_caseprobe_91",
  "HARNESS PLURALITY CASEPROBE 91": "harness_plurality_caseprobe_91",
  Harness_Plurality_Caseprobe_91: "harness_plurality_caseprobe_91",
  HARNESS_PLURALITY_CASEPROBE_91: "harness_plurality_caseprobe_91",
});

/** ActiveSupport String#underscore, measured in the same Ruby run. Note the
 *  space survives: `underscore` only inserts separators, it never removes
 *  characters, so the space->"_" conversion is simpleKeyUncached's later fold. */
const ORACLE_UNDERSCORES: Readonly<Record<string, string>> = Object.freeze({
  AB1C: "ab1_c",
  MVEMONUT31C: "mvemonut31_c",
  mvemonut31c: "mvemonut31c",
  "CARD 3X": "card 3_x",
  "Card 3x": "card 3x",
  "HARNESS PLURALITY DIGIT 9C MVFGVHSV": "harness plurality digit 9_c mvfgvhsv",
  "Harness Plurality Digit 9c mvfgvhsv": "harness plurality digit 9c mvfgvhsv",
});

describe("DeckoName key algebra matches the Ruby oracle across the digit+capital boundary", () => {
  it("keys every pinned name exactly as Card::Name does", () => {
    for (const [name, key] of Object.entries(ORACLE_KEYS)) {
      expect(DeckoName.parse(name).key, `key for ${JSON.stringify(name)}`).toBe(key);
    }
  });

  it("underscores exactly as ActiveSupport does", () => {
    for (const [word, underscored] of Object.entries(ORACLE_UNDERSCORES)) {
      expect(underscore(word), `underscore for ${JSON.stringify(word)}`).toBe(underscored);
    }
  });

  it("treats the ACT-185 all-caps digit+C spelling as a DIFFERENT name, as Ruby does", () => {
    const canonical = DeckoName.parse("Harness Plurality Digit 9c mvfgvhsv");
    const shouted = DeckoName.parse("HARNESS PLURALITY DIGIT 9C MVFGVHSV");
    expect(canonical.key).not.toBe(shouted.key);
    expect(canonical.key).toBe("harness_plurality_digit_9c_mvfgvhsv");
    expect(shouted.key).toBe("harness_plurality_digit_9_c_mvfgvhsv");
    // The two names are different names, so neither resolves to the other —
    // this is the property the probe leg used to assert and had to retract.
    expect(canonical.equals(shouted)).toBe(false);
  });

  it("still folds case for a name with no digit+capital adjacency", () => {
    const spellings = [
      "Harness Plurality Caseprobe 91",
      "HARNESS PLURALITY CASEPROBE 91",
      "Harness_Plurality_Caseprobe_91",
      "HARNESS_PLURALITY_CASEPROBE_91",
    ];
    const keys = new Set(spellings.map((s) => DeckoName.parse(s).key));
    expect([...keys]).toEqual(["harness_plurality_caseprobe_91"]);
  });

  it("produces the separator in underscore(), not in the NOT_OK_FOR_KEY fold", () => {
    // The fold in simpleKeyUncached (src/card/name.ts:128) cannot be the source
    // of the digit+capital separator. On a word whose characters are all in the
    // fold's own allowed class, the fold is inert: "_" is \p{Pc} (connector
    // punctuation), so it is allowed and survives untouched. (The fold is NOT
    // inert on a name containing spaces — it converts those to "_" — which is
    // its actual job; scoping the claim to single tokens keeps it honest.)
    // If someone later "fixes" the key algebra to drop this separator, the
    // key assertions above are the alarm.
    const NOT_OK_FOR_KEY = /[^\p{L}\p{M}\p{Nd}\p{Pc}*]+/gu;
    for (const word of ["AB1C", "AB99C", "MVEMONUT31C", "CARD3X", "HOME"]) {
      const afterUnderscore = underscore(word);
      expect(afterUnderscore.replace(NOT_OK_FOR_KEY, "_")).toBe(afterUnderscore);
    }
    // The separator is already present the moment underscore() returns, before
    // any folding could have produced it.
    expect(underscore("AB1C")).toBe("ab1_c");
    expect(underscore("MVEMONUT31C")).toBe("mvemonut31_c");
    expect(DeckoName.parse("AB1C").key).toBe(ORACLE_KEYS.AB1C);
    expect(DeckoName.parse("MVEMONUT31C").key).toBe(ORACLE_KEYS.MVEMONUT31C);
  });
});