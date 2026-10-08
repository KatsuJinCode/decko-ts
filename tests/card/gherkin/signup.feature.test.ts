// Gherkin port — signup.feature (decko-commons/decko
// decko/features/signup.feature, Scenario: Signing up (without approval)
// and then signing out and back in — the file's only active scenario).
//
// The upstream scenario is a browser flow; this port executes the same
// business behavior against the auth engine surfaces
// (account-verify-reset-flows.ts's verify+activate arm + the signup
// create-side verification send) over the gherkin storage world.
//
// NAMED DEVIATIONS (test setup, not engine behavior):
//  1. The Background's captcha edit ("I edit 'Sign up+*type+*captcha' /
//     I uncheck 'Content'") is a structural no-op here: the port's
//     recaptcha guard is off unless the host configures keys
//     (card-action-engine.ts recaptcha option — recaptcha_keys? false,
//     recaptcha.rb:46-48), which is exactly the state that edit produces.
//  2. The upstream password literal "wanna_pass" does not satisfy the
//     mod-default policy the engine ports verbatim (see
//     reset-password.feature.test.ts's header note); the submitted password
//     keeps the shape and adds the missing character classes.

import { afterEach, describe, expect, it } from "vitest";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  closeAccountFlowWorld,
  freshAccountFlowWorld,
  givenAccountSystemDeck,
  JOE_ADMIN,
  thenMailWithSubject,
  whenFollowMailLink,
  whenSignIn,
  whenSignOut,
  whenSubmitSignup,
  type AccountFlowWorld,
} from "./gherkin-account-steps.js";

describe("Gherkin port: signup.feature / Signing up (without approval)", () => {
  let flow: AccountFlowWorld;

  afterEach(async () => {
    if (flow) await closeAccountFlowWorld(flow);
  });

  it("signup -> verification email -> link activates -> sign out -> sign back in", async () => {
    flow = await freshAccountFlowWorld();
    // upstream Background: Given I am signed in as "Joe Admin" (the captcha
    // edit is the structural no-op named in the header) and:
    // upstream: Given Joe Admin creates Pointer card "User+*type+*create"
    // with content "[[Anyone]]" — the permission rule that lets the
    // anonymous submitter create accounts without approval.
    await givenAccountSystemDeck(flow, { joePassword: "joe_pass" });
    flow.world.engine = new CardActionEngine(flow.world.storage.fetcher, {
      actor: JOE_ADMIN,
      ipAddress: "127.0.0.1",
    });
    // the rule's set card is a Set (a seeded deck carries User+*type as one;
    // the permission walk reads rules only under Set cards)
    if ((await flow.world.storage.fetcher.fetchByName("User+*type")) === undefined) {
      await flow.world.engine.createCard({ name: "User+*type", typeCode: "set" });
    }
    await flow.world.engine.createCard({
      name: "User+*type+*create",
      typeCode: "pointer",
      content: "[[Anyone]]",
    });

    // upstream: When I go to the home page / And I follow "Sign up" /
    // And I fill in "card_name" with "Wanna B" / And I enter
    // "wanna@decko.org" into "*email" / And I enter "wanna_pass" into
    // "*password" / And I press "Submit" — the signup create
    // (Signup-typed holder + unverified +*account) with the
    // request_verification trigger's verification email.
    await whenSubmitSignup(flow, { name: "Wanna B", email: "wanna@decko.org", password: "Wanna_pass1!" });

    // upstream: Then I should see "Signup Success" — the create committed
    // (whenSubmitSignup throws otherwise); the deck now holds the signup.
    const signup = await flow.world.storage.fetcher.fetchByName("Wanna B");
    expect(signup).toBeDefined();
    const status = await flow.world.storage.fetcher.fetchByName("Wanna B+*account+*status");
    expect(status?.dbContent).toBe("unverified");

    // upstream: And "wanna@decko.org" should receive an email with subject
    // "verification link for My Deck"
    thenMailWithSubject(flow, "verification link for My Deck");

    // upstream: When I open the email / And I click the first link in the
    // email / Then I should see "Wanna B" / And "Wanna B" should be signed
    // in — verify_and_activate (events.rb:19-24): status -> "active", the
    // holder signed in.
    const confirm = await whenFollowMailLink(flow, "verify_and_activate");
    if (!confirm.ok) throw new Error(`activation failed: ${JSON.stringify(confirm)}`);
    expect(confirm.holder.name).toBe("Wanna B");
    // whenFollowMailLink serves both confirm flows; the verify_and_activate
    // success member is the one carrying `activated` (the reset arm's
    // success returns the +account edit redirect and no activation).
    if (!("activated" in confirm)) {
      throw new Error(`wrong confirm path, expected verify_and_activate: ${JSON.stringify(confirm)}`);
    }
    expect(confirm.activated).toBe(true);
    const statusAfter = await flow.world.storage.fetcher.fetchByName("Wanna B+*account+*status");
    expect(statusAfter?.dbContent).toBe("active");

    // upstream: When I go to the home page / And I follow "Sign out" /
    // Then I should not see "Wanna B"
    expect(await whenSignOut(flow, confirm.session.token)).toBe(true);

    // upstream: When I follow "Sign in" / And I enter "wanna@decko.org"
    // into "*email" / And I enter "wanna_pass" into "*password" / And I
    // press "Sign in" / Then I should see "Wanna B" / And "Wanna B" should
    // be signed in
    const fresh = await whenSignIn(flow, "wanna@decko.org", "Wanna_pass1!");
    if (!fresh.ok) throw new Error(`sign-in failed: ${JSON.stringify(fresh)}`);
    expect(fresh.actor.name).toBe("Wanna B");
  });
});
