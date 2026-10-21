// lib/follow-preference-read.mjs — the RESOLVED follow-preference read a
// deck's own rows answer, and the read Ruby's `preference :follow, viewer`
// performs on a followed card.
//
// WHY THIS READ EXISTS. Ruby never materializes a per-card preference row
// for a deck-wide rule. A viewer whose follow is configured on the `*all` set
// follows EVERY card through the set-pattern walk, with no
// `<card>+*self+<viewer>+*follow` row anywhere. An instrument that grades
// only the materialized read therefore cannot see Ruby's answer for such a
// viewer: it reports a red that describes the instrument's own storage
// assumption, not the engine's behaviour.
//
// THE WALK, AS RUBY PERFORMS IT (card-1.110.0):
//   lib/card/rule/all.rb:17-31  preference(:follow, user) resolves through
//                               preference_card_id
//   lib/card/rule/all.rb:66-73  rule_id_lookup walks rule_lookup_keys in
//                               order and, per key, tries the user's own
//                               preference and then that SAME set's
//                               `*all`-user default (the fallback_suffix);
//                               the first set that answers wins
//   lib/card/set/pattern/all.rb:57-68
//                               set_names / rule_lookup_keys come from the
//                               card's patterns
//   lib/card/rule/all.rb:66-73 + set/type/set.rb:51-57
//                               a SET row's key base is its anchor id plus
//                               the pattern card's codename when the set is
//                               compound, otherwise the set's own codename
//   mod/follow/set/all/follow/followed_by.rb:39-50
//                               all_follow_rule_options splits the resolved
//                               content on newlines and follow_rule_option
//                               takes the first option whose applicability
//                               test passes
//   mod/follow/set/self/always.rb:5
//                               `*always` registers an unconditionally true
//                               test, so for a deck-wide `*always` the first
//                               non-empty line IS the option Ruby returns.
//
// The applicability test of a per-option candidate block is deliberately NOT
// reimplemented here: the reads that call this module run over decks whose
// follow options are `*always`, and every line of the resolved content is
// returned in the result so a reader can see what was available.

/**
 * The rule lookup keys of a SIMPLE card (a name with no "+"), specific to
 * general: `<name>+*self` (mod/core/set_pattern 09_self), then
 * `*type+<Type>` (06_type), then `*all` (01_all). The compound-key arms of
 * Ruby's walk (`*right`, `*type plus right`, `*all plus`, `*rule`, `*star`,
 * `*rstar`) have no counterpart on a simple name.
 *
 * `cardId`/`cardName` are the followed card, whose own id is the anchor of
 * its `+*self` set; `typeId`/`typeName` are its type card, the anchor of the
 * `*type` set. Each key carries the SET NAME it looks up, because that name
 * is what the result reports when the walk stops there.
 */
export function simpleCardLookupKeys({ cardId, cardName, typeId, typeName }) {
  return [
    { setName: `${cardName}+*self`, anchorId: cardId, patternCodename: "self" },
    { setName: `${typeName}+*type`, anchorId: typeId, patternCodename: "type" },
    { setName: "*all", ownCodename: "all" },
  ];
}

/**
 * Resolve the follow option `viewerName` holds on `cardName`.
 *
 * `read` supplies the deck: `db()` returns a queryable handle (the caller
 * opens a fresh read-only handle per call), and `rowByKey(name)` resolves a
 * card row by key. Both are supplied by the caller so this module never
 * opens a database itself and a unit test can back it with a fixture.
 *
 * Returns `{ found: false, why }` when the viewer holds no follow preference
 * on any of the card's lookup keys, and otherwise
 * `{ found: true, option, options, viaKey, viaUser, viaUserId }` where
 * `option` is the option Ruby returns, `viaKey` names the SET whose lookup
 * key answered (the specific-to-general step the walk stopped at), and
 * `viaUser` names the preference row it came from (`*all` when that set's
 * `*all`-user default answered rather than the viewer's own preference).
 */
export function resolvedFollowOption(read, cardName, viewerName) {
  const card = read.rowByKey(cardName);
  const viewer = read.rowByKey(viewerName);
  if (card === undefined || viewer === undefined) {
    return { found: false, why: "no such card or viewer" };
  }
  const typeName = read.db()
    .prepare("SELECT name FROM cards WHERE id=? AND trash=0")
    .get(card.type_id)?.name;
  if (typeName === undefined) return { found: false, why: "the card has no stored type" };
  const typeId = read.rowByKey(typeName)?.id;
  if (typeId === undefined) return { found: false, why: "the card's type card is not in the deck" };

  const setTypeId = read
    .db()
    .prepare("SELECT id FROM cards WHERE codename='set' AND trash=0")
    .get()?.id;
  const followSettingId = read
    .db()
    .prepare(
      `SELECT s.id FROM cards s JOIN cards t ON t.id = s.type_id
        WHERE s.codename='follow' AND t.codename='setting' AND s.trash=0 AND t.trash=0`,
    )
    .get()?.id;
  const allUserId = read.db().prepare("SELECT id FROM cards WHERE codename='all' AND trash=0").get()?.id;
  if (setTypeId === undefined || followSettingId === undefined || allUserId === undefined) {
    return { found: false, why: "the deck carries no *all user, no *follow setting or no Set type" };
  }

  const patternId = (codename) =>
    read.db().prepare("SELECT id FROM cards WHERE codename=? AND trash=0 LIMIT 1").get(codename)?.id;

  // rule/all.rb:66-73 — the lookup is TWO ordered attempts per key, never
  // one disjunctive query: the viewer's own preference on that set first,
  // and only when that answers nothing, that same set's `*all`-user default
  // (the fallback_suffix). A single `IN (viewer, all)` would let the deck's
  // row order decide which of the two wins, which is not what Ruby does.
  const statement = `
    SELECT preferences.db_content AS content, users.id AS user_id, users.name AS user_name
      FROM cards preferences
      JOIN cards user_sets ON preferences.left_id = user_sets.id
      JOIN cards sets      ON user_sets.left_id   = sets.id
      JOIN cards users     ON user_sets.right_id  = users.id
     WHERE preferences.right_id = ?
       AND sets.type_id          = ?
       AND preferences.trash = 0 AND user_sets.trash = 0 AND sets.trash = 0 AND users.trash = 0
       AND users.id = ?
       AND ( (sets.left_id IS NOT NULL AND sets.left_id = ? AND sets.right_id = ?)
             OR (sets.left_id IS NULL AND sets.codename = ?) )`;

  for (const key of simpleCardLookupKeys({ cardId: card.id, cardName: card.name, typeId, typeName })) {
    const rightId = key.ownCodename === undefined ? patternId(key.patternCodename) : undefined;
    if (key.ownCodename === undefined && (rightId === undefined || key.anchorId === null)) continue;
    for (const preferer of [viewer.id, allUserId]) {
      const resolved = read
        .db()
        .prepare(statement)
        .get(followSettingId, setTypeId, preferer, key.anchorId ?? -1, rightId ?? -1, key.ownCodename ?? "");
      if (resolved === undefined) continue;
      const options = String(resolved.content ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      if (options.length === 0) continue;
      return {
        found: true,
        option: options[0],
        options,
        viaKey: key.setName,
        viaUser: resolved.user_name,
        viaUserId: resolved.user_id,
        viaDefault: resolved.user_id !== viewer.id,
      };
    }
  }
  return { found: false, why: "no follow preference for this viewer on any of the card's rule lookup keys" };
}