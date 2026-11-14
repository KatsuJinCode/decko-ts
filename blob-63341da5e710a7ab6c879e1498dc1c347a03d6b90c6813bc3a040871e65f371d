// derive-key-entry.mjs — esbuild entry for load-derive-key.mjs.
//
// The port's name algebra (src/card/name.ts) under the deployed deck's
// inflection table, exactly as engine-bridge.mjs's deriveKeyWithEngine
// applies it. Kept separate from engine-bridge.mjs so the bundle carries
// only the name code, not the fetch and render engines.

import { DeckoName } from "../../src/card/name.ts";
import { applyDeckInflections, singularize } from "../../src/card/name/inflect.ts";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../src/card/name/oracle-deck-inflections.ts";

export function deriveKey(name) {
  // Under the deck table "anonymous" is uncountable; under the gem
  // defaults it singularizes to "anonymou".
  if (singularize("anonymous") !== "anonymous") applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  return DeckoName.parse(name).key;
}
