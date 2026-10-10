// Accounts, exercised end to end on a deck this file builds itself.
//
// WHAT THIS IS. Four claims from the accounts surface, proved against a
// FRESH deck created in this test from the repo's own core schema
// (db/schema.sqlite.sql — zero card rows) and booted by the repo's own local
// worker (vm-staging-server.mjs). Nothing is read from a private corpus, no
// network is touched, no hosted service is called: the whole journey is
// 127.0.0.1 and a scratch SQLite file under the OS temp dir.
//
// DATA RULE. Every identifier here is invented at run time by the repo's own
// credential helpers (src/testing/generated-credentials.ts): a fresh email
// address per run, fresh passwords, a fresh token-signing secret. The
// account card name is whatever the engine derives from that synthetic email
// (first-run-setup.ts ownerCardNameFor); it is read back out of the deck
// rather than hardcoded. No card content is copied from anywhere.
//
// BOOT, REUSED NOT INVENTED. The server spawn + readiness probe is the shape
// of tests/card/auth/first-run-setup-endpoint.test.ts (which boots the same
// entry against the same schema-only deck); the dist/ bootstrap it uses is
// imported, not copied. The in-process engine for the token read arm is the
// boot helpers of tests/deploy/no-caching-synthetic.test.ts
// (LocalSqliteDriver + bootEdgeServingEngines + ActorRenderEngines over a
// scratch second connection to the same deck file).
//
// WHY THE OWNER IS CREATED IN THE SHARED BOOT. The first-run /setup claim is
// "the window opens, one account is created, and it closes by itself". The
// OPEN half and the create are the boot: the deck starts with zero accounts,
// the boot POSTs /setup once (the create), and the /setup test below then
// proves the window is closed for good — GET 404, POST 404, no second account
// junction, and the refused second email never lands on a card. Every other
// test here runs as that owner, which is why they can sign in at all. The
// order the tests run in does not matter: the boot always leaves the same
// deck state.
//
// ONE DOCUMENTED DIVERGENCE, STATED NOT PAPERED OVER. "A token, no cookie"
// is the engine's WRITE-side authenticator, not its READ-side one. The write
// routes take `token_from_header || params[:token]` (src/server/write-routes.ts
// :576-593 — Ruby's actionpack Token grammar, `Authorization: Token token="…"`
// or a `?token=` param). Every read path in this repo resolves the viewer
// from the Cookie header alone (bunny-edge-session-viewer.ts sessionTokenFromRequest,
// vm-staging-server.mjs:3306-3314) — there is no header-token read arm to
// call. So the read half of the token claim is exercised through the read
// path's OWN two steps, both of them, with the cookie step skipped: the
// token resolver the cookie path feeds (resolveViewerFromToken) and then the
// engine's own read gate (RenderEngine#canReadCard, the call the JSON card
// route answers 403 from). The token alone, no cookie anywhere, authorizes a
// read of a card the anonymous reader is refused; after revocation the same
// token degrades to ANONYMOUS_VIEWER and the same card is refused.
//
// WHY ONE RULE IS SEEDED. A boot-seeded deck carries no create/update rule
// cards at all — the boot-seed says so itself (src/card/auth/boot-seed.ts
// :80-90: those side cards live in other mods' real.yml, outside its scope) —
// and the write route is deny-by-default, so on this deck NO actor can create
// a card and the write half of the token claim would measure the deck instead
// of the token. seedOwnerOnlyCreateRule adds the one missing piece, named
// after the owner this test created, so the write is a measurement of the
// TOKEN: allowed with the token, refused without it.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyDeckInflections } from "../../src/card/name/inflect.js";
import { ORACLE_DECK_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.js";
import { sha256Hex } from "../../src/card/auth/session-token.js";
import { SessionStore } from "../../src/card/auth/session-store.js";
import { RenderEngine } from "../../src/card/render.js";
import type { FetchEngine } from "../../src/card/fetch.js";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import {
  generatedEmail,
  generatedPassword,
  generatedTokenSecret,
} from "../../src/testing/generated-credentials.js";
import { bootEdgeServingEngines } from "../../deploy/bunny-worker-src/bunny-edge-deck-boot.js";
import {
  ActorRenderEngines,
  resolveViewerFromToken,
} from "../../deploy/bunny-worker-src/bunny-edge-session-viewer.js";
import { ensureStagingServerDist } from "../card/auth/staging-server-dist-bootstrap.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const SCHEMA_SQL = path.join(REPO_ROOT, "db", "schema.sqlite.sql");

// Every credential is minted fresh per run by the repo's own helper — the
// emails land in the IANA documentation domain and are never delivered to
// (mail transport is the in-process capture, off unless DECKO_MAIL_CAPTURE=1).
const OWNER_EMAIL = generatedEmail("owner");
const OWNER_PASSWORD = generatedPassword("Accounts3owner");
const RESET_PASSWORD = generatedPassword("Accounts3reset");
const TOKEN_SECRET = generatedTokenSecret();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface BootedWorker {
  baseUrl: string;
  child: ChildProcess;
  output: string;
}

let deckDir = "";
let deckPath = "";
let worker: BootedWorker | null = null;
let ownerName = "";
let ownerCardId = 0;
let accountsAfterBoot = 0;

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
      const { port } = address;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** A FRESH deck: the repo's core schema and nothing else — zero card rows.
 *  The worker's boot-seed wire (DECKO_FIRST_RUN + DECKO_WRITE_PATH) seeds the
 *  account-system cards at boot; the owner is created over HTTP after that. */
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

async function bootWorker(dbPath: string): Promise<BootedWorker> {
  await ensureStagingServerDist();
  const port = await reserveEphemeralPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY, dbPath, String(port)], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DECKO_FIRST_RUN: "1",
      DECKO_WRITE_PATH: "1",
      // The reset-flow claim needs the mail: capture it in-process and drain
      // it through the staging host's own debug surface. Off by default, so
      // arming it is a per-boot choice, not a default change.
      DECKO_MAIL_CAPTURE: "1",
      DECKO_TOKEN_SECRET: TOKEN_SECRET,
      // The reset link is built against this origin, so the emailed URL is
      // fetchable against the very worker that sent it.
      DECKO_ORIGIN: baseUrl,
    },
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  // Bounded readiness wait against the worker's own health route.
  let ready = false;
  for (let attempt = 0; attempt < 240 && !ready; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/_status`);
      ready = response.status === 200;
    } catch {
      await delay(250);
    }
  }
  if (!ready) {
    throw new Error(`local worker did not become ready on ${baseUrl}\n--- worker output ---\n${output}`);
  }
  return { baseUrl, child, output };
}

/** The raw session token out of a Set-Cookie header value. */
function sessionTokenOf(setCookie: string | null): string {
  expect(setCookie).toBeTruthy();
  const match = /decko_ts_session=([A-Za-z0-9]+)/.exec(setCookie as string);
  expect(match).not.toBeNull();
  return match?.[1] as string;
}

/** A scratch read connection to the live deck file — the same
 *  another-process-committed-write seam tests/deploy/no-caching-synthetic.test.ts
 *  opens, so every row here is the worker's own committed state. */
function readDeck<T>(sql: string, params: unknown[] = []): T[] {
  const db = new Database(deckPath, { readonly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

/** A scratch WRITE connection, for the deck structure this file adds itself.
 *  Closed immediately; nothing is left open between statements. */
function writeDeck(
  sql: string,
  params: unknown[] = [],
): { changes: number | bigint; lastInsertRowid: number | bigint } {
  const db = new Database(deckPath);
  try {
    return db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

/**
 * The ONE deck-structure piece the boot-seed deliberately does not create,
 * added here so the card WRITE route is exercisable at all.
 *
 * The boot-seed scopes itself to the account system and says so: the
 * create/update rule cards live in other mods' real.yml files, outside its
 * scope (src/card/auth/boot-seed.ts:80-90). A fresh seeded deck therefore
 * carries no `*create` codename card and no task rules, and the write route
 * denies every card write to every actor — which is what the engine did when
 * this helper did not exist.
 *
 * What it adds, all of it synthetic and all of it named after the owner this
 * test created: the `*create` setting card the rule walk looks up by codename
 * (src/card/permissions/view-task-rules.ts:105-118), an `*all+*create` rule
 * under the deck's `*all` set, and one card_references row tying that rule to
 * the owner card. The effect is narrow on purpose: ONLY the owner may create
 * a card, so a write made with the token is allowed and the same write made
 * after the token is revoked is not — which is the whole claim.
 */
function seedOwnerOnlyCreateRule(): void {
  const ids = readDeck<{ codename: string; id: number }>(
    "SELECT codename, id FROM cards WHERE codename IN ('all', 'set', 'setting', 'card') AND trash = 0",
  );
  const byCodename = new Map(ids.map((row) => [row.codename, row.id]));
  const allId = byCodename.get("all");
  const setId = byCodename.get("set");
  const settingId = byCodename.get("setting");
  expect({ allId, setId, settingId }).toEqual({
    allId: expect.any(Number),
    setId: expect.any(Number),
    settingId: expect.any(Number),
  });
  // The rule walk only reads rules hanging off a Set-typed card, so prove the
  // deck's `*all` really is one before hanging a rule off it.
  expect(readDeck<{ type_id: number }>("SELECT type_id FROM cards WHERE id = ?", [allId!])[0]!.type_id).toBe(
    setId!,
  );
  // Copy the fixture's own rule-card shape (`*all+*read`) for the type id.
  const readRule = readDeck<{ type_id: number }>(
    "SELECT type_id FROM cards WHERE left_id = ? AND right_id = (SELECT id FROM cards WHERE codename = 'read' AND trash = 0) AND trash = 0 ORDER BY id LIMIT 1",
    [allId!],
  )[0]!;

  // The rule walk resolves a rule card by its COMPOSED key, built from the
     // key columns of its two sides (read-rules.ts RULE_KEY_UNIVERSE_STATEMENT),
     // so the setting card's key must match the deck's own starred convention
     // (`*all` stores key "*all", `*read` stores "*read") or the composed key
     // never equals the candidate `DeckoName.parse("*all+*create").key`.
  const created = writeDeck(
    `INSERT INTO cards
       (name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES ('*create', '*create', 'create', NULL, NULL, NULL,
             '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1,
             NULL, NULL, NULL, 0, ?, '')`,
    [settingId!],
  );
  const createSettingId = Number(created.lastInsertRowid);
  const rule = writeDeck(
    `INSERT INTO cards
       (name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (NULL, NULL, NULL, ?, ?, NULL,
             '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1,
             NULL, NULL, NULL, 0, ?, ?)`,
    [allId!, createSettingId, readRule.type_id, `[[${ownerName}]]`],
  );
  const ruleId = Number(rule.lastInsertRowid);
  writeDeck(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type)
     VALUES (?, ?, ?, 'L')`,
    [ruleId, ownerName, ownerCardId],
  );
}

const ACCOUNT_MARK_SUFFIX = "+*account";

/** Every live `+*account` junction in the deck. The seeded deck already
 *  carries one (the Decko Bot account the boot-seed creates), so this count
 *  is the baseline a second owner would move, not a hardcoded number. */
const ACCOUNT_JUNCTION_COUNT_SQL = `SELECT COUNT(*) AS n FROM cards
  WHERE right_id = (SELECT id FROM cards WHERE codename = 'account' AND trash = 0)
    AND trash = 0`;

describe("accounts on a self-built deck: sign-in/out, staying signed in, reset, tokens, first-run setup", () => {
  beforeAll(async () => {
    applyDeckInflections(ORACLE_DECK_INFLECTIONS);
    deckDir = mkdtempSync(path.join(tmpdir(), "decko-accounts-3-"));
    deckPath = path.join(deckDir, "deck.sqlite3");
    makeFreshDeck(deckPath);
    worker = await bootWorker(deckPath);

    // The boot-seed landed (the fresh deck is no longer empty) ...
    expect(worker.output).toContain("[boot-seed] fresh deck seeded:");
    // ... and the first-run window is open: the form is served, and the
    // single POST below creates the deck's one and only owner.
    const form = await fetch(`${worker.baseUrl}/setup`);
    expect(form.status).toBe(200);
    const create = await fetch(`${worker.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: OWNER_EMAIL, password: OWNER_PASSWORD }).toString(),
      redirect: "manual",
    });
    expect(create.status).toBe(303);
    expect(create.headers.get("location")).toBe(`${worker.baseUrl}/_signin`);

// The owner card name is whatever the engine derived from the synthetic
    // email; read it out of the deck rather than predicting it. Compound
    // cards link by left_id/right_id on this deck (id 46 = the owner's
    // junction, left_id 45 = the holder card), so the walk is
    // junction -> +*email child -> holder. The seeded deck already ships
    // Decko Bot's own account junction, and this picks THIS account out.
    const accounts = readDeck<{ junction_id: number; holder_id: number; holder_name: string }>(
      `SELECT junction.id AS junction_id, holder.id AS holder_id, holder.name AS holder_name
       FROM cards junction
       JOIN cards email ON email.left_id = junction.id AND email.trash = 0
       JOIN cards holder ON holder.id = junction.left_id AND holder.trash = 0
       WHERE junction.trash = 0
         AND email.db_content = ?
         AND email.right_id = (SELECT id FROM cards WHERE codename = 'email' AND trash = 0)`,
      [OWNER_EMAIL],
    );
    expect(accounts).toHaveLength(1);
    ownerCardId = accounts[0]!.holder_id;
    ownerName = accounts[0]!.holder_name;
    expect(ownerName).not.toBe("");
    accountsAfterBoot = readDeck<{ n: number }>(ACCOUNT_JUNCTION_COUNT_SQL)[0]!.n;
  }, 240_000);

  afterAll(async () => {
    // The worker is this file's own child (fully owned): terminate it, then
    // remove the scratch deck. Nothing outside the OS temp dir is touched.
    if (worker !== null && worker.child.exitCode === null) {
      worker.child.kill();
      await delay(300);
    }
    worker = null;
    if (deckDir !== "") rmSync(deckDir, { recursive: true, force: true });
  });

  it('"sign-in and sign-out, password reset, staying signed in, API keys and tokens" — a sign-in against the local SQLite deck writes one session row and resolves it to the owner actor card, the cookie alone still authenticates a later request, and sign-out deletes the row', async () => {
    const w = worker!;

    // --- sign in -------------------------------------------------------
    const signin = await fetch(`${w.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    expect(signin.status).toBe(200);
    expect(await signin.json()).toEqual({ ok: true, name: ownerName });
    const token = sessionTokenOf(signin.headers.get("set-cookie"));

    // The session ROW: one row, addressed by the token's sha256 digest (the
    // raw token is never stored), pointing at the owner card.
    const rows = readDeck<{ token_hash: string; account_card_id: number }>(
      "SELECT token_hash, account_card_id FROM auth_sessions",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(await sha256Hex(token));
    expect(rows[0]!.token_hash).not.toBe(token);
    expect(rows[0]!.account_card_id).toBe(ownerCardId);

    // The ACTOR CARD the session resolves to: the account's holder card,
    // which is exactly the name sign-in reported.
    const actors = readDeck<{ id: number; name: string }>(
      "SELECT id, name FROM cards WHERE id = ? AND trash = 0",
      [ownerCardId],
    );
    expect(actors).toEqual([{ id: ownerCardId, name: ownerName }]);

    // --- staying signed in: a later request carrying ONLY the cookie ---
    // Re-submitting the account password is the authenticated-only endpoint
    // (401 without a live session), and re-setting the SAME password is
    // value-preserving: the salt is the account's own, so the digest lands
    // unchanged. It is a request with no Authorization header and no token
    // parameter — the cookie is the whole credential.
    const staying = await fetch(`${w.baseUrl}/_account-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `decko_ts_session=${token}` },
      body: JSON.stringify({ password: OWNER_PASSWORD }),
    });
    expect(staying.status).toBe(200);
    expect(await staying.json()).toEqual({ ok: true, noOp: false });
    // And the session is still the same row, not a second one.
    expect(readDeck("SELECT token_hash FROM auth_sessions")).toHaveLength(1);

    // --- sign out -------------------------------------------------------
    const signout = await fetch(`${w.baseUrl}/_signout`, {
      method: "POST",
      headers: { Cookie: `decko_ts_session=${token}` },
    });
    expect(signout.status).toBe(200);
    expect(await signout.json()).toEqual({ ok: true, revoked: true });
    expect(signout.headers.get("set-cookie")).toContain("Max-Age=0");

    // The row is GONE, and the token the cookie carried no longer
    // authenticates anything.
    expect(readDeck("SELECT token_hash FROM auth_sessions")).toHaveLength(0);
    const afterSignout = await fetch(`${w.baseUrl}/_account-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `decko_ts_session=${token}` },
      body: JSON.stringify({ password: OWNER_PASSWORD }),
    });
    expect(afterSignout.status).toBe(401);
  }, 120_000);

  it('"API keys and tokens" — a minted token alone, with no cookie anywhere, reads a card the anonymous reader is refused and writes a card as the account; revoking it refuses the read and refuses the write', async () => {
    const w = worker!;
    // The deck this file built carries no task rules (see
    // seedOwnerOnlyCreateRule), so grant the owner — and only the owner —
    // permission to create a card. That is what makes the write half below a
    // measurement of the TOKEN rather than of the deck.
    seedOwnerOnlyCreateRule();

    // --- mint ----------------------------------------------------------
    const signin = await fetch(`${w.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    expect(signin.status).toBe(200);
    const token = sessionTokenOf(signin.headers.get("set-cookie"));

    // An in-process view of the same deck file, for the token's read arm:
    // the read path's OWN resolver over the same SessionStore SQL the
    // cookie path uses (bunny-edge-session-viewer.ts resolveViewerFromToken).
    applyDeckInflections(ORACLE_DECK_INFLECTIONS);
    const driver = new LocalSqliteDriver({ path: deckPath });
    let deck: Awaited<ReturnType<typeof bootEdgeServingEngines>> | undefined;
    try {
      deck = await bootEdgeServingEngines(driver);
      const sessions = new SessionStore({ driver });
      const actorEngines = new ActorRenderEngines(deck);

      // Pick, at run time, the account card this deck actually keeps private:
      // readable as the owner, refused as anonymous. No card name is
      // hardcoded — the candidates are the account subtree the setup flow
      // created, and the winner is the one the deck's own rules judge that
      // way. The decision is the engine's own read gate, canReadCard — the
      // exact call the JSON card route answers 403 from
      // (deploy/bunny-worker-src/bunny-edge-engine-request.ts:517-520). A
      // full page render is not available on this deck: the boot-seed scopes
      // itself to the account system, and the deck carries no `header`
      // codename for a layout to nest.
      const candidates = [`${ownerName}${ACCOUNT_MARK_SUFFIX}`, ownerName];
      const verdicts: Array<{ name: string; owner: boolean; anonymous: boolean }> = [];
      let privateCard: Awaited<ReturnType<FetchEngine["fetchByName"]>> | undefined;
      let privateTypeName: string | undefined;
      for (const name of candidates) {
        const record = await deck.fetcher.fetchByName(name);
        if (record === undefined || record.id === undefined) continue;
        const typeRecord =
          record.typeId !== undefined ? await deck.fetcher.fetchById(record.typeId) : undefined;
        const asOwner = await actorEngines
          .deckFor(ownerCardId)
          .render.canReadCard(record, typeRecord?.name?.s);
        const asAnonymous = await deck.render.canReadCard(record, typeRecord?.name?.s);
        verdicts.push({ name, owner: asOwner, anonymous: asAnonymous });
        if (asOwner && !asAnonymous) {
          privateCard = record;
          privateTypeName = typeRecord?.name?.s;
          break;
        }
      }
      expect(privateCard, `no private card among ${JSON.stringify(verdicts)}`).toBeDefined();
      // The owner read the card; the anonymous read of the SAME record is
      // the refusal the revoked token will fall back to below.
      expect(
        await actorEngines.deckFor(ownerCardId).render.canReadCard(privateCard!, privateTypeName),
      ).toBe(true);

      // The READ arm takes the token directly, with no cookie and no
      // Authorization header anywhere above it: the token alone produced the
      // signed-in verdict.
      expect(await resolveViewerFromToken(token, sessions)).toEqual({
        signedIn: true,
        actorId: ownerCardId,
      });

      // --- the write, token only, no cookie ------------------------------
      const writeName = "Accounts Three Token Write";
      const written = await fetch(`${w.baseUrl}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Ruby's actionpack Token grammar, exactly as the write routes
          // parse it (write-routes.ts tokenFromRequest). No Cookie header.
          Authorization: `Token token="${token}"`,
        },
        body: new URLSearchParams({
          "card[name]": writeName,
          "card[content]": "written by an api token with no cookie attached",
        }).toString(),
        redirect: "manual",
      });
      expect(written.status).toBe(303);

      const created = readDeck<{ id: number; db_content: string }>(
        "SELECT id, db_content FROM cards WHERE name = ? AND trash = 0",
        [writeName],
      );
      expect(created).toHaveLength(1);
      expect(created[0]!.db_content).toBe("written by an api token with no cookie attached");
      // The act row names WHO wrote it: the account, not the anonymous card.
      const writerId = readDeck<{ actor_id: number }>(
        "SELECT actor_id FROM card_acts WHERE card_id = ? ORDER BY id DESC LIMIT 1",
        [created[0]!.id],
      )[0]!.actor_id;
      expect(writerId).toBe(ownerCardId);

      // --- revoke ---------------------------------------------------------
      const revoke = await fetch(`${w.baseUrl}/_signout`, {
        method: "POST",
        headers: { Cookie: `decko_ts_session=${token}` },
      });
      expect(revoke.status).toBe(200);
      expect(await revoke.json()).toEqual({ ok: true, revoked: true });

      // --- the READ is refused: the same token now resolves to anonymous ---
      // The read path builds its per-request engine FROM this viewer, so a
      // token that degrades here reads as Anonymous. The engine below is a
      // FRESH one (no viewer set, no memoized verdicts), so this is a real
      // read decision on the same card the token could read a moment ago.
      expect(await resolveViewerFromToken(token, sessions)).toEqual({ signedIn: false });
      const anonymousAfterRevoke = new RenderEngine(deck.fetcher);
      expect(await anonymousAfterRevoke.canReadCard(privateCard!, privateTypeName)).toBe(false);

      // --- the WRITE is refused ------------------------------------------
      // The seeded rule grants create to the owner and to nobody else, so a
      // token that no longer resolves to the owner buys nothing: the same
      // request, the same header, no cookie, is now denied — and the refusal
      // names Anonymous, which is the sharp end of "the token no longer
      // authenticates this write".
      const secondName = "Accounts Three Token Write After Revoke";
      const second = await fetch(`${w.baseUrl}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Token token="${token}"`,
        },
        body: new URLSearchParams({
          "card[name]": secondName,
          "card[content]": "written after the token was revoked",
        }).toString(),
        redirect: "manual",
      });
      // The engine names the anonymous actor `*anonymous` in its refusals
      // (the actor name it renders, not the card's display name).
      const refusal = await second.text();
      expect(second.status).toBe(403);
      expect(refusal).toContain(`actor *anonymous may not create card ${secondName}`);
      expect(refusal).not.toContain(ownerName);
      expect(
        readDeck<{ id: number }>("SELECT id FROM cards WHERE name = ? AND trash = 0", [secondName]),
      ).toHaveLength(0);
    } finally {
      driver.close();
    }
  }, 240_000);

  it('"password reset" — the requested reset mail carries a token link; following it and setting a new password makes the new password sign in and the old one fail', async () => {
    const w = worker!;
    // Drain whatever the mail capture already holds so this test's mail is
    // the only message in the log.
    await (await fetch(`${w.baseUrl}/_mail-log`)).json();

    // --- request --------------------------------------------------------
    const requested = await fetch(`${w.baseUrl}/_reset-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: OWNER_EMAIL }),
    });
    expect(requested.status).toBe(200);
    expect(await requested.json()).toEqual({ ok: true, sentTo: OWNER_EMAIL });

    // --- the captured mail ---------------------------------------------
    const mailLog = (await (await fetch(`${w.baseUrl}/_mail-log`)).json()) as {
      messages: Array<{ to: string; from: string; textBody: string }>;
    };
    expect(mailLog.messages).toHaveLength(1);
    const mail = mailLog.messages[0]!;
    expect(mail.to).toBe(OWNER_EMAIL);
    const linkLine =
      mail.textBody
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.includes("/update/")) ?? "";
    expect(linkLine).toContain(`${w.baseUrl}/update/`);
    // The link's mark is the account junction's url_key (spaces become
    // underscores, path.rb interpret_mark), not its literal name.
    expect(decodeURIComponent(linkLine)).toContain(
      `${ownerName.replace(/ /g, "_")}${ACCOUNT_MARK_SUFFIX}`,
    );
    expect(linkLine).toContain("reset_password");
    expect(linkLine).toMatch(/token=[A-Za-z0-9._-]+$/);

    // --- follow the emailed link, exactly as the mail carries it ---------
    const confirmed = await fetch(linkLine, { redirect: "manual" });
    expect(confirmed.status).toBe(302);
    const location = confirmed.headers.get("location") ?? "";
    expect(decodeURIComponent(location)).toContain(
      `${ownerName.replace(/ /g, "_")}${ACCOUNT_MARK_SUFFIX}`,
      );
      expect(location).toContain("view=edit");
    const confirmCookie = sessionTokenOf(confirmed.headers.get("set-cookie"));

    // --- set the new password under that link's session -----------------
    const applied = await fetch(`${w.baseUrl}/_account-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `decko_ts_session=${confirmCookie}`,
      },
      body: JSON.stringify({ password: RESET_PASSWORD }),
    });
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual({ ok: true, noOp: false });

    // --- the new password signs in; the old one is dead ------------------
    const withNew = await fetch(`${w.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: OWNER_EMAIL, password: RESET_PASSWORD }),
    });
    expect(withNew.status).toBe(200);
    expect(await withNew.json()).toEqual({ ok: true, name: ownerName });

    const withOld = await fetch(`${w.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    expect(withOld.status).toBe(401);
    expect(await withOld.json()).toEqual({ ok: false, error: "Wrong password" });
  }, 120_000);

  it('DECKO_FIRST_RUN = "1" opens /setup, the one-time window that creates your deck\'s first account ... and it closes by itself once the account exists — the boot\'s POST created the one account, and every later /setup is 404 with no second account written', async () => {
    const w = worker!;
    // The account the boot created is still the only new one (the boot's POST
    // answered 303; asserted there). The seeded deck's own account junction
    // (Decko Bot's) is already in the baseline count.
    const accountJunctionCount = () => readDeck<{ n: number }>(ACCOUNT_JUNCTION_COUNT_SQL)[0]!.n;
    const refusedEmail = generatedEmail("secondowner");

    // POST again, with a different synthetic account — the window is gone.
    const second = await fetch(`${w.baseUrl}/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: refusedEmail,
        password: generatedPassword("Accounts3second"),
      }).toString(),
      redirect: "manual",
    });
    expect(second.status).toBe(404);

    // GET is gone too: the surface does not exist for a deck that has an
    // account (the census, not a flag).
    const form = await fetch(`${w.baseUrl}/setup`);
    expect(form.status).toBe(404);
    expect(await form.text()).not.toContain('name="password"');

    // No second account: the junction count is exactly what the boot left,
    // the owner's own account is untouched, and the refused email never
    // landed on any card.
    expect(accountJunctionCount()).toBe(accountsAfterBoot);
    expect(
      readDeck<{ id: number }>("SELECT id FROM cards WHERE id = ? AND trash = 0", [ownerCardId]),
    ).toHaveLength(1);
    expect(
      readDeck<{ n: number }>("SELECT COUNT(*) AS n FROM cards WHERE db_content = ? AND trash = 0", [
        refusedEmail,
      ])[0]!.n,
    ).toBe(0);
  }, 120_000);
});