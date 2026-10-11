// ORACLE-PINNED byte-compares for the 22 bar/box + format views the
// mod-views-a ported rendered-unpinned. The oracle bytes are
// fixtures/captured/bar-box-format-views.json, captured inside the live
// decko-0.20.0 demo app (tools/oracle/decko-oracle-app relative to
// REPO_ROOT/decko-ts) by
// tests/card/mod-loader/oracle-capture-bar-box-format-views.rb (commit
// 191851c): three targets ("Oracle Basics" 605 RichText, the deck-level
// "Home" 521 RichText, the "Decko logo" 291 Image) x three actors (Decko
// Bot = signed-in admin, Tova = signed-in member, Anonymous), with the
// in-run no-write proof card_actions 4928 -> 4928 in the fixture
// (no_write_proof.unchanged).
//
// Capture normalizations (applied to BOTH sides - the fixture carries the
// placeholders, this test applies the same masks to its own renders):
// - data-slot-id -> RANDOMIZED (SecureRandom.hex(10) by design, wrap.rb:45);
// - the creator-credit relative age (time_ago_in_words) -> TIME_AGO
//   (wall-clock-relative by design).
// data-card-id is NOT masked: the seed below uses the captured ids
// verbatim, so the rendered ids are the captured ids.
//
// Seed provenance: every seeded card's meta (id/name/type/content/
// creator) comes from the fixture's targets.*.meta (recorded by the
// capture script) or, for the Home nest closure, from read-only probes
// 5-7 (an internal work log,6,7}-unpinned-views.rb, each asserting
// card_actions 4928 -> 4928): Home's content nests the CODENAME ref
// {{:getting_started|core}} -> *getting started (id 534, HTML), whose
// content nests {{+:shark|core}} -> *getting started+Shark (id 535, HTML,
// the raw shark SVG, zero further nest refs). The two probe-extracted
// metas are pinned in fixtures/captured/bar-box-format-views-seed.json
// and seeded verbatim from it.
//
// Actor arms: bot is rendered by the main engine (viewer actorId 1, the
// decko_bot-codename card -> always-ok — the seed below rides
// DECKOBOT_CODENAME, the deck's STORED bot codename (codename.rb:107-110
// camelize derivation), the edit2 stand-in), tova by
// a signed-in non-admin engine (actorId 1217, the oracle deck's Tova id)
// whose update permission rides the seeded *all+*update -> [[Anyone
// Signed In]] rule (the deck's member-update grant), anonymous by a
// default anonymous engine. Every TS render is compared against its own
// actor's fixture arm; the bot render is ALSO compared against the tova
// arm and the tova render against the bot arm (on this surface the two
// signed-in oracle arms are byte-identical modulo the masks - asserted
// as a fixture property in the first test).
//
// A view that first-diffs here is a REAL finding: the expectation is the
// captured oracle bytes, never tuned to pass. first-diff position and a
// context window are in the failure message, and a RESULT line is
// logged per target/view/actor either way so the receipt can quote
// them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedAct,
  seedAction,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { DECKOBOT_CODENAME } from "../../../src/card/auth/actor.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/bar-box-format-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  targets: Record<
    string,
    {
      meta: { id: number; name: string; type_name: string; db_content: string };
      views: Record<string, Record<string, { bytes: string; raw_nil?: boolean }>>;
    }
  >;
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

const SEED = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/captured/bar-box-format-views-seed.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  getting_started_codename_card: { id: number; name: string; db_content: string };
  getting_started_plus_shark: { id: number; name: string; db_content: string };
  html_type_card: { id: number; name: string };
  no_write_proof: { unchanged: boolean };
};

/** The capture's normalizations (see the module doc). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(
      /(<div class="text-muted creator-credit">Created by <a[\s\S]*?<\/a> ).*? ago(<\/div>)/,
      "$1TIME_AGO$2",
    );
}

/** First-diff diagnostics: position, both lengths, and a bounded context
 *  window from each side around the first differing char. */
function firstDiff(actual: string, expected: string): string {
  const n = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < n && actual[i] === expected[i]) i++;
  const win = (s: string) =>
    JSON.stringify(s.slice(Math.max(0, i - 60), i + 100));
  return (
    `first diff at char ${i} (actual ${actual.length}B vs expected ${expected.length}B):\n` +
    `  actual:   ${win(actual)}\n  expected: ${win(expected)}`
  );
}

let storage: RenderTestStorage | undefined;
let saraEngine: RenderEngine | undefined;
let anonymousEngine: RenderEngine | undefined;

