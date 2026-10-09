// Freshness between requests, on the public synthetic deck.
//
// The same proofs as no-caching-decision-state.test.ts, on a deck anyone has:
// the reference harness's synthetic-v1 fixture (a stock Decko deck built by
// Ruby Decko and committed with the harness). Every case renders, changes the
// deck through a SEPARATE database connection, as another process's committed
// write would, and renders again in the same process. The engine is told
// nothing; whatever it kept must notice the change by itself.
//
// What this proves, and for which configuration:
//   - the anonymous bare-page path (fresh engines per request), the
//     /:card/:view path (the isolate's long-lived deck engine) and the
//     signed-in per-actor engine follow permission-rule, structure-rule,
//     content and search changes made between two requests;
//   - a signed-in render's verdicts never reach the next anonymous render,
//     for the denied card itself and for a permission-filtered search;
//   - with the response caches off (DECKO_EDGE_CACHE and
//     DECKO_EDGE_GLOBAL_CACHE unset or "0", their defaults). Those optional
//     layers store whole responses and are not exercised here.
// The engines that live between requests do keep derived state; they check
// the deck_data_version stamp once per request and discard it when the stamp
// has moved. The stamp is maintained by triggers on cards and card_references
// (deploy/migrations/0003-deck-data-version-stamp.sql), which this test
// installs on its copy exactly as a provisioned deck has them.
//
// The fixture is read from reference-harness/fixtures/synthetic-v1/deck/ in
// this checkout, or from DECKO_SYNTHETIC_DECK. The copy is deleted afterwards.

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { handleEngineRequest, type Deck } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { ActorRenderEngines } from "../../deploy/bunny-worker-src/bunny-edge-session-viewer.js";
import { renderPageWithStatus } from "../../src/card/render/page.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { describeOrSkipLoud } from "../support/describe-with-corpus.js";

const DECK =
  process.env.DECKO_SYNTHETIC_DECK ??
  join(process.cwd(), "reference-harness", "fixtures", "synthetic-v1", "deck", "deck.sqlite3");
const STAMP_MIGRATION = join(process.cwd(), "deploy", "migrations", "0003-deck-data-version-stamp.sql");
const HAVE_DECK = existsSync(DECK);

