import { DeckoName, name } from "../src/card/name.ts";
import { setNameEnvironment } from "../src/card/name/environment.ts";

let fails = 0, total = 0;
function eq(label, actual, expected) {
  total++;
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { fails++; console.log(`FAIL ${label}: expected ${e} got ${a}`); }
}
const N = (s) => DeckoName.parse(s);

// ---- key generation (cardname.rb simple_key) - oracle batches 1/2
eq("key Two Words", N("Two Words").key, "two_word");
eq("key Matthias", N("Matthias").key, "matthias");
eq("key Book apostrophe Cover", N("Book's Cover").key, "book__cover");
eq("key A-B", N("A-B").key, "a_b");
eq("key rock&roll", N(" rock&roll ").key, "rock_roll");
eq("key First,Second", N("First,Second").key, "first_second");
eq("key unicode", N("Ünïcödé").key, "Ünïcödé");
eq("key dont", N("don't").key, "don_t");
eq("key 3rd", N("3rd").key, "3rd");
eq("key Mice", N("Mice").key, "mouse");
eq("key News", N("News").key, "news");
eq("key Money", N("Money").key, "money");
eq("key C EDT", N("C EDT").key, "c_edt");
eq("key MacBook", N("MacBook").key, "mac_book");
eq("key TwoWords", N("TwoWords").key, "two_word");
eq("key AB", N("AB").key, "ab");
eq("key A::B", N("A::B").key, "a_b");
eq("key star self", N("*self").key, "*self");
eq("key A*B", N("A*B").key, "a*b");
eq("key empty", N("").key, "");
eq("key A++B", N("A++B").key, "a++b");
eq("key entity", N("Ben&amp;Jerry").key, "ben_jerry");
eq("key numeric entity", N("&#65;").key, "a");
eq("key punctuation", N("Hello, World!").key, "hello_world");
eq("key a1 2b", N("a1 2b").key, "a1_2b");
eq("key 5 + 5", N("5 + 5").key, "5+5");
eq("key padded joint", N("A  +  B").key, "a+b");
eq("key leading space compound", N(" A+B").key, "a+b");

// ---- parts (parts.rb)
eq("parts spaced", N("A + B").parts, ["A", "B"]);
eq("parts A+B+C", N("A+B+C").parts, ["A", "B", "C"]);
eq("left A+B+C", N("A+B+C").left, "A+B");
eq("left_key A+B+C", N("A+B+C").leftKey, "a+b");
eq("right A+B+C", N("A+B+C").right, "C");
eq("trunk A", N("A").trunk, "A");
eq("tag A", N("A").tag, "A");
eq("trunk A+B+C", N("A+B+C").trunk, "A+B");
eq("tag A+B+C", N("A+B+C").tag, "C");
eq("parents A+B+C+D", N("A+B+C+D").parents, ["A+B+C", "D"]);
eq("parent_keys A+B+C+D", N("A+B+C+D").parentKeys, ["a+b+c", "d"]);
eq("num_parts A+B", N("A+B").numParts, 2);
eq("num_parts A", N("A").numParts, 1);
eq("num_parts +B", N("+B").numParts, 2);
eq("left +B", N("+B").left, "");
eq("right +B", N("+B").right, "B");
eq("parts +B", N("+B").parts, ["", "B"]);
eq("parents +B", N("+B").parents, ["", "B"]);
eq("parts empty", N("").parts, []);
eq("simple A", N("A").isSimple, true);
eq("compound A", N("A").isCompound, false);
eq("simple A++B", N("A++B").isSimple, false);
eq("simple empty", N("").isSimple, true);

// ---- indexing (cardname.rb #[])
eq("idx 0", N("A+B+C").get(0).s, "A");
eq("idx 0,2", N("A+B+C").get(0, 2).s, "A+B");
eq("idx -1", N("A+B+C").get(-1).s, "C");
eq("idx 1..2", N("A+B+C").getRange(1, 2).s, "B+C");
eq("idx 10", N("A+B+C").get(10).s, "");
eq("idx +B[0]", N("+B").get(0).s, "");

// ---- pieces (pieces.rb)
eq("pieces A+B+C+D", N("A+B+C+D").pieces, ["A", "B", "C", "D", "A+B", "A+B+C", "A+B+C+D"]);
eq("ancestors A+B+C+D", N("A+B+C+D").ancestors, ["A", "B", "C", "D", "A+B", "A+B+C"]);
eq("piece_names A+B", N("A+B").pieceNames.map((p) => p.s), ["A", "B", "A+B"]);
eq("pieces simple", N("A").pieces, ["A"]);

