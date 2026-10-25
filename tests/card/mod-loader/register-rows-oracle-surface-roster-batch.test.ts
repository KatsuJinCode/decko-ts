// THE REGISTER ROWS' ORACLE-SURFACE PINS (this lane's eight rows).
//
// One block per register row of the mods family that this lane
// adjudicates. Each block reads the row's fixture
// (tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-<n>-
// <mod>-oracle-surface.json) and checks the PORT side against the oracle
// the fixture froze:
//
//   - every view name the pinned Ruby gem declares is registered port-side,
//     or the row names it open with the reason it is open;
//   - the same for every event name;
//   - the same for every set file the gem declares;
//   - a row that is still open carries a measured gap, and a row that is
//     closed carries none.
//
// The fixture's oracle side was read from the pinned gem tree
// (C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems) by
// tools/audit-mod-declaration-coverage.mjs and
// tools/build-register-row-oracle-surface-fixture.mjs. The port side is
// read HERE, from the live port file, through the same reader the census
// uses (tools/audit-mod-port-registration-reader.mjs), so a registration
// that disappears fails this sheet.
//
// The fixtures live in their own directory because the mods family's own
// fixtures for the same rows live at the flat path on the pushed branch
// port/mods-convert-r2-20261022; two lanes must be able to carry the same
// row without one overwriting the other's measurement.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPortSetPathRegistrations } from "../../../tools/audit-mod-port-registration-reader.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURE_DIR = join(
  REPO,
  "tests",
  "card",
  "mod-loader",
  "fixtures",
  "roster-batch-20261025",
);

type SkipKind = "view" | "event" | "set-file";

type RowFixture = {
  registerRow: string;
  registerRowNumber: number;
  mod: string;
  verdict: "DONE" | "WORKING";
  gap: string;
  port: { file: string; setPaths: string[]; viewNames: string[]; eventNames: string[] };
  gem: { setFiles: string[]; viewNames: string[]; eventNames: string[] };
  namedSkips: { kind: SkipKind; name: string; reason: string }[];
};

const loadFixture = (row: number, mod: string): RowFixture => {
  const path = join(FIXTURE_DIR, `register-row-${row}-${mod}-oracle-surface.json`);
  return JSON.parse(readFileSync(path, "utf8")) as RowFixture;
};

const readPortRegistrations = (file: string) => {
  const portText = readFileSync(join(REPO, file), "utf8");
  const { bySetPath } = readPortSetPathRegistrations(portText);
  const views = new Set<string>();
  const events = new Set<string>();
  for (const entry of bySetPath.values()) {
    for (const view of entry.views) views.add(view);
    for (const event of entry.events) events.add(event);
  }
  return { setPaths: new Set(bySetPath.keys()), views, events };
};

const skipReason = (fixture: RowFixture, kind: SkipKind, name: string): string | undefined =>
  fixture.namedSkips.find((skip) => skip.kind === kind && skip.name === name)?.reason;

describe("register row 1, card-mod-account, against the pinned Ruby gem", () => {
  const fixture = loadFixture(1, "card-mod-account");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries the measured gap while the row is open", () => {
    expect(fixture.verdict).toBe("WORKING");
    expect(fixture.gap.length).toBeGreaterThan(40);
    expect(fixture.gap).toContain(" ");
  });
});

describe("register row 12, card-mod-defaults, against the pinned Ruby gem", () => {
  const fixture = loadFixture(12, "card-mod-defaults");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries the measured gap while the row is open", () => {
    expect(fixture.verdict).toBe("WORKING");
    expect(fixture.gap.length).toBeGreaterThan(40);
    expect(fixture.gap).toContain(" ");
  });
});

describe("register row 17, card-mod-format, against the pinned Ruby gem", () => {
  const fixture = loadFixture(17, "card-mod-format");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries the measured gap while the row is open", () => {
    expect(fixture.verdict).toBe("WORKING");
    expect(fixture.gap.length).toBeGreaterThan(40);
    expect(fixture.gap).toContain(" ");
  });
});

describe("register row 22, card-mod-list, against the pinned Ruby gem", () => {
  const fixture = loadFixture(22, "card-mod-list");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries the measured gap while the row is open", () => {
    expect(fixture.verdict).toBe("WORKING");
    expect(fixture.gap.length).toBeGreaterThan(40);
    expect(fixture.gap).toContain(" ");
  });
});

describe("register row 23, card-mod-markdown, against the pinned Ruby gem", () => {
  const fixture = loadFixture(23, "card-mod-markdown");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries the measured gap while the row is open", () => {
    expect(fixture.verdict).toBe("WORKING");
    expect(fixture.gap.length).toBeGreaterThan(40);
    expect(fixture.gap).toContain(" ");
  });
});

describe("register row 28, card-mod-search, against the pinned Ruby gem", () => {
  const fixture = loadFixture(28, "card-mod-search");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries the measured gap while the row is open", () => {
    expect(fixture.verdict).toBe("WORKING");
    expect(fixture.gap.length).toBeGreaterThan(40);
    expect(fixture.gap).toContain(" ");
  });
});

describe("register row 29, card-mod-session, against the pinned Ruby gem", () => {
  const fixture = loadFixture(29, "card-mod-session");

  it("registers every gem view name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.viewNames) {
      if (port.views.has(name)) continue;
      const reason = skipReason(fixture, "view", name);
      expect(reason, `view :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem event name, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const name of fixture.gem.eventNames) {
      if (port.events.has(name)) continue;
      const reason = skipReason(fixture, "event", name);
      expect(reason, `event :${name} is neither registered port-side nor named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("registers every gem set file, or names the one it leaves open", () => {
    const port = readPortRegistrations(fixture.port.file);
    for (const setFile of fixture.gem.setFiles) {
      const setPath = setFile.replace(/\.rb$/, "");
      if (port.setPaths.has(setPath)) continue;
      const reason = skipReason(fixture, "set-file", setPath);
      expect(reason, `set file ${setPath} has no port registration and is not named open`).toBeTypeOf(
        "string",
      );
      expect(reason?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it("carries no gap because the row is closed", () => {
    expect(fixture.verdict).toBe("DONE");
    expect(fixture.gap).toBe("");
  });
});
