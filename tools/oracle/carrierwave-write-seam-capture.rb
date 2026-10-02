# carrierwave-write-seam-capture.rb - oracle capture for the four views the
# carrierwave WRITE/output seam lane ports:
#   card-mod-assets      :asset_output_url (set/abstract/asset_outputter.rb:61-63)
#   card-mod-assets      :not_found        (set/right/asset_output.rb:24-29)
#   card-mod-carrierwave :input            (set/type/file.rb:119-125, html)
#   card-mod-carrierwave :preview_editor   (set/type/file.rb:127-129, html)
#
# Run (from tools/oracle/decko-oracle-app of the MAIN checkout - the app and
# its development deck live there):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-cwwrite/tools/oracle/carrierwave-write-seam-capture.rb
#
# Determinism contract (same as capture.rb): seeding is create-if-missing,
# timestamps are not captured, JSON is pretty-printed with deeply sorted keys.
# The slot DOM id is normalized to RANDOMIZED at the recording layer.
# The probes create additive cards only (Oracle Cw * + *all+*style + its
# *asset output child) - no deletes, no rewrites of pre-existing cards.

require "json"
require "tempfile"

REPO_ROOT = File.expand_path("../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "tmp", "carrierwave-write-seam-oracle.json")

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def render_record(card, view)
  normalize(card.format.render(view))
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end

# deterministic 1234-byte PNG (real signature so the upload machinery sees a
# png; the tail is padding - only the SIZE feeds number_to_human_size bytes)
PNG_BYTES = begin
  base = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].pack("C*") +
         "IHDRxxxx" + "IDAT" + "IEND"
  base + ("A" * (1234 - base.length))
end.freeze

payload = {}

# ---- probe cards -----------------------------------------------------------
seed_log = {}
Card::Auth.as_bot do
  # the outputter probe: a *style rule over a Set (TypePlusRight::Set::Style
  # includes Abstract::AssetOutputter with output_format: :css). "style: mods"
  # (id 328) exists in this deck.
  if Card.fetch("*all+*style", new: {}).new_card?
    Card.create! name: "*all+*style", type: "Pointer", content: "[[style: mods]]"
    seed_log["*all+*style"] = "created"
  else
    seed_log["*all+*style"] = "present"
  end

  # The *asset output child is NOT pre-created: a File-typed card cannot be
  # created without an upload ("Validation failed: File is missing" - the
  # carrierwave create validation). Ruby's own path fabricates the missing
  # child via the not_found machinery (format/nest/fetch.rb new_card), so the
  # probes below render :not_found on Card.new objects and the live write
  # itself creates+saves the child with its file.

  if Card.fetch("Oracle Cw Local", new: {}).new_card?
    # Ruby's own upload flow (00_upload_cache.rb) is TWO-STEP: (1) a save with
    # Card::Env.params[:attachment_upload] set is a PRELIMINARY upload - the
    # prepare_attachment event caches the file under tmp/files/<new_file id>,
    # records the original filename as the action COMMENT, and aborts :success
    # (a plain file= without the param crashes in cache!: the uploader's
    # workfile_path reads original_filename from the action comment, which does
    # not exist pre-save). (2) the real card save carries
    # action_id_of_cached_upload and assign_attachment_on_create pulls the
    # cached bytes.
    CarrierWave.instance_variable_set(:@tmp_path,
                                      File.join(Rails.root.to_s, "tmp"))
    tf = Tempfile.new(["oracle_cw_probe", ".png"])
    tf.binmode
    tf.write PNG_BYTES
    tf.rewind
    upload = ActionDispatch::Http::UploadedFile.new(
      tempfile: tf, filename: "oracle_cw_probe.png", type: "image/png"
    )
    Card::Env.params[:attachment_upload] = "oracle_cw_probe.png"
    preliminary = begin
      Card::Auth.as_bot { Card.create! name: "Oracle Cw Local", type: "File", file: upload }
      # save! handles the :success abort internally (returns true; the card
      # row rolls back but the DRAFT action row persists - association-hidden)
      "aborted-success (handled by save!)"
    rescue Card::Error::Abort
      "aborted (raised)"
    end
    seed_log["Oracle Cw Local preliminary"] = preliminary
    Card::Env.params.delete(:attachment_upload)
    tf.close

    # The card#actions association EXCLUDES draft actions (verified live:
    # Card[:new_file].actions shows only the seed create), so the cache
    # action must be fetched directly. The real editor flow receives this id
    # from the upload UI; the runner takes the newest draft row.
    cache_action = Card::Action.where(card_id: Card[:new_file].id, draft: true)
                               .order(:id).last
    seed_log["Oracle Cw Local cache_action"] = cache_action&.id
    Card::Auth.as_bot do
      # assign_attachment_on_create runs at the INITIALIZE stage, so the
      # action id must be present at Card.new time (setting the attr_accessor
      # after new would be too late for the when: condition).
      Card.create! name: "Oracle Cw Local", type: "File",
                   action_id_of_cached_upload: cache_action.id
    end
    seed_log["Oracle Cw Local"] = "created"
  else
    seed_log["Oracle Cw Local"] = "present"
  end

  if Card.fetch("Oracle Cw Web", new: {}).new_card?
    Card.create! name: "Oracle Cw Web", type: "File",
                 content: "http://example.com/oracle_cw_probe.png",
                 storage_type: "web"
    seed_log["Oracle Cw Web"] = "created"
  else
    seed_log["Oracle Cw Web"] = "present"
  end
