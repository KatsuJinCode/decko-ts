/** Stock Uglifier(harmony) save validation, independent of compress_assets.
 * Returns the ANSI-to-HTML diagnostic, or undefined for valid source.
 * Node supplies the existing vendored compiler. No compatible edge provider
 * is wired yet: absence remains an explicit validation coverage gap. */
export type JavascriptSyntaxValidator = (source: string) => string | undefined;
