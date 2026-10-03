// Gherkin port — update_includers.feature (decko-commons/decko
// decko/features/update_includers.feature, "Updates for Children of watched
// cards", 6 active scenarios).
//
// The upstream scenarios are @javascript @delayed-jobs browser flows; this
// port executes each scenario's business behavior against the notify
// machinery: the save path's default follow-notify hook (the engine
// installs it on every non-anonymous save), the rule-algebra follower walk
// (notify/follower-resolver.ts — direct AND indirect), and the deck-backed
// follower_notification_email template. Mails are asserted through a
// CaptureTransport wired as the engine's notifyTransport.
//
// NAMED SETUP SHAPE: upstream Book cards carry their {{+author}} /
// {{+illustrator}} nests through the Book+*type+*structure template; this
// deck has no structure machinery, so Ulysses carries the template body as
// its own content — the inclusion references (ref_type "I", the *nests
// check's input) are written from the same nest syntax either way.

import { describe, expect, it } from "vitest";
import {
  closeNotifyWorld,
  freshNotifyWorld,
  givenSignedInAs,
  givenWatching,
  JOE_ADMIN,
  JOE_CAMEL,
  JOE_USER,
  type NotifyWorld,
} from "./gherkin-notify-steps.js";

/** '"<user>" should be notified that "<subject>"'
 *  (email_steps.rb:196-206): one mail to the user's address whose subject
 *  contains the fragment. */
function thenNotified(nw: NotifyWorld, user: { name: string; email: string }, subjectFragment: string): void {
  const hit = nw.transport
    .captured()
    .find((m) => m.to === user.email && m.subject.includes(subjectFragment));
  if (hit === undefined) {
    throw new Error(
      `no mail to ${user.email} with subject containing ${JSON.stringify(subjectFragment)}; ` +
        `captured: ${JSON.stringify(nw.transport.captured().map((m) => ({ to: m.to, subject: m.subject })))}`,
    );
  }
}

/** "Then No notification should be sent" (email_steps.rb:208-211): the
 *  transport's total is unchanged since the baseline. */
function expectNoNewMail(nw: NotifyWorld, baseline: number): void {
  if (nw.transport.count() !== baseline) {
    throw new Error(
      `expected no notification, got ${nw.transport.count() - baseline} new mail(s): ` +
        JSON.stringify(nw.transport.captured().slice(baseline).map((m) => ({ to: m.to, subject: m.subject }))),
    );
  }
}

/** The Background (update_includers.feature:9-13): Joe User signed in;
 *  Book card "Ulysses" (with the template body's nests — see the header
 *  note); Joe Camel watching "Ulysses+*self"; Joe Admin watching
 *  "Book+*type". Returns the mail count baseline (the Background's own
 *  writes notify nobody — no followers exist before the watch steps). */
async function givenBackground(): Promise<{ nw: NotifyWorld; baseline: number }> {
  const nw = await freshNotifyWorld(JOE_USER);
  // upstream: Given I am signed in as Joe User (freshNotifyWorld's actor)
  // upstream: And I create Book card "Ulysses"
  await nw.engine.createCard({
    name: "Ulysses",
    typeCode: "book",
    content: "{{+author}} {{+illustrator}}",
  });
  // upstream: And Joe Camel is watching "Ulysses+*self"
  // (edit_steps.rb:5-11 — the <set>+<user>+*follow preference "[[*always]]")
  await givenWatching(nw.world, "Joe Camel", "Ulysses+*self");
  // upstream: And Joe Admin is watching "Book+*type"
  await givenWatching(nw.world, "Joe Admin", "Book+*type");
  return { nw, baseline: nw.transport.count() };
}

