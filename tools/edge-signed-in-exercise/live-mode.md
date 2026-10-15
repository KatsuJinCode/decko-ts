# Live mode: driving the live site through a signed-in profile

`tools/edge-signed-in-exercise/live-mode.mjs` drives
`https://culturesmith-edge.bunny.run` through a browser profile the operator signs into **by
hand once**. It was built and exercised against a loopback copy of the same stack; it has
**never been run against the live site**, and the lead runs it, not the harness.

## What the operator does once

1. Make a dedicated profile folder. Do not point this at the operator's everyday browser
   profile; the session cookie lives in the profile, and the profile is what makes the run
   repeatable.
2. Sign in by hand:

   ```
   node tools/edge-signed-in-exercise/live-mode.mjs --profile <folder> --sign-in-only
   ```

   A window opens on the site's sign-in page. Sign in there, then close the window. The profile
   keeps the session cookie. Later runs reuse the profile and never see a password.

3. Run the exercise (the lead does this, not the harness):

   ```
   HARNESS_LIVE_CONFIRM=yes node tools/edge-signed-in-exercise/live-mode.mjs --profile <folder>
   ```

## What the code guarantees

- **Only the live host is driven.** The script refuses any target that is not
  `culturesmith-edge.bunny.run` or a loopback test host, refuses non-https, and refuses the live
  host unless `HARNESS_LIVE_CONFIRM=yes` is set. Requests to any other host are blocked in the
  browser, so the run cannot wander off the site.
- **Every card it creates is its own.** Names are `HarnessLive_<runId>_<label>`, and each name is
  written to a ledger (`tmp/live-ledger-<runId>.json`) **before** the card is created.
- **Cleanup deletes only what the run created.** A card is deleted only if it is in the ledger,
  its name carries the run's prefix, and the run's marker text is visible on the card's own page.
  If any of that does not hold, the card is left alone and reported by name.
- **No pre-existing card is ever edited, renamed or deleted.** Every edit-shaped check runs on a
  card the run itself created.
- **No account is created, no password or email changed, and the operator's Sign out is never
  clicked** (it would end the session the run depends on).
- Writes go through the site's own forms, as the operator would make them.

## What it does NOT do

It does not exercise the whole capability checklist. It is a read-mostly sweep that proves the
signed-in session works against the live deployment, creates one owned card, checks it renders,
and cleans it up. The deep coverage lives in the local harness
(`node tools/edge-signed-in-exercise.mjs`), which runs the same deployed bundle against a local
deck copy and can make and undo writes freely.

Anything that changes account state or sends mail is deliberately absent from live mode, because
a live deck is not a place to leave a changed password or a stray notification.