// ---- equality (cardname.rb ==)
eq("eq A+B==a+b", N("A+B").equals(N("a+b")), true);
eq("eq A+B string", N("A+B").equals("A+B"), true);
eq("eq a b a_b", N("a b").equals("a_b"), true);
eq("eq A B a_b", N("A B").equals("a_b"), true);
eq("eq int", N("75").equals(75), true);
eq("eq spaced", N("A + B").equals(N("A+B")), true);

// ---- variants (variants.rb)
eq("url_key Two Words", N("Two Words").urlKey, "Two_Words");
eq("url_key Mar*co+A", N("Mar*co+A").urlKey, "Mar*co+A");
eq("safe_key A+*B", N("A+*B").safeKey, "a-Xb");
eq("safe_key A-XB", N("A-XB").safeKey, "a_xb");
eq("safe_key set name", N("*series+*type").safeKey, "Xseries-Xtype");
eq("key set name", N("*series+*type").key, "*series+*type");
eq("url_key set name", N("*series+*type").urlKey, "*series+*type");
eq("decoded", N("Ben &amp; Jerry").decoded, "Ben & Jerry");
eq("url_key punctuation", N("What? Is!").urlKey, "What_Is");
eq("url_key doublespace", N("A  B").urlKey, "A_B");
eq("url_key tab", N("tab\tsep").urlKey, "tab_sep");
eq("url_key unicode", N("Ünïcödé").urlKey, "Ünïcödé");
eq("stripped", N("_left+B").stripped.s, "+B");
eq("fully_stripped", N("_left+B").fullyStripped.s, "B");
eq("fully_stripped lead", N("+_left+B").fullyStripped.s, "B");

// ---- predicates (predicates.rb + card/name.rb)
eq("swj +A", N("+A").startsWithJoint, true);
eq("rel +A", N("+A").isRelative, true);
eq("rel _left", N("_left").isRelative, true);
eq("rel _left+B", N("_left+B").isRelative, true);
eq("rel AB", N("AB").isRelative, false);
eq("simple_rel +A", N("+A").isSimpleRelative, true);
eq("frag _left", N("_left").isRelativeFragment, true);
eq("frag _left+B", N("_left+B").isRelativeFragment, false);
eq("abs _left", N("_left").isAbsolute, false);
eq("swp A", N("A+B+C").startsWithParts("A"), true);
eq("swp A+B", N("A+B+C").startsWithParts("A+B"), true);
eq("swp B", N("A+B+C").startsWithParts("B"), false);
eq("swp A,B", N("A+B+C").startsWithParts("A", "B"), true);
eq("ewp C", N("A+B+C").endsWithParts("C"), true);
eq("ewp B+C", N("A+B+C").endsWithParts("B+C"), true);
eq("ewp B,C", N("A+B+C").endsWithParts("B", "C"), true);
eq("ewp empty", N("A+B").endsWithParts(), false);
eq("swp empty", N("A+B").startsWithParts(), true);
eq("incl B+C", N("A+B+C").includes("B+C"), true);
eq("incl a", N("A+B+C").includes("a"), true);
eq("incl C+D", N("A+B+C").includes("C+D"), false);
eq("incl exact", N("A+B").includes("A+B"), true);
eq("star *self", N("*self").isStar, true);
eq("star A", N("A").isStar, false);
eq("star A+B", N("A+B").isStar, false);
eq("rstar A+*right", N("A+*right").isRStar, true);
eq("rstar A+B", N("A+B").isRStar, false);
eq("rstar *right+*type", N("*right+*type").isRStar, true);
DeckoName.bannedCharacters = ["*"];
eq("valid banned", N("A*B").isValid, false);
DeckoName.bannedCharacters = [];
eq("valid clean", N("A*B").isValid, true);

