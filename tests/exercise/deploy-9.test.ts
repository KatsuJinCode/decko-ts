// Public synthetic proofs for the Deploy-button boundary, the demo deck's
// missing write rights, the session cookie's shape, and D1's five-term
// compound-SELECT workaround.
//
// WHAT RUNS HERE. The REAL root worker.ts — the file wrangler.toml's
// `main = "worker.ts"` points at — bundled the way wrangler bundles it and
// booted in workerd through miniflare, over a LOCAL D1 (miniflare's own
// SQLite; no Cloudflare account, no network, no hosted service). The real
// deploy/migrations chain is applied to that D1 through the same
// CloudflareD1Adapter the worker itself runs on, so every assertion below is
// made against the deployment the button actually ships.
//
// THE DATA. Nothing here is real. The card names the tests touch
// ("Hello World") are migration 0003-demo-seed.sql's own committed synthetic
// demo rows; every body, every account, every marker string this file writes
// is invented here. No private fixture, no captured deck, no corpus.
//
// THE THREE CLAIMS, IN ORDER.
//   1. read-only boundary (README.md:90-92)
//   2. the 0004 demo deck ships no create/update/delete rights
//      (README.md:127-129)
//   3. sign-in stores only a SHA-256 digest (README.md:112-114)
//   4. the compound-SELECT rewrite (docs/deploy-cloudflare.md:116-124)
//
// WHY CLAIM 2 IS PROVED ACROSS TWO WORKER BOOTS. The engine resolves its
// rule universe once per driver generation and only drops that memo after a
// save IT performed (read-rules.ts:724-733, expireRuleResolutionCache wired
// at card-action-engine.ts:2788/:4536). Adding the right as deck content
// from outside the isolate cannot be seen by an isolate that already booted,
// so the second half boots a FRESH workerd over the SAME persisted D1 — a
// fresh driver, a fresh rule universe — exactly as a redeploy would.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { coffeescriptNodeBuiltinStubs } from "../../tools/vendor/coffeescript-edge-bundler-stubs.mjs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { CloudflareD1Adapter } from "../../src/server/drivers/d1.js";
import { MAX_COMPOUND_TERMS, RequestStore, unionCtes } from "../../src/card/live/request-store.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { scratchDir } from "../support/scratch-dir.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKER_ENTRY = `${REPO_ROOT}worker.ts`;
const MIGRATION_DIR = `${REPO_ROOT}deploy/migrations`;

// One D1 name + one persist directory per armed-deployment describe, so the
// second boot sees exactly the bytes the first one wrote.
const D1_NAME = "decko-exercise-deploy9";

interface Chunk {
  type: string;
  code?: string;
}

