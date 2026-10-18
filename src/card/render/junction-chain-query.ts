import type { SQLStatement } from "../../server/driver.js";
import { unionCtes } from "../live/request-store.js";

/** Resolve only the requested tuples. Starting from bound keys keeps each
 * part/junction lookup indexed, even without planner statistics, instead of
 * scanning every stored junction once for each chunk of requested names.
 *
 * The bound tuple rows ride a compound SELECT (one SELECT per tuple), and D1
 * refuses a compound of more than MAX_COMPOUND_TERMS terms ("too many terms
 * in compound SELECT" — the five-term limit docs/deploy-cloudflare.md:116-124
 * pins), so the rows are emitted through the engine's unionCtes splitter: a
 * chunk wider than five tuples becomes requested_0, requested_1, ... of at
 * most five terms each, with `requested` as their UNION. Same row set (the
 * consumer SELECTs DISTINCT over the join, so a repeated tuple cannot add a
 * row), same parameter order (the CTEs keep the tuples' text order), and the
 * 90-parameter budget above is untouched — the split adds no parameters. */
export function junctionChainQuery(tuples: readonly (readonly string[])[]): SQLStatement {
  const depth=tuples[0]?.length ?? 0;
  if(depth<3 || tuples.some(parts=>parts.length!==depth) || depth*tuples.length>90) throw new Error("junction chain query requires equal-depth tuples within 90 parameters");
  const keys=Array.from({length:depth},(_,i)=>`k${i}`);
  const parts=tuples.map(()=>`SELECT ${keys.map(()=>"?").join(", ")}`);
  const requestedCtes=unionCtes("requested",parts,keys.join(", "));
  const joins=[
    `CROSS JOIN cards p0 ON p0."key" COLLATE NOCASE = requested.k0 AND p0.trash = 0`,
    `CROSS JOIN cards p1 ON p1."key" COLLATE NOCASE = requested.k1 AND p1.trash = 0`,
    `CROSS JOIN cards c2 ON c2.left_id = p0.id AND c2.right_id = p1.id AND c2.trash = 0`,
  ];
  for(let n=2;n<depth;n++){
    joins.push(`CROSS JOIN cards p${n} ON p${n}."key" COLLATE NOCASE = requested.k${n} AND p${n}.trash = 0`);
    joins.push(`CROSS JOIN cards c${n+1} ON c${n+1}.left_id = c${n}.id AND c${n+1}.right_id = p${n}.id AND c${n+1}.trash = 0`);
  }
  return {sql:`WITH ${requestedCtes.join(", ")} SELECT DISTINCT c${depth}.* FROM requested\n${joins.join("\n")}`,params:tuples.flatMap(t=>[...t])};
}