const TARGET_NAMES: Record<string, string> = {
  basic_note: "Oracle Basics",
  deck_level: "Home",
  decko_logo: "Decko logo",
};

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the actor cards + codename/set machinery (mirrors the edit2
  // harness's seed shape: read-rules alwaysOk keys on the deck's STORED bot
  // codename — DECKOBOT_CODENAME, "decko_bot", never an alternate spelling)
  await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
  // RichText's CODENAME is "basic" (probe2: basics_type_code ":basic") -
  // the codehash registry is where typeCode comes from
  // (render.ts populateTypeCodes -> peekNameForId), and html.rb:10's
  // `type_code != :basic` raw-nil guard reads exactly this.
  await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3, typeName: "Cardtype" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 17, name: "*anyone signed in", codename: "anyone_signed_in", typeId: 14 });
  // the deck's member-update grant: *all+*update -> [[Anyone Signed In]]
  // (anonymous lacks the party - the anonymous universal_edit_button arm
  // is "" in the fixture; the signed-in arms carry the link)
  await seedCard(s, { id: 30, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 30, 17, "anyone_signed_in");

  // the capture's three targets - ids EXACTLY as captured (bytes carry
  // data-card-id), db_content verbatim from the fixture's recorded meta
  await seedCard(s, {
    id: 605,
    name: "Oracle Basics",
    typeId: 2,
    typeName: "RichText",
    dbContent: FIXTURE.targets.basic_note.meta.db_content,
    creatorId: 1,
    createdAt: "2026-09-19 21:01:59.000",
  });
  await seedCard(s, {
    id: 521,
    name: "Home",
    typeId: 2,
    typeName: "RichText",
    dbContent: FIXTURE.targets.deck_level.meta.db_content,
    creatorId: 1,
    createdAt: "2025-07-01 17:31:51.000",
  });
  await seedCard(s, {
    id: 291,
    name: "Decko logo",
    typeId: 284,
    typeName: "Image",
    dbContent: FIXTURE.targets.decko_logo.meta.db_content,
    creatorId: 1,
  });
  // Ruby's Image cardtype card carries codename "image" (bench-corpus id
  // 19) — the codename-keyed Type::Image scope of :boxed / :boxed_link
  // needs it seeded
  await seedCard(s, { id: 284, name: "Image", codename: "image", typeId: 3, typeName: "Cardtype" });

  // the Home nest closure (probe5/probe6 facts, pinned by probe7):
  // {{:getting_started|core}} -> *getting started (codename card), whose
  // content nests {{+:shark|core}} -> *getting started+Shark (right half
  // carries the shark codename, as in the deck: Shark id 19 codename shark)
  await seedCard(s, {
    id: 39,
    name: SEED.html_type_card.name,
    typeId: 3,
    typeName: "Cardtype",
  });
  await seedCard(s, {
    id: SEED.getting_started_codename_card.id,
    name: SEED.getting_started_codename_card.name,
    codename: "getting_started",
    typeId: 39,
    typeName: "HTML",
    dbContent: SEED.getting_started_codename_card.db_content,
  });
  await seedCard(s, { id: 536, name: "Shark", codename: "shark" });
  await seedCard(s, {
    id: SEED.getting_started_plus_shark.id,
    name: SEED.getting_started_plus_shark.name,
    leftId: SEED.getting_started_codename_card.id,
    rightId: 536,
    typeId: 39,
    typeName: "HTML",
    dbContent: SEED.getting_started_plus_shark.db_content,
  });

  // the name-environment bridge: Home's content nests the CODENAME ref
  // {{:getting_started|core}} (edit2 harness mechanism)
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  // the DECK'S act/action rows for the three targets - the substrate the
  // :box_bottom updated_by half reads (history_board.rb:10-18
  // `Card.search(updater_of: {id: card.id})`, which resolves through
  // card_acts + card_actions, NOT through the cards.updater_id column).
  // Rows extracted live from the capture deck with a read-only decko
  // runner probe (tools/oracle/decko-oracle-app, the sqlite rung the
  // capture ran on - card_actions count 4928 before and after, matching
  // the fixture's no_write_proof):
  //   card 605 Oracle Basics: act 105329 (card 605, actor 1) -> action 693
  //     create; act 109527 (card 605, actor 1) -> action 4973 UPDATE;
  //     act 109528 (card 605, actor 1) -> action 4974 UPDATE
  //   card 521 Home: act 105328 (card 1, actor 1) -> action 604 create
  //   card 291 Decko logo: act 105328 (card 1, actor 1) -> action 355 create
  // So 605 has TWO update acts by the SAME actor (the DISTINCT the
  // updater_of query carries collapses them to one updater link) and 521
  // has none - the exact distinction the oracle's updated_by div shows.
  await seedAct(s, { id: 105328, cardId: 1, actorId: 1, actedAt: "2025-07-01 17:32:39.000" });
  await seedAct(s, { id: 105329, cardId: 605, actorId: 1, actedAt: "2026-09-19 21:01:59.255689" });
  await seedAct(s, { id: 109527, cardId: 605, actorId: 1, actedAt: "2026-09-27 22:59:48.692257" });
  await seedAct(s, { id: 109528, cardId: 605, actorId: 1, actedAt: "2026-09-27 23:03:36.050361" });
  await seedAction(s, { id: 604, cardId: 521, actId: 105328, actionType: 0 });
  await seedAction(s, { id: 355, cardId: 291, actId: 105328, actionType: 0, comment: "logo.svg" });
  await seedAction(s, { id: 693, cardId: 605, actId: 105329, actionType: 0 });
  await seedAction(s, { id: 4973, cardId: 605, actId: 109527, actionType: 1 });
  await seedAction(s, { id: 4974, cardId: 605, actId: 109528, actionType: 1 });

  // the three actor engines over the same storage
  s.engine.viewer = { signedIn: true, actorId: 1 }; // bot stand-in (always-ok)
  saraEngine = new RenderEngine(new FetchEngine(s.counting));
  saraEngine.viewer = { signedIn: true, actorId: 1217 }; // the deck's Tova
  anonymousEngine = new RenderEngine(new FetchEngine(s.counting));
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("oracle-pinned bar/box/format bytes (fixtures/captured/bar-box-format-views.json)", () => {
  it("the fixture carries the in-run no-write proof, and the two signed-in oracle arms are byte-identical modulo the masks", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(
      FIXTURE.no_write_proof.actions_after,
    );
    expect(SEED.no_write_proof.unchanged).toBe(true);
    for (const [label, target] of Object.entries(FIXTURE.targets)) {
      for (const [view, botArm] of Object.entries(target.views.bot)) {
        const saraArm = target.views.tova[view];
        const anonArm = target.views.anonymous[view];
        if (botArm.bytes !== undefined) {
          expect(
            normalize(botArm.bytes),
            `${label}/${view}: bot arm vs tova arm`,
          ).toBe(normalize(saraArm.bytes));
        }
        // anonymity differences are recorded, not assumed: expected and
        // asserted per-view below, so the survey print is debug-gated
        if (
          process.env.ORACLE_ARM_DIFF_DEBUG === "1" &&
          normalize(anonArm.bytes ?? "") !== normalize(botArm.bytes ?? "")
        ) {
          console.log(`ARM-DIFF ${label}/${view}: anonymous arm differs from bot`);
        }
      }
    }
  });

  // one it per target x view: three actor renders, each compared against
  // its own fixture arm (bot also vs tova arm, tova also vs bot arm)
  for (const [label, targetName] of Object.entries(TARGET_NAMES)) {
    const target = FIXTURE.targets[label];
    for (const view of Object.keys(target.views.bot)) {
      it(`${targetName} (${label}): :${view} matches the oracle bytes (bot + tova + anonymous)`, async () => {
        const s = storage!;
        const mismatches: string[] = [];

        const arms: Array<[string, RenderEngine]> = [
          ["bot", s.engine],
          ["tova", saraEngine!],
          ["anonymous", anonymousEngine!],
        ];
        for (const [actor, engine] of arms) {
          const arm = target.views[actor][view];
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
              `${actor}: TS render RAISED ${renderError}; oracle bytes: ${
                JSON.stringify((arm.bytes ?? "").slice(0, 120))
              }`,
            );
            continue;
          }
          // each actor's render against its own arm; the signed-in
          // renders additionally against the OTHER signed-in arm
          const expectedArms =
            actor === "anonymous" ? [actor] : [actor, actor === "bot" ? "tova" : "bot"];
          for (const armName of expectedArms) {
            const expected = normalize(target.views[armName][view].bytes ?? "");
            if (actual !== expected) {
              const fd = firstDiff(actual, expected);
              mismatches.push(`${actor} vs oracle arm ${armName}: ${fd}`);
            }
          }
        }
        expect(mismatches, mismatches.join("\n\n")).toEqual([]);
      }, 60_000);
    }
  }
});
