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
import {
  TRASHED_CARD_BY_JUNCTION_SQL,
  TRASHED_CARD_BY_KEY_SQL,
} from "../fetch/card-read-shapes.js";
import { CardActionError } from "./types.js";

/** The 255-char limit of validate_legality_of_name
 *  (name_events.rb:36-38, `name.length > 255` → core_error_too_long).
 *  Ruby String#length counts CHARACTERS (codepoints); the comparison and
 *  the error's %{length} both use the codepoint count, so a name of 200
 *  astral-plane emoji (400 UTF-16 units) is legal here exactly as in Ruby. */
export const MAX_NAME_LENGTH = 255;

/** Ruby String#length on a JS string: codepoint count. */
export function rubyStringLength(str: string): number {
  let count = 0;
  for (const _ of str) count += 1;
  return count;
}

/** The arms of validate_legality_of_name's chain
 *  (name_events.rb:23-35), in the order the chain tests them. The arm
 *  names the port's own error text, so the port's built-in check and the
 *  registered body refuse the same way. */
export type NameLegalityArm = "too-long" | "blank" | "incomplete" | "banned-characters";

/** The port's own error for one arm of the name-legality chain: the
 *  Error's message is the port's wording, the userMessage is Ruby's own
 *  text for the arm (the pinned locale's), the way the port's other
 *  refusals pair the two. The banned-characters arm has no userMessage,
 *  as it never had one. */
export function nameLegalityError(
  arm: NameLegalityArm,
  rubyMessage: string | undefined,
  name: DeckoName,
): CardActionError {
  switch (arm) {
    case "too-long":
      return new CardActionError(
        "name-illegal",
        `name is too long (${rubyStringLength(name.s)} characters)`,
        `NAME: ${rubyMessage ?? ""}`,
      );
    case "blank":
      return new CardActionError("name-illegal", "name cannot be blank", `NAME: ${rubyMessage ?? ""}`);
    case "incomplete":
      return new CardActionError("name-illegal", "name is incomplete", `NAME: ${rubyMessage ?? ""}`);
    case "banned-characters":
      return new CardActionError("name-illegal", `name contains illegal characters: ${name.s}`);
  }
}

/** validate_legality_of_name (name_events.rb:35-47). Order follows the
 *  Ruby condition chain: too long → blank → incomplete → banned characters.
 *  (`name_incomplete?` :81-83 — a part is blank and no superleft autoname
 *  context exists; the action layer has no supercard context, so the
 *  autoname escape does not apply.) */
export function validateNameLegality(name: DeckoName): void {
  const length = rubyStringLength(name.s);
  if (length > MAX_NAME_LENGTH) {
    throw nameLegalityError(
      "too-long",
      `is too long (255 character maximum; length is ${length})`,
      name,
    );
  }
  if (name.s === "") {
    throw nameLegalityError("blank", "can't be blank", name);
  }
  if (name.parts.includes("")) {
    throw nameLegalityError("incomplete", "is incomplete", name);
  }
  if (!name.isValid) {
    throw nameLegalityError("banned-characters", undefined, name);
  }
}

/**
 * event :validate_key, after: :validate_name, on: :save, when: :no_autoname?
 * (name_events.rb:44-49): `if key.empty? → errors.add :key,
 * t(:core_error_blank_key)`. The card's computed key (Card#key = name.key
 * for a fresh save) must not be EMPTY: a name whose every character falls
 * outside the key alphabet ("!!!", "???", pure emoji) computes the empty
 * key, and Ruby refuses the save with "Key cannot be blank" instead of
 * storing a row whose key column would then collide with every other
 * punctuation-only name on the cards.key unique index. The port never
 * reaches that index with an empty key through this event either.
 *
 * The `elsif key != name.key` arm is out of scope: it only fires when the
 * KEY COLUMN was assigned a value different from the computed one, and the
 * action layer derives the column from the name (no external key input).
 */
export function validateComputedKey(name: DeckoName): void {
  if (name.key !== "") return;
  throw new CardActionError(
    "validation-failed",
    "Validation failed: Key cannot be blank",
    "KEY: cannot be blank",
    { key: "cannot be blank" },
    name.s,
  );
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
      // core_error_name_exists names the EXISTING card in BOTH forms
      // (name_events.rb:25 binds `name: existing_card.name`)
      `name is already taken: ${result.rows[0].name ?? name.s}`,
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
  // THE SHAPES ARE THE REGISTRY'S (src/card/fetch/card-read-shapes.ts), so a
  // declaration that knows the arguments can answer this read: a prefetch
  // only answers a reader whose statement is IDENTICAL to the one it
  // prefetched. The two shapes the walk asks for are the compound one (both
  // sides known) and the simple one (a key); the half-known compound lex
  // keeps the assembled statement, which no declaration names.
  const statement =
    Array.isArray(lex) && lex[0] !== undefined && lex[1] !== undefined
      ? TRASHED_CARD_BY_JUNCTION_SQL
      : Array.isArray(lex)
        ? `SELECT * FROM cards WHERE ${sql} AND trash = 1 LIMIT 1`
        : TRASHED_CARD_BY_KEY_SQL;
  const result = await driver.query<CardsRow>(statement, params);
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
  const result = await driver.query<CardsRow>(TRASHED_CARD_BY_KEY_SQL, [key]);
  return result.rows[0];
}
