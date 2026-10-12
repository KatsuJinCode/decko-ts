#!/usr/bin/env node
// Classifies the differences between two stock-oracle runs on one fixture, so
// the oracle variance the release claim rests on is a MEASURED number with a
// named class per difference, not an assertion.
//
//   node classify-ruby-variance.mjs <runA> <runB> [--json <out.json>]
//
// WHICH AXIS THIS MEASURES. Each run's run-meta.json names the environment it
// was captured in (the Ruby oracle's ready line records ruby, ruby_platform
// and ruby_engine, which run.mjs copies into runs.<kind>.engine). Read them
// and the report says which axis the two runs differ on. The finding that
// matters for the public claim is the ENVIRONMENT axis: two Rubies of the same
// version on different operating systems. The Ruby-version axis (3.2 vs 3.3 on
// the same OS) was measured too and differs only in slot ids, which N1 already
// masks — that is why a version-range claim measured on one OS says nothing
// about a capture on another.
//
// It reuses the harness's own normalizer (reference-harness/runner/normalize.mjs)
// so "equal after the harness's masks" means exactly what SPEC.md section 4
// means. It applies N1 (the slot-id mask) and N3 (class tokens compared as a
// set), then classifies each remaining difference:
//   class-token-order  a class attribute whose token SET is equal but whose
//                      token ORDER differs (the environment-variance class)
//   anything else      reported as UNCLASSIFIED, loudly, with a sample
//
// Because N3 is applied before classification, an N3-order difference is
// counted in `equal_after_N1_N3` rather than as a class_token_order item; the
// class_token_order counts below come from comparing the RAW class values,
// which is what shows the size of the order-only difference.
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

/** The environment a run was captured in: the adapter's ready line, which the
 * runner copies into run-meta.json under runs.<kind>.engine. The Ruby oracle
 * records ruby / ruby_platform / ruby_engine there. */
function environmentOf(dir) {
  const file = path.join(dir, "run-meta.json");
  if (!existsSync(file)) return null;
  let meta;
  try {
    meta = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const engine = meta?.runs?.render?.engine ?? meta?.runs?.semantics?.engine ?? null;
  const v = engine?.version ?? {};
  return {
    engine: engine?.engine ?? null,
    ruby: v.ruby ?? null,
    platform: v.ruby_platform ?? null,
    ruby_engine: v.ruby_engine ?? null,
    decko: v.decko ?? null,
    card: v.card ?? null,
  };
}

/** What the two runs differ ON, from their own recorded environments. */
function axisBetween(a, b) {
  if (!a || !b) return { axis: "unknown", detail: "a run does not record its environment (run-meta.json has no ready line)" };
  if (!a.ruby || !b.ruby) {
    return { axis: "unknown", detail: `a run predates the environment recording (ruby: ${a.ruby ?? "?"} vs ${b.ruby ?? "?"})` };
  }
  const axes = [];
  if (a.ruby !== b.ruby) axes.push("ruby version");
  if (a.platform !== b.platform) axes.push("operating system / platform");
  if (!axes.length) return { axis: "same environment", detail: `${a.ruby} on ${a.platform}` };
  return {
    axis: axes.join(" + "),
    detail: `${a.ruby} on ${a.platform} vs ${b.ruby} on ${b.platform}`,
  };
}

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

const envA = environmentOf(a);
const envB = environmentOf(b);
const axis = axisBetween(envA, envB);

// Run directories are recorded workspace-relative, so a report never carries
// the absolute layout of the machine that produced it.
const relativeToWorkspace = (p) => {
  const abs = path.resolve(p);
  const rel = path.relative(process.cwd(), abs);
  return rel === "" ? "." : rel.split(path.sep).join("/");
};

const report = {
  runs: { a: relativeToWorkspace(a), b: relativeToWorkspace(b) },
  environments: { a: envA, b: envB },
  axis,
  kinds: {},
  class_token_order: { items: 0, tags_reordered: 0 },
  unclassified: [],
};
let anyUnclassified = 0;

/** The line under a given normalisation: render/scenario HTML normalised, every
 *  other kind raw. */
const normed = (line, kind, options) =>
  kind === "render"
    ? { ...line, result: normalizeRender(line.result, options) }
    : kind === "scenarios"
      ? { ...line, steps: line.steps.map((s) => ({ ...s, result: normalizeRender(s.result, options) })) }
      : line;

for (const kind of ["render", "semantics", "scenarios"]) {
  const Aline = read(a, kind);
  const Bline = read(b, kind);
  const k = { items: Aline.length, equal_raw: 0, equal_after_N1: 0, equal_after_N1_N3: 0, class_token_order: 0, unclassified: 0 };
  if (Aline.length !== Bline.length) {
    report.unclassified.push(`${kind}: runs hold different item counts (${Aline.length} vs ${Bline.length})`);
    anyUnclassified++;
  }
  const Bmap = new Map(Bline.map((l) => [l.id, l]));
  for (const x of Aline) {
    const y = Bmap.get(x.id);
    if (!y) continue;
    if (JSON.stringify(x) === JSON.stringify(y)) { k.equal_raw++; continue; }
    // N1 alone: what the two runs agree on once the random slot ids are masked.
    if (JSON.stringify(normed(x, kind, { classTokenOrder: false })) === JSON.stringify(normed(y, kind, { classTokenOrder: false }))) {
      k.equal_after_N1++;
      continue;
    }
    // N1 + N3: the harness's full normalisation, which is what the grader applies.
    // An item that only reaches equality here differs by class-token order and
    // nothing else — that is the environment-variance class, counted.
    if (JSON.stringify(normed(x, kind)) === JSON.stringify(normed(y, kind))) {
      k.equal_after_N1_N3++;
      k.class_token_order++;
      report.class_token_order.items++;
      continue;
    }

    if (kind === "render") {
      // Raw HTML, N1 masked only, so the class values still hold their own order.
      const ha = normed(x, kind, { classTokenOrder: false }).result.html;
      const hb = normed(y, kind, { classTokenOrder: false }).result.html;
      const reordered = classOrderOnly(ha, hb);
      // Belt and braces: with class values erased the two must be identical.
      if (reordered && withoutClassValues(ha) === withoutClassValues(hb)) {
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

console.log(`axis: ${axis.axis} (${axis.detail})`);
for (const [kind, k] of Object.entries(report.kinds)) {
  console.log(
    `${kind.padEnd(10)} ${k.items} items: ${k.equal_raw} identical raw, ${k.equal_after_N1} equal after N1, ` +
    `${k.equal_after_N1_N3} equal after N1+N3 (of which ${k.class_token_order} needed N3), ${k.unclassified} UNCLASSIFIED`
  );
}
console.log(`class-token-order totals: ${report.class_token_order.items} items needed N3 to reconcile, ${report.class_token_order.tags_reordered} tags reordered where a raw-order check was possible`);
for (const u of report.unclassified) console.log(`UNCLASSIFIED: ${JSON.stringify(u).slice(0, 500)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
process.exit(anyUnclassified ? 1 : 0);