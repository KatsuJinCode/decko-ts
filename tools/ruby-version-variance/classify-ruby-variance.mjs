#!/usr/bin/env node
// Classifies the differences between two stock-oracle runs on one fixture, so
// the Ruby-version variance the release claim rests on is a MEASURED number
// with a named class per difference, not an assertion.
//
//   node classify-ruby-variance.mjs <runA> <runB> [--json <out.json>]
//
// It reuses the harness's own normalizer (reference-harness/runner/normalize.mjs)
// so "equal after the harness's masks" means exactly what SPEC.md section 4
// means, and applies the harness's N1 slot-id mask. On top of that it
// classifies each remaining difference:
//   class-token-order  a class attribute whose token SET is equal but whose
//                      token ORDER differs (the reviewer's reported class)
//   anything else      reported as UNCLASSIFIED, loudly, with a sample
//
// Exit 0 when every difference is a class-token-order, 1 otherwise.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { normalizeRender } from "../../reference-harness/runner/normalize.mjs";

const [a, b, ...rest] = process.argv.slice(2);
const jsonOut = rest[0] === "--json" ? rest[1] : null;
if (!a || !b) {
  console.error("usage: classify-ruby-variance.mjs <runA> <runB> [--json <out.json>]");
  process.exit(2);
}

const read = (dir, kind) => {
  const f = path.join(dir, `${kind}.jsonl`);
  const text = existsSync(f) ? readFileSync(f, "utf8") : gunzipSync(readFileSync(f + ".gz")).toString("utf8");
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
};

/** Every tag's class attribute value, in order, as [tagIndex, tokens]. */
function classAttributes(html) {
  const out = [];
  const tagRe = /<([A-Za-z][A-Za-z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  let i = 0;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[2];
    const cm = /\sclass=(["'])(.*?)\1/.exec(attrs);
    if (cm) out.push({ tag: i++, name: m[1], value: cm[2], tokens: cm[2].split(/\s+/).filter(Boolean) });
  }
  return out;
}

/**
 * True when `a` and `b` differ only by class-token order: same tag sequence,
 * same attribute names and values except that some class attributes hold the
 * same token set in a different order. Returns the sorted tokens that differ,
 * or null when the two are not related this way.
 */
function classOrderOnly(aHtml, bHtml) {
  if (aHtml === bHtml) return null;
  const A = classAttributes(aHtml);
  const B = classAttributes(bHtml);
  // Tag-for-tag: same count, same element names, same non-class attribute text.
  if (A.length !== B.length) return null;
  const reordered = [];
  for (let i = 0; i < A.length; i++) {
    if (A[i].name !== B[i].name) return null;
    if (A[i].value === B[i].value) continue;
    const sa = [...A[i].tokens].sort();
    const sb = [...B[i].tokens].sort();
    if (JSON.stringify(sa) !== JSON.stringify(sb)) return null; // different token set: not order-only
    reordered.push({ tag: A[i].name, a: A[i].value, b: B[i].value });
  }
  return reordered.length ? reordered : null;
}

/** Strip every class attribute's value, so the rest of the tag can be compared. */
function withoutClassValues(html) {
  return html.replace(/(\sclass=(["']))[^"']*\2/g, '$1__CLASS__$2');
}

const report = {
  runs: { a: path.resolve(a), b: path.resolve(b) },
  kinds: {},
  class_token_order: { items: 0, tags_reordered: 0 },
  unclassified: [],
};
let anyUnclassified = 0;

for (const kind of ["render", "semantics", "scenarios"]) {
  const Aline = read(a, kind);
  const Bline = read(b, kind);
  const k = { items: Aline.length, equal_raw: 0, equal_after_N1: 0, class_token_order: 0, unclassified: 0 };
  if (Aline.length !== Bline.length) {
    report.unclassified.push(`${kind}: runs hold different item counts (${Aline.length} vs ${Bline.length})`);
    anyUnclassified++;
  }
  const Bmap = new Map(Bline.map((l) => [l.id, l]));
  for (const x of Aline) {
    const y = Bmap.get(x.id);
    if (!y) continue;
    if (JSON.stringify(x) === JSON.stringify(y)) { k.equal_raw++; continue; }
    const norm = (line) =>
      kind === "render"
        ? { ...line, result: normalizeRender(line.result) }
        : kind === "scenarios"
          ? { ...line, steps: line.steps.map((s) => ({ ...s, result: normalizeRender(s.result) })) }
          : line;
    if (JSON.stringify(norm(x)) === JSON.stringify(norm(y))) { k.equal_after_N1++; continue; }

    if (kind === "render") {
      const reordered = classOrderOnly(norm(x).result.html, norm(y).result.html);
      // Belt and braces: with class values erased the two must be identical.
      if (reordered && withoutClassValues(norm(x).result.html) === withoutClassValues(norm(y).result.html)) {
        k.class_token_order++;
        report.class_token_order.items++;
        report.class_token_order.tags_reordered += reordered.length;
        continue;
      }
    }
    k.unclassified++;
    anyUnclassified++;
    if (report.unclassified.length < 25) {
      report.unclassified.push({ kind, id: x.id, a: JSON.stringify(x).slice(0, 400), b: JSON.stringify(y).slice(0, 400) });
    }
  }
  report.kinds[kind] = k;
}

for (const [kind, k] of Object.entries(report.kinds)) {
  console.log(
    `${kind.padEnd(10)} ${k.items} items: ${k.equal_raw} identical raw, ${k.equal_after_N1} equal after the N1 slot mask, ` +
    `${k.class_token_order} class-token-order, ${k.unclassified} UNCLASSIFIED`
  );
}
console.log(`class-token-order totals: ${report.class_token_order.items} items, ${report.class_token_order.tags_reordered} tags reordered`);
for (const u of report.unclassified) console.log(`UNCLASSIFIED: ${JSON.stringify(u).slice(0, 500)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
process.exit(anyUnclassified ? 1 : 0);