// Repair the fixture dbContent literals: the earlier inline edit turned the
// \n escapes into real newlines (invalid TS inside a double-quoted string).
// Rewrite each broken multi-line literal as the proper escaped single line.
import { readFileSync, writeFileSync } from "node:fs";

const items = [
  "*read", "*structure", "*script", "*content options", "*input type",
  "*default", "*layout", "*help", "*thanks", "*update", "*guide", "*head",
  "*follow", "*style", "*content option view", "*create", "*follow fields",
  "*delete", "*captcha", "*table of contents", "*comment",
];
// The literal we want in the TS source (backslash-n escapes as characters):
const goodLiteral =
  '"*' + items.slice(1).join("\\n*") + '"';
const brokenPattern = /\*read\n\*structure[\s\S]*?\*comment",/;

for (const path of [
  "C:/localProjects/decko-ts-lane-p22-rulestable/tests/card/render/r16-rule-bar-and-stored-verdict-parity.test.ts",
  "C:/localProjects/decko-ts-lane-p22-rulestable/tests/card/render/stored-rule-bar-self-set-key.test.ts",
]) {
  const text = readFileSync(path, "utf8");
  const m = text.match(brokenPattern);
  if (m === null) throw new Error("broken literal not found in " + path);
  if (text.indexOf(brokenPattern.source) !== -1) {
    // fine — using RegExp exec below
  }
  writeFileSync(path, text.replace(brokenPattern, goodLiteral + ","));
  console.log("repaired", path.split("/").pop());
}
console.log("good literal:", goodLiteral.slice(0, 80), "...");
