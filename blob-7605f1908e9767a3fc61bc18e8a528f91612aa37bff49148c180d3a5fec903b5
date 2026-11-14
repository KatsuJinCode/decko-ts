/** The SQLite copy belongs exclusively to this run. Its baseline is taken
 * after account seeding; all later IDs include implicit junction/field cards. */
export function cleanupCreatedCards(db,baseline) {
 if(!Number.isSafeInteger(baseline)||baseline<0)throw Error('invalid journey card baseline');
 return db.transaction(()=>{
  const removed=db.prepare('UPDATE cards SET trash=1 WHERE id>? AND trash=0').run(baseline).changes;
  const remaining=Number(db.prepare('SELECT COUNT(*) AS n FROM cards WHERE id>? AND trash=0').get(baseline).n);
  return{removed,remaining,baseline};
 })();
}
