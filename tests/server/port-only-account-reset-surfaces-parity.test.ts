// The account reset and password surfaces ([Family] row E6), measured
// against the PINNED deck's own route table (through the PINNED router)
// and against the PINNED signin card's own views and events.
//
// The register's E6 row grades the port's account-flow surfaces and calls
// them "port-only route (no Ruby counterpart)", on the basis that "the
// register names the host(s) and the file:line in the port that serves it,
// so there is no Ruby behaviour it could fail to match". This file MEASURES
// that basis, and the measurement SPLITS THE ROW.
//
// WHAT THE MEASUREMENT SETTLES, and the register's wording is wrong for
// three of the five surfaces:
//
//   1. POST /_reset-request and POST /_account-password HAVE NO PINNED
//      COUNTERPART. The pinned router sends both to the mark arm
//      ("/:mark(.:format)"), whose action is card#create - so the pinned
//      deck CREATES A CARD NAMED "_reset-request" (respectively
//      "_account-password") and answers with that card's save. The port
//      answers with the account ladder's own failure or a sent reset
//      email. Named divergence.
//
//   2. THE FORGOT-PASSWORD SUBMIT IS THE PINNED DECK'S OWN SURFACE. The
//      pinned router sends POST /update/*signin to the "(card)/update"
//      arm, whose action is card#update of the mark "*signin" - and the
//      PINNED signin card's own file says so in its own header
//      ("/update/:signin is the login action", set/self/signin.rb:6) and
//      in its own event (`event :send_reset_password_token, before:
//      :signin, on: :update, trigger: :required`, signin.rb:27-31). The
//      port's forgot-password submit rides that same path and that same
//      trigger. THIS ONE MATCHES.
//
//   3. GET /*signin/reset_password_success IS THE PINNED SIGNIN CARD'S
//      OWN VIEW. The pinned router sends it to card#read of the mark
//      "*signin" with the view "reset_password_success", and the pinned
//      signin card's own file defines that view
//      (`view :reset_password_success do frame { t :account_check_email }
//      end`, signin.rb:148-151). The port serves its own port of that
//      view. THE CONTENT MATCHES; the delivery is the port's own.
//
//   4. GET /*signin/edit IS THE PINNED SIGNIN CARD'S OWN FORGOT-PASSWORD
//      VIEW. The pinned router sends it to card#read of the mark "*signin"
//      with the view "edit", and the pinned file's own comment names that
//      view ("FORGOT PASSWORD", signin.rb:153-157) and its own reset
//      link reaches it (`link_to_view :edit`, signin.rb:185-188). The
//      port serves it as a modal slot. THE CONTENT MATCHES; the delivery
//      (a bare modal fragment instead of a full page) is the port's own.
//
// So the row is PORTED with two named divergences, and the register's
// "no Ruby counterpart" is correct for two of the five surfaces and wrong
// for the other three.
//
// The fixture is fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json,
// written by tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb.

import { describe, expect, it } from "vitest";
import {
  loadPortOnlyRouteOracle,
  pinnedAnswer,
  portServes,
  quoteText,
} from "./port-only-route-oracle.js";

const ORACLE = loadPortOnlyRouteOracle();

