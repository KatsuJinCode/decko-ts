#!/usr/bin/env node
// probe-act-162-signed-in-signin-route-create-form-fallthrough.mjs
//
// ACT-162 / S10 — "a signed-in visit to the sign-in route falls through to a
// card-creation form". Surface `sign-in route while signed in`, kind
// crawl-defect, status fail, and the single coverage entry carries
// instrument_family "none": the action had never been driven by an instrument
// (docs/registry/instrument-coverage-matrix.json, the ACT-162 action object).
//
// The design implemented here is the one written 2026-10-19 in
// brandonDojoTech/docs/reports/no-instrument-action-designs-2026-10-19.md,
// section ACT-162 (lines 149-192), together with the house style every design
// in that file shares (lines 30-58). The design's graded leg, its positive
// control and its session control are implemented AS WRITTEN — including the
// design's explicit choice of instrument, "a VISIBLE
// form.card-form input[name='card[name]'] create prompt", over a bare
// `form.card-form` substring (the ACT-184 run-1 RED lesson, batch5:292-296),
// and including its second clause "and no form[action='/update/*signin']
// either".
//
// Two things this probe adds on top of the three legs, both REQUIRED by the
// house style the design adopts ("every graded leg carries a control that must
// hold, so no leg can pass vacuously", design:42-44) and by what the design
// says it is asserting:
//
//   ACT-162-CONTROL-A  the chosen discriminator FIRES on a page that really
//                      renders the create form — `/new/RichText`, signed in,
//                      whose `card[name]` is a visible text input. Without
//                      this, "zero prompts" could mean "dead selector".
//   ACT-162-CONTROL-B  the chosen discriminator FIRES ON THE FALL-THROUGH
//                      SHAPE THE FAIL NAME DESCRIBES — a signed-in visit to an
//                      unknown card name, which is the create path the crawl's
//                      `*signin` leak took. This is the control that decides
//                      whether the graded leg means anything.
//
// ACT-162 is NOT one of the 101 witnessed page-only ids
// (tmp/pageonly-101-ids.json on the coordination tree carries 101 ids and
// ACT-162 is not among them): the 2026-10-16 crawl that found this defect was
// the SIGNED-IN enumeration crawl, not the page-only pass, so this probe is a
// single-action probe and claims no rank window.
//
// Everything drives on the same engine and fixture the exhaustive runner
// grades: reference-harness/browser/engines/ts.json over
// reference-harness/fixtures/synthetic-v1, staged onto a private copy of the
// fixture deck (lib/engines.mjs), so every write dies with the staging dir.
// Browser via lib/launch.mjs, loopback-guarded, one graded leg per verdict,
// JSON evidence under .runtime/. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-act-162-signed-in-signin-route-create-form-fallthrough.mjs \
//     [--engine <pure-tip checkout>/reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-ACT-162");
const UNKNOWN_CARD = "No_Such_Card_ACT162";
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });

// --- provenance (the runner's own receipt fields, run-exhaustive.mjs:185-215) ---
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function execGit(...gitArgs) {
  return spawnSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", windowsHide: true }).stdout?.trim() ?? "";
}
function treeDigest(root) {
  if (!existsSync(root)) return null;
  const hash = createHash("sha256");
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(file);
      else hash.update(path.relative(root, file).replaceAll("\\", "/") + "\0" + sha256(readFileSync(file)) + "\n");
    }
  };
  visit(root);
  return hash.digest("hex");
}
// sha256 of the empty string — what `git diff HEAD` on a clean tree produces,
// i.e. the value that means "this build's tree is exactly its commit"
const EMPTY_SHA256 = sha256("");

const sourceCommit = execGit("rev-parse", "HEAD");
const dirtyPorcelain = execGit("status", "--porcelain", "--untracked-files=normal");

