# Page-only batch 7 — ranks 81-90 of the witnessed-only list

Ranks 81-90 of the canonical witnessed-only page-only list (the 2026-10-18
exhaustive regrade's 101 page-only ids in id order). The id list this lane
took, verbatim and in full:

```
ACT-164  ACT-166  ACT-167  ACT-168  ACT-170
ACT-171  ACT-172  ACT-174  ACT-175  ACT-177
```

Those ten, and no others. Sibling windows (dedup record, not re-claims):
ranks 1-10 `bc81fbb5`, 11-20 `5bdda29f`, 21-30 `cacce253`, 31-40 `93771deb`,
41-50 `7deabd7e`, 51-60 tip commit `d69c2369`, 61-70 `47915f69`; ranks 71-80
and 91-100 were in flight on their own tip worktrees.

## Verdict

**8 of 10 legs GREEN, 2 RED — the batch proof bar (all legs green twice
consecutively) is NOT met.** Both runs are byte-identical in verdict: the
same eight green, the same two red, against the same engine build.

The two reds share one root cause and it is not in the mod/card layer: **the
browser-harness host `vm-staging-server.mjs` is behind the deployed
Cloudflare worker's route-and-response surface.** Neither red is reachable
on `deploy/worker.ts`, where both the route and the cookie handoff exist.

## Engine under measurement

The shared checkout carries other lanes' uncommitted work, so the engine was
built in a disposable pure-tip worktree and that worktree's `dist` is what
every leg drove.

| field | value |
|---|---|
| engine worktree | `C:\localProjects\decko-pageonly-ranks81-90-tip` (detached, then removed) |
| engine sourceCommit | `d69c2369ba8efdd29e2d58e933e8ab613e117755` |
| sourceDiffSha256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (clean tree — sha256 of the empty diff) |
| distSha256 | `ed5d41c2a49716d47baef857ac87dabe33067a13d6f87ca1b398c0f421742520` |
| engine manifest | `reference-harness/browser/engines/ts.json` (worktree's own) |
| fixture | `reference-harness/fixtures/synthetic-v1`, treeSha256 `e5798f2cc72905e5a5e4d581ba107e6177a8d36eba02923ac4a207056b0da93c` |
| probe | `reference-harness/browser/probe-pageonly-batch7-ranks81-90.mjs` |
| receipts | `.runtime/exhaustive/probe-pageonly-ranks81-90/` (`runA-result.json`, `runB-result.json`, `server.log`, `runA/runB.console.log`) |

`distSha256 ed5d41c2…` reproduces the 71-80 sibling's independent build of the
same commit — the build is deterministic, so the two lanes measured the same
engine.

## The eight green legs

Every leg drives the affordance through its own surface (the card's comment
box, the search box's autocomplete offer, the wanted card's own create form,
the `/new/Note` route, the feed's accordion, a `[[reference]]` link in a
card's body, the rule editor's popover, the navbar's role checkboxes, the
related panel's accordion), and every graded assertion carries a positive
control so no leg can pass vacuously. Leg shapes mirror the measured drives
in `reference-harness/browser/lib/exhaustive-ungradeable-batch2-targets.mjs`
(cases 2-11) and `probe-pageonly-top10-write-permission.mjs`; the selectors
and thresholds are those files'.

| id | capability | leg | run A | run B | evidence |
|---|---|---|---|---|---|
| ACT-164 | CM1 | comment box posts, comment is on the card page afterwards (rendered `#main` AND stored `db_content`) | GREEN | GREEN | `runA-result.json` / `runB-result.json` |
| ACT-166 | C19 | search-miss `search_box_complete` offers the `add` item; its url serves the pre-named create form; submitting stores the card | GREEN | GREEN | same |
| ACT-167 | C20 | `+*right` member renders as `a.wanted-card`; its own form is pre-named; submitting stores it; fresh read shows `known-card` | GREEN | GREEN | same |
| ACT-168 | C21 | `/new/Note` serves the form carrying `card[type_id]=606`; stored card's `.json` reports `type_name: Note` | GREEN | GREEN | same |
| ACT-170 | N13 | fresh act first in the feed, entries carry card links, first entry expands into its act list | GREEN | GREEN | same |
| ACT-171 | N15 | `[[reference]]` renders as a link; following it presents the referenced card's titled slot | GREEN | GREEN | same |
| ACT-174 | UI2 | rule editor's Set-selection field registers the popover; hovering shows that exact registered text | GREEN | GREEN | same |
| ACT-177 | REL1 | related panel expands, lists both pointed-at cards, a related link presents its card | GREEN | GREEN | same |

## The two reds, with cause

### ACT-172 (N16) — RSS format view

**What was measured.** `/Brief.rss` answers `200` with
`content-type: text/html; charset=utf-8` and an HTML document; no XML
declaration, no `<rss>`, no `<channel>`, no `<item>`. The same request with
`Accept: application/rss+xml` answers identically. `/*search?format=rss&term=…`
serves the ordinary HTML search results — the `format` parameter is ignored.
Both fail the check's own `looksRss` predicate. The `.json` control on the
same mark answers `application/json` (recorded as a witness), so the mark
served fine.

**Cause — a harness-host routing gap, not an engine break.** The deployed
worker *does* carry the route:

- `deploy/worker.ts:936-938` dispatches `.csv`/`.rss` to `cardFormatShow`;
- `deploy/worker.ts:668` calls `renderFormatShow(..., format, { rssEnabled: false })`;
- `deploy/worker.ts:676` returns `Content-Type: application/rss+xml; charset=utf-8`.

The browser-harness host does not: `grep -c "rss" vm-staging-server.mjs` = **0**.
It has no `.csv`/`.rss` route arm, so the whole mark falls through to the HTML
read path and resolves as a card NAME — the receipt's `rssShape` shows the
served slot ids naming the new-card view for a card literally called
`Brief.rss` (`brief_rss-new-view`, `brief_rss-help-view`). The serving layer's
own comment says `.json` is the format suffix
(`src/server/write-routes.ts:21`, `:964`, `:1733`); no other format mark is
recognized anywhere under `src/server/`.

Correction to an earlier reading of mine: the `rss_enabled` config gate
(`format-families.ts:573`, `RSS_DISABLED_BYTES` at `:264`, Ruby's `rss.rb:17`)
is **not** what answers here — the disabled-bytes string never appears in the
body. The route simply is not wired on this host.

### ACT-175 (A6) — role checkbox editing

**What was measured.** The navbar's inline editor is present
(`form.card-form[action$="+*enabled_roles"]`, 2 role boxes, 1 clickable).
Clicking it POSTs `200` with exactly the right fields:

```
utf8=✓&success[reload]=true&card[type_id]=481
&card[content]=Anyone+Signed+In
&pointer_checkbox-ada_admin-Xenabled_role-1=Anyone+Signed+In
```

`card[type_id]=481` is the fixture's Session cardtype (card 481, codename
`session`), so the write takes the session-card branch. But the decoded
visitor-session cookie carries **no** session cards after the write
(`sessionKeysBefore: []`, `sessionKeysAfter: []`), so the selection does not
persist into a following request and the restore leg has nothing to verify.

**Cause — the same harness-host gap, on the response side.** The write path
is correct: `saveVisitorSessionCard` stores the content
(`src/server/write-routes.ts:1348`) and `handleWriteRequest` returns it as
`visitorCookie` when the session changed (`write-routes.ts:1717-1721`). The
Cloudflare host consumes it — `src/server/cloudflare-write-routes.ts:565`
adds `extraCookies: [result.visitorCookie]`. The node/browser harness host
does not: `grep -c "visitorCookie" vm-staging-server.mjs` = **0**. The
updated session cookie is computed, then dropped on the floor, so the
persistence witness cannot be satisfied on this host.

The rendered checkbox is not an alternative witness: `ensure_roles` re-fills
the current roles at render time, which the repo's own batch2 case 10 records
as the reason it grades on session content instead.

## Two probe-side defects I found and fixed (recorded so they are not re-hit)

Both were mine, not the engine's, and both were caught by measuring rather
than by reading source:

1. **Storing a body through `/new/RichText` is not possible on this harness.**
   The form's content control is TinyMCE-owned; after
   `locator.fill()`, the form's `card[content]` value is still `""`
   (measured). The `/new/PlainText` form's own live textarea does take the
   text. ACT-167 and ACT-171 were RED on the first run purely because their
   bodies were written through the RichText form; switched to PlainText, both
   went green immediately. (This is the same instrument reason batch5 uses
   `createPlainText`.)
2. **`DeckoName` is a namespace import, not a default-callable** — a
   diagnostic-only slip, no bearing on the graded legs.

## What I did not do

I did not patch `vm-staging-server.mjs`. Adding the `.rss`/`.csv` route arm
and the `visitorCookie` handoff would change the engine every other page-only
lane measures against, so it belongs to a decision that spans windows, not to
this one. The finding is recorded here with the exact lines.

## Reproducing

```
git worktree add --detach C:/localProjects/decko-pageonly-ranks81-90-tip d69c2369
cmd /c mklink /J C:/localProjects/decko-pageonly-ranks81-90-tip/node_modules C:/localProjects/decko-ts-release-lead/node_modules
node tools/dist/build-engine.mjs                       # in the worktree
node reference-harness/browser/probe-pageonly-batch7-ranks81-90.mjs \
  --engine C:/localProjects/decko-pageonly-ranks81-90-tip/reference-harness/browser/engines/ts.json \
  --fixture C:/localProjects/decko-pageonly-ranks81-90-tip/reference-harness/fixtures/synthetic-v1 \
  --out .runtime/exhaustive/probe-pageonly-ranks81-90
```

Exit code is non-zero while any leg is red (currently 1, on ACT-172 and
ACT-175).