# boot_probe.rb - verify the decko oracle app boots and card env is live.
# Run: RAILS_ENV=development bundle exec rails runner REPO_ROOT/decko-ts/tools/oracle/boot_probe.rb
puts "BOOTED"
puts "cards: #{Card.count}"
c = Card.fetch("*all")
puts "*all -> id=#{c&.id} type_code=#{c&.type_code}"
puts "name key: #{Card::Name['A+B'].key}"
puts "codename: #{Card['A'].codename}"
