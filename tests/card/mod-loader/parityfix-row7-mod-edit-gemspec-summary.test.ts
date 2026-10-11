// parityfix-row7-mod-edit-gemspec-summary.test.ts -- 2026-10-05
// lane-parityfixes-2026-10-05, BUG 2 (adjudicate-10-rows-lane.md row 7,
// `mod: edit`).
//
// THE BUG. The mod cardtype's :core description paragraph (card-1.110.0
// mod/core set/type/mod.rb) renders the installed gemspec's summary. The
// engine's MOD_SPECS table is a HAND-TRANSCRIBED copy of the installed
// card-mod gemspec metadata (core-admin-runtime.ts:22-26), and its `edit`
// entry carried a summary no capture ever produced:
//
//   engine : <p>decko card editing and card type management</p>
//   oracle : <p>Edit handling</p>
//
// THE EXPECTATION IS THE CAPTURE, not the engine. TWO INDEPENDENT Ruby
// captures of the live deck render `Edit handling` for `mod: edit` -- the
// 2026-09-29 yardstick vintage
// (decko-ts-pass20-int/tmp/raw-ground-truth, adjudicate-10-rows-work/old/
// mod_edit.html) and the 2026-10-05 recapture
// (tmp/raw-ground-truth/expected-v2/page-lane), byte-for-byte identical on
// this page after the committed close-71 asset-host mapping
// (adjudicate-10-rows-lane.md evidence chain point 2). Two captures beat
// one transcription.
//
// WHAT IS *NOT* CLAIMED. The gem is not installed in this worktree, so the
// gemspec file that supplies `Edit handling` was NOT re-derived here -- no
// *.gemspec was read, no bundle was inspected. What is pinned is the
// RENDERED string: the page carries the capture's bytes. Provenance of the
// Ruby source remains open, and is recorded as such in the receipt.
//
// Two blocks:
//   1. THE CONSTANT (fast, always runs): MOD_SPECS.edit.summary is the
//      capture-attested string. RED while it is the transcription.
//   2. THE RENDERED BYTES (corpus replay, gated): the `mod: edit` page
//      carries `<p>Edit handling</p>` and does NOT carry the transcription.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOD_SPECS } from "../../../src/card/mod-loader/mods/core-admin-runtime.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

/** The two independent Ruby captures agree on this string. */
const CAPTURED_SUMMARY = "Edit handling";

/** The hand-transcribed string the engine rendered instead. */
const TRANSCRIBED_SUMMARY = "decko card editing and card type management";

describe("mod: edit gemspec summary (adjudicate row 7)", () => {
  it("MOD_SPECS.edit.summary is the string two independent Ruby captures render", () => {
    expect(MOD_SPECS.edit?.summary).toBe(CAPTURED_SUMMARY);
    expect(MOD_SPECS.edit?.summary).not.toBe(TRANSCRIBED_SUMMARY);
  });

  it("keeps the rest of the edit gemspec metadata the page renders", () => {
    // Scoped pin: the fix is the summary string ONLY. gem/version/deps are
    // the other fields type/mod.rb renders from the same spec, and this
    // lane did not re-derive any of them.
    expect(MOD_SPECS.edit?.gem).toBe("card-mod-edit");
    expect(MOD_SPECS.edit?.version).toBe("0.20.0");
  });
});

/** The rendered-bytes block: a machine-local corpus replay. It boots the
 *  47k-card raw deck (~20 s) and renders ONE page, so it is gated behind
 *  PARITYFIX_REPLAY=1 and skipped on ordinary suite runs. */
const REPLAY = process.env.PARITYFIX_REPLAY === "1";
const CORPUS_PRESENT = existsSync(
  new URL(
    "../../../tmp/raw-ground-truth/bench-corpus-raw.sqlite3",
    import.meta.url,
  ).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);

describeOrSkipLoud(!REPLAY || !CORPUS_PRESENT, "tests/card/mod-loader/parityfix-row7-mod-edit-gemspec-summary.test.ts", "not (!REPLAY || !CORPUS_PRESENT)")("mod: edit page bytes (corpus replay)", () => {
  it("renders the captured summary paragraph, not the transcription", async () => {
    const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
      "../render/raw-corpus-seeding.js"
    );
    const views = await import("../../../src/card/render/views.js");
    views.setDeploymentCloudAssetHost(
      "https://production-storage.r1.cdn.objectstore.example",
    );
    const Database = (await import("better-sqlite3")).default;
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const ids = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all()
        .map((r: unknown) => (r as { id: number }).id);
    idLister.close();
    const storage = await createRawStructureSeededStorage(new Set(ids));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(ids);
    try {
      const html = await storage.engine.renderPage("mod: edit");
      const body =
        '<div class="d0-card-body d0-card-content ALL TYPE-mod SELF-mod_edit"><p>';
      expect(html).toContain(`${body}${CAPTURED_SUMMARY}</p>`);
      expect(html).not.toContain(`${body}${TRANSCRIBED_SUMMARY}</p>`);
    } finally {
      storage.close();
    }
  }, 900_000);
});