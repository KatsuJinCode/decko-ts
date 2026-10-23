// The first-run setup surface ([Family] row E7), measured against the PINNED
// deck's own route table (through the PINNED router) and against the PINNED
// card gem's own setup census.
//
// The register's E7 row grades the port's /setup surface and calls it a
// "port-only route (no Ruby counterpart)", on the basis that "the register
// names the host(s) and the file:line in the port that serves it, so there
// is no Ruby behaviour it could fail to match". This file MEASURES that
// basis, and the measurement is sharper than the register's wording in both
// directions.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THERE IS NO /setup PATH IN THE PINNED DECK. The pinned router sends
//      GET /setup to the mark arm (card#read, mark "setup") and POST /setup
//      to the same arm (card#create, mark "setup"). So the pinned deck's
//      answer at that path is a card read of a card named "setup" (which no
//      deck carries) and, for a POST, a CREATE of a card named "setup". The
//      port's path is its own, and the pinned deck's answer for it is a card
//      surface.
//
//   2. THE PINNED DECK'S OWN SETUP SURFACE IS THE USER CARD'S OWN :setup
//      VIEW, not a path. The pinned card-mod-account's set/type/user.rb
//      declares `view :setup, unknown: true, perms: :needs_setup?` - the
//      form lives on the user card, and its PERMISSION is the setup
//      census. So the pinned counterpart of the port's form is the user
//      card's view, and the port's separate route is a deliberate
//      difference the port's own source states.
//
//   3. THE GATE IS A DIFFERENCE OF KIND, NOT OF DETAIL. The pinned census
//      (card-1.110.0/lib/card/auth/setup.rb:9-15) is PURELY DATA: does the
//      deck have user accounts (setup.rb:33-52)? The port's own source
//      says the same about itself: "Ruby has no env gate: needs_setup? is
//      purely the census. The port's census is the same, but the port ALSO
//      requires an explicit opt-in" (src/card/auth/first-run-setup.ts).
//      The port's opt-in is the DECKO_FIRST_RUN=1 environment variable, and
//      with it unset the port's surface does not exist at all.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { afterEach, describe, expect, it } from "vitest";
import {
  SETUP_PATH,
  firstRunEnabled,
  handleFirstRunRequest,
  type FirstRunRouteContext,
  type FirstRunRouteRequest,
} from "../../src/server/first-run-routes.js";
import {
  loadPortOnlyRouteOracle,
  pinnedAnswer,
  portServes,
  quoteText,
} from "./port-only-route-oracle.js";

const ORACLE = loadPortOnlyRouteOracle();

const ORIGINAL_GATE = process.env.DECKO_FIRST_RUN;

afterEach(() => {
  if (ORIGINAL_GATE === undefined) delete process.env.DECKO_FIRST_RUN;
  else process.env.DECKO_FIRST_RUN = ORIGINAL_GATE;
});

/** A context whose driver is never reached: every assertion below turns
 *  back before the census runs. */
const UNREACHED_CONTEXT = {
  driver: {},
  fetcher: {},
} as unknown as FirstRunRouteContext;

function request(
  overrides: Partial<FirstRunRouteRequest> = {},
): FirstRunRouteRequest {
  return {
    method: "GET",
    pathname: SETUP_PATH,
    host: "deck.test",
    headers: {},
    body: "",
    ...overrides,
  };
}

describe("the pinned deck's own answer for /setup", () => {
  it("a GET /setup is a CARD READ in the pinned deck", () => {
    const answer = pinnedAnswer("E7", "/setup", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.parameters.mark).toBe("setup");
  });

  it("a POST /setup is a CARD CREATE in the pinned deck", () => {
    const answer = pinnedAnswer("E7", "/setup", "post");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("create");
    expect(answer?.answer?.parameters.mark).toBe("setup");
  });
});

describe("the pinned deck's own setup surface, quoted from the pinned gems", () => {
  it("the census is PURELY DATA: it counts user accounts", () => {
    const method = ORACLE.pinnedSource.E7[0];
    expect(method.file).toBe("card-1.110.0/lib/card/auth/setup.rb");
    expect(quoteText(method)).toContain("def needs_setup?");
    expect(quoteText(method)).toContain("needs_setup_if_no_accounts");

    const census = ORACLE.pinnedSource.E7[1];
    expect(quoteText(census)).toContain("def needs_setup_if_no_accounts");
    expect(quoteText(census)).toContain("user_account_count.zero?");
  });

  it("the setup FORM is the user card's own :setup view, permissioned by the census", () => {
    const view = ORACLE.pinnedSource.E7[2];
    expect(view.file).toBe("card-mod-account-0.20.0/set/type/user.rb");
    expect(quoteText(view)).toContain("view :setup, unknown: true, perms: :needs_setup?");
    expect(quoteText(view)).toContain('voo.title = "Your deck is ready to go!"');
  });
});

describe("the port's own /setup surface", () => {
  it("the port's path is /setup and the surface is its own", () => {
    expect(SETUP_PATH).toBe("/setup");
    expect(portServes("src/server/first-run-routes.ts", 'export const SETUP_PATH = "/setup"')).toBe(
      true,
    );
  });

  it("the port's gate is the operator's env flag, and it is OFF by default", () => {
    delete process.env.DECKO_FIRST_RUN;
    expect(firstRunEnabled()).toBe(false);
    process.env.DECKO_FIRST_RUN = "1";
    expect(firstRunEnabled()).toBe(true);
    process.env.DECKO_FIRST_RUN = "0";
    expect(firstRunEnabled()).toBe(false);
  });

  it("with the gate off, the port's surface does not exist at all", async () => {
    delete process.env.DECKO_FIRST_RUN;
    const response = await handleFirstRunRequest(UNREACHED_CONTEXT, request());
    expect(response).toBeNull();
  });

  it("with the gate on, the surface owns only GET and POST on /setup", async () => {
    process.env.DECKO_FIRST_RUN = "1";
    // Not the setup path: the host's own surface answers.
    expect(
      await handleFirstRunRequest(UNREACHED_CONTEXT, request({ pathname: "/Alpha" })),
    ).toBeNull();
    // Not a GET or a POST: the host's own surface answers.
    expect(
      await handleFirstRunRequest(UNREACHED_CONTEXT, request({ method: "DELETE" })),
    ).toBeNull();
  });

  it("the port's own source states the difference from the pinned census", () => {
    expect(
      portServes(
        "src/card/auth/first-run-setup.ts",
        "needs_setup? is purely the census",
      ),
    ).toBe(true);
    expect(
      portServes("src/card/auth/first-run-setup.ts", "DECKO_FIRST_RUN=1"),
    ).toBe(true);
  });

  it("the staging server mounts the surface behind the same gate", () => {
    expect(
      portServes("vm-staging-server.mjs", "firstRunEnabled() && (req.method === \"GET\" || req.method === \"POST\") && pathname === SETUP_PATH"),
    ).toBe(true);
  });
});
