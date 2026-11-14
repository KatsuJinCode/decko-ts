// BUILD ONE REGISTER ROW'S ORACLE-SURFACE FIXTURE.
//
// WHAT IT IS. The completeness register's mod rows each name one Ruby gem
// (the pinned oracle) and one port mod file. This tool reads the row's
// census (the output of tools/audit-mod-declaration-coverage.mjs, which
// compares the pinned gem's declarations against the port's registrations)
// and writes the fixture the row's pin test reads: the gem's declarations,
// the port's registrations, and the names the row leaves open, each with
// the reason it is left open.
//
// WHY A FIXTURE AND NOT A LIVE GEM READ. The pinned gems live outside the
// repository (C:/localProjects/decko-ruby-oracle-gems). A test that read
// them at run time would pass on the author's machine and fail on every
// other one, and the census could not be re-derived in CI. The fixture
// freezes the oracle side (the gem's declarations, read from the pinned
// gem tree) so the test can check the PORT side on its own, and it names
// the oracle it was read from.
//
// USAGE
//   node tools/build-register-row-oracle-surface-fixture.mjs \
//     --census <census.json> \
//     --row <register row number> \
//     --mod <gem name, e.g. card-mod-account> \
//     --port <port mod file, relative to the repo root> \
//     --verdict DONE|WORKING \
//     --gap "<the measured gap, one mechanism sentence>" \
//     --skip "<kind>:<name>=<reason>[~@~<kind>:<name>=<reason>]..." \
//     --out <fixture path>
//
// EXIT
//   0 on success, 2 on a usage or input error.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPortSetPathRegistrations } from "./audit-mod-port-registration-reader.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

const argv = process.argv.slice(2);

function optionValue(name, fallback = null) {
  const at = argv.indexOf(name);
  if (at === -1) return fallback;
  const value = argv[at + 1];
  if (value === undefined) {
    process.stderr.write(`build-register-row-oracle-surface-fixture: ${name} needs a value\n`);
    process.exit(2);
  }
  return value;
}

const censusPath = optionValue("--census");
if (!censusPath) {
  process.stderr.write("build-register-row-oracle-surface-fixture: --census is required\n");
  process.exit(2);
}
const row = optionValue("--row");
const mod = optionValue("--mod");
const portFile = optionValue("--port");
const verdict = optionValue("--verdict");
const gap = optionValue("--gap", "");
const skipArgument = optionValue("--skip", "");
const outPath = optionValue("--out");
if (!row || !mod || !portFile || !verdict || !outPath) {
  process.stderr.write(
    "build-register-row-oracle-surface-fixture: --row, --mod, --port, --verdict and --out are required\n",
  );
  process.exit(2);
}
if (verdict !== "DONE" && verdict !== "WORKING") {
  process.stderr.write("build-register-row-oracle-surface-fixture: --verdict must be DONE or WORKING\n");
  process.exit(2);
}

const census = JSON.parse(readFileSync(censusPath, "utf8"));

// The port side, read the same way the census reads it.
const portPath = resolve(REPO, portFile);
if (!existsSync(portPath)) {
  process.stderr.write(`build-register-row-oracle-surface-fixture: no port file at ${portFile}\n`);
  process.exit(2);
}
const portText = readFileSync(portPath, "utf8");
const { bySetPath } = readPortSetPathRegistrations(portText);
const portViewNames = new Set();
const portEventNames = new Set();
for (const entry of bySetPath.values()) {
  for (const view of entry.views) portViewNames.add(view);
  for (const event of entry.events) portEventNames.add(event);
}

// The gem side, from the census (it was read from the pinned gem tree).
const gemSetFiles = census.rows.map((row) => row.setFile);
const gemViewNames = new Set();
const gemEventNames = new Set();
for (const censusRow of census.rows) {
  for (const view of censusRow.gemViews) gemViewNames.add(view.split("@")[0]);
  for (const event of censusRow.gemEvents) gemEventNames.add(event);
}

