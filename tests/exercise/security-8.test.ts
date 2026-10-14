// The stored-HTML, password and constant-time claims of docs/SECURITY.md,
// exercised publicly on invented data.
//
// Four claims from approved divergences 1, 2 and 3 of docs/SECURITY.md are
// pinned here. Every it() name opens with the claim it exercises, quoted.
//
// DATA RULE — every card name, email, password, salt, site title and body
// below is invented. Nothing here is deck content, a real credential, or a
// real address; credentials are minted per run by
// src/testing/generated-credentials.ts so no literal can be mistaken for a
// secret. The deck is the auth suite's in-memory core-schema database
// (tests/card/auth/auth-test-storage.ts) brought up through the repository's
// own boot-seed capability (src/card/auth/boot-seed.ts), and the stored-HTML
// cleaner is a pure function — no network, no hosted service.
//
// THE OWASP CORPUS RUNS HERE. The first claim's exercise names the corpus in
// tests/card/actions/content-clean-security.test.ts, so that module is
// imported below: its OWASP-derived suite (the vectors, 4,000 random hostile
// mixtures, the ordinary-content block) executes as part of this run rather
// than being re-described here. The it()s under "stored HTML" then assert,
// by name, the four neutralisations that claim calls out.
//
// THE WORKERS RUNTIME IS DECLARED, NOT HOSTED. Node's WebCrypto computes
// PBKDF2 at 600,000 iterations without complaint (checked on node v24.19.0
// while writing this file), and docs/SECURITY.md records that local
// workerd does not enforce Cloudflare's limit either. So the Workers claim is
// exercised the way a Workers host declares it — setPbkdf2IterationLimit with
// Cloudflare's own 100,000 (exactly what
// deploy/cf-worker-src/cf-edge-engine-entry.ts:135 and worker.ts:75 do at
// module load), the DECKO_PASSWORD_PBKDF2_ITERATIONS=100000 boot
// environment, and workerd's documented refusal from
// crypto.subtle.deriveBits. What these tests prove is the PORT's behaviour
// under that configuration, not workerd's limit itself.

import { afterEach, describe, expect, it, vi } from "vitest";
import { pbkdf2Sync } from "node:crypto";

// The OWASP-derived corpus, run in place (see the header).
import "../card/actions/content-clean-security.test.js";

import { cleanContent } from "../../src/card/actions/content-clean.js";
import { htmlSafetyProblems } from "../card/actions/html-safety-verifier.js";
import { constantTimeEqual, tokensEqual } from "../../src/card/auth/session-token.js";
import {
  authenticateAccount,
  DEFAULT_TOKEN_EXPIRY_SECONDS,
  resolveAccountCodenameIds,
  runAuthMigrations,
  SessionStore,
  sha1Hex,
  signinAccount,
  type TokenRuntimeConfig,
} from "../../src/card/auth/index.js";
import {
  applyNewAccountPassword,
  confirmPasswordReset,
  sendResetPasswordToken,
  type AccountFlowContext,
} from "../../src/card/auth/account-verify-reset-flows.js";
import { bootstrapFreshDeck } from "../../src/card/auth/boot-seed.js";
import { decodeAuthToken } from "../../src/card/auth/token.js";
import {
  CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS,
  checkPassword,
  configurePasswordHashing,
  hashPassword,
  passwordHashPolicy,
  setPbkdf2IterationLimit,
} from "../../src/card/auth/password-hash.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { CaptureTransport } from "../../src/card/notify/transport.js";
import {
  createAuthTestStorage,
  insertAccountCard,
  type AuthTestStorage,
} from "../card/auth/auth-test-storage.js";
import { generatedEmail, generatedPassword, generatedTokenSecret } from "../../src/testing/generated-credentials.js";

// ---------------------------------------------------------------------------
// 1. Stored HTML (the port's own cleaner)
// ---------------------------------------------------------------------------

const STORED_HTML_CLAIM =
  "The same tag and attribute allowlists ... URL attributes (`href`, `src`, `cite`) must be relative or use a non-script scheme ... values are escaped; comments are removed only where they lie in text; a stray `<` that would open markup is written as `&lt;`.";

