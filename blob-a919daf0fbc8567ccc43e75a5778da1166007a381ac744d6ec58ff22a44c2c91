// Public synthetic exercises for four claims about the Decko TypeScript
// engine. Everything here runs on a clean checkout: only committed code and
// invented data, no network, no hosted account.
//
// DATA: invented. Every card name, body, user, attachment key and filename
// below is synthetic text written for this file. The card ids, the SQL and
// the env-var names are the engine's own, not content.
//
// BOOT HELPERS REUSED, NOT INVENTED:
//   - tests/server/blob-conformance.ts — the shared blob-driver conformance
//     suite (`runBlobConformance`). Its per-case `it()` names are that
//     module's own; the claim-named cases in this file are the ones this
//     file asserts.
//   - tests/card/render/render-test-storage.ts — `createRenderTestStorage`,
//     the in-memory core-schema deck (db/schema.sqlite.sql over the real
//     LocalSqliteDriver) with `seedCard` / `seedReference` and the
//     `CountingRenderDriver`.
//   - tests/deploy/bunny-edge-session-viewer-roundtrip.test.ts — the
//     viewer-sensitive read-rule universe shape (a catch-all `*all+*read`
//     plus a page rule), the page-shell seed rows, and the ActorRenderEngines
//     per-viewer render posture.
//   - tests/deploy/no-caching-synthetic.test.ts — the round-trip-bytes
//     (data-slot-id) normalization for render comparisons.
//   - tests/server/write-routes-origin.test.ts and
//     tests/card/auth/first-run-setup.test.ts — the write-surface and
//     first-run seed shapes for the origin check.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// CLAIM 1 — the blob-driver contract
// ---------------------------------------------------------------------------

import { FilesystemBlobDriver } from "../../src/blob/filesystem.js";
import { MemoryBlobDriver } from "../../src/blob/memory.js";
import { contentTypeForExtension } from "../../src/blob/content-types.js";
import { BlobKeyError, type BlobDriver } from "../../src/blob/driver.js";
import { runBlobConformance } from "../server/blob-conformance.js";
import { scratchDir } from "../support/scratch-dir.mjs";

/** Invented attachment keys — the spellings a synthetic deck would store. */
const SYNTHETIC_KEYS = [
  "ember-lantern/harbor-notebook.txt",
  "ember-lantern/thimble-ledger.csv",
  "ember-lantern/quiet-harbor.svg",
  "tidepool/subfolder/mooring-styles.css",
] as const;

const SYNTHETIC_BODY = new Uint8Array([0x65, 0x6d, 0x62, 0x65, 0x72, 0x00, 0xff, 0xfe, 0x0a]);

/** One driver's whole transcript over a fixed deck of operations, as a
 *  comparable string: keys, sizes, content types, byte digests, listing
 *  order and delete outcomes. */
async function blobTranscript(driver: BlobDriver): Promise<string> {
  const lines: string[] = [];
  for (const key of SYNTHETIC_KEYS) {
    const type = contentTypeForExtension(key.slice(key.lastIndexOf(".")));
    const put = await driver.put(key, SYNTHETIC_BODY, { contentType: type });
    lines.push(`put ${put.key} size=${put.size} type=${put.contentType ?? "-"}`);
  }
  for (const key of SYNTHETIC_KEYS) {
    const read = await driver.getBytes(key);
    lines.push(
      read === undefined
        ? `get ${key} MISSING`
        : `get ${key} size=${read.length} sha=${Array.from(read).join(".")}`,
    );
  }
  for (const key of SYNTHETIC_KEYS) {
    const head = await driver.head(key);
    lines.push(head === undefined ? `head ${key} MISSING` : `head ${head.key} size=${head.size}`);
  }
  for (const prefix of ["ember-lantern/", "tidepool/"]) {
    const entries = await driver.list(prefix);
    lines.push(`list ${prefix} -> ${entries.map((e) => `${e.key}:${e.size}`).join(",")}`);
  }
  await driver.delete(SYNTHETIC_KEYS[0]);
  lines.push(`head-after-delete ${SYNTHETIC_KEYS[0]} ${(await driver.head(SYNTHETIC_KEYS[0])) === undefined ? "MISSING" : "PRESENT"}`);
  return lines.join("\n");
}

// The shared suite, run against the two adapters that need no hosted
// account. R2 and Bunny Storage are NOT exercised here: their providers are
// hosted services, and this file must run on a clean checkout with no
// account of any kind.
describe("blob drivers", () => {
  runBlobConformance("conformance: MemoryBlobDriver (synthetic deck)", () => ({
    driver: new MemoryBlobDriver(),
  }));
  runBlobConformance("conformance: FilesystemBlobDriver (synthetic deck)", () => ({
    driver: new FilesystemBlobDriver(scratchDir("exercise-drivers7-blob-fs")),
  }));
});

