# ERR1 and S11: compare the stock contract

The frozen whole-battery failures are retained. Two predicates conflict with
the exact installed Ruby behavior; neither needs a runtime behavior change.

ERR1 counted an administrator's unknown-card create form as an error. Stock
`card-mod-format-0.20.0/set/all/html/error.rb:81-86` explicitly chooses `new`
and HTTP200 when create is permitted, otherwise not_found/404. The prior raw
capture already shows anonymous404 without a form and admin200 with a form.
The corrected check requires both denied anonymous paths to show Not Found
without a create form, the permitted admin to get the correctly named create
form, the valid sign-in control to remain200, and no card to be silently saved.
The original check name remains; its stated error-page assertion applies to
the denied requests, with permitted creation as a positive control.

S11's base36 suffix is not case-equivalent under stock Cardname0.20.0:
`Harness_CF_Plural_Widgets_mvd5qgq8` has key
`harness_cf_plural_widget_mvd5qgq8`, while its uppercase spelling has key
`harness_cf_plural_widget_mvd5_qgq8`. Both actual installed Ruby and TypeScript
return those exact keys. This is the stock underscore digit/acronym boundary,
not an implementation divergence. Also, stripping a terminal s from a name
ending in the suffix did nothing, so the old singular leg repeated the exact URL.

A numeric suffix gives six distinct equivalent spellings: exact, Widget in
place of Widgets, spaces, lowercase, uppercase, doubled underscores. Independent
Ruby and TypeScript probes return one identical key for all six. The corrected
browser check still requires every URL to reach the stored card and its body.
No name, inflection, lookup, permission or serving implementation changes.

The search gateway did not supply an authoritative versioned explanation;
installed Ruby source and executed Ruby/TS probes decide the behavior. Probe
scripts/results are retained in the process workspace's private evidence.
Browser capture follows the coherent instrument checkpoint; no predicted pass
is accepted, and no frozen full-battery score is recomputed here.
