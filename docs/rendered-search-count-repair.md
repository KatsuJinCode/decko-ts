# Reached search counts without a startup warm

Normal hosts load search views but do not call `loader.installInto`, so those
views previously failed with "search count not warmed". That install path
counts all search cards and stores module-global last-warm-wins maps. It is
not a prerequisite in Ruby: card-mod-search-0.20.0
`set/abstract/0_search.rb:35-39,52-54` obtains a count from the current search
with its result window removed.

RenderEngine already prepares reached searches using the current actor's CQL
read scope. The repair reuses the paging count when present, or the complete
short/unlimited first result set's length. Offset searches obtain the full
count even with an unlimited window. Count-returning CQL keeps its separate
integer-result seat; ordinary list results remain lists. The search mod
prefers these engine-local totals and rescued BadQuery messages over legacy
install-time maps. The total-count seat is cleared with the other search
state when the data version changes. No whole-deck query or boot hook was
added. Ordinary count rendering currently also prepares the reached result
list; this is not a claim of a count-only query optimization.

Removing the earlier blanket query-error swallow exposed an existing
`found_by` BadQuery. The reached-search warm now records it for the views
that rescue BadQuery; ordinary result views still raise it. Its message
reports the actual type row's name instead of a codename, matching
card-1.110.0 `lib/card/query/card_query/found_by.rb:23-25`.

The real SQLite REGEXP and local HTTP/Hrana no-UDF controls load the mod
without `installInto`, count beyond a one-row result window, verify the list
still renders after a count, and revoke read access to reduce the total to
one then zero. An unreachable invalid Search card stays unparsed. Before the
repair both count controls raised "search count not warmed". The existing
30 search-mod tests retain count/list/BadQuery/view dispatch coverage.

Local source/driver validation does not establish live provider or browser
acceptance. The legacy optional install-time maps still exist for other
consumers; normal rendering prefers its own current engine's state.
