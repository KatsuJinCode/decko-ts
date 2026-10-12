// denied-seam-reanchor-page-lane-expectations.mjs -- corpus re-anchor tool:
// at the Opportunities dropdown-menu denied seam
// (the `</div>` of the seam dropdown-divider, then the read-denied item span),
// replace the STALE blank-line form with the single-newline form in
// every page-lane expectation carrying it.
//
// FINDING BEING EXECUTED: the corpus
// page-lane expectations carry a stale engine-era blank line at this seam
// (`</div>\n\n<span class="denied">` in decoded bytes); the serving truth and
// the engine (navbar-views.ts:167-172, pinned non-emission) both carry the
// single newline. The census counted 6,542 stale expectations / 42 already
// single-newline / 6,586 carrying the denied span at all (48 shards, 6,588
// entries).
//
// BINDING + REVERSIBILITY (the same manifest pattern the sibling overlays
// use):
//   - apply refuses unless every page-lane shard is at the recorded prestate
//     sha (the asset-host + w5-live chain's after-states).
//   - the manifest records per-splice provenance: shard, line index, entry
//     id/name, absolute byte offset of the seam in the file, line sha
//     before/after -- the inverse restores each splice BY OFFSET (never a
//     blanket literal replacement, which would also re-stale the 42
//     already-live-true entries).
//   - BYTE-LEVEL VALUE-LITERAL SPLICES ONLY: the tool never JSON-parses for
//     the write path (parse-modify-dump strips trailing CRs -- a lesson this
//     corpus's tooling already learned); all shard files are CRLF, preserved
//     because only the exact
//     seam byte range is removed.
//
// MODES
//   --mode census    count stale/live-true seams + context guard checks
//   --mode apply     perform the splices, write forward + inverse manifests
//   --mode inverse   restore every recorded splice by offset, verify shas
//   --mode validate  verify every recorded splice is present in after-form
//                    (and only it: zero other deltas vs prestate shas)
//
// USAGE (from the worktree root)
//   node tools/oracle/denied-seam-reanchor-page-lane-expectations.mjs \
//     --repo <worktree-root> --mode census|apply|inverse|validate

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const REPO = path.resolve(argValue("--repo") ?? process.cwd());
const MODE = argValue("--mode") ?? "census";
if (!["census", "apply", "inverse", "validate", "reapply"].includes(MODE)) {
  console.error("REFUSAL: --mode must be census | apply | inverse | validate | reapply");
  process.exit(2);
}

const STAGING = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
const PAGE_DIR = path.join(STAGING, "page-lane");
const OUT_DIR = path.join(REPO, "fixtures", "corpus-v2", "denied-seam-reanchor-2026-10-03");
const FORWARD_MANIFEST = path.join(OUT_DIR, "denied-seam-reanchor-manifest.json");
const INVERSE_MANIFEST = path.join(OUT_DIR, "denied-seam-reanchor-inverse-manifest.json");

// prestate chain: page-lane shard after-states recorded by the prior overlays,
// in application order (later overlays win). swap-37 and w5-record touched
// view-lane only; w5-live touched 4 page shards; asset-host touched all 48.
const PRIOR_MANIFESTS = [
  "fixtures/corpus-v2/asset-host-follow-live-close-71/asset-host-transform-manifest.json",
  "fixtures/corpus-v2/w5-live-alignment-2026-10-03/w5-live-alignment-swap-manifest.json",
  "fixtures/corpus-v2/w5-record-alignment-2026-10-03/w5-record-alignment-swap-manifest.json",
];

// The seam, in the file's escaped-literal byte form (page_html is a JSON
// string: newlines are the two chars \ n, quotes are the two chars \ ").
// STALE: blank line between the divider's </div> and the denied span.
// LIVE:  single newline (what live truth and the engine both emit).
// The comment pin `<!-- Sorry` disambiguates from any other divider-adjacent
// spans. The LIVE literal cannot match inside the STALE form (after the first
// \n comes the second \n, not `<`), so the two forms are disjoint.
const STALE_SEAM = '</div>\\n\\n<span class=\\"denied\\"><!-- Sorry';
const LIVE_SEAM = '</div>\\n<span class=\\"denied\\"><!-- Sorry';
const MENU_OPEN = '<div class=\\"dropdown-menu';
const DIVIDER = '<div class=\\"dropdown-divider\\"></div>';

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fail = (msg) => {
  console.error("REFUSAL: " + msg);
  process.exit(2);
};
const must = (cond, msg) => {
  if (!cond) fail(msg);
};

