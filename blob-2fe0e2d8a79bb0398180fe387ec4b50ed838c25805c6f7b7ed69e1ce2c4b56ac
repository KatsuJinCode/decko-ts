# External critical review of the decko-ts port proposal — full text record

Third-party AI commentary on the port proposal, recorded so the port can be
tracked against it. It is not binding direction: binding direction comes from
the upstream issue thread (decko-commons/decko#1282).

Provenance: linked from decko-commons/decko#1282 (Ethan's comment, 2026-09-21T20:49Z) →
a ChatGPT shared conversation, "Decko TypeScript Proposal Review" (the private
share link is not reproduced here; the upstream thread is the public entry point).
Unreachable to plain HTTP fetches (client-rendered shell); retrieved 2026-09-22 by
rendering the share page in a browser and transcribing the DOM. This document holds
every claim, section thesis, and gate of that review. Section numbers match the
review's own.

## Verdict paragraph (opening)

"I checked the proposal against the current Decko repository and its published
card/Decko documentation, plus the current Cloudflare limits/pricing. There is a real
technical idea here, but the proposal substantially overstates what a TypeScript port
would buy and understates the scope of what would have to be reimplemented. The
biggest problem is that it treats Decko as if it were primarily a card renderer sitting
on top of a database. It isn't. The card engine is the center of a fairly large
Ruby/Rails framework with dynamic modules, views, permissions, queries, events, jobs,
storage, authentication, migrations, etc."

Central question the review says matters (not TS vs Ruby):
"Can Decko's semantics be separated from Rails/Ruby/database-specific implementation
well enough that a second implementation can reproduce them?"

## Claim-by-claim assessment table (16 rows)

| Proposal claim | Review verdict |
|---|---|
| "The model has never been the problem. Hosting physics are." | Partly legitimate, but misleading |
| TypeScript can provide scale-to-zero hosting | Yes |
| Cloudflare can make a Decko deployment one-click | Technically yes |
| Cloudflare free tier = effectively free Decko | Potentially, but very workload-dependent |
| Same data, no migration required | Very questionable |
| Existing decks can migrate seamlessly | Not demonstrated by the proposal |
| Exact byte-for-byte Ruby output is a good acceptance criterion | Useful, but radically insufficient |
| Current nesting creates an N+1 problem | Plausible and worth investigating |
| A TS rewrite automatically fixes the scaling problem | No |
| Batched tree loading can fix the N+1 problem | Yes, in principle |
| "Constant number of queries regardless of depth" | Oversimplified / potentially false |
| TS will be an order of magnitude more energy efficient | Unsupported |
| Same system + same data on D1 | Not without significant compatibility work |
| "One adapter per provider" makes provider portability easy | Much harder than presented |
| Ruby can simply remain as a support tail | Probably unrealistic for a real Decko ecosystem |
| "The whole industry went this way" | Marketing rhetoric, not an engineering argument |

## Section theses

1. **Understates what Decko is.** card 1.110.0 pulls ActiveRecord, ActiveStorage,
   ActionView, ActionMailer, ActionMailbox, ActiveJob, Railties, Sprockets, Haml,
   Sass, Kaminari, JWT, CoffeeScript, Uglifier, import support. Card API subsystems:
   querying, permissions, authentication, references, rules, sets, views, rendering,
   nesting, caching, events, delayed events, migrations/import, files, persistence,
   content parsing, diffs, jobs, mail, mod loading. Honest description of the work:
   "Reimplement the Decko/Card runtime, persistence layer, rendering system,
   permission system, query language, mod system, and application-facing APIs in
   TypeScript. That is a major rewrite, not a Rails-to-TypeScript translation."
2. **Ruby is part of the extension model — the biggest missing architectural issue.**
   Mods are Ruby code (Card::Set::Type::Foo, view :foo do). A port must either abandon
   Ruby Mods, build a Ruby compatibility runtime, translate Mods, define a new TS
   extension API, or support two extension systems indefinitely. "What percentage of
   existing public/private Decko Mods will continue to work without modification?" —
   if 0%, this is "a new Decko platform with a compatibility layer."
3. **Nesting/N+1 argument is the strongest part** — but "constant queries regardless
   of depth" is not automatic; the graph isn't a static FK graph (permissions,
   virtual cards, search-generated cards, conditional nests). Batched loading is an
   algorithm/data-access redesign, not a language property; the review recommends
   doing the same optimization in Ruby before/while porting.
4. **Ruby doesn't intrinsically require an always-on server** — the real issue is
   Rails/Decko's startup footprint making scale-to-zero unattractive.
5. **Energy claim ("10×, plausibly 100×") unsupported** — benchmark claim, remove
   without measurements.
6. **Cloudflare economics directionally correct; oversells "free"** — D1 bills rows
   read/written, not queries; small decks may fit free quotas, but no "$0" guarantee.
7. **Deploy-to-Cloudflare one-click is a real platform mechanism** — but Decko-specific
   work (DB creation, migrations, seed content, secrets, storage, email, jobs,
   upgrades, mod install) is not solved by the button.
