#!/usr/bin/env node
// Issue the deck's one-time first-run setup token.
//
// Generates 32 random bytes, stores only their sha256 in the D1 table
// deck_setup_tokens (deploy/migrations/0010) through `wrangler d1 execute`,
// and prints the token as the link that opens /setup. Any earlier token is
// replaced. The Worker opens its first-run window only for a request carrying
// this token (src/server/setup-token.ts), so a freshly deployed public deck
// cannot be claimed by whoever finds it first.
//
// `npm run deploy` runs this last, so the link is the final thing in the
// deploy output. Run it again (`npm run setup-token`) to issue a fresh link.
//
// Usage:
//   node tools/deploy/issue-setup-token.mjs --remote
//   node tools/deploy/issue-setup-token.mjs --local [--persist-to <dir>]
//   options: --wrangler <path/to/wrangler.js>  --base-url <https://your.deck>
//            --json   (print {"token": ..., "path": ...} instead of prose)
//
// wrangler is found from --wrangler, then WRANGLER_JS, then the working
// directory's node_modules; failing those, `npx wrangler` is used, as the
// rest of the deploy chain does.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const args = { mode: undefined, persistTo: undefined, wrangler: process.env.WRANGLER_JS, baseUrl: undefined, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--remote" || a === "--local") args.mode = a;
    else if (a === "--persist-to") args.persistTo = argv[++i];
    else if (a === "--wrangler") args.wrangler = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--json") args.json = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.mode === undefined) throw new Error("pass --remote (the deployed database) or --local (wrangler's local one)");
  return args;
}

function wranglerCommand(explicit) {
  const local = join(process.cwd(), "node_modules/wrangler/bin/wrangler.js");
  const script = explicit ? resolve(explicit) : existsSync(local) ? local : undefined;
  if (script !== undefined) return { cmd: process.execPath, prefix: [script], shell: false };
  return { cmd: "npx", prefix: ["wrangler"], shell: process.platform === "win32" };
}

const args = parseArgs(process.argv.slice(2));
const token = randomBytes(32).toString("base64url");
const digest = createHash("sha256").update(token).digest("hex");
const createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");
// Both values are generated here (hex and a fixed datetime form), so they are
// safe to inline; d1 execute --command takes no bound parameters.
const sql =
  `DELETE FROM "deck_setup_tokens"; ` +
  `INSERT INTO "deck_setup_tokens" ("token_sha256", "created_at") VALUES ('${digest}', '${createdAt}');`;

const w = wranglerCommand(args.wrangler);
const wranglerArgs = [...w.prefix, "d1", "execute", "DB", args.mode, "--command", sql];
if (args.persistTo !== undefined) wranglerArgs.push("--persist-to", args.persistTo);
const run = spawnSync(w.cmd, w.shell ? wranglerArgs.map((x) => (/[\s;"']/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)) : wranglerArgs, {
  encoding: "utf8",
  windowsHide: true,
  shell: w.shell,
  env: process.env,
});
if (run.status !== 0) {
  process.stderr.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  process.stderr.write(`\nissue-setup-token: wrangler d1 execute failed (exit ${run.status}); no token was issued.\n`);
  process.exit(1);
}

const path = `/setup?token=${token}`;
if (args.json) {
  process.stdout.write(`${JSON.stringify({ token, path })}\n`);
} else {
  const where = args.baseUrl ? `${args.baseUrl.replace(/\/+$/, "")}${path}` : `https://<your deck's address>${path}`;
  process.stdout.write(
    [
      "",
      "First-run setup link (one use; it creates your deck's owner account):",
      `  ${where}`,
      "",
      "Anyone holding this link can claim the deck until you use it, so open it now.",
      "Run `npm run setup-token` to replace it with a fresh one.",
      "",
    ].join("\n"),
  );
}
