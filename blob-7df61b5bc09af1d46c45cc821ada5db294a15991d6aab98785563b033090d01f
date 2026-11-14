// semantics-extend-questions.mjs -- append the second-wave questions to the
// shared question file without disturbing the ids already answered.
//
// Added kinds (ids continue after the last existing id):
//   view_defs_full    every view a set's html format defines, with the module
//                     and mod that win the definition
//   event_defs_full   every event a set's card carries, with module and mod
//   id_fetch          fetch-by-id over the rows Ruby could not fetch by id
//   inflection_rows   the rows whose key depends on the deck's inflection table
//   role_permissions  the four ok_to_* verdicts per role, over a card sample
//
// usage: node semantics-extend-questions.mjs <questions.json>
import { readFileSync, writeFileSync } from "node:fs";

const [path] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(path, "utf8"));
const questions = doc.questions.filter((q) => q.wave !== 2);
const byKind = (k) => questions.find((q) => q.kind === k);

const sets = byKind("set_definitions").payload.sets;
const roles = byKind("roles").payload.roles;
const liveIds = (() => {
  const counts = byKind("live_ids");
  return counts.payload?.ids ?? null;
})();

// Card sample for the per-role verdicts: every card in the first `cards`
// question plus an even stride over all `cards` questions, capped at 2,000.
const allRows = questions.filter((q) => q.kind === "cards").flatMap((q) => q.payload.rows.map((r) => r.id));
const stride = Math.max(1, Math.floor(allRows.length / 2000));
const sample = allRows.filter((_, i) => i % stride === 0).slice(0, 2000);

// The rows Ruby's fetch-by-id did not return in the first wave (found by the
// first comparison): live rows whose compound name has a trashed or absent
// side, legacy compound names stored without left_id/right_id, and three
// "+*default" rows whose left parts share one name.
const idFetch = [
  1607, 1608, 1609, 1610, 2833, 3217, 3225, 3229, 3265, 3270, 3298, 3320, 3325, 3357, 3364,
  3367, 3377, 3443, 3451, 3483, 3548, 3555, 3665, 3804, 3821, 3966, 4017, 8277, 8555, 8884,
  8926, 9037, 9055, 9111, 9120, 9248, 9474, 375, 377, 389,
];

let next = Math.max(...questions.map((q) => q.id)) + 1;
const add = (category, kind, payload) => questions.push({ id: next++, wave: 2, category, kind, payload });
add("dsl", "view_defs_full", { sets });
add("dsl", "event_defs_full", { sets });
add("identity", "id_fetch", { ids: idFetch });
add("naming", "inflection_rows", {});
add("permissions", "role_permissions", { roles, card_ids: sample });
void liveIds;

writeFileSync(path, JSON.stringify({ ...doc, questions }));
process.stdout.write(`questions: ${questions.length} (wave 2 starts at ${next - 5}); sample ${sample.length}\n`);
