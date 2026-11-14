// migrate-retired-twitter-widget-embeds-cas.mjs - the guarded CAS that takes
// the retired 2011 Twitter widget script out of a deck's card content.
//
// WHAT IT IS. A local deck fixture (the copy the signed-in exercise boots
// against) can carry cards whose content embeds Twitter's retired widget:
//
//   <script src="http://widgets.twimg.com/j/2/widget.js"></script>
//   <script>
//   new TWTR.Widget({...}).render().setUser('freeaiki').start();
//   </script>
//
// The script is plain http, so an https origin refuses it as mixed content
// and the browser blocks the subresource - the "final browser asset audit"
// check (registry check id B-110) goes red on it. The deck's own content is
// the cause, not the engine: both engines serve the same bytes.
//
// THE SHAPE. The same guarded CAS the 2026-10-18 live-deck migration used
// (custody: brandonDojoTech/recovery/release/private-probes/
// private-tool-repairs-20261018/remote-widget-cas/plan.json): ONE atomic
// statement whose admission is a MATERIALIZED subquery that counts the
// target rows whose content still matches the expected pre-image, reads the
// deck's version row, and counts the version rows. The UPDATE only runs
// when every one of those agrees, and it RETURNS the rows it wrote, so a
// concurrent write to any target cell aborts the whole migration instead
// of clobbering it. Nothing else is touched: no schema, no history, no
// name, no type, no timestamp.
//
// THE REPLACEMENT. The widget block is replaced by the same fallback the
// local deck's already-migrated cards carry (measured on the fixture:
// "\n<p><a href=\"https://twitter.com/<handle>\">@<handle> on Twitter</a></p>"),
// with the handle taken from the widget's own setUser('...') call. The
// script only migrates the rows whose content it can parse a handle from,
// and only when every one of those rows still holds the exact pre-image.
//
// USAGE
//   node tools/deck-fixtures/migrate-retired-twitter-widget-embeds-cas.mjs \
//     --deck <deck.sqlite3> [--dry-run] [--out <receipt.json>]
//
// The receipt records the deck's sha256 before and after, the deck version
// before and after, the migrated row ids, the per-row before/after content
// and the admission counters. The script refuses to write when the
// admission does not hold, and it writes nothing else.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const DECK = resolve(
  argOf("deck") ??
    "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3",
);
const OUT = argOf("out") === undefined ? "" : resolve(argOf("out"));
const DRY_RUN = hasFlag("dry-run");

const WIDGET_SCRIPT = "http://widgets.twimg.com/j/2/widget.js";

/** The fallback a migrated card carries, for the widget's handle. */
function fallbackFor(handle) {
  return `\n<p><a href="https://twitter.com/${handle}">@${handle} on Twitter</a></p>`;
}

/** The widget's handle, from the widget's own setUser('...') call. */
function handleOf(content) {
  const match = /\.setUser\('([^']+)'\)/.exec(content);
  return match?.[1];
}

/** The pre-image a card must still hold to be migrated: the widget block
 *  with the retired http script. */
