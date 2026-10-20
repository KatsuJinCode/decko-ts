// Endpoint tests for the staging server's first-run /setup surface —
// THROUGH the booted server (vm-staging-server.mjs), not the module
// directly. The module suite (first-run-setup.test.ts) pins the census and
// the owner-create logic; THIS file pins the ROUTING: a first-run POST must
// actually reach the first-run module, and the write branch must not
// preempt it as a card-mark write. The module-only suite was blind to
// exactly that gap: with the write branch answering first, a fresh-deploy
// POST /setup died as `actor *anonymous may not create card setup` (403)
// while every module test stayed green.
//
// The reference deck has no /setup route — the setup journey rides the
// ordinary write through mark interpretation (`when initial_setup? ...
// prepare_setup_card!`). The equivalent here is routing order: under
// first-run conditions the write branch YIELDS /setup to the first-run
// surface, whose census (needs_setup?, card 1.110.0 lib/card/auth/setup.rb) is
// the security boundary — an existing deck never becomes setuptable.
//
// Fresh-deck fixture: db/schema.sqlite.sql applied to an empty sqlite file
// (0 card rows). With DECKO_FIRST_RUN=1 + DECKO_WRITE_PATH=1 the server's
// boot-seed wire seeds the deck at boot (schema init, then seed), which is
// what makes the census computable and the one-click deployment path real:
// schema -> seed -> GET the form -> POST the owner -> sign in.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "./staging-server-dist-bootstrap.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const SCHEMA_SQL = path.join(REPO_ROOT, "db", "schema.sqlite.sql");

const FIRST_RUN_DB = path.join(REPO_ROOT, "tmp", "first-run-setup-endpoint-fresh.sqlite3");
const FLAG_OFF_DB = path.join(REPO_ROOT, "tmp", "first-run-setup-endpoint-flag-off.sqlite3");

const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "Abcdef1!";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BootedServer {
  baseUrl: string;
  child: ChildProcess;
  output: string;
}

async function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netCreateServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        srv.close();
        reject(new Error("unexpected ephemeral address"));
        return;
      }
      const port = address.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** A FRESH deck: schema only, zero card rows — the boot-seed wire seeds it
 *  at boot when the first-run profile is armed. */
function makeFreshDeck(dbPath: string): void {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });
  const db = new Database(dbPath);
  try {
    db.exec(readFileSync(SCHEMA_SQL, "utf8"));
  } finally {
    db.close();
  }
}

