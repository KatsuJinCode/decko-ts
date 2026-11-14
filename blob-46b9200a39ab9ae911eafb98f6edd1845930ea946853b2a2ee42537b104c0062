import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolvedFollowOption, simpleCardLookupKeys } from "../lib/follow-preference-read.mjs";

// The W4 (ACT-155) follow-preference read, pinned against the Ruby it
// mirrors. Every assertion below names the Ruby it is the counterpart of, so
// a change to the walk cannot pass by changing both sides at once.
//
//   lib/card/rule/all.rb:17-31   preference(:follow, user) resolves through
//                                preference_card_id
//   lib/card/rule/all.rb:66-73   rule_id_lookup: per lookup key, the user's
//                                own preference, then that set's *all-user
//                                default; first set that answers wins
//   lib/card/set/pattern/all.rb:66-68
//                                rule_lookup_keys come from the patterns
//   mod/follow/set/self/always.rb:5
//                                *always applies unconditionally, so the
//                                first option line is the option Ruby returns

/** A deck holding only what the read touches. THE `*all` ROW IS ONE CARD:
 *  Decko's `*all` is a Set, and `valid_preferer?`
 *  (card-1.110.0 lib/card/rule/all.rb:51-54) accepts it as a preference
 *  preferer for its own codename, so `*all+*all` junctions point back at the
 *  `*all` Set row rather than at a separate User row. */
