// swap-37-view-expectations-live-check-close-71.mjs -- swap the conditional
// data-slot show key's expectation for 37 view-lane entries to the freshly
// fetched response body, with per-entry provenance (sha-bound), following the
// swap-manifest pattern.
//
// WHY: the freshly fetched bodies carry the show key on exactly the
// discussion opens and OMIT it on the plain roots; the frozen corpus carries
// show on all 37 (a stale era). The fetched bytes are the benchmark, so the
// expectation becomes them; the engine serializer change that would produce
// them is specced separately (this tool changes no engine code).
//
// BINDING + REVERSIBILITY
//   - Refuses unless the staging is exactly at the asset-host transform's
//     after-state for every touched shard (the overlays chain in order).
//   - The manifest records each swapped line's FULL ORIGINAL TEXT
//     (lineShaBefore + lineBefore), so the revert restores byte-exact
//     pre-swap lines without re-deriving anything.
//
// MODES
//   --apply    perform the 37 swaps, write the swap manifest (one-shot;
//              refuses if the manifest already exists)
//   --inverse  restore every recorded original line, verify shard shas
//
// USAGE (from the worktree root)
//   node tools/oracle/swap-37-view-expectations-live-check-close-71.mjs \
//     --repo <worktree-root> --mode apply

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const REPO = path.resolve(argValue("--repo") ?? process.cwd());
const MODE = argValue("--mode") ?? "apply";
if (!["apply", "inverse"].includes(MODE)) {
  console.error("REFUSAL: --mode must be apply | inverse");
  process.exit(2);
}

const STAGING = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
const VIEW_DIR = path.join(STAGING, "view-lane");
const CAPTURES = argValue("--captures") ??
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/live-check-71-captures-2026-10-03";
const OUT_DIR = path.join(REPO, "fixtures", "corpus-v2", "asset-host-follow-live-close-71");
const HOST_FORWARD_MANIFEST = path.join(OUT_DIR, "asset-host-transform-manifest.json");
const SWAP_MANIFEST = path.join(OUT_DIR, "swap-manifest-37-view-expectations-2026-10-03.json");
const INVERSE_MANIFEST = path.join(OUT_DIR, "swap-manifest-37-view-expectations-2026-10-03.inverse.json");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const fail = (msg) => {
  console.error("REFUSAL: " + msg);
  process.exit(2);
};
const must = (cond, msg) => {
  if (!cond) fail(msg);
};

must(existsSync(VIEW_DIR), `missing view-lane staging: ${VIEW_DIR}`);
must(existsSync(HOST_FORWARD_MANIFEST),
  `missing host-transform manifest: ${HOST_FORWARD_MANIFEST} (the overlays chain: host transform first, then this swap)`);
must(existsSync(path.join(CAPTURES, "capture-log.jsonl")), `missing capture log under ${CAPTURES}`);

