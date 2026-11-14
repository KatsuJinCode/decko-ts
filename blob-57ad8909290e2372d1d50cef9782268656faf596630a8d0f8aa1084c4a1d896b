// Register entry 33 (card-mod-virtual): the gem's declaration surface, and
// the NAMED SKIP on the two event bodies.
//
// card-mod-virtual-0.20.0 is one set file and one lib file:
//
//   set/abstract/virtual_cache.rb  - virtual?/virtual_content/db_content/
//                                    updated_at, the two prepare_to_store
//                                    events, history?/followable? false,
//                                    delete/delete! as update trash: true
//   lib/card/virtual.rb            - the Card::Virtual record model over
//                                    card_virtuals
//
// Ground truth is extracted from those two files by the committed script
// tests/card/mod-loader/oracle-capture-virtual-declarations.rb and committed
// as fixtures/virtual-declarations.json. That is what the port's manifest is
// compared against here; card-mod-virtual.test.ts is where the BODIES are
// proven against real storage (save/fetch/delete/touch, the side-id keying,
// validate_card's raise shape).
//
// This suite pins the three things that suite cannot see from behaviour:
//  1. the declaration counts and names, measured from the gem's own source;
//  2. that the port registers no view and no include the gem does not
//     declare;
//  3. the NAMED SKIP: both registered fns are no-ops that change nothing,
//     and the measured cause is written down where the skip lives.
//
// WHY the skip is real (not a missing wire). Ruby's bodies are
// `Virtual.save self; abort :success` (virtual_cache.rb:21-24) and
// `Virtual.delete self; abort :success unless real?` (:26-29). The abort
// unwinds the save BEFORE the cards-table write, so a virtual card's content
// lands in card_virtuals and the act ends - no cards row, no store, no
// history. The port's write path composes real rows through the ActWriter and
// has no such diversion: wiring only the Virtual half would run
// Virtual.save AND the row write, which Ruby's shape never produces. The
// events lane recorded the same verdict on 2026-09-19 in commit 8ec17a8c on
// port/events-last-third-20261019, "Mark save_virtual_content and
// delete_virtual_content SKIPPED: the write-path diversion they require is
// not the port's architecture". What IS missing is routing, not logic: the
// driver-shaped bodies exist and are proven (virtualSave/virtualDelete,
// wired helpers at card-mod-virtual.ts:456-477).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModVirtual, {
  VIRTUAL_EVENT_DECLARATIONS,
  VIRTUAL_FOLLOWABLE_ENABLED,
  VIRTUAL_HISTORY_ENABLED,
  deleteVirtualContentEventFn,
  saveVirtualContentEventFn,
} from "../../../src/card/mod-loader/mods/card-mod-virtual.js";

interface DeclarationFile {
  file: string;
  set_path: string | null;
  events: { line: number; name: string; args: string }[];
  views: { line: number; name: string }[];
  includes: { line: number; target: string }[];
  defs: { line: number; name: string }[];
}

const DECLARED: DeclarationFile[] = JSON.parse(
  readFileSync(new URL("fixtures/virtual-declarations.json", import.meta.url), "utf8"),
);
const setFile = DECLARED.find((f) => f.file === "virtual_cache.rb")!;
const libFile = DECLARED.find((f) => f.file === "virtual.rb")!;

describe("virtual register entry 33: the declared surface matches the gem's files", () => {
  it("the gem declares one set module, two events, zero views, zero includes", () => {
    expect(DECLARED.map((f) => f.file)).toEqual(["virtual_cache.rb", "virtual.rb"]);
    expect(setFile.set_path).toBe("abstract/virtual_cache");
    expect(libFile.set_path).toBeNull(); // a lib file, not a set file
    expect(setFile.events.map((e) => e.name)).toEqual([
      "save_virtual_content",
      "delete_virtual_content",
    ]);
    expect(setFile.views).toEqual([]);
    expect(setFile.includes).toEqual([]);
  });

  it("the port registers exactly that one set module with those two events", () => {
    expect(cardModVirtual.setModules!.map((m) => m.setPath)).toEqual(["abstract/virtual_cache"]);
    const module = cardModVirtual.setModules![0]!;
    expect(module.formats).toBeUndefined();
    // the fields themselves do not exist on ModSetModuleFile
    expect(Object.keys(module)).not.toContain("setPatterns");
    expect(Object.keys(module)).not.toContain("views");
    expect(module.events!.map((e) => `${e.event} @${e.at} on:${(e.on ?? []).join(",")}`)).toEqual([
      "save_virtual_content @prepare_to_store on:save",
      "delete_virtual_content @prepare_to_store on:delete",
    ]);
  });

  it("the stage and trigger words come from the gem's own declaration lines", () => {
    // Measured, not transcribed: each port record's stage and trigger are
    // read back out of the Ruby args string the capture emitted.
    const module = cardModVirtual.setModules![0]!;
    setFile.events.forEach((ruby, i) => {
      const port = module.events![i]!;
      const stage = ruby.args.match(/^:([a-z_]+)/)?.[1];
      const on = ruby.args.match(/on:\s*:([a-z_]+)/)?.[1];
      expect(port.at).toBe(stage);
      expect(port.on).toEqual(on === undefined ? [] : [on]);
    });
    // and the citation record agrees with both
    expect(VIRTUAL_EVENT_DECLARATIONS.map((d) => `${d.event} @${d.stage} on:${d.on}`)).toEqual(
      setFile.events.map((ruby, i) => {
        const port = module.events![i]!;
        return `${port.event} @${port.at} on:${(port.on ?? []).join(",")}`;
      }),
    );
  });

  it("the gem's method surface is the one the port exports", () => {
    // virtual_cache.rb's eight defs, measured. The port carries the two
    // constant-false predicates as named constants and the rest as
    // functions; this pins the PREDICATE pair, which is the pair a reader
    // would otherwise have to take on faith.
    expect(setFile.defs.map((d) => d.name)).toEqual([
      "virtual?",
      "virtual_content",
      "db_content",
      "updated_at",
      "history?",
      "followable?",
      "delete",
      "delete!",
    ]);
    expect(VIRTUAL_HISTORY_ENABLED).toBe(false);
    expect(VIRTUAL_FOLLOWABLE_ENABLED).toBe(false);
  });

  it("NAMED SKIP: both registered fns are no-ops - Virtual.save/delete plus the abort diversion", () => {
    // The skip is written into each fn's own source comment
    // (card-mod-virtual.ts:522-532 and :547-553) and pinned here: a fn that
    // starts doing driver work without the write-path diversion would
    // produce state Ruby's abort shape never produces, and this fails first.
    const host = {} as never;
    const card = {} as never;
    const ctx = {} as never;
    expect(saveVirtualContentEventFn(card, host, ctx)).toBeUndefined();
    expect(deleteVirtualContentEventFn(card, host, ctx)).toBeUndefined();
  });

  it("the gem's lib file declares the Card::Virtual record API the port ports", () => {
    // lib/card/virtual.rb: update, card_id, cardname, fetch, save, delete,
    // cache, create_or_update, create, find_by_card, where_card, left_id,
    // right_id, validate_card - 14 defs, measured.
    expect(libFile.defs.map((d) => d.name).sort()).toEqual([
      "cache",
      "card_id",
      "cardname",
      "create",
      "create_or_update",
      "delete",
      "fetch",
      "find_by_card",
      "left_id",
      "right_id",
      "save",
      "update",
      "validate_card",
      "where_card",
    ]);
  });
});