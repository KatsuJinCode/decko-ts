// haml-slice: the Haml compiler the two `haml_file` views need.
//
// The two views the mod-views-a lane named as un-portable are
//
//   A) card-mod-content set/abstract/haml_file.rb:20-22
//        view :core do
//          haml card.content, haml_locals
//        end
//   B) card-mod-assets   set/abstract/mod_assets.rb:171-182
//        view :core do ... haml :group_list, groups: groups end
//
// both of which land in card-mod-format set/all/haml.rb:41-47 -> :61-69 ->
// Card::Set::Format::HamlPaths#haml_to_html (haml_paths.rb:8-14):
//
//        ::Haml::Engine.new(haml).render a_binding, locals || {}
//
// with NO options hash. This file pins the bytes that call produces.
//
// ORACLE PROVENANCE (fixtures/captured/haml-slice/, captured by
// tools/haml-slice/oracle-capture-group-list-haml-bytes.rb and
// tools/haml-slice/oracle-probe-haml-engine-semantics.rb, run with
// `bundle exec ruby` from tools/oracle/decko-oracle-app against the LIVE
// Rails deck — card 1.110.0, haml 5.2.2, decko 0.20.0):
//
//   - 33 `<mod>+*style` / `<mod>+*script` cards reach view B; their 40 real
//     (title, items) group pairs are captured verbatim.
//   - No set module in the running bundle includes
//     `Card::Set::Abstract::HamlFile` (probe: `haml_file_included_by=[]`),
//     so view A is reached by ZERO cards in this deck - its template set is
//     empty here, and this test pins the COMPILER, not a card render.
//
// The compiler under test is src/card/render/haml-slice-compiler.ts.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  HamlCompileError,
  HamlUnsupportedError,
  compileHaml,
  collectHamlFeatures,
} from "../../../src/card/render/haml-slice-compiler.js";
import type { HamlScope } from "../../../src/card/render/haml-slice-compiler.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

const GROUP_LIST = readFileSync(
  join(REPO, "fixtures", "captured", "haml-slice", "assets-core-group-list.json"),
  "utf8",
) as string;
const groupListFixture = JSON.parse(GROUP_LIST) as {
  group_list_source: string;
  cases: Record<string, { locals: [string, string[]][]; bytes: string }>;
};

const SEMANTICS = JSON.parse(
  readFileSync(
    join(REPO, "fixtures", "captured", "haml-slice", "haml-5.2.2-semantics.json"),
    "utf8",
  ),
) as { cases: Record<string, { src: string; bytes: string }> };

/** The scope the slice needs: a `list_group` helper returning pre-recorded
 *  real ActionView bytes. The helper's OUTPUT is an input to the Haml
 *  compiler, not something the compiler computes - card-mod-bootstrap
 *  set/all/bootstrap/helper.rb:12 owns it. */
function scopeWithGroups(groups: [string, string[]][]): HamlScope {
  return {
    locals: { groups },
    helpers: {
      list_group: (items: unknown) =>
        `<ul class="list-group">${(items as string[])
          .map((i) => `<li class="list-group-item">${i}</li>`)
          .join("\n")}</ul>`,
    },
  };
}

describe("haml-slice: card-mod-assets :core's group_list.haml", () => {
  const src = groupListFixture.group_list_source;

  it("the fixture's template is the gem's group_list.haml byte for byte", () => {
    // Guards against the fixture drifting from the gem file it claims to pin.
    expect(src).toBe(
      "- groups.each do |(title, items)|\n" +
        "  %p\n" +
        "    %h5\n" +
        "      =title\n" +
        "    =list_group(items)\n",
    );
  });

  it("compiles every captured oracle case byte-exactly", () => {
    const keys = Object.keys(groupListFixture.cases);
    expect(keys.length).toBeGreaterThanOrEqual(53);
    const mismatches: string[] = [];
    for (const key of keys) {
      const { locals, bytes } = groupListFixture.cases[key]!;
      const got = compileHaml(src, scopeWithGroups(locals as [string, string[]][]));
      if (got !== bytes) mismatches.push(`${key}\n  want ${JSON.stringify(bytes)}\n  got  ${JSON.stringify(got)}`);
    }
    expect(mismatches.join("\n")).toBe("");
  });

  it("an empty groups list renders the empty string (h5 never emitted)", () => {
    expect(compileHaml(src, scopeWithGroups([]))).toBe("");
  });
});

