// The account mod's two event bodies, and the dispatch that applies a
// body's return value.
//
// RUBY (card-mod-account-0.20.0 set/right/account/events.rb):
//
//   :26-28  event :password_redirect, :finalize, on: :update,
//                  when: :password_redirect? do
//             success << { id: name, view: "edit" }
//           end
//
//   :49-51  event :signout_upon_delete, :integrate, on: :delete,
//                  when: :current_account? do
//             Self::Signin.signout
//           end
//
// This file PINNED THE ROW'S GAP: both registrations carried no body and
// the dispatcher bound a body's return value to nothing
// (mod-event-dispatch.ts), so a body written the way Ruby writes it had no
// effect. The row's close replaced the gap pins with these: a closing lane
// changes the assertions on purpose and says why. The port's channel is
// the body's ModEventBodyOutcome return value - the port of what Ruby's
// bodies write into the request env (success.rb:44-49 apply;
// signin.rb:19-23 Auth.signin AnonymousID + Env.reset_session). The
// dispatcher binds the value into the stage report, the save's act carries
// it on the ActionResult (card-action-engine.ts takeActEnvOutcomes), and
// the write route applies it after the save (write-routes.ts: the success
// merge over the request's envelope, and the session revocation + cleared
// cookie of its handleSignout pair).

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ModEventRegistry } from "../../../src/card/mod-loader/mod-event-registry.js";
import { runModEventStage, type ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import { modEventCardStateSources } from "../../../src/card/mod-loader/mod-event-card-state.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";
import cardModAccount, {
  accountModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-account.js";
import type {
  ModEventCard,
  ModEventRegistration,
} from "../../../src/card/mod-loader/mod-manifest.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WRITE_ROUTES = join(REPO, "src", "server", "write-routes.ts");
const ENGINE = join(REPO, "src", "card", "actions", "card-action-engine.ts");

const DUMMY_DEPS = {} as Parameters<typeof runModEventStage>[3];

/** The account-events set module's registration for the named event. */
const declarationOf = (name: string): ModEventRegistration => {
  const module = (cardModAccount.setModules ?? []).find(
    (entry) => entry.setPath === "right/account/events",
  );
  const registered = (module?.events ?? []).find((event) => event.event === name);
  if (registered === undefined) throw new Error(`no registration declares the event ${name}`);
  return registered;
};

/** A card with the act-state shape the engine builds per save, on the
 *  +*account card of the signed-in holder (password unset). */
const accountCard = (over: Partial<ModEventCard> = {}): ModEventCard => ({
  name: "Joe User+*account",
  id: 50,
  key: "joe_user+account",
  action: "update",
  authCurrentId: 50,
  password: "",
  changedFields: [],
  act: { action: "update" },
  ...over,
});

describe("the account mod's two event bodies (register row 1's close)", () => {
  it("registers password_redirect and signout_upon_delete on the right/account/events set path", () => {
    const module = (cardModAccount.setModules ?? []).find(
      (entry) => entry.setPath === "right/account/events",
    );
    const names = (module?.events ?? []).map((event) => event.event);
    expect(names).toContain("password_redirect");
    expect(names).toContain("signout_upon_delete");
  });

  it("password_redirect's body returns the Success append Ruby's body writes", async () => {
    // events.rb:27 `success << { id: name, view: "edit" }` - the appended
    // hash applied onto the request's Success object (success.rb:44-49).
    const { fn } = declarationOf("password_redirect");
    const outcome = await fn(
      accountCard({ name: "Joe User+*account", id: 50 }),
      {} as Parameters<typeof fn>[1],
      {} as Parameters<typeof fn>[2],
    );
    expect(outcome).toEqual({ successAppend: { id: "Joe User+*account", view: "edit" } });
  });

  it("signout_upon_delete's body returns the signout Ruby's body performs", async () => {
    // events.rb:50 `Self::Signin.signout` - signin.rb:19-23's
    // `Auth.signin AnonymousID; Env.reset_session` machinery.
    const { fn } = declarationOf("signout_upon_delete");
    const outcome = await fn(
      accountCard({ action: "delete" }),
      {} as Parameters<typeof fn>[1],
      {} as Parameters<typeof fn>[2],
    );
    expect(outcome).toEqual({ signout: true });
  });

  it("password_redirect? and current_account? gate on the real account state", () => {
    const predicates = accountModEventPredicates;
    // current_account? (abstract/account_holder.rb:23): id == Auth.current_id.
    expect(predicates["current_account?"](accountCard())).toBe(true);
    expect(predicates["current_account?"](accountCard({ id: 51 }))).toBe(false);
    // password_redirect? (right/account/events.rb:83): current holder AND
    // password.blank? - the real +password content the account state source
    // supplies, not an absent field.
    expect(predicates["password_redirect?"](accountCard())).toBe(true);
    expect(predicates["password_redirect?"](accountCard({ password: "digest" }))).toBe(false);
    expect(
      predicates["password_redirect?"](accountCard({ authCurrentId: 51 })),
    ).toBe(false);
  });

  it("the account mod's state source is registered (the +password content the predicate reads)", () => {
    registerDeckModEventCardStateSources();
    const source = modEventCardStateSources().find((entry) => entry.modName === "account");
    expect(source?.setPaths).toContain("right/account/events");
  });

  it("the dispatcher binds a fired body's return value into the stage report", async () => {
    const registry = new ModEventRegistry();
    registry.register({
      event: "password_redirect",
      at: "finalize",
      on: ["update"],
      fn: () => ({ successAppend: { id: "Joe User+*account", view: "edit" } }),
      setPath: "right/account/events",
      modName: "account",
    });
    const runtime: ModEventRuntime = { registry, setMember: () => true };
    const report = await runModEventStage(runtime, "finalize", accountCard(), DUMMY_DEPS);
    expect(report.fired).toEqual(["password_redirect"]);
    expect(report.bodyOutcomes).toEqual([
      { successAppend: { id: "Joe User+*account", view: "edit" } },
    ]);
  });

  it("a void body leaves the report without bodyOutcomes (the channel is opt-in)", async () => {
    const registry = new ModEventRegistry();
    registry.register({
      event: "set_default_salt",
      at: "finalize",
      on: ["update"],
      fn: () => undefined,
      setPath: "right/account/events",
      modName: "account",
    });
    const runtime: ModEventRuntime = { registry, setMember: () => true };
    const report = await runModEventStage(runtime, "finalize", accountCard(), DUMMY_DEPS);
    expect(report.fired).toEqual(["set_default_salt"]);
    expect(report.bodyOutcomes).toBeUndefined();
  });

  it("the act carries the bodies' outcomes to the route, and the route applies them after the save", () => {
    // The engine folds the stage reports' outcomes into the act's result
    // (the outermost entry; card-action-engine.ts).
    const engine = readFileSync(ENGINE, "utf8");
    expect(engine).toContain("takeActEnvOutcomes");
    expect(engine).toContain("actEnvBodyOutcomes.push(...report.bodyOutcomes)");
    // The write route merges the append over the request's own success
    // envelope (success.rb:44-49 apply order) and answers a signout the way
    // its own signout arm does (revoke + cleared cookie).
    const routes = readFileSync(WRITE_ROUTES, "utf8");
    expect(routes).toContain('parsed.success["id"] = append.id');
    expect(routes).toContain('parsed.success["view"] = append.view');
    expect(routes).toContain("applyActSignoutCookie");
    expect(routes).toContain("revokeSession(sessionToken)");
  });
});