describe("Gherkin port: update_includers.feature / Updates for Children of watched cards", () => {
  let nw: NotifyWorld;

  // ---------------------------------------------------------------------
  // Scenario: Watcher should be notified of updates to included plus card
  // ---------------------------------------------------------------------

  it("GREEN-ported / included plus card create + edit notify the watchers (indirect walk)", async () => {
    const bg = await givenBackground();
    nw = bg.nw;

    // upstream: When I create card "Ulysses+Author" with content
    // "James Joyce"
    await nw.engine.createCard({ name: "Ulysses+Author", content: "James Joyce" });

    // upstream: Then Joe Admin should be notified that
    // 'Joe User created "Ulysses+Author"' — Joe Admin follows Book+*type;
    // the notification arrives through the INDIRECT walk: the act card
    // Ulysses+Author's left ancestor Ulysses follows fields (*all+*follow
    // fields = *nests, the stock default) and includes +author, so both
    // of ULYSSES's direct watchers (Joe Admin via Book+*type, Joe Camel
    // via Ulysses+*self) are stashed (follower_ids.rb:74-83 +
    // follower_stash.rb:39-52).
    thenNotified(nw, { name: "Joe Admin", email: "joe@admin.com" }, `Joe User created "Ulysses+Author"`);
    // upstream: And Joe Camel should be notified that
    // 'Joe User created "Ulysses+Author"'
    thenNotified(nw, { name: "Joe Camel", email: "joe@camel.com" }, `Joe User created "Ulysses+Author"`);

    // upstream: When Joe Admin edits "Ulysses+Author" setting content to
    // "Jim"
    givenSignedInAs(nw, JOE_ADMIN);
    const author = await nw.world.storage.fetcher.fetchByName("Ulysses+Author");
    await nw.engine.updateCard({ cardId: author!.id!, content: "Jim" });

    // upstream: Then Joe Camel should be notified that
    // 'Joe Admin updated "Ulysses+Author"' — Joe Admin is himself a
    // watcher (Book+*type) but never gets mail for his own act
    // (notify.rb:51 `next if follower == act.actor`).
    thenNotified(nw, { name: "Joe Camel", email: "joe@camel.com" }, `Joe Admin updated "Ulysses+Author"`);
    expect(
      nw.transport.captured().some((m) => m.to === "joe@admin.com" && m.subject.includes(`Joe Admin updated`)),
    ).toBe(false); // the actor exclusion
  });

  // ---------------------------------------------------------------------
  // Scenario: Should not notify of included but not plussed card
  // ---------------------------------------------------------------------

  it("GREEN-ported / a simple card nobody watches notifies nobody", async () => {
    const bg = await givenBackground();
    nw = bg.nw;

    // upstream: When I create card "illustrator" with content "Picasso" /
    // Then No notification should be sent
    await nw.engine.createCard({ name: "illustrator", content: "Picasso" });
    expectNoNewMail(nw, bg.baseline);
  });

  // ---------------------------------------------------------------------
  // Scenario: Should not notify of plussed but not included card
  // ---------------------------------------------------------------------

  it("GREEN-ported / a plussed-but-not-included card notifies nobody (the *nests discriminator)", async () => {
    const bg = await givenBackground();
    nw = bg.nw;

    // upstream: When I create card "Ulysses+random" with content "boo" /
    // Then No notification should be sent — Ulysses includes +author and
    // +illustrator but NOT +random, so followed_field? fails for the left
    // ancestor and the indirect walk stashes nobody (followed_by.rb:29-31
    // nested_card? -> the ref_type "I" referee set).
    await nw.engine.createCard({ name: "Ulysses+random", content: "boo" });
    expectNoNewMail(nw, bg.baseline);
  });

  // ---------------------------------------------------------------------
  // Scenario: Templated cards should only send one email when added or
  // updated — the multi-action act machinery (one act per submission,
  // subcards.rb:1-16, one FollowerStash per act) is the capability under
  // test
  // ---------------------------------------------------------------------

  it("multi-action act mail dedupe — a templated card created/edited with plusses mails its watcher ONCE per act, naming the MAIN card", async () => {
    const bg = await givenBackground();
    nw = bg.nw;

    // the templated Book card, in the port's declared setup shape (header
    // note): upstream creates "Book card Bros Krmzv with plusses" through
    // the Book+*type+*structure template; the port carries the template
    // body as the card's own content so the *nests walk has the same
    // inclusion references to read.
    // upstream: When I create Book card "Bros Krmzv" with plusses
    // |author|illustrator| |Dostoyevsky|Manet| — ONE form submission = ONE
    // act (card/lib/card/subcards.rb:1-16): the main card's action plus
    // both plusses' actions.
    const bros = await nw.engine.createCard({
      name: "Bros Krmzv",
      typeCode: "book",
      content: "{{+author}} {{+illustrator}}",
      subcards: {
        "+author": { content: "Dostoyevsky" },
        "+illustrator": { content: "Manet" },
      },
    });
    // the plusses exist (the submission created them — the business fact
    // the upstream editor's filled fields assert).
    expect(await nw.world.storage.fetcher.fetchByName("Bros Krmzv+author")).toBeDefined();
    expect(await nw.world.storage.fetcher.fetchByName("Bros Krmzv+illustrator")).toBeDefined();
    // Then Joe Admin should be notified that 'Joe User created
    // "Bros Krmzv"' (ONCE) — Ruby's act is ONE act with several actions
    // and FollowerStash dedupes the act's followers across all its
    // actions (follower_stash.rb:10-28 + notify.rb:38-46/49-55), so Joe
    // Admin gets exactly one mail, about the ACT (act.card = Bros Krmzv —
    // account.rb:18; main_action = the act card's own create, act.rb).
    // The direct walk (Bros Krmzv via Book+*type) and the indirect walks
    // (each plus's field walk through Bros Krmzv's watchers) stash the
    // same follower ONCE.
    thenNotified(nw, { name: "Joe Admin", email: "joe@admin.com" }, `Joe User created "Bros Krmzv"`);
    const afterCreate = nw.transport.count();
    expect(afterCreate - bg.baseline).toBe(1); // one act, one mail

    // upstream: When I edit "Bros Krmzv" with plusses |Author|illustrator|
    // |Rumi|Monet| (the capital A is key-equal — cardname.rb:78-86) /
    // Then Joe Admin should be notified that 'Joe User updated
    // "Bros Krmzv"' (ONCE) — again one act: the plusses' updates ride the
    // main card's submission; the main card's own content is unchanged,
    // so the act's main_action falls to the act's first action (act.rb)
    // and the verb renders "updated" (base_views.rb:44-46).
    await nw.engine.updateCard({
      cardId: bros.cardId,
      subcards: {
        "+Author": { content: "Rumi" },
        "+illustrator": { content: "Monet" },
      },
    });
    thenNotified(nw, { name: "Joe Admin", email: "joe@admin.com" }, `Joe User updated "Bros Krmzv"`);
    expect(nw.transport.count() - afterCreate).toBe(1); // one act, one mail
  });

  // ---------------------------------------------------------------------
  // Scenario: Watching a plus card on multiedit; and watching both plus
  // card and including card on multiedit — the multiedit single-act
  // machinery (one act per submission, subcards.rb:1-16) is the
  // capability under test; the no-change half rides with it
  // ---------------------------------------------------------------------

  it("multiedit single-act — the plusses ride the main card's act: one mail per edit naming the main card; a no-change multiedit mails nothing", async () => {
    const bg = await givenBackground();
    nw = bg.nw;

    // upstream: Joe Admin creates Cardtype "Froot" + PlainText
    // "Froot+*type+*structure" "{{+colors}} {{+flavor}}"; Joe User creates
    // Froot card "Banana" with plusses |colors|flavor| |yellow|sweet| —
    // ONE form submission = ONE act (card/lib/card/subcards.rb:1-16): the
    // main card's action plus the plusses' actions.
    givenSignedInAs(nw, JOE_ADMIN);
    await nw.engine.createCard({ name: "Froot", typeCode: "cardtype" });
    await nw.engine.createCard({
      name: "Froot+*type+*structure",
      typeCode: "phrase",
      content: "{{+colors}} {{+flavor}}",
    });
    givenSignedInAs(nw, JOE_USER);
    const banana = await nw.engine.createCard({
      name: "Banana",
      subcards: {
        "+colors": { content: "yellow" },
        "+flavor": { content: "sweet" },
      },
    });
    // upstream: And Joe Camel is watching "Banana+color+*self" (the
    // SINGULAR upstream uses — color, not colors; the port keeps the
    // scenario's own spelling). ONE watch covers both spellings: the key
    // algebra CONVERGES "Banana+color" and "Banana+colors" — Cardname#key
    // simple_key runs every word through stable_key (cardname.rb:106-117),
    // whose uninflect default is :singularize with stabilize=false
    // (cardname.rb:34-35; variants.rb:56-62 keeps the original word when
    // singularizing is not stable), and name equality is key equality
    // (cardname.rb:78-86). In Ruby too, watching "Banana+color+*self"
    // watches the card this port saves as "Banana+colors".
    await givenWatching(nw.world, "Joe Camel", "Banana+color+*self");
    const afterWatch = nw.transport.count();

    // upstream: When I edit "Banana" with plusses |colors|flavor|
    // |spotted|mushy| — the MULTIEDIT: one act naming the MAIN card. The
    // act card is Banana (its own content doesn't change, so its action
    // is absent and the act's main_action falls to the act's first action
    // — mod/history lib/card/act.rb main_action = action_on(card_id) ||
    // actions.first); last_action_verb = main_action.action_type + "d"
    // (base_views.rb:44-46). Then Joe Camel should be notified that
    // 'Joe User updated "Banana"' — ONCE: FollowerStash dedupes the act's
    // followers across all its actions (notify.rb:66-73 act_followers +
    // follower_stash.rb:10-28 — colors' direct self-watch stashes Joe
    // Camel, flavor's field walk stashes Banana's direct watchers, the
    // same follower lands once).
    await nw.engine.updateCard({
      cardId: banana.cardId,
      subcards: {
        "+colors": { content: "spotted" },
        "+flavor": { content: "mushy" },
      },
    });
    thenNotified(nw, { name: "Joe Camel", email: "joe@camel.com" }, `Joe User updated "Banana"`);
    const afterEdit1 = nw.transport.count();
    expect(afterEdit1 - afterWatch).toBe(1); // one act, one mail

    // upstream: When Joe Camel is watching "Banana+*self" / And I edit
    // "Banana" with plusses |green|mushy| (colors green CHANGES; flavor
    // mushy is unchanged — no action, events.rb:34-37) / Then 'Joe User
    // updated "Banana"' — still ONE mail: the self watch and the field
    // walk stash the same follower once.
    await givenWatching(nw.world, "Joe Camel", "Banana+*self");
    await nw.engine.updateCard({
      cardId: banana.cardId,
      subcards: {
        "+colors": { content: "green" },
        "+flavor": { content: "mushy" },
      },
    });
    thenNotified(nw, { name: "Joe Camel", email: "joe@camel.com" }, `Joe User updated "Banana"`);
    const afterEdit2 = nw.transport.count();
    expect(afterEdit2 - afterEdit1).toBe(1);

    // upstream: Given a clear email queue / And I edit "Banana" with
    // plusses |green|mushy| (the SAME values as the previous edit) /
    // Then No notification should be sent — every save in the act is a
    // no-op (events.rb:34-37): no action, no act, no hook, no mail.
    const baseline = nw.transport.count();
    await nw.engine.updateCard({
      cardId: banana.cardId,
      subcards: {
        "+colors": { content: "green" },
        "+flavor": { content: "mushy" },
      },
    });
    expectNoNewMail(nw, baseline);
  });

  // ---------------------------------------------------------------------
  // Scenario: Watching a plus card & including card on regular edit
  // ---------------------------------------------------------------------

  it("GREEN-ported / plus card watched directly: create notifies via the includer, edit notifies via the self watch", async () => {
    const bg = await givenBackground();
    nw = bg.nw;

    // upstream: When I create card "Ulysses+Author" with content "Joyce"
    // / Then Joe Camel should be notified that
    // 'Joe User created "Ulysses+Author"' — the INDIRECT walk (the
    // includer's watchers; same mechanism as scenario 1).
    await nw.engine.createCard({ name: "Ulysses+Author", content: "Joyce" });
    thenNotified(nw, { name: "Joe Camel", email: "joe@camel.com" }, `Joe User created "Ulysses+Author"`);

    // upstream: When Joe Camel is watching "Ulysses+Author+*self"
    await givenWatching(nw.world, "Joe Camel", "Ulysses+Author+*self");
    const afterWatch = nw.transport.count();

    // upstream: And I edit "Ulysses+Author" setting content to "Jim" /
    // Then Joe Camel should be notified that
    // 'Joe User updated "Ulysses+Author"' — now the DIRECT walk fires
    // too (the self-set watch on the saved card itself).
    const author = await nw.world.storage.fetcher.fetchByName("Ulysses+Author");
    await nw.engine.updateCard({ cardId: author!.id!, content: "Jim" });
    thenNotified(nw, { name: "Joe Camel", email: "joe@camel.com" }, `Joe User updated "Ulysses+Author"`);
    expect(nw.transport.count()).toBeGreaterThan(afterWatch);
  });
});
