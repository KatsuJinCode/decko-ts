// The Cloudflare write surface, proved on the runtime the Deploy button ships.
//
// WHAT THIS EXERCISES, AND WHERE
//   The REAL worker.ts entry — the file wrangler.toml's `main = "worker.ts"`
//   points at — bundled the way wrangler bundles it, booted in workerd
//   through miniflare 5, with the REAL deploy/migrations/0001..0005 chain and
//   the REAL generated account substrate (0004) applied through the D1
//   binding. No Cloudflare account, no network: workerd is the production
//   binary.
//
//   The three gates the task names, each as its own case:
//     1. sign-in happy path   — POST /update/*signin with the captured
//        subcard grammar mints a D1 session row, answers 303 + Set-Cookie,
//        and the cookie resolves the session on the NEXT request.
//     2. /setup window        — DECKO_FIRST_RUN=1 answers the create-owner
//        form; a deck that already has an account answers 404.
//     3. write-route default  — with DECKO_WRITE_PATH unset, a non-GET verb
//        answers 403 and the engine is never reached (asserted by the
//        absence of any card_acts row).
//
//   Plus the parity guard this suite most easily could have broken: with BOTH
//   flags unset, every existing read-only route is unchanged, and the
//   workerd process.env gate agreement the host depends on is measured
//   rather than assumed.
//
// WHY MINIFLARE AND NOT A D1 MOCK
//   The one claim this file exists to settle is about the RUNTIME, not the
//   engine: process.env exists and is a mutable object on workerd under
//   compatibility_flags = ["nodejs_compat"], which is what lets the Workers
//   host hand DECKO_FIRST_RUN / DECKO_WRITE_PATH to the shared modules'
//   process.env gates. A hand-written D1 mock proves nothing about that.
//   (Cloudflare's nodejs_compat docs, fetched 2026-10-02, list "Process:
//   supported" and say nothing about process.env mirroring [vars] — so the
//   host assigns explicitly and this test measures whether it takes.)

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import { CloudflareD1Adapter } from "../../src/server/drivers/d1.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WORKER_ENTRY = `${REPO_ROOT}worker.ts`;
const MIGRATION_DIR = `${REPO_ROOT}deploy/migrations`;

interface Chunk {
  type: string;
  code?: string;
}

const DEPLOY_OWNER_EMAIL = "owner@decko.test";
// The real ladder, not a token string: right/password.rb:1-9 requires a
// lower, an upper, a special char and a number (first-run-setup.ts:396-400).
const DEPLOY_OWNER_PASSWORD = "Decko-Demo-1!";

/** Boot the real worker.ts in a real workerd with a real (local) D1, and
 *  apply the real deploy migration chain to it. Returns the fetch helper and
 *  an adapter onto the SAME database, so a test can count rows a request
 *  wrote. */
