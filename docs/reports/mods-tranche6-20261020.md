# Mods tranche 6

Base: eceb562706cfe696b377351aa116e8939bac8e18.
Register: brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md.
The register is maintained in the lead documentation repository, not this worktree.

## Remaining partial entries in register order

After excluding the entries dispositioned by mods tranches 1-5:
16 follow; 17 format; 19 history; 23 markdown; 27 script; 28 search;
29 session; 32 tinymce_editor; 33 virtual.
Virtual's event-body skips are already recorded by the events lane, but no
mods tranche has separately dispositioned entry 33. PORTED entries are excluded.
This batch takes entries 16, 17 and 19, in that order.

## 16 follow

Verified matching: the HTML follow_button is registered, with cache never.
Corrected stale manifest prose claiming the button was unported.
The modal helper has exactly one mention in the entire pinned card-mod set
Ruby/HAML source: its definition. This is no missing reachable view.
Skip and named: JSON follow_status invokes link_opts on StartFollowLink or
StopFollowLink CLASS objects. The gem defines only the instance method.
Both branches raise NoMethodError, measured by loading the gem's own classes.
No guessed successful JSON answer is registered.

Oracle: oracle-capture-follow-link-remainder.rb and its JSON capture record the
method error, both branches, the modal census and the source SHA-256.
Checks: card-mod-follow-remainder-census plus card-mod-follow, 15/15 passed.
No deployment and no production-host contact.

## 17 format

Ported: JSON-LD not_found, denial and test, with raw Ruby error_result JSON
bytes and the literal test error. The capture executes the gem's JSON-LD
block and helper, without copying its expected answer into the probe.
Corrected the stale html-only dispatch claim: params.format already reaches
RenderFormat. These views now pass through that real dispatch.
Remainders named precisely: dynamic JSON errors and JSON-LD errors/server_error
need root error_status and card.errors state not exposed by RenderFormat;
format_unsupported also mutates that root state. CSV body and RSS XML remain
unregistered view bodies; separate show helpers exist, so their absence is not
absence of a format family. No full-mod parity claim is made.
Checks: JSON-LD static errors, card-mod-format, RSS format views: 62/62 passed.

## Process evidence

Gateway research was started before design; its default provider returned an
unhelpful refusal. The local pinned gem source is the authoritative evidence.
Gateway health reported bridges up; no running search was terminated.
Touched follow tests completed in 3.50 seconds, format tests in 2.22 seconds.
The first follow save changed line endings accidentally. A separate forward
commit restores the original LF bytes; no history was rewritten.
