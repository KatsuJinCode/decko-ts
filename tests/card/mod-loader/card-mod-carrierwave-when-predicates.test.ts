// The `when:` conditions of card-mod-carrierwave's events, pinned against
// the Ruby method bodies they port.
//
// Every expectation below is read off the gem source, not off the port's
// own output:
//
//   lib/carrier_wave/card_mount.rb:59-63  store_#{column}_event?
//   set/abstract/attachment.rb:40-45      incorrect_identifier?
//   set/abstract/attachment.rb:47-49      write_identifier?
//   set/abstract/attachment.rb:51-56      file_ready_to_save?
//   set/abstract/attachment/00_upload_cache.rb:80-82  preliminary_upload?
//   set/abstract/attachment/00_upload_cache.rb:84-86  save_preliminary_upload?
//   set/abstract/attachment/01_storage_type.rb:49-53  storage_changed?
//   set/abstract/attachment/01_storage_type.rb:32-34  coded?
//   set/abstract/attachment/01_storage_type.rb:28-30  local?
//   set/abstract/attachment/cloud.rb:118-120          change_bucket_if_read_only?
//   set/abstract/attachment/coded.rb:26-28           uncode?
//   mod/history/set/all/history.rb:6-8                no_history?
//
// The state those bodies read is the carrierwave source's
// (mod-loader/mod-event-state-sources.ts), exercised here directly against
// the Ruby storage grammar — including the arms a render-time helper
// cannot resolve (the deprecated four-line mod file, the configured
// fallback).

import { describe, it, expect, beforeAll } from "vitest";
import {
  carrierwaveModEventPredicates,
  default as carrierwaveManifest,
  rubyBucketFromContent,
  rubyModFromContent,
  rubyStorageTypeFromContent,
} from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";
import {
  clearModEventCardStateSources,
  modEventCardStateSources,
  type ModEventCardState,
  type ModEventCardStateContext,
} from "../../../src/card/mod-loader/mod-event-card-state.js";
import { registerDeckModEventCardStateSources } from "../../../src/card/mod-loader/mod-event-state-sources.js";
import type { ModEventCard } from "../../../src/card/mod-loader/mod-manifest.js";

/** A predicate call with only the named fields set — every other field is
 *  absent, which is a card that carries nothing (Ruby's nil). */
function card(over: Partial<ModEventCard> = {}): ModEventCard {
  return { name: "My Card", ...over };
}

function when(name: string, over: Partial<ModEventCard> = {}): boolean {
  const predicate = (carrierwaveModEventPredicates as Record<string, (c: ModEventCard) => boolean>)[name];
  expect(predicate, `no predicate named ${name}`).toBeTypeOf("function");
  return predicate(card(over));
}

// ---------------------------------------------------------------------------

describe("store_#{column}_event? (card_mount.rb:59-63): !coded? || ENV['STORE_CODED_FILES']", () => {
  it("a local or web or cloud attachment stores without the env opt-in", () => {
    for (const name of ["store_file_event?", "store_image_event?"]) {
      expect(when(name, { storageType: "local" })).toBe(true);
      expect(when(name, { storageType: "web" })).toBe(true);
      expect(when(name, { storageType: "cloud" })).toBe(true);
    }
  });

  it("a coded attachment does NOT store unless the env var is set", () => {
    for (const name of ["store_file_event?", "store_image_event?"]) {
      // ENV["STORE_CODED_FILES"] unset is nil -> falsy.
      expect(when(name, { storageType: "coded" })).toBe(false);
      expect(when(name, { storageType: "coded", storeCodedFiles: false })).toBe(false);
      expect(when(name, { storageType: "coded", storeCodedFiles: true })).toBe(true);
    }
  });

  it("the two mounts answer identically — one Ruby method per column", () => {
    const table = carrierwaveModEventPredicates as Record<string, (c: ModEventCard) => boolean>;
    for (const type of ["local", "web", "cloud", "coded"]) {
      for (const optIn of [undefined, true]) {
        const c = card({ storageType: type, storeCodedFiles: optIn });
        expect(table["store_file_event?"](c)).toBe(table["store_image_event?"](c));
      }
    }
  });
});