describe("the pinned deck's own answer for the E6 surfaces", () => {
  it("the pinned router ran over the pinned deck's own 29-route table", () => {
    expect(ORACLE.pinnedRouterRoutes.length).toBe(29);
    expect(ORACLE.row).toBe("reg-routes-E6..E13");
  });

  it("POST /_reset-request is a CARD CREATE in the pinned deck", () => {
    const answer = pinnedAnswer("E6", "/_reset-request", "post");
    expect(answer?.matched).toBe(true);
    // The mark arm, action card#create, and the mark is the path itself.
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("create");
    expect(answer?.answer?.parameters.mark).toBe("_reset-request");
  });

  it("POST /_account-password is a CARD CREATE in the pinned deck", () => {
    const answer = pinnedAnswer("E6", "/_account-password", "post");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark(.:format)");
    expect(answer?.answer?.defaults.action).toBe("create");
    expect(answer?.answer?.parameters.mark).toBe("_account-password");
  });

  it("the forgot-password submit is the pinned deck's OWN card update", () => {
    const answer = pinnedAnswer("E6", "/update/*signin", "post");
    expect(answer?.matched).toBe(true);
    // The "(card)/update" arm, action card#update, mark "*signin".
    expect(answer?.answer?.path).toBe("(/card)/update(/:mark(.:format))");
    expect(answer?.answer?.defaults.action).toBe("update");
    expect(answer?.answer?.parameters.mark).toBe("*signin");
  });

  it("the success view is the pinned signin card's OWN view", () => {
    const answer = pinnedAnswer("E6", "/*signin/reset_password_success", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark/:view(.:format)");
    expect(answer?.answer?.defaults.action).toBe("read");
    expect(answer?.answer?.parameters.mark).toBe("*signin");
    expect(answer?.answer?.parameters.view).toBe("reset_password_success");
  });

  it("the modal slot is the pinned signin card's OWN edit view", () => {
    const answer = pinnedAnswer("E6", "/*signin/edit", "get");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.path).toBe("/:mark/:view(.:format)");
    expect(answer?.answer?.parameters.mark).toBe("*signin");
    expect(answer?.answer?.parameters.view).toBe("edit");
  });
});

describe("the pinned signin card's own method, quoted from the pinned gem", () => {
  it("the pinned file's own header names the /update/:signin action", () => {
    const header = ORACLE.pinnedSource.E6[0];
    expect(header.file).toBe("card-mod-account-0.20.0/set/self/signin.rb");
    expect(quoteText(header)).toContain("/update/:signin is the login action");
    // The same header names the forgot-password view's own URL spelling.
    expect(quoteText(header)).toContain("/:signin?view=edit gives the forgot password ui");
  });

  it("the pinned file's own event is the trigger the port's submit carries", () => {
    const event = ORACLE.pinnedSource.E6[1];
    expect(quoteText(event)).toContain(
      "event :send_reset_password_token, before: :signin, on: :update, trigger: :required",
    );
  });

  it("the pinned file's own two views are the two the port serves", () => {
    const views = ORACLE.pinnedSource.E6[2];
    expect(quoteText(views)).toContain("view :reset_password_success do");
    expect(quoteText(views)).toContain("frame { t :account_check_email }");
    expect(quoteText(views)).toContain("view :edit do");
    expect(quoteText(views)).toContain("# FORGOT PASSWORD");
  });

  it("the pinned file's own success envelope lands on that success view", () => {
    const success = ORACLE.pinnedSource.E6[3];
    expect(quoteText(success)).toContain("def edit_success");
    expect(quoteText(success)).toContain("{ view: :reset_password_success }");
  });
});

describe("the port's own account-flow surfaces", () => {
  it("the staging server still serves the two JSON verbs and the submit", () => {
    expect(portServes("vm-staging-server.mjs", 'pathname === "/_reset-request"')).toBe(true);
    expect(portServes("vm-staging-server.mjs", 'pathname === "/_account-password"')).toBe(true);
    expect(portServes("vm-staging-server.mjs", "pathname === FORGOT_PASSWORD_SUBMIT_PATH")).toBe(true);
  });

  it("the staging server still serves the two signin views", () => {
    expect(
      portServes("vm-staging-server.mjs", 'pathname === "/*signin/reset_password_success"'),
    ).toBe(true);
    expect(portServes("vm-staging-server.mjs", 'pathname === "/*signin/edit"')).toBe(true);
  });

  it("the write path's own trigger branch is the forgot-password submit", () => {
    expect(
      portServes(
        "src/server/write-routes.ts",
        'parsed.card["trigger"] === "send_reset_password_token"',
      ),
    ).toBe(true);
  });

  it("the port's own success view is the pinned card's reset_password_success view", () => {
    expect(
      portServes(
        "src/card/mod-loader/mods/card-mod-account.ts",
        'framedView(ctx, "reset_password_success"',
      ),
    ).toBe(true);
  });

  it("the capture's port-side quotes name the surfaces this row grades", () => {
    expect(ORACLE.portSurface.E6.map((entry) => entry.host)).toEqual([
      "the staging server's account-flow POST arms",
      "the staging server's signin view arms",
      "the write path's forgot-password trigger",
      "the port's own reset_password_success view",
    ]);
  });
});