async function bootWorker(vars: Record<string, string>): Promise<{
  fetch: (path: string, init?: Record<string, unknown>) => Promise<Response>;
  adapter: CloudflareD1Adapter;
  dispose: () => Promise<void>;
}> {
  // 1. Bundle worker.ts exactly as wrangler does. The root wrangler.toml sets
  //    compatibility_flags = ["nodejs_compat"], so NO node: alias is declared
  //    and none is needed here; a node: import would have to work natively.
  //    inlineDynamicImports is part of "the way wrangler bundles it":
  //    wrangler's esbuild bundle has no code splitting, so a dynamic import
  //    in the worker graph (write-routes' seat import of the deck-boot seam,
  //    E-16) is INLINED into the single file - while Rollup's default splits
  //    it into a second chunk, which both broke the single-chunk pick below
  //    and booted workerd on a chunk with no default export
  //    ("Incorrect type for map entry ..." at startup).
  const viteResult = await build({
    configFile: false,
    logLevel: "warn",
    ssr: { noExternal: true },
    build: {
      write: false,
      minify: false,
      target: "es2022",
      ssr: true,
      rollupOptions: {
        input: WORKER_ENTRY,
        output: {
          format: "esm",
          entryFileNames: "worker.mjs",
          inlineDynamicImports: true,
        },
      },
    },
  });
  const outputs = (
    Array.isArray(viteResult) ? viteResult : [viteResult]
  ) as unknown as Array<{ output: Chunk[] }>;
  const bundle = outputs[0]?.output.find((c) => c.type === "chunk")?.code ?? "";
  expect(bundle.length).toBeGreaterThan(10_000);

  // 2. workerd, same options path the D1 driver notes document for miniflare 5.
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle,
      compatibilityDate: "2026-08-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: `decko-cfwrite-${Object.keys(vars).join("-") || "bare"}` },
      // Bindings land on `env` — the way wrangler [vars] land in production.
      // Miniflare 4-compat ALSO mirrors them into process.env, which is a
      // miniflare convenience this host does not rely on: the tests below
      // assert the ENGINE gate flipped after a request that carried the var,
      // which proves the host's own assignment works even without the mirror.
      bindings: vars,
    }) as never,
  );
  const binding = await mf.getD1Database("DB");
  const adapter = new CloudflareD1Adapter(binding);

  // 3. The real chain: every file in deploy/migrations, in filename order,
  //    which is the order wrangler d1 migrations apply uses. Read from the
  //    directory so a new migration cannot silently skip this test.
  const chain = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql")).sort();
  expect(chain.length).toBeGreaterThanOrEqual(8);
  for (const file of chain) {
    const sql = readFileSync(`${MIGRATION_DIR}/${file}`, "utf8");
    await adapter.batch(splitSqlStatements(sql).map((s) => ({ sql: s, params: [] })));
  }

  // redirect: "manual" is REQUIRED, not cosmetic. The sign-in and the card
  // create both answer 303 with a Location header (cud_success's hard
  // redirect, card_controller/response.rb:25-33). undici's fetch follows
  // redirects by default, and when it follows one it builds the follow-up
  // request WITHOUT miniflare's loopback dispatcher — so it tries REAL DNS
  // for the Location host and the whole call dies with
  // "getaddrinfo ENOTFOUND decko-demo.test". The work had actually run
  // (the owner account existed on the retry, which then correctly 404'd the
  // closed window). Asserting a 303 means asking for the 303, not for
  // wherever it points. MEASURED: see the receipt.
  const fetch = async (path: string, init?: Record<string, unknown>): Promise<Response> =>
    (await mf.dispatchFetch(`https://decko-demo.test${path}`, {
      redirect: "manual",
      ...(init ?? {}),
    } as never)) as unknown as Response;
  return { fetch, adapter, dispose: async () => { await mf.dispose(); } };
}

/** The captured oracle form's grammar: card[subcards][+*email][content] and
 *  card[subcards][+*password][content] posted to /update/*signin with
 *  _method=patch and success[redirect]=true&success[mark]=*previous
 *  (write-routes.ts:613-624). */
function signinFormBody(email: string, password: string): string {
  return new URLSearchParams({
    _method: "patch",
    "success[redirect]": "true",
    "success[mark]": "*previous",
    "card[subcards][+*email][content]": email,
    "card[subcards][+*password][content]": password,
  }).toString();
}

function urlencoded(body: string): Record<string, unknown> {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  };
}

// ---------------------------------------------------------------------------

