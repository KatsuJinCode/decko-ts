// The sign-in form's two validation legs THROUGH the booted staging server,
// graded byte-for-byte against Ruby's own recorded answers.
//
// Registry row cap-S3 (tools/edge-signed-in-exercise/capabilities.json, id
// S3, group session): "Sign in requires email and password (form
// validation)". The row was PARTIAL because only the empty-PASSWORD half of
// Ruby's spec/cypress/e2e/user/signin_spec.coffee had a check
// (capabilities.json finding: "Empty password tested; empty email not
// tested"). Both halves are driven here, and BOTH are compared against the
// oracle rather than against a hand-written expectation:
//
//   reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json
//     step "signin-blank-email"      — the cypress "requires email" leg
//     step "signin-blank-password"   — the cypress "requires password" leg
//     step "signin-unknown"         — Ruby's keyed shape, kept as the
//                                       control that stops the bare/`<p>`
//                                       distinction passing vacuously
//
// Each Ruby answer is the FULL page Decko rendered (the alert sits inside
// `<div id="main">`, split across template line breaks); this port's write
// path answers the ALERT ALONE (write-routes.ts htmlResponse — the write
// surface returns the failed slot's own bytes, not a re-rendered page). The
// comparison therefore takes the alert REGION out of both sides and folds
// the template's newlines, and nothing else. Two document-level
// divergences are named rather than papered over, at the bottom of this
// file.
//
// Ruby's uniform-failure policy is OFF for this boot, the same sanctioned
// flag tests/card/auth/signin-endpoint.test.ts:50 sets, so the ladder
// renders Ruby's own per-class messages and the oracle comparison is exact.
// The default production posture (docs/SECURITY.md divergence 4) replaces
// the wrong-password class with one uniform string; that is a deliberate,
// documented divergence from Ruby's wording, not a port gap, and this file
// does not measure it.
//
// The deck is a DISPOSABLE COPY of the committed miniature test corpus
// (fixtures/test-corpus/, the default of src/testing/test-corpus-paths.ts).
// That corpus is ANONYMIZED — card names and contents are scrambled
// derivatives — and the copy prep below is the one
// tests/card/auth/signin-endpoint.test.ts:100-228 performs: the
// engine-standard db_content column, the [ENGINE-FRESHNESS] stamp the
// render path demands, and the Default Layout card identity the anonymizer
// moved. No account data is written and nothing is printed.
//
// The write path is ARMED for this boot (DECKO_WRITE_PATH=1). Unarmed, the
// staging host answers 405 on /update/*signin — which is what the committed
// /_signin endpoint suite sees, and why no committed test drove this Ruby
// path through the Node host before.

import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as netCreateServer } from "node:net";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureStagingServerDist } from "./staging-server-dist-bootstrap.js";
import { CORPUS_DB_PATH } from "../../../src/testing/test-corpus-paths.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const RUBY_ANSWERS = path.join(
  REPO_ROOT,
  "reference-harness",
  "fixtures",
  "write-battery-v1",
  "expected",
  "side-effects-ruby.json",
);
const FIXTURE_PATH = path.join(REPO_ROOT, "tmp", "signin-blank-field-refusal-fixture.sqlite3");

interface RubyStep {
  step: string;
  status: number;
  body: string;
}

let rubyAnswers: Map<string, RubyStep>;

function loadRubyAnswers(): Map<string, RubyStep> {
  const parsed = JSON.parse(readFileSync(RUBY_ANSWERS, "utf8")) as { steps: RubyStep[] };
  return new Map(parsed.steps.map((entry) => [entry.step, entry]));
}

/**
 * The alert region of a rendered page: the dismissible warning alert
 * card-mod-format-0.20.0 set/all/html/error.rb:53-65 renders for the
 * errors view, with the template's line breaks folded so the two renderers
 * can be compared. Nothing else is normalized — the class list, the heading
 * and the message bytes are compared exactly as emitted.
 */
function alertRegion(html: string): string {
  const start = html.indexOf('<div class="alert');
  expect(start, "the page carries no alert div").toBeGreaterThan(-1);
  const end = html.indexOf("</div>", start);
  expect(end, "the alert div is never closed").toBeGreaterThan(-1);
  return html.slice(start, end + "</div>".length).replace(/\n/g, "");
}

/** The sign-in form's own field grammar (write-routes.ts:613-624 consumes it). */
function signinFormBody(email: string, password: string): string {
  const form = new URLSearchParams();
  form.set("_method", "patch");
  form.set("success[redirect]", "true");
  form.set("success[mark]", "*previous");
  form.set("card[subcards][+*email][content]", email);
  form.set("card[subcards][+*password][content]", password);
  return form.toString();
}

let server: ChildProcess | null = null;
let baseUrl = "";
let serverOutput = "";

