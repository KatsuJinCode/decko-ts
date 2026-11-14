# Captures the pinned gem's css-format view declarations and every place the
# pinned gemset renders a card in the css format. No deck, network or
# credentials: this reads the pinned gem source only.
#
# Usage: ruby oracle-capture-carrierwave-css-format-views.rb <pinned-gems-root>
#
# Why it exists: the carrierwave gem's set/type/image.rb declares a
# format :css block with two views (:core and :content). The port does not
# register a css-format view for type/image. This capture measures whether
# any pinned path renders a card in the css format AT ALL, and which card
# types those sites cover, so the port's absence is a named, measured
# remainder rather than an unnamed hole.
require "json"
require "digest"

root = ARGV.fetch(0)
gem_dir = File.join(root, "card-mod-carrierwave-0.20.0")
set_root = File.join(gem_dir, "set")

# 1. Every view declaration the carrierwave gem makes, with the format block
#    it sits in.
views = []
Dir.glob(File.join(set_root, "**", "*.rb")).sort.each do |file|
  relative = file.sub("#{set_root}/", "")
  format = "base"
  File.readlines(file).each_with_index do |line, index|
    stripped = line.strip
    next if stripped.start_with?("#")
    if stripped =~ /\Aformat\b(.*)\z/
      argument = Regexp.last_match(1).strip
      format = argument.start_with?(":") ? argument[1..].split(/[\s,]/).first : "base"
      next
    end
    next unless stripped =~ /\Aview\s*\(?\s*:?["']?([a-z_0-9]+)["']?/
    views << { set_file: relative, format: format, view: Regexp.last_match(1),
               line: index + 1 }
  end
end

# 2. Every place the pinned gemset renders a card in the css format.
render_sites = []
link_sites = []
Dir.glob(File.join(root, "card-*", "set", "**", "*.{rb,haml}")).sort.each do |file|
  relative = file.sub("#{root}/", "")
  File.readlines(file).each_with_index do |line, index|
    text = line.strip
    if text =~ /include_set\s+Abstract::Asset(?:Inputter|Outputter).*format:\s*:css/
      render_sites << { file: relative, line: index + 1, kind: "asset_input_or_output",
                        text: text }
    elsif text =~ /format\(:css\)\.render/
      render_sites << { file: relative, line: index + 1, kind: "explicit_format_render",
                        text: text }
    elsif text =~ /path mark:.*format:\s*:css/
      link_sites << { file: relative, line: index + 1, text: text }
    end
  end
end

# 3. The card types those render sites cover. A set file under type/ names a
#    card type; a set file under type_plus_right/ names a set type.
covered_types = render_sites.map { |site| site[:file] }.uniq.map do |file|
  parts = file.split("/set/", 2).last.split("/")
  if parts[0] == "type"
    parts[1].sub(/\.rb\z/, "")
  elsif parts[0] == "type_plus_right"
    "set:#{parts[1]}"
  else
    parts[0].sub(/\.rb\z/, "")
  end
end.uniq.sort

image_css_views = views.select do |view|
  view[:set_file] == "type/image.rb" && view[:format] == "css"
end

puts JSON.pretty_generate({
  gem_views: views,
  image_css_views: image_css_views,
  css_render_sites: render_sites,
  css_link_sites: link_sites,
  css_render_card_types: covered_types,
  image_card_type_covered: covered_types.include?("image"),
  source_sha256: Digest::SHA256.file(File.join(set_root, "type", "image.rb")).hexdigest
})
