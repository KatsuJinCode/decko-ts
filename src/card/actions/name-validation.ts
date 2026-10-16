// Name validation for the action layer — the save-time name events of
// card-1.110.0 mod/core/set/all/name_events.rb:
//
//   event :validate_name, :validate, on: :save, changed: :name, ... do
//     validate_legality_of_name          # :35-47
//     return if errors.any?
//     Card.write_to_temp_cache self
//     validate_uniqueness_of_name        # :19-26
//   end
//
// Every rejection throws CardActionError with the matching code; in Ruby the
// same conditions add errors and abort the save before any row is written.

import { DeckoName } from "../name.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import type { FetchEngine } from "../fetch.js";
import { lexQuery, type Lex } from "../fetch/lexicon.js";
import { CardActionError } from "./types.js";

/** The 255-char limit of validate_legality_of_name
 *  (name_events.rb:36-38, `name.length > 255` → core_error_too_long). */
export const MAX_NAME_LENGTH = 255;

/** validate_legality_of_name (name_events.rb:35-47). Order follows the
 *  Ruby condition chain: too long → blank → incomplete → banned characters.
 *  (`name_incomplete?` :81-83 — a part is blank and no superleft autoname
 *  context exists; the action layer has no supercard context, so the
 *  autoname escape does not apply.) */
export function validateNameLegality(name: DeckoName): void {
  if (name.s.length > MAX_NAME_LENGTH) {
    throw new CardActionError("name-illegal", `name is too long (${name.s.length} characters)`,
      `NAME: is too long (255 character maximum; length is ${name.s.length})`);
  }
  if (name.s === "") {
    throw new CardActionError("name-illegal", "name cannot be blank", "NAME: can't be blank");
  }
  if (name.parts.includes("")) {
    throw new CardActionError("name-illegal", "name is incomplete", "NAME: is incomplete");
  }
  if (!name.isValid) {
    throw new CardActionError(
      "name-illegal",
      `name contains illegal characters: ${name.s}`,
    );
  }
}

/** validate_uniqueness_of_name (name_events.rb:19-26): the Lexicon's id for
 *  the key, then a live (trash: false) row re-check — "a fast check but
 *  cannot detect if card is in trash". `selfId` is the id of the card being
 *  renamed (`existing_id != id` guard); undefined for creates. */
export async function assertNameAvailable(
  fetcher: FetchEngine,
  name: DeckoName,
  selfId: number | undefined,
): Promise<void> {
  const existingId = await fetcher.lexicon.id(name.key);
  if (existingId === undefined || existingId === selfId) return;
  const result = await fetcher.driver.query<Pick<CardsRow, "id" | "name">>(
    "SELECT id, name FROM cards WHERE id = ? AND trash = 0 LIMIT 1",
    [existingId],
  );
  if (result.rows[0] !== undefined) {
    throw new CardActionError(
      "name-conflict",
      `name is already taken: ${name.s}`,
      // core_error_name_exists names the EXISTING card (name_events.rb:25)
      `NAME: must be unique; '${result.rows[0].name ?? name.s}' already exists.`,
      undefined,
      name.s,
    );
  }
}

/** A trashed cards row matching a lex — the pull_from_trash! query
 *  (mod/core/set/all/trash.rb:57-62, `Lexicon.lex_query(lex).merge trash:
 *  true`). `lex` is the name string for simple cards, [left_id, right_id]
 *  for compound cards (lexicon.rb#lex_query). */
export async function findTrashedCardByLex(
  driver: SQLDatabaseDriver,
  lex: Lex,
): Promise<CardsRow | undefined> {
  const { sql, params } = lexQuery(lex);
  const result = await driver.query<CardsRow>(
    `SELECT * FROM cards WHERE ${sql} AND trash = 1 LIMIT 1`,
    params,
  );
  return result.rows[0];
}

/** The trash-name obstacle of rename_in_trash (name_events.rb:61-66):
 *  `Card.find_by_key_and_trash name.key, true`. Only simple names have a
 *  stored key (compound cards' key columns are NULL post-2020,
 *  20200718051236_compound_names_do_not_store_name_and_key.rb), so compound
 *  renames never find an obstacle — same as Ruby. The comparison folds case
 *  (`COLLATE NOCASE`) like the lexicon's key arm (lexicon.ts lexQuery):
 *  Ruby resolves through MySQL's ci collation, where a drifted stored key
 *  differing only by case still matched; the fold keeps the rename-in-trash
 *  obstacle detectable on libSQL's binary comparison. The Postgres driver
 *  translates COLLATE NOCASE to lower(x) = lower($n). */
export async function findTrashedKeyObstacle(
  driver: SQLDatabaseDriver,
  key: string,
): Promise<CardsRow | undefined> {
  const result = await driver.query<CardsRow>(
    "SELECT * FROM cards WHERE key = ? COLLATE NOCASE AND trash = 1 LIMIT 1",
    [key],
  );
  return result.rows[0];
}
