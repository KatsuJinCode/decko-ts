// The needs_setup? verdict seam for the sync view gate.
//
// Ruby: view :setup, perms: :needs_setup? (card-mod-account set/type/user.rb
// :11) - the render pipeline calls Card::Auth.needs_setup? SYNCHRONOUSLY (a
// memoized per-process census read, auth/setup.rb:9-15). The TS census is
// ASYNC SQL (setupWindowState in first-run-setup.ts - the same predicate's
// port, plus the deploy-contract gates that port documents). A ViewFn is
// synchronous, so the gate reads the PREPARED verdict: the caller (the
// /setup route surface, the bootstrap, a probe) computes setupWindowState's
// verdict once and hands it here - the same prepared-input shape the loader
// uses (setDefaultModLoader).
//
// The seam carries ONLY the predicate's own verdict (open/closed). The
// port's EXTRA gates (firstRunEnabled / write path) are deliberately NOT
// folded in here: Ruby's view gate is purely the census (first-run-setup.ts
// :150, :231), and folding the deploy gates would let a browse-only
// deployment render the form its submit cannot use - the opposite of the
// port's documented intent. The route layer applies its own gates on top.

export interface PreparedSetupVerdict {
  /** TRUE iff the non-shipped user-account count is zero - Ruby's
   *  needs_setup? (auth/setup.rb:33-40 needs_setup_if_no_accounts =
   *  user_account_count.zero?). */
  readonly open: boolean;
  /** The census count, when the producing side ran it (diagnostic only -
   *  the gate reads `open`). */
  readonly accountCount?: number;
}

let prepared: PreparedSetupVerdict | undefined;

/** Hand the census verdict to the sync view gate (the /setup route's
 *  bootstrap, or a probe seeding the runtime). */
export function setPreparedSetupVerdict(verdict: PreparedSetupVerdict): void {
  prepared = verdict;
}

/** The prepared verdict; undefined when no producer has run - the view gate
 *  treats that as CLOSED (Ruby's census cannot answer before the deck is
 *  readable either; the conservative closed answer is the same one
 *  setupWindowState gives a deck whose account system is half-seeded). */
export function preparedSetupVerdict(): PreparedSetupVerdict | undefined {
  return prepared;
}
