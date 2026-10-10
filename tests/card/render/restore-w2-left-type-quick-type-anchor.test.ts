// restore-w2-left-type-quick-type-anchor.test.ts -- the restore-w2-format
// lane's oracle pins (branch lane-restore-w2-format-2026-10-03).
//
// Both blocks boot the RAW graded corpus (the same seeding module the
// dual-lane grade uses) and are ENV-GATED so ordinary suite runs and the
// standing net skip them; the wave's receipts carry the ungated evidence
// (tools/oracle/first-diff-named-entries-probe.mjs runs, logged in
// REPO_DIR an internal work log).
//
// BLOCK 1 -- the quick_type contract the format.ts leftTypeNameFor fallback
// now consumes (the W2 lane's fix): Ruby pattern/class_methods.rb:59-71
// quick_type answers a PRESENT absent name through `Card.fetch name,
// new: {}` -- the *default template chain (type_id_from_template) -- and
// keeps the "RichText" literal for the BLANK-name branch only. Post-warm
// the engine answers BasicCs (corpus 22281) for the simple absent left
// "Decko Bot" and RichText for the compound lefts the earlier oracle pins
// name (Soma+tic, Morgan+Retreats+Shoreline -- the pins recorded in
// format.ts leftTypeNameFor's block comment must not move).
//
// BLOCK 2 -- byte-exact pins for the five W2-class entries that PASS at the
// lane's base (ea2e2e0): the wave's already-green set, guarded so the
// in-flight mechanism work recorded as blockers (views.ts list-item
// hide-opts injection; views.ts phantom-anchor cascade) cannot flip them
// silently.
//
// RUN (machine-local raw corpus; one boot per block, minutes):
//   RESTORE_W2_PINS=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/restore-w2-left-type-quick-type-anchor.test.ts \
//     --no-file-parallelism

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const EXPECTED_V2_VIEW_LANE = path.join(
  REPO,
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "view-lane",
);
const GATED = process.env.RESTORE_W2_PINS === "1";

const rawBoot = async () => {
  const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
    "./raw-corpus-seeding.js"
  );
  if (!existsSync(RAW_CORPUS_DB)) {
    throw new Error(
      `raw corpus missing: ${RAW_CORPUS_DB} (run on a corpus machine with tmp/raw-ground-truth present)`,
    );
  }
  const Database = (await import("better-sqlite3")).default;
  const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
  const everyLiveId = (
    idLister.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{
      id: number;
    }>
  ).map((r) => r.id);
  idLister.close();
  const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
  return storage;
};

describeOrSkipLoud(!GATED, "tests/card/render/restore-w2-left-type-quick-type-anchor.test.ts", "GATED")(
  "restore-w2: the quick_type contract behind leftTypeNameFor's fallback (raw corpus)",
  () => {
    it(
      "newCardDefaultType answers the *default template type for an absent simple left and RichText for the pinned compound lefts",
      async () => {
        const storage = await rawBoot();
        try {
          // A real corpus render warms the *default universe (the folded
          // rule-universe statement rides the render's prepare batch) --
          // the same state a nest-miss child's setKeys rebuild reads.
          await storage.engine.render("password reset email", "content");
          const nameMod = await import(pathToFileURL(path.join(REPO, "src", "card", "name.ts")).href);
          const engine = storage.engine as unknown as {
            newCardDefaultType?: (
              name: unknown,
            ) => { typeId: number; typeName: string } | undefined;
          };
          // The absent simple left: *all+*default (corpus rule 28) is
          // BasicCs-typed (template card 22281) -> quick_type answers
          // BasicCs, and the safe_set_keys anchor reads basic_c
          // (BasicCs.underscore.singularize) -- the capture's
          // TYPE_PLUS_RIGHT-basic_c-Xaccount shape.
          expect(engine.newCardDefaultType?.(nameMod.DeckoName.parse("Decko Bot"))).toEqual({
            typeId: 22281,
            typeName: "BasicCs",
          });
          // The compound-left oracle pins recorded in format.ts
          // leftTypeNameFor (Soma+tic+aikido ->
          // TYPE_PLUS_RIGHT-rich_text-aikido;
          // Morgan+Retreats+Shoreline+20180623_0728 ->
          // TYPE_PLUS_RIGHT-rich_text-20180623_0728): the arm must keep
          // answering RichText there.
          expect(engine.newCardDefaultType?.(nameMod.DeckoName.parse("Soma+tic"))).toEqual({
            typeId: 3,
            typeName: "RichText",
          });
          expect(
            engine.newCardDefaultType?.(nameMod.DeckoName.parse("Morgan+Retreats+Shoreline")),
          ).toEqual({ typeId: 3, typeName: "RichText" });
          // THE FIX'S OWN OUTCOME (the discriminator between base and the
          // fix commit): leftTypeNameFor's last resort now consults the
          // quick_type arm above. Same engine, warmed universe:
          //   base (ea2e2e0): the unconditional "RichText" literal
          //   fix:            BasicCs (the *default template type)
          // read through a RenderFormat bound to this engine.
          const { RenderFormat } = await import(
            pathToFileURL(path.join(REPO, "src", "card", "render", "format.ts")).href,
          );
          const hostCard = await (
            storage.engine as unknown as {
              fetchRenderCard: (n: string) => Promise<unknown>;
            }
          ).fetchRenderCard("password reset email");
          expect(hostCard).toBeDefined();
          const fmt = new RenderFormat(
            hostCard,
            storage.engine as never,
            {},
          ) as unknown as {
            leftTypeNameFor: (n: unknown) => string | undefined;
          };
          expect(fmt.leftTypeNameFor(nameMod.DeckoName.parse("Decko Bot+*account"))).toBe(
            "BasicCs",
          );
        } finally {
          storage.close();
        }
      },
      600_000,
    );
  },
);