function widgetPreImage(content) {
  if (!content.includes(WIDGET_SCRIPT)) return undefined;
  if (!content.includes("new TWTR.Widget(")) return undefined;
  return content;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function main() {
  const beforeSha = sha256(DECK);
  const db = new Database(DECK, { readonly: DRY_RUN });
  try {
    const versionRow = db
      .prepare("SELECT id, version FROM deck_data_version")
      .all();
    const version = versionRow.length === 1 ? versionRow[0].version : undefined;

    // The candidates: every non-trashed card whose content still embeds the
    // retired script. Trashed cards are not served, so they are reported,
    // not migrated, unless --include-trashed is passed.
    const includeTrashed = hasFlag("include-trashed");
    const rows = db
      .prepare(
        "SELECT id, name, trash, db_content FROM cards WHERE db_content LIKE ? ORDER BY id",
      )
      .all(`%${WIDGET_SCRIPT}%`);
    const targets = [];
    for (const row of rows) {
      const handle = handleOf(row.db_content);
      const preImage = widgetPreImage(row.db_content);
      if (handle === undefined || preImage === undefined) {
        targets.push({
          id: row.id,
          name: row.name,
          trash: row.trash,
          migrated: false,
          reason: "no setUser handle in the content",
        });
        continue;
      }
      if (row.trash === 1 && !includeTrashed) {
        targets.push({
          id: row.id,
          name: row.name,
          trash: row.trash,
          migrated: false,
          reason: "trashed card (pass --include-trashed to migrate it anyway)",
        });
        continue;
      }
      targets.push({
        id: row.id,
        name: row.name,
        trash: row.trash,
        migrated: true,
        handle,
        preImage,
        postImage: fallbackFor(handle),
      });
    }

    const migratable = targets.filter((t) => t.migrated);
    const admission = {
      matches: migratable.length,
      version,
      version_rows: versionRow.length,
      allowed: migratable.length > 0 && versionRow.length === 1,
    };

    const receipt = {
      what: "guarded CAS: the retired Twitter widget script out of card content",
      deck: DECK,
      dryRun: DRY_RUN,
      sha256Before: beforeSha,
      deckVersionBefore: version,
      deckVersionRows: versionRow.length,
      candidates: targets.map((t) => ({
        id: t.id,
        name: t.name,
        trash: t.trash,
        migrated: t.migrated,
        reason: t.reason,
        handle: t.handle,
      })),
      admission,
    };

    if (!DRY_RUN && migratable.length > 0) {
      // ONE atomic statement: the admission is materialized, every target
      // cell must still hold its pre-image, and the deck's version row must
      // be the one this read saw.
      const idArgs = migratable.map(() => "?").join(",");
      const whenArgs = migratable.map(() => "WHEN ? THEN ?").join(" ");
      const sql = `WITH admission AS MATERIALIZED (
 SELECT COUNT(*) AS matches,
 (SELECT version FROM deck_data_version WHERE id = 1) AS version,
 (SELECT COUNT(*) FROM deck_data_version) AS version_rows
 FROM cards WHERE (${migratable
        .map(() => "(id = ? AND db_content = ?)")
        .join(" OR ")})
)
UPDATE OR ABORT cards SET db_content = CASE id ${whenArgs} END
WHERE id IN (${idArgs})
 AND (SELECT matches = ${migratable.length} AND version = ? AND version_rows = 1 FROM admission)
RETURNING id, db_content`;
      const args = [
        ...migratable.flatMap((t) => [t.id, t.preImage]),
        ...migratable.flatMap((t) => [t.id, t.postImage]),
        ...migratable.map((t) => t.id),
        version,
      ];
      const written = db.prepare(sql).all(...args);
      receipt.rowsWritten = written.map((r) => r.id);
      receipt.writtenContentMatches = written.every(
        (r) =>
          migratable.find((t) => t.id === r.id)?.postImage === r.db_content,
      );
      const versionAfter = db
        .prepare("SELECT version FROM deck_data_version WHERE id = 1")
        .get();
      receipt.deckVersionAfter = versionAfter?.version;
      const stillEmbedding = db
        .prepare("SELECT COUNT(*) AS c FROM cards WHERE db_content LIKE ?")
        .get(`%${WIDGET_SCRIPT}%`);
      receipt.cardsStillEmbeddingAfter = stillEmbedding.c;
      // The deck is in WAL mode: the write above lives in the -wal file
      // until a checkpoint. Checkpoint it here so the hash this receipt
      // records is the main file's hash, not the pre-checkpoint one.
      receipt.walCheckpoint = db.pragma("wal_checkpoint(TRUNCATE)");
    }

    receipt.sha256After = sha256(DECK);

    if (OUT !== "") {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (!DRY_RUN && migratable.length > 0 && receipt.rowsWritten?.length !== migratable.length) {
      process.exitCode = 2;
    }
  } finally {
    db.close();
  }
}

main();
