// THE MACHINE LANE WORKTREE DISK HYGIENE GATE — operator law (2026-10-03):
// "cleanup that doesn't manage itself is illegal — no durable system may
// rely on the lead agent's memory or discipline."
//
// WHAT THIS TEST DOES: enumerates every lane worktree on this machine
// (directories under C:/localProjects matching the lane-name globs, plus
// registered-but-missing entries from `git worktree list` in both repos) and
// FAILS THE BUILD when any of the machine's disk-hygiene budgets is exceeded:
//
//  (a) MEMBERSHIP: every lane worktree on disk must be either actively
//      tracked in IN-FLIGHT.json (the lanes[] array's worktree fields — a
//      lane the controller is actively running is legitimate) or listed in
//      the checked-in tests/hygiene/keep-worktrees.json (permanent keeps:
//      live-release rollback anchors, this gate's own host). Anything else
//      is accumulation, and the failure names each one with its exact
//      `git worktree remove` command — the failure message IS the
//      remediation.
//  (b) DISK BUDGET: the summed size of the DISALLOWED lane worktrees must
//      stay under 1 GB. The measurement is a depth-capped FLOOR (see the
//      sizing note below): a floor over budget proves the true size is over
//      budget, so a violation is conclusive.
//  (c) POPULATION: more than 15 total lane worktrees on disk fails
//      regardless of allowlists — even a fully-allowed fleet past 15 is
//      accumulation the controller must consciously shrink.
//
//  Registered-but-missing lane entries (stale `git worktree list`
//  registrations) are named too, with the repo-scoped `git worktree prune`
//  remediation.
//
// SIZING HONESTY: the per-worktree measure walks directory entries to depth
// 2 from the worktree root (root files + entries inside depth-1 and depth-2
// directories; deeper directories are NOT descended; junctions/symlinks are
// skipped). It is a LOWER BOUND of the true size — node_modules' mass lives
// below depth 2 — so the 1 GB budget is compared against a floor and can
// only understate violations, never invent them. The floor still catches the
// worktree payloads (root files, sources, DB/fixture payloads at shallow
// depth) and crossed 1 GB on the day this gate was born while ~76 lane
// worktrees / 65.65 GB (operator census) accumulated.
//
// BORN RED, BY DESIGN: the gate landed while the machine held ~76 lane
// worktrees (budget: 15) and the disallowed floor was measured in GB
// (budget: 1). It turns GREEN only when the cleanup lane finishes and
// IN-FLIGHT.json reflects reality. Do NOT weaken the budgets to make it
// green — run the remediation the failure message names.
//
// RAISING ANY NUMBER HERE (the 1 GB budget, the 15-worktree population cap,
// the globs, the depth) requires a receipt justification FIRST and the
// change in the SAME commit, so the envelope cannot drift silently. Same
// discipline as the hops gate's ceiling.
//
// SCOPE: this gate is machine-scoped on purpose (its subject is this
// machine's disk). On a machine without C:/localProjects it fails loud with
// a distinct message rather than pretending the disk is clean.

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Machine lane-worktree home. The gate judges THIS machine's disk. */
const LOCAL_PROJECTS = "C:/localProjects";

/** Directory-name globs for lane worktrees. The main trunks
 *  (decko-ts-restored, brandonDojoTech) never match these prefixes. */
const LANE_DIR_PREFIXES = ["decko-ts-lane-", "brandonDojoTech-lane-"] as const;

/** The controller's live coordination file: a lane listed in lanes[] is
 *  actively tracked, so its worktree is legitimate while it runs. */
const IN_FLIGHT_PATH =
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/IN-FLIGHT.json";

/** Checked-in permanent keeps: exact paths + a one-line reason each. */
const KEEP_FILE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "keep-worktrees.json",
);

/** (b) The disk budget for disallowed lane worktrees: 1 GB, compared
 *  against the depth-capped floor (a lower bound of true size). */
const DISALLOWED_DISK_BUDGET_BYTES = 1024 ** 3;

/** (c) The population cap for lane worktrees on disk, allowlists
 *  notwithstanding. */
const MAX_TOTAL_LANE_WORKTREES = 15;

/** Depth cap of the size floor walk (see SIZING HONESTY above). */
const FLOOR_MEASURE_DEPTH = 2;

/** Both repos that register lane worktrees. */
const REPO_ROOTS = [
  "C:/localProjects/decko-ts-restored",
  "C:/localProjects/brandonDojoTech",
] as const;

