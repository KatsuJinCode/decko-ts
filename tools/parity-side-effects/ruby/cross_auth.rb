# cross_auth.rb -- check that accounts the TypeScript engine wrote verify in
# Ruby Decko: boot the oracle app against a LOCAL COPY of a deck and test
# each (email, password) pair with Ruby's own account lookup and
# Card::Auth.encrypt over the stored salt.
#
#   ruby cross_auth.rb <app_root> <deck.sqlite3> <work_dir> <email> <password> [<email> <password> ...]
#
# Prints one JSON line per pair. Local copy only; no network (the app makes
# no calls during a lookup, and nothing here delivers mail).

require "json"
require "fileutils"

APP_ROOT = ARGV.shift
DECK_SRC = ARGV.shift
WORK_DIR = File.expand_path(ARGV.shift)
FileUtils.mkdir_p(WORK_DIR)
DB_COPY = File.join(WORK_DIR, "cross-auth.sqlite3")
FileUtils.cp(DECK_SRC, DB_COPY)
CACHE_DIR = File.join(WORK_DIR, "cache")
FileUtils.rm_rf(CACHE_DIR)
FileUtils.mkdir_p(CACHE_DIR)
ENV["DECKO_CACHE_DIR"] = CACHE_DIR
ENV["RAILS_ENV"] ||= "development"
Dir.chdir(APP_ROOT)
ENV["DATABASE_URL"] = "sqlite3:#{DB_COPY}"
require File.join(APP_ROOT, "config", "environment")

ARGV.each_slice(2) do |email, password|
  account = Card::Auth.find_account_by_email(email)
  result =
    if account.nil?
      { email: email, found: false }
    else
      salt = account.salt
      stored = account.password
      { email: email, found: true, account: account.name.to_s, status: account.status.to_s,
        salt_present: salt.present?, verifies: Card::Auth.encrypt(password, salt) == stored,
        wrong_password_rejected: Card::Auth.encrypt("#{password}x", salt) != stored }
    end
  puts JSON.generate(result)
end
