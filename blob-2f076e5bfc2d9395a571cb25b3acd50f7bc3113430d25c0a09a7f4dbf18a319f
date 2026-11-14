# Smoke: can the Ruby oracle answer semantic questions against the capture deck?
puts "CARDS=#{Card.where(trash: false).count}"
c = Card["*all"]
puts "ALL id=#{c&.id} key=#{c&.key} type=#{c&.type}"
puts "OK=#{c&.ok_to_read?({})}"