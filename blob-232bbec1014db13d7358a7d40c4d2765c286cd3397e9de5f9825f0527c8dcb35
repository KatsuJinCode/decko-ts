// src/card/auth/api-key-lookup.ts - the api_key AUTHENTICATOR's card-side
// lookup: the account whose *api_key card carries a given key, found by
// CONTENT and not by name.
//
// Ruby sources (card-mod-api_key-0.20.0):
//   lib/card/auth/api_key.rb:7-15    signin_with(token:, api_key:) - the
//                                    ORDER: token, then api_key, then
//                                    session
//   lib/card/auth/api_key.rb:18-25   signin_with_api_key - find the
//                                    account, authenticate the key, sign
//                                    in as the account's left_id
//   lib/card/auth/api_key.rb:30-32   find_account_by_api_key - the lookup
//                                    STRIPS the key
//   lib/card_controller/api_key.rb:4-8  authenticators - the X-API-Key
//                                    header wins over the api_key param
//   set/right/api_key.rb:33-38       authenticate_api_key - the CHECK does
//                                    NOT strip: content != api_key
//   set/right/api_key.rb:54-61       api_key_validation_error - :not_found
//                                    when the card is not real,
//                                    :incorrect when the content differs
//   card-1.110.0 lib/card/auth/current.rb:92-98  find_account_by - the
//                                    +*account junction whose +*<field>
//                                    child carries the value
//
// THE STRIP/CHECK SPLIT IS THE CELL A PORT GETS WRONG. The LOOKUP strips
// the key (find_account_by_api_key: `find_account_by :api_key,
// api_key.strip`), so a padded key FINDS the account; the CHECK does not
// strip (authenticate_api_key: `content != api_key`), so the same padded
// key FAILS the check and the answer is the refusal. A port that strips
// both would sign the request in.
//
// The data shape is the port's own account shape (src/card/auth/signin.ts's
// findAccountByEmail walks the same SQL): the +*account JUNCTION row is the
// card whose right_id is the *account codename card and whose left_id is
// the user card; the +*api_key CHILD is the row whose left_id is that
// junction and whose right_id is the *api_key codename card. The junction's
// left_id is the SIGN-IN ARGUMENT the pinned code signs in with
// (signin_with_api_key: `signin account.left_id`).

import { rubyStrip } from "./signin.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";

/** The pinned refusal message (lib/card/auth/api_key.rb:21): the api_key
 *  arm raises Card::Error::PermissionDenied with exactly this text. */
export const API_KEY_AUTHENTICATION_FAILED = "API key authentication failed";

/** What the api_key arm resolved to. */
export type ApiKeySignin =
  /** The key was presented and it named an account whose api_key card
   *  carries it: the sign-in argument is the account's left_id (the user
   *  card). */
  | { readonly kind: "actor"; readonly actorId: number }
  /** The key was presented and it named nothing, or the card's content
   *  differs from the key as presented: the pinned refusal. */
  | { readonly kind: "denied"; readonly reason: string };

/** The two codename ids the lookup needs: the *account card (the junction's
 *  right side) and the *api_key card (the field child's right side). */
export interface ApiKeyCodenameIds {
  account: number;
  apiKey: number;
}

/**
 * The two codename ids, or undefined when the deck carries no api_key
 * field (a deck without card-mod-api_key has no api_key arm) or no account
 * system (no *account card, so there is no junction to walk).
 *
 * The two are resolved separately on purpose: the account system's own
 * resolver (signin.ts's resolveAccountCodenameIds) answers null when ANY of
 * its five field codenames is missing, and that must not decide whether
 * the api_key arm is armed.
 */
export async function resolveApiKeyCodenameIds(
  driver: SQLDatabaseDriver,
): Promise<ApiKeyCodenameIds | undefined> {
  const read = async (codename: string): Promise<number | undefined> => {
    const result = await driver.query<{ id: number }>(
      "SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1",
      [codename],
    );
    return result.rows[0]?.id;
  };
  const account = await read("account");
  if (account === undefined) return undefined;
  const apiKey = await read("api_key");
  if (apiKey === undefined) return undefined;
  return { account, apiKey };
}

/** The junction and the field child the lookup found. */
interface ApiKeyAccountRow {
  /** The junction row's id (the +*account instance). */
  id: number;
  /** The junction's left_id: the user card the pinned code signs in as
   *  (`signin account.left_id`). */
  left_id: number;
  /** The +*api_key child's stored content: the key the deck holds. */
  db_content: string | null;
}

/**
 * The account whose +*api_key child carries the STRIPPED key, or undefined.
 *
 * The SQL is the port's own account shape (signin.ts's findAccountByEmail):
 * the junction is the card whose right_id is the *account card, and the
 * child is the card whose left_id is that junction and whose right_id is
 * the *api_key card.
 */
export async function findAccountByApiKey(
  driver: SQLDatabaseDriver,
  ids: ApiKeyCodenameIds,
  rawKey: string,
): Promise<ApiKeyAccountRow | undefined> {
  const result = await driver.query<ApiKeyAccountRow>(
    `SELECT a.id, a.left_id, e.db_content FROM cards a
     JOIN cards e ON e.left_id = a.id AND e.right_id = ? AND e.trash = 0
     WHERE a.right_id = ? AND a.trash = 0 AND e.db_content = ?
     ORDER BY a.id LIMIT 1`,
    [ids.apiKey, ids.account, rubyStrip(rawKey)],
  );
  return result.rows[0];
}

/**
 * The api_key arm of the sign-in (lib/card/auth/api_key.rb:18-25), in the
 * port's own order:
 *
 *     account = find_account_by_api_key api_key
 *     unless account&.authenticate_api_key api_key
 *       raise Card::Error::PermissionDenied, "API key authentication failed"
 *     end
 *     signin account.left_id
 *
 * The lookup strips the key; the check compares the card's content with
 * the key AS PRESENTED. So a padded key finds the account and then fails
 * the check, which is the refusal and not a sign-in.
 */
export async function signinFromApiKey(
  driver: SQLDatabaseDriver,
  rawKey: string,
): Promise<ApiKeySignin> {
  const ids = await resolveApiKeyCodenameIds(driver);
  // No api_key field on this deck, or no account system: the arm is not
  // armed, and the caller's session arm answers.
  if (ids === undefined) return { kind: "denied", reason: API_KEY_AUTHENTICATION_FAILED };
  const account = await findAccountByApiKey(driver, ids, rawKey);
  if (account === undefined) {
    return { kind: "denied", reason: API_KEY_AUTHENTICATION_FAILED };
  }
  // authenticate_api_key: `return true unless (error = api_key_validation_
  // error api_key)` and the error is :api_key_incorrect when the content
  // differs. The content is compared with the key AS PRESENTED, because
  // only the LOOKUP strips.
  if ((account.db_content ?? "") !== rawKey) {
    return { kind: "denied", reason: API_KEY_AUTHENTICATION_FAILED };
  }
  return { kind: "actor", actorId: account.left_id };
}
