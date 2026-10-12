// Rails' number_to_human_size — the one implementation every attachment
// size render in the mod set shares (actionview's number_helper.rb, the
// helper ActiveSupport::NumberHelper#number_to_human_size; decko's
// attachment views call it for file/image sizes).
//
// Sizes below 1024 render as a whole byte count followed by "Bytes", except
// that a lone byte reads "1 Byte". Past that, each 1024 step promotes the
// unit through KB, MB, GB and TB, and the mantissa carries three significant
// digits with any trailing fractional zeros dropped:
// {"0":"0 Bytes","1":"1 Byte","512":"512 Bytes","1023":"1023 Bytes",
//  "1024":"1 KB","1025":"1 KB","1234":"1.21 KB","1536":"1.5 KB",
//  "9999":"9.76 KB","10000":"9.77 KB","1048576":"1 MB","1572864":"1.5 MB",
//  "1073741824":"1 GB"}

/** number_to_human_size(size, significant: 3) with strip_insignificant_zeros
 *  — the exact ladder above. */
export function numberToHumanSize(size: number): string {
  if (size < 1024) {
    if (size === 1) return "1 Byte";
    return `${size} Bytes`;
  }
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = size;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value = value / 1024;
    unitIndex += 1;
  }
  // 3 significant digits, trailing zeros stripped (Rails' number_to_human
  // with significant: 3 + strip_insignificant_zeros).
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  let text = value.toFixed(digits);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return `${text} ${units[unitIndex]}`;
}