async function reserveEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = netCreateServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function postSignin(email: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/update/*signin`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: signinFormBody(email, password),
    redirect: "manual",
  });
}

/** The session cookie NAME only. The value never enters evidence. */
function sessionCookieName(response: Response): string | null {
  const header = response.headers.get("set-cookie");
  if (header === null) return null;
  const match = /(decko_ts_session)=/.exec(header);
  return match?.[1] ?? null;
}

describe("the sign-in form's blank-field refusals, through the booted staging server", () => {
  beforeAll(async () => {
    rubyAnswers = loadRubyAnswers();

    mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
    rmSync(FIXTURE_PATH, { force: true });
    copyFileSync(CORPUS_DB_PATH as string, FIXTURE_PATH);

    const db = new Database(FIXTURE_PATH);
    try {
      const columns = (db.prepare("PRAGMA table_info(cards)").all() as Array<{ name: string }>)
        .map((column) => column.name);
      if (columns.includes("content") && !columns.includes("db_content")) {
        db.exec("ALTER TABLE cards RENAME COLUMN content TO db_content");
      }
      db.exec(
        readFileSync(
          path.join(REPO_ROOT, "deploy", "migrations", "0003-deck-data-version-stamp.sql"),
          "utf8",
        ),
      );
      const layoutCard = db
        .prepare("SELECT id FROM cards WHERE codename = 'default_layout' AND trash = 0")
        .get() as { id: number } | undefined;
      if (layoutCard !== undefined) {
        db.prepare(
          "UPDATE cards SET name = 'Default Layout', key = 'default_layout' WHERE id = ?",
        ).run(layoutCard.id);
        const layoutRules = db
          .prepare(
            "SELECT id, db_content AS target FROM cards WHERE right_id = (SELECT id FROM cards WHERE codename = 'layout' AND trash = 0) AND trash = 0",
          )
          .all() as Array<{ id: number; target: string }>;
        const repoint = db.prepare("UPDATE cards SET db_content = 'Default Layout' WHERE id = ?");
        for (const rule of layoutRules) {
          const target = db
            .prepare("SELECT length(db_content) AS blen FROM cards WHERE name = ? AND trash = 0")
            .get(rule.target) as { blen: number } | undefined;
          if (target === undefined || !target.blen) repoint.run(rule.id);
        }
      }
    } finally {
      db.close();
    }

    await ensureStagingServerDist();
    const port = await reserveEphemeralPort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [SERVER_ENTRY, FIXTURE_PATH, String(port)], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DECKO_WRITE_PATH: "1",
        // Ruby's own per-class messages, so the oracle comparison is exact
        // (docs/SECURITY.md divergence 4 is the default, deliberate posture).
        DECKO_SIGNIN_UNIFORM_FAILURE: "off",
      },
    });
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    const deadline = Date.now() + 90_000;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      try {
        ready = (await fetch(`${baseUrl}/_status`)).status === 200;
      } catch {
        // not listening yet
      }
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      throw new Error(
        `staging server did not become ready on port ${port}\n--- server output ---\n${serverOutput}`,
      );
    }
  }, 240_000);

  afterAll(async () => {
    if (server !== null && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 3000);
        server?.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    server = null;
    rmSync(FIXTURE_PATH, { force: true, maxRetries: 5, retryDelay: 200 });
  });

  it("an empty email field is refused with the bytes Ruby renders", async () => {
    const ruby = rubyAnswers.get("signin-blank-email");
    expect(ruby?.status).toBe(422);

    const response = await postSignin("", "irrelevant");
    expect(response.status).toBe(ruby?.status);
    // Ruby's abort happens before any authentication, so no session is
    // minted; the check is the absence of the cookie, never its value.
    expect(sessionCookieName(response)).toBeNull();

    expect(alertRegion(await response.text())).toBe(alertRegion((ruby as RubyStep).body));
  }, 60_000);

  it("an empty password field is refused with the bytes Ruby renders", async () => {
    const ruby = rubyAnswers.get("signin-blank-password");
    expect(ruby?.status).toBe(422);

    const response = await postSignin("someone@example.invalid", "");
    expect(response.status).toBe(ruby?.status);
    expect(sessionCookieName(response)).toBeNull();

    expect(alertRegion(await response.text())).toBe(alertRegion((ruby as RubyStep).body));
  }, 60_000);

  it("CONTROL: an unrecognized email still renders Ruby's KEYED alert shape", async () => {
    // Without this leg the two comparisons above could pass on any alert
    // markup at all: Ruby renders an `:abort` error bare and every other
    // error as <p><strong>KEY:</strong> message</p>
    // (card-mod-format-0.20.0 set/all/error.rb:32-40), so the keyed leg is
    // what proves the bare form above is the abort shape and not a blanket
    // rule. The unknown-address step is the keyed leg this fixture can
    // drive without issuing credentials for a corpus account; the
    // wrong-password step needs a real account's issued password and is
    // covered by tests/card/auth/signin-endpoint.test.ts.
    const ruby = rubyAnswers.get("signin-unknown");
    expect(ruby?.status).toBe(422);

    const response = await postSignin("nobody@corpus.test", "definitely-wrong");
    expect(response.status).toBe(ruby?.status);
    expect(sessionCookieName(response)).toBeNull();

    const region = alertRegion(await response.text());
    expect(region).toBe(alertRegion((ruby as RubyStep).body));
    expect(region).toContain("<p><strong>SIGNIN:</strong> Unrecognized email.</p>");
  }, 60_000);
});

// NAMED DIVERGENCES (skip-and-name; not ported here).
//
// 1. Document shape. Ruby answers a plain (non-ajax) form POST with the
//    whole page re-rendered around the alert — `<title>*signin - My Deck</title>`,
//    the nav, `<div id="main">` around the alert, the footer. This port's
//    write path answers the alert alone inside its own minimal document
//    (write-routes.ts htmlResponse). Ruby does the same slot-only answer for
//    the AJAX flavor, and this port's ajax flavor already takes that shape;
//    making the plain flavor re-render the page is a write-path-wide change,
//    not a sign-in one, and it is not attempted in this tranche.
//
// 2. Uniform-failure wording. With docs/SECURITY.md divergence 4 in its
//    default posture the port answers the wrong-password class with one
//    uniform string instead of Ruby's per-class messages. That is a
//    deliberate security choice with its own tests
//    (tests/card/auth/signin-hardening.test.ts); this file boots with the
//    policy off so the oracle comparison is exact, and measures nothing
//    about the default posture.
