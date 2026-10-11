// Compare two captures of the same corpus input set, line by line, to show
// exactly where two oracle runs differ (the reference harness's evidence rule
// for a mask: a field may be masked only if two runs of the same oracle on
// the same deck differ in it).
//
//   node tools/oracle/compare-corpus-captures.mjs <raw-capture expected-v2> <older expected-v2> <out.json>
//
// The first tree must be a raw capture (Ruby's bytes unaltered). The second
// may be an older capture whose rig rewrote slot ids and to which recorded
// transforms were applied; each such rewrite is replayed on the raw side
// before comparing, and counted, so the report shows (1) what the older
// tree rewrote and (2) what still differs between the two runs, by class.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [rawDir, oldDir, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error("usage: compare-corpus-captures.mjs <raw expected-v2> <older expected-v2> <out.json>");
  process.exit(2);
}

// Rewrites applied to the older tree, in the JSON-encoded line form.
const OLD_RIG_SLOT = /data-slot-id=(\\"|')[0-9a-f]+\1/g; // the old rig: any quote -> "RANDOMIZED"
const S3 = "http://s3.amazonaws.com//files/";
const CDN = "https://source-deck-production-storage.r1.cdn.objectstore.example/files/";
const SEAM_STALE = '<div class=\\"dropdown-divider\\"></div>\\n\\n<span class=\\"denied\\">';
const SEAM_LIVE = '<div class=\\"dropdown-divider\\"></div>\\n<span class=\\"denied\\">';
// Values known to be drawn per process.
const ACCORDION = /(card-[0-9a-z_:]+-)-?[0-9]+(-collapse-id)/g;
const MOD_ADDRESS = /#<Cardio::Mod:0x[0-9a-f]{16}>/g;
const CF_BLOCK = /__CF\$cv\$params/g;

const count = (s, re) => (s.match(re) || []).length;
const occurrences = (s, needle) => s.split(needle).length - 1;

const report = {
  raw: rawDir,
  older: oldDir,
  lines: 0,
  rawCensus: { slotSingle: 0, slotDouble: 0, s3Prefix: 0, cdnPrefix: 0, seamStale: 0, seamLive: 0, accordion: 0, modAddress: 0, cfBlock: 0 },
  olderCensus: { slotPlaceholder: 0, slotRaw: 0, s3Prefix: 0, cdnPrefix: 0, seamStale: 0, seamLive: 0 },
  rewritesReplayed: { slotIdsErased: 0, s3ToCdn: 0, seamReanchored: 0 },
  identical: 0,
  identicalAfterRewrites: 0,
  identicalAfterRewritesAndPerProcessMasks: 0,
  stillDiffering: [],
};

for (const lane of ["page-lane", "view-lane"]) {
  for (const f of readdirSync(path.join(rawDir, lane)).filter((x) => x.endsWith(".jsonl")).sort()) {
    const raw = readFileSync(path.join(rawDir, lane, f), "utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
    const old = readFileSync(path.join(oldDir, lane, f), "utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
    if (raw.length !== old.length) throw new Error(`${lane}/${f}: ${raw.length} lines vs ${old.length}`);
    raw.forEach((r, i) => {
      const o = old[i];
      report.lines++;
      const rc = report.rawCensus;
      rc.slotSingle += count(r, /data-slot-id='[0-9a-f]{20}'/g);
      rc.slotDouble += count(r, /data-slot-id=\\"[0-9a-f]{20}\\"/g);
      rc.s3Prefix += occurrences(r, S3);
      rc.cdnPrefix += occurrences(r, CDN);
      rc.seamStale += occurrences(r, SEAM_STALE);
      rc.seamLive += occurrences(r, SEAM_LIVE);
      rc.accordion += count(r, ACCORDION);
      rc.modAddress += count(r, MOD_ADDRESS);
      rc.cfBlock += count(r, CF_BLOCK);
      const oc = report.olderCensus;
      oc.slotPlaceholder += occurrences(o, 'data-slot-id=\\"RANDOMIZED\\"');
      oc.slotRaw += count(o, /data-slot-id=(\\"|')[0-9a-f]{20}\1/g);
      oc.s3Prefix += occurrences(o, S3);
      oc.cdnPrefix += occurrences(o, CDN);
      oc.seamStale += occurrences(o, SEAM_STALE);
      oc.seamLive += occurrences(o, SEAM_LIVE);

      if (r === o) report.identical++;
      report.rewritesReplayed.slotIdsErased += count(r, OLD_RIG_SLOT);
      let t = r.replace(OLD_RIG_SLOT, 'data-slot-id=\\"RANDOMIZED\\"');
      report.rewritesReplayed.s3ToCdn += occurrences(t, S3);
      t = t.split(S3).join(CDN);
      if (lane === "page-lane") {
        report.rewritesReplayed.seamReanchored += occurrences(t, SEAM_STALE);
        t = t.split(SEAM_STALE).join(SEAM_LIVE);
      }
      if (t === o) {
        report.identicalAfterRewrites++;
        return;
      }
      const m = (s) => s.replace(ACCORDION, "$1HASH$2").replace(MOD_ADDRESS, "#<Cardio::Mod:ADDRESS>");
      if (m(t) === m(o)) {
        report.identicalAfterRewritesAndPerProcessMasks++;
        return;
      }
      let at = 0;
      const a = m(t), b = m(o);
      while (at < a.length && a[at] === b[at]) at++;
      const id = JSON.parse(r).name;
      report.stillDiffering.push({ lane, file: f, line: i, name: id, at, raw: a.slice(Math.max(0, at - 60), at + 120), older: b.slice(Math.max(0, at - 60), at + 120) });
    });
  }
}
writeFileSync(outPath, JSON.stringify(report, null, 1) + "\n");
const { stillDiffering, ...summary } = report;
console.log(JSON.stringify({ ...summary, stillDiffering: stillDiffering.length }, null, 1));
for (const d of stillDiffering) console.log(`DIFF ${d.lane} ${d.name} @${d.at}`);
