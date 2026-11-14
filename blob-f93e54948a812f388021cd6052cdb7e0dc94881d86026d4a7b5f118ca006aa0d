// Lane p22-rulestable probe: sweep EVERY page-lane oracle page, extract all
// _rule-item slot divs (data-card-name + class attr), derive the oracle's
// ACTUAL (setting codename -> recent presence) membership table, and compare
// three candidate mechanisms against it.
import { readdirSync, readFileSync } from "node:fs";

const DIR =
  "C:/localProjects/decko-ts-lane-p21-fixtoggle/tmp/raw-ground-truth/expected-v2/page-lane";

// corpus-derived facts (probed earlier from the raw corpus copy)
const RECENT_ITEMS = new Set(
  `read structure script content_options input_type default layout help thanks
   update guide head follow style content_option_view create follow_fields
   delete captcha table_of_contents comment`
    .split(/\s+/)
    .filter(Boolean),
);
const RESTRICTED = new Set(["content_options", "content_option_view"]); // restricted_to_type %i[list pointer session]
const COMMON = new Set(["create", "read", "update", "delete", "structure", "default", "guide"]);
const FIELD = new Set(["default", "help", "input_type", "content_options", "content_option_view"]);

const bars = []; // {page, name, classes}
for (const f of readdirSync(DIR).filter((f) => /^recapture-raw-shard-\d+\.jsonl$/.test(f))) {
  for (const line of readFileSync(`${DIR}/${f}`, "utf8").split("\n")) {
    if (!line.includes('"page"')) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.lane !== "page") continue;
    const html = obj.page_html ?? "";
    const re = /<div[^>]*class="([^"]*_rule-item[^"]*)"[^>]*data-card-name="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      bars.push({ page: obj.name, classes: m[1], name: m[2] });
    }
  }
}
console.log("total _rule-item divs across oracle pages:", bars.length);

// derive: setting codename -> {recentYes: [set shapes], recentNo: [set shapes]}
const bySetting = new Map();
for (const b of bars) {
  // setting = last + part of the rule name
  const setting = b.name.split("+").pop(); // e.g. "*table of contents"
  const setPart = b.name.slice(0, b.name.length - setting.length - 1);
  const hasRecent = /_category-recent(\s|$)/.test(b.classes);
  const key = setting.replace(/^\*/, "");
  const entry = bySetting.get(key) ?? { recentYes: [], recentNo: [] };
  (hasRecent ? entry.recentYes : entry.recentNo).push(`${b.page}: ${setPart}`);
  bySetting.set(key, entry);
}

console.log("\nsetting | static-set-predicts | oracle-recent-sets (YES) | oracle NO-recent sets");
for (const [setting, e] of [...bySetting.entries()].sort()) {
  const inStatic = RECENT_ITEMS.has(setting);
  const restricted = RESTRICTED.has(setting);
  console.log(
    `\n[${setting}] static=${inStatic ? "recent" : "-"} restricted=${restricted ? "list/pointer/session-only" : "-"}`,
  );
  console.log(`  YES (${e.recentYes.length}):`, e.recentYes.slice(0, 6).join(" | "));
  if (e.recentYes.length > 6) console.log(`   ... +${e.recentYes.length - 6} more`);
  console.log(`  NO  (${e.recentNo.length}):`, e.recentNo.slice(0, 6).join(" | "));
  if (e.recentNo.length > 6) console.log(`   ... +${e.recentNo.length - 6} more`);
}

// conflict summary: settings where oracle verdict DIFFERS from static set
console.log("\n===== static-set vs oracle conflicts =====");
for (const [setting, e] of [...bySetting.entries()].sort()) {
  if (RECENT_ITEMS.has(setting) && e.recentYes.length === 0 && e.recentNo.length > 0) {
    console.log(`STATIC-says-yes ORACLE-says-no: ${setting} (all ${e.recentNo.length} occurrences NO)`);
  }
  if (!RECENT_ITEMS.has(setting) && e.recentYes.length > 0) {
    console.log(`STATIC-says-no ORACLE-says-yes: ${setting} (${e.recentYes.length} YES)`);
  }
  if (RECENT_ITEMS.has(setting) && e.recentYes.length > 0 && e.recentNo.length > 0) {
    console.log(`SET-DEPENDENT: ${setting} — YES on ${e.recentYes.length}, NO on ${e.recentNo.length}`);
  }
}