const SLOT = /data-slot-id=(["'])[0-9a-f]+\1/g;
const norm = (html: string) => html.replace(SLOT, "");
const pagePath = (name: string) => `/${encodeURIComponent(name.replace(/ /g, "_"))}`;

interface Env {
  dir: string;
  driver: LocalSqliteDriver;
  deck: Deck;
  writer: DatabaseSync;
}

let env: Env | undefined;

function id(writer: DatabaseSync, name: string): number {
  const parts = name.split("+");
  if (parts.length === 1) {
    const row = writer.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(name) as { id: number } | undefined;
    if (row === undefined) throw new Error(`no card ${name} on the synthetic deck`);
    return row.id;
  }
  const right = id(writer, parts.pop()!);
  const left = id(writer, parts.join("+"));
  const row = writer.prepare("SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0").get(left, right) as { id: number } | undefined;
  if (row === undefined) throw new Error(`no card ${name} on the synthetic deck`);
  return row.id;
}

async function get(e: Env, path: string, anonymousLive: boolean): Promise<{ status: number; html: string }> {
  const res = await handleEngineRequest(new Request(`https://deck.example${path}`), e.deck, anonymousLive ? { anonymous: true } : {});
  return { status: res.status, html: await res.text() };
}
const live = (e: Env, card: string) => get(e, pagePath(card), true);
const deckView = (e: Env, card: string) => get(e, `${pagePath(card)}/titled`, false);
const signedIn = (e: Env, actor: string) => new ActorRenderEngines(e.deck).deckFor(id(e.writer, actor)).render;

describeOrSkipLoud(!HAVE_DECK, "tests/deploy/no-caching-synthetic.test.ts", "HAVE_DECK")(
  "freshness between requests on the synthetic deck",
  () => {
    beforeAll(async () => {
      applyDeckInflections(ORACLE_DECK_INFLECTIONS);
      const dir = mkdtempSync(join(tmpdir(), "decko-fresh-synthetic-"));
      const path = join(dir, "deck.sqlite3");
      copyFileSync(DECK, path);
      const writer = new DatabaseSync(path);
      writer.exec(readFileSync(STAMP_MIGRATION, "utf8"));
      if (process.env.DECKO_FRESHNESS_CONTROL === "stamp-frozen") {
        // Negative control: with the stamp's triggers gone, a committed write
        // no longer moves the stamp, so state kept between requests goes
        // stale. Cases on the long-lived engines must then fail.
        const triggers = writer.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%deck_data_version%'").all() as { name: string }[];
        for (const t of triggers) writer.exec(`DROP TRIGGER "${t.name}"`);
      }
      const driver = new LocalSqliteDriver({ path });
      const deck = await bootEdgeServingEngines(driver);
      env = { dir, driver, deck, writer };
    }, 120_000);

    afterAll(() => {
      if (env === undefined) return;
      try {
        env.writer.close();
        env.driver.close();
      } finally {
        rmSync(env.dir, { recursive: true, force: true });
      }
    });

    it("a member's render of a member-only card does not let the next anonymous render read it", async () => {
      const e = env!;
      const coldLive = await live(e, "Memo 01");
      const coldDeck = await deckView(e, "Memo 01");
      expect([coldLive.status, coldDeck.status]).toEqual([403, 403]);
      const member = await renderPageWithStatus(signedIn(e, "Mira Member"), "Memo 01");
      expect(member.status).toBe(200);
      const afterLive = await live(e, "Memo 01");
      const afterDeck = await deckView(e, "Memo 01");
      expect([afterLive.status, afterDeck.status]).toEqual([403, 403]);
      expect(norm(afterLive.html)).toBe(norm(coldLive.html));
      expect(norm(afterDeck.html)).toBe(norm(coldDeck.html));
    }, 120_000);

    it("a member's search results do not reach the next anonymous render of the same search", async () => {
      const e = env!;
      const anonBefore = await live(e, "Memo List");
      const member = await renderPageWithStatus(signedIn(e, "Mira Member"), "Memo List");
      const anonAfter = await live(e, "Memo List");
      const memo = `data-card-id="${id(e.writer, "Memo 01")}"`;
      expect(member.html).toContain(memo);
      expect(anonBefore.html).not.toContain(memo);
      expect(anonAfter.html).not.toContain(memo);
      expect(norm(anonAfter.html)).toBe(norm(anonBefore.html));
    }, 120_000);

    it("a permission rule changed between two renders is followed by the second, on every path", async () => {
      const e = env!;
      const rule = id(e.writer, "Memo+*type+*read");
      const member = id(e.writer, "Member");
      const anyone = id(e.writer, "Anyone");
      const before = await live(e, "Memo 01");
      const beforeDeck = await deckView(e, "Memo 01");
      const content = (e.writer.prepare("SELECT db_content FROM cards WHERE id = ?").get(rule) as { db_content: string }).db_content;
      const ref = e.writer.prepare("SELECT id, referee_key FROM card_references WHERE referer_id = ? AND referee_id = ?").get(rule, member) as { id: number; referee_key: string };
      e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run("[[Anyone]]", rule);
      e.writer.prepare("UPDATE card_references SET referee_id = ?, referee_key = ? WHERE id = ?").run(anyone, "anyone", ref.id);
      try {
        const after = await live(e, "Memo 01");
        const afterDeck = await deckView(e, "Memo 01");
        expect({ live: [before.status, after.status], deck: [beforeDeck.status, afterDeck.status] }).toEqual({ live: [403, 200], deck: [403, 200] });
      } finally {
        e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(content, rule);
        e.writer.prepare("UPDATE card_references SET referee_id = ?, referee_key = ? WHERE id = ?").run(member, ref.referee_key, ref.id);
      }
      expect([(await live(e, "Memo 01")).status, (await deckView(e, "Memo 01")).status]).toEqual([403, 403]);
    }, 120_000);

    it("a structure rule changed between two renders is followed by the second, on every path", async () => {
      const e = env!;
      const rule = id(e.writer, "Topic+*type+*structure");
      const marker = `FRESH-STRUCTURE-${Date.now()}`;
      const actor = signedIn(e, "Mira Member");
      const before = [await live(e, "Topic 001"), await deckView(e, "Topic 001")];
      await renderPageWithStatus(actor, "Topic 001");
      const beforeSigned = await renderPageWithStatus(actor, "Topic 001");
      const content = (e.writer.prepare("SELECT db_content FROM cards WHERE id = ?").get(rule) as { db_content: string }).db_content;
      e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(`${content}\n<p>${marker}</p>`, rule);
      try {
        const after = [await live(e, "Topic 001"), await deckView(e, "Topic 001"), await renderPageWithStatus(actor, "Topic 001")];
        expect([...before, beforeSigned].map((r) => r.html.includes(marker))).toEqual([false, false, false]);
        expect(after.map((r) => r.html.includes(marker))).toEqual([true, true, true]);
      } finally {
        e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(content, rule);
      }
    }, 120_000);

    it("a search result added, then removed, between renders is followed on every path", async () => {
      const e = env!;
      const topic = id(e.writer, "Topic 001");
      const listed = `data-card-id="${topic}"`;
      const before = [await live(e, "All Topics"), await deckView(e, "All Topics")];
      expect(before.map((r) => r.html.includes(listed))).toEqual([true, true]);
      e.writer.prepare("UPDATE cards SET trash = 1 WHERE id = ?").run(topic);
      try {
        const gone = [await live(e, "All Topics"), await deckView(e, "All Topics")];
        expect(gone.map((r) => r.html.includes(listed))).toEqual([false, false]);
      } finally {
        e.writer.prepare("UPDATE cards SET trash = 0 WHERE id = ?").run(topic);
      }
      const back = [await live(e, "All Topics"), await deckView(e, "All Topics")];
      expect(back.map((r) => r.html.includes(listed))).toEqual([true, true]);
    }, 120_000);

    it("every readable Topic page shows a content edit made between two renders, and a denied one never does", async () => {
      const e = env!;
      const topics = (e.writer.prepare("SELECT name FROM cards WHERE type_id = ? AND trash = 0 ORDER BY id").all(id(e.writer, "Topic")) as { name: string }[]).map((r) => r.name);
      expect(topics.length).toBe(30);
      const failures: string[] = [];
      const statuses: number[] = [];
      for (const name of topics) {
        const field = id(e.writer, `${name}+summary`);
        const content = (e.writer.prepare("SELECT db_content FROM cards WHERE id = ?").get(field) as { db_content: string }).db_content;
        const marker = `FRESH-MARKER-${Date.now()}`;
        const first = await live(e, name);
        e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(`${content}${marker}`, field);
        let second: { status: number; html: string };
        try {
          second = await live(e, name);
        } finally {
          e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(content, field);
        }
        // A page the anonymous visitor may read shows the edit; a page it may
        // not read (Topic 003 is governed by an administrator-only rule) must
        // not, and its denial must be unchanged.
        const ok =
          first.status === second.status &&
          !first.html.includes(marker) &&
          (first.status === 200
            ? second.html.includes(marker) && norm(second.html.replace(marker, "")) === norm(first.html)
            : !second.html.includes(marker) && norm(second.html) === norm(first.html));
        if (!ok) failures.push(name);
        statuses.push(first.status);
      }
      expect(failures).toEqual([]);
      expect({ readable: statuses.filter((s) => s === 200).length, denied: statuses.filter((s) => s === 403).length }).toEqual({ readable: 29, denied: 1 });
    }, 300_000);
  },
);
