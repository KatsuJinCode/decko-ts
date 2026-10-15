// cost-model.test.ts -- the cost model runs, and docs/cost-model.md says what
// it says.
//
// The release post quotes monthly costs from docs/cost-model.md. Those figures
// come from tools/cost-model/model.mjs and its input file. If the model, the
// prices or the measured figures change and the doc is not regenerated, the
// post quotes a cost the repo cannot reproduce. This test is what makes that
// impossible:
//
// 1. The script runs as a program, in both output modes, and exits 0.
// 2. Its markdown output is exactly the generated block in docs/cost-model.md.
// 3. Every citation in the input file still matches the repo: each quoted
//    line is in the file it names, each JSON field is present, every price has
//    a source URL, and the deck manifest, seed header and blob count agree.
// 4. Two spot figures, computed by hand from the inputs, are what the model
//    says: Bunny's threshold at the account minimum, and Workers Paid CPU
//    overage at 10,000,000 views.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BEGIN_MARK,
  DOC_PATH,
  END_MARK,
  build,
  checkCitations,
  headlineJson,
  loadInputs,
  renderMarkdown,
  scenarios,
} from "../../tools/cost-model/model.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(REPO, "tools", "cost-model", "model.mjs");

function run(args: string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
}

function docBlock(): string {
  const doc = readFileSync(DOC_PATH, "utf8");
  const start = doc.indexOf(BEGIN_MARK);
  const end = doc.indexOf(END_MARK);
  expect(start, "docs/cost-model.md must contain the BEGIN marker").toBeGreaterThanOrEqual(0);
  expect(end, "docs/cost-model.md must contain the END marker").toBeGreaterThan(start);
  // The doc is CRLF; the renderer emits LF. Compare line by line.
  return doc.slice(start + BEGIN_MARK.length, end).replace(/\r\n/g, "\n").trim();
}

describe("cost model", () => {
  it("runs as a program and prints its tables", () => {
    const out = run([]);
    expect(out).toContain("### Headline");
    expect(out).toContain("### Cost by traffic level");
    expect(out).toContain("### Inputs");
    // A citation the repo does not satisfy must fail the run, not print.
    expect(out).not.toContain("citation:");
  });

  it("prints the headline figures as JSON", () => {
    const out = run(["--json"]);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.prices_read_date).toBe(loadInputs().prices_read_date);
    expect(typeof parsed.cf_paid_usd).toBe("number");
    expect(typeof parsed.bunny_min_views_per_month).toBe("number");
    // The same values as the markdown run, from the same build.
    expect(parsed).toEqual(headlineJson(build()) as unknown as Record<string, unknown>);
  });

  it("matches the generated block in docs/cost-model.md", () => {
    const b = build();
    expect(docBlock()).toBe(renderMarkdown(b).trim());
  });

  it("has every citation backed by the repo", () => {
    expect(checkCitations(loadInputs())).toEqual([]);
  });

  it("gives every price a source URL and a read date", () => {
    const inp = loadInputs();
    expect(inp.prices_read_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const [name, price] of Object.entries<Record<string, unknown>>(inp.prices)) {
      expect(typeof price.source, `price ${name} needs a source`).toBe("string");
      expect(price.source as string).toMatch(/^https:\/\//);
    }
    expect(inp.fx.eur_usd.source).toMatch(/^https:\/\//);
  });

  it("computes Bunny's account-minimum threshold by hand", () => {
    const b = build();
    const bun = b.inputs.prices.bunny;
    const min = bun.account_minimum_usd_per_month;
    const warm = scenarios(b.inputs)[0]!;
    const boots = b.inputs.measurements.cold_boots_per_day_ceiling.value * b.days;
    const cold = b.inputs.measurements.cold_home_first_request.workerd_process_cpu_ms;
    const usage = (views: number) => {
      const req = Math.ceil(views / 1e6) * bun.edge_scripting.usd_per_million_requests;
      const cpu =
        Math.ceil(((views * warm.cpuMs + boots * cold) / 1000) / 1000) *
        bun.edge_scripting.usd_per_1000_cpu_seconds;
      const db = ((views * warm.rowsPerView) / 1e9) * bun.database.usd_per_billion_rows_read;
      const cdn =
        ((views * b.bytesPerView) / 1e9) * bun.cdn_standard_eu_na_usd_per_gb;
      const storage = b.storageGb * bun.database.usd_per_gb_month_per_region;
      return req + cpu + db + cdn + storage;
    };
    const at = b.headline.bunny_min_views_per_month;
    expect(at).toBeGreaterThan(0);
    expect(usage(at)).toBeLessThanOrEqual(min);
    expect(usage(at + 1)).toBeGreaterThan(min);
  });

  it("computes Workers Paid CPU overage at 10,000,000 views by hand", () => {
    const b = build();
    const paid = b.inputs.prices.cloudflare_workers.paid;
    const warm = scenarios(b.inputs)[0]!;
    const views = b.headline.cf_paid_views_per_month;
    const cpuMs = views * warm.cpuMs + b.boots * b.coldCpuMs;
    const over = Math.max(0, cpuMs - paid.included_cpu_ms_per_month);
    const requests = Math.max(0, views - paid.included_requests_per_month);
    const expected =
      paid.plan_usd_per_month +
      (requests / 1e6) * paid.usd_per_million_requests_over_included +
      (over / 1e6) * paid.usd_per_million_cpu_ms_over_included;
    expect(b.headline.cf_paid_usd).toBeCloseTo(expected, 2);
  });

  it("keeps Workers Free's monthly ceiling at 30 days of the daily request cap", () => {
    const b = build();
    const perDay = b.inputs.prices.cloudflare_workers.free.requests_per_day;
    expect(b.headline.cf_free_views_per_month).toBe(perDay * b.days);
    expect(b.headline.cf_free_binding_warm).toBe("requests");
    // The uncached ceiling is far lower: D1 rows read bind it first.
    expect(b.headline.cf_free_views_per_month_uncached).toBeLessThan(perDay * b.days);
    expect(b.headline.cf_free_binding_uncached).toBe("d1_rows_read");
  });
});