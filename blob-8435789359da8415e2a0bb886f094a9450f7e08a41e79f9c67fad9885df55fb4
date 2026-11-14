#!/usr/bin/env node
// build-front-door.mjs: build the front door as REAL CARDS in a running decko deck.
//
//   node scripts/front-door/build-front-door.mjs
//     [--base-url http://127.0.0.1:3117]
//     [--credentials <file>]
//     [--out <receipt.json>]
//     [--dry-run]
//
// The front door is built through the ENGINE'S OWN WRITE PATH: every card is
// created (or updated) with the same POST / and PUT /<card> calls the signed-in
// editor uses, so the cards land in the deck with the engine's actions,
// references and nest closure, not as rows poked into the database.
//
// What it builds, in order:
//
//   1. SIGNS IN as the deck's owner account (the demo scratch copy arms the
//      write path, DECKO_WRITE_PATH=1).
//   2. CREATES the door's cards under the deck's own "Culturesmith"
//      namespace, the way the library-into-decko slice hung its cards under
//      one namespace card: the door, the two doors inside it, the ways in,
//      the method, the community standard and certification, and the note
//      that says what is real and what is a sketch.
//   3. SEATS THE VIEW: a Layout card holding the door's own page shell, and
//      the per-card layout rule ("<door>+*self+*layout") that binds the door
//      card to it. This is the deck's own mechanism for the view a card
//      renders in (see *all+*layout -> "Default Layout" and
//      "<card>+*self+*layout" in the same deck).
//   4. PUTS THE DOOR ON THE LANDING PAGE: the Home card's content nests the
//      door card first, so the page a visitor opens carries the door.
//   5. READS EVERY CARD BACK through the engine and writes the inventory
//      (name, id, type, the view path, the bytes) into a receipt.
//
// The wording is the operator's standing design rules
// (docs/plans/writing-for-brandon.md in brandonDojoTech): the universal
// conflict framing first, Aikido later as the method's source, Guardians of
// Peace as a community proposal rather than a product, and the zero-friction
// certification names.
//
// Exit code 0 when every card was written and read back, 1 when any step
// failed. Nothing here deploys anywhere and nothing outside the loopback
// address is contacted.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3117";
const DEFAULT_CREDENTIALS = "C:/localProjects/decko-ts-demo-scratch-20261025/.runtime/demo-scratch/credentials.json";
const DEFAULT_OUT = join(repoRoot, "tmp", "frontdoor-in-decko-20261025", "front-door-build-receipt.json");

const DOOR = "Culturesmith+Front Door";
const LAYOUT_CARD = "Front Door Layout";
const LAYOUT_RULE = `${DOOR}+*self+*layout`;

// The door's page shell. The same shape the deck's own layouts use: the
// header slot, the main slot, the footer slot.
const LAYOUT_CONTENT = [
  '<body class="d-flex flex-column h-100">',
  "  <header>{{:header|core}}</header>",
  '  <article class="container flex-shrink-0" role="main">{{_main|content}}</article>',
  '  <footer class="footer mt-auto py-3">{{:footer|content}}</footer>',
  "</body>",
].join("\n");