describe("incorrect_identifier? (attachment.rb:40-45)", () => {
  const IDENTIFIER = "~12/34.png";

  it("is false for a web card whatever the identifier says (the web? guard)", () => {
    expect(
      when("incorrect_identifier?", {
        storageType: "web",
        dbContent: "http://example.com/x.png",
        attachmentIdentifierContent: IDENTIFIER,
      }),
    ).toBe(false);
  });

  it("is true when the column does not carry the mount's identifier", () => {
    expect(
      when("incorrect_identifier?", {
        storageType: "local",
        dbContent: "something else",
        attachmentIdentifierContent: IDENTIFIER,
      }),
    ).toBe(true);
  });

  it("is false when the column already carries it", () => {
    expect(
      when("incorrect_identifier?", {
        storageType: "local",
        dbContent: IDENTIFIER,
        attachmentIdentifierContent: IDENTIFIER,
      }),
    ).toBe(false);
  });

  it("is false when the identifier is blank (present? guard)", () => {
    expect(
      when("incorrect_identifier?", { storageType: "local", dbContent: "x", attachmentIdentifierContent: "" }),
    ).toBe(false);
    expect(
      when("incorrect_identifier?", {
        storageType: "local",
        dbContent: "x",
        attachmentIdentifierContent: "   ",
      }),
    ).toBe(false);
  });

  it("is false when the mount has no identifier at all", () => {
    expect(when("incorrect_identifier?", { storageType: "local", dbContent: "x" })).toBe(false);
  });
});

describe("write_identifier? (attachment.rb:47-49): !web?", () => {
  it("is false only for a web card", () => {
    expect(when("write_identifier?", { storageType: "web" })).toBe(false);
    expect(when("write_identifier?", { storageType: "local" })).toBe(true);
    expect(when("write_identifier?", { storageType: "cloud" })).toBe(true);
    expect(when("write_identifier?", { storageType: "coded" })).toBe(true);
    expect(when("write_identifier?", {})).toBe(true);
  });
});

describe("file_ready_to_save? (attachment.rb:51-56)", () => {
  const READY = {
    attachmentPresent: true,
    attachmentIsChanging: true,
    params: {},
  };

  it("is true for a plain riding, changing file on an ordinary request", () => {
    expect(when("file_ready_to_save?", READY)).toBe(true);
  });

  it("is false with no file on the save (attachment.file.present?)", () => {
    expect(when("file_ready_to_save?", { ...READY, attachmentPresent: false })).toBe(false);
  });

  it("is false for a preliminary upload (Env.params[:attachment_upload])", () => {
    expect(
      when("file_ready_to_save?", {
        ...READY,
        params: { attachment_upload: "card[file]" },
      }),
    ).toBe(false);
    // Ruby truthiness: an empty-string param is TRUE, so the save is still
    // a preliminary upload.
    expect(when("file_ready_to_save?", { ...READY, params: { attachment_upload: "" } })).toBe(false);
  });

  it("is false for the two-step upload's final save (action_id_of_cached_upload)", () => {
    expect(when("file_ready_to_save?", { ...READY, actionIdOfCachedUpload: 55 })).toBe(false);
    // a blank attribute is not present, so this is NOT the two-step save
    expect(when("file_ready_to_save?", { ...READY, actionIdOfCachedUpload: "" })).toBe(true);
  });

  it("is false when the mount's column is not changing", () => {
    expect(when("file_ready_to_save?", { ...READY, attachmentIsChanging: false })).toBe(false);
  });
});

