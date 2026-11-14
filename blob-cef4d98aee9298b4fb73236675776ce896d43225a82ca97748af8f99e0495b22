#!/usr/bin/env node
// Cost model: what a Decko site costs per month to serve on Cloudflare
// Workers, on Bunny and on a conventional Ruby host, computed from the
// measured per-page figures in this repository and the prices in inputs.json.
//
// Every number used here comes from tools/cost-model/inputs.json. Each entry
// there names its source: a URL and read date for prices, or a repo file and
// the exact text or JSON field for measurements. checkCitations() verifies
// those against the repo, and the test in tests/tools/cost-model.test.ts runs
// it.
//
// Usage:
//   node tools/cost-model/model.mjs            print the tables (markdown)
//   node tools/cost-model/model.mjs --json     print the headline figures
//   node tools/cost-model/model.mjs --write-doc
//       replace the generated block in docs/cost-model.md

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const INPUTS_PATH = join(REPO, "tools", "cost-model", "inputs.json");
export const DOC_PATH = join(REPO, "docs", "cost-model.md");
export const BEGIN_MARK = "<!-- BEGIN GENERATED: tools/cost-model/model.mjs -->";
export const END_MARK = "<!-- END GENERATED: tools/cost-model/model.mjs -->";

const readRepo = (rel) => readFileSync(join(REPO, rel), "utf8");
const readJsonRepo = (rel) => JSON.parse(readRepo(rel));

export function loadInputs(path = INPUTS_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Read a dotted path such as "warm_home.workerd_process_cpu_ms_high" from the
// measurements block. Fails loudly on a missing key.
function measured(inp, dotted) {
  let cur = inp;
  for (const part of dotted.split(".")) {
    if (cur == null || !(part in cur)) {
      throw new Error(`cost-model: inputs has no "${dotted}"`);
    }
    cur = cur[part];
  }
  return cur;
}

// Figures held in repo files, read at run time (not copied into inputs.json).
export function resolveRepoFigures(inp) {
  const m = inp.measurements;
  const manifest = readJsonRepo(m.deck.manifest_file);
  const uc = m.uncached_render;
  const table = readJsonRepo(uc.source_file)[uc.json_table];
  const uncached = {};
  for (const [id, label] of Object.entries(uc.pages)) {
    const row = table.find((r) => r[uc.render_key] === label);
    if (!row) {
      throw new Error(`cost-model: no row "${label}" in ${uc.source_file}`);
    }
    uncached[id] = {
      statements: row[uc.statements_key],
      rows: row[uc.rows_key],
    };
  }
  return {
    cards: manifest[m.deck.cards_json_path],
    references: manifest[m.deck.references_json_path],
    storageBytes: manifest[m.deck.storage_bytes_json_path],
    uncached,
  };
}

// Verify every citation in inputs.json against the repo. Returns a list of
// problems; an empty list means every cited text and field is there.
export function checkCitations(inp) {
  const problems = [];
  const m = inp.measurements;

  const seed = readRepo(m.deck.seed_file);
  if (!seed.includes(m.deck.seed_text_contains)) {
    problems.push(`${m.deck.seed_file} lacks "${m.deck.seed_text_contains}"`);
  }
  const blobs = (seed.match(/blob/gi) || []).length;
  if (blobs !== m.deck.blob_mentions) {
    problems.push(`${m.deck.seed_file} has ${blobs} "blob" mentions, inputs say ${m.deck.blob_mentions}`);
  }
  const manifest = readJsonRepo(m.deck.manifest_file);
  for (const key of [m.deck.cards_json_path, m.deck.references_json_path, m.deck.storage_bytes_json_path]) {
    if (!(key in manifest)) problems.push(`${m.deck.manifest_file} lacks "${key}"`);
  }
  if (manifest[m.deck.cards_json_path] !== 2287) {
    problems.push(`${m.deck.manifest_file} cards is not the 2287 the seed header states`);
  }

  for (const [name, entry] of Object.entries(m)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.text_contains) {
      const text = readRepo(entry.source_file);
      if (!text.includes(entry.text_contains)) {
        problems.push(`${name}: "${entry.text_contains}" not found in ${entry.source_file}`);
      }
    }
  }

  const uc = m.uncached_render;
  const table = readJsonRepo(uc.source_file)[uc.json_table];
  for (const label of Object.values(uc.pages)) {
    if (!table.some((r) => r[uc.render_key] === label)) {
      problems.push(`${uc.source_file} has no row "${label}"`);
    }
  }

  if (!inp.fx?.eur_usd?.source) problems.push("fx.eur_usd has no source");
  for (const [name, p] of Object.entries(inp.prices)) {
    if (name.startsWith("_")) continue;
    if (!p.source) problems.push(`prices.${name} has no source URL`);
  }
  if (!inp.prices_read_date) problems.push("prices_read_date is missing");
  return problems;
}

