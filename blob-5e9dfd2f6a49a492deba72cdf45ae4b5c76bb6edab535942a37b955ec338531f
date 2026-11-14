# Ruby's include_set graph, read off the loaded set modules: for every
# concrete set module's format module, the abstract set modules mixed into
# it, in method-resolution order. The TypeScript mod loader expands a card's
# chain with this table so abstract-set views resolve where Ruby's do.
#
# Run: decko runner set-include-graph.rb   (SET_INCLUDE_GRAPH_OUT=<file.json>)

require "json"

def short(mod)
  mod.name.to_s.sub(/\ACard::Set::/, "").sub(/::(Html|Base|Json|Css|Js|Rss|Text|Email\w*|File|Csv|Yaml|Data)?Format\z/, "")
end

formats = { "html" => Card::Format::HtmlFormat, "base" => Card::Format }
graph = {}
Card::Set.modules.each do |kind, table|
  next unless kind.to_s.end_with?("_format")

  table.each do |format_class, by_key|
    fname = formats.key(format_class)
    next if fname.nil?

    mods = by_key.is_a?(Hash) ? by_key.values.flatten : Array(by_key)
    mods.each do |fm|
      next if fm.name.nil?

      owner = short(fm)
      next if owner.start_with?("Abstract::")

      abstracts = fm.ancestors.drop(1).select { |a| a.name.to_s.start_with?("Card::Set::Abstract::") }
      next if abstracts.empty?

      list = abstracts.map { |a| short(a) }.uniq
      graph[owner] ||= {}
      graph[owner][fname] = list
    end
  end
end

File.write(ENV.fetch("SET_INCLUDE_GRAPH_OUT"), JSON.pretty_generate(graph.sort.to_h))
puts "WROTE #{graph.size} set modules with abstract includes"
