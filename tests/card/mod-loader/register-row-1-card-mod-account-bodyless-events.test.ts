// The account mod's two bodyless events - and their close.
//
// This file PINNED THE ROW'S GAP: it asserted that password_redirect and
// signout_upon_delete were declared WITHOUT a body
// (src/card/mod-loader/mods/card-mod-account.ts) and that the event
// dispatcher discarded a body's return value
// (src/card/mod-loader/mod-event-dispatch.ts). Its own header said a lane
// that closes the row changes these assertions on purpose and says why.
//
// The row closed (register row 1, card-mod-account): both events now
// declare the bodies Ruby's gem carries (set/right/account/events.rb:26-28
// and :49-51), the dispatcher binds the body's ModEventBodyOutcome return
// value into the stage report, and the act's result carries it to the write
// route, which applies it after the save. The behavior pins live in
// register-row-1-card-mod-account-event-bodies.test.ts; this file keeps one
// assertion: the inverse of what it used to pin.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

describe("the account mod's two events are bodyless no longer", () => {
  const source = readFileSync(ACCOUNT_MOD, "utf8");

  it("declares password_redirect WITH a body", () => {
    const declaration = declarationOf(source, "password_redirect");
    expect(declaration).toContain("fn:");
    expect(declaration).toContain("successAppend");
  });

  it("declares signout_upon_delete WITH a body", () => {
    const declaration = declarationOf(source, "signout_upon_delete");
    expect(declaration).toContain("fn:");
    expect(declaration).toContain("signout: true");
  });

  it("the dispatch binds the body's return value into the stage report", () => {
    const dispatch = readFileSync(DISPATCH, "utf8");
    expect(dispatch).toContain("const outcome = await event.fn(");
    expect(dispatch).toContain("bodyOutcomes");
  });
});
