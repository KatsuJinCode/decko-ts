// Keep-filter over the final census: every KEEP pattern from the receipt's
// classification standard; any line surviving this filter is a candidate
// unscrubbed attribution and must be hand-judged.
import fs from 'node:fs';

const keepPatterns = [
  /page[- ]lane/i,
  /view[- ]lane/i,
  /view-function lane/i,
  /bare[- ]view lane/i,
  /BARE VIEW LANE/,
  /dual-lane/i,
  /render[- ]lane/i,
  /graded (page-)?lane/i,
  /graded lane/i,
  /loader-less graded/i,
  /headless view-lane/i,
  /lane V\b/,
  /lane P\b/,
  /rules-cap-lane\.md/,
  /mod-views-a-lane\.md/,
  /rules-views-port[\w.-]*\.md/,
  /capture-dual-lane-page-and-view\.rb/,
  /verify-dual-lane\.test\.ts/,
  /signed-out corpus lane/i,
  /oracle lanes/i,
  /\bboth lanes\b/i,
  /\beither lane\b/i,
  /per render lane/i,
  /page lanes\b/i,
  /capture lanes/i,
  /\blanes\b.*capture/i,
];

let keep = 0;
const suspicious = [];
for (const line of fs.readFileSync('.jargon-r2-scratch/census-final.txt', 'utf8').split('\n')) {
  if (!line) continue;
  if (keepPatterns.some((re) => re.test(line))) keep++;
  else suspicious.push(line);
}
console.log('KEEP-classified: ' + keep);
console.log('surviving (need judgment): ' + suspicious.length);
for (const s of suspicious) console.log('  ' + s);
