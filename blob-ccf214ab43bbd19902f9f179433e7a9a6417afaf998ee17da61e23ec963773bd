# image-version-probe.rb -- one image upload through Ruby, for the
# image-version-bytes measurement (the persistence lane's item 43: the
# probe's stored image versions, now produced by the real resizer on both
# sides).
#
#   PERSIST_FILES_DIR=<run-scoped dir> RAILS_ENV=development \
#   DATABASE_URL=sqlite3:<deck copy> bundle exec decko runner \
#   tools/persistence/image-version-probe.rb <image path> <out.json>
#
# Creates one Image card as Decko Bot with the file as its upload and dumps
# the stored files (names + sha1; for the version files also their
# dimensions and bytes, base64, so the port's resizer can be held to the
# same dimensions and compared perceptually) to <out.json>. The deck copy,
# the files directory and the public links follow the run-scoped arrangement
# of persist-write-probe.rb (hard links for the public links on Windows).

require "json"
require "digest"

image_path = ARGV[0] or abort "usage: image-version-probe.rb <image path> <out.json>"
out_path = ARGV[1] or abort "usage: image-version-probe.rb <image path> <out.json>"

FILES_DIR = ENV["PERSIST_FILES_DIR"]
abort "uploads need PERSIST_FILES_DIR" unless FILES_DIR

require "fileutils"
FileUtils.mkdir_p(File.join(FILES_DIR, "files"))
FileUtils.mkdir_p(File.join(FILES_DIR, "public", "files"))
Cardio.config.file_buckets = {}
Cardio.config.file_default_storage = :local
Cardio.paths["files"] = File.join(FILES_DIR, "files")
Cardio.paths["public"] = File.join(FILES_DIR, "public")
File.singleton_class.prepend(Module.new do
  def symlink(src, dest) = File.link(src, dest)
  def symlink?(path) = File.exist?(path)
end)

# Runs on the MAIN thread, exactly like persist-write-probe.rb's upload
# steps: their inline job enters the app executor the runner holds, which
# deadlocked on a worker thread.
report = Card::Auth.as_bot do
  card = Card.create!(name: "PersistProbe VImage", type: "Image", image: File.open(image_path, "rb"))
  dir = File.join(FILES_DIR, "files", card.id.to_s)
  { "card_id" => card.id,
    "files" => Dir.glob(File.join(dir, "*")).sort.map do |path|
      entry = { "file" => File.basename(path),
                "sha1" => Digest::SHA1.file(path).hexdigest }
      if (version = path.match(/-(icon|small|medium|large)\./))
        image = MiniMagick::Image.open(path)
        entry["width"] = image.width
        entry["height"] = image.height
        entry["b64"] = Base64.strict_encode64(File.binread(path))
      end
      entry
    end }
end
File.binwrite(out_path, JSON.pretty_generate(report))
warn "[persist] image versions: #{report['files'].map { |f| f['file'] }.join(', ')}"