interface KeepEntry {
  path: string;
  reason: string;
}

function normalizePath(p: string): string {
  return p.replaceAll("\\", "/").replace(/\/+$/, "");
}

function basenameOf(p: string): string {
  const norm = normalizePath(p);
  return norm.slice(norm.lastIndexOf("/") + 1);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function owningRepoFor(dirName: string): string {
  return dirName.startsWith("brandonDojoTech-lane-")
    ? "C:/localProjects/brandonDojoTech"
    : "C:/localProjects/decko-ts-restored";
}

/** Depth-capped LOWER-BOUND size of a directory tree (see SIZING HONESTY).
 *  Race-tolerant by design: the cleanup lane may delete entries while the
 *  walk is in flight, and a vanished entry simply contributes 0. */
function floorSize(root: string, maxDepth: number): number {
  let total = 0;
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // vanished or unreadable mid-walk
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // never follow junctions/symlinks
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(child, depth + 1);
      } else {
        try {
          total += fs.statSync(child).size;
        } catch {
          // vanished mid-walk
        }
      }
    }
  };
  walk(root, 0);
  return total;
}

/** Lane worktree directories currently on disk (name-sorted snapshot). */
function laneDirsOnDisk(): string[] {
  if (!fs.existsSync(LOCAL_PROJECTS)) return [];
  return fs
    .readdirSync(LOCAL_PROJECTS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => LANE_DIR_PREFIXES.some((p) => name.startsWith(p)))
    .sort();
}

/** Worktree paths registered in a repo's `git worktree list` (porcelain). */
function registeredWorktreePaths(repoRoot: string): { paths: string[]; error?: string } {
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], {
    cwd: repoRoot,
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) {
    return { paths: [], error: result.stderr?.trim() || `exit ${result.status}` };
  }
  const paths: string[] = [];
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) paths.push(normalizePath(line.slice("worktree ".length).trim()));
  }
  return { paths };
}

/** Paths of lanes the controller is ACTIVELY tracking, read live from
 *  IN-FLIGHT.json. lanes[].worktree values carry free-text suffixes like
 *  "C:/.../decko-ts-lane-x (from 1eebfcd)" — the path is the first
 *  whitespace-delimited token. A missing/unreadable file yields an empty
 *  allowed set plus a note (fail-safe: nothing silently becomes allowed). */
function readInFlightLanePaths(): { paths: string[]; note?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(IN_FLIGHT_PATH, "utf8");
  } catch (err) {
    return { paths: [], note: `IN-FLIGHT.json unreadable (${(err as Error).message}) — no lane counts as actively tracked` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { paths: [], note: `IN-FLIGHT.json unparseable (${(err as Error).message}) — no lane counts as actively tracked` };
  }
  const lanes = (parsed as { lanes?: unknown }).lanes;
  if (!Array.isArray(lanes)) return { paths: [], note: "IN-FLIGHT.json has no lanes[] array" };
  const paths: string[] = [];
  for (const lane of lanes) {
    const wt = (lane as { worktree?: unknown }).worktree;
    if (typeof wt === "string" && wt.trim().length > 0) {
      paths.push(normalizePath(wt.trim().split(/\s+/)[0] ?? wt.trim()));
    }
  }
  return { paths };
}

