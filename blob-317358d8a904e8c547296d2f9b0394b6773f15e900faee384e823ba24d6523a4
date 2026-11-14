# Actual keyword search through page2

The historical `navbox-paging` journey observes the first page only. Its
completion cannot establish that clicking Next preserves a search. A new
separate actual browser probe atc8a57967 recorded two product defects:
Node's Next request omitted `query[keyword]`, yielding an unfiltered page;
Bunny's HTML route omitted query vars and offset entirely, so even page1
was unfiltered and Next never selected page2. Both red receipts remain.

Stock card-mod-search0.20.0
`set/abstract/0_search/search_params.rb:17-18,42-44` reads nested query params
and adds them to paging path args. Collection's
`set/abstract/paging/paging_views.rb:59-72` merges those args into each link.
The repair follows these seams: the shared HTML/JSON/Node mapper carries
flat query vars and offset; both paging renderers URL-encode the request's
vars in every link. Headless requests retain their old bytes. Bunny's HTML
route now passes the same request search params to the real engine.

Honoring offsets also requires the stock anonymous parameter cap. The engine
now rejects focal offsets over1000 with the stock PermissionDenied message
(`card-mod-collection set/abstract/paging.rb legal_search_param`), and the
shared HTTP mapping returns403. Node's single-segment route previously
silently clamped to1000; it now denies that request. Signed-in engine state
continues through the existing authenticated viewer path.

Local controls cover URL-safe nested values, preservation of history args,
request vars/second-page rows through actual SQLite REGEXP and HTTP/Hrana
engines, and anonymous offset rejection. Search/collection mod tests and
the17 twin-route tests cover the retained defaults. The small render-only
fixture is not a complete HTTP layout fixture; real HTTP/browser proof uses
the unchanged full synthetic fixture in probe-search-paging.mjs instead.

That first-class probe requires a clean exact-source build, actually clicks
Next, requires active page2 and changed result IDs, checks the outgoing
request retains Topic and its heading, fails required-asset errors, and
checks offset1001 returns403. It is supplemental scoped proof, not full-site
or hosted-runtime acceptance. No completed Ruby51 definition or capture is
rewritten, and its SQLite keyword500 remains a reference incompatibility.

The actual1d8fe07c Node page2 rerun passed. Bunny then passed the result-window
and keyword checks but exposed two additional request-boundary defects: its
catch still converted mapped403 into500, and XHR returned a full page inserted
inside the existing result slot. The follow-up preserves403 and uses the
existing bare main-slot render seam (including slot main/home opts), with
an unchanged-navbar-count assertion in the actual browser probe. Explicit
layout requests retain their full layout.