interface Booted {
  fetch: (path: string, init?: Record<string, unknown>) => Promise<Response>;
  adapter: CloudflareD1Adapter;
  dispose: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// boot helpers, lifted from tests/deploy/deploy-worker-write-surface.test.ts
// ---------------------------------------------------------------------------

/** The wrangler-style single-file bundle, built ONCE for the whole file:
 *  wrangler's esbuild bundle has no code splitting, so inlineDynamicImports
 *  keeps a dynamic import in the graph inside the one chunk workerd boots. */
let bundlePromise: Promise<string> | undefined;
function workerBundle(): Promise<string> {
  bundlePromise ??= (async () => {
    // The wrangler bundle shape itself: esbuild, platform neutral, the
    // repository's real edge-bundling discipline (tools/bundle-cf-edge-engine.mjs)
    // — node builtins stay external, and the coffeescript subtree's builtin
    // requires resolve to the loud stub. The earlier vite/rolldown bundling
    // emitted an eager createRequire(import.meta.url) interop shim that
    // workerd cannot boot; wrangler's esbuild never produces one.
    const result = await build({
      entryPoints: [WORKER_ENTRY],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      external: [...builtinModules, ...builtinModules.map((n) => `node:${n}`)],
      conditions: ["deno", "bunny", "import", "default"],
      mainFields: ["module", "main"],
      alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
      plugins: [coffeescriptNodeBuiltinStubs()],
      logLevel: "warning",
    });
    const bundle = result.outputFiles?.[0]?.text ?? "";
    expect(bundle.length, "the bundle must carry the engine, not just a stub").toBeGreaterThan(10_000);
    return bundle;
  })();
  return bundlePromise;
}

/** The real migration chain, in the order `wrangler d1 migrations apply`
 *  walks the directory. Applied through the same adapter the worker runs on. */
async function applyMigrations(adapter: CloudflareD1Adapter): Promise<void> {
  const chain = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql")).sort();
  expect(chain.length).toBeGreaterThanOrEqual(8);
  for (const file of chain) {
    const sql = readFileSync(`${MIGRATION_DIR}/${file}`, "utf8");
    await adapter.batch(splitSqlStatements(sql).map((s) => ({ sql: s, params: [] })));
  }
}

/** Boot the real worker.ts in a real workerd over a local D1.
 *
 *  `migrate` runs the chain once; a reboot over the same persist directory
 *  passes false, because 0001's CREATE TABLE is not idempotent and the
 *  second boot would otherwise be re-creating a deck that already exists.
 *
 *  redirect: "manual" is REQUIRED, not cosmetic — the write routes answer
 *  303 with a Location header and undici's default redirect-following would
 *  build the follow-up request without miniflare's loopback dispatcher, so
 *  the whole call would die on real DNS. */
async function bootWorker(vars: Record<string, string>, opts: { persistPath: string; migrate: boolean }): Promise<Booted> {
  const bundle = await workerBundle();
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle,
      compatibilityDate: "2026-08-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: D1_NAME },
      resourcePersistencePath: opts.persistPath,
      bindings: vars,
    }) as never,
  );
  const adapter = new CloudflareD1Adapter(await mf.getD1Database("DB"));
  if (opts.migrate) await applyMigrations(adapter);
  const fetch = async (path: string, init?: Record<string, unknown>): Promise<Response> =>
    (await mf.dispatchFetch(`https://decko-demo.test${path}`, {
      redirect: "manual",
      ...(init ?? {}),
    } as never)) as unknown as Response;
  return { fetch, adapter, dispose: async () => { await mf.dispose(); } };
}

/** The captured oracle sign-in form's grammar
 *  (write-routes.ts:613-624): card[subcards][+*email][content] and
 *  card[subcards][+*password][content], posted to /update/*signin. */
function signinFormBody(email: string, password: string): string {
  return new URLSearchParams({
    _method: "patch",
    "success[redirect]": "true",
    "success[mark]": "*previous",
    "card[subcards][+*email][content]": email,
    "card[subcards][+*password][content]": password,
  }).toString();
}

const form = (body: string): Record<string, unknown> => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});

// Invented account. The password clears Ruby's create-time ladder
// (right/password.rb:1-9: a lower, an upper, a special and a number). The
// local part is one legal word, so the name the owner create derives from it
// (first-run-setup.ts:565-591) is exactly "buttonowner".
const OWNER_EMAIL = "buttonowner@decko-exercise.test";
const OWNER_NAME = "buttonowner";
const OWNER_PASSWORD = "Exercise-Deploy-1!";

// The saves the claim-2 halves attempt. Nothing about the REQUESTS changes
// between the refusal and the success — only which actor makes them and
// what deck content exists. ANON_SAVE_BODY carries a different body so the
// second half's success is visible as a CONTENT change and not merely as a
// redirect: the first half's owner save already wrote SAVE_BODY's text.
const TARGET_CARD = "Hello World";
const SAVE_BODY = new URLSearchParams({
  "card[content]": "an exercise body written from the deploy write path",
}).toString();
const ANON_SAVE_BODY = new URLSearchParams({
  "card[content]": "a body an anonymous actor wrote once the deck allowed it",
}).toString();
/** The party the added right covers: migration 0006's `Anyone` role
 *  (real.yml:18-23), the party every actor matches. */
const ANYONE_PARTY = "Anyone";
/** How the engine names an actor that is nobody (src/card/actions/types.ts:36
 *  ANONYMOUS_ACTOR_NAME). A request with no session cookie resolves to it. */
const ANONYMOUS_ACTOR = "*anonymous";

