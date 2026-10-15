// probe-deck.mjs — adds the probe fixture's extra cards to a copy of the
// synthetic-v2 deck, THROUGH the Ruby oracle's adapter, so the cards are
// created by stock Decko with every mod loaded (a set module's own validation
// runs) rather than by the deck builder, which loads no mods.
//
//   node tools/compat-report/probe-deck.mjs <fixtureDir> <syntheticDir> [--dry]
//
// Each candidate is a write operation the adapter answers; a card Ruby refuses
// is reported with Ruby's own errors and is left out of the fixture's deck.json.
// The fixture's deck and deck.json are rewritten only for the cards Ruby
// accepted.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(dirname(HERE));
const slash = (p) => p.replaceAll("\\", "/");

// The cards the probe fixture needs, each the set some declared view or event
// belongs to. `actor` is the Decko identity the write runs as (Decko Bot where
// the deck's own rules demand it, the fixture's admin otherwise).
const CANDIDATES = [
  // set/type/signup (4 views): a Sign up card with the account it validates.
  // The harness write op has no nested subcards, so the two cards that need
  // them (a Sign up card and a User card, each with an account) are applied by
  // the oracle deck builder, whose subcards_for builds a nested field.
  {
    why: "card-mod-account set/type/signup views (content_formgroups, core, new_buttons, new)",
    via: "builder",
    card: "Probe Signup",
    fields: { type: "Sign up", content: "probe", fields: { "+*account": { fields: { "+*email": "probe.signup@example.test", "+*password": "Probe-Password-1" } } } },
  },
  // set/type_plus_right/user/email (base:raw): a User card with an account, so
  // the User+*email compound exists.
  {
    why: "card-mod-account set/type_plus_right/user/email base:raw",
    via: "builder",
    card: "Probe User",
    fields: { type: "User", content: "probe", fields: { "+*account": { fields: { "+*email": "probe.user@example.test", "+*password": "Probe-Password-1" } } } },
  },
  // set/right/group_remote (3 views): a Mod's remote group, with the manifest
  // subcards its set module reads (card-mod-assets set/type/mod.rb
  // fetch_mod_asset_card: [name, :script] and [name, :style]).
  { why: "card-mod-assets set/right/group_remote (with the Mod's asset subcards)", card: "mod: assets", actor: "admin", fields: { type: "Mod", content: "probe", fields: { "+script": "probe script", "+style": "probe style" } } },
  // set/right/followers and set/right/following (5 views): a card a user follows.
  { why: "card-mod-follow set/right/followers and set/right/following views", card: "Probe Topic", actor: "admin", fields: { type: "Topic", content: "probe" } },
  { why: "card-mod-follow: a followed card, so its +*followers and +*following cards exist", card: "Probe Followed", actor: "admin", fields: { type: "Topic", content: "probe", fields: { "+*follow": "*always" } } },
  { why: "card-mod-bootstrap set/type/skin css:concat", card: "Probe Skin", actor: "admin", fields: { type: "Skin", content: "probe" } },
  // set/right/followers and set/right/following: the signed-in user's own
  // +*following list (create: _left) and +*followers list.
  { why: "card-mod-follow set/right/following (core, one_line_content, rule_editor, status)", card: "Ada Admin+*following", actor: "admin", fields: { content: "" } },
  { why: "card-mod-follow set/right/followers (core)", card: "Ada Admin+*followers", actor: "admin", fields: { content: "" } },
  // set/type_plus_right/user/email (base:raw): a User card's own email.
  { why: "card-mod-account set/type_plus_right/user/email base:raw (Probe User's email)", card: "Probe User+*email", actor: "admin", fields: { content: "probe.user.email@example.test" } },
  // set/right/enabled_roles (edit_inline): a card with an enabled-roles list.
  // set/right/enabled_roles (edit_inline): a card with an enabled-roles list. The
  // role names are the deck's own Role subcards' codenames (see below), so the
  // content passes set/right/enabled_roles.rb validate_role_enabling.
  { why: "card-mod-layout set/right/enabled_roles edit_inline (the actor's own card: right/enabled_roles ok_to_create? requires it)", card: "Ada Admin+*enabled roles", actor: "admin", fields: { content: "*admin" } },
];

// Asks the oracle's adapter to create one card and returns its answer.
function adapterCreate(deckPath, filesDir, work, op) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [join(REPO, "reference-harness", "oracle", "run-adapter.sh")], {
      cwd: REPO,
      env: {
        ...process.env,
        HARNESS_DECK: slash(deckPath),
        HARNESS_FILES: slash(filesDir),
        HARNESS_DECK_JSON: slash(join(REPO, "reference-harness", "fixtures", "synthetic-v2", "deck.json")),
        HARNESS_WORK: slash(work),
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("adapter timed out"));
    }, 180000);
    const handle = (line) => {
      if (!line.trim().startsWith("{")) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.ready) {
        child.stdin.write(JSON.stringify({ id: "1", op: "write", actor: op.actor, action: "create", card: op.card, fields: op.fields }) + "\n");
        return;
      }
      if (msg.id === "1") {
        clearTimeout(timer);
        child.kill();
        resolve(msg);
      }
    };
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) handle(line);
    });
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error(`adapter exited before answering ${op.card}`));
    });
  });
}

function baseClock() {
  return JSON.parse(readFileSync(join(REPO, "reference-harness", "fixtures", "synthetic-v2", "deck.json"), "utf8")).clock;
}

