// Second repair pass: the first repair doubled the leading star. Replace the
// mangled literal with the correct escaped item list.
import { readFileSync, writeFileSync } from "node:fs";

const items = [
  "*read", "*structure", "*script", "*content options", "*input type",
  "*default", "*layout", "*help", "*thanks", "*update", "*guide", "*head",
  "*follow", "*style", "*content option view", "*create", "*follow fields",
  "*delete", "*captcha", "*table of contents", "*comment",
];
const goodLiteral = '"' + items.join("\\n") + '",';
const brokenPattern = /""\*\*structure\\n\*\*script[\s\S]*?\*comment",/;

for (const path of [
  "C:/localProjects/decko-ts-lane-p22-rulestable/tests/card/render/r16-rule-bar-and-stored-verdict-parity.test.ts",
  "C:/localProjects/decko-ts-lane-p22-rulestable/tests/card/render/stored-rule-bar-self-set-key.test.ts",
]) {
  const text = readFileSync(path, "utf8");
  if (brokenPattern.test(text)) {
    writeFileSync(path, text.replace(brokenPattern, goodLiteral));
    console.log("repaired", path.split("/").pop());
  } else if (text.includes(goodLiteral)) {
    console.log("already good:", path.split("/").pop());
  } else {
    throw new Error("neither broken nor good literal found in " + path);
  }
}
