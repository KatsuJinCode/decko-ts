// THE PORT-SIDE READER MUST NOT LOSE REGISTRATIONS TO A COMMENT.
//
// This is the guard for a defect that made the mod census report eight
// gem set files as having no port registration when the port registers
// all twenty-three of them.
//
// WHAT HAPPENED: the reader removed /* ... */ comment pairs with a regex
// BEFORE it removed line comments. In
// src/card/mod-loader/mods/card-mod-account.ts the line
//
//   // /*signin titled body rendered the card's EMPTY RichText content and
//
// (line 1616) carries a "/*" inside a line comment. The regex read it as
// a block-comment opener and swallowed 41969 characters of real code, so
// every set path after line 1616 went unread: self/signin, type/role,
// type/signup, type/signup/views, type/user and the type_plus_right trio.
//
// WHAT THIS TEST PINS: the account mod file's twenty-three set paths are
// all read, including the ones that sit after the offending line, and a
// "/*" inside a line comment does not open a block comment.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  readPortSetPathRegistrations,
  stripComments,
} from "./audit-mod-port-registration-reader.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT_MOD = join(
  REPO,
  "src",
  "card",
  "mod-loader",
  "mods",
  "card-mod-account.ts",
);

describe("the port-side registration reader", () => {
  it("reads every set path of the account mod, including those after the line comment that carries a /*", () => {
    const portText = readFileSync(ACCOUNT_MOD, "utf8");
    const { setPaths } = readPortSetPathRegistrations(portText);

    // The gem card-mod-account-0.20.0 has 23 set files; the port registers
    // all 23 (the register's own claim, verified here against the text).
    expect(setPaths).toHaveLength(23);

    // Every one of these sits AFTER line 1616, the line whose "/*" the old
    // reader mistook for a block-comment opener.
    for (const setPath of [
      "self/signin",
      "type/role",
      "type/signup",
      "type/signup/views",
      "type/user",
      "type_plus_right/cardtype/account",
      "type_plus_right/role/members",
      "type_plus_right/user/email",
    ]) {
      expect(setPaths).toContain(setPath);
    }
  });

  it("reads the view and event names that belong to a set path, not the ones of its neighbour", () => {
    const portText = readFileSync(ACCOUNT_MOD, "utf8");
    const { bySetPath } = readPortSetPathRegistrations(portText);

    // self/signin carries the signin event body registrations and its own
    // html view set; the signin's :open view is the one the tranche 1
    // commit d335734e ported.
    expect(bySetPath.get("self/signin").views).toContain("open");
    expect(bySetPath.get("self/signin").events).toContain("signin");
    expect(bySetPath.get("self/signin").events).toContain("signout");

    // type/role carries the role views, which the old reader attributed to
    // the previous set path.
    expect(bySetPath.get("type/role").views).toContain("link_with_checkbox");
    expect(bySetPath.get("type/role").views).toContain("configs");
  });

  it("does not read a registration out of a comment", () => {
    const source = [
      'const a = { setPath: "all/one" };',
      '// a quoted name in a comment: view: "comment_only"',
      '/* block comment with view: "block_only" */',
      'const b = { setPath: "all/two", views: [{ view: "real" }] };',
    ].join("\n");
    const { bySetPath } = readPortSetPathRegistrations(source);
    expect(bySetPath.get("all/two").views).toEqual(["real"]);
    expect(bySetPath.get("all/one").views).toEqual([]);
  });

  it("reads a set path registered through a helper call", () => {
    // card-mod-bootstrap.ts registers ten of its twenty-four set paths this
    // way, and the census read those ten gem set files as unregistered.
    const source = [
      'const passiveSetModule = (setPath: string) => ({ setPath });',
      'const manifest = { setModules: [',
      '  passiveSetModule("all/bootstrap/accordion"),',
      '  passiveSetModule("all/bootstrap/dropdown"),',
      '] };',
    ].join("\n");
    const { setPaths } = readPortSetPathRegistrations(source);
    expect(setPaths).toContain("all/bootstrap/accordion");
    expect(setPaths).toContain("all/bootstrap/dropdown");
  });

  it("reads a set path registered through the loader DSL", () => {
    // card-mod-markdown.ts registers its only set path this way:
    //   set("type/markdown", ({ format }) => {
    //     format("html", ({ view }) => { view("core", markdownCoreView); });
    //   });
    const source = [
      'set("type/markdown", ({ format }) => {',
      '  format("html", ({ view }) => {',
      '    view("core", markdownCoreView);',
      '  });',
      '});',
    ].join("\n");
    const { bySetPath, setPaths } = readPortSetPathRegistrations(source);
    expect(setPaths).toEqual(["type/markdown"]);
    expect(bySetPath.get("type/markdown").views).toEqual(["core"]);
  });

  it("does not read a Map write on another object as a set-module registration", () => {
    // voo.classUps.set("help-text", prevAlert) is a Map write.
    const source = [
      'voo.classUps.set("help-text", prevAlert);',
      'set("type/real", ({ view }) => { view("core", fn); });',
    ].join("\n");
    const { setPaths } = readPortSetPathRegistrations(source);
    expect(setPaths).toEqual(["type/real"]);
  });

  it("keeps a /* that sits inside a line comment from opening a block comment", () => {
    const source = [
      "// /*not a block comment opener",
      'const kept = { setPath: "all/after" };',
    ].join("\n");
    const stripped = stripComments(source);
    expect(stripped).toContain('setPath: "all/after"');
  });

  it("keeps a /* that sits inside a string literal from opening a block comment", () => {
    const source = ['const path = "a/*b";', 'const kept = { setPath: "all/after" };'].join(
      "\n",
    );
    const stripped = stripComments(source);
    expect(stripped).toContain('setPath: "all/after"');
  });
});
