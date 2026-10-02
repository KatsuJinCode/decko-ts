// Pin the haml-slice oracle captures into fixtures/captured/haml-slice/.
//
// Inputs (both written by the Ruby probes in tools/haml-slice/, run against
// the live Rails oracle at tools/oracle/decko-oracle-app):
//   tmp/haml-slice/group-list-oracle.json  - group_list.haml rendered through
//       the deck's OWN Card::Format#haml_to_html
//   tmp/haml-slice/haml-semantics.json     - 59 Haml 5.2.2 engine cases
//
// Output: fixtures/captured/haml-slice/{assets-core-group-list.json,
// haml-5.2.2-semantics.json} - pretty-printed, deeply sorted keys.
//
// Usage: node tools/haml-slice/pin-haml-slice-oracle-fixtures.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(root, "tmp", "haml-slice");
const OUT = join(root, "fixtures", "captured", "haml-slice");
mkdirSync(OUT, { recursive: true });

/** Deterministic serializer: object keys sorted at every depth. */
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortDeep(value[k])]),
    );
  }
  return value;
}

const gl = JSON.parse(readFileSync(join(SRC, "group-list-oracle.json"), "utf8"));
const sem = JSON.parse(readFileSync(join(SRC, "haml-semantics.json"), "utf8"));

const assetsCore = {
  // --- provenance, quoted so the fixture is self-describing ---------------
  _provenance: {
    captured_by:
      "tools/haml-slice/oracle-capture-group-list-haml-bytes.rb " +
      "(bundle exec ruby, from tools/oracle/decko-oracle-app)",
    haml_version: gl.haml_version,
    card_version: gl.card_version,
    renderer: gl.renderer,
    renderer_source: gl.haml_to_html_owner,
    list_group_source: gl.list_group_owner,
    view_source:
      "card-mod-assets-0.20.0/set/abstract/mod_assets.rb:171-182 (view :core " +
      "-> haml :group_list, groups: groups)",
    template_source: "card-mod-assets-0.20.0/set/abstract/mod_assets/group_list.haml",
    cards_reaching_view: gl.assets_core_cards,
    no_write_proof: {
      card_act_count_before: gl.actions_before,
      card_act_count_after: gl.actions_after,
    },
    haml_default_options: gl.haml_default_options,
  },
  group_list_source: gl.group_list_source,
  // --- the byte truth: input locals -> exact rendered bytes ---------------
  cases: Object.fromEntries(
    [...Object.keys(gl.bytes)]
      .sort()
      .map((key) => {
        const input = gl.harvested_inputs.find((h) => h.key === key);
        return [key, { locals: input ? input.groups : glEdgeLocals(key), bytes: gl.bytes[key] }];
      }),
  ),
};

/** The EDGE case locals, reconstructed from the capture's own key names.
 *  (The capture wrote bytes for these but only recorded `locals` for the
 *  harvested ones; these are the exact values the probe passed.) */
function glEdgeLocals(key) {
  const E = {
    "edge-empty": [],
    "edge-one": [["group: local", ["a.png"]]],
    "edge-two": [["group: local", ["x.css", "y.js"]]],
    "edge-escaped": [["group: local", ["<b>&amp;</b>"]]],
    "edge-html": [["group: local", ["<i>hi</i>"]]],
    "edge-quote": [["group: local", ['say "hi"']]],
    "edge-apos": [["group: local", ["it's"]]],
    "edge-amp": [["group: local", ["a&b"]]],
    "edge-tag": [["group: local", ["<script>alert(1)</script>"]]],
    "edge-empty_title": [["", ["a"]]],
    "edge-amp_title": [["a & b <c>", ["d & e"]]],
    "edge-two_groups": [
      ["group: remote", []],
      ["local", ["x.css"]],
    ],
    "edge-three": [
      ["a", ["b"]],
      ["c", ["d"]],
      ["e", []],
    ],
  };
  return E[key];
}

const semantics = {
  _provenance: {
    captured_by:
      "tools/haml-slice/oracle-probe-haml-engine-semantics.rb " +
      "(bundle exec ruby, from tools/oracle/decko-oracle-app)",
    haml_version: sem.haml_version,
    note:
      "decko calls Haml::Engine.new(haml).render(binding, locals) with NO " +
      "options hash (card-1.110.0/lib/card/set/format/haml_paths.rb:8-14), " +
      "so these DEFAULT options are what the deck actually gets.",
    default_options: sem.default_options_summary,
  },
  cases: sem.cases,
};

writeFileSync(
  join(OUT, "assets-core-group-list.json"),
  JSON.stringify(sortDeep(assetsCore), null, 2) + "\n",
);
writeFileSync(
  join(OUT, "haml-5.2.2-semantics.json"),
  JSON.stringify(sortDeep(semantics), null, 2) + "\n",
);
console.log(
  `PINNED ${Object.keys(assetsCore.cases).length} group_list cases + ` +
    `${Object.keys(sem.cases).length} haml semantics cases -> ${OUT}`,
);