must(existsSync(PAGE_DIR), `missing page-lane staging: ${PAGE_DIR}`);
const shardFiles = readdirSync(PAGE_DIR)
  .sort()
  .filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f));
must(shardFiles.length === 48, `expected 48 page shards, found ${shardFiles.length}`);

function loadPriorPrestate() {
  const prestate = new Map(); // shard file -> expected sha
  for (const rel of PRIOR_MANIFESTS) {
    const abs = path.join(REPO, rel);
    must(existsSync(abs), `missing prior manifest: ${rel}`);
    const m = JSON.parse(readFileSync(abs, "utf8"));
    for (const [key, val] of Object.entries(m.shardAfter ?? {})) {
      if (!key.startsWith("page-lane/")) continue;
      const f = key.slice("page-lane/".length);
      const sha = typeof val === "string" ? val : val.sha256;
      if (sha !== undefined) prestate.set(f, sha);
    }
  }
  return prestate;
}

// scan one shard: returns {text, lines, lineStarts, findings[]}
// findings: per stale occurrence: {lineIndex, id, name, seamByteOffset(abs in
// file), lineShaBefore, contextOk, ctxMenuOpens, ctxDividers}
function scanShard(f) {
  const p = path.join(PAGE_DIR, f);
  const buf = readFileSync(p);
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  const lineStarts = [];
  let acc = 0;
  for (const l of lines) {
    lineStarts.push(acc);
    acc += Buffer.byteLength(l, "utf8") + 1; // +1 for the \n
  }
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L === "") continue;
    let pos = 0;
    while (true) {
      const at = L.indexOf(STALE_SEAM, pos);
      if (at === -1) break;
      pos = at + 1;
      // context guard: nearest menu open before the seam in this line, no
      // other denied span between it and the seam
      const mo = L.lastIndexOf(MENU_OPEN, at);
      const between = mo === -1 ? "" : L.slice(mo, at);
      const otherDenied = between.split('<span class=\\"denied\\">').length - 1;
      const dividers = between.split(DIVIDER).length - 1;
      findings.push({
        lineIndex: i,
        seamCharOffset: at, // JS string index within the line (splice target)
        seamByteOffset: lineStarts[i] + Buffer.byteLength(L.slice(0, at), "utf8"), // provenance
        lineShaBefore: sha256(Buffer.from(L, "utf8")),
        contextOk: mo !== -1 && otherDenied === 0,
        ctxMenuOpenAt: mo,
        ctxDividers: dividers,
      });
    }
  }
  return { text, lines, lineStarts, findings };
}

// ================= census =================
if (MODE === "census") {
  let entriesStale = 0,
    entriesLive = 0,
    occStale = 0,
    occLive = 0,
    entriesDenied = 0,
    contextBad = 0,
    crlfFiles = 0,
    multiStaleEntries = 0;
  const staleSamples = [];
  const liveSamples = [];
  for (const f of shardFiles) {
    const buf = readFileSync(path.join(PAGE_DIR, f));
    if (buf.includes(Buffer.from("\r\n"))) crlfFiles++;
    const { lines, findings } = scanShard(f);
    for (const fd of findings) {
      if (!fd.contextOk) contextBad++;
      if (fd.ctxDividers !== 1 && staleSamples.length < 3) {
        staleSamples.push({ note: "ctxDividers!=1", shard: f, ...fd });
      }
    }
    const staleLines = new Set(findings.map((x) => x.lineIndex));
    if (staleLines.size < findings.length) multiStaleEntries += 1;
    occStale += findings.length;
    if (staleLines.size > 0) entriesStale += staleLines.size;
    for (const L of lines) {
      if (L === "") continue;
      if (L.includes('<span class=\\"denied\\">')) entriesDenied++;
      const liveOcc = L.split(LIVE_SEAM).length - 1;
      occLive += liveOcc;
      if (liveOcc > 0 && L.split(STALE_SEAM).length - 1 === 0) {
        entriesLive++;
        if (liveSamples.length < 5) {
          try {
            const obj = JSON.parse(L);
            liveSamples.push({ shard: f, id: obj.id, name: obj.name, liveOcc });
          } catch {}
        }
      }
    }
    for (const fd of findings.slice(0, 5)) {
      if (staleSamples.length < 5) {
        try {
          const obj = JSON.parse(lines[fd.lineIndex]);
          staleSamples.push({ shard: f, id: obj.id, name: obj.name, ...fd, lineShaBefore: undefined });
        } catch {}
      }
    }
  }
  console.log(
    JSON.stringify(
      {
        mode: "census",
        shards: shardFiles.length,
        crlfFiles,
        entriesDeniedSpan: entriesDenied,
        entriesWithStaleSeam: entriesStale,
        staleOccurrences: occStale,
        multiStaleEntries,
        entriesLiveTrueAtSeam: entriesLive,
        liveOccurrences: occLive,
        contextGuardFailures: contextBad,
        staleSamples,
        liveSamples,
      },
      null,
      1,
    ),
  );
  process.exit(0);
}

