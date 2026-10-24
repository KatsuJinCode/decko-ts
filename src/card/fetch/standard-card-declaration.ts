// src/card/fetch/standard-card-declaration.ts: THE DECK'S STANDARD CARDS,
// DECLARED.
//
// WHY THIS EXISTS. The save's ladder is hundreds of pipeline POSTs that carry
// ONE statement each, because the engine awaits every answer before it issues
// the next statement (src/card/fetch/card-block-declaration.ts says why, and
// what the packing is for). The card-block declaration answers that for the
// save's INPUT TREE: every card the save TOUCHES is named in the input tree,
// so the declaration can name those cards' reads before the engine asks.
//
// IT CANNOT ANSWER IT FOR THE DECK'S STANDARD CARDS. The standard cards are a
// property of the DECK, not of the save: the deck carries them under a
// CODENAME (the rule types, the card types, the party cards), and the save
// reads them by that codename and by their id without ever naming them in its
// input tree. So every read of one is a round trip of its own.
//
// TWO BATCHES, AND WHY TWO.
//
//   FIND   one batch that finds the standard cards the save asks for, in the
//          shape the readers use (the id a codename names);
//   SHAPES one batch that reads the shapes of the cards FIND found.
//
// ONE batch would do neither job: a batch that binds a value an earlier
// statement of its own batch produced cannot be answered by that batch (the
// probe's arm 3: the bound value is fixed when the request is sent), and the
// shapes batch binds the ids the FIND batch produced.
//
// WHAT IT COSTS AND WHAT IT BUYS. The declaration is a SPECULATION: the
// driver remembers the answers under the same keys the readers use, and a read
// the driver cannot vouch for is a MISS: the reader's own read then takes the
// blocking path, at its own sequence point, and answers the same. So the
// declaration changes the NUMBER of round trips, never the ANSWERS.

import type { SQLDatabaseDriver, SQLStatement } from "../../server/driver.js";
import {
  CARD_CODENAME_BY_ID_SQL,
  CARD_ID_BY_CODENAME_SQL,
  CARD_ROW_BY_ID_SQL,
  LIVE_CARD_ROW_BY_ID_SQL,
} from "./card-read-shapes.js";

/**
 * The deck's standard cards, by the codename the deck carries them under.
 *
 * THE LIST IS THE SAVE'S OWN VOCABULARY, not a guess about the deck:
 *
 *   read, set, setting   the rule types. The read-rule write path resolves
 *                         them one at a time, by codename, every time it
 *                         derives a rule (src/card/permissions/set-read-rule.ts).
 *   basic, user,         the card types the save reads by id: the type of
 *   cardtype, list,      the card being saved, the type of the field cards,
 *   search_type,         and the type of the cards the rule path walks.
 *   all, all_plus,
 *   default
 *
 * The list is a property of the engine's vocabulary (the codenames the engine
 * itself names), so it is the same list for every deck: a deck that carries
 * no card under one of these codenames simply has no card to declare, and the
 * declaration finds nothing for it.
 */
export const DECK_STANDARD_CARD_CODENAMES = [
  "read",
  "set",
  "setting",
  "basic",
  "user",
  "cardtype",
  "list",
  "search_type",
  "all",
  "all_plus",
  "default",
] as const;

/** The standard cards the deck carries, by codename, to their ids. */
export type DeckStandardCardIds = ReadonlyMap<string, number>;

/**
 * Declare the deck's standard cards, so the readers of their reads cost no
 * round trip.
 *
 * @param driver the driver the readers go through. The declaration needs the
 *   driver's transaction: outside one there is no read memo to hold the
 *   answers, so the declaration does nothing there.
 * @returns the standard cards the deck carries, by codename, to their ids.
 */
export async function declareDeckStandardCards(
  driver: SQLDatabaseDriver,
): Promise<DeckStandardCardIds> {
  const byCodename = new Map<string, number>();
  if (driver.prefetchReads === undefined) return byCodename;

  // PHASE 1: FIND. One run, one round trip: the id each standard codename
  // names, in the shape the readers of that shape use. A reader that asks for
  // a codename this list does not name is not answered by the declaration,
  // and reads it on the blocking path as it always did.
  const find: SQLStatement[] = DECK_STANDARD_CARD_CODENAMES.map((codename) => ({
    sql: CARD_ID_BY_CODENAME_SQL,
    params: [codename],
  }));
  const found = await driver.prefetchReads(find);
  const ids: number[] = [];
  for (let index = 0; index < found.length; index += 1) {
    const outcome = found[index];
    if (outcome === undefined || outcome.unverified || outcome.result === undefined) continue;
    const row = (outcome.result.rows as Array<{ id?: unknown }>)[0];
    const id = row?.id;
    if (typeof id !== "number" || !Number.isInteger(id)) continue;
    byCodename.set(DECK_STANDARD_CARD_CODENAMES[index] as string, id);
    ids.push(id);
  }
  if (ids.length === 0) return byCodename;

  // PHASE 2: THE SHAPES. One run, one round trip: the shapes the deck reads
  // a card by. The ids are values the FIND batch produced, and a statement
  // that binds a value an earlier statement in its OWN run produced cannot be
  // answered by that run, so the shapes ride their own run.
  const shapes: SQLStatement[] = [];
  for (const id of ids) {
    shapes.push({ sql: CARD_ROW_BY_ID_SQL, params: [id] });
    shapes.push({ sql: LIVE_CARD_ROW_BY_ID_SQL, params: [id] });
    shapes.push({ sql: CARD_CODENAME_BY_ID_SQL, params: [id] });
  }
  await driver.prefetchReads(shapes);
  return byCodename;
}
