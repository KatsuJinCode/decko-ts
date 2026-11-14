// Import a completed capture into a newly named fixture with identical input
// bytes. Preserve its original identity and metadata; never recapture by relabel.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resultFiles, verifyFixture, writeExpectedManifest } from "../../reference-harness/runner/manifest.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function importCapture({ sourceFixture, targetFixture, capture, out, role = "expected" }) {
  if (!["expected", "actual"].includes(role)) throw new Error("role must be expected or actual");
  const source = verifyFixture(sourceFixture);
  const target = verifyFixture(targetFixture);
  if (source.problems.length || target.problems.length) throw new Error("source and target fixtures must match their manifests");
  if (source.digest !== target.digest) throw new Error("fixture input hashes differ; a new capture is required");
  const original = readFileSync(join(capture, "run-meta.json"));
  const meta = JSON.parse(original);
  if (meta.fixture !== basename(sourceFixture)) throw new Error("capture names another source fixture");
  for (const kind of ["render", "semantics", "scenarios"]) {
    const run = meta.runs?.[kind];
    if (!run || !run.complete || run.selection || run.ops_run !== run.ops_total) throw new Error(`capture ${kind} is incomplete or filtered`);
    if (run.fixture_digest !== source.digest || run.fixture_problems?.length) throw new Error(`capture ${kind} does not identify the verified inputs`);
    if (role === "expected" && (run.engine?.engine !== "decko-ruby" || run.engine?.version?.ruby !== "3.3.12")) throw new Error(`capture ${kind} is not the canonical Ruby 3.3.12 oracle`);
  }
  if (existsSync(join(out, "run-meta.json"))) throw new Error("destination already has a capture; use a new destination");
  const files = Object.fromEntries(resultFiles(capture).map((name) => [name, hash(readFileSync(join(capture, name)))]));
  const provenance = {
    source_fixture: meta.fixture,
    source_fixture_digest: source.digest,
    target_fixture: basename(targetFixture),
    target_fixture_digest: target.digest,
    source_run_meta_sha256: hash(original),
    source_files: files,
    original_metadata: "capture-provenance/run-meta.original.json",
    reason: "New fixture name for the isolated event plan and canonical interpreter; every input-file hash is identical to the captured source. Output bytes and interpreter records are unchanged.",
  };
  mkdirSync(join(out, "capture-provenance"), { recursive: true });
  writeFileSync(join(out, provenance.original_metadata), original);
  copyFileSync(join(sourceFixture, "MANIFEST.json"), join(out, "capture-provenance/source-fixture-manifest.json"));
  for (const name of resultFiles(capture)) if (name !== "run-meta.json") copyFileSync(join(capture, name), join(out, name));
  writeFileSync(join(out, "run-meta.json"), JSON.stringify({ ...meta, fixture: basename(targetFixture), capture_origin: provenance }, null, 2) + "\n");
  if (role === "expected") writeExpectedManifest(targetFixture, out, { provenance: { imported_capture: provenance } });
  return provenance;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  const provenance = importCapture({ sourceFixture: args["source-fixture"], targetFixture: args.fixture, capture: args.capture, out: args.out, role: args.role });
  process.stdout.write(JSON.stringify(provenance, null, 2) + "\n");
}
