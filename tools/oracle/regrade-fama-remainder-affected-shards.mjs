// regrade-fama-remainder-affected-shards.mjs -- launch the direct driver over
// the shards the fama-remainder lane's engine change can touch.
//
// WHY A LAUNCHER: the test queue runs a job whose --cmd begins with `node` by
// handing the string to node itself, so a `.cmd` wrapper is loaded as an ES
// module and dies on ERR_UNKNOWN_FILE_EXTENSION. This file is the wrapper.
//
// SCOPE, argued not assumed. The lane's only engine change is in
// `prepareAdminRuntime`'s mod-card step
// (src/card/mod-loader/mods/core-admin-runtime.ts):
//   - SELECT now also reads cards.codename, and the mod card's codename is
//     the stored column (Ruby: card/mod/core/set/type/mod.rb:164-166
//     `def modname; codename.to_s.gsub(/^mod_/, ""); end`) instead of a
//     name-derived `DeckoName#key`;
//   - the `modCards.sort(by name)` is gone, so all_configs keeps the deck's
//     `Card.search(type: :mod)` order (Ruby: all/admin.rb:19-21,40-42).
// `modCards` has exactly ONE consumer chain: core-mod.ts `modCardsWithConfig`
// -> `allConfigs` (grep: the only references are core-mod.ts:513,521,585).
// `allConfigs` feeds three views, all of which are reached ONLY from a Mod-
// typed card's set/self/mod.rb views (modGlobalSectionHtml, modRolesView)
// and account set/type/role.rb's `view :configs` (core-mod.ts:723-729):
//   - `Mod` -- the Mod CARDTYPE card, one page: expected-v2/page-lane/
//     recapture-raw-shard-000039.jsonl;
//   - the role pages whose `+Dashboard` content nests `{{_L|configs}}` --
//     corpus rows 34817 `Administrator+Dashboard`, 34818 `Shark+Dashboard`,
//     34820 `Help Desk+Dashboard`. Those pages are expected-v2/page-lane/
//     recapture-raw-shard-000000.jsonl (Administrator) and
//     recapture-raw-shard-000029.jsonl (Shark, Help Desk).
// No other page reads modCards, so no other shard's bytes can move. The
// `mod: <name>` pages are NOT affected: their view
// (core-mod.ts `modCardCoreHtml`, type/mod.rb:7-19) reads the card's OWN
// stored codename (`card.record.codename`), which this change leaves alone.
//
// Usage (from the repo root):
//   node tools/oracle/regrade-fama-remainder-affected-shards.mjs <artifacts-dir>

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifacts = process.argv[2];
if (artifacts === undefined) {
  console.error("USAGE: node tools/oracle/regrade-fama-remainder-affected-shards.mjs <artifacts-dir>");
  process.exit(2);
}

const SHARDS = [
  "recapture-raw-shard-000000.jsonl",
  "recapture-raw-shard-000029.jsonl",
  "recapture-raw-shard-000039.jsonl",
];

const child = spawn(
  process.execPath,
  [
    path.join(REPO, "tools", "oracle", "dual-lane-direct-driver.mjs"),
    "--repo",
    REPO,
    "--workers",
    "1",
    "--heap-mb",
    "1536",
    "--files",
    SHARDS.join(","),
    "--artifacts",
    path.resolve(artifacts),
    "--overwrite-artifacts",
  ],
  { stdio: "inherit", cwd: REPO },
);
child.on("exit", (code, signal) => {
  console.log(`regrade driver exited code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});
