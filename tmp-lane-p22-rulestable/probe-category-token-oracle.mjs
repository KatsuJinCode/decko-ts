// Lane p22-rulestable probe: extract every _rule-item div's class attribute
// from the Number and Phrase oracle pages (expected-v2 page-lane yardstick),
// so the _category-recent divergence is read from ORACLE BYTES, not inferred.
import { readdirSync, readFileSync } from "node:fs";

const DIR =
  "C:/localProjects/decko-ts-lane-p21-fixtoggle/tmp/raw-ground-truth/expected-v2/page-lane";
const WANT = new Set(["Number", "Phrase"]);

for (const f of readdirSync(DIR).filter((f) => /^recapture-raw-shard-\d+\.jsonl$/.test(f))) {
  const lines = readFileSync(`${DIR}/${f}`, "utf8").split("\n");
  for (const line of lines) {
    if (!line.includes('"page"')) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.lane !== "page" || !WANT.has(obj.name)) continue;
    const html = obj.page_html ?? "";
    console.log(`\n===== ${obj.name} (${f}, ${html.length} bytes) =====`);
    const re = /class="([^"]*_rule-item[^"]*)"/g;
    let m;
    const counts = {};
    while ((m = re.exec(html)) !== null) {
      counts[m[1]] = (counts[m[1]] ?? 0) + 1;
    }
    for (const [cls, n] of Object.entries(counts)) {
      console.log(`  ${n}x  ${cls}`);
    }
    // also show the data-card-name near each rule-item to identify settings
    const divRe = /<div[^>]*class="[^"]*_rule-item[^"]*"[^>]*>/g;
    let d;
    while ((d = divRe.exec(html)) !== null) {
      const start = Math.max(0, d.index - 40);
      console.log("  ctx:", JSON.stringify(html.slice(start, d.index + d[0].length + 120)));
    }
  }
}
