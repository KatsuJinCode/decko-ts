# tools/oracle/skin-stylesheet-probe.rb — record, from the Ruby oracle, what a
# Bootswatch skin's stylesheet is built from and what it compiles to.
#
#   ruby tools/oracle/skin-stylesheet-probe.rb <app root> <deck copy> <out dir>
#
# Read-only against a LOCAL COPY of a deck (it renders, it never saves). The
# Decko cache goes to <out dir>/cache. Writes <out dir>/skin-probe.json:
#
#   style_mod_leaves  every card `style: mods` recursed items reach, in order:
#                     name, type, base path, relative path, content sha256
#   mod_style_cards   each "mod: X+*style" card's groups and their files
#   skins             per Bootswatch skin: its theme, its field contents
#                     (+*colors, +*variables, and the recursed contents of
#                     +*stylesheets), the sha256 and length of the assembled
#                     SCSS (`content`) and of the css :compressed render
#                     (the skin's asset input, compiled with SassC/LibSass)
#   parts             sha256 and length of the bootstrap code files and the
#                     joined style mods
#
# Used by tools/oracle/vendor-style-sources.mjs and by
# tests/card/assets/skin-stylesheet.test.ts (fixture
# tests/card/assets/fixtures/skin-stylesheet-oracle.json).
require "json"
require "fileutils"
require "digest"

APP_ROOT = ARGV[0]
DECK = ARGV[1]
OUT = File.expand_path(ARGV[2])
FileUtils.mkdir_p(OUT)
cache = File.join(OUT, "cache")
FileUtils.rm_rf(cache)
FileUtils.mkdir_p(cache)
ENV["DECKO_CACHE_DIR"] = cache
ENV["RAILS_ENV"] ||= "development"
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{DECK}"
require File.join(APP_ROOT, "config", "environment")

def digest(text)
  { sha256: Digest::SHA256.hexdigest(text.to_s), length: text.to_s.length }
end

result = {}
Card::Auth.as_bot do
  style_mods = Card.fetch(:style_mods)
  result[:style_mod_leaves] = style_mods.recursed_item_cards.map do |c|
    { name: c.name.to_s, type: c.type_code.to_s, base_path: c.try(:base_path),
      db_content: c.db_content.to_s, sha: Digest::SHA256.hexdigest(c.content.to_s) }
  end
  result[:mod_style_cards] = style_mods.item_cards.map do |mod_card|
    { name: mod_card.name.to_s,
      items: mod_card.item_cards.map do |group|
        { name: group.name.to_s, type: group.type_code.to_s,
          files: group.item_cards.map { |f| f.db_content.to_s } }
      end }
  end
  result[:parts] = {
    bootstrap_functions: digest(Card[:bootstrap_functions].content),
    bootstrap_core: digest(Card[:bootstrap_core].content),
    style_mods_joined: digest(style_mods.recursed_item_cards.map(&:content).join("\n"))
  }
  result[:skins] = Card.search(type: :bootswatch_skin).map do |skin|
    stylesheets = Card.fetch([skin.name, :stylesheets])
    content = skin.content
    css = skin.format(:css).render(:compressed)
    {
      name: skin.name.to_s, codename: skin.codename.to_s, theme: skin.theme_name,
      parent: skin.parent?,
      colors: Card.fetch([skin.name, :colors])&.content,
      variables: Card.fetch([skin.name, :variables])&.content,
      stylesheets: stylesheets&.recursed_item_cards&.map { |c| [c.name.to_s, c.content.to_s] },
      content: digest(content),
      compressed: digest(css)
    }
  end
end
File.write(File.join(OUT, "skin-probe.json"), JSON.pretty_generate(result))
puts "wrote #{File.join(OUT, 'skin-probe.json')}"