end
payload["seed_log"] = seed_log

# ---- outputter probes ------------------------------------------------------
outputter = Card.fetch("*all+*style")
child     = Card.new(name: "*all+*style+*asset output", type: "File")
outputter_probe = {}
outputter_probe["outputter_class"] = outputter.class.name
outputter_probe["outputter_is_asset_outputter"] =
  outputter.is_a?(Card::Set::Abstract::AssetOutputter)
outputter_probe["outputter_locked"] =
  begin
    outputter.locked?
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
outputter_probe["child_is_new_card"] = child.new_card?
outputter_probe["asset_output_url_before"] =
  begin
    outputter.asset_output_url
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
outputter_probe["view_asset_output_url_before"] = render_record(outputter, :asset_output_url)

nf1 = render_record(child, :not_found)
outputter_probe["view_not_found_first"] = nf1
child = Card.fetch("*all+*style+*asset output")
outputter_probe["child_id_after_not_found"] = child.id
outputter_probe["child_db_content_after_not_found"] = child.db_content
outputter_probe["child_file_size_after"] =
  begin
    child.attachment&.size
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
outputter_probe["asset_output_url_after"] =
  begin
    outputter.asset_output_url
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
outputter_probe["view_asset_output_url_after"] = render_record(outputter, :asset_output_url)
outputter_probe["view_not_found_second"] = render_record(child, :not_found)
payload["outputter"] = deep_sort(outputter_probe)

# ---- file card probes ------------------------------------------------------
file_card = Card.fetch("Oracle Cw Local")
file_probe = {}
file_probe["id"] = file_card.id
file_probe["db_content"] = file_card.db_content
file_probe["storage_type"] = file_card.storage_type
file_probe["attachment_size"] =
  begin
    file_card.attachment.size
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
file_probe["original_filename"] =
  begin
    file_card.original_filename
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
file_probe["attachment_url"] =
  begin
    file_card.attachment.url
  rescue StandardError => e
    { "error_class" => e.class.name, "error_message" => e.message }
  end
file_probe["no_upload"] = file_card.no_upload?
file_probe["view_input"] = render_record(file_card, :input)
file_probe["view_core"] = render_record(file_card, :core)
file_probe["view_source"] = render_record(file_card, :source)

# preview_editor needs the upload-cache editor param (cached_upload_card_name
# reads Card::Env.params[:attachment_upload]); set it the way the editor
# form posts it, render, then clear.
Card::Env.params[:attachment_upload] = "card[file]"
file_probe["view_preview_editor"] = render_record(file_card, :preview_editor)
Card::Env.params.delete(:attachment_upload)

# the input view on a NEW (unsaved) file card: action text flips to "Add"
new_file_card = Card.new name: "Oracle Cw New", type: "File"
file_probe["view_input_new_card"] = render_record(new_file_card, :input)
payload["file_card"] = deep_sort(file_probe)

# ---- web-storage probes (no_upload? true -> text_field branch) -------------
web_card = Card.fetch("Oracle Cw Web")
web_probe = {}
web_probe["id"] = web_card.id
web_probe["db_content"] = web_card.db_content
web_probe["no_upload"] = web_card.no_upload?
web_probe["view_input"] = render_record(web_card, :input)
payload["web_card"] = deep_sort(web_probe)

# ---- not_found super() branch (left is NOT an AssetOutputter) --------------
plain_child = Card.new(name: "Oracle Cw Local+*asset output", type: "File")
super_probe = {}
super_probe["left_class"] = plain_child.left.class.name
super_probe["left_is_asset_outputter"] =
  plain_child.left.is_a?(Card::Set::Abstract::AssetOutputter)
super_probe["view_not_found"] = render_record(plain_child, :not_found)
payload["not_found_super"] = deep_sort(super_probe)

# ---- write -----------------------------------------------------------------
dir = File.dirname(OUT_PATH)
Dir.mkdir(dir) unless Dir.exist?(dir)
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH}"
