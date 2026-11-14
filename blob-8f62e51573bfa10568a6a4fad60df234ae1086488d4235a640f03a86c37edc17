// The card_references READ surface and the reference MAINTENANCE sweep -
// the halves of lib/card/reference.rb and lib/card/reference/all.rb the
// write path (refresh-references-out.ts, refresh-references-in.ts) does
// not carry: the row's card readers, the card-level collection helpers,
// and the deck-wide rebuild.
//
// Ruby trail (every behavior cites its source):
// - Reference#referer (lib/card/reference.rb:7-9): the card a row's
//   referer_id points at, through Card[id].
// - All#referer_cards_from_references (lib/card/reference/all.rb:21-23):
//   the rows' referer_ids, uniq, mapped over Card#card, nils compacted.
// - All#referees_from_references (all.rb:35-37): the rows' referee_keys,
//   uniq, each through Card.fetch key, new: {} - an unknown key answers a
//   NEW card, never nil.
// - All#nestees (all.rb:31-33): the referees of the INCLUSION rows
//   (ref_type "I"; the PARTIAL_REF_CODE sibling sits at all.rb:9).
// - All#name_referers (all.rb:41-43): the cards whose out-rows still key
//   this card's key - the referers not yet linked by id.
// - Reference.each_card (reference.rb:66-71): every live card in id
//   order, batched (find_each), yielded for the repair sweeps. Ruby yields
//   card.include_set_modules; the port has no runtime set-module
//   inclusion to perform - the mod loader registers the same modules
//   ahead of any save (src/card/mod-loader/mod-registrar.ts) - so the
//   walk yields the record as stored.
// - Reference.recreate_all (reference.rb:53-57): delete ALL rows, then
//   each card's create_references_out; the port's per-card rebuild is
//   refreshReferencesOut (refresh-references-out.ts), whose delete arm is
//   a no-op on the just-wiped table and whose create arm is
//   referenceRowsOut + the insert_in_slices inserts.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { FetchEngine } from "../fetch.js";
import type { CardRecord } from "../fetch/card-record.js";
import { DeckoName } from "../name.js";
import { refreshReferencesOut, type ReferenceLexicon } from "./refresh-references-out.js";

/** One card_references row as the readers take it (the columns the port's
 *  schema keeps: referer_id, referee_key, referee_id, ref_type). */
export interface ReferenceReadRow {
  referer_id: number | null;
  referee_id: number | null;
  referee_key: string | null;
  ref_type: string | null;
}

/** Reference#referer (lib/card/reference.rb#referer, reference.rb:7-9):
 *  the card that refers, Card[referer_id] - an unlinked row (NULL id)
 *  answers undefined, as Ruby's Card[nil] answers nil. */
export async function referer(
  fetch: FetchEngine,
  row: ReferenceReadRow,
): Promise<CardRecord | undefined> {
  if (row.referer_id === null || row.referer_id === undefined) return undefined;
  return await fetch.fetchById(row.referer_id);
}

/** All#referer_cards_from_references (lib/card/reference/all.rb#
 *  referer_cards_from_references, all.rb:21-23): the rows' referer_ids,
 *  uniq, mapped over Card#card, nils compacted - one card per distinct
 *  linked referer, in first-appearance order. */
export async function refererCardsFromReferences(
  fetch: FetchEngine,
  references: readonly ReferenceReadRow[],
): Promise<CardRecord[]> {
  const seen = new Set<number>();
  const cards: CardRecord[] = [];
  for (const row of references) {
    if (row.referer_id === null || row.referer_id === undefined || seen.has(row.referer_id)) continue;
    seen.add(row.referer_id);
    const card = await fetch.fetchById(row.referer_id);
    if (card !== undefined) cards.push(card);
  }
  return cards;
}

/** All#referees_from_references (lib/card/reference/all.rb#
 *  referees_from_references, all.rb:35-37): the rows' referee_keys, uniq,
 *  each through Card.fetch key, new: {} - an unknown key answers a new
 *  card, so the result never carries undefined for a keyed row. */