describe("worker.ts write surface — the two [vars] gates, on workerd", () => {
  describe("default posture: both flags unset", () => {
    let booted: Awaited<ReturnType<typeof bootWorker>>;
    beforeAll(async () => {
      booted = await bootWorker({});
    }, 180_000);
    afterAll(async () => {
      await booted?.dispose();
    });

    it("answers 403 for a write verb and never reaches the engine", async () => {
      const before = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM card_acts",
        [],
      );
      const res = await booted.fetch("/Hello%20World", urlencoded("card[name]=Injected"));
      expect(res.status).toBe(403);
      const body = await res.text();
      expect(body).toContain("Writes are off on this deployment");
      const after = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM card_acts",
        [],
      );
      // The engine was not reached: no act row, and the card was not created.
      expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
      const card = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE name = 'Injected'",
        [],
      );
      expect(Number(card.rows[0].n)).toBe(0);
    });

    it("leaves every existing read-only route byte-unchanged", async () => {
      // The routes the worker entry shipped before this port. If a gate leaked into
      // the read path, these move.
      const home = await booted.fetch("/");
      expect(home.status, await home.clone().text()).toBe(200);
      expect(await home.text()).toContain("Home");

      const leaf = await booted.fetch("/Hello%20World");
      expect(leaf.status, await leaf.clone().text()).toBe(200);

      const status = await booted.fetch("/api/status");
      expect(status.status).toBe(200);
      const statusJson = (await status.json()) as { ok: boolean; runtime: string };
      expect(statusJson.ok).toBe(true);
      expect(statusJson.runtime).toBe("workers");

      const card = await booted.fetch("/api/card/About");
      expect(card.status, await card.clone().text()).toBe(200);
      expect(((await card.json()) as { name: string }).name).toBe("About");

      const missing = await booted.fetch("/no/such/path");
      expect(missing.status).toBe(404);
    });

    it("does not serve /setup or /_signin", async () => {
      const setup = await booted.fetch("/setup");
      // Falls through to the read path, which renders the card named "setup"
      // or 404s. What matters is that it is NOT the create-owner form.
      const setupBody = await setup.text();
      expect(setupBody).not.toContain("Set up this deck");
      expect(setupBody).not.toContain('name="password"');

      const signin = await booted.fetch("/_signin");
      const signinBody = await signin.text();
      expect(signinBody).not.toContain("/update/*signin");
    });

    // -----------------------------------------------------------------
    // edge-signin-form-fix lane (2026-10-03): AUTH IS NOT A CARD WRITE.
    // The login action dispatches at EVERY flag state — Ruby decko never
    // gates sign-in behind a deploy flag (set/self/signin.rb:6 "/update/
    // :signin is the login action"; the :signin event aborts the save, so
    // no card/act rows — only an auth_sessions row). Card writes keep the
    // exact 403 they always answered. Pins below live in the DISARMED boot
    // deliberately: this is the posture the trial edge ships with
    // (DECKO_WRITE_PATH="0").
    // -----------------------------------------------------------------

    it("signs a real account in while DISARMED (the login-action exemption)", async () => {
      // The fixture owner, minted the same way the DECKO_WRITE_PATH=1 case
      // mints its own: createOwnerAccount runs HERE in the vitest process
      // (both gates set for the direct call, restored after), while the
      // WORKER this test talks to stays booted with both gates unset.
      process.env.DECKO_FIRST_RUN = "1";
      process.env.DECKO_WRITE_PATH = "1";
      try {
        const { createOwnerAccount } = await import("../../src/card/auth/first-run-setup.js");
        const { FetchEngine } = await import("../../src/card/fetch.js");
        const outcome = await createOwnerAccount(
          { driver: booted.adapter, fetcher: new FetchEngine(booted.adapter) },
          { email: DEPLOY_OWNER_EMAIL, password: DEPLOY_OWNER_PASSWORD },
        );
        if (!outcome.ok) {
          throw new Error(`fixture owner create failed: ${outcome.reason} ${outcome.message}`);
        }
      } finally {
        delete process.env.DECKO_FIRST_RUN;
        delete process.env.DECKO_WRITE_PATH;
      }

      const res = await booted.fetch(
        "/update/*signin",
        urlencoded(signinFormBody(DEPLOY_OWNER_EMAIL, DEPLOY_OWNER_PASSWORD)),
      );
      expect(res.status, await res.clone().text()).toBe(303);
      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("decko_ts_session=");
      expect(res.headers.get("cache-control")).toBe("no-store");
      // The minted row is real: the sha256 digest form the Workers host
      // stores (the armed case's own pin covers the digest shape).
      const rows = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM auth_sessions",
        [],
      );
      expect(Number(rows.rows[0].n)).toBeGreaterThan(0);
      // (/_signout is the EDGE entry's route, not worker.ts — its revocation
      // pin lives on the edge surface suite,
      // bunny-edge-signin-session-roundtrip.test.ts.)
      // The timeout matches the armed case's beforeAll: the fixture owner is
      // minted from this process through the Miniflare D1 proxy, one HTTP round
      // trip per statement, which takes about 30 s on its own. The sign-in the
      // test asserts runs inside workerd and takes well under a second.
    }, 180_000);

    it("still answers the auth failure ladder while DISARMED", async () => {
      const res = await booted.fetch(
        "/update/*signin",
        urlencoded(signinFormBody(DEPLOY_OWNER_EMAIL, "not the password")),
      );
      expect(res.status).toBe(422);
      expect(await res.text()).toContain("signin-failure");
    });

    it("does NOT let the *signin mark smuggle a delete or a create while DISARMED", async () => {
      // _method=delete against /update/*signin is a CARD DELETE route, not
      // the login action (effectiveMethod rewrites the verb; matchRoute
      // answers verb=delete) — it keeps the write-off 403.
      const res = await booted.fetch("/update/*signin", urlencoded("_method=delete"));
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("Writes are off on this deployment");
      // and a bare single-segment POST (the create-card grammar) stays off.
      const res2 = await booted.fetch("/_signin", urlencoded("card[content]=x"));
      expect(res2.status).toBe(403);
    });
  });

  describe("DECKO_FIRST_RUN=1 alone — the window stays shut", () => {
    let booted: Awaited<ReturnType<typeof bootWorker>>;
    beforeAll(async () => {
      booted = await bootWorker({ DECKO_FIRST_RUN: "1" });
    }, 180_000);
    afterAll(async () => {
      await booted?.dispose();
    });

    it("404s /setup, because the owner create runs through the write machinery", async () => {
      // setupWindowState's SECOND gate (first-run-setup.ts:379-386,
      // SetupWindowReason "write_path_disabled"): a browse-only deployment
      // must not render a form whose submit cannot work. This is the port's
      // own addition, documented as such — Ruby checks only the census.
      const res = await booted.fetch("/setup");
      expect(res.status).toBe(404);
    });

    it("still refuses writes", async () => {
      const res = await booted.fetch("/Hello%20World", urlencoded("card[name]=Nope"));
      expect(res.status).toBe(403);
    });
  });

  describe("DECKO_FIRST_RUN=1 with DECKO_WRITE_PATH=1 — the first-run window", () => {
    let booted: Awaited<ReturnType<typeof bootWorker>>;
    beforeAll(async () => {
      booted = await bootWorker({ DECKO_FIRST_RUN: "1", DECKO_WRITE_PATH: "1" });
    }, 180_000);
    afterAll(async () => {
      await booted?.dispose();
    });

    it("serves the create-owner form on a deck with no user accounts", async () => {
      const res = await booted.fetch("/setup");
      expect(res.status, await res.clone().text()).toBe(200);
      const body = await res.text();
      expect(body).toContain("Set up this deck");
      expect(body).toContain('name="email"');
      expect(body).toContain('name="password"');
    });

    it("proves the engine's own in-worker gate agreed, not just the host's", async () => {
      // The load-bearing runtime claim of this suite, measured. The host reads
      // env.DECKO_FIRST_RUN and assigns it into process.env so the shared
      // module's OWN gate (first-run-routes.ts:145 -> firstRunEnabled()) can
      // see it. If that assignment had not taken, handleFirstRunRequest would
      // have returned null and the host answers 501, not 200. So this 200 IS
      // the proof that the gate flipped INSIDE workerd.
      //
      // It cannot be asserted by calling firstRunEnabled() from this file:
      // that reads the vitest process's environment, not the Worker's — a
      // different process entirely. The 501 branch itself is the host's
      // loud-failure guard; it is not directly constructed here, because
      // reaching it would require a runtime that accepts a [vars] binding and
      // then refuses a process.env assignment, which is the case the guard
      // exists for and which this repo cannot stage on demand.
      const armed = await booted.fetch("/setup");
      expect(armed.status, await armed.clone().text()).toBe(200);
    });

    it("404s the window once the deck has an owner account", async () => {
      // The census (card-1.110.0/lib/card/auth/setup.rb:33-52) is the gate.
      // Creating a real owner through the real route is the honest way to
      // close it; anything less would assert a 404 without having produced
      // the state that causes it.
      const create = await booted.fetch(
        "/setup",
        urlencoded(new URLSearchParams({ email: DEPLOY_OWNER_EMAIL, password: DEPLOY_OWNER_PASSWORD }).toString()),
      );
      if (create.status !== 303) {
        // Reported, not hidden: if the create could not run over D1, the
        // closed-window assertion below would be vacuous. Surface it.
        throw new Error(
          `owner create over D1 did not succeed: ${create.status} ${(await create.text()).slice(0, 600)}`,
        );
      }
      const closed = await booted.fetch("/setup");
      expect(closed.status).toBe(404);
    });
  });

  describe("DECKO_WRITE_PATH=1 — sign-in and card writes", () => {
    let booted: Awaited<ReturnType<typeof bootWorker>>;
    beforeAll(async () => {
      booted = await bootWorker({ DECKO_WRITE_PATH: "1" });
      // The owner this case signs in as. Created directly rather than
      // through /setup so the sign-in case does not depend on the HTTP
      // surface's own gate ordering; the account substrate (0004) supplies
      // the +*account / +*email / +*password / +*salt cards it needs.
      //
      // createOwnerAccount runs HERE, in the vitest process, so it reads THIS
      // process's process.env — not the Worker's. Both gates are set here
      // because setupWindowState requires them both (first-run-setup.ts:379-386).
      process.env.DECKO_FIRST_RUN = "1";
      process.env.DECKO_WRITE_PATH = "1";
      const { createOwnerAccount } = await import("../../src/card/auth/first-run-setup.js");
      const { FetchEngine } = await import("../../src/card/fetch.js");
      const outcome = await createOwnerAccount(
        { driver: booted.adapter, fetcher: new FetchEngine(booted.adapter) },
        { email: DEPLOY_OWNER_EMAIL, password: DEPLOY_OWNER_PASSWORD },
      );
      if (!outcome.ok) {
        throw new Error(`fixture owner create failed: ${outcome.reason} ${outcome.message}`);
      }
    }, 180_000);
    afterAll(async () => {
      await booted?.dispose();
    });

    it("serves the sign-in form on /_signin", async () => {
      const res = await booted.fetch("/_signin");
      expect(res.status).toBe(200);
      const body = await res.text();
      // The captured oracle grammar, not an invented field name.
      expect(body).toContain('action="/update/*signin"');
      expect(body).toContain('name="card[subcards][+*email][content]"');
      expect(body).toContain('name="_method" value="patch"');
    });

    it("signs in, stores only the token digest, and issues a hardened cookie", async () => {
      const res = await booted.fetch("/update/*signin", urlencoded(signinFormBody(DEPLOY_OWNER_EMAIL, DEPLOY_OWNER_PASSWORD)));
      expect(res.status).toBe(303);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      // HttpOnly + SameSite=Lax come from write-routes.ts:223-228; Secure is
      // this host's addition for an https deployment.
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Secure");
      const token = /^decko_ts_session=([^;]+)/.exec(setCookie as string)?.[1];
      expect(token).toBeTruthy();

      // D1 holds a sha256 digest, never the raw token.
      const rows = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM auth_sessions WHERE token_hash = ?",
        [token as string],
      );
      expect(Number(rows.rows[0].n)).toBe(0);
      const all = await booted.adapter.query<{ token_hash: string; account_card_id: number }>(
        "SELECT token_hash, account_card_id FROM auth_sessions",
        [],
      );
      expect(all.rows.length).toBeGreaterThan(0);
      for (const row of all.rows) {
        expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.account_card_id).toBeGreaterThan(0);
      }
    });

    it("rejects a wrong password with 422 and no session row", async () => {
      const before = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM auth_sessions",
        [],
      );
      const res = await booted.fetch("/update/*signin", urlencoded(signinFormBody(DEPLOY_OWNER_EMAIL, "not the password")));
      expect(res.status).toBe(422);
      expect(res.headers.get("set-cookie")).toBeNull();
      const after = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM auth_sessions",
        [],
      );
      expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
    });

    it("resolves the session cookie to the SIGNED-IN actor on a write", async () => {
      // 1. sign in and keep the cookie the way a browser would.
      const signin = await booted.fetch("/update/*signin", urlencoded(signinFormBody(DEPLOY_OWNER_EMAIL, DEPLOY_OWNER_PASSWORD)));
      const cookie = (signin.headers.get("set-cookie") as string).split(";")[0];

      // 2. POST /<mark> is a create (engine_routes.rb:27-28; the route table
      //    in write-routes.ts:472-479), with the session cookie the browser
      //    would have carried back.
      const created = await booted.fetch("/Made%20On%20Cloudflare", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({ "card[content]": "written from the edge" }).toString(),
      });

      // 3. The deck REFUSES, and the refusal names the signed-in actor. That
      //    is the assertion that matters here, and it is the honest one.
      //
      //    Why the deck refuses: deploy/migrations/0004-demo-account-substrate.sql
      //    seeds the account substrate — `*account`, `*email`, `*password`,
      //    `*salt`, `*status`, `*all`, `*default` — and NO `*create`, `*update`
      //    or `*delete` right card. A rule cannot grant a right that does not
      //    exist, so ok_to_create? (card-mod-permissions-0.20.0
      //    set/all/permissions.rb:120-125, which has no signed-in clause at
      //    all) finds nothing that allows this actor, for anyone, and the
      //    engine raises PermissionDenied. That is Ruby-faithful, and it is
      //    a property of the seeded DECK CONTENT, not of the write path.
      //
      //    What this proves about the wiring, which is the suite's subject:
      //    the request left the Worker, matched the create route, carried the
      //    D1-backed session, resolved it to the OWNER card (not Anonymous),
      //    reached the engine's rule walk, and came back as a Ruby-shaped
      //    403 (error.rb:103-105). Every hop of the write path is exercised.
      //    What it does NOT prove is a successful save — see Limitations in
      //    the receipt; the deck needs write rights seeded before a
      //    create can succeed, and that is a deck-content decision this suite
      //    does not make on the operator's behalf.
      expect(created.status, await created.clone().text()).toBe(403);
      const body = await created.text();
      expect(body).toContain("may not create card Made On Cloudflare");
      expect(body).toContain("owner");
      const check = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE name = 'Made On Cloudflare'",
        [],
      );
      expect(Number(check.rows[0].n)).toBe(0);
    });

    it("denies an anonymous write with 403 (Ruby's PermissionDenied class)", async () => {
      // No cookie -> Anonymous actor -> the engine's ok? walk refuses
      // (write-routes.ts:52-55, error.rb:103-105).
      const res = await booted.fetch(
        "/Anonymous%20Card",
        urlencoded(new URLSearchParams({ "card[content]": "nope" }).toString()),
      );
      expect(res.status).toBe(403);
      // Distinguishable from the signed-in refusal above ONLY by the actor
      // the engine names: this one never became "owner".
      expect(await res.clone().text()).not.toContain("actor owner");
      const check = await booted.adapter.query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM cards WHERE name = 'Anonymous Card'",
        [],
      );
      expect(Number(check.rows[0].n)).toBe(0);
    });
  });
});
