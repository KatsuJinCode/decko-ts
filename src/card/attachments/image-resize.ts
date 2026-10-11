// The image version processor: the port of ImageCardUploader's
// mini_magick versions (card-mod-carrierwave-0.20.0
// lib/carrier_wave/image_card_uploader.rb:16-27):
//
//   version :icon,   from_version: :small  { resize_and_pad  [16, 16]   }
//   version :small,  from_version: :medium { resize_to_fit   [75, 75]   }
//   version :medium                        { resize_to_limit [200, 200] }
//   version :large                         { resize_to_limit [500, 500] }
//
// Geometry follows ImageMagick's (carrierwave 3.1 MiniMagick processors):
// resize_to_limit shrinks to fit and never enlarges ("WxH>"); resize_to_fit
// scales to fit, enlarging when smaller ("WxH"); resize_and_pad fits, then
// extends to exactly WxH centred on a transparent background. A scaled
// side is floor(scale * side + 0.5), ImageMagick's geometry rounding.
//
// The decoder/resizer/encoder is photon (Rust compiled to WebAssembly,
// @cf-wasm/photon), which runs on edge runtimes and in Node; the bare
// import resolves the runtime's own entry through the package's
// conditional exports. Filters: Lanczos3 when shrinking and Catmull-Rom
// when enlarging (ImageMagick's defaults are Lanczos and Mitchell). The
// output is not byte-identical to ImageMagick's (different encoder and
// filter implementations); dimensions and format are exact, and pixels are
// compared perceptually (tools/parity-side-effects/compare.mjs).

import type { ImageVersionName } from "./image-renditions.js";

type Photon = typeof import("@cf-wasm/photon");
type PhotonImage = InstanceType<Photon["PhotonImage"]>;

let photonModule: Promise<Photon> | undefined;
function loadPhoton(): Promise<Photon> {
  photonModule ??= import("@cf-wasm/photon");
  return photonModule;
}

/** Extensions photon can decode and re-encode in the same format. Other
 *  formats (gif, bmp, tiff, ico) keep the original's bytes for every
 *  version, the behaviour before this processor existed. */
const ENCODABLE = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function canResize(ext: string): boolean {
  return ENCODABLE.has(ext);
}

/** ImageMagick's scaled side: floor(scale * side + 0.5), at least 1. */
function scaled(side: number, scale: number): number {
  return Math.max(1, Math.floor(side * scale + 0.5));
}

function fitDimensions(w: number, h: number, maxW: number, maxH: number): [number, number] {
  const scale = Math.min(maxW / w, maxH / h);
  return [scaled(w, scale), scaled(h, scale)];
}

function resizeTo(p: Photon, img: PhotonImage, w: number, h: number): PhotonImage {
  const enlarging = w > img.get_width() || h > img.get_height();
  return p.resize(img, w, h, enlarging ? p.SamplingFilter.CatmullRom : p.SamplingFilter.Lanczos3);
}

/** resize_to_limit: shrink to fit, never enlarge (a same-size result is
 *  still re-encoded, as ImageMagick re-writes the file). */
function resizeToLimit(p: Photon, img: PhotonImage, maxW: number, maxH: number): PhotonImage {
  const w = img.get_width();
  const h = img.get_height();
  if (w <= maxW && h <= maxH) return resizeTo(p, img, w, h);
  const [nw, nh] = fitDimensions(w, h, maxW, maxH);
  return resizeTo(p, img, nw, nh);
}

/** resize_to_fit: scale to fit, enlarging a smaller image. */
function resizeToFit(p: Photon, img: PhotonImage, maxW: number, maxH: number): PhotonImage {
  const [nw, nh] = fitDimensions(img.get_width(), img.get_height(), maxW, maxH);
  return resizeTo(p, img, nw, nh);
}

/** resize_and_pad: fit, then extend to exactly WxH, centred (gravity
 *  Center: offset = floor((W - w) / 2)) on a transparent background. */
function resizeAndPad(p: Photon, img: PhotonImage, w: number, h: number): PhotonImage {
  const fitted = resizeToFit(p, img, w, h);
  const clear = () => new p.Rgba(0, 0, 0, 0);
  let out = fitted;
  const padX = w - fitted.get_width();
  const padY = h - fitted.get_height();
  const steps: [(i: PhotonImage, n: number, c: InstanceType<Photon["Rgba"]>) => PhotonImage, number][] = [
    [p.padding_left, Math.floor(padX / 2)],
    [p.padding_right, padX - Math.floor(padX / 2)],
    [p.padding_top, Math.floor(padY / 2)],
    [p.padding_bottom, padY - Math.floor(padY / 2)],
  ];
  for (const [pad, n] of steps) {
    if (n <= 0) continue;
    const next = pad(out, n, clear());
    if (out !== fitted) out.free();
    out = next;
  }
  if (out !== fitted) fitted.free();
  return out;
}

function encode(img: PhotonImage, ext: string): Uint8Array {
  if (ext === ".jpg" || ext === ".jpeg") return img.get_bytes_jpeg(92);
  if (ext === ".webp") return img.get_bytes_webp();
  return img.get_bytes();
}

/** Whether the bytes decode as an image (a trap on undecodable input is
 *  caught; the module stays usable afterwards). */
export async function imageDecodes(bytes: Uint8Array): Promise<boolean> {
  const p = await loadPhoton();
  try {
    p.PhotonImage.new_from_byteslice(bytes).free();
    return true;
  } catch {
    return false;
  }
}

/** The four version files of one image upload, or undefined when the
 *  format cannot be processed (the caller then stores byte copies). */
export async function imageVersionBytes(
  original: Uint8Array,
  ext: string,
): Promise<Record<ImageVersionName, Uint8Array> | undefined> {
  if (!canResize(ext)) return undefined;
  const p = await loadPhoton();
  let source: PhotonImage;
  try {
    source = p.PhotonImage.new_from_byteslice(original);
  } catch {
    // Undecodable bytes (a truncated or mislabelled upload): the decoder
    // traps. The caller stores byte copies, as for unsupported formats.
    return undefined;
  }
  const made: PhotonImage[] = [];
  try {
    const medium = resizeToLimit(p, source, 200, 200);
    made.push(medium);
    const large = resizeToLimit(p, source, 500, 500);
    made.push(large);
    const small = resizeToFit(p, medium, 75, 75);
    made.push(small);
    const icon = resizeAndPad(p, small, 16, 16);
    made.push(icon);
    return {
      icon: encode(icon, ext),
      small: encode(small, ext),
      medium: encode(medium, ext),
      large: encode(large, ext),
    };
  } finally {
    for (const img of made) img.free();
    source.free();
  }
}
