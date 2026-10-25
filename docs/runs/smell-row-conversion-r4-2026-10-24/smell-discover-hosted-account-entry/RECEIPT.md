# smell-discover-hosted-account-entry

- The row's own label: `smell/probe script discover-hosted-account-entry.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-account-entry.mjs`
- What this lane did: restored the harness modules the instrument's own receipt of record
  names, ran the instrument's walk over the live hosted edge, and compared this run's
  receipt with the receipt of record.
- Commands:
  - `git show 50d6f096:tools/edge-signed-in-exercise/lib/harness-browser.mjs` and the same for
    `local-policy.mjs` and `reference-harness/browser/lib/live-walk-profile.mjs`, staged into
    `.runtime/r4-harness/tree/` in this lane's checkout
  - `node discover-hosted-account-entry.mjs` (from a scratch directory that holds the
    instrument's own copy, its prior report and a fresh output directory)
    (exit 0; both routes were visited and the receipt was written)
  - `node tools/smell-row-r4/distill-hosted-account-entry.mjs <fresh receipt> <receipt of record> <prior report> fixtures/captured/smell-row-r4-2026-10-24/discover-hosted-account-entry.json`
    (exit 0; wrote the capture)
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-row-r4-2026-10-24/discover-hosted-account-entry.json`.

## Verdict: DONE

The row's own instrument ran and produced its complete answer, and the answer is unchanged.

| route | status | blocked assets | console errors |
|---|---|---|---|
| `/new/Sign_up` | 200 | 0 | 0 |
| `/*signin/edit?slot[hide][]=board_link` | 200 | 0 | 0 |

The sign-up page answers 200 with the title "Sign up - Culturesmith" and serves the account
creation form (a `POST /card/create` with `card[name]`, `card[type_id]`,
`card[subcards][+*account][subcards][+*email][content]` and
`card[subcards][+*account][subcards][+*password][content]`), and a `Cancel` link to `/`.

The sign-in page answers 200 with the title "*signin - Culturesmith" and serves the sign-in
forms (a `POST /update/*signin` with `card[subcards][+*email][content]` and
`card[subcards][+*password][content]`, and the reset form with `card[trigger]`), and the
links `/*signin/edit`, `/*signin/board`, `/*signin/edit?slot[hide][]=board_link` (Reset
password) and `/new/Sign_up` ("...or sign up!").

This run agrees with the receipt of record field for field: the same statuses, the same
titles, the same form actions, the same form field names and the same links as the
2026-10-19 run (`hosted-account-entry-discovery-20261019-r1/receipt.json`).

## What this lane had to restore, and why the walk was blocked before

The instrument imports its harness from a pinned checkout, and the copy of that harness on
this machine was one day older than the one the instrument's own receipt names. The older
harness aborts every request to a remote origin (`net::ERR_BLOCKED_BY_CLIENT`), so the walk
never saw a page: this lane's first run of the instrument recorded exactly that on both
routes, with the instrument's own exit code 0 and a receipt full of blocked navigations.

The harness the instrument's receipt of record names (`harnessSource
50d6f0964de07ab183a3d6a445d1bad3d6cb870d`) admits the origin when the read-only live-walk
profile is installed, and it is that harness's own policy that aborts the writes the
read-only mode refuses. This lane restored those three modules and ran the walk against the
hosted edge.

The walk ran the instrument's own copy, whose two import URLs point at the restored modules
instead of at the older copy on disk: the tracked harness files in the pinned checkout are
untouched, so the copy is the instrument's body with its two dependency pointers rewritten
and nothing else changed. The checkout's `reference-harness/browser/lib/live-walk-profile.mjs`
is present as an untracked artifact because the instrument imports it and it was absent
there; it is this lane's tip's copy of that module, not the one the successful run used.

The instrument's receipt field `harnessSource` names the checkout's HEAD (`b00a4503`), not
the version of the modules it actually ran, so the receipt of record and this receipt agree
on that field while the module versions behind it differ. This receipt states both.

## The live calls this lane made, and what it did not do

The walk is two anonymous page loads on the Bunny-hosted edge
(`https://culturesmith-edge.bunny.run`), plus the assets those pages load. The asset
allowlist this lane used is the production storage CDN and no `.com` domain: the prior
report's own list names the CDN and `culturesmith.com`, and the `.com` entry was removed
before the run, so no request to that domain was made. Nothing was submitted, nobody was
signed in, no write path ran (the live-walk profile's mode is read-only), no deploy happened
and no desktop or browser window was shown: the browser is the harness's own hidden browser
with a throwaway profile.

The instrument's one-shot output directory was already consumed by the 2026-10-19 run, so
the walk ran in a scratch directory with a fresh output directory and the original receipt
was left where it was.

## The limit of this verdict

The row's instrument is a discovery, not an assertion: it records what the live host serves
on those two routes. This receipt claims that the two anonymous account-entry routes answer
200 with those surfaces, with no blocked asset and no console error, and that the answer is
the same as the record of record. It claims nothing about the sign-in flow's behaviour, and
nothing about any route the walk did not visit.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
