// Captures the stock Ruby oracle's full served page for a signed-in
// /<card>?view=edit render and answers one decision question: does that
// served page PRE-FILL the layout's #modal-container (which would redirect
// the client's @slot() away from the form on a 409), or is the modal
// container empty?
//
// Evidence is the raw HTTP response body of the page GET (the full served
// page, not a view-level capture). A browser leg is included as secondary
// evidence: it records the DOM state of #modal-container after the page's
// own scripts have run, which is the state the client's @slot() sees at
// interaction time.
//
//   node probe-oracle-edit-page-modal-container-prefill.mjs <out-dir>
//
// Boots engines/ruby.json first; on this Windows host its `bash
// ruby-server.sh` command cannot resolve the decko bundle (PATH Ruby is 3.4,
// which has no decko gemset — Bundler::GemNotFound; bash.exe can also
// resolve to WSL), so the canonical Windows manifest engines/ruby33.json —
// the same oracle app, the same ruby-server.rb, decko 0.20.0 / card 1.110.0
// — is booted instead and proved via /__harness/runtime.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { launchBrowser } from "./lib/launch.mjs";

const repo = "C:/localProjects/decko-ts-release-lead";
const fixtureDir = path.join(repo, "reference-harness/fixtures/synthetic-v1");
const outDir = process.argv[2] ?? "C:/localProjects/brandonDojoTech/recovery/release/private-probes/oracle-page-captures-20261018";
const runDir = path.join(repo, ".runtime/oracle-edit-page-modal-prefill-20261018");
mkdirSync(outDir, { recursive: true });
mkdirSync(runDir, { recursive: true });

const CARD = "Note 001"; // the harness's canonical RichText edit target (lib/exhaustive-affordance-targets.mjs RICHTEXT_AFFORDANCE_TARGET_CARD)
const cardSlug = "/" + encodeURIComponent(CARD).replaceAll("%20", "_"); // decko accepts underscores for spaces
const editPath = `${cardSlug}?view=edit`;
const STEP_TIMEOUT = 30_000;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const spec = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
const evidence = { card: CARD, editPath, actor: "admin", boots: [], steps: [] };

// Extracts the element's exact served bytes: from its opening tag through
// its balanced close, counting nested <div> open/close tags.
function extractDivBlock(html, idAttr) {
  const open = new RegExp(`<div\\b[^>]*\\bid=["']${idAttr}["'][^>]*>`);
  const m = open.exec(html);
  if (!m) return null;
  const start = m.index;
  let depth = 0, i = start;
  const tag = /<div\b[^>]*>|<\/div\s*>/g;
  tag.lastIndex = start;
  for (let t; (t = tag.exec(html)) !== null;) {
    depth += t[0].startsWith("</") ? -1 : 1;
    i = tag.lastIndex;
    if (depth === 0) break;
  }
  return depth === 0 ? html.slice(start, i) : null;
}

function collectCookies(res, jar) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const [name] = pair.split("=");
    jar.set(name.trim(), pair.trim());
  }
}

async function bootWithFallback() {
  // 1. The ask names engines/ruby.json — attempt it first and record the
  //    failure verbatim rather than silently substituting.
  try {
    const s = await startEngine(loadEngine(path.join(repo, "reference-harness/browser/engines/ruby.json")), fixtureDir, {
      logFile: path.join(runDir, "ruby-json-boot.log"),
      readyTimeoutMs: 90_000,
    });
    evidence.boots.push({ manifest: "ruby.json", booted: true, base: s.base });
    evidence.engineRuntime = await (await fetch(s.base + "/__harness/runtime", { headers: { connection: "close" } })).json();
    return s;
  } catch (err) {
    let logTail = null;
    try { logTail = readFileSync(path.join(runDir, "ruby-json-boot.log"), "utf8").slice(-2000); } catch {}
    evidence.boots.push({ manifest: "ruby.json", booted: false, error: String(err?.message ?? err), logTail });
  }
  // 2. Canonical Windows oracle (same app, same server script).
  const s = await startEngine(loadEngine(path.join(repo, "reference-harness/browser/engines/ruby33.json")), fixtureDir, {
    logFile: path.join(runDir, "ruby33-server.log"),
    readyTimeoutMs: 240_000,
  });
  const runtime = await (await fetch(s.base + "/__harness/runtime", { headers: { connection: "close" } })).json();
  evidence.boots.push({ manifest: "ruby33.json", booted: true, base: s.base, runtime });
  return s;
}

