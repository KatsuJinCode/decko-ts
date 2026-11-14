// The card-mod-carrierwave event chain: every event the Ruby set modules
// declare into the manifest — the 19 literal `event :name` declarations
// plus the TEN concrete events the gem's card_mount template loads at
// runtime (lib/carrier_wave/card_mount.rb:32-53 — `event :store_#{column}_event`
// etc., one set per attachment column, so 5 names x {file, image}).
//
// Proof shape:
//   WITHOUT the mod: a mod-less loader's event registry holds none of the
//     names (the declarations are the port; removing them fails here).
//   WITH the mod: all names declare from their gem set files with the
//     gem's verbatim metadata (stage/trigger/when/after/skip/priority);
//     the engine-owned bodies are cited at the declarations and their
//     observable halves are pinned by the attachment save suite — this
//     file pins the DECLARATION surface those bodies hang off.

import { describe, it, expect, afterAll } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModCarrierwave from "../../../src/card/mod-loader/mods/card-mod-carrierwave.js";

/** Every event declaration in the manifest, flattened with the declaring
 *  set path. */
function declaredEvents(): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of cardModCarrierwave.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

/** The 19 literal `event :name` declarations the carrierwave set files
 *  make. The five card_mount templates moved to ruby.dynamicEventTemplates. */
const LITERAL_19 = [
  "assign_attachment_on_create",
  "assign_attachment_on_update",
  "change_bucket_if_read_only",
  "clear_draft_files",
  "correct_identifier",
  "delete_cached_upload_file_on_create",
  "delete_cached_upload_file_on_update",
  "prepare_attachment",
  "remove_public_link_on_delete",
  "update_public_link",
  "update_public_link_on_create",
  "update_storage",
  "validate_coded_storage_type",
  "validate_file_exist",
  "validate_storage_type",
  "write_identifier",
  "save_original_filename",
  "select_file_revision",
  "uncode_attachment_storage",
] as const;

/** The ten concrete card_mount events (5 templates x 2 columns). */
const CARD_MOUNT_10 = [
  "store_file_event",
  "store_image_event",
  "remove_file_event",
  "remove_image_event",
  "mark_remove_file_false_event",
  "mark_remove_image_false_event",
  "reset_previous_changes_for_file_event",
  "reset_previous_changes_for_image_event",
  "remove_previously_stored_file_event",
  "remove_previously_stored_image_event",
] as const;

/** The empty manifest stand-in for the WITHOUT arm. */
const EMPTY_MANIFEST: DeckoModManifest = { name: "eventless", group: "gem-defaults", setModules: [] };

let loader: ModLoader | undefined;
afterAll(() => {
  loader?.reset();
});

