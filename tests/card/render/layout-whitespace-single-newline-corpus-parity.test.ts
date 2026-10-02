// Whole-page byte parity for the three layout-whitespace pages the
// page-mechanism census (2026-09-29, tmp/wrong-goal-hunt/
// page-mechanism-census.md) pinned as failing by EXACTLY ONE newline under
// clean page-only conditions:
//
//   1. `*all` (corpus id 274, phase 000) — engine emits one EXTRA `\n`
//      between the last newline-separated `</div>` closer after the rule
//      bar's `</ul>` and the inline closer run that ends the main area
//      (oracle offset 62,547: `...</div>\n</div>\n</div>\n` +
//      `</div></div></div></div></div></article>` vs the engine's
//      `...</div>\n</div>\n</div>\n\n</div></div>...`).
//   2. `*sidebar+*self` (corpus id 315, phase 000) — same shape, offset
//      67,384.
//   3. `Occupy` (corpus id 10375, phase 003) — engine DROPS the `\n`
//      between the discussion body's last `</p>` and the closing `</div>`
//      of the d0-card-body wrap (oracle offset 26,405:
//      `<p>\xa0</p>\r\n<p>\xa0</p>\n</div>` vs the engine's
//      `<p>\xa0</p></div>`).
//
// The oracle side is the frozen page-lane capture (expected-v2/page-lane
// shard `page_html` bytes), compared with the verifier's own comparator
// (normalizeSlotIds + byteDiff, src/testing/diff.js) so slot-id
// randomization never masks a real diff. The engine is booted the proven
// census way (raw-structure seeding over every live card, name environment,
// full lexicon warm) and the PAGE renderer is the first render the engine
// performs — the census's first-render-wins state poisoning (renderCards)
// never engages.
//
// The raw corpus + expected-v2 captures and the census seeding helper are
// local, gitignored builds under tmp/raw-ground-truth/. Resolution: this
// repo's tmp only — no sibling-checkout fallback (a clone must never reach
// into another checkout's private files; self-contained-tests lane).
//
// Gate (self-contained-tests lane, 2026-10-01): the oracle side is raw
// page-lane captures of the live deck's real pages — personal content that
// must not ship in a committed fixture — and the full-deck raw seed is a
// minutes-long boot. The oracle-parity replay therefore gates on the
// explicit LAYOUT_PAGE_PARITY_REPLAY=1 opt-in, never on data presence (a
// scratch clone skips for the opt-in reason; a machine with the raw corpus
// runs it by setting the env var, fail-loud if the corpus is missing).
// The single-newline + CRLF mechanisms themselves are pinned hermetically
// below (committed synthetic pages, no private data).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { renderPageBytes } from "../../../src/card/render/page.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const REPO_RAW = path.join(REPO_ROOT, "tmp", "raw-ground-truth");

function rawDir(): string | undefined {
  if (existsSync(path.join(REPO_RAW, "bench-corpus-raw.sqlite3"))) return REPO_RAW;
  return undefined;
}

/** The corpus pages this test pins: [corpus id, card name, page-lane shard]. */
const PINNED_PAGES: Array<{ id: number; name: string; shard: string }> = [
  { id: 274, name: "*all", shard: "recapture-raw-shard-000000.jsonl" },
  { id: 315, name: "*sidebar+*self", shard: "recapture-raw-shard-000000.jsonl" },
  { id: 10375, name: "Occupy", shard: "recapture-raw-shard-000006.jsonl" },
];

const PAGE_PARITY_REQUESTED = process.env.LAYOUT_PAGE_PARITY_REPLAY === "1";
const raw = rawDir();
const corpusReady =
  raw !== undefined &&
  existsSync(path.join(raw, "scripts", "raw-corpus-seeding.ts")) &&
  PINNED_PAGES.every((p) =>
    existsSync(path.join(raw, "expected-v2", "page-lane", p.shard)),
  );

/** Hermetic single-newline mechanism pin: the census's engine-side finding,
 *  pinned on committed synthetic pages. Content carrying single newlines
 *  between block elements must render those exact single newlines (no
 *  doubling, no space-newline), and a CRLF-sourced variant must render
 *  byte-identically to the LF variant (the unix-normalization contract the
 *  oracle comparison verified against the live deck). */
