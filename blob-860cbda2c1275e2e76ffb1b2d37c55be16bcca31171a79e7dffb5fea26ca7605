// The E11b leg's own handles.
//
//   node --test tools/edge-signed-in-exercise/test/e11b-context-handles.test.mjs
//
// THE DEFECT. The leg read `database()`, `page`, `visit` and `record` as free
// identifiers instead of destructuring them out of the context, so the
// signed-in run of 2026-10-22 recorded it as {"threw":"database is not
// defined"} - the leg never measured anything, and a leg that never ran
// cannot be credited to any family.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the E11b leg destructures the handles it uses out of the context", () => {
  const source = readFileSync(new URL("../checks-catalog-edit-create.mjs", import.meta.url), "utf8");
  const start = source.indexOf('name: "E11b the +summary junction');
  assert.ok(start > 0, "the E11b leg is in the file");
  const end = source.indexOf("},", source.indexOf("record(\"E11 a card with a +summary nested field", start));
  const leg = source.slice(start, end);
  assert.match(leg, /const \{ page, database, record, visit \} = ctx;/);
  // And the handles the leg uses are the ones it declares.
  for (const handle of ["database()", "page.", "visit(", "record("]) {
    assert.ok(leg.includes(handle), `the leg no longer uses ${handle}`);
  }
});
