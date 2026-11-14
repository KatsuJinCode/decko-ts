// probe-set-anchor-create.mjs - the route-level probe for the junction
// set-anchor create refusal.
//
// WHAT IT IS. The signed-in exercise records the STATUS of a junction
// set-anchor create (the C20 set seed, the P5 three-segment set) but not the
// BODY of the refusal, so a reader cannot tell WHICH layer refused. This
// probe boots the SAME local stack the exercise boots (the same deck copy,
// the same bundle, the same render configuration), signs in as the seeded
// administrator, and POSTs the same shapes through the same route
// (POST /card/create, form-encoded), recording the status, the response
// headers that carry a verdict, and the response body.
//
// WHY IT IS SAFE. The stack is local (lib/edge-host.mjs binds 127.0.0.1 with
// a throwaway self-signed certificate), the deck is a COPY of the source
// deck, and nothing reaches the live site. The probe writes its own throwaway
// cards under a Harness_ prefix and removes them from the copy's deck before
// it exits. It never deploys.
//
//   node tools/probe-set-anchor-create.mjs [--deck <source.sqlite3>]
//        [--out <report.json>] [--keep]
//
// The probe's own TLS trust is relaxed (NODE_TLS_REJECT_UNAUTHORIZED) because
// the local host serves a throwaway self-signed certificate; the harness does
// the same thing with its browser's ignoreHTTPSErrors.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { REPO, readLiveScriptEnv, startStack, buildBundle, ensureEngineDist } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";

