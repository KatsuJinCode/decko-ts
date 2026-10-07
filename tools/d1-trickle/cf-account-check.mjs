#!/usr/bin/env node
// tools/d1-trickle/cf-account-check.mjs — read-only look at the Cloudflare
// account named by an API token and account id from a credentials file:
// whether the token is valid, the account's name, its D1 databases, its
// Workers scripts and subdomain, and its plan subscriptions where the token
// may read them. Changes nothing; prints no secret.
//
//   node tools/d1-trickle/cf-account-check.mjs --creds-file <file> \
//        --token-key BRANDON_CF_API_TOKEN --account-key BRANDON_CF_ACCOUNT_ID

import { D1HttpExecutor, readCredsFile, maskSecrets } from "./executors.mjs";

const argv = process.argv.slice(2);
const arg = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? undefined : argv[i + 1];
};
const tokenKey = arg("token-key");
const accountKey = arg("account-key");
const c = readCredsFile(arg("creds-file"), [tokenKey, accountKey]);
const secrets = [c[tokenKey]];
const api = new D1HttpExecutor({ accountId: c[accountKey], apiToken: c[tokenKey] });
const acct = c[accountKey];

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
