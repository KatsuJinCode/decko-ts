// The carrierwave INPUT seam: the input half of the asset-output
// machinery — the port of
//
//   card-mod-assets set/abstract/asset_outputter.rb:32-34 input_from_item_cards
//   card-mod-assets set/abstract/asset_outputter.rb:74-76 input_item_cards
//   card-mod-assets set/abstract/asset_inputter.rb:44-53 asset_input_content /
//                                                        assemble_asset_input_content
//   card-mod-assets set/right/asset_input.rb  the +*asset input child
//   card-mod-style  set/abstract/style_group.rb:5-7   the scss group override
//   card-mod-script set/abstract/script_group.rb:5-7  the js group override
//
// EVERY whole-assembly byte assertion is pinned against LIVE ORACLE computes
// (tools/oracle/carrierwave-input-half-capture.rb + -followup.rb +
// -probe-outputter.rb run against the booted decko-oracle-app on 2026-09-29;
// supporting evidence in the worktree's tmp/carrierwave-input-half-*.json).
// The oracle-computed whole bytes ride the committed fixtures in
// fixtures/carrierwave-input-half-oracle/ (the two deck outputters assemble
// 370KB/1MB - shas only there; the probe outputter "Oracle Cw In+*script"
// assembles the nine fully-captured components into 15,968B - committed whole).
//
// The write half (storeAssetOutput, asset-output-write.ts) takes ASSEMBLED
// content; this module is the assembly that feeds it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import {
  inputFromItemCards,
  inputItemCards,
  assetInputContent,
  assembleAssetInputContent,
  assetInputCardName,
  findInvalidInput,
  inputFormatFor,
  type AssetInputDeps,
  type AssetInputCardRef,
} from "../../../src/card/attachments/asset-input-assembly.js";

// ---------------------------------------------------------------------------
// the oracle captures (committed fixtures + recorded shas)
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "fixtures",
  "carrierwave-input-half-oracle",
);

/** The nine components captured FULL by carrierwave-input-half-capture.rb
 *  (asset_input_content of each, <=4096B so byte_record embedded them whole).
 *  Key order = the probe outputter's item order (input_item_card_names). */
const CAPTURED_PARTS: Record<string, string> = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "captured-parts.json"), "utf8"),
) as Record<string, string>;

/** The oracle-COMPUTED input_from_item_cards of "Oracle Cw In+*script"
 *  (the nine captured components), per joint. Ruby computed these through the
 *  real machinery: item_cards(known_only: true) -> map(&:asset_input_content)
 *  -> compact -> join(joint). */
const PROBE_WHOLE_NEWLINE = readFileSync(join(FIXTURE_DIR, "probe-whole-newline.txt"), "utf8");
const PROBE_WHOLE_EMPTY = readFileSync(join(FIXTURE_DIR, "probe-whole-empty.txt"), "utf8");
const PROBE_WHOLE_PIPE = readFileSync(join(FIXTURE_DIR, "probe-whole-pipe.txt"), "utf8");

// Recorded sha256 pins for the assemblies too large to embed (the two deck
// outputters + the mod-level assembles; evidence:
// tmp/carrierwave-input-half-oracle.json / -followup.json in the worktree).
// The TS side cannot recompute these digests - the SassC / CoffeeScript /
// mod-dir leaves are Ruby-runtime outputs (named remainder, see the module
// doc) - so the digests ride as the record itself, not as an executable pin:
//   allScriptWhole             36a3d55df942e04fa205231a0c750d9f453518edda574f5bfb622dcb5dd492c7
//   allScriptWholeEmpty        16ef5b7ac608883e6789d1fb79c54dd2ce3ebe82a3e8d22a852e7e9ae8b52637
//   allScriptWholePipe         74d145a669412274eaa2892304b68272fda8a69356a91120f658b7182d0c8e13
//   allStyleWhole              97709a6dac696ad03b5d8e31713f33b888723037f2fd5715dc0acd288deb6d2a
//   styleModsAssemble          72acac6c18a25700f20861e4ad9a547482fb3ad844f721ebb1445079ad6bd3dd
//   modBootstrapScriptAssemble 8ee22b6b686049423a7576fbaad1b2ee1497ae1d5140da07101c386c1836b7fc
//   modBootstrapStyleAssemble  dedb3cb0fa772f4f2f72864c37566f5136f8af41ad5fce2b77a8ed3603ce4c6a

// ---------------------------------------------------------------------------
// deps doubles over the captured shapes
// ---------------------------------------------------------------------------

