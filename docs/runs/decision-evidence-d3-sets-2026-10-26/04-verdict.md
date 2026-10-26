# Decision 3 receipt: verdict

Decision 3's verification slot asked whether the port's set declarations all
carry the same membership as the recorded Ruby set definitions. The check ran
on 2026-10-26 in a fresh worktree of deploy/full-candidate-20261102
(c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6), branch
port/setdsl-verify-20261026.

The port's set declarations number 405, across the 31 installed mod
manifests (382 distinct set paths, plus the nine core set patterns they
instantiate). The recorded material holds 438 set-definition files over 415
distinct sets, after excluding five helper files Ruby's own loader skips
(set_template.rb:47-53). Of the 415 recorded sets, 379 carry a port
declaration with an identical name/pattern and identical junction membership;
36 do not, and every one of the 36 is dispositioned on its line in
01-declaration-list.md: 31 are method-only set modules (their Ruby content
defines card methods, not registrations; the behavior lives at the named
port site), 3 are card-mod-bar_and_box view modules whose bytes are compiled
into the port's seed tables, and 2 (card-mod-monkey's all/event_viz and
all/view_viz, dev-visualization tools) have no port carrier and stand as
findings. A third finding rides inside a carried set: card-mod-monkey's
set/all/debug.rb shares the all/debug path that core's declaration carries,
but the monkey file's own view :debug and introspection methods have no port
carrier (02-membership-comparison.md names it). No recorded set has a
different membership semantic from the port
declaration that carries it: there is nothing on the recorded side for a
declaration to disagree WITH at the membership level, because membership is
path-derived on both sides, and the one place the recorded material computes
membership at all (four shared pattern-level `pattern_applies?` definitions)
is carried by the port's nine-entry pattern table at the same layer
(03-computed-set-search.md).

The sentence the issue can now carry: where the recorded definitions are
static, the port's declarations match them set for set (379 of 415 exact,
36 accounted for on the list's own lines, 2 of those 36 named as findings);
the search for a computed set in the recorded material ran the only two
places one could live and found none; the four shared pattern predicates are
the recorded material's whole computation, and the port carries them as the
same shared table rather than as per-set code.

Counts as measured (commands in the receipt files): port declarations 405;
recorded sets 415; equal 379; not-equal 36 (31 method-only, 3 seed-table
carried, 2 findings); computed sets found 0.