const hostManifest = JSON.parse(readFileSync(HOST_FORWARD_MANIFEST, "utf8"));
const captureLog = readFileSync(path.join(CAPTURES, "capture-log.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));
const viewCaptures = captureLog.filter((r) => r.kind === "view");
must(viewCaptures.length === 37, `expected 37 view captures, found ${viewCaptures.length}`);

// (name, view) -> capture, from the log's dual-lane-view ids
const captureByKey = new Map();
for (const c of viewCaptures) {
  const m = /^dual-lane-view:(.*):render:(.*)$/.exec(c.id);
  must(m !== null, `unparsable capture id: ${c.id}`);
  captureByKey.set(`${m[1]}\u0000${m[2]}`, c);
}

const shardFiles = readdirSync(VIEW_DIR).sort().filter((f) => /^recapture-raw-shard-\d{6}\.jsonl$/.test(f));
must(shardFiles.length === 48, `expected 48 view shards, found ${shardFiles.length}`);

if (MODE === "apply") {
  must(!existsSync(SWAP_MANIFEST), `swap manifest already exists: ${SWAP_MANIFEST}`);

  // pre-state: every view shard must be at the host transform's after-sha
  for (const f of shardFiles) {
    const meta = hostManifest.shardAfter[`view-lane/${f}`];
    must(meta !== undefined, `host manifest lacks view-lane/${f}`);
    must(sha256(readFileSync(path.join(VIEW_DIR, f), "utf8")) === meta.sha256,
      `view shard ${f} is not at the host transform's after-state`);
  }

  const entries = [];
  const shardText = new Map();
  for (const f of shardFiles) {
    shardText.set(f, readFileSync(path.join(VIEW_DIR, f), "utf8").split("\n"));
  }
  let swapped = 0;
  for (const [key, cap] of captureByKey) {
    const [name, view] = key.split("\u0000");
    const liveBytes = readFileSync(path.join(CAPTURES, cap.storedAs), "utf8");
    let done = false;
    for (const f of shardFiles) {
      const lines = shardText.get(f);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === "" || !line.includes(JSON.stringify(name).slice(1, -1))) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.name !== name || obj.views?.[view] === undefined) continue;
        const lineBefore = line;
        obj.views[view] = liveBytes;
        const lineAfter = JSON.stringify(obj);
        const alreadyEqual = lineAfter === lineBefore;
        if (!alreadyEqual) lines[i] = lineAfter;
        entries.push({
          name,
          view,
          shard: f,
          line: i,
          swapped: !alreadyEqual,
          note: alreadyEqual
            ? "already byte-equal to the 2026-10-03 live bytes (live-check exact verdict); no line change, provenance recorded"
            : "swapped to the 2026-10-03 live bytes",
          live: {
            url: cap.url,
            status: cap.status,
            bytes: cap.bytes,
            sha256: cap.sha256,
            fetchedAt: cap.fetchedAt,
            storedAs: cap.storedAs,
          },
          stagedSha256: sha256(liveBytes),
          lineShaBefore: sha256(lineBefore),
          lineShaAfter: sha256(alreadyEqual ? lineBefore : lineAfter),
          lineBefore,
        });
        swapped += alreadyEqual ? 0 : 1;
        done = true;
        break;
      }
      if (done) break;
    }
    must(done, `no staging line found for ${name}:${view}`);
  }
  must(entries.length === 37, `expected 37 entry records, made ${entries.length} (${swapped} line swaps)`);

  const shardBefore = {};
  const shardAfter = {};
  for (const f of shardFiles) {
    const beforeSha = hostManifest.shardAfter[`view-lane/${f}`].sha256;
    const text = shardText.get(f).join("\n");
    const afterSha = sha256(text);
    const touched = entries.some((e) => e.shard === f && e.swapped);
    if (touched) {
      must(afterSha !== beforeSha, `shard ${f} touched without sha change`);
      writeFileSync(path.join(VIEW_DIR, f), text);
      shardBefore[`view-lane/${f}`] = { sha256: beforeSha };
      shardAfter[`view-lane/${f}`] = { sha256: afterSha };
    }
  }

  const manifest = {
    schema: "close-71-view-swap/1",
    title: "37 W3 view-lane expectations swapped to the 2026-10-03T19:43Z live-check bytes (conditional show-key truth)",
    appliedAt: new Date().toISOString(),
    groundTruth:
      "live-check-71: 71/71 LIVE-CONFIRMS-RECAPTURED; live carries data-slot show on exactly the 11 discussion opens (show:[comment_box]) and omits it on the 26 plain roots; frozen corpus carries show 37/37 (stale era)",
    prestateBinding: `every view shard sha matched asset-host-transform-manifest.json's shardAfter (${path.basename(HOST_FORWARD_MANIFEST)})`,
    counts: { swapped, byView: entries.reduce((a, e) => ((a[e.view] = (a[e.view] ?? 0) + 1), a), {}) },
    shardBefore,
    shardAfter,
    entries,
    revert: `node tools/oracle/swap-37-view-expectations-live-check-close-71.mjs --repo <worktree-root> --mode inverse`,
  };
  writeFileSync(SWAP_MANIFEST, JSON.stringify(manifest, null, 1));
  const inverse = {
    schema: "close-71-view-swap/1",
    title: "INVERSE of the 37-view swap: restores each recorded line's exact pre-swap text",
    inverseOf: { path: path.relative(REPO, SWAP_MANIFEST), sha256: sha256(readFileSync(SWAP_MANIFEST)) },
    appliedAt: null,
    entries,
    shardBefore,
    shardAfter,
  };
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(inverse, null, 1));
  console.log(
    `SWAP DONE: ${swapped} view expectation lines swapped to the 2026-10-03 live bytes, ` +
    `${entries.length - swapped} already byte-equal (recorded, no line change); manifest: ${path.relative(REPO, SWAP_MANIFEST)}`,
  );
  process.exit(0);
}

// ---------- --inverse ----------
must(existsSync(SWAP_MANIFEST), `no swap manifest: ${SWAP_MANIFEST}`);
{
  const manifest = JSON.parse(readFileSync(SWAP_MANIFEST, "utf8"));
  const byShard = new Map();
  for (const e of manifest.entries) {
    (byShard.get(e.shard) ?? byShard.set(e.shard, []).get(e.shard)).push(e);
  }
  for (const [f, list] of byShard) {
    const p = path.join(VIEW_DIR, f);
    const lines = readFileSync(p, "utf8").split("\n");
    for (const e of list) {
      must(sha256(lines[e.line]) === e.lineShaAfter,
        `line ${f}:${e.line} (${e.name}:${e.view}) drifted from the swap manifest's after-sha`);
      lines[e.line] = e.lineBefore;
      must(sha256(lines[e.line]) === e.lineShaBefore, `line ${f}:${e.line} restore sha mismatch`);
    }
    const text = lines.join("\n");
    must(sha256(text) === manifest.shardBefore[`view-lane/${f}`].sha256,
      `shard ${f} did not return to its pre-swap sha`);
    writeFileSync(p, text);
  }
  const inv = JSON.parse(readFileSync(INVERSE_MANIFEST, "utf8"));
  inv.appliedAt = new Date().toISOString();
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(inv, null, 1));
  console.log(`INVERSE APPLIED: 37 view expectation lines restored byte-exactly`);
  process.exit(0);
}