// One scenario: how many D1 rows and what CPU each page view costs.
export function scenarios(inp) {
  const warm = inp.measurements.warm_d1;
  const cpu = measured(inp, inp.assumptions.cpu_basis_warm.value);
  const uncachedCpu = measured(inp, inp.assumptions.cpu_basis_uncached.value);
  return [
    {
      id: "warm",
      label: "Warm (cached render, the measured figure)",
      cpuMs: cpu,
      rowsPerView: warm.rows_read_per_page,
      statementsPerView: warm.queries_per_page,
    },
    {
      id: "uncached",
      label: "Uncached home render (plan estimate, rows and statements only)",
      cpuMs: uncachedCpu,
      rowsPerView: null, // filled from the repo figures in build()
      statementsPerView: null,
    },
  ];
}

// The whole computation. Pure given the inputs and the repo figures.
export function build(inp = loadInputs()) {
  const fig = resolveRepoFigures(inp);
  const days = inp.assumptions.days_per_month.value;
  const monthlyViewsCap = (perDay) => perDay * days;
  const bytesPerView = inp.measurements.warm_home.bytes_per_response;
  const storageGb = fig.storageBytes / inp.assumptions.decimal_gigabyte.value;
  const boots = inp.measurements.cold_boots_per_day_ceiling.value * days;
  const coldCpuMs = measured(inp, inp.assumptions.cold_boot_cpu_basis.value);
  // Assumption values are full dotted paths (for example measurements.warm_home.x).
  const rowsWrittenPerView = inp.assumptions.rows_written_per_view.value;

  const sc = scenarios(inp);
  sc[1].rowsPerView = fig.uncached.home.rows;
  sc[1].statementsPerView = fig.uncached.home.statements;

  const cw = inp.prices.cloudflare_workers;
  const cd = inp.prices.cloudflare_d1;
  const bu = inp.prices.bunny;
  const hz = inp.prices.hetzner_cx23_eu;

  // Workers Free: the binding limit is whichever of the requests cap, the D1
  // daily rows-read quota, or the 10 ms CPU limit is hit first.
  function cfFree(scn) {
    const reqCap = monthlyViewsCap(cw.free.requests_per_day);
    const rowsCap = Math.floor(monthlyViewsCap(cd.free.rows_read_per_day) / scn.rowsPerView);
    const cpuOk = scn.cpuMs <= cw.free.cpu_ms_per_invocation;
    const max = Math.min(reqCap, rowsCap);
    const binding = !cpuOk ? "cpu" : rowsCap < reqCap ? "d1_rows_read" : "requests";
    return { maxViewsPerMonth: cpuOk ? max : 0, binding, cpuOk, reqCap, rowsCap };
  }

  function cfPaid(scn, views) {
    const reqOver = Math.max(0, views - cw.paid.included_requests_per_month);
    const cpuMsTotal = views * scn.cpuMs + boots * coldCpuMs;
    const cpuOver = Math.max(0, cpuMsTotal - cw.paid.included_cpu_ms_per_month);
    const rowsRead = views * scn.rowsPerView;
    const rowsOver = Math.max(0, rowsRead - cd.paid.included_rows_read_per_month);
    const rowsWritten = views * rowsWrittenPerView;
    const writesOver = Math.max(0, rowsWritten - cd.paid.included_rows_written_per_month);
    const storageOver = Math.max(0, storageGb - cd.paid.included_storage_gb);
    const lines = {
      plan: cw.paid.plan_usd_per_month,
      requests: (reqOver / 1e6) * cw.paid.usd_per_million_requests_over_included,
      cpu: (cpuOver / 1e6) * cw.paid.usd_per_million_cpu_ms_over_included,
      d1_rows_read: (rowsOver / 1e6) * cd.paid.usd_per_million_rows_read_over_included,
      d1_rows_written: (writesOver / 1e6) * cd.paid.usd_per_million_rows_written_over_included,
      d1_storage: storageOver * cd.paid.usd_per_gb_month_storage_over_included,
      r2_storage: 0,
    };
    const total = Object.values(lines).reduce((a, b) => a + b, 0);
    return { usd: total, lines, cpuMsTotal, rowsRead };
  }

  // Bunny bills increments; the account minimum sets the floor.
  function bunny(scn, views) {
    const reqIncrements = Math.ceil(views / 1e6);
    const cpuSeconds = (views * scn.cpuMs + boots * coldCpuMs) / 1000;
    const cpuIncrements = Math.ceil(cpuSeconds / 1000);
    const lines = {
      edge_requests: reqIncrements * bu.edge_scripting.usd_per_million_requests,
      edge_cpu: cpuIncrements * bu.edge_scripting.usd_per_1000_cpu_seconds,
      db_rows_read: ((views * scn.rowsPerView) / 1e9) * bu.database.usd_per_billion_rows_read,
      db_storage: storageGb * bu.database.usd_per_gb_month_per_region,
      cdn: ((views * bytesPerView) / inp.assumptions.decimal_gigabyte.value) * bu.cdn_standard_eu_na_usd_per_gb,
    };
    const usage = Object.values(lines).reduce((a, b) => a + b, 0);
    return { usd: Math.max(bu.account_minimum_usd_per_month, usage), usage, lines };
  }

  // Largest view count at which Bunny's bill is still the account minimum.
  // The bill is non-decreasing in views, so a binary search finds it.
  function bunnyMinimumViews(scn) {
    let lo = 0;
    let hi = 1e10;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (bunny(scn, mid).usage <= bu.account_minimum_usd_per_month) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Ruby on a conventional host: a fixed VPS price, with as many servers as
  // the measured Ruby CPU per page needs at the stated headroom.
  function rubyHost(views) {
    const cpuSeconds = (views * measured(inp, "measurements.ruby_cpu_ms_per_page.value")) / 1000;
    const perServer = hz.vcpus * days * 86400 * measured(inp, "assumptions.ruby_host_cpu_headroom.value");
    const servers = Math.max(1, Math.ceil(cpuSeconds / perServer));
    const egressTb = (views * bytesPerView) / 1e12;
    const extraTb = Math.max(0, egressTb - servers * hz.included_outbound_tb);
    const eur = servers * hz.eur_per_month_excl_vat + extraTb * hz.eur_per_tb_over_included;
    return { servers, eur, usd: eur * inp.fx.eur_usd.value, cpuSeconds, perServer };
  }

  const warm = sc[0];
  const unc = sc[1];
  const headlineViews = {
    cf_paid: 10000000,
    bunny_scale: 10000000,
  };
  const headline = {
    prices_read_date: inp.prices_read_date,
    cf_free_views_per_month: cfFree(warm).maxViewsPerMonth,
    cf_free_binding_warm: cfFree(warm).binding,
    cf_free_views_per_month_uncached: cfFree(unc).maxViewsPerMonth,
    cf_free_binding_uncached: cfFree(unc).binding,
    bunny_min_views_per_month: bunnyMinimumViews(warm),
    bunny_minimum_usd: bu.account_minimum_usd_per_month,
    bunny_scale_views_per_month: headlineViews.bunny_scale,
    bunny_scale_usd: round2(bunny(warm, headlineViews.bunny_scale).usd),
    cf_paid_views_per_month: headlineViews.cf_paid,
    cf_paid_usd: round2(cfPaid(warm, headlineViews.cf_paid).usd),
  };

  const rows = inp.traffic_levels_views_per_month.map((views) => ({
    views,
    cf_free_warm: views <= cfFree(warm).maxViewsPerMonth,
    cf_paid_warm: round2(cfPaid(warm, views).usd),
    cf_paid_uncached: round2(cfPaid(unc, views).usd),
    bunny_warm: round2(bunny(warm, views).usd),
    bunny_uncached: round2(bunny(unc, views).usd),
    ruby_host: round2(rubyHost(views).usd),
    ruby_servers: rubyHost(views).servers,
  }));

  return {
    days,
    bytesPerView,
    storageGb,
    boots,
    coldCpuMs,
    scenarios: sc,
    cfFree: { warm: cfFree(warm), uncached: cfFree(unc) },
    headline,
    rows,
    fig,
    inputs: inp,
  };
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

const usd = (x) => `$${x.toFixed(2)}`;
const n = (x) => x.toLocaleString("en-US");

// Markdown for docs/cost-model.md and the terminal. Deterministic: no clock
// reads, no environment, so the doc and the output can be compared exactly.
export function renderMarkdown(b) {
  const h = b.headline;
  const inp = b.inputs;
  const lines = [];
  lines.push("### Headline");
  lines.push("");
  lines.push(`Warm page (home \`/\`), ${b.days}-day month, ${b.bytesPerView.toLocaleString("en-US")} bytes per view, prices read ${inp.prices_read_date}.`);
  lines.push("");
  lines.push("| Platform | Monthly page views | Monthly cost |");
  lines.push("| --- | ---: | ---: |");
  lines.push(`| Cloudflare Workers Free | up to ${n(h.cf_free_views_per_month)} | $0 |`);
  lines.push(`| Bunny | up to ${n(h.bunny_min_views_per_month)} | ${usd(h.bunny_minimum_usd)} (the account minimum) |`);
  lines.push(`| Bunny | ${n(h.bunny_scale_views_per_month)} | ${usd(h.bunny_scale_usd)} |`);
  lines.push(`| Cloudflare Workers Paid | ${n(h.cf_paid_views_per_month)} | ${usd(h.cf_paid_usd)} |`);
  lines.push("");
  lines.push("### Cost by traffic level");
  lines.push("");
  lines.push("Warm is the measured per-page figure. Uncached is the cold per-render query plan (rows and statements from `tools/cf-cost`); its CPU is assumed equal to warm.");
  lines.push("");
  lines.push("| Views per month | Workers Free fits (warm) | Workers Paid, warm | Workers Paid, uncached | Bunny, warm | Bunny, uncached | Ruby on CX23 (servers) |");
  lines.push("| ---: | :---: | ---: | ---: | ---: | ---: | ---: |");
  for (const r of b.rows) {
    lines.push(
      `| ${n(r.views)} | ${r.cf_free_warm ? "yes" : "no"} | ${usd(r.cf_paid_warm)} | ${usd(r.cf_paid_uncached)} | ${usd(r.bunny_warm)} | ${usd(r.bunny_uncached)} | ${usd(r.ruby_host)} (${r.ruby_servers}) |`,
    );
  }
  lines.push("");
  lines.push("### Free-plan ceilings");
  lines.push("");
  lines.push(`- Warm: ${n(b.cfFree.warm.maxViewsPerMonth)} views a month, limited by ${b.cfFree.warm.binding}. The requests cap is ${n(b.cfFree.warm.reqCap)} (100,000 a day for ${b.days} days); D1 rows read at ${n(inp.measurements.warm_d1.rows_read_per_page)} row per view stays far under the 5,000,000-a-day quota.`);
  lines.push(`- Uncached: ${n(b.cfFree.uncached.maxViewsPerMonth)} views a month, limited by ${b.cfFree.uncached.binding}, because the D1 quota of 5,000,000 rows a day covers about ${n(Math.floor(5e6 / b.scenarios[1].rowsPerView))} home renders a day at ${n(b.scenarios[1].rowsPerView)} rows each.`);
  lines.push(`- A warm view costs one D1 query. An uncached view costs the statements in the plan estimate (${b.scenarios[1].statementsPerView} for the home page).`);
  lines.push("");
  lines.push("### How each figure is computed");
  lines.push("");
  lines.push(`- Workers Paid: $5 plan, plus $0.30 per million requests over ${n(inp.prices.cloudflare_workers.paid.included_requests_per_month)}, plus $0.02 per million CPU milliseconds over ${n(inp.prices.cloudflare_workers.paid.included_cpu_ms_per_month)}, plus D1 rows read over ${n(inp.prices.cloudflare_d1.paid.included_rows_read_per_month)} a month. Bandwidth is free on Workers.`);
  lines.push(`- Bunny: $0.20 per million Edge Scripting requests (billed per started million), $0.02 per started 1,000 CPU-seconds, $0.30 per billion D1 rows read, $0.01 per GB of CDN bandwidth, and the $1 account minimum as a floor on the total.`);
  lines.push(`- Ruby on CX23: ${inp.prices.hetzner_cx23_eu.vcpus} shared vCPUs, ${inp.prices.hetzner_cx23_eu.included_outbound_tb} TB outbound traffic included, EUR ${inp.prices.hetzner_cx23_eu.eur_per_month_excl_vat} a month, converted at ${inp.fx.eur_usd.value} USD per EUR. Servers are added when the Ruby CPU per page (${inp.measurements.ruby_cpu_ms_per_page.value} ms) needs more than ${inp.assumptions.ruby_host_cpu_headroom.value * 100}% of a host's vCPU time. Database, backups and operations are not costed.`);
  lines.push("");
  lines.push("### Inputs");
  lines.push("");
  lines.push("Measured (repo file):");
  lines.push("");
  lines.push(`- Warm home page: ${inp.measurements.warm_home.workerd_process_cpu_ms_low}-${inp.measurements.warm_home.workerd_process_cpu_ms_high} ms workerd CPU per view (upper bound, includes the ${inp.measurements.local_harness_floor_cpu_ms.value} ms harness floor), ${n(inp.measurements.warm_home.bytes_per_response)} bytes. Source: ${inp.measurements.warm_home.source_file}.`);
  lines.push(`- Warm D1: ${inp.measurements.warm_d1.queries_per_page} query and ${inp.measurements.warm_d1.rows_read_per_page} row read per page. Source: ${inp.measurements.warm_d1.source_file}.`);
  lines.push(`- Cold home first request: ${inp.measurements.cold_home_first_request.workerd_process_cpu_ms} ms CPU, ${inp.measurements.cold_home_first_request.d1_queries} queries, ${inp.measurements.cold_home_first_request.d1_rows_read} rows. Source: ${inp.measurements.cold_home_first_request.source_file}. Cold boots are assumed at ${inp.measurements.cold_boots_per_day_ceiling.value} a day (the free-envelope ceiling the doc states).`);
  lines.push(`- Uncached render, home: ${b.scenarios[1].statementsPerView} statements and ${n(b.scenarios[1].rowsPerView)} rows, a plan estimate and not rows-examined telemetry. Source: ${inp.measurements.uncached_render.source_file}.`);
  lines.push(`- Ruby Decko 0.20.0: ${inp.measurements.ruby_cpu_ms_per_page.value} ms CPU per page against the port's ${inp.measurements.ruby_cpu_ms_per_page.port_cpu_ms_per_page} ms. Source: ${inp.measurements.ruby_cpu_ms_per_page.source_file}; precise figure at commit ${inp.measurements.ruby_cpu_ms_per_page.detail_commit.slice(0, 8)}.`);
  lines.push(`- Deck: ${n(b.fig.cards)} cards, ${n(b.fig.references)} references, ${n(b.fig.storageBytes)} bytes of seed SQL, no blobs. Source: ${inp.measurements.deck.manifest_file}.`);
  lines.push("");
  lines.push("Prices (source URL, read " + inp.prices_read_date + "):");
  lines.push("");
  lines.push(`- Workers and plan limits: ${inp.prices.cloudflare_workers.source}, ${inp.prices.cloudflare_workers.limits_source}.`);
  lines.push(`- D1: ${inp.prices.cloudflare_d1.source}, ${inp.prices.cloudflare_d1.limits_source}.`);
  lines.push(`- R2: ${inp.prices.cloudflare_r2.source} (not used, the deck has no blobs).`);
  lines.push(`- Bunny: ${inp.prices.bunny.source}, ${inp.prices.bunny.pricing_source}, ${inp.prices.bunny.database_source}.`);
  lines.push(`- Hetzner CX23: ${inp.prices.hetzner_cx23_eu.source}, specs ${inp.prices.hetzner_cx23_eu.specs_source}.`);
  lines.push(`- Exchange rate: ${inp.fx.eur_usd.source} (${inp.fx.eur_usd.as_of}).`);
  lines.push("");
  lines.push("Assumed (not measured): a 30-day month; every view is a home page; warm CPU is the upper bound; uncached CPU equals warm; the Ruby host runs at 50% of its shared vCPUs; writes are zero; Bunny Database is priced at its listed rates although it is in public preview.");
  return lines.join("\n");
}

// The JSON the release post reads its cost placeholders from.
export function headlineJson(b) {
  return b.headline;
}

export function writeDocBlock(markdown, docPath = DOC_PATH) {
  const doc = readFileSync(docPath, "utf8");
  const start = doc.indexOf(BEGIN_MARK);
  const end = doc.indexOf(END_MARK);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`cost-model: ${docPath} lacks the generated markers`);
  }
  // Keep the file's own line endings: docs/cost-model.md is CRLF.
  const eol = doc.includes("\r\n") ? "\r\n" : "\n";
  const block = (BEGIN_MARK + "\n" + markdown + "\n").replace(/\r?\n/g, eol);
  const next = doc.slice(0, start) + block + doc.slice(end);
  writeFileSync(docPath, next);
}

function main(argv) {
  const inp = loadInputs();
  const problems = checkCitations(inp);
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`cost-model: citation: ${p}\n`);
    process.exitCode = 1;
    return;
  }
  const b = build(inp);
  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(headlineJson(b), null, 2) + "\n");
    return;
  }
  const md = renderMarkdown(b);
  if (argv.includes("--write-doc")) {
    writeDocBlock(md);
    process.stdout.write(`cost-model: wrote ${DOC_PATH}\n`);
    return;
  }
  process.stdout.write(md + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
