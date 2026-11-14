# SQLite browser-oracle capability. Installed only inside the disposable host.
# Stock Decko emits REGEXP for SQLite, whose default build provides no regexp
# function. This is an explicit Ruby-Regexp host adaptation, not a claim of
# full MySQL regular-expression dialect or collation equivalence.
require "sqlite3"

module HarnessSQLiteRegexp
  IMPLEMENTATION = "ruby-regexp-ignorecase-when-absent/v1".freeze

  def self.install(database)
    begin
      database.get_first_value("SELECT 'probe' REGEXP 'probe'")
      return :host_provided
    rescue SQLite3::SQLException => error
      raise unless error.message.match?(/no such function: regexp/i)
    end

    database.create_function("regexp", 2) do |function, *arguments|
      raise ArgumentError, "regexp expects two arguments" unless arguments.length == 2

      pattern, value = arguments
      function.result = if pattern.nil? || value.nil?
                          nil
                        else
                          Regexp.new(pattern.to_s, Regexp::IGNORECASE).match?(value.to_s) ? 1 : 0
                        end
    end
    :ruby_regexp
  end

  module ConnectionConfiguration
    private

    def configure_connection
      result = super
      HarnessSQLiteRegexp.install(@raw_connection)
      result
    end
  end

  def self.install_active_record!
    require "active_record"
    require "active_record/connection_adapters/sqlite3_adapter"
    adapter = ActiveRecord::ConnectionAdapters::SQLite3Adapter
    # card1.110 names its concrete patch SQLiteAdapter; modern ActiveRecord
    # serves through SQLite3Adapter. Bind that existing stock method instead
    # of replacing the CQL query or leaving AbstractAdapter#match to raise.
    if defined?(Patches::ActiveRecord::ConnectionAdapters::SQLiteAdapter)
      stock_match = Patches::ActiveRecord::ConnectionAdapters::SQLiteAdapter
      adapter.include(stock_match) unless adapter.ancestors.include?(stock_match)
      @stock_match_bound = true
    end
    adapter.prepend(ConnectionConfiguration) unless adapter.ancestors.include?(ConnectionConfiguration)
    # Decko has already booted by the time the browser server loads this file.
    # Configure those connections too; the hook covers later and reconnected ones.
    ActiveRecord::Base.connection_handler.connection_pool_list.each do |pool|
      pool.connections.each do |connection|
        install(connection.raw_connection) if connection.is_a?(adapter)
      end
    end
  end

  def self.stock_match_bound? = @stock_match_bound == true
end
