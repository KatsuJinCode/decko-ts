#!/usr/bin/env node
// Pins the six affordance-not-found reds of the 2026-10-18 exhaustive run's
// slice-7 lane (ACT-020, ACT-045, ACT-078, ACT-101, ACT-130, ACT-148) to the
// page each capability's affordance actually lives on, on the same engine
// (ts.json) and the same fixture (synthetic-v1) the exhaustive runner uses.
//
// WHY THIS EXISTS. run-exhaustive.mjs drives one page per surface
// (probeAction visits SURFACES[surface].card and nothing else; the
// additionalPages lists in the SURFACES table are never read), then grades an
// action by whether a decoded affordance hint was FOUND on that page. Five of
// the six slice-7 reds are that instrument limit rather than an engine
// defect: the hint names an affordance that belongs to a different page. Each
// leg below therefore drives the affordance's OWN page and reports what the
// engine serves there, so a real engine regression turns this probe red while
// a mis-aimed exhaustive probe does not.
//
//   ACT-020  B-020  "saving the RichText card persists"     -> ?view=edit_form
//              (the Save button is an EDIT-FORM affordance;
//              card-mod-edit.ts:391 data-cy="save". The exhaustive
//              runner visits "/" — the read view — where no Save exists.)
//   ACT-045  B-045  "the Account tab exposes the account's
//              email and password fields"                  -> /account_tab
//              (the runner's *email/*password asserts name the SIGN-IN
//              form's input names and run on "/", where the only
//              "Account" text is the navbar actor link.)
//   ACT-078  E21   "the board History tab lists the run's
//              change"                                     -> /history
//              (the History VIEW lists the run's changes; the board TAB
//              surface needs a board card, which synthetic-v1 has none of.)
//   ACT-101  P5    "*right Set: a *self+*structure rule
//              renders its structure in the main slot"     -> RIGHT-x_* rule
//              editors, which live on the board substrate
//              (card-mod-edit.ts board / board_rules_tab views).
//              UNREACHABLE on synthetic-v1: no board card, and the view
//              answers 422 UnsupportedViewError off a board. Reported as
//              not-exercisable, never scored as a pass.
//   ACT-130  C11   "Autoname cardtype (name generated on
//              save)"                                       -> create form
//              carries a "Submit" control
//              (card-mod-edit.ts:2107 create-submit-button), never
//              "Save"; and the matrix's own whole-harness row records C11
//              unexercisable because no Cardtype in the deck carries a
//              +*autoname rule.
//   ACT-148  F7    "Member uploads a file"                  -> input[type=file]
//              on /new/File AFTER a prior typed /new/<Type> render.
//              This leg is the engine regression pin: before
//              0c1ae22a the chooser vanished once /new/Basic (or any
//              typed new page) had rendered in the process.
//
//   node reference-harness/browser/probe-slice7-exhaustive-affordance-reds.mjs \
//     --engine reference-harness/browser/engines/ts.json \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     --out .runtime/exhaustive/<dir>
//
// The engine stages a private copy of the fixture deck (lib/engines.mjs), so
// every write this probe makes dies with the staging directory. Exit code is
// 1 when any scored contract's expectation is unmet, so it works as a gate.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}
const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-slice7-exhaustive-affordance-reds");
mkdirSync(out, { recursive: true });

const spec = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
const admin = spec.actors.admin;

const engine = loadEngine(engineManifest);
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
console.log(`[slice7] engine ${engine.name} on ${server.base}; fixture ${path.basename(fixtureDir)}`);

/** A cookie jar over plain HTTP, enough for the signed-in surfaces here. */
const jar = [];
function absorbCookies(res) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const name = pair.split("=")[0];
    const i = jar.findIndex((c) => c.startsWith(name + "="));
    if (i >= 0) jar[i] = pair;
    else jar.push(pair);
  }
}
async function get(url) {
  const headers = {};
  if (jar.length) headers.cookie = jar.join("; ");
  const res = await fetch(server.base + url, { headers, redirect: "manual" });
  absorbCookies(res);
  return { status: res.status, html: await res.text() };
}
async function signIn() {
  const { html } = await get("/*signin");
  const token = /name="authenticity_token" value="([^"]+)"/.exec(html)?.[1] ?? "";
  const res = await fetch(server.base + "/update/*signin", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.join("; ") },
    body: new URLSearchParams({
      authenticity_token: token,
      "card[subcards][+*email][content]": admin.email,
      "card[subcards][+*password][content]": admin.password,
    }).toString(),
    redirect: "manual",
  });
  absorbCookies(res);
  if (res.status !== 303) throw new Error(`sign-in did not redirect (status ${res.status})`);
  console.log(`[slice7] signed in as ${admin.email}`);
}
await signIn();

// Fixture card names carry spaces; the harness routes them percent-encoded.
const RICH = "/" + encodeURIComponent("Topic 001");
const ACTOR = "/" + encodeURIComponent("Ada Admin");

