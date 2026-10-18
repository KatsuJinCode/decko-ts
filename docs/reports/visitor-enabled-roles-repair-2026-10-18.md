# Visitor enabled roles: selection must affect authority

Transport repair `2f004478` makes the stock virtual Session update store the
visitor cookie, validate its owner and held roles, and return `reload:true`.
An actual neutral-member checkbox then saves and reloads, but its fresh checkbox
remains checked and its role-only read remains HTTP 200. The cookie alone is
not acceptance. The Culturesmith lead recorded the separate contract decision
in the process workspace coordination record: intersect real grants, preserve
defaults, partition retained caches by selection.

The consumer repair carries an optional role selection on ReadViewer and the
request's CardActionEngine. The shared permission resolver intersects it with
stored role membership before deriving read rules, write parties or admin
authority. Public and actor-self parties remain; the bot retains its stock
always-ok exception. No selection, including blank Session content, preserves
the prior defaults. The editor's available roles remain the full held set so
an unchecked role can be enabled again. Its checked values and hidden content
reflect the selected subset.

The Bunny actor renderer pool and live-render keep scopes include the normalized
selection. The pool remains bounded. Signed-in shared HTTP caches already
bypass storage. The Node staging host uses the same selection partition, and
write responses and upload previews receive the selected viewer. No shared
renderer is mutated between concurrent requests. History-only visitor cookies
keep the default fast path. A cookie cannot confer an unheld role.

Upstream evidence is the installed Decko 0.20.0 enabled_roles.rb, its
role_checkbox.haml, account_holder.rb enabled_role_ids/parties, Session#virtual?
and store_in_session, the controller reload success, and the browser slotter
reload handler. The search gateway did not locate an authoritative versioned
public trace; installed source, not search inference, decides these semantics.

Validation before the consumer commit:

- 61 pass / 2 optional live-trial skips in eight matching files: actual Session
  write routes, role/actor algebra, navbar state, actor-cache isolation, exact
  prefetch pins, Bunny sign-in/session round trips. The passed write control
  refuses a disabled held role, allows re-enabling through its own Session
  form, then persists an authorized ordinary write.
- 32 pass / 10 skips in a separate eight-file overlapping run: read/write
  verdicts, RSS, junction/depth/shape checks. Three corpus replay suites lack
  the exact trial mirror; the navbar oracle replay is explicitly gated. These
  skips are not passing coverage. The available original deck lacks the named
  actor required by those trial suites and is not substituted as that corpus.
- Normal typecheck, staging syntax check and classification of 807 files pass.
- Private actual-browser diagnostic bundle SHA256
  `bda4d07bfc24f8fc152dc249938fad657f8400af89e4d3f575a25ef63d1b9e89`
  verifies native uncheck/save/reload, fresh unchecked display, role-only read
  403 and write 403 without canonical/history changes, native re-check/reload,
  restored read 200 and write 303 with the actual stored content. An unheld
  Administrator selection returns 422 and another account's selection returns
  403, with cookie and canonical state unchanged. Both Session create/update
  controls remain. This diagnostic predates the history-only fast-path and
  unresolved-mark refinements; a clean exact-bundle follow-up is still required.

Actual receipts are in the private process repository under
`recovery/release/private-probes/neutral-role-session-r3-2026-10-18T04-01-33-982Z/`
(transport-only red), `neutral-role-session-r4-2026-10-18T04-05-26-335Z/`
(consumer read green), and `neutral-role-session-r5-2026-10-18T04-06-45-770Z/`
(native round trip plus write effects). Each uses an owned temporary copy and
closes its stack/browser and removes that copy. No real account, production
permission grant or original deck content is changed.

These are focused local Node/SDK-shim results, not a new full-battery score,
vendor-runtime deployment, or public-release acceptance. The earlier 206/223
and 46/51 frozen totals remain their own measurements.
