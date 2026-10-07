// AIKIDO OFF/ON BYTE DIVERGENCE — the attribution harness
// (aikido-one-trip-byte-divergence lane, 2026-10-04).
//
// WHAT THIS IS: the rig measured byte-identity between the one-trip OFF and
// ON postures as true on 16 of 17 pages and FALSE on Aikido (OFF 77,539 /
// ON 101,786 string chars), and the cold-latency receipt deliberately did not
// attribute it. This file is the attribution: it renders the page in both
// postures through the SAME boundary the rig used (LocalSqliteDriver ->
// FetchEngine -> RenderEngine, one render(name,"open",{})), writes BOTH byte
// streams to disk under benchmarks/aikido-divergence/, and reports the first
// differing offset plus the divergence region.
//
// It renders THREE pages, not one, on purpose:
//   - "Aikido"          — the divergent page;
//   - "Aikido Oak Cliff" — the OTHER card whose name contains "Aikido", so a
//     page-IDENTITY mix-up (the rig's own flagged risk: the hops ledger never
//     confirmed which card "Aikido" is) is a measured outcome, not a guess;
//   - "Home"            — a 16-of-17 control, to show the harness itself does
//     not manufacture divergence.
//
// NOT A STANDING-NET MEMIFEST MEMBER. This is a one-shot attribution, not a
// gate. It skips cleanly when the local deck copy is absent.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { TripCapturingDriver, bootEngine, normalizeSlotIds } from "./one-trip-fixture.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

/** The lane's local COPY of the operator's scrubbed serving deck — the same
 *  file the cold-latency rig measured. The backup at
 *  C:/backups/decko-db-2026-10-03 is never opened by this file. */
const LOCAL_COPY_PATH = fileURLToPath(
  new URL(
    "../../../benchmarks/cold-latency-rig/cold-latency-local-copy.sqlite3",
    import.meta.url,
  ),
);

const OUT_DIR = fileURLToPath(
  new URL("../../../benchmarks/aikido-divergence/", import.meta.url),
);

const PAGES = ["Aikido", "Aikido Oak Cliff", "Home"] as const;

const copyAvailable = existsSync(LOCAL_COPY_PATH);

/** Filesystem-safe slug so the written artifacts answer "what is this". */
function slug(page: string): string {
  return page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface ArmReport {
  page: string;
  posture: "off" | "on";
  /** JS string length, the rig's `html.length` unit — UTF-16 code units,
   *  NOT raw bytes. Both numbers are reported; they are not the same. */
  stringLength: number;
  byteLength: number;
  trips: number;
  statementCount: number;
  /** Every cards-shaped row id any statement returned, sorted. */
  readCardIds: number[];
  html: string;
  statementLog: { sql: string; params: unknown[]; rowCount: number; cardIds: number[] }[];
}

const arms: ArmReport[] = [];
let sideDir = "";

async function renderArm(page: string, posture: "off" | "on", storePath: string): Promise<ArmReport> {
  if (posture === "on") {
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = storePath;
  } else {
    delete process.env.DECKO_ONE_TRIP;
    delete process.env.DECKO_ONE_TRIP_STORE;
  }
  const capture = new TripCapturingDriver(new LocalSqliteDriver({ path: LOCAL_COPY_PATH, readonly: true }));
  const { render } = await bootEngine(capture);
  const html = await render.render(page, "open", {});
  const ids = new Set<number>();
  for (const stmt of capture.statements) for (const id of stmt.cardIds) ids.add(id);
  return {
    page,
    posture,
    stringLength: html.length,
    byteLength: Buffer.byteLength(html, "utf8"),
    trips: capture.trips,
    statementCount: capture.statements.length,
    readCardIds: [...ids].sort((a, b) => a - b),
    html,
    statementLog: capture.statements.map((s) => ({
      sql: s.sql.replace(/\s+/g, " ").slice(0, 300),
      params: s.params,
      rowCount: s.rowCount,
      cardIds: s.cardIds,
    })),
  };
}

/** First differing code unit, or -1. */
function firstDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

function context(s: string, at: number, radius: number): string {
  return s.slice(Math.max(0, at - radius), Math.min(s.length, at + radius));
}

const findings: Record<string, unknown> = {};

describe.skipIf(!copyAvailable)("Aikido OFF/ON byte divergence: attribution", () => {
  beforeAll(async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    sideDir = scratchDir("aikido-divergence-");
    const storePath = join(sideDir, "one-trip-closure-side.sqlite3");
    const corpus = new LocalSqliteDriver({ path: LOCAL_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: storePath });
    await buildOneTripClosure({ corpus, side, pageNames: [...PAGES] });
  }, 900_000);

  afterAll(() => {
    delete process.env.DECKO_ONE_TRIP;
    delete process.env.DECKO_ONE_TRIP_STORE;
    try { rmSync(sideDir, { recursive: true, force: true }); } catch { /* OS temp cleans up */ }
    writeFileSync(join(OUT_DIR, "aikido-off-on-render-capture.json"), JSON.stringify(findings, null, 2));
  });

  for (const page of PAGES) {
    it(`renders ${page} in both postures and captures both byte streams`, async () => {
      const storePath = join(sideDir, "one-trip-closure-side.sqlite3");
      const off = await renderArm(page, "off", storePath);
      const on = await renderArm(page, "on", storePath);
      arms.push(off, on);

      const offNorm = normalizeSlotIds(off.html);
      const onNorm = normalizeSlotIds(on.html);
      const at = firstDiff(offNorm, onNorm);
      const identical = at === -1;

      const fileBase = `${slug(page)}-off-on`;
      writeFileSync(join(OUT_DIR, `${fileBase}.off.html`), off.html, "utf8");
      writeFileSync(join(OUT_DIR, `${fileBase}.on.html`), on.html, "utf8");
      // The full statement log, per posture: the round-trip ledger in
      // reading order, so a missing row can be traced to the statement
      // that should have returned it.
      writeFileSync(
        join(OUT_DIR, `${fileBase}.statements.json`),
        JSON.stringify({ off: off.statementLog, on: on.statementLog }, null, 1),
      );

      const offIds = new Set(off.readCardIds);
      const onIds = new Set(on.readCardIds);
      const onlyOn = [...onIds].filter((id) => !offIds.has(id));
      const onlyOff = [...offIds].filter((id) => !onIds.has(id));

      findings[page] = {
        normalizedIdentical: identical,
        offStringLength: off.stringLength,
        onStringLength: on.stringLength,
        offByteLength: off.byteLength,
        onByteLength: on.byteLength,
        firstDifferingCodeUnit: at,
        offContext: identical ? null : context(offNorm, at, 400),
        onContext: identical ? null : context(onNorm, at, 400),
        offTrips: off.trips,
        onTrips: on.trips,
        readCardIdCount: { off: offIds.size, on: onIds.size },
        readCardIdsOnlyInOn: onlyOn,
        readCardIdsOnlyInOff: onlyOff,
        artifacts: [`${fileBase}.off.html`, `${fileBase}.on.html`],
      };

      // The measurement must have happened; identity is the finding, not an
      // assertion of correctness — this lane attributes, it does not gate.
      expect(off.html.length).toBeGreaterThan(0);
      expect(on.html.length).toBeGreaterThan(0);
    }, 600_000);
  }

  it("captured both arms for every page (capture completeness)", () => {
    expect(arms.length).toBe(PAGES.length * 2);
  });
});
