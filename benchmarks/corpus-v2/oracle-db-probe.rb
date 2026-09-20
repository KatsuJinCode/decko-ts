# oracle-db-probe.rb -- one-shot: print the connected database file and card
# count, to verify DATABASE_URL routing before any corpus load. Read-only.
cfg = ActiveRecord::Base.connection_db_config.configuration_hash
puts "PROBE adapter=#{cfg[:adapter]} database=#{cfg[:database]}"
path = File.expand_path(cfg[:database].to_s, ENV["RAILS_ROOT"] || Dir.pwd)
puts "PROBE expanded=#{path}"
count = begin
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM cards")
rescue StandardError => e
  "n/a (#{e.class})"
end
puts "PROBE cards=#{count}"
