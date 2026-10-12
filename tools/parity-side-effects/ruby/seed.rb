require "json"
require "fileutils"
APP_ROOT = ARGV[0]; DECK_SRC = ARGV[1]; WORK = ARGV[2]
FileUtils.mkdir_p(WORK)
DB_COPY = File.join(WORK, "ruby-deck.sqlite3")
FileUtils.cp(DECK_SRC, DB_COPY)
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{DB_COPY}"
ENV["RAILS_ENV"] ||= "development"
require File.join(APP_ROOT, "config", "environment")
require "colorize"
String.include Colorize::ClassMethods

# Eat each loaded mod's data/real.yml into the LOCAL COPY so the deck gains
# the sign-in / signup / reset cards the account mods declare; a deck built
# by the plain setup path has none of them. This is the same loader
# `decko update` uses (Cardio::Mod::Eat).
mod_names = Cardio.mods.map { |m| m.respond_to?(:name) ? m.name : m.to_s }
loaded = []
mod_names.each do |m|
  begin
    r = Cardio::Mod::Eat.new(mod: m, verbose: false).run
    loaded << [m, r.to_s[0, 200]]
  rescue => e
    loaded << [m, "ERR #{e.class}: #{e.message.to_s[0,150]}"]
  end
end
puts JSON.pretty_generate({ db: DB_COPY, mods: mod_names, eaten: loaded })
c = ActiveRecord::Base.connection
puts JSON.pretty_generate({
  signin: c.select_all("select id,name,type_id,db_content from cards where name in ('*signin','signin')").to_a,
  account: c.select_all("select id,name,codename from cards where name in ('Account','*account','User','Signup')").to_a,
  email_templates: c.select_all("select id,name,db_content from cards where name in ('verification email','password reset email','welcome email')").to_a.map { |r| r.merge("db_content" => r["db_content"].to_s[0,80]) },
  users: c.select_all("select id,login,email from users").to_a,
})