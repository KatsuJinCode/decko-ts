// The compiled *all+*script bundle — byte pins against the LIVE production
// oracle (the tinymce-assets lane).
//
// The chain, every link oracle-pinned:
//
//   fixtures/captured/all-script-assembled-input.js
//     the deck's assembled *all+*script input — the cwinput lane's LIVE pin
//     (1,050,887 bytes, sha256 36a3d55df942e04f...), the same bytes the
//     production bundle was compiled from (proven by the leaf parity below).
//   splitAssembledScriptLeaves
//     the comment_with_source leaf grammar (00_script.rb:20-22) — 49 leaves.
//   compileScriptBundle (uglify-harmony-compile-engine.ts)
//     per leaf `"// <basename>\n" + Uglifier.new(harmony:true).compile(core)`,
//     leaves joined "\n" (00_script.rb:25-27 + asset_group.rb
//     render_items_and_compress) — the vendored uglifier-4.2.1 harmony
//     snapshot in a Node vm, uglifier.rb's exact option shape.
//   fixtures/captured/script-compile-oracle-leaves.json
//     the live production bundle's per-leaf byte metadata (the bucket copy
//     of /files/~50617/1768074298.js): 48/49 shared leaves byte-exact, 1
//     one-byte divergence, 4 leaves of a live-only custom mod.
//
// The tinymce entrypoint assertions are the lane's reason to exist: the
// browser rich-text editor initializes only when the served bundle carries
// the tinymce global and the decko editor hook that binds
// `.tinymce-textarea` edit forms to it.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileScriptBundle,
  splitAssembledScriptLeaves,
} from "../../../src/card/assets/compiled-script-bundle.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ASSEMBLED_PATH = path.join(
  REPO_ROOT,
  "fixtures",
  "captured",
  "all-script-assembled-input.js",
);
const ORACLE_LEAVES_PATH = path.join(
  REPO_ROOT,
  "fixtures",
  "captured",
  "script-compile-oracle-leaves.json",
);

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

interface OracleLeaf {
  name: string;
  liveBytes: number;
  liveSha256: string;
  parity: string;
}
interface OracleFixture {
  _provenance: {
    parity_summary: Record<string, number>;
    named_divergences: string[];
  };
  leaves: OracleLeaf[];
}

const assembled = readFileSync(ASSEMBLED_PATH, "utf8");
const oracle: OracleFixture = JSON.parse(readFileSync(ORACLE_LEAVES_PATH, "utf8")) as OracleFixture;

