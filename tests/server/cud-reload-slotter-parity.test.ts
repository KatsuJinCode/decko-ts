// cud_success's reload and slotter-magic arms, measured against the PINNED
// DECK's own method.
//
// The completeness register's C4 row grades the port on the `reload` JSON
// arm ("response.rb:71-73; success.reload?") and its C5 row on the
// `slotter_magic?` arm ("response.rb:75-81, slotter_mode params"). The
// rows' notes name the methods but not the ORDER (reload outranks slotter
// magic - the if/elsif), nor the exact predicate strings, nor what an
// unlisted slotter_mode answers.
//
// fixtures/captured/cud-reload-slotter-ruby-oracle.json is what
// oracle-capture-cud-reload-slotter-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own cud_success over its three arms, and
// the PINNED Success#reload? and slotter_magic? over the exact strings a
// form can carry:
//
//   the ladder  decko-0.20.0/lib/card_controller/rest.rb:80-89
//                 if success.reload?   -> {reload: true}
//                 elsif slotter_magic? -> {magic: true}
//                 else                 -> redirect_cud_success
//   the check   card-1.110.0/lib/card/env/success.rb:41-43
//                 @reload.to_s == "true"
//
// The port's route-level honor is measured over the real HTTP write
// surface in tests/server/write-routes-cud-reload-slotter.test.ts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/cud-reload-slotter-ruby-oracle.json"), "utf8"),
) as {
  ladder: Record<
    string,
    {
      slotterMode: string | null;
      successArgs: Record<string, string> | null;
      rendered: { json: Record<string, unknown> } | null;
      redirected: { url: string | null; status: number } | null;
      error: string | null;
    }
  >;
  reloadChecks: Record<string, boolean>;
  slotterChecks: Record<string, boolean | null>;
  sources: {
    cudSuccess: Array<{ line: number; text: string }>;
    arms: Array<{ line: number; text: string }>;
    successReload: Array<{ line: number; text: string }>;
  };
};

describe("the cud_success ladder, against the pinned deck gem", () => {
  it("success[reload]=true renders {reload: true}", () => {
    const row = ORACLE.ladder.reloadTrue;
    expect(row.error).toBeNull();
    expect(row.rendered).toEqual({ json: { reload: true } });
    expect(row.redirected).toBeNull();
  });

  it("reload outranks slotter magic: the if/elsif order", () => {
    const row = ORACLE.ladder.reloadTruePlusSlotter;
    expect(row.error).toBeNull();
    expect(row.rendered).toEqual({ json: { reload: true } });
  });

  it("each of the three magic slotter_mode values renders {magic: true}", () => {
    for (const key of ["slotterSilentSuccess", "slotterUpdateModalOrigin", "slotterUpdateOrigin"]) {
      const row = ORACLE.ladder[key];
      expect(row.error, key).toBeNull();
      expect(row.rendered, key).toEqual({ json: { magic: true } });
      expect(row.redirected, key).toBeNull();
    }
  });

  it("an unlisted mode is NOT magic: the redirect arm answers at 303", () => {
    const row = ORACLE.ladder.slotterUnlisted;
    expect(row.error).toBeNull();
    expect(row.rendered).toBeNull();
    expect(row.redirected).toEqual({ url: "/Elsewhere", status: 303 });
  });

  it("neither reload nor slotter magic: the plain redirect answers", () => {
    const row = ORACLE.ladder.plainRedirect;
    expect(row.error).toBeNull();
    expect(row.redirected).toEqual({ url: "/Elsewhere", status: 303 });
  });

  it("the pinned predicates over the exact strings", () => {
    // env/success.rb:41-43 - the string compare, case-sensitive.
    expect(ORACLE.reloadChecks).toEqual({
      true: true,
      false: false,
      "": false,
      absent: false,
      TRUE: false,
    });
    // response.rb:79-81 - the three magic values, nil-safe.
    expect(ORACLE.slotterChecks).toEqual({
      absent: null,
      "": false,
      "silent-success": true,
      "update-modal-origin": true,
      "update-origin": true,
      "modal-replace": false,
      TRUE: false,
    });
  });

  it("the pinned sources say the order out loud", () => {
    const reload = ORACLE.sources.cudSuccess.find((row) => row.text.includes("if success.reload?"));
    expect(reload).toBeDefined();
    const slotter = ORACLE.sources.cudSuccess.find((row) => row.text.includes("elsif slotter_magic?"));
    expect(slotter).toBeDefined();
    const magic = ORACLE.sources.arms.find((row) => row.text.includes("magic: true"));
    expect(magic).toBeDefined();
    const compare = ORACLE.sources.successReload.find((row) => row.text.includes("@reload.to_s"));
    expect(compare).toBeDefined();
  });
});