async function main() {
  const [fixtureDir, syntheticDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!fixtureDir || !syntheticDir) throw new Error("usage: probe-deck.mjs <fixtureDir> <syntheticDir>");
  const scratch = mkdtempSync(join(tmpdir(), "decko-probe-deck-"));
  const dbPath = join(scratch, "deck.sqlite3");
  const filesDir = join(scratch, "files");
  const work = join(scratch, "work");
  mkdirSync(filesDir, { recursive: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(syntheticDir, "deck", "deck.sqlite3"), dbPath);
  cpSync(join(syntheticDir, "deck", "files"), filesDir, { recursive: true });
  const accepted = [];
  const refused = [];
  try {
    // The builder phase first: the cards whose fields nest, applied by the
    // oracle's own build-deck.rb to the same scratch deck. A later candidate
    // (Probe User+*email) needs its left (Probe User) to exist first.
    const nested = CANDIDATES.filter((c) => c.via === "builder");
    if (nested.length) {
      const spec = { format: "decko-reference-deck/1", clock: baseClock(), environment: { origin: "http://deck.example", default_html_view: "titled" }, cards: nested.map((c) => ({ name: c.card, ...c.fields })) };
      const specPath = join(scratch, "nested.json");
      writeFileSync(specPath, JSON.stringify(spec, null, 2));
      const run = spawnSync("bundle exec decko runner ../build-deck.rb", [], {
        shell: true,
        cwd: join(REPO, "reference-harness", "oracle", "app"),
        env: {
          ...process.env,
          RAILS_ENV: "development",
          DATABASE_URL: `sqlite3:${slash(dbPath)}`,
          DECKO_FILES_DIR: slash(filesDir),
          DECKO_CACHE_DIR: join(work, "cache"),
          DECK_JSON: slash(specPath),
          RUBY_THREAD_VM_STACK_SIZE: "67108864",
          RUBY_THREAD_MACHINE_STACK_SIZE: "268435456",
        },
        windowsHide: true,
        encoding: "utf8",
      });
      const out = `${run.stdout ?? ""}
${run.stderr ?? ""}`;
      // Success is the builder's own report line with its created count, on a
      // zero exit; anything else is a refusal (the builder's deck build error
      // is quoted), never a silent pass.
      const built = run.status === 0 && /"created":\s*\d+/.test(out);
      const failed = !built;
      const made = failed ? [] : nested.map((c) => ({ ...c, fields: c.fields, why: c.why }));
      for (const c of nested) {
        process.stderr.write(`${failed ? "REFUSED" : "created"} ${c.card}${failed ? ` - ${(out.match(/deck build failed[^\n]*/) ?? [""])[0].slice(0, 240)}` : ""}
`);
      }
      if (failed) for (const c of nested) refused.push({ ...c, answer: (out.match(/deck build failed[^\n]*/) ?? ["unknown"])[0] });
      else accepted.push(...made);
    }
    // The adapter phase: the flat cards, one write each, after the builder's.
    for (const op of CANDIDATES.filter((c) => c.via !== "builder")) {
      const answer = await adapterCreate(dbPath, filesDir, work, op);
      const result = answer.ok ? answer.result : null;
      const saved = result && result.saved === true;
      if (saved) accepted.push(op);
      else refused.push({ ...op, answer: result ?? answer.error });
      process.stderr.write(
        `${saved ? "created" : "REFUSED"} ${op.card}${saved ? "" : ` - ${JSON.stringify(result?.errors ?? answer.error).slice(0, 300)}`}\n`,
      );
    }
    if (process.argv.includes("--dry")) return;
    // The deck the fixture holds is the copy the oracle wrote, with the cards
    // Ruby accepted, and its deck.json records those cards.
    const fixtureDeck = join(fixtureDir, "deck");
    rmSync(fixtureDeck, { recursive: true, force: true });
    mkdirSync(fixtureDeck, { recursive: true });
    cpSync(dbPath, join(fixtureDeck, "deck.sqlite3"));
    cpSync(filesDir, join(fixtureDeck, "files"), { recursive: true });
    const baseSpec = JSON.parse(readFileSync(join(syntheticDir, "deck.json"), "utf8"));
    const have = new Set(baseSpec.cards.map((c) => c.name));
    const cards = baseSpec.cards.filter((c) => have.has(c.name));
    for (const op of accepted) {
      cards.push({ name: op.card, ...(op.fields.type ? { type: op.fields.type } : {}), ...(op.fields.content ? { content: op.fields.content } : {}), ...(op.fields.fields ? { fields: op.fields.fields } : {}) });
    }
    const spec = {
      ...baseSpec,
      name: "synthetic-v2-mod-probes",
      built_from: "reference-harness/fixtures/synthetic-v2/deck/deck.sqlite3 with the cards below applied by tools/compat-report/probe-deck.mjs through the Ruby oracle's adapter (decko setup cannot create the mod symlinks on this machine)",
      cards,
    };
    writeFileSync(join(fixtureDir, "deck.json"), JSON.stringify(spec, null, 2) + "\n");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const live = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE trash = 0 OR trash IS NULL").get().n;
    db.close();
    process.stderr.write(`fixture deck rewritten: ${accepted.length} card(s) added, ${live} live cards\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
  if (refused.length) {
    process.stderr.write(`\n${refused.length} card(s) Ruby refused:\n`);
    for (const r of refused) process.stderr.write(`  ${r.card} - ${r.why}\n`);
  }
}

await main();