function fixtureDeck() {
  const dir = mkdtempSync(path.join(tmpdir(), "follow-preference-read-"));
  const file = path.join(dir, "deck.sqlite3");
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE cards (
    id INTEGER PRIMARY KEY, name TEXT, codename TEXT, type_id INTEGER,
    left_id INTEGER, right_id INTEGER, db_content TEXT, trash INTEGER DEFAULT 0)`);
  const insert = db.prepare(
    "INSERT INTO cards (id, name, codename, type_id, left_id, right_id, db_content, trash) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
  );
  const row = (id, name, codename, typeId, leftId, rightId, content = null) =>
    insert.run(id, name, codename, typeId ?? null, leftId, rightId, content);
  // 1 the Set type, 2 the Setting type, 3 the User type
  row(1, "*set", "set", null, null, null);
  row(2, "*setting", "setting", null, null, null);
  row(3, "*user", "user", null, null, null);
  // 4 RichText (the cardtype), 5 the *follow setting, 6 the *all set,
  // 7 *self and 8 *type (the two pattern cards the simple-card keys name)
  row(4, "RichText", null, 3, null, null);
  row(5, "*follow", "follow", 2, null, null, "*never");
  row(6, "*all", "all", 1, null, null);
  row(7, "*self", "self", 1, null, null);
  row(8, "*type", "type", 1, null, null);
  // 9 Ada Admin, 10 Mira Member, 11 the followed card
  row(9, "Ada Admin", null, 3, null, null);
  row(10, "Mira Member", null, 3, null, null);
  row(11, "Topic", null, 4, null, null, "body");
  // 12 Topic+*self (the card's own set), 13 RichText+*type (its type's set)
  row(12, "Topic+*self", null, 1, 11, 7);
  row(13, "RichText+*type", null, 1, 4, 8);
  const read = {
    db: () => db,
    rowByKey: (name) => db.prepare("SELECT id, name, codename, type_id FROM cards WHERE trash=0 AND (name=? OR name=?) ORDER BY id LIMIT 1").get(name, name.replaceAll("_", " ")),
  };
  // A preference pair: the `<set>+<preferer>` junction and its +*follow option.
  const seedPreference = (id, setId, prefererId, content) => {
    row(id, null, null, null, setId, prefererId);
    row(id + 1, null, null, 2, id, 5, content);
  };
  const close = () => { db.close(); rmSync(dir, { recursive: true, force: true }); };
  return { db, read, seedPreference, close };
}

test("a deck-wide *all rule resolves the option with nothing materialized on the card's own set", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    // Mira's rule on the *all set: junction 14 (*all+Mira Member) and its
    // +*follow option 15 = *always. No Topic+*self+Mira Member exists, so
    // nothing is materialized on the followed card.
    seedPreference(14, 6, 10, "*always");
    const resolved = resolvedFollowOption(read, "Topic", "Mira Member");
    assert.equal(resolved.found, true);
    assert.equal(resolved.option, "*always");
    // the walk stopped on the *all lookup key, not the card's own +*self set
    assert.equal(resolved.viaKey, "*all");
    assert.equal(resolved.viaUser, "Mira Member");
  } finally { close(); }
});

test("a set's *all-user default answers when the viewer holds no preference on that set", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    // *all+*all points back at the *all Set row (id 6), so the default
    // answers for every viewer the *all lookup key reaches.
    seedPreference(14, 6, 6, "*always");
    const resolved = resolvedFollowOption(read, "Topic", "Mira Member");
    assert.equal(resolved.option, "*always");
    assert.equal(resolved.viaKey, "*all");
    assert.equal(resolved.viaUser, "*all");
  } finally { close(); }
});

test("a preference on the card's own +*self set wins over the deck-wide rule (first set answers)", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    seedPreference(14, 6, 10, "*always");          // the deck-wide *always
    seedPreference(16, 12, 10, "*never");         // Topic+*self+Mira Member
    const resolved = resolvedFollowOption(read, "Topic", "Mira Member");
    assert.equal(resolved.option, "*never");
    assert.equal(resolved.viaKey, "Topic+*self");
    assert.equal(resolved.viaUser, "Mira Member");
  } finally { close(); }
});

test("the viewer's own rule on one set is preferred over that same set's *all default", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    seedPreference(14, 6, 6, "*never");           // *all+*all, the default
    seedPreference(16, 6, 10, "*always");         // Mira's own rule on *all
    const resolved = resolvedFollowOption(read, "Topic", "Mira Member");
    assert.equal(resolved.option, "*always");
    assert.equal(resolved.viaUser, "Mira Member");
  } finally { close(); }
});

test("a preference on the card's type set answers before the *all set", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    seedPreference(14, 6, 10, "*always");         // the deck-wide *always
    seedPreference(16, 13, 10, "*never");         // RichText+*type+Mira Member
    const resolved = resolvedFollowOption(read, "Topic", "Mira Member");
    assert.equal(resolved.option, "*never");
    assert.equal(resolved.viaKey, "RichText+*type");
  } finally { close(); }
});

test("one viewer's preference does not answer for another viewer", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    seedPreference(14, 6, 10, "*always");
    const resolved = resolvedFollowOption(read, "Topic", "Ada Admin");
    assert.equal(resolved.found, false);
    assert.match(resolved.why, /no follow preference/);
  } finally { close(); }
});

test("a trashed preference row answers nothing (the walk filters trash)", () => {
  const { read, seedPreference, db, close } = fixtureDeck();
  try {
    seedPreference(14, 6, 10, "*always");
    db.prepare("UPDATE cards SET trash=1 WHERE id=15").run();
    assert.equal(resolvedFollowOption(read, "Topic", "Mira Member").found, false);
  } finally { close(); }
});

test("the first option line is the option returned, and every line is reported", () => {
  const { read, seedPreference, close } = fixtureDeck();
  try {
    seedPreference(14, 6, 10, "*always\n*never");
    const resolved = resolvedFollowOption(read, "Topic", "Mira Member");
    assert.equal(resolved.option, "*always");
    assert.deepEqual(resolved.options, ["*always", "*never"]);
  } finally { close(); }
});

test("an unknown card or viewer answers nothing rather than throwing", () => {
  const { read, close } = fixtureDeck();
  try {
    assert.equal(resolvedFollowOption(read, "No Such Card", "Mira Member").found, false);
    assert.equal(resolvedFollowOption(read, "Topic", "No Such Viewer").found, false);
  } finally { close(); }
});

test("the simple-card lookup keys are specific to general and name the three patterns", () => {
  // rule/all.rb:66-73 walks these in order; a change to the order or the set
  // would change which preference answers, so the order is pinned here.
  assert.deepEqual(simpleCardLookupKeys({ cardId: 11, cardName: "Topic", typeId: 4, typeName: "RichText" }), [
    { setName: "Topic+*self", anchorId: 11, patternCodename: "self" },
    { setName: "RichText+*type", anchorId: 4, patternCodename: "type" },
    { setName: "*all", ownCodename: "all" },
  ]);
});