export async function refereesFromReferences(
  fetch: FetchEngine,
  references: readonly ReferenceReadRow[],
): Promise<CardRecord[]> {
  const seen = new Set<string>();
  const cards: CardRecord[] = [];
  for (const row of references) {
    const key = row.referee_key;
    if (key === null || key === undefined || seen.has(key)) continue;
    seen.add(key);
    const card = await fetch.fetchWithOptions([key], { new: {} });
    if (card !== undefined) cards.push(card);
  }
  return cards;
}

/** All#nestees (lib/card/reference/all.rb#nestees, all.rb:31-33): the
 *  referees of this card's INCLUSION references - the rows Ruby selects
 *  with where(ref_type: "I"). */
export async function nestees(
  fetch: FetchEngine,
  references: readonly ReferenceReadRow[],
): Promise<CardRecord[]> {
  return await refereesFromReferences(
    fetch,
    references.filter((row) => row.ref_type === "I"),
  );
}

/** All#name_referers (lib/card/reference/all.rb#name_referers, all.rb:
 *  41-43): the cards whose out-references still key THIS card's key - the
 *  referers not yet linked by id. Ruby joins cards to :references_out on
 *  the key; the port joins the same two tables on referer_id. */
export async function nameReferers(
  driver: SQLDatabaseDriver,
  fetch: FetchEngine,
  key: string,
): Promise<CardRecord[]> {
  const result = await driver.query<{ id: number }>(
    `SELECT DISTINCT cards.id AS id FROM cards
       JOIN card_references ON card_references.referer_id = cards.id
      WHERE card_references.referee_key = ? AND cards.trash = 0`,
    [key],
  );
  const cards: CardRecord[] = [];
  for (const row of result.rows) {
    const card = await fetch.fetchById(row.id);
    if (card !== undefined) cards.push(card);
  }
  return cards;
}

/** Reference.each_card (lib/card/reference.rb#each_card, reference.rb:
 *  66-71): every live card, in id order, batched at 1000 rows
 *  (find_each's default batch size), each composed through the fetch
 *  engine's own record path (fetchById). Ruby yields
 *  card.include_set_modules; the port's mod loader registers the set
 *  modules ahead of any save, so the walk yields the record as stored.
 *  A visitor that throws ends the walk (Ruby's yield propagates too). */
export async function eachCard(
  driver: SQLDatabaseDriver,
  fetch: FetchEngine,
  visit: (card: CardRecord) => void | Promise<void>,
): Promise<void> {
  let afterId = 0;
  for (;;) {
    const result = await driver.query<{ id: number }>(
      "SELECT id FROM cards WHERE trash = 0 AND id > ? ORDER BY id LIMIT 1000",
      [afterId],
    );
    if (result.rows.length === 0) return;
    for (const row of result.rows) {
      afterId = row.id;
      const card = await fetch.fetchById(row.id);
      if (card !== undefined) await visit(card);
    }
    if (result.rows.length < 1000) return;
  }
}

/** Reference.recreate_all (lib/card/reference.rb#recreate_all, reference
 *  .rb:53-57): delete ALL reference rows, then every live card's
 *  create_references_out - the fast rebuild Ruby does not recommend for
 *  running sites. The per-card rebuild is refreshReferencesOut; its
 *  delete arm is a no-op on the just-wiped table and its create arm
 *  re-derives the rows from the stored content. A fragment row (a live
 *  card with no name) is skipped: Ruby's walk would raise on Card#name
 *  there, and the port's decks keep every live card named, so the skip
 *  is a guard, not a behavior. */
export async function recreateAll(
  driver: SQLDatabaseDriver,
  lexicon: ReferenceLexicon,
): Promise<void> {
  await driver.query("DELETE FROM card_references", []);
  let afterId = 0;
  for (;;) {
    const result = await driver.query<{
      id: number;
      name: string | null;
      db_content: string | null;
    }>(
      "SELECT id, name, db_content FROM cards WHERE trash = 0 AND id > ? ORDER BY id LIMIT 1000",
      [afterId],
    );
    if (result.rows.length === 0) return;
    for (const row of result.rows) {
      afterId = row.id;
      if (row.name === null || row.name === undefined) continue;
      await refreshReferencesOut(
        driver,
        lexicon,
        row.id,
        DeckoName.parse(row.name),
        row.db_content,
      );
    }
    if (result.rows.length < 1000) return;
  }
}
