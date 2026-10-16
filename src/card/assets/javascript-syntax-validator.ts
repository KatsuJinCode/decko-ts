/** Stock Uglifier(harmony) save validation, independent of compress_assets.
 * Returns the ANSI-to-HTML diagnostic, or undefined for valid source.
 * Node supplies the existing VM compiler; production edge hosts supply its
 * statically initialized equivalent. Custom callers omitting a provider
 * retain an explicit validation coverage gap. */
export type JavascriptSyntaxValidator = (source: string) => string | undefined;
