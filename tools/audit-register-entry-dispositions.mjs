#!/usr/bin/env node
// Audit: does every numbered entry of a completeness-register section have a
// disposition on the port branches that claim the section?
//
// WHAT IT ANSWERS
// The completeness register (kept in the lead documentation repo) grades each
// numbered entry of a section with a verdict. Entries graded PARTIAL (or
// UNPORTED) are the open work of that family. A family is CLOSED when every
// such entry has a disposition commit on one of the family's port branches.
// This script computes both halves mechanically: the entry list from the
// register text, the disposition list from git history, and the difference.
//
// USAGE
//   node tools/audit-register-entry-dispositions.mjs \
//     --register <path-to-register.md> \
//     --base <sha> \
//     --branch <branch> [--branch <branch> ...] \
//     [--entry-regex <regex>] [--mod-dir <dir>] [--json <out-path>]
//
//   --entry-regex  default: matches a numbered entry heading; group 1 = entry
//                  number, group 2 = mod name, group 3 = verdict.
//   --mod-dir      default: src/card/mod-loader/mods
//   --base         the commit the family's lanes branched from. Commits are
//                  attributed to the first branch that carries them.
//   --branch       repeatable, in build order. Each branch is credited only
//                  with the commits it adds on top of --base and the earlier
//                  branches.
//
// HOW A DISPOSITION IS RECOGNISED, strongest tier first
//   tier 1  the commit message names the entry: "register entry N".
//   tier 2  the commit subject is about the mod: it starts with the mod name
//           ("format: ...", "tabs (register entry 31): ...", "Port collection ...").
//   tier 3  the commit changes the mod's own port file and nothing stronger
//           claims that entry. A tier-3 attribution is reported as
//           "file-touch only": it says the lane changed the mod's file, not
//           that the lane dispositioned that register entry. Read it before
//           treating it as a disposition.
//   The reported disposition for an entry is the strongest tier available,
//   then the earliest branch, then the earliest commit.
//
// EXIT
//   0 when the family is closed (no open entry lacks a disposition).
//   1 when at least one open entry has no disposition.
//   2 on a usage or input error (nothing is deleted, nothing is written).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);

function optionValue(name, fallback) {
  const at = argv.indexOf(name);
  if (at === -1) return fallback;
  const value = argv[at + 1];
  if (value === undefined) fail(`option ${name} needs a value`);
  return value;
}

function optionValues(name) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name) {
      const value = argv[i + 1];
      if (value === undefined) fail(`option ${name} needs a value`);
      out.push(value);
    }
  }
  return out;
}

function fail(message) {
  process.stderr.write(`audit-register-entry-dispositions: ${message}\n`);
  process.exit(2);
}

const registerPath = optionValue("--register", null);
if (!registerPath) fail("--register <path> is required");

const base = optionValue("--base", null);
if (!base) fail("--base <sha> is required");

const branches = optionValues("--branch");
if (branches.length === 0) fail("--branch <branch> is required at least once");

const modDir = optionValue("--mod-dir", "src/card/mod-loader/mods");
const entryRegexSource = optionValue(
  "--entry-regex",
  "^\\*\\*(\\d+)\\. card-mod-([a-z_0-9]+) \\u2014 (PORTED|PARTIAL|UNPORTED)",
);
const jsonOut = optionValue("--json", null);
const repoRoot = path.resolve(optionValue("--repo", process.cwd()));

const entryRegex = new RegExp(entryRegexSource, "gm");

// ---- the register side -----------------------------------------------------

let registerText;
try {
  registerText = readFileSync(registerPath, "utf8");
} catch (error) {
  fail(`cannot read register ${registerPath}: ${error.message}`);
}

const entries = [];
for (const match of registerText.matchAll(entryRegex)) {
  entries.push({
    number: Number(match[1]),
    mod: match[2],
    verdict: match[3],
    line: registerText.slice(0, match.index).split("\n").length,
  });
}
if (entries.length === 0) fail(`no entries matched ${entryRegexSource}`);

const seenNumbers = new Set();
for (const entry of entries) {
  if (seenNumbers.has(entry.number)) fail(`duplicate entry number ${entry.number}`);
  seenNumbers.add(entry.number);
}
entries.sort((a, b) => a.number - b.number);

const entryByMod = new Map(entries.map((entry) => [entry.mod, entry]));

// ---- the git side ----------------------------------------------------------

function git(args, allowFail = false) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (allowFail) return "";
    fail(`git ${args.join(" ")} failed: ${error.message}`);
  }
}

// candidates: entry number -> list of attribution candidates
const candidates = new Map();
const integrityFindings = [];
const allCommits = new Set();

function addCandidate(entryNumber, candidate) {
  if (!candidates.has(entryNumber)) candidates.set(entryNumber, []);
  candidates.get(entryNumber).push(candidate);
}

