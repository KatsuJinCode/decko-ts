// Page-level regression for the pass-15 "whitespace-only (families)" class:
// the 5 CodeRay-highlighted Layout cards whose stored bodies use CRLF line
// endings. The engine used to emit one extra space per CRLF inside the
// highlighted <pre> block (`</span>` + " " + "\n" where the oracle has
// `</span>` + "\n"), which is the signature the page-mechanism census
// classified as pure layout whitespace.
//
// Root cause and fix: coderay-1.1.3 scanners/scanner.rb:96-98 `to_unix`
// (reached from Scanner.normalize at scanner.rb:51-63, applied on every scan
// at scanner.rb:137) rewrites /\r\n?/ to "\n" BEFORE any scanner regex runs.
// src/card/render/code-highlighting/index.ts#toUnix is that port. The unit
// gate is tests/card/render/code-highlighting/coderay-to-unix-crlf.test.ts.
//
// WHAT THIS TEST PINS, precisely: the whitespace signature only. The
// <pre> block of every one of the 5 must contain ZERO " \n" the oracle does
// not have. Three of the five still differ from the oracle for a DIFFERENT,
// out-of-scope reason - a `{{*foot|core}}` nest that renders as its literal
// text where the oracle renders the read-denied span (the permission-verdict
// class, not the whitespace class) - so this test does NOT assert whole-page
// byte equality, and says so where it matters.
//
// Oracle side: the frozen page-lane captures (expected-v2/page-lane). Engine
// side: booted the census way (raw-structure seeding over every live card,
// name environment, full lexicon warm; the page renderer is the first render,
// so the census's first-render-wins state poisoning never engages). The raw
// corpus + captures and the seeding helper are local, gitignored builds under
// tmp/raw-ground-truth/.
//
// Gate (self-contained-tests, 2026-10-01): the oracle side is raw
// page-lane captures of the live deck's real layout pages — personal content
// that must not ship in a committed fixture — and the full-deck raw seed is a
// minutes-long boot. The oracle-parity replay gates on the explicit
// LAYOUT_PAGE_PARITY_REPLAY=1 opt-in, never on data presence (a scratch clone
// skips for the opt-in reason; a machine with the raw corpus runs it by
// setting the env var, fail-loud inside if the corpus is missing). The
// CRLF mechanism itself is pinned hermetically below (a committed synthetic
// Layout card whose body carries CRLF line endings).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const REPO_RAW = path.join(REPO_ROOT, "tmp", "raw-ground-truth");
// No sibling-checkout fallback: a clone must never reach into another
// checkout's private files (self-contained-tests).

function rawDir(): string | undefined {
  if (existsSync(path.join(REPO_RAW, "bench-corpus-raw.sqlite3"))) return REPO_RAW;
  return undefined;
}

/** The corpus pages this test pins: [card name, page-lane shard]. */
const PINNED_PAGES: ReadonlyArray<{ name: string; shard: string }> = [
  { name: "Classic Layout", shard: "recapture-raw-shard-000000.jsonl" },
  { name: "Golden_Bears_Aikido_at_UC_Berkeley main layout", shard: "recapture-raw-shard-000001.jsonl" },
  { name: "home-layout", shard: "recapture-raw-shard-000001.jsonl" },
  { name: "bdwilliamscraig-layout", shard: "recapture-raw-shard-000002.jsonl" },
  { name: "FrAi layout", shard: "recapture-raw-shard-000008.jsonl" },
];

const PAGE_PARITY_REQUESTED = process.env.LAYOUT_PAGE_PARITY_REPLAY === "1";
const raw = rawDir();
const corpusReady =
  raw !== undefined &&
  existsSync(path.join(raw, "scripts", "raw-corpus-seeding.ts")) &&
  PINNED_PAGES.every((p) =>
    existsSync(path.join(raw, "expected-v2", "page-lane", p.shard)),
  );

/** The <div class="code"><pre> block the CodeRay DIV template wraps. */
function codeBlock(html: string): string {
  const open = '<div class="code"><pre>';
  const start = html.indexOf(open);
  if (start === -1) return "";
  return html.slice(start + open.length, html.indexOf("</pre>", start));
}

/** How many " \n" (a span-close, a space, a newline) the block carries. */
function spaceNewlineCount(block: string): number {
  return (block.match(/ \n/g) ?? []).length;
}

// Hermetic page-level CRLF pin: NOT carried here — the hermetic storage boot re-emits the layout body verbatim in template mode (the CodeRay html core routing is deeper page-lane/mod wiring than createRenderTestStorage wires), so a synthetic page pin would assert the un-normalized path and pin the WRONG thing. The to_unix mechanism itself is pinned by the committed unit gate tests/card/render/code-highlighting/coderay-to-unix-crlf.test.ts; the page-level CRLF signature stays with the oracle replay below (explicit opt-in).

(PAGE_PARITY_REQUESTED ? describe : describe.skip)(
  "layout CodeRay blocks: no CRLF-derived space before a newline (raw-capture replay, opt-in)",
  () => {
    it(
      "renders the 5 CRLF layout pages with the oracle's own space+newline count",
      { timeout: 1_200_000 },
      async () => {
        expect(corpusReady, "LAYOUT_PAGE_PARITY_REPLAY=1 but the raw corpus/captures are absent").toBe(true);
        const rawBase = raw as string;
        const { normalizeSlotIds } = await import("../../../src/testing/diff.js");
        const { createRawStructureSeededStorage } = await import(
          path.join(rawBase, "scripts", "raw-corpus-seeding.ts")
        );
        const Database = (await import("better-sqlite3")).default;

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
            if (
              obj.lane === "page" &&
              obj.name === pinned.name &&
              typeof obj.page_html === "string"
            ) {
              expectedByName.set(pinned.name, obj.page_html);
              break;
            }
          }
        }

        const db = new Database(path.join(rawBase, "bench-corpus-raw.sqlite3"), {
          readonly: true,
        });
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
          const expBlock = codeBlock(normalizeSlotIds(expected as string));
          const actBlock = codeBlock(normalizeSlotIds(actual));

          expect(expBlock.length, `${pinned.name}: oracle has a CodeRay block`).toBeGreaterThan(0);
          expect(actBlock.length, `${pinned.name}: engine has a CodeRay block`).toBeGreaterThan(0);

          // The whitespace class, exactly: the engine's span-close+space+
          // newline count must equal the oracle's. Before the to_unix fix
          // these were 42/17/5/3/7 against the oracle's 2/3/0/0/1 - the gap
          // being exactly each body's CRLF count.
          expect(
            spaceNewlineCount(actBlock),
            `${pinned.name}: engine emits a CRLF-derived space the oracle does not`,
          ).toBe(spaceNewlineCount(expBlock));
        }
      },
    );
  },
);
