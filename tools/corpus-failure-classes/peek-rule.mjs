import Database from "better-sqlite3";
const db = new Database("./benchmarks/corpus-v2/bench-corpus-v2.sqlite3", { readonly: true });

// Inspect the bvtlkvlknfc+*right+*structure rule row
const rule = db.prepare(
  "SELECT id, name, content, left_id, right_id, key FROM cards WHERE name = 'bvtlkvlknfc+*right+*structure'"
).get();
console.log("RULE:", JSON.stringify(rule, null, 2));

// Walk left_id chain
function walk(id, depth = 0) {
  const row = db.prepare("SELECT id, name, key, left_id, right_id, type_id FROM cards WHERE id = ?").get(id);
  if (!row) return;
  console.log("  ".repeat(depth) + "id=" + row.id + " name=" + row.name + " key=" + row.key + " left_id=" + row.left_id + " right_id=" + row.right_id + " type_id=" + row.type_id);
  if (row.left_id !== null && depth < 4) walk(row.left_id, depth + 1);
  if (row.right_id !== null && depth < 4) walk(row.right_id, depth + 1);
}
console.log("\nWalking rule's left/right chain:");
walk(rule.left_id);
walk(rule.right_id);

// Look at card id=28 (*all+*default) — what type does it have?
const card28 = db.prepare(
  "SELECT id, name, key, type_id, left_id, right_id, codename FROM cards WHERE id = 28"
).get();
console.log("\nCARD id=28 (*all+*default):", JSON.stringify(card28, null, 2));

// Walk card28's type
if (card28.type_id !== null) {
  const typeRow = db.prepare("SELECT id, name, key FROM cards WHERE id = ?").get(card28.type_id);
  console.log("CARD id=28's type:", typeRow);
}

// Walk card28's left/right
if (card28.left_id !== null) {
  const leftRow = db.prepare("SELECT id, name, key, type_id FROM cards WHERE id = ?").get(card28.left_id);
  console.log("CARD id=28's left:", leftRow);
  if (leftRow.type_id !== null) {
    const leftType = db.prepare("SELECT id, name, key FROM cards WHERE id = ?").get(leftRow.type_id);
    console.log("CARD id=28's left's type:", leftType);
  }
}

// Now check: is there a rule named "bvtlkvlknfc+*structure" (without the *right)?
const altRule = db.prepare(
  "SELECT id, name, content, left_id, right_id, key FROM cards WHERE name = 'bvtlkvlknfc+*structure'"
).get();
console.log("\nbvtlkvlknfc+*structure rule:", JSON.stringify(altRule, null, 2));

// And is there a rule named "bvtlkvlknfc+*default+*type plus right+*structure"?
const tprRule = db.prepare(
  "SELECT id, name, content, left_id, right_id, key FROM cards WHERE name LIKE 'bvtlkvlknfc+*type plus right+*structure'"
).get();
console.log("\nbvtlkvlknfc+*type plus right+*structure rule:", JSON.stringify(tprRule, null, 2));

// What is the codename / key for *default?
const defaultSetting = db.prepare("SELECT id, name, key, codename FROM cards WHERE name = '*default' OR key = '*default'").get();
console.log("\n*default setting:", defaultSetting);

// Look at how many cards have name *all+*default
const allDefaults = db.prepare(
  "SELECT id, name, key, type_id FROM cards WHERE name = '*all+*default'"
).all();
console.log("\nCards with name '*all+*default':", allDefaults);
db.close();
