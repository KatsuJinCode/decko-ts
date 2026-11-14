// TYPES FOR THE PORT-SIDE REGISTRATION READER.
//
// The reader is plain JavaScript (tools/audit-mod-port-registration-reader.mjs)
// so the census tool and the vitest sheet can both import it. This
// declaration gives the TypeScript side (the pin sheet in
// tests/card/mod-loader/register-rows-oracle-surface.test.ts) the shapes it
// reads.

/**
 * Remove comments from TypeScript source text, keeping string literals
 * intact.
 */
export function stripComments(text: string): string;

/**
 * Read the manifest registrations out of a port mod file's text.
 *
 * @param portText the whole file
 */
export function readPortSetPathRegistrations(portText: string): {
  setPaths: string[];
  bySetPath: Map<string, { views: string[]; events: string[] }>;
};