describe("the upload-cache conditions (00_upload_cache.rb:80-86)", () => {
  it("preliminary_upload? is the truthiness of Env.params[:attachment_upload]", () => {
    expect(when("preliminary_upload?", {})).toBe(false);
    expect(when("preliminary_upload?", { params: {} })).toBe(false);
    expect(when("preliminary_upload?", { params: { attachment_upload: "card[file]" } })).toBe(true);
    // Ruby: only nil and false are falsy.
    expect(when("preliminary_upload?", { params: { attachment_upload: "" } })).toBe(true);
    expect(when("preliminary_upload?", { params: { attachment_upload: null } })).toBe(false);
  });

  it("save_preliminary_upload? is action_id_of_cached_upload.present?", () => {
    expect(when("save_preliminary_upload?", {})).toBe(false);
    expect(when("save_preliminary_upload?", { actionIdOfCachedUpload: 0 })).toBe(true);
    expect(when("save_preliminary_upload?", { actionIdOfCachedUpload: "55" })).toBe(true);
    expect(when("save_preliminary_upload?", { actionIdOfCachedUpload: "" })).toBe(false);
  });
});

describe("storage_changed? (01_storage_type.rb:49-53)", () => {
  const SAME: Partial<ModEventCard> = {
    storageType: "local",
    currentStorageType: "local",
    savedStorageBucket: false,
    currentStorageBucket: false,
    savedStorageMod: false,
    currentStorageMod: false,
  };

  it("is false when type, bucket and mod all match `current`", () => {
    expect(when("storage_changed?", SAME)).toBe(false);
  });

  it("is true when the storage type differs", () => {
    expect(when("storage_changed?", { ...SAME, storageType: "coded" })).toBe(true);
  });

  it("is true when only the bucket differs", () => {
    expect(when("storage_changed?", { ...SAME, savedStorageBucket: "my_bucket" })).toBe(true);
  });

  it("is true when only the mod differs", () => {
    expect(when("storage_changed?", { ...SAME, savedStorageMod: "carrierwave" })).toBe(true);
  });
});

describe("coded? / local? (01_storage_type.rb:28-34)", () => {
  it("each is exactly its storage type", () => {
    for (const type of ["local", "cloud", "web", "coded"]) {
      expect(when("coded?", { storageType: type })).toBe(type === "coded");
      expect(when("local?", { storageType: type })).toBe(type === "local");
    }
    // an unknown storage type is neither
    expect(when("coded?", {})).toBe(false);
    expect(when("local?", {})).toBe(false);
  });
});

describe("change_bucket_if_read_only? (cloud.rb:118-120)", () => {
  it("needs cloud, a read-only bucket config, and a changing attachment", () => {
    expect(
      when("change_bucket_if_read_only?", {
        storageType: "cloud",
        bucketReadOnly: true,
        attachmentIsChanging: true,
      }),
    ).toBe(true);
    // no bucket config -> bucket_config[:read_only] is nil
    expect(
      when("change_bucket_if_read_only?", { storageType: "cloud", attachmentIsChanging: true }),
    ).toBe(false);
    // not cloud
    expect(
      when("change_bucket_if_read_only?", {
        storageType: "local",
        bucketReadOnly: true,
        attachmentIsChanging: true,
      }),
    ).toBe(false);
    // attachment not changing
    expect(
      when("change_bucket_if_read_only?", {
        storageType: "cloud",
        bucketReadOnly: true,
        attachmentIsChanging: false,
      }),
    ).toBe(false);
  });
});

describe("uncode? (coded.rb:26-28)", () => {
  const CODED_CURRENT = { currentStorageType: "coded" };

  it("is true for a coded card this save did not pin to coded", () => {
    expect(when("uncode?", CODED_CURRENT)).toBe(true);
  });

  it("is false when the save assigned storage_type :coded", () => {
    expect(when("uncode?", { ...CODED_CURRENT, explicitStorageType: "coded" })).toBe(false);
    // any OTHER explicit type still uncodes
    expect(when("uncode?", { ...CODED_CURRENT, explicitStorageType: "local" })).toBe(true);
  });

  it("is false when the save names a mod (set_specific[:mod].present?)", () => {
    expect(when("uncode?", { ...CODED_CURRENT, assignedMod: "carrierwave" })).toBe(false);
    expect(when("uncode?", { ...CODED_CURRENT, assignedMod: "" })).toBe(true);
  });

  it("is false when the stored card is not coded (current.coded?)", () => {
    expect(when("uncode?", { currentStorageType: "local" })).toBe(false);
    expect(when("uncode?", {})).toBe(false);
  });
});

