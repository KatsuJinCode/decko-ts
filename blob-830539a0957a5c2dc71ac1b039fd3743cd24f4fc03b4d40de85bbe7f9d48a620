// The reset_password feature (Scenario: Resetting password).
//
// The upstream scenario is a browser flow (modal forms, "I open the email",
// "I click the first link"); this suite executes the same business behaviour
// against the auth engine surfaces (account-verify-reset-flows.ts +
// signin.ts) over the gherkin storage world. Each step's upstream wording is
// preserved in the comments.
//
// NAMED DEVIATION (test setup, not engine behaviour): the upstream password
// literals "joe_pass_reset" / "wanna_pass" / "newb_pass" do not satisfy the
// default password policy this engine implements verbatim
// (account_password_requirements %i[lower upper special_char number] —
// account-verify-reset-flows.ts:224-236). The feature decks here keep the
// upstream password SHAPES ("joe_pass" fixtures are seeded directly, the
// submitted new passwords add the missing character classes) because the
// policy configuration surface itself is not yet portable. The reset flow's
// business assertions — old password dead, new password signs in — are
// unchanged.

import { afterEach, describe, expect, it } from "vitest";
import {
  closeAccountFlowWorld,
  firstMailLink,
  freshAccountFlowWorld,
  givenAccountSystemDeck,
  thenMailWithSubject,
  whenApplyNewPassword,
  whenFollowMailLink,
  whenRequestPasswordReset,
  whenSignIn,
  whenSignOut,
} from "./gherkin-account-steps.js";
import type { AccountFlowWorld } from "./gherkin-account-steps.js";
import { isPbkdf2Hash } from "../../../src/card/auth/password-hash.js";

describe("reset_password.feature / Resetting password", () => {
  let flow: AccountFlowWorld;

  afterEach(async () => {
    if (flow) await closeAccountFlowWorld(flow);
  });

  it("reset link -> new password -> old password dead -> new password signs in", async () => {
    flow = await freshAccountFlowWorld();
    // upstream Background: "There is a user named Joe User in the test data
    // with the email joe@user.com" (password joe_pass).
    await givenAccountSystemDeck(flow, { joePassword: "joe_pass" });

    // upstream: When I go to the homepage / And I follow "Sign in" /
    // And I follow "Reset password" — the request form's submit:
    // upstream: And I enter "joe@user.com" into "*email" in modal
    // upstream: And I press "Reset password"
    const request = await whenRequestPasswordReset(flow, "joe@user.com");
    if (!request.ok) throw new Error(`reset request failed: ${request.reason}`);

    // upstream: Then "joe@user.com" should receive an email with subject
    // "reset password for My Deck"
    thenMailWithSubject(flow, "reset password for My Deck");
    // ... and the mail carries the /update/ link the next step clicks.
    expect(firstMailLink(flow)).toBeDefined();

    // upstream: When I open the email / And I click the first link in the
    // email / Then I should see "Joe User" — the confirm arm issues the
    // session for the holder.
    const confirm = await whenFollowMailLink(flow, "reset_password");
    if (!confirm.ok) throw new Error(`confirm failed: ${JSON.stringify(confirm)}`);
    expect(confirm.holder.name).toBe("Joe User");

    // upstream: When I enter "joe_pass_reset" into "*password" in modal /
    // And I press "Save and Close" / Then I should see "encrypted" — the
    // +*password write stores a digest (the "encrypted" raw view), and the
    // OLD password stops verifying.
    const write = await whenApplyNewPassword(flow, confirm.holder, "Joe_pass_reset1!");
    if (!write.ok) throw new Error(`password write failed: ${write.reason}`);
    expect(write.ok).toBe(true);
    // Newly set passwords are stored as a PBKDF2 hash
    // (docs/SECURITY.md, "Passwords").
    expect(isPbkdf2Hash(write.digest ?? "")).toBe(true);

    // upstream: When I go to the homepage / And I follow "Sign out" /
    // Then I should not see "Joe User"
    expect(await whenSignOut(flow, confirm.session.token)).toBe(true);

    // upstream: When I follow "Sign in" / And I enter "joe@user.com" into
    // "*email" / And I enter "joe_pass_reset" into "*password" / And I press
    // "Sign in" / Then I should see "Joe User"
    const stale = await whenSignIn(flow, "joe@user.com", "joe_pass");
    expect(stale.ok).toBe(false); // the old password is dead
    const fresh = await whenSignIn(flow, "joe@user.com", "Joe_pass_reset1!");
    if (!fresh.ok) throw new Error(`sign-in with the reset password failed: ${JSON.stringify(fresh)}`);
    expect(fresh.actor.name).toBe("Joe User");
  });
});
