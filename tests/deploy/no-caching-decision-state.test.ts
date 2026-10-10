// No caching between requests, for DECISION state as well as rows. The
// marker-edit proof (benchmarks/speed-ship) shows the request store and its
// memo are not carried between requests; this file covers what it does not:
// permission verdicts, rule resolution and search results, plus the marker
// proof across all 40 gate pages.
//
// Every case runs two requests in ONE process over a scratch copy of the
// local deck mirror (benchmarks/one-trip-render/deck-analyzed.sqlite3), with
// any change made between them through a SEPARATE database connection, so
// nothing in the engine is told about it. The copy is deleted afterwards; the
// mirror itself is never written. Skipped when the mirror is absent.
//
// Paths:
//   live      anonymous GET of a bare page path: the request-local live render
//             (fresh engines per pass, nothing kept). This is the path the
//             no-caching rule is stated for.
//   deck      anonymous GET of a /:card/:view path: the normal render on the
//             isolate's deck engine, which lives as long as the isolate.
//   signed-in the per-actor engine (ActorRenderEngines), also per isolate.

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import { handleEngineRequest, type Deck } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { ActorRenderEngines } from "../../deploy/bunny-worker-src/bunny-edge-session-viewer.js";
import { renderPageWithStatus } from "../../src/card/render/page.js";
import { applyServedEnvironmentDeltas } from "../../deploy/bunny-worker-src/bunny-edge-page-shell.js";
import { describeOrSkipLoud } from "../support/describe-with-corpus.js";

const MIRROR = join(process.cwd(), "benchmarks", "one-trip-render", "deck-analyzed.sqlite3");
const GATE_PAGES = join(process.cwd(), "tmp", "gate", "pages.txt");
const HAVE_MIRROR = existsSync(MIRROR);

