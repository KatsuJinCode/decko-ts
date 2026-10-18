// The card-mod-edit edit-views suite: the 16 views ported after write-path
// slices 3/4 (the inline-editing surface, the create surface, the board-tab
// :guide_tab delegate, the structure/nests placeholders, the read-form
// formgroups and the overlay guide), rendered through the real RenderEngine
// and byte-compared against the recorded fixtures
// (board-views.json / edit-views.json, produced by
// oracle-capture-edit-views.rb (not in the public package) for the SAME two
// targets ("Oracle Basics" id 605, "Home" id 521) and three fixture actor
// keys ("bot" = signed-in admin, "tova" = signed-in member, "anonymous")
// as the
// edit-forms / edit-name-type records, plus the unsaved new-card surface
// (Card.new type_id: RichTextID, blank name - render only) recorded under
// new_card).
//
// Fixture normalizations (applied to BOTH sides - identical masks):
// - data-slot-id -> RANDOMIZED (SecureRandom.hex(10), wrap.rb:45);
// - data-card-id -> RANDOMIZED (seed state);
// - data-select2-id -> SELECT2 (the "<unique_id>-<epoch>" live-type marker);
// - the conflict-tracker hidden value -> ACTION_ID (seed state).
//
// Disclosed remainders (recorded arms in the fixture, NOT pinned
// here - each needs machinery this port does not claim):
// - :edit_structure - Ruby itself RAISES on a structure-less card
//   ("undefined method `gsub' for nil" - editing.rb:54-65 `return unless
//   card.structure` answers nil and the render pipeline chokes on it; the
//   fixture records the NoMethodError arm). The port returns "" (the view
//   is unreachable without structure in practice); the structure branch
//   (nest card.structure_rule_card, view: :edit) is the remainder.
// - Home's :edit_nests - no longer a remainder. The nested editors render
//   (multi_card_edit's machinery with sub-form prefixes, plus the view
//   config's "hide") and the arm is pinned BYTE FOR BYTE against the
//   capture. Two differences that were open here are closed, both real
//   differences from Ruby rather than runtime artefacts: the nested card
//   is HTML-typed, so Ruby's editor.rb:5-11 resolves input_type through
//   the TYPE's method (mod/format set/type/html.rb:20-22, :ace_editor)
//   and edits it with ace_editor.rb:9-13 rather than the rich_text
//   fall-through's tinymce textarea; and form.rb:27-31's conflict tracker
//   carries card.last_action_id, which the closure prefetch projection
//   was composing as null.
// - Home's :read_form - the nest-bearing arm renders the nested
//   read_formgroups (multi_card_edit's machinery with sub-form prefixes) -
//   rails-runtime, remainder.
// - Home's :edit_row / :read_formgroup - their :core/:content renders
//   process Home's nests (the full welcome page) - the engine's nest
//   machinery, exercised by other suites; pinned on "Oracle Basics" only.
// - The new-card surface (name-prompt arm) - the engine cannot render an
//   unnamed card; the arms are recorded under new_card for the suite
//   that ports the unnamed-card render path.
//
// Rule-card update stand-in (disclosure): guide.rb:27-32 prepends the
// guide rule card's edit link only when guide_card.ok?(:update). The
// member arm records NO link: the deck denies a plain member update
// on the rule card "*all+*guide" even though *all+*update grants "Anyone
// Signed In" (Ruby's rule-card protection lives
// outside the candidate walk). The engine's verdict walk does not model
// that protection, so the harness seeds the SELF-scoped rule
// "*all+*guide+*update" -> [[Administrator]]: the walk then answers false
// for the member/anonymous and true for the admin stand-in
// (Auth.always_ok?) - the same admin/member split the fixtures record,
// through the engine's real verdict algebra.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectViewWithoutMod } from "../../support/native-views.js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";
import {
  createRenderTestStorage,
  seedAction,
  seedAct,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { DeckoName } from "../../../src/card/name.js";
import { loadLocaleFile } from "../../../src/card/i18n/i18n.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModHelp from "../../../src/card/mod-loader/mods/card-mod-help.js";
import cardModMarkdown from "../../../src/card/mod-loader/mods/card-mod-markdown.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModComment from "../../../src/card/mod-loader/mods/card-mod-comment.js";
import cardModAceEditor from "../../../src/card/mod-loader/mods/card-mod-ace_editor.js";

/** The recorded fixtures this suite reads at module scope.
 *
 *  They live under the captured-fixtures directory the constants below point
 *  at, which is on the public candidate's
 *  exclusion list, so on a clean clone they are ABSENT. Reading one unguarded
 *  threw ENOENT during import — before any describe existed to skip — and the
 *  run reported a failed suite with `no tests`, which reads as an engine
 *  defect and is not one. The gate below turns that into a loud skip: the
 *  suite announces what it needed and guards nothing, instead of crying wolf.
 *  See docs/TESTING.md. */
const CAPTURED_DIR = new URL("../../../fixtures/captured/", import.meta.url);
const BOARD_FIXTURE_PATH = fileURLToPath(new URL("board-views.json", CAPTURED_DIR));
const EDIT_FIXTURE_PATH = fileURLToPath(new URL("edit-views.json", CAPTURED_DIR));
const CAPTURES_PRESENT = existsSync(BOARD_FIXTURE_PATH) && existsSync(EDIT_FIXTURE_PATH);

/** The board-family fixture: the 8
 *  board-suite views per actor per target + the visibility probes +
 *  no_write_proof. Absent on a clean clone; the suite skips, see CAPTURES_PRESENT. */
const BOARD_FIXTURE = CAPTURES_PRESENT ? JSON.parse(readFileSync(BOARD_FIXTURE_PATH, "utf8")) : undefined;

type BoardFixture = {
  targets: Record<
    string,
    {
      id: number;
      name: string;
      type: string;
      views: Record<string, Record<string, string>>;
      visibility: Record<string, Record<string, unknown>>;
    }
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** Both fixtures are `undefined` when the captures are absent. The types below
 *  are asserted non-optional because the describe that reads them is gated on
 *  CAPTURES_PRESENT and never runs when they are missing — so the assertion is
 *  never exercised, and the gate is what makes that true rather than luck. */
const FIXTURE_RAW = CAPTURES_PRESENT ? JSON.parse(readFileSync(EDIT_FIXTURE_PATH, "utf8")) : undefined;

const FIXTURE = FIXTURE_RAW as {
  targets: Record<
    string,
    {
      id: number;
      name: string;
      type: string;
      views: Record<string, Record<string, string>>;
    }
  >;
  new_card: { views: Record<string, Record<string, string>> };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The capture's normalizations (see the module doc). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"')
    .replace(/data-select2-id=(["'])([^"']*)-\d+\1/g, 'data-select2-id="SELECT2"')
    .replace(
      /(<input class="current_revision_id form-control" autocomplete="off" type="hidden" value=")[^"]*(")/,
      "$1ACTION_ID$2",
    )
    .replace(/id="tab-\d+-/g, 'id="tab-UNIQUE-');
}

/** The 16 captured views. */
const ALL_VIEWS = [
  "edit_inline",
  "edit_inline_buttons",
  "edit_row",
  "edit_in_form",
  "new_in_modal_buttons",
  "new_type_formgroup",
  "overlay_guide",
  "read_form",
  "read_formgroup",
  "guide_tab",
  "edit_nests",
  "edit_structure",
  "new",
  "new_in_modal",
  "new_fields",
  "simple_new",
  "board",
  "cardboard",
  "rules_tab",
  "related_tab",
  "history_tab",
] as const;

/** The board-suite views pinned byte-exact (board/cardboard/rules_tab/
 *  related_tab/history_tab + follow_section, edit_rules - the stage-3/4
 *  seams - and engage_tab, unpinned by the board-stage3 suite per the
 *  engage-final recipe: this integrated tree carries the layout-ws
 *  +discussion machinery and the harness loads cardModComment with
 *  pageSession set, so the discussion arm composes). */
const BOARD_PINNED_VIEWS = [
  "board",
  "cardboard",
  "rules_tab",
  "related_tab",
  "history_tab",
  "follow_section",
  "edit_rules",
  "engage_tab",
] as const;

/** Views pinned byte-exact for BOTH targets (the rest pin on "Oracle
 *  Basics" only - see the module doc's remainder list). */
const BOTH_TARGET_VIEWS = [
  "edit_inline",
  "edit_inline_buttons",
  "edit_in_form",
  "new",
  "new_in_modal",
  "new_fields",
  "new_in_modal_buttons",
  "new_type_formgroup",
  "simple_new",
  "guide_tab",
  "overlay_guide",
] as const;

/** Views the perms gate denies anonymous (update/create directives). */
const ANON_DENIED_VIEWS = [
  "edit_inline",
  "edit_in_form",
  "new",
  "new_in_modal",
  "new_fields",
  "simple_new",
] as const;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;
let memberEngine: RenderEngine | undefined;
let anonymousEngine: RenderEngine | undefined;

beforeAll(async () => {
  // the actionview en locale (the distance_in_words :one forms the
  // creator_credit/act pills read - "about 1 year", not the fallback's
  // "about 1 years"); the vendored byte-copy of
  // actionview-7.2.3.2/lib/action_view/locale/en.yml under fixtures/vendor/
  // stands in for the gem file so the suite runs on any machine
  await loadLocaleFile(
    "en",
    fileURLToPath(
      new URL(
        "../../../fixtures/vendor/actionview-7.2.3.2-locale-en.yml",
        import.meta.url,
      ),
    ),
  );
  storage = await createRenderTestStorage();
  const s = storage;

  // ---- the shared edit-surface world (mirrors card-mod-edit-forms.test.ts)
  // The bot card's name matches the recorded fixtures ("Decko Bot" - the
  // creator_credit/act-pill bytes carry that name; the alternate
  // the signed-in account spelling is the edit-forms harness's).
  await seedCard(s, { id: 2, name: "RichText", typeId: 9 });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 30, leftId: 10, rightId: 12, dbContent: "[[Editor]]" });
  await seedReference(s, 30, 7, "editor");
  // The nested card Home's content points at ({{:getting_started|core}}).
  // The capture records it as the STARRED "*getting started", HTML-typed
  // (data-card-type-id 39 / HTML, and the slot carries STAR) - the deck's
  // own row, whose codename is what the ":getting_started" mark resolves.
  // Seeding the unstarred RichText "Getting started" instead makes every
  // nested surface render a different card identity (data-card-name, the
  // link name, the safe_key the slot id is built from, and the type's
  // card-editor), which is how the :edit_nests arm came to differ.
  await seedCard(s, {
    id: 40,
    name: "*getting started",
    codename: "getting_started",
    typeId: 39, // HTML in this deck
    typeName: "HTML",
    // The conflict tracker's value is the card's last action id
    // (form.rb:27-31 reads card.last_action_id, the row's
    // current_revision_id). The oracle's nested editor carries one; a card
    // without it emits a valueless hidden field instead. normalize() masks
    // the value to ACTION_ID, so only its PRESENCE is pinned.
    currentRevisionId: 41,
    // The deck's own welcome content, read back off the capture's
    // textarea (HTML-escaped there, decoded here). It carries one nest of
    // its own ({{+:shark|core}}), which the editor textarea renders as
    // AUTHORED TEXT - the editor shows the source, not the expansion -
    // so this byte-for-byte is the source the deck holds, and seeding it
    // is what makes the :edit_nests arm comparable with the capture
    // instead of merely "an editor is present".
    dbContent:
      '<div class="container text-center">\n' +
      '  <div class="d-flex justify-content-center align-items-center p-3 my-3 rounded box-shadow">\n' +
      "    {{+:shark|core}}\n" +
      "    <h1>Welcome, Card Shark!</h1>\n" +
      "  </div>\n" +
      '  <div class="jumbotron">\n' +
      "    <h3>Things to sink your teeth into:</h3>\n" +
      '    <div class="d-flex justify-content-center">\n' +
      '      <div class="m-4">\n' +
      '        <p class="lead">Structure</p>\n' +
      '        <p><a href="new/cardtype" class="btn btn-primary">Add new Cardtype</a></p>\n' +
      "      </div>\n" +
      '      <div class="m-4">\n' +
      '        <p class="lead">Style</p>\n' +
      "        <p>\n" +
      '          <a href=":all+:style" class= "btn btn-primary">Configure Skin Card</a>\n' +
      "        </p>\n" +
      "      </div>\n" +
      "    </div>\n" +
      "  </div>\n" +
      '  <p class="lead"><a href="Administrator">and more...</a></p>\n' +
      "</div>",
  });
  await seedCard(s, {
    id: 605,
    name: "Oracle Basics",
    typeId: 2,
    typeName: "RichText",
    dbContent: "A plain basic card for oracle capture.",
    currentRevisionId: 693,
  });
  await seedCard(s, {
    id: 521,
    name: "Home",
    typeId: 2,
    typeName: "RichText",
    dbContent:
      '<div>{{:getting_started|core}}</div>\n<div>{{## Feel free to get rid of this and start fresh! }}</div>\n',
    currentRevisionId: 604,
  });
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  // the create-rule surface (the admin sees 28 createable cardtypes, the
  // member 20). The bot codename is the STORED spelling the permission machinery
  // matches (read-rules.ts DECKOBOT_CODENAME "decko_bot" - codename.rb:
  // 107-110 derives Card::DeckoBotID from the stored codename; seeding the
  // alternate "deckobot" spelling silently loses the always_ok
  // short-circuit).
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 15, name: "*create", codename: "create", typeId: 14 });
  await seedCard(s, { id: 16, name: "*anyone", codename: "anyone", typeId: 14 });
  await seedCard(s, {
    id: 17,
    name: "*anyone signed in",
    codename: "anyone_signed_in",
    typeId: 14,
  });
  await seedCard(s, { id: 25, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 50, name: "Shark" });
  const TYPE_CARDS = [
    "PlainText", "Markdown", "Phrase", "HTML", "Number", "Toggle", "Date",
    "URI", "File", "Image", "List", "Pointer", "Search", "Link list",
    "Nest list", "Notification template", "Email template", "User", "Role",
    "Layout", "Skin", "CSS", "SCSS", "JSON", "JavaScript", "CoffeeScript",
  ] as const;
  const typeIdByName = new Map<string, number>(
    // HTML sits at the deck's own id (39), not in the 51+ block: the
    // captured nested "*getting started" card names type_id 39, so the
    // nested slot can only resolve its type's NAME - and therefore emit
    // the TYPE-html token and data-card-type-name - when the HTML
    // cardtype row is at 39. Seeding HTML at 51+3 as well would violate
    // the cards.key uniqueness (both rows key to "html"), so the mapping
    // carries the override and the loop seeds each name once.
    TYPE_CARDS.map((name, i) => [name, name === "HTML" ? 39 : 51 + i]),
  );
  // Each cardtype's CODENAME, read off Ruby's own deck declarations
  // (mod/*/data/real.yml: `- :name: HTML / :type: :cardtype /
  // :codename: html`). The codename is not the name: PlainText is
  // plain_text, Search is search_type, Layout is layout_type,
  // JavaScript is java_script.
  //
  // It has to be seeded because the editor choice reads it. editor.rb:5-11
  // resolves `input_type` through the TYPE's method
  // (mod/format set/type/html.rb:20-22 `def input_type; :ace_editor;
  // end`), and the port reads the same thing through the card's typeCode
  // (render.ts:5169 populateTypeCodes -> codenames.peekNameForId), which is
  // the type's NAME FOR THE CODENAMED ROW - the same string the codename
  // column yields. A cardtype seeded without its codename has no typeCode,
  // the TYPE override never applies, and the nested HTML card falls through
  // to default_input_type's rich_text (editor.rb:38-44) and renders the
  // tinymce textarea where Ruby renders ace-editor-textarea.
  const CARDTYPE_CODENAME: Readonly<Record<string, string>> = {
    PlainText: "plain_text",
    Markdown: "markdown",
    Phrase: "phrase",
    HTML: "html",
    Number: "number",
    Toggle: "toggle",
    Date: "date",
    URI: "uri",
    File: "file",
    Image: "image",
    List: "list",
    Pointer: "pointer",
    Search: "search_type",
    "Link list": "link_list",
    "Nest list": "nest_list",
    "Notification template": "notification_template",
    "Email template": "email_template",
    // card-1.110.0/mod/core/data/real.yml seeds User with codename user;
    // the preference cache uses UserID and excludes untyped impostors.
    User: "user",
    Role: "role",
    Layout: "layout_type",
    Skin: "skin",
    CSS: "css",
    SCSS: "scss",
    JSON: "json",
    JavaScript: "java_script",
    CoffeeScript: "coffee_script",
  };
  for (const name of TYPE_CARDS) {
    const codename = CARDTYPE_CODENAME[name];
    await seedCard(s, {
      id: typeIdByName.get(name)!,
      name,
      typeId: 9,
      ...(codename === undefined ? {} : { codename }),
    });
  }
  await seedCard(s, {
    id: 80,
    leftId: 10,
    rightId: 15,
    dbContent: "Anyone Signed In",
  });
  await seedReference(s, 80, 17, "anyone_signed_in");
  await seedReference(s, 30, 17, "anyone_signed_in");
  const SHARK_TYPES = [
    "HTML", "Cardtype", "JavaScript", "CoffeeScript", "CSS", "SCSS",
    "Skin", "Layout",
  ] as const;
  for (const [i, typeName] of SHARK_TYPES.entries()) {
    const typeCardId = typeName === "Cardtype" ? 9 : typeIdByName.get(typeName)!;
    const setCardId = 200 + i;
    await seedCard(s, {
      id: setCardId,
      leftId: typeCardId,
      rightId: 8,
      typeId: 13,
    });
    await seedCard(s, {
      id: 210 + i,
      leftId: setCardId,
      rightId: 15,
      dbContent: "Shark",
    });
    await seedReference(s, 210 + i, 50, "shark");
  }

  // ---- the board-suite seeds -----------------------------------------------
  // the *all+*default rule a real deck carries (left_id *all + right_id
  // *default, RichText-typed - Card.new("Oracle
  // Basics+discussion").type_id == 2 through new_card_template's
  // rule_card(:default) first-candidate walk). The engage_tab discussion
  // nest renders the UNKNOWN +discussion child through that default:
  // without the rule row newCardDefaultType degrades to untyped and the
  // slot loses TYPE-rich_text + data-card-type-*.
  await seedCard(s, { id: 130, name: "*default", codename: "default", typeId: 14 });
  await seedCard(s, { id: 131, leftId: 10, rightId: 130, typeId: 2 });
  // created_at = 10 days ago (the recorded creator_credit phrase
  // "10 days ago" - time_ago_in_words buckets a 10-day distance stably for
  // the whole test day). The seed default is overridden per card.
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  await s.counting.query(`UPDATE cards SET created_at = ? WHERE id = 605`, [
    tenDaysAgo,
  ]);
  // Home is ~1 year old (the recorded creator_credit
  // phrase "about 1 year"); 370 days rounds to the 1-year bucket stably
  await s.counting.query(`UPDATE cards SET created_at = ? WHERE id = 521`, [
    new Date(Date.now() - 370 * 24 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19),
  ]);
  // the acts the history_tab pills read (ids exactly as the fixtures
  // record them):
  // Oracle Basics 105329 create (10 days ago) + 109527/109528 updates
  // (1 day ago); Home 105328 create (10 days ago)
  await seedAct(s, { id: 105329, cardId: 605, actorId: 1, actedAt: tenDaysAgo });
  // Home's act is ~1 year old (the recorded pill
  // phrase "about 1 year ago")
  const yearAgo = new Date(Date.now() - 370 * 24 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  await seedAct(s, { id: 105328, cardId: 521, actorId: 1, actedAt: yearAgo });
  await seedAct(s, { id: 109527, cardId: 605, actorId: 1, actedAt: oneDayAgo });
  await seedAct(s, { id: 109528, cardId: 605, actorId: 1, actedAt: oneDayAgo });
  await seedAction(s, { id: 9101, cardId: 605, actId: 105329, actionType: 0 });
  await seedAction(s, { id: 9102, cardId: 521, actId: 105328, actionType: 0 });
  await seedAction(s, { id: 9103, cardId: 605, actId: 109527, actionType: 1 });
  await seedAction(s, { id: 9104, cardId: 605, actId: 109528, actionType: 1 });
  // the related-mark codename cards the pills link (known-card class) +
  // the type-by-name search card (the absolute mark)
  const RELATED_CARDS = [
    "children", "links to", "linked to by", "nests", "nested by",
    "refers to", "referred to by",
  ] as const;
  for (const [i, name] of RELATED_CARDS.entries()) {
    await seedCard(s, { id: 140 + i, name: `*${name}`, codename: name.replace(/ /g, "_") });
  }
  // (*right is already seeded by the rule-card stand-in block below)
  await seedCard(s, { id: 147, name: "*by_name", codename: "by_name" });
  await seedCard(s, { id: 148, leftId: 2, rightId: 147, name: "RichText+*type+by_name" });

  // ---- the follow world (the recorded follow_section arms): the member
  // follows EVERY card via her *all set preference (followed? true for both
  // targets, "following" verb); the admin follows nothing ("follow" verb);
  // 1 follower each. The per-card advanced rule cards are ABSENT
  // (wanted-card). The +*followers junctions EXIST (known-card).
  await seedCard(s, { id: 583, name: "Tova", typeId: typeIdByName.get("User")! });
  await seedCard(s, { id: 150, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 151, name: "*followers", codename: "followers" });
  // The preference's option must resolve to the real follow option card.
  await seedCard(s, { id: 154, name: "*always", codename: "always" });
  await seedCard(s, { id: 160, leftId: 10, rightId: 583, name: "*all+Tova" });
  await seedCard(s, { id: 161, leftId: 160, rightId: 150, dbContent: "[[*always]]" });
  // the +*followers junctions the followers pills link (known-card)
  await seedCard(s, { id: 162, leftId: 583, rightId: 150, name: "Tova+*follow" });
  await seedCard(s, { id: 152, leftId: 605, rightId: 151, name: "Oracle Basics+*followers" });
  await seedCard(s, { id: 153, leftId: 521, rightId: 151, name: "Home+*followers" });

  // the self-set junctions the edit_rules known branch reads (in a real
  // deck Home+*self EXISTS - the known branch; Oracle Basics+*self does
  // NOT - the fetched-new branch). *self is id 11 in this deck (id 8 is
  // *type - the seed gap that once looked like a fetch defect).
  await seedCard(s, {
    id: 157,
    leftId: 521,
    rightId: 11,
    typeId: 13, // Set-typed (the enriched set keys carry TYPE-set)
    name: "Home+*self",
  });

  // ---- the *recent settings list (setting_categories.rb:64-67) -----------
  // recent_settings is DECK DATA: `Card[:recent_settings].item_cards.map
  // (&:codename)`. The rule-list pills' `_category-recent` flag rides this
  // list's membership, so the captured oracle bytes are only reproducible
  // against a deck whose list holds the same items. These are exactly the
  // ten settings whose pills carry `_category-recent` in the capture
  // (structure, create, read, update, captcha, layout, script, help, input
  // type, follow); the other visible settings - default, autoname, delete,
  // head, style, guide, the on_* events, thanks, follow fields - are NOT
  // members, which is what the capture's pills without the flag show.
  await seedCard(s, {
    id: 125,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: 62, // List
    dbContent:
      "*structure\n*create\n*read\n*update\n*captcha\n*layout\n*script\n" +
      "*help\n*input type\n*follow\n",
  });

  // ---- the guide surface (guide.rb + the *all+*guide rule card) ----------
  // *guide setting card (the [[*guide]] link target in the guide text and
  // the rule junction's right side; codename registry reads cards.codename)
  await seedCard(s, { id: 15 + 100, name: "*guide", codename: "guide", typeId: 14 });
  // the *all+*guide rule card - Markdown-typed, its raw content the deck's
  // own default guide text (the recorded guide bytes are its markdown core)
  await seedCard(s, {
    id: 120,
    leftId: 10,
    rightId: 115,
    typeId: 52, // Markdown (the TYPE_CARDS seeding above)
    typeName: "Markdown",
    dbContent:
      "#### Editing Guide\n\n" +
      "This default guide will appear in the full editor view of any card \n" +
      "without more specific guidance.  You can use it to put forward principles of style, \n" +
      "rules of conduct, or any other help text you think may be of use to persons editing \n" +
      "content.\n\n" +
      "Guide content can be edited in [[*guide|*guide rules]].\n",
  });
  // the rule-card update stand-in (see the module doc's disclosure): the
  // Right-pattern set card "*guide+*right" (Set-typed - the who_can join
  // reads sets.type_id) + its *update rule -> [[Administrator]]
  // reproduces the recorded admin/member split through the engine's verdict
  // walk (the Right pattern is in the update candidates for the junction
  // "*all+*guide")
  await seedCard(s, { id: 118, name: "*right", codename: "right", typeId: 14 });
  // Administrator is Role-typed, as Ruby's seed makes it
  // (card-mod-account-0.20.0 data/real.yml:35-45; src/card/auth/boot-seed.ts
  // ACCOUNT_MOD_SEED_CARDS); Role is the cardtype the table above seeds with
  // its codename.
  await seedCard(s, {
    id: 121,
    name: "Administrator",
    codename: "administrator",
    typeId: typeIdByName.get("Role")!,
  });
  await seedCard(s, {
    id: 123,
    leftId: 115,
    rightId: 118,
    typeId: 13, // Set
  });
  await seedCard(s, {
    id: 124,
    leftId: 123,
    rightId: 12,
    dbContent: "[[Administrator]]",
  });
  await seedReference(s, 124, 121, "administrator");
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describeOrSkipLoud(
  !CAPTURES_PRESENT,
  "tests/card/mod-loader/card-mod-edit-views.test.ts",
  "fixtures/captured/{board-views,edit-views}.json — captured-oracle fixtures, absent on a clean clone",
)("card-mod-edit edit views", () => {
  it("the recorded fixture is render-only: card_actions count unchanged (no-write proof)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(
      FIXTURE.no_write_proof.actions_after,
    );
  });

  it("WITHOUT the mod: the 16 views are unsupported views", async () => {
    const s = storage!;
    s.engine.viewer = { signedIn: true, actorId: 7 };
    loader = new ModLoader([
      { manifest: cardModHelp },
      { manifest: cardModMarkdown },
      { manifest: cardModHistory },
      { manifest: cardModComment },
    ]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));
    for (const view of ALL_VIEWS) {
      // read_formgroup NO LONGER raises loader-less —
      // the body lives on the flat record (views.ts readFormgroupBody,
      // UNKNOWN_VIEW_CONFIG row) because formgroup.rb is a set/all file
      // (a base-format registration in Ruby, registrar.rb:79-84) and the
      // loader-less page harness binds no loader while the EmailTemplate
      // read_form nests dispatch this view on every field slot. The seam
      // arm below pins the render.
      if (view === "read_formgroup") continue;
      await expectViewWithoutMod(s.engine.render("Oracle Basics", view), view);
    }
    // seam arm: the flat read_formgroup renders WITHOUT the
    // mod — the slot-wrapped form-group whose content slot carries the
    // card's :content (the WITH-mod arms below pin the byte shape against
    // the recorded fixtures).
    const readFormgroupHtml = await s.engine.render("Oracle Basics", "read_formgroup");
    expect(readFormgroupHtml).toContain(`read_formgroup-view`);
    expect(readFormgroupHtml).toContain(`read-formgroup-content`);
    // the board family too (this test runs BEFORE any edit-mod loader
    // loads - set/all registrations leak through the shared flat record
    // once one is loaded)
    for (const view of ["board", "cardboard", "rules_tab", "related_tab", "history_tab"] as const) {
      // The board family follows the SAME rule as the 16 views above, not
      // a blanket "must raise". :board and :cardboard are set/all
      // registrations in card-mod-edit (mod/edit/set/all/board.rb), and
      // Ruby treats a set/all view as a base-format registration visible
      // to every card whether or not a deck is bound (registrar.rb:79-84) -
      // which is why they live in the compiled-in flat record
      // (render/views.ts:7007-7010) and render loader-less. :rules_tab,
      // :related_tab and :history_tab are set-scoped, so they still raise.
      // Asserting a blanket raise here asserted something Ruby does not do;
      // this asserts what it does, per view, and names it on failure.
      await expectViewWithoutMod(s.engine.render("Oracle Basics", view), view);
    }
  });

  /** Bind + warm one fresh engine: the modLoader assignment makes the
   *  engine's SET-SCOPED view chains resolvable (installInto runs only the
   *  prepareEngine hooks; bindModLoaderToEngine's storage.engine.modLoader
   *  assignment is the storage-engine form of the same seam - without it
   *  the markdown TYPE-scoped :core behind the guide card's nest render is
   *  unreachable). The guide_tab render fetches the guide rule card into
   *  the engine's render-card map, and the task-view render (edit_inline,
   *  a viewRequiresTask view) runs the task-verdict prepare
   *  (render.ts ensureTaskVerdicts) over EVERY mapped card - so the guide
   *  card's update verdict is cached before the pinned passes (the
   *  :guide/:overlay_guide/:alert_guide arms read it through the
   *  engine's taskAllowed hook; a task-view render that runs BEFORE the
   *  guide card is fetched would leave the verdict uncomputed and the
   *  gate unverifiable). */
  async function warmEngine(engine: RenderEngine): Promise<void> {
    engine.modLoader = loader!;
    await loader!.installInto(modEngineHost(engine, storage!.fetcher));
    await engine.render("Oracle Basics", "guide_tab");
    await engine.render("Oracle Basics", "edit_inline");
  }

  it("WITH the mod: bot stand-in (always_ok) - all pinned arms match the oracle bytes", async () => {
    const s = storage!;
    loader = new ModLoader([
      { manifest: cardModEdit },
      { manifest: cardModHelp },
      { manifest: cardModMarkdown },
      { manifest: cardModHistory },
      { manifest: cardModComment },
      // The deck's one HTML-typed card (the nested "*getting started") is
      // edited through the ace editor in Ruby (ace_editor's Type::HTML
      // :editor), and the capture records its ace-editor-textarea. The
      // suite only reaches that surface through the nested editors, so
      // loading the gem is confined to that one card's bytes.
      { manifest: cardModAceEditor },
    ]);
    loader.load();
    botEngine = new RenderEngine(new FetchEngine(s.counting));
    botEngine.viewer = { signedIn: true, actorId: 1 };
    botEngine.pageSession = { signedIn: true, actorId: 1 }; // the follow seam's Auth.current
    await warmEngine(botEngine);

    const basic = FIXTURE.targets.basic_note.views.bot;
    for (const view of ALL_VIEWS) {
      if (view === "edit_structure") continue; // recorded raise - see below
      if ((BOARD_PINNED_VIEWS as readonly string[]).includes(view)) continue; // board fixture
      const html = normalize(await botEngine.render("Oracle Basics", view));
      expect(html).toBe(basic[view]);
    }
    for (const view of BOTH_TARGET_VIEWS) {
      const html = normalize(await botEngine.render("Home", view));
      expect(html).toBe(FIXTURE.targets.deck_level.views.bot[view]);
    }
    // :edit_nests is no longer the empty-body placeholder this arm used to
    // pin: the nested editors RENDER (multi_card_edit's machinery, with
    // the sub-form prefixes and the view config's "hide"). Two bytes still
    // differ from the capture, and both are the rails-runtime remainder,
    // not a regression:
    //   - the nested card is HTML-typed in the deck, so Ruby edits it with
    //     the ACE editor (ace-editor-textarea, data-ace-mode="html"); the
    //     port renders the tinymce textarea there;
    //   - the nested card's own content is a nest itself ({{+:shark|core}}
    //     plus the welcome markup), which the capture expands and this
    //     seed does not carry.
    // So this asserts the machinery that IS ported - the frame, the
    // nested card-editor and its conflict tracker - and the module doc
    // keeps the remainder on record. Re-recording the capture to the
    // port's bytes would overwrite the only nested-editing evidence.
    // :edit_nests matches the capture BYTE FOR BYTE. The two differences
    // this arm used to carry are both closed, and each was a real
    // difference from Ruby rather than a Rails artefact:
    //   - the editor choice. The nested card is HTML-typed, and Ruby's
    //     editor.rb:5-11 resolves input_type through the TYPE's method -
    //     mod/format set/type/html.rb:20-22 returns :ace_editor - so the
    //     card is edited with ace-editor-textarea (ace_editor.rb:9-13),
    //     not with the rich_text fall-through's tinymce textarea
    //     (editor.rb:38-44). The port reaches the same answer through the
    //     type's codename (render.ts populateTypeCodes -> typeCode), which
    //     is why the seed carries each cardtype's real codename.
    //   - the conflict tracker's value. form.rb:27-31 reads
    //     card.last_action_id (cards.current_revision_id); the closure
    //     prefetch projection was composing that column as null, so a
    //     prewarmed nested card's tracker rendered with no value
    //     attribute at all.
    const nestsHtml = normalize(await botEngine.render("Home", "edit_nests"));
    expect(nestsHtml).toBe(FIXTURE.targets.deck_level.views.bot.edit_nests);
    // the remaining disclosed remainder: :read_form renders "" where Ruby
    // renders the nested read_formgroups (the fixture holds the recorded
    // truth for it).
    const readFormHtml = await botEngine.render("Home", "read_form");
    expect(readFormHtml).toBe("");
  });

  it("WITH the mod: plain-member stand-in - member verdicts split the arms like the oracle", async () => {
    const s = storage!;
    memberEngine = new RenderEngine(new FetchEngine(s.counting));
    memberEngine.viewer = { signedIn: true, actorId: 583 };
    memberEngine.pageSession = { signedIn: true, actorId: 583 }; // the follow seam's Auth.current
    await warmEngine(memberEngine);

    const basic = FIXTURE.targets.basic_note.views.tova;
    for (const view of ALL_VIEWS) {
      if (view === "edit_structure") continue;
      if ((BOARD_PINNED_VIEWS as readonly string[]).includes(view)) continue; // board fixture
      const html = normalize(await memberEngine.render("Oracle Basics", view));
      expect(html).toBe(basic[view]);
    }
    for (const view of BOTH_TARGET_VIEWS) {
      const html = normalize(await memberEngine.render("Home", view));
      expect(html).toBe(FIXTURE.targets.deck_level.views.tova[view]);
    }
  });

  it("WITH the mod: anonymous - the perms views deny quietly, the rest renders the full bytes", async () => {
    const s = storage!;
    anonymousEngine = new RenderEngine(new FetchEngine(s.counting));
    await warmEngine(anonymousEngine);

    const basic = FIXTURE.targets.basic_note.views.anonymous;
    for (const view of ALL_VIEWS) {
      if (view === "edit_structure") continue;
      if ((BOARD_PINNED_VIEWS as readonly string[]).includes(view)) continue; // board fixture
      const html = normalize(await anonymousEngine.render("Oracle Basics", view));
      expect(html).toBe(basic[view]);
    }
  });

  it("the oracle recorded Ruby's own :edit_structure defect for structure-less cards", () => {
    const arm = FIXTURE.targets.basic_note.views.bot.edit_structure as unknown as {
      denied: boolean;
      error_class: string;
      message: string;
    };
    expect(arm.denied).toBe(true);
    expect(arm.error_class).toBe("NoMethodError");
    expect(arm.message).toContain("undefined method `gsub' for nil");
  });

  it("the board fixture is render-only (no-write proof)", () => {
    expect(BOARD_FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(BOARD_FIXTURE.no_write_proof.actions_before).toBe(
      BOARD_FIXTURE.no_write_proof.actions_after,
    );
  });

  it("WITH the mod: bot stand-in - the board family matches the oracle bytes (both targets)", async () => {
    const basic = BOARD_FIXTURE.targets.basic_note.views.bot;
    for (const view of BOARD_PINNED_VIEWS) {
      const html = normalize(await botEngine!.render("Oracle Basics", view));
      // The view name rides the assertion message: a byte mismatch across
      // an eight-view loop otherwise reports one undifferentiated diff and
      // the reader has to guess which surface it came from.
      expect(html, `Oracle Basics :${view}`).toBe(basic[view]);
    }
    for (const view of BOARD_PINNED_VIEWS) {
      // the Home+*self junction row is seeded, so the known branch pins
      const html = normalize(await botEngine!.render("Home", view));
      expect(html, `Home :${view}`).toBe(BOARD_FIXTURE.targets.deck_level.views.bot[view]);
    }
  });

  it("WITH the mod: plain-member stand-in - the board family matches the oracle bytes", async () => {
    const basic = BOARD_FIXTURE.targets.basic_note.views.tova;
    for (const view of BOARD_PINNED_VIEWS) {
      const html = normalize(await memberEngine!.render("Oracle Basics", view));
      expect(html, `Oracle Basics :${view} (member)`).toBe(basic[view]);
    }
  });

  it("WITH the mod: anonymous - board denies, the rest renders the full bytes", async () => {
    const basic = BOARD_FIXTURE.targets.basic_note.views.anonymous;
    // board is perms :update - the quiet denial
    const denial = await anonymousEngine!.render("Oracle Basics", "board");
    expect(denial).toBe(basic.board);
    for (const view of ["cardboard", "rules_tab", "related_tab", "history_tab"] as const) {
      const html = normalize(await anonymousEngine!.render("Oracle Basics", view));
      expect(html).toBe(basic[view]);
    }
  });

  it("the machinery remainders (both still fixture-recorded)", () => {
    // engage_tab's discussion arm (the unknown +discussion card's titled +
    // comment_box nest) and edit_rules' Home arm (the set card EXISTS in
    // the deck - the known branch needs the set card warmed in the render
    // map; Basics' set card is fetched new and pins byte-exact) stay
    // fixture-recorded - this test only asserts the recorded arms exist.
    for (const actor of ["bot", "tova", "anonymous"] as const) {
      expect(
        BOARD_FIXTURE.targets.basic_note.views[actor].engage_tab,
      ).toBeDefined();
    }
    expect(BOARD_FIXTURE.targets.deck_level.views.bot.edit_rules).toContain(
      'data-card-id="RANDOMIZED"',
    );
    expect(BOARD_FIXTURE.targets.basic_note.visibility.bot["show_guide_tab?"]).toBe(true);
    expect(BOARD_FIXTURE.targets.basic_note.visibility.anonymous["show_engage_tab?"]).toBe(false);
  });

  it("a derived default type remains selectable while a requested type stays preset", async () => {
    const fetcher = new FetchEngine(storage!.counting);
    const engine = new RenderEngine(fetcher);
    const mods = new ModLoader([{ manifest: cardModEdit }]);
    mods.load();
    engine.modLoader = mods;
    engine.viewer = { signedIn: true, actorId: 1 };
    engine.pageSession = engine.viewer;
    engine.renderAbsentCards = true;
    await mods.installInto(modEngineHost(engine, fetcher));
    const derived = await engine.render("E13 New Default", "new_fields", {
      focalRoot: true, newCard: { typeId: 2, typePreset: false },
    });
    expect(derived).toMatch(/<select\b[^>]*name=["']card\[type\]["']/);
    const explicit = await engine.render("E13 New Typed", "new_fields", {
      focalRoot: true, newCard: { typeId: 2, typePreset: true },
    });
    expect(explicit).not.toMatch(/<select\b[^>]*name=["']card\[type\]["']/);
    expect(explicit).toMatch(/name=["']card\[type_id\]["']/);
  });

  it("the recorded new-card surface carries the name-prompt arm (fixture record)", () => {
    // The engine cannot render an unnamed card; the recorded arms under
    // new_card hold the /new/:type surface (Card.new, blank name):
    // :new_fields renders the name formgroup + the name_prompt hidden.
    const fields = FIXTURE.new_card.views.bot.new_fields;
    expect(fields).toContain('name="name_prompt"');
    expect(fields).toContain('value="true"');
    expect(fields).toContain("<label");
    expect(fields).toContain("Name</label>");
    const modal = FIXTURE.new_card.views.bot.new_in_modal;
    expect(modal).toContain("modal-lg");
    // anonymous is denied the create surface
    const anon = FIXTURE.new_card.views.anonymous.new_fields;
    expect(anon).toContain("don't have permission (create)");
  });
});
