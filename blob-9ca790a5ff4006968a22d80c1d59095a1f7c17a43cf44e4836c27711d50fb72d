# oracle-capture-jasmine-mount-ruby.rb - records what the PINNED GEM's deck
# template does with the JasmineRails engine mount, and whether that mount
# can fire in the pinned gemset at all.
#
# Why this script exists: the completeness register's A23 row
# (register-routes) grades the port UNPORTED for the deck app template's
# conditional `mount JasmineRails::Engine => "#{rel_root}/specs"`. The row's
# own note calls the mount "source-inert", because the mount sits behind
# `Object.const_defined?( :JasmineRails )` and no jasmine gem is in the pin.
# That note was derived by reading the template. This script READS the
# template from the pinned gemset and SCANS the pinned gemset for anything
# that could define the constant, so the inertness is a measurement of the
# pin rather than a reading of a file.
#
# The mechanism, to be confirmed by this run: the template's mount block is
# wrapped in two conjuncts, `!Rails.env.production?` and
# `Object.const_defined?( :JasmineRails )`. The first is a Rails environment
# question, not a gem question. The second is a constant question: the
# constant exists only if some loaded library defines it, and the only
# library in the pin that would is the jasmine-rails gem. The template's
# own route set is therefore, for every deck the pin can build: the inert
# Jasmine mount plus `mount Decko::Engine => "/"`.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-jasmine-mount-ruby.rb \
#     > fixtures/captured/jasmine-mount-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline, so a re-run on the same gemset is byte-stable. The gem lists are
# sorted; the template text is copied verbatim; the source path is recorded
# RELATIVE to the gemset root, so the fixture does not carry the machine's
# directory layout.

require "json"

GEM_ROOT = ENV.fetch("DECKO_RUBY_GEMSET", nil)
gems_root = if GEM_ROOT
              GEM_ROOT
            else
              File.expand_path(
                "../../reference-harness/ruby-oracle-gems/ruby/3.4.0/gems",
                __dir__
              )
            end

template_rb = File.join(
  gems_root,
  "card-1.110.0/lib/generators/deck/templates/config/routes.rb.erb"
)
raise "routes.rb.erb not found at #{template_rb}; set DECKO_RUBY_GEMSET" unless File.exist?(template_rb)

template = File.read(template_rb)
lines = template.lines.map(&:chomp)

# The mount block: every line that mentions the Jasmine engine, plus the
# `if` line that guards it and the `end` that closes it. The block is
# located by the guard line, not by a line number, so a template edit
# shows up as a different capture rather than a silently wrong one.
guard_index = lines.index { |line| line.include?("JasmineRails") && line.strip.start_with?("if ") }
raise "the guard line for the JasmineRails mount was not found in the template" if guard_index.nil?

block_end = guard_index
block_end += 1 while block_end < lines.length && lines[block_end].strip != "end"
mount_block = lines[guard_index..block_end]

# Every route the template draws, so the fixture says what the pin's route
# set actually is. The ERB tags are kept: the deck's own generator reads
# them, and a reader needs to see that the shark? branch is a generator
# question, not a runtime one.
route_lines = lines.select { |line| line.include?("mount") || line.include?("routes.draw") }

# The gemset scan. Two lists, because "no gem is named jasmine" is weaker
# than "no gem in the pin defines the constant":
#   * gems whose directory name mentions jasmine;
#   * gems whose ruby sources mention the JasmineRails constant at all.
# The second list is the one that decides the question, because a gem that
# defines the constant without carrying "jasmine" in its name would still
# arm the mount.
gems = Dir.children(gems_root).select { |entry| File.directory?(File.join(gems_root, entry)) }.sort
jasmine_named = gems.select { |gem| gem.downcase.include?("jasmine") }
jasmine_defining = []
gems.each do |gem|
  lib = File.join(gems_root, gem, "lib")
  next unless File.directory?(lib)
  Dir.glob(File.join(lib, "**", "*.rb")).each do |file|
    begin
      body = File.read(file)
    rescue StandardError
      next
    end
    jasmine_defining << gem if body.include?("JasmineRails")
  end
end
jasmine_defining = jasmine_defining.uniq.sort

puts JSON.pretty_generate(
  "source" => template_rb.sub(gems_root.end_with?("/") ? gems_root : "#{gems_root}/", ""),
  "guardLine" => lines[guard_index],
  "mountBlock" => mount_block,
  "routeLines" => route_lines,
  "gemCount" => gems.length,
  "jasmineNamedGems" => jasmine_named,
  "jasmineDefiningGems" => jasmine_defining,
  "mountCanFire" => !jasmine_defining.empty?
)