// The ENGINE's build record: the engine boots from a disposable pure-tip
// worktree (--engine), so its OWN build provenance is what this lane measured.
let engineBuild = null;
try {
  const engineRepo = path.resolve(path.dirname(engineManifest), "..", "..", "..");
  engineBuild = JSON.parse(readFileSync(path.join(engineRepo, ".runtime", "browser-build.json"), "utf8"));
} catch {}
// Recomputed here, not read on trust: the dist digest the build record claims
// for the engine worktree's own dist/ (ranks91-100's lane did this and compared).
const engineRepoRoot = path.resolve(path.dirname(engineManifest), "..", "..", "..");
const engineDistSha256 = treeDigest(path.join(engineRepoRoot, "dist"));

const report = {
  out,
  fixture: fixtureDir,
  act: "ACT-162",
  claim: "a signed-in visit to the sign-in route falls through to a card-creation form",
  matrix: {
    surface: "sign-in route while signed in",
    kind: "crawl-defect",
    status: "fail",
    instrument_family: "none",
    source: "C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json (the ACT-162 action object)",
    design: "C:/localProjects/brandonDojoTech/docs/reports/no-instrument-action-designs-2026-10-19.md, section ACT-162, lines 149-192",
  },
  source: {
    commit: sourceCommit,
    dirty: !!dirtyPorcelain,
    dirtyPorcelain: dirtyPorcelain || "",
    repoDistSha256: treeDigest(path.join(repo, "dist")),
    engineManifest,
    engineBuild,
    // the two digests the ask requires in every receipt, named at the top level
    sourceDiffSha256: engineBuild?.sourceDiffSha256 ?? null,
    distSha256: engineBuild?.distSha256 ?? null,
    engineDistSha256Recomputed: engineDistSha256,
    engineDistMatchesBuildRecord: engineBuild?.distSha256 != null && engineBuild.distSha256 === engineDistSha256,
    engineIsPureTip: engineBuild?.sourceDiffSha256 === EMPTY_SHA256,
    fixtureSha256: treeDigest(fixtureDir),
  },
  instrument: {
    // the design's own words (lines 162-168): a VISIBLE create-name prompt, not
    // a bare form.card-form substring, because signed-in page chrome (the
    // navbox slot) also carries card-form nodes (batch5:292-296).
    discriminator: "form.card-form input[name='card[name]'] filtered to visible",
    signinForm: "form[action='/update/*signin']",
    strongerDiscriminatorRecordedNotGraded: "form[action='/card/create'] presence and card[name] count at ANY visibility",
    why: "recorded because the graded leg's create-prompt clause turned out to be blind to the fall-through shape the fail names; the stronger check is the one that can decide the named defect, but it is NOT what the design specifies, so it is reported beside the graded leg rather than substituted into it",
  },
  legs: [],
  failures: 0,
};

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[act-162] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** The mods' public dir (TinyMCE theme, ace modes) is a gitignored Ruby-setup
 *  artifact, not engine code (ts-server.mjs:76 throws without it). A disposable
 *  pure-tip build worktree lacks it, so it gets a wrapper manifest that boots
 *  THAT checkout's server with DECKO_MOD_PUBLIC_DIR pointed at a checkout that
 *  has it. The engine dist stays the target checkout's own build (batch6's
 *  shape, probe-pageonly-batch6-owner-rows-*.mjs:139-165). */
