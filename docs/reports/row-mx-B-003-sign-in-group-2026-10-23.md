# mx-B-003: home shows the account name and Sign out

The roster row `mx-B-003-1-sign-in-and-stay-signed-in` (family [Family]) reads
"home shows the account name and Sign out", verdict PASS, bucket DONE, with the evidence basis
"verified — every instrument entry for B-003 is pass (live-acceptance-lane+whole-harness)". This receipt is the family's own adjudication of that row: the
instrument the registry's own ledger records for it, the Ruby oracle that
pins the surfaces the instrument touches, and a fresh measurement at this
tip.

## What the row is

The signed-in home page shows the signed-in account's name and the sign-out
link.

## The instrument

The group's record "home shows the account name and Sign out". It reads three
facts off the home page: the sign-out link, the account's name and the page's
signed-in marker.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "home shows the account name and Sign out",
check_ids ["B-003"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's sign-out link, capture arm probe-view:406:sign_out@set/self/account_links.rb:

    <a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a>

The instrument's reader finds that anchor by its Ruby class (signout-link), and
the oracle test asserts the class, the href and the text against the captured
bytes, and against the port's own source line.

The account NAME the harness looks for is the harness's own seeded account
(Harness_Admin or Harness_Member), and the signed-in marker is the port's own.
Those are named-instrument facts; the sign-out link is Ruby's own bytes.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round3-20261023/fixed-r1/report.md

    source 683d1e14, started 2026-10-23T13:34:35.731Z
    verdict: PASS
    evidence: {"title": "Home - Culturesmith", "hasSignOut": true, "hasAccountName": true, "signedIn": true}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The parts of the row that are the port's own (the session cookie's name,
  the page's signed-in marker, the harness's seeded account names) are named
  as such above and are not claimed as oracle-matched.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
