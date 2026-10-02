// Bootstrap for the endpoint suites that boot vm-staging-server.mjs.
//
// The staging server imports the engine from ./dist/src/... — the tsc
// build output, which is gitignored (.gitignore: `dist/`). A fresh
// worktree or scratch clone has no dist/, and the server dies there with
// ERR_MODULE_NOT_FOUND before any assertion runs. The suite's contract is
// "actually-running, never a skip on missing build output", so this
// helper builds dist/ on first use with the repo's own tsconfig
// (`tsc -p tsconfig.json` — a seconds-scale full emit, no scoped-subset
// machinery needed).
//
// Concurrency: vitest runs test files in bounded-parallel forks
// (vitest.config.ts maxWorkers 4), and BOTH endpoint suites bootstrap.
// The build is guarded by a mkdir-based cross-process lock under dist/
// with a double-checked rebuild gate and a stale-lock takeover; the
// completion sentinel (written only after tsc exits 0) keeps a third
// process from booting the server against a half-emit dist.
//
// Stale-dist guard: entry+sentinel alone cannot tell a dist emitted BEFORE
// a server module was added to src from a current one — the server then
// boot-fails ERR_MODULE_NOT_FOUND on a dist that passes the gate. So
// readiness also requires every dist module vm-staging-server.mjs actually
// imports (the ./dist/... specifiers read straight from its source, so the
// gate tracks the server's import graph with no hand-maintained list) to
// exist and be non-empty; a stale dist fails the gate and rebuilds instead
// of boot-failing (tsc here is a full emit, no incremental cache).
//
// The two progress prints are gated behind STAGING_DIST_BOOTSTRAP_VERBOSE=1
// so a normal `vitest run` stays quiet; failures throw loudly regardless.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DIST_DIR = path.join(REPO_ROOT, "dist");
const DIST_ENTRY = path.join(DIST_DIR, "src", "server", "drivers", "local-sqlite.js");
const SERVER_ENTRY = path.join(REPO_ROOT, "vm-staging-server.mjs");
const BUILD_SENTINEL = path.join(DIST_DIR, ".staging-server-dist-built");
const LOCK_DIR = path.join(DIST_DIR, ".tsc-build-lock");
const LOCK_STALE_MS = 10 * 60_000;
const LOCK_WAIT_MS = 180_000;
const TSC_BIN = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The dist modules vm-staging-server.mjs actually imports (the ./dist/...
 *  specifiers read straight from its source), as absolute paths. */
function requiredServerDistModules(): string[] {
  const source = readFileSync(SERVER_ENTRY, "utf8");
  const specifiers = [...source.matchAll(/from "(\.\/dist\/[^"]+)"/g)].map((m) => m[1]);
  return [...new Set(specifiers)].map((s) => path.join(REPO_ROOT, s));
}

/** Dist-side readiness gaps: the entry, or any module the server imports,
 *  missing or EMPTY (0 bytes is never a valid module emit, so a truncated
 *  or half-written file counts as missing). */
function missingDistModules(): string[] {
  const missing: string[] = [];
  if (!existsSync(DIST_ENTRY)) missing.push(path.relative(REPO_ROOT, DIST_ENTRY));
  for (const file of requiredServerDistModules()) {
    let ready = false;
    try {
      ready = statSync(file).size > 0;
    } catch {
      ready = false;
    }
    if (!ready) missing.push(path.relative(REPO_ROOT, file));
  }
  return missing;
}

function distReady(): boolean {
  return existsSync(BUILD_SENTINEL) && missingDistModules().length === 0;
}

async function acquireBuildLock(): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      // Parent dist/ may not exist yet; create it tolerantly.
      mkdirSync(DIST_DIR, { recursive: true });
      // The lock itself must be NON-recursive: mkdirSync(recursive) never
      // throws EEXIST, which would make this a no-op lock (both forks
      // would build — benign today because the sentinel gates boot
      // readiness, but the serialization is the design).
      mkdirSync(LOCK_DIR);
      return;
    } catch {
      // Lock held. Take it over only when provably stale (no live build
      // writes a lock and then idles for 10 minutes; tsc here is seconds).
      try {
        const stat = statSync(LOCK_DIR);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          rmSync(LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // vanished between stat and now — retry the mkdir
      }
      if (Date.now() > deadline) {
        throw new Error(
          `staging-server dist bootstrap: another tsc build holds ${LOCK_DIR} and ` +
            `${LOCK_WAIT_MS / 1000}s elapsed without it finishing or going stale`,
        );
      }
      await sleep(250);
    }
  }
}

/**
 * Guarantee dist/ exists (building it with the repo tsconfig when it does
 * not) so vm-staging-server.mjs can boot. Await this before spawning the
 * server. Fails LOUDLY — a broken build surfaces tsc's output; there is
 * no skip path.
 */
export async function ensureStagingServerDist(): Promise<void> {
  if (distReady()) return;
  await acquireBuildLock();
  try {
    if (distReady()) return; // double-checked: a parallel fork built it
    if (!existsSync(TSC_BIN)) {
      throw new Error(
        `staging-server dist bootstrap: typescript not found at ${TSC_BIN} — ` +
          `run npm install, or build dist/ manually with npx tsc -p tsconfig.json`,
      );
    }
    if (process.env.STAGING_DIST_BOOTSTRAP_VERBOSE === "1") {
      console.log(
        "[staging-server-dist] dist/ missing or stale (gitignored tsc output, or it " +
          "predates a module vm-staging-server.mjs now imports) — building with the repo tsconfig...",
      );
    }
    const result = spawnSync(process.execPath, [TSC_BIN, "-p", path.join(REPO_ROOT, "tsconfig.json")], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const stillMissing = missingDistModules();
    if (result.status !== 0 || stillMissing.length > 0) {
      throw new Error(
        `staging-server dist bootstrap: tsc -p tsconfig.json failed ` +
          `(status ${result.status})\n--- tsc stdout ---\n${result.stdout ?? ""}` +
          `\n--- tsc stderr ---\n${result.stderr ?? ""}` +
          (stillMissing.length > 0
            ? `\n--- dist modules still missing/empty after build ---\n${stillMissing.join("\n")}`
            : ""),
      );
    }
    writeFileSync(BUILD_SENTINEL, new Date().toISOString() + "\n");
    if (process.env.STAGING_DIST_BOOTSTRAP_VERBOSE === "1") {
      console.log("[staging-server-dist] dist/ built.");
    }
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}