for (const branch of branches) {
  const rev = git(["rev-parse", "--verify", `${branch}^{commit}`], true).trim();
  if (!rev) fail(`branch ${branch} does not resolve in ${repoRoot}`);

  const notArgs = [];
  for (const other of [base, ...branches.slice(0, branches.indexOf(branch))]) {
    notArgs.push("--not", other);
  }
  const shas = git(["rev-list", "--no-merges", rev, ...notArgs], true)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const sha of shas) {
    if (allCommits.has(sha)) continue;
    allCommits.add(sha);

    const body = git(["log", "-1", "--format=%B", sha]);
    const subject = body.split("\n")[0].trim();
    const files = git(["show", "--name-only", "--format=", sha])
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const touchedMods = new Set();
    for (const file of files) {
      const match = file.match(
        new RegExp(
          `^${modDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/card-mod-([a-z_0-9]+)\\.ts$`,
        ),
      );
      if (match) touchedMods.add(match[1]);
    }

    // tier 1: the message names the register entry.
    const claimed = body.match(/register entry (\d+)/i);
    if (claimed) {
      const number = Number(claimed[1]);
      const known = entries.find((entry) => entry.number === number);
      addCandidate(number, {
        entry: number,
        tier: 1,
        tierName: "message names the entry",
        branch,
        sha: sha.slice(0, 8),
        subject,
        touchesModFile: known ? touchedMods.has(known.mod) : false,
      });
    }

    // tier 2: the subject leads with the mod name.
    for (const [mod, entry] of entryByMod) {
      const lead = new RegExp(`^(?:Port |Complete |Wire |Audit |Pin )?${mod}(?![a-z_0-9])`);
      if (lead.test(subject)) {
        addCandidate(entry.number, {
          entry: entry.number,
          tier: 2,
          tierName: "subject leads with the mod name",
          branch,
          sha: sha.slice(0, 8),
          subject,
          touchesModFile: touchedMods.has(mod),
        });
      }
    }

    // tier 3: the commit changes the mod's own port file.
    for (const mod of touchedMods) {
      const entry = entryByMod.get(mod);
      if (!entry) {
        integrityFindings.push({
          sha: sha.slice(0, 8),
          branch,
          subject,
          note: `mod ${mod} has no numbered register entry`,
        });
        continue;
      }
      addCandidate(entry.number, {
        entry: entry.number,
        tier: 3,
        tierName: "file-touch only",
        branch,
        sha: sha.slice(0, 8),
        subject,
        touchesModFile: true,
      });
    }
  }
}

// Pick the strongest attribution per entry: lowest tier, then earliest branch,
// then earliest commit.
const dispositions = new Map();
for (const [number, list] of candidates) {
  const ranked = list
    .map((candidate) => ({
      ...candidate,
      branchOrder: branches.indexOf(candidate.branch),
    }))
    .sort((a, b) => a.tier - b.tier || a.branchOrder - b.branchOrder);
  dispositions.set(number, ranked[0]);
}

// ---- the answer ------------------------------------------------------------

const openVerdicts = new Set(["PARTIAL", "UNPORTED"]);
const open = entries.filter((entry) => openVerdicts.has(entry.verdict));
const openWithoutDisposition = open.filter((entry) => !dispositions.has(entry.number));

const lines = [];
lines.push(`register: ${registerPath}`);
lines.push(`entries: ${entries.length}`);
lines.push(`branches credited: ${branches.join(", ")}`);
lines.push("");
lines.push("entry | mod | verdict | disposition");
for (const entry of entries) {
  const disposition = dispositions.get(entry.number);
  let text = "n/a (not an open entry)";
  if (disposition) {
    text = `tier ${disposition.tier} (${disposition.tierName}) ${disposition.branch} ${disposition.sha} ${disposition.subject}`;
  } else if (openVerdicts.has(entry.verdict)) {
    text = "OPEN - no disposition";
  }
  lines.push(
    [String(entry.number), entry.mod, entry.verdict, text].join(" | "),
  );
}
lines.push("");
lines.push(
  `open entries in the register (PARTIAL or UNPORTED): ${open.length} (${open
    .map((entry) => entry.number)
    .join(", ")})`,
);
lines.push(
  `open entries WITH a disposition: ${
    open.length - openWithoutDisposition.length
  }`,
);
lines.push(
  `open entries WITHOUT a disposition: ${openWithoutDisposition.length}${
    openWithoutDisposition.length
      ? ` (${openWithoutDisposition.map((entry) => entry.number).join(", ")})`
      : ""
  }`,
);
lines.push(
  `closed-verdict entries (PORTED) with no disposition: ${
    entries.filter(
      (entry) =>
        !openVerdicts.has(entry.verdict) && !dispositions.has(entry.number),
    ).length
  }`,
);
lines.push(
  `open entries whose disposition is tier 3 (file-touch only, read it): ${
    open.filter((entry) => {
      const disposition = dispositions.get(entry.number);
      return disposition && disposition.tier === 3;
    }).length
  }`,
);
lines.push(
  `open entries whose disposition commit does not touch the mod's own file: ${
    open.filter((entry) => {
      const disposition = dispositions.get(entry.number);
      return disposition && !disposition.touchesModFile;
    }).length
  }`,
);
for (const entry of open) {
  const disposition = dispositions.get(entry.number);
  if (disposition && disposition.tier === 3) {
    integrityFindings.push({
      sha: disposition.sha,
      branch: disposition.branch,
      subject: disposition.subject,
      note: `entry ${entry.number} (${entry.mod}) has only a file-touch attribution: read the commit before treating it as a disposition`,
    });
  }
}
if (integrityFindings.length > 0) {
  lines.push("");
  lines.push("integrity findings:");
  for (const finding of integrityFindings) {
    lines.push(`  ${finding.sha} ${finding.branch}: ${finding.note}`);
  }
}
lines.push("");
lines.push(
  openWithoutDisposition.length === 0
    ? "FAMILY CLOSED: every open register entry carries a disposition."
    : "FAMILY OPEN: the entries listed as OPEN above still need a disposition.",
);

const report = lines.join("\n");
process.stdout.write(`${report}\n`);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    `${JSON.stringify(
      {
        register: registerPath,
        base,
        branches,
        entries,
        dispositions: [...dispositions.values()],
        openEntryNumbers: open.map((entry) => entry.number),
        openWithoutDisposition: openWithoutDisposition.map(
          (entry) => entry.number,
        ),
        integrityFindings,
        familyClosed: openWithoutDisposition.length === 0,
      },
      null,
      2,
    )}\n`,
  );
}

process.exit(openWithoutDisposition.length === 0 ? 0 : 1);