/** What a real page renders after a stored fragment — a fragment that ends
 *  inside markup would otherwise absorb it. All invented. */
const PAGE_AFTER = ["", "<p>a later paragraph</p>", '<img src="pictures/later.png" alt="later">'];

describe("stored HTML", () => {
  it(`"${STORED_HTML_CLAIM}" — an OWASP javascript: link keeps its text and loses its href`, () => {
    for (const input of [
      `<a href="javascript:alert('XSS')">click me</a>`,
      `<A HREF="JaVaScRiPt:alert('XSS')">click me</A>`,
      `<A HREF="javascript&colon;alert('XSS')">click me</A>`,
      `<a href="jav&#x09;ascript:alert('XSS')">click me</a>`,
    ]) {
      const out = cleanContent(input);
      expect(out).toContain("click me");
      expect(out.toLowerCase()).not.toContain("javascript");
      expect(htmlSafetyProblems(out)).toEqual([]);
    }
  });

  it(`"${STORED_HTML_CLAIM}" — an OWASP event-handler attribute is dropped, and a malformed bare value is stored as one escaped value`, () => {
    for (const input of [
      `<a onmouseover="alert(document.cookie)">hover me</a>`,
      `<a onmouseover=alert(document.cookie)>hover me</a>`,
      `<IMG SRC=# onmouseover="alert('XSS')">`,
      `<span class='w-a" onclick="alert(1)'>x</span>`,
    ]) {
      const out = cleanContent(input);
      expect(out.toLowerCase()).not.toMatch(/\bon[a-z]+\s*=/);
      expect(htmlSafetyProblems(out)).toEqual([]);
    }
    // The port escapes the whole malformed value.
    expect(cleanContent(`<img src=x"onerror="alert(1)>`)).toBe(`<img src="x&quot;onerror=&quot;alert(1)">`);
  });

  it(`"${STORED_HTML_CLAIM}" — expression() and @import style values are dropped, and unterminated markup is written as &lt; instead of running into the page`, () => {
    // style values: the OWASP expression()/@import/behavior family. The
    // attribute goes whole; the tag and its text stay.
    expect(cleanContent(`<p style="width: expression(alert('XSS'));">p</p>`)).toBe("<p>p</p>");
    expect(cleanContent(`<p style="@import 'http://synthetic.invalid/x.css'; color: red;">p</p>`)).toBe("<p>p</p>");
    expect(cleanContent(`<span style="background:url(javascript:alert(1))">s</span>`)).toBe("<span>s</span>");
    // cite is a URL attribute under the same rule as href and src.
    expect(cleanContent(`<blockquote cite="javascript:alert(1)">q</blockquote>`)).toBe("<blockquote>q</blockquote>");
    for (const input of [
      `<p style="width: expression(alert('XSS'));">p</p>`,
      `<p style="@import 'http://synthetic.invalid/x.css';">p</p>`,
      `<blockquote cite="javascript:alert(1)">q</blockquote>`,
    ]) {
      expect(htmlSafetyProblems(cleanContent(input))).toEqual([]);
    }
    // Unterminated markup: the fragment's "<" is escaped, so it cannot absorb
    // whatever the page renders next.
    expect(cleanContent(`<img src=x onerror=alert(1) `)).toBe("&lt;img src=x onerror=alert(1) ");
    expect(cleanContent(`hello <`)).toBe("hello &lt;");
    for (const input of [`<img src=x onerror=alert(1) `, `hello <`, `hello <!-- open comment`]) {
      for (const tail of PAGE_AFTER) {
        const followed = tail === "" ? cleanContent(input) : cleanContent(input) + cleanContent(tail);
        expect({ input, tail, problems: htmlSafetyProblems(followed) }).toEqual({ input, tail, problems: [] });
      }
    }
  });

  it(`"${STORED_HTML_CLAIM}" — a comment is removed where it lies in text and escaped where it does not, and ordinary content is stored as written`, () => {
    // A comment between blocks lies in text: removed.
    const commented = `<p>before the note</p><!-- a note for the editors --><p>after the note</p>`;
    expect(cleanContent(commented)).toBe(`<p>before the note</p><p>after the note</p>`);
    // An unterminated "comment" is not one: it would swallow the rest of the
    // page, so its "<" is escaped instead.
    expect(cleanContent(`hello <!-- open comment`)).toBe("hello &lt;!-- open comment");
    expect(htmlSafetyProblems(cleanContent(`hello <!-- open comment<p>page</p>`))).toEqual([]);
    // Ordinary content: what an editor produces, stored as written (the table
    // normalises attribute order), stable under a second pass, and leaving
    // nothing a browser acts on.
    const ordinary = [
      `<p>Plain paragraph.</p>`,
      `<p>Text with <strong>bold</strong> and <em>italic</em>.</p>`,
      `<a href="https://synthetic.invalid/page?a=1&amp;b=2" title="Example">link</a>`,
      `<a href="/Some_Card">card</a> <a href="#section">anchor</a> <a href="mailto:someone@example.org">mail</a>`,
      `<img src="https://synthetic.invalid/picture.png" alt="A picture" title="Title">`,
      `<blockquote cite="https://synthetic.invalid/source">quoted</blockquote>`,
      `<table border="1" cellpadding="2"><tbody><tr><th scope="col">H</th></tr><tr><td>c</td></tr></tbody></table>`,
      `<span class="w-highlight w-note">kept classes</span>`,
      `<p>a &lt; b, 3 < 4 and 5 > 2</p>`,
    ];
    for (const input of ordinary) {
      const out = cleanContent(input);
      expect(htmlSafetyProblems(out)).toEqual([]);
      expect(cleanContent(out)).toBe(out);
    }
    // Every case but the table is stored exactly as written; the table
    // normalises attribute order.
    for (const input of ordinary.filter((_, i) => i !== 6)) {
      expect(cleanContent(input)).toBe(input);
    }
  });
});