const server = await bootWithFallback();
const base = server.base;
try {
  // ---- signed-in session over raw HTTP ------------------------------------
  const jar = new Map();
  const signinPage = await fetch(base + "/*signin", { headers: { connection: "close" } });
  collectCookies(signinPage, jar);
  const signinHtml = await signinPage.text();
  const token = (/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/.exec(signinHtml)
    ?? /value=["']([^"']+)["'][^>]*name=["']authenticity_token["']/.exec(signinHtml))?.[1] ?? null;
  evidence.steps.push({ step: "GET /*signin", status: signinPage.status, csrfTokenFound: token !== null });

  const body = new URLSearchParams({
    "card[subcards][+*email][content]": spec.actors.admin.email,
    "card[subcards][+*password][content]": spec.actors.admin.password,
    ...(token ? { authenticity_token: token } : {}),
  });
  const signinPost = await fetch(base + "/update/*signin", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: [...jar.values()].join("; "), connection: "close" },
    body: body.toString(),
    redirect: "manual",
  });
  collectCookies(signinPost, jar);
  evidence.steps.push({ step: "POST /update/*signin", status: signinPost.status, location: signinPost.headers.get("location"), cookies: [...jar.keys()] });
  if (![301, 302, 303].includes(signinPost.status)) throw new Error(`sign-in POST answered ${signinPost.status}, expected a redirect`);

  // ---- the capture: full served page --------------------------------------
  const pageRes = await fetch(base + editPath, { headers: { cookie: [...jar.values()].join("; "), connection: "close" } });
  const pageBytes = Buffer.from(await pageRes.arrayBuffer());
  const servedName = "ruby-oracle-Note_001-view-edit-served-page.html";
  writeFileSync(path.join(outDir, servedName), pageBytes);
  const servedSha = sha256(pageBytes);
  writeFileSync(path.join(outDir, `${servedName}.sha256`), `${servedSha}  ${servedName}\n`);

  const servedHtml = pageBytes.toString("utf8");
  const modalBlock = extractDivBlock(servedHtml, "modal-container");
  writeFileSync(path.join(outDir, "ruby-oracle-Note_001-view-edit-modal-container-served-bytes.txt"),
    modalBlock ?? "<#modal-container not found in served page>\n");
  const signedInWitness = {
    editFormPresent: /<form\b[^>]*card-form/.test(servedHtml),
    signinFormPresent: /Sign In/.test(servedHtml) && /card\[subcards\]\[\+\*password\]/.test(servedHtml),
    mainSlotEdit: /CARD_ATTR|id=["']main/.test(servedHtml),
    navbarAccountName: (servedHtml.match(/Ada Admin/g) ?? []).length,
    signOutLinks: (servedHtml.match(/Sign out/g) ?? []).length,
  };
  evidence.steps.push({
    step: `GET ${editPath}`,
    status: pageRes.status,
    bytes: pageBytes.length,
    sha256: servedSha,
    modalContainerFound: modalBlock !== null,
    modalContainerBytes: modalBlock?.length ?? null,
    ...signedInWitness,
  });
  evidence.servedModalContainerBytes = modalBlock;

  // ---- secondary evidence: DOM after the page's own scripts ---------------
  const browser = await launchBrowser();
  try {
    const page = browser.context.pages()[0] ?? (await browser.context.newPage());
    page.setDefaultTimeout(STEP_TIMEOUT);
    await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
    await page.fill("input[name='card[subcards][+*email][content]']", spec.actors.admin.email);
    await page.fill("input[name='card[subcards][+*password][content]']", spec.actors.admin.password);
    await page.locator("form[action='/update/*signin'] button[type='submit']").first().click();
    await page.waitForLoadState("load", { timeout: STEP_TIMEOUT });
    await page.waitForURL((u) => !String(u).includes("*signin"), { timeout: STEP_TIMEOUT }).catch(() => {});
    const resp = await page.goto(base + editPath, { waitUntil: "load", timeout: STEP_TIMEOUT });
    await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT }).catch(() => {});
    const dom = await page.evaluate(() => {
      const el = document.querySelector("#modal-container");
      return {
        pageUrl: location.href,
        pagePath: location.pathname + location.search,
        signedInWitness: {
          signOutLinks: [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Sign out").length,
          accountNameMentions: document.body.innerHTML.split("Ada Admin").length - 1,
        },
        editFormInDom: document.querySelectorAll("form.card-form textarea[name='card[content]']").length,
        modalContainersInDom: document.querySelectorAll("#modal-container").length,
        anyModalSlotClass: document.querySelectorAll("._modal-slot").length,
        present: el !== null,
        outerHTML: el?.outerHTML ?? null,
        innerHTMLLength: el?.innerHTML.length ?? null,
        children: el ? el.children.length : null,
        modalShowCount: document.querySelectorAll(".modal.show").length,
        formsInsideModalContainer: el ? el.querySelectorAll("form").length : null,
      };
    });
    writeFileSync(path.join(outDir, "ruby-oracle-Note_001-view-edit-dom-after-load.html"),
      `<-- DOM-LEVEL capture (browser page.content()), NOT the served bytes; served capture is the sibling *.served-page.html -->\n` + (await page.content()));
    evidence.domAfterLoad = { pageStatus: resp ? resp.status() : null, ...dom };
  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}

writeFileSync(path.join(outDir, "capture-evidence.json"), JSON.stringify(evidence, null, 2));
const modalEmpty = evidence.servedModalContainerBytes != null &&
  /^<div\b[^>]*id=["']modal-container["'][^>]*>\s*<\/div>$/.test(evidence.servedModalContainerBytes.trim());
console.log(`[oracle-edit-page] booted: ${JSON.stringify(evidence.boots.map(b => ({ manifest: b.manifest, booted: b.booted })))}`);
console.log(`[oracle-edit-page] served page: ${evidence.steps.find(s => s.step?.startsWith("GET /"))?.status} ` +
  `${evidence.steps.find(s => s.step?.startsWith("GET /"))?.bytes} bytes, sha256 ${evidence.steps.find(s => s.sha256)?.sha256}`);
console.log(`[oracle-edit-page] VERDICT: #modal-container in the served page is ${modalEmpty ? "EMPTY" : "NOT EMPTY / NOT FOUND"}`);
console.log(`[oracle-edit-page] served bytes of #modal-container: ${JSON.stringify(evidence.servedModalContainerBytes)?.slice(0, 600)}`);
console.log(`[oracle-edit-page] DOM after load: ${JSON.stringify(evidence.domAfterLoad)?.slice(0, 600)}`);
