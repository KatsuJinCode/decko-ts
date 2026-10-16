// Bunny's documented script cap is 10 MB (bunny.net/docs/scripting/limits), but
// the runtime's actual boot ceiling is lower: on staging script 96895 on
// 2026-10-16 a 9,250,000-byte engine served every probe (3/3) while a
// 9,500,000-byte one answered every request with an empty HTTP 400 and no
// Server-Timing, and the 9,998,789-byte release candidate did the same (12/12).
// The upload and publish calls succeed above that point and the code is stored
// intact; the script only fails to start, so the guard below has to sit below
// the observed ceiling rather than at the documented one. This is script UTF-8
// bytes, not JS characters or the JSON upload envelope.
export const BUNNY_SCRIPT_LIMIT_BYTES = 9_000_000;
export function assertBunnyScriptBudget(code) {
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > BUNNY_SCRIPT_LIMIT_BYTES) {
    throw new Error(`Bunny script is ${bytes} UTF-8 bytes; exceeds the boot-safe ${BUNNY_SCRIPT_LIMIT_BYTES}-byte budget (scripts above ~9.25 MB fail to start on the edge runtime)`);
  }
  return bytes;
}