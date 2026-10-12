// Unit pins for the BLANK-KEY nest references: the blank `{{}}` and the
// backslash-escaped relative `{{\_|board_link}}` (name `\_` keys to "" —
// cardname.rb:107-118 simple_key drops `\` outside OK4KEY_RE).
//
// Ruby mechanism: a blank-key
// nest fetches a NEW card (fetch.rb#retrieve_existing skips the blank mark
// but fetch/store.rb#new_for_cache + fetch/results.rb#new_result_card still
// return a `Card.new name: ""`-shaped card for the `new:` fetch), typed by
// the *default template chain (type.rb:78-80 type_id_from_template -> the
// deck's default type via the rule 28 shape), whose read walk can leave
// Anonymous read-DENIED. Which BYTES render is decided by the VIEW's
// `unknown:` config (view/permission.rb:19-23 `alter_unknown || denial`):
//
//   - view WITHOUT `unknown: true` (the implicit nest view on a plain
//     card): alter_unknown substitutes :unknown (format/error.rb:23),
//     whose createable gate renders "" for Anonymous — the blank `{{}}`
//     renders empty on content/open.
//   - view WITH `unknown: true`: alter_unknown answers nil and the denial
//     check runs — the quiet span renders. Two shapes: a `Menu+*right+
//     *default` rule card (is_template? wraps :core in nest_mode
//     :template; modal_nest_view substitutes :template_nest,
//     template_nest.rb:2 `unknown: true`) and an explicit
//     `{{\_|board_link}}` nest (menu.rb:29
//     `view :board_link, unknown: true`).
//
// One machinery (unknown-capable view + denied new-card read verdict)
// produces all the byte shapes; an implementation that special-cases the
// blank branch between two hardcoded arms gets exactly these shapes wrong.
//
// Seed discipline: the rule universe mirrors a real deck's load-bearing
// rows (corpus ids cited from read-rule-left-climb-corpus-shapes.test.ts):
// `*all+*default` (rule 28 shape) is TYPED with the default type — a
// *default rule card carries the type it assigns, and the *default
// universe maps rule key -> the rule card's own type_id — and
// `*all+*read` (the "[[Anyone]]" catch-all) must exist: the read walk's
// hasCatchAllReadRule gate treats a catch-all-less deck as unverifiable.
// The junction rows seed their full side chains (lexicon composition
// recurses left-deep: "Probe+*right+*default" = sides
// ("Probe+*right", "*default")).

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

/** The denial span Ruby's quiet_denial renders (html/error.rb:185-189). */
const QUIET_DENIAL = '<span class="denied"><!-- Sorry, you don\'t have permission (read) --></span>';

async function seedNestRuleDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  // codename/set/party infrastructure
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 5 });
  await seedCard(storage, { id: 10, name: "Set", codename: "set", typeId: 5 });
  await seedCard(storage, { id: 11, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(storage, { id: 12, name: "Setting", codename: "setting", typeId: 5 });
  await seedCard(storage, { id: 20, name: "*all", codename: "all", typeId: 10 });
  await seedCard(storage, { id: 21, name: "*default", codename: "default", typeId: 12 });
  await seedCard(storage, { id: 22, name: "*read", codename: "read", typeId: 12 });
  await seedCard(storage, { id: 23, name: "*type", codename: "type", typeId: 12 });
  await seedCard(storage, { id: 24, name: "*right", codename: "right", typeId: 12 });
  await seedCard(storage, { id: 205, name: "BasicCs", codename: "basic_cs", typeId: 11 });
  await seedCard(storage, { id: 14, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(storage, { id: 15, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
  // the set card the type read rule hangs off: `BasicCs+*type` (type Set)
  await seedCard(storage, { id: 220, name: "BasicCs+*type", leftId: 205, rightId: 23, typeId: 10 });
  // rule 28 shape: the *default template chain — the rule card is TYPED
  // BasicCs (a *default rule card carries the type it assigns)
  await seedCard(storage, { id: 28, name: "*all+*default", leftId: 20, rightId: 21, typeId: 205, dbContent: "BasicCs" });
  // rule 22283 shape: BasicCs-typed new cards are readable by signed-in only
  await seedCard(storage, {
    id: 229,
    name: "BasicCs+*type+*read",
    leftId: 220,
    rightId: 22,
    typeId: 2,
    dbContent: "[[Anyone Signed In]]",
  });
  // rule 6568 shape: the *all read catch-all grants Anyone (deck-completeness
  // gate: without it the read walk answers "unverifiable", never denied)
  await seedCard(storage, { id: 230, name: "*all+*read", leftId: 20, rightId: 22, typeId: 2, dbContent: "[[Anyone]]" });
  // the party grants the ReadRuleCache join reads (rule -> party references)
  await seedReference(storage, 230, 14, "anyone", "L");
  await seedReference(storage, 229, 15, "anyone signed in", "L");
  // source cards. The template card's junction chain seeds its sides:
  // Probe+*right+*default = (Probe+*right, *default).
  await seedCard(storage, { id: 903, name: "Probe", typeId: 2 });
  await seedCard(storage, { id: 902, name: "Probe+*right", leftId: 903, rightId: 24, typeId: 2 });
  await seedCard(storage, { id: 905, name: "*right+*default", leftId: 24, rightId: 21, typeId: 2 });
  await seedCard(storage, { id: 901, name: "Probe+*right+*default", leftId: 902, rightId: 21, typeId: 2, dbContent: "<p>before{{}}after</p>" });
  await seedCard(storage, { id: 906, name: "board link source", typeId: 2, dbContent: "click its ellipses icon ({{\\_|board_link}})" });
  await seedCard(storage, { id: 900, name: "blank ref source", typeId: 2, dbContent: "<p>before{{}}after</p>" });
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon([2, 10, 11, 12, 14, 15, 20, 21, 22, 23, 24, 28, 205, 220, 229, 230, 903, 905, 902, 901, 906, 900]);
  return storage;
}

describe("blank-key nest references ({{}} and {{\\_|board_link}})", () => {
  it("plain card: the blank reference consumes to nothing (the 10488 live shape)", async () => {
    const storage = await seedNestRuleDeck();
    try {
      const html = await storage.engine.render("blank ref source", "content");
      // normal-mode implicit nest view: :unknown substitution wins, the
      // createable gate renders "" for Anonymous — NOT the denial span.
      expect(html).toContain("<p>beforeafter</p>");
      expect(html).not.toContain(QUIET_DENIAL);
    } finally {
      storage.close();
    }
  });

  it("template card (*default right): the blank reference renders the quiet denial span (the 636 live shape)", async () => {
    const storage = await seedNestRuleDeck();
    try {
      // a +*default rule card renders its core in nest_mode :template
      // (isTemplatedNestsCard), so the blank nest's view becomes
      // :template_nest (unknown-capable) and the denial arm runs.
      const html = await storage.engine.render("Probe+*right+*default", "content");
      expect(html).toContain(QUIET_DENIAL);
      expect(html).toContain("before");
      expect(html).not.toContain("<p>beforeafter</p>");
    } finally {
      storage.close();
    }
  });

  it("backslash-underscore nest {{\\_|board_link}} renders the quiet denial span (the 38250 live shape)", async () => {
    const storage = await seedNestRuleDeck();
    try {
      // the `\_` name keys to ""; the fetch misses; view :board_link is
      // unknown-capable (menu.rb:29) so the denial arm renders the span.
      const html = await storage.engine.render("board link source", "content");
      expect(html).toContain(QUIET_DENIAL);
      expect(html).toContain("click its ellipses icon (");
    } finally {
      storage.close();
    }
  });
});
