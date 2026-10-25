# reg-redteam-dispute-3

- Family: register-redteam.
- Row: "disputed PORTED verdict: B2" (card-mod-B2 / write-routes stub census).
- Verdict at the time of this lane: PORTED, bucket WORKING ON IT. The adjudication
  (port/starcards-redteam-20261020, commit 7c13885f) closed the real gap (the subcard-scoped
  `action_id_of_cached_upload` arm of card#create) on its lane. Its stated unblock
  condition: "the subcard routing reaches the canonical tree and
  tests/card/actions/subcard-cached-upload.test.ts is run green against it."

## Verdict: DONE - both unblock arms hold at the base this receipt measures

Base: `deploy/full-candidate-20261101` tip `c17906db`, branch `port/workbatch-b-20261025`.
The canonical roll tip carries the routing:

- `src/card/actions/types.ts:188` (`CreateCardInput.actionIdOfCachedUpload`), `:272` and
  `:338` (the subcard-scoped twins on the subcard input shapes, the field the adjudication
  ported).
- `src/server/write-routes.ts:2119`, `:2274` and `:3075`: the route parse carries
  `actionIdOfCachedUpload` per card and per subcard (`cachedUploadActionParam`).

Checks run at the base of this receipt (this lane, this tree):

- `npx vitest run tests/card/actions/subcard-cached-upload.test.ts` (in the 3-file run with
  the holder-name guard and auth-setup pins): 2 tests passed - the save leaves the subcard
  file-typed with the draft's bytes plus original filename as its action comment and the
  draft row deleted at integrate; an unresolvable id on an otherwise-blank subcard saves
  nothing, matching Ruby's `Card::Action.fetch` nil.

The routing is in the canonical roll and the named test runs green against it. The row's
PORTED verdict now rests on routing that the canonical tree carries, which is exactly the
condition the adjudication set for the row to stop being WORKING.
