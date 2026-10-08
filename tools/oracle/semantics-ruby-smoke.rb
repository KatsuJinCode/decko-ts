# Smoke: how set modules, views and events attribute to their declaring mod.
puts "USER=#{Card::Auth.current_id} ANON=#{Card::AnonymousID}"
c = Card["*all"]
fmt = c.format(:html)
m = fmt.method(:_view_core)
puts "CORE owner=#{m.owner} src=#{m.source_location.inspect}"
puts "RESPOND_bogus=#{fmt.respond_to?(:render_no_such_view_xyz)} _view_bogus=#{fmt.respond_to?(:_view_no_such_view_xyz)}"
puts "TYPE ids user=#{Card::Codename.id(:user)} set=#{Card::Codename.id(:set)} setting=#{Card::Codename.id(:setting)} role=#{Card::Codename.id(:role)} cardtype=#{Card::Codename.id(:cardtype)} fetch_type_id_set=#{(Card.fetch_type_id('Set') rescue 'ERR')}"
mods = []
walk = lambda do |mod, depth|
  return if depth > 6
  mod.constants(false).each do |cn|
    k = mod.const_get(cn, false) rescue next
    next unless k.is_a?(Module) && k.name&.start_with?("Card::Set::")
    mods << k
    walk.call(k, depth + 1)
  end
end
walk.call(Card::Set, 0)
puts "SETMODS=#{mods.size}"
mods.select { |k| k.name =~ /Date|Account/ }.first(8).each do |k|
  ims = k.instance_methods(false)
  sample = ims.first
  puts "#{k.name} n=#{ims.size} sample=#{sample} src=#{(k.instance_method(sample).source_location rescue nil).inspect}"
end
puts "MODDIRS=#{(Cardio::Mod.dirs.mods.map { |x| [x.name, x.path] }.first(5).inspect rescue $!.message)}"