async function bootStagingServer(
  dbPath: string,
  env: Record<string, string | undefined>,
): Promise<BootedServer> {
  await ensureStagingServerDist();
  const port = await reserveEphemeralPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  // The printed-token contract below needs the boot to GENERATE its token
  // (docs/SECURITY.md, divergence 5). An operator DECKO_SETUP_TOKEN in the
  // host environment is in force instead and suppresses the printed line
  // (src/card/auth/setup-token.ts armGeneratedSetupToken), so the inherited
  // value is stripped here. A test that wants the operator token passes it
  // explicitly in `env`.
  const childEnv: Record<string, string | undefined> = { ...process.env };
  delete childEnv["DECKO_SETUP_TOKEN"];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const child = spawn(process.execPath, [SERVER_ENTRY, dbPath, String(port)], {
    cwd: REPO_ROOT,
    env: childEnv as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  let ready = false;
  for (let attempt = 0; attempt < 120 && !ready; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/_status`);
      ready = response.status === 200;
    } catch {
      await delay(250);
    }
  }
  if (!ready) {
    throw new Error(`staging server did not become ready on port ${port}\n--- server output ---\n${output}`);
  }
  return { baseUrl, child, output };
}

async function stopStagingServer(booted: BootedServer | null): Promise<void> {
  if (booted === null) return;
  // The server process is this test's own child (fully owned).
  if (booted.child.exitCode === null) {
    booted.child.kill();
    await delay(300);
  }
}

let firstRun: BootedServer | null = null;
let flagOff: BootedServer | null = null;

describe("first-run /setup through the booted staging server (fresh-deck one-click path)", () => {
  beforeAll(async () => {
    makeFreshDeck(FIRST_RUN_DB);
    firstRun = await bootStagingServer(FIRST_RUN_DB, {
      DECKO_FIRST_RUN: "1",
      DECKO_WRITE_PATH: "1",
    });
  }, 120_000);

  afterAll(async () => {
    await stopStagingServer(firstRun);
    firstRun = null;
    // Disposable fixture only — the schema source and repo stay untouched.
    rmSync(FIRST_RUN_DB, { force: true });
  });

  it("boot-seeded the fresh deck and GET /setup serves the owner form (census open)", async () => {
    expect(firstRun?.output).toContain("[boot-seed] fresh deck seeded:");
    const response = await fetch(`${firstRun?.baseUrl}/setup`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('name="email"');
    expect(body).toContain('name="password"');
  }, 30_000);

  // docs/SECURITY.md, divergence 5: with no DECKO_SETUP_TOKEN the server
  // generated a one-time token at boot and printed it; /setup needs it.
  const printedSetupToken = (): string => {
    const match = /\/setup requires this one-time setup token: ([0-9a-f]{64})/.exec(firstRun?.output ?? "");
    if (match === null) throw new Error(`no setup token in the boot output: ${firstRun?.output}`);
    return match[1]!;
  };

  it("POST /setup without the printed setup token is refused with 403 and leaves the window open", async () => {
    const post = await fetch(`${firstRun?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: OWNER_EMAIL, password: OWNER_PASSWORD, setup_token: "guess" }).toString(),
      redirect: "manual",
    });
    expect(post.status).toBe(403);
    expect((await fetch(`${firstRun?.baseUrl}/setup`)).status).toBe(200);
  }, 30_000);

  it("POST /setup creates the owner and answers 303 to sign-in — and the owner can then sign in", async () => {
    const post = await fetch(`${firstRun?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: OWNER_EMAIL, password: OWNER_PASSWORD, setup_token: printedSetupToken() }).toString(),
      redirect: "manual",
    });
    // Without the first-run routing the write branch answers 403
    // (`actor *anonymous may not create card setup`) before this request
    // could reach the first-run surface.
    console.log('PROBE-SETUP:', post.status, (await post.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 260));
    expect(post.status).toBe(303);
    expect(post.headers.get("location")).toBe(`${firstRun?.baseUrl}/_signin`);

    // The journey's end state is real THROUGH THE SERVER: the just-created
    // owner signs in on the sign-in surface.
    const signin = await fetch(`${firstRun?.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
    });
    expect(signin.status).toBe(200);
    const signinBody = (await signin.json()) as { ok?: boolean };
    expect(signinBody.ok).toBe(true);
    expect(signin.headers.get("set-cookie")).toContain("decko_ts_session=");
  }, 30_000);

  it("once the deck has an owner the window is closed for good: GET and POST both 404 (never setuptable again)", async () => {
    const get = await fetch(`${firstRun?.baseUrl}/setup`);
    expect(get.status).toBe(404);
    const secondPost = await fetch(`${firstRun?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: "second@example.com", password: "Abcdef2!" }).toString(),
      redirect: "manual",
    });
    expect(secondPost.status).toBe(404);
  }, 30_000);
});

describe("first-run surface absent with the env gate off (pre-existing posture preserved)", () => {
  beforeAll(async () => {
    try {
      makeFreshDeck(FLAG_OFF_DB);
      // No DECKO_FIRST_RUN, no DECKO_WRITE_PATH — the historical default boot.
      flagOff = await bootStagingServer(FLAG_OFF_DB, {
        DECKO_FIRST_RUN: undefined,
        DECKO_WRITE_PATH: undefined,
      });
    } catch (error) {
      // A boot that never came up leaves nothing running and nothing on
      // disk: afterAll does not run when beforeAll throws.
      await stopStagingServer(flagOff);
      flagOff = null;
      rmSync(FLAG_OFF_DB, { force: true });
      throw error;
    }
  }, 120_000);

  it("GET /setup does not serve the setup form and POST /setup keeps the write-off 405", async () => {
    const get = await fetch(`${flagOff?.baseUrl}/setup`);
    const body = await get.text();
    expect(body).not.toContain('name="email"');
    const post = await fetch(`${flagOff?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
      redirect: "manual",
    });
    expect(post.status).toBe(405);
  }, 30_000);

  afterAll(async () => {
    await stopStagingServer(flagOff);
    flagOff = null;
    // Disposable fixture only — same discipline as FIRST_RUN_DB above;
    // without this the run left a 250 KB deck in tmp/ on every pass.
    rmSync(FLAG_OFF_DB, { force: true });
  });
});

// features/setup.feature, scenario "Shark visits site for first time" —
// the named-owner legs of Ruby's own first-run spec, on their own fresh deck
// (the census closes for good after the first owner, so this cannot share the
// fixture above).
//
//   When I go to the homepage
//   Then I should see "Your deck is ready"
//   When I fill in "card_name" with "The Newber"
//   And I enter "newb@decko.org" into "*email"
//   And I enter "newb_pass" into "*password"
//   And I press "Set up"
//   Then I should see "The Newber"
//   When I go to card "The Newber+*roles"
//   Then I should see "Administrator"
//
// The name field is the one this tranche ported: card-mod-account-0.20.0
// set/type/user.rb:20-29 renders _render_name_formgroup FIRST in setup_form,
// so the owner names themselves. Ruby asserts the name twice — the card is
// "The Newber" and the +*roles page shows "Administrator" — so the test
// asserts both, the second through the role membership the create writes
// (first-run-setup.ts, user.rb's basket[:roles_for_first_user]
// %i[help_desk shark administrator]).
const NAMED_OWNER_DB = path.join(REPO_ROOT, "tmp", "first-run-setup-endpoint-named-owner.sqlite3");
const NAMED_OWNER_NAME = "The Newber";

