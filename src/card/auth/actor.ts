// Actor resolution for the auth layer — the "always an actor" rule and the
// system-actor constructors.
//
// Ruby truth (card-1.110.0/lib/card/auth/):
//   * There is ALWAYS a current actor. With nobody signed in it is the
//     Anonymous card: `Auth.current_id` defaults to `Card::AnonymousID`
//     (current.rb:7-9, `@current_id ||= Card::AnonymousID`). Anonymous is a
//     real card, not a null.
//   * System writes run as DeckoBot: `Auth.as_bot` proxies to
//     `as(Card::DeckoBotID)` (proxy.rb:26-29) — the administrator bot whose
//     permissions cannot be disabled (permissions.rb:9).
//   * The numeric IDs are NOT hardcoded constants in the gems. They are
//     generated at boot from card codenames:
//     `Card.const_get_or_set("#{codename.to_s.camelize}ID") { id }`
//     (codename.rb:108) — the card with codename "anonymous" defines
//     Card::AnonymousID, codename "decko_bot" defines Card::DeckoBotID
//     (camelize: decko_bot → "DeckoBot", so the constant reads DeckoBotID,
//     never DeckobotID — the stored codename carries the underscore). The
//     codenames and names are deck
//     data, not gem constants: mod/core/data/real.yml:17-19 seeds the bot
//     as name "Decko Bot", codename "decko_bot".
//
// Engine-context mapping: the TS engine has no process-global Auth singleton
// — the actions layer takes an explicit actor parameter — so `as`/`as_bot`
// (proxy.rb:5-24) collapse into "pass a different actor object". What must
// be ported is the RESOLUTION of the system actors, which reads the deck's
// own cards table by codename (the port of the codename.rb:108 mechanism,
// minus the boot-time global). The Proxy module's save/restore machinery
// (proxy.rb:63-76 temporarily) has no counterpart: nothing global is
// mutated.

import type { SQLDatabaseDriver } from "../../server/driver.js";

/** The actor shape the actions layer consumes: the acting CARD's id and
 *  name (Ruby: Auth.current_card / Auth.as_card, current.rb:20-26,
 *  proxy.rb:38-43). */
export interface Actor {
  id: number;
  name: string;
}

/** Codename of the card all signed-out activity is credited to. */
export const ANONYMOUS_CODENAME = "anonymous";

/** Codename of the administrator bot used for system writes (as_bot).
 *  Ruby's stored codename (mod/core/data/real.yml:19; the DeckoBotID
 *  constant camelize-derives from it, codename.rb:108). */
export const DECKOBOT_CODENAME = "decko_bot";

/** Error thrown when the deck's cards table has no row for a system actor's
 *  codename — a deck without an Anonymous/DeckoBot card is not bootstrapped
 *  (every deck starts with both: setup.rb:44, "every deck starts with two
 *  accounts: DeckoBot and Anonymous"). */
export class ActorNotFoundError extends Error {
  readonly codename: string;
  constructor(codename: string) {
    super(
      `auth: no card with codename "${codename}" — ` +
        `every deck starts with Anonymous and DeckoBot cards (card/auth/setup.rb:44)`,
    );
    this.codename = codename;
    this.name = "ActorNotFoundError";
  }
}

/**
 * Resolve a system actor from the deck's cards table by codename — the port
 * of the boot-time `Card.const_get_or_set("...ID") { id }` mechanism
 * (codename.rb:108), resolved at call time because the engine holds no
 * boot-time constant table. Name comes from the row itself (deck data).
 * Codename is UNIQUE in the cards table (cards_codename_index,
 * db/schema.sqlite.sql:70, mirroring the production unique key), so the
 * ORDER BY id LIMIT 1 is defensive normalization only.
 */
export async function actorByCodename(
  driver: SQLDatabaseDriver,
  codename: string,
): Promise<Actor> {
  const result = await driver.query<{ id: number; name: string | null }>(
    "SELECT id, name FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1",
    [codename],
  );
  const row = result.rows[0];
  if (row === undefined || row.name === null) {
    throw new ActorNotFoundError(codename);
  }
  return { id: row.id, name: row.name };
}

/** The Anonymous actor — what signed-out activity is credited to
 *  (current.rb:7-9 `@current_id ||= Card::AnonymousID`). */
export function actorAnonymous(driver: SQLDatabaseDriver): Promise<Actor> {
  return actorByCodename(driver, ANONYMOUS_CODENAME);
}

/** The DeckoBot actor — the administrator bot system writes run as
 *  (proxy.rb:26-29, `as_bot { ... }` = `as(Card::DeckoBotID)`). */
export function actorBot(driver: SQLDatabaseDriver): Promise<Actor> {
  return actorByCodename(driver, DECKOBOT_CODENAME);
}