// ---- contextual (contextual.rb)
eq("child A+B+_left", N("A+B+_left").childOf("A+B"), true);
eq("child A+B", N("A+B").childOf("A"), true);
eq("child simple", N("A").childOf("A"), false);
eq("child A+B+C", N("A+B+C").childOf("A+B"), true);
eq("field_of A+B,A", N("A+B").fieldOf("A"), true);
eq("field_of A+B+C,A+B", N("A+B+C").fieldOf("A+B"), true);
eq("field_of +B,blank", N("+B").fieldOf(""), true);
eq("field_of A,A", N("A").fieldOf("A"), false);
eq("field_of +A ctx", N("+A").fieldOf("A"), true);
eq("field_of B+A ctx", N("B+A").fieldOf("A"), false);
eq("field_only +B", N("+B").fieldOnly, true);
eq("field_only +_left+B", N("+_left+B").fieldOnly, true);
eq("field A,B", N("A").field("B"), "A+B");
eq("field_name +B", N("A").fieldName("+B").s, "A+B");
eq("relative_field_name", N("A+B").relativeFieldName("C").s, "+C");
eq("swap B-X", N("A+B+C").swap("B", "X").s, "A+X+C");
eq("swap A+B-X", N("A+B+C").swap("A+B", "X").s, "X+C");
eq("swap overlap", N("A+A+B").swap("A+B", "X").s, "A+X");
eq("swap B+C-X", N("A+B+C").swap("B+C", "X").s, "A+X");
eq("swap nomatch", N("A+B+C").swap("D", "X").s, "A+B+C");
eq("swap AB+AB", N("AB+AB").swap("AB", "X").s, "X+X");
eq("swap keymatch", N("a+b").swap("A", "X").s, "X+b");
eq("swap overlap3", N("A+A+A").swap("A+A", "X").s, "X+A");
eq("swap multiword", N("A+B+C").swap("A+B", "X+Y").s, "X+Y+C");
eq("swap compound new", N("A+B").swap("B", "X+Y").s, "A+X+Y");
eq("prepend A", N("A").prependJoint, "+A");
eq("prepend +A", N("+A").prependJoint, "+A");
eq("withPartAt", N("A+B+C").withPartAt(1, "X").s, "A+X+C");
eq("append", N("A+B").append("C").s, "A+B+C");
eq("succ A", N("A").succ().s, "B");
eq("succ A+B", N("A+B").succ().s, "A+C");

// ---- absolute / from (contextual.rb)
eq("abs _left+A", N("_left+A").absolute("A+B"), "A+A");
eq("abs +A in A+B", N("+A").absolute("A+B"), "A+B+A");
eq("abs +A in C", N("+A").absolute("C"), "C+A");
eq("abs +B in C", N("+B").absolute("C"), "C+B");
eq("abs +A in blank", N("+A").absolute(""), "+A");
eq("abs +A in +A", N("+A").absolute("+A"), "+A");
eq("abs +A in C+*A", N("+A").absolute("C+*A"), "C+*A+A");
eq("abs _self", N("_self").absolute("C"), "C");
eq("abs _whole", N("_whole").absolute("C+D"), "C+D");
eq("abs _right", N("_right").absolute("C+D"), "D");
eq("abs _left", N("_left").absolute("C+D"), "C");
eq("abs _1", N("_1").absolute("C+D"), "C");
eq("abs _2", N("_2").absolute("C+D"), "D");
eq("abs _3", N("_3").absolute("C+D"), "C+D");
eq("abs _LR", N("_LR").absolute("C+D"), "C");
eq("abs _LL", N("_LL").absolute("C+D+E"), "C");
eq("abs _L", N("_L").absolute("C+D+E"), "C+D");
eq("abs _R", N("_R").absolute("C+D+E"), "E");
eq("abs _LEFT", N("_LEFT").absolute("C+D"), "C");
eq("abs _LR+B", N("_LR+B").absolute("C+D"), "C+B");
eq("abs _self+B", N("_self+B").absolute("C"), "C+B");
eq("abs _left+_right", N("_left+_right").absolute("C+D"), "C+D");
eq("name_from A+B+C", N("A+B+C").nameFrom("A+B").s, "+C");
eq("name_from C", N("C").nameFrom("A+B").s, "C");
eq("name_from same", N("A+B").nameFrom("A+B").s, "A+B");
eq("name_from A+B from A", N("A+B").nameFrom("A").s, "+B");
eq("name_from nil", N("A+B").nameFrom(null).s, "A+B");
eq("from A+B+C", N("A+B+C").from("A+B"), "+C");
eq("name_from A+C", N("A+C").nameFrom("A").s, "+C");
eq("nth_left 1", N("A+B+C+D").nthLeftName(1).s, "A+B+C");
eq("nth_left 2", N("A+B+C+D").nthLeftName(2).s, "A+B");
eq("nth_left 4", N("A+B+C+D").nthLeftName(4).s, "");
eq("nth_left 9", N("A+B+C+D").nthLeftName(9).s, "A");

