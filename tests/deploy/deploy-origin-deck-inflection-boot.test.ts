// divergent-16 #8 / #9 (2026-10-02): EVERY deck-serving origin applies the
// deck's inflection table at boot, before any name is parsed.
//
// MECHANISM. `src/card/name/oracle-deck-inflections.ts` is DECK DATA, not
// engine defaults, and its own header states the rule this pin enforces
// (oracle-deck-inflections.ts:8-13):
//
//   Every deck-serving origin MUST apply this table at boot, BEFORE any name
//   is parsed or any row is primed - the same moment a Rails deck's
//   config/initializers/inflections.rb runs - via
//     applyDeckInflections(ORACLE_DECK_INFLECTIONS);
//
// The table is three uncountables (`s`, `this`, `anonymous`;
// oracle-deck-inflections.ts:53-55) recovered from the deck's 9,466 stored
// keys: `Anonymous` -> `anonymous` (default `anonymou`), `SCarol` ->
// `s_carol` (default `_carol`), `Brandon's` -> `brandon_s` (default
// `brandon_`), `delete this` -> `delete_this` (default `delete_thi`).
//
// WHY IT IS A RENDER DEFECT AND NOT ONLY A LOOKUP DEFECT. The derived key
// rides straight into the slot class tokens every card emits, so an origin
// that skips the boot renders the wrong BYTES for the two graded edge
// cards in the divergent-16 sample:
//   signup alert email :: content        SELF-anonymous-bar-view
//                                         vs SELF-anonymou-bar-view  (-3 B)
//   Dungeons and Dragons+SCarol :: open  RIGHT-s_carol / SELF-...-s_carol
//                                         vs ..._carol              (-12 B)
// Both were classified ENGINE DEFECT by the divergent-16 triage lane
// (an internal work log §4 rows 8 and 9), and
// §6 of that receipt proves the derivation flips when the table is applied.
//
// WHICH ORIGINS. Two ship:
//   deploy/worker.ts                              (Cloudflare Workers)
//   deploy/bunny-worker-src/bunny-edge-engine-entry.ts (Bunny Edge Script)
// Both constructed `new FetchEngine(driver)` and went straight to the
// lexicon warm / name-environment install. Neither applied the table, so
// neither derived a single deck-correct key. The Bunny entry is the origin
// behind the graded edge origin `https://edge.culturesmith.com`.
//
// WHAT IS PINNED HERE, AND WHY TWO KINDS OF ASSERTION.
//  - The behavioural half drives the REAL deploy/worker.ts fetch handler
//    in-process (the same module wrangler bundles, over the same D1-shaped
//    shim the sibling route tests use), after explicitly restoring the
//    GEM DEFAULT inflection tables. That is the honest RED: with the boot
//    call removed from worker.ts, the keys stay on the defaults.
//  - The static half reads the two origin SOURCES and asserts the call is
//    present and ABOVE the site that derives keys from names
//    (`DeckoName.parse` inside primeCqlNameResolver). The Bunny entry
//    cannot be driven in-process -- importing it calls
//    `BunnySDK.net.http.serve(...)` at module scope and starts a server --
//    so for that file the assertion is on the source shape. Stated plainly
//    rather than dressed up as a render.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import type {
  D1BindValue,
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "../../src/server/drivers/d1.js";
import { DeckoName } from "../../src/card/name.js";
import { resetDeckInflections } from "../../src/card/name/inflect.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS = `${REPO_ROOT}deploy/migrations/0001-schema.sql`;
const SEED = `${REPO_ROOT}deploy/seed/seed.sql`;

const ORIGINS = [
  {
    file: "deploy/worker.ts",
    // The line that derives every keyToId entry from a name. The boot call
    // must be ABOVE this one.
    keyDerivationSite: 'keyToId.set(DeckoName.parse(name).key, row.id)',
  },
  {
    // The boot module, not the handler: the boot moved twice — to
    // bunny-edge-engine-handler.ts (2026-10-03, worker-twins audit lane),
    // then to bunny-edge-deck-boot.ts (the p2-person-section lane's SDK-free
    // boot extraction; the deploy-surface-union lane wired the serving
    // handler through it, so the boot module is where the Bunny origin's
    // inflection application lives). The handler delegates
    // bootCorpusDeckEngines; the entry is the SDK registration shim only.
    file: "deploy/bunny-worker-src/bunny-edge-deck-boot.ts",
    keyDerivationSite: "new FetchEngine(driver)",
  },
] as const;