describe("blob drivers agree with each other", () => {
  it("A blob-storage driver (memory, filesystem, R2, Bunny Storage) — the memory and filesystem drivers produce identical bytes, keys, sizes and MIME handling over the same operations", async () => {
    const memory = await blobTranscript(new MemoryBlobDriver());
    const filesystem = await blobTranscript(
      new FilesystemBlobDriver(scratchDir("exercise-drivers7-blob-parity")),
    );
    expect(filesystem).toBe(memory);
    // Guards the harness: a degenerate transcript would make the equality
    // vacuous. Every synthetic key must appear, with its real byte count.
    expect(memory).toContain(`put ${SYNTHETIC_KEYS[0]} size=9 type=text/plain`);
    expect(memory).toContain(`put ${SYNTHETIC_KEYS[1]} size=9 type=text/csv`);
    expect(memory).toContain(`put ${SYNTHETIC_KEYS[2]} size=9 type=image/svg+xml`);
    expect(memory).toContain(`get ${SYNTHETIC_KEYS[0]} size=9 sha=101.109.98.101.114.0.255.254.10`);
    expect(memory).toContain(`head-after-delete ${SYNTHETIC_KEYS[0]} MISSING`);
    expect(memory.split("\n").length).toBe(SYNTHETIC_KEYS.length * 3 + 3);
  });

  it("A blob-storage driver (memory, filesystem, R2, Bunny Storage) — the filesystem driver agrees on MIME handling because it derives the type from the key extension the same way the engine's table does", async () => {
    const memory = new MemoryBlobDriver();
    const filesystem = new FilesystemBlobDriver(scratchDir("exercise-drivers7-blob-mime"));
    for (const key of SYNTHETIC_KEYS) {
      const expected = contentTypeForExtension(key.slice(key.lastIndexOf(".")));
      expect(expected, `engine has no type for ${key}`).toBeDefined();
      await memory.put(key, SYNTHETIC_BODY, { contentType: expected });
      await filesystem.put(key, SYNTHETIC_BODY, { contentType: expected });
      expect((await filesystem.head(key))!.contentType).toBe(expected);
      // The memory adapter persists the supplied type; the filesystem one
      // re-derives it from the extension. Both report the SAME type, which
      // is what "identical MIME handling" means to a caller.
      expect((await memory.head(key))!.contentType).toBe((await filesystem.head(key))!.contentType);
    }
  });

  it("A blob-storage driver (memory, filesystem, R2, Bunny Storage) — both drivers reject a traversal key with the same BlobKeyError before touching storage", async () => {
    const drivers: [string, BlobDriver][] = [
      ["memory", new MemoryBlobDriver()],
      ["filesystem", new FilesystemBlobDriver(scratchDir("exercise-drivers7-blob-keys"))],
    ];
    for (const key of ["../escape.txt", "/absolute.txt", "a//b.txt", "trailing/", ""]) {
      for (const [name, driver] of drivers) {
        await expect(driver.put(key, SYNTHETIC_BODY), `${name} put ${JSON.stringify(key)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
        await expect(driver.get(key), `${name} get ${JSON.stringify(key)}`).rejects.toBeInstanceOf(
          BlobKeyError,
        );
      }
    }
  });

  it("A blob-storage driver (memory, filesystem, R2, Bunny Storage) — R2 and Bunny Storage are named adapters but need hosted accounts, so this clean-checkout run proves only that they exist and declare the same interface", async () => {
    // Not a fake exercise of a hosted backend: an explicit statement of the
    // boundary. The two cloud adapters are importable modules implementing
    // BlobDriver, and no account is contacted — nothing here is asserted
    // about R2's or Bunny Storage's runtime behaviour.
    const r2 = await import("../../src/blob/r2.js");
    const bunny = await import("../../src/blob/bunny-storage.js");
    expect(typeof r2.R2BlobDriver).toBe("function");
    expect(typeof bunny.BunnyStorageBlobDriver).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// CLAIMS 2 and 3 — one deck, booted once
// ---------------------------------------------------------------------------

import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { renderPageWithStatus } from "../../src/card/render/page.js";
import { ONE_TRIP_SIDE_DDL } from "../../src/card/one-trip/side-db-schema.js";
import {
  DECK_DATA_VERSION_STATEMENT,
} from "../../src/card/render.js";
import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import { ActorRenderEngines } from "../../deploy/bunny-worker-src/bunny-edge-session-viewer.js";
import { serveProfiled } from "../../deploy/bunny-worker-src/bunny-edge-deck-config.js";
import { EDGE_CACHE_DIAGNOSTIC_HEADER, type EdgeCacheLike } from "../../deploy/bunny-worker-src/bunny-edge-content-cache.js";
import {
  EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER,
  GlobalRenderCache,
} from "../../deploy/bunny-worker-src/bunny-edge-global-render-cache.js";
import { startEdgeRequestProfile } from "../../deploy/bunny-worker-src/bunny-edge-server-timing.js";
import type { SQLDatabaseDriver } from "../../src/server/driver.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore, setupWindowState } from "../../src/card/auth/index.js";
import { DeckoName } from "../../src/card/name.js";
import {
  handleWriteRequest,
  type WriteRouteContext,
  type WriteRouteRequest,
} from "../../src/server/write-routes.js";
import { originPolicyFromEnv } from "../../src/server/request-origin.js";
import {
  handleFirstRunRequest,
  SETUP_PATH,
} from "../../src/server/first-run-routes.js";

/** The synthetic deck's id map. Invented names; the ids are arbitrary and
 *  disjoint so the three surfaces (render, write, first-run) can share one
 *  schema without colliding. */
const IDS = {
  all: 1,
  basic: 2,
  default: 3,
  type: 4,
  set: 5,
  read: 6,
  anyone: 7,
  anonymous: 8,
  anyoneSignedIn: 9,
  create: 10,
  update: 11,
  delete: 12,
  selfRule: 13,
  richText: 14,
  html: 50,
  setting: 52,
  title: 55,
  favicon: 103,
  ace: 400,
  tinyMce: 401,
  layout: 601,
  layoutJunction: 22746,
  defaultLayout: 22747,
  header: 22748,
  footer: 22749,
  // the two signed-in actors the cache claim contrasts
  wren: 200,
  kai: 201,
  // content cards (invented names)
  page: 100,
  note: 91,
  // write rule universe
  createRule: 300,
  updateRule: 301,
  deleteRule: 302,
  defaultRuleJunction: 303,
  basicTypeJunction: 304,
  // read rule universe
  catchAllRule: 506,
  pageSet: 507,
  pageRule: 508,
} as const;

const SHELL_LAYOUT =
  `<body class="d-flex flex-column h-100">\n  <header>{{:header|core}}</header>\n` +
  `  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n` +
  `  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>\n</body>`;

/** The deck skeleton every surface in this file renders against: the codename
 *  cards, the type cards, and the page shell's head/layout rows. */
async function seedDeckSkeleton(storage: RenderTestStorage): Promise<void> {
  // `*all` is Set-typed: the rule universe reaches `*all+*update` and friends
  // through it (bunny-edge-session-viewer-roundtrip.test.ts types it the same
  // way).
  await seedCard(storage, { id: IDS.all, name: "*all", codename: "all", typeId: IDS.set });
  await seedCard(storage, { id: IDS.basic, name: "Basic", codename: "basic", typeId: IDS.html });
  await seedCard(storage, { id: IDS.default, name: "*default", codename: "default", typeId: IDS.all });
  await seedCard(storage, { id: IDS.type, name: "*type", codename: "type", typeId: IDS.all });
  await seedCard(storage, { id: IDS.set, name: "Set", codename: "set", typeId: IDS.all });
  await seedCard(storage, { id: IDS.read, name: "*read", codename: "read", typeId: IDS.basic });
  await seedCard(storage, { id: IDS.anyone, name: "Anyone", codename: "anyone", typeId: IDS.basic });
  await seedCard(storage, { id: IDS.anonymous, name: "*anonymous", codename: "anonymous", typeId: IDS.basic });
  await seedCard(storage, {
    id: IDS.anyoneSignedIn,
    name: "Anyone Signed In",
    codename: "anyone_signed_in",
    typeId: IDS.basic,
  });
  await seedCard(storage, { id: IDS.create, name: "*create", codename: "create", typeId: IDS.all });
  await seedCard(storage, { id: IDS.update, name: "*update", codename: "update", typeId: IDS.all });
  await seedCard(storage, { id: IDS.delete, name: "*delete", codename: "delete", typeId: IDS.all });
  await seedCard(storage, { id: IDS.selfRule, name: "*self", codename: "self", typeId: IDS.all });
  await seedCard(storage, { id: IDS.richText, name: "RichText", codename: "rich_text", typeId: IDS.html });
  await seedCard(storage, { id: IDS.html, name: "Html", codename: "html", typeId: IDS.basic });
  await seedCard(storage, { id: IDS.setting, name: "Setting", codename: "setting", typeId: IDS.html });
  await seedCard(storage, { id: IDS.title, name: "*title", codename: "title", typeId: IDS.setting, dbContent: "Exercise Deck" });
  await seedCard(storage, { id: IDS.favicon, name: "*favicon", codename: "favicon", typeId: IDS.setting, dbContent: "(synthetic-bucket)/103/3649.jpg" });
  await seedCard(storage, { id: IDS.ace, name: "*ace", codename: "ace", typeId: IDS.setting, dbContent: "{}" });
  await seedCard(storage, { id: IDS.tinyMce, name: "*tiny_mce", codename: "tiny_mce", typeId: IDS.setting, dbContent: "{}" });
  await seedCard(storage, { id: IDS.layout, name: "*layout", codename: "layout", typeId: IDS.setting });
  await seedCard(storage, {
    id: IDS.layoutJunction,
    name: "*all+*layout",
    leftId: IDS.all,
    rightId: IDS.layout,
    typeId: IDS.setting,
    dbContent: "Default Layout",
  });
  await seedCard(storage, { id: IDS.defaultLayout, name: "Default Layout", typeId: IDS.html, dbContent: SHELL_LAYOUT });
  await seedCard(storage, { id: IDS.header, name: "*header", codename: "header", typeId: IDS.html, dbContent: `<nav class="navbar"><span class="navbar-brand">Synthetic Deck</span></nav>` });
  await seedCard(storage, { id: IDS.footer, name: "*footer", codename: "footer", typeId: IDS.html, dbContent: `<footer class="footer"><a href="/:latest">Synthetic Deck</a></footer>` });
}

/** The viewer-sensitive read-rule universe: the catch-all `*all+*read` exists
 *  (the rule lookup refuses to evaluate without it) but is granted ONLY to
 *  one named account, and the page card carries its own rule granted to the
 *  other. Two signed-in actors therefore see DIFFERENT bytes for the same
 *  card, which is what makes the cache-bypass claim mean something. */
async function seedViewerUniverse(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: IDS.catchAllRule, name: "*all+*read", leftId: IDS.all, rightId: IDS.read, typeId: IDS.basic });
  await seedReference(storage, IDS.catchAllRule, IDS.kai, "kai_reader");
  await seedCard(storage, { id: IDS.pageSet, name: "Tidepool Set", typeId: IDS.set });
  await seedCard(storage, {
    id: IDS.pageRule,
    name: "Harbor Bulletin+*read",
    leftId: IDS.pageSet,
    rightId: IDS.read,
    typeId: IDS.basic,
    dbContent: "[[Wren Editor]]",
  });
  await seedReference(storage, IDS.pageRule, IDS.wren, "wren_editor");
  await seedCard(storage, { id: IDS.wren, name: "Wren Editor", typeId: IDS.basic });
  await seedCard(storage, { id: IDS.kai, name: "Kai Reader", typeId: IDS.basic });
  await seedCard(storage, {
    id: IDS.page,
    name: "Harbor Bulletin",
    typeId: IDS.basic,
    dbContent: "Tide conditions are synthetic.",
    readRuleId: IDS.pageRule,
    readRuleClass: "set",
  });
}

/** data-slot-id is per-render randomness (src/card/render/slot-html.ts); mask
 *  it before comparing two renders' bytes. */
const SLOT_ID_RUN = /data-slot-id=(["'])[0-9a-f]+\1/g;
const maskSlots = (html: string) => html.replace(SLOT_ID_RUN, "data-slot-id=SLOT");

/** Every statement that carried the one-trip payload's head. */
const isSeatHead = (sql: string) => /AS deck_data_version/.test(sql) && /AS member_ids_json/.test(sql);

let deck: RenderTestStorage | undefined;
let actors: ActorRenderEngines | undefined;

beforeAll(async () => {
  const storage = await createRenderTestStorage();
  await seedDeckSkeleton(storage);
  await seedViewerUniverse(storage);
  actors = new ActorRenderEngines({ fetcher: storage.fetcher, render: storage.engine });
  deck = storage;
}, 120_000);

afterAll(() => deck?.close());

/** Statements issued since `from`, as a slice of the counting driver's log. */
const statementsSince = (from: number): string[] =>
  (deck?.counting.statements ?? []).slice(from);

// ---------------------------------------------------------------------------
// CLAIM 2 — one-trip freshness
// ---------------------------------------------------------------------------

const ONE_TRIP_ENV = ["DECKO_ONE_TRIP", "DECKO_ONE_TRIP_STORE"] as const;
const priorOneTripEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of ONE_TRIP_ENV) {
    const prior = priorOneTripEnv.get(key);
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
    priorOneTripEnv.delete(key);
  }
});

function setOneTripEnv(key: (typeof ONE_TRIP_ENV)[number], value: string): void {
  if (!priorOneTripEnv.has(key)) priorOneTripEnv.set(key, process.env[key]);
  process.env[key] = value;
}

describe("one-trip freshness", () => {
  it("Freshness. `deck_data_version` is read in the same round trip as the payload and compared against the last seen value; a mismatch recomputes before seating. — armed with a derived store, the first render fetches the payload, a second render with an unmoved stamp reuses the seated payload, and a render after a stamp bump recomputes it from the store", async () => {
    const storage = deck!;
    const driver: SQLDatabaseDriver = storage.counting;

    // The derived store, materialized INTO the serving database (the inline
    // posture DECKO_ONE_TRIP_STORE=inline names): the one_trip_* tables plus
    // the closure row for the page, so the head statement has a real payload.
    for (const statement of ONE_TRIP_SIDE_DDL) await driver.query(statement, []);
    await driver.query(
      "INSERT INTO one_trip_page_closure (page_id, card_id, depth, views) VALUES (?, ?, 1, '[]')",
      [IDS.page, IDS.page],
    );

    setOneTripEnv("DECKO_ONE_TRIP", "1");
    setOneTripEnv("DECKO_ONE_TRIP_STORE", "inline");

    // Render as the actor the page's own rule names, so the render is a
    // permitted read rather than a denial.
    const renderPage = async () => {
      const mark = deck!.counting.statements.length;
      const result = await renderPageWithStatus(actors!.deckFor(IDS.wren).render, "Harbor Bulletin");
      return { result, statements: statementsSince(mark) };
    };

    const first = await renderPage();
    expect(first.result.status).toBe(200);
    const firstHeads = first.statements.filter(isSeatHead);
    expect(firstHeads.length, "the first render must fetch the payload head").toBe(1);
    // THE SAME ROUND TRIP: the stamp rides the head's own statement rather
    // than a separate read. The head carries both the payload's member list
    // and deck_data_version in one SQL statement.
    expect(firstHeads[0]).toContain("AS deck_data_version");
    expect(firstHeads[0]).toContain("AS member_ids_json");
    expect(
      first.statements.filter((sql) => sql === DECK_DATA_VERSION_STATEMENT),
      "the seated render must not pay a separate trip for the freshness stamp",
    ).toEqual([]);

    // Second render, stamp unmoved: the seated payload is reused, so the
    // head is not refetched. This is the "reuse" a stamp move must break.
    const second = await renderPage();
    expect(second.result.status).toBe(200);
    expect(second.statements.filter(isSeatHead)).toEqual([]);

    // A committed write: the schema's deck_data_version triggers move the
    // stamp as a side effect of the content edit, exactly as another
    // process's write would.
    await driver.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "Tide conditions are synthetic and have changed.",
      IDS.page,
    ]);
    const stamp = await driver.query<{ version: number }>(
      'SELECT "version" FROM "deck_data_version" WHERE "id" = 1',
      [],
    );
    expect(Number(stamp.rows[0].version)).toBeGreaterThan(0);

    // Third render, after the bump: the payload is RECOMPUTED, not reused —
    // the head is fetched again inside this render, and the bytes carry the
    // edited body rather than the seated snapshot.
    const third = await renderPage();
    expect(third.result.status).toBe(200);
    expect(
      third.statements.filter(isSeatHead).length,
      "a moved deck_data_version must re-fetch the payload instead of reusing the seated one",
    ).toBe(1);
    expect(maskSlots(third.result.html)).toContain("synthetic and have changed");
    expect(maskSlots(third.result.html)).not.toBe(maskSlots(second.result.html));
  }, 120_000);
});

// ---------------------------------------------------------------------------
// CLAIM 3 — signed-in requests bypass every cache tier
// ---------------------------------------------------------------------------

/** An in-memory Cache API fake: the L2 script-side tier's whole surface,
 *  instrumented so "was this served from / written to the cache" is
 *  observable rather than inferred from bytes. */
function fakeEdgeCache(seed?: { url: string; html: string }): EdgeCacheLike & { matches: string[]; puts: string[] } {
  const store = new Map<string, Response>();
  if (seed !== undefined) {
    const entry = new Response(seed.html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
    entry.headers.set("X-Decko-Stored-At", String(Date.now()));
    store.set(seed.url, entry);
  }
  return {
    matches: [],
    puts: [],
    async match(request) {
      this.matches.push(String(request));
      return store.get(String(request));
    },
    async put(request, response) {
      this.puts.push(String(request));
      store.set(String(request), response);
    },
  };
}

/** A BunnyDB pipeline endpoint fake that answers ONE lookup with a stored
 *  row — the L3 global render cache's hit shape — and counts every POST. */
function fakeGlobalEndpoint(storedHtml: string): { posts: number; fetchImpl: typeof fetch } {
  let posts = 0;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    posts += 1;
    const sent = JSON.parse(String(init?.body ?? "")) as { requests: Array<{ type: string }> };
    const results = sent.requests.map((r) =>
      r.type === "close"
        ? { type: "ok", response: { type: "close" } }
        : {
            type: "ok",
            response: {
              type: "execute",
              result: {
                cols: ["content_type", "body", "stored_at"].map((name) => ({ name })),
                rows: [
                  [
                    { type: "text", value: "text/html; charset=utf-8" },
                    { type: "text", value: storedHtml },
                    { type: "integer", value: String(Date.now() - 5_000) },
                  ],
                ],
                affected_row_count: 0,
                last_insert_rowid: null,
              },
            },
          },
    );
    return new Response(JSON.stringify({ results }), { status: 200 });
  }) as unknown as typeof fetch;
  return {
    get posts() {
      return posts;
    },
    fetchImpl,
  };
}

describe("signed-in responses and the edge cache tiers", () => {
  const ENV = { DECKO_EDGE_CACHE: "1", DECKO_EDGE_GLOBAL_CACHE: "1" };
  const PAGE_URL = "https://deck.example/Harbor_Bulletin";

  it("Signed-in requests bypass every tier in both directions, so one viewer's rendered HTML can never be served to another. — the same card rendered as two different signed-in actors comes back as each actor's own render, with neither tier consulted", async () => {
    // The signed-in render, at the edge's own request surface — the same
    // call the entry makes for a cookie that resolves
    // (bunny-edge-engine-handler.ts:397-405). One surface for the baseline
    // and for the arms below, so a byte difference can only be the viewer.
    const edgePageFor = async (actorId: number): Promise<{ status: number; html: string }> => {
      const response = await handleEngineRequest(
        new Request(PAGE_URL),
        actors!.deckFor(actorId),
        {},
      );
      return { status: response.status, html: await response.text() };
    };

    const wren = await edgePageFor(IDS.wren);
    const kai = await edgePageFor(IDS.kai);
    expect(wren.status, "Wren is named by the page's read rule").toBe(200);
    expect(kai.status, "Kai is not, so the two viewers' responses differ").not.toBe(wren.status);
    const wrenBytes = maskSlots(wren.html);
    const kaiBytes = maskSlots(kai.html);
    expect(wrenBytes).not.toBe(kaiBytes);

    // CONTROLS: each tier ARMED and HOLDING the first viewer's bytes under
    // the very URL the signed-in request asks for, proven to answer. Without
    // them, "the signed-in path bypassed" could mean "the tiers were empty".
    // Each control gets its own arm so one tier cannot shadow the other's
    // answer (the script-side tier wraps the global one).
    const endpoint = fakeGlobalEndpoint(wren.html);
    const globalCache = new GlobalRenderCache(
      { url: "https://db.example/v2/pipeline", authToken: "synthetic-token" },
      { fetchImpl: endpoint.fetchImpl },
    );
    const otherViewerRender = async () =>
      new Response(kai.html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });

    const globalControl = await serveProfiled(
      startEdgeRequestProfile(),
      new Request(PAGE_URL),
      ENV,
      otherViewerRender,
      undefined,
      { wrapGlobal: true, globalCache },
    );
    expect(
      globalControl.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER),
      "the global tier is armed and would serve the stored bytes",
    ).toBe("hit");
    expect(await globalControl.text()).toBe(wren.html);
    expect(endpoint.posts).toBe(1);

    // Both tiers armed and seeded, for the signed-in arms below.
    const scriptCache = fakeEdgeCache({ url: PAGE_URL, html: wren.html });
    const scriptControl = await serveProfiled(
      startEdgeRequestProfile(),
      new Request(PAGE_URL),
      ENV,
      otherViewerRender,
      scriptCache,
    );
    expect(
      scriptControl.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER),
      "the script-side tier is armed and would serve the stored bytes",
    ).toBe("armed; cache=hit");
    expect(await scriptControl.text()).toBe(wren.html);

    // Now the signed-in path, for BOTH actors, over those same armed tiers.
    // The controls' own cache traffic is cleared first, so what follows is
    // exactly the signed-in requests' contact with each tier.
    scriptCache.matches.length = 0;
    scriptCache.puts.length = 0;
    const postsAtStart = endpoint.posts;
    for (const [label, actorId, expected] of [
      ["Wren Editor", IDS.wren, wren],
      ["Kai Reader", IDS.kai, kai],
    ] as const) {
      let renders = 0;
      const response = await serveProfiled(
        startEdgeRequestProfile(),
        new Request(PAGE_URL, { headers: { cookie: `decko_session=synthetic-token-for-${actorId}` } }),
        ENV,
        async () => {
          renders += 1;
          // The signed-in render is the actor's own engine, exactly as the
          // edge entry hands it (bunny-edge-engine-handler.ts:397-405).
          return handleEngineRequest(new Request(PAGE_URL), actors!.deckFor(actorId), {});
        },
        scriptCache,
        // The edge's own signed-in call shape: perViewer, and NO wrapGlobal —
        // the global tier is not even constructed for signed-in traffic.
        { perViewer: true },
      );

      expect(renders, `${label}'s render must run`).toBe(1);
      expect(response.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=per-viewer-bypass");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.status, `${label} sees their own status`).toBe(expected.status);
      expect(maskSlots(await response.text()), `${label} must see their own bytes`).toBe(
        maskSlots(expected.html),
      );
    }

    // BOTH DIRECTIONS on both tiers: nothing was served from either, and
    // nothing was written into the script-side one.
    expect(endpoint.posts, "a signed-in response never contacts the global tier").toBe(postsAtStart);
    expect(scriptCache.matches, "a signed-in response is never served FROM the shared cache").toEqual([]);
    expect(scriptCache.puts, "a signed-in response is never stored INTO the shared cache").toEqual([]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// CLAIM 4 — the origin check on every state-changing request
// ---------------------------------------------------------------------------

const ORIGIN_CLAIM =
  "Every state-changing request ... passes an origin check before anything runs: `Sec-Fetch-Site: cross-site` or `same-site` is refused; otherwise an `Origin` header must name the deck's own host (or a trusted origin), and `Origin: null` is refused; otherwise a `Referer` must. ... A refused request gets 403.";

const HOST = "deck.example";

/** Id map for the write + first-run deck. Disjoint from the render deck's
 *  range except where the engine requires the SAME row (the codename cards
 *  and the `*all+*default` junction), which is why the shared ids are the
 *  shared ones. */
const W = {
  account: 9101,
  email: 9102,
  password: 9103,
  salt: 9104,
  status: 9105,
  deckoBot: 9106,
  user: 9107,
  botAccountJunction: 9111,
  anonAccountJunction: 9112,
  note: 91,
  editor: 90,
} as const;

const SETUP_ENV = ["DECKO_FIRST_RUN", "DECKO_WRITE_PATH", "DECKO_SETUP_TOKEN"] as const;
const priorSetupEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of SETUP_ENV) {
    const prior = priorSetupEnv.get(key);
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
    priorSetupEnv.delete(key);
  }
});

function setSetupEnv(key: (typeof SETUP_ENV)[number], value: string): void {
  if (!priorSetupEnv.has(key)) priorSetupEnv.set(key, process.env[key]);
  process.env[key] = value;
}

/** The write-rule universe (`*all+*create` / `+*update` / `+*delete` granted
 *  to Anyone Signed In) plus the first-run account system: the five codename
 *  cards the account shape is built from, the two shipped bot-authored
 *  `+*account` rows a real Ruby deck starts with (auth/setup.rb:44), and the
 *  `*all+*default` junction the engine resolves a new card's type through. */
async function seedWriteDeck(storage: RenderTestStorage): Promise<void> {
  await seedDeckSkeleton(storage);
  for (const [id, codename, name] of [
    [W.account, "account", "*account"],
    [W.email, "email", "*email"],
    [W.password, "password", "*password"],
    [W.salt, "salt", "*salt"],
    [W.status, "status", "*status"],
    [W.deckoBot, "decko_bot", "Decko Bot"],
    [W.user, "user", "User"],
  ] as const) {
    await seedCard(storage, { id, name, codename, typeId: IDS.basic });
  }
  for (const [id, junctionName, right] of [
    [IDS.createRule, "*all+*create", IDS.create],
    [IDS.updateRule, "*all+*update", IDS.update],
    [IDS.deleteRule, "*all+*delete", IDS.delete],
  ] as const) {
    // A set junction is Set-TYPED: that is how the rule lookup finds it.
    await seedCard(storage, {
      id,
      name: junctionName,
      leftId: IDS.all,
      rightId: right,
      typeId: IDS.set,
      dbContent: "[[Anyone Signed In]]",
    });
    await seedReference(storage, id, IDS.anyoneSignedIn, "anyone signed in");
  }
  await seedCard(storage, {
    id: IDS.defaultRuleJunction,
    name: "*all+*default",
    leftId: IDS.all,
    rightId: IDS.default,
    typeId: IDS.set,
  });
  // The note's type registration, the row the engine's rule universe walks
  // to reach `Basic+*type+*update`.
  await seedCard(storage, {
    id: IDS.basicTypeJunction,
    name: "Basic+*type",
    leftId: IDS.basic,
    rightId: IDS.type,
    typeId: IDS.set,
  });
  await seedCard(storage, { id: W.editor, name: "Ines Porter", typeId: IDS.basic });
  await seedCard(storage, { id: W.note, name: "LumenNote", typeId: IDS.basic, dbContent: "original body" });
  // The two shipped accounts, both authored by the bot — the census's
  // exclusion, so the setup window measures the deck's own accounts only.
  for (const [id, holderId, holderName] of [
    [W.botAccountJunction, W.deckoBot, "Decko Bot"],
    [W.anonAccountJunction, IDS.anonymous, "*anonymous"],
  ] as const) {
    await seedCard(storage, {
      id,
      name: `${holderName}+*account`,
      leftId: holderId,
      rightId: W.account,
      typeId: IDS.all,
      creatorId: W.deckoBot,
    });
  }
}

let writeDeck: RenderTestStorage | undefined;
let writeCtx: WriteRouteContext | undefined;
let bearerToken = "";

beforeAll(async () => {
  const storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedWriteDeck(storage);
  writeDeck = storage;
  bearerToken = (await new SessionStore({ driver: storage.counting }).createSession(W.editor)).token;
  writeCtx = {
    driver: storage.counting,
    fetcher: storage.fetcher,
    originPolicy: originPolicyFromEnv({}),
  };
}, 120_000);

afterAll(() => writeDeck?.close());

/** One card-write request, in the shape the write surface takes. */
const noteWrite = (content: string, headers: Record<string, string>): WriteRouteRequest => ({
  method: "PUT",
  pathname: "/LumenNote.json",
  host: HOST,
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${bearerToken}`,
    ...headers,
  },
  body: JSON.stringify({ card: { content } }),
});

/** The note's stored content, read back through the fetcher (its cache
 *  expired first, so this is the database's answer, not a memo). */
async function noteContent(): Promise<string | null | undefined> {
  const storage = writeDeck!;
  storage.fetcher.expireName("LumenNote");
  return (await storage.fetcher.fetchByKey(DeckoName.parse("LumenNote").key))?.dbContent;
}

describe("the origin check on state-changing requests", () => {
  it(`${ORIGIN_CLAIM} — a cross-site write, an opaque Origin, a foreign Origin and a foreign Referer are each refused with 403 and the card is unchanged`, async () => {
    const refusals: ReadonlyArray<readonly [string, Record<string, string>]> = [
      ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
      ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site", origin: `https://sibling.${HOST}` }],
      ["Origin: null (an opaque origin)", { origin: "null" }],
      ["a foreign Origin", { origin: "https://elsewhere.example" }],
      ["a foreign Referer, without Origin", { referer: "https://elsewhere.example/a-page" }],
    ];
    for (const [label, headers] of refusals) {
      const before = await noteContent();
      const response = await handleWriteRequest(writeCtx!, noteWrite(`edit via ${label}`, headers));
      expect(response?.status, `${label} must be refused`).toBe(403);
      expect(JSON.parse(response!.body), `${label} is refused as cross-origin`).toMatchObject({
        error: { code: "cross-origin" },
      });
      expect(await noteContent(), `${label} must leave the card unchanged`).toBe(before);
    }
    expect(await noteContent()).toBe("original body");
  });

  it(`${ORIGIN_CLAIM} — same-origin, Referer-only, header-less and DECKO_TRUSTED_ORIGINS requests all pass and the write lands`, async () => {
    const passes: ReadonlyArray<readonly [string, Record<string, string>]> = [
      ["Origin naming this deck", { origin: `https://${HOST}` }],
      ["Origin naming this deck over http", { origin: `http://${HOST}` }],
      ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin", origin: `https://${HOST}` }],
      ["a Referer on this deck, without Origin", { referer: `http://${HOST}/LumenNote?view=edit` }],
      ["no Origin, Referer or Sec-Fetch-Site (an API client)", {}],
    ];
    for (const [label, headers] of passes) {
      const body = `saved via ${label}`;
      const response = await handleWriteRequest(writeCtx!, noteWrite(body, headers));
      expect(response?.status, `${label} must pass`).toBe(200);
      expect(await noteContent(), `${label} must land`).toBe(body);
    }

    // A configured trusted origin is treated as the deck's own.
    const trusted: WriteRouteContext = {
      ...writeCtx!,
      originPolicy: originPolicyFromEnv({
        DECKO_TRUSTED_ORIGINS: "https://external-editor.example",
      }),
    };
    const response = await handleWriteRequest(
      trusted,
      noteWrite("saved from the trusted editor", { origin: "https://external-editor.example" }),
    );
    expect(response?.status).toBe(200);
    expect(await noteContent()).toBe("saved from the trusted editor");
  });

  it(`${ORIGIN_CLAIM} — a cross-site sign-in is refused before authentication and mints no session`, async () => {
    const storage = writeDeck!;
    const sessionCount = async (): Promise<number> =>
      Number(
        (await storage.counting.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", []))
          .rows[0]?.n ?? 0,
      );

    const signin = (headers: Record<string, string>): WriteRouteRequest => ({
      method: "POST",
      pathname: "/update/*signin",
      host: HOST,
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body:
        "_method=patch&success%5Bredirect%5D=true&success%5Bmark%5D=*previous" +
        "&card%5Bsubcards%5D%5B%2B*email%5D%5Bcontent%5D=owner%40example.com" +
        "&card%5Bsubcards%5D%5B%2B*password%5D%5Bcontent%5D=Abcdef1%21",
    });

    const before = await sessionCount();
    const refused = await handleWriteRequest(writeCtx!, signin({ origin: "https://elsewhere.example" }));
    expect(refused?.status).toBe(403);
    expect(await sessionCount(), "a refused sign-in must mint no session").toBe(before);

    // The same request from the deck's own origin REACHES authentication
    // (here: an unknown address, so the write surface's own 422) — which is
    // what makes the 403 above the origin check and not a dead route.
    const sameSite = await handleWriteRequest(writeCtx!, signin({ origin: `http://${HOST}` }));
    expect(sameSite?.status).toBe(422);
  });

  it(`${ORIGIN_CLAIM} — a cross-site first-run setup POST creates no account`, async () => {
    setSetupEnv("DECKO_FIRST_RUN", "1");
    setSetupEnv("DECKO_WRITE_PATH", "1");
    // The one-time setup token (docs/SECURITY.md, divergence 5) is required
    // on every setup POST. It is presented in both posts below, so the only
    // thing that differs between them is the Origin header.
    const setupToken = "origin-check-setup-token";
    setSetupEnv("DECKO_SETUP_TOKEN", setupToken);
    const storage = writeDeck!;
    const post = (headers: Record<string, string>) =>
      handleFirstRunRequest(
        { driver: storage.counting, fetcher: storage.fetcher },
        {
          method: "POST",
          pathname: SETUP_PATH,
          host: HOST,
          headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
          body: `email=owner%40example.com&password=Abcdef1%21&setup_token=${encodeURIComponent(setupToken)}`,
        },
      );

    const refused = await post({ origin: "https://elsewhere.example" });
    expect(refused?.status).toBe(403);
    const window = await setupWindowState({ driver: storage.counting });
    expect(window.open, "the setup window stays open: no account was created").toBe(true);
    expect(window.accountCount).toBe(0);

    // The same POST from the deck's own origin is accepted, which is what
    // makes the 403 the origin check rather than a broken route.
    expect((await post({ origin: `http://${HOST}` }))?.status).toBe(303);
    expect((await setupWindowState({ driver: storage.counting })).accountCount).toBe(1);
  });
});
