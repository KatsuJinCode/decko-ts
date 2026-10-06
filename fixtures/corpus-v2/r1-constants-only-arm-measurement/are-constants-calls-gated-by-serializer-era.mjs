// are-constants-calls-gated-by-serializer-era.mjs -- R1 step 1, the COUPLING
// TEST, mechanically. For every call site of the six DEPLOYMENT-CONSTANT
// getters, look upward inside the same enclosing function for a
// `serializerFollowsLive()` ternary/if. A constant call that is reachable only
// under a serializer-era branch is a COUPLING; one that is not is
// PER-FIELD GRANULAR.
//
// The read is a static window scan (8 lines up), which is a WEAK test on its
// own -- the authoritative evidence is the corpus measurement (R1 step 3),
// where the constants-only arm is applied and the frozen-era entries are
// checked for movement. This script exists to make the static claim
// falsifiable and to name every site either way.
//
// Usage: node tmp/r1-constants/are-constants-calls-gated-by-serializer-era.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..", "..");

const CONSTANT_GETTERS = [
  "scriptIntegrityFor",
  "mainStylesheetRevisionDigits",
  "footerDeckoVersion",
  "recaptchaSiteKey",
  "deckoRootUrl",
  "deploymentDefaultHtmlViewNest",
];
const SERIALIZER_GETTER = "serializerFollowsLive";

const FILES = [
  "src/card/render/page.ts",
  "src/card/render/head-views.ts",
  "src/card/render/views.ts",
  "src/card/render.ts",
  "src/card/render/format.ts",
  "src/card/render/pointer-list.ts",
  "src/card/mod-loader/mods/card-mod-script.ts",
  "src/card/mod-loader/mods/core-mod.ts",
  "src/card/mod-loader/mods/card-mod-edit.ts",
  "src/card/mod-loader/mods/card-mod-history.ts",
  "src/card/mod-loader/mods/card-mod-rules.ts",
];

const callRe = (name) => new RegExp(`\\b${name}\\s*\\(`);
const ternaryRe = new RegExp(`\\b${SERIALIZER_GETTER}\\s*\\?`);

let gated = 0;
let free = 0;
const rows = [];
for (const rel of FILES) {
  const lines = readFileSync(path.join(REPO, rel), "utf8").split("\n");
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("import") || trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    for (const getter of [...CONSTANT_GETTERS, SERIALIZER_GETTER]) {
      if (!callRe(getter).test(line)) continue;
      // Strip the definition's own name-in-signature false positive: a line
      // that merely re-exports the getter is not a call site.
      const window = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
      const isGated = ternaryRe.test(window);
      if (getter === SERIALIZER_GETTER) {
        rows.push({ site: `${rel}:${i + 1}`, getter, verdict: "ERA-READ" });
        continue;
      }
      if (isGated) gated += 1;
      else free += 1;
      rows.push({ site: `${rel}:${i + 1}`, getter, verdict: isGated ? "GATED-BY-ERA" : "FREE" });
    }
  });
}

for (const r of rows) {
  console.log(`${r.verdict.padEnd(13)} ${r.getter.padEnd(28)} ${r.site}`);
}
console.log("");
console.log(`CONSTANT call sites: ${free} FREE, ${gated} GATED-BY-ERA`);
console.log(
  gated === 0
    ? "VERDICT: PER-FIELD GRANULAR -- no deployment-constant read site sits under a serializerFollowsLive() branch."
    : "VERDICT: COUPLED -- at least one constant read site is reachable only under the live serializer era.",
);
