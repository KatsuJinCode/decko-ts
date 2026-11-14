# key-update-probe.rb -- does conn.execute(sql, [binds]) actually bind? Does an
# UPDATE persist past the runner exit? Row 33 = "*children" (needs key *child).
require "fileutils"
CACHE_DIR = File.join(File.expand_path("..", Dir.pwd), "tmp", "cache")
FileUtils.rm_rf(Dir.glob(File.join(CACHE_DIR, "*")))

conn = ActiveRecord::Base.connection
puts "before: #{conn.select_one('SELECT id, name, key FROM cards WHERE id = 33').inspect}"
begin
  conn.execute("UPDATE cards SET key = '*child' WHERE id = 33", "probe_update")
  puts "execute(sql, name-form) ok"
rescue StandardError => e
  puts "execute(sql, name-form) raised: #{e.class}: #{e.message[0, 120]}"
end
begin
  conn.execute("UPDATE cards SET key = ? WHERE id = ?", ["*child", 33])
  puts "execute(sql, [binds]) ok"
rescue StandardError => e
  puts "execute(sql, [binds]) raised: #{e.class}: #{e.message[0, 120]}"
end
begin
  result = conn.update("UPDATE cards SET key = '*child' WHERE id = 33")
  puts "conn.update affected=#{result}"
rescue StandardError => e
  puts "conn.update raised: #{e.class}: #{e.message[0, 120]}"
end
puts "open_transactions=#{conn.open_transactions.inspect}"
puts "after (same conn): #{conn.select_one('SELECT id, name, key FROM cards WHERE id = 33').inspect}"
at_exit do
  c2 = ActiveRecord::Base.connection
  puts "at_exit: #{c2.select_one('SELECT id, name, key FROM cards WHERE id = 33').inspect}"
end