const legs = [];
// `primer: true` marks a leg that only exists to PUT THE ENGINE IN THE STATE
// the next leg asserts on (render a typed new-card form first); it is a setup
// step, never a scored contract.
const leg = (id, capability, contract, url, expect, why, primer = false) =>
  legs.push({ id, capability, contract, url, expect, why, primer });

// ACT-020 — the Save button is an edit-form affordance.
leg("ACT-020", "B-020", "RichText edit form carries the Save button", RICH + "?view=edit_form", {
  re: /data-cy="save"/,
}, 'card-mod-edit.ts:391 `<button ... data-cy="save">Save</button>`; the exhaustive runner visits "/" (read view), where no Save exists.');
// ACT-045 — the Account tab, on the actor card.
leg("ACT-045", "B-045", "Account tab renders its Email and Password section", ACTOR + "/account_tab", {
  re: /Email and Password/,
}, "BOARD_TABS' account_tab (card-mod-edit.ts:3091); the runner's *email/*password asserts name the SIGN-IN form's input names and run on \"/\".");
// ACT-078 — the card's History view lists the run's changes.
leg("ACT-078", "E21", "History view lists action rows", RICH + "/history", {
  re: /Content changes:/,
}, "the History VIEW (card-mod-history.ts) lists Additions|Subtractions rows; the board TAB surface needs a board card synthetic-v1 does not have.");
// ACT-101 — rule editors live on the board substrate; record reachability.
leg("ACT-101", "P5", "board rule editors reachable (RIGHT-x_* inputs)", ACTOR + "/board_rules_tab", {
  re: /RIGHT-x_/,
  mayBeUnreachable: true,
}, "board/board_rules_tab views (card-mod-edit.ts:4047, 4418) are board-card views; off a board this request answers 422 UnsupportedViewError (vm-staging-server.mjs:2807). synthetic-v1 has no board card, so the P5 contract is not exercisable here — reported, never scored as a pass.");
// ACT-130 — a create form offers Submit, never Save.
leg("ACT-130", "C11", "new-card create form carries its Submit control", "/new/Basic", {
  re: /create-submit-button/,
}, 'card-mod-edit.ts:2107 `class="submit-button create-submit-button ...">Submit</button>`; the runner mints a "Save" text hint from the action\'s word "save", which no create form carries.');
// ACT-148 — the upload input survives a prior typed new-card render.
leg("ACT-148", "F7", "typed new-card form rendered first (setup for the next leg)", "/new/Basic", {
  re: /new_fields-view/,
}, "setup leg: renders the typed new form whose :input resolution used to poison the memo.", true);
leg("ACT-148", "F7", "file chooser present on /new/File after /new/Basic", "/new/File", {
  re: /cloud_upload/,
  mustHave: /<input class='file-upload slotter form-control'[^>]*type='file'/,
}, "type/file's fileInputView (card-mod-carrierwave.ts:605-612) renders .choose-file with input[type=file]; the input[type=file] is what the F1/F3/F7 contract names. Before 0c1ae22a this leg lost the chooser once any typed /new page had rendered in the process.");

const results = [];
for (const l of legs) {
  const { status, html } = await get(l.url);
  const found = l.expect.re.test(html);
  const mustHave = l.expect.mustHave === undefined ? true : l.expect.mustHave.test(html);
  const reachable = status !== 422;
  // A 422 on a board-only view is the engine saying "this view is not for
  // this card", which is a fixture limit here, not a capability failure.
  const pass = found && mustHave && reachable;
  const verdict = l.primer ? "primer" : pass ? "served" : reachable ? "NOT SERVED" : "not-reachable-here";
  results.push({ ...l, status, found, mustHave, pass, primer: l.primer === true, verdict });
  writeFileSync(path.join(out, `${l.id}-${l.url.replace(/[^a-z0-9]+/gi, "_")}.html`), html);
  console.log(
    `[slice7] ${l.id} (${l.capability}) ${verdict.padEnd(19)} status=${status} ` +
      `hint=${found} markup=${mustHave} ${l.url}`,
  );
  if (l.primer === true) console.log(`[slice7]   setup: ${l.why}`);
  else if (!pass) console.log(`[slice7]   why: ${l.why}`);
}

const contracts = results.filter((r) => !r.primer);
const served = contracts.filter((r) => r.pass);
const unmet = contracts.filter((r) => !r.pass && !r.expect.mayBeUnreachable);
const unreachable = contracts.filter((r) => !r.pass && r.expect.mayBeUnreachable);
writeFileSync(
  path.join(out, "results.json"),
  JSON.stringify({ engine: engine.name, fixture: path.basename(fixtureDir), served: served.length, unmet: unmet.length, unreachable: unreachable.length, legs: results }, null, 2) + "\n",
);
console.log(`\n[slice7] contracts=${contracts.length} served=${served.length} unmet=${unmet.length} not-reachable=${unreachable.length}`);
if (unreachable.length) console.log(`[slice7] not-reachable (fixture limit, reported not scored): ${unreachable.map((r) => `${r.id}/${r.capability}`).join(", ")}`);
await server.stop();
process.exit(unmet.length > 0 ? 1 : 0);