describe("card-mod-carrierwave event declarations (A/B)", () => {
  it("WITHOUT the mod: the registry holds none of the events", () => {
    const bare = new ModLoader([{ manifest: EMPTY_MANIFEST }]);
    bare.load();
    const names = bare.eventRegistry().all().map((e) => e.event);
    for (const name of [...LITERAL_19, ...CARD_MOUNT_10]) {
      expect(names).not.toContain(name);
    }
    bare.reset();
  });

  it("WITH the mod: all 19 literal names + the 10 concrete card_mount events declare", () => {
    const names = declaredEvents().map((e) => e.event as string);
    for (const name of LITERAL_19) {
      expect(names, `${name} missing from the carrierwave manifest`).toContain(name);
    }
    for (const name of CARD_MOUNT_10) {
      expect(names, `${name} (the card_mount template's concrete event) missing`).toContain(name);
    }
    expect(new Set(names).size).toBe(29);
  });

  it("each event declares from its gem set file", () => {
    const byFile = new Map(declaredEvents().map((e) => [e.event as string, e.setPath as string]));
    // abstract/attachment.rb
    expect(byFile.get("select_file_revision")).toBe("abstract/attachment");
    expect(byFile.get("correct_identifier")).toBe("abstract/attachment");
    expect(byFile.get("save_original_filename")).toBe("abstract/attachment");
    expect(byFile.get("validate_file_exist")).toBe("abstract/attachment");
    expect(byFile.get("write_identifier")).toBe("abstract/attachment");
    // abstract/attachment/00_upload_cache.rb
    expect(byFile.get("prepare_attachment")).toBe("abstract/attachment/00_upload_cache");
    expect(byFile.get("assign_attachment_on_create")).toBe("abstract/attachment/00_upload_cache");
    expect(byFile.get("assign_attachment_on_update")).toBe("abstract/attachment/00_upload_cache");
    expect(byFile.get("delete_cached_upload_file_on_create")).toBe("abstract/attachment/00_upload_cache");
    expect(byFile.get("clear_draft_files")).toBe("abstract/attachment/00_upload_cache");
    expect(byFile.get("delete_cached_upload_file_on_update")).toBe("abstract/attachment/00_upload_cache");
    // abstract/attachment/01_storage_type.rb
    expect(byFile.get("update_storage")).toBe("abstract/attachment/01_storage_type");
    expect(byFile.get("validate_storage_type")).toBe("abstract/attachment/01_storage_type");
    // cloud.rb / coded.rb / local.rb
    expect(byFile.get("change_bucket_if_read_only")).toBe("abstract/attachment/cloud");
    expect(byFile.get("uncode_attachment_storage")).toBe("abstract/attachment/coded");
    expect(byFile.get("validate_coded_storage_type")).toBe("abstract/attachment/coded");
    expect(byFile.get("update_public_link_on_create")).toBe("abstract/attachment/local");
    expect(byFile.get("remove_public_link_on_delete")).toBe("abstract/attachment/local");
    expect(byFile.get("update_public_link")).toBe("abstract/attachment/local");
    // the card_mount events ride the host sets (Type::File / Type::Image)
    expect(byFile.get("store_file_event")).toBe("type/file");
    expect(byFile.get("remove_previously_stored_file_event")).toBe("type/file");
    expect(byFile.get("store_image_event")).toBe("type/image");
    expect(byFile.get("mark_remove_image_false_event")).toBe("type/image");
  });

  it("carries the gem's stage/trigger metadata verbatim", () => {
    const byName = new Map(declaredEvents().map((e) => [e.event as string, e]));
    // attachment.rb:9 `event :select_file_revision, after: :select_action`
    expect(byName.get("select_file_revision")).toMatchObject({ after: "select_action" });
    // attachment.rb:15 `event :correct_identifier, :finalize, on: :save,
    // when: :incorrect_identifier?`
    expect(byName.get("correct_identifier")).toMatchObject({
      at: "finalize",
      on: ["save"],
      when: "incorrect_identifier?",
    });
    // attachment.rb:20 `event :save_original_filename, :prepare_to_store,
    // on: :save, when: :file_ready_to_save?`
    expect(byName.get("save_original_filename")).toMatchObject({
      at: "prepare_to_store",
      on: ["save"],
      when: "file_ready_to_save?",
    });
    // attachment.rb:26 `event :validate_file_exist, :validate, on: :create,
    // skip: :allowed`
    expect(byName.get("validate_file_exist")).toMatchObject({
      at: "validate",
      on: ["create"],
      skip: "allowed",
    });
    // attachment.rb:36 `event :write_identifier, after:
    // :save_original_filename, when: :write_identifier?`
    expect(byName.get("write_identifier")).toMatchObject({
      after: "save_original_filename",
      when: "write_identifier?",
    });
    // 00_upload_cache.rb:8/:27/:36/:51/:62/:66
    expect(byName.get("prepare_attachment")).toMatchObject({
      at: "prepare_to_validate",
      on: ["save"],
      when: "preliminary_upload?",
    });
    expect(byName.get("assign_attachment_on_create")).toMatchObject({
      at: "initialize",
      after: "assign_action",
      on: ["create"],
      when: "save_preliminary_upload?",
    });
    expect(byName.get("assign_attachment_on_update")).toMatchObject({
      at: "initialize",
      after: "assign_action",
      on: ["update"],
      when: "save_preliminary_upload?",
    });
    expect(byName.get("delete_cached_upload_file_on_create")).toMatchObject({
      at: "integrate",
      on: ["create"],
      when: "save_preliminary_upload?",
    });
    expect(byName.get("clear_draft_files")).toMatchObject({
      at: "integrate_with_delay",
      priority: 100,
      on: ["create"],
    });
    expect(byName.get("delete_cached_upload_file_on_update")).toMatchObject({
      at: "integrate",
      on: ["update"],
      when: "save_preliminary_upload?",
    });
    // 01_storage_type.rb:3/:8
    expect(byName.get("update_storage")).toMatchObject({
      at: "store",
      on: ["update"],
      when: "storage_changed?",
    });
    expect(byName.get("validate_storage_type")).toMatchObject({ at: "validate", on: ["save"] });
    // cloud.rb:3 / coded.rb:3/:7
    expect(byName.get("change_bucket_if_read_only")).toMatchObject({
      at: "initialize",
      on: ["update"],
      when: "change_bucket_if_read_only?",
    });
    expect(byName.get("uncode_attachment_storage")).toMatchObject({
      at: "initialize",
      on: ["update"],
      when: "uncode?",
    });
    expect(byName.get("validate_coded_storage_type")).toMatchObject({
      at: "validate",
      on: ["save"],
      when: "coded?",
    });
    // local.rb:1/:5/:9
    expect(byName.get("update_public_link_on_create")).toMatchObject({
      at: "integrate",
      on: ["create"],
      when: "local?",
    });
    expect(byName.get("remove_public_link_on_delete")).toMatchObject({
      at: "integrate",
      on: ["delete"],
      when: "local?",
    });
    expect(byName.get("update_public_link")).toMatchObject({
      after: "update_read_rule",
      when: "local?",
    });
    // card_mount.rb:32/:37/:41/:45/:50 (per column)
    expect(byName.get("store_file_event")).toMatchObject({ at: "finalize", when: "store_file_event?" });
    expect(byName.get("remove_image_event")).toMatchObject({
      at: "finalize",
      on: ["delete"],
      when: "no_history?",
    });
    expect(byName.get("mark_remove_file_false_event")).toMatchObject({ at: "finalize", on: ["update"] });
    expect(byName.get("reset_previous_changes_for_image_event")).toMatchObject({
      at: "finalize",
      when: "no_history?",
    });
    expect(byName.get("remove_previously_stored_image_event")).toMatchObject({
      at: "finalize",
      on: ["update"],
      when: "no_history?",
    });
  });

  it("the loader registers the chain with set + mod coordinates injected", () => {
    loader = new ModLoader([{ manifest: cardModCarrierwave }]);
    loader.load();
    const registry = loader.eventRegistry();
    for (const name of [...LITERAL_19, ...CARD_MOUNT_10]) {
      const reg = registry.all().find((e) => e.event === name);
      expect(reg, `${name} not registered by the loader`).toBeDefined();
      expect(reg!.modName).toBe("carrierwave");
    }
    // spot-pin the coordinate injection (the abstract pattern path)
    expect(registry.forEvent("write_identifier")!.setPath).toBe("abstract/attachment");
  });
});