// The names the row leaves open, each with its reason.
const namedSkips = [];
for (const entry of skipArgument.split("~@~").filter((part) => part.length > 0)) {
  const separator = entry.indexOf("=");
  if (separator === -1) {
    process.stderr.write(
      `build-register-row-oracle-surface-fixture: --skip entry "${entry}" must be kind:name=reason\n`,
    );
    process.exit(2);
  }
  const left = entry.slice(0, separator);
  const reason = entry.slice(separator + 1);
  const colon = left.indexOf(":");
  if (colon === -1) {
    process.stderr.write(
      `build-register-row-oracle-surface-fixture: --skip entry "${entry}" must be kind:name=reason\n`,
    );
    process.exit(2);
  }
  namedSkips.push({
    kind: left.slice(0, colon),
    name: left.slice(colon + 1),
    reason,
  });
}

// A view name the port MOD FILE does not register may still be
// implemented: the engine's own view table (src/card/render/views.ts)
// carries the base views, and a mod that overrides one of them says so in
// its own file. Such a name is recorded as a named skip with the engine
// table's citation, so the fixture names every open name rather than
// leaving the test to guess.
const engineViewTable = readFileSync(join(REPO, "src", "card", "render", "views.ts"), "utf8");
for (const name of [...gemViewNames]) {
  if (portViewNames.has(name)) continue;
  if (namedSkips.some((skip) => skip.kind === "view" && skip.name === name)) continue;
  if (engineViewTable.includes(`"${name}"`)) {
    namedSkips.push({
      kind: "view",
      name,
      reason: "the engine's own view table registers it (src/card/render/views.ts)",
    });
  }
}

const skipNames = new Set(namedSkips.map((skip) => `${skip.kind}:${skip.name}`));
const missingViews = [...gemViewNames].filter((name) => !portViewNames.has(name));
const missingEvents = [...gemEventNames].filter((name) => !portEventNames.has(name));
const missingSetPaths = gemSetFiles
  .map((setFile) => setFile.replace(/\.rb$/, ""))
  .filter((setPath) => !bySetPath.has(setPath));

for (const name of missingViews) {
  if (!skipNames.has(`view:${name}`)) {
    process.stderr.write(
      `build-register-row-oracle-surface-fixture: view :${name} is not registered port-side and carries no --skip reason\n`,
    );
    process.exit(2);
  }
}
for (const name of missingEvents) {
  if (!skipNames.has(`event:${name}`)) {
    process.stderr.write(
      `build-register-row-oracle-surface-fixture: event :${name} is not registered port-side and carries no --skip reason\n`,
    );
    process.exit(2);
  }
}
for (const setPath of missingSetPaths) {
  if (!skipNames.has(`set-file:${setPath}`)) {
    process.stderr.write(
      `build-register-row-oracle-surface-fixture: set file ${setPath} has no port registration and carries no --skip reason\n`,
    );
    process.exit(2);
  }
}
if (verdict === "WORKING" && gap.length === 0) {
  process.stderr.write(
    "build-register-row-oracle-surface-fixture: a WORKING row needs --gap with the measured gap\n",
  );
  process.exit(2);
}

const fixture = {
  registerRow: `reg-mods-${row}`,
  registerRowNumber: Number(row),
  mod,
  verdict,
  gap,
  oracle: {
    source: "the pinned Ruby gem tree C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems",
    gem: census.gem,
    readBy:
      "tools/audit-mod-declaration-coverage.mjs (the family's declaration census) and this tool",
  },
  port: {
    file: relative(REPO, portPath).replace(/\\/g, "/"),
    setPaths: [...bySetPath.keys()].sort(),
    viewNames: [...portViewNames].sort(),
    eventNames: [...portEventNames].sort(),
  },
  gem: {
    setFiles: gemSetFiles,
    viewNames: [...gemViewNames].sort(),
    eventNames: [...gemEventNames].sort(),
  },
  namedSkips,
};

mkdirSync(dirname(resolve(REPO, outPath)), { recursive: true });
writeFileSync(resolve(REPO, outPath), `${JSON.stringify(fixture, null, 2)}\n`);

process.stdout.write(
  `wrote ${outPath}: ${gemViewNames.size} gem views, ${gemEventNames.size} gem events, ` +
    `${gemSetFiles.length} gem set files, ${namedSkips.length} named skips, verdict ${verdict}\n`,
);
