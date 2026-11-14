// validate_javascript_syntax (completeness register, events table row
// card-mod-script; register verdict PARTIAL "body disposition not
// individually audited this pass").
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-script-0.20.0/set/type/java_script.rb:
//
//   java_script.rb:5-9
//     event :validate_javascript_syntax, :validate, on: :save,
//            changed: %i[type_id content] do
//       Uglifier.compile content, harmony: true
//     rescue Uglifier::Error => e
//       errors.add :content,
//         "<pre>#{Cardio::Utils.ansi2html(e.message)}</pre>".html_safe
//     end
//
// DISPOSITION: ENGINE-OWNED — and the mod file's own two comments
// contradicted each other about it, which is what this file settles.
//
// The registration comment said:
//   "SEAM: body is a no-op stub - same as the coffeescript event;
//    uglifier + Cardio::Utils.ansi2html are unported, and the
//    `errors.add :content` write-path surface has no TS port."
// The fn's own doc comment said:
//   "The optional host-backed implementation runs in the action engine's
//    pre-store subtree guard. Node production boot and harness use the same
//    real vendored Uglifier provider."
//
// BOTH halves of the first comment are false today, on the same evidence
// the coffeescript row was closed on:
// - Uglifier IS present: src/card/assets/uglify-harmony-static.ts drives the
//   exact vendored parser, and the Node host wires
//   uglifyHarmonySyntaxError (write-routes-compiler-dispatch.test.ts:150).
// - ansi2html IS ported: uglify-harmony-diagnostics.ts builds the caret
//   context with SGR codes and rewrites them through the same span spelling
//   Ruby uses, citing ansi_2_html.rb by name.
// - the write path IS ported: CardActionEngine.validateCssSaveTree
//   (card-action-engine.ts:2873-2882) throws the :content CardActionError,
//   with Ruby's `<pre>…</pre>` wrapper and .html_safe semantics.
//
// What remains true is only the SHAPE: the registered fn is a no-op
// because the body runs in the engine's validate walk, not through the
// seam — the same reason the coffeescript sibling's fn is a stub after its
// own port.
//
// The engine half is CONDITIONAL on a validator being wired (a host that
// passes no javascriptValidator gets no check), which is a real property of
// the port's architecture and is pinned here rather than glossed.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModScript from "../../../src/card/mod-loader/mods/card-mod-script.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";
import {
  staticUglifyHarmonySyntaxError,
} from "../../../src/card/assets/uglify-harmony-static.js";

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

describe("validate_javascript_syntax (java_script.rb:5-9) — the declaration", () => {
  it("carries Ruby's exact clauses: :validate, on: :save, changed: [type_id, content]", () => {
    const decl = declaredEvents(cardModScript).find((d) => d.event === "validate_javascript_syntax");
    expect(decl, "validate_javascript_syntax not declared").toBeDefined();
    expect(decl!.setPath).toBe("type/java_script");
    expect(decl!.at).toBe("validate");
    expect(decl!.on).toEqual(["save"]);
    // changed: %i[type_id content] — BOTH columns, in Ruby's order
    expect(decl!.changed).toEqual(["type_id", "content"]);
    expect(decl!.when).toBeUndefined();
  });

  it("reaches the deck's validate stage under its type set path", () => {
    const validate = defaultDeckEventRuntime().registry
      .forStage("validate")
      .map((e) => `${e.setPath}:${e.event}`);
    expect(validate).toContain("type/java_script:validate_javascript_syntax");
  });

  it("the fn is the honest stub — the body runs in the engine's validate walk", () => {
    const decl = declaredEvents(cardModScript).find((d) => d.event === "validate_javascript_syntax");
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();
  });
});

describe("the ENGINE-OWNED body, verified rather than taken on the comment's word", () => {
  it("the engine's validate walk owns the java_script arm, with Ruby's guard order and wrapper", () => {
    const engine = readFileSync(
      new URL("../../../src/card/actions/card-action-engine.ts", import.meta.url),
      "utf8",
    );
    const arm = engine.slice(engine.indexOf('typeCode === "java_script"'));
    expect(arm.length, "the java_script arm left validateCssSaveTree").toBeGreaterThan(0);
    // Ruby's changed: %i[type_id content] is the arm's re-check condition
    expect(arm).toContain("typeId !== row.type_id");
    expect(arm).toContain("content !== row.db_content");
    // the act's skip lists stand the arm down under Ruby's event name
    expect(arm).toContain('skipsEvent("validate_javascript_syntax")');
    // Ruby wraps in <pre>…</pre> (.html_safe) and adds under :content
    expect(arm).toContain("<pre>");
    expect(arm).toContain("validation-failed");
  });

  it("Uglifier is present — the exact vendored parser, not a stand-in", () => {
    const mod = readFileSync(
      new URL("../../../src/card/mod-loader/mods/card-mod-script.ts", import.meta.url),
      "utf8",
    );
    // the stale CLAIM is gone; the correction quotes it in a marked aside,
    // so these are the checks (they fail if the unmarked claim returns)
    expect(mod, "the 'uglifier is unported' claim is back").not.toMatch(
      /^\s*\/\/\s*uglifier \+ Cardio::Utils\.ansi2html are unported, and the$/m,
    );
    expect(mod).not.toMatch(/^\s*\/\/\s*SEAM: body is a no-op stub - same as the coffeescript event;$/m);
    const staticMod = readFileSync(
      new URL("../../../src/card/assets/uglify-harmony-static.ts", import.meta.url),
      "utf8",
    );
    expect(staticMod).toContain("staticUglifier");
    // harmony: true — Ruby passes it, so the port must too
    const options = readFileSync(
      new URL("../../../src/card/assets/uglify-harmony-options.ts", import.meta.url),
      "utf8",
    );
    expect(options).toMatch(/harmony/);
  });

  it("ansi2html IS ported — the caret context and its SGR rewrite, citing ansi2_html.rb", () => {
    const diagnostics = readFileSync(
      new URL("../../../src/card/assets/uglify-harmony-diagnostics.ts", import.meta.url),
      "utf8",
    );
    expect(diagnostics).toMatch(/ansi2_html\.rb/);
    expect(diagnostics).toMatch(/\\x1b/);
  });

  it("EXECUTED: the vendored parser answers on a malformed source and passes a valid one", () => {
    // a real compile, not a mocked one — the claim under test is that the
    // provider Ruby needs actually exists and works.
    expect(staticUglifyHarmonySyntaxError("var invalid = ;")).toMatch(/Unexpected token/);
    expect(
      staticUglifyHarmonySyntaxError("let x = 1; const f = n => n + x;"),
      "a valid script must produce no diagnostic",
    ).toBeUndefined();
  });

  it("the provider is wired by the edge host, so the arm is not dead there", () => {
    const edge = readFileSync(
      new URL("../../../src/server/cloudflare-write-routes.ts", import.meta.url),
      "utf8",
    );
    expect(edge).toContain("javascriptValidator: staticUglifyHarmonySyntaxError");
  });
});
