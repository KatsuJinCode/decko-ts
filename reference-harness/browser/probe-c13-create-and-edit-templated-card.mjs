#!/usr/bin/env node
// probe-c13-create-and-edit-templated-card.mjs
//
// C13 — "Create and edit a templated card" (registry row
// tools/edge-signed-in-exercise/capabilities.json, id C13, group create). The
// one not-covered capability in the 2026-10-19 design registry that is a
// GENUINE probe gap: no id-prefixed check had ever run for it, and unlike its
// neighbours (S5, C10, C12, E10, ...) it is not a registry-binding gap over a
// check that already passes.
//
// The design implemented here is
// brandonDojoTech/docs/reports/capability-gap-probe-designs-2026-10-19.md,
// section C13 (lines 166-188), driven AS WRITTEN:
//
//   "as admin, seed a Cardtype carrying a *self+*structure rule that adds a
//    templated subcard, GET /new/<Cardtype>, assert the template's default
//    content is pre-filled in the subcard editor (this is the seam C14 also
//    touches), submit, land on the new card, then open /<card>?view=edit,
//    change the subcard's content, Save and Close, and assert both the stored
//    junction row and a fresh GET show the new text. The templated-card shape
//    is a Cardtype with a *default rule; the create-form assertion primitives
//    are the same ones lib/typed-fixture.mjs uses to verify that the form
//    assigned the right card[type_id]."
//
// The source journey the capability names (create-structured-topic-member in
// journeys/synthetic-v1.json) declares covers ["structure.feature: Create and
// edit templated card", "nest editing"], so the capability is a COMPOUND of
// templated-create and nested-edit. Both halves are graded; the check name
// credits both.
//
// MEASURED BEFORE ANY ASSERTION WAS WRITTEN (recon, this lane, ts engine over
// synthetic-v1). Three facts the assertions depend on, none of them assumed:
//
//   1. A rule card in this port is junction-shaped: name and key are NULL and
//      the rule is left_id -> a Set junction, right_id -> the setting card
//      (fixture cardtype+*self+*structure, card 32: left 31, right 28
//      (*structure)). Rule rows are therefore read by walking left_id, never by
//      name — a probe that looked up a rule by name would find nothing.
//   2. The nested editor's TYPE comes from the applicable *default rule card's
//      OWN type (src/card/actions/type-resolution.ts:180-300, the dup_structure
//      / default walk; src/card/render.ts:3768 newCardDefaultContent). Seeding
//      the *right+*default rule as Phrase renders a plain phrase field with no
//      template text, so the rule card is seeded RichText and the templated
//      subcard is the rich editor the design asks to be pre-filled.
//   3. On this engine at this commit, `GET /new/<Cardtype>` renders the nested
//      editors of a `<Cardtype>+*type+*structure` rule; the same rule written as
//      `<Cardtype>+*self+*structure` renders NO nested fields (four-way seed
//      sweep: self-only, RichText and Phrase variants all served zero subcard
//      fields; self+type served both). Both rules are seeded here so the
//      design's named shape is present, and which one the form's nests came
//      from is recorded in every receipt rather than assumed.
//
// CONTROLS (the house style the design's registry shares — no graded leg may
// pass vacuously):
//
//   C13-CONTROL-A  the pre-fill discriminator FIRES and is not a constant: the
//                  SAME structure rule adds a second, non-templated right whose
//                  subcard editor must come up EMPTY while the templated one's
//                  carries the marker. Without this, "the subcard editor holds
//                  the template" could be a constant the engine always renders.
//   C13-CONTROL-B  the nested-edit discriminator FIRES: the junction row exists
//                  and holds the template text BEFORE the edit, so "the nested
//                  content changed" cannot pass on a missing row.
//   C13-SESSION    the signed-in session survives the whole drive (sign-out
//                  link and the decko.signed_in marker still present after).
//
// Everything drives on the same engine and fixture the exhaustive runner
// grades: reference-harness/browser/engines/ts.json over
// reference-harness/fixtures/synthetic-v1, staged onto a private copy of the
// fixture deck (lib/engines.mjs), so every write dies with the staging dir.
// Browser via lib/launch.mjs, loopback-guarded, one graded leg per verdict,
// JSON + HTML evidence per leg under --out. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-c13-create-and-edit-templated-card.mjs \
//     [--engine <pure-tip checkout>/reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] \
//     [--out .runtime/exhaustive/probe-C13/run1]

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
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
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-C13/run1");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

// The capability sentence this probe grades. Bound verbatim into
// capabilities.json's C13 row; the string here and there must stay identical
// (the grading rule at lib/local-policy.mjs:48 is exact string equality).
const CHECK_NAME = "C13 a templated card is created from its pre-filled template and its nested subcard is edited in place (Save and Close)";

mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------- provenance
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
const engineRepoRoot = path.resolve(path.dirname(engineManifest), "..", "..", "..");
let engineBuild = null;
try {
  engineBuild = JSON.parse(readFileSync(path.join(engineRepoRoot, ".runtime", "browser-build.json"), "utf8"));
} catch {}
const engineDistSha256 = treeDigest(path.join(engineRepoRoot, "dist"));

const runStamp = Date.now().toString(36);
const CARDTYPE = "HarnessC13Type_" + runStamp;
const RIGHT_TEMPLATED = "HarnessC13Tmpl_" + runStamp;
const RIGHT_PLAIN = "HarnessC13Plain_" + runStamp;
const TEMPLATE_MARKER = "TEMPLATE_MARKER_" + runStamp;
const NESTED_EDIT_TEXT = "NESTED_EDITED_" + runStamp;
const DEFAULT_RULE = RIGHT_TEMPLATED + "+*right+*default";
const SELF_STRUCTURE_RULE = CARDTYPE + "+*self+*structure";
const TYPE_STRUCTURE_RULE = CARDTYPE + "+*type+*structure";
const NEW_CARD = "HarnessC13Card_" + runStamp;
const STRUCTURE_BODY = "{{+" + RIGHT_TEMPLATED + "}}\n{{+" + RIGHT_PLAIN + "}}";
// A second Cardtype carrying ONLY the *self+*structure rule the design names,
// over the same two rights, so the receipts can isolate which rule form feeds
// GET /new/<Cardtype> on this engine (recorded, not graded).
const SELF_ONLY_TYPE = "HarnessC13SelfOnly_" + runStamp;
const SELF_ONLY_RULE = SELF_ONLY_TYPE + "+*self+*structure";

