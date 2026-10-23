// event-report-chain.test.ts - the Card::Error REPORT chain: a server-class
// failure reaches the card's notable_exception_raised callback, and the
// callback writes the reported error to the logger.
//
// WHY THIS FILE EXISTS. card-1.110.0 lib/card/error.rb:131-136
// (Card::Error.report) makes the exception the CURRENT error and reports
// it; Card::Error::ServerError#report (:61-64) logs the exception and then
// calls the card back, and the card's own callback
// (mod/core/set/all/result.rb:1-4) writes the current error's message and
// backtrace at debug. The port's report site is the save entry
// (card-action-engine.ts reportServerError), because that is where the card
// and the exception are both known — Ruby's controller reports the card it
// was saving (decko-0.20.0 lib/card_controller/errors.rb:22).
//
// THE CLASS ARM. Ruby's card_error_class (error.rb:164-175) maps every
// exception but a UserError to Card::Error::ServerError, and only
// ServerError#report calls the card back. The port's CardActionError
// carries the class in its code: every code but "server-error" is a
// UserError arm, so a user-class failure is NOT reported.

import { describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedStandardDeck,
  seedCard,
  JOE,
  fakeClock,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import coreMod, {
  coreModEventPredicates,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";

/** The core mod's manifest loaded standalone -> its event registry (the
 *  same registration the SetLoader phase performs engine-wide). */
function coreRegistry() {
  const loader = new ModLoader([{ manifest: coreMod }]);
  loader.resolveOrder({ gemMods: ["core"] });
  loader.load();
  return loader.eventRegistry();
}

/** A save engine bound to the core registry, with a logger seam that keeps
 *  every line the event bodies write. */
function reportEngine(storage: ActionsTestStorage, lines: string[]): CardActionEngine {
  const runtime: ModEventRuntime = {
    registry: coreRegistry(),
    predicates: coreModEventPredicates,
  };
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    now: fakeClock(),
    modEvents: runtime,
    eventLogger: {
      debug: (line: string) => lines.push(line),
      info: () => undefined,
    },
  });
}

describe("the error report chain reaches the card's notable_exception_raised callback", () => {
  it("a server-class failure writes the reported error at debug", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    // The *password field card. A create whose LEFT card does not exist is
    // the server-class failure: card-mod-account's password save reads its
    // account for the salt, and Ruby raises there
    // (card-action-engine.ts assertAccountFieldLeftExists).
    await seedCard(storage, { id: 400, name: "*password", codename: "password" });
    const lines: string[] = [];
    const engine = reportEngine(storage, lines);

    await expect(engine.createCard({ name: "Joe User+*password" })).rejects.toThrow(
      /its left card does not exist/,
    );

    // the callback ran, and wrote the error's message at debug. The
    // backtrace follows it, joined by a newline and two spaces (Ruby's
    // `error.backtrace * "\n  "`).
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("cannot create Joe User+*password");
    expect(lines[0]).toContain("\n");
    storage.close();
  });

  it("a USER-class failure is not reported: only a ServerError calls the card back", async () => {
    const storage = await createActionsTestStorage();
    await seedStandardDeck(storage);
    const lines: string[] = [];
    const engine = reportEngine(storage, lines);

    // no such card: Ruby's Card::Error::NotFound, a UserError arm
    // (error.rb:82-89), whose report is StandardError#report — the logger
    // line, and NOT the card's callback.
    await expect(engine.deleteCard({ cardId: 999999 })).rejects.toThrow();

    expect(lines).toEqual([]);
    storage.close();
  });
});
