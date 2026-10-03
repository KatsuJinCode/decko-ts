// Gherkin port — setup.feature (decko-commons/decko
// decko/features/setup.feature, Scenario: Shark visits site for first time;
// @simulate-setup — the tag forces the setup window open, which the port's
// census computes from the deck itself).
//
// The upstream scenario is a browser flow; this port executes the same
// business behavior against the setup engine surface (first-run-setup.ts's
// createOwnerAccount — which carries the submitted card name
// (user.rb:14) and the setup_first_user role writes (user.rb:59-64)) plus
// signin.ts.
//
// NAMED DEVIATIONS (test setup, not engine behavior):
//  1. The upstream password literal "newb_pass" does not satisfy the
//     mod-default policy the engine ports verbatim (see
//     reset-password.feature.test.ts's header note); the submitted password
//     keeps the shape and adds the missing character classes.
//  2. The "The Newber+*roles should see Administrator" assertion reads the
//     ported WRITE (setup_first_user's role-membership subcards), not the
//     right/roles VIEW render: the roles view is the render layer's surface
//     and is not ported. Ruby's own assertion is the same fact rendered
//     ("Administrator" appears because the Administrators role's members
//     list holds the user).
//  3. The env gates the setup route requires (DECKO_FIRST_RUN=1 +
//     DECKO_WRITE_PATH=1) are set for this suite, mirroring
//     tests/card/auth/first-run-setup.test.ts's env handling; the upstream
//     @simulate-setup tag plays the role the env gates play here.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupWindowState } from "../../../src/card/auth/first-run-setup.js";
import {
  closeAccountFlowWorld,
  freshAccountFlowWorld,
  givenAccountSystemDeck,
  whenRunSetup,
  whenSignIn,
  type AccountFlowWorld,
} from "./gherkin-account-steps.js";

const ENV_KEYS = ["DECKO_FIRST_RUN", "DECKO_WRITE_PATH"] as const;

describe("Gherkin port: setup.feature / Shark visits site for first time", () => {
  let flow: AccountFlowWorld;
  const priorEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      priorEnv.set(key, process.env[key]);
      process.env[key] = "1";
    }
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const prior = priorEnv.get(key);
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
    if (flow) await closeAccountFlowWorld(flow);
  });

  it("setup window open -> Set up -> owner created with the submitted name and the administrator role -> sign in", async () => {
    flow = await freshAccountFlowWorld();
    // The FIRST-RUN deck: the account system present, zero non-bot accounts
    // (no Joe User — the census reads zero, Auth.needs_setup? true).
    await givenAccountSystemDeck(flow);

    // upstream: When I go to the homepage / Then I should see "Your deck is
    // ready" — the setup window (needs_setup?) is what renders that page
    // (user.rb:12 voo.title "Your deck is ready to go!").
    const window = await setupWindowState({ driver: flow.ctx.driver });
    expect(window.open).toBe(true);
    expect(window.reason).toBe("needs_setup");

    // upstream: When I fill in "card_name" with "The Newber" / And I enter
    // "newb@decko.org" into "*email" / And I enter "newb_pass" into
    // "*password" / And I press "Set up" — the setup create carries the
    // submitted name and grants the first user the basket roles
    // (user.rb:59-64).
    const outcome = await whenRunSetup(flow, {
      name: "The Newber",
      email: "newb@decko.org",
      password: "Newb_pass1!",
    });
    // upstream: Then I should see "The Newber" — the owner card exists
    // under the SUBMITTED name.
    expect(outcome.owner.name).toBe("The Newber");
    const owner = await flow.world.storage.fetcher.fetchByName("The Newber");
    expect(owner).toBeDefined();

    // upstream: When I go to card "The Newber+*roles" / Then I should see
    // "Administrator" — the ported setup_first_user write: the
    // Administrators role's members list holds the new owner (see header
    // note 2 for the roles-view boundary).
    const members = await flow.world.storage.fetcher.fetchByName("Administrators+members");
    expect(members?.dbContent).toContain("The Newber");

    // upstream: When I follow "Sign out" / And I follow "Sign in" / And I
    // enter "newb@decko.org" into "*email" / And I enter "newb_pass" into
    // "*password" / And I press "Sign in" / Then I should see "The Newber".
    // (The setup flow's auto-session — signin_after_setup, user.rb:66-68 —
    // is the host's session binding; the flow's own assertion path is the
    // sign-in.)
    const fresh = await whenSignIn(flow, "newb@decko.org", "Newb_pass1!");
    if (!fresh.ok) throw new Error(`sign-in failed: ${JSON.stringify(fresh)}`);
    expect(fresh.actor.name).toBe("The Newber");
  });
});