/** setKeys exactly as the engine's safeSetKeys emits them for these cards
 *  (the *all+*read documentation shape: "ALL ALL_PLUS TYPE-list RSTAR RULE
 *  RIGHT-Xread TYPE_PLUS_RIGHT-set-Xread SELF-Xall-Xread" — star-card keys
 *  carry the X prefix). */
const MOD_SCRIPT_SET_KEYS = "ALL TYPE-list RSTAR RULE RIGHT-Xscript TYPE_PLUS_RIGHT-mod-Xscript";
const OUTPUTTER_SET_KEYS = "ALL ALL_PLUS TYPE-list RSTAR RULE RIGHT-Xscript TYPE_PLUS_RIGHT-set-Xscript";

interface ItemSpec {
  name: string;
  dbContent?: string;
  setKeys?: string;
  id?: number;
  trash?: boolean;
}

function cardRef(spec: ItemSpec): AssetInputCardRef {
  return {
    name: spec.name,
    dbContent: spec.dbContent ?? "",
    setKeys: spec.setKeys ?? MOD_SCRIPT_SET_KEYS,
    id: spec.id ?? 551, // a real row by default (oracle: mod: search+*script id 551)
    trash: spec.trash ?? false,
  };
}

/** The nine captured items, in the probe outputter's item order. */
const NINE_ITEMS: ItemSpec[] = Object.keys(CAPTURED_PARTS).map((name) => ({
  name,
  setKeys: MOD_SCRIPT_SET_KEYS,
  id: 551,
}));

/** fetchByName over explicit records (the probe outputter + the nine items). */
function makeDeps(
  records: ItemSpec[],
  overrides: {
    renderInputView?: AssetInputDeps["renderInputView"];
  } = {},
): AssetInputDeps & { byName: Map<string, AssetInputCardRef> } {
  const byName = new Map<string, AssetInputCardRef>(
    records.map((r) => [r.name, cardRef(r)] as const),
  );
  return {
    byName,
    fetchByName: (name: string) => byName.get(name),
    renderInputView:
      overrides.renderInputView ??
      ((item) => {
        const part = CAPTURED_PARTS[item.name];
        if (part === undefined) {
          throw new Error(`no captured part for ${item.name}`);
        }
        return part;
      }),
  };
}

// the probe outputter row (oracle: id 1352, Type::List, TypePlusRight::Set::Script)
const PROBE_OUTPUTTER: ItemSpec = {
  name: "Oracle Cw In+*script",
  dbContent: Object.keys(CAPTURED_PARTS).join("\n"),
  setKeys: OUTPUTTER_SET_KEYS,
  id: 1352,
};

// ---------------------------------------------------------------------------
// THE byte-compare: the assembly vs the oracle-computed whole
// ---------------------------------------------------------------------------

describe("inputFromItemCards — the oracle-computed whole (probe outputter)", () => {
  it("reproduces the live input_from_item_cards bytes exactly (default joint)", async () => {
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS]);
    const out = await inputFromItemCards(deps, "Oracle Cw In+*script");
    // oracle: 15,968B, sha256 685e15b6b6293338fb0e423507bcc7ea19a46470ac053a9d0beffc2c2c7bf0cf
    // (tmp/carrierwave-input-half-probe.json input_from_item_cards)
    expect(out).toBe(PROBE_WHOLE_NEWLINE);
    expect(out.length).toBe(15968);
  });

  it("flows the joint parameter (asset_outputter.rb:32 signature)", async () => {
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS]);
    expect(await inputFromItemCards(deps, "Oracle Cw In+*script", "")).toBe(PROBE_WHOLE_EMPTY);
    expect(await inputFromItemCards(deps, "Oracle Cw In+*script", "|")).toBe(PROBE_WHOLE_PIPE);
    // oracle sizes: 15960 / 15968 (tmp/carrierwave-input-half-probe.json)
    expect(PROBE_WHOLE_EMPTY.length).toBe(15960);
    expect(PROBE_WHOLE_PIPE.length).toBe(15968);
  });

  it("the fixture whole is the captured components joined (oracle self-consistency)", () => {
    expect(PROBE_WHOLE_NEWLINE).toBe(Object.values(CAPTURED_PARTS).join("\n"));
  });

  it("drops null components (asset_outputter.rb:33 .compact) — deps raise null", async () => {
    // a component that renders null (Ruby: a nil return) is dropped before
    // the join; the recorded oracle proof rides all_script_join_proof
    // (parts_compact_nil_free true, join_newline_matches true).
    const missing = { ...NINE_ITEMS[0] };
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS], {
      renderInputView: (item) => (item.name === missing.name ? null : CAPTURED_PARTS[item.name] ?? null),
    });
    const out = await inputFromItemCards(deps, "Oracle Cw In+*script");
    expect(out).toBe(
      Object.entries(CAPTURED_PARTS)
        .filter(([name]) => name !== missing.name)
        .map(([, bytes]) => bytes)
        .join("\n"),
    );
  });
});

