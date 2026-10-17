import type { SQLStatement } from "../../server/driver.js";

/** Resolve only the requested tuples. Starting from bound keys keeps each
 * part/junction lookup indexed, even without planner statistics, instead of
 * scanning every stored junction once for each chunk of requested names. */
export function junctionChainQuery(tuples: readonly (readonly string[])[]): SQLStatement {
  const depth=tuples[0]?.length ?? 0;
  if(depth<3 || tuples.some(parts=>parts.length!==depth) || depth*tuples.length>90) throw new Error("junction chain query requires equal-depth tuples within 90 parameters");
  const keys=Array.from({length:depth},(_,i)=>`k${i}`);
  const requested=tuples.map(()=>`SELECT ${keys.map(()=>"?").join(", ")}`).join(" UNION ALL ");
  const joins=[
    `CROSS JOIN cards p0 ON p0."key" COLLATE NOCASE = requested.k0 AND p0.trash = 0`,
    `CROSS JOIN cards p1 ON p1."key" COLLATE NOCASE = requested.k1 AND p1.trash = 0`,
    `CROSS JOIN cards c2 ON c2.left_id = p0.id AND c2.right_id = p1.id AND c2.trash = 0`,
  ];
  for(let n=2;n<depth;n++){
    joins.push(`CROSS JOIN cards p${n} ON p${n}."key" COLLATE NOCASE = requested.k${n} AND p${n}.trash = 0`);
    joins.push(`CROSS JOIN cards c${n+1} ON c${n+1}.left_id = c${n}.id AND c${n+1}.right_id = p${n}.id AND c${n+1}.trash = 0`);
  }
  return {sql:`WITH requested(${keys.join(", ")}) AS (${requested}) SELECT DISTINCT c${depth}.* FROM requested\n${joins.join("\n")}`,params:tuples.flatMap(parts=>[...parts])};
}
