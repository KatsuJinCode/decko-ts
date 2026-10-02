# api_probe.rb - one-shot battery exercising the CQL search operators
# (exact name, left/right, plus trees, type/sort/limit/dir, not, content,
# found_by, created_by) against the oracle app's card index; each query
# prints the matched card names or the raised error.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner C:/localProjects/decko-ts/tools/oracle/api_probe.rb
def q(label, query)
  result = Card.search(**query, return: "name")
  puts "#{label}: #{result.inspect}"
rescue StandardError => e
  puts "#{label}: ERROR #{e.class}: #{e.message[0, 90]}"
end
$stdout.sync = true

q "exact_name",   { name: "Oracle Junction" }
q "left",         { left: "Oracle Junction" }
q "right",        { right: "child_one" }
q "type_sort",    { type: "Search", sort: "name" }
q "type_limit",   { type: "Search", sort: "name", limit: 2 }
q "dir_desc",     { type: "Search", sort: "name", dir: "desc", limit: 3 }
q "right_plus",   { right_plus: ["*read", { content: "Administrator" }] }
q "left_plus",    { left_plus: ["child_one"] }
q "plus",         { plus: "child_one" }
q "not_type",     { not: { type: "Cardtype" }, type: "Search", limit: 3 }
q "content_eq",   { content: "the nested child body" }
q "found_by",     { found_by: "Oracle Restricted+*self" }
q "sort_update",  { type: "RichText", sort: "update", name: ["match", "Oracle"] }
q "created_by",   { created_by: "Decko Bot", limit: 3 }
q "empty_ok",     { name: "No Such Card At All" }
