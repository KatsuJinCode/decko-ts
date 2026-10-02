// verify-staged-corpus-provenance.test.ts -- the staging-time corpus
// provenance guard (tools/verify-staged-corpus-provenance.mjs), over SYNTHETIC
// directory pairs in os.tmpdir(). No real corpus, no capture, no grade, no
// Ruby. Closes the gap the 2026-09-30T03:04Z corpus swap used: the staged
// corpus must hash to the sha256 its photograph's manifest binds, and a
// mismatch must REFUSE naming the expected sha -- at staging time, not hours
// later at grade start.
//
// Case map (each names the incident behavior it pins):
//   verified        a staged corpus matching its manifest binding passes
//   swap refusal    differing bytes refuse + name the FULL expected sha256 and
//                   the live sha256 (it must refuse AND name the expected
//                   sha); same-size variants are exactly the incident class
//   void photograph manifest before != after refuses
//   unbound         corpus with no manifest is a note, NOT a refusal (nothing
//                   recorded can be contradicted in a never-photographed tree)
//   absent          neither corpus nor manifest is a note
//   vanished        manifest present + corpus missing refuses
//   aggregation     verifyStagedCorpora over mixed repos: any refusal flips
//                   ok and yields family exit 4, naming the guilty repo
//   wrong schema    an unknown manifest generation refuses (no silent pass)

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  stagedCorpusManifestPath,
  stagedCorpusPath,
  verifyStagedCorpus,
  verifyStagedCorpora,
} from "../../tools/verify-staged-corpus-provenance.mjs";

// A fake corpus: a real SQLite header (magic + change counter at offset 24,
// exactly what sqliteHeaderChangeCounter reads) followed by filler bytes. Two
// fillers of the SAME total length model the incident's same-size swap.
function writeFakeCorpus(file: string, changeCounter: number, filler: number): string {
  const header = Buffer.alloc(100);
  header.write("SQLite format 3\0", 0, "latin1");
  header.writeUInt32BE(changeCounter, 24);
  const body = Buffer.alloc(4096, filler);
  const bytes = Buffer.concat([header, body]);
  writeFileSync(file, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

// A photograph manifest in the capture-and-grade.mjs buildCaptureManifest shape
// (the fields verifyManifestForGrading gates on).
function writeManifest(dir: string, opts: {
  boundSha: string;
  beforeSha?: string;
  schema?: string;
}): string {
  const manifest = {
    schema: opts.schema ?? "capture-manifest/1",
    corpusSha256: { before: opts.beforeSha ?? opts.boundSha, after: opts.boundSha },
    sqliteHeaderChangeCounter: { before: 4, after: 4 },
  };
  writeFileSync(join(dir, "capture-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return join(dir, "capture-manifest.json");
}

// A synthetic worktree pair: <root>/deck-recapture/corpus-v2.sqlite3 +
// <root>/expected-v2/capture-manifest.json -- the exact relative layout
// stagedCorpusPath/stagedCorpusManifestPath derive under a --repo dir.
function makeSyntheticRepo(label: string): { repo: string; cleanup: () => void } {
  const repo = mkdtempSync(join(tmpdir(), `swapguard-${label}-`));
  mkdirSync(join(repo, "tmp", "raw-ground-truth", "deck-recapture"), { recursive: true });
  mkdirSync(join(repo, "tmp", "raw-ground-truth", "expected-v2"), { recursive: true });
  return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

describe("verifyStagedCorpus (staging-time corpus provenance guard)", () => {
  it("path helpers derive the capture-and-grade.mjs staging layout", () => {
    expect(stagedCorpusPath("R").replace(/\\/g, "/")).toBe(
      "R/tmp/raw-ground-truth/deck-recapture/corpus-v2.sqlite3",
    );
    expect(stagedCorpusManifestPath("R").replace(/\\/g, "/")).toBe(
      "R/tmp/raw-ground-truth/expected-v2/capture-manifest.json",
    );
  });

  it("verified: a staged corpus matching its manifest binding passes, naming the sha", () => {
    const { repo, cleanup } = makeSyntheticRepo("ok");
    try {
      const sha = writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
      writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), { boundSha: sha });
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(true);
      expect(r.refusals).toEqual([]);
      expect(r.expectedSha256).toBe(sha);
      expect(r.actualSha256).toBe(sha);
    } finally {
      cleanup();
    }
  });

  it("swap refusal: differing bytes refuse and name the FULL expected sha + live sha", () => {
    const { repo, cleanup } = makeSyntheticRepo("swap");
    try {
      const photographedSha = writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
      // the swap: same size, different bytes, higher change counter -- the
      // incident's exact shape (207,228,928 == 207,228,928, counter 4 -> 5)
      writeFakeCorpus(stagedCorpusPath(repo), 5, 0xbb);
      writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), {
        boundSha: photographedSha,
      });
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(false);
      expect(r.expectedSha256).toBe(photographedSha);
      expect(r.expectedSha256).not.toBe(r.actualSha256);
      // must refuse AND NAME the expected sha -- full 64 hex, greppable
      expect(r.actualSha256).toMatch(/^[0-9a-f]{64}$/);
      const joined = r.refusals.join("\n");
      expect(joined).toContain(photographedSha);
      expect(joined).toContain(r.actualSha256 ?? "");
      expect(joined).toMatch(/MISMATCH/);
    } finally {
      cleanup();
    }
  });

  it("void photograph: manifest with before != after refuses", () => {
    const { repo, cleanup } = makeSyntheticRepo("void");
    try {
      const sha = writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
      writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), {
        boundSha: sha,
        beforeSha: "0".repeat(64),
      });
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(false);
      expect(r.refusals.join("\n")).toMatch(/CHANGED DURING capture/);
    } finally {
      cleanup();
    }
  });

  it("unbound: corpus with no manifest is a note, not a refusal", () => {
    const { repo, cleanup } = makeSyntheticRepo("unbound");
    try {
      writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(true);
      expect(r.refusals).toEqual([]);
      expect(r.notes.join("\n")).toMatch(/unbound/);
    } finally {
      cleanup();
    }
  });

  it("absent: neither corpus nor manifest is a note, not a refusal", () => {
    const { repo, cleanup } = makeSyntheticRepo("absent");
    try {
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(true);
      expect(r.notes.join("\n")).toMatch(/absent/);
    } finally {
      cleanup();
    }
  });

  it("vanished: manifest present + corpus missing refuses", () => {
    const { repo, cleanup } = makeSyntheticRepo("gone");
    try {
      writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), {
        boundSha: "1".repeat(64),
      });
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(false);
      expect(r.refusals.join("\n")).toMatch(/MISSING/);
    } finally {
      cleanup();
    }
  });

  it("wrong schema: an unknown manifest generation refuses, never silently passes", () => {
    const { repo, cleanup } = makeSyntheticRepo("schema");
    try {
      const sha = writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
      writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), {
        boundSha: sha,
        schema: "capture-manifest/999",
      });
      const r = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
      });
      expect(r.ok).toBe(false);
      expect(r.refusals.join("\n")).toMatch(/schema/);
    } finally {
      cleanup();
    }
  });

  it("a precomputed live hash is honored without re-hashing", () => {
    const { repo, cleanup } = makeSyntheticRepo("prehash");
    try {
      const sha = writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
      writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), { boundSha: sha });
      // the honest hash passes (capture-and-grade's preflight passes corpusBefore)
      const honest = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
        liveCorpusSha256: sha,
      });
      expect(honest.ok).toBe(true);
      expect(honest.actualSha256).toBe(sha);
      // a claimed-different hash refuses: the gate trusts the caller's hash
      const claimed = verifyStagedCorpus({
        corpusFile: stagedCorpusPath(repo),
        manifestPath: stagedCorpusManifestPath(repo),
        liveCorpusSha256: "2".repeat(64),
      });
      expect(claimed.ok).toBe(false);
      expect(claimed.refusals.join("\n")).toContain(sha);
    } finally {
      cleanup();
    }
  });
});

