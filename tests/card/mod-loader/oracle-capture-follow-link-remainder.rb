# Captures the pinned gem classes, without a deck, network or credentials.
require "json"
require "digest"
root = ARGV.fetch(0)
gem_root = File.join(root, "card-mod-follow-0.20.0", "set", "all", "follow")
class Object
  def self.delegate(*args, **opts); end
end
%w[follow_link start_follow_link stop_follow_link].each do |file|
  load File.join(gem_root, "#{file}.rb")
end
failures = [StartFollowLink, StopFollowLink].map do |klass|
  begin
    klass.link_opts
    raise "unexpected successful class call"
  rescue NoMethodError => e
    {class: klass.name, error: e.class.name, method: e.name.to_s,
     instance_method: klass.instance_methods.include?(:link_opts)}
  end
end
uses = Dir.glob(File.join(root, "card-mod-*", "set", "**", "*.{rb,haml}"))
  .flat_map { |file| File.readlines(file).grep(/follow_modal_link/).map(&:strip) }
puts JSON.pretty_generate({failures: failures, modal_mentions: uses,
  source_sha256: Digest::SHA256.file(File.join(gem_root, "follow_link.rb")).hexdigest})
