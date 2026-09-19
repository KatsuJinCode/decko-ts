import { singularize, pluralize, underscore, titleize, rubyCapitalize, rubySucc } from "../src/card/name/inflect.ts";
import { readFileSync } from "node:fs";
const battery = JSON.parse(readFileSync(process.env.BATTERY, "utf8"));
let fails = 0, total = 0;
const check = (kind, fn, pairs) => {
  for (const [w, expected] of pairs) {
    total++;
    const actual = fn(w);
    if (actual !== expected) {
      fails++;
      console.log(`${kind} FAIL ${JSON.stringify(w)}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
  }
};
check("singularize", singularize, battery.singularize);
check("pluralize", pluralize, battery.pluralize);
check("underscore", underscore, battery.underscore);
check("titleize", titleize, battery.titleize);
check("capitalize", rubyCapitalize, battery.capitalize);
check("succ", rubySucc, battery.succ);
console.log(`${total - fails}/${total} passed`);