async function cardContent(adapter: CloudflareD1Adapter, name: string): Promise<string | null> {
  const rows = await adapter.query<{ db_content: string | null }>(
    "SELECT db_content FROM cards WHERE name = ? AND trash = 0 ORDER BY id LIMIT 1",
    [name],
  );
  return rows.rows[0]?.db_content ?? null;
}

async function writeRowCounts(adapter: CloudflareD1Adapter): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ["cards", "card_acts", "card_actions", "card_changes", "card_revisions", "card_references"]) {
    const rows = await adapter.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
    out[table] = Number(rows.rows[0]?.n ?? 0);
  }
  return out;
}

// ---------------------------------------------------------------------------

describe("the button deploy is read-only: worker.ts on workerd, write path unset", () => {
  let booted: Booted | undefined;
  beforeAll(async () => {
    const persistPath = scratchDir("decko-exercise-deploy9-readonly-");
    booted = await bootWorker({}, { persistPath, migrate: true });
  }, 300_000);
  afterAll(async () => {
    await booted?.dispose();
  });

  it("\"A deploy from the button is read-only: it can show every card and answer JSON for any of them, and it will refuse every attempt to change anything with a plain 403\" — both GETs answer 200, and POST, PUT and DELETE each answer the deployment's own 403 with no row written", async () => {
    const b = booted!;
    const countsBefore = await writeRowCounts(b.adapter);
    const contentBefore = await cardContent(b.adapter, TARGET_CARD);

    // --- the two reads the claim promises -------------------------------
    const page = await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`);
    expect(page.status, await page.clone().text()).toBe(200);
    const pageHtml = await page.text();
    // The card's own seeded body (deploy/migrations/0003-demo-seed.sql:52-57).
    expect(pageHtml).toContain("Welcome to the decko-ts demo running on Cloudflare Workers.");

    const json = await b.fetch(`/api/card/${TARGET_CARD.replace(/ /g, "%20")}`);
    expect(json.status, await json.clone().text()).toBe(200);
    const molecule = (await json.json()) as {
      id: number | null;
      name: string;
      key: string;
      type_id: number | null;
      codename: string | null;
      db_content_preview: string;
    };
    expect(molecule.name).toBe(TARGET_CARD);
    expect(molecule.key).toBe("hello_world");
    expect(molecule.id).toBeGreaterThan(0);
    expect(molecule.db_content_preview).toContain("Welcome to the decko-ts demo running on Cloudflare Workers.");

    // --- every write verb, against that same readable card ----------------
    const refusals: Array<{ label: string; res: Response }> = [
      { label: "POST", res: await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`, form(SAVE_BODY)) },
      {
        label: "PUT",
        res: await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`, {
          method: "PUT",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: "decko_ts_session=not-a-real-session" },
          body: SAVE_BODY,
        }),
      },
      {
        label: "DELETE",
        res: await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "_method=delete",
        }),
      },
    ];

    for (const { label, res } of refusals) {
      const body = await res.text();
      expect(res.status, `${label} answered ${res.status}: ${body}`).toBe(403);
      // The refusal is the DEPLOYMENT's, not the engine's: this string is
      // the write-path gate's own message, and the gate answers before the
      // engine's route table runs (worker.ts:256-266 hands every non-GET to
      // handleWorkersWriteSurface with the write path unarmed). The engine's
      // OWN refusal names the card and the actor instead — the claim-2 case
      // below shows that shape. So what is proven here is that the request
      // was refused AT the gate and that no row moved; a per-SELECT count of
      // the isolate's reads is not something this harness can observe.
      expect(body, `${label} was not answered by the write-path gate`).toContain(
        "Writes are off on this deployment",
      );
      expect(body, `${label} reached the engine's own refusal`).not.toMatch(/may not (create|update|delete) card/);
    }

    // And nothing the engine would have written is there.
    expect(await writeRowCounts(b.adapter)).toEqual(countsBefore);
    expect(await cardContent(b.adapter, TARGET_CARD)).toBe(contentBefore);
    // The read path still answers after the refusals — the gate refused the
    // verbs, not the card.
    expect((await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`)).status).toBe(200);
  }, 180_000);
});

// ---------------------------------------------------------------------------

describe("the 0004 demo deck ships no write rights, and sign-in stores only a digest", () => {
  const persistPath = scratchDir("decko-exercise-deploy9-armed-");
  let armed: Booted | undefined;
  let ownerCardId: number | undefined;
  let cookie: string | undefined;

  /** Sign in over HTTP and keep the cookie the way a browser would. */
  async function signIn(b: Booted): Promise<string> {
    const res = await b.fetch("/update/*signin", form(signinFormBody(OWNER_EMAIL, OWNER_PASSWORD)));
    if (res.status !== 303) {
      throw new Error(`sign-in answered ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    return (res.headers.get("set-cookie") as string).split(";")[0]!;
  }

  beforeAll(async () => {
    armed = await bootWorker({ DECKO_WRITE_PATH: "1" }, { persistPath, migrate: true });
    // The owner this deployment signs in as, created through the real
    // first-run path. It runs HERE, in the vitest process, so it reads THIS
    // process's gates; both are set because setupWindowState requires them
    // both (first-run-setup.ts:379-386). The worker stays armed but its
    // /setup window is shut, which is the state the README describes.
    process.env.DECKO_FIRST_RUN = "1";
    process.env.DECKO_WRITE_PATH = "1";
    try {
      const { createOwnerAccount } = await import("../../src/card/auth/first-run-setup.js");
      const { FetchEngine } = await import("../../src/card/fetch.js");
      const outcome = await createOwnerAccount(
        { driver: armed.adapter, fetcher: new FetchEngine(armed.adapter) },
        { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      );
      if (!outcome.ok) throw new Error(`fixture owner create failed: ${outcome.reason} ${outcome.message}`);
      ownerCardId = outcome.owner.id;
    } finally {
      delete process.env.DECKO_FIRST_RUN;
      delete process.env.DECKO_WRITE_PATH;
    }
    cookie = await signIn(armed);
  }, 300_000);
  afterAll(async () => {
    await armed?.dispose();
  });

  it("\"Sign-in stores only a SHA-256 digest of the session token in D1 — the token itself is never written down — and hands you an HttpOnly, SameSite=Lax, Secure cookie that carries it\" — the cookie carries all three attributes, and the stored session row is the digest: searching it for the raw token finds nothing", async () => {
    const b = armed!;
    // Re-run the sign-in so the Set-Cookie header and the row are from ONE
    // response, not two independent requests.
    const res = await b.fetch("/update/*signin", form(signinFormBody(OWNER_EMAIL, OWNER_PASSWORD)));
    expect(res.status, await res.clone().text()).toBe(303);

    const setCookie = res.headers.get("set-cookie") as string;
    expect(setCookie).toContain("decko_ts_session=");
    expect(setCookie, "the cookie must be HttpOnly").toContain("HttpOnly");
    expect(setCookie, "the cookie must be SameSite=Lax").toContain("SameSite=Lax");
    expect(setCookie, "this https deployment adds Secure").toContain("Secure");

    const token = /^decko_ts_session=([^;]+)/.exec(setCookie)?.[1];
    expect(token, "the cookie must carry a session token").toBeTruthy();
    const raw = token as string;

    // The row that IS this session: its token_hash is the sha256 of the raw
    // token, and the raw value appears nowhere in the row.
    const digest = createHash("sha256").update(raw).digest("hex");
    const rows = await b.adapter.query<{
      token_hash: string;
      account_card_id: number;
      created_at: string;
      expires_at: string;
    }>("SELECT token_hash, account_card_id, created_at, expires_at FROM auth_sessions", []);
    expect(rows.rows.length).toBeGreaterThan(0);

    const session = rows.rows.find((r) => r.token_hash === digest);
    expect(session, "the stored row must be this session's digest").toBeDefined();
    expect(session!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(session!.account_card_id).toBe(ownerCardId);

    // THE CLAIM: searching the stored row for the raw token finds nothing —
    // in its hash column and across every column of the row.
    expect(JSON.stringify(session)).not.toContain(raw);
    expect(session!.token_hash).not.toBe(raw);
    expect(rows.rows.some((r) => r.token_hash === raw)).toBe(false);
    for (const row of rows.rows) {
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(raw);
    }
    // And no other table in the deployment holds the raw token either.
    // instr(), not LIKE: D1's LIKE refuses a pattern this long
    // ("LIKE or GLOB pattern too complex"), and an exact substring test is
    // what "searching for the raw token" means anyway.
    for (const [table, column] of [["cards", "db_content"], ["sessions", "data"], ["delayed_jobs", "handler"]] as const) {
      const hit = await b.adapter.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE instr(CAST(${column} AS TEXT), ?) > 0`,
        [raw],
      );
      expect(Number(hit.rows[0]?.n ?? 0), `${table}.${column} must not hold the raw token`).toBe(0);
    }
  }, 180_000);

  it("\"the demo deck that migration 0004 seeds ships no create / update / delete rights at all, so the engine's permission walk refuses every save with a 403, correctly, for everybody who is not already an administrator\" — the setup owner, who IS an administrator, saves successfully; an anonymous save on the same armed deployment is refused with 403 and no row written; and the anonymous save succeeds once the right exists as deck content", async () => {
    const b = armed!;
    const sessionCookie = cookie ?? (await signIn(b));

    // The deck, on its own, carries no rule card for any write task.
    for (const codename of ["update", "create", "delete"]) {
      const found = await b.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE codename = ? AND trash = 0",
        [codename],
      );
      expect(Number(found.rows[0]?.n ?? 0), `the 0004 deck must ship no *${codename} right`).toBe(0);
    }

    // --- HALF ONE, the OWNER: the save SUCCEEDS --------------------------
    const countsBefore = await writeRowCounts(b.adapter);
    const contentBefore = await cardContent(b.adapter, TARGET_CARD);
    expect(contentBefore, "the demo deck's own seeded body").toBeTruthy();

    const saved = await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: sessionCookie },
      body: SAVE_BODY,
    });
    expect(saved.status, await saved.clone().text()).toBe(303);
    // The save landed, and it landed once: the body the request carried is
    // now the card's body, and exactly one new revision row was added for
    // it. An update writes a revision, not a card, so the card count is
    // unchanged while the revision and act counts each grew by one.
    expect(await cardContent(b.adapter, TARGET_CARD)).toBe(
      new URLSearchParams(SAVE_BODY).get("card[content]"),
    );
    // ...and it landed ONCE. An update writes its audit rows, not a card: the
    // card count is unchanged (no stray duplicate) and each of the act /
    // action / change tables gained exactly one row.
    //
    // `card_revisions` is deliberately NOT asserted. It is declared in
    // src/server/schema.ts and no code path inserts into it, so a revision
    // count says nothing about whether this save happened.
    const countsAfterSave = await writeRowCounts(b.adapter);
    expect(countsAfterSave.cards).toBe(countsBefore.cards);
    expect(countsAfterSave.card_acts).toBe(countsBefore.card_acts + 1);
    expect(countsAfterSave.card_actions).toBe(countsBefore.card_actions + 1);
    expect(countsAfterSave.card_changes).toBe(countsBefore.card_changes + 1);

    // THIS ASSERTION CHANGED, and the cause is a fixed bug rather than a
    // loosened test. The old version of this half asserted 403 and its
    // comment explained it as "a property of the seeded DECK CONTENT, not of
    // the write path" — true of the symptom, wrong about the cause: the deck
    // refused because the owner held no role, and the owner held no role
    // because first-run setup wrote its membership to `<role>+members`
    // instead of the `<role>+*members` SETTING the permission walk reads
    // (read-rules.ts:247-248). Ruby's setup_first_user puts the first user
    // into roles_for_first_user (user.rb:3) — Help Desk, Shark,
    // Administrators — through each role's `*members` setting
    // (card-mod-account set/self/role.rb:33-40). The port's owner is an
    // administrator too now, so ok_to_create?/ok_to_update? finds a rule
    // that allows it and the save returns Ruby's success redirect.
    //
    // What it now proves about the wiring, which is this file's subject, is
    // strictly more than before: the request left the Worker, matched the
    // update route, carried the D1-backed session, resolved it to the OWNER
    // card (not Anonymous), reached the engine's rule walk, and came back
    // with the row committed.

    // --- HALF ONE, the STRANGER: the identical verb is still refused ------
    // The refusal guarantee is not weakened by the half above; it moves to
    // the actor the claim was always about. A deploy is read-only FOR
    // STRANGERS: an anonymous PUT on this same armed deployment reaches the
    // engine (it is not the write-path gate above — that one is unarmed) and
    // is refused, naming the actor it resolved to.
    const contentAfterOwnerSave = await cardContent(b.adapter, TARGET_CARD);
    const refused = await b.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: SAVE_BODY,
    });
    const refusalBody = await refused.text();
    expect(refused.status, refusalBody).toBe(403);
    // The ENGINE refused. Distinguishable from the deployment's write-off
    // gate, which answers before the engine's route table runs at all.
    expect(refusalBody).not.toContain("Writes are off on this deployment");
    expect(refusalBody).toMatch(/may not (create|update|delete) card/i);
    expect(refusalBody).toContain(ANONYMOUS_ACTOR);
    // And it wrote nothing: not one row, and not one byte of the card.
    expect(await writeRowCounts(b.adapter)).toEqual(countsAfterSave);
    expect(await cardContent(b.adapter, TARGET_CARD)).toBe(contentAfterOwnerSave);

    // --- ADD THE RIGHT AS DECK CONTENT ------------------------------------
    // What README.md:127-131 says is missing: "adding that permission is
    // deck content, so it is yours to add". Three rows, exactly the shape a
    // real deck bootstraps (the reference seed's *all+*update 6570 — see
    // tests/card/actions/actions-test-storage.ts:231-247): the `*update`
    // setting right, the rule card `*all+*update` hanging off the deck's Set
    // card, and the reference naming who the right covers. The rule's
    // content is the party link, the durable row the permission walk reads
    // (view-task-rules.ts:99-116, who_can -> card_references).
    //
    // WHO THE RIGHT COVERS. The old version of this block named the OWNER,
    // and its second half then re-signed-in as the owner to attempt the save.
    // That was a demonstration of nothing once the setup owner became an
    // administrator: its save would succeed with or without this rule. The
    // party is now `Anyone` — the party every actor matches, the anonymous
    // one included — and the second half attempts the save as the actor that
    // was refused above. So what flips between the halves is the DECK
    // CONTENT and nothing else, which is the claim this half exists to make.
    const ids = await b.adapter.query<{ setting: number; all: number; setType: number }>(
      `SELECT
         (SELECT id FROM cards WHERE codename = 'set' AND trash = 0 ORDER BY id LIMIT 1) AS setType,
         (SELECT id FROM cards WHERE codename = 'all' AND trash = 0 ORDER BY id LIMIT 1) AS "all",
         (SELECT id FROM cards WHERE codename = 'setting' AND trash = 0 ORDER BY id LIMIT 1) AS setting`,
      [],
    );
    const { setType, all } = ids.rows[0]!;
    // `Anyone` — migration 0006's role card (deploy/migrations/
    // 0006-demo-role-substrate.sql:144-148, real.yml:18-23). Looked up by
    // codename so the row cannot drift from the deck's own ids.
    const anyone = await b.adapter.query<{ id: number; key: string | null }>(
      "SELECT id, key FROM cards WHERE codename = 'anyone' AND trash = 0",
      [],
    );
    expect(anyone.rows[0], "0006 must ship the Anyone party").toBeDefined();
    const stamp = "2026-10-10 00:00:00.000";
    const newSettingId = 9001;
    const newRuleId = 9002;
    await b.adapter.query(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id,
        references_expired, trash, type_id, db_content)
       VALUES (?, '*update', '*update', 'update', NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL, 0,
        (SELECT id FROM cards WHERE codename = 'setting' AND trash = 0 ORDER BY id LIMIT 1), NULL)`,
      [newSettingId, stamp, stamp, ownerCardId, ownerCardId],
    );
    await b.adapter.query(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id,
        references_expired, trash, type_id, db_content)
       VALUES (?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
      [newRuleId, all, newSettingId, stamp, stamp, ownerCardId, ownerCardId, setType, `[[${ANYONE_PARTY}]]`],
    );
    await b.adapter.query(
      `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
       VALUES (?, ?, ?, 'L', NULL)`,
      [newRuleId, anyone.rows[0]?.key ?? ANYONE_PARTY, anyone.rows[0]!.id],
    );
    expect(setType).toBeGreaterThan(0);

    // --- HALF TWO: the ANONYMOUS save, on a fresh isolate over the same D1.
    // A redeploy is the honest way to be sure the rule universe is rebuilt:
    // the engine memoizes it per driver generation and only expires it after
    // a save it performed (read-rules.ts:724-733). No cookie this time, so
    // the actor is the same one the first half was refused for.
    await armed!.dispose();
    armed = undefined;
    const rebooted = await bootWorker({ DECKO_WRITE_PATH: "1" }, { persistPath, migrate: false });
    try {
      const saved = await rebooted.fetch(`/${TARGET_CARD.replace(/ /g, "%20")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: ANON_SAVE_BODY,
      });
      const savedBody = await saved.text();
      expect(saved.status, savedBody).toBe(303);
      expect(saved.headers.get("set-cookie")).toBeNull();
      // The save landed: the card now carries the body this file invented —
      // a body DIFFERENT from the owner's, so this is a real change and not a
      // re-save of what was already there.
      expect(await cardContent(rebooted.adapter, TARGET_CARD)).toBe(
        new URLSearchParams(ANON_SAVE_BODY).get("card[content]"),
      );
      const afterAnon = await writeRowCounts(rebooted.adapter);
      expect(afterAnon.card_acts).toBe(countsAfterSave.card_acts + 1);
      // Cards grew by exactly TWO since the owner's save, and both are the
      // deck content this test inserted above (the `*update` setting and the
      // `*all+*update` rule). The anonymous save itself created nothing — an
      // update edits, it does not add.
      expect(afterAnon.cards).toBe(countsAfterSave.cards + 2);
    } finally {
      await rebooted.dispose();
    }
  }, 300_000);
});

// ---------------------------------------------------------------------------

describe("D1's five-term compound-SELECT limit and the CTE rewrite that works within it", () => {
  let mf: Miniflare | undefined;
  let adapter: CloudflareD1Adapter | undefined;

  // Seven single-term SELECTs over one synthetic table. They overlap on
  // purpose (ids repeat across terms), so a rewrite that dropped or
  // duplicated a term would show up as a different row list.
  const PARTS = [
    "SELECT id FROM exercise_cards WHERE id IN (9, 2)",
    "SELECT id FROM exercise_cards WHERE bucket = 'alpha'",
    "SELECT id FROM exercise_cards WHERE id IN (5, 1)",
    "SELECT id FROM exercise_cards WHERE id IN (7, 3)",
    "SELECT id FROM exercise_cards WHERE bucket = 'beta'",
    "SELECT id FROM exercise_cards WHERE id IN (10, 4)",
    "SELECT id FROM exercise_cards WHERE id IN (6, 8)",
  ];
  /** Largest number of terms in any one compound SELECT of a CTE list. */
  const maxTerms = (ctes: string[]) => Math.max(...ctes.map((c) => c.split(" UNION ").length));

  beforeAll(async () => {
    const persistPath = scratchDir("decko-exercise-deploy9-union-");
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: "export default { fetch() { return new Response(''); } }",
        compatibilityDate: "2026-08-01",
        d1Databases: { DB: "decko-exercise-deploy9-union" },
        resourcePersistencePath: persistPath,
      }) as never,
    );
    adapter = new CloudflareD1Adapter(await mf.getD1Database("DB"));
    await adapter.query(
      "CREATE TABLE exercise_cards (id INTEGER PRIMARY KEY, bucket TEXT)",
      [],
    );
    // Synthetic rows, invented here: ids 1-4 in one bucket, 5-8 in another,
    // 9-10 in neither.
    const rows: Array<[number, string | null]> = [
      [1, "alpha"], [2, "alpha"], [3, "alpha"], [4, "alpha"],
      [5, "beta"], [6, "beta"], [7, "beta"], [8, "beta"],
      [9, null], [10, null],
    ];
    for (const [id, bucket] of rows) {
      await adapter.query("INSERT INTO exercise_cards (id, bucket) VALUES (?, ?)", [id, bucket]);
    }
  }, 120_000);
  afterAll(async () => {
    await mf?.dispose();
  });

  it("\"A compound SELECT may have at most five terms ... A union built from more terms than that is emitted as several common table expressions of at most five terms each ... The rows and their order are unchanged\" — D1 refuses the seven-term union outright, the rewrite unionCtes emits answers the same rows in the same order, and the rewrite is what the engine's own widening statements use", async () => {
    const db = adapter!;

    // The emitted rewrite: seven terms -> fs_0 (5 terms) + fs_1 (2 terms),
    // and `reach` is their UNION (request-store.ts:89-107).
    const ctes = unionCtes("reach", PARTS);
    expect(ctes.length).toBe(3);
    expect(ctes[0]).toBe(`reach_0(id) AS (${PARTS.slice(0, 5).join(" UNION ")})`);
    expect(ctes[1]).toBe(`reach_1(id) AS (${PARTS.slice(5).join(" UNION ")})`);
    expect(ctes[2]).toBe("reach(id) AS (SELECT id FROM reach_0 UNION SELECT id FROM reach_1)");
    expect(maxTerms(ctes)).toBeLessThanOrEqual(MAX_COMPOUND_TERMS);
    expect(MAX_COMPOUND_TERMS).toBe(5);

    // The limit is REAL on this runtime: the un-rewritten seven-term union
    // is refused by D1's own SQLite. Without this the "the rewrite works"
    // assertion below would prove nothing.
    const flat = `SELECT id FROM (${PARTS.join(" UNION ")})`;
    let d1Refused = "";
    try {
      await db.query(flat, []);
      d1Refused = "(D1 accepted the seven-term union)";
    } catch (error) {
      d1Refused = error instanceof Error ? error.message : String(error);
    }
    expect(d1Refused, "D1 must refuse more than five compound terms").toMatch(/too many terms/i);

    // The rewrite answers on D1.
    const rewritten = await db.query<{ id: number }>(`WITH ${ctes.join(", ")} SELECT id FROM reach`, []);
    const rewrittenIds = rewritten.rows.map((r) => Number(r.id));

    // THE CLAIM: identical rows, identical order. The reference is the
    // un-rewritten seven-term union on the same rows — run on the same
    // engine, but on node:sqlite, which has no five-term limit.
    const local = new DatabaseSync(":memory:");
    try {
      local.exec("CREATE TABLE exercise_cards (id INTEGER PRIMARY KEY, bucket TEXT)");
      const ins = local.prepare("INSERT INTO exercise_cards (id, bucket) VALUES (?, ?)");
      for (const [id, bucket] of [[1, "alpha"], [2, "alpha"], [3, "alpha"], [4, "alpha"], [5, "beta"], [6, "beta"], [7, "beta"], [8, "beta"], [9, null], [10, null]] as Array<[number, string | null]>) {
        ins.run(id, bucket);
      }
      const reference = local.prepare(flat).all() as Array<{ id: number }>;
      expect(rewrittenIds).toEqual(reference.map((r) => Number(r.id)));
    } finally {
      local.close();
    }

    // Same set, checked independently of any ordering assumption: every id
    // the seven terms name exactly once.
    expect([...rewrittenIds].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rewrittenIds).toHaveLength(10);

    // And the rewrite is what the ENGINE emits for its own widening
    // statements: a real widening whose reach carries six terms (request-
    // store.ts:353-391, 444) comes back split at the limit rather than as
    // one long compound.
    const widening = new RequestStore().wideningStatements({
      fullKeys: ["alpha_note"],
      idKeys: [],
      fullIds: [2],
      idIds: [9],
      lefts: [1],
      leftKeys: [],
      pairs: [[3, 4]],
      sideL: ["left_side"],
      sideR: ["right_side"],
      wholeLefts: [5],
      wholeLeftKeys: [],
    });
    expect(widening).toBeDefined();
    expect(widening!.full.sql, "the engine's own widening must carry the group CTE").toContain(
      "fs_0(id) AS (",
    );
    expect(widening!.full.sql).toContain("fs(id) AS (SELECT id FROM fs_0 UNION SELECT id FROM fs_1)");
  }, 120_000);
});