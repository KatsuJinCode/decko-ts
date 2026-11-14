// A successful soft delete retains the intended row as a tombstone. Only
// that exact row is allowed; resurrection or another delete-shaped record
// remains a failure, including an extra record subsequently trashed.
export function unexpectedDeleteTargets(rows, intendedId) {
  return rows.filter(row => row.id !== intendedId || Number(row.trash) !== 1);
}
