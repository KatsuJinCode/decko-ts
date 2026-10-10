// inclusion-blast-radius-probe.test.ts — the inclusion-fix lane's before/after
// blast-radius instrument (the engcand 43-page-class precedent, instrument
// copied from the committed allsetfix probe: grade-instrument boot —
// raw-corpus seeding + the runner's cloud-asset-host seam — then per-render
// raw sha + normalizeForReplay sha, JSONL to INCLUSION_BLAST_OUT). Run once
// in a detached scratch worktree at the base commit (BEFORE) and once in the
// lane tree (AFTER); the receipt diffs the two JSONLs on normSha. Env gate
// INCLUSION_BLAST_PROBE=1 keeps it out of every normal suite run.
//
// Record set: the engcand 43-page-class set VERBATIM (it contains the
// seatfix/allset page surfaces this lane must not move) + this lane's own
// graded entry page message-000004 (first in the list), + the allset lane's
// two *all view records as its surface guards. 46 records total.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

import { normalizeForReplay } from "../../../src/testing/diff.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const PAGE_NAMES = [
  "message-000004",
  "mod: account", "mod: ace editor", "mod: api key", "mod: bar and box",
  "mod: bootstrap", "mod: carrierwave", "mod: comment", "mod: content",
  "mod: core", "mod: date", "mod: defaults", "mod: edit", "mod: email",
  "mod: follow", "mod: format", "mod: help", "mod: history", "mod: integrate",
  "mod: layout", "mod: list", "mod: permissions", "mod: recaptcha",
  "mod: rules", "mod: script", "mod: search", "mod: session", "mod: style",
  "mod: tabs",
  "*input type+*right", "Administrator", "Archetypal", "Family", "Christmas",
  "*search", "*input type+*right+*content options", "Morgan",
  "Project+Task+*type plus right", "Message+Conversation+*type plus right",
  "Administrator+Dashboard", "Help Desk", "Pointer", "Shark",
  "mod: tinymce editor",
];

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

let storage: Awaited<ReturnType<typeof createRawStructureSeededStorage>> | undefined;
afterAll(() => {
  storage?.close();
});

describeOrSkipLoud(!(process.env.INCLUSION_BLAST_PROBE === "1" && existsSync(RAW_CORPUS_DB)), "tests/card/render/inclusion-blast-radius-probe.test.ts", "process.env.INCLUSION_BLAST_PROBE === \"1\" && existsSync(RAW_CORPUS_DB)")(
  "inclusion blast-radius probe",
  () => {
    beforeAll(async () => {
      const everyLiveId = (new Database(RAW_CORPUS_DB, { readonly: true })
        .prepare("SELECT id FROM cards WHERE trash = 0")
        .all() as Array<{ id: number }>).map((r) => r.id);
      const { setDeploymentCloudAssetHost } = await import(
        "../../../src/card/render/views.js"
      );
      setDeploymentCloudAssetHost(
        "https://example.com-production-storage.fra1.cdn.digitaloceanspaces.com",
      );
      storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);
    }, 240_000);

    it("renders the 43 page classes + the entry page + the *all views, shas to INCLUSION_BLAST_OUT", async () => {
      const out = process.env.INCLUSION_BLAST_OUT;
      expect(out, "INCLUSION_BLAST_OUT path required").toBeDefined();
      if (existsSync(out!)) writeFileSync(out!, "");
      else appendFileSync(out!, "");
      const lines: string[] = [];
      for (const name of PAGE_NAMES) {
        const html = await storage!.engine.renderPage(name);
        lines.push(
          JSON.stringify({
            kind: "page",
            name,
            len: html.length,
            rawSha: sha256(html),
            normSha: sha256(normalizeForReplay(html)),
          }),
        );
      }
      for (const view of ["content", "open"] as const) {
        const html = await storage!.engine.render("*all", view);
        lines.push(
          JSON.stringify({
            kind: "view",
            name: `*all:${view}`,
            len: html.length,
            rawSha: sha256(html),
            normSha: sha256(normalizeForReplay(html)),
          }),
        );
      }
      appendFileSync(out!, lines.join("\n") + "\n");
      expect(lines).toHaveLength(PAGE_NAMES.length + 2);
    }, 600_000);
  },
);
