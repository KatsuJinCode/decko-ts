// src/card/fetch/card-block-declaration.ts: THE CARD-BLOCK DECLARATION.
//
// The transport packing (docs/reports/live-save-transport-design-2026-10-18.md,
// sections 3 and 5): the save's ladder is hundreds of pipeline POSTs that
// carry ONE statement each, because the engine awaits every answer before it
// issues the next statement. A card block's constant-id reads cannot be
// coalesced (no two are ever in flight together), so the only way to put
// them on one round trip is to fetch them BEFORE the engine asks.
//
// WHAT THIS IS. The declaration of ONE block's reads, in every shape the
// deck reads a card by. The packing lane declared the block ONCE, at the
// card-block seam, and in THREE shapes (the card row, the codename column,
// the live row). That reached ONE of the save's blocks: the declaration was
// made at the seam that holds the block, and the other blocks are issued by
// other engine sites, each of which learns its card's id at its own moment.
//
// SO THE DECLARATION IS WIDENED TWO WAYS.
//
//   THE SEAMS. A declaration is made wherever a seam holds a SET of names
//   or ids, not only at the card-block seam. The save's INPUT TREE is such
//   a seam: every card the save touches is named in it, and the names are
//   known at the top of the save, before the permission walk resolves them.
//
//   THE SHAPES. The deck reads a card by id, by key, and by a junction's
//   two sides, and each read has its own statement string. A prefetch only
//   answers a reader whose statement is IDENTICAL to the one it prefetched,
//   so a shape the declaration does not name is a read the save pays a round
//   trip for. The shapes live in card-read-shapes.ts, one per seam, and the
//   declaration names all of them.
//
// WHAT IT COSTS AND WHAT IT BUYS. The declaration is a SPECULATION: the
// driver remembers the answers under the same keys the readers use, and a
// read the driver cannot vouch for is a MISS: the reader's own read then
// takes the blocking path, at its own sequence point, and answers the same.
// So the declaration changes the NUMBER of round trips, never the ANSWERS.

import type { SQLDatabaseDriver, SQLStatement } from "../../server/driver.js";
import { DeckoName } from "../name.js";
import type { DbLexicon } from "./lexicon.js";
import {
  CARD_CODENAME_BY_ID_SQL,
  CARD_CODENAME_BY_KEY_SQL,
  CARD_DB_CONTENT_BY_JUNCTION_SQL,
  CARD_ID_BY_JUNCTION_ORDERED_SQL,
  CARD_NAME_TRIPLE_BY_ID_SQL,
  CARD_ROW_BY_ID_SQL,
  CARD_ROW_BY_KEY_SQL,
  LIVE_CARD_ROW_BY_ID_SQL,
} from "./card-read-shapes.js";

/** Which of the deck's read shapes the declaration covers. */
export interface CardBlockDeclarationScope {
  /** The by-id shapes: the card row, the codename column, the live row and
   *  the name triple. These are the shapes a block's constant ids answer. */
  readonly byId?: boolean;
  /** The by-key shapes: the live row by key (the fetch layer's key arm) and
   *  the codename by key. These answer the block's NAMES. */
  readonly byKey?: boolean;
  /** The junction shapes: the junction's id and the junction's content, by
   *  the two sides' ids. These answer the block's COMPOUND names. */
  readonly byPair?: boolean;
  /** The type chain: the type of every card the block names, and the type
   *  of every card THAT card names. The deck's standard cards are a
   *  property of the deck, so they are declared once and read once. */
  readonly byTypeChain?: boolean;
}

/** The whole scope: the shapes a card block's reads take. */
export const EVERY_CARD_BLOCK_SHAPE: CardBlockDeclarationScope = {
  byId: true,
  byKey: true,
  byPair: true,
  byTypeChain: true,
};

/**
 * Declare a block's reads, so the readers of those reads cost no round trip.
 *
 * @param driver the driver the readers go through.
 * @param lexicon the Lexicon, which owns the name->id lookups.
 * @param names the block's names, and the names of their sides.
 * @param scope which shapes to declare.
 * @returns the ids the block's names resolved to, so a caller that knows an
 *   id the block did not resolve can declare it itself.
 */
