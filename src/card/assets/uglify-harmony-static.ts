// The exact vendored parser with trusted initialization precompiled at build
// time. This module and its dependencies have no Node or dynamic-code imports.
import { staticUglifier } from "./uglify-harmony-static.generated.js";
import { uglifierOptionsFor } from "./uglify-harmony-options.js";
import { formatUglifierSyntaxError, type UglifierResult } from "./uglify-harmony-diagnostics.js";

export function staticUglifyHarmonySyntaxError(source: string): string | undefined {
  return formatUglifierSyntaxError(staticUglifier(uglifierOptionsFor(source)) as UglifierResult, source);
}

/** Same raw compilation/defaults as the Node VM provider. Host compression
 * policy remains separate from save-time syntax validation. */
export function staticUglifyHarmonyCompile(source: string): string {
  const result = staticUglifier(uglifierOptionsFor(source)) as UglifierResult;
  if (result.error !== undefined) {
    const message = typeof result.error === "string" ? result.error : result.error.message ?? JSON.stringify(result.error);
    throw new Error(`uglify-harmony compile failed: ${message}`);
  }
  if (typeof result.code !== "string") throw new Error("uglify-harmony compile returned no code");
  return result.code;
}
