// scratch real-dump probe (deleted after use) — counting pass only,
// prints only counts and timings, never content.
import { dumpRows } from "./parse-dump.mjs";
import { performance } from "node:perf_hooks";

const dumpPath = process.argv[2];
const onlyCounts = {};
const t0 = performance.now();
let maxBuf = 0;
for await (const row of dumpRows(dumpPath, {
  chunkBytes: 1 << 20,
  onProgress: (bytes, rows) => {
    const mb = (bytes / 1048576).toFixed(0);
    if (process.stdout.isTTY) process.stdout.write(`\r${mb} MB, ${rows} rows`);
  },
})) {
  onlyCounts[row.table] = (onlyCounts[row.table] ?? 0) + 1;
}
const secs = (performance.now() - t0) / 1000;
console.log("\nper-table row counts:", JSON.stringify(onlyCounts));
console.log(`elapsed ${secs.toFixed(1)}s`);
