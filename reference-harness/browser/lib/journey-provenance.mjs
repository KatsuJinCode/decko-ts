import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function treeDigest(root) {
  if (!existsSync(root)) return null;
  const hash = createHash("sha256");
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`artifact symlink unsupported: ${file}`);
      if (stat.isDirectory()) visit(file);
      else hash.update(path.relative(root, file).replaceAll("\\", "/") + "\0" + sha256(readFileSync(file)) + "\n");
    }
  }
  visit(root);
  return hash.digest("hex");
}
export function captureFixtureIdentity(fixture, pin) {
  if (pin !== undefined && !/^[0-9a-f]{64}$/.test(pin)) throw new Error("--fixture-sha256 must be exactly 64 lowercase hexadecimal characters");
  const actual = treeDigest(path.resolve(fixture));
  if (pin !== undefined && actual !== pin) throw new Error(`fixture SHA-256 mismatch: expected ${pin}, actual ${actual}`);
  return actual;
}
export function captureProvenance(args, engine) {
  // Admission precedes Git/dist work, output reservation, server start and browser launch.
  if (Object.hasOwn(args, "fixture-sha256") && args["fixture-sha256"] === undefined) throw new Error("--fixture-sha256 requires a value");
  const fixtureSha256 = captureFixtureIdentity(args.fixture, args["fixture-sha256"]);
  const repo = fileURLToPath(new URL("../../..", import.meta.url));
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { windowsHide: true, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  const dirty = git("status", "--porcelain", "--untracked-files=normal");
  const receiptPath = path.join(repo, ".runtime/browser-build.json");
  const buildReceipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) : null;
  return {
    buildReceipt,
    format: "decko-browser-evidence/1", runId: args["run-id"] ?? randomUUID(),
    startedAt: new Date().toISOString(),
    source: { commit, dirty: !!dirty, diffSha256: sha256(git("diff", "HEAD", "--binary")), statusSha256: sha256(dirty) },
    artifacts: { distSha256: treeDigest(path.join(repo, "dist")) },
    fixtureSha256,
    fixturePinSha256: args["fixture-sha256"] ?? null,
    journeysSha256: sha256(readFileSync(args.journeys)),
    contractsSha256: existsSync(args.contracts ?? new URL("../journeys/product-contracts.json", import.meta.url)) ? sha256(readFileSync(args.contracts ?? new URL("../journeys/product-contracts.json", import.meta.url))) : null,
    engineSha256: sha256(readFileSync(args.engine)), engine: engine.name,
    selection: { filter: args.filter ?? null, shard: args.shard ?? "0/1" },
    runner: { node: process.version, platform: process.platform, editorSettle: process.env.HARNESS_EDITOR_SETTLE ?? null, offline: process.env.HARNESS_OFFLINE ?? null },
  };
}
