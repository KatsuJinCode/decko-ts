// ORACLE-PINNED byte-compares for the three mod-views-b views
// ported rendered-unpinned: search :checkbox_list, search
// :results_for_keyword, list :view_list. The oracle bytes are
// fixtures/captured/search-list-views.json, captured inside the live
// decko-0.20.0 demo app by
// tests/card/mod-loader/oracle-capture-search-list-views.rb (commit
// b1069e5): five targets x three actors, in-run no-write proof
// card_actions 4928 -> 4928 (fixture no_write_proof.unchanged).
//
// Targets (all junctions seeded with their full left/right chains, item
// cards byte-identical from the fixture's items/meta):
// - role_options_search  "*roles+*right+*content options" 275 (Search,
//   cql roles-minus-codename; 4 role items -> 11410B checkbox_list)
// - script_options_search "*script+*right+*content options" 304 (Search,
//   empty arm -> the 37B no-search-results div)
// - input_type_rule_pointer "*input type+*right+*input type" 152
//   (Pointer, 1 unresolved item "radio"; bot 9933B, sara/anon 8632B)
// - shark_members_list "Shark+*members" 193 (List, 0 items -> 2994B)
// - search_anchor_star_search "*search" 100 (results_for_keyword renders
//   "" here; on 275/304 the oracle RAISES UserError because the view is
//   set-scoped to Self::Search - the card literally named "*search" - and
//   275/304 are Search-TYPED but not that card. The TS render must also
//   raise; a rendered "" would be a finding.)
//
// Capture normalization (applied to BOTH sides): data-slot-id ->
// RANDOMIZED. Nothing else is dynamic on this surface (no creator credit,
// no select2 marker).
//
// Actor engines mirror the A pinned harness: bot = main engine
// (viewer actorId 1, the decko_bot-codename card -> always-ok — the seed
// below rides DECKOBOT_CODENAME, the deck's STORED bot codename, exactly
// as Ruby derives DeckoBotID from the stored codename via camelize,
// codename.rb:107-110; the former restated "deckobot" literal matched no
// row and actor 1 silently lost the always-ok short-circuit), sara =
// signed-in non-admin (actorId 1217, the oracle deck's Sara id,
// permissionless on this deck's rules), anonymous = default engine.
//
// A first-diff is a REAL finding: the expectation is the captured oracle
// bytes, never tuned to pass. RESULT lines are logged per
// target/view/actor either way so the receipt can quote them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import { DECKOBOT_CODENAME } from "../../../src/card/auth/actor.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/search-list-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  targets: Record<
    string,
    {
      meta: { id: number; name: string; type_id: number; type_name: string; db_content: string };
      items: Array<Record<string, unknown>>;
      views: Record<
        string,
        Record<
          string,
          { bytes?: string; raw_nil?: boolean; denied?: boolean; error_class?: string; message?: string }
        >
      >;
    }
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The capture's only normalization (see the module doc). */
function normalize(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');
}

/** First-diff diagnostics (same shape as the A pinned harness). */
function firstDiff(actual: string, expected: string): string {
  const n = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < n && actual[i] === expected[i]) i++;
  const win = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 100));
  return (
    `first diff at char ${i} (actual ${actual.length}B vs expected ${expected.length}B):\n` +
    `  actual:   ${win(actual)}\n  expected: ${win(expected)}`
  );
}

let storage: RenderTestStorage | undefined;
let saraEngine: RenderEngine | undefined;
let anonymousEngine: RenderEngine | undefined;
let loader: ModLoader | undefined;

