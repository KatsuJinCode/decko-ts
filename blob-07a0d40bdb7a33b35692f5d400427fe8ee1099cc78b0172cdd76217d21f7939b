#!/usr/bin/env node
// probe-exact-control-regrade-f3.mjs
//
// Closes adversarial finding F3 empirically: run-exhaustive.mjs's OLD locate
// ladder returned a substring fallback (page.getByText(hint, {exact:false}))
// whenever no interactive control matched a text hint, and graded that hit
// like a found affordance — a page with zero interactive controls passed an
// 'Edit' hint on the strength of its prose. The runner now records WHICH
// strategy hit ("exact-control" | "text-locate" | "substring-fallback") on
// every locate and grades affirmative findings ONLY from exact-control
// matches. This probe re-grades the actions the 2026-10-18T11:59Z exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade, commit 776349b2) passed
// through text-hint locate evidence alone — the only actions the rule change
// can move:
//
//   ACT-014  "Save" on /Date_1?view=edit                        (admin)
//   ACT-044  "Account" on /                                     (admin)
//   ACT-045  "Account" on /                                     (admin)
//   ACT-061  "Delete" on /Date_1?view=edit                      (member)
//   ACT-062  "Delete" on /Date_1?view=edit                      (member)
//   ACT-077  "Account" on / + declared additional pages          (admin)
//   ACT-107  "Sign in" on /*signin                               (anonymous)
//   ACT-108  "Sign in"/"Reset password"/"Sign up" on /*signin    (anonymous)
//   ACT-122  "Type" on /                                         (admin)
//   ACT-162  "Sign in" on /*signin while signed in               (admin)
//
// Every other passing action of that run carried its pass through a
// per-class assert or a css/field locate — control selectors by construction
// — so the rule change cannot move them; the 101 page-only, 23 fail and
// 3 out_of_scope rows are untouched by definition.
//
// WHY A PROBE, NOT A FULL RUNNER RE-RUN: the runner refuses a dirty tree
// (fail-closed provenance gate) and sibling lanes' uncommitted writes stand
// in the tree. This probe records its own provenance instead: the engine
// build it booted (dist sha256), the fixture (byte-identical to the 11:59Z
// run), the matrix sha256, and the sha256 of the runner source it copied its
// ladder from. The ladder, hint decoder, sign-in, settle and surface entries
// below are copied VERBATIM from this commit's run-exhaustive.mjs (the
// runner cannot be imported; it parses argv and boots at module top level).
// A reviewer diffs them against run-exhaustive.mjs in the same commit.
//
// Two deltas vs the 11:59Z prior run are inherent to re-grading with the
// CURRENT instrument and are stated in the receipt rather than hidden:
// (1) the prior run predates the additional-pages loop and the per-action
// session identity, so a candidate can now also be found on a declared
// additional page or with the correct actor signed in — an exact-control hit
// there legitimately keeps the pass; (2) the engine dist has moved since
// 776349b2 (both shas are recorded).
//
//   node reference-harness/browser/probe-exact-control-regrade-f3.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] \
//     [--prior-run .runtime/exhaustive/2026-10-18-regrade] \
//     [--out .runtime/exhaustive/probe-exact-control-regrade-f3]
//
// The engine stages a private copy of the fixture deck (lib/engines.mjs), so
// nothing the probe does writes to any real deck. Exits non-zero on a rule
// violation (a witness-only hit graded pass), a candidate that located
// nothing, or infrastructure error. Expected and honest outcome: some
// candidates DROP from pass to fail — that is the finding's predicted shape,
// not a probe failure.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { richEditorsReady } from "./lib/editor-ready.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const priorRunDir = path.resolve(args["prior-run"] ?? path.join(repo, ".runtime", "exhaustive", "2026-10-18-regrade"));
const out = path.resolve(args.out ?? path.join(repo, ".runtime", "exhaustive", "probe-exact-control-regrade-f3"));
const STEP_TIMEOUT = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);
const editorSettle = process.env.HARNESS_EDITOR_SETTLE ?? "1";

