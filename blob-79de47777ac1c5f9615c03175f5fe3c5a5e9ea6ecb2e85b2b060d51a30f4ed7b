// event :translate_variables_to_scss (card-mod-bootstrap-0.20.0
// set/type_plus_right/bootswatch_skin/colors.rb:116-146) — the +*colors
// card's param-driven SCSS variable fold, pinned against a LIVE RUBY ORACLE
// run of the gem's own code:
//
//   tmp/oracle-captures/capture-translate-variables-to-scss.rb extracts
//   colors.rb:3-9 (VARIABLE_NAMES), :36-38 (definition_regex), :123-136
//   (replace_values + variable_values_from_params) VERBATIM from the pinned
//   gem file, binds them to a stub Card::Env (Rails' HashWithIndifferentAccess
//   shape: `Env.params[group]` and `.slice(*names)`), and runs the event
//   body's two replace_values calls over the request vectors. The goldens
//   are the fixture below (fixtures/ruby-translate-variables-goldens.json,
//   the capture's byte output).
//
// The port side under test: the registered body
// (translateVariablesToScssEvent) through the engine's update path — the
// save input carries the posted groups, the setContent closure mutates the
// pending content at :prepare_to_validate, and the stage walk's set scoping
// (type_plus_right/bootswatch_skin/colors, the Type Plus Right pattern)
// gates which card folds.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { libsassWasmCompiler } from "../../../src/server/libsass-wasm.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModBootstrap, {
  translateVariablesToScssEvent,
  BOOTSWATCH_VARIABLE_NAMES,
} from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import { typePlusRightSetMember } from "../../../src/card/mod-loader/mod-event-set-membership.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Golden {
  name: string;
  result: string;
}

/** The ruby capture's byte output (the oracle). */
function goldens(): Map<string, string> {
  const lines = readFileSync(
    `${REPO_ROOT}tests/card/mod-loader/fixtures/ruby-translate-variables-goldens.json`,
    "utf8",
  );
  return new Map(
    (JSON.parse(lines) as Golden[]).map((g) => [g.name, g.result]),
  );
}

/** The bootstrap mod's registry (the registration the loader performs). */
function bootstrapRuntime(driver: SQLDatabaseDriver): ModEventRuntime {
  const loader = new ModLoader([{ manifest: cardModBootstrap }]);
  loader.resolveOrder({ gemMods: ["bootstrap"] });
  loader.load();
  const reports: unknown[] = [];
  const runtime: ModEventRuntime = {
    registry: loader.eventRegistry(),
    setMember: typePlusRightSetMember(driver),
    onReport: (r) => reports.push(r),
  };
  (runtime as unknown as { reports: unknown[] }).reports = reports;
  return runtime;
}

function engine(
  storage: ActionsTestStorage,
  runtime: ModEventRuntime,
): CardActionEngine {
  return new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: "192.0.2.7",
    // the skin-field save runs the write path's style asset machinery, whose
    // rebuild assertion demands a SCSS compiler (style-asset-events.ts
    // assertStyleCompilerFor); the WASM compiler is the test seam
    scssCompiler: libsassWasmCompiler(),
    modEvents: runtime,
  });
}

async function contentOf(
  storage: ActionsTestStorage,
  cardId: number,
): Promise<string | null> {
  const row = await storage.selectOne<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE id = ?",
    [cardId],
  );
  return row?.db_content ?? null;
}

const SKIN_TYPE = "Bootswatch skin";
const SKIN = "Oracle Skin";
const COLORS = `${SKIN}+*colors`;

/** The deck shape the event needs: the bootswatch_skin TYPE card (its
 *  codename is the set path's type anchor), the skin card, and its +*colors
 *  field (tag key *colors, the set path's right anchor). */
async function seedSkinDeck(): Promise<{
  storage: ActionsTestStorage;
  colorsId: number;
  otherId: number;
  engine: CardActionEngine;
}> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const skinType = await seedCard(storage, {
    name: SKIN_TYPE,
    codename: "bootswatch_skin",
  });
  // Ruby: card_accessor :colors, type: :scss (bootswatch_skin.rb:33) — the
  // +*colors field card is SCSS-typed.
  const scssType = await seedCard(storage, { name: "SCSS", codename: "scss" });
  await seedCard(storage, { name: SKIN, typeId: skinType.id });
  const colors = await seedCard(storage, {
    name: COLORS,
    typeId: scssType.id,
    dbContent: "$blue: #0000ff !default;\n",
  });
  const other = await seedCard(storage, {
    name: "Unrelated Card",
    typeId: 2,
    dbContent: "$blue: #0000ff !default;\n",
  });
  const eng = engine(storage, bootstrapRuntime(storage.engine.driver));
  return { storage, colorsId: colors.id, otherId: other.id, engine: eng };
}