describe("verifyStagedCorpora (multi-repo aggregation)", () => {
  it("one verified + one swapped repo: overall refusal, family exit 4, guilty repo named", () => {
    const okRepo = makeSyntheticRepo("agg-ok");
    const badRepo = makeSyntheticRepo("agg-bad");
    try {
      const okSha = writeFakeCorpus(stagedCorpusPath(okRepo.repo), 4, 0xaa);
      writeManifest(
        join(okRepo.repo, "tmp", "raw-ground-truth", "expected-v2"),
        { boundSha: okSha },
      );
      const badBound = writeFakeCorpus(stagedCorpusPath(badRepo.repo), 4, 0xaa);
      writeFakeCorpus(stagedCorpusPath(badRepo.repo), 5, 0xbb); // the swap
      writeManifest(
        join(badRepo.repo, "tmp", "raw-ground-truth", "expected-v2"),
        { boundSha: badBound },
      );
      const report = verifyStagedCorpora({ repos: [okRepo.repo, badRepo.repo] });
      expect(report.ok).toBe(false);
      expect(report.exitCode).toBe(4);
      const okResult = report.results.find((r) => r.repo === okRepo.repo);
      const badResult = report.results.find((r) => r.repo === badRepo.repo);
      expect(okResult?.ok).toBe(true);
      expect(badResult?.ok).toBe(false);
      expect(badResult?.refusals.join("\n")).toContain(badBound);
    } finally {
      okRepo.cleanup();
      badRepo.cleanup();
    }
  });

  it("all clean: exit 0", () => {
    const a = makeSyntheticRepo("clean-a");
    const b = makeSyntheticRepo("clean-b");
    try {
      for (const { repo } of [a, b]) {
        const sha = writeFakeCorpus(stagedCorpusPath(repo), 4, 0xaa);
        writeManifest(join(repo, "tmp", "raw-ground-truth", "expected-v2"), { boundSha: sha });
      }
      const report = verifyStagedCorpora({ repos: [a.repo, b.repo] });
      expect(report.ok).toBe(true);
      expect(report.exitCode).toBe(0);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