describe("haml-slice: Haml 5.2.2 engine semantics (the compiler's contract)", () => {
  // The engine's default options, measured: format html5, attr_wrapper "'",
  // escape_html FALSE, escape_attrs TRUE. The `=` line therefore does NOT
  // escape - that is a load-bearing fact, not a shortcut.
  // `card_name` is a method on the Ruby probe's binding (the value the
  // `= card_name` oracle case renders), so the scope carries it as a helper.
  const scope = (locals: Record<string, unknown> = {}): HamlScope => ({
    locals,
    helpers: { card_name: () => "Mod" },
  });

  /** Construct cases the slice does NOT implement, and why. Kept here as a
   *  named list so the gate can shrink only by an explicit edit, never by a
   *  silent skip. Each is cross-checked against the compiler refusing it. */
  const DECLARED_UNPORTED: Record<string, RegExp> = {
    // Needs a Markdown renderer. Measured: zero of the 78 .haml templates in
    // the installed deck bundle use :markdown (tools/haml-slice/
    // haml-feature-inventory.mjs).
    filter_markdown: /markdown/i,
    // Ruby's OWN parser rejects the continuation line; reproducing Ruby's
    // SyntaxError text is out of the slice's scope.
    silent_multiline_if: /unsupported|unexpected/i,
    // `==` renders a plain Ruby String through Haml's html_safe path and
    // emits it inspect-quoted. 0 of the 78 .haml templates in the installed
    // deck bundle use `==` (tools/haml-slice/haml-feature-inventory.mjs), so
    // the slice does not model that path.
    output_unescape: /==/,
  };

  const allKeys = Object.keys(SEMANTICS.cases);
  // The three `group_list*` semantics cases need the `groups` local and the
  // `list_group` helper, so they are swept by the 53-case byte comparison
  // above against the live Decko capture instead of here. Named, not
  // silently dropped.
  const GROUP_LIST_CASES = ["group_list", "group_list_empty", "group_list_no_trailing_nl"];
  const portedKeys = allKeys.filter((k) => !(k in DECLARED_UNPORTED) && !GROUP_LIST_CASES.includes(k));

  it("covers 96 of the 102 measured Haml cases; the 6 not swept here are named", () => {
    expect(allKeys.length).toBe(102);
    expect(portedKeys.length).toBe(96);
    expect([...Object.keys(DECLARED_UNPORTED), ...GROUP_LIST_CASES].sort()).toEqual([
      "filter_markdown",
      "group_list",
      "group_list_empty",
      "group_list_no_trailing_nl",
      "output_unescape",
      "silent_multiline_if",
    ]);
  });

  it.each(portedKeys)("case %s", (key) => {
    const { src, bytes } = SEMANTICS.cases[key]!;
    if (bytes.startsWith("ERR ")) {
      // The real engine refuses this construct. The compiler must refuse it
      // too, with the same class and message.
      let thrown: Error | undefined;
      try {
        compileHaml(src, scope());
      } catch (err) {
        thrown = err as Error;
      }
      expect(thrown, `expected ${key} to be rejected`).toBeDefined();
      expect(`${thrown!.name}: ${thrown!.message}`).toBe(bytes.slice(4));
      return;
    }
    expect(compileHaml(src, scope())).toBe(bytes);
  });

  it.each(Object.keys(DECLARED_UNPORTED))("declares %s unported and says so", (key) => {
    const { src } = SEMANTICS.cases[key]!;
    // A coverage gap must be reported as a COVERAGE gap, never as a Haml
    // bug: the compiler raises HamlUnsupportedError, the distinct class the
    // receipt is able to name.
    expect(() => compileHaml(src, scope())).toThrow(HamlUnsupportedError);
    expect(() => compileHaml(src, scope())).toThrow(DECLARED_UNPORTED[key]!);
  });
});

describe("haml-slice: feature inventory", () => {
  it("reports the constructs the compiler actually implements", () => {
    expect(collectHamlFeatures()).toEqual(
      expect.arrayContaining([
        "doctype",
        "tag",
        "attributes",
        "text",
        "output",
        "silent-script",
        "silent-comment",
        "interpolation",
        "html-escaped",
        "unescaped-html",
        "not-tag",
        "filter",
      ]),
    );
  });

  it("rejects a construct it does not implement rather than guessing", () => {
    // A lambda literal is outside the expression subset. The compiler must
    // name that as a COVERAGE gap, not silently render something.
    expect(() => compileHaml("%p{x: ->(a) { a }}\n", { locals: {}, helpers: {} })).toThrow(
      HamlUnsupportedError,
    );
  });

  it("keeps the two error classes distinct: Haml's bug vs our gap", () => {
    const illegal = () => compileHaml(".\n  .b\n", { locals: {}, helpers: {} });
    expect(illegal).toThrow(HamlCompileError);
    expect(illegal).not.toThrow(HamlUnsupportedError);
    expect(illegal).toThrow("Illegal element: classes and ids must have values.");
  });
});