function resolveEngineManifest(manifestIn) {
  const engineRepo = path.resolve(path.dirname(manifestIn), "..", "..", "..");
  const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
  if (existsSync(path.join(modDir(engineRepo), "mod"))) return manifestIn;
  if (!existsSync(path.join(modDir(repo), "mod"))) return manifestIn;
  const manifest = JSON.parse(readFileSync(manifestIn, "utf8"));
  const wrapperPath = path.join(out, "engine-with-mod-dir.json");
  writeFileSync(wrapperPath, JSON.stringify({
    ...manifest,
    description: manifest.description + " (ACT-162 wrapper: boots this checkout's server with DECKO_MOD_PUBLIC_DIR from a checkout that has the gitignored mod-public artifact — the disposable pure-tip worktree lacks it)",
    command: ["node", path.join(path.dirname(manifestIn), "ts-server.mjs")],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest(engineManifest));
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
console.log(`[act-162] engine ${engine.name} on ${O} (boot ${server.bootMs}ms) probe commit ${sourceCommit.slice(0, 8)} engine commit ${(engineBuild?.sourceCommit ?? "?").slice(0, 8)}`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("ACT-162 probe requires the loopback engine");

/** Every fact the three legs and the two controls read, taken in ONE DOM
 *  evaluation so no leg can be right about a page a later leg re-read. */
const readFacts = async () => page.evaluate(() => {
  const vis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = window.getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
  };
  const nameInputs = [...document.querySelectorAll("form.card-form input[name='card[name]']")];
  const signinForms = [...document.querySelectorAll("form[action='/update/*signin']")];
  const createForms = [...document.querySelectorAll("form[action='/card/create']")];
  const email = document.querySelector("input[name='card[subcards][+*email][content]']");
  const password = document.querySelector("input[name='card[subcards][+*password][content]']");
  const describe = (f) => ({
    action: f.getAttribute("action"),
    id: f.id || null,
    className: f.className,
    visible: vis(f),
    nameInputs: [...f.querySelectorAll("input[name='card[name]']")].map((i) => ({
      type: i.type ?? null, value: i.value, visible: vis(i), display: window.getComputedStyle(i).display,
    })),
    submits: [...f.querySelectorAll("button[type=submit], input[type=submit]")].map((b) => (b.textContent || b.value || "").trim()).filter(Boolean),
    text: (f.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
  });
  return {
    path: decodeURIComponent(location.pathname) + location.search,
    title: document.title,
    // the session markers the design names (design:189-190, batch5:143)
    signoutLink: (document.querySelectorAll("a.signout-link").length) > 0,
    signedInMarker: /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/.test(document.documentElement.innerHTML),
    // the design's discriminator, verbatim
    visibleCreateNamePrompts: nameInputs.filter(vis).length,
    allCreateNamePrompts: nameInputs.length,
    // what the sign-in form is doing on this page
    signinForms: signinForms.length,
    visibleSigninForms: signinForms.filter(vis).length,
    signinFormVisible: signinForms.length > 0 && vis(signinForms[0]),
    emailPresent: !!email, emailVisible: vis(email),
    passwordPresent: !!password, passwordVisible: vis(password),
    // the stronger discriminator, recorded not graded (see `instrument`)
    createForms: createForms.length,
    visibleCreateForms: createForms.filter(vis).length,
    createFormDetail: createForms.map(describe),
    visibleCardForms: [...document.querySelectorAll("form.card-form")].filter(vis).map((f) => f.getAttribute("action")),
    mainText: (document.querySelector("#main")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400),
  };
}).catch((e) => ({ error: String(e?.message ?? e) }));

/** A visit: the HTTP answer plus the page's facts and its HTML, kept. */
const visit = async (tag, p) => {
  await page.waitForLoadState("load", { timeout: T }).catch(() => {});
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch((e) => ({ error: String(e?.message ?? e) }));
  await page.waitForTimeout(500);
  const status = r && !r.error ? r.status() : null;
  const html = await page.content().catch(() => "");
  writeFileSync(path.join(out, `${tag}.html`), html);
  const facts = await readFacts();
  writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(facts, null, 2));
  return { tag, requested: p, status, error: r?.error ?? null, htmlBytes: html.length, facts };
};

const signIn = async (who) => {
  const a = spec.actors[who];
  await ctx.clearCookies();
  await page.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(800);
  return {
    actor: who,
    landed: page.url(),
    signoutLink: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    signedInMarker: /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/.test(await page.content().catch(() => "")),
  };
};

try {
  // ----------------------------------------------- LEG 1: positive control
  // design:181-182 — "step 1 rendered the signin form (the route exists and
  // answers)". Signed out, `/*signin` must serve its real form: 200, a visible
  // form[action='/update/*signin'], with its email and password fields visible.
  const signedOut = await visit("leg-1-signed-out-signin-route", "/*signin");
  grade("ACT-162",
    "positive control: signed out, /*signin serves its real sign-in form",
    signedOut.status === 200 && signedOut.facts.signinForms > 0 && signedOut.facts.signinFormVisible === true
      && signedOut.facts.emailVisible === true && signedOut.facts.passwordVisible === true,
    { status: signedOut.status, signinForms: signedOut.facts.signinForms, signinFormVisible: signedOut.facts.signinFormVisible, emailVisible: signedOut.facts.emailVisible, passwordVisible: signedOut.facts.passwordVisible, mainText: signedOut.facts.mainText });

  // ----------------------------------------------- the drive: sign in admin
  const admin = await signIn("admin");
  grade("ACT-162",
    "the drive holds: the fixture administrator signs in before the graded visit",
    admin.signoutLink === true && admin.signedInMarker === true,
    { actor: admin.actor, landed: admin.landed, signoutLink: admin.signoutLink, signedInMarker: admin.signedInMarker });

  // ---------------------------------------------------------------- CONTROL-A
  // The chosen discriminator must be able to see a create prompt at all. A
  // SIGNED-IN `/new/RichText` renders the create form with a VISIBLE card[name]
  // text input — signed out it answers 403 and there is no form to see, so this
  // leg runs after the sign-in above, not before it. If this leg is RED,
  // "zero prompts" in the graded leg means nothing.
  const newForm = await visit("control-a-signed-in-new-richtext-create-form", "/new/RichText");
  grade("ACT-162-CONTROL-A",
    "the chosen create-prompt discriminator FIRES on a page that renders the create form (signed-in /new/RichText)",
    newForm.status === 200 && newForm.facts.createForms > 0 && newForm.facts.visibleCreateNamePrompts > 0,
    { status: newForm.status, createForms: newForm.facts.createForms, visibleCreateNamePrompts: newForm.facts.visibleCreateNamePrompts, nameInputs: newForm.facts.createFormDetail?.map((f) => f.nameInputs) ?? null });

  // ---------------------------------------------------------------- CONTROL-B
  // The same discriminator against the FALL-THROUGH SHAPE the ACT-162 fail
  // names: a signed-in visit to a name that is not a card renders the create
  // path (signed out the same visit is a 404 with no form). This is what
  // `*signin` would have rendered had the leak been live, so it is the control
  // that decides whether the graded leg's create-prompt clause can see the
  // defect at all.
  const unknown = await visit("control-b-signed-in-unknown-card-fallthrough", `/${UNKNOWN_CARD.replaceAll(" ", "_")}`);
  grade("ACT-162-CONTROL-B",
    "the chosen create-prompt discriminator FIRES on the unknown-card create fall-through the ACT-162 fail shape names (signed-in /No_Such_Card_ACT162)",
    unknown.status === 200 && unknown.facts.createForms > 0 && unknown.facts.visibleCreateNamePrompts > 0,
    { status: unknown.status, createForms: unknown.facts.createForms, visibleCreateForms: unknown.facts.visibleCreateForms, visibleCreateNamePrompts: unknown.facts.visibleCreateNamePrompts, allCreateNamePrompts: unknown.facts.allCreateNamePrompts, nameInputs: unknown.facts.createFormDetail?.map((f) => f.nameInputs) ?? null });

  // ----------------------------------------------- LEG 2: the graded leg
  // design:183-188 — the signed-in visit to /*signin renders NO card-creation
  // form: zero VISIBLE form.card-form input[name='card[name]'] prompts, AND no
  // form[action='/update/*signin'] either. A redirect home, an "already signed
  // in" notice or the account card all satisfy; the defect is specifically the
  // create-form fall-through.
  const signedIn = await visit("leg-2-signed-in-signin-route", "/*signin");
  const namedDefect = {
    // the fail's own words, decided by the discriminator that can see it
    createFormPresent: signedIn.facts.createForms > 0,
    anyCreateNamePrompt: signedIn.facts.allCreateNamePrompts > 0,
    fallsThroughToCreateForm: signedIn.facts.createForms > 0 || signedIn.facts.allCreateNamePrompts > 0,
  };
  grade("ACT-162",
    "graded leg: a signed-in visit to /*signin renders no card-creation form and no sign-in form",
    signedIn.facts.visibleCreateNamePrompts === 0 && signedIn.facts.signinForms === 0,
    {
      status: signedIn.status,
      landedPath: signedIn.facts.path,
      title: signedIn.facts.title,
      // clause 1, the design's discriminator
      visibleCreateNamePrompts: signedIn.facts.visibleCreateNamePrompts,
      // clause 2, the design's second clause
      signinForms: signedIn.facts.signinForms,
      visibleSigninForms: signedIn.facts.visibleSigninForms,
      emailVisible: signedIn.facts.emailVisible,
      passwordVisible: signedIn.facts.passwordVisible,
      // the stronger discriminator, recorded not graded
      createForms: signedIn.facts.createForms,
      allCreateNamePrompts: signedIn.facts.allCreateNamePrompts,
      visibleCardForms: signedIn.facts.visibleCardForms,
      namedDefect,
      mainText: signedIn.facts.mainText,
    });

  // ----------------------------------------------- LEG 3: session control
  // design:189-190 — "the signed-in marker still present". After the signed-in
  // /*signin visit the session must be intact: the chrome carries the sign-out
  // link and the signed-in marker, and a following ordinary page is still the
  // signed-in page (not bounced to a signed-out one).
  const home = await visit("leg-3-home-after-signed-in-signin-visit", "/");
  grade("ACT-162",
    "session control: the signed-in session survives the signed-in /*signin visit",
    signedIn.facts.signoutLink === true && signedIn.facts.signedInMarker === true
      && home.status === 200 && home.facts.signoutLink === true && home.facts.signedInMarker === true,
    { onSigninRoute: { signoutLink: signedIn.facts.signoutLink, signedInMarker: signedIn.facts.signedInMarker }, home: { status: home.status, signoutLink: home.facts.signoutLink, signedInMarker: home.facts.signedInMarker } });

  // -------------------------------------------------- the named defect, stated
  report.act162 = {
    claim: report.claim,
    signedOutLanding: { status: signedOut.status, signinForms: signedOut.facts.signinForms, title: signedOut.facts.title },
    signedInLanding: { status: signedIn.status, path: signedIn.facts.path, title: signedIn.facts.title, mainText: signedIn.facts.mainText },
    namedDefectReproduced: signedIn.facts.createForms > 0 || signedIn.facts.allCreateNamePrompts > 0,
    namedDefectEvidence: {
      signedInRouteHasCreateForm: signedIn.facts.createForms,
      signedInRouteCardNameInputsAnyVisibility: signedIn.facts.allCreateNamePrompts,
      unknownCardFallbackCreateForms: unknown.facts.createForms,
      unknownCardFallbackCardNameInputsAnyVisibility: unknown.facts.allCreateNamePrompts,
      unknownCardFallbackNameInputTypes: unknown.facts.createFormDetail?.flatMap((f) => f.nameInputs.map((i) => ({ type: i.type, display: i.display, value: i.value }))) ?? null,
    },
    instrumentBlindSpot: unknown.facts.createForms > 0 && unknown.facts.visibleCreateNamePrompts === 0
      ? "the design's discriminator (a VISIBLE form.card-form input[name='card[name]']) reads ZERO on the unknown-card create fall-through, because that fall-through carries card[name] as a hidden input pre-filled with the requested name. The clause can therefore not go false-positive on chrome, but it also cannot see the fall-through the ACT-162 fail names. CONTROL-B above is that measurement, graded."
      : null,
    secondaryClauseHeld: signedIn.facts.signinForms === 0,
    conclusion: signedIn.facts.createForms > 0 || signedIn.facts.allCreateNamePrompts > 0
      ? "REPRODUCED: the signed-in visit to /*signin rendered the create path"
      : "NOT REPRODUCED on this engine at this commit: the signed-in visit to /*signin rendered no form[action='/card/create'] and no card[name] input at ANY visibility. What it DID render, while signed in, was the sign-in form itself — the design's second clause fails for that reason, which is not the fall-through ACT-162 names.",
  };
} catch (err) {
  report.failures += 1;
  console.error(`[act-162] FATAL ${err?.stack ?? err}`);
  report.legs.push({ act: "FATAL", name: "probe aborted before ACT-162 finished", ok: false, detail: { fatal: String(err?.stack ?? err).slice(0, 600) } });
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});

writeFileSync(path.join(out, "probe-act-162-result.json"), JSON.stringify(report, null, 2));
console.log(`[act-162] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-act-162-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);