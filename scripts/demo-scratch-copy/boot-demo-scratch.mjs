#!/usr/bin/env node
// boot-demo-scratch.mjs — boot the demo scratch copy: the port's own
// staging surface, on a loopback port, over the demo deck.
//
//   node scripts/demo-scratch-copy/boot-demo-scratch.mjs [--port 3117] [--deck <deck.sqlite3>]
//
// The surface is vm-staging-server.mjs, the port's own serving surface: the
// same engine the edge bundle runs, served over HTTP from a deck on disk.
// It binds 127.0.0.1 only, so the demo never leaves this machine.
//
// The boot arms the write path (DECKO_WRITE_PATH=1), because a demo whose
// cards cannot be created or edited is a screenshot, not a demo. The
// corpus file must therefore be writable: that is why the deck is a COPY
// under .runtime/, rebuilt by scripts/demo-scratch-copy/build-demo-deck.mjs.
//
// Environment this script sets, and why:
//
//   DECKO_WRITE_PATH=1        arms the write path (card create/update/delete)
//   DECKO_FILES_DIR=<deck dir>/files
//                              where NEW attachments land (the corpus's own
//                              historical attachments are not in this deck)
//   DECKO_COOKIE_SECURE=never  the session cookie is plain http on loopback
//   DECKO_ORIGIN=<base url>   absolute links (reset tokens) name this host
//   DECKO_ASSET_REFRESH=never  the read-time asset refresh is off. The
//                              refresh recompiles the deck's customized
//                              stylesheet, and this host has no SCSS
//                              compiler, so the refresh answers every page
//                              request with a 500 ("slate skin customized:
//                              this host has no SCSS compiler configured").
//                              With the refresh off the demo serves the
//                              deck's stored asset inputs. Point
//                              DECKO_SASSC at a built sassc to arm it.
//
// The process runs in the foreground and stops on Ctrl-C: the signal is
// forwarded to the server, which closes the listener and exits. Nothing
// here deploys anywhere, and nothing here touches the live edge.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_PORT = 3117;
const DEFAULT_DECK = join(repoRoot, ".runtime", "demo-scratch", "deck.sqlite3");

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, deck: DEFAULT_DECK };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--port": args.port = Number.parseInt(value, 10); i += 1; break;
      case "--deck": args.deck = resolve(value); i += 1; break;
      case "--help":
        console.log(
          "boot-demo-scratch — boot the demo scratch copy on a loopback port\n" +
          "  --port <n>          loopback port (default 3117)\n" +
          "  --deck <deck.sqlite3>  deck to serve (default .runtime/demo-scratch/deck.sqlite3)",
        );
        process.exit(0);
        break;
      default:
        console.error(`boot-demo-scratch: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!Number.isFinite(args.port) || args.port <= 0 || args.port > 65535) {
  console.error(`boot-demo-scratch: invalid port: ${args.port}`);
  process.exit(2);
}
if (!existsSync(args.deck)) {
  console.error(
    `boot-demo-scratch: no deck at ${args.deck}\n` +
    "  Build one with: node scripts/demo-scratch-copy/build-demo-deck.mjs",
  );
  process.exit(2);
}
if (!existsSync(join(repoRoot, "dist", "src", "server", "drivers", "local-sqlite.js"))) {
  console.error(
    "boot-demo-scratch: the engine distribution is not built in this checkout.\n" +
    "  Run: npm run build:engine",
  );
  process.exit(2);
}

const portFree = await new Promise((resolveFree) => {
  const probe = createServer();
  probe.once("error", () => resolveFree(false));
  probe.once("listening", () => probe.close(() => resolveFree(true)));
  probe.listen(args.port, "127.0.0.1");
});
if (!portFree) {
  console.error(`boot-demo-scratch: 127.0.0.1:${args.port} is already in use.`);
  process.exit(2);
}

const filesDir = join(dirname(args.deck), "files");
mkdirSync(filesDir, { recursive: true });

const baseUrl = `http://127.0.0.1:${args.port}`;
const env = {
  ...process.env,
  DECKO_WRITE_PATH: "1",
  DECKO_FILES_DIR: filesDir,
  DECKO_COOKIE_SECURE: "never",
  DECKO_ORIGIN: baseUrl,
  DECKO_ASSET_REFRESH: "never",
};

console.log("=== decko demo scratch copy ===");
console.log(`  address: ${baseUrl}`);
console.log(`  deck:    ${args.deck}`);
console.log(`  files:   ${filesDir}`);
console.log("  stop:    Ctrl-C");
console.log("===========================");

const server = spawn(
  process.execPath,
  [join(repoRoot, "vm-staging-server.mjs"), args.deck, String(args.port)],
  { cwd: repoRoot, env, stdio: "inherit", windowsHide: true },
);
console.log(`  server pid: ${server.pid}`);

const stop = (signal) => {
  if (server.exitCode === null && server.signalCode === null) server.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

server.on("exit", (code, signal) => {
  process.exit(signal ? 0 : code ?? 0);
});
