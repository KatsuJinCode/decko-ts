// register-ts-resolver.mjs — installs the `.js` -> `.ts` resolve hook for a
// `node --experimental-strip-types --import ./register-ts-resolver.mjs` run.
// See ts-source-resolver.mjs for why the hook exists.
import { register } from "node:module";

register("./ts-source-resolver.mjs", import.meta.url);