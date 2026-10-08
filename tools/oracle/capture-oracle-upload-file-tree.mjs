// capture-oracle-upload-file-tree.mjs -- read-only capture of the Ruby
// oracle deck's CarrierWave upload storage tree (the E4.4.a file-side
// oracle the fork recount named as missing).
//
// What it captures:
//   1. every file under the oracle app's `files/` store dir and `tmp/files/`
//      upload cache, as relative posix paths + byte sizes + sha256;
//   2. the oracle deck's card_actions row count, read directly (read-only
//      sqlite connection) BEFORE and AFTER the listing.
//
// Read-only contract: the script opens every file with read handles only,
// opens the deck's sqlite database with better-sqlite3 `readonly: true`,
// and never boots the oracle app (bootUsed: false in the provenance block
// -- the Rails boot is the only write-bearing step a capture like this
// could have, and it does not run). The before/after card_actions counts
// are the no-write receipt for the capture window.
//
// Run (from the repo root so the default --out lands in the repo):
//   node tools/oracle/capture-oracle-upload-file-tree.mjs
//     [--oracle-app <dir>] [--out <file>]
//
// Defaults: --oracle-app C:/localProjects/decko-ts/tools/oracle/decko-oracle-app
//           --out      fixtures/captured/oracle-upload-file-tree.json

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function parseArgs(argv) {
  const args = { oracleApp: "C:/localProjects/decko-ts/tools/oracle/decko-oracle-app" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--oracle-app") args.oracleApp = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

/** Depth-first walk collecting every regular file's path (posix-style,
 *  relative to `base`). Read-only: readdir + readFile only. */
async function walkFiles(base, dir = base, out = []) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(base, full, out);
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

async function fileFacts(base, relPath) {
  const bytes = await readFile(join(base, relPath));
  return {
    path: relPath,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function cardActionsCount(deckDb) {
  const db = new Database(deckDb, { readonly: true });
  try {
    return db.prepare("SELECT COUNT(*) AS c FROM card_actions").get().c;
  } finally {
    db.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const outPath = args.out ?? join(REPO_ROOT, "fixtures/captured/oracle-upload-file-tree.json");
const deckDb = join(args.oracleApp, "db", "development.sqlite3");

// The no-write receipt: card_actions count BEFORE any listing work. The
// connection is read-only; the deck DB file is opened, never written.
const actionsBefore = await cardActionsCount(deckDb);
const capturedAt = new Date().toISOString();

const files = [];
for (const rel of await walkFiles(join(args.oracleApp, "files"))) {
  files.push(await fileFacts(join(args.oracleApp, "files"), rel));
}
const uploadCache = [];
for (const rel of await walkFiles(join(args.oracleApp, "tmp", "files"))) {
  uploadCache.push(await fileFacts(join(args.oracleApp, "tmp", "files"), rel));
}

// AFTER the listing: the count must be unchanged for this capture to claim
// it wrote nothing. (A concurrent capture session on the shared oracle app
// would also move it -- the receipt reports the movement, the diff decides.)
const actionsAfter = await cardActionsCount(deckDb);

const payload = {
  provenance: {
    oracleAppDir: args.oracleApp,
    deckDb,
    capturedAt,
    captureTool: "tools/oracle/capture-oracle-upload-file-tree.mjs",
    method:
      "node fs readdir/readFile walk; better-sqlite3 readonly connection for the count",
    bootUsed: false,
    cardActionsCountBefore: actionsBefore,
    cardActionsCountAfter: actionsAfter,
    noWriteProof: actionsBefore === actionsAfter,
  },
  files,
  uploadCache,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(payload, null, 2) + "\n");
console.log(`WROTE ${outPath}`);
console.log(`files: ${files.length}, uploadCache: ${uploadCache.length}`);
console.log(
  `card_actions before=${actionsBefore} after=${actionsAfter} noWrite=${payload.provenance.noWriteProof}`,
);
