// raw-corpus-cd-smalls-head-asset-probe.test.ts -- the cd-smalls suite's
// probe + RED pin for the head-asset divergence class (11 pages, a work item
// content-div subclass "head-asset-divergence", receipt
// REPO_DIR an internal work log):
//
//   The oracle head carries `<link rel="alternate" type="application/x-wiki"
//   title="Edit this page!" href="/<name url_key>/edit" />` on 11 captured
//   pages (*signin, *recent settings, 9 +discussion pages) where the engine's
//   head renders the pinned blank. card-mod-format set/all/html/head.rb:46-51
//   view :universal_edit_button (unknown: :blank, denial: :blank,
//   perms: :update) emits that link exactly when ok?(:update) passes for the
//   page card; the engine's page.ts#universalEditButtonTag consults
//   RenderEngine#updateVerdictForCard and emits the link when the verdict is
//   not false. So the 11-page divergence = the update verdict says DENY where
//   Ruby says ALLOW. The probe dumps the candidate-rule walk for the
//   exemplars; the pin asserts the verdict flip.
//
// RUN (explicitly; needs the machine-local raw corpus -- see RAW_CORPUS_DB --
// and several minutes of full-deck seeding):
//   CD_SMALLS_HEAD_PROBE=1 NODE_OPTIONS=--max-old-space-size=4096 \
//   npx vitest run tests/card/render/raw-corpus-cd-smalls-head-asset-probe.test.ts \
//     --maxWorkers=2 --no-file-parallelism
//
// Outside a census machine (no corpus, or the env gate unset) the spec
// skips, so ordinary suite runs neither slow down nor fail on absent data.

import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { ruleNamesForCard } from "../../../src/card/set-patterns/rule-names.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  ANONYMOUS_VIEWER,
  readPermissionStatements,
  readPermissionStateFromViewerResults,
} from "../../../src/card/permissions/index.js";
import { resolveRuleIdsByKeys } from "../../../src/card/permissions/read-rules.js";
import { skipLoud } from "../../support/describe-with-corpus.js";
import {
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
} from "../../../src/card/permissions/view-task-rules.js";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);

const PROBE_CARDS = [
  "*signin",
  "*recent settings",
  "Kayla Feder 20230902+discussion",
  "Very Rosie July 4 in 2013+Gallery10vert+image01+discussion",
  "A Taste of Your Own Medicine The Problematic Nature of Revenge+discussion",
  "Home",
] as const;

describe("raw-corpus cd-smalls head-asset probe (universal_edit_button verdict)", () => {
  it(
    "dumps the update-verdict walk and pins the *signin verdict",
    { timeout: 1_800_000 },
    async (ctx) => {
      if (process.env.CD_SMALLS_HEAD_PROBE !== "1") {
        skipLoud(ctx, "tests/card/render/raw-corpus-cd-smalls-head-asset-probe.test.ts", "not (process.env.CD_SMALLS_HEAD_PROBE !== \"1\")");
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      const { engine, fetcher } = storage;
      // Render the real page first: the engine's readPermission state (the
      // viewer facts updateVerdictForCard reuses) initializes during render.
      const pageHtml = await engine.renderPage("*signin");
      const readResults = await fetcher.driver.batch(readPermissionStatements(ANONYMOUS_VIEWER));
      const readState = readPermissionStateFromViewerResults(readResults, ANONYMOUS_VIEWER);
      const results = await fetcher.driver.batch(viewTaskPermissionStatements());
      const state = viewTaskStateFromResults(results, readState);

      console.log("viewer parties:", state.viewerParties, "alwaysOk:", state.alwaysOk);

      const hasLink = pageHtml.includes(
        '<link rel="alternate" type="application/x-wiki" title="Edit this page!" href="/*signin/edit" />',
      );
      console.log("[probe] *signin page head carries the edit link:", hasLink);

      for (const name of PROBE_CARDS) {
        const card = engine.fetchRenderCard(name);
        if (card === undefined || card.id === undefined) {
          console.log(`[probe] ${name}: CARD NOT FETCHABLE`);
          continue;
        }
        const verdict = await engine.updateVerdictForCard(card);
        const candidates = ruleNamesForCard(
          { name: card.name.s, id: card.id, typeId: card.typeId, typeName: card.typeName },
          "*update",
        );
        const resolved = await resolveRuleIdsByKeys(
          fetcher.driver,
          candidates.map((n) => DeckoName.parse(n).key),
        );
        const lines: string[] = [];
        for (const c of candidates) {
          const key = DeckoName.parse(c).key;
          const ruleId = resolved.get(key);
          const parties = ruleId !== undefined ? state.ruleParties.update.get(ruleId) : undefined;
          lines.push(`    ${key} -> rule ${ruleId ?? "UNRESOLVED"} parties=${parties ? [...parties].join(",") : "none"}`);
        }
        console.log(`[probe] ${name} (id=${card.id}) updateVerdict=${verdict}\n${lines.join("\n")}`);
      }

      // THE PIN: Ruby renders the edit link on *signin (the captured oracle
      // head carries it), so the engine's page must carry the same link.
      // RED at this tip while the verdict diverges.
      expect(hasLink).toBe(true);

      storage.close();
    },
  );
});