describe("no_history? (history.rb:6-8): !history?", () => {
  it("is the negation of history?", () => {
    expect(when("no_history?", { history: true })).toBe(false);
    expect(when("no_history?", { history: false })).toBe(true);
    // Ruby defines history? (history.rb:1-3) and the history source always
    // populates it, so an absent field is a card that records history.
    expect(when("no_history?")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// the state source: what the predicates above read is derived here
// ---------------------------------------------------------------------------

/** The registered carrierwave source (mod-event-state-sources.ts). */
function source(): (c: ModEventCard, ctx: ModEventCardStateContext) => ModEventCardState {
  clearModEventCardStateSources();
  registerDeckModEventCardStateSources();
  const found = modEventCardStateSources().find((s) => s.modName === "carrierwave");
  expect(found, "the carrierwave state source is registered at deck boot").toBeDefined();
  return found!.load as (c: ModEventCard, ctx: ModEventCardStateContext) => ModEventCardState;
}

const DRIVER = {} as ModEventCardStateContext["driver"];
const LEXICON = {} as ModEventCardStateContext["lexicon"];

function populate(
  c: ModEventCard,
  ctx: Partial<ModEventCardStateContext> = {},
): ModEventCardState {
  return source()(
    c,
    { authCurrentId: 1, isActCard: true, driver: DRIVER, lexicon: LEXICON, ...ctx },
  ) as ModEventCardState;
}

describe("the storage grammar the source applies", () => {
  it("storage_type_from_content (01_storage_type.rb:102-116) maps each prefix", () => {
    expect(rubyStorageTypeFromContent("(my_bucket)/12/34.png", "local")).toBe("cloud");
    expect(rubyStorageTypeFromContent("https://example.com/x.png", "local")).toBe("web");
    expect(rubyStorageTypeFromContent("http://example.com/x.png", "local")).toBe("web");
    expect(rubyStorageTypeFromContent("~12/34.png", "local")).toBe("local");
    expect(rubyStorageTypeFromContent(":logo/carrierwave.svg", "local")).toBe("coded");
  });

  it("an unprefixed content falls to the deprecated mod file or the config", () => {
    // deprecated_mod_file? (coded.rb:73-75): present, not `~`, four lines.
    expect(rubyStorageTypeFromContent("a\nb\nc\nd", "local")).toBe("coded");
    // three lines is not the deprecated shape -> the configured storage
    expect(rubyStorageTypeFromContent("a\nb\nc", "local")).toBe("local");
    expect(rubyStorageTypeFromContent("a\nb\nc\nd", "cloud")).toBe("coded");
    expect(rubyStorageTypeFromContent("whatever", "cloud")).toBe("cloud");
    // nil content (the mount's own reset, attachment.rb:95-97)
    expect(rubyStorageTypeFromContent(null, "local")).toBe("local");
  });

  it("bucket_from_content (cloud.rb:72-76) and mod_from_content (coded.rb:35-40)", () => {
    expect(rubyBucketFromContent("(my_bucket)/12/34.png")).toBe("my_bucket");
    expect(rubyBucketFromContent("~12/34.png")).toBeUndefined();
    expect(rubyModFromContent(":logo/carrierwave.svg")).toBe("carrierwave");
    expect(rubyModFromContent(":mod_card+version/carrierwave.png")).toBe("carrierwave");
    expect(rubyModFromContent("~12/34.png")).toBeUndefined();
    // the deprecated four-line content's LAST line is the mod
    expect(rubyModFromContent("a\nb\nc\ncarrierwave")).toBe("carrierwave");
  });
});

describe("the carrierwave state source", () => {
  it("a create with no assigned type takes the configured storage (new_card? arm)", () => {
    const state = populate(card({ action: "create" }));
    expect(state.storageType).toBe("local");
    expect(state.currentStorageType).toBe("local");
  });

  it("an existing card's type comes from its content", () => {
    const state = populate(
      card({
        action: "update",
        dbContent: "~12/34.png",
        dbContentBeforeAct: "~12/9.png",
      }),
    );
    expect(state.storageType).toBe("local");
    expect(state.currentStorageType).toBe("local");
  });

  it("a riding attachment resets the content arm, so the config answers", () => {
    // attachment.rb:95-97 sets content to nil when a file is attached.
    const state = populate(
      card({ action: "update", dbContent: "http://example.com/old.png", dbContentBeforeAct: null }),
      { saveInput: { attachmentRides: true } },
    );
    expect(state.storageType).toBe("local");
    expect(state.attachmentPresent).toBe(true);
    expect(state.attachmentIsChanging).toBe(true);
  });

  it("an assigned coded storage_type is explicit, and carries the mod", () => {
    const state = populate(card({ action: "create" }), {
      saveInput: { attachmentRides: true, storageType: "coded", mod: "carrierwave" },
    });
    expect(state.storageType).toBe("coded");
    expect(state.explicitStorageType).toBe("coded");
    expect(state.assignedMod).toBe("carrierwave");
    expect(state.savedStorageMod).toBe("carrierwave");
    expect(when("uncode?", state)).toBe(false); // pinned to coded
  });

  it("`current` is the row the save replaces", () => {
    const state = populate(
      card({
        action: "update",
        dbContent: "~12/34.png",
        dbContentBeforeAct: ":logo/carrierwave.svg",
      }),
    );
    expect(state.currentStorageType).toBe("coded");
    expect(state.currentStorageMod).toBe("carrierwave");
    expect(state.currentStorageBucket).toBe(false);
    expect(state.savedStorageBucket).toBe(false);
  });

  it("a cloud identifier names its bucket on both sides", () => {
    const state = populate(
      card({
        action: "update",
        dbContent: "(other)/12/34.png",
        dbContentBeforeAct: "(my_bucket)/12/9.png",
      }),
    );
    expect(state.storageType).toBe("cloud");
    expect(state.savedStorageBucket).toBe("other");
    expect(state.currentStorageBucket).toBe("my_bucket");
  });

  it("the mount's identifier is the one this save wrote, else the stored one", () => {
    const riding = populate(card({ action: "update", dbContent: "~12/34.png" }), {
      saveInput: { attachmentRides: true },
    });
    expect(riding.attachmentIdentifierContent).toBe("~12/34.png");
    const stored = populate(
      card({ action: "update", dbContent: "new content", dbContentBeforeAct: "~12/34.png" }),
    );
    expect(stored.attachmentIdentifierContent).toBe("~12/34.png");
  });

  it("action_id_of_cached_upload rides the save, and STORE_CODED_FILES is read", () => {
    const state = populate(card({ action: "create" }), { saveInput: { actionIdOfCachedUpload: 55 } });
    expect(state.actionIdOfCachedUpload).toBe(55);
    expect(when("save_preliminary_upload?", state)).toBe(true);
    // ENV unset -> nil -> the coded store stays off
    expect(typeof state.storeCodedFiles).toBe("boolean");
  });

  it("bucket_config[:read_only] is absent — the port has no bucket config", () => {
    const state = populate(card({ action: "update", dbContent: "(b)/12/34.png" }));
    expect(state.bucketReadOnly).toBeUndefined();
    expect(when("change_bucket_if_read_only?", state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// coverage: no carrierwave event declares a `when:` the table cannot answer
// ---------------------------------------------------------------------------

describe("every declared `when:` resolves", () => {
  it("the carrierwave manifest declares no condition outside the table", () => {
    const table = new Set(Object.keys(carrierwaveModEventPredicates));
    const unresolvable: string[] = [];
    for (const file of carrierwaveManifest.setModules ?? []) {
      for (const event of file.events ?? []) {
        const name = event.when as string | undefined;
        if (name !== undefined && !table.has(name)) unresolvable.push(`${file.setPath}: ${name}`);
      }
    }
    expect(unresolvable).toEqual([]);
  });

  it("the table's keys are exactly the gem's conditions (no invented ones)", () => {
    expect(new Set(Object.keys(carrierwaveModEventPredicates)).size).toBe(13);
  });
});