describe("compiled *all+*script bundle (tinymce-assets lane oracle pins)", () => {
  it("the assembled input is the cwinput lane's live pin, byte for byte", () => {
    // 7 multi-byte UTF-8 characters: 1,050,887 bytes, 1,050,880 chars —
    // the sha is over the bytes (the utf8 round-trip is lossless)
    expect(Buffer.byteLength(assembled, "utf8")).toBe(1_050_887);
    expect(sha256(assembled)).toBe(
      "36a3d55df942e04fa205231a0c750d9f453518edda574f5bfb622dcb5dd492c7",
    );
  });

  it("splits into the deck's 49 script leaves (the 15 manifest mods' files)", () => {
    const leaves = splitAssembledScriptLeaves(assembled);
    expect(leaves.length).toBe(49);
    expect(leaves[0]?.name).toBe("jquery-ui.min.js");
    expect(leaves.at(-1)?.name).toBe("tinymce_config.js.coffee");
    // every leaf carries the shared leaf-name set the oracle metadata lists
    // for the 15-manifest-mod prefix of the live bundle
    const oracleShared = oracle.leaves.slice(0, 49).map((l) => l.name);
    expect(leaves.map((l) => l.name)).toEqual(oracleShared);
  });

  it(
    "compiles the bundle byte-identically to the live production oracle (48 exact + 1 one-byte + 4 live-only)",
    { timeout: 900_000 },
    () => {
      const bundle = compileScriptBundle(assembled);
      // the deterministic compile output pin
      expect(bundle.length).toBe(831_646);
      expect(sha256(bundle)).toBe(
        "5f5d50f073695d9b171f5337618dbe98168172155a50ac3f7123225e7db5aacf",
      );

      // leaf-by-leaf against the live production bundle's bytes. Both
      // bundles slice with the same header grammar (header .. next header),
      // so each slice carries its own join "\n" and the comparison is
      // join-consistent; the one named divergence leaf gains one extra
      // trailing newline in the live bytes.
      const leafSlices = (text: string): { name: string; bytes: string }[] => {
        const headers: { name: string; idx: number }[] = [];
        const re = /^\/\/ (.+\.(?:js|coffee))\s*$/gm;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) headers.push({ name: m[1] as string, idx: m.index });
        return headers.map((h, i) => ({
          name: h.name,
          bytes: text.slice(h.idx, i + 1 < headers.length ? headers[i + 1]!.idx : text.length),
        }));
      };
      const compiledSlices = leafSlices(bundle);
      expect(compiledSlices.length).toBe(49);
      const summary = { byte_exact: 0, ours_plus_trailing_newline: 0, live_only: 0 };
      oracle.leaves.forEach((oracleLeaf, i) => {
        const compiledSlice = compiledSlices[i];
        if (oracleLeaf.parity === "live-only-mod-leaf") {
          // a live-only custom production mod's leaf: no local source exists
          // (the named divergence — the port compiles the 15 manifest mods)
          expect(compiledSlice).toBeUndefined();
          summary.live_only += 1;
          return;
        }
        expect(compiledSlice?.name).toBe(oracleLeaf.name);
        if (oracleLeaf.parity === "byte-exact") {
          expect(compiledSlice?.bytes).toHaveLength(oracleLeaf.liveBytes);
          expect(sha256(compiledSlice?.bytes ?? "")).toBe(oracleLeaf.liveSha256);
          summary.byte_exact += 1;
        } else if (oracleLeaf.parity === "byte-exact-plus-bundle-join") {
          // the last shared leaf: our bundle ends there (no join byte), the
          // live slice carries the inter-group join into the live-only group
          expect(sha256((compiledSlice?.bytes ?? "") + "\n")).toBe(oracleLeaf.liveSha256);
          summary.byte_exact += 1;
        } else if (oracleLeaf.parity === "ours-plus-trailing-newline") {
          // the live compile's uglify runtime emitted one trailing newline
          // this snapshot does not (code identical — the named divergence)
          expect(sha256((compiledSlice?.bytes ?? "") + "\n")).toBe(oracleLeaf.liveSha256);
          summary.ours_plus_trailing_newline += 1;
        } else {
          throw new Error(
            `unexpected oracle parity "${oracleLeaf.parity}" for ${oracleLeaf.name}`,
          );
        }
      });
      expect(summary).toEqual({ byte_exact: 48, ours_plus_trailing_newline: 1, live_only: 4 });
      expect(oracle._provenance.parity_summary).toEqual({
        byte_exact: 48,
        ours_plus_trailing_newline: 1,
        live_only_mod_leaves: 4,
      });
    },
  );

  it(
    "the compiled bundle carries the browser editor's initialization entrypoints",
    { timeout: 900_000 },
    () => {
      const bundle = compileScriptBundle(assembled);
      // the tinymce 5.10.7 dist leaf — the `window.tinymce` global
      expect(bundle).toContain("// script_tinymce.js\n");
      expect(bundle).toContain("window.tinymce");
      // the decko editor hook (tinymce_config.js.coffee compiled): binds
      // `.tinymce-textarea` edit forms to tinymce through decko.editors
      expect(bundle).toContain('// tinymce_config.js.coffee\n');
      expect(bundle).toContain('decko.editors.add(".tinymce-textarea"');
      // the editor machinery itself (editor.js.coffee compiled)
      expect(bundle).toContain("decko.initializeEditors");
    },
  );
});
