// Conservative decimal interpretation of Bunny's documented 10 MB script cap.
// This is script UTF-8 bytes, not JS characters or the JSON upload envelope.
export const BUNNY_SCRIPT_LIMIT_BYTES = 10_000_000;
export function assertBunnyScriptBudget(code) {
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > BUNNY_SCRIPT_LIMIT_BYTES) {
    throw new Error(`Bunny script is ${bytes} UTF-8 bytes; exceeds the conservative ${BUNNY_SCRIPT_LIMIT_BYTES}-byte limit`);
  }
  return bytes;
}
