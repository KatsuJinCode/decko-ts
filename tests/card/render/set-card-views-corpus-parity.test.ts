// Stream E1 — set-card HTML views. Byte-parity assertions for the 7 pinned
// "set-card-views mechanism" entries (corpus:217, 268, 273, 294, 300, 302,
// 315). Each entry's captured oracle bytes come from
// fixtures/corpus/shard-000000.jsonl (the line's `views.<view>` value);
// the test seeds exactly the cards those renders need and asserts
// byte-exact output. The structure-corpus-replay test
// (tests/card/render/structure-corpus-replay.test.ts) markers for these
// entries are FOREIGN_PENDING pins the coordinator removes once this
// stream lands - this test is the closure proof.
//
// Three mechanisms the test pins:
//   1. Set-card content view: 6 type=exi (SetType) cards (268, 273, 294,
//      300, 302, 315) render the Rules section — <h4 class="mt-3">Rules
//      </h4> + filter form + accordion list — per card-mod-rules-0.20.0
//      set/type/set/html_views.rb:6-11 view :core.
//   2. Set-card open view: the same 6 cards (273, 294, 300, 302, 315) add
//      :template_closer to the data-slot hide list — html_views.rb:2-4
//      `before :open do voo.hide :template_closer end`.
//   3. Rule-card menu popover: corpus:217's closed view carries the set
//      menu variant (card-mod-rules-0.20.0 set/rule/board_rules_editor.rb
//      :17-27 help_text override: d-none edit_link span + rule-based help
//      + "(N default rules)" setting link) — see help-popover.ts.

import { describe, it, expect, afterAll } from "vitest";
import Database from "better-sqlite3";
import {
  createCorpusSeededStorage,
  readShardLines,
  type ShardLine,
} from "./permission-corpus-seeding.js";
import { installHelpRules } from "../../../src/card/render/help-popover.js";
import { normalizeSlotIds } from "../../src/testing/diff.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const TARGET_IDS = [217, 268, 273, 294, 300, 302, 315] as const;

interface ProofEntry {
  id: number;
  name: string;
  views: Record<string, string>;
}

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

/** Pull the seven target entries out of shard-000000.jsonl with their
 *  captured view bytes (the oracle). */
function proofEntries(): ProofEntry[] {
  const lines: ShardLine[] = readShardLines();
  const byId = new Map<number, ShardLine>();
  for (const line of lines) byId.set(line.id, line);
  const entries: ProofEntry[] = [];
  for (const id of TARGET_IDS) {
    const line = byId.get(id);
    if (line === undefined) throw new Error(`shard-000000.jsonl missing id ${id}`);
    const views: Record<string, string> = {};
    for (const [view, html] of Object.entries(line.views ?? {})) {
      if (html.startsWith('<span class="denied"')) continue;
      if (html.startsWith("CAPTURE_ERROR")) continue;
      views[view] = html;
    }
    entries.push({ id: line.id, name: line.name, views });
  }
  return entries;
}

/** Extend the permission-seeded storage with everything the 7 set/rule
 *  cards' renders need: the type cards, the setting cards, the rule cards
 *  hanging off the set cards, the help rule cards, and the closure.
 *  The standard structure-corpus seeding only covers *structure rules;
 *  these 7 entries are rule cards with right=*default / *right / *type /
 *  *self settings, which need their own universe. */