// ================= apply =================
if (MODE === "apply") {
  must(!existsSync(FORWARD_MANIFEST), `forward manifest already exists: ${FORWARD_MANIFEST}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const prestate = loadPriorPrestate();
  const perShard = new Map();
  for (const f of shardFiles) {
    const buf = readFileSync(path.join(PAGE_DIR, f));
    const sha = sha256(buf);
    const expected = prestate.get(f);
    must(expected !== undefined, `no prestate sha recorded for page-lane/${f}`);
    must(sha === expected, `shard ${f} is not at the prior-chain after-state (prestate drift)`);
    perShard.set(f, { bufBefore: buf, shaBefore: sha, findings: scanShard(f).findings });
  }

  const entries = [];
  for (const f of shardFiles) {
    const st = perShard.get(f);
    if (st.findings.length === 0) continue;
    const lines = st.bufBefore.toString("utf8").split("\n");
    const newLines = lines.slice();
    const lineStarts = [];
    let acc = 0;
    for (const l of lines) {
      lineStarts.push(acc);
      acc += Buffer.byteLength(l, "utf8") + 1;
    }
    for (const fd of st.findings) {
      must(fd.contextOk, `context guard failed in ${f} at line ${fd.lineIndex} offset ${fd.seamByteOffset}`);
      const L = lines[fd.lineIndex];
      const at = fd.seamCharOffset;
      const after = L.slice(0, at) + LIVE_SEAM + L.slice(at + STALE_SEAM.length);
      let obj = {};
      try {
        obj = JSON.parse(L);
      } catch {}
      entries.push({
        shard: f,
        lineIndex: fd.lineIndex,
        id: obj.id ?? null,
        name: obj.name ?? null,
        seamByteOffset: fd.seamByteOffset,
        seamCharOffset: at,
        removedBytes: STALE_SEAM.length - LIVE_SEAM.length,
        lineShaBefore: fd.lineShaBefore,
        lineShaAfter: sha256(Buffer.from(after, "utf8")),
      });
      newLines[fd.lineIndex] = after;
    }
    const afterText = newLines.join("\n");
    st.bufAfter = Buffer.from(afterText, "utf8");
    st.shaAfter = sha256(st.bufAfter);
  }

  // scope guard: every changed line must be exactly its recorded splice --
  // reconstruct before from after AT THE RECORDED OFFSET (never indexOf: a
  // line may carry other, pre-existing live-true seams) and compare shas.
  for (const e of entries) {
    const st = perShard.get(e.shard);
    const linesAfter = st.bufAfter.toString("utf8").split("\n");
    const L = linesAfter[e.lineIndex];
    must(L.slice(e.seamCharOffset, e.seamCharOffset + LIVE_SEAM.length) === LIVE_SEAM,
      `scope-guard lost the seam in ${e.shard}:${e.lineIndex} at offset ${e.seamCharOffset}`);
    const reconstructed =
      L.slice(0, e.seamCharOffset) + STALE_SEAM + L.slice(e.seamCharOffset + LIVE_SEAM.length);
    must(
      sha256(Buffer.from(reconstructed, "utf8")) === e.lineShaBefore,
      `scope-guard reconstruction mismatch in ${e.shard}:${e.lineIndex} (non-seam bytes would change)`,
    );
  }

  let touched = 0;
  const shardBefore = {},
    shardAfter = {};
  for (const f of shardFiles) {
    const st = perShard.get(f);
    if (!st.bufAfter) continue;
    touched++;
    must(st.shaAfter !== st.shaBefore, `shard ${f} touched without sha change`);
    writeFileSync(path.join(PAGE_DIR, f), st.bufAfter);
    shardBefore[`page-lane/${f}`] = { sha256: st.shaBefore };
    shardAfter[`page-lane/${f}`] = { sha256: st.shaAfter };
  }

  const manifest = {
    schema: "denied-seam-reanchor/1",
    title: "6,542 page-lane expectations re-anchored at the Opportunities dropdown denied seam: stale blank line -> live-true single newline",
    appliedAt: new Date().toISOString(),
    finding: "denied-chrome-newline lane 2026-10-03 (denied-chrome-newline-lane.md): stale engine-era blank line at the seam; live truth + engine (navbar-views.ts:167-172) both single-newline",
    transform: "escaped-literal byte splice </div>\\n\\n<span class=\\\"denied\\\"><!-- Sorry -> </div>\\n<span class=\\\"denied\\\"><!-- Sorry (decoded: drop one newline); no JSON parse on the write path; CRLF preserved",
    prestateBinding: "every page-lane shard sha matched the prior overlay chain's after-state (asset-host all-48, then w5-live page shards; swap-37/w5-record were view-lane-only)",
    counts: { entries: entries.length, shardsTouched: touched },
    shardBefore,
    shardAfter,
    entries,
    revert: "node tools/oracle/denied-seam-reanchor-page-lane-expectations.mjs --repo <worktree-root> --mode inverse",
  };
  writeFileSync(FORWARD_MANIFEST, JSON.stringify(manifest, null, 1));
  const inverse = {
    schema: "denied-seam-reanchor/1",
    title: "INVERSE: restores each recorded seam splice by byte offset (blank line back), never a blanket replacement",
    inverseOf: { path: path.relative(REPO, FORWARD_MANIFEST), sha256: sha256(readFileSync(FORWARD_MANIFEST)) },
    appliedAt: null,
    counts: { entries: entries.length, shardsTouched: touched },
    shardBefore,
    shardAfter,
    entries,
  };
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(inverse, null, 1));
  console.log(
    `APPLY DONE: ${entries.length} seams re-anchored across ${touched} shards; ` +
      `manifests: ${path.relative(REPO, FORWARD_MANIFEST)} + .inverse.json`,
  );
  process.exit(0);
}

// ================= reapply =================
// re-drive the FORWARD transform from the recorded manifest alone (no fresh
// scan): verifies the current state is the manifest's prestate, splices each
// entry at its recorded offset, and requires the manifest's after-state shas
// to land exactly. Used after an inverse to complete the round trip. The
// forward manifest is never rewritten (the inverse manifest binds its sha).
if (MODE === "reapply") {
  must(existsSync(FORWARD_MANIFEST), `no forward manifest: ${FORWARD_MANIFEST}`);
  const manifest = JSON.parse(readFileSync(FORWARD_MANIFEST, "utf8"));
  const byShard = new Map();
  for (const e of manifest.entries) {
    (byShard.get(e.shard) ?? byShard.set(e.shard, []).get(e.shard)).push(e);
  }
  for (const [f, list] of byShard) {
    const p = path.join(PAGE_DIR, f);
    const buf = readFileSync(p);
    must(sha256(buf) === manifest.shardBefore[`page-lane/${f}`].sha256, `shard ${f} is not at the manifest's prestate (reapply refused)`);
    const lines = buf.toString("utf8").split("\n");
    for (const e of list) {
      const L = lines[e.lineIndex];
      must(sha256(Buffer.from(L, "utf8")) === e.lineShaBefore, `line ${f}:${e.lineIndex} (${e.name}) != before-sha`);
      must(L.slice(e.seamCharOffset, e.seamCharOffset + STALE_SEAM.length) === STALE_SEAM, `stale seam not at the recorded offset in ${f}:${e.lineIndex}`);
      lines[e.lineIndex] = L.slice(0, e.seamCharOffset) + LIVE_SEAM + L.slice(e.seamCharOffset + STALE_SEAM.length);
      must(sha256(Buffer.from(lines[e.lineIndex], "utf8")) === e.lineShaAfter, `after-sha mismatch in ${f}:${e.lineIndex}`);
    }
    const out = Buffer.from(lines.join("\n"), "utf8");
    must(sha256(out) === manifest.shardAfter[`page-lane/${f}`].sha256, `shard ${f} did not reach the manifest's after-state`);
    writeFileSync(p, out);
  }
  console.log(`REAPPLY DONE: ${manifest.entries.length} seams re-anchored from the recorded manifest across ${byShard.size} shards`);
  process.exit(0);
}

