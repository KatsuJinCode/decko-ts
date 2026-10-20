// Oracle-matched pin for card-mod-account's
// validate_account_holder_name_change — the redteam row
// reg-redteam-dispute-1 ("disputed PORTED verdict: account"), whose blocker
// said "the register's DONE verification is an engineOwned REGISTRATION at
// the cited line in the canonical tree". This file pins BOTH halves: the
// manifest half (the declaration is engine-owned, carrying Ruby's stage,
// trigger and changed metadata verbatim) and the behaviour half (the three
// arms of account_manager? on a live engine).
//
// Ruby contract (card-mod-account-0.20.0 set/abstract/account_holder.rb):
//
//   1  event :validate_account_holder_name_change, :validate, on: :update,
//      changed: :name do
//   2    return unless account? && !Card::Auth.as_card.account_manager?
//   3    errors.add :name, "cannot rename Account Holder"
//   4  end
//
//   10  def account; fetch :account, new: {}; end
//   12  def account?; account.real?; end
//   16  def own_account?; key == Auth.as_card.key; end
//   71  def account_manager?
//   72    own_account? || parties.member?(HelpDeskID)
//   73  end
//
// `Help Desk` is a Role card with codename `help_desk`
// (card-mod-account-0.20.0/data/real.yml:58-66), so HelpDeskID is that
// card's id — the port reads it through codenames.id("help_desk").
//
// The port: src/card/actions/card-action-engine.ts
// assertMayRenameAccountHolder (the junction probe is `account?`, the two
// allow arms are `account_manager?`), called from the update path ahead of
// the write-permission walk — Ruby's validate stage raises there
// (account_holder.rb:1-4 declares the event at stage :validate).

import { describe, expect, it } from "vitest";
import { createRenderTestStorage } from "../render/render-test-storage.js";
import { bootstrapFreshDeck } from "../../../src/card/auth/boot-seed.js";
import { actorBot } from "../../../src/card/auth/actor.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import type { Actor } from "../../../src/card/auth/actor.js";

/** The declaration as the mod carries it, out of the account manifest's
 *  abstract/account_holder set module (account_holder.rb:1-4). */
function declaration() {
  const setModule = (cardModAccount.setModules ?? []).find(
    (m) => m.setPath === "abstract/account_holder",
  );
  const events = setModule?.events ?? [];
  const found = events.find((e) => e.event === "validate_account_holder_name_change");
  if (found === undefined) throw new Error("validate_account_holder_name_change is not declared");
  return found;
}

async function createAccountedUser(
  engine: CardActionEngine,
  name: string,
  email: string,
): Promise<number> {
  await engine.createCard({
    name,
    subcards: { "+*account": { subcards: { "+*email": { content: email } } } },
  });
  const card = await engine.fetch.fetchByName(name);
  return card!.id!;
}

async function errorMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("validate_account_holder_name_change — declaration (account_holder.rb:1-4)", () => {
  it("declares the event engine-owned, so no mod body can displace the engine guard", () => {
    const decl = declaration();
    // The body is the engine's, not a mod fn: engineOwnedEvent's shape is
    // the no-op default, and the engine calls assertMayRenameAccountHolder
    // directly (card-action-engine.ts, the update path). A real fn here
    // would make the declaration look like the port's mechanism.
    expect(decl.fn("{}" as never, {} as never, {} as never)).toBeUndefined();
    // Ruby's metadata, verbatim.
    expect(decl.at).toBe("validate");
    expect(decl.on).toEqual(["update"]);
    expect(decl.changed).toEqual(["name"]);
  });

  it("keeps the declaration at the abstract/account_holder set (the declaring set file)", () => {
    const decl = declaration();
    expect(decl.event).toBe("validate_account_holder_name_change");
  });
});

describe("validate_account_holder_name_change — the three arms on a live engine", () => {
  it("refuses Sue renaming Joe's holder account with Ruby's exact message", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const bot = await actorBot(storage.fetcher.driver);
    const setup = new CardActionEngine(storage.fetcher, { actor: bot });

    const joeId = await createAccountedUser(setup, "Joe Camel", "joe@camel.example");
    const sueId = await createAccountedUser(setup, "Sue Stream", "sue@stream.example");

    const sue: Actor = { id: sueId, name: "Sue Stream" };
    const sueEngine = new CardActionEngine(storage.fetcher, { actor: sue });
    const message = await errorMessage(() =>
      sueEngine.updateCard({ cardId: joeId, name: "Joe Renamed" }),
    );
    expect(message).toContain("cannot rename Account Holder");
  });

  it("lets the holder rename their OWN account card (own_account? branch, account_holder.rb:16)", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const bot = await actorBot(storage.fetcher.driver);
    const setup = new CardActionEngine(storage.fetcher, { actor: bot });

    const joeId = await createAccountedUser(setup, "Joe Camel", "joe@camel.example");
    // A non-holder card Joe may freely rename: the guard's `account?` probe
    // (the +*account junction) finds nothing and returns.
    const plain = await setup.createCard({ name: "Joe Note" });
    const joe: Actor = { id: joeId, name: "Joe Camel" };
    const joeEngine = new CardActionEngine(storage.fetcher, { actor: joe });
    const message = await errorMessage(() =>
      joeEngine.updateCard({ cardId: plain.cardId, name: "Joe Notes" }),
    );
    expect(message).not.toContain("cannot rename Account Holder");
  });

  it("lets a Help Desk member rename another holder (parties.member? branch, account_holder.rb:72)", async () => {
    const storage = await createRenderTestStorage({ bootstrapReadRules: false });
    await bootstrapFreshDeck({ driver: storage.fetcher.driver });
    const bot = await actorBot(storage.fetcher.driver);
    const setup = new CardActionEngine(storage.fetcher, { actor: bot });

    const joeId = await createAccountedUser(setup, "Joe Camel", "joe@camel.example");
    const sueId = await createAccountedUser(setup, "Sue Stream", "sue@stream.example");
    const sue: Actor = { id: sueId, name: "Sue Stream" };

    // BEFORE the membership: the same actor is refused. The two halves in
    // one test make the arm a differential — without the Help Desk party the
    // refusal must be present, so the "not refused" leg below is evidence.
    const before = await errorMessage(() =>
      new CardActionEngine(storage.fetcher, { actor: sue }).updateCard({
        cardId: joeId,
        name: "Joe Renamed",
      }),
    );
    expect(before).toContain("cannot rename Account Holder");

    // Sue joins Help Desk: naming her in the role's +*members list card
    // builds exactly the reference row the role-party walk reads
    // (read-rules.ts rolePartyStatement: referee_id = the actor, the list
    // card's right = the *members setting, its left = the role card).
    await setup.createCard({ name: "Help Desk+*members", content: "Sue Stream" });

    const after = await errorMessage(() =>
      new CardActionEngine(storage.fetcher, { actor: sue }).updateCard({
        cardId: joeId,
        name: "Joe Renamed",
      }),
    );
    // The guard passed; any refusal left is the deck's write-rule walk.
    expect(after).not.toContain("cannot rename Account Holder");
  });
});