export async function declareCardBlockReads(
  driver: SQLDatabaseDriver,
  lexicon: DbLexicon,
  names: readonly DeckoName[],
  scope: CardBlockDeclarationScope = EVERY_CARD_BLOCK_SHAPE,
): Promise<number[]> {
  if (driver.prefetchReads === undefined || names.length === 0) return [];
  // PHASE 1 AND 2: the name->id lookups, in the Lexicon's own shapes. The
  // simple names ride one batch (their bound values are literals); the
  // compound names ride a second one (their bound values are the sides'
  // ids, which the first batch produced).
  const block = await lexicon.prefetchIds(names);
  // THE BY-ID AND BY-PAIR SHAPES: one run. They bind ids, and an id is a
  // value the transaction produced long before the block (the deck's rows
  // are old), so binding one is not a dependency.
  const byIdAndPair: SQLStatement[] = [];
  if (scope.byId !== false) {
    for (const id of block.ids) {
      byIdAndPair.push({ sql: CARD_ROW_BY_ID_SQL, params: [id] });
      byIdAndPair.push({ sql: CARD_CODENAME_BY_ID_SQL, params: [id] });
      byIdAndPair.push({ sql: LIVE_CARD_ROW_BY_ID_SQL, params: [id] });
      byIdAndPair.push({ sql: CARD_NAME_TRIPLE_BY_ID_SQL, params: [id] });
    }
  }
  if (scope.byPair === true) {
    for (const pair of block.pairs) {
      byIdAndPair.push({ sql: CARD_ID_BY_JUNCTION_ORDERED_SQL, params: [pair[0], pair[1]] });
      byIdAndPair.push({ sql: CARD_DB_CONTENT_BY_JUNCTION_SQL, params: [pair[0], pair[1]] });
    }
  }
  if (byIdAndPair.length > 0) await driver.prefetchReads(byIdAndPair);
  // THE BY-KEY SHAPES: their OWN run, and the codename shape FIRST.
  //
  // WHY A SEPARATE RUN, AND WHY THIS ORDER. A by-key read binds a KEY, and
  // the by-id rows the run above returned CARRY that key as a cell. A
  // statement that binds a value an earlier statement in ITS OWN run
  // produced cannot be answered from that run (the probe's arm 3: the bound
  // value is fixed when the request is sent), so a by-key statement sharing
  // a run with the by-id rows would come back UNVERIFIED and the reader
  // would fall back to the blocking path, a round trip the declaration was
  // supposed to remove. The by-key shapes therefore ride their own run,
  // after the by-id run has produced the keys, and the codename shape comes
  // first because it binds the key without producing it: the row shape
  // produces the key, and a statement that binds what an earlier statement
  // in the same run produced is the one the rule cannot vouch for.
  if (scope.byKey === true) {
    const byKey: SQLStatement[] = [];
    for (const name of names) {
      if (!name.isSimple) continue;
      byKey.push({ sql: CARD_CODENAME_BY_KEY_SQL, params: [name.key] });
    }
    for (const name of names) {
      if (!name.isSimple) continue;
      byKey.push({ sql: CARD_ROW_BY_KEY_SQL, params: [name.key] });
    }
    if (byKey.length > 0) await driver.prefetchReads(byKey);
  }
  if (scope.byId === false || scope.byTypeChain !== true) return block.ids;
  // PHASE 3: THE TYPE CHAIN. A card's type is a property of the deck, not
  // of the card, and the save's hot ids are exactly the type cards (the
  // design's own capture: the ids a save binds most are the deck's type
  // cards: the user type, the RichText type, the *all card). The chain is
  // short (a card, its type, its type's type), and each link's id is a
  // cell of the row the previous link's read returned, so the chain is
  // declared link by link, one round trip per link.
  const chain = await declareTypeChain(driver, block.ids);
  return [...block.ids, ...chain];
}

/**
 * The type chain of a set of ids: the type of every card the ids name, and
 * the type of every card THAT card names, in as many links as the deck's
 * chain is long.
 *
 * The ids are the deck's, not the save's: a type card is a row of the deck
 * that the save reads the same way whatever card it is saving, so naming it
 * once is enough.
 */
async function declareTypeChain(driver: SQLDatabaseDriver, ids: readonly number[]): Promise<number[]> {
  if (driver.prefetchReads === undefined) return [];
  const seen = new Set<number>(ids);
  const declared: number[] = [];
  let frontier = [...ids];
  for (let link = 0; link < TYPE_CHAIN_LINKS && frontier.length > 0; link += 1) {
    const statements: SQLStatement[] = [];
    for (const id of frontier) {
      statements.push({ sql: CARD_ROW_BY_ID_SQL, params: [id] });
      statements.push({ sql: CARD_CODENAME_BY_ID_SQL, params: [id] });
    }
    const outcomes = await driver.prefetchReads(statements);
    const next: number[] = [];
    for (const outcome of outcomes) {
      if (outcome.unverified || outcome.result === undefined) continue;
      for (const row of outcome.result.rows as Array<{ type_id?: unknown }>) {
        const typeId = row.type_id;
        if (typeof typeId !== "number" || !Number.isInteger(typeId)) continue;
        if (seen.has(typeId)) continue;
        seen.add(typeId);
        next.push(typeId);
      }
    }
    declared.push(...next);
    frontier = next;
  }
  return declared;
}

/** How many links of the type chain the declaration walks. The chain is
 *  card -> type -> type's type -> the *all card; three links reach the
 *  deck's standard cards, and every link is one round trip. */
const TYPE_CHAIN_LINKS = 3;

/**
 * The block's names, and the names of their sides.
 *
 * A compound name's lookup binds its sides' ids, so the sides are resolved
 * first; a block's names therefore always travel with their sides' names.
 * A name the engine itself cannot parse is skipped: the block's own read of
 * it fails the same way it always did.
 */
export function cardBlockNames(
  keys: Iterable<string>,
  mainName: DeckoName | undefined,
): DeckoName[] {
  const names: DeckoName[] = [];
  const seen = new Set<string>();
  const collect = (name: DeckoName): void => {
    if (seen.has(name.s)) return;
    seen.add(name.s);
    names.push(name);
    if (name.leftName !== undefined) collect(name.leftName);
    if (name.rightName !== undefined) collect(name.rightName);
  };
  for (const key of keys) {
    const fullName = key.startsWith("+") ? `${mainName?.s ?? ""}${key}` : key;
    try {
      collect(DeckoName.parse(fullName));
    } catch {
      // A name the engine itself cannot parse is not this method's to
      // declare: the block's own read of it fails the same way it always
      // did.
    }
  }
  return names;
}