// ---------------------------------------------------------------------------
// inputItemCards — asset_outputter.rb:74-76
// ---------------------------------------------------------------------------

describe("inputItemCards — item_cards(known_only: true).compact.reject(&:trash)", () => {
  it("resolves the outputter's list items in order", async () => {
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS]);
    const items = await inputItemCards(deps, "Oracle Cw In+*script");
    expect(items.map((i) => i.name)).toEqual(Object.keys(CAPTURED_PARTS));
  });

  it("drops unknown items (known_only: true)", async () => {
    // Ruby cannot CREATE this state through the save path (validate_asset_inputs
    // rejected the ghost live: "Content Oracle Cw Ghost is not a valid asset
    // input card"); it arises when an item is deleted after the rule was
    // written - which the additive oracle contract forbids. Pinned here via
    // the deps double.
    const withGhost: ItemSpec = {
      ...PROBE_OUTPUTTER,
      dbContent: Object.keys(CAPTURED_PARTS).join("\n") + "\nOracle Cw Ghost",
    };
    const deps = makeDeps([withGhost, ...NINE_ITEMS]);
    const items = await inputItemCards(deps, withGhost.name);
    expect(items.map((i) => i.name)).toEqual(Object.keys(CAPTURED_PARTS));
  });

  it("rejects trashed items (reject(&:trash))", async () => {
    const trashed: ItemSpec = { ...NINE_ITEMS[0], trash: true };
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS]);
    deps.byName.set(trashed.name, cardRef(trashed));
    const items = await inputItemCards(deps, PROBE_OUTPUTTER.name);
    expect(items.map((i) => i.name)).not.toContain(trashed.name);
    expect(items).toHaveLength(NINE_ITEMS.length - 1);
  });

  it("the unknown-shape outputter with no content yields no items", async () => {
    const empty: ItemSpec = { name: "Empty Outputter+*script", dbContent: "", setKeys: OUTPUTTER_SET_KEYS };
    const deps = makeDeps([empty]);
    expect(await inputItemCards(deps, empty.name)).toEqual([]);
    expect(await inputFromItemCards(deps, empty.name)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// the inputter branches — asset_inputter.rb:44-53 + the +*asset input child
// ---------------------------------------------------------------------------

describe("assetInputContent / assembleAssetInputContent — the inputter branches", () => {
  it("a virtual item assembles directly (asset_inputter.rb:45)", async () => {
    const virtualItem: ItemSpec = { name: "bootstrap.bundle.js", setKeys: "TYPE-java_script", id: undefined };
    const deps = makeDeps([virtualItem], {
      renderInputView: (item) => (item.name === "bootstrap.bundle.js" ? "// bundled" : null),
    });
    expect(await assetInputContent(deps, cardRef(virtualItem))).toBe("// bundled");
  });

  it("a non-virtual inputter reads the +*asset input child (VirtualCache: id-less, virtual)", async () => {
    // oracle (carrierwave-input-half-oracle.json): every +*asset input child
    // probed id=null, virtual?=true, db_content == the left's assemble bytes
    // (right/asset_input.rb virtual_content = left.assemble_asset_input_content;
    // VirtualCache saves abort :success - the child NEVER persists a row).
    // The port's branch therefore bottoms out in the same assemble either way.
    const item = cardRef(NINE_ITEMS[0]);
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS]);
    expect(assetInputCardName(NINE_ITEMS[0].name)).toBe("mod: search+*script+*asset input");
    expect(await assetInputContent(deps, item)).toBe(CAPTURED_PARTS[NINE_ITEMS[0].name]);
    // the +*asset input child record itself is id-less when synthesized
    const child = await deps.fetchByName(assetInputCardName(NINE_ITEMS[0].name));
    expect(child === undefined || child.id === undefined).toBe(true);
  });

  it("a group card renders format(scss|js).render(:core) — the style/script_group override", async () => {
    // card-mod-style set/abstract/style_group.rb:5-7 (scss) +
    // card-mod-script set/abstract/script_group.rb:5-7 (js): the group cards'
    // asset_input_content OVERRIDES the inputter default.
    const styleGroup: ItemSpec = {
      name: "mod: bootstrap+*style+group: bootstrap",
      setKeys: "TYPE-local_style_folder_group",
      id: undefined,
    };
    const scriptGroup: ItemSpec = {
      name: "mod: bootstrap+*script+group: bootstrap",
      setKeys: "TYPE-local_script_folder_group",
      id: undefined,
    };
    const seen: string[] = [];
    const deps = makeDeps([styleGroup, scriptGroup], {
      renderInputView: (item, format, view) => {
        seen.push(`${item.name}|${format}|${view}`);
        return "leaf";
      },
    });
    expect(await assetInputContent(deps, cardRef(styleGroup))).toBe("leaf");
    expect(await assetInputContent(deps, cardRef(scriptGroup))).toBe("leaf");
    expect(seen).toEqual([
      "mod: bootstrap+*style+group: bootstrap|scss|core",
      "mod: bootstrap+*script+group: bootstrap|js|core",
    ]);
  });

  it("assemble renders format(input_format).render(input_view) from the set registry", async () => {
    // the include_set options (gem-cited): yeti skin (bootswatch skin)
    // renders css/compressed - oracle input_format "css", input_view
    // "compressed" (carrierwave-input-half-oracle.json, yeti skin item).
    const skin: ItemSpec = { name: "yeti skin", setKeys: "TYPE-bootswatch_skin", id: 414 };
    const seen: string[] = [];
    const deps = makeDeps([skin], {
      renderInputView: (item, format, view) => {
        seen.push(`${item.name}|${format}|${view}`);
        return "compiled";
      },
    });
    expect(await assembleAssetInputContent(deps, cardRef(skin))).toBe("compiled");
    expect(seen).toEqual(["yeti skin|css|compressed"]);
  });

  it("a non-inputter item renders null and findInvalidInput flags it (the validate twin)", async () => {
    // asset_outputter.rb:16-18 find_invalid_input: the first item NOT
    // responding to asset_input_content. Ruby raises NoMethodError inside the
    // assembly map when unvalidated; the save-path event
    // validate_asset_inputs rejects the card with
    // "Content <name> is not a valid asset input card" (rejected live,
    // 2026-09-29, first probe-outputter run). The port's guard is
    // findInvalidInput; past it assetInputContent returns null.
    const plain: ItemSpec = { name: "Plain Card", setKeys: "ALL TYPE-rich_text", id: 900 };
    const overPlain: ItemSpec = {
      name: "Outputter Over Plain+*script",
      dbContent: "Plain Card",
      setKeys: OUTPUTTER_SET_KEYS,
      id: 901,
    };
    const deps = makeDeps([PROBE_OUTPUTTER, ...NINE_ITEMS, plain, overPlain]);
    expect(await assetInputContent(deps, cardRef(plain))).toBeNull();
    expect(await findInvalidInput(deps, PROBE_OUTPUTTER.name)).toBeNull();
    expect(await findInvalidInput(deps, overPlain.name)).toBe("Plain Card");
  });
});

// ---------------------------------------------------------------------------
// the format registry — the include_set Abstract::AssetInputter options
// ---------------------------------------------------------------------------

describe("inputFormatFor — the per-set input_format/input_view registry", () => {
  it("matches every gem include line", () => {
    // card-mod-style set/self/style_mods.rb:1        scss/core
    expect(inputFormatFor("SELF-style_mod")).toEqual({ format: "scss", view: "core" });
    // card-mod-style set/type_plus_right/mod/style.rb:4   scss/core
    expect(inputFormatFor("TYPE_PLUS_RIGHT-mod-Xstyle")).toEqual({ format: "scss", view: "core" });
    // card-mod-script set/type_plus_right/mod/script.rb:2 js/core
    expect(inputFormatFor(MOD_SCRIPT_SET_KEYS)).toEqual({ format: "js", view: "core" });
    // card-mod-style set/type/css.rb:2               css/compressed
    expect(inputFormatFor("TYPE-css")).toEqual({ format: "css", view: "compressed" });
    // card-mod-style set/type/scss.rb:2              scss/core
    expect(inputFormatFor("TYPE-scss")).toEqual({ format: "scss", view: "core" });
    // card-mod-style set/type/skin.rb:1-2            css/concat
    expect(inputFormatFor("TYPE-skin")).toEqual({ format: "css", view: "concat" });
    // card-mod-bootstrap set/type/bootswatch_skin.rb:30  css/compressed
    expect(inputFormatFor("TYPE-bootswatch_skin")).toEqual({ format: "css", view: "compressed" });
    // card-mod-script set/abstract/00_script.rb:6    js/compressed
    // (the AssetScript/JavaScript/CoffeeScript types include Abstract::Script)
    expect(inputFormatFor("TYPE-java_script")).toEqual({ format: "js", view: "compressed" });
    expect(inputFormatFor("TYPE-coffee_script")).toEqual({ format: "js", view: "compressed" });
    // the group overrides (style_group/script_group) hardcode the format
    expect(inputFormatFor("TYPE-local_style_folder_group")).toEqual({ format: "scss", view: "core", groupOverride: true });
    expect(inputFormatFor("TYPE-local_script_manifest_group")).toEqual({ format: "js", view: "core", groupOverride: true });
  });

  it("returns undefined for non-inputters", () => {
    expect(inputFormatFor("ALL TYPE-rich_text")).toBeUndefined();
    // the OUTPUTTER sets themselves are not inputters
    expect(inputFormatFor(OUTPUTTER_SET_KEYS)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// the engine-integrated shape: the REAL set keys carry the registry tokens
// ---------------------------------------------------------------------------

describe("the assembly over the real engine set keys (storage-backed)", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    // the composed loader binding (the RenderEngine constructor reads the
    // process-wide default loader — the write-seam test's beforeAll pattern)
    defaultDeckLoader();
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
    await seedCard(s, { id: 6, name: "Set", codename: "set", typeId: 5 });
    await seedCard(s, { id: 7, name: "Setting", codename: "setting", typeId: 5 });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 5 });
    await seedCard(s, { id: 62, name: "List", codename: "list", typeId: 5 });
    await seedCard(s, { id: 63, name: "Mod", codename: "mod", typeId: 5 });
    await seedCard(s, { id: 8, name: "*script", codename: "script", typeId: 7 });
    // the left of the exercised item: a Mod-typed card (oracle: "mod: search"
    // — the +*script child's set_modules include
    // Card::Set::TypePlusRight::Mod::Script because the LEFT is Mod-typed)
    await seedCard(s, { id: 550, name: "mod: search", typeId: 63 });
    await seedCard(s, {
      id: 551,
      name: "mod: search+*script",
      leftId: 550,
      rightId: 8,
      typeId: 62,
      dbContent: "",
    });
  }, 60_000);

  afterAll(() => {
    storage?.close();
  });

  it("the engine's safeSetKeys emit the registry token for the mod script card", async () => {
    const s = storage!;
    // warm the render-card cache (fetchRenderCard is cache-only), then read
    // the set keys the enrichment computed
    await s.engine.render("mod: search+*script", "key");
    const card = s.engine.fetchRenderCard("mod: search+*script");
    expect(card).toBeDefined();
    expect(card!.setKeys).toContain("TYPE_PLUS_RIGHT-mod-Xscript");
    // the registry resolves the REAL set keys to the gem's include options
    expect(inputFormatFor(card!.setKeys)).toEqual({ format: "js", view: "core" });
  });

  it("the assembly runs end-to-end over engine fetches (deps over fetchRenderCard)", async () => {
    const s = storage!;
    await seedCard(s, { id: 64, name: "Oracle Cw Engine", typeId: 6 });
    await seedCard(s, {
      id: 65,
      name: "Oracle Cw Engine+*script",
      leftId: 64,
      rightId: 8,
      typeId: 62,
      dbContent: "mod: search+*script",
    });
    await s.engine.render("mod: search+*script", "key");
    await s.engine.render("Oracle Cw Engine+*script", "key");
    const deps: AssetInputDeps = {
      fetchByName: (name) => {
        const card = s.engine.fetchRenderCard(name);
        return card === undefined
          ? undefined
          : {
              name: card.name.s,
              dbContent: card.dbContent,
              setKeys: card.setKeys,
              id: card.id,
            };
      },
      renderInputView: (item) => CAPTURED_PARTS[item.name] ?? null,
    };
    expect(await inputItemCards(deps, "Oracle Cw Engine+*script").then((i) => i.map((c) => c.name)))
      .toEqual(["mod: search+*script"]);
    expect(await inputFromItemCards(deps, "Oracle Cw Engine+*script"))
      .toBe(CAPTURED_PARTS["mod: search+*script"]);
  });
});