// ---------------------------------------------------------------------------
// the synthetic account deck (claims 2 and 3)
// ---------------------------------------------------------------------------

const SALT = "synthetic-salt-0001";
const SITE_TITLE = "Synthetic Exercise Deck";
const ORIGIN = "https://synthetic.invalid";
const BOOT_INSTANT = new Date("2026-10-10T09:00:00.000Z");
const TS = "2026-10-10 09:00:00.000";
/** Fixed epoch seconds for the reset-token clock (token.now). */
const T0 = 1_788_000_000;

const NIA = { id: 9100, name: "Nia Setter" };
const OMAR = { id: 9110, name: "Omar Legacy" };
const UMA = { id: 9120, name: "Uma Elsewhere" };

const NIA_EMAIL = generatedEmail("nia");
const OMAR_EMAIL = generatedEmail("omar");
const UMA_EMAIL = generatedEmail("uma");

// Each account's own password, minted per run (upper + lower + digit +
// symbol, so the +*password validation ladder in right/password.rb accepts
// it), plus one spare per flow.
const NIA_OLD_PASSWORD = generatedPassword("old");
const NIA_NEW_PASSWORD = generatedPassword("nia");
const OMAR_PASSWORD = generatedPassword("omar");
const UMA_PASSWORD = generatedPassword("uma");
const UMA_RESET_PASSWORD = generatedPassword("umareset");

/** A compound row (+*account junction, or one of its field children): the
 *  composed name, NULL key — the compound-card NULL convention. */