describeOrSkipLoud(!GATED, "tests/card/render/restore-w2-left-type-quick-type-anchor.test.ts", "GATED")(
  "restore-w2: byte-exact pins for the W2-class entries that pass at base (raw corpus)",
  () => {
    // <shard>, <card name>, <view> -- the five PASS rows of the lane's
    // base probe (red-base.log in the lane worktree's
    // tmp/restore-w2-format/). Comparison shape = the grade's own:
    // byte equality after the slot-id normalization the dual-lane
    // grader applies. Page entries read the page-lane shard.
    const pins: Array<{
      shard: string;
      name: string;
      view: string;
      lane: "view" | "page";
    }> = [
      { shard: "recapture-raw-shard-000022.jsonl", name: "Soma+tags", view: "open", lane: "view" },
      {
        shard: "recapture-raw-shard-000016.jsonl",
        name: "MNv Instructor Training Manual ITM+articles",
        view: "open",
        lane: "view",
      },
      {
        shard: "recapture-raw-shard-000016.jsonl",
        name: "MNv Instructor Training Manual ITM",
        view: "page",
        lane: "page",
      },
      {
        shard: "recapture-raw-shard-000016.jsonl",
        name: "MNv Instructor Training Manual ITM+articles",
        view: "page",
        lane: "page",
      },
      {
        shard: "recapture-raw-shard-000024.jsonl",
        name: "Morgan+Vacations+Pages",
        view: "open",
        lane: "view",
      },
    ];

    const normalizeSlotIds = (html: string): string =>
      html.replace(/data-slot-id=(["'])[0-9a-f]+\1/g, 'data-slot-id="RANDOMIZED"');

    it("all five pins byte-identical to expected-v2", async () => {
      const storage = await rawBoot();
      try {
        for (const pin of pins) {
          const shardPath = path.join(
            path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", pin.lane === "view" ? "view-lane" : "page-lane"),
            pin.shard,
          );
          if (!existsSync(shardPath)) {
            throw new Error(`expected-v2 shard missing: ${shardPath}`);
          }
          const lines = readFileSync(shardPath, "utf8")
            .split("\n")
            .filter((l) => l.trim() !== "")
            .map((l) =>
            JSON.parse(l) as {
              name: string;
              views?: Record<string, string>;
              page_html?: string;
            },
          );
          const line = lines.find((l) => l.name === pin.name);
          expect(line).toBeDefined();
          const expected =
            pin.lane === "view"
              ? (line?.views ?? {})[pin.view]
              : (line?.page_html ?? "").length > 0
                ? line?.page_html
                : undefined;
          expect(expected).toBeDefined();
          const actual =
            pin.lane === "page"
              ? await (
                  storage.engine as unknown as {
                    renderPage: (n: string) => Promise<string>;
                  }
                ).renderPage(pin.name)
              : await storage.engine.render(pin.name, pin.view);
          expect(normalizeSlotIds(actual), `${pin.name}:${pin.view}`).toBe(
            normalizeSlotIds(expected as string),
          );
        }
      } finally {
        storage.close();
      }
    }, 600_000);
  },
);