// The cards of the door, in the order a visitor meets them.
//
// The wording follows the operator's standing design rules:
//   - the universal conflict framing comes FIRST (writing-for-brandon.md #4);
//   - the question is Brandon's own words from the meeting of 2026-10-20
//     (docs/reports/front-door-deliverables-2026-10-20.md);
//   - Aikido appears later, as the source and credibility of the method
//     (writing-for-brandon.md #4);
//   - Guardians of Peace is a community proposal, not a product
//     (writing-for-brandon.md #5);
//   - the certification names are the zero-friction ones, "Peace Practices
//     Approved" and "Conflict Done Well Certified" (writing-for-brandon.md #5).
//
// Every link points at a real thing: a card in this deck, or the working
// library. There is no placeholder text and no scaffolding.
//
// The right-hand part of each compound name is a card of this door's own.
// The deck already holds cards called "Methods" and "community" (both with
// real content of their own), and the engine resolves a compound name
// through the KEY of its parts, so "Method" and "Community" would have bound
// the door's sections to those two existing pages. The parts below are
// named so that each section card belongs to this door alone.
const CARDS = [
  {
    name: DOOR,
    role: "the door: the landing card a visitor meets",
    content: [
      "<h2>All of business and life is a sea of conflict. Most organizations improvise. We give them a jumpstart.</h2>",
      "<p><strong>Conflict done well.</strong></p>",
      "<p>Are you a student, or are you an organization?</p>",
      `<p>{{${DOOR}+Student Door}}</p>`,
      `<p>{{${DOOR}+Organization Door}}</p>`,
      `<p>{{${DOOR}+Ways In}}</p>`,
      `<p>{{${DOOR}+The Method}}</p>`,
      `<p>{{${DOOR}+Community Standard}}</p>`,
      `<p>{{${DOOR}+About This Build}}</p>`,
    ].join("\n"),
  },
  {
    name: `${DOOR}+Student Door`,
    role: "the student door",
    content: [
      "<p><strong>Here to practise.</strong></p>",
      "<p><strong>I am a student.</strong></p>",
      "<p>The Library holds every recorded class, searchable, with the handbook alongside.</p>",
      '<p><a href="https://culturesmith-library.bunny.run">Go to the Library</a></p>',
    ].join("\n"),
  },
  {
    name: `${DOOR}+Organization Door`,
    role: "the organization door",
    content: [
      "<p><strong>Here for my team.</strong></p>",
      "<p><strong>I am an organization.</strong></p>",
      "<p>Conflict Done Well brings Aikido, Martial Nonviolence, and Peace Practices to schools, hospitals, and teams.</p>",
      "<p>[[Conflict Done Well]]</p>",
      "<p>[[Make Contact]]</p>",
    ].join("\n"),
  },
  {
    name: `${DOOR}+Ways In`,
    role: "the ways in: the three roles, the classes, the library",
    content: [
      "<h3>Three ways to be here</h3>",
      "<p>Guest, Member, and Student.</p>",
      '<p><a href="https://culturesmith-library.bunny.run/classes">Going straight to the classes? Browse every recorded class by month</a></p>',
      '<p>Not sure? The Library is an example of all of conflict done well. <a href="https://culturesmith-library.bunny.run">Start there</a>.</p>',
    ].join("\n"),
  },
  {
    name: `${DOOR}+The Method`,
    role: "what Conflict Done Well is made of, and where the method comes from",
    content: [
      "<h3>What Conflict Done Well is made of</h3>",
      "<p>[[aikido|Aikido]], [[Martial Nonviolence]], and [[Peace Practices]].</p>",
      "<h3>Where the method comes from</h3>",
      "<p>Aikido is the source of the method, and the reason the method is credible.</p>",
    ].join("\n"),
  },
  {
    name: `${DOOR}+Community Standard`,
    role: "the community standard and the certification names",
    content: [
      "<h3>A community standard</h3>",
      "<p>Guardians of Peace is an open proposal to the world: a community standard, not a product.</p>",
      "<p>[[Guardians of Peace]]</p>",
      "<h3>Certification</h3>",
      "<p>Conflict Done Well Certified is for the practitioner. Peace Practices Approved is for the organization that runs the practice.</p>",
      "<p>Both names descend from the Guardians of Peace Credential, proposed in 2010.</p>",
    ].join("\n"),
  },
  {
    name: `${DOOR}+About This Build`,
    role: "what is real here, what is a sketch, and who wrote it",
    content: [
      "<h3>What is real here</h3>",
      "<p>Real: the universal-conflict framing, the question, the three components of Conflict Done Well, the three ways to be here, the Guardians of Peace proposal, and the two certification names. The links point at the working library and at pages in this deck.</p>",
      "<p>Sketch: the front door running inside the demo copy of the engine, on this machine, on a loopback address. The live site is untouched.</p>",
      "<p>Written with an AI agent from Brandon's recorded design rules and the five front-door mockups. The selection, the arrangement and the connecting wording are the agent's; the framing and the question are Brandon's own words, from the working sessions of 2026-10-16 and 2026-10-20.</p>",
    ].join("\n"),
  },
];

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, credentials: DEFAULT_CREDENTIALS, out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--credentials": args.credentials = resolve(value); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      case "--dry-run": args.dryRun = true; break;
      case "--help":
        console.log(
          "build-front-door: build the front door as real cards in a running deck\n" +
          "  --base-url <url>       the running deck (default http://127.0.0.1:3117)\n" +
          "  --credentials <file>   the deck owner's credentials file\n" +
          "  --out <file>           receipt path (default tmp/frontdoor-in-decko-20261025/front-door-build-receipt.json)\n" +
          "  --dry-run              print the plan, write nothing",
        );
        process.exit(0);
        break;
      default:
        console.error(`build-front-door: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(args.credentials)) {
  console.error(
    `build-front-door: no credentials file at ${args.credentials}\n` +
      "  The demo scratch copy seeds it: node scripts/demo-scratch-copy/build-demo-deck.mjs",
  );
  process.exit(2);
}

const credentials = JSON.parse(readFileSync(args.credentials, "utf8"));

let cookie = "";

async function request(path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Origin", args.baseUrl);
  if (cookie !== "") headers.set("Cookie", cookie);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${args.baseUrl}${path}`, { ...init, headers, redirect: "manual" });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie !== null) cookie = setCookie.split(";")[0];
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text, bytes: Buffer.byteLength(text) };
}

