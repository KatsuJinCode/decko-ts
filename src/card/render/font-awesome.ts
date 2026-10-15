export const FONT_AWESOME_ASSET_PREFIX = "/mod/bootstrap/fontawesome-6.7.2/";
export const STOCK_FONT_AWESOME_TAG = '<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>';

/** Explicit deployment asset configuration; stock reference bytes stay default. */
export function fontAwesomeHeadTag(mode?: "local"): string {
  return mode === "local"
    ? `<link href="${FONT_AWESOME_ASSET_PREFIX}css/all.min.css" rel="stylesheet" type="text/css" />`
    : STOCK_FONT_AWESOME_TAG;
}

export function configureFontAwesomeMode(value: string | undefined): "local" | undefined {
  if (value === undefined || value === "stock") return undefined;
  if (value === "local") return "local";
  throw new Error("DECKO_FONT_AWESOME must be local or stock");
}
