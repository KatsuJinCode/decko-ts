# carrierwave-write-seam-followup.rb - second oracle pass for the seam lane:
# (1) the :input text_field branch (no_upload? true) - reached by setting
#     Cardio.config.file_storage = :web (storage_type_from_config reads the
#     config live; the deck default is :local, which is why the stored web
#     card rendered the file_chooser in the first pass)
# (2) the root.error_status the :not_found live branch sets (302)
#
# Run (from tools/oracle/decko-oracle-app of the MAIN checkout):
#   RAILS_ENV=development bundle exec decko runner \
#     C:/localProjects/decko-ts-lane-cwwrite/tools/oracle/carrierwave-write-seam-followup.rb

require "json"

OUT_PATH = File.expand_path("../..", __dir__) +
           "/tmp/carrierwave-write-seam-followup.json"
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

payload = {}

web_card = Card.fetch("Oracle Cw Web")
web = {}
web["config_file_storage_default"] = Cardio.config.file_storage.to_s
web["storage_type_before"] = web_card.storage_type.to_s
web["no_upload_before"] = web_card.no_upload?

Cardio.config.file_storage = :web
web["storage_type_after_config"] = web_card.storage_type.to_s
web["no_upload_after_config"] = web_card.no_upload?
input = begin
  normalize(web_card.format.render(:input))
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end
web["view_input_web_config"] = input
web["view_source_web_config"] = begin
  normalize(web_card.format.render(:source))
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end
Cardio.config.file_storage = :local
payload["web_card"] = deep_sort(web)

child = Card.fetch("*all+*style+*asset output")
nf = {}
nf["db_content_before"] = child.db_content
nf["view_not_found"] = begin
  child.format.render(:not_found)
rescue StandardError => e
  { "error_class" => e.class.name, "error_message" => e.message }
end
nf["root_error_status_after"] = child.format.root.try(:error_status)
child2 = Card.fetch("*all+*style+*asset output")
nf["db_content_after"] = child2.db_content
nf["url_after"] = Card.fetch("*all+*style").asset_output_url
payload["not_found_status"] = deep_sort(nf)

dir = File.dirname(OUT_PATH)
Dir.mkdir(dir) unless Dir.exist?(dir)
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "WROTE #{OUT_PATH}"
