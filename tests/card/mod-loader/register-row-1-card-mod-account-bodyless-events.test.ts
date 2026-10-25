// The account mod's two bodyless events, and the dispatch that would
// ignore a body.
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
// Both bodies change something OUTSIDE the card: the first appends to
// Ruby's Success object (the controller reads it after the save to answer
// the redirect), the second clears the rack session. The port's two
// registrations carry NO body at all
// (src/card/mod-loader/mods/card-mod-account.ts:1459-1464 and 1493-1498),
// and the port's event dispatch DISCARDS an event body's return value
// (src/card/mod-loader/mod-event-dispatch.ts:870), so a body written the
// way Ruby writes it would have no effect: only the port's abort THROW
// (src/card/actions/types.ts) unwinds a save.
//
// This file pins those two facts, so the row's gap cannot change
// silently: a lane that closes the row has to change these assertions on
// purpose and to say why.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ACCOUNT_MOD = join(REPO, "src", "card", "mod-loader", "mods", "card-mod-account.ts");
const DISPATCH = join(REPO, "src", "card", "mod-loader", "mod-event-dispatch.ts");

/** The source text of the registration that declares the named event. */
const declarationOf = (source: string, name: string): string => {
  const at = source.indexOf(`event: "${name}"`);
  if (at === -1) throw new Error(`no registration declares the event ${name}`);
  const start = source.lastIndexOf("event({", at);
  const end = source.indexOf("}),", at);
  if (start === -1 || end === -1) throw new Error(`the ${name} registration is not one block`);
  return source.slice(start, end);
};

describe("the account mod's two events, and the dispatch that ignores a body's return value", () => {
  const source = readFileSync(ACCOUNT_MOD, "utf8");

  it("registers password_redirect and signout_upon_delete on the right/account/events set path", () => {
    const module = (cardModAccount.setModules ?? []).find(
      (entry) => entry.setPath === "right/account/events",
    );
    const names = (module?.events ?? []).map((event) => event.event);
    expect(names).toContain("password_redirect");
    expect(names).toContain("signout_upon_delete");
  });

  it("declares password_redirect WITHOUT a body", () => {
    const declaration = declarationOf(source, "password_redirect");
    expect(declaration).not.toContain("=>");
    expect(declaration).not.toContain("fn:");
  });

  it("declares signout_upon_delete WITHOUT a body", () => {
    const declaration = declarationOf(source, "signout_upon_delete");
    expect(declaration).not.toContain("=>");
    expect(declaration).not.toContain("fn:");
  });

  it("the dispatch calls the body and does not read its return value", () => {
    const dispatch = readFileSync(DISPATCH, "utf8");
    expect(dispatch).toContain("await event.fn(");
    // The body is awaited, and its result is bound to nothing.
    expect(dispatch).not.toMatch(/(?:const|let|var)\s+\w+\s*=\s*await\s+event\.fn\(/);
  });
});