8. **"Same data, no migration required" is the most misleading sentence** — D1 is
   SQLite, Decko runs MySQL/PostgreSQL; dialect, types, constraints, planner,
   transactions all differ. If "same database" is the goal, "the first TypeScript
   implementation should probably target PostgreSQL."
9. **Provider abstraction good, "one adapter" naïve** — needs semantic abstraction
   (transactions, isolation, generated IDs, JSON, FTS, recursive queries, collation,
   upserts, …) plus a conformance test suite.
10. **Byte-for-byte oracle testing is the right instinct but insufficient** — four
    layers needed: A persistence parity (save/delete/rename/revision/reference state),
    B semantic parity (CQL, names, rules, permissions, types, nests, views, context),
    C rendering parity (HTML/JSON/CSV/XML), D side-effect parity (events, emails,
    jobs, files, notifications, cache invalidation, audit/history, timestamps, auth).
    "D is where the proposal is weakest — you can get HTML matches perfectly while the
    new engine silently doesn't send an email or doesn't create the correct revision."
11. **Byte-for-byte HTML equality is problematic** — attribute order, class order,
    escaping, whitespace, generated IDs; suggests "deterministic canonical output"
    per format (parse/normalize DOM, canonical JSON, normalized DB state, event
    streams for side effects).
12. **Migration claim needs evidence** — "already proven on a real 47,000-card deck"
    is unverifiable publicly; demands tool + fixture + schema mapping + counts
    (cards/revisions/references/rules/files/users) + failures + duration + method.
    "A 47,000-card data import is not equivalent to a 47,000-card Decko
    compatibility migration."
13. **Shadow comparison excellent but writes are hard** — Ruby and TS cannot both
    execute writes; safe shadowing = reads first, then Ruby-authoritative transaction
    + event/change log + TS replay + state comparison.
14. **Underestimates Mods** (see 2) — mod compatibility strategy required; N mods
    tested / work unchanged / need porting / impossible should be a headline number.
15. **"The same Decko system" is not accurate** — three projects: A hosting
    modernization (low risk), B engine rewrite (huge), C new implementation
    reproducing observable behavior ("potentially very interesting, but it's not
    literally the same system"). "The proposal seems to call it A while actually
    proposing C."
16. **TypeScript itself isn't the reason this becomes fast** — batching, scale-to-zero,
    edge, caching, set-based access are language-independent. Defensible justification:
    "TS has a better fit with the serverless/edge deployment environments we want to
    target and gives us access to their ecosystem."
17. **10 ms CPU per invocation on Workers Free** — CQL → permissions → rules →
    loading → nesting → rendering could exceed it easily; benchmark against realistic
    pages; paid plan more practical.
18. **"Faster at the edge" isn't automatic** — DB placement can dominate; dynamic
    pages aren't cacheable when permissions/personalization matter.
19. **Cost table should separate fixed and variable cost** — "$0 provider invoice
    under certain usage limits" ≠ "$0 total cost of ownership."
20. **Genuinely compelling (keep these):** separate semantic model from runtime;
    TS implementation behind the same behavioral contract; Ruby as reference
    implementation initially; differential testing; optimize nesting independently;
    DB/blob interfaces designed around semantics; **PostgreSQL first** (easiest
    "existing data stays put" story); **add D1 later** once engine is PG-independent.
21. **Seven measurable gates before approving:**
    - Gate 1 Inventory: behavior inventory, each item implemented/partial/not/N-A.
    - Gate 2 PostgreSQL compatibility: run TS against an existing Decko PostgreSQL
      database, no migration — makes "same data" credible.
    - Gate 3 Differential test suite: thousands/millions of Ruby-vs-TS cases,
      normalized comparison.
    - Gate 4 Nesting benchmark: depth 1/5/10/20/50 × cards/page 10/100/1000,
      Ruby vs Ruby-optimized vs TS.
    - Gate 5 Mod compatibility: N tested / unchanged / porting / impossible —
      headline number.
    - Gate 6 Cloudflare prototype: realistic decks on Workers/D1; measure p50, p95,
      cold start, CPU, D1 rows read/written, requests/day, memory, cost.
    - Gate 7 Migration promise only after all the above.

## Suggested new central thesis

"Decko should first be decomposed into a runtime-independent behavioral
specification, then a TypeScript implementation can target serverless/edge
infrastructure while Ruby remains the reference implementation during migration."
Escape-hatch value if CF/D1 fails: formalized Card API, differential tests, better
query architecture, optimized renderer, provider abstraction, model/runtime
separation.

## Bottom line (review's own)

Strongest claims: scale-to-zero value for sparse installs; CF one-click machinery is
real; nesting/N+1 credible target; differential testing against Ruby is excellent.
Weakest/misleading: "TypeScript fixes scaling"; "same data, no migration" (esp. D1);
"constant queries regardless of depth" as a general claim; energy claims; "$0
hosting"; "same Decko system" without the Mods story; "seamless migration" unevidenced;
industry-rhetoric. "I'd consider the Mods/API compatibility question a much bigger
risk than the Ruby-vs-TypeScript question."
