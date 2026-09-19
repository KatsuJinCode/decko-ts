import { rubySucc } from "../src/card/name/inflect.ts";
const cases = [
  ["a9","b0"],["z9","aa0"],["Name 9","Name 10"],["Name 99","Name 100"],["1.9.9","2.0.0"],
  ["a 9","a 10"],["a-9","a-10"],["a_9","a_10"],["a+9","a+10"],["A B 9","A B 10"],["9 9","10 0"],
  ["a 9 9","a 10 0"],["z.9","z.10"],["z 9","z 10"],["z_9","z_10"],["z-9","z-10"],["z.9.9","z.10.0"],
  ["a 99","a 100"],["99 a","99 b"],["a.b","a.c"],["1.9","2.0"],["a + 9","a + 10"],["(9)","(10)"],
  ["[9]","[10]"],["a(9)","a(10)"],
  ["z z","aa a"],["z a","z b"],["a z","b a"],["aa z","ab a"],["9 - 9","10 - 0"],["a  9","a  10"],
  ["a -- 9","a -- 10"],["Z 9","Z 10"],["zZ9","aaA0"],["zz.9","zz.10"],["z.99","z.100"],["1.1.1","1.1.2"],
  ["z-a","z-b"],["9-a","9-b"],["a-9-9","a-10-0"],["10","11"],["9.10","9.11"],["0.9","1.0"],
  ["(-)","(-*"],["**9","**10"],["**","*+"],["9**","10**"],["(z)","(aa)"]
];
let fail = 0;
for (const [input, expected] of cases) {
  const actual = rubySucc(input);
  if (actual !== expected) { fail++; console.log(`FAIL ${JSON.stringify(input)}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); }
}
console.log(`${cases.length - fail}/${cases.length} passed`);