const report = {
  out,
  fixture: fixtureDir,
  capability: "C13 create and edit a templated card",
  checkName: CHECK_NAME,
  design: "C:/localProjects/brandonDojoTech/docs/reports/capability-gap-probe-designs-2026-10-19.md, section C13, lines 166-188",
  sourceJourney: "reference-harness/browser/journeys/synthetic-v1.json, journey create-structured-topic-member (covers: structure.feature: Create and edit templated card, nest editing)",
  source: {
    commit: sourceCommit,
    dirty: !!dirtyPorcelain,
    dirtyPorcelain: dirtyPorcelain || "",
    repoDistSha256: treeDigest(path.join(repo, "dist")),
    engineManifest,
    engineBuild,
    sourceDiffSha256: engineBuild?.sourceDiffSha256 ?? null,
    distSha256: engineBuild?.distSha256 ?? null,
    engineDistSha256Recomputed: engineDistSha256,
    engineDistMatchesBuildRecord: engineBuild?.distSha256 != null && engineBuild.distSha256 === engineDistSha256,
    engineIsPureTip: engineBuild?.sourceDiffSha256 === EMPTY_SHA256,
    fixtureSha256: treeDigest(fixtureDir),
  },
  fixture: {
    cardtype: CARDTYPE,
    templatedRight: RIGHT_TEMPLATED,
    plainRight: RIGHT_PLAIN,
    defaultRule: DEFAULT_RULE,
    selfStructureRule: SELF_STRUCTURE_RULE,
    typeStructureRule: TYPE_STRUCTURE_RULE,
    structureBody: STRUCTURE_BODY,
    templateMarker: TEMPLATE_MARKER,
    nestedEditText: NESTED_EDIT_TEXT,
    newCard: NEW_CARD,
  },
  legs: [],
  failures: 0,
};

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(name, ok, detail) {
  report.legs.push({ capability: "C13", check: CHECK_NAME, leg: name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[c13] ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 800)}`);
}

/** A fact this run measured that no assertion depends on — recorded so the
 *  receipt states it rather than leaving it in the commit message. */
function observe(name, detail) {
  report.legs.push({ capability: "C13", check: CHECK_NAME, leg: name, graded: false, ok: true, detail });
  console.log(`[c13] ${name} (recorded, not graded): ${JSON.stringify(detail).slice(0, 700)}`);
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** The mods' public dir (TinyMCE theme, ace modes) is a gitignored Ruby-setup
 *  artifact, not engine code (engines/ts-server.mjs:74-79 throws without it).
 *  A disposable pure-tip build worktree lacks it, so it gets a wrapper
 *  manifest that boots THAT checkout's server with DECKO_MOD_PUBLIC_DIR
 *  pointed at a checkout that has it. The engine dist stays the target
 *  checkout's own build. */
function resolveEngineManifest(manifestIn) {
  const engineRepo = path.resolve(path.dirname(manifestIn), "..", "..", "..");
  const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
  if (existsSync(path.join(modDir(engineRepo), "mod"))) return manifestIn;
  if (!existsSync(path.join(modDir(repo), "mod"))) return manifestIn;
  const manifest = JSON.parse(readFileSync(manifestIn, "utf8"));
  const wrapperPath = path.join(out, "engine-with-mod-dir.json");
  writeFileSync(wrapperPath, JSON.stringify({
    ...manifest,
    description: manifest.description + " (C13 wrapper: boots the pure-tip worktree's server with DECKO_MOD_PUBLIC_DIR from a checkout that has the gitignored mod-public artifact — the disposable worktree lacks it)",
    command: ["node", path.join(path.dirname(manifestIn), "ts-server.mjs")],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest(engineManifest));
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
const db = new DatabaseSync(server.db, { readOnly: true });
const q = (sql, ...p) => db.prepare(sql).all(...p);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("C13 probe requires the loopback engine");

console.log(`[c13] engine ${engine.name} on ${O} (boot ${server.bootMs}ms) probe commit ${sourceCommit.slice(0, 8)} engine commit ${(engineBuild?.sourceCommit ?? "?").slice(0, 8)}`);

/** Every fact the legs read, in ONE DOM evaluation per page, so no leg can be
 *  right about a page a later leg re-read. The TinyMCE content is read through
 *  the LIVE editor instance, never the hidden carrier textarea. */
function readPageFacts() {
  return page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
    };
    const createForm = document.querySelector("form[action='/card/create']");
    const editors = {};
    for (const ta of document.querySelectorAll("textarea.tinymce-textarea")) {
      const instance = ta.id ? (window.tinymce?.get?.(ta.id) ?? null) : null;
      editors[ta.getAttribute("name")] = {
        fieldId: ta.id ?? null,
        visible: vis(ta),
        via: instance ? "tinymce" : "no-instance",
        initialized: instance?.initialized ?? false,
        // the pre-fill is read from the live editor, not the hidden carrier
        editorContent: instance ? instance.getContent() : null,
        carrierValue: ta.value,
      };
    }
    // subcard FIELDS of whatever create/edit form is on the page, by name
    const subcardFields = {};
    for (const el of document.querySelectorAll('[name^="card[subcards]"]')) {
      const name = el.getAttribute("name");
      if (name.endsWith("[content]")) {
        subcardFields[name] = {
          tag: el.tagName.toLowerCase(),
          visible: vis(el),
          value: el.tagName === "TEXTAREA" ? null : el.value,
        };
      }
    }
    const editForm = document.querySelector("form.card-form[id^='edit_card']")
      ?? [...document.querySelectorAll("form.card-form")].find((f) => /^\/update\//.test(f.getAttribute("action") ?? ""))
      ?? null;
    return {
      path: decodeURIComponent(location.pathname) + location.search,
      title: document.title,
      signoutLink: (document.querySelectorAll("a.signout-link").length) > 0,
      signedInMarker: /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/.test(document.documentElement.innerHTML),
      createFormPresent: createForm !== null,
      assignedTypeId: createForm?.querySelector('[name="card[type_id]"]')?.value ?? null,
      namePromptVisible: vis(createForm?.querySelector('[name="card[name]"]:not([type=hidden])') ?? null),
      createSubmitPresent: createForm
        ? [...createForm.querySelectorAll(".create-submit-button, button[type=submit], input[type=submit]")].filter(vis).length : 0,
      subcardFields,
      editors,
      editFormPresent: editForm !== null,
      editFormAction: editForm?.getAttribute("action") ?? null,
      // The stock control this port renders is
      //   <button type=submit data-cy="submit-modal" class="... _close-on-success ...">Save and Close</button>
      // (measured on this engine), so the presence test is by its own text and
      // its data-cy is recorded rather than assumed to be save-and-close.
      saveAndClosePresent: editForm !== null
        && [...editForm.querySelectorAll("button[type=submit], button:not([type])")]
          .some((b) => /save\s*(and|&)\s*close/i.test((b.textContent || "").trim())),
      editFormSubmitControls: editForm === null ? [] : [...editForm.querySelectorAll("button[type=submit], button:not([type])")]
        .map((b) => ({ tag: b.tagName.toLowerCase(), type: b.type ?? null, cy: b.getAttribute("data-cy"), classes: b.className, text: (b.textContent || "").trim().slice(0, 30) })),
      modalVisible: (document.querySelector(".modal.show") !== null),
      mainText: (document.querySelector("#main")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1500),
    };
  });
}

/** A visit: the HTTP answer, the page's HTML and the facts the legs read. */
const visit = async (tag, p) => {
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch((e) => ({ error: String(e?.message ?? e) }));
  await page.waitForTimeout(800);
  const html = await page.content().catch(() => "");
  writeFileSync(path.join(out, `${tag}.html`), html);
  const facts = await readPageFacts().catch((e) => ({ error: String(e?.message ?? e) }));
  writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(facts, null, 2));
  return { tag, requested: p, status: r && !r.error ? r.status() : null, error: r?.error ?? null, htmlBytes: html.length, facts };
};

const signIn = async (who) => {
  const a = spec.actors[who];
  await ctx.clearCookies();
  await page.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(600);
  return {
    actor: who,
    landed: page.url(),
    signoutLink: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    signedInMarker: /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/.test(await page.content().catch(() => "")),
  };
};

/** Seeds one card through the engine's own create endpoint — the harness's
 *  established seed idiom (checks-permission-rules.mjs:229-233 seeds a rule
 *  card exactly this way, because a rule's identity is its name). Every graded
 *  leg below reads what the deck actually stored. */
const seed = async (name, type, content) => {
  const body = new URLSearchParams({ "card[name]": name, "card[type]": type, "card[content]": content ?? "", "success[redirect]": "true" });
  const r = await ctx.request.post(O + "/card/create", {
    headers: { origin: O, "content-type": "application/x-www-form-urlencoded" },
    data: body.toString(),
    maxRedirects: 0,
  });
  return { name, type, status: r.status(), location: r.headers()["location"] ?? null };
};

// Rule cards are junction-shaped (name/key NULL, left_id/right_id set), so
// they are read by walking left_id — never by looking the name up.
const simpleRow = (name) => q("SELECT id, name, key, type_id, db_content, trash FROM cards WHERE name = ? AND trash = 0", name)[0] ?? null;
const junctionOf = (leftId, rightKey) => q(
  `SELECT j.id, j.type_id, j.left_id, j.right_id FROM cards j JOIN cards rt ON rt.id = j.right_id
    WHERE j.left_id = ? AND rt.key = ? AND j.trash = 0`,
  leftId, rightKey,
)[0] ?? null;
const ruleInSet = (setId, settingKey) => q(
  `SELECT r.id, r.type_id, r.db_content, r.left_id, r.right_id FROM cards r JOIN cards st ON st.id = r.right_id
    WHERE r.left_id = ? AND st.key = ? AND r.trash = 0`,
  setId, settingKey,
)[0] ?? null;
const nestedRow = (parentName, rightName) => q(
  `SELECT c.id, c.db_content, c.type_id FROM cards c
    WHERE c.left_id = (SELECT id FROM cards WHERE name = ? AND trash = 0)
      AND c.right_id = (SELECT id FROM cards WHERE name = ? AND trash = 0) AND c.trash = 0`,
  parentName, rightName,
)[0] ?? null;

try {
  // ------------------------------------------------- the drive: sign in admin
  const admin = await signIn("admin");
  grade("C13-SESSION-CONTROL",
    admin.signoutLink === true && admin.signedInMarker === true,
    { phase: "sign-in", ...admin });

  // ------------------------------------------------------- C13-SEED (fixture)
  // Seed order matters: the rights first (their +*right sets are what the
  // *right+*default rule hangs on), then the rules, then the Cardtype.
  const seeds = [];
  seeds.push(await seed(RIGHT_TEMPLATED, "RichText", ""));
  seeds.push(await seed(RIGHT_PLAIN, "RichText", ""));
  // The *default rule card's OWN type decides the nested editor's type, so it
  // is seeded RichText (measured: a Phrase-typed default rule renders a plain
  // phrase field carrying no template text).
  seeds.push(await seed(DEFAULT_RULE, "RichText", "<p>" + TEMPLATE_MARKER + "</p>"));
  seeds.push(await seed(CARDTYPE, "Cardtype", ""));
  // The design names *self+*structure; this engine's create form is fed by the
  // *type+*structure rule (measured, four-way sweep). Both are seeded so the
  // design's shape is present and the receipt can say which one applied.
  seeds.push(await seed(SELF_STRUCTURE_RULE, "RichText", STRUCTURE_BODY));
  seeds.push(await seed(TYPE_STRUCTURE_RULE, "RichText", STRUCTURE_BODY));

  const typeRow = simpleRow(CARDTYPE);
  const templatedRightRow = simpleRow(RIGHT_TEMPLATED);
  const plainRightRow = simpleRow(RIGHT_PLAIN);
  const templatedRightSet = templatedRightRow ? junctionOf(templatedRightRow.id, "*right") : null;
  const storedDefaultRule = templatedRightSet ? ruleInSet(templatedRightSet.id, "*default") : null;
  const typeSelfSet = typeRow ? junctionOf(typeRow.id, "*self") : null;
  const selfStructureRule = typeSelfSet ? ruleInSet(typeSelfSet.id, "*structure") : null;
  const typeTypeSet = typeRow ? junctionOf(typeRow.id, "*type") : null;
  const typeStructureRule = typeTypeSet ? ruleInSet(typeTypeSet.id, "*structure") : null;
  const allWritesOk = seeds.every((s) => s.status < 400);
  grade("C13-SEED",
    allWritesOk && !!typeRow && !!templatedRightRow && !!plainRightRow
      && !!storedDefaultRule && String(storedDefaultRule.db_content ?? "").includes(TEMPLATE_MARKER)
      && !!selfStructureRule && String(selfStructureRule.db_content ?? "").includes("{{+" + RIGHT_TEMPLATED + "}}")
      && !!typeStructureRule && String(typeStructureRule.db_content ?? "").includes("{{+" + RIGHT_TEMPLATED + "}}"),
    {
      seeds,
      cardtypeRow: typeRow,
      templatedRightRow,
      plainRightRow,
      storedDefaultRule,
      selfStructureRule,
      typeStructureRule,
      note: "rule rows are junction-shaped in this port (name/key NULL, left_id/right_id set) and are read by walking left_id",
    });

  // ---------------------------------------- C13-LEG-1: the templated create form
  const newForm = await visit("leg-1-new-templated-cardtype", "/new/" + CARDTYPE);
  const templatedFieldName = `card[subcards][+${RIGHT_TEMPLATED}][content]`;
  const plainFieldName = `card[subcards][+${RIGHT_PLAIN}][content]`;
  const templatedEditor = newForm.facts.editors?.[templatedFieldName] ?? null;
  const templatePrefilled = (templatedEditor?.editorContent ?? "").includes(TEMPLATE_MARKER);
  const assignedTypeHonoured = typeRow !== null
    && newForm.facts.assignedTypeId !== null
    && Number(newForm.facts.assignedTypeId) === typeRow.id;
  grade("C13-LEG-1",
    newForm.status === 200
      && newForm.facts.createFormPresent === true
      && assignedTypeHonoured
      && newForm.facts.subcardFields?.[templatedFieldName] !== undefined
      && templatedEditor !== null
      && templatedEditor.via === "tinymce"
      && templatedEditor.initialized === true
      && templatePrefilled,
    {
      status: newForm.status,
      path: newForm.facts.path,
      assignedTypeId: newForm.facts.assignedTypeId,
      expectedTypeId: typeRow?.id ?? null,
      assignedTypeHonoured,
      subcardFields: newForm.facts.subcardFields,
      templatedEditor,
      templateMarker: TEMPLATE_MARKER,
      templatePrefilled,
      namePromptVisible: newForm.facts.namePromptVisible,
      createSubmitPresent: newForm.facts.createSubmitPresent,
      note: "typed-fixture.mjs:41 is the shape of the type assertion (the create form's card[type_id] must be the seeded Cardtype's id); the pre-fill is read from the LIVE TinyMCE instance, never the hidden carrier textarea",
    });

  // ------------------------------------------------ CONTROL-A: non-vacuous  // The same structure rule also adds a right with NO *right+*default rule. Its
  // subcard editor must come up EMPTY. If it also carried the marker, the
  // pre-fill in LEG-1 would be a constant, not the template rule's content.
  const plainEditor = newForm.facts.editors?.[plainFieldName] ?? null;
  const plainStripped = (plainEditor?.editorContent ?? "").replace(/<p>\s*<\/p>|<p><\/p>|<br\s*\/?>|\s|&nbsp;/g, "");
  const plainEditorEmpty = plainEditor !== null && plainStripped === "" && !plainStripped.includes(TEMPLATE_MARKER);
  grade("C13-CONTROL-A",
    plainEditor !== null && plainStripped === "" && plainEditorEmpty,
    {
      plainFieldName,
      plainEditor,
      plainEditorStripped: plainStripped,
      plainEditorEmpty,
      templatedEditorContent: templatedEditor?.editorContent ?? null,
      note: "the structure rule adds two rights; only the templated one's editor may carry the marker, so LEG-1's pre-fill is attributable to the *right+*default rule",
    });

  // ------------------------------- which structure-rule form feeds the form?
  // The design names <Cardtype>+*self+*structure. This run measures whether
  // that rule form alone renders the nested editors here, by seeding a second
  // Cardtype carrying ONLY the self rule over the same two rights and reading
  // its create form. Recorded, never graded: LEG-1's verdict does not depend on
  // it, and a deck where the self form does work must not turn this run RED.
  const selfOnlySeeds = [
    await seed(SELF_ONLY_TYPE, "Cardtype", ""),
    await seed(SELF_ONLY_RULE, "RichText", STRUCTURE_BODY),
  ];
  const selfOnlyForm = await visit("observed-self-only-structure-rule", "/new/" + SELF_ONLY_TYPE);
  observe("C13-OBSERVED-STRUCTURE-RULE-VARIANT", {
    selfOnlyCardtype: SELF_ONLY_TYPE,
    selfOnlyRule: SELF_ONLY_RULE,
    seeds: selfOnlySeeds,
    status: selfOnlyForm.status,
    nestedContentFields: Object.keys(selfOnlyForm.facts.subcardFields ?? {}),
    nestedContentFieldCount: Object.keys(selfOnlyForm.facts.subcardFields ?? {}).length,
    markerPrefilledAnywhere: Object.values(selfOnlyForm.facts.editors ?? {}).some((e) => String(e.editorContent ?? "").includes(TEMPLATE_MARKER)),
    seededAlongside: { typeStructureRule: TYPE_STRUCTURE_RULE, selfStructureRule: SELF_STRUCTURE_RULE },
    note: "on this engine at this commit GET /new/<Cardtype> is fed by the <Cardtype>+*type+*structure rule; the same rule body written <Cardtype>+*self+*structure alone served zero nested content fields here, which is why the probe seeds both and LEG-1 does not depend on which one applied",
  });

  // ------------------------------- C13-LEG-2: create the card from the template
  // Fill the name a person fills, then submit ONCE through the visible create
  // control, and DO NOT type into the nested editor: whatever the stored
  // junction row holds came from the server's pre-fill.
  //
  // The browser is navigated back to the GRADED fixture's create form first.
  // The isolation visit above left the page holding the self-only type's form,
  // and a submit driven from there creates a card of the WRONG type — caught by
  // requiring the reopened form's card[type_id] to be the seeded Cardtype's id
  // before the submit, the same guard typed-fixture.mjs:41 makes.
  const reopenedCreateForm = await visit("leg-2-create-form-reopened", "/new/" + CARDTYPE);
  const createFormIsTheGradedFixture = typeRow !== null
    && reopenedCreateForm.status === 200
    && Number(reopenedCreateForm.facts.assignedTypeId) === typeRow.id
    && reopenedCreateForm.facts.subcardFields?.[templatedFieldName] !== undefined;
  grade("C13-CONTROL-C",
    createFormIsTheGradedFixture,
    {
      reopenedStatus: reopenedCreateForm.status,
      reopenedAssignedTypeId: reopenedCreateForm.facts.assignedTypeId,
      expectedTypeId: typeRow?.id ?? null,
      reopenedSubcardFields: reopenedCreateForm.facts.subcardFields,
      note: "the create submit must go through the graded fixture's own form; a submit driven from another create page would create a card of that page's type and store no nested row",
    });

  const nameField = page.locator("form[action='/card/create'] input[name='card[name]']").first();
  const nameFieldPresent = await nameField.count().catch(() => 0);
  if (nameFieldPresent > 0) await nameField.fill(NEW_CARD, { timeout: T });
  const pendingCreate = page.waitForResponse(
    (r) => new URL(r.url()).origin === O && new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST",
    { timeout: T },
  ).then((response) => ({ response }), (error) => ({ error }));
  await page.locator("form[action='/card/create'] .create-submit-button").first().click({ timeout: T });
  const seenCreate = await pendingCreate;
  if (seenCreate.error) throw seenCreate.error;
  await seenCreate.response.finished();
  await page.waitForLoadState("load", { timeout: T }).catch(() => {});
  await page.waitForTimeout(700);
  const createdHtml = await page.content().catch(() => "");
  writeFileSync(path.join(out, "leg-2-after-create.html"), createdHtml);
  const createFacts = await readPageFacts().catch((e) => ({ error: String(e?.message ?? e) }));
  writeFileSync(path.join(out, "leg-2-after-create.json"), JSON.stringify(createFacts, null, 2));

  const storedCardRow = simpleRow(NEW_CARD);
  const storedNested = storedCardRow ? nestedRow(NEW_CARD, RIGHT_TEMPLATED) : null;
  const landedOnNewCard = createFacts.path === "/" + NEW_CARD || createFacts.path === "/" + NEW_CARD + "/";
  const freshGet = await visit("leg-2-fresh-get-of-created-card", "/" + NEW_CARD);
  const createdShowsTemplate = freshGet.facts.mainText.includes(TEMPLATE_MARKER);
  grade("C13-LEG-2",
    seenCreate.response.status() < 400
      && createFormIsTheGradedFixture
      && !!storedCardRow
      && typeRow !== null && storedCardRow.type_id === typeRow.id
      && !!storedNested
      && String(storedNested.db_content ?? "").includes(TEMPLATE_MARKER)
      && landedOnNewCard
      && freshGet.status === 200
      && createdShowsTemplate,
    {
      createStatus: seenCreate.response.status(),
      landedPath: createFacts.path,
      landedOnNewCard,
      nameFieldPresent,
      storedCard: storedCardRow,
      expectedTypeId: typeRow?.id ?? null,
      storedCardTypeHonoured: typeRow !== null && storedCardRow?.type_id === typeRow.id,
      storedNested,
      templateMarker: TEMPLATE_MARKER,
      freshGetStatus: freshGet.status,
      freshGetShowsTemplate: createdShowsTemplate,
      note: "the nested editor was never typed into; the stored junction row's content came from the server's pre-fill",
    });

  // ------------------------------------------------------- CONTROL-B: nesting
  const nestedBefore = nestedRow(NEW_CARD, RIGHT_TEMPLATED);
  grade("C13-CONTROL-B",
    !!nestedBefore && String(nestedBefore.db_content ?? "").includes(TEMPLATE_MARKER),
    {
      nestedBefore,
      templateMarker: TEMPLATE_MARKER,
      note: "the nested row must exist and hold the template BEFORE the edit leg, or a passing edit leg would be vacuous",
    });

  // ------------------------------ C13-LEG-3: edit the nested subcard, save+close
  const editPage = await visit("leg-3-edit-view", "/" + NEW_CARD + "?view=edit");
  const editEditorBefore = editPage.facts.editors?.[templatedFieldName] ?? null;
  let setDetail = null;
  let submitStatus = null;
  let submitError = null;
  let modalClosed = null;
  let urlAfter = null;
  let editFormAction = null;
  let clickedControl = null;
  let clickedIsSaveAndClose = false;
  if (editEditorBefore?.fieldId && editEditorBefore.via === "tinymce" && editEditorBefore.initialized) {
    setDetail = await page.evaluate(([id, text]) => {
      const editor = window.tinymce.get(id);
      editor.setContent("<p>" + text + "</p>");
      editor.save();
      return { via: "tinymce", content: editor.getContent(), carrier: document.getElementById(id)?.value ?? null };
    }, [editEditorBefore.fieldId, NESTED_EDIT_TEXT]).catch((e) => ({ error: String(e?.message ?? e) }));
    const editorForm = page.locator("form.card-form")
      .filter({ has: page.locator(`textarea[name="${templatedFieldName}"]`) })
      .first();
    editFormAction = await editorForm.getAttribute("action").catch(() => null);
    const actionPath = editFormAction ? new URL(editFormAction, O).pathname : null;
    const saveAndClose = editorForm
      .locator('button[data-cy="save-and-close"], button[data-cy="save_and_close"], button:has-text("Save and Close"), button:has-text("Save & Close")')
      .first();
    const savePresent = await saveAndClose.count() > 0;
    // WHICH control was clicked is recorded, not assumed: on this engine the
    // Save and Close control is <button type=submit data-cy="submit-modal">
    // labelled "Save and Close", not a data-cy=save-and-close button.
    clickedControl = savePresent ? await saveAndClose.evaluate((b) => ({
      tag: b.tagName.toLowerCase(),
      type: b.type ?? null,
      cy: b.getAttribute("data-cy"),
      classes: b.className,
      text: (b.textContent || "").trim().slice(0, 40),
    })).catch(() => null) : null;
    clickedIsSaveAndClose = clickedControl !== null && /save\s*(and|&)\s*close/i.test(clickedControl.text);
    if (savePresent && actionPath) {
      const pendingUpdate = page.waitForResponse(
        (r) => new URL(r.url()).origin === O && new URL(r.url()).pathname === actionPath && r.request().method() === "POST",
        { timeout: T },
      ).then((response) => ({ response }), (error) => ({ error }));
      await saveAndClose.click({ timeout: T, force: true })
        .catch((error) => { submitError = String(error?.message ?? error).slice(0, 200); });
      const seenUpdate = await pendingUpdate;
      if (seenUpdate.error) submitError ??= String(seenUpdate.error?.message ?? seenUpdate.error).slice(0, 200);
      else {
        await seenUpdate.response.finished();
        submitStatus = seenUpdate.response.status();
      }
      await page.waitForTimeout(1000);
      modalClosed = (await page.locator(".modal.show").count().catch(() => 1)) === 0;
      urlAfter = page.url();
    } else {
      observe("C13-LEG-3-SAVE-AND-CLOSE-ABSENT", {
        savePresent, editFormAction,
        buttons: await page.locator("form.card-form button, form.card-form input[type=submit]").evaluateAll(
          (els) => els.map((e) => ({ tag: e.tagName, type: e.type, cy: e.getAttribute("data-cy"), text: (e.textContent || e.value || "").trim().slice(0, 26) })),
        ).catch(() => []),
      });
    }
  }
  const storedNestedAfter = nestedRow(NEW_CARD, RIGHT_TEMPLATED);
  const freshGetAfter = await visit("leg-3-fresh-get-after-edit", "/" + NEW_CARD);
  const pageShowsEdited = freshGetAfter.facts.mainText.includes(NESTED_EDIT_TEXT);
  grade("C13-LEG-3",
    editPage.status === 200
      && editPage.facts.editFormPresent === true
      && !!editEditorBefore
      && editEditorBefore.via === "tinymce"
      && clickedIsSaveAndClose === true
      && submitStatus !== null && submitStatus < 400
      && modalClosed === true
      && !!storedNestedAfter
      && String(storedNestedAfter.db_content ?? "").includes(NESTED_EDIT_TEXT)
      && freshGetAfter.status === 200
      && pageShowsEdited,
    {
      editStatus: editPage.status,
      editFormPresent: editPage.facts.editFormPresent,
      editFormAction,
      nestedFieldName: templatedFieldName,
      nestedEditorBefore: editEditorBefore,
      nestedEditorSetTo: setDetail,
      saveAndClosePresent: editPage.facts.saveAndClosePresent,
      clickedControl,
      clickedIsSaveAndClose,
      editFormSubmitControls: editPage.facts.editFormSubmitControls,
      submitStatus,
      submitError,
      modalClosed,
      urlBeforeEdit: O + "/" + NEW_CARD + "?view=edit",
      urlAfter,
      storedNestedBefore: nestedBefore,
      storedNestedAfter,
      nestedEditText: NESTED_EDIT_TEXT,
      freshGetStatus: freshGetAfter.status,
      freshGetShowsEditedText: pageShowsEdited,
      note: "Save and Close is the stock control (data-cy=save-and-close); the design's clause is BOTH the stored junction row AND a fresh GET carrying the new text",
    });

  // ----------------------------------------------- the capability, as measured
  const legOk = (name) => report.legs.find((l) => l.leg === name)?.ok === true;
  report.c13 = {
    checkName: CHECK_NAME,
    allLegsGreen: report.failures === 0,
    compoundHalves: {
      templatedCreate: {
        formServesTemplate: legOk("C13-LEG-1"),
        cardCreatedFromTemplate: legOk("C13-LEG-2"),
      },
      nestedEdit: {
        nestedEditorPresent: !!editEditorBefore,
        saveAndCloseApplied: legOk("C13-LEG-3"),
      },
    },
    controls: {
      plainRightEditorEmpty: legOk("C13-CONTROL-A"),
      nestedRowHeldTemplateBeforeEdit: legOk("C13-CONTROL-B"),
      sessionSurvived: legOk("C13-SESSION-CONTROL"),
    },
    sourceJourneyAlign: {
      journey: "create-structured-topic-member",
      journeySteps: "sign in admin; visit /new/Topic; fill card[subcards][+summary][content]; click Submit; observe the created topic; visit /Topic_900+summary; observe its summary",
      probeReaches: "the same gesture against a templated type — the nested editor arrives PRE-FILLED from the type's template (the journey fills it by hand; C13's half is that it did not have to), Submit lands on the new card, and the nested content is then edited in place and saved through Save and Close",
    },
  };
} catch (err) {
  report.failures += 1;
  console.error(`[c13] FATAL ${err?.stack ?? err}`);
  report.legs.push({ capability: "C13", check: CHECK_NAME, leg: "FATAL", ok: false, detail: { fatal: String(err?.stack ?? err).slice(0, 900) } });
}

await bh.close().catch(() => {});
db.close();
await server.stop().catch(() => {});

writeFileSync(path.join(out, "probe-c13-result.json"), JSON.stringify(report, null, 2));
console.log(`[c13] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-c13-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);
