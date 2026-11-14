# capture-frozen-date-parse.test.rb -- while the capture clock is frozen,
# Date.parse completes a partial date from the frozen day, not the wall clock.
#
# The rig (capture-dual-lane-page-and-view.rb) boots Decko and a database on
# load, so this test extracts the marked frozen_date_parse block from the
# rig's source and evaluates it against a stand-in CaptureFrozenClock.
#
# Run: ruby tools/oracle/capture-frozen-date-parse.test.rb

require "minitest/autorun"
require "date"
require "active_support"
require "active_support/core_ext"
require "active_support/testing/time_helpers"

module CaptureFrozenClock
  class << self
    attr_writer :frozen

    def frozen? = @frozen == true
  end
end

RIG = File.join(__dir__, "capture-dual-lane-page-and-view.rb")
block = File.read(RIG)[/^# BEGIN frozen_date_parse.*?^# END frozen_date_parse$/m]
raise "frozen_date_parse block not found in #{RIG}" if block.nil?

eval(block, TOPLEVEL_BINDING, RIG) # rubocop:disable Security/Eval

class CaptureFrozenDateParseTest < Minitest::Test
  include ActiveSupport::Testing::TimeHelpers

  FROZEN = Time.utc(2026, 9, 19, 12, 0, 0)
  # Partial shapes that rt_complete_frags completes from today, plus complete
  # ones that never read it.
  COMPLETED = ["20-0405", "Oct 5", "October", "5 March", "12/25", "Dec 31"].freeze
  COMPLETE = ["2020-04-05", "20200405", "April 5, 2020", "2016-02-29"].freeze

  def teardown
    CaptureFrozenClock.frozen = false
    travel_back
  end

  def c_parse(str)
    CaptureFrozenClock.frozen = false
    Date.parse(str)
  end

  def rig_parse(str)
    CaptureFrozenClock.frozen = true
    Date.parse(str)
  ensure
    CaptureFrozenClock.frozen = false
  end

  # With no travel, Date.today is the wall clock, so the rig's completion and
  # the C completion read the same day and must agree on every shape.
  def test_completion_matches_the_c_implementation_on_the_same_day
    (COMPLETED + COMPLETE).each do |str|
      assert_equal c_parse(str), rig_parse(str), "Date.parse(#{str.inspect})"
    end
  end

  def test_frozen_completion_reads_the_frozen_day
    travel_to(FROZEN)
    assert_equal Date.new(2026, 9, 20), rig_parse("20-0405")
    assert_equal Date.new(2026, 10, 5), rig_parse("Oct 5")
    assert_equal Date.new(2026, 3, 1), rig_parse("March")
  end

  def test_unfrozen_parse_is_untouched
    travel_to(FROZEN)
    assert_equal Date.parse("2020-04-05"), c_parse("2020-04-05")
  end

  def test_complete_dates_bypass_the_completion
    travel_to(FROZEN)
    COMPLETE.each { |str| assert_equal c_parse(str), rig_parse(str) }
  end

  def test_invalid_dates_still_raise
    travel_to(FROZEN)
    assert_raises(Date::Error) { rig_parse("Feb 30") }
    assert_raises(Date::Error) { rig_parse("not a date") }
  end

  def test_unported_partial_shapes_raise_instead_of_reading_the_wall_clock
    travel_to(FROZEN)
    error = assert_raises(RuntimeError) { rig_parse("Monday") }
    assert_match(/would complete .* from the wall clock/, error.message)
  end
end
