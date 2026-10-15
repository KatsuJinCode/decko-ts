# Loaded by run-adapter-mysql.sh through RUBYOPT, before any gem.
#
# On Windows, a native extension that depends on libmysql.dll cannot be found
# by Ruby's require: the loader does not search the extension's own directory
# for the extension's dependencies. Loading the MySQL client and its runtime
# DLLs by full path, in dependency order, first makes them resident, so the
# extension's dependencies resolve. MYSQL_HOME is the MySQL 8.4 distribution
# (its bin/ holds libcrypto, libssl and jemalloc; its lib/ holds libmysql.dll).
require "fiddle"

home = ENV.fetch("MYSQL_HOME") { "C:/localProjects/.mysql-test-cache/8.4.11/mysql-8.4.11-winx64" }
%w[bin/libcrypto-3-x64.dll bin/libssl-3-x64.dll bin/jemalloc.dll lib/libmysql.dll].each do |dll|
  Fiddle.dlopen("#{home}/#{dll}")
end