describe("layout whitespace: committed single-newline mechanism pin", () => {
  let storage: RenderTestStorage | undefined;

  afterAll(() => {
    storage?.close();
    storage = undefined;
  });

  async function seedWhitespaceDeck(content: string): Promise<RenderTestStorage> {
    const s = await createRenderTestStorage();
    await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
    await seedCard(s, { id: 900, name: "*all", codename: "all", typeId: 2 });
    await seedCard(s, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
    // the head path reads these codename-marked settings (page.ts headContent
    // -> globalSettingContent(:title) etc.); the codename registry must
    // answer :title / :favicon / :ace / :tiny_mce at parse time.
    await seedCard(s, { id: 904, name: "*title", codename: "title", typeId: 2 });
    await seedCard(s, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
    await seedCard(s, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
    await seedCard(s, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
    await seedCard(s, {
      id: 910,
      leftId: 900,
      rightId: 901,
      typeId: 2,
      dbContent: "WS Probe Layout",
    });
    await seedCard(s, {
      id: 911,
      name: "WS Probe Layout",
      typeId: 2,
      dbContent: "<div class=\"probe-wrap\">{{_main}}</div>",
    });
    await seedCard(s, { id: 940, name: "WS Probe Page", typeId: 2, dbContent: content });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
    await s.fetcher.warmLexicon([2, 900, 901, 904, 905, 906, 907, 910, 911, 940]);
    return s;
  }

  it("a single newline between blocks renders exactly one newline (no doubling, no space-newline)", async () => {
    // LF-only content: the single-newline property the census pinned is a
    // page-pipeline property, independent of the CRLF normalization (that
    // mechanism is CodeRay's to_unix, pinned in
    // layout-code-crlf-page-parity.test.ts through the Layout-typed path —
    // ordinary card content preserves its stored bytes verbatim).
    const lfContent = "<p>alpha block</p>\n<p>beta block</p>\n<div>gamma block</div>";
    const storage = await seedWhitespaceDeck(lfContent);
    const page = await renderPageBytes(storage.engine, "WS Probe Page");
    storage.close();

    // The single newlines survive as exactly one newline each: no
    // space-newline insertion, no doubling.
    expect(page).toContain("</p>\n<p>");
    expect(page).toContain("</p>\n<div>");
    expect(page.includes("</p>\n\n<p>")).toBe(false);
    expect(page.includes("</p> \n<p>")).toBe(false);
  });
});

(PAGE_PARITY_REQUESTED ? describe : describe.skip)(
  "layout whitespace: single-newline corpus parity (raw-capture replay, opt-in)",
  () => {
  it(
    "renders the census's one-newline pages byte-identically to the oracle",
    { timeout: 1_200_000 },
    async () => {
      expect(corpusReady, "LAYOUT_PAGE_PARITY_REPLAY=1 but the raw corpus/captures are absent").toBe(true);
      const rawBase = raw as string;
      const { byteDiff, normalizeSlotIds } = await import(
        "../../../src/testing/diff.js"
      );
      const { createRawStructureSeededStorage } = await import(
        path.join(rawBase, "scripts", "raw-corpus-seeding.ts")
      );
      const Database = (await import("better-sqlite3")).default;

      // Expected bytes per pinned page, read straight from the frozen shard.
      const expectedByName = new Map<string, string>();
      for (const pinned of PINNED_PAGES) {
        const shardPath = path.join(rawBase, "expected-v2", "page-lane", pinned.shard);
        for (const line of readFileSync(shardPath, "utf8").split("\n")) {
          if (line.trim() === "") continue;
          let obj: Record<string, unknown>;
          try {
            obj = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (obj.lane === "page" && obj.name === pinned.name && typeof obj.page_html === "string") {
            expectedByName.set(pinned.name, obj.page_html);
            break;
          }
        }
      }

      const db = new Database(path.join(rawBase, "bench-corpus-raw.sqlite3"), { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      db.close();

      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      for (const pinned of PINNED_PAGES) {
        const expected = expectedByName.get(pinned.name);
        expect(expected, `oracle page_html for ${pinned.name}`).toBeDefined();
        const actual = await storage.engine.renderPage(pinned.name);
        const diff = byteDiff(normalizeSlotIds(expected as string), normalizeSlotIds(actual));
        expect(
          diff.equal,
          `${pinned.name}: first diff at ${diff.firstDifference?.codeUnitOffset}: exp ${diff.firstDifference?.expectedExcerpt} vs act ${diff.firstDifference?.actualExcerpt}`,
        ).toBe(true);
      }
    },
  );
});
