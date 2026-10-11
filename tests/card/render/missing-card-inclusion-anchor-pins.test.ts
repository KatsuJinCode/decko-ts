// missing-card-inclusion-anchor-pins.test.ts — the inclusion-fix
// lane's byte pins for the regression family entry dual-lane-page:message-000004:page
// (family "missing-card content inclusion renders empty (no wanted-card
// anchor)", the single-entry engine remainder the remaining-attribution note
// .json:1233). Env gate MISSING_CARD_INCLUSION_ANCHOR_PINS=1 keeps it out of every
// normal suite run.
//
// GRADED RECORD (5e603ba4-full-fails.json:1660, the captured evidence this
// suite reproduces): first difference at code-unit offset 8961: expected "a"
// but got "/" — the corpus opens the wanted-card anchor where the engine
// renders `<p></p>`; sizes: expected 19129 bytes, actual 18913 bytes
// (-216 = exactly the anchor, pinned by construction in the anchor-length
// it below).
//
// Ruby derivation (gems at C:/Ruby33-x64, read verbatim this lane; full
// chain in the lane recorded result): the outer nest `{{+conversation|labeled|link}}`
// folds `|link` into items:{view:"link"} (chunk/nest.rb:19-49); the missing
// +conversation renders view :labeled AS ITSELF (html/views.rb:67 `unknown:
// :labeled`); its structure content `<p>{{_left+conversation search}}</p>...
//` (bench row 25861) nests IMPLICITLY, and nesting.rb:46-48
// `implicit_nest_view = voo_items_view || default_nest_view` (item.rb:139-143)
// resolves it to view :link — perms :none (base.rb:35), so it renders the
// wanted-card anchor (link_view base.rb:39-43 -> add_known_or_wanted_class
// links.rb:140-143 -> path.rb:89-96 handle_unknown query -> title.rb:38-46
// wrapped_title with the leading bare joint span). The engine dropped the
// voo_items_view leg and rendered :content -> :unknown -> createable "".
//
// Expectation bytes: the local vintage shard (pass20-int expected-v2
// page-lane recapture-raw-shard-000017, message-000004 id 22025) carries the
// graded slot bytes verbatim; the page-lane vintage drift (-234/-235 head
// bytes per page, allsetfix-lane.md §5) sits outside this slot, so the pin
// is slot-scoped and the graded page-size record stays in the comment above.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

// The expected +conversation labeled slot, byte-verbatim from the corpus
// expectation (shard 000017, occurrence at char 8736 of the local vintage —
// the graded record's first differing byte at offset 8961 lands inside this slot):
// the labeled-content column's d0-card-content div carries the class chain,
// then the structure skeleton's first <p> with the wanted-card anchor, then
// the second <p> EMPTY (the `{{_left+Comm|titled}}` nest has an explicit
// view -> :unknown -> createable "" on both sides — corpus and engine agree
// on the empty bytes).
const EXPECTED_CONVERSATION_SLOT =
  `<div class="d0-card-body d0-card-content ALL ALL_PLUS TYPE-basic_c ` +
  `RIGHT-conversation TYPE_PLUS_RIGHT-message-conversation ` +
  `SELF-message_000004-conversation">` +
  `<p><a class="wanted-card" ` +
  `href="/message_000004+conversation_search?card%5Bname%5D=message-000004%2Bconversation+search">` +
  `<span class="card-title" title="+conversation search">` +
  `<span>+</span>conversation search</span></a></p>\r\n<p></p></div>`;

// The captured engine defect shape (5e603ba4-full-fails.json actual excerpt):
// both structure <p>s render empty.
const DEFECT_SLOT_SHAPE =
  `SELF-message_000004-conversation"><p></p>\r\n<p></p></div>`;

// The anchor alone: at the graded vintage the engine's page was exactly this
// anchor short (19129 expected - 18913 actual = -216).
const WANTED_ANCHOR =
  `<a class="wanted-card" ` +
  `href="/message_000004+conversation_search?card%5Bname%5D=message-000004%2Bconversation+search">` +
  `<span class="card-title" title="+conversation search">` +
  `<span>+</span>conversation search</span></a>`;

let storage: Awaited<ReturnType<typeof createRawStructureSeededStorage>> | undefined;
afterAll(() => {
  storage?.close();
});

describeOrSkipLoud(!(process.env.MISSING_CARD_INCLUSION_ANCHOR_PINS === "1" && existsSync(RAW_CORPUS_DB)), "tests/card/render/missing-card-inclusion-anchor-pins.test.ts", "process.env.MISSING_CARD_INCLUSION_ANCHOR_PINS === \"1\" && existsSync(RAW_CORPUS_DB)")(
  "grade-10 missing-card inclusion wanted-card anchor pins (message-000004)",
  () => {
    beforeAll(async () => {
      const everyLiveId = (new Database(RAW_CORPUS_DB, { readonly: true })
        .prepare("SELECT id FROM cards WHERE trash = 0")
        .all() as Array<{ id: number }>).map((r) => r.id);
      const { setDeploymentCloudAssetHost } = await import(
        "../../../src/card/render/views.js"
      );
      setDeploymentCloudAssetHost(
        "https://source-deck-production-storage.r1.cdn.objectstore.example",
      );
      storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
    }, 240_000);

    it("the anchor is exactly the graded -216 bytes (derivation pin)", () => {
      expect(Buffer.byteLength(WANTED_ANCHOR, "utf8")).toBe(216);
    });

    it("the +conversation labeled slot renders the wanted-card anchor (message-000004:page, graded first diff at 8961)", async () => {
      const html = await storage!.engine.renderPage("message-000004");
      expect(html).toContain(EXPECTED_CONVERSATION_SLOT);
    }, 120_000);

    it("the captured defect shape (both structure <p>s empty) is gone", async () => {
      const html = await storage!.engine.renderPage("message-000004");
      expect(html).not.toContain(DEFECT_SLOT_SHAPE);
    }, 120_000);
  },
);