// ================= inverse =================
if (MODE === "inverse") {
  must(existsSync(FORWARD_MANIFEST), `no forward manifest: ${FORWARD_MANIFEST}`);
  const manifest = JSON.parse(readFileSync(FORWARD_MANIFEST, "utf8"));
  const byShard = new Map();
  for (const e of manifest.entries) {
    (byShard.get(e.shard) ?? byShard.set(e.shard, []).get(e.shard)).push(e);
  }
  for (const [f, list] of byShard) {
    const p = path.join(PAGE_DIR, f);
    const buf = readFileSync(p);
    must(sha256(buf) === manifest.shardAfter[`page-lane/${f}`].sha256, `shard ${f} drifted from the manifest's after-state before inverse`);
    const lines = buf.toString("utf8").split("\n");
    for (const e of list) {
      const L = lines[e.lineIndex];
      must(sha256(Buffer.from(L, "utf8")) === e.lineShaAfter, `line ${f}:${e.lineIndex} (${e.name}) drifted from the manifest's after-sha`);
      must(L.slice(e.seamCharOffset, e.seamCharOffset + LIVE_SEAM.length) === LIVE_SEAM,
        `live seam not at the recorded offset in ${f}:${e.lineIndex} (${e.name})`);
      const restored = L.slice(0, e.seamCharOffset) + STALE_SEAM + L.slice(e.seamCharOffset + LIVE_SEAM.length);
      must(sha256(Buffer.from(restored, "utf8")) === e.lineShaBefore, `restore sha mismatch in ${f}:${e.lineIndex}`);
      lines[e.lineIndex] = restored;
    }
    const out = Buffer.from(lines.join("\n"), "utf8");
    must(sha256(out) === manifest.shardBefore[`page-lane/${f}`].sha256, `shard ${f} did not return to its prestate sha`);
    writeFileSync(p, out);
  }
  const inv = JSON.parse(readFileSync(INVERSE_MANIFEST, "utf8"));
  inv.appliedAt = new Date().toISOString();
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(inv, null, 1));
  console.log(`INVERSE APPLIED: ${manifest.entries.length} seams restored byte-exactly across ${byShard.size} shards`);
  process.exit(0);
}

