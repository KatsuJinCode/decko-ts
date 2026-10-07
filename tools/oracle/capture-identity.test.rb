# capture-identity.test.rb -- the capture rig records an identity mismatch as
# a capture error instead of rendering a not-found placeholder as expected
# output.
#
# The rig (capture-dual-lane-page-and-view.rb) boots Decko and a database on
# load, so this test extracts the marked capture_identity_error block from the
# rig's source and evaluates only that, against stand-in card objects.
#
# Run: ruby tools/oracle/capture-identity.test.rb

require "minitest/autorun"

RIG = File.join(__dir__, "capture-dual-lane-page-and-view.rb")
block = File.read(RIG)[/^# BEGIN capture_identity_error.*?^# END capture_identity_error$/m]
raise "capture_identity_error block not found in #{RIG}" if block.nil?

eval(block, TOPLEVEL_BINDING, RIG) # rubocop:disable Security/Eval

FakeCard = Struct.new(:id)

class CaptureIdentityTest < Minitest::Test
  def entry(id) = { "id" => id, "name" => "20120709+BW+Time Tracking" }

  def test_placeholder_for_an_input_card_is_a_capture_error
    msg = capture_identity_error(entry(13_305), FakeCard.new(nil))
    assert_match(/\ACAPTURE_ERROR: IdentityMismatch: input id 13305 but Card\.fetch returned a not-found placeholder/, msg)
  end

  def test_a_different_card_is_a_capture_error
    assert_match(/returned id 99/, capture_identity_error(entry(13_305), FakeCard.new(99)))
  end

  def test_the_input_card_itself_is_captured
    assert_nil capture_identity_error(entry(13_305), FakeCard.new(13_305))
  end

  def test_entries_without_an_input_id_and_nil_fetches_are_left_to_the_existing_paths
    assert_nil capture_identity_error(entry(nil), FakeCard.new(nil))
    assert_nil capture_identity_error(entry(13_305), nil)
  end

  def test_the_error_row_keeps_the_input_identity
    row = identity_error_row(entry(13_305), "page", "CAPTURE_ERROR: IdentityMismatch: x")
    assert_equal({ "error" => "CAPTURE_ERROR: IdentityMismatch: x", "id" => 13_305, "lane" => "page",
                   "name" => "20120709+BW+Time Tracking" }, row)
  end

  SHARD_FILTER = File.read(RIG)[/^# BEGIN shard_filter.*?^# END shard_filter$/m]

  # Evaluates the rig's shard-filter block with stand-in shards and env.
  def filtered(env_value, by_shard: true)
    shards = { "shard-000000.jsonl" => [1], "shard-000001.jsonl" => [2], "shard-000002.jsonl" => [3] }
    b = binding
    b.local_variable_set(:shards, shards)
    Object.send(:remove_const, :BY_SHARD) if Object.const_defined?(:BY_SHARD)
    Object.const_set(:BY_SHARD, by_shard ? shards : nil)
    old = ENV["DUAL_LANE_SHARDS"]
    ENV["DUAL_LANE_SHARDS"] = env_value
    capture_io { eval(SHARD_FILTER, b, RIG) } # rubocop:disable Security/Eval
    b.local_variable_get(:shards)
  ensure
    ENV["DUAL_LANE_SHARDS"] = old
  end

  def test_shard_filter_keeps_only_the_named_shards
    assert_equal ["shard-000000.jsonl", "shard-000002.jsonl"],
                 filtered("shard-000002.jsonl, shard-000000.jsonl").keys.sort
  end

  def test_shard_filter_unset_keeps_every_shard
    assert_equal 3, filtered(nil).size
  end

  def test_shard_filter_refuses_unknown_shard_names
    assert_raises(RuntimeError) { filtered("shard-000009.jsonl") }
  end

  def test_the_driver_routes_mismatches_to_the_error_row
    src = File.read(RIG)
    assert_match(/elsif \(identity_error = capture_identity_error\(entry, card\)\)\n\s+view_errors \+= 1\n\s+page_errors \+= 1\n\s+page_row = identity_error_row\(entry, "page", identity_error\)\n\s+view_row = identity_error_row\(entry, "view", identity_error\)/, src)
  end
end