const cardPath = (name) => `/${encodeURIComponent(name)}`;

const steps = [];
function record(name, ok, detail, evidence) {
  steps.push({ name, ok, detail, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  return ok;
}

// ── 1. sign in ───────────────────────────────────────────────────────────────
{
  const res = await request("/_signin", {
    method: "POST",
    body: JSON.stringify({ identifier: credentials.admin.email, password: credentials.admin.password }),
  });
  record("sign-in", res.status === 200 && cookie !== "", `POST /_signin -> ${res.status}, session cookie ${cookie !== "" ? "issued" : "missing"}`, {
    status: res.status,
  });
  if (cookie === "") {
    console.error("build-front-door: no session; the write path needs the owner account.");
    process.exit(1);
  }
}

// ── 2. the cards ─────────────────────────────────────────────────────────────
const inventory = [];

for (const card of CARDS) {
  if (args.dryRun) {
    console.log(`would write: ${card.name}`);
    continue;
  }
  const existing = await request(`${cardPath(card.name)}.json`);
  const path = existing.status === 200 ? cardPath(card.name) : "/";
  const method = existing.status === 200 ? "PUT" : "POST";
  const res = await request(path, {
    method,
    body: JSON.stringify({ card: { name: card.name, content: card.content } }),
  });
  const ok = res.status === 200 || res.status === 303 || res.status === 302;
  const readBack = ok ? await request(`${cardPath(card.name)}.json`) : null;
  const stored = readBack?.status === 200 ? readBack.body : "";
  const written = stored.includes(card.content.split("\n")[0].replace(/<[^>]+>/g, "").slice(0, 40));
  record(`card: ${card.name}`, ok && written, `${method} ${path} -> ${res.status}; read back ${readBack?.status ?? "-"}, ${readBack?.bytes ?? 0} bytes`, {
    method,
    status: res.status,
    location: res.headers.get("location"),
    readStatus: readBack?.status ?? null,
    readBytes: readBack?.bytes ?? 0,
    contentPresent: written,
  });
  inventory.push({
    name: card.name,
    role: card.role,
    write: method,
    writeStatus: res.status,
    readStatus: readBack?.status ?? null,
    bytes: readBack?.bytes ?? 0,
  });
}

// ── 3. the view: the layout card and the per-card layout rule ───────────────
if (!args.dryRun) {
  const layoutExisting = await request(`${cardPath(LAYOUT_CARD)}.json`);
  const layoutRes = await request(layoutExisting.status === 200 ? cardPath(LAYOUT_CARD) : "/", {
    method: layoutExisting.status === 200 ? "PUT" : "POST",
    body: JSON.stringify({ card: { name: LAYOUT_CARD, content: LAYOUT_CONTENT, type: "Layout" } }),
  });
  const layoutOk = layoutRes.status === 200 || layoutRes.status === 303 || layoutRes.status === 302;
  record("view: layout card", layoutOk, `POST/PUT ${LAYOUT_CARD} -> ${layoutRes.status}`, {
    status: layoutRes.status,
    location: layoutRes.headers.get("location"),
  });

  const ruleExisting = await request(`${cardPath(LAYOUT_RULE)}.json`);
  const ruleRes = await request(ruleExisting.status === 200 ? cardPath(LAYOUT_RULE) : "/", {
    method: ruleExisting.status === 200 ? "PUT" : "POST",
    body: JSON.stringify({ card: { name: LAYOUT_RULE, content: LAYOUT_CARD } }),
  });
  const ruleOk = ruleRes.status === 200 || ruleRes.status === 303 || ruleRes.status === 302;
  record("view: layout rule", ruleOk, `POST/PUT ${LAYOUT_RULE} -> ${ruleRes.status}`, {
    status: ruleRes.status,
    location: ruleRes.headers.get("location"),
    body: ruleRes.body.slice(0, 300),
  });
}

// ── 4. the landing page: the Home card nests the door first ────────────────
if (!args.dryRun) {
  const homeJson = await request(`${cardPath("Home")}.json`);
  const home = homeJson.status === 200 ? JSON.parse(homeJson.body) : null;
  const current = home?.db_content ?? "";
  const doorNest = `<p>{{${DOOR}}}</p>`;
  const already = current.trimStart().startsWith(doorNest);
  const next = already ? current : `${doorNest}\n${current}`;
  const homeRes = await request(cardPath("Home"), {
    method: "PUT",
    body: JSON.stringify({ card: { name: "Home", content: next } }),
  });
  const homeOk = homeRes.status === 200 || homeRes.status === 303 || homeRes.status === 302;
  record("landing: Home nests the door", homeOk && !already, `PUT /Home -> ${homeRes.status} (${already ? "already nested" : "door nested first"})`, {
    status: homeRes.status,
    alreadyNested: already,
    previousBytes: current.length,
    nextBytes: next.length,
  });
}

// ── 5. read the door back through the engine ────────────────────────────────
const views = [];
if (!args.dryRun) {
  for (const target of ["/", `/${DOOR.split("+").join("+")}`, ...CARDS.slice(1).map((c) => cardPath(c.name))]) {
    const res = await request(target);
    const hasDoor = res.body.includes("sea of conflict");
    const viewName = target === "/" ? "landing page" : `card page`;
    record(`view: ${viewName} ${target}`, res.status === 200, `GET ${target} -> ${res.status}, ${res.bytes} bytes, door text present ${hasDoor}`, {
      status: res.status,
      bytes: res.bytes,
      doorTextPresent: hasDoor,
    });
    views.push({ path: target, status: res.status, bytes: res.bytes, doorTextPresent: hasDoor });
  }
}

const failed = steps.filter((s) => !s.ok);
const receipt = {
  builtAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  door: DOOR,
  layoutCard: LAYOUT_CARD,
  layoutRule: LAYOUT_RULE,
  cards: inventory,
  views,
  passed: steps.length - failed.length,
  total: steps.length,
  steps,
};
if (!args.dryRun) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(receipt, null, 2) + "\n");
  console.log("");
  console.log(`${receipt.passed}/${receipt.total} checks passed`);
  console.log(`receipt: ${args.out}`);
}
process.exit(failed.length === 0 ? 0 : 1);