// ================= validate =================
// MODE === "validate"
{
  must(existsSync(FORWARD_MANIFEST), `no forward manifest: ${FORWARD_MANIFEST} (validate runs against the applied state)`);
  const manifest = JSON.parse(readFileSync(FORWARD_MANIFEST, "utf8"));
  const byShard = new Map();
  for (const e of manifest.entries) {
    (byShard.get(e.shard) ?? byShard.set(e.shard, []).get(e.shard)).push(e);
  }
  for (const [f, list] of byShard) {
    const buf = readFileSync(path.join(PAGE_DIR, f));
    must(sha256(buf) === manifest.shardAfter[`page-lane/${f}`].sha256, `shard ${f} sha != manifest after-state`);
    const lines = buf.toString("utf8").split("\n");
    for (const e of list) {
      const L = lines[e.lineIndex];
      must(sha256(Buffer.from(L, "utf8")) === e.lineShaAfter, `line ${f}:${e.lineIndex} (${e.name}) != after-sha`);
      must(L.includes(LIVE_SEAM), `live seam missing in ${f}:${e.lineIndex}`);
      must(!L.includes(STALE_SEAM), `stale seam still present in ${f}:${e.lineIndex}`);
    }
  }
  console.log(`VALIDATE OK: ${manifest.entries.length} re-anchored seams verified across ${byShard.size} shards (after-state shas + live-seam presence + zero stale remainder)`);
  process.exit(0);
}
