#!/usr/bin/env node
// Distils the hosted account entry discovery into one capture, so the row's
// question can be answered by COMPARING this run's receipt with the receipt
// of record, instead of by reading two directories of page evidence.
//
//   node tools/smell-row-r4/distill-hosted-account-entry.mjs <fresh-receipt.json> <receipt-of-record.json> <out-file>
//
// Both receipts are the instrument's own output. Nothing is re-measured here.

import { readFileSync, writeFileSync } from "node:fs";

const [freshPath, recordPath, priorReportPath, outFile] = process.argv.slice(2);
if (!freshPath || !recordPath || !priorReportPath || !outFile) {
  console.error("usage: distill-hosted-account-entry.mjs <fresh-receipt.json> <receipt-of-record.json> <prior-report.json> <out-file>");
  process.exit(2);
}

const read = (file) => JSON.parse(readFileSync(file, "utf8"));

/** What the instrument saw on one route: the status, the page's own title,
 *  the forms it served with their field names, its links, and the harness's
 *  own asset and console counters. */
function pages(receipt) {
  return (receipt.pages ?? []).map((page) => ({
    route: page.route,
    status: page.status ?? null,
    error: page.error ?? null,
    title: page.surface?.title ?? null,
    url: page.surface?.url ?? null,
    formActions: (page.surface?.forms ?? []).map((form) => form.action),
    inputNames: (page.surface?.forms ?? []).flatMap((form) => (form.inputs ?? []).map((input) => input.name).filter(Boolean)),
    linkHrefs: (page.surface?.links ?? []).map((link) => link.href),
    assetFailures: (page.assetFailures ?? []).length,
    consoleErrors: (page.consoleErrors ?? []).length,
  }));
}

const fresh = read(freshPath);
const record = read(recordPath);
const prior = read(priorReportPath);
const freshPages = pages(fresh);
const recordPages = pages(record);

const capture = {
  row: "discover-hosted-account-entry",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-account-entry.mjs",
  origin: fresh.origin,
  scope: fresh.scope,
  startedAt: fresh.startedAt,
  completedAt: fresh.completedAt,
  harnessSource: fresh.harnessSource,
  allowedAssetHosts: prior.provenance?.readOnlyAssetHosts ?? [],
  allowedFaviconUrls: prior.provenance?.readOnlyFaviconUrls ?? [],
  pages: freshPages,
  receiptOfRecord: {
    at: record.startedAt,
    harnessSource: record.harnessSource,
    pages: recordPages,
  },
  matchesReceiptOfRecord: JSON.stringify(freshPages) === JSON.stringify(recordPages),
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `pages: ${freshPages.map((page) => `${page.route} -> ${page.status}`).join(", ")}; ` +
    `matches the receipt of record: ${capture.matchesReceiptOfRecord}`,
);
