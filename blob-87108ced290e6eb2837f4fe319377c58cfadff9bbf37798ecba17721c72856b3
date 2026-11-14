# Ruby-semantics oracle probe for card-mod-recaptcha.test.ts.
#
# Pins the pure Ruby behaviors the port reproduces, run under Ruby 3.3:
#   1. Onigmo line anchors: in Ruby, ^ and $ match at LINE boundaries and
#      match? searches anywhere in the string (card-mod-recaptcha-0.20.0
#      set/abstract/recaptcha_setting.rb:1-5 uses /^[a-zA-Z0-9\-_]*$/).
#   2. String#to_f prefix parsing (set/all/recaptcha.rb:37 score compare):
#      leading numeric prefix converts, trailing junk is ignored, junk
#      converts to 0.0.
#   3. String#to_sym in the action compare (set/all/recaptcha.rb:38).
#   4. String#capitalize (the field-card title variant).
#
# Run: ruby tests/card/mod-loader/oracle-capture-recaptcha-semantics.rb
# Expected output follows each probe as a comment.

pattern = /^[a-zA-Z0-9\-_]*$/
puts pattern.match?("ok\nbad!")          # => true  (the "ok" line matches)
puts pattern.match?("\nok\n")            # => true
puts pattern.match?("bad!\nalso bad!")   # => false (no clean line)

puts "0.9".to_f                          # => 0.9
puts "0.9x".to_f                         # => 0.9   (trailing junk ignored)
puts "junk".to_f                         # => 0.0
puts "".to_f                             # => 0.0

puts ("edit".to_sym == :edit)            # => true
puts ("signup".to_sym == :edit)          # => false

puts "site key".capitalize               # => "Site key"
puts "API KEY".capitalize                # => "Api key" (downcases the rest)
