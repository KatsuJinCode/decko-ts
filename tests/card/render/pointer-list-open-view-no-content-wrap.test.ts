// Pin the byte-level fix for the extra `<div id="X-content-view" class="card-slot
// content-view …">` wrap the TS engine emitted inside the open-view's
// accordion-body for pointer/list cardtypes (permfix48 family
// `unclassified:L/~/exp=c/act=i`, 2270 sample/scaled).
//
// Symptom corpus:6551 (shard-000003.jsonl:359, *star+*create list rule with
// permission right *create, render:open). The fixture expects the
// accordion-body to contain `<div class="pointer-list">` directly; the
// pre-fix TS engine emitted `<div id="Xstar-Xcreate-content-view" class="
// card-slot content-view …">` first, then the pointer-list. Diff character
// at the first-divergence offset is `c` (expected, start of `class=`) vs
// `i` (actual, start of `id=`). Size delta ~560 bytes — exactly the
// content-view slot-wrap.
//
// Source: card-mod-bar_and_box-0.20.0 set/all/bar.rb:9-18 view :bar_bottom
// `render :content, home_view: :content`. For pointer/list cardtypes the
// captured Ruby's render :content does NOT emit the slot-wrap that the
// html.rb content view normally wraps around `render_core`. The TS engine
// emitted the wrap unconditionally via contentView -> slotWrapCommon
// ("content", …); the fix bypasses contentView for pointer/list cards and
// renders the core directly. Per-item slots still dispatch through
// renderPointerListItem with `view:"bar"` in their data-slot — the change
// is strictly the outer accordion-body wrapper, not the per-item
// mini_bar slots.
//
// Cross-shard survey (per the working diagnosis from this lane): the 2270
// sample/scaled entries are ALL rule cards whose right is one of
// *create / *read / *update / *delete — the corpus:6551-7118 range in
// shard-000003 plus the parallel entries in shard-000004 (every entry in
// the bucket has `id >= 6551` and the same diff character pair `c/i`).

import { describe, it, expect, afterAll } from "vitest";
import {
  createStructureSeededStorageFor,
  readShardLines,
} from "./structure-corpus-seeding.js";
import { type RenderTestStorage, seedCard } from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

describe("pointer/list open-view accordion-body omits the content-view slot wrap (permfix48 family: unclassified:L/~/exp=c/act=i)", () => {
  it(
    "*star+*create list rule open view: accordion-body contains the pointer-list directly (no X-content-view wrap)",
    async () => {
      // corpus:6551 *star+*create (the family anchor). Seed the card +
      // its type card + its read rule (mirror the pointer-list-trailing-
      // newline.test.ts seeding shape for the same family).
      const baseIds = new Set(readShardLines().map((l) => l.id));
      baseIds.add(6551);
      baseIds.add(6568);
      storage = await createStructureSeededStorageFor(baseIds);
      await seedCard(storage, {
        id: 9010,
        name: "irjkznnbpewjpr",
        typeId: 22281,
        readRuleId: 6568,
        readRuleClass: "*all",
      });
      await seedCard(storage, {
        id: 9011,
        name: "wautvrx",
        typeId: 22281,
        readRuleId: 6568,
        readRuleClass: "*all",
      });
      const html = await storage.engine.render("*star+*create", "open");
      // Sanity: the outer open-view slot is present (the test render must
      // produce a recognizable open view, not a closed stub).
      expect(html).toContain('id="Xstar-Xcreate-open-view"');
      // The accordion-body is present.
      expect(html).toContain("accordion-body");
      // The pointer-list wrapper is present (the OUTER-family pin —
      // same wrapper pointer-list-content-view.test.ts and the trailing-
      // newline test pin for content view).
      expect(html).toContain('<div class="pointer-list">');
      // The per-item mini_bar slot is present (renderPointerListItem
      // path is unchanged by this fix).
      expect(html).toContain('id="irjkznnbpewjpr-mini_bar-view"');
      // The byte-level pin (the load-bearing check): the accordion-body
      // contains the pointer-list directly, NOT inside a
      // `X-content-view` slot wrap. Pre-fix, the engine emitted
      // `<div id="Xstar-Xcreate-content-view" class="card-slot
      // content-view …"><div class="pointer-list">`; post-fix, the
      // accordion-body opens straight into the pointer-list. The
      // negative assertion pins the absence of the inner content-view
      // slot inside the accordion-body.
      const accordionBodyIdx = html.indexOf("accordion-body");
      const accordionBodySlice = html.slice(accordionBodyIdx);
      expect(accordionBodySlice).not.toContain(
        'id="Xstar-Xcreate-content-view"',
      );
      expect(accordionBodySlice).not.toContain("card-slot content-view");
      // And the positive assertion: the pointer-list opens directly
      // after the accordion-body div.
      expect(accordionBodySlice).toMatch(
        /accordion-body[^>]*>\s*<div class="pointer-list">/,
      );
    },
  );

  it(
    "*home pointer open view: accordion-body contains the card-list-bar pointer-list directly (no X-content-view wrap)",
    async () => {
      // Mirror of the corpus:6551 pin for the card-list-bar wrapper
      // branch (non-permission-right pointer cards — corpus:77 family).
      // Same fix, just exercised on the wider wrapper branch.
      const baseIds = new Set(readShardLines().map((l) => l.id));
      baseIds.add(77);
      baseIds.add(34843);
      baseIds.add(6568);
      storage = await createStructureSeededStorageFor(baseIds);
      await seedCard(storage, {
        id: 9020,
        name: "yzzw",
        typeId: 22281,
        readRuleId: 6568,
        readRuleClass: "*all",
      });
      const html = await storage.engine.render("*home", "open");
      // The card-list wrapper is in use (the *home pointer card does
      // not match the rule+permission-right shape).
      expect(html).toContain('<div class="card-list card-list-bar pointer-list">');
      // Same byte-level pin: no content-view wrap inside accordion-body.
      const accordionBodyIdx = html.indexOf("accordion-body");
      const accordionBodySlice = html.slice(accordionBodyIdx);
      expect(accordionBodySlice).not.toContain('id="Xhome-content-view"');
      expect(accordionBodySlice).not.toContain("card-slot content-view");
      expect(accordionBodySlice).toMatch(
        /accordion-body[^>]*>\s*<div class="card-list card-list-bar pointer-list">/,
      );
    },
  );
});