function readKeepEntries(): KeepEntry[] {
  const raw = fs.readFileSync(KEEP_FILE_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${KEEP_FILE_PATH} must be a JSON array of {path, reason}`);
  return parsed.map((e) => {
    const entry = e as { path?: unknown; reason?: unknown };
    if (typeof entry.path !== "string" || typeof entry.reason !== "string") {
      throw new Error(`${KEEP_FILE_PATH} entries must each carry a path string and a one-line reason string`);
    }
    return { path: normalizePath(entry.path), reason: entry.reason };
  });
}

describe("machine lane worktree disk hygiene (operator law: cleanup that doesn't manage itself is illegal)", () => {
  it(
    "every lane worktree is tracked-or-kept, disallowed floor under 1 GB, at most 15 lane worktrees on disk",
    { timeout: 120_000 },
    () => {
      const problems: string[] = [];
      const remediation: string[] = [];

      if (!fs.existsSync(LOCAL_PROJECTS)) {
        throw new Error(
          `machine-lane gate cannot judge: ${LOCAL_PROJECTS} does not exist on this machine. ` +
            "This gate is scoped to the decko-ts build machine; running the net elsewhere needs an explicit envelope decision, not a silent pass.",
        );
      }

      // --- enumerate -----------------------------------------------------
      const onDisk = laneDirsOnDisk();
      const onDiskSet = new Set(onDisk);

      const keeps = readKeepEntries();
      const keepNames = new Set(keeps.map((k) => basenameOf(k.path)));

      const inFlight = readInFlightLanePaths();
      const inFlightNames = new Set(inFlight.paths.map(basenameOf));

      const staleRegistrations: { repo: string; path: string }[] = [];
      for (const repo of REPO_ROOTS) {
        const { paths, error } = registeredWorktreePaths(repo);
        if (error) {
          problems.push(`cannot read \`git worktree list\` in ${repo}: ${error}`);
          continue;
        }
        for (const wtPath of paths) {
          const name = basenameOf(wtPath);
          const isLane = LANE_DIR_PREFIXES.some((p) => name.startsWith(p));
          if (isLane && !fs.existsSync(wtPath)) {
            staleRegistrations.push({ repo, path: wtPath });
          }
        }
      }

      // --- classify ------------------------------------------------------
      // Re-check existence so a worktree the cleanup lane removes between
      // enumeration and judgment does not stay named on this run.
      const disallowed = onDisk.filter(
        (name) =>
          fs.existsSync(path.join(LOCAL_PROJECTS, name)) &&
          !inFlightNames.has(name) &&
          !keepNames.has(name),
      );

      // --- (a) membership -------------------------------------------------
      if (disallowed.length > 0) {
        let disallowedFloorTotal = 0;
        problems.push(
          `${disallowed.length} lane worktree(s) on disk are neither tracked in IN-FLIGHT.json nor in tests/hygiene/keep-worktrees.json:`,
        );
        for (const name of disallowed) {
          const floor = floorSize(path.join(LOCAL_PROJECTS, name), FLOOR_MEASURE_DEPTH);
          disallowedFloorTotal += floor;
          problems.push(`  - ${name}  (depth-${FLOOR_MEASURE_DEPTH} size floor: ${formatBytes(floor)})`);
          remediation.push(`git -C ${owningRepoFor(name)} worktree remove "${LOCAL_PROJECTS}/${name}"`);
        }
        remediation.push(
          "# a dirty worktree refuses `git worktree remove` until its WIP is committed or its owning lane signs off;",
          "# a path already gone by the time you run it is closed by the repo-scoped prune below",
        );

        // --- (b) disk budget (floor semantics: over-budget floor proves
        //     over-budget truth) ------------------------------------------
        if (disallowedFloorTotal > DISALLOWED_DISK_BUDGET_BYTES) {
          problems.push(
            `disallowed lane worktree size floor is ${formatBytes(disallowedFloorTotal)}, over the ${formatBytes(
              DISALLOWED_DISK_BUDGET_BYTES,
            )} budget (floor is a LOWER BOUND — true disallowed mass is at least this)`,
          );
        }
      } else if (inFlight.note) {
        // No disallowed worktrees even with a broken IN-FLIGHT read: surface
        // the coordination-file problem without failing membership.
        problems.push(`note: ${inFlight.note}`);
      }

      // --- stale registrations --------------------------------------------
      for (const stale of staleRegistrations) {
        problems.push(`registered-but-missing lane worktree: ${stale.path} (registered in ${stale.repo})`);
        remediation.push(`git -C ${stale.repo} worktree prune   # drops the stale registration for ${stale.path}`);
      }

      // --- (c) population --------------------------------------------------
      if (onDisk.length > MAX_TOTAL_LANE_WORKTREES) {
        problems.push(
          `${onDisk.length} lane worktrees on disk, over the population cap of ${MAX_TOTAL_LANE_WORKTREES} (allowlists do not exempt a fleet from this cap):`,
        );
        for (const name of onDisk) problems.push(`  - ${name}`);
      }

      if (problems.length > 0) {
        const header =
          `MACHINE LANE WORKTREE DISK HYGIENE GATE: ${problems.length} violation(s). ` +
          "The failure message IS the remediation — run exactly these commands (no pruning may rely on any agent's memory or discipline):\n" +
          problems.map((p) => "  " + p).join("\n");
        const fix =
          remediation.length > 0
            ? "\n\nREMEDIATION COMMANDS:\n  " + remediation.join("\n  ")
            : "";
        throw new Error(header + fix);
      }

      expect(onDisk.length).toBeLessThanOrEqual(MAX_TOTAL_LANE_WORKTREES);
    },
  );
});