function insertCompoundCard(
  storage: AuthTestStorage,
  id: number,
  name: string,
  leftId: number,
  rightId: number,
  content: string | null,
): void {
  storage.exec(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES
       (${id}, '${name.replace(/'/g, "''")}', NULL, NULL,
        ${leftId}, ${rightId}, NULL, '${TS}', '${TS}', 1, 1,
        NULL, NULL, NULL, 0, 1, ${content === null ? "NULL" : `'${content.replace(/'/g, "''")}'`})`,
  );
}

interface AccountCodenameIds {
  account: number;
  email: number;
  password: number;
  salt: number;
  status: number;
}

interface AccountPart {
  holder: { id: number; name: string };
  junction: number;
  emailCard: number;
  passwordCard: number;
  saltCard: number;
  statusCard: number;
}

/** One holder plus its +*account subtree: email, the stored password value,
 *  the +*salt card, and status "active". Every row is invented. */
function addAccount(
  storage: AuthTestStorage,
  ids: AccountCodenameIds,
  part: AccountPart,
  email: string,
  stored: string,
): void {
  insertAccountCard(storage, part.holder);
  insertCompoundCard(storage, part.junction, `${part.holder.name}+*account`, part.holder.id, ids.account, null);
  insertCompoundCard(storage, part.emailCard, `${part.holder.name}+*account+*email`, part.junction, ids.email, email);
  insertCompoundCard(storage, part.passwordCard, `${part.holder.name}+*account+*password`, part.junction, ids.password, stored);
  insertCompoundCard(storage, part.saltCard, `${part.holder.name}+*account+*salt`, part.junction, ids.salt, SALT);
  insertCompoundCard(storage, part.statusCard, `${part.holder.name}+*account+*status`, part.junction, ids.status, "active");
}

const NIA_PART: AccountPart = { holder: NIA, junction: 9101, emailCard: 9102, passwordCard: 9103, saltCard: 9104, statusCard: 9105 };
const OMAR_PART: AccountPart = { holder: OMAR, junction: 9111, emailCard: 9112, passwordCard: 9113, saltCard: 9114, statusCard: 9115 };
const UMA_PART: AccountPart = { holder: UMA, junction: 9121, emailCard: 9122, passwordCard: 9123, saltCard: 9124, statusCard: 9125 };

interface Deck {
  storage: AuthTestStorage;
  ctx: AccountFlowContext;
  transport: CaptureTransport;
  sessions: SessionStore;
  token: TokenRuntimeConfig;
}

/** A fresh in-memory deck: the core schema, the auth migration, and the
 *  repository's own boot-seed (the capability the worker runs at boot, so the
 *  deck carries the real core rule cards and the account mod's codename
 *  cards). The synthetic holders are added on top of that seed. */
async function buildDeck(accounts: Array<[AccountPart, string, string]>): Promise<Deck> {
  const storage = createAuthTestStorage();
  await runAuthMigrations(storage.driver);
  await bootstrapFreshDeck({ driver: storage.driver, now: () => BOOT_INSTANT });
  const ids = await resolveAccountCodenameIds(storage.driver);
  if (ids === null) throw new Error("the seeded deck has no account codenames");
  for (const [part, email, stored] of accounts) addAccount(storage, ids, part, email, stored);
  const transport = new CaptureTransport("security-8");
  const token: TokenRuntimeConfig = { secret: generatedTokenSecret(), now: () => T0 };
  const sessions = new SessionStore({ driver: storage.driver });
  const ctx: AccountFlowContext = {
    driver: storage.driver,
    fetcher: new FetchEngine(storage.driver),
    sessions,
    transport,
    token,
    origin: ORIGIN,
    siteTitle: SITE_TITLE,
  };
  return { storage, ctx, transport, sessions, token };
}

const storedRow = (storage: AuthTestStorage, part: AccountPart): string =>
  storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [part.passwordCard])!.db_content;

/** The boot environment the policy reads (src/card/auth/password-hash.ts
 *  processEnv), restored after every test so no suite leaves one behind. */
const SAVED_ENV = {
  DECKO_PASSWORD_HASH: process.env.DECKO_PASSWORD_HASH,
  DECKO_PASSWORD_PBKDF2_ITERATIONS: process.env.DECKO_PASSWORD_PBKDF2_ITERATIONS,
};

function setEnv(key: "DECKO_PASSWORD_HASH" | "DECKO_PASSWORD_PBKDF2_ITERATIONS", value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  configurePasswordHashing(undefined);
  setPbkdf2IterationLimit(undefined);
  setEnv("DECKO_PASSWORD_HASH", SAVED_ENV.DECKO_PASSWORD_HASH);
  setEnv("DECKO_PASSWORD_PBKDF2_ITERATIONS", SAVED_ENV.DECKO_PASSWORD_PBKDF2_ITERATIONS);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 2. Passwords: a new one is stored with PBKDF2 (docs/SECURITY.md)
// ---------------------------------------------------------------------------

const PASSWORD_CLAIM =
  "A newly set or changed password is stored as PBKDF2-HMAC-SHA256 with a random 16-byte salt, in the form `pbkdf2_sha256$<iterations>$<salt, base64>$<hash, base64>`. On the next successful sign-in, a legacy digest ... is replaced.";

describe("password storage (docs/SECURITY.md, divergence 1)", () => {
  it(`"${PASSWORD_CLAIM}" — under the default config a newly set password is stored as pbkdf2_sha256$600000$ with a fresh 16-byte salt`, async () => {
    // The default config: no DECKO_PASSWORD_* in the boot environment, so the
    // policy is PBKDF2 at OWASP's count.
    setEnv("DECKO_PASSWORD_HASH", undefined);
    setEnv("DECKO_PASSWORD_PBKDF2_ITERATIONS", undefined);
    configurePasswordHashing(undefined);
    expect(passwordHashPolicy()).toEqual({ mode: "pbkdf2", iterations: 600_000 });

    const deck = await buildDeck([[NIA_PART, NIA_EMAIL, await sha1Hex(`${SALT}--${NIA_OLD_PASSWORD}--`)]]);
    try {
      const write = await applyNewAccountPassword(
        { driver: deck.storage.driver, fetcher: deck.ctx.fetcher, actor: NIA },
        `${NIA.name}+*account`,
        NIA_NEW_PASSWORD,
      );
      expect(write.ok).toBe(true);
      if (!write.ok || write.noOp) throw new Error("the password write did not happen");

      const stored = storedRow(deck.storage, NIA_PART);
      expect(stored.startsWith("pbkdf2_sha256$600000$")).toBe(true);
      const [prefix, iterations, saltB64, hashB64] = stored.split("$");
      expect(prefix).toBe("pbkdf2_sha256");
      expect(Number(iterations)).toBe(600_000);
      // A random 16-byte salt, base64; a 256-bit derived key, base64.
      expect(Buffer.from(saltB64!, "base64").length).toBe(16);
      expect(Buffer.from(hashB64!, "base64").length).toBe(32);
      // Independent recomputation with node:crypto's PBKDF2.
      expect(pbkdf2Sync(NIA_NEW_PASSWORD, Buffer.from(saltB64!, "base64"), 600_000, 32, "sha256").toString("base64")).toBe(hashB64);
      // Setting it again draws a new salt for the same password.
      const again = await applyNewAccountPassword(
        { driver: deck.storage.driver, fetcher: deck.ctx.fetcher, actor: NIA },
        `${NIA.name}+*account`,
        NIA_NEW_PASSWORD,
      );
      expect(again.ok).toBe(true);
      expect(storedRow(deck.storage, NIA_PART).split("$")[2]).not.toBe(saltB64);
      // The new password signs in; the one it replaced does not.
      expect((await authenticateAccount(deck.storage.driver, NIA_EMAIL, NIA_NEW_PASSWORD)).ok).toBe(true);
      expect(await authenticateAccount(deck.storage.driver, NIA_EMAIL, NIA_OLD_PASSWORD)).toMatchObject({
        reason: "wrong_password",
      });
    } finally {
      deck.storage.close();
    }
  }, 60_000);

  it(`"${PASSWORD_CLAIM}" — a Ruby SHA-1 digest still verifies, and signing in with it rewrites the stored row as PBKDF2`, async () => {
    setEnv("DECKO_PASSWORD_HASH", undefined);
    setEnv("DECKO_PASSWORD_PBKDF2_ITERATIONS", undefined);
    configurePasswordHashing(undefined);

    // The account as Ruby Decko left it: Card::Auth.encrypt is
    // SHA1("<salt>--<password>--") as 40 lowercase hex characters.
    const rubyDigest = await sha1Hex(`${SALT}--${OMAR_PASSWORD}--`);
    expect(rubyDigest).toMatch(/^[0-9a-f]{40}$/);
    const deck = await buildDeck([[OMAR_PART, OMAR_EMAIL, rubyDigest]]);
    try {
      expect(storedRow(deck.storage, OMAR_PART)).toBe(rubyDigest);

      // It verifies, mints a session for the holder, and is replaced in place.
      const outcome = await signinAccount(deck.storage.driver, deck.sessions, OMAR_EMAIL, OMAR_PASSWORD);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error("the Ruby digest did not verify");
      expect(outcome.actor).toEqual({ id: OMAR.id, name: OMAR.name });
      expect(await deck.sessions.lookupSession(outcome.session.token)).toEqual({ id: OMAR.id, name: OMAR.name });

      const rewritten = storedRow(deck.storage, OMAR_PART);
      expect(rewritten).not.toBe(rubyDigest);
      expect(rewritten.startsWith("pbkdf2_sha256$600000$")).toBe(true);
      expect((await checkPassword(rewritten, OMAR_PASSWORD, SALT)).ok).toBe(true);
      // The +*salt card is untouched (right/password.rb:19-26 keeps it).
      expect(
        deck.storage.selectOne<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [OMAR_PART.saltCard])!.db_content,
      ).toBe(SALT);
      // Signing in again succeeds and does not rewrite the row a second time.
      expect((await authenticateAccount(deck.storage.driver, OMAR_EMAIL, OMAR_PASSWORD)).ok).toBe(true);
      expect(storedRow(deck.storage, OMAR_PART)).toBe(rewritten);
    } finally {
      deck.storage.close();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 3. Cloudflare Workers' PBKDF2 ceiling (docs/SECURITY.md)
// ---------------------------------------------------------------------------

const WORKERS_CLAIM =
  'Cloudflare\'s production runtime refuses PBKDF2 above **100,000** iterations ... A hash created elsewhere with more iterations cannot be checked on Workers: the sign-in fails with a message saying so, not "Wrong password", and a password reset on Workers fixes it.';

/** workerd's refusal (cloudflare/workerd issue 1346), installed over Node's
 *  WebCrypto — which, like local workerd, computes past the ceiling. */
function refuseAboveTheWorkersCeiling(): void {
  const real = crypto.subtle.deriveBits.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "deriveBits").mockImplementation(async (algorithm, baseKey, length) => {
    const iterations =
      typeof algorithm === "object" && algorithm !== null && "iterations" in algorithm &&
      typeof (algorithm as { iterations: unknown }).iterations === "number"
        ? (algorithm as { iterations: number }).iterations
        : 0;
    if (iterations > CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS) {
      throw new DOMException(
        `Pbkdf2 failed: iteration counts above ${CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS} are not supported`,
        "OperationError",
      );
    }
    return real(algorithm, baseKey, length);
  });
}

/** Uma's account carrying a 600,000-iteration hash "created elsewhere", then
 *  the host booted as Cloudflare Workers: the runtime's declared ceiling
 *  (setPbkdf2IterationLimit, as worker.ts:75 does) and the boot environment
 *  DECKO_PASSWORD_PBKDF2_ITERATIONS=100000. */
async function bootWorkersDeck(): Promise<Deck> {
  configurePasswordHashing(undefined);
  setPbkdf2IterationLimit(undefined);
  setEnv("DECKO_PASSWORD_HASH", undefined);
  setEnv("DECKO_PASSWORD_PBKDF2_ITERATIONS", undefined);
  const elsewhere = await hashPassword(UMA_PASSWORD, SALT, { mode: "pbkdf2", iterations: 600_000 });
  const deck = await buildDeck([[UMA_PART, UMA_EMAIL, elsewhere]]);
  setPbkdf2IterationLimit({
    iterations: CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS,
    runtime: "Cloudflare Workers",
  });
  setEnv("DECKO_PASSWORD_PBKDF2_ITERATIONS", "100000");
  configurePasswordHashing(undefined);
  refuseAboveTheWorkersCeiling();
  expect(passwordHashPolicy()).toEqual({ mode: "pbkdf2", iterations: 100_000 });
  expect(storedRow(deck.storage, UMA_PART).startsWith("pbkdf2_sha256$600000$")).toBe(true);
  return deck;
}

describe("the Workers PBKDF2 ceiling (docs/SECURITY.md, divergence 1)", () => {
  it(`"${WORKERS_CLAIM}" — signing in with a 600,000-iteration stored hash fails with the explicit cannot-be-verified message, not "Wrong password"`, async () => {
    const deck = await bootWorkersDeck();
    try {
      const outcome = await signinAccount(deck.storage.driver, deck.sessions, UMA_EMAIL, UMA_PASSWORD);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("the sign-in was expected to fail");
      expect(outcome.reason).toBe("password_hash_unsupported");
      expect(outcome.message).toMatch(/cannot check this account's password/);
      expect(outcome.message).toMatch(/PBKDF2 iterations/);
      expect(outcome.message).toMatch(/Reset the password to sign in here/);
      expect(outcome.message).not.toBe("Wrong password");
      // No session is minted, and the stored hash is left as it was.
      expect(deck.storage.selectAll("SELECT * FROM auth_sessions")).toEqual([]);
      expect(storedRow(deck.storage, UMA_PART).startsWith("pbkdf2_sha256$600000$")).toBe(true);
    } finally {
      deck.storage.close();
    }
  }, 60_000);

  it(`"${WORKERS_CLAIM}" — a password reset on Workers stores a 100,000-iteration hash that signs in`, async () => {
    const deck = await bootWorkersDeck();
    try {
      // The reset arm end to end: request -> emailed token link -> confirm.
      const request = await sendResetPasswordToken(deck.ctx, UMA_EMAIL);
      expect(request.ok).toBe(true);
      if (!request.ok) throw new Error("the reset request was refused");
      expect(deck.transport.count()).toBe(1);
      expect(deck.transport.last()?.to).toBe(UMA_EMAIL);
      expect(request.resetUrl).toContain(`/update/${UMA.name.replace(/ /g, "_")}+*account`);
      expect(request.resetUrl).toContain("card%5Btrigger%5D=reset_password");
      const claims = await decodeAuthToken(deck.token, request.token);
      expect(typeof claims).toBe("object");
      if (typeof claims === "string") throw new Error(claims);
      expect(claims.exp).toBe(T0 + DEFAULT_TOKEN_EXPIRY_SECONDS);

      const confirmation = await confirmPasswordReset(deck.ctx, `${UMA.name}+*account`, request.token);
      expect(confirmation.ok).toBe(true);
      if (!confirmation.ok) throw new Error("the reset token was refused");
      expect(confirmation.holder).toEqual({ id: UMA.id, name: UMA.name });

      // The member types the new password: stored at the host's ceiling.
      const write = await applyNewAccountPassword(
        { driver: deck.storage.driver, fetcher: deck.ctx.fetcher, actor: confirmation.holder },
        `${UMA.name}+*account`,
        UMA_RESET_PASSWORD,
      );
      expect(write.ok).toBe(true);
      if (!write.ok || write.noOp) throw new Error("the reset write did not happen");

      const stored = storedRow(deck.storage, UMA_PART);
      expect(stored.startsWith(`pbkdf2_sha256$${CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS}$`)).toBe(true);
      expect(Buffer.from(stored.split("$")[2]!, "base64").length).toBe(16);
      // The account signs in on Workers with the new password, and only it.
      const outcome = await signinAccount(deck.storage.driver, deck.sessions, UMA_EMAIL, UMA_RESET_PASSWORD);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error("the reset password did not sign in");
      expect(outcome.actor).toEqual({ id: UMA.id, name: UMA.name });
      expect(await authenticateAccount(deck.storage.driver, UMA_EMAIL, UMA_PASSWORD)).toMatchObject({
        reason: "wrong_password",
      });
    } finally {
      deck.storage.close();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 4. Secrets are compared in constant time (docs/SECURITY.md)
// ---------------------------------------------------------------------------

const CONSTANT_TIME_CLAIM =
  "Password digests and hashes, session tokens and signed-token signatures are compared with a constant-time comparison (`src/card/auth/session-token.ts`), which runs over the whole input whatever it contains.";

/** A Uint8Array that records every element the comparator reads, so "runs
 *  over the whole input" is observed rather than assumed. */
function counting(bytes: number[]): { bytes: Uint8Array; reads: number[] } {
  const target = new Uint8Array(bytes);
  const reads: number[] = [];
  const proxy = new Proxy(target, {
    get(t, property) {
      if (typeof property === "string" && /^\d+$/.test(property)) reads.push(Number(property));
      return Reflect.get(t, property);
    },
  });
  return { bytes: proxy, reads };
}

const EVERY_INDEX = [0, 1, 2, 3, 4, 5, 6, 7];

describe("constant-time comparison (docs/SECURITY.md, divergence 3)", () => {
  it(`"${CONSTANT_TIME_CLAIM}" — equal inputs read every byte of both`, () => {
    const a = counting([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = counting([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(constantTimeEqual(a.bytes, b.bytes)).toBe(true);
    expect({ a: a.reads, b: b.reads }).toEqual({ a: EVERY_INDEX, b: EVERY_INDEX });
  });

  it(`"${CONSTANT_TIME_CLAIM}" — a difference in the first byte still reads every byte after it`, () => {
    const a = counting([9, 2, 3, 4, 5, 6, 7, 8]);
    const b = counting([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(constantTimeEqual(a.bytes, b.bytes)).toBe(false);
    expect({ a: a.reads, b: b.reads }).toEqual({ a: EVERY_INDEX, b: EVERY_INDEX });
  });

  it(`"${CONSTANT_TIME_CLAIM}" — inputs sharing a prefix read every byte, wherever the prefix ends`, () => {
    for (const shared of [0, 1, 5, 7]) {
      const a = counting([1, 1, 1, 1, 1, 1, 1, 1]);
      const b = counting([1, 1, 1, 1, 1, 1, 1, 1]);
      b.bytes[shared] = 2;
      expect(constantTimeEqual(a.bytes, b.bytes)).toBe(false);
      expect({ shared, a: a.reads, b: b.reads }).toEqual({ shared, a: EVERY_INDEX, b: EVERY_INDEX });
    }
  });

  it(`"${CONSTANT_TIME_CLAIM}" — unequal lengths read the longer input whole, answer false, and never throw`, () => {
    const short = counting([1, 2, 3]);
    const long = counting([1, 2, 3, 4, 5]);
    expect(constantTimeEqual(short.bytes, long.bytes)).toBe(false);
    // The loop runs over the LONGER length; the shorter side is not read past
    // its own end, so its reads are its own indices.
    expect({ short: short.reads, long: long.reads }).toEqual({ short: [0, 1, 2], long: [0, 1, 2, 3, 4] });
    // The other direction, and an empty input.
    const short2 = counting([1, 2, 3, 4, 5]);
    const long2 = counting([1, 2, 3]);
    expect(constantTimeEqual(short2.bytes, long2.bytes)).toBe(false);
    expect({ short2: short2.reads, long2: long2.reads }).toEqual({
      short2: [0, 1, 2, 3, 4],
      long2: [0, 1, 2],
    });
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array([1]))).toBe(false);
    // tokensEqual is the comparator SessionStore routes lookups through: the
    // result depends on content alone, and a length mismatch is simply false.
    expect(tokensEqual("probe-token-a", "probe-token-a")).toBe(true);
    expect(tokensEqual("probe-token-a", "probe-token-b")).toBe(false);
    expect(tokensEqual("probe-token-a", "probe-token")).toBe(false);
  });
});