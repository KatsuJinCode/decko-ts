// Oracle-matched pin for the account-holder rename guard — the engine owner
// of card-mod-account's validate_account_holder_name_change event.
//
// Ruby contract (card-mod-account set/abstract/account_holder.rb:1-5):
//
//   event :validate_account_holder_name_change, :validate, on: :update,
//         changed: :name do
//     return unless account? && !Card::Auth.as_card.account_manager?
//     errors.add :name, "cannot rename Account Holder"
//   end
//
// with account_manager? = own_account? || parties.member?(HelpDeskID)
// (account_holder.rb:71-73). The port: card-action-engine.ts
// assertMayRenameAccountHolder — the +*account junction probe is `account?`,
// the own-account short-circuit and the Help Desk party check are
// `account_manager?` — invoked on the update path ahead of the
// write-permission walk, exactly where Ruby's validate stage raises.
//
// The three arms, each pinned by which error surfaces:
//   a non-manager renaming another holder carries the guard's message;
//   the holder renaming THEIR OWN carries none (full success — the bot's
//     own Decko Bot rename, whose write also passes alwaysOk);
//   a Help Desk member renaming another holder carries none (the save may
//     still refuse on the deck's write rules — a different error).

import { describe, expect, it } from "vitest";
import { createRenderTestStorage } from "../render/render-test-storage.js";
import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { actorBot } from "../../../src/card/auth/actor.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { CardActionError } from "../../../src/card/actions/types.js";
import type { Actor } from "../../../src/card/auth/actor.js";

async function createAccountedUser(
  engine: CardActionEngine,
  name: string,
  email: string,
): Promise<number> {
  const result = await engine.createCard({
    name,
    subcards: { "+*account": { subcards: { "+*email": { content: email } } } },
  });
  const card = await engine.fetch.fetchByName(name);
  return card!.id!;
}

describe("the account-holder rename guard (validate_account_holder_name_change)", () => {
  it("a non-manager renaming another account holder is refused with Ruby's message", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const bot = await actorBot(storage.fetcher.driver);
    const setup = new CardActionEngine(storage.fetcher, { actor: bot });

    const joeId = await createAccountedUser(setup, "Joe Camel", "joe@camel.example");
    const sueId = await createAccountedUser(setup, "Sue Stream", "sue@stream.example");

    const sue: Actor = { id: sueId, name: "Sue Stream" };
    const sueEngine = new CardActionEngine(storage.fetcher, { actor: sue });
    let message = "";
    try {
      await sueEngine.updateCard({ cardId: joeId, name: "Joe Renamed" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("cannot rename Account Holder");
  });

  it("the holder's own rename carries no guard error and succeeds (own_account? branch)", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const bot = await actorBot(storage.fetcher.driver);

    // Decko Bot IS an account holder (the boot seed ships its +*account,
    // real.yml :203-206) and the bot actor IS its own account: the guard's
    // own-account short-circuit passes, and the bot's alwaysOk write
    // completes the save.
    const botCard = await storage.fetcher.fetchByName("Decko Bot");
    const engine = new CardActionEngine(storage.fetcher, { actor: bot });
    const result = await engine.updateCard({ cardId: botCard!.id!, name: "Deck Bot" });
    expect(result?.name?.s).toBe("Deck Bot");
  });

  it("a Help Desk member's rename carries no guard error (parties.member? HelpDeskID branch)", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const bot = await actorBot(storage.fetcher.driver);
    const setup = new CardActionEngine(storage.fetcher, { actor: bot });

    const joeId = await createAccountedUser(setup, "Joe Camel", "joe@camel.example");
    const sueId = await createAccountedUser(setup, "Sue Stream", "sue@stream.example");

    // Sue joins Help Desk: the role's +*members list card names her, which
    // builds exactly the reference row rolePartyStatement reads
    // (read-rules.ts:285-301 — referee_id = the actor, the list card's
    // right = *members, the list's left = the role card).
    await setup.createCard({ name: "Help Desk+*members", content: "Sue Stream" });

    const sue: Actor = { id: sueId, name: "Sue Stream" };
    const sueEngine = new CardActionEngine(storage.fetcher, { actor: sue });
    let message = "";
    try {
      await sueEngine.updateCard({ cardId: joeId, name: "Joe Renamed" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    // the guard passed; any refusal here is the deck's write-rule walk,
    // not the rename guard
    expect(message).not.toContain("cannot rename Account Holder");
  });
});