const TARGET_NAMES: Record<string, string> = {
  role_options_search: FIXTURE.targets.role_options_search.meta.name,
  script_options_search: FIXTURE.targets.script_options_search.meta.name,
  input_type_rule_pointer: FIXTURE.targets.input_type_rule_pointer.meta.name,
  shark_members_list: FIXTURE.targets.shark_members_list.meta.name,
  search_anchor_star_search: FIXTURE.targets.search_anchor_star_search.meta.name,
};

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // type cards (Cardtype self-typed so type searches stay closed). Each
  // carries its deck codename: typeCode comes from the codename registry
  // (render.ts populateTypeCodes -> peekNameForId), and the list mod's
  // LIST_FAMILY gate matches typeCode "pointer"/"list".
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3, typeName: "Cardtype" });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 3, typeName: "Cardtype" });
  // Deck facts for the view_list actor gating (mod-b-view-fixes): the
  // RichText cardtype card (id 2, codename "basic" - probe2: RichText's
  // type_code IS :basic), the deck bot (fixture actors_note: "bot=Decko
  // Bot(admin)"; the harness viewer is actorId 1), the Anyone role party,
  // and the *read / *create / *default rule universe the permission walks
  // resolve against. The oracle bytes pin the outcomes these reproduce:
  // the unknown item "radio" renders RichText-typed (data-card-type-id="2")
  // from *all+*default (type_id 2), its FULL bar for every actor
  // (*all+*read -> [[Anyone]]), and the unknown-link only for bot
  // (*all+*create -> [[Administrator]]; Sara is a plain member - no role
  // membership rows - and anonymous carries only the Anyone party).
  await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
  await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME, typeId: 2 });
  await seedCard(s, { id: 415, name: "Anyone", codename: "anyone", typeId: 177, typeName: "Role" });
  await seedCard(s, { id: 416, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 417, name: "*create", codename: "create", typeId: 14 });
  await seedCard(s, { id: 418, name: "*default", codename: "default", typeId: 14 });
  await seedCard(s, { id: 419, name: "*all", codename: "all", typeId: 13, typeName: "Set" });
  await seedCard(s, {
    id: 420,
    name: "*all+*read",
    leftId: 419,
    rightId: 416,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedCard(s, {
    id: 421,
    name: "*all+*create",
    leftId: 419,
    rightId: 417,
    typeId: 13,
    dbContent: "[[Administrator]]",
  });
  // the new-card template rule: the RULE CARD's own type (2 = RichText) is
  // what a nest-miss child inherits (defaultRuleUniverseStatement reads
  // r.type_id) - the deck's *all+*default is RichText-typed, which is
  // exactly why the oracle's phantom "radio" carries type 2/RichText.
  await seedCard(s, {
    id: 422,
    name: "*all+*default",
    leftId: 419,
    rightId: 418,
    typeId: 2,
    dbContent: "",
  });
  // the rule-party references (who_can/read_rule_cache read card_references)
  await seedReference(s, 420, 415, "anyone");
  await seedReference(s, 421, 184, "administrator");
  await seedCard(s, { id: 56, name: "Pointer", codename: "pointer", typeId: 3, typeName: "Cardtype" });
  await seedCard(s, { id: 98, name: "Search", typeId: 3, typeName: "Cardtype", codename: "search_type" });
  await seedCard(s, { id: 177, name: "Role", codename: "role", typeId: 3, typeName: "Cardtype" });
  // the Set / Setting cardtype cards (codenames "set"/"setting"). Deck
  // facts (search-list-views.json's own captured rows carry the Set card:
  // id 5, name "Set", key "set", codename "set", type_id 3 Cardtype; the
  // Setting cardtype card is named "Setting" the same way): names are
  // DECK-ACCURATE, the ids are the harness's helper slots. The first seed
  // named card 13 "*set" - a deck-inaccurate name that leaked into the
  // TYPE_PLUS_RIGHT class key of the rule-card target (oracle bytes:
  // TYPE_PLUS_RIGHT-set-Xinput_type, not -Xset-). The Setting codename is
  // also the rule? predicate's setting-type id (computeIsRule).
  await seedCard(s, { id: 13, name: "Set", codename: "set", typeId: 3, typeName: "Cardtype" });
  await seedCard(s, { id: 14, name: "Setting", codename: "setting", typeId: 3, typeName: "Cardtype" });

  // the role items (fixture items meta verbatim: ids 184/189/191/196,
  // Role-typed, empty content, codenames drive the SELF- set classes).
  // readRuleId: every stored deck card carries its resolved *read rule id
  // (Ruby's set_read_rule store event assigns cards.read_rule_id on save);
  // the CQL permission filter rides that column
  // (implicitConditions' read_rule_id IN (readable)), so rule-less rows
  // are invisible to every non-always-ok viewer's searches.
  for (const it of FIXTURE.targets.role_options_search.items) {
    await seedCard(s, {
      id: it.id as number,
      name: it.name as string,
      codename: (it.codename as string | null) ?? undefined,
      typeId: 177,
      typeName: "Role",
      dbContent: (it.db_content as string) ?? "",
      readRuleId: 420,
    });
  }

  // the junction chains the target names hang off (helper ids above every
  // captured id; names/codenames deck-accurate; the star cards are
  // Set-typed as in the deck). NOTE the three-part junction split:
  // "A+B+C" = left "A+B" + right "C", so the two *content options rule
  // cards hang their RIGHT side off "*content options" (a Setting), not
  // off "*right".
  await seedCard(s, { id: 400, name: "*right", codename: "right", typeId: 13 });
  await seedCard(s, { id: 401, name: "*members", codename: "members", typeId: 13 });
  await seedCard(s, { id: 402, name: "*roles", codename: "roles", typeId: 13 });
  await seedCard(s, { id: 403, name: "*script", codename: "script", typeId: 13 });
  // "*input type" is a SETTING card (codename input_type; Setting-typed).
  // Deck-accuracy proof from the oracle bytes themselves: target 152's
  // captured slot class carries the bare RULE pattern class, and Ruby's
  // rule? (= standard_rule?, lib/card/rule/all.rb:33) fires only when the
  // RIGHT name part's fetched type is Setting - so in the deck "*input
  // type" is Setting-typed (the first seed typed it Set/13, which both
  // broke rule? and made the rule card's LEFT-part walk mis-type).
  await seedCard(s, { id: 404, name: "*input type", codename: "input_type", typeId: 14 });
  await seedCard(s, { id: 405, name: "*content options", typeId: 14 });
  // the rule-set junctions are SET-typed in the deck (the set-pattern walk
  // reads the left card's type for the TYPE_PLUS_RIGHT class)
  await seedCard(s, { id: 410, name: "*input type+*right", leftId: 404, rightId: 400, typeId: 13 });
  await seedCard(s, { id: 411, name: "*roles+*right", leftId: 402, rightId: 400, typeId: 13 });
  await seedCard(s, { id: 412, name: "*script+*right", leftId: 403, rightId: 400, typeId: 13 });

  // the five capture targets - ids EXACTLY as captured, db_content verbatim
  await seedCard(s, {
    id: 152,
    name: TARGET_NAMES.input_type_rule_pointer,
    leftId: 410,
    rightId: 404,
    typeId: 56,
    typeName: "Pointer",
    dbContent: FIXTURE.targets.input_type_rule_pointer.meta.db_content, // "radio"
    readRuleId: 420,
  });
  await seedCard(s, {
    id: 275,
    name: TARGET_NAMES.role_options_search,
    leftId: 411,
    rightId: 405,
    typeId: 98,
    typeName: "Search",
    dbContent: FIXTURE.targets.role_options_search.meta.db_content,
    readRuleId: 420,
  });
  await seedCard(s, {
    id: 304,
    name: TARGET_NAMES.script_options_search,
    leftId: 412,
    rightId: 405,
    typeId: 98,
    typeName: "Search",
    dbContent: FIXTURE.targets.script_options_search.meta.db_content,
    readRuleId: 420,
  });
  await seedCard(s, {
    id: 100,
    name: "*search",
    codename: "search",
    typeId: 98,
    typeName: "Search",
    dbContent: FIXTURE.targets.search_anchor_star_search.meta.db_content,
    readRuleId: 420,
  });
  // Shark (id 191, codename shark) is ALREADY seeded above - it is one of
  // the four fixture role items, and is the LEFT half of Shark+*members.
  await seedCard(s, {
    id: 193,
    name: TARGET_NAMES.shark_members_list,
    leftId: 191,
    rightId: 401,
    typeId: 4,
    typeName: "List",
    dbContent: FIXTURE.targets.shark_members_list.meta.db_content, // ""
    readRuleId: 420,
  });

  // the mod loader: list + search manifests (the three captured views are
  // mod-registered, unlike the A harness's core-registered views)
  loader = new ModLoader([{ manifest: cardModList }, { manifest: cardModSearch }]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);

  // the name-environment bridge: the CQL {"not":{"codename":[...]}} and the
  // SELF- set classes read the codename registry (edit2 mechanism)
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  // three actor engines over the same storage
  s.engine.viewer = { signedIn: true, actorId: 1 }; // bot stand-in (always-ok)
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  saraEngine = new RenderEngine(new FetchEngine(s.counting));
  saraEngine.viewer = { signedIn: true, actorId: 1217 }; // the deck's Sara
  await loader.installInto(modEngineHost(saraEngine, s.fetcher));
  anonymousEngine = new RenderEngine(new FetchEngine(s.counting));
  await loader.installInto(modEngineHost(anonymousEngine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("oracle-pinned search/list bytes (fixtures/captured/search-list-views.json)", () => {
  it("the fixture carries the in-run no-write proof", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(
      FIXTURE.no_write_proof.actions_after,
    );
  });

  for (const [label, targetName] of Object.entries(TARGET_NAMES)) {
    const target = FIXTURE.targets[label];
    for (const view of Object.keys(target.views.bot)) {
      it(`${targetName} (${label}): :${view} matches the oracle bytes (bot + sara + anonymous)`, async () => {
        const s = storage!;
        const mismatches: string[] = [];

        const arms: Array<[string, RenderEngine]> = [
          ["bot", s.engine],
          ["sara", saraEngine!],
          ["anonymous", anonymousEngine!],
        ];
        for (const [actor, engine] of arms) {
          const arm = target.views[actor][view];
          if (arm.denied) {
            // the oracle RAISED for this arm - the TS render must raise
            // with the SAME semantics: the view is not supported on this
            // card (Ruby Card::Error::UserError "view (x) not supported
            // for y"; the port's UnsupportedViewError carries the same
            // message). Any OTHER raise (or no raise) is a mismatch.
            let raised: string | undefined;
            try {
              await engine.render(targetName, view);
            } catch (e) {
              raised = `${(e as Error).name}: ${(e as Error).message}`;
            }
            if (raised === undefined) {
              mismatches.push(
                `${actor}: oracle RAISED ${arm.error_class} (${arm.message}) but the TS render RETURNED bytes`,
              );
            } else if (
              !(raised.includes("UnsupportedViewError") || /not supported/.test(raised))
            ) {
              mismatches.push(
                `${actor}: oracle RAISED ${arm.error_class} (${arm.message}) but TS raised a DIFFERENT error: ${raised.slice(0, 200)}`,
              );
            }
            continue;
          }
          let actual: string;
          let renderError: string | undefined;
          try {
            actual = normalize(await engine.render(targetName, view));
          } catch (e) {
            actual = "";
            renderError = `${(e as Error).name}: ${(e as Error).message}`;
          }
          if (renderError !== undefined) {
            mismatches.push(
              `${actor}: TS render RAISED ${renderError}; oracle bytes: ${JSON.stringify((arm.bytes ?? "").slice(0, 120))}`,
            );
            continue;
          }
          const expected = normalize(arm.bytes ?? "");
          if (actual !== expected) {
            const fd = firstDiff(actual, expected);
            mismatches.push(`${actor} vs oracle arm ${actor}: ${fd}`);
          }
        }
        expect(mismatches, mismatches.join("\n\n")).toEqual([]);
      }, 60_000);
    }
  }
});
