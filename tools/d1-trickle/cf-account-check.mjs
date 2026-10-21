#!/usr/bin/env node
// tools/d1-trickle/cf-account-check.mjs — read-only inspection of the
// Cloudflare account a credentials file points at. Given the creds file
// plus the two key names to look up in it (an API token and an account
// id), this verifies the token and reports what the token can read: the
// account name and type, its D1 databases, its Workers scripts and
// subdomain, and its plan subscriptions. Nothing is mutated, and secrets
// never reach the output — error strings are masked before printing.
//
//   node tools/d1-trickle/cf-account-check.mjs --creds-file <file> \
//        --token-key <TOKEN_KEY_NAME> --account-key <ACCOUNT_ID_KEY_NAME>

import { D1HttpExecutor, readCredsFile, maskSecrets } from "./executors.mjs";

const argv = process.argv.slice(2);
const arg = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? undefined : argv[i + 1];
};
const tokenKey = arg("token-key");
const accountKey = arg("account-key");
const credsFile = arg("creds-file");
// Every flag this script needs, checked before anything is read from disk.
// Without this, omitting --creds-file reaches readCredsFile as undefined and
// comes back as `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be
// of type string`, which says nothing about the flag the operator left off.
for (const [flag, value] of [
  ["--creds-file", credsFile],
  ["--token-key", tokenKey],
  ["--account-key", accountKey],
]) {
  if (!value) throw new Error(`cf-account-check needs ${flag}; see the usage block above`);
}
// Then the credentials themselves. The executor's constructor already refuses an
// empty account id or token, so this does not close a hole - it names which key
// the file is missing and which file was read, which the constructor's message
// does not, and it does so before a report object exists. A path that cannot be
// read still surfaces as the read error, which already names the path.
const c = readCredsFile(credsFile, [tokenKey, accountKey]);
if (!c[accountKey] || !c[tokenKey]) {
  throw new Error(
    `cf-account-check needs ${accountKey} and ${tokenKey} in ${credsFile}; that file does not carry both`
  );
}
const acct = c[accountKey];
const secrets = [c[tokenKey]];
const api = new D1HttpExecutor({ accountId: acct, apiToken: c[tokenKey] });

async function probe(label, path, pick) {
  try {
    const j = await api.api("GET", path);
    return { [label]: pick(j.result, j) };
  } catch (e) {
    return { [label]: `unavailable: ${maskSecrets(String(e.message), secrets).slice(0, 160)}` };
  }
}

const out = {};
Object.assign(out, await probe("token", `/accounts/${acct}/tokens/verify`, (r) => ({ status: r?.status, expires_on: r?.expires_on ?? null })));
if (typeof out.token === "string") Object.assign(out, await probe("user_token", `/user/tokens/verify`, (r) => ({ status: r?.status, expires_on: r?.expires_on ?? null })));
Object.assign(out, await probe("account", `/accounts/${acct}`, (r) => ({ name: r?.name, type: r?.type })));
Object.assign(out, await probe("d1_databases", `/accounts/${acct}/d1/database?per_page=100`, (r) => (r ?? []).map((d) => ({ name: d.name, uuid: d.uuid, file_size: d.file_size, num_tables: d.num_tables }))));
Object.assign(out, await probe("workers_scripts", `/accounts/${acct}/workers/scripts`, (r) => (r ?? []).map((s) => s.id)));
Object.assign(out, await probe("workers_subdomain", `/accounts/${acct}/workers/subdomain`, (r) => r?.subdomain ?? null));
Object.assign(out, await probe("subscriptions", `/accounts/${acct}/subscriptions`, (r) => (r ?? []).map((s) => ({ product: s.rate_plan?.public_name ?? s.rate_plan?.id, price: s.price, frequency: s.frequency, state: s.state }))));
console.log(JSON.stringify(out, null, 1));