const SLOT = /data-slot-id=(["'])[0-9a-f]+\1/g;
const norm = (html: string) => html.replace(SLOT, "");
const url = (path: string) => `https://edge.test${path}`;

// Cards on the mirror (read-only exploration, tmp/gate/s4/explore-rules*.mjs).
const RESTRICTED = "FasTrak issue"; // BasicCs, read rule BasicCs+*type+*read = "Anyone Signed In"
const RESTRICTED_RULE = 22283;
const SIGNED_IN_ACTOR = 393; // a User card; Anyone Signed In includes every signed-in user
const ANYONE_ID = 8;
const STRUCTURED = "Archetypal Psychology"; // type Process
const STRUCTURE_RULE = 735; // Process+*type+*structure
const SEARCH_PAGE = "File"; // Cardtype page: lists the File cards in id order
const SEARCH_FREE_ID = 795; // unused on the mirror, below the first listed id (808)

interface Env {
  dir: string;
  path: string;
  driver: LocalSqliteDriver;
  deck: Deck;
  writer: DatabaseSync;
}

async function openEnv(): Promise<Env> {
  const dir = mkdtempSync(join(tmpdir(), "decko-nocache-"));
  const path = join(dir, "deck.sqlite3");
  copyFileSync(MIRROR, path);
  const driver = new LocalSqliteDriver({ path });
  const deck = await bootEdgeServingEngines(driver);
  return { dir, path, driver, deck, writer: new DatabaseSync(path) };
}

/** Both connections are closed before the scratch copy is removed (an open
 *  handle keeps the file locked on Windows). */
function closeEnv(env: Env | undefined): void {
  if (env === undefined) return;
  try {
    env.writer.close();
    env.driver.close();
  } finally {
    rmSync(env.dir, { recursive: true, force: true });
  }
}

async function get(env: Env, path: string, anonymousLive: boolean): Promise<{ status: number; html: string }> {
  const res = await handleEngineRequest(new Request(url(path)), env.deck, anonymousLive ? { anonymous: true } : {});
  return { status: res.status, html: await res.text() };
}

const live = (env: Env, page: string) => get(env, `/${encodeURIComponent(page.replace(/ /g, "_"))}`, true);
const deckView = (env: Env, page: string) => get(env, `/${encodeURIComponent(page.replace(/ /g, "_"))}/titled`, false);

describeOrSkipLoud(!HAVE_MIRROR, "tests/deploy/no-caching-decision-state.test.ts", "HAVE_MIRROR")("no decision state outlives a request", () => {
  let env: Env | undefined;
  beforeAll(async () => {
    env = await openEnv();
  }, 120_000);
  afterAll(() => closeEnv(env));

  it("a signed-in render that may read the page does not let the next anonymous render read it", async () => {
    const e = env!;
    // Cold: the process's first renders of the page, anonymous.
    const coldLive = await live(e, RESTRICTED);
    const coldDeck = await deckView(e, RESTRICTED);
    expect(coldLive.status).toBe(403);
    expect(coldDeck.status).toBe(403);
    // Signed in: the same page, readable.
    const actors = new ActorRenderEngines(e.deck);
    const signed = await renderPageWithStatus(actors.deckFor(SIGNED_IN_ACTOR).render, RESTRICTED);
    expect(signed.status).toBe(200);
    expect(signed.html).not.toContain("<h1>Sorry!</h1>");
    // Anonymous again: denied exactly as cold, on both anonymous paths.
    const afterLive = await live(e, RESTRICTED);
    const afterDeck = await deckView(e, RESTRICTED);
    expect(afterLive.status).toBe(403);
    expect(norm(afterLive.html)).toBe(norm(coldLive.html));
    expect(afterDeck.status).toBe(403);
    expect(norm(afterDeck.html)).toBe(norm(coldDeck.html));
  }, 120_000);

  it("a permission rule changed between two renders is followed by the second", async () => {
    const e = env!;
    const before = await live(e, RESTRICTED);
    const beforeDeck = await deckView(e, RESTRICTED);
    expect(before.status).toBe(403);
    const rule = e.writer.prepare("SELECT db_content FROM cards WHERE id = ?").get(RESTRICTED_RULE) as { db_content: string };
    const ref = e.writer.prepare("SELECT id, referee_id, referee_key FROM card_references WHERE referer_id = ?").get(RESTRICTED_RULE) as { id: number; referee_id: number; referee_key: string };
    // What Ruby's write path leaves behind when the rule's content changes:
    // the content and the rule's reference to the party.
    e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run("Anyone", RESTRICTED_RULE);
    e.writer.prepare("UPDATE card_references SET referee_id = ?, referee_key = ? WHERE id = ?").run(ANYONE_ID, "anyone", ref.id);
    try {
      const after = await live(e, RESTRICTED);
      const afterDeck = await deckView(e, RESTRICTED);
      expect(after.status).toBe(200);
      expect(after.html).not.toContain("<h1>Sorry!</h1>");
      expect({ deck_before: beforeDeck.status, deck_after: afterDeck.status }).toEqual({ deck_before: 403, deck_after: 200 });
    } finally {
      e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(rule.db_content, RESTRICTED_RULE);
      e.writer.prepare("UPDATE card_references SET referee_id = ?, referee_key = ? WHERE id = ?").run(ref.referee_id, ref.referee_key, ref.id);
    }
    // And back: denied again.
    expect((await live(e, RESTRICTED)).status).toBe(403);
  }, 120_000);

  it("a structure rule changed between two renders is followed by the second", async () => {
    const e = env!;
    const marker = `NO-CACHE-STRUCTURE-${Date.now()}`;
    const before = await live(e, STRUCTURED);
    const beforeDeck = await deckView(e, STRUCTURED);
    const rule = e.writer.prepare("SELECT db_content FROM cards WHERE id = ?").get(STRUCTURE_RULE) as { db_content: string };
    e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(`${rule.db_content}<p>${marker}</p>`, STRUCTURE_RULE);
    try {
      const after = await live(e, STRUCTURED);
      const afterDeck = await deckView(e, STRUCTURED);
      expect(before.html).not.toContain(marker);
      expect(after.html).toContain(marker);
      expect({ deck_before: beforeDeck.html.includes(marker), deck_after: afterDeck.html.includes(marker) }).toEqual({ deck_before: false, deck_after: true });
    } finally {
      e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(rule.db_content, STRUCTURE_RULE);
    }
  }, 120_000);

  it("the signed-in engine follows a structure rule changed between two of its renders", async () => {
    const e = env!;
    const marker = `NO-CACHE-SIGNED-IN-${Date.now()}`;
    const actor = new ActorRenderEngines(e.deck).deckFor(SIGNED_IN_ACTOR).render;
    // Twice before the change: the engine is warm and every statement a warm
    // render sends has been sent once, so any reuse would show.
    await renderPageWithStatus(actor, STRUCTURED);
    const before = await renderPageWithStatus(actor, STRUCTURED);
    const rule = e.writer.prepare("SELECT db_content FROM cards WHERE id = ?").get(STRUCTURE_RULE) as { db_content: string };
    e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(`${rule.db_content}<p>${marker}</p>`, STRUCTURE_RULE);
    try {
      const after = await renderPageWithStatus(actor, STRUCTURED);
      expect(before.html).not.toContain(marker);
      expect(after.html).toContain(marker);
    } finally {
      e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(rule.db_content, STRUCTURE_RULE);
    }
  }, 120_000);

  // The File page lists the File cards 20 to a page, compound cards (no
  // stored name) first in id order, starting with card 808 ("The Myth of
  // Peace+Documents"). A new compound File card under an unused id below 808
  // therefore lands first on the page (checked in a fresh process:
  // tmp/gate/s4/search-diag2.mjs).
  it("a search result added between two renders is listed by the second", async () => {
    const e = env!;
    const listed = `data-card-id="${SEARCH_FREE_ID}"`;
    const fileType = e.writer.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(SEARCH_PAGE) as { id: number };
    const first = e.writer.prepare("SELECT left_id, read_rule_id, read_rule_class FROM cards WHERE id = 808").get() as { left_id: number; read_rule_id: number; read_rule_class: string };
    const right = e.writer.prepare("SELECT id FROM cards WHERE name = 'pdf version' AND trash = 0").get() as { id: number };
    expect(e.writer.prepare("SELECT COUNT(*) AS n FROM cards WHERE id = ? OR (left_id = ? AND right_id = ?)").get(SEARCH_FREE_ID, first.left_id, right.id)).toEqual({ n: 0 });
    const before = await live(e, SEARCH_PAGE);
    const beforeDeck = await deckView(e, SEARCH_PAGE);
    // "The Myth of Peace+pdf version", a File card governed like card 808.
    e.writer.prepare(
      "INSERT INTO cards (id, name, key, left_id, right_id, type_id, db_content, trash, read_rule_id, read_rule_class, created_at, updated_at, creator_id, updater_id) VALUES (?, NULL, NULL, ?, ?, ?, '', 0, ?, ?, '2010-01-01 00:00:00', '2010-01-01 00:00:00', ?, ?)",
    ).run(SEARCH_FREE_ID, first.left_id, right.id, fileType.id, first.read_rule_id, first.read_rule_class, SIGNED_IN_ACTOR, SIGNED_IN_ACTOR);
    const id = SEARCH_FREE_ID;
    try {
      const after = await live(e, SEARCH_PAGE);
      const afterDeck = await deckView(e, SEARCH_PAGE);
      expect(before.html).not.toContain(listed);
      expect(after.html).toContain(listed);
      expect({ deck_before: beforeDeck.html.includes(listed), deck_after: afterDeck.html.includes(listed) }).toEqual({ deck_before: false, deck_after: true });
    } finally {
      e.writer.prepare("DELETE FROM cards WHERE id = ?").run(id);
    }
  }, 120_000);

  it("a search result removed between two renders is dropped by the second", async () => {
    const e = env!;
    const listed = 'data-card-id="808"';
    const before = await live(e, SEARCH_PAGE);
    const beforeDeck = await deckView(e, SEARCH_PAGE);
    e.writer.prepare("UPDATE cards SET trash = 1 WHERE id = 808").run();
    try {
      const after = await live(e, SEARCH_PAGE);
      const afterDeck = await deckView(e, SEARCH_PAGE);
      expect(before.html).toContain(listed);
      expect(after.html).not.toContain(listed);
      expect({ deck_before: beforeDeck.html.includes(listed), deck_after: afterDeck.html.includes(listed) }).toEqual({ deck_before: true, deck_after: false });
    } finally {
      e.writer.prepare("UPDATE cards SET trash = 0 WHERE id = 808").run();
    }
  }, 120_000);
});

describeOrSkipLoud(!HAVE_MIRROR || !existsSync(GATE_PAGES), "tests/deploy/no-caching-decision-state.test.ts", "not (!HAVE_MIRROR || !existsSync(GATE_PAGES))")("marker-edit proof across the gate pages", () => {
  let env: Env | undefined;
  beforeAll(async () => {
    env = await openEnv();
  }, 120_000);
  afterAll(() => closeEnv(env));

  const pages = existsSync(GATE_PAGES) ? readFileSync(GATE_PAGES, "utf8").split(/\r?\n/).filter(Boolean) : [];
  it("every gate page: the marker is absent before, present after, nothing else changes", async () => {
    const e = env!;
    const footer = e.writer.prepare("SELECT id, db_content FROM cards WHERE name = '*footer' AND trash = 0").get() as { id: number; db_content: string };
    const failures: string[] = [];
    for (const page of pages) {
      const marker = `SHIP-FRESHNESS-MARKER-${Date.now()}`;
      const first = await live(e, page);
      e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(`${footer.db_content}${marker}`, footer.id);
      let second: { status: number; html: string };
      try {
        second = await live(e, page);
      } finally {
        e.writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(footer.db_content, footer.id);
      }
      const ok =
        first.status === second.status &&
        !first.html.includes(marker) &&
        second.html.includes(marker) &&
        norm(applyServedEnvironmentDeltas(second.html.replace(marker, ""))) === norm(applyServedEnvironmentDeltas(first.html));
      if (!ok) failures.push(page);
    }
    expect(failures).toEqual([]);
    // The page list source of record is the committed fixture: the worktree
    // list the gate kit and this test consume must equal it exactly.
    expect(pages).toEqual(
      readFileSync(join(process.cwd(), "fixtures", "edge-byte-gate-pages.txt"), "utf8")
        .split(/\r?\n/)
        .filter(Boolean),
    );
  }, 600_000);
});