/** The names the deck's three uncountables change, and the key each one
 *  must carry once the table is applied. The default column is what the
 *  gem's ActiveSupport rules produce -- the shape the origin rendered
 *  before this pin's fix. */
const DECK_KEYED_NAMES = [
  { name: "Anonymous", deckKey: "anonymous", defaultKey: "anonymou" },
  { name: "SCarol", deckKey: "s_carol", defaultKey: "_carol" },
  { name: "Brandon's", deckKey: "brandon_s", defaultKey: "brandon_" },
  { name: "delete this", deckKey: "delete_this", defaultKey: "delete_thi" },
] as const;

function d1Shim(driver: LocalSqliteDriver): D1DatabaseLike {
  const run = async (sql: string, params: D1BindValue[]): Promise<D1ResultLike> => {
    const result = await driver.query(sql, params as unknown[]);
    return {
      success: true,
      results: result.rows as Record<string, unknown>[],
      meta: { changes: 0, rows_read: result.rowsRead, rows_written: 0 },
    };
  };
  return {
    prepare(sql: string): D1PreparedStatementLike {
      let bound: D1BindValue[] = [];
      const statement = {
        bind(...values: D1BindValue[]) {
          bound = values;
          return statement;
        },
        all: () => run(sql, bound),
        run: () => run(sql, bound),
      };
      return statement as unknown as D1PreparedStatementLike;
    },
    batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
      return Promise.all(
        statements.map((statement) =>
          (statement as unknown as { all: () => Promise<D1ResultLike> }).all(),
        ),
      );
    },
  };
}

let driver: LocalSqliteDriver | undefined;
let worker: { fetch: (request: Request, env: unknown) => Promise<Response> };

beforeAll(async () => {
  driver = new LocalSqliteDriver({ path: ":memory:" });
  for (const file of [MIGRATIONS, SEED]) {
    const sql = readFileSync(file, "utf8");
    for (const statement of splitSqlStatements(sql)) {
      await driver.query(statement, []);
    }
  }
  const module = await import("../../deploy/worker.js");
  worker = (module.default ?? module) as unknown as {
    fetch: (request: Request, env: unknown) => Promise<Response>;
  };
}, 60_000);

afterAll(() => {
  driver?.close();
  // Leave the process on the deck's table, the way a booted origin leaves it.
  resetDeckInflections();
});

describe("deck-serving origins apply the deck inflection table at boot", () => {
  it("bootDeck applies ORACLE_DECK_INFLECTIONS before it parses any name", () => {
    for (const origin of ORIGINS) {
      const src = readFileSync(`${REPO_ROOT}${origin.file}`, "utf8");
      const call = src.indexOf("applyDeckInflections(ORACLE_DECK_INFLECTIONS)");
      expect(call, `${origin.file} must call applyDeckInflections(ORACLE_DECK_INFLECTIONS)`).toBeGreaterThan(-1);
      const derive = src.indexOf(origin.keyDerivationSite);
      expect(derive, `${origin.file} lost its key-derivation site ${origin.keyDerivationSite}`).toBeGreaterThan(-1);
      expect(
        call,
        `${origin.file}: the boot call must come BEFORE ${origin.keyDerivationSite}`,
      ).toBeLessThan(derive);
    }
  });

  it("the real worker handler leaves the process on the deck's inflection table", async () => {
    // Establish the pre-boot state explicitly: the gem defaults. This is
    // what the origin used to derive from, and what makes the assertion
    // below an honest RED when the boot call is removed.
    resetDeckInflections();
    for (const row of DECK_KEYED_NAMES) {
      expect(DeckoName.parse(row.name).key, `pre-boot default for ${row.name}`).toBe(row.defaultKey);
    }

    // One request is enough: bootDeck runs on the isolate's first hit.
    const response = await worker.fetch(new Request("https://decko-ts.test/About"), {
      DB: d1Shim(driver!),
    });
    expect(response.status).toBe(200);

    for (const row of DECK_KEYED_NAMES) {
      expect(
        DeckoName.parse(row.name).key,
        `post-boot key for ${row.name}: the graded edge cards carry the DEFAULT shape without the table`,
      ).toBe(row.deckKey);
    }
  });

  it("keeps the gem defaults available as the reset state", () => {
    // The pin's own scaffolding, stated as an assertion so a future change
    // to the inflection module cannot silently make the test above vacuous.
    resetDeckInflections();
    expect(DeckoName.parse("musings").key).toBe("musing");
    expect(DeckoName.parse("mytho psychology").key).toBe("mytho_psychology");
  });
});