async function createSetCardSeededStorage(): Promise<RenderTestStorage> {
  const ids = new Set<number>(TARGET_IDS);
  // Bring in the rule cards hanging off each set card + their help-rule cards.
  const corpus = new Database(
    "C:/localProjects/decko-ts/benchmarks/corpus-v2/bench-corpus-v2.sqlite3",
    { readonly: true },
  );
  try {
    const setTypeId = (corpus
      .prepare(`SELECT id FROM cards WHERE codename='set' AND trash=0`)
      .get() as { id: number } | undefined)?.id;
    const settingTypeId = (corpus
      .prepare(`SELECT id FROM cards WHERE codename='setting' AND trash=0`)
      .get() as { id: number } | undefined)?.id;
    if (setTypeId === undefined || settingTypeId === undefined) {
      throw new Error("corpus deck missing set/setting codename cards");
    }
    // All rule cards whose left_id is one of our 6 set cards.
    const setIds = [268, 273, 294, 300, 302, 315];
    for (const setId of setIds) {
      const rules = corpus
        .prepare(
          `SELECT id, left_id, right_id, type_id, content FROM cards WHERE left_id=? AND trash=0`,
        )
        .all(setId) as Array<{ id: number; left_id: number; right_id: number; type_id: number; content: string | null }>;
      for (const r of rules) {
        ids.add(r.id);
        if (r.left_id !== null) ids.add(r.left_id);
        if (r.right_id !== null) ids.add(r.right_id);
      }
    }
    // Help-rule cards for the set card's *type prefix: every rule card
    // whose left_id is a set card whose left is one of our 6 set cards'
    // *type/right prefix (e.g. qqddl+*type for 217).
    // Find the *type variant of each set card by walking right=*type
    // searches: for the rule card 217 (qqddl+*right+*default), the
    // help-rule is qqddl+*type+*help. The pattern rule_card(:help)
    // walks every set card pattern of the host card looking for
    // <set>+*help. So we seed every *help rule whose left card's *type
    // set card matches one of our 6 sets.
    const helpRules = corpus
      .prepare(
        `SELECT r.id, r.left_id, r.right_id, r.type_id FROM cards r
         JOIN cards sets ON r.left_id = sets.id
         JOIN cards settings ON r.right_id = settings.id
         WHERE sets.type_id = ? AND settings.type_id = ?
           AND settings.codename = 'help' AND r.trash = 0
           AND sets.trash = 0 AND settings.trash = 0`,
      )
      .all(setTypeId, settingTypeId) as Array<{ id: number; left_id: number; right_id: number; type_id: number }>;
    for (const r of helpRules) {
      ids.add(r.id);
      if (r.left_id !== null) ids.add(r.left_id);
      // The set card for the help rule (e.g. qqddl+*type) and its
      // sides are loaded by the closure walk below.
    }
    // Codenames the engine needs (already in createCorpusSeededStorage's
    // call site; add explicitly for safety).
    for (const cn of ["anyone", "anyone_signed_in", "anonymous", "read", "set", "setting", "help"]) {
      const row = corpus
        .prepare(`SELECT id FROM cards WHERE codename=? AND trash=0`)
        .get(cn) as { id: number } | undefined;
      if (row !== undefined) ids.add(row.id);
    }
  } finally {
    corpus.close();
  }
  return createCorpusSeededStorage(ids);
}

describe("corpus replay: set-card html views (7 pinned entries) are byte-exact", () => {
  it("renders the Rules section, the open-view hide list, and the set menu popover", { timeout: 600_000 }, async () => {
    const entries = proofEntries();
    expect(entries.length).toBe(TARGET_IDS.length);
    storage = await createSetCardSeededStorage();
    const helpResolver = installHelpRules(storage.engine, storage.fetcher);
    await helpResolver.prepare();
    const failures: Array<{ id: string; first: string }> = [];
    let checked = 0;
    for (const entry of entries) {
      for (const [view, expected] of Object.entries(entry.views)) {
        checked += 1;
        let actual: string;
        try {
          actual = await storage.engine.render(entry.name, view);
        } catch (error) {
          const err = error as Error;
          failures.push({
            id: `corpus:${entry.id}:render:${view}`,
            first: `RAISED ${err?.constructor?.name ?? "Error"}: ${err?.message ?? String(error)}`,
          });
          continue;
        }
        const expectedNorm = normalizeSlotIds(expected);
        const actualNorm = normalizeSlotIds(actual);
        if (actualNorm !== expectedNorm) {
          const at = [...expectedNorm].findIndex((ch, i) => ch !== actualNorm[i]);
          failures.push({
            id: `corpus:${entry.id}:render:${view}`,
            first:
              `byte diff at ${at}: expected ${JSON.stringify(expectedNorm.slice(Math.max(0, at - 30), at + 30))} ` +
              `got ${JSON.stringify(actualNorm.slice(Math.max(0, at - 30), at + 30))}`,
          });
        }
      }
    }
    expect(
      failures,
      `${failures.length} of ${checked} set-card-views views differ:\n` +
        failures.slice(0, 10).map((f) => `${f.id}: ${f.first}`).join("\n"),
    ).toEqual([]);
    console.log(
      `set-card-views corpus parity: ${entries.length} entries, ${checked} views, all byte-identical`,
    );
  });
});
