// Serves the TypeScript port over HTTP for the browser scenarios, through the
// port's own Node host (vm-staging-server.mjs, built into dist/ with
// `tsc -p tsconfig.json`), on the session's deck copy (see ../lib/engines.mjs).
//
// Before the host loads, the fixture's clock and default nest view are applied
// as the TS adapter applies them, with this server's own address as the deck
// origin (the Ruby server does the same). Two harness-only paths are answered
// in front of the host: GET /__harness/ready and GET /__harness/mail (the
// host's captured mail, drained, as [{to, subject, text}]).

import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const dist = (p) => pathToFileURL(path.join(repo, "dist", "src", p)).href;

const spec = JSON.parse(readFileSync(process.env.HARNESS_DECK_JSON, "utf8"));
const port = process.env.HARNESS_PORT;

const { setDeckEnvironment } = await import(dist("card/render/deck-origin.js"));
// The origin is this server's own address, as for the Ruby server: a browser
// follows absolute links and redirects built on it.
setDeckEnvironment({ origin: `http://127.0.0.1:${port}`, defaultHtmlView: spec.environment?.default_html_view });
const { setCaptureWallClock } = await import(dist("card/wall-clock.js"));
setCaptureWallClock(new Date(spec.clock));

// The render engine's freshness stamp is a port-only table (as in the TS adapter).
{
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(process.env.HARNESS_DECK);
  db.exec(`CREATE TABLE IF NOT EXISTS "deck_data_version" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0);
           INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0);`);
  db.close();
}

process.env.DECKO_WRITE_PATH = "1";
process.env.DECKO_MAIL_CAPTURE = "1";
process.env.DECKO_FILES_DIR = process.env.HARNESS_FILES;
process.env.DECKO_ORIGIN = `http://127.0.0.1:${port}`;
process.env.COMPILED_ASSETS_DIR = process.env.HARNESS_FILES;
process.env.DECKO_TOKEN_SECRET = "browser-scenarios-fixture-secret";
// Passwords ride the Ruby-beside-the-port mode (password-hash.ts): the
// fixture deck stores Ruby's SHA-1 digests, the harness deck is shared with
// the Ruby oracle, and the port's PBKDF2 upgrade at sign-in would write row
// deltas Ruby never writes. Ruby-side parity is the engine behavior under
// test; the production PBKDF2 default is a host decision, not an engine one.
process.env.DECKO_PASSWORD_HASH = "legacy-sha1";
// A fresh deck served as stock Decko serves it (see vm-staging-server.mjs).
process.env.DECKO_DECK_PROFILE = "stock";
// The mods' public files (TinyMCE's theme, ace's modes): the same files the
// Ruby oracle app serves from public/mod/<mod> (decko setup links each mod's
// public directory). run-all forwards its --decko checkout here; a direct run
// falls back to the machine's decko checkout when it carries mod/.
const DECKO_CHECKOUT_WITH_MODS = process.env.DECKO_RUBY_PERF ?? "$REPO_ROOT/../decko-ruby-perf";
process.env.DECKO_MOD_PUBLIC_DIR ??= existsSync(path.join(DECKO_CHECKOUT_WITH_MODS, "mod"))
  ? DECKO_CHECKOUT_WITH_MODS
  : path.join(repo, "reference-harness", "oracle", "app", "public");

const realCreateServer = http.createServer;
http.createServer = (...args) => {
  const listener = args.find((a) => typeof a === "function");
  const wrapped = async (req, res) => {
    if (req.url === "/__harness/ready") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ready");
      return;
    }
    if (req.url === "/__harness/mail") {
      const inner = await fetch(`http://127.0.0.1:${port}/_mail-log`).then((r) => r.json()).catch(() => ({ messages: [] }));
      const mail = (inner.messages ?? []).map((m) => ({
        to: String(m.to ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort(),
        subject: m.subject ?? "",
        text: m.textBody ?? m.text ?? "",
      }));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(mail));
      return;
    }
    return listener(req, res);
  };
  return realCreateServer(...args.map((a) => (a === listener ? wrapped : a)));
};

process.argv = [process.argv[0], path.join(repo, "vm-staging-server.mjs"), process.env.HARNESS_DECK, port];
await import(pathToFileURL(path.join(repo, "vm-staging-server.mjs")).href);
