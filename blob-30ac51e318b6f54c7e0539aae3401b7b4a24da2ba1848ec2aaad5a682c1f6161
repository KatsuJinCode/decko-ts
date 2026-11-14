require "minitest/autorun"
require "sqlite3"
require_relative "../lib/sqlite_regexp"

class HarnessSQLiteRegexpTest < Minitest::Test
  def with_database
    database = SQLite3::Database.new(":memory:")
    yield database
  ensure
    database&.close
  end

  def test_stock_sqlite_has_no_regexp_function
    with_database do |db|
      error = assert_raises(SQLite3::SQLException) { db.get_first_value("SELECT 'Topic' REGEXP 'Topic'") }
      assert_match(/no such function/i, error.message)
    end
  end

  def test_sql_uses_unanchored_case_insensitive_matching
    with_database do |db|
      HarnessSQLiteRegexp.install(db)
      assert_equal 1, db.get_first_value("SELECT 'Topic 001' REGEXP 'topic'")
      assert_equal 1, db.get_first_value("SELECT 'a Memo here' REGEXP 'Memo'")
      assert_equal 0, db.get_first_value("SELECT 'Topic' REGEXP '^Memo$'")
      assert_equal 1, db.get_first_value("SELECT 'Topic 001' REGEXP '^Topic [0-9]+$'")
    end
  end

  def test_null_operands_retain_sql_null_semantics
    with_database do |db|
      HarnessSQLiteRegexp.install(db)
      assert_nil db.get_first_value("SELECT NULL REGEXP 'Topic'")
      assert_nil db.get_first_value("SELECT 'Topic' REGEXP NULL")
    end
  end

  def test_escaped_keyword_punctuation_is_literal
    with_database do |db|
      HarnessSQLiteRegexp.install(db)
      assert_equal 1, db.get_first_value("SELECT regexp(?, ?)", ['a\\.b', 'a.b'])
      assert_equal 0, db.get_first_value("SELECT regexp(?, ?)", ['a\\.b', 'axb'])
    end
  end

  def test_bad_patterns_and_wrong_arity_fail_instead_of_matching_silently
    with_database do |db|
      HarnessSQLiteRegexp.install(db)
      assert_raises(StandardError) { db.get_first_value("SELECT regexp('[', 'Topic')") }
      assert_raises(StandardError) { db.get_first_value("SELECT regexp('Topic')") }
    end
  end

  def test_existing_host_function_is_preserved
    with_database do |db|
      db.create_function("regexp", 2) { |fn, *_args| fn.result = 77 }
      HarnessSQLiteRegexp.install(db)
      assert_equal 77, db.get_first_value("SELECT 'Topic' REGEXP 'Topic'")
    end
  end

  def test_active_record_existing_reconnected_and_thread_connections
    require "active_record"
    require "active_record/connection_adapters/sqlite3_adapter"
    # This is the actual installed Decko patch, not a replacement SQL builder.
    require File.join(Gem::Specification.find_by_name("card").full_gem_path,
                      "config/initializers/02_patches/active_record")
    abstract_patch = Patches::ActiveRecord::ConnectionAdapters::AbstractAdapter
    ActiveRecord::ConnectionAdapters::AbstractAdapter.include(abstract_patch)
    ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:", pool: 3)
    connection = ActiveRecord::Base.lease_connection
    HarnessSQLiteRegexp.install_active_record!
    assert_equal "REGEXP 'Topic'", connection.match("'Topic'")
    assert_equal 1, connection.select_value("SELECT 'Topic' REGEXP 'topic'")
    connection.reconnect!
    assert_equal 1, connection.select_value("SELECT 'Memo' REGEXP 'memo'")
    value = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |other|
        other.select_value("SELECT 'Topic 2' REGEXP 'topic'")
      end
    end.value
    assert_equal 1, value
  ensure
    ActiveRecord::Base.connection_handler.clear_all_connections! if defined?(ActiveRecord::Base)
  end
end