const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const SOURCE_DECK = resolve(argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3");
const SECRETS = resolve(argOf("secrets") ?? "C:/localProjects/brandonDojoTech/library/data/secrets.env");
const STAMP = Date.now().toString(36);
const RUN_DIR = join(REPO, "tmp", `probe-set-anchor-${STAMP}-${process.pid}`);
const OUT = resolve(argOf("out") ?? join(REPO, "tmp", `probe-set-anchor-${STAMP}.json`));

// The local host's certificate is throwaway and self-signed.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

if (!existsSync(SOURCE_DECK)) throw new Error(`source deck not found: ${SOURCE_DECK}`);
mkdirSync(RUN_DIR, { recursive: true });

let stack = null;
let localDeck = null;
const report = { stamp: STAMP, sourceDeck: SOURCE_DECK, probes: [], timings: [] };
const exit = async (code) => {
  try {
    await stack?.close();
  } catch { /* the probe reports what it measured; the close failure is not a verdict */ }
  if (!hasFlag("keep")) {
    try { rmSync(RUN_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* leave it and say so */ }
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nprobe report: ${OUT}`);
  process.exit(code);
};

try {
  console.log(`building the engine and the bundle from ${REPO}`);
  ensureEngineDist();
  const bundlePath = buildBundle();
  console.log(`bundle: ${bundlePath}`);

  localDeck = join(RUN_DIR, "deck.sqlite3");
  console.log("building the local deck copy");
  await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });

  const credentialsPath = join(RUN_DIR, "credentials.json");
  await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
  const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));

  const { env: liveEnv } = await readLiveScriptEnv(SECRETS);
  stack = await startStack({
    deckPath: localDeck,
    live: liveEnv,
    runtimeDir: join(RUN_DIR, "runtime"),
    bundlePath,
  });
  const origin = stack.origin;
  console.log(`local edge host: ${origin}`);

  // The sign-in the harness's own actors use (checks-permission-rules.mjs's
  // signInActor): the real form's own field names, posted to the real route.
  const signin = await fetch(origin + "/update/*signin", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "card[subcards][+*email][content]": creds.admin.email,
      "card[subcards][+*password][content]": creds.admin.password,
    }).toString(),
    redirect: "manual",
  });
  const setCookies = typeof signin.headers.getSetCookie === "function" ? signin.headers.getSetCookie() : [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  report.signin = { status: signin.status, location: signin.headers.get("location"), cookieNames: setCookies.map((c) => c.split("=")[0]) };
  console.log(`sign-in: ${signin.status} (cookie: ${report.signin.cookieNames.join(", ") || "none"})`);
  if (signin.status >= 400 || cookie === "") throw new Error("the probe could not sign the seeded administrator in");

  const deck = new Database(localDeck, { readonly: true });
  // The harness's own lookup (tools/edge-signed-in-exercise/lib/typed-fixture.mjs
  // fixtureCard): a compound name's row carries no name and no key (the 2020
  // convention), so the row is found by composing its sides.
  const rowOf = (name, depth = 0) => {
    const direct = deck
      .prepare("SELECT id,name,type_id,left_id,right_id,trash FROM cards WHERE name=? AND trash=0")
      .get(name);
    if (direct) return direct;
    const joint = name.lastIndexOf("+");
    if (joint < 1 || joint === name.length - 1 || depth > 6) return undefined;
    const left = rowOf(name.slice(0, joint), depth + 1);
    const right = rowOf(name.slice(joint + 1), depth + 1);
    if (!left || !right) return undefined;
    return deck
      .prepare("SELECT id,name,type_id,left_id,right_id,trash FROM cards WHERE left_id=? AND right_id=? AND trash=0")
      .get(left.id, right.id);
  };

  const post = async (label, name, type, content = "") => {
    const started = Date.now();
    const fields = {
      "card[name]": name,
      "card[content]": content,
      "success[redirect]": "true",
    };
    if (type !== undefined) fields["card[type]"] = type;
    const response = await fetch(origin + "/card/create", {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded", cookie },
      body: new URLSearchParams(fields).toString(),
      redirect: "manual",
    });
    const body = await response.text();
    const elapsedMs = Date.now() - started;
    const probe = {
      label,
      name,
      type: type ?? null,
      content,
      status: response.status,
      elapsedMs,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      bodyHead: body.slice(0, 1500),
      stored: rowOf(name) ?? null,
    };
    report.probes.push(probe);
    console.log(`  ${label}: HTTP ${response.status} in ${elapsedMs}ms  stored=${probe.stored !== null}`);
    if (probe.status >= 400) console.log(`      body: ${probe.bodyHead.replace(/\s+/g, " ").slice(0, 400)}`);
    return probe;
  };

  const basicType = deck.prepare("SELECT name FROM cards WHERE codename='basic' AND trash=0 LIMIT 1").get()?.name ?? "Basic";
  report.basicType = basicType;

  console.log("probing the create shapes");
  // Every shape gets its OWN name: two creates of the same name answer 422
  // with a name-conflict, which would hide the shape under test.
  // The refused shape: a junction set-anchor card, type List, empty content.
  await post("set-anchor +*right, type List", `HarnessSetAnchor${STAMP}a+*right`, "List");
  // The control the held-mx report recorded as creating fine: a plain compound.
  await post("plain compound, type List", `HarnessPlain${STAMP}+plain`, "List");
  // The same set-anchor shape, a different type.
  await post("set-anchor +*right, type RichText", `HarnessSetAnchor${STAMP}b+*right`, "RichText");
  // The other set anchor.
  await post("set-anchor +*self, type List", `HarnessSelfAnchor${STAMP}+*self`, "List");
  // The three-segment set anchor the P5 leg creates.
  await post("three-segment +*type_plus_right, type List", `${basicType}+HarnessTpr${STAMP}a+*type_plus_right`, "List");
  await post("three-segment +*type_plus_right, type Phrase", `${basicType}+HarnessTpr${STAMP}b+*type_plus_right`, "Phrase");
  // A simple name, the plainest create.
  await post("simple name, type List", `HarnessSimple${STAMP}`, "List");
  // The shapes the recorded Ruby run would send: no explicit type (Ruby
  // derives the type from the name) and the type the name assigns.
  await post("set-anchor +*right, NO type", `HarnessSetAnchor${STAMP}c+*right`, undefined);
  await post("set-anchor +*right, type Set", `HarnessSetAnchor${STAMP}d+*right`, "Set");
  await post("three-segment +*type_plus_right, NO type", `${basicType}+HarnessTpr${STAMP}c+*type_plus_right`, undefined);
  await post("set-anchor +*self, NO type", `HarnessSelfAnchor${STAMP}b+*self`, undefined);

  // The TIMINGS legs: the pages the whole-family exercise's server-time
  // budget grades (the signed-in exercise's own timing check fails when a
  // page exceeds 3 s of server time). The exercise's stack builds the nest
  // index before it serves; this probe does the same, or the walk is
  // measured cold.
  console.log("building the nest index (the exercise's own stack does this)");
  execFileSync(process.execPath, [join(REPO, "tools/deploy/build-nest-index.mjs"), "--db", localDeck], {
    cwd: REPO,
    stdio: "ignore",
    timeout: 600_000,
  });
  const timeGet = async (label, path) => {
    const started = Date.now();
    const response = await fetch(origin + path, { headers: { cookie }, redirect: "manual" });
    const body = await response.text();
    const elapsedMs = Date.now() - started;
    const timing = {
      label,
      path,
      status: response.status,
      elapsedMs,
      bytes: body.length,
    };
    report.timings.push(timing);
    console.log(`  ${label}: HTTP ${response.status} in ${elapsedMs}ms (${body.length} bytes)`);
  };
  console.log("timing the pages the timings legs grade");
  await timeGet("the home page", "/");
  await timeGet("the junction create form (Search + *right)", `/new/Search?card%5Bname%5D=${encodeURIComponent(`HarnessTimings${STAMP}+*right`)}`);
  await timeGet("the junction create form (Pointer)", `/new/Pointer?card%5Bname%5D=${encodeURIComponent(`HarnessTimings${STAMP}+*right`)}`);
  await timeGet("a junction edit form", `/new/Search?card%5Bname%5D=${encodeURIComponent(`HarnessTimings${STAMP}+*right`)}`);

  deck.close();
  await exit(0);
} catch (error) {
  report.error = String(error?.stack ?? error);
  console.error(report.error);
  await exit(1);
}