const runnerPath = path.join(here, "run-exhaustive.mjs");
const runnerSha256 = createHash("sha256").update(readFileSync(runnerPath)).digest("hex");
// The probe is only evidence for the FIXED runner if the runner still carries
// the fixed ladder and grading; pin the markers this copy was made from.
const runnerSource = readFileSync(runnerPath, "utf8");
for (const marker of [
  'STRATEGY_EXACT_CONTROL = "exact-control"',
  "passCarrying: hit.strategy === STRATEGY_EXACT_CONTROL && count > 0",
  'else if (exactFound || anyAsserted) probeOutcome = "pass";',
]) {
  if (!runnerSource.includes(marker)) {
    console.error(`[f3-regrade] run-exhaustive.mjs no longer carries the fixed-ladder marker ${JSON.stringify(marker)} — this copy is stale, refusing to re-grade`);
    process.exit(2);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

mkdirSync(path.join(out, "actions"), { recursive: true });

// ============================================================================
// VERBATIM COPY: run-exhaustive.mjs (this commit, sha256 above) — ladder,
// strategy constants, hint decoder, settle, sign-in, and the surface entries
// the ten candidates sit on. Do not edit here without the same edit there.
// ============================================================================
const STRATEGY_EXACT_CONTROL = "exact-control";
const STRATEGY_TEXT_LOCATE = "text-locate";
const STRATEGY_SUBSTRING_FALLBACK = "substring-fallback";

async function locateByHint(page, hint) {
  switch (hint.kind) {
    case "text": {
      const v = hint.value;
      const exactRe = new RegExp(`^\\s*${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
      const exactControlLoc = page.locator("a, button, input[type=submit], input[type=button], a.btn").filter({ hasText: exactRe, visible: true });
      const wholeTextLoc = page.getByText(v, { exact: true });
      const substringLoc = page.getByText(v, { exact: false });
      const tiers = {
        [STRATEGY_EXACT_CONTROL]: await exactControlLoc.count().catch(() => 0),
        [STRATEGY_TEXT_LOCATE]: await wholeTextLoc.count().catch(() => 0),
        [STRATEGY_SUBSTRING_FALLBACK]: await substringLoc.count().catch(() => 0),
      };
      const strategy =
        tiers[STRATEGY_EXACT_CONTROL] > 0 ? STRATEGY_EXACT_CONTROL : tiers[STRATEGY_TEXT_LOCATE] > 0 ? STRATEGY_TEXT_LOCATE : STRATEGY_SUBSTRING_FALLBACK;
      const locator = strategy === STRATEGY_EXACT_CONTROL ? exactControlLoc.first() : strategy === STRATEGY_TEXT_LOCATE ? wholeTextLoc.first() : substringLoc.first();
      return { locator, strategy, tiers };
    }
    case "css":
      return { locator: page.locator(hint.value).first(), strategy: STRATEGY_EXACT_CONTROL };
    case "field": {
      const safeKey = hint.value.toLowerCase().replace(/\s+/g, "_").replace(/\*/g, "X");
      return {
        locator: page.locator(`.RIGHT-${safeKey} input.d0-card-content, .RIGHT-${safeKey} textarea.d0-card-content`).first(),
        strategy: STRATEGY_EXACT_CONTROL,
      };
    }
    default:
      return null;
  }
}

function affordanceHints(text) {
  const hints = [];
  const quoted = String(text ?? "").match(/"([^"]{2,40})"|(?<![A-Za-z0-9])'([^']{2,40})'(?![A-Za-z0-9])/g);
  if (quoted) for (const m of quoted) {
    const v = m.replace(/^['"]|['"]$/g, "");
    if (v.length >= 2 && !/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(v)) hints.push({ kind: "text", value: v });
  }
  const fields = String(text ?? "").match(/(?<!\/)\*(\w+)/g);
  if (fields) for (const m of fields) hints.push({ kind: "field", value: m });
  if (/\bsign[- ]?in\b/i.test(text)) hints.push({ kind: "text", value: "Sign in" });
  if (/\bsign[- ]?out\b/i.test(text)) hints.push({ kind: "text", value: "Sign out" });
  if (/\bsave\b/i.test(text)) hints.push({ kind: "text", value: "Save" });
  if (/\bsave and close\b/i.test(text)) hints.push({ kind: "text", value: "Save and close" });
  if (/\bsave as current\b/i.test(text)) hints.push({ kind: "text", value: "Save as current" });
  if (/\bdelete\b/i.test(text)) hints.push({ kind: "text", value: "Delete" });
  if (/\bedit\b/i.test(text)) hints.push({ kind: "text", value: "Edit" });
  if (/\bcancel\b/i.test(text)) hints.push({ kind: "text", value: "Cancel" });
  if (/\bclose\b/i.test(text)) hints.push({ kind: "text", value: "Close" });
  if (/\bfollow\b/i.test(text) && !/\bfollow\s+(?:the\s+)?(?:mailed|reset|password)\s+link\b/i.test(text)) hints.push({ kind: "text", value: "Follow" });
  if (/\bunfollow\b/i.test(text)) hints.push({ kind: "text", value: "Unfollow" });
  if (/\breset password\b/i.test(text)) hints.push({ kind: "text", value: "Reset password" });
  if (/\bpassword reset\b/i.test(text) && !/\breset password\b/i.test(text)) hints.push({ kind: "text", value: "Reset password" });
  if (/\bsign up\b/i.test(text)) hints.push({ kind: "text", value: "Sign up" });
  if (/\bcut\b/i.test(text)) hints.push({ kind: "text", value: "Cut" });
  if (/\bcopy\b/i.test(text)) hints.push({ kind: "text", value: "Copy" });
  if (/\bpaste\b/i.test(text)) hints.push({ kind: "text", value: "Paste" });
  if (/\bupload\b/i.test(text)) hints.push({ kind: "css", value: "input[type=file]" });
  if (/\bsearch keyword\b|\bkeyword search\b|\bnavbox\b|\bquick search\b/i.test(text)) hints.push({ kind: "css", value: ".search-box-form input[name*='query']" });
  if (/\baccount tab\b/i.test(text)) hints.push({ kind: "text", value: "Account" });
  if (/\bguide tab\b/i.test(text)) hints.push({ kind: "text", value: "Guide" });
  if (/\bengage tab\b/i.test(text)) hints.push({ kind: "text", value: "Engage" });
  if (/\bhistory tab\b/i.test(text)) hints.push({ kind: "text", value: "History" });
  if (/\brules tab\b/i.test(text)) hints.push({ kind: "text", value: "Rules" });
  return hints;
}

async function settle(page) {
  await page.waitForLoadState("load", { timeout: STEP_TIMEOUT }).catch(() => {});
  const deadline = Date.now() + STEP_TIMEOUT;
  let quiet = 0;
  while (Date.now() < deadline) {
    const busy = await page
      .evaluate(() => (typeof window.jQuery === "function" ? window.jQuery.active : 0) + (document.readyState === "complete" ? 0 : 1))
      .catch(() => 1);
    quiet = busy === 0 ? quiet + 1 : 0;
    if (quiet >= 3) {
      if (editorSettle === "1") {
        await page.waitForFunction(richEditorsReady, null, { timeout: STEP_TIMEOUT }).catch(() => {});
      }
      await page
        .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: STEP_TIMEOUT })
        .catch(() => {});
      return;
    }
    await page.waitForTimeout(100);
  }
}

async function signIn(page, base, actor) {
  await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(actor.email, { timeout: STEP_TIMEOUT });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(actor.password, { timeout: STEP_TIMEOUT });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: STEP_TIMEOUT });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: STEP_TIMEOUT }).catch(() => {});
  const outLink = page.locator("a.signout-link").first();
  await outLink.waitFor({ state: "attached", timeout: STEP_TIMEOUT });
}

// The seven SURFACES entries the ten candidates sit on, verbatim from this
// commit's run-exhaustive.mjs table (signinActor is the runner default
// "admin"; the full table names many more surfaces than this probe drives).
const SURFACES = {
  "3. edit a Date card": { signin: "form", card: "/Date_1?view=edit", actor: "admin" },
  "7b. further signed-in capabilities (Decko's own browser tests as the checklist)": { signin: "form", card: "/", actor: "admin", additionalPages: ["/*signin", "/Home+board"] },
  "8. ordinary (non-admin) account permissions": { signin: "form", card: "/Date_1?view=edit", actor: "member" },
  "cover-b. edit: board name change, account tab, history tab (E17, E19, E21)": { signin: "form", card: "/", actor: "admin", additionalPages: ["/Home+name_form", "/Home+board"] },
  "cover-b. session: sign-in refusals and the signed-out links (S2, S4)": { signin: "none", card: "/*signin", actor: "admin" },
  "owner audit required checks": { signin: "form", card: "/", actor: "admin" },
  "sign-in route while signed in": { signin: "form", card: "/*signin", actor: "admin" },
};

const CANDIDATES = ["ACT-014", "ACT-044", "ACT-045", "ACT-061", "ACT-062", "ACT-077", "ACT-107", "ACT-108", "ACT-122", "ACT-162"];

async function runHintLocates(page, hints, sequence) {
  for (const hint of hints) {
    try {
      const hit = await locateByHint(page, hint);
      if (!hit) {
        sequence.push({ interaction: "locate", hint, found: false, strategy: null, passCarrying: false });
        continue;
      }
      const count = await hit.locator.count().catch(() => 0);
      sequence.push({
        interaction: "locate",
        hint,
        found: count > 0,
        count,
        strategy: hit.strategy,
        passCarrying: hit.strategy === STRATEGY_EXACT_CONTROL && count > 0,
        ...(hit.tiers ? { tiers: hit.tiers } : {}),
      });
    } catch (err) {
      sequence.push({ interaction: "locate", hint, error: String(err?.message ?? err) });
    }
  }
}

// ---------------------------------------------------------------------------
// Step 0: the discrimination proof, on synthetic pages — the F3 premise (a
// zero-interactive-control page whose prose matches the hint) and its two
// neighbors, graded by the fixed rule.
// ---------------------------------------------------------------------------
async function discriminationProof(page) {
  const legs = [];
  const probeLeg = async (name, html, expectedStrategy) => {
    await page.setContent(html);
    const sequence = [];
    await runHintLocates(page, [{ kind: "text", value: "Edit" }], sequence);
    const loc = sequence[0] ?? {};
    const expectedPass = expectedStrategy === STRATEGY_EXACT_CONTROL;
    const ok = loc.strategy === expectedStrategy && loc.passCarrying === expectedPass;
    legs.push({ name, expect: { strategy: expectedStrategy, passCarrying: expectedPass }, got: { strategy: loc.strategy, passCarrying: loc.passCarrying, tiers: loc.tiers ?? null }, ok });
    console.log(`[f3-regrade] proof ${name}: ${ok ? "OK" : "MISMATCH"} strategy=${loc.strategy} passCarrying=${loc.passCarrying} tiers=${JSON.stringify(loc.tiers ?? null)}`);
    return ok;
  };
  let allOk = true;
  // The finding's own case: zero interactive controls, prose says "Edit".
  allOk = (await probeLeg("zero-control prose page", "<html><body><p>You can Edit this page whenever you like.</p></body></html>", STRATEGY_SUBSTRING_FALLBACK)) && allOk;
  // Whole-text non-control: witness tier, still not pass-carrying.
  allOk = (await probeLeg("non-control whole-text element", "<html><body><div>Edit</div><p>nothing else here</p></body></html>", STRATEGY_TEXT_LOCATE)) && allOk;
  // A real control with the exact label: the only pass-carrying tier.
  allOk = (await probeLeg("exact control button", "<html><body><button>Edit</button></body></html>", STRATEGY_EXACT_CONTROL)) && allOk;
  return { allOk, legs };
}

// ---------------------------------------------------------------------------
async function run() {
  const startedAt = new Date().toISOString();
  const priorProvenance = JSON.parse(readFileSync(path.join(priorRunDir, "provenance.json"), "utf8"));
  const matrixPath = path.isAbsolute(priorProvenance.matrixSource) ? path.resolve(priorProvenance.matrixSource) : path.resolve(repo, priorProvenance.matrixSource);
  const matrixBytes = readFileSync(matrixPath);
  const matrixSha256 = sha256(matrixBytes);
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const spec = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
  const actors = spec.actors ?? {};
  const distSha256 = treeDigest(path.join(repo, "dist"));
  const fixtureSha256 = treeDigest(fixtureDir);
  const engine = loadEngine(engineManifest);
  const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
  const base = server.base;
  console.log(`[f3-regrade] engine ${engine.name} on ${base} (boot ${server.bootMs}ms)`);

  const browserHandle = await launchBrowser();
  const ctx = browserHandle.context;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(STEP_TIMEOUT);

  const rows = [];
  const proofLegs = [];
  let failures = 0;
  try {
    const proof = await discriminationProof(page);
    proofLegs.push(...proof.legs);
    if (!proof.allOk) failures += 1;

    // Per-action session identity, exactly as run() does it (matrix order).
    let activeActor = null;
    for (const id of CANDIDATES) {
      const action = matrix.actions.find((a) => a.id === id);
      if (!action) {
        rows.push({ id, error: "missing from current matrix" });
        failures += 1;
        continue;
      }
      const meta = SURFACES[action.surface];
      if (!meta) {
        rows.push({ id, error: `no SURFACES entry copied for "${action.surface}"` });
        failures += 1;
        continue;
      }
      const actorName = meta.actor ?? "admin";
      if (meta.signin === "none") {
        await ctx.clearCookies().catch(() => {});
        activeActor = null;
      } else if (activeActor !== actorName) {
        const actor = actors[actorName] ?? actors.admin ?? actors.anonymous;
        if (actor?.email) {
          try {
            await signIn(page, base, actor);
            activeActor = actorName;
          } catch (err) {
            rows.push({ id, error: `sign-in as ${actorName} failed: ${err?.message ?? err}` });
            failures += 1;
            continue;
          }
        }
      }

      const hints = affordanceHints(action.action ?? "");
      const sequence = [];
      const pages = [meta.card, ...(meta.additionalPages ?? [])];
      for (let i = 0; i < pages.length; i++) {
        await page.goto(base + pages[i], { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
        await settle(page);
        sequence.push({ interaction: "visit", url: pages[i], additional: i > 0 || undefined });
        await runHintLocates(page, hints, sequence);
      }

      const located = sequence.filter((s) => s.interaction === "locate");
      const exactFound = located.some((l) => l.found && l.strategy === STRATEGY_EXACT_CONTROL);
      const witnessFound = located.some((l) => l.found && l.strategy !== STRATEGY_EXACT_CONTROL);
      // The fixed rule, applied to this probe's own evidence.
      const newOutcome = exactFound ? "pass" : located.length > 0 ? "fail" : "page-only";
      // Rule guard: a pass without an exact-control hit is a probe bug, and a
      // candidate that located nothing measured nothing.
      if (newOutcome === "pass" && !exactFound) failures += 1;
      if (located.length === 0) failures += 1;

      const priorPath = path.join(priorRunDir, "actions", `${id}.json`);
      const prior = existsSync(priorPath) ? JSON.parse(readFileSync(priorPath, "utf8")) : null;
      const row = {
        id,
        action: action.action,
        surface: action.surface,
        actor: meta.signin === "none" ? "(anonymous — cookies cleared)" : actorName,
        pages,
        hints,
        prior_outcome: prior?.outcome ?? null,
        prior_anyFound: prior?.anyFound ?? null,
        new_outcome: newOutcome,
        exactFound,
        witnessFound,
        moved: prior ? prior.outcome !== newOutcome : null,
        located,
      };
      rows.push(row);
      writeFileSync(path.join(out, "actions", `${id}.json`), JSON.stringify(row, null, 2));
      console.log(`[f3-regrade] ${id} prior=${row.prior_outcome} new=${newOutcome} exactFound=${exactFound} witnessFound=${witnessFound} hints=${hints.map((h) => h.value).join("/")}`);
    }
  } finally {
    await browserHandle.close().catch(() => {});
    await server.stop().catch(() => {});
  }

  const receipt = {
    what: "F3 exact-control re-grade: which of the 11:59Z text-located passes survive the fixed grading rule",
    startedAt,
    finishedAt: new Date().toISOString(),
    runnerSource: { path: "reference-harness/browser/run-exhaustive.mjs", sha256: runnerSha256 },
    engine: { manifest: path.relative(repo, engineManifest), name: engine.name, distSha256 },
    fixtureDir: path.relative(repo, fixtureDir),
    fixtureSha256,
    matrixSource: path.relative(repo, matrixPath),
    matrixSha256,
    priorRun: {
      dir: path.relative(repo, priorRunDir),
      commit: priorProvenance.source.commit,
      distSha256: priorProvenance.artifacts.distSha256,
      fixtureSha256: priorProvenance.fixtureSha256,
      matrixSha256: priorProvenance.matrixSha256,
    },
    deltasVsPriorRun: {
      engineDistChanged: distSha256 !== priorProvenance.artifacts.distSha256,
      matrixChanged: matrixSha256 !== priorProvenance.matrixSha256,
      note: "the prior run predates the additional-pages loop and per-action session identity; this probe runs the current instrument behaviors",
    },
    discriminationProof: proofLegs,
    rows,
    failures,
  };
  writeFileSync(path.join(out, "regrade-f3.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(path.join(out, "regrade-f3.md"), renderMarkdown(receipt));
  console.log(`[f3-regrade] DONE out=${path.relative(repo, out)} failures=${failures}`);
  process.exitCode = failures > 0 ? 1 : 0;
}

function renderMarkdown(receipt) {
  const lines = [];
  lines.push("# F3 exact-control re-grade");
  lines.push("");
  lines.push(`- Runner source: \`reference-harness/browser/run-exhaustive.mjs\` (sha256 \`${receipt.runnerSource.sha256.slice(0, 12)}\`)`);
  lines.push(`- Engine: \`${receipt.engine.name}\`, dist sha256 \`${receipt.engine.distSha256?.slice(0, 12)}\` (${receipt.deltasVsPriorRun.engineDistChanged ? "DIFFERS from" : "same as"} prior run)`);
  lines.push(`- Prior run: \`${receipt.priorRun.dir}\` at commit \`${receipt.priorRun.commit.slice(0, 10)}\`, dist sha256 \`${receipt.priorRun.distSha256?.slice(0, 12)}\``);
  lines.push(`- Fixture sha256: \`${receipt.fixtureSha256?.slice(0, 12)}\` (prior run: \`${receipt.priorRun.fixtureSha256?.slice(0, 12)}\`)`);
  lines.push(`- Discrimination proof: ${receipt.discriminationProof.every((l) => l.ok) ? "all legs OK" : "MISMATCH"}`);
  lines.push("");
  lines.push("| action | actor | prior | new | exact | witness | hint strategies |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of receipt.rows) {
    if (r.error) {
      lines.push(`| ${r.id} | | | ERROR | | | ${r.error} |`);
      continue;
    }
    const strategies = (r.located ?? []).map((l) => `${l.hint?.value ?? "?"}: ${l.strategy}${l.passCarrying ? "*" : ""}`).join(", ");
    lines.push(`| ${r.id} | ${r.actor} | ${r.prior_outcome} | **${r.new_outcome}** | ${r.exactFound ? "yes" : "no"} | ${r.witnessFound ? "yes" : "no"} | ${strategies} |`);
  }
  lines.push("");
  lines.push("`hint strategies`: per hint, the deepest tier that hit; `*` marks the pass-carrying exact-control tier.");
  lines.push("");
  lines.push(`Failures (rule violations, measurement gaps, infrastructure): ${receipt.failures}`);
  return lines.join("\n") + "\n";
}

run().catch((err) => {
  console.error(`[f3-regrade] FATAL ${err?.stack ?? err}`);
  process.exit(1);
});
