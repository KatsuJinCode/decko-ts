// The mod-porting-harness probe for card-mod-format — the TRACKED standing
// net that consumes the harness's oracle capture
// (fixtures/oracle-surfaces/card-mod-format.harness.jsonl, produced by
// `node tools/mod-porting-harness/mod-harness.mjs capture card-mod-format`).
//
// The capture holds the view :demo oracle lines (the mod-porting wave-1
// lane): the demo.rb composition extracted VERBATIM by the static-ruby
// script tools/mod-porting-harness/ruby-oracles/card-mod-format/
// demo-view.rb, with the codename list parsed from the REAL frozen
// admin.yml files (YAML.safe_load under the real interpreter - the same
// files core-admin-runtime.ts transcribes into ADMIN_CONFIG).
//
// Replayed against the ported pieces: the admin-config accessor through
// the SEEDED admin runtime (the same harness the admin-config deck-order
// pins use - mod cards in DECK order), and demoViewSelect's form bytes
// against the oracle's exact line.
//
// RED discipline: while :demo is unported, the scenario fails here — that
// failure IS the harness working.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { modEngineHost } from "../../../src/card/mod-loader/mod-engine-host.js";
import {
  bindModuleAdminHost,
  allAdminConfigCodenamesOfCategory,
} from "../../../src/card/mod-loader/mods/core-mod.js";
import {
  ADMIN_CONFIG,
  prepareAdminRuntime,
} from "../../../src/card/mod-loader/mods/core-admin-runtime.js";
import { demoViewSelect } from "../../../src/card/mod-loader/mods/card-mod-format.js";
import type { ViewContext } from "../../../src/card/render/format.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface HarnessOracleLine {
  kind: string;
  behaviorId?: string;
  scenario?: string;
  gemSource?: string;
  codenames?: string[];
  demoView?: string;
  viewSelect?: string;
  options?: string;
}

function demoOracles(): HarnessOracleLine[] {
  return readFileSync(
    `${REPO_ROOT}fixtures/oracle-surfaces/card-mod-format.harness.jsonl`,
    "utf8",
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessOracleLine)
    .filter((l) => l.behaviorId === "view:demo");
}

// the seeded deck's vocabulary + mod cards, the admin-config deck-order
// pins' fixture verbatim (ids included - the deck order disagrees with
// name order, which is what the fixture catches)
const MOD_CARDTYPE = 10;
const STAR = 20;
const UPDATE = 21;
const TYPE_SETTING = 22;
const ALL = 23;
const SET_CARDTYPE = 24;
const ROLE_CARDTYPE = 25;
const ADMINISTRATOR = 26;

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const seed = async (opts: Parameters<typeof seedCard>[1]) => {
    await seedCard(storage!, opts);
  };
  // -- the set-pattern + role vocabulary the *update walk reads ----------
  await seed({ id: MOD_CARDTYPE, name: "Mod", codename: "mod", typeId: SET_CARDTYPE, typeName: "Cardtype" });
  await seed({ id: SET_CARDTYPE, name: "Cardtype", codename: "cardtype", typeId: SET_CARDTYPE, typeName: "Cardtype" });
  await seed({ id: ROLE_CARDTYPE, name: "Role", codename: "role", typeId: SET_CARDTYPE, typeName: "Cardtype" });
  await seed({ id: ADMINISTRATOR, name: "Administrator", codename: "administrator", typeId: ROLE_CARDTYPE, typeName: "Role" });
  await seed({ id: STAR, name: "*star", codename: "star", typeId: SET_CARDTYPE, typeName: "Set" });
  await seed({ id: ALL, name: "*all", codename: "all", typeId: SET_CARDTYPE, typeName: "Set" });
  await seed({ id: TYPE_SETTING, name: "*type", codename: "type", typeId: 2, typeName: "Setting" });
  await seed({ id: UPDATE, name: "*update", codename: "update", typeId: 2, typeName: "Setting" });
  // -- every ADMIN_CONFIG gem as a mod card, ids ascending in the ORACLE's
  // gem-dir sort order (the runtime's all_configs walk preserves card-id
  // order - no sort - so this seed order reproduces the oracle's
  // admin.yml walk list exactly; the four corpus cards' deck-order
  // behavior is pinned by its own test and does not need its fixture ids
  // here)
  const gemOrder = Object.keys(ADMIN_CONFIG)
    .filter((k) => k !== "core")
    .sort();
  let gemId = 30;
  for (const gem of gemOrder) {
    await seed({
      id: gemId,
      name: `mod: ${gem.replace(/_/g, " ")}`,
      codename: `mod_${gem}`,
      typeId: MOD_CARDTYPE,
      typeName: "Mod",
    });
    gemId += 1;
  }
  // -- `*star+*update` = Administrator: the rule the walk finds ----------
  await seed({ id: 200, name: "*star+*update", leftId: STAR, rightId: UPDATE, typeId: 47, typeName: "List", dbContent: "Administrator\nWagneer" });

  const host = modEngineHost(storage.engine, storage.fetcher);
  bindModuleAdminHost(host);
  await prepareAdminRuntime(host);
});

afterAll(() => {
  storage?.close();
});

/** The probe's two-field format: demoViewSelect reads the card's id (the
 *  form dom id) + the url key (the action path) and cardFormShell ignores
 *  the ctx; the admin accessor reads the bound module host, not the ctx. */
function probeCtx(): ViewContext {
  return {
    fmt: {
      card: { id: 30 },
      urlKey: () => "Sample_Basic",
    },
  } as unknown as ViewContext;
}

describe("card-mod-format harness probe: view :demo (the wave-1 oracle replay)", () => {
  const oracles = demoOracles();

  it("the harness captured the demo oracle lines", () => {
    expect(oracles.length).toBe(4);
  });

  it("replays all_views_from_admin_config (demo.rb:37-39 + the frozen admin.yml walk)", () => {
    const line = oracles.find((l) => l.scenario === "all_views_from_admin_config");
    expect(line).toBeDefined();
    // the seeded deck carries EVERY ADMIN_CONFIG gem in the oracle's
    // gem-dir sort order (ids ascending), so the runtime's all_configs
    // walk reproduces the oracle's full frozen admin.yml list exactly
    expect(allAdminConfigCodenamesOfCategory(probeCtx(), "views")).toEqual(line!.codenames);
  });

  it("replays demo_view_default (demo.rb:23-25 - the headless params absence)", () => {
    const line = oracles.find((l) => l.scenario === "demo_view_default");
    expect(line).toBeDefined();
    expect(line!.demoView).toBe("core");
  });

  it("replays view_select (demo.rb:31-35 + form.rb:193-240 form bytes)", () => {
    const line = oracles.find((l) => l.scenario === "view_select");
    expect(line).toBeDefined();
    // the oracle's codename list IN - the form bytes out (byte-exact)
    const bytes = demoViewSelect(probeCtx());
    expect(bytes).toEqual(line!.viewSelect);
  });

  it("replays options_for_select (the selected marker on :core)", () => {
    const line = oracles.find((l) => l.scenario === "options_for_select");
    expect(line).toBeDefined();
    // the options are the oracle list's own encoding - the viewSelect
    // replay above carries them; here the selected marker pins the :core
    // default
    expect(line!.options).toContain('<option selected="selected" value="core">core</option>');
  });
});
