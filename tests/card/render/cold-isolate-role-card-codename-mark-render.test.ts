// Cold-isolate role-card render survives a ":codename" mark in the card's
// own content - the parity-harness lane's S3 finding (edge URLs
// /Administrator/open, /Eagle/open, /Shark/open all 500 with
// "codename doesn't exist: members"; receipt
// WORK_DIR/edge-parity-harness-lane.md §6).
//
// Mechanism (traced 2026-10-02, receipt codename-warmup-fix-lane.md): Ruby's
// Card::Name parse of a ":codename" mark cannot fail while the codename
// exists, because the codehash loads synchronously on first use
// (codename.rb#load_codehash). The TS port's sync substitute is the process
// name environment (src/card/fetch.ts installNameEnvironment) whose
// adapters peek the loaded codehash memo - and every production boot must
// install + warm it explicitly (deploy/worker.ts:235-238,
// vm-staging-server.mjs:1186-1188). A boot that forgets the prime (the
// Bunny edge entry did) leaves getNameEnvironment() undefined, and
// DeckoName.idFromString (src/card/name.ts:257-259) then throws
// CodenameNotFoundError for a row that exists in the db - the role cards'
// `[[_left+:members|Administrators]]` content is the corpus shape that
// parses a mark.
//
// The engine fix under pin here: FetchEngine installs the environment by
// DEFAULT at construction, so any cold isolate answers a codename-mark
// parse from the codehash the render path itself folds (render.ts
// parseRuleTypeIds runs before the view dispatch that parses content) -
// no boot-side cooperation required. Warming (warmLexicon) stays the
// boot's explicit choice; this pin only requires no-throw on a row that
// exists, which is Ruby's contract.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

/** The harness S3 shape in miniature: a role cardtype, the codenamed
 *  *members row, and a role card whose content carries the exact trial-db
 *  link `[[_left+:members|Administrators]]`. NO installNameEnvironment
 *  call, NO warmLexicon call, NO ensureLoaded call - the pure
 *  construction-default boot the edge isolate ran. */
async function seedColdRoleCardDeck(): Promise<RenderTestStorage> {
  // A test file may run after another file's engine installed the global
  // environment (module state is process-wide); reset to the bare-boot
  // state this pin is about.
  setNameEnvironment(undefined);
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 5, name: "Cardtype", codename: "cardtype", typeId: 5 });
  await seedCard(storage, { id: 7, name: "Role", codename: "role", typeId: 5 });
  // The codenamed row that EXISTS in the db (the harness verified the trial
  // db's codehash SQL returns it: 22 rows including 'members').
  await seedCard(storage, { id: 98, name: "*members", codename: "members", typeId: 2 });
  // The role card: codename-mark LINK in its OWN content (the trial shape,
  // edge-parity-harness-lane.md §6: Administrator/Eagle/Shark content).
  await seedCard(storage, {
    id: 200,
    name: "Administrator",
    typeId: 7,
    dbContent: "[[_left+:members|Administrators]] can create, read, update and delete any card.",
  });
  return storage;
}

describe("cold-isolate role-card render with a codename mark in content", () => {
  it("renders :members without a boot-side environment install or warm", async () => {
    const storage = await seedColdRoleCardDeck();
    try {
      // The bare render() entry - the Bunny edge's exact call
      // (bunny-edge-engine-entry.ts:233 deck.render.render(name, view)).
      const html = await storage.engine.render("Administrator", "open");
      expect(html).toContain("Administrators");
      expect(html).toContain("can create, read, update and delete any card.");
    } finally {
      storage.close();
      setNameEnvironment(undefined);
    }
  });
});
