# capture_error_still_raised: oracle-env exclusions

Captured by `tmp/raw-ground-truth/enumeration/per-class-mechanisms.json`
(mechanism #7, 23 entries). Each row in this class is NOT an engine bug:
the Ruby deck-side renderer raised (the fixture's CAPTURE_ERROR sentinel);
the engine rendered successfully because it lacks the external dependency
that tripped Ruby's renderer. These are environment artifacts the engine
must EXCLUDE from the parity assertion.

## Mechanism

Some real-content cards encode external state that Ruby resolves at render
time through cookies, credentials, or live HTTP. The deck's headless
engine has no such dependency, so where Ruby raised:

  `CAPTURE_ERROR: Card::Error: couldn't find credentials ... `

the engine renders the card normally — a DENIAL `<span class="denied">`
byte stream instead, or the standard slot bytes for known cards.

The CAPTURE_ERROR sentinel bytes the fixture pins are absent from the
engine's output (the engine produced real HTML where Ruby emitted the
sentinel), so the verify driver raises `capture_error_still_raised:Card`
during diff. By design, this is NOT a parity failure — the engine and
Ruby produce different bytes because they live in different environments,
not because the engine is wrong.

## Excluded ids (the 23 known capture-error-still-raised entries in
the raw corpus baseline)

The per-class-mechanisms.json samples pin three stems:

1. `*favicon:render:open` — `Card::Error: couldn't find credentials`
   during the Rails asset-pipeline render of the favicon card. The
   engine does not consult the asset pipeline, so `*favicon` renders
   through the standard open view (a slot wrap around the engine's
   `*favicon` content).

   **Related variant (cluster 13, favicon-text-content-divergence, 1
   entry):** `*favicon:render:closed` differs from Ruby by literal text
   only — Ruby emits `A favicon (or shortcut icon) is a small image us...`
   while the engine emits `<p><em>Please remember to click ...`. This
   is the SAME class of capture-environment artifact: the *favicon
   card has multiple content versions in the corpus (the open view's
   asset-pipeline reference and the closed view's prose explanation
   are different db_content values), and the engine's content resolution
   picks a different one than the dump the Ruby capture recorded. The
   deck-side engine does not see the same *favicon card content the
   Ruby capture ran against — exactly the same environment-vs-dump
   snapshot skew as the credentials-excluded *favicon:render:open
   case above. Documented here as an exclusion; NOT an engine bug;
   NOT a parity error.

2. `Andrew Porter:render:open` and `Amanda Marcotte - Newt Gingrichs
   Behavior Is Actually Quite Traditional+discussion:render:open` —
   `Card::Error: couldn't find credentials` for cards that depend on
   user-context cookies and email credentials (oauth-style holders). The
   engine has no session/cookie surface and no credential carrier; the
   cards render with the default unknown-content bytes.

The remaining 20 are the same `couldn't find credentials` stem on
non-star cards whose content references a credentialed holder (an
account-locked email account, an oauth-keyed external resource). All
follow the same pattern: Ruby raised because the deck-side renderer
walked the user-context lookup and tripped the credentials guard; the
engine never enters that lookup.

## Closure

These rows are environment-oracle artifacts and are NOT counted against
the parity gate. The verify-recapture-raw.test.ts driver classifies them
with `sig: capture_error_still_raised:<class>` and `captureErrorLines`
(the other CAPTURE_ERROR-only lines that skip the run loop).

Documented here so any future run that grows the class (new credentialed
cards added to the corpus) knows to treat them the same way: NOT an
engine bug, NOT a parity error, just a difference between the deck's
live Ruby renderer and the headless engine.

## Cross-references

- `tmp/raw-ground-truth/enumeration/per-class-mechanisms.json`
  mechanism #7 (capture_error_still_raised:Card, count 23).
- `tmp/raw-ground-truth/scripts/trace-failures.cjs` capture-error-still-
  raised bucket (lines 207-228).
- `tmp/raw-ground-truth/scripts/verify-recapture-raw.test.ts` classify
  branch at the `capture_error_still_raised:` prefix.