describe("translate_variables_to_scss — the ruby oracle's vectors, through the save path", () => {
  it("the vocabulary matches the gem's VARIABLE_NAMES (colors.rb:3-9)", () => {
    expect(BOOTSWATCH_VARIABLE_NAMES.colors).toEqual([
      "blue", "indigo", "purple", "pink", "red", "orange", "yellow", "green",
      "teal", "cyan", "black", "white", "gray-100", "gray-200", "gray-300",
      "gray-400", "gray-500", "gray-600", "gray-700", "gray-800", "gray-900",
    ]);
    expect(BOOTSWATCH_VARIABLE_NAMES.themeColors).toEqual([
      "primary", "secondary", "success", "info", "warning", "danger", "light",
      "dark", "body-bg", "body-color",
    ]);
  });

  it("replaces the defined line and appends the missing ones (oracle: replace-existing-and-append-missing)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "$blue: #0000ff !default;\n$red: #ff0000 !default;\n",
      colorsParams: { blue: "#00f", "gray-100": "#eee" },
      themeColorsParams: { primary: "$blue" },
    });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("replace-existing-and-append-missing"),
    );
  });

  it("appends when nothing defines the names (oracle: no-matching-lines-appends-both-groups)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "$body-bg: #fff !default;\n",
      colorsParams: { teal: "#0aa" },
      themeColorsParams: { danger: "#d9534f" },
    });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("no-matching-lines-appends-both-groups"),
    );
  });

  it("slices posted names to the vocabulary (oracle: names-outside-vocabulary-are-sliced-away)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "$pink: #ff69b4 !default;\n",
      colorsParams: { bogus: "#123", pink: "#f0f" },
      themeColorsParams: { nope: "#000" },
    });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("names-outside-vocabulary-are-sliced-away"),
    );
  });

  it("rewrites EVERY matching line, keeping the before group (oracle: gsub-replaces-every-matching-line)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "  $blue:   #0000ff !default;\n$blue: #111 !default;\n$x: 1 !default;\n",
      colorsParams: { blue: "#00f" },
    });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("gsub-replaces-every-matching-line"),
    );
  });

  it("replaces a value containing the default token to the line end (oracle: value-with-internal-default-token-replaced-to-line-end)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "$white: a !default; b !default;\n",
      colorsParams: { white: "#fff" },
    });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("value-with-internal-default-token-replaced-to-line-end"),
    );
  });

  it("appends an empty value's line byte-for-byte (oracle: empty-string-value-appends-empty)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({ cardId: colorsId, content: "", colorsParams: { orange: "" } });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("empty-string-value-appends-empty"),
    );
  });

  it("replaces a gray-100 band name (oracle: gray-dash-names-replace)", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "$gray-600: #666 !default;\n",
      colorsParams: { "gray-600": "#555" },
    });
    expect(await contentOf(storage, colorsId)).toBe(
      goldens().get("gray-dash-names-replace"),
    );
  });

  it("no groups on the save: the body no-ops (Ruby: Env.params[group] nil → {})", async () => {
    const { storage, colorsId, engine: eng } = await seedSkinDeck();
    await eng.updateCard({
      cardId: colorsId,
      content: "$blue: #0000ff !default;\n",
    });
    expect(await contentOf(storage, colorsId)).toBe("$blue: #0000ff !default;\n");
  });

  it("the set scoping keeps the fold off cards outside type_plus_right/bootswatch_skin/colors", async () => {
    const { storage, otherId, engine: eng } = await seedSkinDeck();
    // a NON-colors card carrying the same params: the set scoping keeps the
    // body off it (Type Plus Right: junction whose tag is *colors on a
    // bootswatch-skin left)
    await eng.updateCard({
      cardId: otherId,
      content: "$blue: #0000ff !default;\n",
      colorsParams: { blue: "#00f" },
    });
    expect(await contentOf(storage, otherId)).toBe("$blue: #0000ff !default;\n");
  });

  it("the registered body applied directly matches the oracle too (the fn the walk fires)", async () => {
    const goldensMap = goldens();
    const cases: Array<{
      name: string;
      content: string;
      colors?: Record<string, string>;
      themeColors?: Record<string, string>;
    }> = [
      {
        name: "replace-existing-and-append-missing",
        content: "$blue: #0000ff !default;\n$red: #ff0000 !default;\n",
        colors: { blue: "#00f", "gray-100": "#eee" },
        themeColors: { primary: "$blue" },
      },
      {
        name: "empty-params-groups-noop",
        content: "$blue: #0000ff !default;\n",
      },
      {
        name: "absent-group-key-noop",
        content: "$cyan: #00ffff !default;\n$indigo: #6610f2 !default;\n",
        colors: { cyan: "#0cc" },
      },
    ];
    for (const c of cases) {
      let pending = c.content;
      await translateVariablesToScssEvent(
        {
          name: "Oracle Skin+*colors",
          key: "oracle_skin+*colors",
          dbContent: c.content,
          action: "update",
        },
        undefined,
        {
          driver: undefined as never,
          lexicon: undefined as never,
          stage: "prepare_to_validate",
          skipEvent: () => false,
          saveInput: {
            comment: undefined,
            commentAuthor: undefined,
            signedInActorName: undefined,
            now: () => new Date(0),
            pendingContent: c.content,
            setContent: (dbContent) => {
              pending = dbContent;
            },
            commentApplied: false,
            colorsParams: c.colors,
            themeColorsParams: c.themeColors,
          },
        },
      );
      expect(pending).toBe(goldensMap.get(c.name));
    }
  });
});
