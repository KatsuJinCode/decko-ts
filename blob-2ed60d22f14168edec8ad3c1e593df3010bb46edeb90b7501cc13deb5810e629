// image-version-bytes.test.ts -- the image VERSION bytes measurement (image
// version bytes from real resizes).
//
// One real photo upload through both engines' real resizers:
// - Ruby: mini_magick (ImageMagick) resizes, committed under
//   tests/fixtures/persistence-leftover-oracle/image-versions.ruby.json
//   (tools/persistence/image-version-probe.rb made it).
// - The port: the photon resizer (src/card/attachments/image-resize.ts)
//   through the real engine path (imageVersionBytes).
//
// Pinned by this test, with the oracle JSON as the evidence:
// - the stored FILE NAMES are identical (the -original file + icon/small/
//   medium/large, image_card_uploader.rb:16-27, :44-57);
// - the ORIGINAL upload's bytes are identical (sha1);
// - every version's DIMENSIONS are exact;
// - every version's PIXELS match perceptually (PSNR over white >= 35 and
//   alpha agreement >= 0.99 — the same bar the side-effects report holds
//   image variants to, tools/parity-side-effects/compare.mjs);
// - the version BYTES differ (declared deliberate: different encoder —
//   photon's png/jpeg writer is not ImageMagick's; the persistence probe
//   compares image versions by name rather than by bytes for exactly this
//   reason).
//
// Without the oracle fixture the test skips loudly; IMAGE_PARITY=1 turns
// the skip into a failure.

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { imageVersionBytes } from "../../src/card/attachments/image-resize.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PHOTO = path.join(REPO, "tools/parity-side-effects/fixtures/parity-photo.png");
const RUBY_JSON = path.join(
  REPO,
  "tests/fixtures/persistence-leftover-oracle/image-versions.ruby.json",
);

const HAVE = existsSync(RUBY_JSON) && existsSync(PHOTO);
const RUN = HAVE || process.env.IMAGE_PARITY === "1";
if (!RUN) {
  process.stderr.write(
    `[image-versions] SKIPPED: oracle fixture not found (${RUBY_JSON}; run tools/persistence/image-version-probe.rb)\n`,
  );
}

interface RubyFile {
  file: string;
  sha1: string;
  width?: number;
  height?: number;
  b64?: string;
}

describe("image version bytes (real resizes, both engines)", () => {
  it.runIf(RUN)(
    "names and original bytes match Ruby; version dimensions and pixels match; bytes are the encoder's",
    async () => {
      const ruby = JSON.parse(readFileSync(RUBY_JSON, "utf8")) as {
        files: RubyFile[];
      };
      const original = new Uint8Array(readFileSync(PHOTO));
      const versions = await imageVersionBytes(original, ".png");
      expect(versions, "the photo is a resizable format").toBeDefined();
      const vs = versions as Record<string, Uint8Array>;

      const byName = (files: RubyFile[]): Map<string, RubyFile> =>
        new Map(files.map((f) => [f.file, f]));
      const rubyFiles = byName(ruby.files);

      // The stored file NAMES, shape-wise (the leading id is the storing
      // action's, deck-dependent): the -original file + the four versions.
      const rubyShapes = [...rubyFiles.keys()].map((n) => n.replace(/^\d+/, "")).sort();
      expect(rubyShapes).toEqual(["-icon.png", "-large.png", "-medium.png", "-original.png", "-small.png"]);

      // The original upload's bytes are stored as they arrived.
      const rubyOriginal = rubyFiles.get([...rubyFiles.keys()].find((n) => n.endsWith("-original.png"))!);
      expect(rubyOriginal).toBeDefined();
      expect(createHash("sha1").update(original).digest("hex")).toBe(rubyOriginal!.sha1);

      // The versions: dimensions exact, pixels perceptually equal, bytes
      // the port's encoder's (their own sha1s recorded in the report).
      const rubyVersion = (name: string): RubyFile | undefined => {
        const found = [...rubyFiles.keys()].find((n) => n.endsWith(`-${name}.png`));
        return found === undefined ? undefined : rubyFiles.get(found);
      };

      const { PhotonImage } = await import("@cf-wasm/photon");
      const psnrOverWhite = (a: Uint8Array, b: Uint8Array): { psnr: number; alphaAgree: number } => {
        const ia = PhotonImage.new_from_byteslice(a);
        const ib = PhotonImage.new_from_byteslice(b);
        const pa = ia.get_raw_pixels();
        const pb = ib.get_raw_pixels();
        const w = ia.get_width();
        const h = ia.get_height();
        let se = 0;
        let agree = 0;
        const n = w * h;
        for (let i = 0; i < n; i++) {
          const aa = pa[i * 4 + 3] / 255;
          const ba = pb[i * 4 + 3] / 255;
          for (let c = 0; c < 3; c++) {
            const d =
              (pa[i * 4 + c] * aa + 255 * (1 - aa)) - (pb[i * 4 + c] * ba + 255 * (1 - ba));
            se += d * d;
          }
          if (aa > 0.5 === ba > 0.5) agree++;
        }
        ia.free();
        ib.free();
        const mse = se / (n * 3);
        return { psnr: mse === 0 ? Infinity : (10 * Math.log10((255 * 255) / mse)), alphaAgree: agree / n };
      };

      const sha1Of = (bytes: Uint8Array): string => createHash("sha1").update(bytes).digest("hex");
      const measurement: Record<string, { sha1: string; psnr: number | string; alphaAgree: number }> = {};
      for (const name of ["icon", "small", "medium", "large"] as const) {
        const rubyEntry = rubyVersion(name);
        expect(rubyEntry, `ruby stored a 1-${name}.png-shaped file`).toBeDefined();
        const bytes = vs[name];
        // Dimensions exact (MiniMagick#width/height vs the resizer's).
        const img = PhotonImage.new_from_byteslice(bytes);
        expect(img.get_width()).toBe(rubyEntry!.width);
        expect(img.get_height()).toBe(rubyEntry!.height);
        img.free();
        // Bytes differ (different encoder) — the declared seam.
        expect(sha1Of(bytes)).not.toBe(rubyEntry!.sha1);
        // Pixels within the side-effects bar.
        const rubyBytes = new Uint8Array(Buffer.from(rubyEntry!.b64!, "base64"));
        const { psnr, alphaAgree } = psnrOverWhite(bytes, rubyBytes);
        expect(psnr, `1-${name}.png PSNR`).toBeGreaterThanOrEqual(35);
        expect(alphaAgree, `1-${name}.png alpha agreement`).toBeGreaterThanOrEqual(0.99);
        measurement[name] = {
          sha1: sha1Of(bytes),
          psnr: Number.isFinite(psnr) ? Number(psnr.toFixed(2)) : "Infinity",
          alphaAgree: Number(alphaAgree.toFixed(4)),
        };
      }
      process.stderr.write(
        `[image-versions] measurement: ${JSON.stringify(measurement)}\n`,
      );
    },
  );
});