// environment-dependent
setNameEnvironment({ session: "Joe User", mainName: "MainCard" });
eq("abs _user session", N("_user").absolute("C"), "Joe User");
eq("abs _main", N("_main").absolute("C"), "MainCard");
eq("abs _main+_self", N("_main+_self").absolute("C"), "MainCard+C");
setNameEnvironment(undefined);
eq("abs _user plain", N("_user").absolute("C"), "_user");

// vary (name_variants.rb) - oracle probe6/7
eq("vary capitalized", N("a b").vary("capitalized").s, "A b");
eq("vary plural upcase", N("a b").vary("plural, upcase").s, "A BS");
eq("vary singular", N("cards").vary("singular").s, "card");
eq("vary unknown", N("a b").vary("wibble").s, "a b");
eq("vary title", N("a b").vary("title").s, "A B");

// sub_in (manipulate.rb)
eq("sub_in Mouse", N("Mouse").subIn("A Mouse here", "Wolf"), "A Wolf here");
eq("sub_in mice", N("mouse").subIn("two mice", "wolf"), "two wolves");
eq("sub_in moods", N("mood").subIn("Moods and mood and moodiness", "face"), "Faces and face and moodiness");

// Card::Name layer - oracle probe7 (lexicon id lookup is by key, as in Decko)
setNameEnvironment({
  lexicon: {
    name: (id) => ({ 1: "*type", 2: "*email", 5: "Five", 7: "Joe Camper" })[id],
    id: (n) => ({ "five": 5, "joe_camper": 7, "five+joe_camper": 55 })[n],
  },
  codename: {
    id: (c) => ({ "type": 1, "email": 2, "password": 3 })[c],
    name: (c) => ({ "type": "*type", "email": "*email", "password": "*password" })[c],
    nameForId: (id) => ({ 1: "*type", 2: "*email", 3: "*password", 5: "company" })[id],
  },
});
eq("CN key", name("A+B").key, "a+b");
eq("CN s", name("A+B").s, "A+B");
eq("CN strip", name("  A  ").s, "A");
eq("CN array", name(["A", "B"]).s, "A+B");
eq("CN nil", name(null).s, "");
eq("CN codename mark", name({ codename: "type" }).s, "*type");
eq("CN int", name(5).s, "Five");
eq("CN id mark", name("~5").s, "Five");
eq("CN codename string", name(":email").s, "*email");
eq("CN compound pad", name("A  +  B").s, "A+B");
eq("CN compose", DeckoName.compose(["A", "*type"]).s, "A+*type");
eq("CN compose marks", DeckoName.compose([5, ":email"]).s, "Five+*email");
eq("idFromString ~7", DeckoName.idFromString("~7"), 7);
eq("idFromString :email", DeckoName.idFromString(":email"), 2);
eq("idFromString plain", DeckoName.idFromString("plain"), undefined);
eq("standard simple", name("Five").standard.s, "Five");
eq("standard compound", name("five+Joe Camper").standard.s, "Five+Joe Camper");
eq("cardId", name("Five").cardId, 5);
eq("codename", name("Five").codename, "company");
eq("codenameOrString", name("Five").codenameOrString, "company");
try { name(99); eq("CN 99", "no-throw", "throw"); } catch (e) { eq("CN 99", e.message, "Integer not supported as name identifier"); }
try { name("~99"); eq("CN ~99", "no-throw", "throw"); } catch (e) { eq("CN ~99", e.message, "id doesn't exist: 99"); }
try { name(":bogus"); eq("CN :bogus", "no-throw", "throw"); } catch (e) { eq("CN :bogus", e.message, "codename doesn't exist: bogus"); }
try { name({ codename: "bogus" }); eq("CN sym bogus", "no-throw", "throw"); } catch (e) { eq("CN sym bogus", e.message, "unknown codename: bogus"); }
setNameEnvironment(undefined);

// dedupe / identity
eq("dedupe same object", N("A+B") === N("A+B"), true);
eq("dedupe parse of parse", DeckoName.parse(N("A+B")) === N("A+B"), true);
eq("frozen", Object.isFrozen(N("A")), true);

// s fidelity
eq("s interior spaces kept", N("A  B").s, "A  B");
eq("s padded compound normalized", N("A  +  B").s, "A+B");
eq("s endstrip", N("  C EDT  ").s, "C EDT");

console.log(`${total - fails}/${total} passed`);
