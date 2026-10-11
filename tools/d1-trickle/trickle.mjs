#!/usr/bin/env node
// tools/d1-trickle/trickle.mjs — the D1 trickle importer's command line.
//
//   plan       freeze the import order for a source deck into <state>/plan.json
//   run        one day's import into local D1 (Miniflare) or Cloudflare D1
//   status     progress, today's usage and how many pages are complete
//   verify     every table's row count and the cards' lengths, D1 against the source
//   create-db  create the D1 database on the named account (Cloudflare only)
//
// Cloudflare access is ONLY through an API token and account id read from a
// credentials file under keys named on the command line. Nothing here reads
// wrangler's login, so a run cannot land on an account nobody named. Secrets
// are never printed; error text is masked.
//
// Examples (see the operator runbook):
//   node tools/d1-trickle/trickle.mjs plan --source deck.sqlite3 --state tmp/d1-trickle/riley \
//        --closures tmp/d1-trickle/closures.jsonl --pool page-sample-pool.txt
//   node tools/d1-trickle/trickle.mjs run --state tmp/d1-trickle/riley --target d1 \
//        --creds-file <file> --token-key RILEY_CF_API_TOKEN --account-key RILEY_CF_ACCOUNT_ID \
//        --database-name decko-riley
//   node tools/d1-trickle/trickle.mjs run --state tmp/d1-trickle/local --target miniflare --persist tmp/d1-trickle/local/d1

import { readPagePool } from "./deck-source.mjs";
import { makePlan, runImport, status, verifyAll, DEFAULT_FIXED_PAGES } from "./importer.mjs";
import { D1HttpExecutor, MiniflareD1Executor, readCredsFile, maskSecrets } from "./executors.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};
const flag = (k) => argv.includes(`--${k}`);
const need = (k) => {
  const v = arg(k);
  if (v === undefined) throw new Error(`--${k} is required`);
  return v;
};

let secrets = [];

async function cloudflare(withDatabase) {
  const credsFile = need("creds-file");
  const tokenKey = need("token-key");
  const accountKey = need("account-key");
  const c = readCredsFile(credsFile, [tokenKey, accountKey]);
  if (!c[tokenKey] || !c[accountKey]) throw new Error(`${credsFile} has no ${!c[tokenKey] ? tokenKey : accountKey}`);
  secrets = [c[tokenKey]];
  const exec = new D1HttpExecutor({ accountId: c[accountKey], apiToken: c[tokenKey] });
  if (withDatabase) {
    const name = need("database-name");
    const found = (await exec.listDatabases(name)).filter((d) => d.name === name);
    if (found.length !== 1) throw new Error(`expected exactly one D1 database named ${name} on that account, found ${found.length}`);
    exec.databaseId = found[0].uuid;
  }
  return exec;
}

async function main() {
  if (cmd === "plan") {
    const pool = arg("pool") ? readPagePool(arg("pool")) : [];
    const fixed = arg("fixed") ? arg("fixed").split(",") : DEFAULT_FIXED_PAGES;
    const p = makePlan({ sourcePath: need("source"), stateDir: need("state"), closuresPath: arg("closures"), poolPages: pool, fixedPages: fixed, unitCost: Number(arg("unit-cost", "2000")) });
    const byTier = {};
    for (const u of p.units) {
      const t = (byTier[u.tier] ??= { units: 0, rows_written: 0, cards: 0 });
      t.units += 1;
      t.rows_written += u.cost;
      if (u.kind === "cards") t.cards += u.ids.length;
    }
    console.log(JSON.stringify({ plan_hash: p.plan_hash, units: p.units.length, rows_written_total: p.totalCost, by_tier: byTier, pages: p.pages.length, pages_closed: p.pages.filter((x) => x.status === "closed").length }, null, 1));
  } else if (cmd === "run") {
    const target = need("target");
    const dryRun = flag("dry-run");
    let exec;
    if (target === "miniflare") exec = await MiniflareD1Executor.open({ persistDir: need("persist"), dbName: arg("database-name", "decko-trial-deployment") });
    else if (target === "d1") exec = dryRun && !arg("creds-file") ? { accountUsageToday: async () => undefined, close: async () => {} } : await cloudflare(true);
    else throw new Error("--target is miniflare or d1");
    try {
      const s = await runImport({
        stateDir: need("state"),
        exec,
        dailyLimit: Number(arg("daily-limit", "100000")),
        share: Number(arg("share", "0.9")),
        dryRun,
        maxUnits: arg("max-units") ? Number(arg("max-units")) : Infinity,
        log: flag("quiet") ? () => {} : (m) => console.error(m),
        // --as-of simulates a later UTC day; local D1 only, never Cloudflare.
        ...(arg("as-of") ? { now: () => { if (target !== "miniflare") throw new Error("--as-of is for the local target only"); return new Date(`${arg("as-of")}T12:00:00Z`); } } : {}),
      });
      console.log(JSON.stringify(s, null, 1));
    } finally {
      await exec.close();
    }
  } else if (cmd === "verify") {
    const target = need("target");
    const exec = target === "miniflare" ? await MiniflareD1Executor.open({ persistDir: need("persist"), dbName: arg("database-name", "decko-trial-deployment") }) : await cloudflare(true);
    try {
      const r = await verifyAll(need("state"), exec);
      console.log(JSON.stringify(r, null, 1));
      if (!r.ok) process.exitCode = 3;
    } finally {
      await exec.close();
    }
  } else if (cmd === "status") {
    console.log(JSON.stringify(status(need("state")), null, 1));
  } else if (cmd === "create-db") {
    const exec = await cloudflare(false);
    const name = need("database-name");
    const existing = (await exec.listDatabases(name)).filter((d) => d.name === name);
    if (existing.length > 0) {
      console.log(JSON.stringify({ exists: true, name, uuid: existing[0].uuid }));
      return;
    }
    if (!flag("yes")) {
      console.log(JSON.stringify({ would_create: name, note: "add --yes to create it" }));
      return;
    }
    const db = await exec.createDatabase(name);
    console.log(JSON.stringify({ created: true, name: db.name, uuid: db.uuid }));
  } else {
    console.error("usage: trickle.mjs plan|run|status|verify|create-db (see the header of this file)");
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(maskSecrets(e?.stack ?? e, secrets));
  process.exitCode = 1;
});