describe("first-run /setup names the owner (features/setup.feature's own legs)", () => {
  let named: BootedServer | null = null;
  let setupToken = "";

  beforeAll(async () => {
    makeFreshDeck(NAMED_OWNER_DB);
    named = await bootStagingServer(NAMED_OWNER_DB, {
      DECKO_FIRST_RUN: "1",
      DECKO_WRITE_PATH: "1",
    });
    const match = /\/setup requires this one-time setup token: ([0-9a-f]{64})/.exec(named.output);
    if (match === null) {
      throw new Error(`no setup token in the boot output: ${named.output}`);
    }
    setupToken = match[1]!;
  }, 120_000);

  afterAll(async () => {
    await stopStagingServer(named);
    named = null;
    rmSync(NAMED_OWNER_DB, { force: true });
  });

  it("the form carries Ruby's name field, its title and its button", async () => {
    const response = await fetch(`${named?.baseUrl}/setup`);
    expect(response.status).toBe(200);
    const body = await response.text();
    // "Then I should see 'Your deck is ready'" — user.rb:12 sets this title.
    expect(body).toContain("Your deck is ready to go!");
    // `fill_in "card_name"` resolves by id; the field NAME is the card-hash
    // key, because Ruby's setup form is a card CREATE form.
    expect(body).toContain('name="card[name]"');
    expect(body).toContain('id="card_name"');
    // user.rb:34-36 setup_button: "Set up".
    expect(body).toContain(">Set up</button>");
    // The name group comes BEFORE the account pair (user.rb:21-27's order).
    expect(body.indexOf('name="card[name]"')).toBeLessThan(body.indexOf('name="email"'));
  }, 30_000);

  it("the submitted name becomes the owner card's own name, and it holds the Administrator role", async () => {
    const post = await fetch(`${named?.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "card[name]": NAMED_OWNER_NAME,
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        setup_token: setupToken,
      }).toString(),
      redirect: "manual",
    });
    expect(post.status).toBe(303);

    const db = new Database(NAMED_OWNER_DB, { readonly: true });
    try {
      const owner = db
        .prepare("SELECT id FROM cards WHERE name = ? AND trash = 0")
        .get(NAMED_OWNER_NAME) as { id: number } | undefined;
      // "Then I should see 'The Newber'" — the owner IS that card, not a
      // name derived from the email's local part.
      expect(owner, "the owner card carries the submitted name").toBeDefined();

      // "When I go to card 'The Newber+*roles' / Then I should see
      // 'Administrator'" — the membership the create writes, read the way
      // Ruby writes it: the role's `*members` SETTING card holding the
      // owner's card REFERENCE (first-run-setup.ts names why `+members`
      // instead would leave the owner in no role at all). Measured on this
      // fresh deck: the role cards are Help Desk / Shark / Administrator,
      // and each one's *members holds the owner's `~<id>`.
      const membersId = (
        db.prepare("SELECT id FROM cards WHERE codename = 'members' AND trash = 0").get() as
          | { id: number }
          | undefined
      )?.id;
      expect(membersId, "the *members setting card exists").toBeDefined();
      for (const roleName of ["Administrator", "Shark", "Help Desk"]) {
        const role = db
          .prepare("SELECT id FROM cards WHERE name = ? AND trash = 0")
          .get(roleName) as { id: number } | undefined;
        expect(role, `the ${roleName} role card exists`).toBeDefined();
        const membership = db
          .prepare("SELECT db_content AS content FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0")
          .get(role!.id, membersId!) as { content: string | null } | undefined;
        expect(
          membership?.content ?? "",
          `${roleName} holds the owner card reference`,
        ).toBe(`~${owner!.id}`);
      }
    } finally {
      db.close();
    }
  }, 60_000);

  it("the named owner signs in with the credentials the form carried", async () => {
    // Ruby's closing legs (Sign out / Sign in, then "I should see 'The
    // Newber'") are a PAGE assertion, and this fixture cannot render a page:
    // the fresh deck has no Default Layout body, so every page answers 500
    // with `default layout "Default Layout" has no body in the corpus`
    // (measured, this lane). What the fixture can honestly show is the leg
    // under it — the owner exists under the submitted name and signs in with
    // the credentials the form carried — and the page leg is named here
    // rather than asserted on a fixture that cannot render.
    const signin = await fetch(`${named?.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
    });
    expect(signin.status).toBe(200);
    const body = (await signin.json()) as { ok?: boolean; name?: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe(NAMED_OWNER_NAME);
    expect(signin.headers.get("set-cookie")).toContain("decko_ts_session=");
  }, 60_000);
});
