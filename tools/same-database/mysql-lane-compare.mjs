// mysql-lane-compare.mjs - the MySQL lane, checked against Ruby on MySQL.
//
// Both runs serve the synthetic-v1 deck from one MySQL 8.4 database each (the
// adapters expect a database that already holds the deck; the ts-mysql adapter
// loads one itself, the Ruby adapter needs the deck loaded first, see
// reference-harness/adapters/ruby-mysql). Every op is compared under the
// grader's normalization (normalizeRender for renders, stable JSON for
// semantics), with the per-request random data-slot-id blanked.
//
//   node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ruby-mysql/adapter.json \
//        --fixture reference-harness/fixtures/synthetic-v1 --out <rubyOut> --kinds render,semantics
//   node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts-mysql/adapter.json \
//        --fixture reference-harness/fixtures/synthetic-v1 --out <portOut> --kinds render,semantics
//   node tools/same-database/mysql-lane-compare.mjs <rubyOut> <portOut>
//
// Per kind it reports: how many ops each side ran; ruby_eq_port (Ruby-on-MySQL
// and port-on-MySQL produce the same output); ruby_eq_expected and
// port_eq_expected (each against the SQLite-lane expected results); and
// ruby_eq_port_expected_differs, the ops where Ruby and the port agree with each
// other but not with the SQLite-lane expectation. Those are the ops where the
// database's own tie order decides the output, not either engine.
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { normalizeRender, stable } from "../../reference-harness/runner/normalize.mjs";

const [rubyOut, portOut] = process.argv.slice(2);
if (!rubyOut || !portOut) {
  console.error("usage: mysql-lane-compare.mjs <rubyOut> <portOut>");
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = resolve(root, "reference-harness/fixtures/synthetic-v1");

const load = (p) =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const loadGz = (p) =>
  gunzipSync(readFileSync(p))
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const blankSlot = (s) => s.replace(/data-slot-id=(["'])[0-9a-f]{20}\1/g, "data-slot-id=X");
const key = (kind, r) =>
  kind === "render" ? blankSlot(JSON.stringify(normalizeRender(r.result))) : JSON.stringify(stable(r.result));

const expected = {
  render: loadGz(resolve(fixture, "expected/render.jsonl.gz")),
  semantics: load(resolve(fixture, "expected/semantics.jsonl")),
};

const out = {};
for (const kind of ["render", "semantics"]) {
  const R = new Map(load(resolve(rubyOut, `${kind}.jsonl`)).map((r) => [r.id, r]));
  const P = new Map(load(resolve(portOut, `${kind}.jsonl`)).map((r) => [r.id, r]));
  const E = new Map(expected[kind].map((r) => [r.id, r]));
  const stats = { ops: E.size, ruby_ran: R.size, port_ran: P.size, ruby_eq_port: 0, ruby_eq_expected: 0, port_eq_expected: 0 };
  const differs = [];
  for (const [id, e] of E) {
    const r = R.get(id);
    const p = P.get(id);
    if (!r || !p) continue;
    const kr = key(kind, r);
    const kp = key(kind, p);
    const ke = key(kind, e);
    const rp = kr === kp;
    const pe = kp === ke;
    if (rp) stats.ruby_eq_port++;
    if (kr === ke) stats.ruby_eq_expected++;
    if (pe) stats.port_eq_expected++;
    if (rp && !pe) differs.push(id);
  }
  out[kind] = { ...stats, ruby_eq_port_expected_differs: differs.length, sample: differs.slice(0, 10) };
}
console.log(JSON.stringify(out, null, 1));
